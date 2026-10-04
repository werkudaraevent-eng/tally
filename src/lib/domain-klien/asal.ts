import { messagingAllowlist } from "@/lib/pesan/alamat";
import { fixedSiteOrigin } from "./situs";
import { domainMap } from "./simpan";

/** https://<domain klien> bila acara ini berdomain AKTIF (produksi saja), selain itu null. */
async function activeClientOrigin(eventId: string): Promise<string | null> {
  if (messagingAllowlist().mode !== "off") return null;
  const domain = (await domainMap()).byEvent.get(eventId);
  return domain?.status === "aktif" ? `https://${domain.domain}` : null;
}

/**
 * Asal (https://host) untuk tautan yang dikirim ke peserta: email
 * pendaftaran, tautan masuk, undangan, pengumuman, berhenti berlangganan.
 *
 * - Produksi, acara berdomain klien AKTIF: https://<domain klien>.
 * - Produksi dengan TALLY_SITE_URL: alamat itu, supaya tautan tidak
 *   berbeda-beda menurut alamat tempat tombol ditekan.
 * - Selain itu (TALLY_SITE_URL belum diisi, preview, lokal): origin
 *   permintaan, persis seperti sebelum fitur ini ada (temuan QA M3).
 *
 * Path-nya tetap `/e/<slug>/...`; host klien melayani path yang sama.
 */
export async function linkOrigin(request: Request, eventId: string): Promise<string> {
  const asalPermintaan = new URL(request.url).origin;
  if (messagingAllowlist().mode !== "off") return asalPermintaan;
  return (await activeClientOrigin(eventId)) ?? fixedSiteOrigin() ?? asalPermintaan;
}

/**
 * Asal tautan Pesan peserta yang dibekukan saat masuk antrean
 * (message_blasts.link_origin). Null = tanpa domain klien aktif: pengirim
 * memakai site_origin seperti sebelumnya, dan kolomnya tidak ditulis sama
 * sekali, jadi Kirim tetap jalan sebelum migrasi dijalankan (temuan QA H2).
 */
export async function blastLinkOrigin(eventId: string): Promise<string | null> {
  return activeClientOrigin(eventId);
}
