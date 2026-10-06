import type { LandingSessionRef, LandingSpeaker } from "./domain";

/**
 * Peran pembicara per sesi (`session_refs[].role`): seseorang bisa Speaker di
 * Session 2 dan Moderator di breakout. Murni data, tanpa tampilan, supaya tab
 * Pembicara, deret foto rundown (Modern dan Forum), editor, dan tab EN memakai
 * aturan yang sama.
 *
 * Perannya teks bebas, bukan daftar di kode: saran di editor diambil dari peran
 * yang sudah dipakai di acara ini.
 */

/** Kunci pembanding peran: "Moderator", "moderator", dan "Moderator " sama. */
export function kunciPeran(teks: string | null | undefined): string {
  return (teks ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

/** Peran sesi yang diisi pada baris rundown ini, atau undefined (= peran utama). */
function entriBerperan(speaker: LandingSpeaker, id: number): LandingSessionRef | undefined {
  const entri = speaker.session_refs?.find((ref) => ref.id === id);
  return entri?.role?.trim() ? entri : undefined;
}

/**
 * Peran Indonesia yang berlaku, dasar urutan moderator. Di /en `role` sudah
 * teks English (resolveLanding), jadi teks Indonesianya dibawa di `role_id`:
 * urutan di /en sama dengan di halaman Indonesia.
 */
function peranId(speaker: LandingSpeaker, entri: LandingSessionRef | undefined): string | undefined {
  return entri ? entri.role_id ?? entri.role : speaker.role_id ?? speaker.role;
}

/** Moderator lebih dulu; urutan editor tetap di dalam tiap kelompok. */
function moderatorDulu<T>(orang: T[], peran: (item: T) => string | undefined): T[] {
  const moderator = orang.filter((item) => kunciPeran(peran(item)) === "moderator");
  if (moderator.length === 0 || moderator.length === orang.length) return orang;
  return [...moderator, ...orang.filter((item) => !moderator.includes(item))];
}

/** Pembicara tab sesi teks lama (tanpa baris rundown): hanya moderator lebih dulu. */
export function pembicaraSesiLama(orang: LandingSpeaker[]): LandingSpeaker[] {
  return moderatorDulu(orang, (speaker) => peranId(speaker, undefined));
}

/**
 * Pembicara satu baris rundown seperti yang tampil di baris itu: salinan dengan
 * `role` diganti peran sesinya bila diisi, lalu moderator lebih dulu (urutan
 * editor tetap di dalam tiap kelompok). Moderator dikenali dari peran
 * Indonesia yang berlaku: peran sesi, selain itu peran utama.
 *
 * Pembicara tanpa peran sesi dikembalikan sebagai objek yang sama.
 */
export function pembicaraDiSesi(orang: LandingSpeaker[], id: number): LandingSpeaker[] {
  const susun = orang.map((speaker) => {
    const entri = entriBerperan(speaker, id);
    return { tampil: entri ? { ...speaker, role: entri.role!.trim() } : speaker, peran: peranId(speaker, entri), pos: posisiDiSesi(speaker, id) };
  });
  // Urutan yang diatur admin menang; yang belum punya posisi menyusul, urut editor.
  if (susun.some((item) => item.pos !== undefined)) {
    return susun
      .map((item, urutan) => ({ item, urutan }))
      .sort((a, b) => (a.item.pos ?? Infinity) - (b.item.pos ?? Infinity) || a.urutan - b.urutan)
      .map(({ item }) => item.tampil);
  }
  return moderatorDulu(susun, (item) => item.peran).map((item) => item.tampil);
}

/** Posisi kiri-ke-kanan yang diatur admin untuk pembicara di baris rundown ini, bila ada. */
export function posisiDiSesi(speaker: LandingSpeaker, id: number): number | undefined {
  const pos = speaker.session_refs?.find((ref) => ref.id === id)?.pos;
  return typeof pos === "number" && Number.isFinite(pos) ? pos : undefined;
}

/**
 * Daftar pembicara setelah urutan satu baris rundown diatur: `urutan` berisi
 * pembicara sesi itu dari kiri ke kanan (objek dari `daftar`). Tiap entri sesi
 * itu mendapat `pos` 0..n-1; daftar dan sesi lain tidak berubah.
 */
export function aturUrutanSesi(daftar: LandingSpeaker[], id: number, urutan: LandingSpeaker[]): LandingSpeaker[] {
  return daftar.map((speaker) => {
    const pos = urutan.indexOf(speaker);
    if (pos < 0 || !speaker.session_refs?.some((ref) => ref.id === id)) return speaker;
    return { ...speaker, session_refs: speaker.session_refs.map((ref) => (ref.id === id ? { ...ref, pos } : ref)) };
  });
}

/**
 * Entri sesi setelah perannya diketik atau dipilih. Saran yang dipilih membawa
 * versi English-nya bila entri belum punya. Peran yang berubah tanpa English
 * baru membuang English lamanya: "Panelis" tidak boleh tampil "Moderator" di /en.
 */
export function ubahPeranEntri(entri: LandingSessionRef, role: string, en?: string): LandingSessionRef {
  if (en?.trim()) return { ...entri, role, en: { ...entri.en, role: entri.en?.role?.trim() && kunciPeran(entri.role) === kunciPeran(role) ? entri.en.role : en } };
  if (entri.en?.role !== undefined && kunciPeran(entri.role) !== kunciPeran(role)) {
    const { role: _lama, ...sisa } = entri.en;
    void _lama;
    return { ...entri, role, en: sisa };
  }
  return { ...entri, role };
}

export type SaranPeran = {
  /** Ejaan yang paling sering dipakai; seri dimenangkan yang lebih dulu di editor. */
  teks: string;
  kunci: string;
  /** Jumlah pembicara berbeda yang memakai peran ini. */
  pembicara: number;
  /** Nama pembicaranya bila hanya satu orang. */
  nama?: string;
  /** Versi English yang sudah diisi untuk peran ini, untuk diisikan saat dipilih. */
  en?: string;
};

/**
 * Saran peran untuk satu acara: peran utama dan peran sesi semua pembicara di
 * editor (termasuk yang belum disimpan). Urut paling banyak dipakai, lalu urut
 * kemunculan. `kecuali`: nilai kolom yang sedang diisi, tidak disarankan.
 */
export function saranPeran(speakers: LandingSpeaker[] | undefined, kecuali?: string): SaranPeran[] {
  type Kelompok = { ejaan: Map<string, number>; urutanEjaan: string[]; orang: Set<number>; nama: string; en?: string; pertama: number };
  const peta = new Map<string, Kelompok>();
  let urutan = 0;
  const catat = (teks: string | undefined, indeks: number, nama: string, en: string | undefined) => {
    const bersih = teks?.normalize("NFC").trim().replace(/\s+/g, " ");
    if (!bersih) return;
    const kunci = kunciPeran(bersih);
    let kelompok = peta.get(kunci);
    if (!kelompok) {
      kelompok = { ejaan: new Map(), urutanEjaan: [], orang: new Set(), nama, pertama: urutan++ };
      peta.set(kunci, kelompok);
    }
    if (!kelompok.ejaan.has(bersih)) kelompok.urutanEjaan.push(bersih);
    kelompok.ejaan.set(bersih, (kelompok.ejaan.get(bersih) ?? 0) + 1);
    kelompok.orang.add(indeks);
    if (!kelompok.en && en?.trim()) kelompok.en = en.trim();
  };
  (speakers ?? []).forEach((speaker, indeks) => {
    const nama = speaker.name?.trim() ?? "";
    catat(speaker.role, indeks, nama, speaker.en?.role);
    speaker.session_refs?.forEach((ref) => catat(ref.role, indeks, nama, ref.en?.role));
  });
  const buang = kunciPeran(kecuali);
  return [...peta.entries()]
    .filter(([kunci]) => kunci !== buang)
    .map(([kunci, kelompok]) => {
      const teks = kelompok.urutanEjaan.reduce((terbaik, ejaan) => ((kelompok.ejaan.get(ejaan) ?? 0) > (kelompok.ejaan.get(terbaik) ?? 0) ? ejaan : terbaik));
      return {
        hasil: { teks, kunci, pembicara: kelompok.orang.size, nama: kelompok.orang.size === 1 && kelompok.nama ? kelompok.nama : undefined, en: kelompok.en } satisfies SaranPeran,
        jumlah: [...kelompok.ejaan.values()].reduce((a, b) => a + b, 0),
        pertama: kelompok.pertama,
      };
    })
    .sort((a, b) => b.jumlah - a.jumlah || a.pertama - b.pertama)
    .map(({ hasil }) => hasil);
}

export type PeranSesiEn = { kunci: string; teks: string; en: string | undefined; /** Label sesi tempat peran ini dipakai, tanpa kembar. */ sesi: string[] };

/**
 * Peran sesi yang perlu diterjemahkan, satu per peran berbeda (bukan per
 * pembicara): sepuluh moderator cukup satu kolom "Moderator". `en` hanya bila
 * semua entri peran itu sepakat; berbeda-beda berarti undefined, supaya kolom
 * EN kosong dan pengisian berikutnya menyamakan semuanya.
 */
export function peranSesiUntukEn(speakers: LandingSpeaker[] | undefined): PeranSesiEn[] {
  const peta = new Map<string, { teks: string; en: Set<string>; sesi: string[] }>();
  for (const speaker of speakers ?? []) {
    for (const ref of speaker.session_refs ?? []) {
      const teks = ref.role?.trim();
      if (!teks) continue;
      const kunci = kunciPeran(teks);
      const kelompok = peta.get(kunci) ?? { teks, en: new Set<string>(), sesi: [] };
      kelompok.en.add(ref.en?.role?.trim() ?? "");
      if (ref.label && !kelompok.sesi.includes(ref.label)) kelompok.sesi.push(ref.label);
      peta.set(kunci, kelompok);
    }
  }
  return [...peta.entries()].map(([kunci, { teks, en, sesi }]) => ({ kunci, teks, en: en.size === 1 ? [...en][0] || undefined : undefined, sesi }));
}

/** Versi English satu peran sesi ditulis ke semua entri yang perannya sama. */
export function isiPeranSesiEn(speakers: LandingSpeaker[], kunci: string, en: string): LandingSpeaker[] {
  return speakers.map((speaker) =>
    speaker.session_refs?.some((ref) => ref.role?.trim() && kunciPeran(ref.role) === kunci)
      ? {
          ...speaker,
          session_refs: speaker.session_refs.map((ref) => (ref.role?.trim() && kunciPeran(ref.role) === kunci ? { ...ref, en: { ...ref.en, role: en } } : ref)),
        }
      : speaker,
  );
}

/**
 * Entri sesi baru setelah mencentang atau melepas: `dipilih` dalam urutan
 * rundown dengan label terkini, digabung dengan entri lamanya supaya peran
 * dan versi English-nya tidak hilang saat sesi lain dicentang.
 */
export function gabungEntriSesi(dipilih: LandingSessionRef[], lama: LandingSessionRef[]): LandingSessionRef[] {
  return dipilih.map((baru) => ({ ...lama.find((entri) => entri.id === baru.id), ...baru }));
}
