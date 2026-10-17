/**
 * Berkas kalender (iCalendar, RFC 5545) untuk acara (app/kalender.ics) dan
 * tiket kereta peserta (api/peserta/kalender-kereta, E-07).
 *
 * Ditulis tangan, bukan lewat pustaka: formatnya pendek dan stabil sejak 1998.
 * Waktu ditulis sebagai UTC (akhiran Z), bukan waktu lokal tanpa zona: waktu
 * lokal polos ditafsirkan kalender tamu memakai zona PERANGKATNYA.
 *
 * Tanpa impor, supaya bisa diuji langsung oleh Node (kalender-ics.check.ts).
 */

/** "2026-08-06" + "09:00:00" + "+08:00" → "20260806T010000Z" */
export function toUtcStamp(date: string, time: string | null, offset: string): string {
  const jam = normalJam(time) ?? "09:00:00";
  const moment = new Date(`${date}T${jam}${offset}`);
  return `${moment.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

/** "8:20", "08:20", atau "08:20:00" menjadi "08:20:00"; null bila bukan jam. */
function normalJam(time: string | null | undefined): string | null {
  const cocok = time?.match(/^(\d{1,2})[:.](\d{2})(?::(\d{2}))?/);
  return cocok ? `${cocok[1].padStart(2, "0")}:${cocok[2]}:${cocok[3] ?? "00"}` : null;
}

/**
 * Melipat baris pada 75 oktet, sesuai RFC 5545. Sebagian klien kalender
 * menolak SELURUH berkas bila ada satu baris yang lebih panjang.
 */
export function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`);
  return parts.join("\r\n");
}

/** Koma, titik koma, dan baris baru punya arti khusus di iCalendar. */
export function escape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/[;,]/g, (match) => `\\${match}`).replace(/\r?\n/g, "\\n");
}

export type TiketKeretaIcs = {
  /** Kunci tetap per peserta dan arah: menekan tombolnya lagi memperbarui entri yang sama. */
  uid: string;
  lang: "id" | "en";
  namaKereta: string;
  kelas: string | null;
  asal: string | null;
  tujuan: string | null;
  /** "YYYY-MM-DD" dan "HH:MM" seperti di tiket, di zona `offset`. */
  tanggal: string;
  berangkat: string;
  tiba: string | null;
  gerbong: string | null;
  kursi: string | null;
  kodeBooking: string | null;
  acara: string;
  offset: string;
  sekarang: Date;
};

/** Pengingat berbunyi dua jam sebelum kereta berangkat, juga tanpa sinyal. */
const PENGINGAT = "-PT2H";

export function icsTiketKereta(tiket: TiketKeretaIcs): string | null {
  const berangkat = normalJam(tiket.berangkat);
  if (!berangkat || !/^\d{4}-\d{2}-\d{2}$/.test(tiket.tanggal)) return null;
  const mulai = toUtcStamp(tiket.tanggal, berangkat, tiket.offset);
  // Tiba lebih awal dari berangkat: kereta malam, tiba keesokan harinya. Tanpa jam tiba: satu jam.
  const tiba = normalJam(tiket.tiba);
  let selesai: string;
  if (tiba) {
    const besok = new Date(`${tiket.tanggal}T00:00:00Z`);
    besok.setUTCDate(besok.getUTCDate() + 1);
    selesai = toUtcStamp(tiba < berangkat ? besok.toISOString().slice(0, 10) : tiket.tanggal, tiba, tiket.offset);
  } else {
    const satuJam = new Date(new Date(`${tiket.tanggal}T${berangkat}${tiket.offset}`).getTime() + 3_600_000);
    selesai = `${satuJam.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  }
  const en = tiket.lang === "en";
  const rute = [tiket.asal?.trim(), tiket.tujuan?.trim()].filter(Boolean).join(" → ");
  const judul = `${en ? "Train" : "Kereta"} ${tiket.namaKereta.trim()}${rute ? `: ${rute}` : ""}`;
  const kursi = [tiket.gerbong ? `${en ? "Carriage" : "Gerbong"} ${tiket.gerbong}` : null, tiket.kursi ? `${en ? "seat" : "kursi"} ${tiket.kursi}` : null].filter(Boolean).join(", ");
  const keterangan = [
    [tiket.kelas, kursi].filter(Boolean).join(" · "),
    tiket.kodeBooking ? `${en ? "Booking code" : "Kode booking"}: ${tiket.kodeBooking}` : null,
    tiket.acara,
  ].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tally//Kereta//ID",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${tiket.uid}`,
    `DTSTAMP:${tiket.sekarang.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART:${mulai}`,
    `DTEND:${selesai}`,
    fold(`SUMMARY:${escape(judul)}`),
    keterangan ? fold(`DESCRIPTION:${escape(keterangan)}`) : null,
    tiket.asal?.trim() ? fold(`LOCATION:${escape(tiket.asal.trim())}`) : null,
    "BEGIN:VALARM",
    `TRIGGER:${PENGINGAT}`,
    "ACTION:DISPLAY",
    fold(`DESCRIPTION:${escape(judul)}`),
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return `${lines.join("\r\n")}\r\n`;
}
