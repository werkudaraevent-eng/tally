import { bandingkanBagian, bandingkanBaris } from "../rundown-urutan.ts";

/**
 * Trip bus yang ditautkan ke satu baris Agenda (Logistics > Buses > Trips >
 * Agenda row; kolom `transport_trips.rundown_item_id`, migrasi 202610170002).
 *
 * Jam berangkat tetap milik trip, karena bus bisa berangkat sebelum acaranya.
 * Yang dibaca di sini adalah selisihnya terhadap jam mulai baris: sama, sekian
 * menit sebelum, atau sesudah. Selisih itu yang dijaga pemicu database saat
 * baris digeser di Agenda, seperti Travel Time di Apple Calendar.
 *
 * Semua jam di sini jam dinding zona acara: tanggal "YYYY-MM-DD", jam "HH:MM"
 * atau "HH:MM:SS", dan nilai `<input type="datetime-local">` "YYYY-MM-DDTHH:MM".
 * Tanggal dihitung dengan Date.UTC, jadi tidak bergantung pada zona peramban,
 * dan nama hari serta bulan ditulis sendiri supaya sama di server, peramban,
 * dan Node. Berkas ini hanya mengimpor rundown-urutan (tanpa impor lain)
 * supaya bisa diuji langsung oleh Node (trip-agenda.check.ts).
 */

export type BagianAgenda = { id: number; name: string; event_date: string; is_published: boolean; sort_order: number };
export type BarisAgenda = { id: number; section_id: number; start_time: string; title: string; is_published: boolean; sort_order: number };

/** Trip yang ditautkan ke satu baris, dikirim GET /api/admin/rundown/sections per baris (`bus_trips`). */
export type TripTertaut = { id: number; name: string; depart_at: string | null };

/** Selisih 12 jam atau lebih menjadi peringatan; salah AM/PM (00:45 untuk 12:45) tepat 12 jam ikut tertangkap. */
export const AMBANG_PERINGATAN = 12 * 60;

const HARI = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// "Sept", bukan "Sep": en-GB di Intl menulisnya begitu, dan kolom Departs di
// daftar trip (formatWaktu) memakai Intl.
const BULAN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
const SEHARI = 86_400_000;

/** Nomor hari sejak 1970 dari "YYYY-MM-DD", atau null. */
function nomorHari(tanggal: string): number | null {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal);
  if (!cocok) return null;
  const waktu = Date.UTC(Number(cocok[1]), Number(cocok[2]) - 1, Number(cocok[3]));
  return Number.isNaN(waktu) ? null : Math.round(waktu / SEHARI);
}

/** Kebalikan nomorHari: "YYYY-MM-DD". */
function tanggalDariNomor(hari: number): string {
  return new Date(hari * SEHARI).toISOString().slice(0, 10);
}

/** "2026-11-06" menjadi "Fri 6 Nov" (en-GB, sama dengan Intl en-GB yang dipakai tanggal staf lain di admin). */
export function hariPendek(tanggal: string): string {
  const hari = nomorHari(tanggal);
  if (hari === null) return tanggal;
  const d = new Date(hari * SEHARI);
  return `${HARI[d.getUTCDay()]} ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}`;
}

/** "13:00:00" atau "7:05" menjadi "13:00" / "07:05". Nilai lain apa adanya. */
export function jamPendek(jam: string): string {
  const cocok = /^(\d{1,2}):(\d{2})/.exec(jam.trim());
  return cocok ? `${cocok[1].padStart(2, "0")}:${cocok[2]}` : jam.trim();
}

function menitJam(jam: string): number | null {
  const cocok = /^(\d{1,2}):(\d{2})/.exec(jam.trim());
  if (!cocok) return null;
  const nilai = Number(cocok[1]) * 60 + Number(cocok[2]);
  return Number(cocok[1]) <= 23 && Number(cocok[2]) <= 59 ? nilai : null;
}

/** Satu baris di pemicu, panel detail, dan keterangan chip: "Fri 6 Nov, 14:20 Perjalanan Menuju Hotel". */
export function teksBaris(tanggal: string, jamMulai: string, judul: string): string {
  return `${hariPendek(tanggal)}, ${jamPendek(jamMulai)} ${judul.trim()}`;
}

/** "YYYY-MM-DDTHH:MM" (datetime-local) menjadi tanggal dan menit sejak tengah malam. */
function bacaBerangkat(nilai: string): { tanggal: string; hari: number; menit: number } | null {
  const [tanggal, jam] = nilai.split("T");
  const hari = nomorHari(tanggal ?? "");
  const menit = menitJam(jam ?? "");
  return hari === null || menit === null ? null : { tanggal, hari, menit };
}

/**
 * Menit dari jam berangkat ke awal baris. Positif = bus berangkat sebelum
 * barisnya mulai. Null bila salah satu nilainya tidak terbaca.
 */
export function selisihMenit(berangkat: string, tanggal: string, jamMulai: string): number | null {
  const pergi = bacaBerangkat(berangkat);
  const hari = nomorHari(tanggal);
  const menit = menitJam(jamMulai);
  if (!pergi || hari === null || menit === null) return null;
  return (hari - pergi.hari) * 1440 + menit - pergi.menit;
}

/** "45 min", "1 h 30 min", "12 h", "1 day", "1 day 45 min". Tanda diabaikan. */
export function durasi(menit: number): string {
  const total = Math.abs(Math.round(menit));
  const hari = Math.floor(total / 1440);
  const jam = Math.floor((total % 1440) / 60);
  const sisa = total % 60;
  const bagian = [hari ? `${hari} ${hari === 1 ? "day" : "days"}` : "", jam ? `${jam} h` : "", sisa ? `${sisa} min` : ""].filter(Boolean);
  return bagian.length ? bagian.join(" ") : "0 min";
}

/**
 * Petunjuk di bawah Departs untuk trip yang ditautkan, atau peringatan bila
 * jaraknya 12 jam atau lebih. Peringatan, bukan galat: bus malam sebelumnya
 * bisa saja disengaja, jadi simpan tetap boleh.
 *
 * Tombol perbaikannya dihitung dari jaraknya, bukan dari tanggal kalender.
 * Jarak sekitar n hari, dengan sisa di bawah 12 jam di sisi baris yang sama,
 * berarti tanggalnya salah ketik: tanggal digeser n hari dan jamnya dijaga
 * (memakai jam baris akan membuang jeda 45 menit yang sengaja diketik). Jadi
 * bus 23:30 untuk baris 00:15 dua hari kemudian pindah ke malam sebelum baris,
 * bukan ke hari baris. Geseran yang melempar bus ke sisi lain baris (20:00
 * untuk baris 08:30 esok hari) bukan salah tanggal: seperti hari yang sama
 * (salah AM/PM), tombolnya memakai jam baris. `nilai` adalah isi Departs
 * sesudahnya.
 */
export type PetunjukBerangkat =
  | { jenis: "petunjuk"; teks: string }
  | { jenis: "peringatan"; teks: string; tombol: string; nilai: string };

export function petunjukBerangkat(berangkat: string, tanggal: string, jamMulai: string): PetunjukBerangkat | null {
  const pergi = bacaBerangkat(berangkat);
  const selisih = selisihMenit(berangkat, tanggal, jamMulai);
  if (!pergi || selisih === null) return null;
  const jam = jamPendek(jamMulai);
  if (selisih === 0) return { jenis: "petunjuk", teks: "Moves with the agenda row when its time or day changes." };
  if (Math.abs(selisih) < AMBANG_PERINGATAN) {
    return {
      jenis: "petunjuk",
      teks: selisih > 0 ? `${durasi(selisih)} before the agenda row (${jam}). Moves with it.` : `${durasi(selisih)} after the agenda row starts (${jam}). Moves with it.`,
    };
  }
  const arah = selisih > 0 ? "before" : "after";
  const baris = `the agenda row (${hariPendek(tanggal)}, ${jam})`;
  const geser = Math.round(selisih / 1440);
  const sisa = selisih - geser * 1440;
  if (geser !== 0 && Math.abs(sisa) < AMBANG_PERINGATAN && (sisa === 0 || (sisa > 0) === (selisih > 0))) {
    const jumlah = Math.abs(geser);
    const tanggalBaru = tanggalDariNomor(pergi.hari + geser);
    return {
      jenis: "peringatan",
      teks: `${jumlah} ${jumlah === 1 ? "day" : "days"} ${arah} ${baris}. Check the date.`,
      tombol: `Move to ${hariPendek(tanggalBaru)}`,
      nilai: `${tanggalBaru}T${berangkat.split("T")[1]}`,
    };
  }
  return {
    jenis: "peringatan",
    teks: `${durasi(selisih)} ${arah} ${baris}. Check the time.`,
    tombol: "Use the row's time",
    nilai: `${tanggal}T${jam}`,
  };
}

/** Keterangan di panel detail trip (Logistics > Trips). */
export function keteranganTrip(selisih: number): string {
  if (selisih === 0) return "Departs at the row's start time and moves with it.";
  return selisih > 0 ? `Departs ${durasi(selisih)} before this row and moves with it.` : `Departs ${durasi(selisih)} after this row starts and moves with it.`;
}

/**
 * Sisa kalimat catatan bus di Agenda > Edit item, sesudah "Bus trip {nama} ".
 * Di layar Agenda entrinya disebut "item", jadi kalimatnya juga.
 */
export function kapanBerangkat(jamBerangkat: string, selisih: number): string {
  if (selisih === 0) return `leaves with this item, at ${jamBerangkat}, and moves with it.`;
  return selisih > 0
    ? `leaves at ${jamBerangkat}, ${durasi(selisih)} before this item, and moves with it.`
    : `leaves at ${jamBerangkat}, ${durasi(selisih)} after this item starts, and moves with it.`;
}

/** Jam dinding "HH:MM" dari menit, berputar di tengah malam. */
export function jamDariMenit(menit: number): string {
  const nilai = ((Math.round(menit) % 1440) + 1440) % 1440;
  return `${String(Math.floor(nilai / 60)).padStart(2, "0")}:${String(nilai % 60).padStart(2, "0")}`;
}

/**
 * Jam berangkat trip sesudah jam mulai baris diubah tetapi belum disimpan:
 * pemicu database menggeser trip sejauh yang sama, jadi selisihnya tetap.
 * Null bila jam mulai belum terbaca.
 */
export function jamBerangkatBaru(jamMulai: string, selisih: number): string | null {
  const menit = menitJam(jamMulai);
  return menit === null ? null : jamDariMenit(menit - selisih);
}

/**
 * Nama trip lain yang sama dengan nama ini, atau diawali nama ini ("Perjalanan
 * Menuju Hotel" dan "Perjalanan Menuju Hotel (Batch 1)", "City Tour" dan "City
 * Tours"). Nama satu atau dua huruf baru dihitung sampai batas kata, supaya
 * huruf pertama yang baru diketik tidak sudah memunculkan petunjuk. Null bila
 * tidak ada.
 */
export function namaMirip(nama: string, lain: readonly string[]): string | null {
  const kunci = nama.trim().toLowerCase();
  if (!kunci) return null;
  for (const calon of lain) {
    const bersih = calon.trim();
    const kecil = bersih.toLowerCase();
    if (kecil === kunci) return bersih;
    if (!kecil.startsWith(kunci)) continue;
    if (kunci.length >= 3 || /^[^\p{L}\p{N}]/u.test(kecil.slice(kunci.length))) return bersih;
  }
  return null;
}

/** Kata cari di pemilih cocok dengan "HH:MM judul". "08.30" dibaca "08:30". */
export function cocokCari(kata: string, jamMulai: string, judul: string): boolean {
  const kunci = kata.trim().toLowerCase().replace(/(\d)\.(\d)/g, "$1:$2");
  return !kunci || `${jamPendek(jamMulai)} ${judul}`.toLowerCase().includes(kunci);
}

export type KelompokAgenda = { bagian: BagianAgenda; baris: BarisAgenda[] };
export type PetaAgenda = {
  /** Urut tab Agenda, lalu jam mulai di dalam tab; tab tanpa baris tidak ikut. */
  kelompok: KelompokAgenda[];
  baris: Map<number, { baris: BarisAgenda; bagian: BagianAgenda }>;
  /** Jumlah baris yang bisa dipilih. */
  jumlah: number;
};

/** Baris Agenda acara dikelompokkan per tab, sama urutannya dengan CMS Agenda. */
export function petaAgenda(bagian: readonly BagianAgenda[], baris: readonly BarisAgenda[]): PetaAgenda {
  const kelompok = [...bagian].sort(bandingkanBagian).map((isi) => ({
    bagian: isi,
    baris: baris.filter((item) => item.section_id === isi.id).sort(bandingkanBaris),
  })).filter((isi) => isi.baris.length > 0);
  const peta = new Map<number, { baris: BarisAgenda; bagian: BagianAgenda }>();
  for (const isi of kelompok) for (const item of isi.baris) peta.set(item.id, { baris: item, bagian: isi.bagian });
  return { kelompok, baris: peta, jumlah: peta.size };
}

/**
 * Tanggal ini punya lebih dari satu tab Agenda (Batch 1 dan Batch 2 di hari
 * yang sama). Hanya saat itu nama tab ditulis: "Fri 6 Nov, 17:30 Gala Dinner"
 * bisa berarti dua baris berbeda.
 */
export function tanggalGanda(bagian: readonly Pick<BagianAgenda, "event_date">[], tanggal: string): boolean {
  return bagian.filter((isi) => isi.event_date === tanggal).length > 1;
}

/**
 * Tautan antarlayar, tanpa awalan /e/<slug> (ditambahkan event-link). Agenda
 * membuka tab baris itu dengan barisnya di Edit item; Logistics membuka Buses >
 * Trips dengan trip itu terpilih. Tanpa baris: halaman Agenda saja.
 */
export function hrefBarisAgenda(lokasi: { baris: Pick<BarisAgenda, "id">; bagian: Pick<BagianAgenda, "id"> } | null): string {
  return lokasi ? `/admin/rundown?section=${lokasi.bagian.id}&item=${lokasi.baris.id}` : "/admin/rundown";
}

export function hrefTrip(id: number): string {
  return `/admin/logistik?tab=bus&trip=${id}`;
}

/** "A", "A and B", "A, B and C". */
export function daftarNama(nama: readonly string[]): string {
  if (nama.length <= 1) return nama[0] ?? "";
  return `${nama.slice(0, -1).join(", ")} and ${nama[nama.length - 1]}`;
}

/** Kalimat di dialog hapus Agenda: trip yang tertaut tetap ada dengan jam terakhirnya. */
export function kalimatHapus(nama: readonly string[]): string {
  if (nama.length === 0) return "";
  return nama.length === 1
    ? `Bus trip ${nama[0]} keeps its time and is no longer linked.`
    : `Bus trips ${daftarNama(nama)} keep their time and are no longer linked.`;
}
