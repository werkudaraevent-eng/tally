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

/** Baris Details yang menyebut nama pembicara tertaut (tanpa beda huruf besar, aksen, tanda baca). */
function sebutNama(baris: string, nama: string[]): boolean {
  const isi = ` ${polos(baris)} `;
  return nama.some((kunci) => isi.includes(` ${kunci} `));
}

export type SisaKeterangan = {
  /** Baris pertama Details bila letaknya di atas baris pembicara: subjudul sesi. */
  subjudul: string | null;
  /** Baris Details lain yang tidak menyebut pembicara tertaut, apa adanya. */
  lain: string | null;
};

/**
 * Details tanpa baris yang sudah tampil sebagai pembicara, supaya nama tidak
 * muncul dua kali. Label ("Speakers:", "Moderator:") yang semua isinya terbuang
 * ikut dibuang. Baris yang tidak cocok dengan siapa pun tetap tampil: lebih baik
 * dobel daripada hilang tanpa jejak.
 */
export function sisaKeterangan(subtitle: string | null | undefined, orang: LandingSpeaker[]): SisaKeterangan {
  const baris = (subtitle ?? "").split("\n").map((teks) => teks.trim()).filter(Boolean);
  if (baris.length === 0) return { subjudul: null, lain: null };
  const nama = orang.map((speaker) => polos(speaker.name ?? "")).filter((kunci) => kunci.length >= 3);
  const buang = baris.map((teks) => !teks.endsWith(":") && sebutNama(teks, nama));
  // Label dibuang bila tidak ada isi yang tersisa sampai label berikutnya.
  baris.forEach((teks, index) => {
    if (!teks.endsWith(":")) return;
    let akhir = index + 1;
    while (akhir < baris.length && !baris[akhir].endsWith(":")) akhir += 1;
    const isi = buang.slice(index + 1, akhir);
    if (isi.length === 0 || isi.every(Boolean)) buang[index] = true;
  });
  const sisa = baris.filter((_, index) => !buang[index]);
  if (sisa.length === 0) return { subjudul: null, lain: null };
  // Subjudul hanya bila baris pertama berdiri di atas baris pembicara yang dibuang
  // ("Global framing: ..." lalu daftar nama), bukan catatan biasa seperti "Ruang A".
  const pertamaDibuang = buang.indexOf(true);
  const subjudul = !buang[0] && pertamaDibuang > 0 && !baris[0].endsWith(":") ? baris[0] : null;
  const lain = (subjudul ? sisa.slice(1) : sisa).join("\n") || null;
  return { subjudul, lain };
}

export type KelompokPeran = { label: string; orang: LandingSpeaker[] };

/**
 * Pembicara dikelompokkan menurut peran sesinya, urut kemunculan pertama
 * (urutan admin tetap berlaku di dalam kelompok), dengan Moderator paling
 * akhir: susunan panel di program acara, pembicara dulu lalu pemandunya.
 * Tanpa peran: kelompok `labelBawaan` ("Speakers").
 */
export function kelompokPeran(orang: LandingSpeaker[], labelBawaan: string): KelompokPeran[] {
  const peta = new Map<string, KelompokPeran>();
  for (const speaker of orang) {
    const peran = speaker.role?.trim() ?? "";
    const kunci = kunciPeran(peran);
    const ada = peta.get(kunci);
    if (ada) ada.orang.push(speaker);
    else peta.set(kunci, { label: peran || labelBawaan, orang: [speaker] });
  }
  const moderator = peta.get("moderator");
  return moderator ? [...[...peta.values()].filter((grup) => grup !== moderator), moderator] : [...peta.values()];
}

/** Baris kedua tiap pembicara: jabatan dan instansi. */
export function keteranganPembicara(speaker: LandingSpeaker): string {
  return [speaker.title?.trim(), speaker.company?.trim()].filter(Boolean).join(", ");
}
