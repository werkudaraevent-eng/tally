import type { EventTimeZone } from "./timezone";
import { timeZoneAbbr } from "./timezone";

/**
 * Menyusun tanggal dan jam acara menjadi teks yang bisa dibaca tamu.
 *
 * `event_date` dan `start_time` disimpan terpisah di database, dan itu memang
 * disengaja — tanggal acara sudah dipakai rundown, email, dan ekspor, jadi ia
 * tidak boleh punya sumber kebenaran kedua. Penggabungannya terjadi di sini,
 * satu tempat, supaya landing page dan berkas kalender tidak pernah menampilkan
 * jam yang berbeda.
 */

export type EventSchedule = {
  event_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  time_zone: EventTimeZone;
};

/** "HH:MM:SS" atau "HH:MM" menjadi "HH.MM". Nilai tak terbaca dibuang. */
function jam(value: string | null, bahasa: TanggalBahasa = "id"): string | null {
  if (!value) return null;
  const cocok = value.match(/^(\d{2}):(\d{2})/);
  return cocok ? `${cocok[1]}${bahasa === "en" ? ":" : "."}${cocok[2]}` : null;
}

/** Bahasa halaman acara (lihat src/lib/landing-i18n.ts). Bawaan Indonesia. */
type TanggalBahasa = "id" | "en";

function tanggal(iso: string, zona: EventTimeZone, panjang = true, bahasa: TanggalBahasa = "id"): string {
  // T12:00:00Z, bukan tengah malam. Tanggal murni yang diurai sebagai UTC lalu
  // ditampilkan di zona WIB/WITA/WIT dapat mundur satu hari; tengah hari
  // menyisakan jarak aman ke kedua arah.
  return new Intl.DateTimeFormat(bahasa === "en" ? "en-GB" : "id-ID", {
    dateStyle: panjang ? "full" : "long",
    timeZone: zona,
  }).format(new Date(`${iso}T12:00:00Z`));
}

/**
 * Satu baris tanggal untuk hero landing page.
 *
 * Contoh keluaran:
 *   "Kamis, 6 Agustus 2026 · 09.00–17.00 WITA"
 *   "6–8 Agustus 2026 · mulai 09.00 WITA"
 *   "Kamis, 6 Agustus 2026"
 */
export function formatEventSchedule(schedule: EventSchedule, bahasa: TanggalBahasa = "id"): string | null {
  const hari = formatEventDate(schedule, bahasa);
  if (!hari) return null;
  const waktu = formatEventTime(schedule, bahasa);
  return waktu ? `${hari} · ${waktu}` : hari;
}

/** Baris tanggal saja, tanpa jam. */
export function formatEventDate(schedule: EventSchedule, bahasa: TanggalBahasa = "id"): string | null {
  if (!schedule.event_date) return null;
  return schedule.end_date && schedule.end_date !== schedule.event_date
    ? `${tanggal(schedule.event_date, schedule.time_zone, false, bahasa)} – ${tanggal(schedule.end_date, schedule.time_zone, false, bahasa)}`
    : tanggal(schedule.event_date, schedule.time_zone, true, bahasa);
}

/** Baris jam saja: "09.00–17.00 WITA" atau "mulai 09.00 WITA" (English: "09:00–17:00 WITA", "from 09:00 WITA"). */
export function formatEventTime(schedule: EventSchedule, bahasa: TanggalBahasa = "id"): string | null {
  const mulai = jam(schedule.start_time, bahasa);
  if (!mulai) return null;
  const selesai = jam(schedule.end_time, bahasa);
  const abbr = timeZoneAbbr(schedule.time_zone);
  // Jam selesai disebut hanya bila ada. "09.00–" yang menggantung terbaca
  // sebagai data yang belum diisi, dan tamu tidak tahu itu salah siapa.
  return selesai ? `${mulai}–${selesai} ${abbr}` : `${bahasa === "en" ? "from" : "mulai"} ${mulai} ${abbr}`;
}

/** Hitungan hari menuju acara. Negatif berarti sudah lewat. */
export function daysUntil(eventDate: string | null, now: Date): number | null {
  if (!eventDate) return null;
  const target = new Date(`${eventDate}T12:00:00Z`).getTime();
  const hariIni = new Date(`${now.toISOString().slice(0, 10)}T12:00:00Z`).getTime();
  return Math.round((target - hariIni) / 86_400_000);
}

/**
 * Rentang tanggal ringkas gaya gathering (rancangan pen.dev): "6–8 Nov 2026"
 * (bulan pendek) atau "6–8 November 2026". Beda bulan: "30 Okt – 2 Nov 2026";
 * beda tahun: kedua tanggal lengkap. Satu hari: "6 Nov 2026".
 */
export function formatEventDateRingkas(schedule: EventSchedule, bahasa: TanggalBahasa = "id", bulanPendek = true): string | null {
  if (!schedule.event_date) return null;
  const bagian = (iso: string) => {
    const parts = new Intl.DateTimeFormat(bahasa === "en" ? "en-GB" : "id-ID", {
      day: "numeric",
      month: bulanPendek ? "short" : "long",
      year: "numeric",
      timeZone: schedule.time_zone,
    }).formatToParts(new Date(`${iso}T12:00:00Z`));
    const ambil = (jenis: string) => parts.find((part) => part.type === jenis)?.value.replace(".", "") ?? "";
    return { hari: ambil("day"), bulan: ambil("month"), tahun: ambil("year") };
  };
  const awal = bagian(schedule.event_date);
  if (!schedule.end_date || schedule.end_date === schedule.event_date) return `${awal.hari} ${awal.bulan} ${awal.tahun}`;
  const akhir = bagian(schedule.end_date);
  if (awal.tahun !== akhir.tahun) return `${awal.hari} ${awal.bulan} ${awal.tahun} – ${akhir.hari} ${akhir.bulan} ${akhir.tahun}`;
  if (awal.bulan !== akhir.bulan) return `${awal.hari} ${awal.bulan} – ${akhir.hari} ${akhir.bulan} ${akhir.tahun}`;
  return `${awal.hari}–${akhir.hari} ${akhir.bulan} ${akhir.tahun}`;
}
