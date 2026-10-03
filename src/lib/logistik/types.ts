/**
 * Bentuk data halaman Logistik, dipakai bersama route dan halamannya.
 *
 * Satu GET memuat seluruh logistik acara sekaligus. Ukurannya kecil (ratusan
 * kamar dan belasan bus paling banyak), dan ketiga tab saling membaca: kartu
 * peserta di dialog kamar perlu tahu bus bawaannya, dan sebaliknya.
 */

export type LogistikPeserta = {
  id: string;
  name: string;
  company: string | null;
  qr_code: string;
  /** Jawaban jenis kelamin apa adanya (dipangkas), dari field di Aturan kamar. */
  gender: string | null;
};

export type LogistikField = {
  key: string;
  label: string;
  /** `form`: field formulir pendaftaran. `data`: hanya ada di data peserta (impor). */
  source: "form" | "data";
  /** Berapa peserta yang punya jawaban untuk field ini. */
  filled: number;
};

export type Hotel = {
  id: number;
  name: string;
  address: string | null;
  map_url: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  sort_order: number;
};

export type Kamar = {
  id: number;
  hotel_id: number;
  room_number: string;
  room_type: string | null;
  capacity: number;
  floor: string | null;
  notes: string | null;
};

export type Bus = {
  id: number;
  code: string;
  capacity: number | null;
  plate_number: string | null;
  crew_contact: string | null;
  sort_order: number;
};

export type Agenda = {
  id: number;
  name: string;
  depart_at: string | null;
  origin: string | null;
  destination: string | null;
  meeting_point: string | null;
  follows_default: boolean;
  sort_order: number;
};

export type Barang = {
  id: number;
  name: string;
  size_field_key: string | null;
  pickup_note: string | null;
  sort_order: number;
};

export type LogistikData = {
  settings: { gender_field_key: string | null; enforce_same_gender: boolean };
  fields: LogistikField[];
  participants: LogistikPeserta[];
  hotels: Hotel[];
  rooms: Kamar[];
  lodging: Array<{ participant_id: string; room_id: number }>;
  vehicles: Bus[];
  trips: Agenda[];
  /** `trip_id` null = bus bawaan. `vehicle_id` null = "tidak naik bus" di agenda itu. */
  transport: Array<{ trip_id: number | null; vehicle_id: number | null; participant_id: string }>;
  overview: Array<{ trip_id: number; vehicle_id: number; load: number; over_capacity: boolean }>;
  items: Barang[];
  recap: Array<{ item_id: number; size: string | null; participants: number; picked_up: number }>;
  item_sessions: Array<{ item_id: number; session_id: number; session_name: string }>;
};

/** Pembanding jenis kelamin yang sama dengan `lodging_gender_of` di database. */
export const kunciGender = (nilai: string | null | undefined) => nilai?.trim().toLowerCase() || null;
