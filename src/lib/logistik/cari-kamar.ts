/**
 * Mencari kamar dengan nomor yang diketik di dialog Stays (Logistik).
 */
type KamarDicari = { room_number: string | null; label?: string | null };

/** Huruf kecil tanpa spasi ganda: "  1208 " sama dengan "1208". */
export const kunciKamar = (teks: string) => teks.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Opsi yang cocok dengan kata yang diketik: nomor atau label kamar memuat kata
 * itu. `buat` = nomor baru yang boleh dibuat, yaitu kata yang tidak sama persis
 * dengan nomor atau label kamar mana pun di hotel ini (database juga menolak
 * nomor ganda per hotel), paling panjang 40 huruf seperti kolom di tab Rooms.
 */
export function saringKamar<T extends { kamar: KamarDicari }>(opsi: T[], cari: string): { cocok: T[]; buat: string | null } {
  const kunci = kunciKamar(cari);
  if (!kunci) return { cocok: opsi, buat: null };
  const nilai = (k: KamarDicari) => [k.room_number, k.label ?? null].filter((x): x is string => x !== null).map(kunciKamar);
  const cocok = opsi.filter(({ kamar }) => nilai(kamar).some((x) => x.includes(kunci)));
  const sama = opsi.some(({ kamar }) => nilai(kamar).includes(kunci));
  const nomor = cari.trim().replace(/\s+/g, " ");
  return { cocok, buat: sama || nomor.length > 40 ? null : nomor };
}
