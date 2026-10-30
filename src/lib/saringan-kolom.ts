import type { RegistrationField, RegistrationFieldType } from "./domain";
import { asalJawaban, type AsalJawaban } from "./kolom-staf.ts";

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

/**
 * Kelompok di menu "+ Filter": kolom tabel, jawaban formulir, dan dua kelompok
 * pertanyaan yang tidak ditanyakan di formulir (lib/kolom-staf.ts), dengan judul
 * yang sama dengan panel Edit participant. Dua yang terakhir hanya muncul bila
 * acaranya punya pertanyaan semacam itu.
 */
export type GrupSaringan = "kolom" | "jawaban" | "peserta" | "staf";

export type KolomSaringan = { key: string; label: string; jenis: JenisSaringan; grup: GrupSaringan };

const GRUP_JAWABAN: Record<AsalJawaban, GrupSaringan> = { formulir: "jawaban", peserta: "peserta", staf: "staf" };

export type Saringan =
  | { k: string; in: string[] }
  | { k: string; has: string }
  /** Kolom teks: true = sel kosong, false = sel terisi. */
  | { k: string; kosong: boolean }
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

/** Label RSVP dan asal peserta, sama dengan yang tampil di tabel admin. */
export const LABEL_RSVP: Record<string, string> = { confirmed: "Confirmed", invited: "Awaiting reply", declined: "Declined" };
/** Nilai saringan kolom Portal, sama dengan yang tampil di tabel admin. */
export const LABEL_PORTAL = { masuk: "Signed in", belum: "Not signed in" } as const;
export const LABEL_ASAL: Record<string, string> = { walkin: "Walk-in", registration: "Self-registered", manual: "Manual", scanner: "Scanner API" };

/** Sesi kehadiran yang punya kolom check-in di tabel. */
export type SesiSaringan = { id: number; name: string };

/**
 * Kolom daftar peserta admin yang bisa disaring lewat "+ Filter": semua kolom
 * tabel kecuali Name (sudah dicari lewat kotak cari) dan tiga kolom Scanner API.
 *
 * Check-in per sesi memakai nama sesinya saja, sama dengan judul kolomnya
 * ("Registration: Checked in"). Organisation, Check-in, Source, dan RSVP juga punya chip sendiri di baris
 * saringan; keduanya berlaku bersamaan (DAN), seperti saringan lain. Room dan
 * Bus dibaca dari Logistik, Lucky draw dari daftar pengecualian undian, Portal
 * dari akun area peserta (lib/member/jejak-portal.ts).
 * Luggage (status bagasi) hanya di acara yang punya meja bagasi; server selalu
 * menerimanya, supaya tautan lama tidak ditolak setelah mejanya dimatikan.
 */
export function kolomSaringanAdmin(fields: RegistrationField[], sesi: SesiSaringan[] = [], bagasi = false, portal = false): KolomSaringan[] {
  return [
    { key: "company", label: "Organisation", jenis: "pilihan", grup: "kolom" },
    ...sesi.map<KolomSaringan>((item) => ({ key: `checkin:${item.id}`, label: item.name, jenis: "pilihan", grup: "kolom" })),
    // Hanya di acara yang memakai area peserta.
    ...(portal ? [{ key: "portal", label: "Portal", jenis: "pilihan", grup: "kolom" } satisfies KolomSaringan] : []),
    { key: "rsvp", label: "RSVP", jenis: "pilihan", grup: "kolom" },
    { key: "title", label: "Job title", jenis: "teks", grup: "kolom" },
    { key: "registered_at", label: "Registered", jenis: "tanggal", grup: "kolom" },
    { key: "participant_type", label: "Type", jenis: "pilihan", grup: "kolom" },
    { key: "email", label: "Email", jenis: "teks", grup: "kolom" },
    { key: "phone", label: "Phone", jenis: "teks", grup: "kolom" },
    { key: "qr_code", label: "QR code", jenis: "teks", grup: "kolom" },
    { key: "seat", label: "Seat", jenis: "teks", grup: "kolom" },
    { key: "kamar", label: "Hotel", jenis: "teks", grup: "kolom" },
    { key: "bus", label: "Vehicle", jenis: "pilihan", grup: "kolom" },
    { key: "source", label: "Source", jenis: "pilihan", grup: "kolom" },
    { key: "undian", label: "Lucky draw", jenis: "pilihan", grup: "kolom" },
    ...(bagasi ? [{ key: "bagasi", label: "Luggage", jenis: "pilihan", grup: "kolom" } satisfies KolomSaringan] : []),
    ...fields.map<KolomSaringan>((field) => ({ key: `field:${field.key}`, label: field.label, jenis: jenisPertanyaan(field.type), grup: GRUP_JAWABAN[asalJawaban(field)] })),
  ];
}

/**
 * Kolom yang tidak boleh disaring atau diurutkan akun peran kustom. Saringan
 * teks ("berisi") atas kolom yang tidak terlihat adalah tebakan bertahap: ada
 * atau tidaknya baris membocorkan isinya (QA #341 H1). QR tidak pernah sampai
 * ke peran kustom; Hotel, Vehicle, Lucky draw dan Luggage milik modul yang belum dibuka.
 */
export const KOLOM_TERTUTUP_KUSTOM = new Set(["qr_code", "kamar", "bus", "undian", "bagasi"]);

/** `kolomSaringanAdmin` untuk akun peran kustom. */
export function kolomSaringanKustom(fields: RegistrationField[], sesi: SesiSaringan[] = [], portal = false): KolomSaringan[] {
  return kolomSaringanAdmin(fields, sesi, false, portal).filter((kolom) => !KOLOM_TERTUTUP_KUSTOM.has(kolom.key));
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
      const kosong = (item as { kosong?: unknown }).kosong;
      if (typeof kosong === "boolean") { hasil.push({ k: info.key, kosong }); continue; }
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
  if ("kosong" in saringan) return (bersih === "") === saringan.kosong;
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

/** Baris yang membawa kursinya (participants.seats). */
type BerKursi = { seats?: Array<{ label?: string | null } | null> | null };

/** Label kursi peserta, berurutan seperti di kolom Seat. */
export function labelKursi(baris: BerKursi): string[] {
  return (baris.seats ?? []).map((kursi) => (typeof kursi?.label === "string" ? kursi.label.trim() : "")).filter(Boolean);
}

const PEMBANDING = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/**
 * Urutkan menurut satu nilai teks dengan urutan alami: A2 sebelum A10, VIP1-2
 * sebelum VIP1-10, 9 sebelum 10. Nilai kosong selalu di akhir, ke arah mana
 * pun. Seri tetap urutan masukan (nama, dari RPC).
 */
export function urutMenurut<T>(baris: T[], ambil: (baris: T) => string, dir: "asc" | "desc"): T[] {
  const arah = dir === "desc" ? -1 : 1;
  return baris
    .map((b, i) => ({ b, i, kunci: ambil(b).trim() }))
    .sort((x, y) => {
      if (!x.kunci || !y.kunci) return (x.kunci ? 0 : 1) - (y.kunci ? 0 : 1) || x.i - y.i;
      return arah * PEMBANDING.compare(x.kunci, y.kunci) || x.i - y.i;
    })
    .map((item) => item.b);
}

/**
 * Urutkan menurut kursi. Yang punya beberapa kursi (beberapa sesi) diurutkan
 * menurut kursi pertama, yang juga tampil pertama di kolom.
 */
export function urutKursi<T extends BerKursi>(baris: T[], dir: "asc" | "desc"): T[] {
  return urutMenurut(baris, (b) => labelKursi(b)[0] ?? "", dir);
}

/** Tanggal kalender di zona acara, "YYYY-MM-DD", untuk saringan rentang "Registered". */
export function hariDiZona(iso: string, zona: string): string {
  const waktu = Date.parse(iso);
  if (Number.isNaN(waktu)) return "";
  return new Date(waktu).toLocaleDateString("en-CA", { timeZone: zona });
}

/**
 * Bentuk saringan dari `?f=` sebelum daftar kolom acara diketahui (di peramban,
 * saat halaman dibuka). Hanya memeriksa bentuk, supaya tautan rusak tidak
 * meruntuhkan halaman (QA #130 M3); kuncinya diperiksa `bacaSaringan` dengan
 * daftar kolom, di server dan sebelum chip digambar.
 */
export function bacaSaringanMentah(mentah: string | null): Saringan[] {
  if (!mentah) return [];
  let data: unknown;
  try { data = JSON.parse(mentah); } catch { return []; }
  if (!Array.isArray(data)) return [];
  const hasil: Saringan[] = [];
  for (const item of data.slice(0, BATAS_SARINGAN)) {
    if (!item || typeof item !== "object") continue;
    const { k, in: daftar, has, kosong, from, to } = item as { k?: unknown; in?: unknown; has?: unknown; kosong?: unknown; from?: unknown; to?: unknown };
    if (typeof k !== "string" || hasil.some((s) => s.k === k)) continue;
    if (typeof kosong === "boolean") {
      hasil.push({ k, kosong });
    } else if (Array.isArray(daftar)) {
      const nilai = daftar.filter((v): v is string => typeof v === "string");
      if (nilai.length) hasil.push({ k, in: nilai });
    } else if (typeof has === "string") {
      if (has.trim()) hasil.push({ k, has });
    } else if (typeof from === "string" || typeof to === "string") {
      hasil.push({ k, ...(typeof from === "string" ? { from } : {}), ...(typeof to === "string" ? { to } : {}) });
    }
  }
  return hasil;
}
