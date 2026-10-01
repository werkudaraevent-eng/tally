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
 * - "Lainnya": pembicara tanpa sesi yang tidak masuk Sorotan.
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

/** Sesi rundown yang judulnya diawali label tab, mis. "Sesi 1" cocok dengan "Sesi 1. Kerangka global ...". */
function cariSesi(label: string, agenda: AgendaPreview[]) {
  const kunci = normal(label);
  for (const bagian of agenda) {
    for (const item of bagian.items) {
      const judul = normal(item.title);
      if (judul === kunci || judul.startsWith(`${kunci}.`) || judul.startsWith(`${kunci}:`) || judul.startsWith(`${kunci} `)) {
        return item;
      }
    }
  }
  return null;
}

function urutanRundown(label: string, agenda: AgendaPreview[]): number {
  let posisi = 0;
  const kunci = normal(label);
  for (const bagian of agenda) {
    for (const item of bagian.items) {
      const judul = normal(item.title);
      if (judul === kunci || judul.startsWith(`${kunci}.`) || judul.startsWith(`${kunci}:`) || judul.startsWith(`${kunci} `)) return posisi;
      posisi += 1;
    }
  }
  return 1_000_000;
}

export function speakerTabs(all: LandingSpeaker[], agenda: AgendaPreview[] = []): SpeakerTab[] {
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

  const tabs: SpeakerTab[] = [{ key: "sorotan", label: "Sorotan", note: null, speakers: sorotan }];
  for (const label of sesi) {
    const item = cariSesi(label, agenda);
    const jam = item ? (item.end && item.end !== item.time ? `${item.time}–${item.end}` : item.time) : null;
    const judul = item ? item.title.replace(/^[^.:]+[.:]\s*/, "").trim() : null;
    tabs.push({
      key: `sesi-${normal(label)}`,
      label,
      note: item ? [jam, judul && judul !== item.title ? judul : item.title].filter(Boolean).join(" · ") : null,
      speakers: speakers.filter((speaker) => normal(speaker.session ?? "") === normal(label)),
    });
  }
  const lainnya = speakers.filter((speaker) => !speaker.session?.trim() && !sorotan.includes(speaker));
  if (lainnya.length > 0) tabs.push({ key: "lainnya", label: "Lainnya", note: null, speakers: lainnya });
  return tabs;
}

/** Jumlah lembaga berbeda, untuk judul "30 pembicara dari 18 lembaga". */
export function jumlahLembaga(all: LandingSpeaker[]): number {
  return new Set(all.map((speaker) => normal(speaker.company ?? "")).filter(Boolean)).size;
}
