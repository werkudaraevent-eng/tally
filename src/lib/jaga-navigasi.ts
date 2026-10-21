"use client";

import { useEffect, useRef } from "react";

// Penjaga suntingan yang belum disimpan, dipakai bersama halaman admin dan
// shell. Menutup atau memuat ulang tab ditanyakan peramban (beforeunload).
// Pindah halaman di dalam aplikasi tidak memicu beforeunload, jadi klik tautan
// (rel navigasi, bilah atas) ditahan di sini, dan palet perintah serta pemilih
// acara lewat navigasiTerjaga(). Satu penjaga pada satu waktu: halaman yang
// sedang dibuka.

type Tanya = (lanjut: () => void) => void;

let penjaga: Tanya | null = null;
// Klik ulang sesudah admin memilih Discard tidak ditahan lagi.
let lewati = false;

// Ditunda satu tik: halaman sempat membuang suntingannya dan melepas
// beforeunload lebih dulu, jadi peramban tidak bertanya untuk kedua kalinya.
const nanti = (lanjut: () => void) => () => {
  window.setTimeout(lanjut, 0);
};

/**
 * Klik tautan yang sedang dikirim ulang sesudah Discard. AdminShell
 * melewatkannya: ketukan di rel sentuh yang biasanya hanya membuka rel harus
 * memindahkan halaman di sini.
 */
export function klikUlang() {
  return lewati;
}

/** Navigasi lewat kode (router.push): langsung, atau sesudah halaman bertanya. */
export function navigasiTerjaga(lanjut: () => void) {
  if (penjaga) penjaga(nanti(lanjut));
  else lanjut();
}

export type KlikTautan = { href: string; target: string; unduh: boolean; tombol: number; pengubah: boolean };

/**
 * Klik yang memindahkan tab ini ke halaman lain di situs yang sama. Tab baru,
 * unduhan, klik dengan Ctrl/Cmd/Shift/Alt, alamat luar (ditanyakan
 * beforeunload) dan jangkar di halaman yang sama dilewatkan.
 */
export function pindahHalaman(klik: KlikTautan, sekarang: string): boolean {
  if (klik.tombol !== 0 || klik.pengubah || klik.unduh || (klik.target !== "" && klik.target !== "_self")) return false;
  try {
    const tujuan = new URL(klik.href, sekarang);
    const asal = new URL(sekarang);
    return tujuan.origin === asal.origin && (tujuan.pathname !== asal.pathname || tujuan.search !== asal.search);
  } catch {
    return false;
  }
}

function tahanKlik(event: MouseEvent) {
  if (lewati || !penjaga) return;
  const tautan = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(tautan instanceof HTMLAnchorElement)) return;
  // Rel terlipat di layar sentuh: ketukan pertama hanya membuka rel
  // (AdminShell), jadi yang ditanyakan ketukan berikutnya, saat labelnya terlihat.
  if (tautan.closest('[data-rail="1"]') && !tautan.closest("[data-peek-skip]") && !window.matchMedia("(hover: hover)").matches) return;
  const klik = {
    href: tautan.href,
    target: tautan.target,
    unduh: tautan.hasAttribute("download"),
    tombol: event.button,
    pengubah: event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
  };
  if (!pindahHalaman(klik, window.location.href)) return;
  // Fase tangkap di window: berhenti sebelum next/link dan onClick React lain.
  event.preventDefault();
  event.stopPropagation();
  penjaga(nanti(() => {
    // Diklik ulang, supaya next/link dan onClick tautannya (mis. menutup rel
    // di ponsel) berjalan seperti biasa.
    if (!tautan.isConnected) {
      window.location.assign(tautan.href);
      return;
    }
    lewati = true;
    try {
      tautan.click();
    } finally {
      lewati = false;
    }
  }));
}

/**
 * Selama `aktif` (ada suntingan yang belum disimpan): peramban bertanya
 * sebelum menutup atau memuat ulang tab, dan navigasi di dalam aplikasi
 * diserahkan ke `tanya`, yang menjalankan `lanjut` bila admin memilih Discard.
 */
export function useJagaNavigasi(aktif: boolean, tanya: Tanya) {
  // `tanya` fungsi baru tiap render; ref menjaga pendengar tetap satu.
  const tanyaTerkini = useRef(tanya);
  useEffect(() => {
    tanyaTerkini.current = tanya;
  });
  useEffect(() => {
    if (!aktif) return;
    const milikIni: Tanya = (lanjut) => tanyaTerkini.current(lanjut);
    const tahanTutup = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    penjaga = milikIni;
    window.addEventListener("beforeunload", tahanTutup);
    window.addEventListener("click", tahanKlik, true);
    return () => {
      window.removeEventListener("beforeunload", tahanTutup);
      if (penjaga !== milikIni) return;
      penjaga = null;
      window.removeEventListener("click", tahanKlik, true);
    };
  }, [aktif]);
}
