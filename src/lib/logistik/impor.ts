/**
 * Rencana impor Logistik dari Excel: rooming list hotel dan daftar bus.
 *
 * Fungsi di sini murni: menerima sel berkas dan keadaan acara saat ini, lalu
 * mengembalikan apa yang AKAN terjadi per baris. Route memakai rencana yang
 * sama dua kali: sekali untuk pratinjau, sekali lagi (dari berkas yang sama)
 * saat panitia menekan Simpan. Karena itu tidak ada yang tersimpan diam-diam:
 * yang ditulis persis yang tadi dilihat, kecuali keadaan acara berubah di
 * antaranya, dan database tetap memeriksa ulang kapasitas serta jenis kelamin.
 *
 * Tidak mengimpor apa pun supaya bisa diuji langsung dengan Node
 * (`impor.check.ts`).
 */

import { jamZona, puncakHuni, stayPerPeserta, tanggalStay, tanggalZona } from "./stay.ts";
import type { ArahKereta, TiketKereta } from "./types";

export type JenisImpor = "kamar" | "bus" | "kereta";

export type StatusBaris = "masuk" | "pindah" | "tetap" | "tolak";

export type BarisRencana = {
  /** Nomor baris di Excel, dihitung dari 1 termasuk baris judul. */
  baris: number;
  nama: string;
  kode: string | null;
  /** "1208", "1208 · Mulia", atau "Mulia · room to follow" untuk kamar, "Bus 3" untuk bus. */
  tujuan: string;
  status: StatusBaris;
  alasan: string | null;
  participant_id: string | null;
};

/** Malam di berkas, "2026-11-05" sampai "2026-11-06" (zona acara). */
export type Malam = { masuk: string; keluar: string };

export type KamarBaru = { hotel: string; nomor: string; tipe: string | null; kapasitas: number };

export type Rencana = {
  jenis: JenisImpor;
  /** Masalah yang menolak seluruh berkas, mis. kolom wajib tidak ada. */
  galat: string | null;
  baris: BarisRencana[];
  hotelBaru: string[];
  kamarBaru: KamarBaru[];
  busBaru: string[];
  /**
   * Yang akan ditulis, dikelompokkan per tujuan. Kunci kamar memakai nama
   * hotel dan nomor, bukan id, karena kamar baru belum punya id. Impor kamar:
   * `tujuan` null = hotel saja, nomor kamar menyusul; `malam` null = tanpa
   * tanggal (ikut hotel, perilaku lama).
   */
  penempatan: Array<{ hotel: string | null; tujuan: string | null; malam: Malam | null; participant_ids: string[] }>;
  /** Impor kamar: stay yang dilepas, karena berkas bertanggal orang itu tidak menyebut hotelnya. */
  lepas: Array<{ participant_id: string; hotel_id: number }>;
  /**
   * Impor kamar: semua stay AKHIR setiap orang yang berubah, yang ditulis
   * sekaligus lewat `replace_stays` (satu transaksi). Hotel dan kamar memakai
   * nama, karena hotel dan kamar baru belum punya id. `asli`: tanggal stay
   * tersimpan yang tidak diubah berkas (null = ikut hotel).
   */
  akhir: Array<{ participant_id: string; stays: StayAkhir[] }>;
  /** Hanya impor kereta: tiket yang akan ditulis (baru atau diperbarui), satu per orang per arah. */
  tiket: TiketImpor[];
  /**
   * Bus dan kereta: baris yang hanya berisi orangnya (berkas Download
   * participant list yang belum diisi). Dilewati tanpa mengubah apa pun.
   */
  dilewati: number;
  /** Hanya impor kendaraan: pengecualian per trip. `tujuan` null = "No vehicle", `IKUT` = kembali ke kendaraan utama. */
  busTrip: Array<{ trip_id: number; tujuan: string | null; participant_ids: string[] }>;
};

/** Satu stay akhir dari impor kamar. `malam` dari berkas; tanpa itu `asli` (tanggal tersimpan) atau ikut hotel. */
export type StayAkhir = { hotel: string; kamar: string | null; malam: Malam | null; asli: { check_in_at: string | null; check_out_at: string | null } | null };

export type TripImpor = { id: number; name: string; depart_at: string | null; follows_default: boolean };

/** Satu tiket dari berkas, siap di-upsert ke `train_tickets`. */
export type TiketImpor = Omit<TiketKereta, "id">;

export type KeadaanAcara = {
  peserta: Array<{ id: string; name: string; qr_code: string; gender: string | null }>;
  hotels: Array<{ id: number; name: string; check_in_at?: string | null; check_out_at?: string | null }>;
  rooms: Array<{ id: number; hotel_id: number; room_number: string; capacity: number }>;
  /** Satu baris per stay. `room_id` null = nomor kamar menyusul; tanggal null = ikut hotel. */
  lodging: Array<{ id?: number; participant_id: string; hotel_id: number; room_id: number | null; check_in_at?: string | null; check_out_at?: string | null }>;
  /** Offset zona acara ("+07:00"), untuk membandingkan malam di berkas dengan stay tersimpan. */
  offset: string;
  settings: { gender_field_key: string | null; enforce_same_gender: boolean };
  vehicles: Array<{ id: number; code: string; capacity: number | null }>;
  /** Bus bawaan saja (trip_id null, vehicle_id terisi). */
  busBawaan: Array<{ participant_id: string; vehicle_id: number }>;
  /** Trip Logistics, untuk kolom "Trip: …" di impor kendaraan. */
  trips: TripImpor[];
  /** Pengecualian per trip yang tersimpan. `vehicle_id` null = "No vehicle" di trip itu. */
  busTrip: Array<{ trip_id: number; participant_id: string; vehicle_id: number | null }>;
  /** Tiket kereta yang sudah tersimpan, untuk menandai Updated atau Unchanged. */
  kereta: TiketKereta[];
};

export const BATAS_BARIS = 3000;

const ALIAS = {
  hotel: ["hotel", "nama hotel", "hotel name"],
  kamar: ["kamar", "nomor kamar", "no kamar", "no. kamar", "room", "room number", "room no", "room no."],
  tipe: ["tipe", "tipe kamar", "jenis kamar", "type", "room type"],
  kapasitas: ["kapasitas", "capacity", "jumlah tempat", "pax"],
  masuk: ["check-in", "check in", "checkin", "check-in date", "tanggal masuk", "tanggal check-in", "hotel check-in", "hotel check in"],
  keluar: ["check-out", "check out", "checkout", "check-out date", "tanggal keluar", "tanggal check-out", "hotel check-out", "hotel check out"],
  // qr_code: judul kolom ekspor peserta mentah.
  kode: ["kode qr", "qr", "qr code", "qr_code", "kode", "kode peserta", "participant code", "code"],
  nama: ["nama", "nama peserta", "nama tamu", "name", "guest", "guest name", "peserta", "tamu", "participant", "participant name", "full name"],
  bus: ["vehicle", "bus", "nama bus", "kendaraan", "nama kendaraan", "armada", "bus name", "vehicle name", "default vehicle", "default bus"],
  arah: ["direction", "arah", "leg", "pergi/pulang", "berangkat/pulang", "outbound/return"],
  kereta: ["train", "kereta", "nama kereta", "kereta api", "train name", "nama ka", "ka"],
  kelas: ["class", "kelas", "travel class"],
  dari: ["from", "dari", "asal", "origin", "stasiun asal", "departure station"],
  ke: ["to", "ke", "tujuan", "destination", "stasiun tujuan", "arrival station"],
  tanggal: ["date", "tanggal", "tgl", "departure date", "tanggal berangkat"],
  berangkat: ["departs", "depart", "departure", "departure time", "jam berangkat", "berangkat"],
  tiba: ["arrives", "arrive", "arrival", "arrival time", "jam tiba", "tiba"],
  gerbong: ["carriage", "coach", "car", "gerbong", "no gerbong"],
  kursi: ["seat", "kursi", "no kursi", "nomor kursi", "seat number"],
  booking: ["booking code", "kode booking", "booking", "pnr", "booking ref", "kode pemesanan"],
} as const;

export const TEMPLAT: Record<JenisImpor, { judul: string[]; contoh: string[][] }> = {
  // Satu baris per orang, kolom sama dengan ekspor Daftar peserta (permintaan
  // Hanung 2026-10-26). Berkas lama, satu baris per hotel, tetap terbaca.
  kamar: {
    judul: judulStay(2),
    contoh: [
      ["", "Budi Santoso", "Sample Hotel", "1208", "", "", "", "", "", ""],
      ["", "Andi Pratama", "Sample Hotel", "1208", "", "", "", "", "", ""],
      // Nomor kamar kosong: hotel saja, kamar menyusul.
      ["", "Dewi Lestari", "Sample Hotel", "", "", "", "", "", "", ""],
      // Pindah hotel: Hotel 2 diisi, keduanya bertanggal.
      ["", "Rina Hapsari", "Sample Hotel", "1210", "05/11/2026", "06/11/2026", "Second Hotel", "", "06/11/2026", "08/11/2026"],
    ],
  },
  bus: {
    judul: ["QR code", "Name", "Vehicle"],
    contoh: [
      ["", "Budi Santoso", "Bus 1"],
      ["", "Siti Rahayu", "Hiace 1"],
    ],
  },
  kereta: {
    judul: ["QR code", "Name", "Direction", "Train", "Class", "From", "To", "Date", "Departs", "Arrives", "Carriage", "Seat", "Booking code"],
    contoh: [
      ["", "Budi Santoso", "Outbound", "Argo Lawu 8", "Executive", "Gambir", "Yogyakarta", "06/11/2026", "08:20", "15:10", "EKS 3", "12A", "KBX7Q2"],
      ["", "Budi Santoso", "Return", "Taksaka 72", "Executive", "Yogyakarta", "Gambir", "08/11/2026", "15:30", "22:05", "EKS 5", "8C", "KBX7Q2"],
    ],
  },
};

const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "5–6 Nov" dari malam di berkas. */
function rentangTanggal(malam: Malam): string {
  const [a, b] = [malam.masuk, malam.keluar].map((t) => ({ hari: Number(t.slice(8, 10)), bulan: BULAN_PENDEK[Number(t.slice(5, 7)) - 1] }));
  return a.bulan === b.bulan ? `${a.hari}–${b.hari} ${b.bulan}` : `${a.hari} ${a.bulan} – ${b.hari} ${b.bulan}`;
}

/** Judul templat stay: QR code, Name, lalu Hotel N, Room N, Check-in N, Check-out N. */
export function judulStay(slot: number): string[] {
  const judul = ["QR code", "Name"];
  for (let n = 1; n <= slot; n += 1) judul.push(`Hotel ${n}`, `Room ${n}`, `Check-in ${n}`, `Check-out ${n}`);
  return judul;
}

const rapi = (nilai: string | undefined) => (nilai ?? "").replace(/\s+/g, " ").trim();
const kunci = (nilai: string | null | undefined) => rapi(nilai ?? "").toLowerCase();

type Kolom = Partial<Record<keyof typeof ALIAS, number>>;

function bacaJudul(sel: string[][]): { kolom: Kolom; mulai: number } | null {
  // Judul boleh tidak di baris pertama: rooming list dari hotel sering diawali
  // nama acara atau tanggal. Lima baris pertama diperiksa.
  for (let i = 0; i < Math.min(5, sel.length); i += 1) {
    const judul = sel[i].map((isi) => kunci(isi));
    const kolom: Kolom = {};
    for (const [nama, alias] of Object.entries(ALIAS) as Array<[keyof typeof ALIAS, readonly string[]]>) {
      const indeks = judul.findIndex((isi) => alias.includes(isi));
      if (indeks >= 0) kolom[nama] = indeks;
    }
    if (kolom.kamar !== undefined || kolom.bus !== undefined || kolom.kereta !== undefined || kolom.nama !== undefined) return { kolom, mulai: i + 1 };
  }
  return null;
}

type Pencocok = (kode: string, nama: string) => { id: string } | { alasan: string };

function buatPencocok(peserta: KeadaanAcara["peserta"]): Pencocok {
  const perKode = new Map(peserta.map((orang) => [kunci(orang.qr_code), orang]));
  const perNama = new Map<string, KeadaanAcara["peserta"]>();
  for (const orang of peserta) perNama.set(kunci(orang.name), [...(perNama.get(kunci(orang.name)) ?? []), orang]);
  return (kode, nama) => {
    // Kode QR didahulukan: nama bisa kembar dan sering ditulis berbeda oleh
    // hotel ("Budi S." dan "Budi Santoso"), kode tidak.
    if (kode) {
      const orang = perKode.get(kunci(kode));
      return orang ? { id: orang.id } : { alasan: "QR code not found" };
    }
    const cocok = perNama.get(kunci(nama)) ?? [];
    if (cocok.length === 1) return { id: cocok[0].id };
    if (cocok.length > 1) return { alasan: `${cocok.length} participants have this name; fill in the QR code column` };
    return { alasan: "Name not found in the Participant list" };
  };
}

function kosong(jenis: JenisImpor, galat: string): Rencana {
  return { jenis, galat, baris: [], hotelBaru: [], kamarBaru: [], busBaru: [], penempatan: [], lepas: [], akhir: [], tiket: [], dilewati: 0, busTrip: [] };
}

/* ------------------------------------------------------------------ Kamar */

const JUDUL_PANJANG = ["Hotel", "Room", "Type", "Capacity", "Check-in", "Check-out", "QR code", "Name"];
const ISIAN_SLOT = ["hotel", "kamar", "tipe", "kapasitas", "masuk", "keluar"] as const;

/**
 * Berkas lebar (satu baris per orang: Hotel 1, Room 1, Check-in 1, ...,
 * Hotel 2, ...) diubah ke bentuk panjang (satu baris per hotel) yang dibaca
 * `rencanaKamar`, dengan nomor baris Excel aslinya. Null bila judulnya tidak
 * bernomor: berkas itu sudah bentuk panjang.
 */
function lebarKePanjang(sel: string[][]): { sel: string[][]; nomorAsli: number[] } | null {
  for (let i = 0; i < Math.min(5, sel.length); i += 1) {
    const slot = new Map<number, Partial<Record<(typeof ISIAN_SLOT)[number], number>>>();
    const biasa: Kolom = {};
    sel[i].forEach((isi, indeks) => {
      const teks = kunci(isi);
      const bernomor = /^(.*?)\s*(\d{1,2})$/.exec(teks);
      const dasar = bernomor ? bernomor[1].trim() : teks;
      for (const nama of ISIAN_SLOT) {
        if (!(ALIAS[nama] as readonly string[]).includes(dasar)) continue;
        if (bernomor) slot.set(Number(bernomor[2]), { ...slot.get(Number(bernomor[2])), [nama]: indeks });
        return;
      }
      if ((ALIAS.kode as readonly string[]).includes(teks)) biasa.kode = indeks;
      else if ((ALIAS.nama as readonly string[]).includes(teks)) biasa.nama = indeks;
    });
    if (![...slot.values()].some((k) => k.hotel !== undefined)) continue;
    const urut = [...slot.entries()].sort((a, b) => a[0] - b[0]).map(([, k]) => k);
    const ambil = (baris: string[], indeks: number | undefined) => (indeks === undefined ? "" : rapi(baris[indeks]));
    const hasil: string[][] = [JUDUL_PANJANG];
    const nomorAsli: number[] = [];
    sel.slice(i + 1).forEach((baris, j) => {
      const kode = ambil(baris, biasa.kode);
      const nama = ambil(baris, biasa.nama);
      for (const k of urut) {
        const isi = ISIAN_SLOT.map((nama1) => ambil(baris, k[nama1]));
        // Slot kosong dilewati: Hotel 2 hanya diisi untuk yang pindah hotel.
        if (isi.every((t) => !t)) continue;
        hasil.push([...isi, kode, nama]);
        nomorAsli.push(i + j + 2);
      }
    });
    return { sel: hasil, nomorAsli };
  }
  return null;
}

/** "To follow" (ekspor Daftar peserta), "room later", "-": belum ada nomor kamar. */
const KAMAR_MENYUSUL = new Set(["to follow", "room to follow", "room later", "later", "menyusul", "-", "–", "—"]);

export function rencanaKamar(selBerkas: string[][], acara: KeadaanAcara): Rencana {
  const lebar = lebarKePanjang(selBerkas);
  const sel = lebar?.sel ?? selBerkas;
  const judul = bacaJudul(sel);
  // Room boleh tidak ada atau kosong: baris tanpa nomor kamar menempatkan
  // orangnya di hotel saja, dan rooming list yang datang belakangan mengisi
  // kamarnya. Tanpa Room dan tanpa Hotel, berkas tidak menyebut tempat apa pun.
  if (!judul || (judul.kolom.kamar === undefined && judul.kolom.hotel === undefined)) {
    return kosong("kamar", "Hotel or Room column not found. The header row must include Hotel and/or Room, then Name or QR code. Download the template for an example.");
  }
  const { kolom, mulai } = judul;
  const isi = sel.slice(mulai);
  if (isi.length > BATAS_BARIS) return kosong("kamar", `You can import at most ${BATAS_BARIS.toLocaleString("en-GB")} rows at a time.`);

  const { gender_field_key: fieldGender, enforce_same_gender: wajibSama } = acara.settings;
  // Aturan kamar hanya menolak berkas yang memang menyebut nomor kamar.
  const nomorKamar = (b: string[]) => {
    const t = kolom.kamar !== undefined ? rapi(b[kolom.kamar]).slice(0, 40) : "";
    return KAMAR_MENYUSUL.has(kunci(t)) ? "" : t;
  };
  const adaNomorKamar = isi.some((b) => nomorKamar(b));
  if (wajibSama && !fieldGender && adaNomorKamar) {
    return kosong("kamar", "Room rules are incomplete. Choose a gender field on the Rooms tab, or allow mixed rooms, then import again. Rows without a room number can still be imported on their own.");
  }

  // Tanpa kolom Hotel, berkas hanya jelas bila acaranya punya tepat satu hotel.
  let hotelTetap: string | null = null;
  if (kolom.hotel === undefined) {
    if (acara.hotels.length === 1) hotelTetap = acara.hotels[0].name;
    else return kosong("kamar", acara.hotels.length === 0
      ? "Add a Hotel column. This event has no hotels yet, so the file must name them."
      : "This event has more than one hotel. Add a Hotel column so each room's hotel is clear.");
  }

  const offset = acara.offset;
  const hotelPerNama = new Map(acara.hotels.map((hotel) => [kunci(hotel.name), hotel]));
  const kamarPerKunci = new Map(acara.rooms.map((kamar) => [`${kamar.hotel_id}\u0000${kunci(kamar.room_number)}`, kamar]));
  const kamarById = new Map(acara.rooms.map((kamar) => [kamar.id, kamar]));
  const hotelById = new Map(acara.hotels.map((hotel) => [hotel.id, hotel]));
  const orangById = new Map(acara.peserta.map((orang) => [orang.id, orang]));
  // Stay sekarang per orang, dengan malam efektifnya (stay, lalu hotel) sebagai tanggal.
  type StayLama = { hotel_id: number; room_id: number | null; malam: Malam | null; check_in_at: string | null; check_out_at: string | null };
  const staySekarang = new Map<string, StayLama[]>();
  for (const b of acara.lodging) {
    if (!orangById.has(b.participant_id)) continue;
    const hotel = hotelById.get(b.hotel_id);
    const masuk = b.check_in_at ?? hotel?.check_in_at ?? null;
    const keluar = b.check_out_at ?? hotel?.check_out_at ?? null;
    const malam = masuk && keluar ? { masuk: tanggalZona(masuk, offset), keluar: tanggalZona(keluar, offset) } : null;
    staySekarang.set(b.participant_id, [...(staySekarang.get(b.participant_id) ?? []), { hotel_id: b.hotel_id, room_id: b.room_id, malam, check_in_at: b.check_in_at ?? null, check_out_at: b.check_out_at ?? null }]);
  }
  const cocokkan = buatPencocok(acara.peserta);
  const namaHotel = (id: number) => hotelById.get(id)?.name ?? "another hotel";
  // Malam hotel sebagai tanggal, untuk baris tanpa tanggal (ikut hotel).
  const malamHotel = (hotel: { check_in_at?: string | null; check_out_at?: string | null } | undefined): Malam | null =>
    hotel?.check_in_at && hotel.check_out_at ? { masuk: tanggalZona(hotel.check_in_at, offset), keluar: tanggalZona(hotel.check_out_at, offset) } : null;
  const tabrakMalam = (a: Malam | null, b: Malam | null) => !a || !b || (a.masuk < b.keluar && b.masuk < a.keluar);

  type Kelompok = { hotel: string; nomor: string; tipe: string | null; kapasitas: number | null; ada: { id: number; capacity: number } | null; orang: BarisRencana[] };
  const kelompok = new Map<string, Kelompok>();
  // Hotel saja: nama hotel (seperti di berkas, atau nama yang sudah ada) > baris.
  const hotelSaja = new Map<string, { hotel: string; orang: BarisRencana[] }>();
  // Malam per baris yang diterima; null = tanpa tanggal (ikut hotel).
  const malamBaris = new Map<BarisRencana, Malam | null>();
  // Baris yang diterima per orang: hotel, kamar, malam, dan stay tersimpan
  // yang dipadankan dengannya (hotel sama, malam bertabrakan).
  type BarisOrang = { baris: BarisRencana; hotelKunci: string; hotelId: number | null; hotel: string; nomor: string | null; malam: Malam | null; kamar: boolean; diSini: StayLama | undefined };
  const barisOrang = new Map<string, BarisOrang[]>();
  // Orang yang salah satu barisnya ditolak sesudah dikenali.
  const orangDitolak = new Set<string>();
  const baris: BarisRencana[] = [];
  const banyakHotel = kolom.hotel !== undefined && new Set(isi.map((b) => kunci(b[kolom.hotel!])).filter(Boolean)).size > 1;

  isi.forEach((sel1, i) => {
    const nomorBaris = lebar ? lebar.nomorAsli[i] : mulai + i + 1;
    const hotel = hotelTetap ?? rapi(sel1[kolom.hotel!]);
    const nomor = nomorKamar(sel1);
    const kode = kolom.kode !== undefined ? rapi(sel1[kolom.kode]) : "";
    const nama = kolom.nama !== undefined ? rapi(sel1[kolom.nama]) : "";
    const teksMasuk = kolom.masuk !== undefined ? rapi(sel1[kolom.masuk]) : "";
    const teksKeluar = kolom.keluar !== undefined ? rapi(sel1[kolom.keluar]) : "";
    if (!hotel && !nomor && !kode && !nama) return;
    const adaOrang = Boolean(kode || nama);
    const masuk = bacaTanggal(teksMasuk);
    const keluar = bacaTanggal(teksKeluar);
    const malam = masuk && keluar ? { masuk, keluar } : null;
    const labelMalam = malam ? ` · ${rentangTanggal(malam)}` : "";
    const tujuan = (nomor ? (banyakHotel ? `${nomor} · ${hotel}` : nomor) : hotel ? `${hotel} · room to follow` : "") + labelMalam;
    const tolak = (alasan: string) => { if (adaOrang) baris.push({ baris: nomorBaris, nama, kode: kode || null, tujuan, status: "tolak", alasan, participant_id: null }); };
    if (!hotel) return tolak(nomor ? "Hotel name is empty" : "Hotel and room are empty");
    if (masuk === undefined || keluar === undefined) return tolak(`${masuk === undefined ? "Check-in" : "Check-out"} date not recognised. Use DD/MM/YYYY`);
    if ((masuk === null) !== (keluar === null)) return tolak("Fill in both Check-in and Check-out, or leave both empty");
    if (malam && malam.keluar <= malam.masuk) return tolak("Check-out must be after check-in");

    const hotelAda = hotelPerNama.get(kunci(hotel));
    const kunciKamar = `${kunci(hotel)}\u0000${kunci(nomor)}`;
    if (nomor && !kelompok.has(kunciKamar)) {
      const ada = hotelAda ? kamarPerKunci.get(`${hotelAda.id}\u0000${kunci(nomor)}`) ?? null : null;
      const kapasitasTeks = kolom.kapasitas !== undefined ? rapi(sel1[kolom.kapasitas]) : "";
      const kapasitas = /^\d+$/.test(kapasitasTeks) && Number(kapasitasTeks) >= 1 && Number(kapasitasTeks) <= 20 ? Number(kapasitasTeks) : null;
      const tipe = kolom.tipe !== undefined ? rapi(sel1[kolom.tipe]).slice(0, 60) || null : null;
      kelompok.set(kunciKamar, { hotel: hotelAda?.name ?? hotel, nomor: ada?.room_number ?? nomor, tipe, kapasitas, ada, orang: [] });
    }
    if (!adaOrang) return;

    const hasil = cocokkan(kode, nama);
    if ("alasan" in hasil) return tolak(hasil.alasan);
    // Satu orang boleh beberapa baris untuk pindah hotel atau pindah kamar:
    // setiap barisnya bertanggal dan malamnya tidak bertabrakan. Hotel yang
    // sama boleh muncul lagi (check-out lalu check-in di kamar lain).
    const sebelumnya = barisOrang.get(hasil.id) ?? [];
    if (sebelumnya.length > 0) {
      const pertama = sebelumnya[0].baris.baris;
      if (!malam || sebelumnya.some((b) => !b.malam)) {
        // Berkas lebar: satu baris = seluruh rencana orang itu. Berkas panjang:
        // baris ganda tanpa tanggal salah ketik, baris pertamanya tetap.
        if (lebar) orangDitolak.add(hasil.id);
        return tolak(pertama === nomorBaris
          ? "Fill in Check-in and Check-out for each stay of someone who moves hotels or rooms"
          : `Same person already on row ${pertama}. To move them between hotels or rooms, fill in Check-in and Check-out on each of their rows`);
      }
      const tabrak = sebelumnya.find((b) => b.malam && b.malam.masuk < malam.keluar && malam.masuk < b.malam.keluar);
      if (tabrak) orangDitolak.add(hasil.id);
      if (tabrak) return tolak(tabrak.baris.baris === nomorBaris ? "Nights of the stays in this row overlap" : `Nights overlap row ${tabrak.baris.baris}`);
    }

    const stays = staySekarang.get(hasil.id) ?? [];
    // Stay tersimpan yang dipadankan dengan baris ini: di hotel yang sama dan
    // malamnya bertabrakan, belum dipakai baris lain orang ini. Tanpa tanggal:
    // yang belum berkamar lebih dulu, seperti `assign_room`.
    const terpakai = new Set(sebelumnya.map((b) => b.diSini).filter(Boolean));
    const calon = hotelAda ? stays.filter((s) => s.hotel_id === hotelAda.id && !terpakai.has(s)) : [];
    const diSini = malam
      ? calon.find((s) => s.malam && s.malam.masuk === malam.masuk && s.malam.keluar === malam.keluar) ?? calon.find((s) => tabrakMalam(s.malam, malam))
      : calon.find((s) => s.room_id === null) ?? calon[0];
    const kamarLama = diSini?.room_id != null ? kamarById.get(diSini.room_id) : undefined;
    const malamSama = !malam || Boolean(diSini?.malam && diSini.malam.masuk === malam.masuk && diSini.malam.keluar === malam.keluar);
    const lainnya = stays.filter((s) => s !== diSini);
    const pindahDari = lainnya.length > 0
      ? `Moving from ${lainnya.map((s) => `${s.room_id !== null ? `${kamarById.get(s.room_id)?.room_number ?? ""} · ` : ""}${namaHotel(s.hotel_id)}`).join(", ")}`
      : null;
    const gantiMalam = diSini && !malamSama && malam ? `Nights change to ${rentangTanggal(malam)}` : null;

    const baru: BarisRencana = { baris: nomorBaris, nama: orangById.get(hasil.id)!.name, kode: kode || null, tujuan, status: "masuk", alasan: null, participant_id: hasil.id };
    if (!nomor) {
      // Hotel saja, nomor kamar menyusul. Sudah di hotel ini dengan malam yang
      // sama: tidak diubah. Berkas tanpa nomor kamar tidak pernah mengosongkan
      // kamar yang sudah diatur.
      baru.status = diSini ? (malamSama ? "tetap" : "pindah") : malam || !pindahDari ? "masuk" : "pindah";
      baru.alasan = diSini
        ? gantiMalam ?? (kamarLama ? `Already in room ${kamarLama.room_number} at this hotel` : "Already at this hotel")
        : malam ? null : pindahDari;
      const kunciHotel = kunci(hotel);
      const grup = hotelSaja.get(kunciHotel) ?? { hotel: hotelAda?.name ?? hotel, orang: [] };
      grup.orang.push(baru);
      hotelSaja.set(kunciHotel, grup);
    } else {
      const grup = kelompok.get(kunciKamar)!;
      const tetap = grup.ada !== null && kamarLama?.id === grup.ada.id && malamSama;
      baru.status = tetap ? "tetap" : kamarLama || (!diSini && pindahDari && !malam) || gantiMalam ? "pindah" : "masuk";
      baru.alasan = tetap ? "Already in this room"
        : kamarLama && kamarLama.id !== grup.ada?.id ? `Moving from ${kamarLama.room_number}${banyakHotel ? ` · ${namaHotel(kamarLama.hotel_id)}` : ""}`
        : gantiMalam ?? (diSini ? "Was waiting for a room" : malam ? null : pindahDari);
      grup.orang.push(baru);
    }
    baris.push(baru);
    malamBaris.set(baru, malam);
    const nomorAkhir = nomor ? kelompok.get(kunciKamar)!.nomor : null;
    barisOrang.set(hasil.id, [...sebelumnya, { baris: baru, hotelKunci: kunci(hotel), hotelId: hotelAda?.id ?? null, hotel: hotelAda?.name ?? hotel, nomor: nomorAkhir, malam, kamar: Boolean(nomor), diSini }]);
  });

  // Orang dengan beberapa baris (pindah hotel atau kamar): bila satu barisnya
  // ditolak, juga karena kamarnya penuh atau jenis kelaminnya berbeda, semua
  // barisnya ditolak: orangnya tidak tersimpan setengah dan stay lamanya tidak
  // dilepas. Penolakan kamar baru diketahui sesudah isi kamar dihitung, jadi
  // hitungannya diulang tanpa orang itu (tempat yang tidak jadi diambilnya
  // bisa memuat orang lain).
  const asal = new Map(baris.map((b) => [b, { status: b.status, alasan: b.alasan }]));
  const tolakOrang = new Set<string>();
  const alasanSendiri = new Map<BarisRencana, string | null>();
  {
    const ditolak = new Set(baris.filter((b) => b.status === "tolak").map((b) => b.baris));
    for (const [pid, daftar] of barisOrang) if (orangDitolak.has(pid) || (daftar.length > 1 && daftar.some((b) => ditolak.has(b.baris.baris)))) tolakOrang.add(pid);
  }
  const ikut = (orang: BarisRencana[]) => orang.filter((b) => !tolakOrang.has(b.participant_id!));
  // Malam efektif baris untuk isi kamar: dari berkas, lalu stay yang
  // dipadankan, lalu hotelnya. Null = tanpa batas.
  const malamEfektif = new Map<BarisRencana, Malam | null>();
  for (const daftar of barisOrang.values()) {
    for (const b of daftar) malamEfektif.set(b.baris, b.malam ?? b.diSini?.malam ?? malamHotel(b.hotelId !== null ? hotelById.get(b.hotelId) : undefined));
  }
  const rentang = (m: Malam | null): [number, number] => (m ? [Date.parse(m.masuk), Date.parse(m.keluar)] : [-Infinity, Infinity]);

  const hitung = (aktif: Map<string, BarisOrang[]>) => {
    // Orang dengan baris bertanggal: berkas menyebut SEMUA stay-nya. Stay yang
    // tidak dipadankan dengan barisnya dilepas, dan disebut di baris
    // pertamanya. Tanpa tanggal: perilaku lama (kamar di hotel yang sudah ada
    // stay-nya diisi, hotel lain = pindah seluruhnya), jadi rooming list dari
    // satu hotel tidak menghapus malam di hotel lain.
    const lepas: Rencana["lepas"] = [];
    // Stay tersimpan yang dikosongkan rencana ini, untuk isi akhir kamar.
    const stayLepas = new Set<StayLama>();
    for (const [pid, daftar] of aktif) {
      const stays = staySekarang.get(pid) ?? [];
      const bertanggal = daftar.every((b) => b.malam);
      const dipadankan = new Set(daftar.map((b) => b.diSini).filter(Boolean));
      for (const s of stays) {
        const baris1 = daftar.find((b) => b.diSini === s);
        if (!baris1) {
          // Stay yang tidak disebut: dilepas (bertanggal) atau ikut terganti
          // karena orangnya pindah ke hotel lain (tanpa tanggal).
          if (bertanggal || dipadankan.size === 0) {
            stayLepas.add(s);
            if (bertanggal) lepas.push({ participant_id: pid, hotel_id: s.hotel_id });
          }
        } else if (baris1.kamar) {
          stayLepas.add(s);
        }
      }
      if (bertanggal) {
        const dilepas = stays.filter((s) => !dipadankan.has(s)).map((s) => `${s.room_id !== null ? `${kamarById.get(s.room_id)?.room_number ?? ""} · ` : ""}${namaHotel(s.hotel_id)}`);
        const pertama = daftar[0].baris;
        if (dilepas.length > 0) {
          pertama.alasan = [pertama.alasan, `Removes their stay at ${dilepas.join(", ")}`].filter(Boolean).join(". ");
          if (pertama.status === "tetap") pertama.status = "pindah";
        }
      }
    }

    // Isi akhir tiap kamar yang SUDAH ada, per malam: penghuni yang tidak
    // disebut di berkas tetap tinggal, kecuali berkas memindahkannya.
    // Penghuni "tetap" juga tinggal.
    const penghuniTinggal = new Map<number, Array<{ pid: string; r: [number, number] }>>();
    for (const [pid, stays] of staySekarang) {
      for (const s of stays) {
        if (s.room_id === null) continue;
        const tetapDiKamar = (aktif.get(pid) ?? []).some((b) => b.baris.status === "tetap" && b.kamar && b.diSini === s);
        if (stayLepas.has(s) && !tetapDiKamar) continue;
        penghuniTinggal.set(s.room_id, [...(penghuniTinggal.get(s.room_id) ?? []), { pid, r: rentang(s.malam) }]);
      }
    }
    const genderDari = (pid: string) => kunci(orangById.get(pid)?.gender);

    // Per kunci nama: "GRAMM" dan "Gramm" di dua baris adalah satu hotel baru.
    const hotelBaru = new Map<string, string>();
    const kamarBaru: KamarBaru[] = [];
    const penempatan: Rencana["penempatan"] = [];
    /** Satu penempatan per tujuan dan malam. */
    const tambah = (hotel: string, tujuan: string | null, orang: BarisRencana[]) => {
      const perMalam = new Map<string, { malam: Malam | null; ids: string[] }>();
      for (const b of orang) {
        const malam = malamBaris.get(b) ?? null;
        const k = malam ? `${malam.masuk}/${malam.keluar}` : "";
        const grup = perMalam.get(k) ?? { malam, ids: [] };
        grup.ids.push(b.participant_id!);
        perMalam.set(k, grup);
      }
      for (const { malam, ids } of perMalam.values()) penempatan.push({ hotel, tujuan, malam, participant_ids: ids });
    };
    for (const grup of hotelSaja.values()) {
      const orang = ikut(grup.orang);
      if (!hotelPerNama.has(kunci(grup.hotel)) && !hotelBaru.has(kunci(grup.hotel))) hotelBaru.set(kunci(grup.hotel), grup.hotel);
      tambah(grup.hotel, null, orang.filter((b) => b.status !== "tetap"));
    }
    for (const grup of kelompok.values()) {
      const orang = ikut(grup.orang);
      const datang = orang.filter((b) => b.status !== "tetap");
      // Penghuni per malam: yang tinggal, lalu yang datang dan diterima. Kamar
      // yang dikosongkan seseorang 6 Nov boleh diisi orang lain mulai 6 Nov.
      const huni = [...(grup.ada ? penghuniTinggal.get(grup.ada.id) ?? [] : [])];
      // Kamar baru tanpa kolom Kapasitas mendapat kapasitas sebanyak orang yang
      // disebut di berkas pada malam yang sama, paling sedikit 2 (kamar twin).
      const kapasitas = grup.ada ? grup.ada.capacity : grup.kapasitas
        ?? Math.max(2, ...orang.map((b) => 1 + puncakHuni(orang.filter((x) => x !== b).map((x) => rentang(malamEfektif.get(x) ?? null)), rentang(malamEfektif.get(b) ?? null))));

      const masuk: BarisRencana[] = [];
      for (const b of datang) {
        const pid = b.participant_id!;
        const r = rentang(malamEfektif.get(b) ?? null);
        // Malam lama orang ini di kamar ini diganti malam barunya.
        const lain = huni.filter((h) => h.pid !== pid);
        const sekamar = lain.filter((h) => h.r[0] < r[1] && r[0] < h.r[1]);
        if (wajibSama) {
          const g = genderDari(pid);
          if (!g) { b.status = "tolak"; b.alasan = "Gender not filled in on the Participant list"; continue; }
          if (sekamar.some((h) => genderDari(h.pid) && genderDari(h.pid) !== g)) { b.status = "tolak"; b.alasan = "Gender differs from the occupants of this room"; continue; }
        }
        if (puncakHuni(lain.map((h) => h.r), r) + 1 > kapasitas) { b.status = "tolak"; b.alasan = `Room full (capacity ${kapasitas})`; continue; }
        huni.splice(0, huni.length, ...lain, { pid, r });
        masuk.push(b);
      }

      if (!grup.ada) {
        if (!hotelPerNama.has(kunci(grup.hotel)) && !hotelBaru.has(kunci(grup.hotel))) hotelBaru.set(kunci(grup.hotel), grup.hotel);
        kamarBaru.push({ hotel: grup.hotel, nomor: grup.nomor, tipe: grup.tipe, kapasitas });
      }
      tambah(grup.hotel, grup.nomor, masuk);
    }

    return { lepas, hotelBaru, kamarBaru, penempatan };
  };

  let hasil: ReturnType<typeof hitung>;
  for (;;) {
    for (const [b, a] of asal) { b.status = a.status; b.alasan = a.alasan; }
    for (const pid of tolakOrang) {
      for (const { baris: b } of barisOrang.get(pid)!) {
        b.status = "tolak";
        b.alasan = alasanSendiri.has(b) ? alasanSendiri.get(b)! : lebar ? "Another stay in this row was rejected" : "Another row for this person was rejected";
      }
    }
    hasil = hitung(new Map([...barisOrang].filter(([pid]) => !tolakOrang.has(pid))));
    const baru = [...barisOrang].filter(([pid, daftar]) => !tolakOrang.has(pid) && daftar.length > 1 && daftar.some((b) => b.baris.status === "tolak"));
    if (baru.length === 0) break;
    for (const [pid, daftar] of baru) {
      tolakOrang.add(pid);
      for (const { baris: b } of daftar) if (b.status === "tolak") alasanSendiri.set(b, b.alasan);
    }
  }

  // Stay akhir per orang yang berubah, untuk `replace_stays`.
  const akhir: Rencana["akhir"] = [];
  const namaKamar = (s: StayLama) => (s.room_id !== null ? kamarById.get(s.room_id)?.room_number ?? null : null);
  const tetapLama = (s: StayLama): StayAkhir => ({ hotel: namaHotel(s.hotel_id), kamar: namaKamar(s), malam: null, asli: { check_in_at: s.check_in_at, check_out_at: s.check_out_at } });
  for (const [pid, daftar] of barisOrang) {
    if (tolakOrang.has(pid)) continue;
    const diterima = daftar.filter((b) => b.baris.status !== "tolak");
    if (diterima.length === 0 || diterima.every((b) => b.baris.status === "tetap")) continue;
    const stays = staySekarang.get(pid) ?? [];
    if (diterima.every((b) => b.malam)) {
      // Bertanggal: berkas = semua stay-nya. Baris tanpa nomor kamar memakai
      // kamar stay yang dipadankan (tidak pernah mengosongkan kamar).
      akhir.push({ participant_id: pid, stays: diterima.map((b) => ({ hotel: b.hotel, kamar: b.nomor ?? (b.diSini ? namaKamar(b.diSini) : null), malam: b.malam, asli: null })) });
      continue;
    }
    // Tanpa tanggal: satu baris.
    const b = diterima[0];
    if (b.diSini) {
      // Sudah di hotel ini: kamarnya diisi, stay lain dan tanggal tetap.
      akhir.push({ participant_id: pid, stays: stays.map((s) => (s === b.diSini ? { ...tetapLama(s), kamar: b.nomor ?? namaKamar(s) } : tetapLama(s))) });
    } else {
      akhir.push({ participant_id: pid, stays: [{ hotel: b.hotel, kamar: b.nomor, malam: null, asli: null }] });
    }
  }

  baris.sort((a, b) => a.baris - b.baris);
  return { jenis: "kamar", galat: null, baris, hotelBaru: [...hasil.hotelBaru.values()], kamarBaru: hasil.kamarBaru, busBaru: [], penempatan: hasil.penempatan, lepas: hasil.lepas, akhir, tiket: [], dilewati: 0, busTrip: [] };
}

/** Data untuk "Download current stays". */
export type StaySekarang = {
  peserta: Array<{ id: string; name: string; qr_code: string }>;
  hotels: Array<{ id: number; name: string; sort_order: number; check_in_at: string | null; check_out_at: string | null }>;
  rooms: Array<{ id: number; room_number: string; room_type: string | null; capacity: number }>;
  lodging: Array<{ id: number; participant_id: string; hotel_id: number; room_id: number | null; check_in_at: string | null; check_out_at: string | null }>;
  offset: string;
};

/**
 * Stay yang sekarang tersimpan, dalam bentuk templat kamar (satu baris per
 * orang, baris pertama judul), supaya panitia bisa mengunduh, mengubah di
 * Excel, lalu mengimpor kembali. Tanggal ditulis bila orang itu punya lebih
 * dari satu stay (impor mewajibkannya) atau stay-nya punya tanggal sendiri;
 * selain itu kosong = ikut tanggal hotel. Orang tanpa stay tidak ditulis.
 * Urut hotel pertama, kamar, lalu nama.
 */
export function barisStaySekarang(data: StaySekarang): string[][] {
  const hotelById = new Map(data.hotels.map((hotel) => [hotel.id, hotel]));
  const kamarById = new Map(data.rooms.map((kamar) => [kamar.id, kamar]));
  const orangById = new Map(data.peserta.map((orang) => [orang.id, orang]));
  const tulis = (iso: string | null) => {
    if (!iso) return "";
    const t = tanggalZona(iso, data.offset);
    return `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}`;
  };
  const hasil: Array<{ urut: [number, string, string]; sel: string[] }> = [];
  let slot = 2;
  for (const [pid, semua] of stayPerPeserta(data.lodging, hotelById)) {
    const orang = orangById.get(pid);
    const stays = semua.filter((stay) => hotelById.has(stay.hotel_id));
    if (!orang || stays.length === 0) continue;
    slot = Math.max(slot, stays.length);
    const sel = [orang.qr_code, orang.name];
    for (const stay of stays) {
      const hotel = hotelById.get(stay.hotel_id)!;
      const kamar = stay.room_id !== null ? kamarById.get(stay.room_id) : undefined;
      const tanggal = stays.length > 1 || stay.check_in_at || stay.check_out_at ? tanggalStay(stay, hotel) : { masuk: null, keluar: null };
      sel.push(hotel.name, kamar?.room_number ?? "", tulis(tanggal.masuk), tulis(tanggal.keluar));
    }
    const pertama = stays[0];
    const kamarPertama = pertama.room_id !== null ? kamarById.get(pertama.room_id) : undefined;
    hasil.push({ urut: [hotelById.get(pertama.hotel_id)!.sort_order, kamarPertama?.room_number ?? "\uffff", orang.name], sel });
  }
  const banding = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  hasil.sort((a, b) => a.urut[0] - b.urut[0] || banding.compare(a.urut[1], b.urut[1]) || banding.compare(a.urut[2], b.urut[2]));
  const lebar = 2 + slot * 4;
  return [judulStay(slot), ...hasil.map((h) => [...h.sel, ...Array(lebar - h.sel.length).fill("")])];
}

/* -------------------------------------------------------------------- Bus */

const BULAN_TRIP = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Judul kolom satu trip: "Trip: Jeep Merapi (7 Nov 05:00)", jam di zona
 * acara. Tanpa jam berangkat: "Trip: Jeep Merapi". Judul inilah yang dicari
 * impor, jadi dua trip bernama sama tetap terbedakan oleh jamnya.
 */
export function judulTrip(trip: TripImpor, offset: string): string {
  if (!trip.depart_at) return `Trip: ${trip.name}`;
  const t = tanggalZona(trip.depart_at, offset);
  return `Trip: ${trip.name} (${Number(t.slice(8, 10))} ${BULAN_TRIP[Number(t.slice(5, 7)) - 1]} ${jamZona(trip.depart_at, offset)})`;
}

/** Trip urut jam berangkat (tanpa jam di belakang), lalu nama. */
export function urutTrip(trips: TripImpor[]): TripImpor[] {
  return [...trips].sort((a, b) => (a.depart_at ?? "\uffff").localeCompare(b.depart_at ?? "\uffff") || a.name.localeCompare(b.name) || a.id - b.id);
}

/** Isi sel trip yang berarti "tidak naik kendaraan di trip ini". */
const TANPA_KENDARAAN = new Set(["no vehicle", "none", "-", "tidak ada", "tanpa kendaraan", "tidak naik"]);
export const LABEL_TANPA_KENDARAAN = "No vehicle";
/** Isi sel trip yang berarti "hapus pengecualian, ikut kendaraan utama lagi". */
const IKUT_UTAMA = new Set(["default", "main vehicle", "kendaraan utama", "ikut utama"]);
export const LABEL_IKUT_UTAMA = "Default";
/**
 * Penanda `tujuan` di `Rencana.busTrip` untuk "kembali ke kendaraan utama"
 * (`reset_bus_override`). Diawali NUL supaya tidak pernah sama dengan kode kendaraan.
 */
export const IKUT = "\u0000default";

/**
 * Kolom "Trip: …" di judul, dipasangkan ke trip acara. Judul persis dulu;
 * bila tidak ada, nama saja asal hanya satu trip bernama itu (jam trip
 * berubah sesudah berkas diunduh). Kolom yang tidak cocok = galat berkas:
 * diabaikan diam-diam berarti pengecualian satu hari hilang tanpa terlihat.
 */
function kolomTrip(judul: string[], acara: KeadaanAcara): { kolom: Array<{ indeks: number; trip: TripImpor }> } | { galat: string } {
  const perJudul = new Map(acara.trips.map((trip) => [kunci(judulTrip(trip, acara.offset)), trip]));
  const hasil: Array<{ indeks: number; trip: TripImpor }> = [];
  for (const [indeks, isi] of judul.entries()) {
    const k = kunci(isi);
    if (!k.startsWith("trip:") || k.endsWith("(info)")) continue;
    let trip = perJudul.get(k);
    if (!trip) {
      const nama = k.slice(5).replace(/\s*\([^)]*\)\s*$/, "").trim();
      const sama = acara.trips.filter((t) => kunci(t.name) === nama);
      if (sama.length === 1) trip = sama[0];
    }
    if (!trip) return { galat: `Column "${rapi(isi)}" does not match a Trip in Logistics. Download the participant list again, or fix the column name.` };
    if (hasil.some((h) => h.trip.id === trip!.id)) return { galat: `Two columns are for the same Trip (${trip.name}). Keep one.` };
    hasil.push({ indeks, trip });
  }
  return { kolom: hasil };
}

export function rencanaBus(sel: string[][], acara: KeadaanAcara): Rencana {
  const judul = bacaJudul(sel);
  if (!judul || judul.kolom.bus === undefined || (judul.kolom.nama === undefined && judul.kolom.kode === undefined)) {
    return kosong("bus", "Vehicle and Name (or QR code) columns not found in the header row. Download the template for an example.");
  }
  const { kolom, mulai } = judul;
  const trips = kolomTrip(sel[mulai - 1], acara);
  if ("galat" in trips) return kosong("bus", trips.galat);
  const isi = sel.slice(mulai);
  if (isi.length > BATAS_BARIS) return kosong("bus", `You can import at most ${BATAS_BARIS.toLocaleString("en-GB")} rows at a time.`);

  const busPerKode = new Map(acara.vehicles.map((bus) => [kunci(bus.code), bus]));
  const orangById = new Map(acara.peserta.map((orang) => [orang.id, orang]));
  const kodeBusById = new Map(acara.vehicles.map((bus) => [bus.id, bus.code]));
  const busSekarang = new Map(acara.busBawaan.filter((b) => orangById.has(b.participant_id)).map((b) => [b.participant_id, b.vehicle_id]));
  const tripSekarang = new Map(acara.busTrip.filter((b) => orangById.has(b.participant_id)).map((b) => [`${b.trip_id}\u0000${b.participant_id}`, b.vehicle_id]));
  const cocokkan = buatPencocok(acara.peserta);
  // Kendaraan disebut dengan kunci kodenya; ejaan pertama di berkas dipakai untuk yang baru.
  const ejaan = new Map(acara.vehicles.map((bus) => [kunci(bus.code), bus.code]));
  const kunciBus = (kode: string) => { const k = kunci(kode); if (!ejaan.has(k)) ejaan.set(k, kode); return k; };

  const baris: BarisRencana[] = [];
  let dilewati = 0;
  const sudah = new Map<string, number>();
  const niat: Niat[] = [];

  isi.forEach((sel1, i) => {
    const nomorBaris = mulai + i + 1;
    const bus = rapi(sel1[kolom.bus!]).slice(0, 40);
    const kode = kolom.kode !== undefined ? rapi(sel1[kolom.kode]) : "";
    const nama = kolom.nama !== undefined ? rapi(sel1[kolom.nama]) : "";
    const isiTrip = trips.kolom.map(({ indeks, trip }) => ({ trip, isi: rapi(sel1[indeks]).slice(0, 40) })).filter((t) => t.isi);
    if (!bus && !kode && !nama && isiTrip.length === 0) return;
    const ringkasTrip = isiTrip.map((t) => `${t.trip.name}: ${TANPA_KENDARAAN.has(kunci(t.isi)) ? LABEL_TANPA_KENDARAAN : IKUT_UTAMA.has(kunci(t.isi)) ? LABEL_IKUT_UTAMA : t.isi}`);
    const tolak = (alasan: string) => { baris.push({ baris: nomorBaris, nama, kode: kode || null, tujuan: [bus, ...ringkasTrip].filter(Boolean).join(" · "), status: "tolak", alasan, participant_id: null }); };
    if (!kode && !nama) return tolak("Name and QR code are empty");
    // Orang tanpa kendaraan: baris Download participant list yang belum diisi.
    if (!bus && isiTrip.length === 0) { dilewati += 1; return; }
    const hasil = cocokkan(kode, nama);
    if ("alasan" in hasil) return tolak(hasil.alasan);
    const pertama = sudah.get(hasil.id);
    if (pertama !== undefined) return tolak(`Same person already on row ${pertama}`);
    sudah.set(hasil.id, nomorBaris);

    // Pengecualian per trip. Sel kosong = tidak berubah; "No vehicle" = tidak
    // naik di trip itu; "Default" = kembali ke kendaraan utama.
    const ubahTrip: Niat["trips"] = [];
    for (const { trip, isi } of isiTrip) {
      const lama = tripSekarang.get(`${trip.id}\u0000${hasil.id}`);
      if (IKUT_UTAMA.has(kunci(isi))) {
        if (lama !== undefined) ubahTrip.push({ trip_id: trip.id, ke: IKUT });
        continue;
      }
      const ke = TANPA_KENDARAAN.has(kunci(isi)) ? null : kunciBus(isi);
      const kunciLama = lama === undefined ? undefined : lama === null ? null : kunci(kodeBusById.get(lama) ?? "");
      if (kunciLama !== undefined && kunciLama === ke) continue;
      ubahTrip.push({ trip_id: trip.id, ke });
    }
    const tripBerubah = ubahTrip.length > 0;

    let ubahBus: string | undefined;
    let status: BarisRencana["status"] = tripBerubah ? "pindah" : "tetap";
    let alasan: string | null = tripBerubah ? "Trip vehicles change" : bus ? "Already on this vehicle" : "Already on these vehicles";
    if (bus) {
      const ke = kunciBus(bus);
      const lama = busSekarang.get(hasil.id);
      const kunciLama = lama === undefined ? undefined : kunci(kodeBusById.get(lama) ?? "");
      if (kunciLama !== ke) {
        ubahBus = ke;
        status = lama !== undefined ? "pindah" : "masuk";
        alasan = lama !== undefined ? `Moving from ${kodeBusById.get(lama) ?? "another vehicle"}` : null;
      }
    }
    const b: BarisRencana = {
      baris: nomorBaris,
      nama: orangById.get(hasil.id)!.name,
      kode: kode || null,
      tujuan: [bus ? ejaan.get(kunci(bus))! : "", ...ringkasTrip].filter(Boolean).join(" · "),
      status, alasan,
      participant_id: hasil.id,
    };
    baris.push(b);
    if (ubahBus !== undefined || tripBerubah) niat.push({ b, pid: hasil.id, bus: ubahBus, trips: ubahTrip });
  });

  // Kapasitas dinilai pada hasil akhir, persis seperti `assign_bus` menilainya
  // (`transport_effective`): kendaraan utama dihitung sendiri, lalu tiap trip
  // dengan pengecualian lebih dulu, kendaraan utama bila trip mengikutinya.
  // Selama ada kendaraan yang melebihi kapasitas, baris terakhir di berkas yang
  // menambah isinya ditolak (seluruh barisnya), lalu dihitung ulang.
  const kapasitas = new Map(acara.vehicles.map((bus) => [kunci(bus.code), bus.capacity]));
  const aktif = new Set(niat);
  for (;;) {
    const utama = new Map([...busSekarang].map(([pid, vid]) => [pid, kunci(kodeBusById.get(vid) ?? "")]));
    const pengecualian = new Map<string, string | null>();
    for (const [k, vid] of tripSekarang) pengecualian.set(k, vid === null ? null : kunci(kodeBusById.get(vid) ?? ""));
    for (const n of aktif) {
      if (n.bus !== undefined) utama.set(n.pid, n.bus);
      for (const t of n.trips) {
        const k = `${t.trip_id}\u0000${n.pid}`;
        if (t.ke === IKUT) pengecualian.delete(k); else pengecualian.set(k, t.ke);
      }
    }
    const lebih: Array<{ bus: string; trip: TripImpor | null }> = [];
    const isiUtama = new Map<string, number>();
    for (const k of utama.values()) isiUtama.set(k, (isiUtama.get(k) ?? 0) + 1);
    for (const [k, n] of isiUtama) { const c = kapasitas.get(k); if (c != null && n > c) lebih.push({ bus: k, trip: null }); }
    for (const trip of acara.trips) {
      const isiTrip = new Map<string, number>();
      for (const pid of orangById.keys()) {
        const kp = `${trip.id}\u0000${pid}`;
        const k = pengecualian.has(kp) ? pengecualian.get(kp) : trip.follows_default ? utama.get(pid) : undefined;
        if (k) isiTrip.set(k, (isiTrip.get(k) ?? 0) + 1);
      }
      for (const [k, n] of isiTrip) { const c = kapasitas.get(k); if (c != null && n > c) lebih.push({ bus: k, trip }); }
    }
    let korban: { n: Niat; bus: string; trip: TripImpor | null } | null = null;
    for (const n of aktif) {
      for (const l of lebih) {
        const tambah = l.trip === null
          ? n.bus === l.bus
          : n.trips.some((t) => t.trip_id === l.trip!.id && t.ke === l.bus)
            || (n.bus === l.bus && l.trip.follows_default && !pengecualian.has(`${l.trip.id}\u0000${n.pid}`));
        if (tambah && (!korban || n.b.baris > korban.n.b.baris)) korban = { n, bus: l.bus, trip: l.trip };
      }
    }
    if (!korban) break;
    aktif.delete(korban.n);
    korban.n.b.status = "tolak";
    const c = kapasitas.get(korban.bus);
    korban.n.b.alasan = korban.trip
      ? `${ejaan.get(korban.bus)} full on ${korban.trip.name} (capacity ${c})`
      : `Vehicle full (capacity ${c})`;
  }

  const penempatan: Rencana["penempatan"] = [];
  const perTrip = new Map<string, Rencana["busTrip"][number]>();
  const dipakai = new Set<string>();
  for (const n of niat) {
    if (!aktif.has(n)) continue;
    if (n.bus !== undefined) {
      dipakai.add(n.bus);
      const tujuan = ejaan.get(n.bus)!;
      const grup = penempatan.find((p) => p.tujuan === tujuan);
      if (grup) grup.participant_ids.push(n.pid);
      else penempatan.push({ hotel: null, tujuan, malam: null, participant_ids: [n.pid] });
    }
    for (const t of n.trips) {
      if (t.ke) dipakai.add(t.ke);
      const tujuan = t.ke === IKUT ? IKUT : t.ke === null ? null : ejaan.get(t.ke)!;
      const k = `${t.trip_id}\u0000${tujuan ?? ""}`;
      const grup = perTrip.get(k) ?? { trip_id: t.trip_id, tujuan, participant_ids: [] };
      perTrip.set(k, grup);
      grup.participant_ids.push(n.pid);
    }
  }
  const busBaru = [...dipakai].filter((k) => k !== IKUT && !busPerKode.has(k)).map((k) => ejaan.get(k)!);

  baris.sort((a, b) => a.baris - b.baris);
  return { jenis: "bus", galat: null, baris, hotelBaru: [], kamarBaru: [], busBaru, penempatan, lepas: [], akhir: [], tiket: [], dilewati, busTrip: [...perTrip.values()] };
}

/** Perubahan satu baris impor kendaraan, untuk menilai kapasitas di hasil akhir. */
type Niat = {
  b: BarisRencana;
  pid: string;
  /** Kunci kendaraan utama baru; undefined = tidak berubah. */
  bus: string | undefined;
  /** `ke`: kunci kendaraan, null = No vehicle, IKUT = kembali ke kendaraan utama. */
  trips: Array<{ trip_id: number; ke: string | null }>;
};

/* ----------------------------------------------------------------- Kereta */

const ARAH: Record<string, ArahKereta> = {
  outbound: "outbound", berangkat: "outbound", pergi: "outbound", go: "outbound", departure: "outbound",
  return: "return", pulang: "return", kembali: "return", back: "return",
};

export const LABEL_ARAH: Record<ArahKereta, string> = { outbound: "Outbound", return: "Return" };

/**
 * Tanggal tiket ke YYYY-MM-DD. Menerima hasil sel tanggal Excel (2026-11-06)
 * dan tulisan Indonesia/Inggris hari dulu (06/11/2026, 6-11-26, 6.11.2026).
 * Kosong = null; tidak dikenal = undefined.
 */
export function bacaTanggal(teks: string): string | null | undefined {
  const t = rapi(teks);
  if (!t) return null;
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3])];
  else return undefined;
  const tanggal = new Date(Date.UTC(y, m - 1, d));
  if (tanggal.getUTCFullYear() !== y || tanggal.getUTCMonth() !== m - 1 || tanggal.getUTCDate() !== d || y < 2000 || y > 2100) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Jam tiket ke HH:MM (8:20, 08.20, 08:20:00). Kosong = null; tidak dikenal = undefined. */
export function bacaJam(teks: string): string | null | undefined {
  const t = rapi(teks);
  if (!t) return null;
  const cocok = /^(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?$/.exec(t);
  if (!cocok) return undefined;
  const [jam, menit] = [Number(cocok[1]), Number(cocok[2])];
  if (jam > 23 || menit > 59) return undefined;
  return `${String(jam).padStart(2, "0")}:${cocok[2]}`;
}

const BIDANG_KERETA = ["train_name", "travel_class", "origin", "destination", "depart_date", "depart_time", "arrive_time", "carriage", "seat", "booking_code"] as const;

/** Batas panjang kolom tiket kereta, sama dengan check di tabel train_tickets. */
const BATAS_KERETA: [keyof typeof ALIAS, string, number][] = [
  ["kereta", "Train", 80],
  ["kelas", "Class", 40],
  ["dari", "From", 80],
  ["ke", "To", 80],
  ["gerbong", "Carriage", 20],
  ["kursi", "Seat", 20],
  ["booking", "Booking code", 40],
];

/**
 * Impor tiket kereta: satu baris = satu orang satu arah (Outbound atau
 * Return). Tiket yang sudah ada untuk orang dan arah yang sama diperbarui.
 * Kolom yang tidak ada di berkas tidak menyentuh nilai lama; kolom yang ada
 * tetapi selnya kosong mengosongkannya, karena itulah isi berkas terbaru.
 */
export function rencanaKereta(sel: string[][], acara: KeadaanAcara): Rencana {
  const judul = bacaJudul(sel);
  if (!judul || judul.kolom.kereta === undefined || judul.kolom.arah === undefined || (judul.kolom.nama === undefined && judul.kolom.kode === undefined)) {
    return kosong("kereta", "Train, Direction and Name (or QR code) columns not found in the header row. Download the template for an example.");
  }
  const { kolom, mulai } = judul;
  const isi = sel.slice(mulai);
  if (isi.length > BATAS_BARIS) return kosong("kereta", `You can import at most ${BATAS_BARIS.toLocaleString("en-GB")} rows at a time.`);

  const orangById = new Map(acara.peserta.map((orang) => [orang.id, orang]));
  const lama = new Map(acara.kereta.map((t) => [`${t.participant_id}\u0000${t.direction}`, t]));
  const cocokkan = buatPencocok(acara.peserta);
  const baris: BarisRencana[] = [];
  const tiket: TiketImpor[] = [];
  let dilewati = 0;
  const sudah = new Map<string, number>();
  const ambil = (sel1: string[], nama: keyof typeof ALIAS) => (kolom[nama] !== undefined ? rapi(sel1[kolom[nama]!]) : undefined);

  isi.forEach((sel1, i) => {
    const nomorBaris = mulai + i + 1;
    const kode = kolom.kode !== undefined ? rapi(sel1[kolom.kode]) : "";
    const nama = kolom.nama !== undefined ? rapi(sel1[kolom.nama]) : "";
    const kereta = ambil(sel1, "kereta") ?? "";
    const arahTeks = kunci(sel1[kolom.arah!]);
    if (!kode && !nama && !kereta && !arahTeks) return;
    const tujuanSementara = [arahTeks ? LABEL_ARAH[ARAH[arahTeks]] ?? arahTeks : "", kereta].filter(Boolean).join(" · ");
    const tolak = (alasan: string) => { baris.push({ baris: nomorBaris, nama, kode: kode || null, tujuan: tujuanSementara, status: "tolak", alasan, participant_id: null }); };
    if (!kode && !nama) return tolak("Name and QR code are empty");
    // Hanya orang dan arahnya, kolom tiket kosong semua: baris Download
    // participant list yang belum diisi. Dilewati, tiket tersimpan tetap.
    if (BATAS_KERETA.every(([nama]) => !ambil(sel1, nama)) && (["tanggal", "berangkat", "tiba"] as const).every((nama) => !ambil(sel1, nama))) {
      dilewati += 1;
      return;
    }
    const arah = ARAH[arahTeks];
    if (!arah) return tolak("Direction must be Outbound or Return (Berangkat or Pulang)");
    if (!kereta) return tolak("Train name is empty");
    // Ditolak, bukan dipotong diam-diam: kode booking atau kursi yang terpotong menyesatkan peserta.
    const terlalu = BATAS_KERETA.find(([nama, , maks]) => (ambil(sel1, nama)?.length ?? 0) > maks);
    if (terlalu) return tolak(`${terlalu[1]} is longer than ${terlalu[2]} characters`);
    const tanggal = kolom.tanggal !== undefined ? bacaTanggal(sel1[kolom.tanggal]) : null;
    if (tanggal === undefined) return tolak("Date not recognised. Use DD/MM/YYYY, such as 06/11/2026");
    const berangkat = kolom.berangkat !== undefined ? bacaJam(sel1[kolom.berangkat]) : null;
    const tiba = kolom.tiba !== undefined ? bacaJam(sel1[kolom.tiba]) : null;
    if (berangkat === undefined || tiba === undefined) return tolak("Time not recognised. Use HH:MM, such as 08:20");
    const hasil = cocokkan(kode, nama);
    if ("alasan" in hasil) return tolak(hasil.alasan);
    const kunciTiket = `${hasil.id}\u0000${arah}`;
    const pertama = sudah.get(kunciTiket);
    if (pertama !== undefined) return tolak(`Same person and direction already on row ${pertama}`);
    sudah.set(kunciTiket, nomorBaris);

    const ada = lama.get(kunciTiket) ?? null;
    const dariBerkas = {
      train_name: kereta,
      travel_class: ambil(sel1, "kelas"),
      origin: ambil(sel1, "dari"),
      destination: ambil(sel1, "ke"),
      depart_date: kolom.tanggal !== undefined ? tanggal : undefined,
      depart_time: kolom.berangkat !== undefined ? berangkat : undefined,
      arrive_time: kolom.tiba !== undefined ? tiba : undefined,
      carriage: ambil(sel1, "gerbong"),
      seat: ambil(sel1, "kursi"),
      booking_code: ambil(sel1, "booking"),
    };
    const baru: TiketImpor = { participant_id: hasil.id, direction: arah, ...Object.fromEntries(BIDANG_KERETA.map((bidang) => {
      const nilai = dariBerkas[bidang];
      // undefined = kolomnya tidak ada di berkas: nilai lama dipertahankan.
      return [bidang, nilai === undefined ? ada?.[bidang] ?? null : nilai || null];
    })) } as TiketImpor;
    const sama = ada !== null && BIDANG_KERETA.every((bidang) => (ada[bidang] ?? null) === baru[bidang]);
    const kursi = [baru.carriage, baru.seat].filter(Boolean).join(" / ");
    baris.push({
      baris: nomorBaris,
      nama: orangById.get(hasil.id)!.name,
      kode: kode || null,
      tujuan: [LABEL_ARAH[arah], baru.train_name, kursi].filter(Boolean).join(" · "),
      status: sama ? "tetap" : ada ? "pindah" : "masuk",
      alasan: sama ? "Already saved" : ada ? "Updates the saved ticket" : null,
      participant_id: hasil.id,
    });
    if (!sama) tiket.push(baru);
  });

  baris.sort((a, b) => a.baris - b.baris);
  return { jenis: "kereta", galat: null, baris, hotelBaru: [], kamarBaru: [], busBaru: [], penempatan: [], lepas: [], akhir: [], tiket, dilewati, busTrip: [] };
}

/* ------------------------------------------- Download participant list */

/** Data untuk "Download participant list" (bus dan kereta). */
export type PesertaUnduh = {
  peserta: Array<{ id: string; name: string; qr_code: string; extra: Record<string, unknown> | null }>;
  /** Kolom pilihan peserta, ditulis sebagai "<label> (info)" untuk filter di Excel. */
  info: Array<{ key: string; label: string }>;
  vehicles: Array<{ id: number; code: string }>;
  busBawaan: Array<{ participant_id: string; vehicle_id: number }>;
  /** Kendaraan saja: trip acara dan pengecualian tersimpan, satu kolom per trip. */
  trips: TripImpor[];
  busTrip: Array<{ trip_id: number; participant_id: string; vehicle_id: number | null }>;
  offset: string;
  kereta: TiketKereta[];
};

/**
 * Judul kolom bantuan. Akhiran " (info)" menjamin judulnya tidak pernah sama
 * dengan alias impor (kolom "Class" atau "Kode" milik acara tidak terbaca
 * sebagai kolom tiket), jadi impor mengabaikannya.
 */
const judulInfo = (label: string) => `${label} (info)`;

function jawabanInfo(extra: Record<string, unknown> | null, key: string): string {
  const isi = extra?.[key];
  return typeof isi === "string" ? isi.trim() : typeof isi === "number" || typeof isi === "boolean" ? String(isi) : "";
}

const urutNama = (data: PesertaUnduh) => {
  const banding = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  return [...data.peserta].sort((a, b) => banding.compare(a.name, b.name) || banding.compare(a.qr_code, b.qr_code));
};

/**
 * Semua peserta aktif dalam bentuk templat bus: satu baris per orang, urut
 * nama, kendaraan bawaan yang tersimpan sudah terisi, lalu satu kolom per trip
 * (urut jam berangkat) berisi pengecualian yang tersimpan. Sel trip kosong =
 * ikut kendaraan utama.
 */
export function barisPesertaBus(data: PesertaUnduh): string[][] {
  const kodeBus = new Map(data.vehicles.map((bus) => [bus.id, bus.code]));
  const busOrang = new Map(data.busBawaan.map((b) => [b.participant_id, kodeBus.get(b.vehicle_id) ?? ""]));
  const trips = urutTrip(data.trips);
  const pengecualian = new Map(data.busTrip.map((b) => [`${b.trip_id}\u0000${b.participant_id}`, b.vehicle_id === null ? LABEL_TANPA_KENDARAAN : kodeBus.get(b.vehicle_id) ?? ""]));
  return [
    [...TEMPLAT.bus.judul, ...trips.map((trip) => judulTrip(trip, data.offset)), ...data.info.map((k) => judulInfo(k.label))],
    ...urutNama(data).map((orang) => [
      orang.qr_code, orang.name, busOrang.get(orang.id) ?? "",
      ...trips.map((trip) => pengecualian.get(`${trip.id}\u0000${orang.id}`) ?? ""),
      ...data.info.map((k) => jawabanInfo(orang.extra, k.key)),
    ]),
  ];
}

/**
 * Semua peserta aktif dalam bentuk templat kereta: dua baris per orang
 * (Outbound lalu Return), urut nama, tiket yang tersimpan sudah terisi
 * (tanggal DD/MM/YYYY, jam HH:MM, sama dengan yang dibaca impor).
 */
export function barisPesertaKereta(data: PesertaUnduh): string[][] {
  const tiket = new Map(data.kereta.map((t) => [`${t.participant_id}\u0000${t.direction}`, t]));
  const tanggal = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
  const jam = (teks: string | null) => (teks ? teks.slice(0, 5) : "");
  const hasil: string[][] = [[...TEMPLAT.kereta.judul, ...data.info.map((k) => judulInfo(k.label))]];
  for (const orang of urutNama(data)) {
    const info = data.info.map((k) => jawabanInfo(orang.extra, k.key));
    for (const arah of ["outbound", "return"] as const) {
      const t = tiket.get(`${orang.id}\u0000${arah}`);
      hasil.push([
        orang.qr_code, orang.name, LABEL_ARAH[arah],
        t?.train_name ?? "", t?.travel_class ?? "", t?.origin ?? "", t?.destination ?? "",
        tanggal(t?.depart_date ?? null), jam(t?.depart_time ?? null), jam(t?.arrive_time ?? null),
        t?.carriage ?? "", t?.seat ?? "", t?.booking_code ?? "",
        ...info,
      ]);
    }
  }
  return hasil;
}
