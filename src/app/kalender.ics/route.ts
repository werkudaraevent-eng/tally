import { getPublicPageEvent } from "@/lib/auth/request-event";
import { timeZoneOffset } from "@/lib/timezone";

/**
 * Berkas kalender acara.
 *
 * Ditulis tangan, bukan lewat pustaka. Formatnya sepuluh baris dan stabil sejak
 * 1998; menambah dependensi untuk itu berarti menambah permukaan pembaruan pada
 * berkas yang tidak akan pernah berubah bentuknya.
 *
 * Waktunya ditulis sebagai UTC (akhiran Z), bukan waktu lokal tanpa zona.
 * Waktu lokal polos akan ditafsirkan kalender tamu memakai zona PERANGKATNYA —
 * tamu dari Jakarta yang membuka undangan acara WITA akan mendapati jamnya
 * bergeser satu jam, dan tidak ada apa pun di layar yang menjelaskan kenapa.
 */
export const dynamic = "force-dynamic";

/** "2026-08-06" + "09:00:00" + "+08:00" → "20260806T010000Z" */
function toUtcStamp(date: string, time: string | null, offset: string): string {
  const jam = time?.slice(0, 8) ?? "09:00:00";
  const moment = new Date(`${date}T${jam}${offset}`);
  return `${moment.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

/**
 * Melipat baris pada 75 oktet, sesuai RFC 5545.
 *
 * Bukan kerapian: deskripsi acara sering lebih panjang dari itu, dan sebagian
 * klien kalender menolak SELURUH berkas bila ada satu baris yang melewatinya —
 * kegagalannya diam, tombolnya hanya tidak melakukan apa-apa.
 */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`);
  return parts.join("\r\n");
}

/** Koma, titik koma, dan baris baru punya arti khusus di iCalendar. */
function escape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/[;,]/g, (match) => `\\${match}`).replace(/\r?\n/g, "\\n");
}

/**
 * Slug datang dari query, bukan dari segmen path.
 *
 * `/e/<slug>/kalender.ics` di-rewrite proxy menjadi
 * `/kalender.ics?eventSlug=<slug>`. Rute yang diletakkan di bawah `e/[slug]/`
 * tidak akan pernah tercapai — permintaannya sudah dialihkan sebelum sampai ke
 * sana, dan tombolnya hanya menghasilkan 404 tanpa penjelasan.
 */
export async function GET(request: Request) {
  const event = await getPublicPageEvent(
    Promise.resolve(Object.fromEntries(new URL(request.url).searchParams)),
  );
  const slug = event?.slug ?? "acara";
  if (!event || !event.event_date || event.status === "archived") {
    return new Response("Acara tidak ditemukan.", { status: 404 });
  }

  const offset = timeZoneOffset(event.time_zone);
  const mulai = toUtcStamp(event.event_date, event.start_time, offset);
  // Tanpa jam selesai, acara dianggap berlangsung delapan jam. Alternatifnya
  // adalah acara sepanjang hari penuh, yang di kalender tamu menutupi seluruh
  // barisnya dan menyembunyikan agenda hari itu.
  const akhirTanggal = event.end_date ?? event.event_date;
  const selesai = event.end_time
    ? toUtcStamp(akhirTanggal, event.end_time, offset)
    : toUtcStamp(akhirTanggal, event.start_time ? addHours(event.start_time, 8) : "17:00:00", offset);

  const lokasi = [event.venue_name, event.venue_address].filter(Boolean).join(", ");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tally//Event//ID",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    // UID stabil dari id acara: tamu yang menekan tombolnya dua kali memperbarui
    // entri yang sama alih-alih menumpuk dua acara di kalendernya.
    `UID:${event.id}@tally`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART:${mulai}`,
    `DTEND:${selesai}`,
    fold(`SUMMARY:${escape(event.name)}`),
    event.tagline ? fold(`DESCRIPTION:${escape(event.tagline)}`) : null,
    lokasi ? fold(`LOCATION:${escape(lokasi)}`) : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return new Response(`${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}

function addHours(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  return `${String(Math.min(23, h + hours)).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}
