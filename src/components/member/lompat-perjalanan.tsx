"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Baris chip "lompat ke" di atas halaman Perjalanan Horizon: satu chip per
 * kartu yang memang dimiliki peserta (Hotel, Bus, Kereta, Bagasi, Rute), urutan
 * sama dengan kartunya. Pola baris bagian yang menempel di halaman reservasi
 * Booking.com dan listing Airbnb: halaman empat layar tetap satu ketukan ke
 * bagian mana pun.
 *
 * Menempel tepat di bawah bilah atas portal (tingginya diukur, karena berbeda
 * di ponsel, desktop, dan layar pendek). Mengetuk chip hanya menggulir: alamat
 * dan riwayat browser tidak berubah, jadi Back tetap keluar dari halaman.
 */
export function LompatPerjalanan({ aria, bagian, latar }: { aria: string; bagian: Array<{ id: string; label: string }>; latar: string }) {
  const bilah = useRef<HTMLElement>(null);
  const [atas, setAtas] = useState(0);
  const [aktif, setAktif] = useState(bagian[0]?.id ?? "");

  useEffect(() => {
    const kepala = document.querySelector("header");
    const ukur = () => setAtas(kepala ? Math.round(kepala.getBoundingClientRect().height) : 0);
    ukur();
    const pengamat = kepala ? new ResizeObserver(ukur) : null;
    if (kepala) pengamat?.observe(kepala);
    return () => pengamat?.disconnect();
  }, []);

  // Chip aktif = bagian terakhir yang kepalanya sudah melewati bawah bilah ini.
  useEffect(() => {
    let jadwal = 0;
    const hitung = () => {
      jadwal = 0;
      const batas = atas + (bilah.current?.offsetHeight ?? 0) + 16;
      let sekarang = bagian[0]?.id ?? "";
      for (const { id } of bagian) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= batas) sekarang = id;
      }
      // Di dasar halaman, bagian terakhir yang aktif walau kepalanya tidak sampai ke atas.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) sekarang = bagian[bagian.length - 1]?.id ?? sekarang;
      setAktif(sekarang);
    };
    const gulir = () => { if (!jadwal) jadwal = window.requestAnimationFrame(hitung); };
    hitung();
    window.addEventListener("scroll", gulir, { passive: true });
    window.addEventListener("resize", gulir);
    return () => {
      window.removeEventListener("scroll", gulir);
      window.removeEventListener("resize", gulir);
      if (jadwal) window.cancelAnimationFrame(jadwal);
    };
  }, [atas, bagian]);

  // Chip aktif tetap terlihat saat barisnya lebih lebar dari layar.
  useEffect(() => {
    bilah.current?.querySelector(`[data-bagian="${aktif}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [aktif]);

  function lompat(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const jarak = atas + (bilah.current?.offsetHeight ?? 0) + 8;
    const kurangGerak = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - jarak, behavior: kurangGerak ? "auto" : "smooth" });
    setAktif(id);
  }

  return (
    <nav
      ref={bilah}
      aria-label={aria}
      className="sticky z-20 -mx-6 px-6 py-1 shadow-[0_1px_0_rgb(16_30_56/0.08)] md:-mx-16 md:px-16"
      style={{ top: atas, background: latar }}
    >
      <ul className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {bagian.map(({ id, label }) => {
          const on = id === aktif;
          return (
            <li key={id} className="shrink-0">
              {/* Target 48 px; chip yang terlihat 36 px. */}
              <a
                href={`#${id}`}
                data-bagian={id}
                aria-current={on ? "location" : undefined}
                onClick={(event) => { event.preventDefault(); lompat(id); }}
                className="group inline-flex h-12 items-center"
              >
                <span
                  className="inline-flex h-9 items-center rounded-full px-4 text-[14px] font-semibold leading-5"
                  style={on ? { background: "#101E38", color: "#FFFFFF" } : { background: "#FFFFFF", color: "#101E38", boxShadow: "inset 0 0 0 1px rgb(16 30 56 / 0.16)" }}
                >
                  {label}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
