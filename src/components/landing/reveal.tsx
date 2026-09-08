"use client";

import { animate } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { easing } from "@/lib/m3/motion";

/**
 * Bagian halaman acara yang naik-pudar saat pertama kali digulir masuk.
 *
 * Gerakannya milik CSS (`.reveal` di globals.css); komponen ini hanya
 * memasang kelas `reveal-in` begitu elemennya terlihat. Keadaan tersembunyi
 * diberlakukan lewat `@media (scripting: enabled)`, jadi tamu yang
 * JavaScript-nya gagal dimuat di jaringan venue tetap melihat seluruh isi
 * halaman — bukan bidang kosong yang menunggu pengamat yang tidak datang.
 *
 * Sekali saja. Bagian yang naik lagi setiap kali digulir balik adalah gerak
 * yang bersaing dengan pembacaan.
 */
export function Reveal({
  children,
  className,
  /** Jeda dalam milidetik, untuk mengurutkan kartu-kartu dalam satu grid. */
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Batas bawah ditarik 12% supaya bagian yang baru menyembul di tepi bawah
    // layar belum dianggap "terlihat" — naiknya baru terjadi ketika mata sudah
    // punya alasan berada di sana.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${shown ? "reveal-in" : ""} ${className ?? ""}`}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

/**
 * Angka sorotan yang MENGHITUNG NAIK saat terlihat.
 *
 * Nilainya teks bebas dari CMS ("500+", "12 pembicara", "3 hari"): angka
 * pertama yang ditemukan dihitung, imbuhan di depan dan belakangnya dibiarkan.
 * Teks yang tidak memuat angka dirender apa adanya.
 *
 * Nilai akhirnya yang dirender di server, sehingga tanpa JavaScript, dan bagi
 * yang meminta gerak dikurangi, angkanya sudah benar sejak awal. Selama
 * menghitung, teks ditulis langsung ke DOM — tidak ada render React per frame
 * untuk sesuatu yang berlangsung satu detik.
 */
export function CountUp({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const match = value.match(/^(\D*?)(\d[\d.,]*)(.*)$/);
    if (!match) return;
    const [, prefix, digits, suffix] = match;
    const target = Number(digits.replace(/[.,]/g, ""));
    if (!Number.isFinite(target) || target === 0) return;
    // Pemisah ribuan dipertahankan hanya bila admin memang menuliskannya:
    // "1.200" tetap berkelompok, "2026" tetap tahun.
    const grouped = /[.,]/.test(digits);
    const format = (n: number) => (grouped ? new Intl.NumberFormat("id-ID").format(n) : String(n));

    let controls: { stop: () => void } | null = null;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      controls = animate(0, target, {
        duration: 1.1,
        ease: easing.emphasizedDecelerate,
        onUpdate: (latest) => {
          element.textContent = `${prefix}${format(Math.round(latest))}${suffix}`;
        },
      });
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
      controls?.stop();
      element.textContent = value;
    };
  }, [value]);

  return <span ref={ref} className={className}>{value}</span>;
}
