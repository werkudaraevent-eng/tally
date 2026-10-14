import { apiError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { TiketKereta } from "@/lib/logistik/types";

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
  PARTICIPANT_NOT_FOUND: "A participant was not found or has been deleted at source. Reload the page.",
  LODGING_DATES_INVALID: "Hotel check-out must be after hotel check-in.",
  ROOM_FULL: "This room is full. Choose another room or raise its capacity.",
  LODGING_GENDER_FIELD_NOT_SET:
    "No gender field chosen yet. Choose one in Room rules, or turn off Same-gender rooms only.",
  PARTICIPANT_GENDER_UNKNOWN:
    "This participant has no gender answer yet. Fill it in on the Participant list, then assign them again.",
  ROOM_GENDER_MISMATCH: "This participant's gender differs from the occupants of this room.",
  TRIP_NOT_FOUND: "This trip no longer exists. Reload the page.",
  VEHICLE_NOT_FOUND: "This bus no longer exists. Reload the page.",
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
    return "Bus over capacity. Choose another bus or raise its capacity.";
  }
  const kode = Object.keys(PESAN_RPC).find((nama) => pesan.includes(nama));
  return kode ? PESAN_RPC[kode] : null;
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

export type LogistikRingkas = { kamar: string | null; bus: string | null };

/**
 * Kamar dan bus bawaan untuk sekumpulan peserta, dipakai kolom Kamar dan Bus
 * di Daftar peserta.
 *
 * Empat kueri kecil, bukan satu embed PostgREST: tabel logistik memakai kunci
 * asing komposit (event_id, id), dan embed di atasnya bergantung pada nama
 * relasi yang dipilih PostgREST sendiri. Daftar peserta memuat paling banyak
 * satu halaman (ratusan baris), jadi `.in()` cukup.
 *
 * Galat ditelan dan menghasilkan peta kosong: kolom ini pelengkap, dan acara
 * di database yang belum punya tabel logistik tetap harus bisa membuka
 * daftar pesertanya.
 */
export async function logistikPeserta(eventId: string, ids: string[]): Promise<Map<string, LogistikRingkas>> {
  if (ids.length === 0) return new Map();
  const db = klien();
  const [inap, angkut] = await Promise.all([
    db.from("lodging_assignments").select("participant_id,room_id").eq("event_id", eventId).in("participant_id", ids),
    db.from("transport_assignments").select("participant_id,vehicle_id").eq("event_id", eventId).is("trip_id", null).in("participant_id", ids),
  ]);
  const barisInap = (inap.error ? [] : inap.data ?? []) as Array<{ participant_id: string; room_id: number }>;
  const barisAngkut = (angkut.error ? [] : angkut.data ?? []) as Array<{ participant_id: string; vehicle_id: number | null }>;
  return susunLogistik(eventId, barisInap, barisAngkut, false);
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
  const semua = async <T>(baca: (dari: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> => {
    const hasil: T[] = [];
    for (let dari = 0; dari < 20000; dari += 1000) {
      const { data, error } = await baca(dari);
      if (error || !Array.isArray(data)) throw new Error("LOGISTIK_READ");
      hasil.push(...(data as T[]));
      if (data.length < 1000) break;
    }
    return hasil;
  };
  const [barisInap, barisAngkut] = await Promise.all([
    semua<{ participant_id: string; room_id: number }>((dari) => db.from("lodging_assignments").select("participant_id,room_id").eq("event_id", eventId).order("participant_id").order("room_id").range(dari, dari + 999)),
    semua<{ participant_id: string; vehicle_id: number | null }>((dari) => db.from("transport_assignments").select("participant_id,vehicle_id").eq("event_id", eventId).is("trip_id", null).order("participant_id").order("vehicle_id").range(dari, dari + 999)),
  ]);
  return susunLogistik(eventId, barisInap, barisAngkut, true);
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
  barisInap: Array<{ participant_id: string; room_id: number }>,
  barisAngkut: Array<{ participant_id: string; vehicle_id: number | null }>,
  ketat: boolean,
): Promise<Map<string, LogistikRingkas>> {
  const hasil = new Map<string, LogistikRingkas>();
  const db = klien();
  const idKamar = [...new Set(barisInap.map((b) => b.room_id))];
  const idBus = [...new Set(barisAngkut.map((b) => b.vehicle_id).filter((id): id is number => id !== null))];
  const [barisKamar, barisBus] = await Promise.all([
    bacaMenurutId<{ id: number; room_number: string; hotel_id: number }>(idKamar, (potong) => db.from("lodging_rooms").select("id,room_number,hotel_id").eq("event_id", eventId).in("id", potong), ketat),
    bacaMenurutId<{ id: number; code: string }>(idBus, (potong) => db.from("transport_vehicles").select("id,code").eq("event_id", eventId).in("id", potong), ketat),
  ]);
  const idHotel = [...new Set(barisKamar.map((k) => k.hotel_id))];
  const barisHotel = await bacaMenurutId<{ id: number; name: string }>(idHotel, (potong) => db.from("lodging_hotels").select("id,name").eq("event_id", eventId).in("id", potong), ketat);
  const namaHotel = new Map(barisHotel.map((h) => [h.id, h.name]));
  // Nama hotel hanya disebut bila acaranya punya lebih dari satu hotel di
  // halaman ini; "1208" lebih mudah dipindai daripada "Mulia · 1208" berulang.
  const banyakHotel = idHotel.length > 1;
  const labelKamar = new Map(barisKamar.map((k) => [k.id, banyakHotel ? `${k.room_number} · ${namaHotel.get(k.hotel_id) ?? ""}` : k.room_number]));
  const kodeBus = new Map(barisBus.map((b) => [b.id, b.code]));

  for (const b of barisInap) hasil.set(b.participant_id, { kamar: labelKamar.get(b.room_id) ?? null, bus: null });
  for (const b of barisAngkut) {
    const lama = hasil.get(b.participant_id) ?? { kamar: null, bus: null };
    hasil.set(b.participant_id, { ...lama, bus: b.vehicle_id !== null ? kodeBus.get(b.vehicle_id) ?? null : null });
  }
  return hasil;
}
