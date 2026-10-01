"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Kepala halaman acara tata letak Modern.
 *
 * Bilah gelap tembus pandang yang menempel di atas dan berdiri di atas KV hero
 * (hero ditarik ke bawahnya lewat margin negatif). Warnanya netral gelap, bukan
 * warna tema: bilah ini harus tetap terbaca di atas KV mana pun DAN di atas
 * permukaan terang setelah hero lewat. 72% hitam di atas latar putih masih
 * menyisakan teks putih di atas 7:1.
 *
 * Jangkar bagian hanya di `xl` ke atas (DESIGN.md "Halaman acara"): lima tautan
 * di layar sempit menjadi baris yang terlipat. Masuk dan Daftar selalu ada.
 */
export function LandingNavModern({
  eventName,
  daftarUrl,
  registrationOpen,
  memberLink = null,
  sections,
}: {
  eventName: string;
  daftarUrl: string;
  registrationOpen: boolean;
  memberLink?: { href: string; label: string } | null;
  sections: { id: string; label: string }[];
}) {
  const [aktif, setAktif] = useState<string | null>(null);

  useEffect(() => {
    // Sama dengan nav Editorial: bagian yang menempati paruh atas layar ditandai.
    const elemen = sections
      .map((section) => document.getElementById(section.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elemen.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const masuk = entries.filter((entry) => entry.isIntersecting);
        if (masuk.length === 0) return;
        const teratas = masuk.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b));
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
      className="sticky top-0 z-30 text-white"
      style={{ backgroundColor: "rgb(18 18 18 / 0.72)", backdropFilter: "blur(12px)" }}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-6 px-5 sm:px-8 lg:h-[88px] lg:px-10 xl:px-20">
        <a
          href="#"
          className="flex min-h-11 min-w-0 flex-1 items-center text-title-large font-semibold [font-family:var(--landing-heading)]"
        >
          <span className="truncate">{eventName}</span>
        </a>

        <ul className="hidden items-center gap-1 xl:flex">
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={aktif === section.id ? "true" : undefined}
                className={`m3-state inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-body-large transition-colors ${
                  aktif === section.id ? "font-semibold text-white" : "text-white/85 hover:text-white"
                }`}
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          {memberLink ? (
            <Link
              href={memberLink.href}
              className="m3-state inline-flex min-h-11 items-center rounded-md px-3 text-body-large text-white/85 hover:text-white"
            >
              {memberLink.label}
            </Link>
          ) : null}
          {registrationOpen ? (
            <Link
              href={daftarUrl}
              className="m3-state inline-flex min-h-11 items-center rounded-md bg-white px-4 text-label-large font-semibold text-black"
            >
              {/* Label pendek di nav, sesuai rancangan. Teks tombol pilihan admin
                  dipakai di hero dan banner ajakan; dua tombol berlabel sama
                  di layar yang sama terbaca seperti desakan. */}
              Daftar
            </Link>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
