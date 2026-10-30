import type { RegistrationField } from "./domain";

/**
 * Kotak cari daftar peserta: mencari di semua kolom teks yang boleh dilihat
 * akun itu, termasuk jawaban form. Daftarnya diturunkan dari pertanyaan acara,
 * jadi pertanyaan baru otomatis ikut dicari tanpa pengaturan apa pun.
 *
 * Tidak ikut: jawaban centang (Yes/No), file, dan tanggal, juga status
 * (check-in, RSVP, Source) dan logistik. Itu lebih tepat lewat "+ Filter".
 * QR hanya untuk admin: bagi peran kustom, ada-tidaknya baris saat mengetik
 * QR sedikit demi sedikit membocorkannya (QA #100 H1, #341 H1).
 */

export type KolomCari = { key: string; label: string };

const JENIS_DICARI = new Set(["text", "email", "tel", "textarea", "select", "radio", "number"]);

export function kolomCari(fields: RegistrationField[], { qr }: { qr: boolean }): KolomCari[] {
  return [
    { key: "name", label: "Name" },
    { key: "company", label: "Organisation" },
    { key: "title", label: "Job title" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "participant_type", label: "Type" },
    ...(qr ? [{ key: "qr_code", label: "QR code" }] : []),
    ...fields.filter((field) => JENIS_DICARI.has(field.type)).map((field) => ({ key: `field:${field.key}`, label: field.label })),
  ];
}

/** Kunci kolom yang berisi nomor telepon: dicocokkan angkanya saja. */
export function kunciTelepon(fields: RegistrationField[]): Set<string> {
  return new Set(["phone", ...fields.filter((field) => field.type === "tel").map((field) => `field:${field.key}`)]);
}

/** Kata kunci, huruf kecil. Beberapa kata = semuanya harus ketemu, boleh di kolom berbeda. */
export function kataCari(q: string): string[] {
  return q.trim().toLocaleLowerCase("id").split(/\s+/).filter(Boolean).slice(0, 8);
}

/**
 * Angka saja, dengan awalan 0 dibaca sebagai 62: "0812-3" dan "+62 8123" sama.
 * Awalan 8 juga: Excel membuang 0 di depan, jadi "81299887766" tersimpan apa adanya.
 */
export function angkaTelepon(teks: string): string {
  const angka = teks.replace(/\D/g, "");
  if (angka.startsWith("0")) return `62${angka.slice(1)}`;
  return angka.startsWith("8") ? `62${angka}` : angka;
}

/** Kata yang tampak seperti potongan nomor telepon. */
const MIRIP_TELEPON = /^\+?[\d().-]+$/;

/**
 * Kolom yang cocok, urut seperti `kolom`, atau null bila ada kata yang tidak
 * ketemu di kolom mana pun. Kata tanpa kata kunci cocok dengan semua baris.
 */
export function cocokCari<T>(
  baris: T,
  kata: string[],
  kolom: KolomCari[],
  nilai: (baris: T, kunci: string) => string,
  telepon: Set<string> = new Set(["phone"]),
): KolomCari[] | null {
  if (!kata.length) return [];
  const isi = kolom.map((k) => nilai(baris, k.key).toLocaleLowerCase("id"));
  const kena = new Set<number>();
  for (const satu of kata) {
    const mentah = satu.replace(/\D/g, "");
    const angka = MIRIP_TELEPON.test(satu) && mentah.length >= 4 ? angkaTelepon(satu) : null;
    // Kata 1-2 huruf hanya cocok di awal kata, dan angka pendek harus utuh:
    // "2" pada "batch 2" tidak boleh ketemu di "+62 812…", "Batch 12", atau "Batch 21".
    const utuh = /^\d+$/.test(satu) ? "(?!\\p{N})" : "";
    const awal = satu.length <= 2 ? new RegExp(`(^|[^\\p{L}\\p{N}])${satu.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${utuh}`, "u") : null;
    let ketemu = false;
    isi.forEach((teks, i) => {
      // Nomor telepon tidak dicari dengan potongan 1-3 huruf: "2" di "batch 2"
      // akan ketemu di hampir semua nomor.
      if (!teks || (satu.length < 4 && telepon.has(kolom[i].key))) return;
      const cocok = (awal ? awal.test(teks) : teks.includes(satu)) || (angka !== null && telepon.has(kolom[i].key) && (angkaTelepon(teks).includes(angka) || angkaTelepon(teks).includes(mentah)));
      if (cocok) {
        ketemu = true;
        kena.add(i);
      }
    });
    if (!ketemu) return null;
  }
  return kolom.filter((_, i) => kena.has(i));
}
