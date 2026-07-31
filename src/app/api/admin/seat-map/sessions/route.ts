import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { SESSION_COLUMNS } from "@/lib/seat-map-data";

// Pengelolaan agenda denah. Admin saja.
//
// Agenda tidak dipatok jumlahnya. Acara ini kebetulan punya dua (meeting pagi
// dan gala malam), tapi acara berikutnya bisa punya satu atau lima, jadi admin
// bisa menambah dan menghapus sendiri.
//
// Geometri ruangan tetap dipakai bersama seluruh agenda (`seat_map_id` selalu 1).
// Yang berbeda per agenda hanya tampilan dan sumber penempatan pesertanya. Kalau
// geometri digandakan per agenda, koreksi tata letak harus dikerjakan berulang
// dan begitu satu terlewat, denah antar-agenda berbeda tanpa ada yang sadar.

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Warna harus format hex #RRGGBB");
const slugPattern = /^[a-z0-9-]{2,40}$/;

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  // Boleh dikosongkan; slug akan dibuat dari nama.
  slug: z.string().trim().max(40).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  subtitle: z.string().trim().max(160).nullable().optional(),
  background_color: hex.optional(),
  text_color: hex.optional(),
  accent_color: hex.optional(),
});

const updateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  slug: z.string().trim().regex(slugPattern, "Slug hanya huruf kecil, angka, dan tanda hubung.").optional(),
  sub_event_id: z.string().trim().max(120).nullable().optional(),
  title: z.string().trim().min(1).max(160).optional(),
  subtitle: z.string().trim().max(160).nullable().optional(),
  background_color: hex.optional(),
  text_color: hex.optional(),
  accent_color: hex.optional(),
  is_published: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
});

const deleteSchema = z.object({ id: z.coerce.number().int().positive() });

/** Mengubah nama menjadi slug yang lolos aturan tabel. */
function toSlug(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  // Nama yang seluruhnya karakter non-latin bisa menyisakan slug kosong, dan itu
  // ditolak constraint. Jatuhkan ke kata netral daripada menggagalkan simpanan.
  return base.length >= 2 ? base : "agenda";
}

/**
 * Slug unik. Angka ditambahkan sampai tidak lagi bentrok.
 *
 * Dicek lebih dulu di aplikasi agar admin mendapat slug yang langsung jadi,
 * bukan pesan "slug sudah dipakai" yang harus dia perbaiki sendiri. Unique index
 * di database tetap menjadi jaring pengaman terakhir.
 */
async function uniqueSlug(desired: string) {
  const client = getSupabaseServiceClient();
  const { data } = await client.from("seat_map_sessions").select("slug");
  const taken = new Set(((data ?? []) as { slug: string }[]).map((row) => row.slug));
  if (!taken.has(desired)) return desired;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    // Dipotong agar tetap masuk batas 40 karakter setelah akhiran ditambahkan.
    const candidate = `${desired.slice(0, 40 - String(suffix).length - 1)}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${desired.slice(0, 30)}-${Date.now().toString(36)}`;
}

export async function POST(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const requested = parsed.data.slug?.trim() ? parsed.data.slug.trim().toLowerCase() : toSlug(parsed.data.name);
  if (!slugPattern.test(requested)) {
    return apiError("VALIDATION_ERROR", 422, { message: "Slug hanya huruf kecil, angka, dan tanda hubung (2-40 karakter)." });
  }

  const client = getSupabaseServiceClient();

  // Agenda baru masuk ke urutan paling belakang supaya tidak menggeser urutan
  // agenda yang sudah ditata admin.
  const { data: last } = await client
    .from("seat_map_sessions")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = Math.min(999, (((last as { sort_order: number } | null)?.sort_order ?? 0) + 1));

  const { data, error } = await client
    .from("seat_map_sessions")
    .insert({
      slug: await uniqueSlug(requested),
      name: parsed.data.name,
      // Judul di halaman publik ikut nama bila belum diisi: admin bisa langsung
      // menyimpan lalu memperbaikinya, tanpa dipaksa mengisi dua kolom serupa.
      title: parsed.data.title?.trim() || parsed.data.name,
      subtitle: parsed.data.subtitle?.trim() || null,
      background_color: parsed.data.background_color ?? "#111a63",
      text_color: parsed.data.text_color ?? "#ffffff",
      accent_color: parsed.data.accent_color ?? "#f2c14e",
      // Selalu draf. Agenda baru belum punya sumber penempatan, jadi bila
      // langsung publik ia tampil sebagai denah dengan semua kursi kosong.
      is_published: false,
      sort_order: nextOrder,
      updated_by: auth.user.id,
    } as never)
    .select(SESSION_COLUMNS)
    .single();
  if (error) return apiError(error.code === "23505" ? "DUPLICATE_SEAT_MAP_SLUG" : "INTERNAL_ERROR", error.code === "23505" ? 422 : 500);

  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "seat_map_session_create",
    payload: { new: data },
  } as never);
  return Response.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { id, ...changes } = parsed.data;
  if (Object.keys(changes).length === 0) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data: current } = await client.from("seat_map_sessions").select(SESSION_COLUMNS).eq("id", id).maybeSingle();
  if (!current) return apiError("SEAT_MAP_SESSION_NOT_FOUND", 404);

  const { data, error } = await client
    .from("seat_map_sessions")
    .update({
      ...changes,
      // String kosong dari form berarti "belum dipilih", bukan id kosong yang
      // tidak akan pernah cocok dengan apa pun.
      ...(changes.sub_event_id !== undefined ? { sub_event_id: changes.sub_event_id?.trim() || null } : {}),
      ...(changes.subtitle !== undefined ? { subtitle: changes.subtitle?.trim() || null } : {}),
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id,
    } as never)
    .eq("id", id)
    .select(SESSION_COLUMNS)
    .single();
  if (error) return apiError(error.code === "23505" ? "DUPLICATE_SEAT_MAP_SLUG" : "INTERNAL_ERROR", error.code === "23505" ? 422 : 500);

  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "seat_map_session_update",
    payload: { old: current, new: data },
  } as never);
  return Response.json(data);
}

export async function DELETE(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const parsed = deleteSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const { data: current } = await client
    .from("seat_map_sessions")
    .select(SESSION_COLUMNS)
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!current) return apiError("SEAT_MAP_SESSION_NOT_FOUND", 404);

  const { error } = await client.from("seat_map_sessions").delete().eq("id", parsed.data.id);
  if (error) return apiError("INTERNAL_ERROR", 500);

  // Isi baris lama disimpan utuh di audit. Menghapus agenda hanya membuang
  // tampilan dan penunjuk sumbernya; data peserta tidak ikut terhapus karena
  // penempatan tersimpan di scanner API, bukan di sini. Jadi agenda yang
  // terhapus bisa dibuat ulang dan langsung terisi kembali.
  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "seat_map_session_delete",
    payload: { old: current },
  } as never);
  return Response.json({ deleted: true, id: parsed.data.id });
}
