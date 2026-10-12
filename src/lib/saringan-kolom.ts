import type { RegistrationField, RegistrationFieldType } from "./domain";

/**
 * Saringan per kolom ("+ Filter") untuk daftar peserta admin dan layar klien.
 * Murni, tanpa database: route, unduhan, dan layar memakai aturan yang sama,
 * dan bisa diuji sendiri (saringan-kolom.check.ts).
 *
 * ---- Kenapa daftar kolomnya disusun di server juga ------------------------
 *
 * Kunci saringan datang dari URL, jadi ia masukan pengguna. Server menerima
 * hanya kunci yang ada di daftar kolom permukaan itu, dengan jenis yang
 * ditentukan server, bukan oleh peminta. Di layar klien ini penting: saringan
 * pada jawaban yang tidak dibagikan adalah cara menebak isinya satu per satu
 * ("berapa yang cocok bila nilainya X?"), walau kolomnya sendiri tidak pernah
 * dikirim.
 */

/** pilihan: centang nilai yang ada; teks: memuat; tanggal: rentang hari. */
export type JenisSaringan = "pilihan" | "teks" | "tanggal";

export type KolomSaringan = { key: string; label: string; jenis: JenisSaringan; grup: "kolom" | "jawaban" };

export type Saringan =
  | { k: string; in: string[] }
  | { k: string; has: string }
  | { k: string; from?: string; to?: string };

export const BATAS_SARINGAN = 10;
const BATAS_NILAI = 100;
const BATAS_TEKS = 200;
const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/** Jenis saringan untuk pertanyaan form, menurut jenis jawabannya. */
export function jenisPertanyaan(type: RegistrationFieldType): JenisSaringan {
  if (type === "date") return "tanggal";
  if (type === "select" || type === "radio" || type === "checkbox" || type === "number" || type === "file") return "pilihan";
  return "teks";
}

/**
 * Kolom daftar peserta admin yang bisa disaring lewat "+ Filter".
 *
 * Organisation, Source, Check-in, dan RSVP tidak ada di sini: keempatnya sudah
 * punya chip sendiri di baris saringan. Room, Bus, Seat, dan Lucky draw belum:
 * isinya dari tabel lain yang tidak ikut terbaca bersama daftar.
 */
export function kolomSaringanAdmin(fields: RegistrationField[]): KolomSaringan[] {
  return [
    { key: "title", label: "Job title", jenis: "teks", grup: "kolom" },
    { key: "registered_at", label: "Registered", jenis: "tanggal", grup: "kolom" },
    { key: "participant_type", label: "Type", jenis: "pilihan", grup: "kolom" },
    { key: "email", label: "Email", jenis: "teks", grup: "kolom" },
    { key: "phone", label: "Phone", jenis: "teks", grup: "kolom" },
    { key: "qr_code", label: "QR code", jenis: "teks", grup: "kolom" },
    ...fields.map<KolomSaringan>((field) => ({ key: `field:${field.key}`, label: field.label, jenis: jenisPertanyaan(field.type), grup: "jawaban" })),
  ];
}

/**
 * Kolom layar klien yang bisa disaring: kolom yang memang tampil di sana
 * (KOLOM_KLIEN, tanpa Name yang sudah dicari lewat kotak cari) dan jawaban yang
 * dibagikan admin. Tidak ada QR code, tidak ada jawaban yang tidak disetujui.
 */
export function kolomSaringanKlien(jawaban: Array<{ key: string; label: string; type: RegistrationFieldType }>): KolomSaringan[] {
  return [
    { key: "company", label: "Organisation", jenis: "pilihan", grup: "kolom" },
    { key: "title", label: "Job title", jenis: "teks", grup: "kolom" },
    { key: "email", label: "Email", jenis: "teks", grup: "kolom" },
    { key: "phone", label: "Phone", jenis: "teks", grup: "kolom" },
    { key: "participant_type", label: "Type", jenis: "pilihan", grup: "kolom" },
    { key: "registered_at", label: "Registered", jenis: "tanggal", grup: "kolom" },
    { key: "checked_in", label: "Checked in", jenis: "pilihan", grup: "kolom" },
    ...jawaban.map<KolomSaringan>((item) => ({ key: `answer:${item.key}`, label: item.label, jenis: jenisPertanyaan(item.type), grup: "jawaban" })),
  ];
}

const teksPendek = (nilai: unknown, batas = BATAS_TEKS) => (typeof nilai === "string" ? nilai.trim().slice(0, batas) : null);

/**
 * Baca saringan dari `?f=` (JSON). Kunci yang tidak ada di daftar kolom
 * permukaan ini, bentuk yang tidak cocok dengan jenis kolomnya, dan saringan
 * kosong dibuang: tautan lama ke pertanyaan yang sudah dihapus tetap membuka
 * daftarnya, dan layar tidak menampilkan chip untuk kunci yang dibuang, jadi
 * yang terlihat selalu sama dengan yang dipakai. `null` hanya bila bentuknya
 * rusak sama sekali (bukan JSON, bukan larik, terlalu banyak).
 */
export function bacaSaringan(mentah: string | null | undefined, kolom: KolomSaringan[]): Saringan[] | null {
  if (!mentah) return [];
  let data: unknown;
  try { data = JSON.parse(mentah); } catch { return null; }
  if (!Array.isArray(data) || data.length > BATAS_SARINGAN) return null;
  const perKunci = new Map(kolom.map((item) => [item.key, item]));
  const hasil: Saringan[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const { k } = item as { k?: unknown };
    const info = typeof k === "string" ? perKunci.get(k) : undefined;
    if (!info || hasil.some((s) => s.k === info.key)) continue;
    if (info.jenis === "pilihan") {
      const daftar = (item as { in?: unknown }).in;
      if (!Array.isArray(daftar)) continue;
      const nilai = [...new Set(daftar.slice(0, BATAS_NILAI).map((v) => teksPendek(v)).filter((v): v is string => v !== null))];
      if (nilai.length) hasil.push({ k: info.key, in: nilai });
    } else if (info.jenis === "teks") {
      const has = teksPendek((item as { has?: unknown }).has, 100);
      if (has) hasil.push({ k: info.key, has });
    } else {
      const { from, to } = item as { from?: unknown; to?: unknown };
      const dari = typeof from === "string" && TANGGAL.test(from) ? from : undefined;
      const sampai = typeof to === "string" && TANGGAL.test(to) ? to : undefined;
      if (dari || sampai) hasil.push({ k: info.key, ...(dari ? { from: dari } : {}), ...(sampai ? { to: sampai } : {}) });
    }
  }
  return hasil;
}

/** Apakah satu nilai sel (teks yang tampil, "" = kosong) lolos satu saringan. */
export function cocokSatu(nilai: string, saringan: Saringan): boolean {
  const bersih = nilai.trim();
  if ("in" in saringan) return saringan.in.includes(bersih);
  if ("has" in saringan) return bersih.toLocaleLowerCase("en").includes(saringan.has.toLocaleLowerCase("en"));
  const hari = bersih.slice(0, 10);
  if (!TANGGAL.test(hari)) return false;
  return (!saringan.from || hari >= saringan.from) && (!saringan.to || hari <= saringan.to);
}

/** Semua saringan berlaku bersamaan (DAN), seperti chip lain di baris yang sama. */
export function cocokSemua<T>(baris: T, saringan: Saringan[], nilai: (baris: T, kunci: string) => string): boolean {
  return saringan.every((s) => cocokSatu(nilai(baris, s.k), s));
}

/** Nilai yang ada di satu kolom beserta jumlahnya, untuk daftar centang. "" = kosong, selalu terakhir. */
export function hitungNilai<T>(daftar: T[], kunci: string, nilai: (baris: T, kunci: string) => string): Array<{ value: string; count: number }> {
  const hitung = new Map<string, number>();
  for (const baris of daftar) {
    const v = nilai(baris, kunci).trim();
    hitung.set(v, (hitung.get(v) ?? 0) + 1);
  }
  return [...hitung.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => (a.value === "" ? 1 : b.value === "" ? -1 : a.value.localeCompare(b.value, "en", { numeric: true })));
}

/** Tanggal kalender di zona acara, "YYYY-MM-DD", untuk saringan rentang "Registered". */
export function hariDiZona(iso: string, zona: string): string {
  const waktu = Date.parse(iso);
  if (Number.isNaN(waktu)) return "";
  return new Date(waktu).toLocaleDateString("en-CA", { timeZone: zona });
}

/**
 * Bentuk saringan dari `?f=` sebelum daftar kolom acara diketahui (di peramban,
 * saat halaman dibuka). Hanya memeriksa bentuk; kuncinya diperiksa server.
 */
export function bacaSaringanMentah(mentah: string | null): Saringan[] {
  if (!mentah) return [];
  try {
    const data: unknown = JSON.parse(mentah);
    if (!Array.isArray(data)) return [];
    return data.slice(0, BATAS_SARINGAN).filter((item): item is Saringan => Boolean(item) && typeof item === "object" && typeof (item as Saringan).k === "string");
  } catch {
    return [];
  }
}
