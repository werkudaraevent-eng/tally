/**
 * Kunci bot nomor kamar: keputusan murni, tanpa database.
 *
 * Satu bot (mis. agen Telegram panitia) mengirim nama peserta + nomor kamar
 * dari foto kunci kamar di hari H. Bot TIDAK punya akun: ia memegang satu
 * kunci untuk satu acara (env), dan satu-satunya yang bisa ia tulis adalah
 * `lodging_rooms.room_number` untuk kamar yang SUDAH ada di Logistics.
 *
 * Bot membaca foto, jadi bacaannya bisa salah. Karena itu setiap keraguan
 * ditolak, bukan ditebak: nama kembar, nama tidak ketemu, peserta dengan lebih
 * dari satu kamar, kamar yang sudah bernomor lain, nomor yang sudah dipakai
 * kamar lain di hotel yang sama. Penolakan membawa pilihan supaya bot bisa
 * bertanya ke panitia lalu mengirim ulang dengan id yang dipilih.
 */

/** Nama untuk dicocokkan: huruf kecil, tanpa tanda baca dan diakritik, spasi tunggal. */
export function rapikanNama(nama: string): string {
  return nama
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export type PesertaBot = { id: string; name: string; company: string | null };

export type HasilCari =
  | { jenis: "satu"; peserta: PesertaBot }
  | { jenis: "kembar"; pilihan: PesertaBot[] }
  | { jenis: "tidak_ada"; pilihan: PesertaBot[] };

const MAKS_PILIHAN = 5;

/**
 * Cocok PERSIS (setelah dirapikan) atau tidak sama sekali. Nama dari foto
 * yang terpotong ("Budi S") tidak pernah dipilihkan otomatis: kandidat yang
 * memuat semua kata pencarian dikembalikan sebagai pilihan.
 */
export function cariPeserta(nama: string, semua: PesertaBot[]): HasilCari {
  const kunci = rapikanNama(nama);
  if (!kunci) return { jenis: "tidak_ada", pilihan: [] };
  const persis = semua.filter((orang) => rapikanNama(orang.name) === kunci);
  if (persis.length === 1) return { jenis: "satu", peserta: persis[0] };
  if (persis.length > 1) return { jenis: "kembar", pilihan: persis.slice(0, MAKS_PILIHAN) };
  const kata = kunci.split(" ");
  const mirip = semua.filter((orang) => {
    const isi = ` ${rapikanNama(orang.name)} `;
    return kata.every((k) => isi.includes(` ${k}`));
  });
  return { jenis: "tidak_ada", pilihan: mirip.slice(0, MAKS_PILIHAN) };
}

export type StayBot = { room_id: number | null; hotel_id: number; check_in_at: string | null; check_out_at: string | null };
export type KamarBot = { id: number; hotel_id: number; room_number: string | null; label: string | null };
export type HotelBot = { id: number; name: string };

export type PilihanKamar = { room_id: number; hotel: string; label: string | null; room_number: string | null };

export type HasilKamar =
  | { jenis: "satu"; kamar: KamarBot }
  | { jenis: "tanpa_stay" }
  | { jenis: "tanpa_kamar"; hotel: string[] }
  | { jenis: "banyak"; pilihan: PilihanKamar[] };

/**
 * Kamar peserta yang akan diberi nomor. `roomId` dari pilihan sebelumnya
 * harus termasuk kamar peserta ini, supaya bot tidak bisa menulis kamar lain.
 */
export function pilihKamar(input: {
  stays: StayBot[];
  kamar: KamarBot[];
  hotel: HotelBot[];
  roomId?: number;
  namaHotel?: string;
}): HasilKamar {
  const hotelPer = new Map(input.hotel.map((h) => [h.id, h.name]));
  const kamarPer = new Map(input.kamar.map((k) => [k.id, k]));
  let stays = input.stays;
  if (input.namaHotel) {
    const cari = rapikanNama(input.namaHotel);
    stays = stays.filter((s) => rapikanNama(hotelPer.get(s.hotel_id) ?? "").includes(cari));
  }
  if (!stays.length) return { jenis: "tanpa_stay" };
  const ids = [...new Set(stays.map((s) => s.room_id).filter((id): id is number => id !== null && kamarPer.has(id)))];
  if (input.roomId !== undefined) {
    const kamar = ids.includes(input.roomId) ? kamarPer.get(input.roomId) : undefined;
    if (kamar) return { jenis: "satu", kamar };
  }
  if (!ids.length) {
    return { jenis: "tanpa_kamar", hotel: [...new Set(stays.map((s) => hotelPer.get(s.hotel_id) ?? "Hotel"))] };
  }
  if (ids.length === 1 && input.roomId === undefined) return { jenis: "satu", kamar: kamarPer.get(ids[0])! };
  return {
    jenis: "banyak",
    pilihan: ids.map((id) => {
      const kamar = kamarPer.get(id)!;
      return { room_id: id, hotel: hotelPer.get(kamar.hotel_id) ?? "Hotel", label: kamar.label, room_number: kamar.room_number };
    }),
  };
}

/** Nomor kamar dari bot: dirapikan, 1 sampai 40 karakter. */
export function rapikanNomor(nomor: string): string {
  return nomor.replace(/\s+/g, " ").trim();
}
