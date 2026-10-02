import type { LandingSpeaker } from "./domain";
import type { AgendaPreview } from "./landing-agenda";

/**
 * Pengelompokan pembicara menjadi tab untuk bagian Pembicara halaman acara.
 *
 * Murni data, tanpa tampilan, supaya setiap tata letak (Modern, Forum) memakai
 * aturan yang sama: paling banyak 8 kartu tampil sekaligus, sisanya di tab sesi.
 *
 * - "Sorotan": pembicara yang ditandai Tonjolkan, paling banyak 8. Tanpa tanda,
 *   8 pembicara pertama.
 * - Satu tab per sesi (`speaker.session`), urut seperti di rundown bila namanya
 *   cocok dengan awal judul sesi rundown, selain itu urut kemunculan.
 * - "Pembicara lain": pembicara tanpa sesi yang tidak masuk Sorotan.
 *
 * Tanpa sesi sama sekali dan paling banyak 8 pembicara, hasilnya satu tab saja
 * dan tampilan tidak perlu menggambar baris tab.
 */
export const SOROTAN_MAKS = 8;

export type SpeakerTab = {
  key: string;
  label: string;
  /** Jam dan judul sesi dari rundown, mis. "09.45–10.30 · Kerangka global ...". */
  note: string | null;
  speakers: LandingSpeaker[];
};

function normal(teks: string): string {
  return teks.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Label sesi pembicara cocok dengan judul baris rundown bila judulnya diawali label itu, mis. "Sesi 1" dengan "Sesi 1. Kerangka global ...". */
function cocok(label: string, judulRundown: string): boolean {
  const kunci = normal(label);
  const judul = normal(judulRundown);
  return judul === kunci || judul.startsWith(`${kunci}.`) || judul.startsWith(`${kunci}:`) || judul.startsWith(`${kunci},`) || judul.startsWith(`${kunci} `);
}

function cariSesi(label: string, agenda: AgendaPreview[]) {
  for (const bagian of agenda) {
    for (const item of bagian.items) {
      if (cocok(label, item.key)) return item;
    }
  }
  return null;
}

function urutanRundown(label: string, agenda: AgendaPreview[]): number {
  let posisi = 0;
  for (const bagian of agenda) {
    for (const item of bagian.items) {
      if (cocok(label, item.key)) return posisi;
      posisi += 1;
    }
  }
  return 1_000_000;
}

/**
 * Pembicara satu baris rundown, untuk deret foto di bawah judul sesi. Aturan
 * cocoknya sama dengan tab Pembicara, jadi kedua bagian selalu sepakat.
 */
export function pembicaraSesi(all: LandingSpeaker[], judulRundown: string): LandingSpeaker[] {
  return all.filter((speaker) => speaker.name?.trim() && speaker.session?.trim() && cocok(speaker.session, judulRundown));
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
 * Label tab dalam bahasa halaman. `sesi` memetakan kunci sesi Indonesia (huruf
 * kecil) ke labelnya; kuncinya sendiri tetap dipakai untuk mencocokkan rundown.
 */
export type SpeakerTabLabels = { highlights: string; others: string; sesi?: ReadonlyMap<string, string> };

const LABEL_BAWAAN: SpeakerTabLabels = { highlights: "Sorotan", others: "Pembicara lain" };

export function speakerTabs(all: LandingSpeaker[], agenda: AgendaPreview[] = [], labels: SpeakerTabLabels = LABEL_BAWAAN): SpeakerTab[] {
  const speakers = all.filter((speaker) => speaker.name?.trim());
  if (speakers.length === 0) return [];

  const ditonjolkan = speakers.filter((speaker) => speaker.featured);
  const sorotan = (ditonjolkan.length > 0 ? ditonjolkan : speakers).slice(0, SOROTAN_MAKS);

  const sesi: string[] = [];
  for (const speaker of speakers) {
    const label = speaker.session?.trim();
    if (label && !sesi.some((ada) => normal(ada) === normal(label))) sesi.push(label);
  }
  const kemunculan = new Map(sesi.map((label, index) => [label, index]));
  sesi.sort((a, b) => {
    const selisih = urutanRundown(a, agenda) - urutanRundown(b, agenda);
    return selisih !== 0 ? selisih : (kemunculan.get(a) ?? 0) - (kemunculan.get(b) ?? 0);
  });

  const tabs: SpeakerTab[] = [{ key: "sorotan", label: labels.highlights, note: null, speakers: sorotan }];
  for (const label of sesi) {
    const item = cariSesi(label, agenda);
    const jam = item ? (item.end && item.end !== item.time ? `${item.time}–${item.end}` : item.time) : null;
    const judul = item ? item.title.replace(/^[^.:]+[.:]\s*/, "").trim() : null;
    tabs.push({
      key: `sesi-${normal(label)}`,
      label: labels.sesi?.get(label.toLowerCase()) ?? label,
      note: item ? [jam, judul && judul !== item.title ? judul : item.title].filter(Boolean).join(" · ") : null,
      speakers: speakers.filter((speaker) => normal(speaker.session ?? "") === normal(label)),
    });
  }
  const lainnya = speakers.filter((speaker) => !speaker.session?.trim() && !sorotan.includes(speaker));
  if (lainnya.length > 0) tabs.push({ key: "lainnya", label: labels.others, note: null, speakers: lainnya });
  return tabs;
}

/** Jumlah lembaga berbeda, untuk judul "30 pembicara dari 18 lembaga". */
export function jumlahLembaga(all: LandingSpeaker[]): number {
  return new Set(all.map((speaker) => normal(speaker.company ?? "")).filter(Boolean)).size;
}
