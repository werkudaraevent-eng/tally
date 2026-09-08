import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import type { RegistrationFormConfig } from "@/lib/domain";
import { cleanExtra, participantBodySchema, toRpcArgs } from "@/lib/participant-input";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Whitelist kolom sort. Nama kolom TIDAK BOLEH diambil langsung dari query
// string ke .order(), karena itu membuka celah injeksi lewat parameter PostgREST.
const SORTABLE = {
  name: "name",
  // Instansi dan jabatan berdiri sebagai kolom sendiri di tabel, jadi keduanya
  // harus bisa diurutkan juga: header yang bisa diklik di sebagian kolom dan
  // tidak di sebagian lain terbaca sebagai kerusakan, bukan sebagai aturan.
  company: "company",
  title: "title",
  qr_code: "qr_code",
  participant_type: "participant_type",
  rsvp_status: "rsvp_status",
  source_checked_in: "source_checked_in",
  source_total_scans: "source_total_scans",
} as const;


/**
 * Penyaring daftar peserta.
 *
 * Seluruhnya dikerjakan `list_event_participants` di database, bukan di sini.
 * Dua di antaranya menanyakan keberadaan baris di tabel lain -- "belum hadir di
 * sesi ini" dan "mendaftar sendiri" -- dan menjawabnya dari luar SQL menuntut
 * seluruh id yang cocok ditempelkan ke kueri berikutnya sebagai daftar. Seribu
 * uuid adalah URL 37 KB; batas lazim sebuah server 8 KB.
 */
const querySchema = z.object({
  q: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(Object.keys(SORTABLE) as [keyof typeof SORTABLE]).default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  source: z.enum(["walkin", "scanner", "registration", "manual"]).optional(),
  session: z.coerce.number().int().positive().optional(),
  attended: z.enum(["yes", "no"]).optional(),
  rsvp: z.enum(["invited", "confirmed", "none"]).optional(),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();

  const [halaman, sesi, semua, dihapus, dariScanner, terakhir] = await Promise.all([
    client.rpc("list_event_participants" as never, {
      p_event_id: eventId,
      p_q: parsed.data.q,
      p_source: parsed.data.source ?? null,
      // Penyaring kehadiran hanya berarti bila sesinya disebut. "Belum hadir"
      // tanpa menyebut di sesi mana adalah pertanyaan yang tidak punya jawaban
      // di acara yang punya registrasi, workshop, dan makan siang.
      p_session: parsed.data.attended ? (parsed.data.session ?? null) : null,
      p_attended: parsed.data.session ? (parsed.data.attended ?? null) : null,
      p_rsvp: parsed.data.rsvp ?? null,
      p_sort: parsed.data.sort,
      p_dir: parsed.data.dir,
      p_limit: parsed.data.limit,
      p_offset: parsed.data.offset,
    } as never),
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
  ]);

  if (halaman.error) return apiError("INTERNAL_ERROR", 500);

  const hasil = (halaman.data ?? { rows: [], total: 0 }) as { rows: unknown[]; total: number };
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
    participants: hasil.rows,
    // Sesi yang SUDAH DITUTUP ikut dikirim. Kehadiran yang tercatat di sesi pagi
    // tidak hilang artinya sore hari, dan kolomnya yang menghilang begitu sesi
    // ditutup akan terbaca sebagai data yang lenyap.
    sessions: sesi.data ?? [],
    scanner_columns: (dariScanner.count ?? 0) > 0,
    // Susunan field tambahan dikirim bersama daftarnya, bukan diambil terpisah
    // dari endpoint pendaftaran: kolom tabel dan isinya harus datang dari satu
    // jawaban, supaya tidak ada satu putaran render dengan kolom yang belum
    // punya nama atau nama yang belum punya kolom.
    fields: ((auth.scope.event.registration_form_config as RegistrationFormConfig | null)?.fields ?? []),
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
