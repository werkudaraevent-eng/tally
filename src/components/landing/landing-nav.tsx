"use client";

import { m } from "framer-motion";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { standard } from "@/lib/m3/motion";

/**
 * Kepala halaman acara: nama acara, jangkar bagian, dan tombol daftar.
 *
 * Selalu terlihat dan menempel di atas, bukan muncul setelah hero lewat. Hero
 * sekarang bisa berupa KV berwarna asli, dan nama acara di hero berdiri di atas
 * gambar; bilah yang tetap di atasnya memberi halaman tepi atas yang tenang dan
 * membuat tombol daftar terjangkau dari posisi gulir mana pun.
 */
export function LandingNav({
  eventName,
  ctaLabel,
  daftarUrl,
  registrationOpen,
  memberLink = null,
  sections,
}: {
  eventName: string;
  ctaLabel: string;
  daftarUrl: string;
  registrationOpen: boolean;
  /** Tautan area peserta; null bila area peserta dimatikan. */
  memberLink?: { href: string; label: string } | null;
  sections: { id: string; label: string }[];
}) {
  const [aktif, setAktif] = useState<string | null>(null);

  useEffect(() => {
    // Bagian yang sedang dibaca ditandai di nav. Ambang atas -45% memilih
    // bagian yang menempati paruh atas layar, jadi penandanya berpindah saat
    // judul bagian berikutnya sampai di sana.
    const elemen = sections
      .map((section) => document.getElementById(section.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elemen.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const masuk = entries.filter((entry) => entry.isIntersecting);
        if (masuk.length === 0) return;
        // Yang paling atas di antara yang terlihat: urutan entri tidak dijamin
        // mengikuti urutan halaman.
        const teratas = masuk.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b,
        );
        setAktif(teratas.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    elemen.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="Navigasi acara"
      className="sticky top-0 z-30 border-b border-[var(--reg-outline-variant)]"
      style={{ backgroundColor: "color-mix(in srgb, var(--reg-surface) 94%, transparent)", backdropFilter: "blur(12px)" }}
    >
      {/* Lebar dan pinggirnya sama dengan grid isi halaman, jadi nama acara di
          sini dan judul di hero berdiri di satu tepi kiri. */}
      <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center gap-6 px-5 sm:px-8 lg:min-h-[72px] lg:px-10">
        <a
          href="#"
          className="flex min-h-11 min-w-0 flex-1 items-center text-title-large font-semibold text-[var(--reg-on-surface)] [font-family:var(--landing-heading)] xl:max-w-[20rem] xl:flex-none"
        >
          <span className="truncate">{eventName}</span>
        </a>

        {/* Jangkar disembunyikan di bawah xl: delapan tautan di layar sempit
            menjadi baris yang terlipat atau harus digulir menyamping. */}
        <ul className="hidden flex-1 items-center justify-end gap-1 xl:flex">
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={aktif === section.id ? "true" : undefined}
                className={`m3-state relative inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-label-large font-medium transition-colors ${
                  aktif === section.id
                    ? "text-[var(--reg-on-surface)]"
                    : "text-[var(--reg-on-surface-variant)] hover:text-[var(--reg-on-surface)]"
                }`}
              >
                {/* Garis penanda MELUNCUR ke bagian berikutnya (`layoutId`).
                    `m`, bukan `motion`: mesin animasinya dimuat malas oleh
                    MotionProvider. */}
                {aktif === section.id ? (
                  <m.span
                    layoutId="landing-nav-active"
                    aria-hidden
                    className="absolute inset-x-3 bottom-1.5 h-0.5 rounded-full bg-[var(--reg-primary)]"
                    transition={standard.spatial.fast}
                  />
                ) : null}
                {section.label}
              </a>
            </li>
          ))}
        </ul>

        {memberLink ? (
          <Link
            href={memberLink.href}
            className="m3-state inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-label-large font-semibold text-[var(--reg-on-surface)]"
          >
            {memberLink.label}
          </Link>
        ) : null}

        {registrationOpen ? (
          <Link
            href={daftarUrl}
            className="m3-state inline-flex min-h-11 shrink-0 items-center rounded-md bg-[var(--reg-primary)] px-5 text-label-large font-semibold text-[var(--reg-on-primary)]"
            style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}
          >
            {ctaLabel}
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
