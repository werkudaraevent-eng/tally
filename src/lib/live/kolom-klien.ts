import type { ClientFieldApproval, RegistrationField, RegistrationFieldType } from "../domain";

/**
 * Jawaban form mana yang boleh dilihat klien (akun Viewer). Murni, tanpa
 * database, supaya aturan yang sama dipakai route data, unduhan, layar admin,
 * dan penyunting form, dan bisa diuji sendiri (kolom-klien.check.ts).
 *
 * ---- Kenapa yang disimpan bukan hanya kunci --------------------------------
 *
 * Admin menyetujui SATU pertanyaan: kunci, judul, dan jenis yang ia lihat saat
 * menyalakan sakelarnya. Kunci saja tidak cukup (QA PR #102, H1): pertanyaan
 * yang dihapus meninggalkan kuncinya, pertanyaan baru bisa mendapat kunci yang
 * sama, dan judul atau jenisnya bisa diganti kapan saja. Dengan kunci saja,
 * "Session choice" yang disetujui bisa berubah diam-diam menjadi "Passport
 * number" di layar klien. Jadi jawaban hanya dibagikan selama pertanyaan di
 * form masih SAMA PERSIS dengan yang disetujui; selain itu ia tertutup dan
 * admin melihatnya sebagai "perlu disetujui ulang".
 */
export type KolomJawaban = { key: string; label: string; type: RegistrationFieldType };

type FormKlien = { fields?: RegistrationField[]; client_fields?: unknown };

/** Unggahan berkas tidak pernah dibagikan: berkasnya pribadi dan tautannya tidak berguna bagi klien. */
const bolehDibagikan = (type: RegistrationFieldType) => type !== "file";

/** Persetujuan yang tersimpan; bentuk lain (mis. kunci polos) diabaikan = tidak dibagikan. */
export function persetujuanKlien(config: unknown): ClientFieldApproval[] {
  const daftar = ((config ?? {}) as FormKlien).client_fields;
  if (!Array.isArray(daftar)) return [];
  return daftar.filter((item): item is ClientFieldApproval =>
    Boolean(item) && typeof item === "object" &&
    typeof (item as ClientFieldApproval).key === "string" &&
    typeof (item as ClientFieldApproval).label === "string" &&
    typeof (item as ClientFieldApproval).type === "string");
}

/** Pertanyaan form yang bisa dipilih untuk klien: semua kecuali unggahan berkas. */
export function pertanyaanUntukKlien(config: unknown): RegistrationField[] {
  return (((config ?? {}) as FormKlien).fields ?? []).filter((field) => bolehDibagikan(field.type));
}

export type StatusPertanyaan = {
  key: string;
  label: string;
  type: RegistrationFieldType;
  /** shared: dibagikan; changed: pernah disetujui, tetapi judul/jenisnya berubah sejak itu; off: tidak. */
  status: "shared" | "changed" | "off";
  /** Judul saat disetujui, untuk status "changed". */
  approvedLabel?: string;
};

export function statusPertanyaanKlien(config: unknown): StatusPertanyaan[] {
  const setuju = new Map(persetujuanKlien(config).map((item) => [item.key, item]));
  return pertanyaanUntukKlien(config).map((field) => {
    const item = setuju.get(field.key);
    const status = !item ? "off" : item.label === field.label && item.type === field.type ? "shared" : "changed";
    return { key: field.key, label: field.label, type: field.type, status, ...(status === "changed" ? { approvedLabel: item!.label } : {}) };
  });
}

/** Kolom jawaban yang dilihat klien, dalam urutan form. */
export function kolomJawabanKlien(config: unknown): KolomJawaban[] {
  return statusPertanyaanKlien(config)
    .filter((item) => item.status === "shared")
    .map(({ key, label, type }) => ({ key, label, type }));
}

/** Persetujuan baru dari kunci yang dipilih admin: judul dan jenis SAAT INI, urutan form, tanpa duplikat. */
export function setujuiKunci(config: unknown, keys: string[]): { approvals: ClientFieldApproval[]; unknown: string[] } {
  const pilihan = new Set(keys);
  const pertanyaan = pertanyaanUntukKlien(config);
  const ada = new Set(pertanyaan.map((field) => field.key));
  return {
    approvals: pertanyaan.filter((field) => pilihan.has(field.key)).map(({ key, label, type }) => ({ key, label, type })),
    unknown: [...pilihan].filter((key) => !ada.has(key)),
  };
}

/**
 * Untuk penyunting form: buang persetujuan milik pertanyaan yang sudah tidak ada.
 * Persetujuan pertanyaan yang diubah DIBIARKAN: ia sudah tertutup lewat
 * pencocokan judul/jenis, dan admin perlu melihatnya sebagai "perlu disetujui
 * ulang" alih-alih hilang tanpa jejak.
 */
export function rapikanPersetujuan(approvals: unknown, fields: RegistrationField[]): ClientFieldApproval[] | undefined {
  const daftar = persetujuanKlien({ client_fields: approvals });
  if (daftar.length === 0) return undefined;
  const ada = new Set(fields.map((field) => field.key));
  const sisa = daftar.filter((item) => ada.has(item.key));
  return sisa.length > 0 ? sisa : undefined;
}

/**
 * Untuk acara hasil duplikasi: persetujuan klien TIDAK ikut disalin. Viewer
 * acara baru bisa klien lain, dan tidak ada yang menyetujui jawaban apa pun
 * untuk acara itu (QA #102, M-R2-1). Mengembalikan null bila tidak ada yang dibuang.
 */
export function tanpaPersetujuanKlien<T extends object>(config: T | null | undefined): Omit<T, "client_fields"> | null {
  if (!config || !("client_fields" in config)) return null;
  const { client_fields: _dibuang, ...sisa } = config as T & { client_fields?: unknown };
  void _dibuang;
  return sisa;
}

/** Jawaban sebagai teks untuk tabel dan berkas; kotak centang jadi "Yes" atau "No". */
export function teksJawaban(kolom: KolomJawaban, nilai: unknown) {
  if (kolom.type === "checkbox") return nilai === "true" || nilai === true ? "Yes" : "No";
  if (nilai === null || nilai === undefined || nilai === "") return "";
  return String(nilai);
}
