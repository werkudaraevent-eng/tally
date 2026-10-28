"use client";

import { useEffect } from "react";

/**
 * Menggulir ke `#<id>` yang dituju (mis. baris Bantuan di Beranda ke Kontak
 * panitia di Profil) dengan scroll-margin-top dihormati. Gulir bawaan router
 * saat pindah halaman di dalam aplikasi kadang datang belakangan atau tata
 * letak masih bergeser, jadi posisi dipasang ulang tiap frame selama ~600 ms
 * dan berhenti begitu peserta menggulir sendiri.
 */
const LAMA_MS = 600;

export function GulirKeHash({ ids }: { ids: string[] }) {
  const kunci = ids.join(" ");
  useEffect(() => {
    const daftar = kunci.split(" ");
    let frame = 0;
    const berhenti = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      for (const ev of ["wheel", "touchstart", "keydown", "pointerdown"]) window.removeEventListener(ev, berhenti);
    };
    const gulir = () => {
      let id = "";
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      if (!daftar.includes(id)) return;
      berhenti();
      for (const ev of ["wheel", "touchstart", "keydown", "pointerdown"]) window.addEventListener(ev, berhenti, { passive: true });
      const mulai = performance.now();
      const pasang = () => {
        const el = document.getElementById(id);
        if (el) {
          const atas = Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY - parseFloat(getComputedStyle(el).scrollMarginTop || "0")));
          if (Math.abs(window.scrollY - atas) > 1) window.scrollTo({ top: atas });
        }
        if (performance.now() - mulai < LAMA_MS) frame = requestAnimationFrame(pasang);
        else berhenti();
      };
      frame = requestAnimationFrame(pasang);
    };
    gulir();
    window.addEventListener("hashchange", gulir);
    return () => {
      berhenti();
      window.removeEventListener("hashchange", gulir);
    };
  }, [kunci]);

  return null;
}
