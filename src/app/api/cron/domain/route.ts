import { timingSafeEqual } from "node:crypto";
import { apiError } from "@/lib/api";
import { checkAndStore, type DomainRow } from "@/lib/domain-klien/simpan";
import { domainReadiness } from "@/lib/domain-klien/situs";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Pemeriksa domain klien: pg_cron memanggilnya tiap 5 menit lewat pg_net
 * (migrasi 202610040001), hanya bila ada domain menunggu atau aktif.
 *
 * - menunggu (maks 72 jam sejak didaftarkan): setiap panggilan, supaya "Aktif"
 *   tidak menunggu admin membuka Pengaturan (temuan QA H3).
 * - aktif/bermasalah: paling cepat tiap 30 menit, supaya domain yang rusak
 *   ketahuan dan tautan email kembali ke alamat Tally.
 */

export const maxDuration = 60;

const MENIT = 60_000;

function rahasiaCocok(request: Request) {
  const rahasia = process.env.CRON_SECRET;
  const diberikan = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!rahasia || diberikan.length !== rahasia.length) return false;
  return timingSafeEqual(Buffer.from(diberikan), Buffer.from(rahasia));
}

export async function POST(request: Request) {
  const kesiapan = domainReadiness();
  if (!kesiapan.ready) return apiError("FORBIDDEN", 403);
  if (!rahasiaCocok(request)) return apiError("FORBIDDEN", 403);

  const { data, error } = await getSupabaseServiceClient().from("event_domains").select("*").neq("status", "dilepas");
  if (error) return apiError("INTERNAL_ERROR", 500);
  const sekarang = Date.now();
  const giliran = ((data ?? []) as DomainRow[]).filter((row) => {
    const terakhir = row.last_checked_at ? new Date(row.last_checked_at).getTime() : 0;
    if (row.status === "menunggu") return sekarang - new Date(row.created_at).getTime() < 72 * 60 * MENIT && sekarang - terakhir > 4 * MENIT;
    return sekarang - terakhir > 29 * MENIT;
  });

  const hasil: { domain: string; status: string }[] = [];
  const batas = sekarang + 45_000;
  for (const row of giliran) {
    if (Date.now() > batas) break;
    const baru = await checkAndStore(kesiapan, row, null).catch(() => row);
    hasil.push({ domain: baru.domain, status: baru.status });
  }
  return Response.json({ checked: hasil.length, results: hasil });
}
