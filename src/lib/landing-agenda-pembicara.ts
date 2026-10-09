import type { LandingSpeaker } from "./domain.ts";
import { kunciPeran } from "./landing-peran-sesi.ts";

/**
 * Pembicara di bawah judul sesi Susunan acara (`agenda_speakers` names/photos).
 * Murni data, tanpa tampilan.
 *
 * Nama dan instansi diambil dari data Pembicara yang tertaut ke baris rundown,
 * bukan ditebak dari teks Details: urutan "Instansi - Nama" atau "Nama, Jabatan"
 * di Details berbeda tiap panitia dan tidak bisa dipisah dengan aman.
 */

function polos(teks: string): string {
  return teks
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("id-ID")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Sapaan dan gelar di depan nama ("Dr. Ir. Hendra"): tidak ikut dicocokkan. */
const SAPAAN = new Set(["dr", "ir", "prof", "drs", "dra", "h", "hj", "bapak", "ibu", "pak", "bu", "mr", "mrs", "ms", "dato", "datuk"]);

/**
 * Kata yang boleh tersisa di baris tanpa membuat baris itu berisi hal lain:
 * label peran, kata sambung, dan potongan gelar di belakang nama ("S.E.,
 * M.Sc." menjadi "s e m sc"). Huruf tunggal juga dianggap potongan gelar.
 */
const KATA_LABEL = ["pembicara", "narasumber", "panelis", "moderator", "speaker", "speakers", "panelist", "panelists", "host", "mc", "fasilitator", "facilitator"];
const BOLEH_SISA = new Set([...KATA_LABEL, ...SAPAAN, "co", "dan", "and", "sc", "phd", "ph", "si", "st", "mt", "sh", "mh", "mm", "se", "kom", "pd", "mba", "ba", "ma", "mpd", "msi", "mkom"]);

/** Kunci nama: tanpa gelar di belakang koma dan tanpa sapaan di depan. */
function kunciNama(nama: string): string {
  const kata = polos(nama.split(",")[0] ?? "").split(" ").filter(Boolean);
  while (kata.length > 1 && SAPAAN.has(kata[0]!)) kata.shift();
  return kata.join(" ");
}

/** Label kelompok di Details: diakhiri titik dua, atau hanya kata peran ("Pembicara"). */
function barisLabel(teks: string): boolean {
  if (teks.endsWith(":")) return true;
  const kata = polos(teks).split(" ").filter(Boolean);
  return kata.length > 0 && kata.length <= 2 && kata.every((k) => KATA_LABEL.includes(k) || k === "co");
}

function buangFrasa(isi: string, frasa: string): string {
  if (!frasa) return isi;
  const cari = ` ${frasa} `;
  let hasil = isi;
  while (hasil.includes(cari)) hasil = hasil.replace(cari, " ");
  return hasil;
}

/** Sisa kata setelah nama, jabatan, dan instansi pembicara yang disebut dibuang. */
function sisaKata(teks: string, disebut: LandingSpeaker[]): string[] {
  let isi = ` ${polos(teks)} `;
  for (const speaker of disebut) {
    isi = buangFrasa(isi, kunciNama(speaker.name ?? ""));
    isi = buangFrasa(isi, polos(speaker.title ?? ""));
    isi = buangFrasa(isi, polos(speaker.company ?? ""));
  }
  return isi.split(" ").filter((kata) => kata && kata.length > 1 && !BOLEH_SISA.has(kata));
}

export type SisaKeterangan = {
  /** Baris pertama Details bila letaknya di atas baris pembicara: subjudul sesi. */
  subjudul: string | null;
  /** Baris Details lain yang tidak hanya berisi pembicara tertaut, apa adanya. */
  lain: string | null;
  /** Catatan dalam kurung di baris seorang pembicara ("(online)"), per nama pembicara. */
  catatan: Map<string, string>;
};

/**
 * Details tanpa baris yang sudah tampil sebagai pembicara, supaya nama tidak
 * muncul dua kali. Satu baris dibuang hanya bila tidak ada yang tersisa setelah
 * nama, jabatan, instansi, label peran, dan tanda baca pembicara tertaut
 * dibuang: rekan panel yang belum tertaut, topik, dan nama lain tetap tampil.
 * Catatan dalam kurung di baris satu pembicara pindah ke sebelah namanya.
 * Label ("Speakers:", "Moderator") yang semua isinya terbuang ikut dibuang.
 */
export function sisaKeterangan(subtitle: string | null | undefined, orang: LandingSpeaker[]): SisaKeterangan {
  const catatan = new Map<string, string>();
  const baris = (subtitle ?? "").split("\n").map((teks) => teks.trim()).filter(Boolean);
  if (baris.length === 0) return { subjudul: null, lain: null, catatan };
  const kunci = orang.map((speaker) => ({ speaker, kunci: kunciNama(speaker.name ?? "") })).filter(({ kunci }) => kunci.length >= 3);
  const label = baris.map(barisLabel);
  const buang = baris.map((teks, index) => {
    if (label[index]) return false;
    const isi = ` ${polos(teks)} `;
    const disebut = kunci.filter(({ kunci }) => isi.includes(` ${kunci} `)).map(({ speaker }) => speaker);
    if (disebut.length === 0) return false;
    if (sisaKata(teks, disebut).length === 0) return true;
    // Hanya catatan dalam kurung yang tersisa, di baris satu orang: pindah ke namanya.
    const kurung = teks.match(/\([^()]*\)/g);
    if (disebut.length === 1 && kurung && sisaKata(teks.replace(/\([^()]*\)/g, " "), disebut).length === 0) {
      catatan.set(disebut[0]!.name, kurung.join(" "));
      return true;
    }
    return false;
  });
  // Label dibuang bila tidak ada isi yang tersisa sampai label berikutnya.
  baris.forEach((_, index) => {
    if (!label[index]) return;
    let akhir = index + 1;
    while (akhir < baris.length && !label[akhir]) akhir += 1;
    const isi = buang.slice(index + 1, akhir);
    if (isi.length === 0 || isi.every(Boolean)) buang[index] = true;
  });
  const sisa = baris.filter((_, index) => !buang[index]);
  if (sisa.length === 0) return { subjudul: null, lain: null, catatan };
  // Subjudul hanya bila baris pertama berdiri di atas baris pembicara yang dibuang
  // ("Global framing: ..." lalu daftar nama), bukan catatan biasa seperti "Ruang A".
  const pertamaDibuang = buang.indexOf(true);
  const subjudul = !buang[0] && pertamaDibuang > 0 && !label[0] ? baris[0]! : null;
  const lain = (subjudul ? sisa.slice(1) : sisa).join("\n") || null;
  return { subjudul, lain, catatan };
}

export type KelompokPeran = { kunci: string; label: string; orang: LandingSpeaker[] };

/** "Speaker" dan "Speakers" satu kelompok. */
function kunciKelompok(peran: string): string {
  const kunci = kunciPeran(peran);
  return kunci === "speaker" ? "speakers" : kunci;
}

/** Moderator dikenali dari peran Indonesia (`role_id` di /en), juga "Co-moderator". */
function moderator(speaker: LandingSpeaker): boolean {
  return kunciPeran(speaker.role_id ?? speaker.role).includes("moderator");
}

/**
 * Pembicara dikelompokkan menurut peran sesinya, urut kemunculan pertama
 * (urutan admin tetap berlaku di dalam kelompok), dengan kelompok moderator
 * paling akhir: susunan panel di program acara, pembicara dulu lalu
 * pemandunya. Tanpa peran: kelompok `labelBawaan` ("Speakers"), yang menyatu
 * dengan peran bertulisan sama.
 */
export function kelompokPeran(orang: LandingSpeaker[], labelBawaan: string): KelompokPeran[] {
  const peta = new Map<string, KelompokPeran & { moderator: boolean }>();
  for (const speaker of orang) {
    const peran = speaker.role?.trim() || labelBawaan;
    const kunci = kunciKelompok(peran);
    const ada = peta.get(kunci);
    if (ada) {
      ada.orang.push(speaker);
      ada.moderator ||= moderator(speaker);
    } else peta.set(kunci, { kunci, label: peran, orang: [speaker], moderator: moderator(speaker) });
  }
  // Kelompok "Speakers" memakai label bawaan yang jamak bila sama kuncinya.
  const bawaan = peta.get(kunciKelompok(labelBawaan));
  if (bawaan) bawaan.label = labelBawaan;
  const semua = [...peta.values()];
  return [...semua.filter((grup) => !grup.moderator), ...semua.filter((grup) => grup.moderator)].map(({ kunci, label, orang }) => ({ kunci, label, orang }));
}

/** Baris kedua tiap pembicara, satu baris: instansi, atau jabatan bila tanpa instansi. */
export function keteranganPembicara(speaker: LandingSpeaker): string {
  return speaker.company?.trim() || speaker.title?.trim() || "";
}

/** Jabatan dan instansi lengkap, untuk atribut `title` baris yang dipotong. */
export function keteranganLengkap(speaker: LandingSpeaker): string {
  return [speaker.title?.trim(), speaker.company?.trim()].filter(Boolean).join(", ");
}
