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
  // Pencarian terlalu pendek tidak memberi pilihan: satu huruf akan
  // mendaftar nama siapa saja yang kebetulan berawalan huruf itu.
  if (kunci.replace(/ /g, "").length < 3) return { jenis: "tidak_ada", pilihan: [] };
  const kata = kunci.split(" ");
  const mirip = semua.filter((orang) => {
    const isi = ` ${rapikanNama(orang.name)} `;
    return kata.every((k) => isi.includes(` ${k}`));
  });
  return { jenis: "tidak_ada", pilihan: mirip.slice(0, MAKS_PILIHAN) };
}

export type StayBot = { room_id: number | null; hotel_id: number; check_in_at: string | null; check_out_at: string | null };
export type KamarBot = { id: number; hotel_id: number; room_number: string | null; label: string | null; check_in_at?: string | null; check_out_at?: string | null };
export type HotelBot = { id: number; name: string; check_in_at?: string | null; check_out_at?: string | null };

/** Tanggal menginap peserta di kamar itu, di zona acara ("2026-11-06"). Null = belum diatur. */
export type Malam = { check_in: string | null; check_out: string | null };

export type PilihanKamar = { room_id: number; hotel: string; label: string | null; room_number: string | null } & Malam;

export type HasilKamar =
  | { jenis: "satu"; kamar: KamarBot; malam: Malam }
  | { jenis: "tanpa_stay" }
  | { jenis: "tanpa_kamar"; hotel: string[] }
  | { jenis: "tanggal_lain"; pilihan: PilihanKamar[] }
  | { jenis: "banyak"; pilihan: PilihanKamar[] };

/** ISO ke tanggal di zona acara; offset tetap ("+07:00"), zona Indonesia tanpa DST. */
function tanggal(iso: string | null | undefined, offset: string): string | null {
  if (!iso) return null;
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  const geser = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t + geser * 60000).toISOString().slice(0, 10);
}

/**
 * Kamar peserta yang akan diberi nomor. `roomId` dari pilihan sebelumnya
 * harus termasuk kamar peserta ini, supaya bot tidak bisa menulis kamar lain.
 *
 * `tanggal` ("2026-11-06") = malam kunci itu dipakai: hanya stay yang
 * mencakup malam itu (check-in <= tanggal < check-out) yang dihitung.
 * Tanggal stay mengikuti aturan yang sama dengan database: stay, lalu kamar,
 * lalu hotel. Stay tanpa tanggal sama sekali dianggap mencakup semua malam.
 */
export function pilihKamar(input: {
  stays: StayBot[];
  kamar: KamarBot[];
  hotel: HotelBot[];
  roomId?: number;
  namaHotel?: string;
  tanggal?: string;
  offset?: string;
}): HasilKamar {
  const offset = input.offset ?? "+07:00";
  const hotelPer = new Map(input.hotel.map((h) => [h.id, h]));
  const kamarPer = new Map(input.kamar.map((k) => [k.id, k]));
  const malamStay = (s: StayBot): Malam => {
    const kamar = s.room_id !== null ? kamarPer.get(s.room_id) : undefined;
    const hotel = hotelPer.get(s.hotel_id);
    return {
      check_in: tanggal(s.check_in_at ?? kamar?.check_in_at ?? hotel?.check_in_at, offset),
      check_out: tanggal(s.check_out_at ?? kamar?.check_out_at ?? hotel?.check_out_at, offset),
    };
  };
  const pilihanDari = (daftar: StayBot[]): PilihanKamar[] => {
    const hasil: PilihanKamar[] = [];
    for (const s of daftar) {
      const kamar = s.room_id !== null ? kamarPer.get(s.room_id) : undefined;
      if (!kamar || hasil.some((p) => p.room_id === kamar.id)) continue;
      hasil.push({ room_id: kamar.id, hotel: hotelPer.get(kamar.hotel_id)?.name ?? "Hotel", label: kamar.label, room_number: kamar.room_number, ...malamStay(s) });
    }
    return hasil.sort((x, y) => (x.check_in ?? "").localeCompare(y.check_in ?? ""));
  };

  let stays = input.stays;
  if (input.namaHotel) {
    const cari = rapikanNama(input.namaHotel);
    stays = stays.filter((s) => rapikanNama(hotelPer.get(s.hotel_id)?.name ?? "").includes(cari));
  }
  if (!stays.length) return { jenis: "tanpa_stay" };
  if (input.tanggal) {
    const malam = input.tanggal;
    const cocok = stays.filter((s) => {
      const { check_in, check_out } = malamStay(s);
      return (!check_in || check_in <= malam) && (!check_out || malam < check_out);
    });
    if (!cocok.length) return { jenis: "tanggal_lain", pilihan: pilihanDari(stays) };
    stays = cocok;
  }
  const berkamar = stays.filter((s) => s.room_id !== null && kamarPer.has(s.room_id));
  const ids = [...new Set(berkamar.map((s) => s.room_id as number))];
  if (input.roomId !== undefined) {
    const stay = berkamar.find((s) => s.room_id === input.roomId);
    if (stay) return { jenis: "satu", kamar: kamarPer.get(input.roomId)!, malam: malamStay(stay) };
  }
  if (!ids.length) {
    return { jenis: "tanpa_kamar", hotel: [...new Set(stays.map((s) => hotelPer.get(s.hotel_id)?.name ?? "Hotel"))] };
  }
  if (ids.length === 1 && input.roomId === undefined) {
    // Satu kamar tetapi bisa beberapa stay (mis. dua malam terpisah): malam pertama..terakhir.
    const malam = berkamar.map(malamStay);
    const masuk = malam.map((m) => m.check_in).filter((x): x is string => Boolean(x)).sort()[0] ?? null;
    const keluar = malam.map((m) => m.check_out).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;
    return { jenis: "satu", kamar: kamarPer.get(ids[0])!, malam: { check_in: masuk, check_out: keluar } };
  }
  return { jenis: "banyak", pilihan: pilihanDari(berkamar) };
}

/** Nomor kamar dari bot: dirapikan, 1 sampai 40 karakter. */
export function rapikanNomor(nomor: string): string {
  return nomor.replace(/\s+/g, " ").trim();
}
