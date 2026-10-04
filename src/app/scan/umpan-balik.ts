"use client";

/**
 * Bunyi dan getar untuk setiap jawaban pemindaian.
 *
 * ---- Kenapa bunyi, bukan hanya warna ----------------------------------------
 *
 * Petugas di meja menatap TAMU, bukan layarnya. Cvent OnArrival memberi tiga
 * tanda sekaligus untuk check-in yang berhasil: centang hijau, getar, dan bunyi
 * "success". Di iPhone dua dari tiganya hilang begitu saja kalau hanya memakai
 * `navigator.vibrate`: Safari iOS tidak punya API getar sama sekali, jadi bunyi
 * adalah SATU-SATUNYA tanda non-visual di sana.
 *
 * ---- Kenapa disintesis, bukan berkas audio ----------------------------------
 *
 * Tiga nada pendek dari Web Audio tidak perlu diunduh, tidak bisa gagal dimuat
 * di jaringan venue, dan bentuknya bisa dibedakan lewat IRAMA, bukan hanya
 * tinggi nada: petugas yang tidak peka nada tetap bisa membedakan satu ketukan,
 * dua ketukan, dan satu dengung panjang.
 *
 * ---- iPhone ----------------------------------------------------------------
 *
 * Safari hanya mengizinkan `AudioContext` berbunyi setelah dibuka di dalam
 * gestur pengguna, dan menangguhkannya lagi ketika halaman ke belakang. Jadi
 * `bukaSuara()` dipanggil dari setiap ketukan yang wajar terjadi sebelum
 * pemindaian: Nyalakan kamera, tombol Suara, tombol di lembar hasil.
 *
 * Sakelar senyap iPhone ikut membisukan Web Audio. Safari yang lebih baru punya
 * `navigator.audioSession`; jenis "playback" membuatnya tetap berbunyi. Di versi
 * yang belum punya, sakelar senyap tetap menang, dan itu disebutkan di layar.
 */

export type JenisBunyi = "ok" | "ulang" | "galat";

const KUNCI_SUARA = "scan-suara";

let konteks: AudioContext | null = null;

/** Dipanggil di dalam gestur pengguna. Aman dipanggil berkali-kali. */
export function bukaSuara() {
  try {
    const sesi = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (sesi && sesi.type !== "playback") sesi.type = "playback";
  } catch { /* tidak didukung */ }

  try {
    if (!konteks) {
      const Kelas = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Kelas) return;
      konteks = new Kelas();
    }
    if (konteks.state !== "running") void konteks.resume().catch(() => {});
  } catch { /* peramban tanpa Web Audio: tetap ada warna dan teks */ }
}

function nada(mulai: number, frekuensi: number, lama: number, frekuensiAkhir?: number) {
  if (!konteks) return;
  const osc = konteks.createOscillator();
  const gain = konteks.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frekuensi, mulai);
  if (frekuensiAkhir) osc.frequency.linearRampToValueAtTime(frekuensiAkhir, mulai + lama);
  // Naik-turun 10 ms di kedua ujung. Nada yang dipotong mendadak berbunyi "klik".
  gain.gain.setValueAtTime(0, mulai);
  gain.gain.linearRampToValueAtTime(0.25, mulai + 0.01);
  gain.gain.setValueAtTime(0.25, mulai + lama - 0.01);
  gain.gain.linearRampToValueAtTime(0, mulai + lama);
  osc.connect(gain).connect(konteks.destination);
  osc.start(mulai);
  osc.stop(mulai + lama + 0.02);
}

/**
 * Satu nada naik untuk yang beres, dua ketukan untuk pemindaian ulang, satu
 * dengung rendah panjang untuk yang gagal atau tidak dikenal.
 */
export function bunyikan(jenis: JenisBunyi, suaraNyala: boolean) {
  // Getar tetap jalan walau suara dimatikan: getar tidak mengganggu antrean.
  try {
    if (navigator.vibrate) navigator.vibrate(jenis === "ok" ? 90 : jenis === "ulang" ? [60, 60, 60] : [250]);
  } catch { /* tidak didukung */ }

  if (!suaraNyala || !konteks || konteks.state !== "running") return;
  const t = konteks.currentTime + 0.01;
  if (jenis === "ok") nada(t, 880, 0.14, 1320);
  else if (jenis === "ulang") { nada(t, 660, 0.09); nada(t + 0.15, 660, 0.09); }
  else nada(t, 220, 0.45);
}

export function bacaSuara(): boolean {
  try {
    return window.localStorage.getItem(KUNCI_SUARA) !== "0";
  } catch {
    return true;
  }
}

export function simpanSuara(nyala: boolean) {
  try {
    if (nyala) window.localStorage.removeItem(KUNCI_SUARA);
    else window.localStorage.setItem(KUNCI_SUARA, "0");
  } catch { /* penyimpanan tidak tersedia; pilihan tetap berlaku sesi ini */ }
}
