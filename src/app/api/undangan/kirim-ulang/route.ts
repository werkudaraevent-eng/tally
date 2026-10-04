import { after } from "next/server";
import { z } from "zod";
import { apiErrorPeserta } from "@/lib/api";
import { getPublicRequestEvent } from "@/lib/auth/request-event";
import { linkOrigin } from "@/lib/domain-klien/asal";
import { rateCount, requestIp, resendInvitation } from "@/lib/undangan/publik";

/**
 * "Kirim ulang undangan" di halaman Khusus undangan.
 *
 * Jawabannya SELALU sama dan langsung, untuk email yang diundang maupun yang
 * tidak: pencarian dan pengiriman berjalan di latar belakang (`after`), supaya
 * daftar tamu tidak bisa ditebak dari isi atau lamanya jawaban. Satu-satunya
 * jawaban lain adalah batas per IP (sekitar 20 per jam), yang tidak bergantung
 * pada alamatnya.
 */

const schema = z.object({ email: z.string().trim().max(200) });
const PER_IP_PER_JAM = 20;

export async function POST(request: Request) {
  const event = await getPublicRequestEvent(request);
  if (!event) return apiErrorPeserta("VALIDATION_ERROR", 404, { message: "Acara tidak ditemukan." });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.email) return apiErrorPeserta("VALIDATION_ERROR", 422, { email: "Isi email Anda." });
  const ip = requestIp(request.headers);
  if (ip && (await rateCount(event.id, "kirim_ulang", { ip }, 3_600_000)) >= PER_IP_PER_JAM) {
    return apiErrorPeserta("VALIDATION_ERROR", 429, { message: "Terlalu banyak permintaan dari perangkat ini. Coba lagi dalam satu jam, atau hubungi panitia." });
  }
  const origin = await linkOrigin(request, event.id);
  after(() => resendInvitation(event, parsed.data.email, origin, ip).catch((galat) => console.error("[undangan] kirim ulang", galat)));
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
