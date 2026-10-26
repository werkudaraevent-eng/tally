import type { RegistrationField, RegistrationFormConfig } from "./domain.ts";
import { persetujuanKlien } from "./live/kolom-klien.ts";

/**
 * Kolom khusus panitia: pertanyaan form yang TIDAK ditanyakan di formulir
 * pendaftaran.
 *
 * Setiap pertanyaan tambahan sudah sekaligus kolom data peserta
 * (participants.extra, kolom Participant list, ekspor, templat impor). Satu
 * sakelar per pertanyaan, "Ask on the registration form" (`on_form`),
 * memisahkan keduanya: kolomnya tetap ada, hanya formulirnya yang tidak
 * menanyakan. Polanya dari Airtable: field milik tabel, dan form view hanya
 * menanyakan field yang dipilih untuk form itu. Tidak ada penyunting kolom
 * kedua: satu setelan di satu tempat (Registration > Edit form).
 *
 * Murni, tanpa server: penyunting form, formulir publik, meja walk-in, panel
 * peserta, dan route memakai aturan yang sama, dan bisa diuji sendiri
 * (kolom-staf.check.ts).
 */

type Penanda = Pick<RegistrationField, "type" | "on_form">;

/**
 * Ditanyakan di formulir publik dan meja walk-in. Kosong berarti ya, supaya
 * acara yang sudah ada berubah 0 px. Unggahan berkas selalu ditanyakan: hanya
 * pendaftar yang bisa mengunggah, panitia tidak punya jalur untuk mengisinya.
 */
export function ditanyakan(field: Penanda): boolean {
  return field.on_form !== false || field.type === "file";
}

/**
 * Wajib diisi. Pertanyaan yang tidak ditanyakan tidak pernah wajib, walau
 * `required` lamanya masih tersimpan: kolom yang tidak ada di layar pendaftar
 * tidak boleh menahan pendaftaran, walk-in, atau Lengkapi data.
 */
export function wajibDiisi(field: Penanda & Pick<RegistrationField, "required">): boolean {
  return field.required === true && ditanyakan(field);
}

/** Pertanyaan formulir publik, pratinjaunya, dan meja walk-in. */
export function pertanyaanFormulir<T extends Penanda>(fields: T[]): T[] {
  return fields.filter(ditanyakan);
}

/**
 * Asal jawaban, untuk meta baris di Edit form dan judul bagian di panel peserta.
 *
 *   formulir  ditanyakan di formulir pendaftaran
 *   peserta   tidak ditanyakan; peserta mengisinya belakangan dari dashboard
 *             atau tautan Update details (participant_update)
 *   staf      tidak ditanyakan dan tidak diisi peserta: hanya panitia yang
 *             melihat dan mengisinya (Participant list, impor)
 *
 * Kolom yang diisi peserta tidak pernah berlabel staf.
 */
export type AsalJawaban = "formulir" | "peserta" | "staf";

export function asalJawaban(field: Penanda & Pick<RegistrationField, "participant_update">): AsalJawaban {
  if (ditanyakan(field)) return "formulir";
  return field.participant_update === true ? "peserta" : "staf";
}

/** Pertanyaan per asal jawabannya, urutannya tetap urutan form. */
export function kelompokJawaban<T extends Penanda & Pick<RegistrationField, "participant_update">>(fields: T[]): Record<AsalJawaban, T[]> {
  const hasil: Record<AsalJawaban, T[]> = { formulir: [], peserta: [], staf: [] };
  for (const field of fields) hasil[asalJawaban(field)].push(field);
  return hasil;
}

/**
 * Bentuk yang disimpan. Ditanyakan: `on_form` dibuang, jadi pertanyaan yang
 * dimatikan lalu dinyalakan lagi tersimpan persis seperti sebelumnya. Tidak
 * ditanyakan: `required` ikut false, supaya pembaca mana pun yang belum
 * mengenal `on_form` tetap tidak mewajibkannya. Penanda draf `kunci_otomatis`
 * selalu dibuang.
 */
export function rapikanPertanyaan<T extends RegistrationField>(field: T): T {
  const { kunci_otomatis: _draf, ...tanpaDraf } = field;
  void _draf;
  if (!ditanyakan(tanpaDraf)) return { ...tanpaDraf, on_form: false, required: false } as T;
  const { on_form: _dibuang, ...sisa } = tanpaDraf;
  void _dibuang;
  return sisa as T;
}

/* ----------------------------------------------------- Formulir publik */

/** Isi satu pertanyaan dalam urutan tetap, supaya dua susunan bisa dibandingkan sebagai teks. */
function isiPertanyaan(field: RegistrationField) {
  return [
    field.key, field.label, field.type, wajibDiisi(field), field.options ?? [], field.option_descriptions ?? [],
    field.placeholder ?? "", field.help_text ?? "", field.min ?? null, field.max ?? null,
  ];
}

/** Yang dilihat pendaftar dari satu susunan: pertanyaan yang ditanyakan, teks, dan tanda wajib kolom bawaan. */
function formulirPublik(config: RegistrationFormConfig): string {
  return JSON.stringify([
    pertanyaanFormulir(config.fields ?? []).map(isiPertanyaan),
    config.welcome_text ?? "",
    config.success_text ?? "",
    config.require_email !== false,
    config.require_phone !== false,
    config.require_company === true,
    config.require_job_title === true,
  ]);
}

/**
 * Save form yang hanya mengubah pertanyaan yang tidak ditanyakan (mis. kolom
 * staf baru): formulir publik tetap sama, jadi toast-nya tidak mengabarkan
 * halaman pendaftaran yang baru. Simpan tanpa perubahan apa pun tetap mendapat
 * kabar yang sama seperti dulu.
 */
export function hanyaDiLuarFormulir(sebelum: RegistrationFormConfig, sesudah: RegistrationFormConfig): boolean {
  const semua = (config: RegistrationFormConfig) => JSON.stringify(
    (config.fields ?? []).map((field) => [...isiPertanyaan(field), ditanyakan(field), field.participant_update === true, field.agenda_label === true]),
  );
  return formulirPublik(sebelum) === formulirPublik(sesudah) && semua(sebelum) !== semua(sesudah);
}

/**
 * Mode Add a column: draf punya pertanyaan baru (kunci yang belum ada di
 * susunan tersimpan) dan tidak satu pun ditanyakan. Hanya selama itu Edit form
 * boleh berkata "The new one isn't asked on the registration form." Begitu
 * pertanyaan barunya dinyalakan (atau jenisnya File upload), kalimat itu salah.
 */
export function kolomBaruDiLuarFormulir(tersimpan: Pick<RegistrationField, "key">[], draf: RegistrationField[]): boolean {
  const lama = new Set(tersimpan.map((field) => field.key));
  const baru = draf.filter((field) => !lama.has(field.key));
  return baru.length > 0 && baru.every((field) => !ditanyakan(field));
}

/* ------------------------------------------------------------ Kunci data */

function dasarKunci(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 32) || "field";
}

/** Kunci JSON dari teks pertanyaan. Admin tidak perlu memikirkannya, tapi tetap bisa mengubahnya. */
export function kunciDariLabel(label: string, terpakai: ReadonlySet<string>): string {
  const dasar = dasarKunci(label);
  if (!terpakai.has(dasar)) return dasar;
  for (let n = 2; n < 100; n += 1) {
    const calon = `${dasar}_${n}`;
    if (!terpakai.has(calon)) return calon;
  }
  return `${dasar}_${Date.now()}`;
}

/** Batas daftar kunci pensiun; yang tertua dilepas lebih dulu. */
const BATAS_PENSIUN = 200;

/** `retired_keys` yang tersimpan. JSON-nya bisa saja disunting tangan, jadi dibaca hati-hati. */
function kunciPensiunTersimpan(config: RegistrationFormConfig | null | undefined): string[] {
  const daftar: unknown = config?.retired_keys;
  return Array.isArray(daftar) ? daftar.filter((kunci): kunci is string => typeof kunci === "string") : [];
}

/**
 * `retired_keys` sesudah Save form: yang sudah pensiun ditambah kunci tersimpan
 * yang hilang dari susunan baru (pertanyaannya dihapus, atau Data key-nya
 * diganti). Jawabannya tetap ada di participants.extra, jadi kunci otomatis
 * pertanyaan baru menghindarinya. Kunci yang dipakai lagi lewat Data key yang
 * diketik sendiri (menghidupkan kolom lama dengan sengaja) keluar dari daftar.
 * Undefined bila kosong: susunan yang tidak pernah kehilangan pertanyaan
 * tersimpan persis seperti dulu.
 */
export function kunciPensiun(tersimpan: RegistrationFormConfig | null | undefined, fields: Pick<RegistrationField, "key">[]): string[] | undefined {
  const dipakai = new Set(fields.map((field) => field.key));
  const semua = [...kunciPensiunTersimpan(tersimpan), ...(tersimpan?.fields ?? []).map((field) => field.key)];
  const sisa = [...new Set(semua)].filter((kunci) => !dipakai.has(kunci)).slice(-BATAS_PENSIUN);
  return sisa.length ? sisa : undefined;
}

/**
 * Kunci yang tidak boleh dipakai kunci otomatis pertanyaan (selain yang di
 * posisi `kecuali`): kunci pertanyaan lain, kunci yang masih disetujui untuk
 * klien walau pertanyaannya sudah dihapus (QA #102, H1), dan kunci pensiun
 * yang jawabannya masih tersimpan. Data key yang diketik sendiri tetap boleh
 * memakai kunci pensiun: itu keputusan sadar, sama dengan sebelum ada aturan ini.
 */
export function kunciTerpakai(config: RegistrationFormConfig, kecuali?: number): Set<string> {
  return new Set([
    ...(config.fields ?? []).filter((_, posisi) => posisi !== kecuali).map((field) => field.key),
    ...persetujuanKlien(config).map((item) => item.key),
    ...kunciPensiunTersimpan(config),
  ]);
}

/**
 * Pertanyaan baru di ujung susunan, kuncinya ditandai otomatis (ikut teksnya,
 * kunciIkutLabel). `ditanyakan: false` untuk "Add a column in Registration"
 * dari Participant list: kolom baru langsung khusus panitia. `tersimpan`: kunci
 * susunan yang tersimpan, juga milik pertanyaan yang baru dihapus di draf ini.
 * Kuncinya tidak dipakai ulang, supaya jawaban pertanyaan yang dihapus tidak
 * diam-diam muncul di pertanyaan baru.
 */
export function tambahPertanyaan(config: RegistrationFormConfig, opsi: { ditanyakan?: boolean; tersimpan?: ReadonlySet<string> } = {}): RegistrationFormConfig {
  const label = "Pertanyaan baru";
  const baru: RegistrationField = {
    key: kunciDariLabel(label, new Set([...kunciTerpakai(config), ...(opsi.tersimpan ?? [])])),
    label,
    type: "text",
    required: false,
    ...(opsi.ditanyakan === false ? { on_form: false } : {}),
    kunci_otomatis: true,
  };
  return { ...config, fields: [...(config.fields ?? []), baru] };
}

/**
 * Kunci pertanyaan di posisi `index` setelah teksnya diganti menjadi `label`.
 *
 * Hanya kunci yang masih bertanda `kunci_otomatis` yang ikut teksnya: kolom
 * baru yang dinamai "Batch" mendapat kunci `batch`, bukan `pertanyaan_baru`,
 * dan kunci itulah nama kolomnya di ekspor dan templat impor. Tandanya dipasang
 * tambahPertanyaan, hilang begitu Data key diketik sendiri, dan tidak pernah
 * disimpan (rapikanPertanyaan): sesudah Save form kunci tidak pernah berubah
 * sendiri, karena jawaban yang sudah ada tersimpan di bawah kunci itu. Tanda,
 * bukan tebakan dari bentuk kuncinya: `tahun_2026` yang diketik sendiri mirip
 * kunci otomatis bernomor, tetapi tetap milik admin. Kunci tersimpan milik
 * pertanyaan yang baru dihapus di draf ini dan kunci pensiun tidak dipakai ulang.
 */
export function kunciIkutLabel(config: RegistrationFormConfig, index: number, label: string, tersimpan: ReadonlySet<string>): string {
  const field = (config.fields ?? [])[index];
  if (!field) return dasarKunci(label);
  if (!field.kunci_otomatis) return field.key;
  return kunciDariLabel(label, new Set([...kunciTerpakai(config, index), ...tersimpan]));
}

/* ------------------------------------------- Kembali ke Participant list */

/** Kunci pertanyaan yang ada sesudah disimpan tetapi belum ada sebelumnya. */
export function kunciBaru(sebelum: Pick<RegistrationField, "key">[], sesudah: Pick<RegistrationField, "key">[]): string[] {
  const lama = new Set(sebelum.map((field) => field.key));
  return sesudah.map((field) => field.key).filter((kunci) => !lama.has(kunci));
}

/**
 * Participant list setelah Save form di mode Add a column: `?kolom=` membawa
 * kunci pertanyaan baru supaya kolomnya tercentang di menu Columns.
 */
export function tautanDaftarPeserta(kunci: string[]): string {
  return kunci.length ? `/admin/participants?kolom=${kunci.join(",")}` : "/admin/participants";
}

/** Kebalikan tautanDaftarPeserta: kolom tabel (`field:<kunci>`) untuk pertanyaan yang memang ada. */
export function kolomDariTautan(nilai: string | null, fields: Pick<RegistrationField, "key">[]): string[] {
  if (!nilai) return [];
  const ada = new Set(fields.map((field) => field.key));
  return [...new Set(nilai.split(",").map((kunci) => kunci.trim()).filter((kunci) => ada.has(kunci)))].map((kunci) => `field:${kunci}`);
}
