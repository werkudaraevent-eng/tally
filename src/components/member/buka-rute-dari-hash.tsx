"use client";

import { useEffect } from "react";

/** Membuka baris rute (`<details id>`) yang dituju `#<id>`, mis. dari "Cara ke sana" di Susunan acara, lalu menggulir ke sana. */
export function BukaRuteDariHash() {
  useEffect(() => {
    const buka = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const baris = id ? document.getElementById(id) : null;
      if (!(baris instanceof HTMLDetailsElement)) return;
      baris.open = true;
      // Setelah gulir hash milik router, supaya baris tidak tertutup kepala halaman (scroll-margin-top).
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const atas = baris.getBoundingClientRect().top + window.scrollY - parseFloat(getComputedStyle(baris).scrollMarginTop || "0");
        window.scrollTo({ top: Math.max(0, atas) });
      }));
    };
    buka();
    window.addEventListener("hashchange", buka);
    return () => window.removeEventListener("hashchange", buka);
  }, []);

  return null;
}
