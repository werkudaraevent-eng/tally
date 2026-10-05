import type { EventLandingConfig } from "@/lib/domain";
import { landingDefaultLang, landingEnAvailable } from "@/lib/landing-i18n";
import { BAHASA_KIRIM, DEFAULT_PEMBUKA, SALINAN_DITOLAK, type Block, type Templat } from "./templat";

/**
 * Bahasa email Konfirmasi pendaftaran.
 *
 * Murni (tanpa impor server): editor, pratinjau, dan pengirim memakai aturan
 * yang sama.
 *
 * Aturan yang dijaga di sini:
 *   * Bahasa tersimpan pendaftar NULL = Indonesia, SELALU. Pendaftar lama tidak
 *     boleh tiba-tiba menerima kirim ulang dalam bahasa lain hanya karena bahasa
 *     utama acara diganti.
 *   * Versi Indonesia dari untukBahasa() adalah templat apa adanya, jadi email
 *     Indonesia byte demi byte sama dengan sebelum fitur ini.
 *   * Teks panitia yang belum diterjemahkan TIDAK disembunyikan di versi
 *     English: yang tampil teks Indonesianya. Info parkir dalam bahasa lain
 *     masih lebih baik daripada info parkir yang hilang.
 */

export type EmailLang = "id" | "en";
export const EMAIL_LANGS = ["id", "en"] as const;

/** Aturan kirim di Email otomatis (skemanya di templat.ts). */
export { BAHASA_KIRIM };
export type BahasaKirim = (typeof BAHASA_KIRIM)[number];

/**
 * Bahasa utama acara: bahasa formulir tanpa akhiran. Forum mengambilnya dari
 * forum.language (halaman Forum satu bahasa), tata letak lain dari pilihan
 * bahasa utama Halaman acara.
 */
export function bahasaUtamaAcara(landing: EventLandingConfig | null | undefined): EmailLang {
  if (landing?.layout === "forum") return landing.forum?.language === "en" ? "en" : "id";
  return landingDefaultLang(landing);
}

/**
 * Bahasa yang DISIMPAN untuk pendaftaran baru. "en" dari peramban hanya
 * diterima bila halaman English acara memang menyala saat formulir dikirim;
 * selain itu bahasa utama acara.
 */
export function bahasaPendaftaranBaru(landing: EventLandingConfig | null | undefined, diminta: unknown): EmailLang {
  const utama = bahasaUtamaAcara(landing);
  if (diminta === utama) return utama;
  if ((diminta === "en" || diminta === "id") && landingEnAvailable(landing)) return diminta;
  return utama;
}

/** Bahasa satu email: aturan kirim acara, lalu bahasa tersimpan pendaftar (NULL = Indonesia). */
export function bahasaEmail(aturan: BahasaKirim, tersimpan: string | null | undefined): EmailLang {
  if (aturan === "id" || aturan === "en") return aturan;
  return tersimpan === "en" ? "en" : "id";
}

/** Teks bawaan English untuk kolom yang bisa diisi panitia. */
export const BAWAAN_EN = {
  subjek: "Your ticket: {acara}",
  subjek_menunggu: "Registration received: {acara}",
  subjek_ditolak: "Your registration for {acara}",
  judul: "See you at {acara}",
  isi: "Hello {nama}, your registration is confirmed. Keep this email; **the QR code below is your entry ticket**.",
  judul_menunggu: "Thank you for registering",
  isi_menunggu: "Hello {nama}, we've received your registration for {acara}. We'll email you here as soon as the organisers approve it.",
  judul_ditolak: "Thank you for your interest",
  isi_ditolak: "Hello {nama}, thank you for registering for {acara}. Unfortunately, the organisers can't approve your registration this time.",
  tombol_dashboard: "Open my dashboard",
  tombol_halaman: "View event page",
  info_judul: "Important information",
  mitra_judul: "Supported by",
} as const;

/** Teks bawaan Indonesia yang punya padanan English (lihat newBlock/defaultTemplat). */
const BAWAAN_ID = {
  subjek: "Tiket Anda: {acara}",
  subjek_menunggu: "Pendaftaran diterima: {acara}",
  subjek_ditolak: SALINAN_DITOLAK.subjek,
  tombol_dashboard: "Buka Dashboard saya",
  tombol_halaman: "Buka halaman acara",
  info_judul: "Info penting",
  mitra_judul: "Didukung oleh",
} as const;

/** Label tetap di dalam email (bukan teks panitia). */
export type TeksTetap = {
  htmlLang: string;
  eyebrow: { approved: string; pending: string; rejected: string };
  menungguJudul: string;
  menungguIsi: string;
  kodePeserta: string;
  qrAlt: (kode: string) => string;
  tunjukkan: string;
  bukaKode: string;
  akunJudul: string;
  akunIsi: string;
  akunTombol: string;
  tanggal: string;
  waktu: string;
  tempat: string;
  kalender: string;
  peta: string;
  logoMitra: string;
  kaki: (acara: string, bisaDibalas: boolean) => string;
  teks: {
    menunggu: string;
    kode: (kode: string) => string;
    kodeQr: (url: string) => string;
    akun: (url: string) => string;
    peta: string;
  };
};

export const TEKS_TETAP: Record<EmailLang, TeksTetap> = {
  id: {
    htmlLang: "id",
    eyebrow: { approved: "Pendaftaran berhasil", pending: "Pendaftaran diterima", rejected: "Kabar pendaftaran" },
    menungguJudul: "Menunggu persetujuan",
    menungguIsi: "Panitia sedang meninjau pendaftaran Anda. QR masuk dikirim ke email ini setelah disetujui.",
    kodePeserta: "Kode peserta",
    qrAlt: (kode) => `QR kode peserta ${kode}`,
    tunjukkan: "Tunjukkan QR ini di meja registrasi. Kode ini khusus untuk Anda.",
    bukaKode: "Buka kode &amp; QR",
    akunJudul: "Akun Area peserta",
    akunIsi: "Konfirmasi email Anda untuk mengaktifkan akun. Tautan berlaku 14 hari.",
    akunTombol: "Konfirmasi email",
    tanggal: "Tanggal",
    waktu: "Waktu",
    tempat: "Tempat",
    kalender: "Tambah ke kalender",
    peta: "Lihat peta",
    logoMitra: "Logo mitra",
    kaki: (acara, bisaDibalas) =>
      `Anda menerima email ini karena mendaftar di ${acara}. ${bisaDibalas ? "Ada pertanyaan? Balas email ini untuk menghubungi panitia." : "Ada pertanyaan? Hubungi panitia acara."}`,
    teks: {
      menunggu: "MENUNGGU PERSETUJUAN\nPanitia sedang meninjau pendaftaran Anda. QR masuk dikirim ke email ini setelah disetujui.",
      kode: (kode) => `KODE PESERTA: ${kode}`,
      kodeQr: (url) => `Kode dan QR: ${url}`,
      akun: (url) => `\n\nAKUN AREA PESERTA\nKonfirmasi email Anda untuk mengaktifkan akun (berlaku 14 hari): ${url}`,
      peta: "Peta",
    },
  },
  en: {
    htmlLang: "en",
    eyebrow: { approved: "Registration confirmed", pending: "Registration received", rejected: "About your registration" },
    menungguJudul: "Awaiting approval",
    menungguIsi: "The organisers are reviewing your registration. Your entry QR code will be sent to this email once it's approved.",
    kodePeserta: "Participant code",
    qrAlt: (kode) => `QR code for participant code ${kode}`,
    tunjukkan: "Show this QR code at the check-in desk. This code is unique to you.",
    bukaKode: "View QR code",
    akunJudul: "Your participant account",
    akunIsi: "Confirm your email to activate your account. The link is valid for 14 days.",
    akunTombol: "Confirm email",
    tanggal: "Date",
    waktu: "Time",
    tempat: "Venue",
    kalender: "Add to calendar",
    peta: "View map",
    logoMitra: "Partner logo",
    kaki: (acara, bisaDibalas) =>
      `You received this email because you registered for ${acara}. ${bisaDibalas ? "Questions? Reply to this email to reach the organisers." : "Questions? Contact the organisers."}`,
    teks: {
      menunggu: "AWAITING APPROVAL\nThe organisers are reviewing your registration. Your entry QR code will be sent to this email once it's approved.",
      kode: (kode) => `PARTICIPANT CODE: ${kode}`,
      kodeQr: (url) => `Code and QR code: ${url}`,
      akun: (url) => `\n\nYOUR PARTICIPANT ACCOUNT\nConfirm your email to activate your account (valid for 14 days): ${url}`,
      peta: "Map",
    },
  },
};

/** Kolom templat yang punya versi English. Dipakai editor, penghitung, dan untukBahasa(). */
export type KolomEn =
  | { tempat: "subjek"; kunci: "subjek" | "subjek_menunggu" | "subjek_ditolak" }
  | { tempat: "block"; blockId: string; kunci: string };

const kosong = (nilai: string | undefined | null) => !nilai || !nilai.trim();

/** Nilai English yang dipakai: isian panitia, atau bawaan English, atau (teks bebas) teks Indonesia. */
function pilih(en: string | undefined, idNilai: string, bawaanId: string | null, bawaanEn: string | null): string {
  if (!kosong(en)) return en!;
  if (bawaanEn !== null && (bawaanId === null || idNilai.trim() === bawaanId || kosong(idNilai))) return bawaanEn;
  return idNilai;
}

/**
 * Templat yang siap disusun dalam satu bahasa. Indonesia: templat apa adanya.
 * English: setiap kolom diganti isian English-nya, lalu bawaan English.
 */
export function untukBahasa(templat: Templat, lang: EmailLang): Templat {
  if (lang === "id") return templat;
  const en = templat.en ?? {};
  return {
    ...templat,
    // Subjek dan pembuka selalu punya bawaan English. Pembuka Indonesia yang
    // diubah panitia tetap terhitung "belum diterjemahkan" di editor.
    subjek: pilih(en.subjek, templat.subjek, null, BAWAAN_EN.subjek),
    subjek_menunggu: pilih(en.subjek_menunggu, templat.subjek_menunggu, null, BAWAAN_EN.subjek_menunggu),
    subjek_ditolak: pilih(en.subjek_ditolak, templat.subjek_ditolak, null, BAWAAN_EN.subjek_ditolak),
    blocks: templat.blocks.map((block) => blockEn(block)),
  };
}

function blockEn(block: Block): Block {
  switch (block.type) {
    case "pembuka": {
      const en = block.en ?? {};
      return {
        ...block,
        judul: pilih(en.judul, block.judul, null, BAWAAN_EN.judul),
        isi: pilih(en.isi, block.isi, null, BAWAAN_EN.isi),
        judul_menunggu: pilih(en.judul_menunggu, block.judul_menunggu, null, BAWAAN_EN.judul_menunggu),
        isi_menunggu: pilih(en.isi_menunggu, block.isi_menunggu, null, BAWAAN_EN.isi_menunggu),
        judul_ditolak: pilih(en.judul_ditolak, block.judul_ditolak, null, BAWAAN_EN.judul_ditolak),
        isi_ditolak: pilih(en.isi_ditolak, block.isi_ditolak, null, BAWAAN_EN.isi_ditolak),
      };
    }
    case "teks":
      return { ...block, isi: pilih(block.en?.isi, block.isi, null, null) };
    case "info":
      return {
        ...block,
        judul: pilih(block.en?.judul, block.judul, BAWAAN_ID.info_judul, BAWAAN_EN.info_judul),
        isi: pilih(block.en?.isi, block.isi, null, null),
      };
    case "gambar":
      return { ...block, alt: pilih(block.en?.alt, block.alt, null, null) };
    case "tombol": {
      const [bawaanId, bawaanEn] =
        block.tujuan === "dashboard" ? [BAWAAN_ID.tombol_dashboard, BAWAAN_EN.tombol_dashboard]
        : block.tujuan === "halaman" ? [BAWAAN_ID.tombol_halaman, BAWAAN_EN.tombol_halaman]
        : [null, null];
      return { ...block, label: bawaanId === null ? pilih(block.en?.label, block.label, null, null) : pilih(block.en?.label, block.label, bawaanId, bawaanEn) };
    }
    case "mitra":
      return { ...block, judul: pilih(block.en?.judul, block.judul, BAWAAN_ID.mitra_judul, BAWAAN_EN.mitra_judul) };
    default:
      return block;
  }
}

/** Bawaan Indonesia per kolom; teks Indonesia yang sama dengan bawaan tidak perlu diterjemahkan. */
const BAWAAN_PEMBUKA_ID: Record<string, string> = {
  judul: DEFAULT_PEMBUKA.judul,
  isi: DEFAULT_PEMBUKA.isi,
  judul_menunggu: DEFAULT_PEMBUKA.judul_menunggu,
  isi_menunggu: DEFAULT_PEMBUKA.isi_menunggu,
  judul_ditolak: SALINAN_DITOLAK.judul,
  isi_ditolak: SALINAN_DITOLAK.isi,
};

export type KolomBelum = { label: string; blockId: string | null; kunci: string };

/**
 * Teks Indonesia buatan panitia yang belum punya versi English: yang tidak
 * kosong, tidak sama dengan bawaan, dan kolom English-nya kosong. Hanya
 * bagian yang menyala; email Tidak disetujui hanya bila sakelarnya menyala.
 */
export function belumDiterjemahkan(templat: Templat): KolomBelum[] {
  const out: KolomBelum[] = [];
  const en = templat.en ?? {};
  const cek = (label: string, blockId: string | null, kunci: string, idNilai: string, enNilai: string | undefined, bawaanId: string | null) => {
    if (kosong(idNilai) || !kosong(enNilai)) return;
    if (bawaanId !== null && idNilai.trim() === bawaanId) return;
    out.push({ label, blockId, kunci });
  };
  cek("Subject (Approved)", null, "subjek", templat.subjek, en.subjek, BAWAAN_ID.subjek);
  cek("Subject (Pending)", null, "subjek_menunggu", templat.subjek_menunggu, en.subjek_menunggu, BAWAAN_ID.subjek_menunggu);
  if (templat.kirim_ditolak) cek("Subject (Rejected)", null, "subjek_ditolak", templat.subjek_ditolak, en.subjek_ditolak, BAWAAN_ID.subjek_ditolak);
  for (const block of templat.blocks) {
    if (!block.on) continue;
    switch (block.type) {
      case "pembuka": {
        type KunciPembuka = "judul" | "isi" | "judul_menunggu" | "isi_menunggu" | "judul_ditolak" | "isi_ditolak";
        const kunci: KunciPembuka[] = ["judul", "isi", "judul_menunggu", "isi_menunggu", ...(templat.kirim_ditolak ? (["judul_ditolak", "isi_ditolak"] as const) : [])];
        for (const k of kunci) cek("Opening", block.id, k, block[k], block.en?.[k], BAWAAN_PEMBUKA_ID[k]);
        break;
      }
      case "teks":
        cek("Text", block.id, "isi", block.isi, block.en?.isi, null);
        break;
      case "info":
        cek("Info box", block.id, "judul", block.judul, block.en?.judul, BAWAAN_ID.info_judul);
        cek("Info box", block.id, "isi", block.isi, block.en?.isi, null);
        break;
      case "gambar":
        if (block.url) cek("Image", block.id, "alt", block.alt, block.en?.alt, null);
        break;
      case "tombol":
        cek("Button", block.id, "label", block.label, block.en?.label, block.tujuan === "dashboard" ? BAWAAN_ID.tombol_dashboard : block.tujuan === "halaman" ? BAWAAN_ID.tombol_halaman : null);
        break;
      case "mitra":
        cek("Partner logos", block.id, "judul", block.judul, block.en?.judul, BAWAAN_ID.mitra_judul);
        break;
    }
  }
  return out;
}
