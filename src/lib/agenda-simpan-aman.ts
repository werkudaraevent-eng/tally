// Penjaga suntingan Agenda (/admin/rundown). Modul murni tanpa impor, supaya
// diuji langsung dengan node (lihat agenda-simpan-aman.check.ts).
//
// Panel kanan membuka satu formulir pada satu waktu, dan hanya formulir itu
// yang boleh punya suntingan belum disimpan: meninggalkannya ditanyakan dulu.
// Suntingan disimpan sebagai lapisan (hanya kolom yang diubah) di atas data
// tersimpan, jadi memuat ulang data sesudah simpanan lain tidak menimpanya.

export type Panel = "baris" | "bagian" | "header";

/** Isian New item, per bagian. */
export type DrafBaru = { start_time: string; end_time: string; title: string; subtitle: string; is_break: boolean };

/** Formulir di panel kanan: Edit item, New item, Section, atau Page header. */
export type FormAgenda =
  | { jenis: "baris"; id: number }
  | { jenis: "baru"; bagian: number }
  | { jenis: "bagian"; id: number }
  | { jenis: "header" };

/** Formulir yang tampil untuk segmen, tab dan baris terpilih. Tanpa tab: hanya header. */
export function formTerbuka(panel: Panel, bagian: number | null, baris: number | null): FormAgenda {
  if (bagian === null || panel === "header") return { jenis: "header" };
  if (panel === "bagian") return { jenis: "bagian", id: bagian };
  return baris === null ? { jenis: "baru", bagian } : { jenis: "baris", id: baris };
}

export function kunciForm(form: FormAgenda): string {
  if (form.jenis === "baris") return `baris:${form.id}`;
  if (form.jenis === "baru") return `baru:${form.bagian}`;
  if (form.jenis === "bagian") return `bagian:${form.id}`;
  return "header";
}

/**
 * Kosong sama dengan kosong (null, undefined, ""): kolom yang dikosongkan
 * mengirim "", database menyimpan null. Angka dibandingkan sebagai angka,
 * karena skala header bisa datang sebagai "1.00".
 */
export function samaNilai(a: unknown, b: unknown): boolean {
  const kosong = (nilai: unknown) => nilai === null || nilai === undefined || nilai === "";
  if (kosong(a) || kosong(b)) return kosong(a) && kosong(b);
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return a === b;
}

// Jam dibandingkan sebagai "HH:MM": kolom menampilkan dan mengirim bentuk itu,
// database menyimpan "HH:MM:SS".
const KOLOM_JAM = new Set(["start_time", "end_time"]);
const jam = (nilai: unknown) => (typeof nilai === "string" ? nilai.trim().slice(0, 5) : nilai);

/** Ada kolom suntingan yang nilainya berbeda dari yang tersimpan. */
export function adaBeda<T extends object>(tersimpan: T, sunting: Partial<T>): boolean {
  const asli = tersimpan as Record<string, unknown>;
  return Object.entries(sunting).some(([kunci, nilai]) =>
    KOLOM_JAM.has(kunci) ? !samaNilai(jam(asli[kunci]), jam(nilai)) : !samaNilai(asli[kunci], nilai),
  );
}

/**
 * Lapisan sesudah simpanan berhasil: kolom yang masih sama dengan yang dikirim
 * kini tersimpan dan dibuang; kolom yang diketik selama permintaan berjalan
 * tetap ada. Null bila tidak ada yang tersisa.
 */
export function sisaSunting<T extends object>(sunting: Partial<T>, dikirim: Partial<T>): Partial<T> | null {
  const kirim = dikirim as Record<string, unknown>;
  const sisa = Object.entries(sunting).filter(([kunci, nilai]) => !(kunci in kirim) || kirim[kunci] !== nilai);
  return sisa.length > 0 ? (Object.fromEntries(sisa) as Partial<T>) : null;
}

/** sisaSunting() untuk lapisan satu baris atau satu bagian. */
export function lapisanSisa<T extends object>(lapisan: { id: number; isi: Partial<T> }, dikirim: Partial<T>): { id: number; isi: Partial<T> } | null {
  const isi = sisaSunting(lapisan.isi, dikirim);
  return isi ? { id: lapisan.id, isi } : null;
}

/** New item berisi sesuatu selain jam mulai yang diisikan dari baris sebelumnya. */
export function drafBaruBerubah(draf: DrafBaru, jamAwal: string): boolean {
  return Boolean(draf.title.trim() || draf.subtitle.trim() || draf.end_time || draf.is_break) || draf.start_time !== jamAwal;
}

/** Judul dialog saat meninggalkan formulir bersuntingan. `nama`: judul baris atau label tab yang tersimpan. */
export function judulBuang(form: FormAgenda, nama?: string | null): string {
  const isi = nama?.trim();
  if (form.jenis === "baris") return `Discard changes to ${isi || "this item"}?`;
  if (form.jenis === "baru") return "Discard the new item?";
  if (form.jenis === "bagian") return isi ? `Discard changes to the ${isi} tab?` : "Discard changes to this section?";
  return "Discard changes to the page header?";
}

export function keteranganBuang(form: FormAgenda): string {
  if (form.jenis === "baris") return "Your changes to this item are not saved yet.";
  if (form.jenis === "baru") return "It has not been added to the agenda yet.";
  if (form.jenis === "bagian") return "Your changes to this section are not saved yet.";
  return "Your changes to the page header are not saved yet.";
}
