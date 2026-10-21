import { memberHomeOrder, slotPengumumanHorizon, type LandingMemberConfig } from "../domain.ts";

/**
 * Urutan Beranda Gathering Horizon (Participant area > Participant home),
 * dipakai halaman peserta, daftar di CMS, dan seret di pratinjau, jadi
 * ketiganya selalu sepakat.
 *
 * Aturan (keputusan Mas 20 Okt): Next up paling atas, dan hanya Announcements
 * yang boleh di atasnya; Help card paling bawah; Roommates menempel tepat
 * sesudah Bus and room, karena teman sekamar tampil di kartu perjalanan.
 * Announcements, Today's outfit, Checkpoints, Bus and room, dan blok panitia
 * bebas diurutkan.
 *
 * Simpanan baru memuat "help" dan menyimpan urutan tampil apa adanya. Simpanan
 * lama (tanpa "help", dari sebelum seret di pratinjau) hanya bermakna tempat
 * Announcements: paling atas, setelah Next up, atau setelah Bus and room.
 * Simpanan itu dibaca dengan aturan lama, jadi acara yang belum disentuh tidak
 * bergeser satu piksel pun.
 *
 * Tanpa impor runtime selain domain.ts (hanya impor tipe), jadi bisa diuji
 * langsung oleh Node (susunan-horizon.check.ts).
 */

/** Isi bawaan Beranda Horizon, dalam urutan bawaannya. */
export const ISI_HORIZON = ["announcements", "next", "outfit", "checkpoints", "logistics", "roommates", "help"] as const;

/** Isi bawaan yang tempatnya tetap: tidak bisa diseret. */
export const TETAP_HORIZON: ReadonlySet<string> = new Set(["next", "roommates", "help"]);

const BEBAS = ["announcements", "next", "outfit", "checkpoints", "logistics"];

/** Aturan tempat tetap: Next up di atas (Announcements boleh di atasnya), Roommates sesudah Bus and room, Help card di bawah. */
function rapikan(urutan: readonly string[]): string[] {
  const posisiNext = urutan.indexOf("next");
  const posisiPengumuman = urutan.indexOf("announcements");
  const pengumumanDiAtas = posisiPengumuman >= 0 && (posisiNext < 0 || posisiPengumuman < posisiNext);
  const atas = pengumumanDiAtas ? ["announcements", "next"] : ["next"];
  const sisa = urutan.filter((id) => !atas.includes(id) && id !== "roommates" && id !== "help");
  const bus = sisa.indexOf("logistics");
  sisa.splice(bus < 0 ? sisa.length : bus + 1, 0, "roommates");
  return [...atas, ...sisa, "help"];
}

/** Simpanan baru: memuat "help". Tanpa itu simpanan dibaca dengan aturan lama. */
export function simpananBebas(home: LandingMemberConfig["home"]): boolean {
  return (home?.order ?? []).includes("help");
}

/**
 * Urutan tampil Beranda Horizon (ponsel) dari simpanan: isi bawaan
 * (ISI_HORIZON) dan blok peserta `blok`, masing-masing sekali.
 */
export function urutanHorizon(home: LandingMemberConfig["home"], blok: readonly string[]): string[] {
  if (!simpananBebas(home)) {
    // Simpanan lama: dibaca persis seperti Beranda sebelum seret di pratinjau.
    const lama = memberHomeOrder(home, blok, true).order;
    const slot = slotPengumumanHorizon(lama);
    return rapikan([
      ...(slot === 1 || slot === 2 ? [] : ["announcements"]),
      "next",
      ...(slot === 2 ? ["announcements"] : []),
      "outfit",
      "checkpoints",
      "logistics",
      ...(slot === 1 ? ["announcements"] : []),
      ...lama.filter((id) => blok.includes(id)),
    ]);
  }
  const dikenal = new Set<string>([...ISI_HORIZON, ...blok]);
  const hasil = [...new Set((home?.order ?? []).filter((id) => dikenal.has(id) && id !== "roommates" && id !== "help"))];
  // Isi bawaan yang belum ada di simpanan masuk di tempat bawaannya; blok baru di bawah.
  BEBAS.forEach((id, index) => {
    if (hasil.includes(id)) return;
    const sesudah = BEBAS.slice(index + 1).find((lain) => hasil.includes(lain));
    hasil.splice(sesudah ? hasil.indexOf(sesudah) : hasil.length, 0, id);
  });
  for (const id of blok) if (!hasil.includes(id)) hasil.push(id);
  return rapikan(hasil);
}

/**
 * Urutan sesudah `id` dipindah ke indeks `ke` di urutan tampil. Isi bertempat
 * tetap tidak bergerak; tujuan yang melanggar aturan dirapikan (di atas Next
 * up menjadi tepat di bawahnya, kecuali Announcements; di bawah Help card
 * menjadi tepat di atasnya).
 */
export function pindahHorizon(urutan: readonly string[], id: string, ke: number): string[] {
  const dari = urutan.indexOf(id);
  if (dari < 0 || TETAP_HORIZON.has(id)) return [...urutan];
  const hasil = urutan.filter((lain) => lain !== id);
  hasil.splice(Math.max(0, Math.min(ke, hasil.length)), 0, id);
  return rapikan(hasil);
}

/**
 * Seret di pratinjau: `id` diletakkan tepat sebelum `sebelum` (null = paling
 * bawah). Aturan tempat tetap sama dengan pindahHorizon.
 */
export function letakkanHorizon(urutan: readonly string[], id: string, sebelum: string | null): string[] {
  if (TETAP_HORIZON.has(id) || !urutan.includes(id) || id === sebelum) return [...urutan];
  const tanpa = urutan.filter((lain) => lain !== id);
  const ke = sebelum === null ? tanpa.length : tanpa.indexOf(sebelum);
  return pindahHorizon(urutan, id, ke < 0 ? tanpa.length : ke);
}
