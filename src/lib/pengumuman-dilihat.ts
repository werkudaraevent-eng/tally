/**
 * Laporan "Seen by participants" untuk satu pengumuman (Messages >
 * Announcements). Tanpa migrasi: dihitung dari stempel yang sudah ada.
 *
 * Peserta melihat semua pengumuman di lonceng atau tab Pengumuman sekaligus,
 * dan saat itu `participant_accounts.announcements_seen_at` diperbarui
 * (migrasi 202610030002). Jadi sebuah pengumuman sudah dilihat bila stempel
 * itu tidak lebih awal dari `published_at`-nya. Notify again memajukan
 * `published_at`, sehingga hitungannya mulai lagi dari kiriman ulang itu.
 *
 * Yang sengaja tidak dihitung: email dibuka (Apple Mail memuat gambar pelacak
 * sendiri, jadi angkanya tidak bisa dipercaya), dan pop-up yang ditutup
 * (hanya dicatat di peramban peserta). Pop-up per pengumuman butuh tabel
 * baru, setelah acara KSO.
 */

export type StatusDilihat = "dilihat" | "belum" | "belum_masuk";

export type AkunDilihat = {
  /** Masuk terakhir; null = belum pernah masuk. */
  last_login_at: string | null;
  announcements_seen_at: string | null;
};

const waktu = (nilai: string | null | undefined) => {
  const ms = nilai ? Date.parse(nilai) : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
};

/** Status satu peserta untuk pengumuman yang terbit `publishedAt`. */
export function statusDilihat(publishedAt: string, akun: AkunDilihat | null | undefined): StatusDilihat {
  if (!akun) return "belum_masuk";
  const lihat = waktu(akun.announcements_seen_at);
  const terbit = waktu(publishedAt);
  if (lihat !== null && terbit !== null && lihat >= terbit) return "dilihat";
  // Pernah membuka lonceng berarti pernah masuk, walau last_login_at kosong.
  if (waktu(akun.last_login_at) === null && lihat === null) return "belum_masuk";
  return "belum";
}

export type RingkasDilihat = { total: number; dilihat: number; belum: number; belum_masuk: number };

export function ringkasDilihat(status: StatusDilihat[]): RingkasDilihat {
  const hasil: RingkasDilihat = { total: status.length, dilihat: 0, belum: 0, belum_masuk: 0 };
  for (const isi of status) hasil[isi] += 1;
  return hasil;
}

/** Persen bulat untuk dibaca, bukan untuk dijumlah: 0 bila tidak ada penerima. */
export function persenDilihat(ringkas: Pick<RingkasDilihat, "total" | "dilihat">): number {
  return ringkas.total > 0 ? Math.round((ringkas.dilihat / ringkas.total) * 100) : 0;
}
