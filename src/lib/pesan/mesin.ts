import type { EventRow } from "@/lib/domain";
import { publicEventName } from "@/lib/domain";
import { BATCH_MAX, invitationFrom, sendEmailBatchDetailed, type BatchItem } from "@/lib/email/client";
import { normalizeEmail } from "@/lib/member/account";
import { MASA_UNDANGAN_MS } from "@/lib/member/links";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { allowedByList, claimOrigins, messagingAllowlist, normalizeAddress } from "./alamat";
import { fieldValues, renderEmail, type BlastKind } from "./isi";
import { audienceSchema, resolveAudience, SKIP_REASON } from "./penerima";
import { emailFailure } from "./status";
import { inviteToken, inviteTokenHash, unsubscribeSignature } from "./tautan";
import { INVITATION_COLUMNS, invitationUrl, undanganBelumAda, type InvitationRow } from "@/lib/undangan/data";
import { emailHash, inviteUnsubscribeSignature } from "@/lib/undangan/tanda";

/**
 * Mesin kirim Pesan peserta.
 *
 *   enqueueBlast  Kirim ditekan: penerima dibekukan menjadi baris antrean.
 *   drainQueue    Satu putaran pengirim: klaim potongan, kirim, catat hasil.
 *                 Dipanggil tombol Kirim (lewat `after`), /api/cron/pesan, dan
 *                 Kirim ulang. Siapa pun pemanggilnya, hanya satu putaran yang
 *                 jalan pada satu waktu (take_message_drain_turn).
 *
 * Di luar produksi (daftar uji aktif) pengirim hanya menyentuh kiriman yang
 * baru saja ditekan Kirim di server itu sendiri. Preview memakai database
 * produksi: tanpa batas ini, preview ikut mengirim antrean produksi dengan env
 * preview, ke daftar sungguhan.
 *
 * Keadaan peserta dibaca ulang saat potongan dikirim, bukan hanya saat Kirim
 * ditekan: peserta yang berhenti langganan, emailnya memantul, atau alamatnya
 * berubah sesudah kiriman dijadwalkan dilewati.
 *
 * Lihat migrasi 202610030003 untuk tiga lapis pengaman kiriman ganda.
 */

export type BlastRow = {
  id: string;
  event_id: string;
  title: string;
  kind: BlastKind;
  channel: "email" | "whatsapp" | "keduanya";
  audience: unknown;
  email_subject: string;
  email_body: string;
  status: "draf" | "terjadwal" | "mengirim" | "dijeda" | "selesai" | "dibatalkan";
  scheduled_at: string | null;
  site_origin: string | null;
  /**
   * Asal tautan domain klien, dibekukan saat masuk antrean. Tidak ada di
   * BLAST_COLUMNS: kolomnya baru ada setelah migrasi domain klien, dan memilih
   * kolom yang belum ada mengosongkan seluruh Pesan peserta (temuan QA H2).
   * Pengirim membacanya terpisah.
   */
  link_origin?: string | null;
  /**
   * Mulai pelan (Invitation): sisa penerima ditahan sampai waktu ini, dan
   * alasan bila dijeda otomatis. Sama seperti link_origin, tidak ada di
   * BLAST_COLUMNS supaya Pesan peserta tetap jalan sebelum migrasi
   * 202610040007; dibaca terpisah lewat `invitationBlastState`.
   */
  hold_until?: string | null;
  paused_reason?: string | null;
  sent_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export const BLAST_COLUMNS =
  "id,event_id,title,kind,channel,audience,email_subject,email_body,status,scheduled_at,site_origin,sent_at,finished_at,created_at,updated_at";

type RecipientRow = {
  id: number;
  blast_id: string;
  event_id: string;
  participant_id: string | null;
  /** Tamu undangan (kiriman Invitation). */
  invitation_id: string | null;
  address: string | null;
  name: string;
  chunk: number | null;
};

const EVENT_COLUMNS = "id,slug,name,landing_config,event_date,end_date,start_time,end_time,time_zone,registration_enabled,status";
type EventForMail = Pick<
  EventRow,
  "id" | "slug" | "name" | "landing_config" | "event_date" | "end_date" | "start_time" | "end_time" | "time_zone" | "registration_enabled" | "status"
>;

/**
 * Mulai pelan untuk Invitation (daftar dingin): gelombang pertama ~10%
 * (paling sedikit 25), sisanya ditahan 15 menit lalu dinilai oleh
 * evaluate_invitation_gates dari kabar pantulan dan laporan spam.
 */
const GELOMBANG_MIN = 25;
const GELOMBANG_PORSI = 0.1;
const TAHAN_MS = 15 * 60_000;

export function firstWaveSize(total: number): number {
  return Math.min(total, Math.max(GELOMBANG_MIN, Math.ceil(total * GELOMBANG_PORSI)));
}

/** Masa klaim potongan. Lebih panjang dari maxDuration rute (60 dtk), jadi klaim tidak kedaluwarsa saat pengirimnya masih hidup. */
const LEASE_SECONDS = 120;
/** Masa giliran pengirim, sedikit di atas maxDuration rute. */
const TURN_SECONDS = 70;
/** Jeda antar panggilan Resend: paling banyak 5 per detik, setengah batas tim 10/detik yang juga dipakai email pendaftaran. */
const JEDA_RESEND_MS = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- Antre ---------------------------------------------------------------

export type EnqueueOutcome =
  | { status: "ok"; queued: number; skipped: number }
  | { status: "not_draft" }
  | { status: "empty" };

/**
 * Bekukan penerima menjadi baris antrean dan buat tautan undangannya.
 *
 * Status kiriman dipindah dari `draf` lebih dulu (atomik), jadi dua tekanan
 * Kirim yang serentak hanya diproses sekali. Selama baris disiapkan statusnya
 * `terjadwal` tanpa waktu, yang tidak disentuh penyapu maupun pengirim.
 */
export async function enqueueBlast(
  blastId: string,
  event: EventForMail,
  input: { scheduledAt: string | null; origin: string; linkOrigin: string | null },
): Promise<EnqueueOutcome> {
  const client = getSupabaseServiceClient();
  const { data: dipindah } = await client
    .from("message_blasts")
    .update({ status: "terjadwal", scheduled_at: null, site_origin: input.origin, ...(input.linkOrigin ? { link_origin: input.linkOrigin } : {}), updated_at: new Date().toISOString() } as never)
    .eq("id", blastId)
    .eq("event_id", event.id)
    .eq("status", "draf")
    .select(BLAST_COLUMNS)
    .maybeSingle();
  const blast = dipindah as BlastRow | null;
  if (!blast) return { status: "not_draft" };

  const kembalikan = async () => {
    await client.from("participant_account_tokens").delete().eq("blast_id", blastId).is("used_at", null);
    await client.from("message_blast_recipients").delete().eq("blast_id", blastId);
    await client.from("message_blasts").update({ status: "draf", site_origin: null, ...(input.linkOrigin ? { link_origin: null } : {}) } as never).eq("id", blastId);
  };

  try {
    const audience = audienceSchema.parse(blast.audience ?? {});
    const penerima = await resolveAudience(event, blast.kind, audience);
    const terkirim = penerima.filter((baris) => !baris.skip);
    if (terkirim.length === 0) {
      await kembalikan();
      return { status: "empty" };
    }

    const mulai = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
    if (blast.kind === "undangan") {
      // Tautan undangan hanya untuk peserta yang BELUM punya akun. Pemilik akun
      // sudah punya kata sandi: tautan yang membuat kata sandi baru bagi mereka
      // sama dengan tautan reset 7 hari, dan email yang diteruskan berarti akun
      // diambil alih. Mereka mendapat tautan masuk biasa (lihat drainQueue).
      //
      // Undangan lama TIDAK dicabut di sini, tetapi saat undangan baru benar-benar
      // terkirim (cabutUndanganLama). Jadwal yang dibatalkan atau kiriman yang
      // gagal tidak meninggalkan peserta tanpa tautan yang berlaku.
      const token = terkirim.filter((baris) => !baris.accountId).map((baris) => ({
        event_id: event.id,
        purpose: "undangan",
        token_hash: inviteTokenHash(blastId, baris.participant.id),
        email: normalizeEmail(baris.email ?? ""),
        account_id: baris.accountId,
        participant_id: baris.participant.id,
        expires_at: new Date(mulai.getTime() + MASA_UNDANGAN_MS).toISOString(),
        blast_id: blastId,
      }));
      for (let i = 0; i < token.length; i += 500) {
        const { error } = await client
          .from("participant_account_tokens")
          .upsert(token.slice(i, i + 500) as never, { onConflict: "token_hash", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
    }

    // Mulai pelan hanya di produksi: situs uji mengirim ke daftar uji yang
    // pendek dan tidak punya cron untuk melepas sisanya.
    const pelan = blast.kind === "invitation" && messagingAllowlist().mode === "off" && terkirim.length > GELOMBANG_MIN;
    const gelombang = pelan ? firstWaveSize(terkirim.length) : terkirim.length;

    if (blast.kind === "invitation") {
      let urutTamu = 0;
      const barisTamu = penerima.map((p) => {
        const ke = p.skip ? null : urutTamu++;
        return {
          blast_id: blastId,
          event_id: event.id,
          invitation_id: p.participant.id,
          address: p.email,
          name: p.participant.name,
          status: p.skip ? "dilewati" : ke! < gelombang ? "antre" : "ditahan",
          reason_code: p.skip,
          reason: p.skip ? SKIP_REASON[p.skip] : null,
          // Gelombang pertama dan sisanya tidak berbagi potongan, jadi kunci
          // idempotensi potongan pertama tidak berubah saat sisanya dilepas.
          chunk: ke === null ? null : ke < gelombang ? Math.floor(ke / BATCH_MAX) : Math.ceil(gelombang / BATCH_MAX) + Math.floor((ke - gelombang) / BATCH_MAX),
        };
      });
      for (let i = 0; i < barisTamu.length; i += 500) {
        const { error } = await client.rpc("enqueue_invitation_recipients" as never, { p_rows: barisTamu.slice(i, i + 500) } as never);
        if (error) throw new Error(error.message);
      }
      const tahan = pelan ? { hold_until: new Date(mulai.getTime() + TAHAN_MS).toISOString() } : {};
      await client
        .from("message_blasts")
        .update(
          (input.scheduledAt
            ? { status: "terjadwal", scheduled_at: input.scheduledAt, ...tahan, updated_at: new Date().toISOString() }
            : { status: "mengirim", sent_at: new Date().toISOString(), ...tahan, updated_at: new Date().toISOString() }) as never,
        )
        .eq("id", blastId);
      return { status: "ok", queued: terkirim.length, skipped: penerima.length - terkirim.length };
    }

    let urut = 0;
    const baris = penerima.map((p) => ({
      blast_id: blastId,
      event_id: event.id,
      participant_id: p.participant.id,
      channel: "email",
      address: p.email,
      name: p.participant.name,
      status: p.skip ? "dilewati" : "antre",
      reason_code: p.skip,
      reason: p.skip ? SKIP_REASON[p.skip] : null,
      chunk: p.skip ? null : Math.floor(urut++ / BATCH_MAX),
    }));
    for (let i = 0; i < baris.length; i += 500) {
      const { error } = await client
        .from("message_blast_recipients")
        .upsert(baris.slice(i, i + 500) as never, { onConflict: "blast_id,participant_id,channel", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }

    await client
      .from("message_blasts")
      .update(
        (input.scheduledAt
          ? { status: "terjadwal", scheduled_at: input.scheduledAt, updated_at: new Date().toISOString() }
          : { status: "mengirim", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }) as never,
      )
      .eq("id", blastId);
    return { status: "ok", queued: terkirim.length, skipped: penerima.length - terkirim.length };
  } catch (error) {
    await kembalikan();
    throw error;
  }
}

// ---- Kirim ---------------------------------------------------------------

type PesertaKini = {
  id: string;
  company: string | null;
  email: string | null;
  email_opt_out_at: string | null;
  email_invalid_at: string | null;
  source_removed_at: string | null;
};

const CATATAN_SUDAH_PUNYA_AKUN =
  "Anda sudah punya akun untuk acara ini. Masuk dengan email ini dan kata sandi Anda; bila lupa, minta tautan masuk lewat email di layar masuk.";

/** Alasan baris yang sudah diantre tidak jadi dikirim, dibaca saat potongan berangkat. */
function alasanLewatSekarang(r: RecipientRow, p: PesertaKini | undefined, daftarUji: ReturnType<typeof messagingAllowlist>) {
  if (!p || p.source_removed_at) return { code: "peserta_dihapus", reason: "Peserta sudah dihapus dari daftar" };
  if (p.email_opt_out_at) return { code: "berhenti_email", reason: SKIP_REASON.berhenti_email };
  if (p.email_invalid_at) return { code: "email_memantul", reason: SKIP_REASON.email_memantul };
  if (normalizeAddress(p.email) !== r.address) return { code: "alamat_berubah", reason: "Email peserta berubah sesudah kiriman disusun" };
  if (!r.address || !allowedByList(r.address, daftarUji)) return { code: "di_luar_daftar_uji", reason: SKIP_REASON.di_luar_daftar_uji };
  return null;
}

type TamuKini = Pick<InvitationRow, "id" | "event_id" | "email" | "company" | "link_nonce" | "registered_at" | "rejected_at" | "deleted_at" | "opted_out_at" | "email_invalid_at">;

/** Alasan baris tamu yang sudah diantre tidak jadi dikirim, dibaca saat potongan berangkat. */
function alasanLewatTamu(
  r: RecipientRow,
  u: TamuKini | undefined,
  konteks: { event: EventForMail; emailPeserta: Set<string>; tekan: Map<string, string>; daftarUji: ReturnType<typeof messagingAllowlist> },
) {
  if (!u || u.deleted_at) return { code: "undangan_dihapus", reason: "Tamu sudah dihapus dari daftar undangan" };
  if (u.registered_at || u.rejected_at) return { code: "sudah_daftar", reason: SKIP_REASON.sudah_daftar };
  if (!konteks.event.registration_enabled || !["draft", "active"].includes(konteks.event.status)) {
    return { code: "pendaftaran_ditutup", reason: "Pendaftaran acara sudah ditutup" };
  }
  const ditekan = r.address ? konteks.tekan.get(emailHash(r.address)) : undefined;
  if (u.opted_out_at || ditekan === "berhenti" || ditekan === "spam") return { code: "berhenti_email", reason: SKIP_REASON.berhenti_email };
  if (u.email_invalid_at || ditekan === "memantul") return { code: "email_memantul", reason: SKIP_REASON.email_memantul };
  if (normalizeAddress(u.email) !== r.address) return { code: "alamat_berubah", reason: "Email tamu berubah sesudah kiriman disusun" };
  if (r.address && konteks.emailPeserta.has(r.address)) return { code: "sudah_peserta", reason: SKIP_REASON.sudah_peserta };
  if (!r.address || !allowedByList(r.address, konteks.daftarUji)) return { code: "di_luar_daftar_uji", reason: SKIP_REASON.di_luar_daftar_uji };
  return null;
}

/** Klaim potongan berikutnya dari antrean semua kiriman (produksi). */
/**
 * Klaim potongan email berikutnya dari kiriman berjalan milik `origin` (dan
 * hanya `onlyBlast` bila diisi). Satu jalur untuk semua mode, tanpa bergantung
 * pada balikan PATCH: PostgREST sebelum v14 menyaring ulang baris SETELAH
 * pembaruan, sehingga `status = antre` tidak cocok lagi dan balikan kosong.
 * Pembaruan bersyarat dikirim tanpa balikan dengan cap sewa unik, lalu baris
 * yang benar-benar diambil dibaca ulang lewat cap itu. Pembaruan bersyarat
 * atomik per baris, dan giliran pengirim menjamin tidak ada putaran serentak.
 */
async function klaimPotongan(origin: string, onlyBlast: string | null, ditunda: ReadonlySet<string>): Promise<RecipientRow[]> {
  const client = getSupabaseServiceClient();
  let qb = client.from("message_blasts").select("id").eq("status", "mengirim").in("site_origin", claimOrigins(origin));
  if (onlyBlast) qb = qb.eq("id", onlyBlast);
  const { data: berjalan, error: galatKiriman } = await qb.order("sent_at", { ascending: true, nullsFirst: false }).order("id");
  if (galatKiriman) throw new Error(galatKiriman.message);
  // Antre, atau klaim lama yang kedaluwarsa (pengirimnya mati di tengah jalan).
  const bisaDiklaim = `status.eq.antre,and(status.eq.mengirim,locked_until.lt.${new Date().toISOString()})`;
  for (const { id: blastId } of (berjalan ?? []) as { id: string }[]) {
    if (ditunda.has(blastId)) continue;
    const { data: awal, error: galatAwal } = await client
      .from("message_blast_recipients")
      .select("chunk")
      .eq("blast_id", blastId)
      .eq("channel", "email")
      .or(bisaDiklaim)
      .order("chunk")
      .limit(1)
      .maybeSingle();
    if (galatAwal) throw new Error(galatAwal.message);
    const chunk = (awal as { chunk: number } | null)?.chunk;
    if (chunk == null) continue;
    const cap = capSewa();
    const { error } = await client
      .from("message_blast_recipients")
      .update({ status: "mengirim", locked_until: cap, updated_at: new Date().toISOString() } as never)
      .eq("blast_id", blastId)
      .eq("channel", "email")
      .eq("chunk", chunk)
      .or(bisaDiklaim);
    if (error) throw new Error(error.message);
    const baca = (kolom: string) =>
      client
        .from("message_blast_recipients")
        .select(kolom)
        .eq("blast_id", blastId)
        .eq("chunk", chunk)
        .eq("status", "mengirim")
        .eq("locked_until", cap)
        .order("id");
    let { data, error: galatBaca } = await baca("id,blast_id,event_id,participant_id,invitation_id,address,name,chunk");
    // Sebelum migrasi 202610040007 kolom invitation_id belum ada; kiriman
    // peserta tetap jalan.
    if (galatBaca && undanganBelumAda(galatBaca)) ({ data, error: galatBaca } = await baca("id,blast_id,event_id,participant_id,address,name,chunk"));
    if (galatBaca) throw new Error(galatBaca.message);
    if (data?.length) return (data as unknown as RecipientRow[]).map((r) => ({ ...r, invitation_id: r.invitation_id ?? null }));
  }
  return [];
}

/** Batas sewa dengan mikrodetik acak: cap unik untuk membaca ulang klaim. */
function capSewa(): string {
  const iso = new Date(Date.now() + LEASE_SECONDS * 1000).toISOString();
  const mikro = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `${iso.slice(0, -1)}${mikro}Z`;
}

/**
 * Pengirim situs uji berhenti sebelum kirimannya habis (galat, penyedia
 * menolak, batas waktu). Situs uji tidak punya cron, jadi sisa baris ditutup
 * di sini dengan alasan yang terlihat di laporan: yang masih antre menjadi
 * gagal sementara (bisa dikirim ulang dari situs yang sama), yang sedang
 * dikirim menjadi tidak pasti (mungkin sudah sampai).
 */
async function tutupSisa(blastId: string, pesan: string) {
  const client = getSupabaseServiceClient();
  const alasan = `Pengiriman di situs uji berhenti: ${pesan}`.slice(0, 300);
  const sekarang = new Date().toISOString();
  await client
    .from("message_blast_recipients")
    .update({ status: "gagal_sementara", reason_code: "pengirim_berhenti", reason: alasan, locked_until: null, failed_at: sekarang, updated_at: sekarang } as never)
    .eq("blast_id", blastId)
    .eq("status", "antre");
  await client
    .from("message_blast_recipients")
    .update({ status: "tidak_pasti", reason_code: "pengirim_berhenti", reason: alasan, locked_until: null, failed_at: sekarang, updated_at: sekarang } as never)
    .eq("blast_id", blastId)
    .eq("status", "mengirim");
}

/**
 * Undangan yang benar-benar terkirim mencabut undangan lama orang itu yang
 * belum dipakai: hanya tautan terbaru yang berlaku, jadi email lama yang
 * diteruskan ke orang lain tidak bisa dipakai lagi.
 */
async function cabutUndanganLama(blast: BlastRow, participantIds: string[]) {
  const client = getSupabaseServiceClient();
  const sekarang = new Date().toISOString();
  for (let i = 0; i < participantIds.length; i += 200) {
    await client
      .from("participant_account_tokens")
      .update({ expires_at: sekarang } as never)
      .eq("event_id", blast.event_id)
      .eq("purpose", "undangan")
      .neq("blast_id", blast.id)
      .in("participant_id", participantIds.slice(i, i + 200))
      .is("used_at", null)
      .gt("expires_at", sekarang);
  }
}

export type DrainOutcome = { ran: boolean; chunks: number; sent: number; failed: number; stoppedBy: "empty" | "budget" | "provider" | "not_configured" | "busy" };

type ResultRow = { id: number; status: string; provider_id?: string | null; reason_code?: string | null; reason?: string | null };

/**
 * Satu putaran pengirim, paling lama `budgetMs`. Aman dipanggil berkali-kali
 * dan serentak: yang tidak mendapat giliran langsung pulang.
 */
export async function drainQueue(budgetMs = 45_000, options: { origin: string; onlyBlast?: string }): Promise<DrainOutcome> {
  const client = getSupabaseServiceClient();
  const daftarUji = messagingAllowlist();
  // Setiap pengirim hanya mengambil kiriman dari asal server ini. Di luar
  // produksi juga hanya satu kiriman; tanpa id kiriman, tidak ada yang dikirim.
  const hanya = daftarUji.mode === "off" ? options.onlyBlast ?? null : options.onlyBlast ?? "";
  const situsUji = daftarUji.mode !== "off";
  if (hanya === "") return { ran: false, chunks: 0, sent: 0, failed: 0, stoppedBy: "empty" };
  const { data: giliran } = await client.rpc("take_message_drain_turn" as never, { p_seconds: TURN_SECONDS } as never);
  if (giliran !== true) return { ran: false, chunks: 0, sent: 0, failed: 0, stoppedBy: "busy" };

  const batas = Date.now() + budgetMs;
  let alasanBerhenti = "Waktu pengirim habis.";
  let antreanHabis = false;
  const hasil: DrainOutcome = { ran: true, chunks: 0, sent: 0, failed: 0, stoppedBy: "empty" };
  const kiriman = new Map<string, BlastRow>();
  const acara = new Map<string, EventForMail>();
  // Kiriman yang dilewati di putaran ini (Invitation tanpa pengirim undangan),
  // supaya satu kiriman yang tertahan tidak menghentikan kiriman lain.
  const ditunda = new Set<string>();

  try {
    await client.rpc("sweep_message_recipients" as never);
    // Mulai pelan Invitation: lepas sisa atau jeda. Galat (mis. migrasi
    // 202610040007 belum ada) tidak menghentikan kiriman lain.
    const { error: galatGerbang } = await client.rpc("evaluate_invitation_gates" as never);
    if (galatGerbang && galatGerbang.code !== "PGRST202" && !undanganBelumAda(galatGerbang)) console.error("[pesan] gerbang undangan", galatGerbang.message);
    while (Date.now() < batas) {
      const baris = await klaimPotongan(options.origin, hanya, ditunda);
      if (baris.length === 0) {
        antreanHabis = true;
        break;
      }
      hasil.chunks += 1;

      const blastId = baris[0].blast_id;
      if (!kiriman.has(blastId)) {
        const { data: b } = await client.from("message_blasts").select(BLAST_COLUMNS).eq("id", blastId).single();
        // Terpisah dan boleh gagal: sebelum migrasi domain klien kolom ini
        // belum ada, dan kiriman tetap memakai site_origin.
        const { data: asal } = await client.from("message_blasts").select("link_origin").eq("id", blastId).maybeSingle();
        kiriman.set(blastId, { ...(b as unknown as BlastRow), link_origin: (asal as { link_origin: string | null } | null)?.link_origin ?? null });
      }
      const blast = kiriman.get(blastId)!;
      if (!acara.has(blast.event_id)) {
        const { data: e } = await client.from("events").select(EVENT_COLUMNS).eq("id", blast.event_id).single();
        acara.set(blast.event_id, e as unknown as EventForMail);
      }
      const event = acara.get(blast.event_id)!;

      // Keadaan peserta SAAT INI, bukan saat Kirim ditekan.
      const peserta = new Map<string, PesertaKini>();
      const punyaAkun = new Set<string>();
      const ids = baris.map((r) => r.participant_id).filter((id): id is string => Boolean(id));
      if (ids.length) {
        const [{ data: p, error: galatP }, { data: a, error: galatA }] = await Promise.all([
          client.from("participants").select("id,company,email,email_opt_out_at,email_invalid_at,source_removed_at").in("id", ids),
          client.from("participant_accounts").select("participant_id").eq("event_id", blast.event_id).in("participant_id", ids),
        ]);
        if (galatP || galatA) throw new Error((galatP ?? galatA)!.message);
        for (const row of (p ?? []) as PesertaKini[]) peserta.set(row.id, row);
        for (const row of (a ?? []) as { participant_id: string }[]) punyaAkun.add(row.participant_id);
      }

      // Tamu undangan SAAT INI: undangan, email peserta aktif, dan penekanan.
      const tamu = new Map<string, TamuKini>();
      const emailPeserta = new Set<string>();
      const tekan = new Map<string, string>();
      const idsTamu = baris.map((r) => r.invitation_id).filter((id): id is string => Boolean(id));
      if (idsTamu.length) {
        const alamat = baris.map((r) => r.address).filter((a): a is string => Boolean(a));
        const [{ data: u, error: galatU }, { data: ps, error: galatPs }, { data: t, error: galatT }] = await Promise.all([
          client.from("event_invitations").select(INVITATION_COLUMNS).in("id", idsTamu),
          client.from("participants").select("email").eq("event_id", blast.event_id).is("source_removed_at", null).in("email", alamat),
          client.from("event_email_suppressions").select("email_hash,reason").eq("event_id", blast.event_id).in("email_hash", alamat.map((a) => emailHash(a))),
        ]);
        if (galatU || galatPs || galatT) throw new Error((galatU ?? galatPs ?? galatT)!.message);
        for (const row of (u ?? []) as InvitationRow[]) tamu.set(row.id, row);
        for (const row of (ps ?? []) as { email: string | null }[]) {
          const a = normalizeAddress(row.email);
          if (a) emailPeserta.add(a);
        }
        for (const row of (t ?? []) as { email_hash: string; reason: string }[]) tekan.set(row.email_hash, row.reason);
      }
      const pengirimUndangan = blast.kind === "invitation" ? invitationFrom() : null;

      const lewati: ResultRow[] = [];
      const kirimKe = baris.filter((r) => {
        const alasan = r.invitation_id
          ? alasanLewatTamu(r, tamu.get(r.invitation_id), { event, emailPeserta, tekan, daftarUji })
          : alasanLewatSekarang(r, r.participant_id ? peserta.get(r.participant_id) : undefined, daftarUji);
        if (alasan) lewati.push({ id: r.id, status: "dilewati", reason_code: alasan.code, reason: alasan.reason });
        return !alasan;
      });
      if (lewati.length) {
        const { error: galatLewat } = await client.rpc("record_message_results" as never, { p_rows: lewati } as never);
        if (galatLewat) throw new Error(galatLewat.message);
      }
      if (kirimKe.length === 0) continue;

      // Tautan memakai asal yang dibekukan saat antre (temuan QA M4); site_origin
      // hanya kunci klaim produksi/preview. Kiriman lama tanpa link_origin
      // memakai site_origin seperti sebelumnya.
      const origin = blast.link_origin ?? blast.site_origin ?? "";
      const slug = encodeURIComponent(event.slug);
      const nama = publicEventName(event);
      const items: BatchItem[] = kirimKe.map((r) => {
        if (r.invitation_id) {
          const u = tamu.get(r.invitation_id)!;
          const berhentiTamu = `${origin}/api/pesan/berhenti?e=${event.id}&u=${u.id}&s=${inviteUnsubscribeSignature(event.id, u.id)}`;
          const isiTamu = renderEmail({
            kind: "invitation",
            subject: blast.email_subject,
            body: blast.email_body,
            eventName: nama,
            values: fieldValues(event, { name: r.name, company: u.company }),
            actionUrl: invitationUrl(origin, event.slug, u),
            unsubscribeUrl: berhentiTamu,
          });
          return {
            to: r.address ?? "",
            ...isiTamu,
            headers: { "List-Unsubscribe": `<${berhentiTamu}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          };
        }
        const pid = r.participant_id ?? "";
        const akun = punyaAkun.has(pid);
        const actionUrl =
          blast.kind !== "undangan" ? `${origin}/e/${slug}` : akun ? `${origin}/e/${slug}/masuk` : `${origin}/e/${slug}/masuk?sandi=${inviteToken(blast.id, pid)}`;
        const berhenti = `${origin}/api/pesan/berhenti?e=${event.id}&p=${pid}&s=${unsubscribeSignature(event.id, pid)}`;
        const isi = renderEmail({
          kind: blast.kind,
          subject: blast.email_subject,
          body: blast.email_body,
          eventName: nama,
          values: fieldValues(event, { name: r.name, company: peserta.get(pid)?.company ?? null }),
          actionUrl,
          unsubscribeUrl: berhenti,
          note: blast.kind === "undangan" && akun ? CATATAN_SUDAH_PUNYA_AKUN : null,
        });
        return {
          to: r.address ?? "",
          ...isi,
          headers: { "List-Unsubscribe": `<${berhenti}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        };
      });

      // Invitation hanya berangkat dari pengirim undangan yang terpisah. Bila
      // env-nya hilang setelah Kirim, diperlakukan sebagai belum diatur: baris
      // kembali ke antrean, tidak dikirim dari EMAIL_FROM biasa.
      const kirim =
        blast.kind === "invitation" && !pengirimUndangan
          ? ({ kind: "not_configured" } as const)
          : await sendEmailBatchDetailed(items, `tally:${blast.id}:email:${baris[0].chunk}`, blast.event_id, pengirimUndangan);

      if (kirim.kind === "not_configured" && blast.kind === "invitation" && !situsUji) {
        // Hanya kiriman ini yang menunggu EMAIL_FROM_UNDANGAN; laporan
        // menampilkannya sebagai tertahan. Kiriman lain tetap berjalan. Situs
        // uji hanya punya satu kiriman dan tanpa cron, jadi tetap ditutup di
        // bawah seperti sebelumnya.
        await client.rpc("record_message_results" as never, {
          p_rows: kirimKe.map((r) => ({ id: r.id, status: "antre" })) satisfies ResultRow[],
        } as never);
        ditunda.add(blast.id);
        console.warn("[pesan] Invitation menunggu EMAIL_FROM_UNDANGAN", blast.id);
        continue;
      }
      if (kirim.kind === "not_configured" || (kirim.kind === "failed" && kirim.retryable)) {
        // Dikembalikan ke antrean dengan kunci yang sama. Bila penyedia sebenarnya
        // sudah menerima potongan ini, percobaan berikutnya dijawab dari kunci
        // idempotensi tanpa mengirim lagi.
        await client.rpc("record_message_results" as never, {
          p_rows: kirimKe.map((r) => ({ id: r.id, status: "antre" })) satisfies ResultRow[],
        } as never);
        hasil.stoppedBy = kirim.kind === "not_configured" ? "not_configured" : "provider";
        alasanBerhenti = kirim.kind === "not_configured" ? "Pengirim email belum diatur." : "Penyedia email menolak sementara. Coba kirim ulang nanti.";
        break;
      }

      const catatan: ResultRow[] =
        kirim.kind === "failed"
          ? kirimKe.map((r) => ({ id: r.id, ...emailFailure(kirim.error, kirim.status) }))
          : kirimKe.map((r, i) => {
              const item = kirim.items[i];
              return item.ok
                ? { id: r.id, status: "terkirim", provider_id: item.id }
                : { id: r.id, ...emailFailure(item.error, item.permanent ? 422 : null) };
            });
      const { error: galatCatat } = await client.rpc("record_message_results" as never, { p_rows: catatan } as never);
      if (galatCatat) throw new Error(galatCatat.message);
      if (blast.kind === "undangan") {
        const sampai = kirimKe.filter((r, i) => catatan[i].status === "terkirim" && r.participant_id).map((r) => r.participant_id!);
        await cabutUndanganLama(blast, sampai);
      }
      hasil.sent += catatan.filter((c) => c.status === "terkirim").length;
      hasil.failed += catatan.filter((c) => c.status !== "terkirim").length;

      if (Date.now() + JEDA_RESEND_MS >= batas) {
        hasil.stoppedBy = "budget";
        break;
      }
      await sleep(JEDA_RESEND_MS);
    }
    if (Date.now() >= batas && hasil.stoppedBy === "empty") hasil.stoppedBy = "budget";
    return hasil;
  } catch (error) {
    alasanBerhenti = error instanceof Error ? error.message : String(error);
    console.error("[pesan] drain gagal", hanya ?? options.origin, alasanBerhenti);
    throw error;
  } finally {
    // Situs uji tidak punya cron: apa pun yang tersisa ditutup, pada setiap
    // jalan keluar, lalu disapu supaya kiriman tidak tertahan "Sedang dikirim".
    if (situsUji && hanya && !antreanHabis) await tutupSisa(hanya, alasanBerhenti).catch(() => undefined);
    await client.rpc("sweep_message_recipients" as never);
    await client.rpc("release_message_drain_turn" as never);
  }
}
