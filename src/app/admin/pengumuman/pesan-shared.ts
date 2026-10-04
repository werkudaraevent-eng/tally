/** Potongan yang dipakai bersama daftar Kiriman, penyusun, dan laporan. */

import { plural } from "@/lib/plural";

export type BlastStatus = "draf" | "terjadwal" | "mengirim" | "selesai" | "dibatalkan" | "dijeda";

export const BLAST_STATUS_LABEL: Record<BlastStatus, string> = {
  draf: "Draft",
  terjadwal: "Scheduled",
  mengirim: "Sending",
  selesai: "Sent",
  dibatalkan: "Cancelled",
  dijeda: "Paused",
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
      ? "Never signed in"
      : audience?.jenis === "belum_dikirim"
        ? "Invited guests not sent yet"
        : audience?.jenis === "belum_daftar"
          ? "Invited guests not registered yet"
          : audience?.jenis === "manual"
            ? audience.label || `${plural(audience.ids?.length ?? 0, "participant")} selected`
            : "All participants";
  const perusahaan = audience?.perusahaan ?? [];
  if (perusahaan.length === 0) return dasar;
  return `${dasar} · ${perusahaan.length === 1 ? perusahaan[0] : plural(perusahaan.length, "organisation")}`;
}

/** Jam di zona waktu acara, sama dengan halaman Pengumuman. */
export function waktu(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
}
