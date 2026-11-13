export const KREM = "#FAF8F2";
export const TINTA = "#101E38";
export const REDUP = "#526078";
export const LABEL = "#4D5D77";
export const GARIS_NAVY = "#405272";
export const REDUP_NAVY = "#CDD7EA";

/**
 * Kartu putih di latar krem: pola M3 Outlined card, garis 1 px tinta 12%
 * (~1,3:1, lebih lembut dari outline-variant). Putih di krem tanpa garis hanya
 * ~1,05:1, jadi batas kartu hilang di susunan dua kolom Beranda.
 */
export const GARIS_KARTU = "ring-1 ring-[rgb(16_30_56/0.12)]";

/*
 * Satu skala untuk setiap kartu putih portal Horizon (DESIGN.md "Kartu di
 * portal Horizon"): judul isi 18/24 tebal, nilai kunci 16/24, keterangan
 * 14/20, alis 12/16, dan tautan 14/20 yang area ketuknya tetap 48 px tanpa
 * menambah jarak baris (-my-3.5 menarik balik kelebihan 28 px). Jarak: 4 px
 * antar-baris satu kelompok, 12 px antar-kelompok, 16 px antar-bagian kartu.
 */
export const KARTU_HZ = `${GARIS_KARTU} rounded-[16px] bg-white`;
export const PAD_KARTU = "p-4 md:p-6";
export const KELAS_JUDUL_ISI = "text-[18px] font-bold leading-6 [overflow-wrap:anywhere]";
export const KELAS_NILAI = "text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]";
export const KELAS_ALIS = "text-[12px] font-semibold leading-4";
export const KELAS_KET = "text-[14px] leading-5 [overflow-wrap:anywhere]";
export const KELAS_TAUTAN = "-my-3.5 inline-flex min-h-12 items-center gap-1 self-start text-[14px] font-semibold leading-5 underline decoration-[var(--hz-emas,currentColor)] decoration-2 underline-offset-[5px]";
export const KELAS_STRIP = "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[12px] px-3 py-2";
export const LATAR_STRIP = "#F1F3F8";
export const WARNA_GARIS = "#E6E8EC";
