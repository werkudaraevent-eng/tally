/**
 * Stay: satu penempatan hotel seorang peserta (hotel, kamar boleh menyusul,
 * dan malam menginap). Peserta boleh punya beberapa stay, satu per hotel,
 * berurutan tanggal: GRAMM 5-6 Nov lalu RAY 6-8 Nov.
 *
 * Tanggal stay null = ikut tanggal hotel. Jadi peserta dengan satu stay tanpa
 * tanggal tetap seperti sebelum ada fitur ini.
 *
 * Murni dan tanpa impor alias, supaya bisa diuji langsung dengan Node
 * (`stay.check.ts`). Zona acara diberikan sebagai offset tetap ("+07:00"):
 * zona Indonesia tidak punya DST (lihat src/lib/timezone.ts).
 */

export type Stay = {
  participant_id: string;
  hotel_id: number;
  room_id: number | null;
  /** Null = ikut tanggal hotel. */
  check_in_at: string | null;
  check_out_at: string | null;
};

export type TanggalHotel = { id: number; check_in_at: string | null; check_out_at: string | null };

/** Jam bawaan bila hotel belum punya jam check-in/out. */
export const JAM_MASUK = "14:00";
export const JAM_KELUAR = "12:00";

function menit(offset: string): number {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** Tanggal ISO di zona acara, "2026-11-06". */
export function tanggalZona(iso: string, offset: string): string {
  return new Date(Date.parse(iso) + menit(offset) * 60000).toISOString().slice(0, 10);
}

/** Jam dinding di zona acara, "14:00". */
export function jamZona(iso: string, offset: string): string {
  return new Date(Date.parse(iso) + menit(offset) * 60000).toISOString().slice(11, 16);
}

/** Tanggal "2026-11-06" + jam "14:00" di zona acara menjadi ISO. */
export function keIso(tanggal: string, jam: string, offset: string): string {
  return new Date(`${tanggal}T${jam}:00${offset}`).toISOString();
}

/**
 * Malam ("2026-11-05" sampai "2026-11-06") ke ISO, dengan jam check-in/out
 * hotelnya atau jam bawaan: check-out 12.00 hari pindah, check-in 14.00.
 */
export function malamIso(hotel: { check_in_at?: string | null; check_out_at?: string | null } | undefined, masuk: string, keluar: string, offset: string) {
  const jamMasuk = hotel?.check_in_at ? jamZona(hotel.check_in_at, offset) : JAM_MASUK;
  const jamKeluar = hotel?.check_out_at ? jamZona(hotel.check_out_at, offset) : JAM_KELUAR;
  return { check_in_at: keIso(masuk, jamMasuk, offset), check_out_at: keIso(keluar, jamKeluar, offset) };
}

/**
 * Tanggal efektif sebuah stay: miliknya sendiri, lalu hotelnya. Null = tanpa
 * batas (hotel belum punya tanggal).
 */
export function tanggalStay(stay: Pick<Stay, "hotel_id" | "check_in_at" | "check_out_at">, hotel: TanggalHotel | undefined) {
  return {
    masuk: stay.check_in_at ?? hotel?.check_in_at ?? null,
    keluar: stay.check_out_at ?? hotel?.check_out_at ?? null,
  };
}

/** Stay seorang peserta, urut tanggal masuk (tanpa tanggal lebih dulu, seperti `member_logistics`). */
export function urutkanStay<T extends Stay>(stays: T[], hotelById: Map<number, TanggalHotel>): T[] {
  return [...stays].sort((a, b) => {
    const ma = tanggalStay(a, hotelById.get(a.hotel_id)).masuk;
    const mb = tanggalStay(b, hotelById.get(b.hotel_id)).masuk;
    if (ma === mb) return a.hotel_id - b.hotel_id;
    if (ma === null) return -1;
    if (mb === null) return 1;
    return Date.parse(ma) - Date.parse(mb);
  });
}

/** Stay per peserta, sudah urut. */
export function stayPerPeserta<T extends Stay>(stays: T[], hotelById: Map<number, TanggalHotel>): Map<string, T[]> {
  const per = new Map<string, T[]>();
  for (const stay of stays) per.set(stay.participant_id, [...(per.get(stay.participant_id) ?? []), stay]);
  for (const [id, daftar] of per) per.set(id, urutkanStay(daftar, hotelById));
  return per;
}

/**
 * Apakah stay ini berlaku pada tanggal itu (zona acara). Hari pindah berlaku
 * untuk kedua hotel: sarapan dan check-out di hotel lama, check-in di hotel
 * baru. Stay tanpa tanggal berlaku setiap hari.
 */
export function stayPadaTanggal(masuk: string | null, keluar: string | null, tanggal: string, offset: string): boolean {
  if (masuk && tanggalZona(masuk, offset) > tanggal) return false;
  if (keluar && tanggalZona(keluar, offset) < tanggal) return false;
  return true;
}

export type Potongan =
  /** `sisaHilang`: stay lama berlanjut melewati malam baru; malam sesudahnya ikut hilang. */
  | { jenis: "akhir"; hotel_id: number; tanggal: string; sisaHilang: string | null }
  | { jenis: "awal"; hotel_id: number; tanggal: string }
  | { jenis: "hapus"; hotel_id: number };

/**
 * Apa yang terjadi pada stay lain seseorang bila ia diberi stay baru di
 * `hotelId` dari `masuk` sampai `keluar`. Cermin `set_stay` di migrasi
 * 202610230002, untuk kalimat akibat di dialog sebelum tombol ditekan.
 */
export function potonganStay(
  stays: Stay[],
  hotelId: number,
  masuk: string,
  keluar: string,
  hotelById: Map<number, TanggalHotel>,
  offset: string,
): Potongan[] {
  const hasil: Potongan[] = [];
  const m = Date.parse(masuk);
  const k = Date.parse(keluar);
  for (const stay of stays) {
    if (stay.hotel_id === hotelId) continue;
    const t = tanggalStay(stay, hotelById.get(stay.hotel_id));
    const sm = t.masuk === null ? null : Date.parse(t.masuk);
    const sk = t.keluar === null ? null : Date.parse(t.keluar);
    const tabrak = (sm === null || sm < k) && (sk === null || sk > m);
    if (!tabrak) continue;
    if (sm === null || sm < m) {
      const sisaHilang = sk === null || sk > k ? tanggalZona(keluar, offset) : null;
      hasil.push({ jenis: "akhir", hotel_id: stay.hotel_id, tanggal: tanggalZona(masuk, offset), sisaHilang });
    }
    else if (sk === null || sk > k) hasil.push({ jenis: "awal", hotel_id: stay.hotel_id, tanggal: tanggalZona(keluar, offset) });
    else hasil.push({ jenis: "hapus", hotel_id: stay.hotel_id });
  }
  return hasil;
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HARI = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Fri 6 Nov" dari "2026-11-06" (layar staf, en-GB). */
export function labelTanggal(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  return `${HARI[d.getUTCDay()]} ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}`;
}

/** "5–6 Nov" atau "30 Nov – 2 Dec" untuk kolom tabel yang sempit. */
export function labelRentang(masuk: string | null, keluar: string | null, offset: string): string | null {
  if (!masuk && !keluar) return null;
  const pecah = (iso: string) => {
    const t = tanggalZona(iso, offset);
    return { hari: Number(t.slice(8, 10)), bulan: BULAN[Number(t.slice(5, 7)) - 1] };
  };
  if (masuk && keluar) {
    const a = pecah(masuk);
    const b = pecah(keluar);
    return a.bulan === b.bulan ? `${a.hari}–${b.hari} ${b.bulan}` : `${a.hari} ${a.bulan} – ${b.hari} ${b.bulan}`;
  }
  const satu = pecah((masuk ?? keluar) as string);
  return masuk ? `From ${satu.hari} ${satu.bulan}` : `Until ${satu.hari} ${satu.bulan}`;
}
