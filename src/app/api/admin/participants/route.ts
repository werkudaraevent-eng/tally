import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import type { RegistrationField, RegistrationFormConfig } from "@/lib/domain";
import { logistikPeserta } from "@/lib/logistik/server";
import { cleanExtra, participantBodySchema, toRpcArgs } from "@/lib/participant-input";
import { argumenRpc, nilaiKolomAdmin, querySchema, saring, saringanAdmin, semuaBarisRpc } from "@/lib/participants-saring";
import { kolomSaringanAdmin } from "@/lib/saringan-kolom";
import { normalizeTimeZone } from "@/lib/timezone";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Whitelist kolom sort dan skema parameter ada di participants-saring: Export
// memakai penyaring yang sama. Nama kolom TIDAK BOLEH diambil langsung dari
// query string ke .order(), karena itu membuka celah injeksi lewat PostgREST.
// Seluruh penyaring lama dikerjakan `list_event_participants` di database;
// dua di antaranya menanyakan baris di tabel lain ("belum hadir di sesi ini",
// "mendaftar sendiri"), dan seribu uuid di URL melewati batas lazim 8 KB.

/** Batas "pilih semua yang cocok", sama dengan batas penerima manual Pesan peserta. */
const BATAS_PILIH = 5000;

/**
 * Perusahaan peserta aktif beserta jumlahnya, untuk chip saring "Perusahaan".
 * Dibaca per 1000 baris karena PostgREST memotong satu jawaban di 1000.
 * Nilai "" = peserta tanpa perusahaan.
 */
async function daftarPerusahaan(eventId: string): Promise<Array<{ company: string; count: number }>> {
  const client = getSupabaseServiceClient();
  const hitung = new Map<string, number>();
  for (let dari = 0; dari < 20000; dari += 1000) {
    const { data, error } = await client
      .from("participants")
      .select("company")
      .eq("event_id", eventId)
      .is("source_removed_at", null)
      .order("id")
      .range(dari, dari + 999);
    if (error || !data) break;
    for (const baris of data as Array<{ company: string | null }>) {
      const nama = baris.company?.trim() ?? "";
      hitung.set(nama, (hitung.get(nama) ?? 0) + 1);
    }
    if (data.length < 1000) break;
  }
  return [...hitung.entries()]
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => (a.company === "" ? 1 : b.company === "" ? -1 : a.company.localeCompare(b.company, "id")));
}

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();
  const fields = ((auth.scope.event.registration_form_config as RegistrationFormConfig | null)?.fields ?? []) as RegistrationField[];
  const zona = normalizeTimeZone(auth.scope.event.time_zone);
  // Nama perusahaan bisa mengandung koma, jadi dikirim sebagai parameter berulang.
  const companies = new URL(request.url).searchParams.getAll("company").map((nama) => nama.trim()).slice(0, 50);
  const argumen = argumenRpc(eventId, parsed.data, companies);
  const saringan = saringanAdmin(parsed.data.f, fields);
  if (!saringan) return apiError("VALIDATION_ERROR", 422, { message: "Unknown filter." });

  // Daftar centang "+ Filter": nilai yang benar-benar ada di kolom itu.
  if (parsed.data.facet !== undefined) {
    const kolom = kolomSaringanAdmin(fields).find((item) => item.key === parsed.data.facet && item.jenis === "pilihan");
    if (!kolom) return apiError("VALIDATION_ERROR", 422, { message: "This column has no value list." });
    try {
      return Response.json({ key: kolom.key, values: await nilaiKolomAdmin(eventId, kolom.key, fields, zona) });
    } catch {
      return apiError("INTERNAL_ERROR", 500);
    }
  }

  // Saringan per kolom: semua baris yang lolos penyaring database, disaring di
  // sini, lalu dipotong per halaman. Urutannya tetap urutan RPC.
  let tersaring: Array<{ id: string }> | null = null;
  if (saringan.length) {
    try {
      tersaring = saring(await semuaBarisRpc(argumen), saringan, fields, zona);
    } catch {
      return apiError("INTERNAL_ERROR", 500);
    }
  }

  // Saringan yang persis sama dengan tabel, tanpa paginasi: yang dicentang
  // "Pilih semua 278 yang cocok" harus 278 orang yang sama dengan di layar.
  if (parsed.data.ids_only) {
    if (tersaring) return Response.json({ ids: tersaring.slice(0, BATAS_PILIH).map((baris) => baris.id), total: tersaring.length, limit: BATAS_PILIH });
    const { data, error } = await client.rpc("list_event_participants" as never, { ...argumen, p_limit: BATAS_PILIH, p_offset: 0 } as never);
    if (error) return apiError("INTERNAL_ERROR", 500);
    const hasil = (data ?? { rows: [], total: 0 }) as { rows: Array<{ id: string }>; total: number };
    return Response.json({ ids: hasil.rows.map((baris) => baris.id), total: hasil.total, limit: BATAS_PILIH });
  }

  const halamanTersaring = tersaring
    ? { data: { rows: tersaring.slice(parsed.data.offset, parsed.data.offset + parsed.data.limit), total: tersaring.length }, error: null }
    : null;

  const [halaman, sesi, semua, dihapus, dariScanner, terakhir, perusahaan] = await Promise.all([
    halamanTersaring ?? client.rpc("list_event_participants" as never, argumen as never),
    client
      .from("attendance_sessions")
      .select("id,name,sort_order,is_active")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    // Tiga hitungan berikut sengaja TIDAK ikut disaring. Judul tabel menjawab
    // "berapa peserta acara ini", dan angka itu tidak boleh berubah hanya karena
    // seseorang sedang menyaring daftarnya.
    client.from("participants").select("id", { count: "exact", head: true }).eq("event_id", eventId),
    client.from("participants").select("id", { count: "exact", head: true }).eq("event_id", eventId).not("source_removed_at", "is", null),
    /**
     * Apakah acara ini benar-benar punya peserta dari Scanner API.
     *
     * Diperiksa lewat BARISNYA, bukan lewat kolom `participant_source` yang
     * dideklarasikan admin. Sebuah acara bisa ditandai "hybrid" lalu tidak
     * pernah disambungkan sama sekali, dan di situ dua kolom milik Scanner API
     * berisi "Belum" dan 0 selamanya, berdampingan dengan kolom kehadiran yang
     * benar-benar terisi. Itulah yang dibaca admin sebagai daftar yang rusak.
     */
    client.from("participants").select("id", { count: "exact", head: true }).eq("event_id", eventId).not("source_participant_id", "is", null),
    client.from("participants").select("source_synced_at").eq("event_id", eventId).order("source_synced_at", { ascending: false }).limit(1).maybeSingle(),
    daftarPerusahaan(eventId),
  ]);

  if (halaman.error) {
    if (companies.length > 0) return apiError("VALIDATION_ERROR", 422, { message: "The organisation filter isn't available yet: migration 202609290001 hasn't been applied." });
    return apiError("INTERNAL_ERROR", 500);
  }

  const hasil = (halaman.data ?? { rows: [], total: 0 }) as { rows: Array<{ id: string }>; total: number };
  const logistik = await logistikPeserta(eventId, hasil.rows.map((baris) => baris.id));
  const totalSemua = semua.count ?? 0;
  const totalDihapus = dihapus.count ?? 0;

  return Response.json({
    // Total yang SUDAH disaring. Dipakai paginasi, jadi ia harus datang dari
    // penyaring yang persis sama dengan barisnya -- itulah kenapa keduanya
    // dihitung sekali di dalam satu kueri.
    total: hasil.total,
    active_total: totalSemua - totalDihapus,
    removed_count: totalDihapus,
    last_synced_at: (terakhir.data as { source_synced_at: string | null } | null)?.source_synced_at ?? null,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
    participants: hasil.rows.map((baris) => ({ ...baris, logistik: logistik.get(baris.id) ?? null })),
    // Sesi yang SUDAH DITUTUP ikut dikirim. Kehadiran yang tercatat di sesi pagi
    // tidak hilang artinya sore hari, dan kolomnya yang menghilang begitu sesi
    // ditutup akan terbaca sebagai data yang lenyap.
    sessions: sesi.data ?? [],
    scanner_columns: (dariScanner.count ?? 0) > 0,
    companies: perusahaan,
    // Susunan field tambahan dikirim bersama daftarnya, bukan diambil terpisah
    // dari endpoint pendaftaran: kolom tabel dan isinya harus datang dari satu
    // jawaban, supaya tidak ada satu putaran render dengan kolom yang belum
    // punya nama atau nama yang belum punya kolom.
    fields,
  });
}

/**
 * Tambah peserta manual.
 *
 * Barisnya dibuat tanpa `source_participant_id`, dan justru itulah yang membuat
 * sinkronisasi Scanner API tidak menyentuhnya: sapuan `source_removed_at`
 * menyaring `source_participant_id is not null`, dan upsert-nya memakai
 * conflict target `(event_id, source_participant_id)`.
 */
export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const body = participantBodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION_ERROR", 422, body.error.flatten());

  // Jawaban tambahan diperiksa terhadap konfigurasi form acara — dropdown yang
  // diisi nilai di luar daftarnya akan tampil sebagai jawaban yang tidak ada di
  // formulir mana pun.
  const { issues, clean } = cleanExtra(auth.scope.event.registration_form_config as RegistrationFormConfig | null, body.data.extra);
  if (issues.length > 0) {
    return apiError("VALIDATION_ERROR", 422, Object.fromEntries(issues.map((issue) => [`extra.${issue.key}`, issue.message])));
  }

  const { data, error } = await getSupabaseServiceClient().rpc("save_participant" as never, {
    p_event_id: auth.scope.event.id,
    p_id: null,
    ...toRpcArgs(body.data, clean),
    p_actor: auth.user.id,
  } as never);
  if (error) {
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : 422);
  }
  return Response.json({ participant: data }, { status: 201 });
}
