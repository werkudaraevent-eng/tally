/**
 * Foto contoh dress code: kartu Agenda > Dress code dan Every day di
 * Participant area. Satu jalur unggah dengan latar header Agenda
 * (/api/display/background), yang menjawab dalam bahasa Indonesia; admin
 * membaca kalimat English dari sini. Tanpa impor, jadi bagian murninya diuji
 * langsung oleh Node (outfit-foto.check.ts).
 */

/** Jenis berkas yang diterima, juga untuk `accept` kolom berkas. */
export const FOTO_OUTFIT_TERIMA = "image/png,image/jpeg,image/webp";
export const FOTO_OUTFIT_SALAH = "The photo must be a JPG, PNG or WebP up to 5 MB.";
const BATAS_BYTE = 5 * 1024 * 1024;
const GAGAL = "The photo was not uploaded. Try again.";

/** Diperiksa sebelum diunggah: berkas yang salah tidak perlu diunggah untuk ditolak. */
export function fotoOutfitSah(file: { type: string; size: number }): boolean {
  return FOTO_OUTFIT_TERIMA.split(",").includes(file.type) && file.size > 0 && file.size <= BATAS_BYTE;
}

/**
 * Kalimat gagal unggah untuk admin. `status` null: tidak ada jawaban sama
 * sekali. 422 berbahasa Indonesia, kecuali batas piksel yang sudah English dan
 * lebih tepat; galat lain memakai pesan server bila ada.
 */
export function pesanGagalFotoOutfit(status: number | null, data: unknown): string {
  if (status === null) return "Check your connection and try again.";
  const galat = (data as { error?: { message?: unknown; details?: { file?: unknown; message?: unknown } } } | null)?.error;
  if (status === 422) {
    const pesan = galat?.details?.file;
    return typeof pesan === "string" && pesan.startsWith("Images can be") ? pesan : FOTO_OUTFIT_SALAH;
  }
  return [galat?.details?.message, galat?.message].find((pesan): pesan is string => typeof pesan === "string" && pesan.trim() !== "") ?? GAGAL;
}

/** Unggah satu foto: alamat publiknya, atau kalimat gagal untuk admin. */
export async function unggahFotoOutfit(file: File): Promise<{ url: string } | { galat: string }> {
  if (!fotoOutfitSah(file)) return { galat: FOTO_OUTFIT_SALAH };
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/display/background", { method: "POST", body: form }).catch(() => null);
  const data: unknown = response ? await response.json().catch(() => null) : null;
  if (!response?.ok) return { galat: pesanGagalFotoOutfit(response ? response.status : null, data) };
  const url = (data as { url?: unknown } | null)?.url;
  return typeof url === "string" && url ? { url } : { galat: GAGAL };
}
