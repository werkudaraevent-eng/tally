import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { ITEM_COLUMNS, SECTION_COLUMNS } from "@/lib/rundown";

// Pengelolaan bagian rundown (tab di halaman publik). Admin saja.
//
// Jumlahnya tidak dipatok. Acara ini kebetulan punya dua, tapi acara berikutnya
// bisa punya satu atau lima, jadi admin menambah dan menghapus sendiri.
//
// Branding header TIDAK diurus di sini. Ia setelan global di /api/admin/rundown/header,
// karena header adalah identitas acara: kalau menempel di section, berpindah tab
// mengubah judul, warna, dan logo sekaligus.

const slugPattern = /^[a-z0-9-]{2,40}$/;

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus format YYYY-MM-DD");

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  // Boleh dikosongkan; slug dibuat dari nama.
  slug: z.string().trim().max(40).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  subtitle: z.string().trim().max(160).nullable().optional(),
  event_date: isoDate.optional(),
});

const updateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  slug: z.string().trim().regex(slugPattern, "Slug hanya huruf kecil, angka, dan tanda hubung.").optional(),
  title: z.string().trim().min(1).max(160).optional(),
  subtitle: z.string().trim().max(160).nullable().optional(),
  event_date: isoDate.optional(),
  highlight_current: z.boolean().optional(),
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
  return base.length >= 2 ? base : "bagian";
}

/**
 * Slug unik. Angka ditambahkan sampai tidak lagi bentrok.
 *
 * Dicek lebih dulu di aplikasi agar admin mendapat slug yang langsung jadi, bukan
 * pesan "slug sudah dipakai" yang harus dia perbaiki sendiri. Unique index di
 * database tetap jaring pengaman terakhir.
 */
async function uniqueSlug(desired: string) {
  const client = getSupabaseServiceClient();
  const { data } = await client.from("rundown_sections").select("slug");
  const taken = new Set(((data ?? []) as { slug: string }[]).map((row) => row.slug));
  if (!taken.has(desired)) return desired;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    // Dipotong agar tetap masuk batas 40 karakter setelah akhiran ditambahkan.
    const candidate = `${desired.slice(0, 40 - String(suffix).length - 1)}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${desired.slice(0, 30)}-${Date.now().toString(36)}`;
}

/** Seluruh bagian beserta isinya, untuk CMS. Termasuk yang belum publish. */
export async function GET() {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const client = getSupabaseServiceClient();
  const [sections, items] = await Promise.all([
    client.from("rundown_sections").select(SECTION_COLUMNS).order("sort_order", { ascending: true }).order("id", { ascending: true }),
    client.from("rundown_items").select(ITEM_COLUMNS).order("sort_order", { ascending: true }).order("start_time", { ascending: true }).order("id", { ascending: true }),
  ]);
  if (sections.error || items.error) return apiError("INTERNAL_ERROR", 500);

  return Response.json({ sections: sections.data ?? [], items: items.data ?? [] });
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

  // Bagian baru masuk ke urutan paling belakang supaya tidak menggeser urutan
  // yang sudah ditata admin.
  const { data: last } = await client
    .from("rundown_sections")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = Math.min(999, (((last as { sort_order: number } | null)?.sort_order ?? 0) + 1));

  const { data, error } = await client
    .from("rundown_sections")
    .insert({
      slug: await uniqueSlug(requested),
      name: parsed.data.name,
      // Judul publik ikut nama bila belum diisi: admin bisa langsung menyimpan
      // lalu memperbaikinya, tanpa dipaksa mengisi dua kolom serupa.
      title: parsed.data.title?.trim() || parsed.data.name,
      subtitle: parsed.data.subtitle?.trim() || null,
      // Tanpa pilihan admin, pakai default kolom (hari ini). Tanggal tetap harus
      // diperiksa admin sebelum publish, dan itu ditegaskan di UI.
      ...(parsed.data.event_date ? { event_date: parsed.data.event_date } : {}),
      // Selalu draf. Bagian baru belum punya satu pun baris jadwal, jadi bila
      // langsung publik ia tampil sebagai rundown kosong ke tamu.
      is_published: false,
      sort_order: nextOrder,
      updated_by: auth.user.id,
    } as never)
    .select(SECTION_COLUMNS)
    .single();
  if (error) {
    return apiError(error.code === "23505" ? "DUPLICATE_RUNDOWN_SLUG" : "INTERNAL_ERROR", error.code === "23505" ? 422 : 500);
  }

  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "rundown_section_create",
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
  const { data: current } = await client.from("rundown_sections").select(SECTION_COLUMNS).eq("id", id).maybeSingle();
  if (!current) return apiError("RUNDOWN_SECTION_NOT_FOUND", 404);

  const { data, error } = await client
    .from("rundown_sections")
    .update({
      ...changes,
      // String kosong dari form berarti "tidak dipakai", bukan teks kosong yang
      // tetap dirender sebagai baris kosong di bawah judul.
      ...(changes.subtitle !== undefined ? { subtitle: changes.subtitle?.trim() || null } : {}),
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id,
    } as never)
    .eq("id", id)
    .select(SECTION_COLUMNS)
    .single();
  if (error) {
    return apiError(error.code === "23505" ? "DUPLICATE_RUNDOWN_SLUG" : "INTERNAL_ERROR", error.code === "23505" ? 422 : 500);
  }

  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "rundown_section_update",
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
    .from("rundown_sections")
    .select(SECTION_COLUMNS)
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!current) return apiError("RUNDOWN_SECTION_NOT_FOUND", 404);

  // Baris jadwalnya ikut terhapus lewat `on delete cascade`. Disalin ke audit
  // lebih dulu supaya penghapusan yang tidak disengaja masih bisa direkonstruksi;
  // ini satu-satunya salinan yang tertinggal.
  const { data: items } = await client
    .from("rundown_items")
    .select(ITEM_COLUMNS)
    .eq("section_id", parsed.data.id)
    .order("sort_order", { ascending: true });

  const { error } = await client.from("rundown_sections").delete().eq("id", parsed.data.id);
  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "rundown_section_delete",
    payload: { old: current, items: items ?? [] },
  } as never);
  return Response.json({ deleted: true, id: parsed.data.id });
}
