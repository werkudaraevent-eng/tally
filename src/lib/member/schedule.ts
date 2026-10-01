import type { AgendaPreview } from "@/lib/landing-agenda";
import { daysUntil } from "@/lib/event-datetime";
import type { EventTimeZone } from "@/lib/timezone";

/**
 * Jam dan tanggal untuk area peserta, dihitung di zona acara, bukan zona
 * server (Vercel berjalan di UTC) dan bukan zona ponsel tamu.
 */

/** "5 Agu, 14.00" dari timestamptz. */
export function formatMoment(iso: string | null, zona: EventTimeZone, hari = false): string | null {
  if (!iso) return null;
  const waktu = new Date(iso);
  if (Number.isNaN(waktu.getTime())) return null;
  const tanggal = new Intl.DateTimeFormat("id-ID", {
    weekday: hari ? "long" : undefined,
    day: "numeric",
    month: "short",
    timeZone: zona,
  }).format(waktu);
  return `${tanggal}, ${formatJam(iso, zona)}`;
}

/** "06.30" dari timestamptz. */
export function formatJam(iso: string | null, zona: EventTimeZone): string | null {
  if (!iso) return null;
  const waktu = new Date(iso);
  if (Number.isNaN(waktu.getTime())) return null;
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: zona })
    .format(waktu)
    .replace(":", ".");
}

/** Tanggal (YYYY-MM-DD) dan menit sejak tengah malam, sekarang, di zona acara. */
function sekarangDi(zona: EventTimeZone, now: Date) {
  const bagian = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: zona,
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    tanggal: `${bagian.year}-${bagian.month}-${bagian.day}`,
    menit: (Number(bagian.hour) % 24) * 60 + Number(bagian.minute),
  };
}

function menit(jam: string | null): number | null {
  const cocok = jam?.match(/^(\d{1,2})[:.](\d{2})/);
  return cocok ? Number(cocok[1]) * 60 + Number(cocok[2]) : null;
}

export type TodaySession = {
  time: string;
  title: string;
  subtitle: string | null;
  section: string | null;
  live: boolean;
};

export type TodaySummary = {
  /** True hanya pada hari acara (acara satu hari, atau di rentang acara). */
  isEventDay: boolean;
  daysLeft: number | null;
  sessions: TodaySession[];
  next: TodaySession | null;
};

/**
 * Rundown tidak menyimpan tanggal per sesi, jadi "sesi berlangsung" dan "sesi
 * berikutnya" hanya dihitung ketika hari ini adalah hari acara. Di hari lain
 * halaman menampilkan susunan tanpa penanda waktu, bukan penanda yang salah.
 */
export function summarizeToday(
  agenda: AgendaPreview[],
  event: { event_date: string | null; end_date: string | null; time_zone: EventTimeZone },
  now = new Date(),
): TodaySummary {
  const { tanggal, menit: kini } = sekarangDi(event.time_zone, now);
  const akhir = event.end_date || event.event_date;
  const isEventDay = Boolean(event.event_date && akhir && tanggal >= event.event_date && tanggal <= akhir);

  const semua = agenda.flatMap((section) =>
    section.items.map((item) => ({ ...item, section: section.sectionTitle })),
  );
  const sessions: TodaySession[] = semua.map((item, index) => {
    const mulai = menit(item.time);
    // Sesi tanpa jam selesai dianggap berakhir saat sesi berikutnya mulai.
    const selesai = menit(item.end) ?? menit(semua[index + 1]?.time ?? null);
    const live = isEventDay && mulai !== null && kini >= mulai && (selesai === null ? false : kini < selesai);
    return {
      time: item.time.replace(":", "."),
      title: item.title,
      subtitle: item.subtitle,
      section: item.section,
      live,
    };
  });
  const next = isEventDay
    ? sessions.find((_, index) => {
        const mulai = menit(semua[index].time);
        return mulai !== null && mulai > kini;
      }) ?? null
    : null;

  return { isEventDay, daysLeft: daysUntil(event.event_date, now), sessions, next };
}

/** "RW" dari "Rina Wulandari". */
export function initials(name: string) {
  const kata = name.trim().split(/\s+/).filter(Boolean);
  if (kata.length === 0) return "?";
  const huruf = kata.length === 1 ? kata[0].slice(0, 2) : `${kata[0][0]}${kata[kata.length - 1][0]}`;
  return huruf.toUpperCase();
}
