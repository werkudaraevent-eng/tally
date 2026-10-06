import type { LandingSpeaker } from "./domain";
import type { AgendaItem, AgendaPreview } from "./landing-agenda";
import { pembicaraDiSesi, pembicaraSesiLama } from "./landing-peran-sesi";

/**
 * Pengelompokan pembicara menjadi tab untuk bagian Pembicara halaman acara.
 *
 * Murni data, tanpa tampilan, supaya setiap tata letak (Modern, Forum) memakai
 * aturan yang sama: Sorotan paling banyak 8 kartu, sisanya di tab sesi.
 *
 * - "Sorotan": pembicara yang ditandai Tonjolkan, paling banyak 8. Tanpa satu
 *   pun yang ditandai, tab ini tidak ada dan tab sesi pertama yang terbuka:
 *   Sorotan yang diisi sendiri dari daftar terbaca sebagai pilihan admin.
 * - Satu tab per baris rundown yang dipegang pembicara (`speaker.session_refs`,
 *   atau sesi teks lama yang cocok dengan awal judulnya), urut rundown. Sesi
 *   teks lama yang tidak ada di rundown menyusul, urut kemunculan.
 * - "Pembicara lain": pembicara tanpa sesi yang tidak masuk Sorotan.
 *
 * Tanpa sesi dan tanpa yang ditonjolkan, hasilnya satu tab ("Pembicara lain")
 * berisi semua pembicara, dan tampilan tidak perlu menggambar baris tab.
 */
export const SOROTAN_MAKS = 8;

export type SpeakerTab = {
  key: string;
  label: string;
  /** Jam dan judul sesi dari rundown, mis. "09.45–10.30 · Kerangka global ...". */
  note: string | null;
  /** Judul utuh bila label dipotong, untuk atribut `title` tab. */
  fullTitle?: string;
  speakers: LandingSpeaker[];
};

function normal(teks: string): string {
  return teks.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Label sesi pembicara cocok dengan judul baris rundown bila judulnya diawali label itu, mis. "Sesi 1" dengan "Sesi 1. Kerangka global ...". */
export function cocokSesi(label: string, judulRundown: string): boolean {
  const kunci = normal(label);
  const judul = normal(judulRundown);
  if (!kunci) return false;
  return judul === kunci || judul.startsWith(`${kunci}.`) || judul.startsWith(`${kunci}:`) || judul.startsWith(`${kunci},`) || judul.startsWith(`${kunci} `);
}

/** Pembicara yang sesinya dari rundown (`session_refs`), bukan teks lama. */
export function sesiDariRundown(speaker: LandingSpeaker): boolean {
  return speaker.session_refs !== undefined;
}

function semuaBaris(agenda: AgendaPreview[]): AgendaItem[] {
  return agenda.flatMap((bagian) => bagian.items);
}

/**
 * Baris rundown seorang pembicara, urut seperti di rundown. `session_refs` bila
 * ada; selain itu sesi teks lama dicocokkan ke awal judul Indonesia, baris
 * pertama yang cocok, sama dengan aturan sebelum sesi dipilih dari rundown. Id
 * yang barisnya tidak ada lagi di rundown, atau sudah menjadi jeda, diabaikan
 * (editor menandainya untuk dipilih ulang).
 */
export function barisPembicara(speaker: LandingSpeaker, agenda: AgendaPreview[]): AgendaItem[] {
  const baris = semuaBaris(agenda);
  if (sesiDariRundown(speaker)) {
    const ids = new Set(speaker.session_refs!.map((ref) => ref.id));
    return baris.filter((item) => ids.has(item.id) && !item.jeda);
  }
  const label = speaker.session?.trim();
  const cocok = label ? baris.find((item) => cocokSesi(label, item.key)) : undefined;
  return cocok ? [cocok] : [];
}

const LABEL_MAKS = 24;

/**
 * Label pendek baris rundown untuk tab dan chip: awalan sebelum ". " atau ": "
 * bila panjangnya 2-24 huruf ("Sesi 1. Kerangka global" menjadi "Sesi 1"),
 * selain itu judul utuh, dipotong di 24 huruf. Di halaman English judulnya
 * sudah English, jadi labelnya ikut.
 */
export function labelSesi(judul: string): string {
  const bersih = judul.trim();
  const awalan = bersih.match(/^([^.:]{2,24})[.:]\s+\S/);
  if (awalan) return awalan[1].trim();
  return bersih.length > LABEL_MAKS ? `${bersih.slice(0, LABEL_MAKS - 1).trimEnd()}…` : bersih;
}

const JEDA = /\b(registrasi|daftar ulang|makan siang|makan pagi|ishoma|istirahat|rehat|coffee break|rehat kopi|penutupan|registration|lunch|break|closing)\b/i;

/**
 * Baris jeda rundown (registrasi, makan siang, penutupan): ditulis tenang di
 * Susunan acara supaya sesi inti menonjol. Dikenali dari kata kuncinya dan
 * tanpa pembicara, bukan dari keterangan yang kosong.
 */
export function barisJeda(judulRundown: string, jumlahPembicara: number): boolean {
  return jumlahPembicara === 0 && JEDA.test(judulRundown);
}

/**
 * Jumlah sesi untuk angka "12 sesi": baris rundown tanpa jeda. Registrasi,
 * makan siang, dan penutupan bukan sesi bagi tamu, dan Susunan acara pun
 * menulisnya tenang. Aturannya sama dengan baris tenang itu.
 */
export function jumlahSesi(items: AgendaItem[], speakers: LandingSpeaker[]): number {
  return items.filter((item) => {
    if (item.jeda) return false;
    const orang = pembicaraSesi(speakers, item).length;
    return !barisJeda(item.key, orang) && !barisJeda(item.title, orang);
  }).length;
}

/**
 * Pembicara satu baris rundown, untuk deret foto di baris itu. Aturannya sama
 * dengan tab Pembicara (barisPembicara), jadi kedua bagian selalu sepakat.
 * Judul saja (string) hanya mencocokkan sesi teks lama.
 */
export function pembicaraSesi(all: LandingSpeaker[], baris: AgendaItem | string): LandingSpeaker[] {
  const ada = all.filter((speaker) => speaker.name?.trim());
  if (typeof baris === "string") {
    return pembicaraSesiLama(ada.filter((speaker) => !sesiDariRundown(speaker) && speaker.session?.trim() && cocokSesi(speaker.session, baris)));
  }
  // Dengan peran sesi baris ini dan moderator lebih dulu, sama dengan tab sesinya.
  return pembicaraDiSesi(
    ada.filter((speaker) =>
      sesiDariRundown(speaker)
        ? !baris.jeda && speaker.session_refs!.some((ref) => ref.id === baris.id)
        : !!speaker.session?.trim() && cocokSesi(speaker.session, baris.key),
    ),
    baris.id,
  );
}

/**
 * Label tab dalam bahasa halaman. `sesi` memetakan sesi teks lama (huruf kecil)
 * ke label English-nya. Tab baris rundown memakai judul rundown bahasa halaman;
 * selama baris itu belum punya judul English, label English lama pembicaranya
 * ("Session 1") tetap dipakai, supaya halaman English tidak kembali ke
 * Indonesia saat sesi dihubungkan ke rundown.
 */
export type SpeakerTabLabels = { highlights: string; others: string; sesi?: ReadonlyMap<string, string> };

const LABEL_BAWAAN: SpeakerTabLabels = { highlights: "Sorotan", others: "Pembicara lain" };

export function speakerTabs(all: LandingSpeaker[], agenda: AgendaPreview[] = [], labels: SpeakerTabLabels = LABEL_BAWAAN): SpeakerTab[] {
  const speakers = all.filter((speaker) => speaker.name?.trim());
  if (speakers.length === 0) return [];

  const sorotan = speakers.filter((speaker) => speaker.featured).slice(0, SOROTAN_MAKS);

  const barisnya = new Map(speakers.map((speaker) => [speaker, barisPembicara(speaker, agenda)]));
  const tabs: SpeakerTab[] = sorotan.length > 0 ? [{ key: "sorotan", label: labels.highlights, note: null, speakers: sorotan }] : [];

  // Satu tab per baris rundown yang dipegang paling tidak satu pembicara, urut
  // rundown. Pembicara beberapa sesi tampil di tiap tab sesinya, urut editor,
  // dengan peran sesi itu dan moderator lebih dulu.
  const sesi = agenda.flatMap((bagian) =>
    bagian.items
      .map((item) => ({ item, bagian, orang: pembicaraDiSesi(speakers.filter((speaker) => barisnya.get(speaker)!.includes(item)), item.id) }))
      .filter(({ orang }) => orang.length > 0),
  );
  const labelTab = ({ item, orang }: { item: AgendaItem; orang: LandingSpeaker[] }): string => {
    const lama =
      item.title === item.key
        ? orang
            .map((speaker) => speaker.session?.trim())
            .filter((nama): nama is string => !!nama && cocokSesi(nama, item.key))
            .map((nama) => labels.sesi?.get(nama.toLowerCase()))
            .find(Boolean)
        : undefined;
    return lama ?? labelSesi(item.title);
  };
  const daftarLabel = sesi.map(labelTab);
  const kembar = new Set(daftarLabel.filter((label, index, semua) => semua.indexOf(label) !== index));
  for (const [urutan, { item, bagian, orang }] of sesi.entries()) {
    const label = daftarLabel[urutan];
    const jam = item.end && item.end !== item.time ? `${item.time}–${item.end}` : item.time;
    // Judul tanpa awalan yang sudah jadi label; judul yang dipotong ditulis utuh.
    // Awalan judul baris itu sendiri, bukan label tab: label bisa "Session 1"
    // (en.session lama) sementara judulnya masih "Sesi 1. ...".
    const awal = labelSesi(item.title);
    const sisa = item.title.trim().startsWith(awal) ? item.title.trim().slice(awal.length).replace(/^[.:]\s*/, "").trim() : item.title.trim();
    tabs.push({
      key: `sesi-${item.id}`,
      label: kembar.has(label) && bagian.hari ? `${label} · ${bagian.hari}` : label,
      note: [jam, sisa].filter(Boolean).join(" · "),
      fullTitle: label.endsWith("…") ? item.title.trim() : undefined,
      speakers: orang,
    });
  }

  // Sesi teks lama yang tidak cocok dengan rundown: tab sendiri, urut kemunculan.
  const yatim = speakers.filter((speaker) => barisnya.get(speaker)!.length === 0 && !sesiDariRundown(speaker) && speaker.session?.trim());
  const namaYatim: string[] = [];
  for (const speaker of yatim) {
    const nama = speaker.session!.trim();
    if (!namaYatim.some((ada) => normal(ada) === normal(nama))) namaYatim.push(nama);
  }
  for (const nama of namaYatim) {
    tabs.push({
      key: `sesi-${normal(nama)}`,
      label: labels.sesi?.get(nama.toLowerCase()) ?? nama,
      note: null,
      speakers: pembicaraSesiLama(yatim.filter((speaker) => normal(speaker.session!) === normal(nama))),
    });
  }

  const lainnya = speakers.filter((speaker) => barisnya.get(speaker)!.length === 0 && !yatim.includes(speaker) && !sorotan.includes(speaker));
  if (lainnya.length > 0) tabs.push({ key: "lainnya", label: labels.others, note: null, speakers: lainnya });
  return tabs;
}

/** Jumlah lembaga berbeda, untuk judul "30 pembicara dari 18 lembaga". */
export function jumlahLembaga(all: LandingSpeaker[]): number {
  return new Set(all.map((speaker) => normal(speaker.company ?? "")).filter(Boolean)).size;
}
