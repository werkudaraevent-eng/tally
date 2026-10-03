import type { EventRow } from "@/lib/domain";
import { publicEventName } from "@/lib/domain";
import { BATCH_MAX, sendEmailBatchDetailed, type BatchItem } from "@/lib/email/client";
import { normalizeEmail } from "@/lib/member/account";
import { MASA_UNDANGAN_MS } from "@/lib/member/links";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { fieldValues, renderEmail, type BlastKind } from "./isi";
import { audienceSchema, resolveAudience, SKIP_REASON } from "./penerima";
import { emailFailure } from "./status";
import { inviteToken, inviteTokenHash, unsubscribeSignature } from "./tautan";

/**
 * Mesin kirim Pesan peserta.
 *
 *   enqueueBlast  Kirim ditekan: penerima dibekukan menjadi baris antrean.
 *   drainQueue    Satu putaran pengirim: klaim potongan, kirim, catat hasil.
 *                 Dipanggil tombol Kirim (lewat `after`), /api/cron/pesan, dan
 *                 Kirim ulang. Siapa pun pemanggilnya, hanya satu putaran yang
 *                 jalan pada satu waktu (take_message_drain_turn).
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
  status: "draf" | "terjadwal" | "mengirim" | "selesai" | "dibatalkan";
  scheduled_at: string | null;
  site_origin: string | null;
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
  address: string | null;
  name: string;
  chunk: number | null;
};

const EVENT_COLUMNS = "id,slug,name,landing_config,event_date,end_date,start_time,end_time,time_zone";
type EventForMail = Pick<EventRow, "id" | "slug" | "name" | "landing_config" | "event_date" | "end_date" | "start_time" | "end_time" | "time_zone">;

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
  input: { scheduledAt: string | null; origin: string },
): Promise<EnqueueOutcome> {
  const client = getSupabaseServiceClient();
  const { data: dipindah } = await client
    .from("message_blasts")
    .update({ status: "terjadwal", scheduled_at: null, site_origin: input.origin, updated_at: new Date().toISOString() } as never)
    .eq("id", blastId)
    .eq("event_id", event.id)
    .eq("status", "draf")
    .select(BLAST_COLUMNS)
    .maybeSingle();
  const blast = dipindah as BlastRow | null;
  if (!blast) return { status: "not_draft" };

  const kembalikan = async () => {
    await client.from("message_blast_recipients").delete().eq("blast_id", blastId);
    await client.from("message_blasts").update({ status: "draf", site_origin: null } as never).eq("id", blastId);
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
      const ids = terkirim.map((baris) => baris.participant.id);
      // Undangan baru mencabut undangan lama yang belum dipakai: hanya tautan
      // terbaru yang berlaku, jadi email lama yang diteruskan ke orang lain
      // tidak bisa dipakai lagi.
      for (let i = 0; i < ids.length; i += 200) {
        await client
          .from("participant_account_tokens")
          .update({ expires_at: new Date().toISOString() } as never)
          .eq("event_id", event.id)
          .eq("purpose", "undangan")
          .in("participant_id", ids.slice(i, i + 200))
          .is("used_at", null)
          .gt("expires_at", new Date().toISOString());
      }
      const token = terkirim.map((baris) => ({
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

export type DrainOutcome = { ran: boolean; chunks: number; sent: number; failed: number; stoppedBy: "empty" | "budget" | "provider" | "not_configured" | "busy" };

type ResultRow = { id: number; status: string; provider_id?: string | null; reason_code?: string | null; reason?: string | null };

/**
 * Satu putaran pengirim, paling lama `budgetMs`. Aman dipanggil berkali-kali
 * dan serentak: yang tidak mendapat giliran langsung pulang.
 */
export async function drainQueue(budgetMs = 45_000): Promise<DrainOutcome> {
  const client = getSupabaseServiceClient();
  const { data: giliran } = await client.rpc("take_message_drain_turn" as never, { p_seconds: TURN_SECONDS } as never);
  if (giliran !== true) return { ran: false, chunks: 0, sent: 0, failed: 0, stoppedBy: "busy" };

  const batas = Date.now() + budgetMs;
  const hasil: DrainOutcome = { ran: true, chunks: 0, sent: 0, failed: 0, stoppedBy: "empty" };
  const kiriman = new Map<string, BlastRow>();
  const acara = new Map<string, EventForMail>();

  try {
    await client.rpc("sweep_message_recipients" as never);
    while (Date.now() < batas) {
      const { data, error } = await client.rpc("claim_email_chunk" as never, { p_lease_seconds: LEASE_SECONDS } as never);
      if (error) throw new Error(error.message);
      const baris = (data ?? []) as RecipientRow[];
      if (baris.length === 0) break;
      hasil.chunks += 1;

      const blastId = baris[0].blast_id;
      if (!kiriman.has(blastId)) {
        const { data: b } = await client.from("message_blasts").select(BLAST_COLUMNS).eq("id", blastId).single();
        kiriman.set(blastId, b as unknown as BlastRow);
      }
      const blast = kiriman.get(blastId)!;
      if (!acara.has(blast.event_id)) {
        const { data: e } = await client.from("events").select(EVENT_COLUMNS).eq("id", blast.event_id).single();
        acara.set(blast.event_id, e as unknown as EventForMail);
      }
      const event = acara.get(blast.event_id)!;

      const perusahaan = new Map<string, string | null>();
      const ids = baris.map((r) => r.participant_id).filter((id): id is string => Boolean(id));
      if (ids.length) {
        const { data: p } = await client.from("participants").select("id,company").in("id", ids);
        for (const row of (p ?? []) as { id: string; company: string | null }[]) perusahaan.set(row.id, row.company);
      }

      const origin = blast.site_origin ?? "";
      const slug = encodeURIComponent(event.slug);
      const nama = publicEventName(event);
      const items: BatchItem[] = baris.map((r) => {
        const pid = r.participant_id ?? "";
        const actionUrl = blast.kind === "undangan" ? `${origin}/e/${slug}/masuk?sandi=${inviteToken(blast.id, pid)}` : `${origin}/e/${slug}`;
        const berhenti = `${origin}/api/pesan/berhenti?e=${event.id}&p=${pid}&s=${unsubscribeSignature(event.id, pid)}`;
        const isi = renderEmail({
          kind: blast.kind,
          subject: blast.email_subject,
          body: blast.email_body,
          eventName: nama,
          values: fieldValues(event, { name: r.name, company: perusahaan.get(pid) ?? null }),
          actionUrl,
          unsubscribeUrl: berhenti,
        });
        return {
          to: r.address ?? "",
          ...isi,
          headers: { "List-Unsubscribe": `<${berhenti}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        };
      });

      const kirim = await sendEmailBatchDetailed(items, `tally:${blast.id}:email:${baris[0].chunk}`);

      if (kirim.kind === "not_configured" || (kirim.kind === "failed" && kirim.retryable)) {
        // Dikembalikan ke antrean dengan kunci yang sama. Bila penyedia sebenarnya
        // sudah menerima potongan ini, percobaan berikutnya dijawab dari kunci
        // idempotensi tanpa mengirim lagi.
        await client.rpc("record_message_results" as never, {
          p_rows: baris.map((r) => ({ id: r.id, status: "antre" })) satisfies ResultRow[],
        } as never);
        hasil.stoppedBy = kirim.kind === "not_configured" ? "not_configured" : "provider";
        break;
      }

      const catatan: ResultRow[] =
        kirim.kind === "failed"
          ? baris.map((r) => ({ id: r.id, ...emailFailure(kirim.error, kirim.status) }))
          : baris.map((r, i) => {
              const item = kirim.items[i];
              return item.ok
                ? { id: r.id, status: "terkirim", provider_id: item.id }
                : { id: r.id, ...emailFailure(item.error, item.permanent ? 422 : null) };
            });
      const { error: galatCatat } = await client.rpc("record_message_results" as never, { p_rows: catatan } as never);
      if (galatCatat) throw new Error(galatCatat.message);
      hasil.sent += catatan.filter((c) => c.status === "terkirim").length;
      hasil.failed += catatan.filter((c) => c.status !== "terkirim").length;

      if (Date.now() + JEDA_RESEND_MS >= batas) {
        hasil.stoppedBy = "budget";
        break;
      }
      await sleep(JEDA_RESEND_MS);
    }
    if (Date.now() >= batas && hasil.stoppedBy === "empty") hasil.stoppedBy = "budget";
    await client.rpc("sweep_message_recipients" as never);
    return hasil;
  } finally {
    await client.rpc("release_message_drain_turn" as never);
  }
}
