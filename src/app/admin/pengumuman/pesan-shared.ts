/** Potongan yang dipakai bersama daftar Kiriman, penyusun, dan laporan. */

export type BlastStatus = "draf" | "terjadwal" | "mengirim" | "selesai" | "dibatalkan" | "dijeda";

export const BLAST_STATUS_LABEL: Record<BlastStatus, string> = {
  draf: "Draf",
  terjadwal: "Terjadwal",
  mengirim: "Sedang dikirim",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
  dijeda: "Dijeda",
};

export const BLAST_STATUS_TONE: Record<BlastStatus, "neutral" | "primary" | "success" | "warning" | "error"> = {
  draf: "neutral",
  terjadwal: "primary",
  mengirim: "primary",
  selesai: "success",
  dibatalkan: "neutral",
  dijeda: "warning",
};

export function audienceLabel(audience: { jenis?: string; label?: string; perusahaan?: string[]; ids?: string[] } | null) {
  const dasar =
    audience?.jenis === "belum_masuk"
      ? "Belum pernah masuk"
      : audience?.jenis === "belum_dikirim"
        ? "Tamu yang belum dikirim"
        : audience?.jenis === "belum_daftar"
          ? "Tamu yang belum daftar"
          : audience?.jenis === "manual"
            ? audience.label || `${audience.ids?.length ?? 0} peserta dipilih`
            : "Semua peserta";
  const perusahaan = audience?.perusahaan ?? [];
  if (perusahaan.length === 0) return dasar;
  return `${dasar} · ${perusahaan.length === 1 ? perusahaan[0] : `${perusahaan.length} perusahaan`}`;
}

/** Jam di zona waktu acara, sama dengan halaman Pengumuman. */
export function waktu(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
}
