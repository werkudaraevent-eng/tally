import type { EventRow, LandingMemberConfig } from "@/lib/domain";
import type { MemberSession } from "@/lib/member/account";
import { bolehPantau } from "@/lib/member/akses-panitia";
import { tanggalDiZona } from "@/lib/checkpoint/waktu";
import { normalizeTimeZone } from "@/lib/timezone";

/**
 * Kartu "Pantau kehadiran" dan halaman Kehadiran tampil untuk sesi ini?
 * Aturannya di lib/member/akses-panitia.ts; API memeriksanya lagi di setiap
 * permintaan. Pratinjau admin tidak: datanya dibaca dengan sesi peserta.
 */
export function panitiaDiPortal(event: Pick<EventRow, "event_date" | "end_date" | "time_zone">, member: LandingMemberConfig, sesi: MemberSession, pratinjau = false): boolean {
  if (pratinjau || !sesi.participant) return false;
  return bolehPantau(member, sesi.participant, event, tanggalDiZona(new Date(), normalizeTimeZone(event.time_zone))) !== null;
}
