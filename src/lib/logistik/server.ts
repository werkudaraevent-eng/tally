import { apiError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { TiketKereta } from "@/lib/logistik/types";
import { labelStay, type BentukLogistik, type LogistikRingkas } from "@/lib/logistik/ringkas";
import { petaKendaraan, teksKendaraan, type BarisAngkut, type TripKendaraan } from "@/lib/logistik/kendaraan-trip";
import { stayPerPeserta, tanggalStay, type TanggalHotel } from "@/lib/logistik/stay";
import type { TripTertaut } from "@/lib/logistik/trip-agenda";

/**
 * Potongan bersama route Logistik (kamar, bus, barang).
 *
 * Semua keputusan yang harus atomik (kapasitas kamar, jenis kelamin sekamar,
 * kapasitas bus di tiap agenda) ada di RPC migrasi 202609300002..04. Route di
 * sini hanya menjaga siapa yang memanggil, acara mana, dan menerjemahkan galat
 * database menjadi kalimat yang menyebut langkah berikutnya.
 */

/**
 * Galat RPC logistik, dari kode di `raise exception` ke kalimat untuk panitia.
 *
 * Kalimat menyebut APA yang harus diubah dan DI MANA. Panitia yang membaca
 * "gagal disimpan" untuk kamar campuran akan mencoba kamar yang sama lagi.
 */
const PESAN_RPC: Record<string, string> = {
  ROOM_NOT_FOUND: "This room no longer exists. Reload the page.",
  HOTEL_NOT_FOUND: "This hotel no longer exists. Reload the page.",
  PARTICIPANT_NOT_FOUND: "A participant was not found or has been deleted at source. Reload the page.",
  LODGING_DATES_INVALID: "Check-out must be after check-in.",
  // Stay lain yang dipotong ke hari pindah akan berakhir sebelum mulai
  // (mis. check-in 13.00 di hari check-in 14.00 hotel baru).
  lodging_assignments_dates_check: "These nights would leave another hotel stay ending before it starts. Change or remove that stay first in Stays.",
  ROOM_FULL: "This room is full. Choose another room or raise its capacity.",
  LODGING_GENDER_FIELD_NOT_SET:
    "No gender field chosen yet. Choose one in Room rules, or turn off Same-gender rooms only.",
  PARTICIPANT_GENDER_UNKNOWN:
    "This participant has no gender answer yet. Fill it in on the Participant list, then assign them again.",
  ROOM_GENDER_MISMATCH: "This participant's gender differs from the occupants of this room.",
  LODGING_STAYS_OVERLAP: "Two stays of one person share a night. Change the dates so one ends when the next starts.",
  STAY_AMBIGUOUS: "This person has more than one stay at this hotel. Choose the stay in Stays.",
  STAY_NOT_FOUND: "This stay no longer exists. Reload the page.",
  STAYS_INVALID: "The stays could not be read. Reload the page, then try again.",
  TRIP_NOT_FOUND: "This trip no longer exists. Reload the page.",
  VEHICLE_NOT_FOUND: "This vehicle no longer exists. Reload the page.",
  SESSION_NOT_FOUND: "Sesi tidak ditemukan di acara ini.",
  SESSION_CLOSED: "Sesi ini sudah ditutup. Pilih sesi lain.",
  ITEM_NOT_IN_SESSION: "Barang ini tidak diperiksa di sesi ini. Muat ulang layar pemindai.",
};

/**
 * Respons galat untuk hasil RPC yang gagal. Kode yang dikenal menjadi 422
 * dengan kalimatnya; sisanya 500. `VEHICLE_FULL` membawa rincian bus dan
 * agendanya dari `detail`, karena "bus penuh" tanpa menyebut agenda mana tidak
 * bisa ditindaklanjuti ketika satu bus dipakai di lima agenda.
 */
export function galatRpc(error: { message?: string; details?: string | null }) {
  const pesan = pesanRpc(error);
  return pesan ? apiError("VALIDATION_ERROR", 422, { message: pesan }) : apiError("INTERNAL_ERROR", 500);
}

/** Kalimat untuk galat RPC yang dikenal, atau null. Dipakai juga impor Excel, yang melaporkan per orang. */
export function pesanRpc(error: { message?: string; details?: string | null }): string | null {
  const pesan = String(error.message ?? "");
  if (pesan.includes("VEHICLE_FULL")) {
    // error.details dari SQL berbahasa Indonesia; tidak ditempel ke kalimat English.
    return "Vehicle over capacity. Choose another vehicle or raise its capacity.";
  }
  const kode = Object.keys(PESAN_RPC).find((nama) => pesan.includes(nama));
  if (!kode) return null;
  // Rincian kamar penuh dan malam yang bertabrakan ditulis SQL dalam English
  // ("Room 1208: 2 of 2 places taken"): ditempel supaya panitia tahu kamar
  // atau orang mana. Rincian ROOM_FULL sebelum migrasi 202610280001
  // berbahasa Indonesia dan tidak ditempel.
  const rinci = error.details ?? "";
  if ((kode === "ROOM_FULL" && rinci.startsWith("Room ")) || (kode === "LODGING_STAYS_OVERLAP" && rinci)) return `${PESAN_RPC[kode]} ${rinci}.`;
  return PESAN_RPC[kode];
}

/**
 * Semua baris sebuah kueri, dibaca per 1000.
 *
 * PostgREST memotong satu jawaban di 1000 baris, dan acara dengan 1.500
 * peserta akan tampak "1.000 peserta, 500 belum dapat kamar" tanpa galat apa
 * pun. `buat` dipanggil ulang per halaman karena pembangun kueri Supabase
 * tidak bisa dipakai dua kali.
 */
export async function semuaBaris<T>(
  buat: () => { range: (dari: number, sampai: number) => PromiseLike<{ data: unknown; error: unknown }> },
): Promise<T[] | null> {
  const hasil: T[] = [];
  for (let dari = 0; dari < 50000; dari += 1000) {
    const { data, error } = await buat().range(dari, dari + 999);
    if (error || !Array.isArray(data)) return null;
    hasil.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return hasil;
}

/** Baca `id` dari query string. Null bila bukan bilangan bulat positif. */
export function idDariQuery(request: Request): number | null {
  const id = Number(new URL(request.url).searchParams.get("id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Kolom `train_tickets` yang dibaca admin. */
export const KOLOM_KERETA = "id,participant_id,direction,train_name,travel_class,origin,destination,depart_date,depart_time,arrive_time,carriage,seat,booking_code";

/** Galat PostgREST/Postgres untuk tabel yang belum ada. */
export const tabelBelumAda = (error: { code?: string | number } | null) => ["PGRST205", "42P01"].includes(String(error?.code ?? ""));

/** Galat untuk kolom yang belum ada: 42703 dari Postgres, PGRST204 dari cache skema PostgREST. */
export const kolomBelumAda = (error: { code?: string | number } | null) => ["42703", "PGRST204"].includes(String(error?.code ?? ""));

/**
 * Semua tiket kereta acara. null = tabelnya belum ada (migrasi 202610140001
 * belum dijalankan), supaya halaman Logistik tetap terbuka dan tab Trains
 * menyebut langkah yang kurang. "galat" = gagal baca karena hal lain.
 */
export async function bacaTiketKereta(eventId: string): Promise<TiketKereta[] | null | "galat"> {
  const db = klien();
  // GET, bukan HEAD: jawaban HEAD tidak membawa badan, jadi kode PGRST205
  // ("tabel tidak ada") tidak terbaca dan halaman jatuh ke galat 500.
  const uji = await db.from("train_tickets").select("id").eq("event_id", eventId).limit(1);
  if (uji.error) return tabelBelumAda(uji.error) ? null : "galat";
  const baris = await semuaBaris<TiketKereta>(() => db.from("train_tickets").select(KOLOM_KERETA).eq("event_id", eventId).order("id"));
  return baris ?? "galat";
}

export function klien() {
  return getSupabaseServiceClient();
}

/**
 * Trip bus yang ditautkan ke baris Agenda acara, per id baris, urut jam
 * berangkat. Dibaca CMS Agenda untuk chip Bus dan catatan di Edit item.
 *
 * Peta kosong bila bacaannya gagal, termasuk sebelum migrasi 202610170002
 * dijalankan (kolom rundown_item_id belum ada, 42703): Agenda tetap terbuka,
 * hanya tanpa penanda bus. Trip satu acara puluhan, jauh di bawah 1000.
 */
export async function tripPerBarisAgenda(eventId: string): Promise<Map<number, TripTertaut[]>> {
  const hasil = new Map<number, TripTertaut[]>();
  try {
    const { data, error } = await klien()
      .from("transport_trips")
      .select("id,name,depart_at,rundown_item_id")
      .eq("event_id", eventId)
      .not("rundown_item_id", "is", null)
      .order("depart_at", { ascending: true, nullsFirst: false })
      .order("id")
      .limit(1000);
    if (error || !Array.isArray(data)) return hasil;
    for (const trip of data as Array<TripTertaut & { rundown_item_id: number }>) {
      hasil.set(trip.rundown_item_id, [...(hasil.get(trip.rundown_item_id) ?? []), { id: trip.id, name: trip.name, depart_at: trip.depart_at }]);
    }
  } catch {
    // Sama dengan galat baca: Agenda tetap terbuka tanpa penanda bus.
  }
  return hasil;
}

export type { LogistikRingkas };


/** Kolom Trip yang dibutuhkan untuk kendaraan per trip di Daftar peserta. */
const KOLOM_TRIP = "id,name,depart_at,follows_default,sort_order";

/**
 * Stay, bus, tiket kereta dan barang kit untuk sekumpulan peserta, dipakai
 * kolom Logistics dan panel detail di Daftar peserta.
 *
 * Kueri kecil per tabel, bukan satu embed PostgREST: tabel logistik memakai
 * kunci asing komposit (event_id, id), dan embed di atasnya bergantung pada
 * nama relasi yang dipilih PostgREST sendiri. Daftar peserta memuat paling
 * banyak satu halaman (sampai 1000 baris), jadi `.in()` per potongan cukup.
 *
 * Galat ditelan dan menghasilkan peta kosong: kolom ini pelengkap, dan acara
 * di database yang belum punya tabel logistik (atau tiket kereta) tetap harus
 * bisa membuka daftar pesertanya.
 */
export async function logistikPeserta(eventId: string, ids: string[]): Promise<Map<string, LogistikRingkas>> {
  if (ids.length === 0) return new Map();
  const db = klien();
  // Satu halaman daftar bisa 1000 peserta ("All"). Id dikirim per 150 supaya
  // URL `.in()` tetap di bawah batas lazim 8 KB (150 uuid kira-kira 5,6 KB),
  // dan tiap potongan dibaca per 1000 baris (150 peserta x 6 barang kit = 900,
  // tapi kit bisa lebih). Galat tetap ditelan (sel kosong).
  const aman = <T,>(baca: Promise<T[]>) => baca.catch(() => [] as T[]);
  const potongan: string[][] = [];
  for (let i = 0; i < ids.length; i += 150) potongan.push(ids.slice(i, i + 150));
  const perPotongan = <T,>(baca: (bagian: string[], dari: number) => PromiseLike<{ data: unknown; error: unknown }>) =>
    aman(Promise.all(potongan.map((bagian) => bacaSemua<T>((dari) => baca(bagian, dari)))).then((semua) => semua.flat()));
  const [barisInap, barisAngkut, kereta, ambil, trips] = await Promise.all([
    perPotongan<BarisInap>((bagian, dari) => db.from("lodging_assignments").select("id,participant_id,hotel_id,room_id,check_in_at,check_out_at").eq("event_id", eventId).in("participant_id", bagian).order("participant_id").order("id").range(dari, dari + 999)),
    perPotongan<BarisAngkut>((bagian, dari) => db.from("transport_assignments").select("trip_id,participant_id,vehicle_id").eq("event_id", eventId).in("participant_id", bagian).order("id").range(dari, dari + 999)),
    perPotongan<TiketKereta>((bagian, dari) => db.from("train_tickets").select(KOLOM_KERETA).eq("event_id", eventId).in("participant_id", bagian).order("id").range(dari, dari + 999)),
    perPotongan<BarisAmbil>((bagian, dari) => db.from("item_pickups").select("participant_id,item_id,size").eq("event_id", eventId).in("participant_id", bagian).order("id").range(dari, dari + 999)),
    aman(bacaSemua<TripKendaraan>((dari) => db.from("transport_trips").select(KOLOM_TRIP).eq("event_id", eventId).order("id").range(dari, dari + 999))),
  ]);
  const hasil = await susunLogistik(eventId, barisInap, barisAngkut, trips, false);
  tambahKeretaKit(hasil, kereta, ambil);
  return hasil;
}

/**
 * Kamar dan bus bawaan SEMUA peserta acara, untuk saringan dan urutan Room/Bus
 * di Daftar peserta. Dibaca per 1000 baris karena PostgREST memotong satu
 * jawaban di 1000; batasnya sama dengan batas baca saringan (20.000).
 *
 * Berbeda dengan `logistikPeserta`, galat baca DILEMPAR: saringan dan urutan
 * di atas data yang terbaca separuh memberi jawaban salah tanpa tanda.
 */
export async function logistikAcara(eventId: string): Promise<Map<string, LogistikRingkas>> {
  const db = klien();
  const [barisInap, barisAngkut, trips] = await Promise.all([
    bacaSemua<BarisInap>((dari) => db.from("lodging_assignments").select("id,participant_id,hotel_id,room_id,check_in_at,check_out_at").eq("event_id", eventId).order("participant_id").order("id").range(dari, dari + 999)),
    bacaSemua<BarisAngkut>((dari) => db.from("transport_assignments").select("trip_id,participant_id,vehicle_id").eq("event_id", eventId).order("id").range(dari, dari + 999)),
    bacaSemua<TripKendaraan>((dari) => db.from("transport_trips").select(KOLOM_TRIP).eq("event_id", eventId).order("id").range(dari, dari + 999)),
  ]);
  return susunLogistik(eventId, barisInap, barisAngkut, trips, true);
}

/**
 * Seluruh logistik acara untuk ekspor Daftar peserta: `logistikAcara` plus
 * tiket kereta dan barang kit. Galat baca dilempar, seperti `logistikAcara`:
 * berkas yang diam-diam kehilangan sebagian hotel lebih buruk daripada gagal.
 * Tabel tiket kereta yang belum ada dianggap kosong.
 */
export async function logistikEkspor(eventId: string): Promise<Map<string, LogistikRingkas>> {
  const db = klien();
  const [hasil, kereta, barang] = await Promise.all([
    logistikAcara(eventId),
    bacaTiketKereta(eventId),
    bacaSemua<BarisAmbil>((dari) => db.from("item_pickups").select("participant_id,item_id,size").eq("event_id", eventId).order("id").range(dari, dari + 999)),
  ]);
  if (kereta === "galat") throw new Error("LOGISTIK_READ");
  tambahKeretaKit(hasil, kereta ?? [], barang);
  return hasil;
}

async function bacaSemua<T>(baca: (dari: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const hasil: T[] = [];
  for (let dari = 0; dari < 20000; dari += 1000) {
    const { data, error } = await baca(dari);
    if (error || !Array.isArray(data)) throw new Error("LOGISTIK_READ");
    hasil.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return hasil;
}

/** `room_id` null = tamu hotel itu, nomor kamar menyusul. Satu baris per stay. */
type BarisInap = { id: number; participant_id: string; hotel_id: number; room_id: number | null; check_in_at: string | null; check_out_at: string | null };

type BarisAmbil = { participant_id: string; item_id: number; size: string | null };

const kosong = (): LogistikRingkas => ({ kamar: null, bus: null, stays: [] });

/** Tiket kereta dan barang kit ke ringkasan yang sudah ada (atau baru). */
function tambahKeretaKit(hasil: Map<string, LogistikRingkas>, tiket: TiketKereta[], ambil: BarisAmbil[]) {
  for (const t of tiket) {
    const r = hasil.get(t.participant_id) ?? kosong();
    hasil.set(t.participant_id, { ...r, kereta: { ...r.kereta, [t.direction]: t } });
  }
  for (const a of ambil) {
    const r = hasil.get(a.participant_id) ?? kosong();
    hasil.set(a.participant_id, { ...r, kit: { ...r.kit, [String(a.item_id)]: a.size } });
  }
}

/**
 * Bentuk kolom logistik acara untuk Daftar peserta dan ekspornya: jumlah slot
 * stay terbanyak satu peserta, barang kit acara, dan ada tiket kereta atau
 * tidak. Galat dilempar: kolom yang hilang diam-diam dari berkas ekspor lebih
 * buruk daripada gagal. Tabel tiket yang belum ada = tanpa kolom kereta.
 */
export async function bentukLogistik(eventId: string): Promise<BentukLogistik> {
  const db = klien();
  const [inap, barang, kereta] = await Promise.all([
    bacaSemua<{ participant_id: string }>((dari) => db.from("lodging_assignments").select("participant_id").eq("event_id", eventId).order("id").range(dari, dari + 999)),
    db.from("pickup_items").select("id,name").eq("event_id", eventId).order("sort_order").order("id"),
    db.from("train_tickets").select("id").eq("event_id", eventId).limit(1),
  ]);
  if (barang.error && !tabelBelumAda(barang.error)) throw new Error("LOGISTIK_READ");
  if (kereta.error && !tabelBelumAda(kereta.error)) throw new Error("LOGISTIK_READ");
  const per = new Map<string, number>();
  for (const b of inap) per.set(b.participant_id, (per.get(b.participant_id) ?? 0) + 1);
  return {
    stays: Math.max(1, ...per.values()),
    kit: barang.error ? [] : (barang.data ?? []) as Array<{ id: number; name: string }>,
    kereta: !kereta.error && (kereta.data ?? []).length > 0,
  };
}

/** Id per `.in()`: jauh di bawah batas 1000 baris PostgREST dan batas panjang URL. */
const POTONG_ID = 200;

/**
 * Baca baris menurut daftar id, per potongan. Satu `.in()` berisi seluruh id
 * acara besar terpotong diam-diam di 1000 baris (QA #154 H1) dan URL-nya
 * melewati 7 KB. `ketat`: galat dilempar, bukan dianggap kosong.
 */
async function bacaMenurutId<T>(ids: number[], baca: (potong: number[]) => PromiseLike<{ data: unknown; error: unknown }>, ketat: boolean): Promise<T[]> {
  const hasil: T[] = [];
  for (let i = 0; i < ids.length; i += POTONG_ID) {
    const { data, error } = await baca(ids.slice(i, i + POTONG_ID));
    if (error || !Array.isArray(data)) {
      if (ketat) throw new Error("LOGISTIK_READ");
      continue;
    }
    hasil.push(...(data as T[]));
  }
  return hasil;
}

async function susunLogistik(
  eventId: string,
  barisInap: BarisInap[],
  barisAngkut: BarisAngkut[],
  trips: TripKendaraan[],
  ketat: boolean,
): Promise<Map<string, LogistikRingkas>> {
  const hasil = new Map<string, LogistikRingkas>();
  const db = klien();
  const idKamar = [...new Set(barisInap.map((b) => b.room_id).filter((id): id is number => id !== null))];
  const idBus = [...new Set(barisAngkut.map((b) => b.vehicle_id).filter((id): id is number => id !== null))];
  const idHotel = [...new Set(barisInap.map((b) => b.hotel_id))];
  const [barisKamar, barisBus, barisHotel] = await Promise.all([
    bacaMenurutId<{ id: number; room_number: string }>(idKamar, (potong) => db.from("lodging_rooms").select("id,room_number").eq("event_id", eventId).in("id", potong), ketat),
    bacaMenurutId<{ id: number; code: string }>(idBus, (potong) => db.from("transport_vehicles").select("id,code").eq("event_id", eventId).in("id", potong), ketat),
    bacaMenurutId<TanggalHotel & { name: string }>(idHotel, (potong) => db.from("lodging_hotels").select("id,name,check_in_at,check_out_at").eq("event_id", eventId).in("id", potong), ketat),
  ]);
  const hotelById = new Map(barisHotel.map((h) => [h.id, h]));
  const nomorKamar = new Map(barisKamar.map((k) => [k.id, k.room_number]));
  const kodeBus = new Map(barisBus.map((b) => [b.id, b.code]));

  // Pindah hotel: semua stay berurutan tanggal, sama dengan urutan portal.
  for (const [pid, daftar] of stayPerPeserta(barisInap, hotelById)) {
    const stays = daftar.map((b) => {
      const t = tanggalStay(b, hotelById.get(b.hotel_id));
      return {
        hotel: hotelById.get(b.hotel_id)?.name ?? "",
        room: b.room_id !== null ? nomorKamar.get(b.room_id) ?? null : null,
        check_in_at: t.masuk,
        check_out_at: t.keluar,
      };
    });
    hasil.set(pid, { kamar: labelStay(stays), bus: null, stays });
  }
  // Kendaraan per Trip bila acara punya Trip ("BUS 5", atau "Ke venue: BUS 5 ·
  // Jeep Merapi: BUS 7"); tanpa Trip, kendaraan utama saja. Lihat `kendaraan-trip.ts`.
  const baca = petaKendaraan(barisAngkut, trips);
  const adaKendaraan = new Set(barisAngkut.map((b) => b.participant_id));
  for (const pid of adaKendaraan) {
    const lama = hasil.get(pid) ?? kosong();
    hasil.set(pid, { ...lama, bus: teksKendaraan(baca(pid), (id) => kodeBus.get(id) ?? "Vehicle") });
  }
  return hasil;
}
