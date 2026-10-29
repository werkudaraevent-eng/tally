import type { LandingLang } from "@/lib/landing-i18n";
import type { EventLandingConfig, LandingMemberConfig, RegistrationField, RegistrationFormConfig } from "@/lib/domain";

/**
 * "Dua kolom data peserta" (Participant area > How participants sign in >
 * Participant fields): peserta masuk dengan dua isian dari datanya sendiri,
 * mis. email + nomor HP, atau nomor HP + NIK.
 *
 * Modul murni (tanpa server), dipakai layar admin, dialog masuk, dan
 * pencocokan di server, supaya label dan cara menyamakan isian tidak pernah
 * berbeda di ketiganya.
 *
 * Kolom yang boleh dipilih: email, telepon, nama, dan pertanyaan tambahan form
 * berisian bebas (Text, Email, Phone, Number). Pertanyaan pilihan (dropdown,
 * radio, centang) dan tanggal tidak bisa: jawabannya sedikit kemungkinan,
 * mis. Gender, sehingga "dua kolom" praktis jadi satu. Sengaja juga TIDAK
 * bisa: perusahaan, jabatan, tipe peserta,
 * status RSVP (dipakai banyak orang sekaligus, jadi bukan pengenal), dan kode
 * QR/kode peserta (tercetak di tiket dan badge, dan kode itu sendiri sudah
 * membuka check-in atas nama orang itu).
 */

export type KolomMasukDasar = "email" | "phone" | "name";
/** "email" | "phone" | "name" | "x:<kunci pertanyaan tambahan>". */
export type KolomMasukId = string;

/** Pola id kolom, juga untuk validasi setelan (landing-body-schema). */
export const KOLOM_MASUK_POLA = /^(email|phone|name|x:[A-Za-z0-9_]{1,60})$/;

export type JenisIsian = "email" | "tel" | "text";

/** `contoh` / `contoh_en`: contoh isian bawaan kolom ini di halaman Indonesia / English (tampil samar di layar admin). */
export type PilihanKolomMasuk = { id: KolomMasukId; label: string; jenis: JenisIsian; contoh?: string; contoh_en?: string };

const DASAR: Record<KolomMasukDasar, { admin: string; id: string; en: string; jenis: JenisIsian }> = {
  email: { admin: "Email", id: "Email", en: "Email", jenis: "email" },
  phone: { admin: "Phone", id: "Nomor HP", en: "Phone number", jenis: "tel" },
  name: { admin: "Full name", id: "Nama lengkap", en: "Full name", jenis: "text" },
};

/** Jenis pertanyaan yang jawabannya bebas diketik, jadi bisa jadi pengenal. */
const JENIS_BOLEH = new Set<RegistrationField["type"]>(["text", "email", "tel", "number"]);

function bolehDipilih(field: RegistrationField) {
  return JENIS_BOLEH.has(field.type) && KOLOM_MASUK_POLA.test(`x:${field.key}`);
}

function pertanyaan(fields: RegistrationField[], id: KolomMasukId) {
  return id.startsWith("x:") ? fields.find((field) => field.key === id.slice(2) && bolehDipilih(field)) ?? null : null;
}

function jenisPertanyaan(field: RegistrationField): JenisIsian {
  return field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text";
}

function bawaan(id: KolomMasukId, fields: RegistrationField[]) {
  const contoh = contohKolomMasuk(id, fields, "id", null);
  const contohEn = contohKolomMasuk(id, fields, "en", null);
  return { ...(contoh ? { contoh } : {}), ...(contohEn ? { contoh_en: contohEn } : {}) };
}

/** Pilihan kolom di layar admin, dalam urutan: bawaan, lalu pertanyaan form. */
export function pilihanKolomMasuk(fields: RegistrationField[]): PilihanKolomMasuk[] {
  return [
    ...(Object.keys(DASAR) as KolomMasukDasar[]).map((id) => ({ id, label: DASAR[id].admin, jenis: DASAR[id].jenis, ...bawaan(id, fields) })),
    ...fields
      .filter(bolehDipilih)
      .map((field) => {
        const id = `x:${field.key}`;
        return { id, label: field.label.trim() || field.key, jenis: jenisPertanyaan(field), ...bawaan(id, fields) };
      }),
  ];
}

/** Label dan jenis isian kolom ini di dialog masuk; null = kolomnya sudah tidak ada (pertanyaan dihapus). */
export function kolomMasukPublik(id: KolomMasukId, fields: RegistrationField[], lang: LandingLang): { label: string; jenis: JenisIsian } | null {
  if (id in DASAR) {
    const dasar = DASAR[id as KolomMasukDasar];
    return { label: dasar[lang], jenis: dasar.jenis };
  }
  const field = pertanyaan(fields, id);
  return field ? { label: field.label.trim() || field.key, jenis: jenisPertanyaan(field) } : null;
}

/**
 * Isian -> bentuk pembanding, untuk kunci batas salah isi dan untuk menolak
 * isian kosong. Pencocokan dengan data peserta memakai aturan yang sama di
 * basis data (peserta_samakan_isian, migrasi 202610160003). Kosong = tidak
 * bisa dipakai masuk.
 *
 *   email   huruf kecil, tanpa spasi tepi
 *   telepon hanya angka; 62.. dan 8.. disamakan dengan 0.. (0812 = +62 812 =
 *           812). Kolom phone dan pertanyaan berjenis Phone.
 *   lainnya huruf kecil, tanpa spasi, titik, garis, dan tanda baca lain, jadi
 *           "3404.0123 4567-0001" sama dengan "3404012345670001"
 *
 * `jenis` dari kolomMasukPublik/pilihanKolomMasuk; sisi peserta dan sisi data
 * selalu disamakan dengan aturan yang sama.
 */
export function samakanIsian(id: KolomMasukId, jenis: JenisIsian, nilai: unknown): string {
  if (typeof nilai !== "string" && typeof nilai !== "number") return "";
  const teks = String(nilai).trim();
  if (!teks) return "";
  if (id === "email" || jenis === "email") return teks.toLowerCase();
  if (jenis === "tel") return telepon(teks);
  return teks.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}@]/gu, "");
}

function telepon(teks: string) {
  const angka = teks.replace(/\D/g, "");
  if (angka.startsWith("62")) return `0${angka.slice(2)}`;
  if (angka.startsWith("8")) return `0${angka}`;
  return angka;
}

/** Contoh isian kolom email, juga di cara Email and password (masuk-i18n). */
export const CONTOH_EMAIL: Record<LandingLang, string> = { id: "nama@perusahaan.com", en: "name@company.com" };

/** Panjang maksimal contoh isian (Example) satu kolom, per bahasa. */
export const CONTOH_KOLOM_MAX = 60;

/**
 * Contoh isian (placeholder) satu kolom di dialog masuk. Urutannya: Example
 * yang ditulis panitia di Participant area (English dulu di halaman English,
 * lalu yang Indonesia), lalu bawaan: Email memakai contoh cara Email and
 * password, pertanyaan form memakai placeholder-nya di Registration form.
 * null = kotak tanpa contoh.
 */
export function contohKolomMasuk(
  id: KolomMasukId,
  fields: RegistrationField[],
  lang: LandingLang,
  contoh: LandingMemberConfig["sign_in_examples"],
): string | null {
  const tulisan = contoh?.[id];
  const pilih = (lang === "en" ? tulisan?.en?.trim() : "") || tulisan?.text?.trim();
  if (pilih) return pilih;
  if (id === "email") return CONTOH_EMAIL[lang];
  return pertanyaan(fields, id)?.placeholder?.trim() || null;
}

export type KolomMasukTampil = { label: string; jenis: JenisIsian; contoh: string | null };

/** Cara masuk acara untuk dialog dan halaman masuk: tanpa data peserta apa pun. */
export type CaraMasukPublik =
  | { jenis: "password" }
  | { jenis: "email_code" }
  | { jenis: "fields"; kolom: [KolomMasukTampil, KolomMasukTampil] };

/**
 * Dari setelan acara. Dua kolom yang tidak lengkap lagi (pertanyaannya
 * dihapus dari form) tampil sebagai email + kata sandi: lebih baik formulir
 * yang bisa dipakai peserta berakun daripada dua kolom yang tidak akan cocok.
 */
export function caraMasukPublik(
  event: { landing_config: unknown; registration_form_config: unknown },
  lang: LandingLang,
): CaraMasukPublik {
  const member = ((event.landing_config ?? {}) as EventLandingConfig).member;
  if (member?.sign_in === "email_code") return { jenis: "email_code" };
  if (member?.sign_in !== "fields" || !member.sign_in_fields) return { jenis: "password" };
  const fields = ((event.registration_form_config as RegistrationFormConfig | null)?.fields ?? []) as RegistrationField[];
  const [a, b] = member.sign_in_fields.map((id) => {
    const kolom = kolomMasukPublik(id, fields, lang);
    return kolom ? { ...kolom, contoh: contohKolomMasuk(id, fields, lang, member.sign_in_examples) } : null;
  });
  return a && b && member.sign_in_fields[0] !== member.sign_in_fields[1] ? { jenis: "fields", kolom: [a, b] } : { jenis: "password" };
}
