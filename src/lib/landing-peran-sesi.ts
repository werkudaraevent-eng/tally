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
function peranSesi(speaker: LandingSpeaker, id: number): string | undefined {
  const peran = speaker.session_refs?.find((ref) => ref.id === id)?.role?.trim();
  return peran || undefined;
}

/**
 * Pembicara satu baris rundown seperti yang tampil di baris itu: salinan dengan
 * `role` diganti peran sesinya bila diisi, lalu moderator lebih dulu (urutan
 * editor tetap di dalam tiap kelompok). Moderator dikenali dari peran yang
 * berlaku: peran sesi, selain itu peran utama.
 *
 * Pembicara tanpa peran sesi dikembalikan sebagai objek yang sama.
 */
export function pembicaraDiSesi(orang: LandingSpeaker[], id: number): LandingSpeaker[] {
  const salinan = orang.map((speaker) => {
    const peran = peranSesi(speaker, id);
    return peran ? { ...speaker, role: peran } : speaker;
  });
  const moderator = salinan.filter((speaker) => kunciPeran(speaker.role) === "moderator");
  if (moderator.length === 0 || moderator.length === salinan.length) return salinan;
  return [...moderator, ...salinan.filter((speaker) => !moderator.includes(speaker))];
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
