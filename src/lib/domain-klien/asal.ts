import { messagingAllowlist } from "@/lib/pesan/alamat";
import { productionSiteOrigin } from "./situs";
import { domainMap } from "./simpan";

/**
 * Asal (https://host) untuk SEMUA tautan yang dikirim ke peserta: email
 * pendaftaran, tautan masuk, undangan, pengumuman, Pesan peserta (email dan
 * WhatsApp), berhenti berlangganan.
 *
 * - Produksi, acara berdomain klien AKTIF: https://<domain klien>.
 * - Produksi lainnya: TALLY_SITE_URL (lalu domain produksi Vercel).
 * - Preview dan lokal: origin permintaan, supaya tautan uji tidak menunjuk ke
 *   produksi (dan domain klien tidak pernah muncul di kiriman preview).
 *
 * Path-nya tetap `/e/<slug>/...`; host klien melayani path yang sama.
 * Pengganti `new URL(request.url).origin` di pembuat email: yang lama mengikuti
 * alamat tempat tombol ditekan, sehingga tautan berbeda-beda per admin.
 */
export async function linkOrigin(request: Request, eventId: string): Promise<string> {
  if (messagingAllowlist().mode !== "off") return new URL(request.url).origin;
  const domain = (await domainMap()).byEvent.get(eventId);
  if (domain?.status === "aktif") return `https://${domain.domain}`;
  return productionSiteOrigin() ?? new URL(request.url).origin;
}
