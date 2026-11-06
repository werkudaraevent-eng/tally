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
/** Kandidat yang dipakai untuk mencocokkan teman sekamar (lebih banyak dari yang ditampilkan). */
export const MAKS_KANDIDAT = 20;

/**
 * Singkatan dan ejaan nama yang lazim di Indonesia, ke satu bentuk. Daftar
 * ini sengaja pendek: tiap entri harus jelas satu nama, bukan tebakan.
 */
const ALIAS_KATA: Record<string, string> = {
  m: "muhammad", muh: "muhammad", moh: "muhammad", mhd: "muhammad", mohd: "muhammad", moch: "muhammad",
  mochammad: "muhammad", mochamad: "muhammad", mohammad: "muhammad", mohamad: "muhammad", muhamad: "muhammad",
  muhammmad: "muhammad", muchammad: "muhammad", muchamad: "muhammad",
  abd: "abdul", achmad: "ahmad", akhmad: "ahmad", ahmed: "ahmad",
};
const bentuk = (kata: string) => ALIAS_KATA[kata] ?? kata;

/** Jarak Damerau-Levenshtein terbatas (tukar dua huruf bersebelahan = 1). */
export function jarakKata(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const biaya = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + biaya);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * Seberapa jauh kata dari foto (`q`) dari kata nama terdaftar (`n`). Null =
 * tidak cocok. 0 = sama (termasuk singkatan baku), 0.5 = awalan ("Rival" untuk
 * "Rivaldi", "S" untuk "Santoso"), 1-2 = salah ketik. Salah ketik hanya untuk kata 4+ huruf, dua
 * huruf hanya untuk 8+ huruf, supaya "Andi" tidak menjadi "Indi".
 */
function selisihKata(q: string, n: string): number | null {
  const bq = bentuk(q);
  const bn = bentuk(n);
  if (bq === bn) return 0;
  if (n.startsWith(q)) return 0.5;
  const pendek = Math.min(bq.length, bn.length);
  const batas = pendek >= 8 ? 2 : pendek >= 4 ? 1 : 0;
  if (!batas) return null;
  const jarak = jarakKata(bq, bn);
  return jarak <= batas ? jarak : null;
}

/** Skor kecocokan nama (lebih kecil lebih mirip), atau null. Tiap kata foto harus cocok dengan kata nama yang berbeda. */
export function skorNama(cari: string, nama: string): number | null {
  const q = rapikanNama(cari).split(" ").filter(Boolean);
  const n = rapikanNama(nama).split(" ").filter(Boolean);
  if (!q.length || q.length > n.length) return null;
  let total = 0;
  const terpakai = new Set<number>();
  for (const kata of q) {
    let terbaik: { i: number; s: number } | null = null;
    n.forEach((isi, i) => {
      if (terpakai.has(i)) return;
      const s = selisihKata(kata, isi);
      if (s !== null && (!terbaik || s < terbaik.s)) terbaik = { i, s };
    });
    if (!terbaik) return null;
    const pilih = terbaik as { i: number; s: number };
    terpakai.add(pilih.i);
    total += pilih.s;
  }
  // Kata nama yang tidak disebut di foto menambah sedikit, supaya "Muh Rivaldi"
  // lebih dekat ke "Muhammad Rivaldi" daripada ke "Muhammad Rivaldi Saputra".
  return total + (n.length - q.length) * 0.1;
}

/**
 * Cocok PERSIS (setelah dirapikan) = dipilih. Selain itu tidak pernah
 * dipilihkan otomatis: kandidat yang mirip (singkatan, awalan, salah ketik)
 * dikembalikan urut dari yang paling mirip. `kandidat` = sampai MAKS_KANDIDAT
 * untuk dicocokkan dengan teman sekamar; `pilihan` = lima teratas untuk ditanyakan.
 */
export function cariPeserta(nama: string, semua: PesertaBot[]): HasilCari & { kandidat: PesertaBot[] } {
  const kunci = rapikanNama(nama);
  if (!kunci) return { jenis: "tidak_ada", pilihan: [], kandidat: [] };
  const persis = semua.filter((orang) => rapikanNama(orang.name) === kunci);
  if (persis.length === 1) {
    // Persis tapi ada nama lain yang memuat semua kata itu ("Saiful Bahri" dan
    // "Saiful Bahri (OB)"): kunci kamar sering hanya bertulis nama pendek,
    // jadi ini tetap ditanyakan (atau dipastikan lewat teman sekamar).
    const serupa = semua.filter((orang) => orang !== persis[0] && (skorNama(kunci, orang.name) ?? 1) < 1);
    if (!serupa.length) return { jenis: "satu", peserta: persis[0], kandidat: persis };
    const urut = [persis[0], ...serupa];
    return { jenis: "kembar", pilihan: urut.slice(0, MAKS_PILIHAN), kandidat: urut.slice(0, MAKS_KANDIDAT) };
  }
  if (persis.length > 1) return { jenis: "kembar", pilihan: persis.slice(0, MAKS_PILIHAN), kandidat: persis.slice(0, MAKS_KANDIDAT) };
  // Pencarian terlalu pendek tidak memberi pilihan: satu huruf akan
  // mendaftar nama siapa saja yang kebetulan berawalan huruf itu.
  if (kunci.replace(/ /g, "").length < 3) return { jenis: "tidak_ada", pilihan: [], kandidat: [] };
  const mirip = semua
    .map((orang) => ({ orang, skor: skorNama(kunci, orang.name) }))
    .filter((x): x is { orang: PesertaBot; skor: number } => x.skor !== null)
    .sort((x, y) => x.skor - y.skor || x.orang.name.localeCompare(y.orang.name))
    .map((x) => x.orang);
  return { jenis: "tidak_ada", pilihan: mirip.slice(0, MAKS_PILIHAN), kandidat: mirip.slice(0, MAKS_KANDIDAT) };
}

/**
 * Dua nama di satu kunci kamar: pasangan (peserta A, kamar) yang SEKAMAR
 * dengan salah satu kandidat B. Satu pasangan saja = bukti kuat, dua bacaan
 * foto yang terpisah menunjuk kamar yang sama.
 */
export function pasanganSekamar(
  kandidatA: string[],
  kandidatB: string[],
  penghuni: Array<{ participant_id: string; room_id: number | null }>,
): Array<{ participant_id: string; room_id: number }> {
  const b = new Set(kandidatB);
  const kamarB = new Map<number, Set<string>>();
  for (const baris of penghuni) {
    if (baris.room_id === null || !b.has(baris.participant_id)) continue;
    kamarB.set(baris.room_id, (kamarB.get(baris.room_id) ?? new Set()).add(baris.participant_id));
  }
  const a = new Set(kandidatA);
  const hasil = new Map<string, { participant_id: string; room_id: number }>();
  for (const baris of penghuni) {
    if (baris.room_id === null || !a.has(baris.participant_id)) continue;
    const lain = kamarB.get(baris.room_id);
    if (!lain || ![...lain].some((id) => id !== baris.participant_id)) continue;
    hasil.set(`${baris.participant_id}:${baris.room_id}`, { participant_id: baris.participant_id, room_id: baris.room_id });
  }
  return [...hasil.values()];
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

/**
 * Rentang menginap sebuah stay: tanggal stay, lalu kamar, lalu hotel (sama
 * dengan aturan Logistics). Null bila salah satu ujung tidak diketahui.
 */
export function rentangStay(stay: StayBot, kamar: KamarBot | undefined, hotel: HotelBot | undefined): [number, number] | null {
  const masuk = stay.check_in_at ?? kamar?.check_in_at ?? hotel?.check_in_at ?? null;
  const keluar = stay.check_out_at ?? kamar?.check_out_at ?? hotel?.check_out_at ?? null;
  if (!masuk || !keluar) return null;
  const a = Date.parse(masuk);
  const b = Date.parse(keluar);
  return Number.isFinite(a) && Number.isFinite(b) && a < b ? [a, b] : null;
}

/**
 * Dua kamar boleh digabung (satu kamar fisik dipakai rombongan berbeda di
 * malam berbeda) hanya bila setiap rentang diketahui dan tidak ada malam
 * yang bertabrakan. Ragu = tidak boleh.
 */
export function bolehGabung(asal: Array<[number, number] | null>, tujuan: Array<[number, number] | null>): boolean {
  if (!asal.length || asal.some((r) => !r) || tujuan.some((r) => !r)) return false;
  return asal.every((a) => tujuan.every((b) => !(a![0] < b![1] && b![0] < a![1])));
}
