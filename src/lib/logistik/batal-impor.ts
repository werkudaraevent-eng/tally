/**
 * "Undo this import" untuk impor Hotel stays: logika murni, tanpa database.
 *
 * Saat impor disimpan, route menyimpan `before` (kamar dan stay yang akan
 * disentuh, persis sebelum ditulis) dan `after` (keadaan yang sama sesudahnya).
 * Undo menulis `before` kembali, tetapi hanya untuk kamar dan orang yang
 * keadaannya sekarang masih sama dengan `after`. Yang sudah diubah orang lain
 * sesudah impor dibiarkan dan disebut di hasil, supaya undo tidak menimpa
 * pekerjaan yang lebih baru.
 */

/** Kolom kamar yang diubah impor dan dikembalikan undo. */
export const KOLOM_UBAH = ["room_number", "label", "room_type", "bed_type"] as const;
/** Kolom yang ditulis ulang saat kamar yang dihapus impor dibuat kembali. */
export const KOLOM_BUAT = ["hotel_id", "room_number", "label", "room_type", "bed_type", "capacity", "floor", "check_in_at", "check_out_at", "notes"] as const;

export type KamarJejak = {
  id: number;
  hotel_id: number;
  room_number: string | null;
  label?: string | null;
  room_type?: string | null;
  bed_type?: string | null;
  capacity?: number | null;
  floor?: string | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
  notes?: string | null;
};
export type StayJejak = { hotel_id: number; room_id: number | null; check_in_at: string | null; check_out_at: string | null };

export type Sebelum = { rooms: KamarJejak[]; stays: Record<string, StayJejak[]> };
export type Sesudah = Sebelum & { rooms_created: number[]; hotels_created: number[]; rooms_deleted: number[] };

/** Satu stay tersimpan (`lodging_assignments`) menjadi bentuk jejak. */
export const jejakStay = (s: { hotel_id: number; room_id: number | null; check_in_at?: string | null; check_out_at?: string | null }): StayJejak => ({
  hotel_id: Number(s.hotel_id),
  room_id: s.room_id === null ? null : Number(s.room_id),
  check_in_at: s.check_in_at ?? null,
  check_out_at: s.check_out_at ?? null,
});

/** Stay dikelompokkan per orang; orang tanpa stay tetap ada dengan daftar kosong. */
export function staysPerOrang(ids: Iterable<string>, lodging: Array<{ participant_id: string; hotel_id: number; room_id: number | null; check_in_at?: string | null; check_out_at?: string | null }>): Record<string, StayJejak[]> {
  const hasil: Record<string, StayJejak[]> = {};
  for (const id of ids) hasil[id] = [];
  for (const s of lodging) if (Object.hasOwn(hasil, s.participant_id)) hasil[s.participant_id].push(jejakStay(s));
  return hasil;
}

const waktu = (nilai: string | null | undefined) => {
  if (!nilai) return "";
  const t = Date.parse(nilai);
  return Number.isNaN(t) ? nilai : String(t);
};
const kunciStay = (s: StayJejak) => `${s.hotel_id}|${s.room_id ?? ""}|${waktu(s.check_in_at)}|${waktu(s.check_out_at)}`;

/** Dua daftar stay sama, tanpa memandang urutan dan bentuk penulisan waktu. */
export function staySama(a: StayJejak[] | undefined, b: StayJejak[] | undefined): boolean {
  const x = (a ?? []).map(kunciStay).sort();
  const y = (b ?? []).map(kunciStay).sort();
  return x.length === y.length && x.every((k, i) => k === y[i]);
}

const teks = (nilai: unknown) => (nilai === undefined || nilai === null || nilai === "" ? null : String(nilai));
/** Kamar sama di kolom yang diubah impor. */
export const kamarSama = (a: KamarJejak, b: KamarJejak) => Number(a.hotel_id) === Number(b.hotel_id) && KOLOM_UBAH.every((k) => teks(a[k]) === teks(b[k]));

export type RencanaBatal = {
  /** Kamar yang kolomnya dikembalikan ke `before`. */
  kamarKembali: KamarJejak[];
  /** Kamar di kamarKembali yang diberi label sementara dulu (lihat route). */
  duaTahap: number[];
  /** Kamar yang dihapus impor dan dibuat kembali (id lama, isinya dari `before`). */
  kamarBuatLagi: KamarJejak[];
  /** Stay per orang yang ditulis kembali; room_id menunjuk id lama sampai dipetakan. */
  stays: Array<{ participant_id: string; stays: StayJejak[] }>;
  /** Kamar dan hotel yang dibuat impor, dihapus bila sesudah undo kosong. */
  kamarHapus: number[];
  hotelHapus: number[];
  /** Dibiarkan karena berubah sesudah impor. */
  orangDilewati: string[];
  kamarDilewati: number[];
};

/**
 * Menyusun rencana undo dari jejak dan keadaan sekarang.
 *
 * `sekarang.rooms`: kamar sekarang untuk id di jejak (yang sudah tidak ada
 * tidak disebut) ditambah kamar di hotel yang sama untuk memeriksa bentrok
 * nomor atau label. `sekarang.stays`: stay sekarang tiap orang di jejak.
 */
export function rencanaBatal(sebelum: Sebelum, sesudah: Sesudah, sekarang: { rooms: KamarJejak[]; stays: Record<string, StayJejak[]> }): RencanaBatal {
  const kini = new Map(sekarang.rooms.map((k) => [Number(k.id), k]));
  const lalu = new Map(sesudah.rooms.map((k) => [Number(k.id), k]));
  const dihapus = new Set(sesudah.rooms_deleted.map(Number));

  const kamarKembali: KamarJejak[] = [];
  const kamarBuatLagi: KamarJejak[] = [];
  const kamarDilewati: number[] = [];
  for (const awal of sebelum.rooms) {
    const id = Number(awal.id);
    if (dihapus.has(id)) {
      // Dihapus impor: dibuat lagi, kecuali id itu ternyata masih ada.
      if (kini.has(id)) kamarDilewati.push(id);
      else kamarBuatLagi.push(awal);
      continue;
    }
    const akhir = lalu.get(id);
    const ada = kini.get(id);
    if (!akhir || !ada || !kamarSama(ada, akhir)) { kamarDilewati.push(id); continue; }
    if (!kamarSama(awal, akhir)) kamarKembali.push(awal);
  }

  // Bentrok nomor atau label dengan kamar lain yang tidak ikut dikembalikan:
  // kamar itu dilewati, bukan menimpa milik orang lain.
  // Kamar yang dibuat impor juga tidak dihitung: kosong sesudah stay
  // dikembalikan lalu dihapus sebelum kolom kamar lama ditulis.
  const dibuatImpor = new Set(sesudah.rooms_created.map(Number));
  const ikut = new Set([...kamarKembali, ...kamarBuatLagi].map((k) => Number(k.id)));
  const kunci = (hotel: number, jenis: string, nilai: unknown) => `${hotel}|${jenis}|${String(nilai).replace(/\s+/g, " ").trim().toLowerCase()}`;
  const terpakai = new Set<string>();
  for (const k of sekarang.rooms) {
    if (ikut.has(Number(k.id)) || dibuatImpor.has(Number(k.id))) continue;
    if (teks(k.room_number)) terpakai.add(kunci(Number(k.hotel_id), "n", k.room_number));
    if (teks(k.label)) terpakai.add(kunci(Number(k.hotel_id), "l", k.label));
  }
  const bentrok = (k: KamarJejak) => (teks(k.room_number) !== null && terpakai.has(kunci(Number(k.hotel_id), "n", k.room_number)))
    || (teks(k.label) !== null && terpakai.has(kunci(Number(k.hotel_id), "l", k.label)));
  const saring = (daftar: KamarJejak[]) => daftar.filter((k) => {
    if (!bentrok(k)) return true;
    kamarDilewati.push(Number(k.id));
    return false;
  });
  const kembali = saring(kamarKembali);
  const buatLagi = saring(kamarBuatLagi);

  // Kamar yang akan ada sesudah undo: yang ada sekarang (kecuali yang dibuat
  // impor, sebab akan dihapus bila kosong) ditambah yang dibuat lagi.
  const tersedia = new Set([...kini.keys()].filter((id) => !dibuatImpor.has(id)));
  for (const k of buatLagi) tersedia.add(Number(k.id));

  const stays: RencanaBatal["stays"] = [];
  const orangDilewati: string[] = [];
  for (const [orang, awal] of Object.entries(sebelum.stays)) {
    const akhir = sesudah.stays[orang];
    if (staySama(awal, akhir)) continue;
    const ada = sekarang.stays[orang];
    if (!ada || !staySama(ada, akhir)) { orangDilewati.push(orang); continue; }
    // Kamar lamanya harus ada sesudah undo; kamar hapus-impor yang dilewati tidak.
    const bisa = awal.every((s) => s.room_id === null || tersedia.has(Number(s.room_id)));
    if (!bisa) { orangDilewati.push(orang); continue; }
    stays.push({ participant_id: orang, stays: awal });
  }

  // Kamar yang nomor atau label lamanya sekarang dipakai kamar lain di
  // rencana ini: dilepas dulu (label sementara) sebelum kamar lain dibuat lagi
  // atau ditulis, supaya tidak tertolak unik.
  const nilaiKini = new Map<string, number>();
  for (const k of sekarang.rooms) {
    const id = Number(k.id);
    if (!ikut.has(id) && !dibuatImpor.has(id)) continue;
    if (teks(k.room_number)) nilaiKini.set(kunci(Number(k.hotel_id), "n", k.room_number), id);
    if (teks(k.label)) nilaiKini.set(kunci(Number(k.hotel_id), "l", k.label), id);
  }
  const dipakaiLain = (k: KamarJejak, jenis: "n" | "l", nilai: unknown) => {
    if (teks(nilai) === null) return false;
    const pemilik = nilaiKini.get(kunci(Number(k.hotel_id), jenis, nilai));
    return pemilik !== undefined && pemilik !== Number(k.id);
  };
  const pakaiNilai = (k: KamarJejak) => dipakaiLain(k, "n", k.room_number) || dipakaiLain(k, "l", k.label);
  const butuhLepas = [...kembali, ...buatLagi].some(pakaiNilai);

  return {
    kamarKembali: kembali,
    duaTahap: butuhLepas ? kembali.map((k) => Number(k.id)) : [],
    kamarBuatLagi: buatLagi,
    stays,
    kamarHapus: [...dibuatImpor],
    hotelHapus: sesudah.hotels_created.map(Number),
    orangDilewati,
    kamarDilewati: [...new Set(kamarDilewati)],
  };
}

/** Label sementara saat kamar dikembalikan dua tahap (≤ 40 huruf, unik per kamar). */
export const labelSementara = (id: number) => `~undo ${id}`;
