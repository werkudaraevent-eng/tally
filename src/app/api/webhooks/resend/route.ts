import { createHmac, timingSafeEqual } from "node:crypto";
import { apiError } from "@/lib/api";
import { resendEvent } from "@/lib/pesan/status";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Webhook Resend: status kiriman email Pesan peserta (diterima, memantul,
 * dilaporkan spam).
 *
 * Tanda tangan diperiksa dengan skema Svix yang dipakai Resend: HMAC-SHA256
 * atas `${svix-id}.${svix-timestamp}.${isi}` dengan rahasia `whsec_...`
 * (RESEND_WEBHOOK_SECRET). Peristiwa yang lebih tua dari 5 menit ditolak
 * supaya kiriman ulang dari luar tidak bisa memundurkan status.
 *
 * Email yang bukan milik Pesan peserta (kode peserta, tautan masuk) juga
 * dilaporkan Resend ke sini; id-nya tidak ada di tabel, jadi tidak ada yang
 * berubah.
 */

const TOLERANSI_DETIK = 5 * 60;

function tandaTanganSah(rahasia: string, id: string, waktu: string, isi: string, tanda: string) {
  const kunci = Buffer.from(rahasia.replace(/^whsec_/, ""), "base64");
  const harapan = createHmac("sha256", kunci).update(`${id}.${waktu}.${isi}`).digest();
  return tanda.split(" ").some((bagian) => {
    const [versi, nilai] = bagian.split(",");
    if (versi !== "v1" || !nilai) return false;
    const diberikan = Buffer.from(nilai, "base64");
    return diberikan.length === harapan.length && timingSafeEqual(diberikan, harapan);
  });
}

export async function POST(request: Request) {
  const rahasia = process.env.RESEND_WEBHOOK_SECRET;
  if (!rahasia) return apiError("FORBIDDEN", 403);
  const id = request.headers.get("svix-id") ?? "";
  const waktu = request.headers.get("svix-timestamp") ?? "";
  const tanda = request.headers.get("svix-signature") ?? "";
  const isi = await request.text();
  if (!id || !waktu || !tanda || !tandaTanganSah(rahasia, id, waktu, isi, tanda)) return apiError("FORBIDDEN", 403);
  if (Math.abs(Date.now() / 1000 - Number(waktu)) > TOLERANSI_DETIK) return apiError("FORBIDDEN", 403);

  const peristiwa = JSON.parse(isi) as { type?: string; created_at?: string; data?: { email_id?: string; bounce?: { type?: string; message?: string } } };
  const emailId = peristiwa.data?.email_id;
  const status = peristiwa.type ? resendEvent(peristiwa.type, peristiwa.data ?? null) : null;
  if (!emailId || !status) return Response.json({ ok: true, ignored: true });

  const client = getSupabaseServiceClient();
  const { data } = await client.rpc("apply_message_event" as never, {
    p_provider_id: emailId,
    p_status: status.status,
    p_reason_code: status.reason_code,
    p_reason: status.reason,
    p_at: peristiwa.created_at ?? new Date().toISOString(),
  } as never);

  // Akibat ke kiriman berikutnya: alamat yang memantul permanen dan laporan
  // spam membuat peserta itu dilewati, sampai alamatnya diubah panitia.
  const baris = (data ?? []) as { participant_id: string | null }[];
  const pesertaIds = baris.map((b) => b.participant_id).filter((v): v is string => Boolean(v));
  if (pesertaIds.length && (status.reason_code === "bounce" || status.reason_code === "suppressed")) {
    await client.from("participants").update({ email_invalid_at: new Date().toISOString() } as never).in("id", pesertaIds).is("email_invalid_at", null);
  }
  if (pesertaIds.length && status.reason_code === "complained") {
    await client.from("participants").update({ email_opt_out_at: new Date().toISOString() } as never).in("id", pesertaIds).is("email_opt_out_at", null);
  }
  return Response.json({ ok: true });
}
