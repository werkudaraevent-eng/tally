/**
 * Cincin fokus Horizon (U-12). Cincin global memakai warna primer M3, yang di
 * atas navy hanya ~2,5:1 dan berganti di mode gelap. Halaman Horizon (halaman
 * acara dan portal) memakai dua warna tetap: tinta navy di bidang krem dan
 * putih (bawaan dari gayaHorizon), dan emas Tema di bidang navy lewat kelas
 * CINCIN_NAVY. Emas yang di bawah 3:1 terhadap navy diganti putih
 * (--hz-cincin-navy, diukur gayaHorizon). Modul kecil sendiri supaya komponen
 * klien bisa memakainya tanpa ikut memuat horizon.tsx. Panel putih di dalam
 * bidang navy (panel lonceng) kembali ke `--hz-cincin-terang`.
 */
export const CINCIN_NAVY = "[--cincin-fokus:var(--hz-cincin-navy)]";

/** Tinta navy V5: 15,6:1 di krem, lebih di putih. */
export const CINCIN_TERANG = "#101E38";
