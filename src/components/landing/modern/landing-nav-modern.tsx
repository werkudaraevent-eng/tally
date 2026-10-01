"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import type { LandingNavWidth } from "@/lib/domain";

/**
 * Kepala halaman acara tata letak Modern.
 *
 * Bilah tembus pandang yang menempel di atas dan berdiri di atas KV hero (hero
 * ditarik ke bawahnya lewat margin negatif setinggi `--nav-h`). Warna,
 * transparansi, lebar, dan tinggi diatur admin di CMS; variabel CSS-nya dari
 * modernNavStyle(), dipasang di <main> halaman. Bawaannya hitam 72%, selebar layar, 64px.
 *
 * Setelah hero lewat, bilah memakai `--nav-bg-scrolled` (paling sedikit 90%
 * pekat) supaya teksnya tetap terbaca di atas permukaan putih.
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
  width = "full",
  logoUrl = null,
}: {
  eventName: string;
  daftarUrl: string;
  registrationOpen: boolean;
  memberLink?: { href: string; label: string } | null;
  sections: { id: string; label: string }[];
  width?: LandingNavWidth;
  logoUrl?: string | null;
}) {
  const [aktif, setAktif] = useState<string | null>(null);
  const [lewatHero, setLewatHero] = useState(false);

  useEffect(() => {
    const hero = document.querySelector<HTMLElement>("[data-landing-hero]");
    if (!hero) return;
    const periksa = () => {
      const nav = document.querySelector<HTMLElement>("[data-landing-nav]");
      setLewatHero(hero.getBoundingClientRect().bottom <= (nav?.offsetHeight ?? 64));
    };
    periksa();
    window.addEventListener("scroll", periksa, { passive: true });
    window.addEventListener("resize", periksa);
    return () => {
      window.removeEventListener("scroll", periksa);
      window.removeEventListener("resize", periksa);
    };
  }, []);

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

  const isi = {
    "--nav-fill": lewatHero ? "var(--nav-bg-scrolled)" : "var(--nav-bg)",
    "--nav-text": lewatHero ? "var(--nav-ink-scrolled)" : "var(--nav-ink)",
    "--nav-on-text": lewatHero ? "var(--nav-on-ink-scrolled)" : "var(--nav-on-ink)",
    "--m3-state-color": "var(--nav-text)",
  } as CSSProperties;
  const bilah = "bg-[var(--nav-fill)] text-[var(--nav-text)] transition-colors duration-200";
  const selebarIsi = width === "content";

  return (
    <nav
      aria-label="Navigasi acara"
      data-landing-nav
      className={`sticky top-0 z-30 ${selebarIsi ? "" : bilah}`}
      style={{ ...isi, ...(selebarIsi ? {} : { backdropFilter: lewatHero ? "blur(12px)" : "var(--nav-blur)" }) }}
    >
      <div
        className={`mx-auto flex h-[var(--nav-h)] w-full max-w-[1440px] items-center gap-6 ${
          // Selebar isi: bilahnya sendiri yang mengikuti kolom isi halaman, jadi
          // jarak tepinya pindah ke luar dan bilah mendapat sudut membulat.
          selebarIsi
            ? `${bilah} rounded-b-lg px-5 sm:px-8 lg:max-w-[calc(1440px-80px)] lg:px-6 xl:max-w-[calc(1440px-160px)]`
            : "px-5 sm:px-8 lg:px-10 xl:px-20"
        }`}
        style={selebarIsi ? { backdropFilter: lewatHero ? "blur(12px)" : "var(--nav-blur)" } : undefined}
      >
        <a
          href="#"
          className="flex min-h-11 min-w-0 flex-1 items-center text-title-large font-semibold [font-family:var(--landing-heading)]"
        >
          {logoUrl ? (
            // Logo menggantikan nama; nama tetap dibacakan pembaca layar lewat alt.
            // Tingginya mengikuti bilah (sisa 12px atas-bawah), lebarnya dibatasi
            // supaya logo melebar tidak mendorong Masuk/Daftar.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={eventName} className="block max-h-[calc(var(--nav-h)-24px)] w-auto max-w-[min(240px,50vw)] object-contain object-left" />
          ) : (
            <span className="truncate">{eventName}</span>
          )}
        </a>

        <ul className="hidden items-center gap-1 xl:flex">
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={aktif === section.id ? "true" : undefined}
                className={`m3-state inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-body-large transition-colors ${
                  aktif === section.id ? "font-semibold" : "opacity-85 hover:opacity-100"
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
              className="m3-state inline-flex min-h-11 items-center rounded-md px-3 text-body-large opacity-85 hover:opacity-100"
            >
              {memberLink.label}
            </Link>
          ) : null}
          {registrationOpen ? (
            <Link
              href={daftarUrl}
              className="m3-state inline-flex min-h-11 items-center rounded-md bg-[var(--nav-text)] px-4 text-label-large font-semibold text-[var(--nav-on-text)]"
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
