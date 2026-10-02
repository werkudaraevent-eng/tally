"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { List, X } from "@phosphor-icons/react";
import type { LandingNavWidth } from "@/lib/domain";
import { LANDING_LANG_LABELS, LANDING_UI, type LandingLang } from "@/lib/landing-i18n";

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
 * Jangkar bagian tampil sebaris di `xl` ke atas. Di bawahnya tombol Menu
 * membuka daftar tarik-turun tepat di bawah bilah (bukan panel dari samping):
 * halaman ponsel ~7.000px butuh cara melompat ke Susunan acara dan Lokasi.
 * Masuk dan Daftar selalu ada.
 *
 * `logoOnDark`: bilah bening di atas KV, jadi logo berwarna diputihkan
 * (filter) sampai hero lewat. Logo satu warna seperti ILO tetap utuh bentuknya.
 *
 * `langSwitch`: pilihan bahasa "ID | EN" sebelum Masuk, hanya bila versi English
 * dinyalakan admin. Di ponsel tetap di bilah, tidak di dalam menu: tamu asing
 * harus menemukannya tanpa membuka apa pun. Pindah bahasa mempertahankan bagian yang sedang dibaca (lihat
 * pindahBahasa).
 */

/** Kunci sessionStorage posisi baca saat pindah bahasa. */
const KUNCI_POSISI = "tally:landing-lang-pos";

/**
 * Bagian yang sedang dibaca: `section[id]` terakhir yang tepinya sudah lewat di
 * bawah bilah atas, dan jarak gulir di dalamnya.
 */
function posisiBaca(navH: number): { id: string | null; offset: number } {
  let id: string | null = null;
  let offset = window.scrollY;
  document.querySelectorAll<HTMLElement>("main[data-halaman-publik] section[id]").forEach((el) => {
    const atas = el.getBoundingClientRect().top - navH;
    if (atas <= 1) {
      id = el.id;
      offset = -atas;
    }
  });
  return { id, offset };
}

/**
 * Pindah ke versi bahasa lain di bagian yang sama. Kedua versi punya bagian dan
 * id yang sama, tetapi tingginya berbeda karena panjang teksnya berbeda, jadi
 * yang dibawa adalah jangkar bagian (`#agenda`) plus jarak di dalamnya, bukan
 * angka scrollY. Tanpa JavaScript tautan biasa tetap bekerja (ke atas halaman).
 */
function pindahBahasa(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  const navH = document.querySelector<HTMLElement>("[data-landing-nav]")?.offsetHeight ?? 64;
  const posisi = posisiBaca(navH);
  try {
    sessionStorage.setItem(KUNCI_POSISI, JSON.stringify({ ...posisi, waktu: Date.now() }));
  } catch {
    // Penyimpanan diblokir: tetap pindah, dengan jangkar saja.
  }
  window.location.assign(posisi.id ? `${href}#${posisi.id}` : href);
}

/**
 * Dipanggil sekali saat halaman dimuat: kembalikan posisi baca dari pindahBahasa.
 *
 * Posisi dipasang ulang tiap frame selama ~1 detik, karena tinggi bagian di atas
 * masih bisa bergeser sesaat setelah hidrasi (huruf, gambar, tab). Berhenti
 * begitu tamu menggulir sendiri.
 */
function pulihkanPosisi() {
  let simpan: { id: string | null; offset: number; waktu: number } | null = null;
  try {
    const mentah = sessionStorage.getItem(KUNCI_POSISI);
    sessionStorage.removeItem(KUNCI_POSISI);
    simpan = mentah ? JSON.parse(mentah) : null;
  } catch {
    return;
  }
  // Hanya pindah bahasa yang baru saja terjadi; posisi lama tidak ikut ke kunjungan berikutnya.
  if (!simpan || Date.now() - simpan.waktu > 15_000) return;
  const { id, offset } = simpan;
  const akar = document.documentElement;
  const gulirAwal = akar.style.scrollBehavior;
  // Lompatan jangkar bawaan peramban ikut `scroll-behavior: smooth`; dimatikan selama memulihkan.
  akar.style.scrollBehavior = "auto";
  const mulai = performance.now();
  let berhenti = false;
  const hentikan = () => {
    berhenti = true;
  };
  const sentuhan = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
  sentuhan.forEach((jenis) => window.addEventListener(jenis, hentikan, { once: true, passive: true }));
  const pasang = () => {
    if (!berhenti) {
      const navH = document.querySelector<HTMLElement>("[data-landing-nav]")?.offsetHeight ?? 64;
      const el = id ? document.getElementById(id) : null;
      const tujuan = el ? el.getBoundingClientRect().top + window.scrollY - navH + offset : offset;
      window.scrollTo({ top: Math.max(0, tujuan), behavior: "instant" });
    }
    if (!berhenti && performance.now() - mulai < 1000) {
      requestAnimationFrame(pasang);
      return;
    }
    sentuhan.forEach((jenis) => window.removeEventListener(jenis, hentikan));
    akar.style.scrollBehavior = gulirAwal;
  };
  pasang();
}

export function LandingNavModern({
  eventName,
  daftarUrl,
  registrationOpen,
  memberLink = null,
  sections,
  width = "full",
  logoUrl = null,
  logoOnDark = false,
  lang = "id",
  langSwitch = null,
}: {
  eventName: string;
  daftarUrl: string;
  registrationOpen: boolean;
  memberLink?: { href: string; label: string } | null;
  sections: { id: string; label: string }[];
  width?: LandingNavWidth;
  logoUrl?: string | null;
  logoOnDark?: boolean;
  /** Bahasa halaman ini. */
  lang?: LandingLang;
  /** Alamat versi bahasa lain dan bahasanya; null = tombol bahasa tidak tampil. */
  langSwitch?: { href: string; lang: LandingLang } | null;
}) {
  const t = LANDING_UI[lang];
  const [aktif, setAktif] = useState<string | null>(null);
  const [menuBuka, setMenuBuka] = useState(false);
  const menuId = useId();
  const navRef = useRef<HTMLElement>(null);
  const tombolMenuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuBuka) return;
    // Esc menutup dan mengembalikan fokus ke tombol Menu; ketukan di luar
    // bilah menutup tanpa memindahkan fokus.
    const tekan = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuBuka(false);
      tombolMenuRef.current?.focus();
    };
    const ketuk = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setMenuBuka(false);
    };
    document.addEventListener("keydown", tekan);
    document.addEventListener("pointerdown", ketuk);
    return () => {
      document.removeEventListener("keydown", tekan);
      document.removeEventListener("pointerdown", ketuk);
    };
  }, [menuBuka]);
  const [lewatHero, setLewatHero] = useState(false);

  useEffect(() => {
    if (langSwitch) pulihkanPosisi();
  }, [langSwitch]);

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
    "--nav-fill": lewatHero || menuBuka ? "var(--nav-bg-scrolled)" : "var(--nav-bg)",
    "--nav-text": lewatHero || menuBuka ? "var(--nav-ink-scrolled)" : "var(--nav-ink)",
    "--nav-on-text": lewatHero || menuBuka ? "var(--nav-on-ink-scrolled)" : "var(--nav-on-ink)",
    "--m3-state-color": "var(--nav-text)",
  } as CSSProperties;
  // Garis rambut di bawah bilah setelah hero lewat: bilah putih di atas isi
  // putih tanpa garis terlihat seperti teks yang mengambang.
  const bilah = `bg-[var(--nav-fill)] text-[var(--nav-text)] transition-[background-color,box-shadow] duration-200 ${
    lewatHero ? "shadow-[0_1px_0_color-mix(in_srgb,var(--nav-text)_12%,transparent)]" : ""
  }`;
  const selebarIsi = width === "content";

  return (
    <nav
      aria-label={t.navAria}
      data-landing-nav
      ref={navRef}
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
            <img
              src={logoUrl}
              alt={eventName}
              className="block max-h-[calc(var(--nav-h)-24px)] w-auto max-w-[min(240px,50vw,100%)] object-contain object-left transition-[filter] duration-200"
              style={logoOnDark && !lewatHero && !menuBuka ? { filter: "brightness(0) invert(1)" } : undefined}
            />
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
                // Tebal sama untuk semua tautan, bagian aktif ditandai garis
                // bawah: tautan yang menebal menggeser tetangganya saat digulir.
                className="m3-state relative inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-[15px] font-medium"
              >
                {section.label}
                <span
                  aria-hidden
                  className={`absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-current transition-transform duration-200 ${
                    aktif === section.id ? "scale-x-100" : "scale-x-0"
                  }`}
                />
              </a>
            </li>
          ))}
        </ul>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          {langSwitch ? (
            // Dua pilihan yang selalu tampil (pola segmented button M3): bahasa
            // yang aktif terlihat tanpa menebak. Kode pendek, karena "ID" di
            // samping "EN" jelas terbaca sebagai bahasa; nama lengkapnya untuk
            // pembaca layar. Garis tipis, bukan tombol isi: ini pengaturan
            // tampilan, tidak boleh bersaing dengan Masuk dan Daftar.
            <div
              role="group"
              aria-label={t.languageGroup}
              className="inline-flex h-10 shrink-0 items-stretch overflow-hidden rounded-full border border-[color-mix(in_srgb,var(--nav-text)_45%,transparent)] text-label-large"
            >
              {(["id", "en"] as const).map((kode, i) => {
                const label = LANDING_LANG_LABELS[kode];
                const garis = i > 0 ? "border-l border-[color-mix(in_srgb,var(--nav-text)_45%,transparent)]" : "";
                const isi = (
                  <>
                    <span aria-hidden>{label.short}</span>
                    <span className="sr-only">{label.name}</span>
                  </>
                );
                return kode === lang ? (
                  <span
                    key={kode}
                    aria-current="true"
                    lang={label.htmlLang}
                    className={`inline-flex min-w-11 items-center justify-center bg-[color-mix(in_srgb,var(--nav-text)_18%,transparent)] px-2.5 font-bold sm:min-w-12 sm:px-3 ${garis}`}
                  >
                    {isi}
                  </span>
                ) : (
                  <a
                    key={kode}
                    href={langSwitch.href}
                    hrefLang={label.htmlLang}
                    lang={label.htmlLang}
                    onClick={(event) => pindahBahasa(event, langSwitch.href)}
                    className={`m3-state inline-flex min-w-11 items-center justify-center px-2.5 font-medium sm:min-w-12 sm:px-3 opacity-85 hover:opacity-100 ${garis}`}
                  >
                    {isi}
                  </a>
                );
              })}
            </div>
          ) : null}
          {memberLink ? (
            <Link
              href={memberLink.href}
              // Tombol bergaris kecil, bukan teks: tanpa bingkai "Masuk" terbaca
              // sebagai tautan menu ketujuh.
              className="m3-state inline-flex min-h-10 items-center rounded-md border border-current px-4 text-label-large font-semibold"
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
              {t.register}
            </Link>
          ) : null}
          {sections.length > 0 ? (
            <button
              ref={tombolMenuRef}
              type="button"
              aria-expanded={menuBuka}
              aria-controls={menuId}
              aria-label={menuBuka ? t.closeMenu : t.openMenu}
              onClick={() => setMenuBuka((buka) => !buka)}
              className="m3-state -mr-2 inline-flex size-11 items-center justify-center rounded-md xl:hidden"
            >
              {menuBuka ? <X size={22} aria-hidden /> : <List size={22} aria-hidden />}
            </button>
          ) : null}
        </div>
      </div>

      {menuBuka ? (
        <ul
          id={menuId}
          className="absolute inset-x-0 top-full flex flex-col border-t border-[color-mix(in_srgb,var(--nav-text)_12%,transparent)] bg-[var(--nav-fill)] px-3 pb-3 pt-2 text-[var(--nav-text)] shadow-[0_8px_16px_rgb(0_0_0/0.08)] backdrop-blur-md xl:hidden"
        >
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                onClick={() => setMenuBuka(false)}
                aria-current={aktif === section.id ? "true" : undefined}
                className={`m3-state flex min-h-12 items-center rounded-md px-4 text-[17px] ${aktif === section.id ? "font-semibold" : "font-medium"}`}
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </nav>
  );
}
