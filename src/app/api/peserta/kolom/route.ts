import { z } from "zod";
import { memberError, outcomeResponse, requireMemberEvent } from "@/lib/member/api";
import { caraMasuk, masukDenganKolom } from "@/lib/member/masuk-lain";
import { ipKlien } from "@/lib/ip-klien";

/**
 * Masuk dengan dua kolom data peserta (cara masuk Participant fields). Hanya
 * bila acaranya memakai cara ini: cara paling lemah tidak boleh terbuka di
 * acara yang memilih cara lain.
 */
const schema = z.object({ nilai: z.tuple([z.string().trim().min(1).max(200), z.string().trim().min(1).max(200)]) });

export async function POST(request: Request) {
  const resolved = await requireMemberEvent(request);
  if (resolved.response) return resolved.response;
  if (caraMasuk(resolved.member) !== "fields") return memberError("METHOD_OFF", 404, "Cara masuk ini tidak dipakai acara ini. Muat ulang halaman.");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return memberError("VALIDATION_ERROR", 400, "Isi kedua kolom.");

  const ip = ipKlien(request.headers);
  const outcome = await masukDenganKolom(resolved.event, resolved.member, { nilai: parsed.data.nilai, ip });
  if (outcome.status === "rate_limited") {
    return memberError("RATE_LIMITED", 429, `Terlalu banyak percobaan. Coba lagi dalam ${Math.max(1, Math.ceil(outcome.retryAfterSeconds / 60))} menit.`, { retry_after_seconds: outcome.retryAfterSeconds });
  }
  return outcomeResponse(outcome, "Data tidak cocok dengan peserta mana pun. Periksa lagi, atau hubungi panitia.");
}
