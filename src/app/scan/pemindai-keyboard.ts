"use client";

import { useEffect, useRef } from "react";

/**
 * Pemindai genggam USB/Bluetooth yang "mengetik" kodenya (keyboard wedge).
 *
 * Alat seperti ini lazim di meja registrasi bertablet: ia mengirim kode huruf
 * demi huruf, sangat cepat, lalu Enter, ke elemen apa pun yang sedang fokus.
 * Tanpa penangkap khusus, kode itu hanya sampai bila kolom "ketik kode" kebetulan
 * fokus. Begitu lembar hasil terbuka, fokus pindah ke lembar, huruf tamu
 * berikutnya hilang, dan Enter-nya menekan tombol yang sedang fokus.
 *
 * Penangkap ini duduk di fase CAPTURE pada `document`, jadi ia melihat setiap
 * ketukan lebih dulu daripada dialog maupun kolom. Ketikan manusia dibedakan
 * dari alat lewat jeda antarhuruf: alat mengirim di bawah ~40 ms, manusia jauh
 * di atasnya. Hanya rentetan cepat sepanjang 4 huruf atau lebih yang diakhiri
 * Enter yang diambil; Enter-nya ditahan supaya tidak menekan tombol apa pun.
 *
 * Kolom teks lain (pencarian nama, kode layar, formulir walk-in) dibiarkan:
 * yang mengetik di sana memang manusia, dan kodenya bukan kode peserta.
 */

const JEDA_ALAT_MS = 40;
const PANJANG_MIN = 4;

export function usePemindaiKeyboard(aktif: boolean, onKode: (kode: string) => void, kolomKode: string) {
  const onKodeRef = useRef(onKode);
  useEffect(() => { onKodeRef.current = onKode; });

  useEffect(() => {
    if (!aktif) return;
    let isi = "";
    let terakhir = 0;
    let cepat = true;

    const tekan = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Kotak centang dan tombol bukan kolom ketik: petugas yang baru mencentang
      // kaos tetap harus bisa memindai tamu berikutnya.
      const kolomTeks =
        (target instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit"].includes(target.type)) ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      // Kolom teks selain kolom kode peserta: milik manusia.
      if (kolomTeks && (target as HTMLInputElement).name !== kolomKode) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const sekarang = performance.now();
      const jeda = sekarang - terakhir;

      if (event.key === "Enter") {
        const kode = isi.trim();
        const dariAlat = cepat && kode.length >= PANJANG_MIN && jeda < 200;
        isi = "";
        terakhir = 0;
        cepat = true;
        if (!dariAlat) return;
        event.preventDefault();
        event.stopPropagation();
        // Huruf yang sempat masuk ke kolom kode ikut dibersihkan, supaya kolom
        // tidak menyimpan kode tamu sebelumnya.
        if (target instanceof HTMLInputElement && target.name === kolomKode) target.value = "";
        onKodeRef.current(kode);
        return;
      }

      if (event.key.length !== 1) return;
      // Jeda panjang berarti rentetan baru. Huruf pertama sebuah rentetan selalu
      // diterima; yang dinilai adalah jarak huruf-huruf sesudahnya.
      if (isi === "" || jeda > 100) {
        isi = event.key;
        cepat = true;
      } else {
        if (jeda > JEDA_ALAT_MS) cepat = false;
        isi += event.key;
      }
      terakhir = sekarang;
    };

    document.addEventListener("keydown", tekan, true);
    return () => document.removeEventListener("keydown", tekan, true);
  }, [aktif, kolomKode]);
}
