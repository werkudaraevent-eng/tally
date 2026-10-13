"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { m, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "framer-motion";

/**
 * Gerak halus Gathering Horizon (rancangan V5, PR 3): garis perjalanan emas
 * di talang kiri dan muncul-pelan saat bagian masuk layar.
 *
 * Batas dari brief Hanung: tidak ada pinning panjang, topeng elips, teater
 * gulir, angka hari raksasa, atau kartu berperspektif. Semua gerak mati saat
 * sistem meminta gerak dikurangi (garisnya tampil penuh, diam).
 */

const EASE = [0.2, 0, 0, 1] as const;

type Keadaan = "awal" | "sembunyi" | "tampil";

/**
 * Isi yang naik-pudar sekali saat masuk layar. HTML server tetap terlihat
 * (initial={false}): isi baru disembunyikan setelah terpasang, dan hanya bila
 * masih di bawah layar, jadi tanpa JavaScript atau saat dimuat di tengah
 * halaman tidak ada yang hilang atau berkedip.
 */
export function Muncul({
  children,
  className,
  style,
  jeda = 0,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  jeda?: number;
  as?: "div" | "li";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const kurangi = useReducedMotion();
  const [keadaan, setKeadaan] = useState<Keadaan>("awal");

  useEffect(() => {
    const el = ref.current;
    if (!el || kurangi || typeof IntersectionObserver === "undefined") return;
    let pertama = true;
    const pengamat = new IntersectionObserver(
      ([entri]) => {
        if (pertama) {
          pertama = false;
          // Sudah terlihat (atau sudah lewat) saat dimuat: biarkan apa adanya.
          if (entri.isIntersecting || entri.boundingClientRect.top < 0) {
            pengamat.disconnect();
            return;
          }
          setKeadaan("sembunyi");
          return;
        }
        if (entri.isIntersecting) {
          setKeadaan("tampil");
          pengamat.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    pengamat.observe(el);
    return () => pengamat.disconnect();
  }, [kurangi]);

  const Komponen = as === "li" ? m.li : m.div;
  return (
    <Komponen
      ref={(node: HTMLElement | null) => {
        ref.current = node;
      }}
      className={className}
      style={style}
      initial={false}
      animate={keadaan === "sembunyi" ? { opacity: 0, y: 16 } : { opacity: 1, y: 0 }}
      transition={keadaan === "tampil" ? { duration: 0.45, delay: jeda, ease: EASE } : { duration: 0 }}
    >
      {children}
    </Komponen>
  );
}

type Simpul = { y: number };

/**
 * Garis perjalanan: satu garis tipis di talang kiri (layar lebar saja), dari
 * judul bagian pertama sampai bagian terakhir. Isian emas mengikuti gulir
 * sampai tengah layar; titik tiap bagian menyala saat dilewati. Posisinya
 * diukur dari bagian yang benar-benar dirender (anak langsung yang tampil), diukur ulang
 * saat ukurannya berubah.
 */
export function JalurHorizon({ children }: { children: ReactNode }) {
  const wadah = useRef<HTMLDivElement | null>(null);
  const kurangi = useReducedMotion();
  const [ukur, setUkur] = useState<{ tinggi: number; simpul: Simpul[] }>({ tinggi: 0, simpul: [] });
  const [aktif, setAktif] = useState(-1);
  const { scrollYProgress } = useScroll({ target: wadah, offset: ["start 50%", "end 50%"] });

  useEffect(() => {
    const el = wadah.current;
    if (!el) return;
    // offsetTop, bukan getBoundingClientRect: tidak ikut geseran Muncul (y: 16).
    const atasDari = (node: HTMLElement) => {
      let y = 0;
      let kini: HTMLElement | null = node;
      while (kini && kini !== el) {
        y += kini.offsetTop;
        kini = kini.offsetParent as HTMLElement | null;
      }
      return y;
    };
    const hitung = () => {
      const bagian = Array.from(el.querySelectorAll<HTMLElement>(":scope > :not([data-garis])")).filter((node) => node.offsetHeight > 40);
      // Titik sejajar baris pertama judul bagian (h2 pertama yang tampil);
      // bagian tanpa judul memakai tepi atasnya ditambah 64px.
      const simpul = bagian.map((node) => {
        const judul = Array.from(node.querySelectorAll<HTMLElement>("h2")).find((h) => h.offsetHeight > 0);
        if (!judul) return { y: atasDari(node) + 64 };
        const baris = parseFloat(getComputedStyle(judul).lineHeight) || 40;
        return { y: Math.round(atasDari(judul) + Math.min(baris, judul.offsetHeight) / 2) };
      });
      setUkur({ tinggi: el.offsetHeight, simpul });
    };
    hitung();
    const pengamat = new ResizeObserver(hitung);
    pengamat.observe(el);
    return () => pengamat.disconnect();
  }, []);

  const awal = ukur.simpul[0]?.y ?? 0;
  const akhir = ukur.simpul[ukur.simpul.length - 1]?.y ?? 0;
  const panjang = Math.max(akhir - awal, 0);
  const isi = useTransform(scrollYProgress, (p) => Math.min(Math.max(p * ukur.tinggi - awal, 0), panjang));

  useMotionValueEvent(isi, "change", (nilai) => {
    const ujung = awal + nilai;
    let indeks = -1;
    ukur.simpul.forEach((s, i) => {
      if (s.y <= ujung + 1) indeks = i;
    });
    if (indeks !== aktif) setAktif(indeks);
  });

  const tampilGaris = ukur.simpul.length > 1 && panjang > 0;
  return (
    <div ref={wadah} className="relative">
      {children}
      {tampilGaris ? (
        <div
          aria-hidden
          data-garis
          className="pointer-events-none absolute inset-y-0 hidden w-[10px] lg:block"
          style={{ left: "calc(max(0px, (100% - 1440px) / 2) + 27px)" }}
        >
          <span className="absolute left-[4px] w-[2px] rounded-full bg-[#7F8CA6]/40" style={{ top: awal, height: panjang }} />
          <m.span className="absolute left-[4px] w-[2px] rounded-full bg-[var(--hz-emas)]" style={{ top: awal, height: kurangi ? panjang : isi }} />
          {ukur.simpul.map((s, i) => {
            const nyala = kurangi || i <= aktif;
            return (
              <span
                key={i}
                className={`absolute left-0 size-[10px] rounded-full border-2 transition-colors duration-300 ${nyala ? "border-[var(--hz-emas)] bg-[var(--hz-emas)]" : "border-[#7F8CA6]/60 bg-transparent"}`}
                style={{ top: s.y - 5 }}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
