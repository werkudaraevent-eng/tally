import { apiError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

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
  ROOM_NOT_FOUND: "Kamar ini sudah tidak ada. Muat ulang halaman.",
  PARTICIPANT_NOT_FOUND: "Ada peserta yang tidak ditemukan atau sudah dihapus di sumber. Muat ulang halaman.",
  LODGING_DATES_INVALID: "Tanggal check-out harus setelah check-in.",
  ROOM_FULL: "Kamar ini sudah penuh. Pilih kamar lain atau naikkan kapasitasnya.",
  LODGING_GENDER_FIELD_NOT_SET:
    "Field jenis kelamin belum dipilih. Pilih di Aturan kamar, atau matikan aturan sesama jenis kelamin.",
  PARTICIPANT_GENDER_UNKNOWN:
    "Peserta ini belum punya jawaban jenis kelamin. Isi di Daftar peserta, lalu tempatkan lagi.",
  ROOM_GENDER_MISMATCH: "Jenis kelamin peserta berbeda dengan penghuni kamar ini.",
  TRIP_NOT_FOUND: "Agenda ini sudah tidak ada. Muat ulang halaman.",
  VEHICLE_NOT_FOUND: "Bus ini sudah tidak ada. Muat ulang halaman.",
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
  const pesan = String(error.message ?? "");
  if (pesan.includes("VEHICLE_FULL")) {
    const rincian = error.details ? ` ${error.details}.` : "";
    return apiError("VALIDATION_ERROR", 422, { message: `Bus melebihi kapasitas.${rincian} Pilih bus lain atau naikkan kapasitasnya.` });
  }
  const kode = Object.keys(PESAN_RPC).find((nama) => pesan.includes(nama));
  if (kode) return apiError("VALIDATION_ERROR", 422, { message: PESAN_RPC[kode] });
  return apiError("INTERNAL_ERROR", 500);
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

export function klien() {
  return getSupabaseServiceClient();
}
