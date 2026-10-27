// Tampilan Daftar FAQ: pertanyaan dikelompokkan per topik dari kolom
// "Kelompok" yang diisi panitia. Tidak ada daftar topik tetap di kode.

export type FaqButir = { q: string; a: string; group?: string; group_id?: string };
export type FaqKelompok<T extends FaqButir> = { kunci: string; judul: string | null; butir: T[] };

/** Kunci kelompok: nama Indonesia (`group_id` di /en), tanpa beda spasi dan huruf besar. */
export function kunciKelompok(item: FaqButir): string {
  return (item.group_id ?? item.group ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("id");
}

/**
 * Kelompok berurutan menurut pertanyaan pertamanya; pertanyaan tetap dalam
 * urutan CMS di dalam kelompoknya. Pertanyaan tanpa kelompok dikumpulkan
 * tanpa judul, di posisi pertanyaan tanpa kelompok yang pertama. Judul diambil
 * dari pertanyaan pertama kelompok itu (di /en: terjemahannya).
 */
export function kelompokFaq<T extends FaqButir>(items: readonly T[]): FaqKelompok<T>[] {
  const hasil: FaqKelompok<T>[] = [];
  const byKunci = new Map<string, FaqKelompok<T>>();
  for (const item of items) {
    const kunci = kunciKelompok(item);
    let kelompok = byKunci.get(kunci);
    if (!kelompok) {
      kelompok = { kunci, judul: kunci ? item.group?.trim() || null : null, butir: [] };
      byKunci.set(kunci, kelompok);
      hasil.push(kelompok);
    }
    kelompok.butir.push(item);
  }
  return hasil;
}

/** Nama kelompok yang sudah dipakai, untuk saran di editor (tanpa duplikat). */
export function namaKelompokFaq(items: readonly FaqButir[]): string[] {
  const seen = new Map<string, string>();
  for (const item of items) {
    const nama = item.group?.trim().replace(/\s+/g, " ");
    if (nama && !seen.has(kunciKelompok(item))) seen.set(kunciKelompok(item), nama);
  }
  return [...seen.values()];
}
