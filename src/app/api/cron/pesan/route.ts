import { timingSafeEqual } from "node:crypto";
import { apiError } from "@/lib/api";
import { messagingAllowlist } from "@/lib/pesan/alamat";
import { drainQueue } from "@/lib/pesan/mesin";

/**
 * Pengirim Pesan peserta yang dijadwalkan: pg_cron memanggilnya tiap menit
 * lewat pg_net, hanya bila ada kiriman berjalan atau jadwal yang tiba
 * (migrasi 202610030003). Cadangan bila pg_net bermasalah: cron-job.org dengan
 * header Authorization yang sama, seperti sync peserta.
 *
 * Hanya produksi yang mengosongkan antrean bersama. Preview memakai database
 * produksi, jadi pengirim preview yang dipanggil cron akan mengirim antrean
 * produksi dengan env preview; di luar produksi rute ini selalu 403.
 */

export const maxDuration = 60;

function rahasiaCocok(request: Request) {
  const rahasia = process.env.CRON_SECRET;
  const diberikan = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!rahasia || diberikan.length !== rahasia.length) return false;
  return timingSafeEqual(Buffer.from(diberikan), Buffer.from(rahasia));
}

export async function POST(request: Request) {
  if (messagingAllowlist().mode !== "off") return apiError("FORBIDDEN", 403);
  if (!rahasiaCocok(request)) return apiError("FORBIDDEN", 403);
  const hasil = await drainQueue(45_000);
  return Response.json(hasil);
}
