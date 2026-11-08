/**
 * Menyusun deck dari bahan dan pilihan panitia: hitung tiap slide bawaan,
 * pasang slide tambahan, terapkan urutan, judul dan catatan yang diedit,
 * lalu Ringkasan memilih tiga temuan terbesar dari slide yang tampil.
 */
import type { BahanLaporan } from "./bahan.ts";
import { aksenTerbaca } from "./warna.ts";
import { urutkan, type ConfigLaporan, type KunciBawaan } from "./config.ts";
import type { Blok, Deck, Latar, Slide, SlideAbsen, SlideIsi } from "./jenis.ts";
import type { HasilSlide, SlideHitung } from "./teks.ts";
import { slideCorong } from "./slide/corong.ts";
import { slideKelompok } from "./slide/kelompok.ts";
import { slideKepuasan } from "./slide/kepuasan.ts";
import { slideOperasional } from "./slide/operasional.ts";
import { slidePengumuman } from "./slide/pengumuman.ts";
import { slidePortal } from "./slide/portal.ts";
import { slideRingkas, slideSampul } from "./slide/ringkas.ts";
import { slideSesi } from "./slide/sesi.ts";
import { slideTambahan, slideUsulan } from "./slide/tambahan.ts";
import { kunciTitik, slideLampiran, slidePanas, slidePembatas, slideTitik, titikSlide } from "./slide/titik.ts";
import { slideUndian } from "./slide/undian.ts";

/** Nama slide di daftar admin (en-GB, seperti layar admin lain). */
export const NAMA_ADMIN: Record<KunciBawaan, string> = {
  sampul: "Cover",
  ringkas: "Summary",
  corong: "Invited to attended",
  harih: "Event day divider",
  panas: "Arrivals by hour, all points",
  sesi: "Attendance by session",
  kelompok: "Attendance by group",
  portal: "Participant area and attendance",
  kepuasan: "Satisfaction",
  pengumuman: "Announcements",
  undian: "Lucky draw and voting",
  operasional: "Operations",
  usulan: "What to change next time",
  lampiran: "Appendix, all check-in points",
};

/** Ada tanda merah di slide ini: jangan di permukaan aksen, merahnya tidak terjamin terbaca di sana. */
const adaMasalah = (s: SlideIsi) =>
  !!s.stiker?.merah ||
  s.blok.some((b: Blok) =>
    (b.jenis === "angka" && b.isi.some((x) => x.masalah)) ||
    (b.jenis === "tabel" && b.baris.some((r) => r.sorot === "masalah")) ||
    (b.jenis === "batang" && b.seri.some((x) => x.sorot === "masalah" || x.nilai < 0)) ||
    (b.jenis === "garis" && b.titik.some((x) => x.masalah)));

/**
 * Permukaan bergantian aksen, kertas, gelap supaya deck tidak hitam putih,
 * tanpa dua slide bersebelahan berwarna sama. Pembatas selalu gelap (berfoto),
 * slide bertanda merah tidak di aksen, tabel panjang dan peta panas di kertas.
 */
export function pasangLatar(slide: Slide[], bolehAksen = true): Slide[] {
  const putaran: Latar[] = bolehAksen ? ["aksen", "kertas", "gelap"] : ["kertas", "gelap"];
  const p = putaran.length;
  let i = 0;
  let sebelum: Latar = "gelap"; // sampul
  const hasil = slide.map((s) => {
    if (s.jenis === "sampul") {
      sebelum = "gelap";
      return s;
    }
    // Tabel panjang dan peta panas paling terbaca di kertas.
    const tabelPanjang = s.blok.some((b) => (b.jenis === "tabel" && b.baris.length > 7) || b.jenis === "panas");
    const boleh = (l: Latar) => l !== sebelum && !(l === "aksen" && adaMasalah(s)) && !(tabelPanjang && l !== "kertas");
    let latar: Latar;
    if (s.tata === "pembatas") latar = "gelap";
    else if (tabelPanjang) latar = "kertas";
    else {
      let k = 0;
      while (k < p && !boleh(putaran[(i + k) % p])) k += 1;
      latar = k < p ? putaran[(i + k) % p] : "kertas";
      i = (putaran.indexOf(latar) + 1) % p;
    }
    sebelum = latar;
    return { ...s, latar };
  });
  // Slide wajib (pembatas gelap, tabel panjang di kertas) bisa jatuh sama dengan
  // tetangga sebelumnya: ganti tetangga itu bila ada permukaan lain yang boleh.
  const wajib = (s: Slide) => s.jenis === "isi" && (s.tata === "pembatas" || s.blok.some((b) => (b.jenis === "tabel" && b.baris.length > 7) || b.jenis === "panas"));
  const latarDi = (j: number): Latar | null => { const s = hasil[j]; return !s ? null : s.jenis === "sampul" ? "gelap" : s.latar ?? null; };
  for (let j = 1; j < hasil.length; j++) {
    const a = hasil[j - 1];
    if (a.jenis !== "isi" || wajib(a) || latarDi(j) !== a.latar) continue;
    const ganti = putaran.find((l) => l !== latarDi(j) && l !== latarDi(j - 2) && !(l === "aksen" && adaMasalah(a)));
    if (ganti) hasil[j - 1] = { ...a, latar: ganti };
  }
  return hasil;
}

export type BarisDaftar = {
  kunci: string;
  nama: string;
  judul: string;
  saran: string;
  /** Tampil di deck: tidak disembunyikan dan punya isi. */
  tampil: boolean;
  disembunyikan: boolean;
  /** Slide yang belum punya isi (Usulan tanpa baris, slide teks tanpa poin). */
  kosong: boolean;
  tambahan: "pertanyaan" | "teks" | null;
};

export type HasilSusun = { deck: Deck; daftar: BarisDaftar[]; absen: SlideAbsen[]; semua: Record<string, Slide> };

export function susunDeck(b: BahanLaporan, config: ConfigLaporan): HasilSusun {
  const hitung: Partial<Record<KunciBawaan, HasilSlide>> = {
    corong: slideCorong(b),
    kelompok: slideKelompok(b),
    sesi: slideSesi(b),
    portal: slidePortal(b),
    kepuasan: slideKepuasan(b),
    pengumuman: slidePengumuman(b),
    undian: slideUndian(b),
    operasional: slideOperasional(b),
    usulan: slideUsulan(b, config.usulan),
    lampiran: slideLampiran(b),
  };
  const titik = titikSlide(b);
  hitung.harih = slidePembatas(b, titik);
  hitung.panas = slidePanas(b, titik);
  const namaTitik = new Map(titik.map((h) => [kunciTitik(h.s), `Check-in point: ${h.s.nama}`]));
  const absen: SlideAbsen[] = [];
  const isi = new Map<string, { slide: SlideHitung; bobot: number; temuan: string | null; tambahan: BarisDaftar["tambahan"] }>();
  for (const [kunci, hasil] of Object.entries(hitung) as Array<[KunciBawaan, HasilSlide]>) {
    if (hasil.ada) isi.set(kunci, { slide: hasil.slide, bobot: hasil.bobot, temuan: hasil.temuan, tambahan: null });
    else absen.push({ kunci, nama: hasil.nama, alasan: hasil.alasan });
  }
  for (const h of titik) {
    const hasil = slideTitik(b, h);
    isi.set(hasil.slide.kunci, { slide: hasil.slide, bobot: hasil.bobot, temuan: hasil.temuan, tambahan: null });
  }
  for (const t of config.tambahan) {
    const slide = slideTambahan(b, t);
    if (slide) isi.set(t.id, { slide, bobot: 0, temuan: null, tambahan: t.jenis });
    else absen.push({ kunci: t.id, nama: "Chart from a question", alasan: "The question no longer exists" });
  }

  const sembunyi = new Set(config.sembunyi);
  const urutan = urutkan(config, [...namaTitik.keys()]);
  const kosong = (s: SlideHitung) => s.blok.length === 0;
  const tampil = (kunci: string) => kunci === "sampul" || kunci === "ringkas" || (isi.has(kunci) && !sembunyi.has(kunci) && !kosong(isi.get(kunci)!.slide));

  // Nomor slide di deck akhir, untuk rujukan "slide 6" di Ringkasan.
  const nomor = new Map<string, number>();
  urutan.filter((k) => tampil(k) && (k !== "ringkas" || !sembunyi.has("ringkas"))).forEach((k, i) => nomor.set(k, i + 1));
  const temuan = [...isi]
    .filter(([k, v]) => nomor.has(k) && v.temuan && v.bobot > 0)
    .sort((a, c) => c[1].bobot - a[1].bobot)
    .slice(0, 3)
    .map(([k, v]) => ({ teks: v.temuan!, slide: nomor.get(k)! }));
  const ringkas = slideRingkas(b, temuan);
  if (ringkas.ada) isi.set("ringkas", { slide: ringkas.slide, bobot: 0, temuan: null, tambahan: null });
  else absen.push({ kunci: "ringkas", nama: ringkas.nama, alasan: ringkas.alasan });

  const akhir = (kunci: string, s: SlideHitung): SlideIsi => ({ ...s, judul: config.judul[kunci] ?? s.saran, catatan: config.catatan[kunci] ?? null });
  const semua: Record<string, Slide> = { sampul: slideSampul(b) };
  for (const [k, v] of isi) semua[k] = akhir(k, v.slide);

  const daftar: BarisDaftar[] = urutan
    .filter((k) => k in semua)
    .map((k) => {
      const s = semua[k];
      const v = isi.get(k);
      const nama = (NAMA_ADMIN as Record<string, string>)[k] ?? namaTitik.get(k) ?? (v?.tambahan === "teks" ? "Text slide" : "Chart from a question");
      return {
        kunci: k,
        nama,
        judul: s.judul,
        saran: s.jenis === "isi" ? s.saran : s.judul,
        tampil: k === "sampul" || (!sembunyi.has(k) && !!v && !kosong(v.slide)),
        disembunyikan: sembunyi.has(k),
        kosong: !!v && kosong(v.slide),
        tambahan: v?.tambahan ?? null,
      };
    });

  // Permukaan dihitung atas deck yang tampil; slide tersembunyi (pratinjau admin) memakai kertas.
  const slide = pasangLatar(daftar.filter((d) => d.tampil).map((d) => semua[d.kunci]), aksenTerbaca(b.acara.tema));
  for (const s of slide) semua[s.kunci] = s;
  for (const [k, s] of Object.entries(semua)) if (s.jenis === "isi" && !s.latar) semua[k] = { ...s, latar: s.tata === "pembatas" ? "gelap" : "kertas" };
  return {
    deck: { bahasa: b.acara.bahasa, tema: b.acara.tema, nama: b.acara.nama, dibuat: b.sekarang, slide },
    daftar,
    absen,
    semua,
  };
}
