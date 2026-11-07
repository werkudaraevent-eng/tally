import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { EventLandingConfig, EventRow, LandingMemberConfig } from "@/lib/domain";
import type { LandingLang } from "@/lib/landing-i18n";
import { loadAgendaPreview } from "@/lib/landing-agenda";
import { loadMemberLogistics } from "@/lib/logistik/peserta";
import { bagianTampil, bagianTersembunyi } from "@/lib/logistik/bagian-tampil";
import { jamTiket, tanggalLeg } from "@/lib/logistik/kereta-tampil";
import { loadHadiahPeserta } from "@/lib/member/hadiah-server";
import { namaSapaan } from "@/lib/member/nav";
import { gabungMeta } from "@/lib/typography";
import { semuaBaris } from "@/lib/logistik/server";
import { sorotanAgenda, type Kenangan } from "./alur.ts";
import type { FaktaPeserta } from "./logika.ts";
import { bolehIkut, rapikanSetelan, statusBuka, teksBeranda, type NilaiJawaban, type Pertanyaan, type SetelanKilas } from "./setelan.ts";

/**
 * Baca dan tulis Kilas balik (migrasi 202611070010). Semua lewat service role:
 * tabelnya tertutup untuk anon dan authenticated.
 *
 * Sebelum migrasi dijalankan, `muatSetelan` memberi `{ siap: false }`: admin
 * menampilkan "belum siap", halaman peserta 404, kartu Beranda tidak tampil.
 */

const db = () => getSupabaseServiceClient();
const tabelBelumAda = (galat: { code?: string } | null | undefined) => galat?.code === "42P01" || galat?.code === "PGRST205";

const KOLOM = "event_id,enabled,title,intro,closing,signed_by,display,theme,questions,cards,opens_at,closes_at,updated_at";

export async function muatSetelan(eventId: string): Promise<{ siap: false } | { siap: true; setelan: SetelanKilas; ada: boolean }> {
  const { data, error } = await db().from("feedback_settings" as never).select(KOLOM).eq("event_id", eventId).maybeSingle();
  if (error) {
    if (tabelBelumAda(error as { code?: string })) return { siap: false };
    throw new Error(`feedback_settings: ${(error as { message?: string }).message ?? "read failed"}`);
  }
  return { siap: true, setelan: rapikanSetelan(data), ada: data !== null };
}

/** Judul baris Agenda (bukan jeda) yang dilihat peserta ini, atau semua baris tanpa syarat bila `participantId` null. */
export async function judulAgenda(event: Pick<EventRow, "id" | "registration_form_config">, lang: LandingLang, participantId: string | null): Promise<string[]> {
  const bagian = await loadAgendaPreview(event.id, lang, { acara: event, participantId, tampilKamar: false }).catch(() => []);
  const judul = bagian.flatMap((b) => b.items.filter((i) => !i.jeda).map((i) => i.title.trim())).filter(Boolean);
  return [...new Set(judul)];
}

/**
 * Semua judul baris Agenda yang terbit (bukan jeda), termasuk baris bersyarat,
 * dalam kedua bahasa. Untuk tombol "Fill from Agenda" di admin dan untuk tahu
 * pilihan mana yang berasal dari Agenda.
 */
export async function semuaJudulAgenda(eventId: string): Promise<string[]> {
  const { data: seksi } = await db().from("rundown_sections").select("id").eq("event_id", eventId).eq("is_published", true).limit(200);
  const ids = ((seksi ?? []) as { id: number }[]).map((r) => r.id);
  if (!ids.length) return [];
  const { data } = await db()
    .from("rundown_items")
    .select("title,title_en,is_break,start_time")
    .in("section_id", ids)
    .eq("is_published", true)
    .order("start_time", { ascending: true })
    .limit(1000);
  const judul: string[] = [];
  for (const r of (data ?? []) as { title: string | null; title_en: string | null; is_break: boolean | null }[]) {
    if (r.is_break) continue;
    for (const t of [r.title, r.title_en]) if (t?.trim()) judul.push(t.trim());
  }
  return [...new Set(judul)];
}

/** Judul Agenda yang dilihat peserta ini dalam kedua bahasa, untuk menyaring pilihan dari Agenda. */
export async function judulAgendaMilik(event: Pick<EventRow, "id" | "registration_form_config">, participantId: string): Promise<Set<string>> {
  const [id, en] = await Promise.all([judulAgenda(event, "id", participantId), judulAgenda(event, "en", participantId)]);
  return new Set([...id, ...en]);
}

export { pilihanPeserta } from "./layar.ts";

/**
 * Kenangan satu peserta. Hanya bagian yang memang sudah tampil di area peserta
 * (Participant area > Logistics, kartu hadiah) yang dibaca: kilas balik tidak
 * pernah memperlihatkan data yang panitia sembunyikan dari peserta.
 */
export async function muatKenangan(event: EventRow, member: LandingMemberConfig, participantId: string, nama: string, lang: LandingLang): Promise<Kenangan> {
  const sembunyi = bagianTersembunyi(member);
  const [logistik, hadiah, hadir, agenda] = await Promise.all([
    loadMemberLogistics(event.id, participantId, member.show_logistics === true, undefined, false, sembunyi).catch(() => null),
    loadHadiahPeserta(event.id, participantId, member.prize, lang).catch(() => []),
    sesiHadir(event.id, participantId).then((s) => s.size),
    loadAgendaPreview(event.id, lang, { acara: event, participantId, tampilKamar: false }).catch(() => []),
  ]);
  const sorotan = sorotanAgenda(agenda, event.event_date ?? null, event.end_date ?? event.event_date ?? null);

  let trip: Kenangan["trip"] = null;
  const tiket = (logistik?.trains ?? []).find((t) => t.direction === "outbound") ?? null;
  if (tiket && bagianTampil(member, "trains")) {
    trip = {
      mode: tiket.mode === "flight" || tiket.mode === "ship" ? tiket.mode : "train",
      judul: tiket.origin?.trim() || tiket.train_name,
      kapan: gabungMeta([tanggalLeg(tiket.depart_date, lang), jamTiket(tiket.depart_time, lang)]) || null,
      detail: gabungMeta([
        tiket.train_name,
        tiket.carriage ? `${lang === "en" ? "Car" : "Gerbong"} ${tiket.carriage}` : null,
        tiket.seat ? `${lang === "en" ? "seat" : "kursi"} ${tiket.seat}` : null,
      ]) || null,
    };
  } else {
    const bus = (logistik?.transport?.trips ?? []).find((t) => t.bus);
    if (bus) trip = { mode: "bus", judul: bus.origin?.trim() || bus.name, kapan: null, detail: gabungMeta([bus.name, bus.bus]) || null };
  }

  let stay: Kenangan["stay"] = null;
  const inap = logistik?.stays?.length ? logistik.stays : logistik?.lodging ? [logistik.lodging] : [];
  if (inap.length && bagianTampil(member, "rooms")) {
    const utama = inap[0];
    const malam = inap.reduce((n, s) => n + malamAntara(s.check_in_at, s.check_out_at), 0);
    stay = {
      hotel: utama.hotel.name,
      kamar: utama.room_number,
      teman: (utama.roommates ?? []).map((r) => namaSapaan(r.name).split(" ")[0]).slice(0, 3),
      malam,
    };
  }

  return {
    nama: namaSapaan(nama).split(" ")[0] || namaSapaan(nama),
    hari: hariAcara(event),
    trip,
    stay,
    agenda: hadir > 0 || sorotan.length ? { hadir, sorotan } : null,
    prize: hadiah.length ? { hadiah: hadiah.map((h) => h.nama) } : null,
  };
}

function malamAntara(masuk: string | null, keluar: string | null): number {
  if (!masuk || !keluar) return 0;
  const n = Math.round((Date.parse(keluar.slice(0, 10)) - Date.parse(masuk.slice(0, 10))) / 86_400_000);
  return Number.isFinite(n) && n > 0 && n < 60 ? n : 0;
}

export function hariAcara(event: Pick<EventRow, "event_date" | "end_date">): number {
  if (!event.event_date) return 1;
  const n = Math.round((Date.parse(event.end_date ?? event.event_date) - Date.parse(event.event_date)) / 86_400_000) + 1;
  return Number.isFinite(n) && n >= 1 && n < 60 ? n : 1;
}

/** Sesi check-in berbeda yang mencatat peserta ini. Gagal baca = kosong. */
async function sesiHadir(eventId: string, participantId: string): Promise<Set<number>> {
  const { data, error } = await db()
    .from("attendance_scans")
    .select("session_id")
    .eq("event_id", eventId)
    .eq("participant_id", participantId)
    .limit(1000);
  if (error || !Array.isArray(data)) return new Set();
  return new Set((data as { session_id: number }[]).map((r) => r.session_id));
}

/** Ada pertanyaan dengan syarat data acara? Tanpa itu, fakta tidak perlu dibaca. */
export const perluFakta = (questions: readonly Pertanyaan[]) => questions.some((q) => (q.show_if ?? []).some((s) => s.source !== "answer"));

/**
 * Data acara peserta untuk Show if (logika.ts). Hadiah dibaca dengan aturan
 * kartu hadiah area peserta, jadi syarat tidak pernah membaca hadiah yang
 * panitia sembunyikan. Gagal baca = tidak punya (syarat "ya" tidak cocok).
 */
export async function muatFakta(event: Pick<EventRow, "id">, member: LandingMemberConfig, participantId: string, lang: LandingLang): Promise<FaktaPeserta> {
  const [sesi, hadiah, baris] = await Promise.all([
    sesiHadir(event.id, participantId),
    loadHadiahPeserta(event.id, participantId, member.prize, lang).catch(() => []),
    db().from("participants").select("extra").eq("event_id", event.id).eq("id", participantId).maybeSingle(),
  ]);
  const extra = (baris.data as { extra?: unknown } | null)?.extra;
  return { sesi, hadiah: hadiah.length > 0, kolom: extra && typeof extra === "object" ? (extra as Record<string, unknown>) : null };
}

/** Sesi check-in acara ini, untuk menu Show if di admin. */
export async function sesiCheckin(eventId: string): Promise<{ id: number; name: string }[]> {
  const { data } = await db().from("attendance_sessions").select("id,name").eq("event_id", eventId).order("sort_order").order("id").limit(200);
  return ((data ?? []) as { id: number; name: string | null }[]).map((r) => ({ id: r.id, name: r.name?.trim() || `Session ${r.id}` }));
}

/**
 * Alamat untuk kartu Beranda, atau null bila kartunya tidak perlu tampil:
 * modul mati, belum/sudah lewat jendelanya, tabel belum ada, atau peserta ini
 * sudah mengirim jawaban. Gagal baca = tanpa kartu, Beranda tetap terbuka.
 */
export async function tautanKartuKilas(
  event: Pick<EventRow, "id">,
  peserta: { id: string; participant_type?: string | null },
  committee: unknown,
  halamanAcara: string,
  lang: "id" | "en",
): Promise<{ href: string; title: string; body: string; button: string } | null> {
  try {
    const muat = await muatSetelan(event.id);
    if (!muat.siap || !muat.setelan.home.show || statusBuka(muat.setelan, new Date()) !== "open") return null;
    if (!bolehIkut(muat.setelan.audience, committee, peserta.participant_type)) return null;
    if (await muatJawaban(event.id, peserta.id)) return null;
    return { href: `${halamanAcara}/kilas-balik`, ...teksBeranda(muat.setelan.home, lang) };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- Jawaban */

export async function muatJawaban(eventId: string, participantId: string): Promise<{ answers: Record<string, NilaiJawaban>; submitted_at: string } | null> {
  const { data, error } = await db()
    .from("feedback_responses" as never)
    .select("answers,submitted_at")
    .eq("event_id", eventId)
    .eq("participant_id", participantId)
    .maybeSingle();
  if (error || !data) return null;
  return data as { answers: Record<string, NilaiJawaban>; submitted_at: string };
}

export async function simpanJawaban(eventId: string, participantId: string, answers: Record<string, NilaiJawaban>): Promise<boolean> {
  const { error } = await db()
    .from("feedback_responses" as never)
    .upsert({ event_id: eventId, participant_id: participantId, answers, submitted_at: new Date().toISOString() } as never, { onConflict: "event_id,participant_id" });
  return !error;
}

/* --------------------------------------------------------------- Hasil */

export type BarisHasil = {
  participant_id: string;
  submitted_at: string;
  answers: Record<string, unknown>;
  /** Kolom peserta: name, email, company, title, participant_type, dan isian formulir (extra.*). */
  peserta: Record<string, string | null>;
};

/** Semua jawaban acara ini beserta kolom pesertanya, dan jumlah peserta untuk tingkat respons. */
export async function muatHasil(eventId: string): Promise<{ baris: BarisHasil[]; totalPeserta: number } | null> {
  const jawaban = await semuaBaris<{ participant_id: string; answers: Record<string, unknown>; submitted_at: string }>(() =>
    db().from("feedback_responses" as never).select("participant_id,answers,submitted_at").eq("event_id", eventId).order("submitted_at", { ascending: false }),
  );
  if (!jawaban) return null;
  const { count } = await db().from("participants").select("id", { count: "exact", head: true }).eq("event_id", eventId).is("source_removed_at", null);
  const peta = new Map<string, Record<string, unknown>>();
  const ids = jawaban.map((j) => j.participant_id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db().from("participants").select("*").eq("event_id", eventId).in("id", ids.slice(i, i + 200));
    for (const p of (data ?? []) as Record<string, unknown>[]) peta.set(String(p.id), p);
  }
  return {
    totalPeserta: count ?? 0,
    baris: jawaban.map((j) => ({ participant_id: j.participant_id, submitted_at: j.submitted_at, answers: j.answers ?? {}, peserta: kolomPeserta(peta.get(j.participant_id)) })),
  };
}

/** Kolom peserta yang boleh dilihat admin di hasil. qr_code tidak pernah ikut. */
function kolomPeserta(p: Record<string, unknown> | undefined): Record<string, string | null> {
  if (!p) return { name: null };
  const teks = (v: unknown) => (v === null || v === undefined || v === "" ? null : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? null : String(v));
  const hasil: Record<string, string | null> = {
    name: teks(p.name),
    email: teks(p.email),
    company: teks(p.company),
    title: teks(p.title),
    participant_type: teks(p.participant_type),
  };
  const extra = p.extra && typeof p.extra === "object" ? (p.extra as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(extra)) hasil[`extra.${k}`] = teks(v);
  return hasil;
}

/** Label kolom formulir pendaftaran (Registration form) untuk kolom extra.*. */
export function labelKolom(event: Pick<EventRow, "registration_form_config">): Record<string, string> {
  const cfg = (event.registration_form_config ?? {}) as { fields?: { key?: string; label?: string }[] };
  const label: Record<string, string> = { name: "Name", email: "Email", company: "Organisation", title: "Job title", participant_type: "Type" };
  for (const f of cfg.fields ?? []) if (f?.key && f.label) label[`extra.${f.key}`] = f.label;
  return label;
}

export type { EventLandingConfig };

/**
 * Peserta bawaan untuk pratinjau admin: yang punya kamar (kartu kenangan
 * terlengkap), pertama menurut nama; tanpa kamar, siapa saja.
 */
export async function pesertaContoh(eventId: string): Promise<{ id: string; name: string; company: string | null } | null> {
  const { data: kamar } = await db().from("lodging_assignments").select("participant_id").eq("event_id", eventId).limit(500);
  const punya = [...new Set(((kamar ?? []) as { participant_id: string }[]).map((b) => b.participant_id))];
  for (const calon of [punya, null]) {
    if (calon && !calon.length) continue;
    let kueri = db().from("participants").select("id,name,company").eq("event_id", eventId).is("source_removed_at", null).order("name").limit(1);
    if (calon) kueri = kueri.in("id", calon.slice(0, 200));
    const { data } = await kueri;
    const pilihan = ((data ?? []) as { id: string; name: string; company: string | null }[])[0];
    if (pilihan) return pilihan;
  }
  return null;
}
