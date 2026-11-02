import type { RegistrationField, RegistrationFormConfig } from "../domain.ts";

/**
 * Nomor bagasi peserta (Check-in > sesi > Luggage > Luggage number).
 *
 * Bukan kolom baru: panitia menunjuk SATU pertanyaan yang sudah ada sebagai
 * nomor bagasi (`registration_form_config.luggage_number_field`). Nomornya
 * tetap jawaban pertanyaan itu, jadi diisi, diimpor, diekspor dan dicari di
 * Participant list seperti pertanyaan lain, dan tidak pernah ada dua salinan
 * yang bisa berbeda di meja ambil. Yang membaca nomor ini: lembar pemindai
 * di meja bagasi, kartu Bagasi di portal, kolom dan detail Luggage di admin,
 * dan pencarian di meja ambil.
 *
 * Polanya seperti nomor tag bagasi maskapai dan tiket titip koper hotel: satu
 * nomor yang dipegang tamu dan petugas.
 *
 * Murni, tanpa server, supaya diuji langsung (nomor.check.ts).
 */

/** Jenis pertanyaan yang bisa menjadi nomor bagasi: satu nilai pendek yang diketik atau dipilih. */
export const JENIS_NOMOR_BAGASI = ["text", "number", "select", "radio"] as const;

export function bolehJadiNomorBagasi(field: Pick<RegistrationField, "type">): boolean {
  return (JENIS_NOMOR_BAGASI as readonly string[]).includes(field.type);
}

/** Pertanyaan nomor bagasi acara ini, atau null bila tidak diatur atau pertanyaannya sudah dihapus. */
export function pertanyaanNomorBagasi(config: RegistrationFormConfig | null | undefined): RegistrationField | null {
  const kunci = config?.luggage_number_field;
  if (!kunci) return null;
  const field = (config?.fields ?? []).find((isi) => isi.key === kunci);
  return field && bolehJadiNomorBagasi(field) ? field : null;
}

/** Kunci pertanyaan nomor bagasi yang masih berlaku, atau null. */
export function kunciNomorBagasi(config: RegistrationFormConfig | null | undefined): string | null {
  return pertanyaanNomorBagasi(config)?.key ?? null;
}

/** Nomor bagasi satu peserta dari jawabannya, dirapikan; null = belum diisi. */
export function nomorBagasi(kunci: string | null, extra: unknown): string | null {
  if (!kunci || !extra || typeof extra !== "object" || Array.isArray(extra)) return null;
  const nilai = (extra as Record<string, unknown>)[kunci];
  if (typeof nilai === "number" && Number.isFinite(nilai)) return String(nilai);
  if (typeof nilai !== "string") return null;
  const rapi = nilai.trim().replace(/\s+/g, " ");
  return rapi ? rapi.slice(0, 40) : null;
}

/**
 * Setelan yang dibawa ke susunan form baru saat Save form di Registration:
 * dipertahankan selama pertanyaannya masih ada dan jenisnya masih cocok,
 * dibuang bila pertanyaannya dihapus atau diganti jenis.
 */
export function pertahankanNomorBagasi(tersimpan: RegistrationFormConfig | null | undefined, fieldsBaru: readonly RegistrationField[]): string | undefined {
  const kunci = tersimpan?.luggage_number_field;
  if (!kunci) return undefined;
  const field = fieldsBaru.find((isi) => isi.key === kunci);
  return field && bolehJadiNomorBagasi(field) ? kunci : undefined;
}

/** Kunci untuk pertanyaan "Luggage number" baru yang belum dipakai pertanyaan lain atau kunci pensiun. */
export function kunciBaruNomorBagasi(config: RegistrationFormConfig | null | undefined): string {
  const terpakai = new Set([...(config?.fields ?? []).map((isi) => isi.key), ...(config?.retired_keys ?? [])]);
  if (!terpakai.has("luggage_number")) return "luggage_number";
  for (let i = 2; ; i++) if (!terpakai.has(`luggage_number_${i}`)) return `luggage_number_${i}`;
}

/** Yang dibaca layar Check-in admin: pertanyaan terpilih dan pertanyaan yang boleh dipilih. */
export type SetelanNomorBagasi = {
  field: string | null;
  pilihan: Array<{ key: string; label: string; staff_only: boolean }>;
};

export function setelanNomorBagasi(config: RegistrationFormConfig | null | undefined): SetelanNomorBagasi {
  return {
    field: kunciNomorBagasi(config),
    pilihan: (config?.fields ?? [])
      .filter(bolehJadiNomorBagasi)
      .map((field) => ({ key: field.key, label: field.label.trim() || field.key, staff_only: field.on_form === false })),
  };
}
