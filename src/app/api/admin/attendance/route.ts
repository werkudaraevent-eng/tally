import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { totalAmbilBagasi, totalBagasiSesi } from "@/lib/bagasi/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * CMS sesi kehadiran: membuat checkpoint dan membaca angkanya.
 *
 * Angka yang dilaporkan adalah PESERTA UNIK, bukan jumlah baris pemindaian.
 * Tabel scan menyimpan setiap pemindaian termasuk yang berulang — itu yang
 * membuat pertanyaan "jam berapa dia kembali" bisa dijawab — tetapi "berapa
 * orang yang hadir" harus tetap menghitung orang, bukan ketukan.
 */

const sessionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug hanya boleh huruf kecil, angka, dan tanda hubung."),
  sort_order: z.number().int().min(0).max(999).optional(),
  is_active: z.boolean().optional(),
  records_luggage: z.boolean().optional(),
  /** Luggage: Pick-up (migrasi 202610240001). Tidak boleh bersamaan dengan records_luggage. */
  luggage_pickup: z.boolean().optional(),
});

const patchSchema = sessionSchema.partial().extend({ id: z.number().int().positive() });

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();

  const [sesi, scans] = await Promise.all([
    client
      .from("attendance_sessions")
      // select *: `records_luggage` baru ada setelah migrasi 202610230003.
      .select("*")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    // Kolom yang ditarik sesempit mungkin: tabel ini yang tumbuh paling cepat di
    // hari-H, dan halaman ini hanya butuh menghitung orang unik per sesi.
    client.from("attendance_scans").select("session_id,participant_id,scanned_at").eq("event_id", eventId),
  ]);

  if (sesi.error) return apiError("INTERNAL_ERROR", 500);

  const baris = (scans.data ?? []) as Array<{ session_id: number; participant_id: string; scanned_at: string }>;
  const unik = new Map<number, Set<string>>();
  const total = new Map<number, number>();
  const terakhir = new Map<number, string>();
  for (const scan of baris) {
    if (!unik.has(scan.session_id)) unik.set(scan.session_id, new Set());
    unik.get(scan.session_id)!.add(scan.participant_id);
    total.set(scan.session_id, (total.get(scan.session_id) ?? 0) + 1);
    const sebelumnya = terakhir.get(scan.session_id);
    if (!sebelumnya || scan.scanned_at > sebelumnya) terakhir.set(scan.session_id, scan.scanned_at);
  }

  // Berapa banyak yang didaftarkan di meja, bukan sebelum hari-H. Dihitung di
  // sini dan bukan di halaman: satu-satunya cara klien mengetahuinya adalah
  // menarik seluruh daftar peserta hanya untuk menghitung sebuah kolom.
  const { count: walkIn } = await client
    .from("participants")
    .select("id", { head: true, count: "exact" })
    .eq("event_id", eventId)
    .not("walk_in_at", "is", null);

  // Total bagasi untuk sesi yang mencatatnya (muat truk per batch). Dibaca
  // hanya bila ada sesi seperti itu, supaya acara lain tidak membayar kuerinya.
  const daftar = (sesi.data ?? []) as Array<{ id: number; records_luggage?: boolean; luggage_pickup?: boolean }>;
  const [bagasi, ambil] = await Promise.all([
    daftar.some((row) => row.records_luggage === true) ? totalBagasiSesi(eventId) : null,
    // Meja ambil: kemajuan se-acara (semua meja titip), sama untuk tiap meja ambil.
    daftar.some((row) => row.luggage_pickup === true) ? totalAmbilBagasi(eventId) : null,
  ]);

  return Response.json({
    sessions: daftar.map((row) => ({
      ...row,
      ...(row.records_luggage === true ? { bagasi: bagasi?.get(row.id) ?? { bags: 0, people: 0, photos: 0 } } : {}),
      ...(row.luggage_pickup === true && ambil ? { ambil_bagasi: ambil } : {}),
      hadir: unik.get(row.id)?.size ?? 0,
      total_scan: total.get(row.id) ?? 0,
      terakhir: terakhir.get(row.id) ?? null,
    })),
    allow_walk_in: auth.scope.event.attendance_allow_walk_in,
    walk_in_count: walkIn ?? 0,
  });
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = sessionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { data, error } = await getSupabaseServiceClient()
    .from("attendance_sessions")
    .insert({ ...parsed.data, event_id: auth.scope.event.id } as never)
    .select("*")
    .single();

  // Slug ganda ditolak database lewat indeks unik. Diterjemahkan di sini supaya
  // admin membaca sebab yang benar, bukan "terjadi kesalahan".
  if (error) {
    if (String(error.code) === "23505") {
      return apiError("VALIDATION_ERROR", 422, { slug: "Slug ini sudah dipakai sesi lain di acara yang sama." });
    }
    return apiError("INTERNAL_ERROR", 500);
  }
  return Response.json(data);
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { id, ...patch } = parsed.data;
  if (Object.keys(patch).length === 0) return apiError("VALIDATION_ERROR", 422);

  if (patch.records_luggage === true && patch.luggage_pickup === true) {
    return apiError("VALIDATION_ERROR", 422, { message: "A session either takes luggage in or hands it back, not both." });
  }

  // Meja bagasi selalu dipindai panitia (jumlah dan foto diisi petugas, atau
  // koper diserahkan petugas). Checkpoint yang dipindai sendiri oleh peserta
  // di sesi ini harus diubah dulu.
  if (patch.records_luggage === true || patch.luggage_pickup === true) {
    const { data: cp } = await getSupabaseServiceClient().from("checkpoints").select("*").eq("event_id", auth.scope.event.id).eq("session_id", id);
    const mandiri = ((cp ?? []) as Array<{ title: string; completion?: string }>).find((baris) => baris.completion === "self" || baris.completion === "both");
    if (mandiri) {
      return apiError("VALIDATION_ERROR", 422, {
        message: `Checkpoint "${mandiri.title}" lets participants scan this session themselves. Set it to "Staff scan the participant's QR" in Checkpoints first.`,
      });
    }
  }

  const { data, error } = await getSupabaseServiceClient()
    .from("attendance_sessions")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    // event_id ikut disaring: id sesi milik acara lain tidak boleh bisa diubah
    // hanya karena nomornya ditempelkan ke permintaan ini.
    .eq("id", id)
    .eq("event_id", auth.scope.event.id)
    .select("*")
    .single();

  if (error) {
    if (String(error.code) === "23505") {
      return apiError("VALIDATION_ERROR", 422, { slug: "Slug ini sudah dipakai sesi lain di acara yang sama." });
    }
    return apiError("INTERNAL_ERROR", 500);
  }
  return Response.json(data);
}

export async function DELETE(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();

  // Sesi yang sudah punya catatan kehadiran TIDAK dihapus, hanya bisa ditutup.
  // Menghapusnya ikut menghapus catatan hadir lewat `on delete cascade`, dan
  // daftar hadir adalah satu-satunya bukti bahwa seseorang benar-benar datang.
  const { count } = await client
    .from("attendance_scans")
    .select("id", { head: true, count: "exact" })
    .eq("session_id", id)
    .eq("event_id", auth.scope.event.id);

  if ((count ?? 0) > 0) {
    return apiError("VALIDATION_ERROR", 422, {
      message: `Sesi ini sudah punya ${count} catatan kehadiran. Tutup sesinya, jangan dihapus — catatan hadir ikut terhapus bersamanya.`,
    });
  }

  const { error } = await client
    .from("attendance_sessions")
    .delete()
    .eq("id", id)
    .eq("event_id", auth.scope.event.id);

  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ ok: true });
}
