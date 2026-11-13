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
import { type TiketKereta } from "../types.ts";
import type { LabelDipecah, NomorBentrok } from "./kamar.ts";

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

/**
 * Kamar yang dibuat impor. `kunci` dipakai `StayAkhir.kamar` untuk menunjuknya
 * sebelum punya id. Nomor null = nomor menyusul, kamarnya dikenali lewat label.
 */
export type KamarBaru = { kunci: string; hotel: string; nomor: string | null; label: string | null; tipe: string | null; kasur: string | null; kapasitas: number };

/** Kamar yang sudah ada dan isiannya diubah berkas (nomor yang datang belakangan, label, kasur, jenis kamar). */
export type KamarUbah = {
  id: number; nama: string; hotel: string; room_number?: string | null; label?: string; room_type?: string; bed_type?: string;
  /** Nomor yang tersimpan sekarang, bila berkas MENGGANTINYA (bukan mengisi yang kosong): pratinjau menandainya. */
  nomor_lama?: string;
};

/** Kamar tujuan sebuah stay: yang sudah ada (id), atau yang dibuat impor ini (`KamarBaru.kunci`). */
export type RefKamar = { id: number } | { baru: string };

export type Rencana = {
  jenis: JenisImpor;
  /** Masalah yang menolak seluruh berkas, mis. kolom wajib tidak ada. */
  galat: string | null;
  baris: BarisRencana[];
  hotelBaru: string[];
  kamarBaru: KamarBaru[];
  /** Impor kamar: kamar yang sudah ada yang isiannya diubah. Kosong untuk jenis lain. */
  kamarUbah?: KamarUbah[];
  /** Impor kamar: kamar label lama (lihat `lepasLabel`) yang dihapus bila kosong sesudah impor. */
  kamarHapus?: number[];
  /** Impor kamar: label yang dipakai kelompok berbeda di malam lain (dipisah, kecuali "Same room" dipilih). */
  labelDipecah?: LabelDipecah[];
  /** Impor kamar: nomor di berkas yang dipegang kamar berlabel lain (lihat `nomorIkutBerkas`). */
  nomorBentrok?: NomorBentrok[];
  /** Impor kamar: judul kolom berkas dan isian yang dibacanya, supaya panitia melihat kolom mana jadi apa. */
  kolomDibaca?: Array<{ judul: string; jadi: string }>;
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
export type StayAkhir = { hotel: string; kamar: RefKamar | null; malam: Malam | null; asli: { check_in_at: string | null; check_out_at: string | null } | null };

export type TripImpor = { id: number; name: string; depart_at: string | null; follows_default: boolean };

/** Satu tiket dari berkas, siap di-upsert ke `train_tickets`. */
export type TiketImpor = Omit<TiketKereta, "id">;

export type KeadaanAcara = {
  peserta: Array<{ id: string; name: string; qr_code: string; gender: string | null }>;
  hotels: Array<{ id: number; name: string; check_in_at?: string | null; check_out_at?: string | null }>;
  /** `label`, `room_type`, `bed_type`: kosong sebelum migrasi 202610290001. */
  rooms: Array<{ id: number; hotel_id: number; room_number: string | null; label?: string | null; room_type?: string | null; bed_type?: string | null; capacity: number }>;
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

export const ALIAS = {
  hotel: ["hotel", "nama hotel", "hotel name"],
  kamar: ["kamar", "nomor kamar", "no kamar", "no. kamar", "room", "room number", "room no", "room no."],
  // Kode kamar milik panitia ("Kamar 01"): mengelompokkan teman sekamar selama nomornya menyusul.
  label: ["label", "room label", "label kamar", "kode kamar", "room code", "room group"],
  tipe: ["tipe", "tipe kamar", "jenis kamar", "type", "room type", "kategori kamar", "room category"],
  kasur: ["bed", "beds", "bed type", "kasur", "tipe kasur", "jenis kasur", "tipe bed", "jenis bed"],
  kapasitas: ["kapasitas", "capacity", "jumlah tempat", "pax"],
  masuk: ["check-in", "check in", "checkin", "check-in date", "tanggal masuk", "tanggal check-in", "hotel check-in", "hotel check in"],
  keluar: ["check-out", "check out", "checkout", "check-out date", "tanggal keluar", "tanggal check-out", "hotel check-out", "hotel check out"],
  // qr_code: judul kolom ekspor peserta mentah.
  kode: ["kode qr", "qr", "qr code", "qr_code", "kode", "kode peserta", "participant code", "code"],
  nama: ["nama", "nama peserta", "nama lengkap", "nama tamu", "name", "guest", "guest name", "peserta", "tamu", "participant", "participant name", "full name"],
  bus: ["vehicle", "bus", "nama bus", "kendaraan", "nama kendaraan", "armada", "bus name", "vehicle name", "default vehicle", "default bus"],
  arah: ["direction", "arah", "leg", "pergi/pulang", "berangkat/pulang", "outbound/return"],
  // Nama dan nomor layanan: kereta, penerbangan, atau kapal.
  kereta: ["train", "kereta", "nama kereta", "kereta api", "train name", "nama ka", "ka", "train / flight", "train/flight", "flight", "flight number", "flight no", "nomor penerbangan", "penerbangan", "pesawat", "ship", "kapal", "service", "layanan"],
  moda: ["mode", "moda", "transport", "transportasi", "moda transportasi", "jenis transportasi"],
  segmen: ["segment", "segmen", "transit", "urutan", "leg no", "leg number"],
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
    judul: ["QR code", "Name", "Direction", "Segment", "Mode", "Train / flight", "Class", "From", "To", "Date", "Departs", "Arrives", "Carriage", "Seat", "Booking code"],
    contoh: [
      ["", "Budi Santoso", "Outbound", "1", "Train", "Argo Lawu 8", "Executive", "Gambir", "Yogyakarta", "06/11/2026", "08:20", "15:10", "EKS 3", "12A", "KBX7Q2"],
      ["", "Budi Santoso", "Return", "1", "Train", "Taksaka 72", "Executive", "Yogyakarta", "Gambir", "08/11/2026", "15:30", "22:05", "EKS 5", "8C", "KBX7Q2"],
      // Transit: segmen 1 lalu 2 pada arah yang sama.
      ["", "Siti Rahayu", "Outbound", "1", "Flight", "Garuda GA 181", "Economy", "Medan KNO", "Jakarta CGK", "06/11/2026", "06:10", "08:35", "", "21C", "GX4R7P"],
      ["", "Siti Rahayu", "Outbound", "2", "Flight", "Garuda GA 208", "Economy", "Jakarta CGK", "Yogyakarta YIA", "06/11/2026", "10:20", "11:35", "", "14A", "GX4R7P"],
    ],
  },
};

export const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "5–6 Nov" dari malam di berkas. */
export function rentangTanggal(malam: Malam): string {
  const [a, b] = [malam.masuk, malam.keluar].map((t) => ({ hari: Number(t.slice(8, 10)), bulan: BULAN_PENDEK[Number(t.slice(5, 7)) - 1] }));
  return a.bulan === b.bulan ? `${a.hari}–${b.hari} ${b.bulan}` : `${a.hari} ${a.bulan} – ${b.hari} ${b.bulan}`;
}

/**
 * Judul templat stay: QR code, Name, lalu Hotel N, Room N, Check-in N,
 * Check-out N, dan Room label N bila acaranya memakai label kamar.
 */
export function judulStay(slot: number, denganLabel = false): string[] {
  const judul = ["QR code", "Name"];
  for (let n = 1; n <= slot; n += 1) {
    judul.push(`Hotel ${n}`, `Room ${n}`, `Check-in ${n}`, `Check-out ${n}`);
    if (denganLabel) judul.push(`Room label ${n}`);
  }
  return judul;
}

export const rapi = (nilai: string | undefined) => (nilai ?? "").replace(/\s+/g, " ").trim();
export const kunci = (nilai: string | null | undefined) => rapi(nilai ?? "").toLowerCase();

export type Kolom = Partial<Record<keyof typeof ALIAS, number>>;

export function bacaJudul(sel: string[][]): { kolom: Kolom; mulai: number } | null {
  // Judul boleh tidak di baris pertama: rooming list dari hotel sering diawali
  // nama acara atau tanggal. Lima baris pertama diperiksa.
  for (let i = 0; i < Math.min(5, sel.length); i += 1) {
    const judul = sel[i].map((isi) => kunci(isi));
    const kolom: Kolom = {};
    for (const [nama, alias] of Object.entries(ALIAS) as Array<[keyof typeof ALIAS, readonly string[]]>) {
      const indeks = judul.findIndex((isi) => alias.includes(isi));
      if (indeks >= 0) kolom[nama] = indeks;
    }
    pasangan(judul, kolom);
    if (kolom.kamar !== undefined || kolom.bus !== undefined || kolom.kereta !== undefined || kolom.nama !== undefined) return { kolom, mulai: i + 1 };
  }
  return null;
}

/**
 * Judul umum yang artinya ditentukan pasangannya. Rooming list panitia sering
 * berisi "Kamar" (Kamar 01) di samping "Room number", dan "Tipe" (Twin) di
 * samping "Jenis kamar" (Deluxe). Bila judul tegasnya ada, judul umum itu
 * dibaca sebagai label kamar dan jenis kasur. Tanpa pasangan, artinya tetap
 * seperti dulu (nomor kamar, jenis kamar).
 */
const PASANGAN = [
  { umum: ["kamar", "room"], tegas: ["nomor kamar", "no kamar", "no. kamar", "room number", "room no", "room no."], milik: "kamar", jadi: "label" },
  { umum: ["tipe", "type"], tegas: ["tipe kamar", "jenis kamar", "room type", "kategori kamar", "room category"], milik: "tipe", jadi: "kasur" },
] as const;

function pasangan(judul: string[], kolom: Kolom) {
  for (const { umum, tegas, milik, jadi } of PASANGAN) {
    const iTegas = judul.findIndex((isi) => (tegas as readonly string[]).includes(isi));
    const iUmum = judul.findIndex((isi) => (umum as readonly string[]).includes(isi));
    if (iTegas < 0 || iUmum < 0) continue;
    kolom[milik] = iTegas;
    if (kolom[jadi] === undefined) kolom[jadi] = iUmum;
  }
}

type Pencocok = (kode: string, nama: string) => { id: string } | { alasan: string };

export function buatPencocok(peserta: KeadaanAcara["peserta"]): Pencocok {
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

export function kosong(jenis: JenisImpor, galat: string): Rencana {
  return { jenis, galat, baris: [], hotelBaru: [], kamarBaru: [], busBaru: [], penempatan: [], lepas: [], akhir: [], tiket: [], dilewati: 0, busTrip: [] };
}
