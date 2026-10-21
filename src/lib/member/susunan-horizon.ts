import { memberHomeOrder, slotPengumumanHorizon, type LandingMemberConfig } from "../domain.ts";
import { rapikanHorizon as rapikan } from "./aturan-horizon.ts";

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
 * Announcements (paling atas, setelah Next up, atau setelah Bus and room) dan
 * urutan blok. Simpanan itu dibaca dengan aturan lama, jadi acara yang belum
 * disentuh tidak bergeser satu piksel pun.
 *
 * Aturan tempat tetap ada di aturan-horizon.ts. Impor runtimenya hanya
 * domain.ts dan aturan-horizon.ts, jadi bisa diuji langsung oleh Node
 * (susunan-horizon.check.ts).
 */

/** Isi bawaan Beranda Horizon, dalam urutan bawaannya. */
export const ISI_HORIZON = ["announcements", "next", "outfit", "checkpoints", "logistics", "roommates", "help"] as const;

const BEBAS = ["announcements", "next", "outfit", "checkpoints", "logistics"];

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

export { TETAP_HORIZON, letakkanHorizon, pindahHorizon } from "./aturan-horizon.ts";
