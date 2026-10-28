"use client";

import { useEffect } from "react";

/**
 * Menggulir ke `#<id>` yang dituju (mis. baris Bantuan di Beranda ke Kontak
 * panitia di Profil) dengan scroll-margin-top dihormati. Gulir hash bawaan
 * router saat pindah halaman di dalam aplikasi menaruh judul kartu di bawah
 * bilah atas, jadi diulang setelah dua frame, seperti BukaRuteDariHash.
 */
export function GulirKeHash({ ids }: { ids: string[] }) {
  const kunci = ids.join(" ");
  useEffect(() => {
    const daftar = kunci.split(" ");
    const gulir = () => {
      let id = "";
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      if (!daftar.includes(id)) return;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (!el) return;
        const atas = el.getBoundingClientRect().top + window.scrollY - parseFloat(getComputedStyle(el).scrollMarginTop || "0");
        window.scrollTo({ top: Math.max(0, atas) });
      }));
    };
    gulir();
    window.addEventListener("hashchange", gulir);
    return () => window.removeEventListener("hashchange", gulir);
  }, [kunci]);

  return null;
}
