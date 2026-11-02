/**
 * Daftar "Not yet / Checked in" di tab Find name layar pemindai
 * (/api/attendance/daftar). Fungsi murni, diuji di daftar-hadir.check.ts.
 *
 * Halaman dibaca dengan keyset (nama, id), bukan offset. Daftar "Not yet"
 * menyusut selama lead menggulir: setiap tamu yang dipindai di meja lain keluar
 * dari daftar, dan offset akan melompati orang sebanyak yang keluar. Keyset
 * melanjutkan tepat setelah nama terakhir yang terlihat.
 */

export type StatusDaftar = "belum" | "hadir";

/** Satu halaman. Cukup untuk satu layar penuh digulir, cukup kecil untuk sinyal venue. */
export const UKURAN_HALAMAN = 50;

export type Kursor = { n: string; i: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function bacaStatus(mentah: string | null): StatusDaftar {
  return mentah === "hadir" ? "hadir" : "belum";
}

export function tulisKursor(kursor: Kursor): string {
  return Buffer.from(JSON.stringify(kursor), "utf8").toString("base64url");
}

/** Kursor dari URL. Apa pun yang tidak berbentuk (nama, uuid) dianggap halaman pertama. */
export function bacaKursor(mentah: string | null): Kursor | null {
  if (!mentah || mentah.length > 1200) return null;
  try {
    const isi = JSON.parse(Buffer.from(mentah, "base64url").toString("utf8")) as unknown;
    if (!isi || typeof isi !== "object") return null;
    const { n, i } = isi as Record<string, unknown>;
    if (typeof n !== "string" || n.length > 500 || typeof i !== "string" || !UUID.test(i)) return null;
    return { n, i };
  } catch {
    return null;
  }
}

/**
 * Nilai dalam tanda kutip untuk penyaring PostgREST. Nama boleh berisi koma,
 * titik dan kurung ("Budi, S.E. (BCA)"), yang tanpa kutip memecah `or=(...)`
 * menjadi cabang lain. Di dalam kutip hanya `"` dan `\` yang perlu di-escape.
 */
export function kutip(nilai: string): string {
  return `"${nilai.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Penyaring "sesudah baris terakhir": name > n, atau name = n dan id > i. */
export function saringSetelah(kursor: Kursor): string {
  const nama = kutip(kursor.n);
  return `name.gt.${nama},and(name.eq.${nama},id.gt.${kursor.i})`;
}

/** Pindaian pertama dan jumlahnya, dari baris pindaian yang ikut di-embed. */
export function ringkasPindaian(scans: Array<{ scanned_at: string }> | null | undefined) {
  const daftar = scans ?? [];
  let pertama: string | null = null;
  for (const scan of daftar) if (pertama === null || scan.scanned_at < pertama) pertama = scan.scanned_at;
  return { scan_count: daftar.length, first_scan_at: pertama };
}
