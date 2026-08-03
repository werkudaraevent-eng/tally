import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { ITEM_COLUMNS, toDbTime } from "@/lib/rundown";

// Baris jadwal rundown. Admin saja.
//
// Waktu diterima sebagai "HH:MM" (bentuk yang dikirim <input type="time">) lalu
// diubah ke "HH:MM:SS" untuk kolom `time`. Sengaja TIDAK menerima timestamp: yang
// disusun panitia adalah jam dinding lokasi acara, dan tanggalnya milik bagian
// rundown-nya. Alasan lengkapnya ada di migrasi 202608030004.

const clock = z
  .string()
  .trim()
  .regex(/^\d{1,2}:\d{2}$/, "Jam harus format HH:MM")
  .refine((value) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour <= 23 && minute <= 59;
  }, "Jam tidak valid");

// Keterangan boleh berisi beberapa baris: satu baris per pembicara. Batasnya
// dinaikkan dari 300 ke 800 karena satu butir acara pembukaan di rundown klien
// memuat empat pembicara berikut jabatan dan institusinya, dan 300 karakter
// memotongnya di tengah nama orang keempat.
//
// `.trim()` milik Zod sengaja tidak dipakai: ia hanya membersihkan ujung string,
// sementara yang perlu dirapikan adalah tiap barisnya. Itu tugas normalizeSubtitle.
const subtitleField = z.string().max(800).nullable().optional();

/**
 * Membakukan keterangan berbaris banyak sebelum disimpan.
 *
 * CRLF dari admin yang menempel dari Word disamakan ke LF, spasi di ujung tiap
 * baris dibuang, dan baris kosong dihapus. Tanpa ini satu tempelan dari dokumen
 * rundown menghasilkan jarak menganga di halaman publik, dan tidak ada yang tahu
 * penyebabnya karena di kotak teks tampak wajar.
 */
function normalizeSubtitle(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const lines = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines.join("\n") : null;
}

const createSchema = z.object({
  section_id: z.number().int().positive(),
  start_time: clock,
  end_time: clock.nullable().optional(),
  title: z.string().trim().min(1).max(200),
  subtitle: subtitleField,
  is_break: z.boolean().optional(),
});

const updateSchema = z.object({
  id: z.number().int().positive(),
  start_time: clock.optional(),
  end_time: clock.nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  subtitle: subtitleField,
  is_break: z.boolean().optional(),
  is_published: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

const deleteSchema = z.object({ id: z.coerce.number().int().positive() });

/**
 * Jam selesai tidak boleh mendahului jam mulai.
 *
 * Diperiksa di sini meski constraint database sudah menjaganya, supaya admin
 * mendapat pesan yang menyebut masalahnya alih-alih "kesalahan server". Sama
 * dengan constraint, sama-dengan tetap diizinkan: butir berdurasi nol dipakai
 * panitia sebagai penanda momen.
 */
function invalidRange(start: string, end: string | null | undefined) {
  if (!end) return false;
  return toDbTime(end) < toDbTime(start);
}

export async function POST(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (invalidRange(parsed.data.start_time, parsed.data.end_time)) {
    return apiError("VALIDATION_ERROR", 422, { message: "Jam selesai tidak boleh lebih awal dari jam mulai." });
  }

  const client = getSupabaseServiceClient();
  const { data: section } = await client
    .from("rundown_sections")
    .select("id")
    .eq("id", parsed.data.section_id)
    .maybeSingle();
  if (!section) return apiError("RUNDOWN_SECTION_NOT_FOUND", 404);

  // Baris baru masuk ke urutan paling belakang DI DALAM bagiannya. Sengaja bukan
  // urutan global: dua bagian punya daftar sendiri, dan nomor urut yang dibagi
  // bersama membuat baris bagian kedua selalu bernomor jauh lebih besar tanpa
  // alasan yang bisa dijelaskan ke admin.
  const { data: last } = await client
    .from("rundown_items")
    .select("sort_order")
    .eq("section_id", parsed.data.section_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = Math.min(9999, (((last as { sort_order: number } | null)?.sort_order ?? 0) + 1));

  const { data, error } = await client
    .from("rundown_items")
    .insert({
      section_id: parsed.data.section_id,
      start_time: toDbTime(parsed.data.start_time),
      end_time: parsed.data.end_time ? toDbTime(parsed.data.end_time) : null,
      title: parsed.data.title,
      subtitle: normalizeSubtitle(parsed.data.subtitle),
      is_break: parsed.data.is_break ?? false,
      // Baris baru langsung tampil, berbeda dari bagian yang selalu draf. Yang
      // menahan visibilitas adalah publish di tingkat bagian; kalau baris juga
      // harus dipublikasikan satu per satu, menyusun rundown 20 butir berarti 20
      // klik tambahan yang tidak memberi kendali apa pun.
      is_published: true,
      sort_order: nextOrder,
      updated_by: auth.user.id,
    } as never)
    .select(ITEM_COLUMNS)
    .single();
  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "rundown_item_create",
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
  const { data: current } = await client.from("rundown_items").select(ITEM_COLUMNS).eq("id", id).maybeSingle();
  if (!current) return apiError("RUNDOWN_ITEM_NOT_FOUND", 404);

  const row = current as { start_time: string; end_time: string | null };
  // Rentang diperiksa terhadap gabungan nilai lama dan baru. Mengubah hanya jam
  // mulai tetap bisa membuatnya melewati jam selesai yang sudah tersimpan, dan
  // memeriksa nilai kiriman saja akan meloloskannya.
  const nextStart = changes.start_time ?? row.start_time;
  const nextEnd = changes.end_time !== undefined ? changes.end_time : row.end_time;
  if (invalidRange(nextStart, nextEnd)) {
    return apiError("VALIDATION_ERROR", 422, { message: "Jam selesai tidak boleh lebih awal dari jam mulai." });
  }

  const { data, error } = await client
    .from("rundown_items")
    .update({
      ...changes,
      ...(changes.start_time !== undefined ? { start_time: toDbTime(changes.start_time) } : {}),
      // null berarti admin sengaja menghapus jam selesai (butir tanpa durasi);
      // field yang tidak dikirim berarti tidak ada perubahan.
      ...(changes.end_time !== undefined ? { end_time: changes.end_time ? toDbTime(changes.end_time) : null } : {}),
      ...(changes.subtitle !== undefined ? { subtitle: normalizeSubtitle(changes.subtitle) } : {}),
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id,
    } as never)
    .eq("id", id)
    .select(ITEM_COLUMNS)
    .single();
  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "rundown_item_update",
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
    .from("rundown_items")
    .select(ITEM_COLUMNS)
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!current) return apiError("RUNDOWN_ITEM_NOT_FOUND", 404);

  const { error } = await client.from("rundown_items").delete().eq("id", parsed.data.id);
  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "rundown_item_delete",
    payload: { old: current },
  } as never);
  return Response.json({ deleted: true, id: parsed.data.id });
}
