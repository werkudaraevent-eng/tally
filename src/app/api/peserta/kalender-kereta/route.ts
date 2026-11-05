import { icsTiketKereta } from "@/lib/kalender-ics";
import { KATA_MODA } from "@/lib/logistik/moda";
import { bagianTampil } from "@/lib/logistik/bagian-tampil";
import { getMemberSession } from "@/lib/member/account";
import { memberError, requireMemberEvent } from "@/lib/member/api";
import { loadMemberLogistics } from "@/lib/logistik/peserta";
import { landingDefaultLang } from "@/lib/landing-i18n";
import { publicEventName, type EventLandingConfig } from "@/lib/domain";
import { normalizeTimeZone, timeZoneOffset } from "@/lib/timezone";

/**
 * Berkas kalender satu tiket kereta peserta (E-07), dari tombol "Simpan ke
 * kalender" di halaman Perjalanan: `/e/<slug>/api/peserta/kalender-kereta?arah=outbound`.
 * Pengingatnya berbunyi dua jam sebelum berangkat, juga tanpa sinyal.
 *
 * Hanya tiket milik peserta yang sedang masuk, dan hanya bila panitia
 * membagikan tiket kereta (Participant area > Logistics), sama dengan halaman Perjalanan.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const resolved = await requireMemberEvent(request);
  if (resolved.response) return resolved.response;
  const { event, member } = resolved;
  const sesi = await getMemberSession(event);
  if (!sesi) return memberError("UNAUTHORIZED", 401, "Masuk dulu ke Dashboard saya.");
  if (!sesi.participant || !bagianTampil(member, "trains")) return memberError("NOT_FOUND", 404, "Tiket kereta tidak ditemukan.");
  const arah = new URL(request.url).searchParams.get("arah");
  if (arah !== "outbound" && arah !== "return") return memberError("VALIDATION_ERROR", 400, "Arah tiket tidak dikenal.");

  // Transit: ?segmen=2 dan seterusnya; tanpa parameter = segmen 1 (tautan lama).
  const segmen = Number(new URL(request.url).searchParams.get("segmen") ?? "1");
  if (!Number.isInteger(segmen) || segmen < 1 || segmen > 6) return memberError("VALIDATION_ERROR", 400, "Segmen tiket tidak dikenal.");

  const logistik = await loadMemberLogistics(event.id, sesi.participant.id, true);
  const tiket = logistik?.trains.find((item) => item.direction === arah && item.segment === segmen);
  const bahasa = new URL(request.url).searchParams.get("bahasa") === "en" ? "en" : landingDefaultLang(event.landing_config as EventLandingConfig | null);
  const isi =
    tiket?.depart_date && tiket.depart_time
      ? icsTiketKereta({
          uid: `${event.id}-${sesi.participant.id}-${arah}${segmen > 1 ? `-${segmen}` : ""}@tally`,
          lang: bahasa,
          moda: tiket.mode,
          namaKereta: tiket.train_name,
          kelas: tiket.travel_class,
          asal: tiket.origin,
          tujuan: tiket.destination,
          tanggal: tiket.depart_date,
          berangkat: tiket.depart_time,
          tiba: tiket.arrive_time,
          gerbong: tiket.carriage,
          kursi: tiket.seat,
          kodeBooking: tiket.booking_code,
          acara: publicEventName(event),
          offset: timeZoneOffset(normalizeTimeZone(event.time_zone)),
          sekarang: new Date(),
        })
      : null;
  if (!isi) return memberError("NOT_FOUND", 404, "Tiket kereta tidak ditemukan.");

  return new Response(isi, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${KATA_MODA.id[tiket?.mode ?? "train"].toLowerCase()}-${arah === "outbound" ? "berangkat" : "pulang"}${segmen > 1 ? `-${segmen}` : ""}.ics"`,
      // Berisi kode booking peserta: jangan disimpan cache bersama.
      "Cache-Control": "private, no-store",
    },
  });
}
