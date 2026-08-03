import { BRANDING_COLUMNS, DEFAULT_BRANDING, type Branding } from "@/lib/branding";
import { DEFAULT_TIME_ZONE, timeZoneOffset, type EventTimeZone } from "@/lib/timezone";

// Rundown acara. Dipakai bersama server dan browser, jadi WAJIB bebas dari
// impor server-only (mis. service client Supabase). Isinya hanya bentuk data dan
// perhitungan murni.
//
// Alasan modul bersama: penanda "sedang berlangsung" dihitung DUA KALI dengan
// aturan yang harus sama persis — sekali di server saat merender pertama, sekali
// di browser setiap menit agar penanda ikut bergerak tanpa memuat ulang. Kalau
// rumusnya ditulis dua kali, keduanya akan menyimpang dan tamu melihat penanda
// yang berpindah sendiri ketika halaman disegarkan.

export type RundownSection = {
  id: number;
  slug: string;
  /** Label tab. Pendek, agar beberapa tab muat di layar ponsel. */
  name: string;
  title: string;
  subtitle: string | null;
  /** Format YYYY-MM-DD, apa adanya dari kolom `date`. */
  event_date: string;
  /**
   * Menyalakan penanda "sedang berlangsung"/"berikutnya" dan auto-scroll.
   *
   * Per bagian, bukan global: penanda hanya benar pada hari acara bagian itu.
   * Bagian yang tanggalnya belum tiba akan selalu menandai butir pertamanya
   * sebagai "berikutnya", dan itu menyesatkan tamu yang membuka jadwal lebih awal.
   */
  highlight_current: boolean;
  is_published: boolean;
  sort_order: number;
};

/**
 * Header halaman /rundown. SATU untuk seluruh acara, bukan per tab.
 *
 * Sebelumnya ini bagian dari `RundownSection`, dan akibatnya baru terlihat setelah
 * dipakai: berpindah tab mengubah judul, warna, dan logo sekaligus, sehingga satu
 * halaman terasa berganti menjadi situs lain di tengah pemakaian. Header adalah
 * identitas ACARA; yang memang berbeda per tab hanya jadwal, tanggal, dan label
 * tabnya.
 */
export type RundownHeader = {
  event_title: string;
  event_subtitle: string | null;
  // Warna boleh null, dan itu bermakna: null = "ikut tema bawaan halaman", bukan
  // "tanpa warna". Berbeda dari seat_map_sessions yang default-nya gelap karena
  // LED memang dirancang gelap; /rundown adalah halaman terang yang sudah tayang,
  // jadi memberinya default akan mengubah tampilan tanpa ada yang meminta.
  background_color: string | null;
  text_color: string | null;
  accent_color: string | null;
  background_image_url: string | null;
} & Branding;

/** Dipakai saat setelan belum terbaca. Sama dengan tampilan sebelum fitur ini ada. */
export const DEFAULT_HEADER: RundownHeader = {
  event_title: "Rundown Acara",
  event_subtitle: null,
  background_color: null,
  text_color: null,
  accent_color: null,
  background_image_url: null,
  ...DEFAULT_BRANDING,
};

export type RundownItem = {
  id: number;
  section_id: number;
  /** Format HH:MM:SS dari kolom `time` Postgres. */
  start_time: string;
  end_time: string | null;
  title: string;
  subtitle: string | null;
  is_break: boolean;
  is_published: boolean;
  sort_order: number;
};

export const SECTION_COLUMNS =
  "id,slug,name,title,subtitle,event_date,highlight_current,is_published,sort_order";

export const HEADER_COLUMNS =
  "event_title,event_subtitle,background_color,text_color,accent_color,background_image_url," +
  BRANDING_COLUMNS;
export const ITEM_COLUMNS =
  "id,section_id,start_time,end_time,title,subtitle,is_break,is_published,sort_order";

// Zona acara diterima sebagai argumen, bukan dibaca dari konstanta.
//
// Ketiga zona Indonesia adalah offset tetap tanpa DST, jadi tanggal + jam bisa
// diubah ke epoch dengan menempelkan offsetnya ke string ISO, tanpa library
// timezone. `Intl` sengaja tidak dipakai untuk arah ini: memakainya dari jam
// lokal ke epoch memerlukan pencarian mundur yang jauh lebih rumit daripada
// masalah yang dipecahkan. Asumsi "tanpa DST" itu dijaga daftar tertutup di
// src/lib/timezone.ts dan CHECK constraint di event_settings.

/** "07:30:00" atau "07:30" -> "07:30". Nilai tak terduga dikembalikan apa adanya. */
export function formatClock(time: string | null | undefined): string {
  if (!time) return "";
  const match = /^(\d{2}):(\d{2})/.exec(time.trim());
  return match ? `${match[1]}:${match[2]}` : time.trim();
}

/**
 * Satu baris keterangan, sudah diketahui perannya.
 *
 * `heading` adalah label yang mengelompokkan baris di bawahnya ("Panelists:",
 * "Moderator:"), `item` adalah isinya (satu orang, satu lokasi).
 */
export type SubtitleLine = { kind: "heading" | "item"; text: string };

/**
 * Menandai baris judul: diakhiri titik dua.
 *
 * Dipakai karena itulah yang panitia sudah tulis sendiri di dokumen rundown
 * ("Panelists – Payment System Industry:", "Moderator:"). Jadi tidak ada sintaks
 * baru yang harus dipelajari — yang sudah diketik apa adanya langsung benar.
 *
 * Nama orang tidak pernah diakhiri titik dua, sehingga aturan ini tidak bisa
 * salah mengenali "Santoso, Chairman - ASPI" sebagai judul.
 */
function isHeadingLine(line: string): boolean {
  return line.endsWith(":");
}

/**
 * Penomoran atau bulet yang ikut tersalin dari Word dibuang.
 *
 * Admin menempel dari dokumen rundown yang butirnya bernomor ("1. Santoso...")
 * atau berbulet ("- Santoso...", "• Santoso..."). Kalau dibiarkan, halaman publik
 * menampilkan bulet DAN nomor sekaligus di baris yang sama.
 *
 * Hanya penanda di awal baris yang dibuang; tanda hubung di tengah kalimat
 * ("Santoso, Chairman - ASPI") tidak tersentuh karena pola ini dipaku ke awal
 * string.
 */
function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:[-–—•*]|\d{1,2}[.)])\s+/, "").trim();
}

/**
 * Keterangan dipecah menjadi baris-baris yang sudah diketahui perannya.
 *
 * Rundown asli klien menaruh beberapa pembicara sebagai daftar di satu sel, dan
 * mengelompokkannya di bawah label seperti "Panelists:" dan "Moderator:".
 * Ditulis sebagai satu kalimat, batas antar orang hilang dan tamu membaca
 * "...Bank Indonesia Santoso - Chairman..." sebagai satu nama.
 *
 * Yang dipakai sebagai pemisah adalah baris baru, bukan tanda baca seperti ";".
 * Alasannya: nama jabatan sudah memuat tanda hubung dan koma, jadi pemisah
 * berupa karakter akan bertabrakan dengan isi yang sah. Baris baru tidak pernah
 * muncul di tengah satu nama.
 *
 * Kenapa BUKAN editor rich text: yang dibutuhkan halaman ini hanya dua bentuk
 * baris, judul dan butir. Editor HTML berarti menyimpan markup yang harus
 * disanitasi sebelum dirender — jalan masuk XSS pada halaman yang justru dibuka
 * paling banyak orang tanpa login — dan tempelan dari Word membawa markup gaya
 * yang akan menabrak tipografi halaman. Aturan "diakhiri titik dua" memberi hasil
 * yang sama tanpa satu pun risiko itu.
 */
export function subtitleLines(subtitle: string | null | undefined): SubtitleLine[] {
  if (!subtitle) return [];
  const lines: SubtitleLine[] = [];
  for (const raw of subtitle.split("\n")) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    // Judul diperiksa SEBELUM penanda daftar dibuang, karena judul yang ikut
    // ternomori ("1. Panelists:") tetap harus dikenali sebagai judul.
    const heading = isHeadingLine(trimmed);
    const text = stripListMarker(trimmed);
    if (text.length === 0) continue;
    lines.push({ kind: heading ? "heading" : "item", text });
  }
  return lines;
}

/** Satu judul beserta butir-butir di bawahnya. `heading` null = butir tanpa judul. */
export type SubtitleGroup = { heading: string | null; items: string[] };

/**
 * Mengelompokkan baris ke bawah judulnya masing-masing.
 *
 * Butir yang muncul SEBELUM judul pertama tetap ditampilkan, dalam kelompok
 * tanpa judul. Tanpa itu, keterangan yang dibuka dengan nama lalu disusul
 * "Moderator:" akan kehilangan nama pembukanya — data hilang tanpa jejak, jenis
 * kesalahan yang paling sulit disadari panitia.
 */
export function groupSubtitleLines(lines: SubtitleLine[]): SubtitleGroup[] {
  const groups: SubtitleGroup[] = [];
  for (const line of lines) {
    if (line.kind === "heading") {
      groups.push({ heading: line.text, items: [] });
      continue;
    }
    // Judul selalu membuka kelompok baru, jadi butir menempel ke kelompok
    // terakhir. Kelompok tanpa judul dibuat hanya bila memang belum ada.
    const last = groups[groups.length - 1];
    if (last) last.items.push(line.text);
    else groups.push({ heading: null, items: [line.text] });
  }
  return groups;
}

/** "07:30" -> "07:30:00", bentuk yang diterima kolom `time`. */
export function toDbTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return time.trim();
  return `${match[1].padStart(2, "0")}:${match[2]}:00`;
}

/**
 * Epoch milidetik dari tanggal section + jam item, ditafsirkan pada zona acara.
 *
 * Mengembalikan null bila salah satu nilainya tidak berbentuk seperti yang
 * diharapkan. Null di sini berarti "tidak bisa dibandingkan", dan pemanggil
 * memperlakukan butir itu sebagai tanpa penanda — lebih baik tidak menandai
 * apa pun daripada menandai butir yang salah.
 */
export function eventEpoch(eventDate: string, time: string | null | undefined, zone: EventTimeZone): number | null {
  if (!time) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null;
  const clock = formatClock(time);
  if (!/^\d{2}:\d{2}$/.test(clock)) return null;
  const parsed = Date.parse(`${eventDate}T${clock}:00${timeZoneOffset(zone)}`);
  return Number.isNaN(parsed) ? null : parsed;
}

export type ItemStatus = "past" | "current" | "upcoming" | "unknown";

/**
 * Status satu butir terhadap waktu sekarang.
 *
 * Butir tanpa `end_time` (penanda momen, mis. "Opening Ceremony" pada 09:00)
 * tidak punya rentang, jadi ia tidak pernah berstatus `current`. Memberinya
 * durasi karangan akan membuat dua butir tampak berjalan bersamaan.
 */
export function itemStatus(eventDate: string, item: RundownItem, now: number, zone: EventTimeZone): ItemStatus {
  const start = eventEpoch(eventDate, item.start_time, zone);
  if (start === null) return "unknown";
  const end = eventEpoch(eventDate, item.end_time, zone);
  if (end !== null && end > start) {
    if (now < start) return "upcoming";
    return now < end ? "current" : "past";
  }
  return now < start ? "upcoming" : "past";
}

/**
 * Butir yang layak disorot dan di-scroll otomatis, atau null.
 *
 * Aturannya sengaja berlapis, karena rundown nyata punya celah dan butir tanpa
 * durasi:
 *   1. Butir yang rentangnya sedang berjalan.
 *   2. Kalau tidak ada (sedang di celah antar sesi, atau butir aktif tidak punya
 *      jam selesai), butir BERIKUTNYA yang akan mulai. Di celah, itulah yang
 *      dicari tamu.
 *   3. Kalau seluruh rundown sudah lewat, tidak ada yang disorot. Menyorot butir
 *      terakhir akan membuat acara yang sudah selesai tampak masih berjalan.
 *
 * Perbandingan `sort_order` lalu `start_time` mengikuti urutan yang sama dengan
 * pembacaan database, jadi hasilnya tidak bergantung pada urutan array masukan.
 */
export function activeItemId(eventDate: string, items: RundownItem[], now: number, zone: EventTimeZone): number | null {
  let current: RundownItem | null = null;
  let next: RundownItem | null = null;

  for (const item of items) {
    const status = itemStatus(eventDate, item, now, zone);
    if (status === "current") {
      if (!current || isBefore(eventDate, item, current, zone)) current = item;
      continue;
    }
    if (status === "upcoming") {
      if (!next || isBefore(eventDate, item, next, zone)) next = item;
    }
  }

  return (current ?? next)?.id ?? null;
}

function isBefore(eventDate: string, a: RundownItem, b: RundownItem, zone: EventTimeZone): boolean {
  const left = eventEpoch(eventDate, a.start_time, zone);
  const right = eventEpoch(eventDate, b.start_time, zone);
  if (left !== null && right !== null && left !== right) return left < right;
  return a.sort_order < b.sort_order;
}

/** Mis. "Senin, 24 Agustus 2026". Dipakai sebagai keterangan di bawah judul. */
export function formatEventDate(eventDate: string, zone: EventTimeZone = DEFAULT_TIME_ZONE): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return eventDate;
  // Ditafsirkan sebagai tengah hari di zona acara, bukan tengah malam. Tengah
  // malam masih tanggal sebelumnya di UTC, sehingga pemformatan pada device yang
  // timezone-nya di barat zona acara bisa menggeser tanggalnya satu hari.
  const date = new Date(`${eventDate}T12:00:00${timeZoneOffset(zone)}`);
  if (Number.isNaN(date.getTime())) return eventDate;
  return date.toLocaleDateString("id-ID", {
    timeZone: zone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
