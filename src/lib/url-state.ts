"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Keadaan layar yang hidup di URL: tab, kata pencarian, urutan.
 *
 * ---- Kenapa bukan `useState` ----------------------------------------------
 *
 * Tiga hal yang hilang kalau keadaan ini hanya ada di memori komponen: menyegarkan
 * halaman mengembalikan semuanya ke bawaan, tombol kembali tidak membatalkan
 * penyaringan, dan tidak ada yang bisa dibagikan lewat tautan. Yang ketiga yang
 * paling sering diminta — "kirim saya daftar acara yang masih draft".
 *
 * ---- Kenapa bukan `useSearchParams` ---------------------------------------
 *
 * Hook itu memaksa seluruh halaman yang memakainya masuk ke batas Suspense,
 * dan di sini yang dibutuhkan hanya tiga parameter yang dibaca saat render.
 *
 * ---- Kenapa `useSyncExternalStore` ----------------------------------------
 *
 * URL adalah keadaan di luar React, persis bentuk yang hook ini dibuat untuk
 * menanganinya. Snapshot server-nya string kosong: server tidak punya
 * `window.location`, dan menebak akan membuat markup pertama berbeda dari
 * klien. Konsekuensinya render pertama memakai nilai bawaan lalu berganti
 * setelah hidrasi — terlihat sekejap, dan itu harga yang benar dibanding
 * hidrasi yang gagal.
 */

const pendengar = new Set<() => void>();

function beritahu() {
  for (const dengar of pendengar) dengar();
}

function langganan(onChange: () => void) {
  pendengar.add(onChange);
  // `popstate` untuk tombol kembali peramban; set di atas untuk perubahan yang
  // ditulis halaman ini sendiri, karena `replaceState` TIDAK memicu `popstate`.
  window.addEventListener("popstate", onChange);
  return () => {
    pendengar.delete(onChange);
    window.removeEventListener("popstate", onChange);
  };
}

const bacaSearch = () => window.location.search;

export function useQueryState() {
  const search = useSyncExternalStore(langganan, bacaSearch, () => "");
  const params = useMemo(() => new URLSearchParams(search), [search]);

  /**
   * `replaceState`, bukan `pushState`.
   *
   * Mengetik di kolom cari menghasilkan satu perubahan per huruf; dengan
   * `pushState`, tombol kembali harus ditekan dua belas kali untuk keluar dari
   * satu kata. Yang disimpan di riwayat cukup halamannya, bukan tiap ketukan.
   */
  const set = useCallback((patch: Record<string, string | null>) => {
    const berikutnya = new URLSearchParams(window.location.search);
    for (const [kunci, nilai] of Object.entries(patch)) {
      if (nilai === null || nilai === "") berikutnya.delete(kunci);
      else berikutnya.set(kunci, nilai);
    }
    const kueri = berikutnya.toString();
    window.history.replaceState(null, "", kueri ? `${window.location.pathname}?${kueri}` : window.location.pathname);
    beritahu();
  }, []);

  return { params, set };
}
