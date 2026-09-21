import { StatusChip } from "@/components/m3";
import { EVENT_STATUS_LABEL, type EventStatus } from "@/lib/domain";

/**
 * Lencana status acara, dipakai BERSAMA oleh tiga tempat: daftar acara,
 * pengalih acara di rel navigasi, dan hasil "Event" di palet perintah.
 *
 * Sebelumnya ketiganya menggambarnya sendiri, dan ketiganya berbeda: daftar
 * memakai teks berwarna (hijau tebal untuk Aktif, biru untuk Selesai — yang
 * terbaca sebagai tautan), pengalih memakai pil bergaris tanpa warna, palet
 * menulis nilai kolom apa adanya ("completed"). Satu status, tiga bentuk, dan
 * yang membaca ketiganya orang yang sama dalam satu menit.
 *
 * Warnanya pindah ke TITIK, teksnya tetap warna utama. Teks berwarna di dalam
 * daftar bersaing dengan nama acaranya sendiri, dan biru khususnya menjanjikan
 * tautan yang tidak ada.
 */

/**
 * Urutan tampil: yang sedang berjalan dulu, yang belum jalan, yang sudah lewat,
 * lalu yang disingkirkan. Diekspor supaya pengurutan di daftar dan di pengalih
 * acara tidak bisa berbeda.
 */
export const URUTAN_STATUS: EventStatus[] = ["active", "draft", "completed", "archived"];

/**
 * `neutral` untuk draft, `primary` untuk selesai.
 *
 * Selesai TIDAK memakai hijau: hijau berarti "berjalan baik sekarang", dan acara
 * yang sudah lewat tidak berjalan sama sekali. Ia juga tidak memakai abu yang
 * sama dengan draft, karena keduanya lawan kata — satu belum mulai, satu sudah
 * selesai.
 */
const TONE: Record<EventStatus, "success" | "neutral" | "primary" | "error"> = {
  active: "success",
  draft: "neutral",
  completed: "primary",
  archived: "neutral",
};

export function EventStatusBadge({ status, className }: { status: EventStatus; className?: string }) {
  return (
    <StatusChip dot tone={TONE[status]} className={className}>
      {EVENT_STATUS_LABEL[status]}
    </StatusChip>
  );
}
