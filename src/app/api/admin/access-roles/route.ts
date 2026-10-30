import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { rapikanIzin } from "@/lib/auth/izin-modul";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Peran kustom (Users & roles > Roles).
 *
 * Membaca boleh admin (layar Users & roles menampilkan nama peran akun);
 * membuat, mengubah, dan menghapus hanya super admin, sama dengan mengelola
 * akun: peran menentukan apa yang bisa dibuka akun lain.
 *
 * Izin selalu disimpan lewat `rapikanIzin`, jadi kunci asing atau tingkat yang
 * belum tersedia untuk sebuah modul tidak pernah sampai ke database.
 */

const izinSchema = z.object({
  modules: z.record(z.string(), z.enum(["none", "view", "manage"])),
  participants_download: z.boolean(),
  messages_send_email: z.boolean(),
});

const namaSchema = z.string().trim().min(1, "Give the role a name.").max(60, "Use 60 characters or fewer.");

const buatSchema = z.object({ name: namaSchema, permissions: izinSchema });
const ubahSchema = z.object({ id: z.string().uuid(), name: namaSchema.optional(), permissions: izinSchema.optional() });

type Baris = { id: string; name: string; permissions: unknown; created_at: string; updated_at: string };

const KOLOM = "id,name,permissions,created_at,updated_at";

function bentuk(baris: Baris, dipakai: number) {
  return { id: baris.id, name: baris.name, permissions: rapikanIzin(baris.permissions), accounts: dipakai, updated_at: baris.updated_at };
}

function namaKembar(error: { code?: string } | null) {
  return String(error?.code) === "23505";
}

export async function GET() {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const client = getSupabaseServiceClient();
  const [peran, akun] = await Promise.all([
    client.from("access_roles" as never).select(KOLOM).order("name"),
    client.from("users").select("access_role_id").not("access_role_id" as never, "is", null),
  ]);
  if (peran.error || akun.error) return apiError("INTERNAL_ERROR", 500);
  const hitung = new Map<string, number>();
  for (const baris of (akun.data ?? []) as unknown as Array<{ access_role_id: string }>) hitung.set(baris.access_role_id, (hitung.get(baris.access_role_id) ?? 0) + 1);
  return Response.json({ roles: ((peran.data ?? []) as unknown as Baris[]).map((baris) => bentuk(baris, hitung.get(baris.id) ?? 0)) });
}

export async function POST(request: Request) {
  const auth = await requireUser(["super_admin"]);
  if (auth.response) return auth.response;
  const parsed = buatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const client = getSupabaseServiceClient();
  const izin = rapikanIzin(parsed.data.permissions);
  const { data, error } = await client
    .from("access_roles" as never)
    .insert({ name: parsed.data.name, permissions: izin, created_by: auth.user.id } as never)
    .select(KOLOM)
    .single();
  if (namaKembar(error)) return apiError("VALIDATION_ERROR", 422, { name: "A role with this name already exists.", message: "A role with this name already exists." });
  if (error || !data) return apiError("INTERNAL_ERROR", 500);
  const baris = data as unknown as Baris;
  await client.from("audit_logs").insert({ user_id: auth.user.id, action: "access_role_create", payload: { role: { id: baris.id, name: baris.name, permissions: izin } } } as never);
  return Response.json({ role: bentuk(baris, 0) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireUser(["super_admin"]);
  if (auth.response) return auth.response;
  const parsed = ubahSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const client = getSupabaseServiceClient();
  const { data: lama, error: galatLama } = await client.from("access_roles" as never).select(KOLOM).eq("id", parsed.data.id).maybeSingle();
  if (galatLama) return apiError("INTERNAL_ERROR", 500);
  if (!lama) return apiError("ACCESS_ROLE_NOT_FOUND", 404);

  const ubah: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) ubah.name = parsed.data.name;
  if (parsed.data.permissions !== undefined) ubah.permissions = rapikanIzin(parsed.data.permissions);
  const { data, error } = await client.from("access_roles" as never).update(ubah as never).eq("id", parsed.data.id).select(KOLOM).single();
  if (namaKembar(error)) return apiError("VALIDATION_ERROR", 422, { name: "A role with this name already exists.", message: "A role with this name already exists." });
  if (error || !data) return apiError("INTERNAL_ERROR", 500);
  const { count } = await client.from("users").select("id", { count: "exact", head: true }).eq("access_role_id" as never, parsed.data.id);
  const baris = data as unknown as Baris;
  const sebelum = lama as unknown as Baris;
  // Lama dan baru disalin utuh: pertanyaan "sejak kapan klien bisa menghapus
  // peserta" datang setelah acara, dari baris ini.
  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "access_role_update",
    payload: { role: { id: baris.id, name: baris.name }, old: { name: sebelum.name, permissions: rapikanIzin(sebelum.permissions) }, new: { name: baris.name, permissions: rapikanIzin(baris.permissions) }, accounts: count ?? 0 },
  } as never);
  return Response.json({ role: bentuk(baris, count ?? 0) });
}

export async function DELETE(request: Request) {
  const auth = await requireUser(["super_admin"]);
  if (auth.response) return auth.response;
  const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return apiError("VALIDATION_ERROR", 422);
  const client = getSupabaseServiceClient();
  const { count, error: galatHitung } = await client.from("users").select("id", { count: "exact", head: true }).eq("access_role_id" as never, id.data);
  if (galatHitung) return apiError("INTERNAL_ERROR", 500);
  // Juga dijaga FK (on delete restrict); dicek di sini supaya pesannya jelas.
  if ((count ?? 0) > 0) return apiError("VALIDATION_ERROR", 409, { message: `${count} ${count === 1 ? "account uses" : "accounts use"} this role. Give them another role first.` });
  const { data, error } = await client.from("access_roles" as never).delete().eq("id", id.data).select("id,name").maybeSingle();
  if (error) return apiError("INTERNAL_ERROR", 500);
  if (!data) return apiError("ACCESS_ROLE_NOT_FOUND", 404);
  await client.from("audit_logs").insert({ user_id: auth.user.id, action: "access_role_delete", payload: { role: data } } as never);
  return Response.json({ deleted: true });
}
