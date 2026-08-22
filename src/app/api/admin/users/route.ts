import { z } from "zod";
import bcrypt from "bcryptjs";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
// Biaya hash diimpor, tidak diulang sebagai angka di sini. Dua tempat yang
// menuliskan cost sendiri adalah dua tempat yang bisa menyimpang, dan ketidaksamaan
// itu tidak akan memunculkan kesalahan apa pun — hanya PIN yang lebih lambat
// diverifikasi daripada yang diperkirakan.
import { PIN_HASH_ROUNDS } from "@/lib/auth/login";
import { canManageUsers, canResetOperatorPin } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/domain";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// `super_admin` harus ikut diterima: dropdown role di UI menawarkannya dan
// kolom enum di database sudah memilikinya sejak migrasi 202607300001. Tanpa ini
// setiap penyimpanan akun super admin (termasuk sekadar ganti PIN, karena PATCH
// dari UI selalu menyertakan role) ditolak sebagai VALIDATION_ERROR.
const roleSchema = z.enum(["booth", "cashier", "admin", "super_admin", "scanner"]);

const createSchema = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[a-z0-9._-]+$/i, "Username hanya huruf, angka, titik, garis."),
  pin: z.string().regex(/^\d{6}$/, "PIN harus 6 digit angka."),
  role: roleSchema,
  booth_id: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  username: z.string().trim().min(3).max(50).regex(/^[a-z0-9._-]+$/i).optional(),
  pin: z.string().regex(/^\d{6}$/).optional(),
  role: roleSchema.optional(),
  booth_id: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
});

type UserRow = { id: string; username: string; role: string; booth_id: number | null; is_active: boolean };

export async function GET() {
  // Klien (`admin`) boleh MELIHAT daftar operator, tapi tidak mengubahnya.
  // `can_manage` dikirim agar UI tahu harus menampilkan mode baca saja.
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const { data, error } = await getSupabaseServiceClient()
    .from("users")
    .select("id,username,role,booth_id,is_active")
    .order("role", { ascending: true })
    .order("username", { ascending: true });
  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({
    users: data ?? [],
    can_manage: canManageUsers(auth.user),
    can_reset_operator_pin: auth.user.role === "admin" || canManageUsers(auth.user),
  });
}

export async function POST(request: Request) {
  // super_admin saja: membuat akun berarti bisa membuat admin baru, dan itu jalan
  // memutar untuk memperoleh kewenangan penuh.
  const auth = await requireUser(["super_admin"]);
  if (auth.response) return auth.response;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (parsed.data.role === "booth" && !parsed.data.booth_id) return apiError("VALIDATION_ERROR", 422, { message: "Booth wajib dipilih untuk role booth." });

  const client = getSupabaseServiceClient();
  const { data: existing } = await client.from("users").select("id").eq("username", parsed.data.username).maybeSingle() as { data: { id: string } | null };
  if (existing) return apiError("USERNAME_TAKEN", 409);

  const pinHash = await bcrypt.hash(parsed.data.pin, PIN_HASH_ROUNDS);
  const { data, error } = await client
    .from("users")
    .insert({ username: parsed.data.username, pin_hash: pinHash, role: parsed.data.role, booth_id: parsed.data.role === "booth" ? parsed.data.booth_id : null, is_active: parsed.data.is_active ?? true } as never)
    .select("id,username,role,booth_id,is_active")
    .single();
  if (error) return apiError("INTERNAL_ERROR", 500);
  await client.from("audit_logs").insert({ user_id: auth.user.id, action: "user_create", payload: { user: data } } as never);
  return Response.json({ user: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const client = getSupabaseServiceClient();

  const { data: current } = await client.from("users").select("id,username,role,booth_id,is_active").eq("id", parsed.data.id).maybeSingle() as { data: UserRow | null };
  if (!current) return apiError("USER_NOT_FOUND", 404);

  // Klien hanya boleh mereset PIN operator booth/kasir supaya tidak perlu
  // menghubungi pemilik saat ada yang lupa PIN di hari-H. Selain itu, seluruh
  // perubahan akun milik super_admin.
  if (!canManageUsers(auth.user)) {
    const onlyPinChange = parsed.data.pin !== undefined
      && parsed.data.username === undefined
      && parsed.data.role === undefined
      && parsed.data.booth_id === undefined
      && parsed.data.is_active === undefined;
    if (!onlyPinChange) return apiError("FORBIDDEN", 403);
    if (!canResetOperatorPin(auth.user, current.role as UserRole)) return apiError("FORBIDDEN", 403);
  }

  const nextRole = parsed.data.role ?? current.role;
  const nextBoothId = nextRole === "booth" ? (parsed.data.booth_id ?? current.booth_id) : null;
  if (nextRole === "booth" && !nextBoothId) return apiError("VALIDATION_ERROR", 422, { message: "Booth wajib dipilih untuk role booth." });

  // Jaga super_admin terakhir. Guard lama hanya menjaga `admin`, yang setelah
  // pemisahan role tidak lagi cukup: menurunkan super_admin terakhir menjadi admin
  // akan menghapus akses reset data dan kelola user dari seluruh sistem, tanpa
  // jalan pulih dari dalam aplikasi. Trigger database menjaga hal yang sama;
  // pemeriksaan di sini hanya agar pesannya jelas.
  const losingSuperAdmin = current.role === "super_admin" && (nextRole !== "super_admin" || parsed.data.is_active === false);
  if (losingSuperAdmin) {
    const { count } = await client.from("users").select("id", { count: "exact", head: true }).eq("role", "super_admin").eq("is_active", true);
    if ((count ?? 0) <= 1) return apiError("VALIDATION_ERROR", 422, { message: "Minimal satu super admin aktif harus tersisa." });
  }

  if (parsed.data.username && parsed.data.username !== current.username) {
    const { data: taken } = await client.from("users").select("id").eq("username", parsed.data.username).neq("id", parsed.data.id).maybeSingle() as { data: { id: string } | null };
    if (taken) return apiError("USERNAME_TAKEN", 409);
  }

  const update: Record<string, unknown> = {
    role: nextRole,
    booth_id: nextBoothId,
  };
  if (parsed.data.username) update.username = parsed.data.username;
  if (typeof parsed.data.is_active === "boolean") update.is_active = parsed.data.is_active;
  if (parsed.data.pin) update.pin_hash = await bcrypt.hash(parsed.data.pin, PIN_HASH_ROUNDS);

  const { data, error } = await client.from("users").update(update as never).eq("id", parsed.data.id).select("id,username,role,booth_id,is_active").single();
  if (error) return apiError("INTERNAL_ERROR", 500);
  await client.from("audit_logs").insert({ user_id: auth.user.id, action: "user_update", payload: { old: current, new: data } } as never);
  return Response.json({ user: data });
}
