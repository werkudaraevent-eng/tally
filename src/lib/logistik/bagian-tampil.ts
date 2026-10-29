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

/** Perubahan per bagian dari satu layar: true = tampilkan, false = sembunyikan. */
export type UbahBagian = Partial<Record<BagianLogistik, boolean>>;

/**
 * Terapkan perubahan per bagian ke simpanan TERKINI di server. Layar admin
 * mengirim hanya bagian yang diubahnya, bukan seluruh daftar: dua tab
 * (Participant area dan Logistics > Vehicles) yang dimuat pada waktu berbeda
 * tidak saling menimpa bagian yang tidak mereka sentuh.
 */
export function terapkanBagian(sekarang: readonly string[] | null | undefined, ubah: UbahBagian): BagianLogistik[] {
  const sembunyi = bagianTersembunyi({ hide_logistics: sekarang ?? [] });
  for (const bagian of BAGIAN_LOGISTIK) {
    if (ubah[bagian] === true) sembunyi.delete(bagian);
    else if (ubah[bagian] === false) sembunyi.add(bagian);
  }
  return BAGIAN_LOGISTIK.filter((bagian) => sembunyi.has(bagian));
}

/** Bagian yang berbeda antara simpanan yang dimuat dan pilihan di layar. */
export function bedaBagian(dimuat: readonly string[] | null | undefined, pilihan: readonly string[] | null | undefined): UbahBagian {
  const lama = bagianTersembunyi({ hide_logistics: dimuat ?? [] });
  const baru = bagianTersembunyi({ hide_logistics: pilihan ?? [] });
  const ubah: UbahBagian = {};
  for (const bagian of BAGIAN_LOGISTIK) if (lama.has(bagian) !== baru.has(bagian)) ubah[bagian] = !baru.has(bagian);
  return ubah;
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
