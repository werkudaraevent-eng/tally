/**
 * Kapan sebuah checkpoint (Check-in > Checkpoints > When, migrasi
 * 202610220001): tanggal dan jam diambil dari baris Agenda yang ditautkan,
 * bukan disalin, jadi jam yang diubah di Agenda ikut berubah di kartu peserta.
 *
 * Satu checkpoint boleh menautkan beberapa baris (satu per batch). Peserta
 * hanya diberi baris yang boleh ia lihat (Agenda > Who sees it), dan dari
 * yang tersisa dipakai yang paling awal. Tanpa baris yang terlihat: tanpa
 * tanggal, kartu sama seperti checkpoint tanpa When.
 *
 * Murni, supaya bisa diuji langsung oleh Node (waktu.check.ts).
 */

export type WaktuLangkah = {
  /** "YYYY-MM-DD", tanggal bagian Agenda. */
  date: string;
  /** Jam mulai dan selesai seperti di Jadwal peserta ("09.00" atau "09:00"). */
  start: string;
  end: string | null;
};

const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/** "09.00" dan "09:00" sama-sama menjadi "09:00", untuk dibandingkan. */
const kunciJam = (jam: string) => jam.replace(".", ":").padStart(5, "0");

/**
 * Baris terlihat paling awal di antara `ids`. `terlihat` hanya berisi baris
 * Agenda acara ini yang boleh dilihat peserta, jadi id lain (dihapus, acara
 * lain, disembunyikan) diabaikan dengan sendirinya.
 */
export function pilihWaktu(ids: readonly number[], terlihat: ReadonlyMap<number, WaktuLangkah>): WaktuLangkah | null {
  let hasil: WaktuLangkah | null = null;
  for (const id of ids) {
    const waktu = terlihat.get(id);
    if (!waktu || !TANGGAL.test(waktu.date)) continue;
    if (!hasil || `${waktu.date} ${kunciJam(waktu.start)}` < `${hasil.date} ${kunciJam(hasil.start)}`) hasil = waktu;
  }
  return hasil;
}

/** Tanggal "YYYY-MM-DD" saat `kini` di zona acara. */
export function tanggalDiZona(kini: Date, zona: string): string {
  const bagian = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(kini);
  const ambil = (jenis: string) => bagian.find((isi) => isi.type === jenis)?.value ?? "";
  return `${ambil("year")}-${ambil("month")}-${ambil("day")}`;
}

function besokDari(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** "Senin, 2 November" / "Sen, 2 Nov" / "Monday 2 November" / "Mon 2 Nov". */
function teksTanggal(tanggal: string, lang: "id" | "en", panjang: boolean): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  const lokal = lang === "en" ? "en-GB" : "id-ID";
  const hari = new Intl.DateTimeFormat(lokal, { weekday: panjang ? "long" : "short", timeZone: "UTC" }).format(d).replace(/\.$/, "");
  const tgl = new Intl.DateTimeFormat(lokal, { day: "numeric", month: panjang ? "long" : "short", timeZone: "UTC" }).format(d).replace(/\.$/, "");
  return lang === "en" ? `${hari} ${tgl}` : `${hari}, ${tgl}`;
}

const rentang = (waktu: WaktuLangkah) => (waktu.end && waktu.end !== waktu.start ? `${waktu.start}–${waktu.end}` : waktu.start);

export type TeksWaktu = {
  /** Hari ini atau besok di zona acara; null untuk hari lain. */
  relatif: "hari-ini" | "besok" | null;
  /** Kalimat lengkap, mis. "Sen, 2 Nov · 09.00–17.00" atau "Hari ini · 09.00–16.00". */
  teks: string;
  /** Tanpa kata "Hari ini", untuk dipasang di samping chip: "09.00–16.00". */
  tanpaRelatif: string;
};

/**
 * Teks waktu satu langkah. `panjang` untuk Langkah berikutnya (nama hari dan
 * bulan penuh), pendek untuk baris daftar.
 */
export function teksWaktu(waktu: WaktuLangkah, hariIni: string, lang: "id" | "en", panjang: boolean): TeksWaktu {
  const jam = rentang(waktu);
  if (waktu.date === hariIni) {
    return { relatif: "hari-ini", teks: `${lang === "en" ? "Today" : "Hari ini"} · ${jam}`, tanpaRelatif: jam };
  }
  const tanggal = `${teksTanggal(waktu.date, lang, panjang)} · ${jam}`;
  if (waktu.date === besokDari(hariIni)) {
    const teks = `${lang === "en" ? "Tomorrow" : "Besok"}, ${lang === "en" ? tanggal : tanggal.replace(", ", " ")}`;
    return { relatif: "besok", teks, tanpaRelatif: teks };
  }
  return { relatif: null, teks: tanggal, tanpaRelatif: tanggal };
}

/**
 * Jam selesai sebuah langkah bertanggal. Hari ini cukup jamnya, seperti
 * sebelumnya; hari lain dengan tanggalnya, karena langkahnya tersebar di
 * beberapa hari: "Sen, 2 Nov · 10.12".
 */
export function teksSelesai(iso: string, zona: string, hariIni: string, lang: "id" | "en"): string {
  const kini = new Date(iso);
  const jam = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false }).format(kini);
  const tanggal = tanggalDiZona(kini, zona);
  return tanggal === hariIni ? jam : `${teksTanggal(tanggal, lang, false)} · ${jam}`;
}
