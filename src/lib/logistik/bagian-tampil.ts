/**
 * Bagian Logistik yang dibagikan ke peserta (Participant area > Logistics).
 * `show_logistics` tetap sakelar induknya; `hide_logistics` menyimpan bagian
 * yang dimatikan. Kosong = semua bagian tampil, sama dengan sebelum pilihan
 * ini ada, jadi acara lama tidak berubah satu piksel pun.
 */

export const BAGIAN_LOGISTIK = ["rooms", "vehicles", "trains", "items"] as const;
export type BagianLogistik = (typeof BAGIAN_LOGISTIK)[number];

type Setelan = { show_logistics?: boolean; hide_logistics?: readonly string[] | null } | null | undefined;

/** Bagian ini sampai ke peserta: sakelar induk menyala dan bagiannya tidak dimatikan. */
export function bagianTampil(member: Setelan, bagian: BagianLogistik): boolean {
  return member?.show_logistics === true && !(member.hide_logistics ?? []).includes(bagian);
}

/** Bagian yang disembunyikan, dibaca aman dari JSON tersimpan. */
export function bagianTersembunyi(member: Setelan): Set<BagianLogistik> {
  const isi = Array.isArray(member?.hide_logistics) ? member.hide_logistics : [];
  return new Set(BAGIAN_LOGISTIK.filter((bagian) => isi.includes(bagian)));
}

/** Masih ada bagian yang tampil. Mati semua sama dengan sakelar induk mati. */
export function adaLogistikTampil(member: Setelan): boolean {
  return BAGIAN_LOGISTIK.some((bagian) => bagianTampil(member, bagian));
}

type Logistik = {
  lodging: unknown | null;
  stays: unknown[];
  transport: unknown | null;
  items: unknown[];
  trains: unknown[];
  buses: unknown[];
};

/**
 * Kosongkan bagian yang disembunyikan sebelum data sampai ke halaman peserta:
 * kartu, baris Beranda, pengingat Berikutnya, dan tab Perjalanan membaca data
 * ini, jadi semuanya ikut hilang tanpa sakelar di setiap layar.
 */
export function saringBagian<T extends Logistik>(logistik: T, sembunyi: ReadonlySet<BagianLogistik>): T {
  if (sembunyi.size === 0) return logistik;
  return {
    ...logistik,
    ...(sembunyi.has("rooms") ? { lodging: null, stays: [] } : {}),
    ...(sembunyi.has("vehicles") ? { transport: null, buses: [] } : {}),
    ...(sembunyi.has("trains") ? { trains: [] } : {}),
    ...(sembunyi.has("items") ? { items: [] } : {}),
  };
}
