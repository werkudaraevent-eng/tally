"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

/**
 * Navigasi jangkar landing page.
 *
 * Tidak terlihat saat halaman di posisi teratas — hero sudah membawa nama acara
 * dan tombol daftarnya, dan bilah kedua di atasnya hanya menutupi gambar.
 * Muncul setelah hero tergulir lewat, membawa nama acara dan tombol daftar
 * supaya keduanya tetap terjangkau di halaman yang panjang.
 *
 * Pola yang sama dipakai halaman acara Apple dan Google I/O, dan alasannya
 * praktis: pada halaman satu-gulungan, satu-satunya cara kembali ke aksi utama
 * tanpa nav ini adalah menggulir balik ke atas.
 */
export function LandingNav({
  eventName,
  ctaLabel,
  daftarUrl,
  registrationOpen,
  sections,
}: {
  eventName: string;
  ctaLabel: string;
  daftarUrl: string;
  registrationOpen: boolean;
  sections: { id: string; label: string }[];
}) {
  const [terlihat, setTerlihat] = useState(false);
  const [aktif, setAktif] = useState<string | null>(null);

  useEffect(() => {
    // Penanda ditaruh di 70vh, bukan pendengar scroll. Observer hanya terbangun
    // dua kali; pendengar scroll berjalan pada setiap frame sepanjang halaman
    // digulir, dan ini halaman yang memang dibuat untuk digulir jauh.
    const penanda = document.createElement("div");
    penanda.style.cssText = "position:absolute;top:70vh;height:1px;width:1px;pointer-events:none";
    document.body.appendChild(penanda);
    const observer = new IntersectionObserver(([entry]) => setTerlihat(!entry.isIntersecting));
    observer.observe(penanda);
    return () => {
      observer.disconnect();
      penanda.remove();
    };
  }, []);

  useEffect(() => {
    // Bagian yang sedang dibaca ditandai di nav. Tanpa penanda ini, enam tautan
    // yang tampilannya sama persis tidak memberi tahu tamu ia sedang di mana —
    // dan pada halaman satu-gulungan yang panjang, itu satu-satunya petunjuk
    // posisi yang tersisa setelah hero lewat.
    //
    // Ambang atas -45% memilih bagian yang menempati paruh atas layar, jadi
    // penandanya berpindah saat judul bagian berikutnya sampai di sana, bukan
    // saat piksel pertamanya baru muncul dari tepi bawah.
    const elemen = sections
      .map((section) => document.getElementById(section.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elemen.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const masuk = entries.filter((entry) => entry.isIntersecting);
        if (masuk.length === 0) return;
        // Yang paling atas di antara yang terlihat, bukan yang terakhir memicu:
        // menggulir ke atas melewati dua bagian sekaligus memicu keduanya, dan
        // urutan entri tidak dijamin mengikuti urutan halaman.
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
      className={`fixed inset-x-0 top-0 z-30 border-b transition-all duration-300 ease-standard ${
        terlihat
          ? "translate-y-0 border-[var(--reg-outline-variant)] opacity-100"
          : "-translate-y-full border-transparent opacity-0"
      }`}
      style={{ backgroundColor: "color-mix(in srgb, var(--reg-surface) 92%, transparent)", backdropFilter: "blur(12px)" }}
      // Disembunyikan dari papan ketik dan pembaca layar selama ia belum
      // terlihat. Tanpa ini, Tab dari hero melompat ke tautan yang sedang
      // berada di luar layar.
      inert={!terlihat}
    >
      {/* Lebar dan pinggirnya sama persis dengan grid isi halaman
          (`max-w-[1440px]`, px 20/32/40). Bilah yang lebih sempit dari isinya
          membuat nama acara di nav dan judul di hero berdiri di dua tepi kiri
          yang berbeda — persis keluhan "tiap halaman punya grid sendiri" yang
          sudah diselesaikan di layar admin. */}
      <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center gap-6 px-5 sm:px-8 lg:px-10">
        <p className="min-w-0 flex-1 truncate text-title-medium font-semibold text-[var(--reg-on-surface)]">{eventName}</p>

        {/* Tautan bagian disembunyikan di ponsel. Enam jangkar di layar 375px
            menjadi baris yang harus digulir menyamping, dan halaman ini sudah
            digulir ke bawah — dua arah gulir di satu layar membuat orang
            kehilangan tempatnya. */}
        <ul className="hidden items-center gap-1 lg:flex">
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={aktif === section.id ? "true" : undefined}
                className={`m3-state inline-flex min-h-10 items-center rounded-full px-4 text-label-large font-semibold transition-colors ${
                  aktif === section.id
                    ? "bg-[var(--reg-primary-container)] text-[var(--reg-on-primary-container)]"
                    : "text-[var(--reg-on-surface-variant)] hover:text-[var(--reg-primary)]"
                }`}
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>

        {registrationOpen ? (
          <Link
            href={daftarUrl}
            className="m3-state inline-flex min-h-11 shrink-0 items-center rounded-full bg-[var(--reg-primary)] px-5 text-label-large font-semibold text-[var(--reg-on-primary)]"
            style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}
          >
            {ctaLabel}
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
