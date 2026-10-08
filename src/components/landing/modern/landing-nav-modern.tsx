"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { List, X } from "@phosphor-icons/react";
import type { LandingNavWidth } from "@/lib/domain";
import { LANDING_LANG_LABELS, LANDING_UI, type LandingLang } from "@/lib/landing-i18n";
import { HtmlLang } from "@/components/html-lang";
import { LoncengPengumuman } from "@/components/member/lonceng-pengumuman";
import type { NavPeserta } from "@/lib/member/nav";

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
 * `homeHref` dan `backLink`: dipakai formulir pendaftaran, yang memakai bilah
 * yang sama supaya pindah dari halaman acara ke formulir tidak terasa berganti
 * situs. Logo kembali ke halaman acara, dan "Kembali ke halaman acara" tampil
 * sebagai tautan teks sebelum pilihan bahasa (disembunyikan di ponsel; kepala
 * formulir punya tautannya sendiri di sana).
 *
 * `langSwitch`: pilihan bahasa "ID | EN" sebelum Masuk, hanya bila versi English
 * dinyalakan admin. Di ponsel tetap di bilah, tidak di dalam menu: tamu asing
 * harus menemukannya tanpa membuka apa pun. Pindah bahasa mempertahankan bagian yang sedang dibaca (lihat
 * pindahBahasa).
 *
 * `peserta`: peserta sudah masuk. Masuk dan Daftar diganti DI TEMPAT YANG SAMA
 * oleh lonceng pengumuman dan tombol "Dashboard saya" (ukuran, radius, dan
 * warna tombol Daftar), seperti Luma yang tetap menampilkan halaman acara bagi
 * tamu yang login. Di ponsel tombol Dashboard pindah ke baris pertama Menu,
 * bersama Keluar, supaya bilah tetap muat logo, ID | EN, lonceng, dan Menu.
 *
 * `gathering`: gaya aplikasi preset Gathering (rancangan pen.dev Hanung). Tanpa
 * logo, kiri bilah adalah tanda dua huruf berwarna aksen, nama acara, dan baris
 * kecil di bawahnya; tautan bagian redup 14/600; Masuk menjadi tombol pil
 * terisi warna tombol Tema ("Masuk Portal"). Bilah selalu bergaris bawah tipis.
 *
 * `sectionBase`: awalan tautan bagian. Kosong di halaman acara (`#agenda`);
 * di Dashboard saya alamat halaman acara, jadi menu kembali ke bagiannya.
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
  homeHref = "#",
  backLink = null,
  peserta = null,
  sectionBase = "",
  dashboardAktif = false,
  gathering = null,
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
  /** Tujuan logo/nama di kiri. Bawaan "#" (atas halaman acara). */
  homeHref?: string;
  /** Tautan teks sebelum pilihan bahasa, mis. kembali ke halaman acara. */
  backLink?: { href: string; label: string } | null;
  /** Peserta yang sudah masuk; null = tampilkan Masuk dan Daftar. */
  peserta?: NavPeserta | null;
  sectionBase?: string;
  /** Halaman ini Dashboard saya: tombolnya ditandai halaman aktif. */
  dashboardAktif?: boolean;
  /** Gaya aplikasi preset Gathering; null = bilah Modern biasa. */
  gathering?: { tanda: string; sub: string | null } | null;
}) {
  const t = LANDING_UI[lang];
  const [aktif, setAktif] = useState<string | null>(null);
  const [menuBuka, setMenuBuka] = useState(false);
  const [loncengBuka, setLoncengBuka] = useState(false);
  // Satu lapisan terbuka pada satu waktu: menu dan panel lonceng menempati
  // tempat yang sama di bawah bilah.
  const ubahLonceng = useCallback((buka: boolean) => {
    setLoncengBuka(buka);
    if (buka) setMenuBuka(false);
  }, []);
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

  const alamatBahasaLain = langSwitch?.href;
  useEffect(() => {
    if (alamatBahasaLain) pulihkanPosisi();
  }, [alamatBahasaLain]);

  useEffect(() => {
    const hero = document.querySelector<HTMLElement>("[data-landing-hero]");
    if (!hero) return;
    const periksa = () => {
      const nav = document.querySelector<HTMLElement>("[data-landing-nav]");
      const lewat = hero.getBoundingClientRect().bottom <= (nav?.offsetHeight ?? 64);
      setLewatHero(lewat);
      // Kembali ke hero: tidak ada bagian yang sedang dibaca, jadi garis bawah menu hilang.
      if (hero.getBoundingClientRect().top >= 0) setAktif(null);
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
        if (masuk.length === 0) {
          // Bagian menu pertama turun di bawah tengah layar: yang dibaca hero
          // atau isi di atas bagian menu, jadi tidak ada menu yang ditandai.
          // Tanpa ini garis bawahnya baru hilang saat hero menyentuh atas layar.
          if (elemen[0].getBoundingClientRect().top > window.innerHeight / 2) setAktif(null);
          return;
        }
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
    lewatHero || gathering ? "shadow-[0_1px_0_color-mix(in_srgb,var(--nav-text)_12%,transparent)]" : ""
  }`;
  // Gathering: tombol pil terisi warna tombol Tema versi putih (--aksi-putih
  // dipasang di <main>), 13/700 seperti rancangan, area ketuk 48px.
  const PIL_GATHERING =
    "m3-state inline-flex min-h-12 items-center whitespace-nowrap rounded-full bg-[var(--aksi-putih)] px-4 text-[13px] sm:px-[26px] font-bold text-[var(--on-aksi-putih)]";
  const selebarIsi = width === "content";

  return (
    <nav
      aria-label={t.navAria}
      data-landing-nav
      ref={navRef}
      className={`sticky top-0 z-30 ${selebarIsi ? "" : bilah}`}
      style={{ ...isi, ...(selebarIsi ? {} : { backdropFilter: lewatHero ? "blur(12px)" : "var(--nav-blur)" }) }}
    >
      {/* Tata letak akar menulis <html lang="id">; halaman English membetulkannya. */}
      <HtmlLang lang={LANDING_LANG_LABELS[lang].htmlLang} />
      <div
        className={`mx-auto flex h-[var(--nav-h)] w-full max-w-[1440px] items-center gap-6 ${
          // Selebar isi: bilahnya sendiri yang mengikuti kolom isi halaman, jadi
          // jarak tepinya pindah ke luar dan bilah mendapat sudut membulat.
          selebarIsi
            ? `${bilah} rounded-b-lg px-5 sm:px-8 lg:max-w-[calc(1440px-80px)] lg:px-6 xl:max-w-[calc(1440px-160px)]`
            : "px-5 sm:px-8 lg:px-[var(--pinggir-lg,2.5rem)] xl:px-[var(--pinggir-xl,5rem)]"
        }`}
        style={selebarIsi ? { backdropFilter: lewatHero ? "blur(12px)" : "var(--nav-blur)" } : undefined}
      >
        <a
          href={homeHref}
          className="flex min-h-12 min-w-0 flex-1 items-center text-title-large font-semibold [font-family:var(--landing-heading)]"
        >
          {gathering && !logoUrl ? (
            <span className="flex min-w-0 items-center gap-3 [font-family:inherit]">
              <span
                aria-hidden
                className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--tanda-latar)] text-[15px] font-extrabold text-[var(--tanda-teks)]"
              >
                {gathering.tanda}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                {/* Ponsel: nama boleh dua baris, baris kecil disembunyikan, supaya Masuk Portal muat. */}
                <span className="line-clamp-2 text-[14px] font-extrabold leading-[1.2] sm:truncate sm:text-[15px]">{eventName}</span>
                {gathering.sub ? (
                  <span className="hidden truncate text-[12px] sm:block font-semibold uppercase leading-[1.2] tracking-[1.5px] text-[color-mix(in_srgb,var(--nav-text)_68%,transparent)]">
                    {gathering.sub}
                  </span>
                ) : null}
              </span>
            </span>
          ) : logoUrl ? (
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

        <ul className={`hidden items-center xl:flex ${gathering ? "gap-5" : "gap-1"}`}>
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`${sectionBase}#${section.id}`}
                aria-current={aktif === section.id ? "true" : undefined}
                // Tebal sama untuk semua tautan, bagian aktif ditandai garis
                // bawah: tautan yang menebal menggeser tetangganya saat digulir.
                className={
                  gathering
                    ? "m3-state relative inline-flex min-h-12 items-center whitespace-nowrap rounded-md px-2 text-[14px] font-semibold text-[color-mix(in_srgb,var(--nav-text)_72%,transparent)] aria-[current]:text-[var(--nav-text)]"
                    : "m3-state relative inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-[15px] font-medium"
                }
              >
                {section.label}
                <span
                  aria-hidden
                  className={`absolute ${gathering ? "inset-x-2" : "inset-x-3"} bottom-1 h-0.5 rounded-full bg-current transition-transform duration-200 ${
                    aktif === section.id ? "scale-x-100" : "scale-x-0"
                  }`}
                />
              </a>
            </li>
          ))}
        </ul>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          {backLink ? (
            <Link
              href={backLink.href}
              className="m3-state hidden min-h-11 items-center whitespace-nowrap rounded-md px-3 text-[15px] font-medium sm:inline-flex"
            >
              {backLink.label}
            </Link>
          ) : null}
          {langSwitch ? (
            // Dua pilihan yang selalu tampil, bahasa aktif terlihat tanpa menebak.
            // Hurufnya sama dengan tautan bagian di sebelahnya, dipisah garis
            // tipis: pengaturan tampilan, tidak bersaing dengan Masuk dan Daftar.
            // Bahasa aktif ditandai tebal, bukan garis bawah: garis bawah sudah
            // berarti "bagian yang sedang dibaca" di bilah yang sama.
            // Kode pendek, karena "ID" di samping "EN" jelas terbaca sebagai
            // bahasa; nama lengkapnya untuk pembaca layar.
            <div role="group" aria-label={t.languageGroup} className="flex shrink-0 items-center">
              {(["id", "en"] as const).map((kode, i) => {
                const label = LANDING_LANG_LABELS[kode];
                const aktifBahasa = kode === lang;
                // Kode terlihat ikut terbaca ("EN English"), supaya kendali suara
                // yang menyebut "EN" cocok dengan nama tombolnya (WCAG 2.5.3).
                const isi = (
                  <>
                    {label.short}
                    <span className="sr-only"> {label.name}</span>
                  </>
                );
                // Area ketuk 48px (M3) tanpa mengubah tampilan: butirnya tanpa kotak. Di
                // ponsel 44px (WCAG 2.5.5), supaya logo di sebelahnya tidak menyusut.
                const kelas =
                  "inline-flex min-h-12 min-w-11 sm:min-w-12 items-center justify-center whitespace-nowrap rounded-md px-3 text-[15px]";
                return (
                  <span key={kode} className="flex items-center">
                    {i > 0 ? (
                      <span aria-hidden className="h-4 w-px bg-[color-mix(in_srgb,var(--nav-text)_30%,transparent)]" />
                    ) : null}
                    {aktifBahasa ? (
                      <span aria-current="true" lang={label.htmlLang} className={`${kelas} font-semibold`}>
                        {isi}
                      </span>
                    ) : (
                      <a
                        href={langSwitch.href}
                        hrefLang={label.htmlLang}
                        lang={label.htmlLang}
                        onClick={(event) => pindahBahasa(event, langSwitch.href)}
                        className={`m3-state ${kelas} font-medium opacity-70 hover:opacity-100 focus-visible:opacity-100`}
                      >
                        {isi}
                      </a>
                    )}
                  </span>
                );
              })}
            </div>
          ) : null}
          {peserta ? (
            <>
              {peserta.lonceng ? (
                <LoncengPengumuman
                  slug={peserta.slug}
                  lang={lang}
                  items={peserta.lonceng.items}
                  unread={peserta.lonceng.unread}
                  dashboardHref={dashboardAktif ? null : peserta.dashboardHref}
                  buka={loncengBuka}
                  onBukaChange={ubahLonceng}
                />
              ) : null}
              <Link
                href={peserta.dashboardHref}
                aria-current={dashboardAktif ? "page" : undefined}
                // Ukuran dan warna tombol Daftar yang digantikannya. Lingkaran
                // inisial memakai pasangan warna yang dibalik, jadi tetap terlihat
                // di bilah terang maupun gelap.
                className="m3-state hidden min-h-11 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--nav-text)] pl-1.5 pr-4 text-label-large font-semibold text-[var(--nav-on-text)] sm:inline-flex"
                style={{ "--m3-state-color": "var(--nav-on-text)" } as CSSProperties}
              >
                <span
                  aria-hidden
                  className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--nav-on-text)] text-[12px] font-semibold tracking-[0.02em] text-[var(--nav-text)]"
                >
                  {peserta.inisial}
                </span>
                {t.myDashboard}
              </Link>
            </>
          ) : null}
          {!peserta && memberLink && gathering ? (
            // Gathering: satu tombol pil terisi. Bila pendaftaran juga terbuka,
            // Daftar yang terisi dan Masuk bergaris, supaya tidak ada dua tombol hijau.
            <Link
              href={memberLink.href}
              className={
                registrationOpen
                  ? "m3-state inline-flex min-h-12 items-center whitespace-nowrap rounded-full border border-current px-[22px] text-[13px] font-bold"
                  : PIL_GATHERING
              }
              style={registrationOpen ? undefined : ({ "--m3-state-color": "var(--on-aksi-putih)" } as CSSProperties)}
            >
              {registrationOpen ? memberLink.label : t.navPortalSignIn}
            </Link>
          ) : null}
          {!peserta && registrationOpen && gathering ? (
            <Link href={daftarUrl} className={PIL_GATHERING} style={{ "--m3-state-color": "var(--on-aksi-putih)" } as CSSProperties}>
              {t.register}
            </Link>
          ) : null}
          {!peserta && memberLink && !gathering ? (
            <Link
              href={memberLink.href}
              // Tombol bergaris kecil, bukan teks: tanpa bingkai "Masuk" terbaca
              // sebagai tautan menu ketujuh.
              className="m3-state target-48 inline-flex min-h-10 items-center rounded-md border border-current px-4 text-label-large font-semibold"
            >
              {memberLink.label}
            </Link>
          ) : null}
          {!peserta && registrationOpen && !gathering ? (
            <Link
              href={daftarUrl}
              className="m3-state target-48 inline-flex min-h-11 items-center rounded-md bg-[var(--nav-text)] px-4 text-label-large font-semibold text-[var(--nav-on-text)]"
            >
              {/* Label pendek di nav, sesuai rancangan. Teks tombol pilihan admin
                  dipakai di hero dan banner ajakan; dua tombol berlabel sama
                  di layar yang sama terbaca seperti desakan. */}
              {t.register}
            </Link>
          ) : null}
          {sections.length > 0 || peserta ? (
            <button
              ref={tombolMenuRef}
              type="button"
              aria-expanded={menuBuka}
              aria-controls={menuId}
              aria-label={menuBuka ? t.closeMenu : t.openMenu}
              onClick={() => {
                setMenuBuka((buka) => !buka);
                setLoncengBuka(false);
              }}
              className={`m3-state target-48 -mr-2 inline-flex size-11 items-center justify-center rounded-md xl:hidden ${
                // Tanpa bagian halaman, Menu hanya berisi Dashboard saya dan
                // Keluar, dan di layar sm+ tombol Dashboard sudah di bilah.
                sections.length === 0 ? "sm:hidden" : ""
              }`}
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
          {peserta ? (
            <>
              <li className="sm:hidden">
                <Link
                  href={peserta.dashboardHref}
                  onClick={() => setMenuBuka(false)}
                  aria-current={dashboardAktif ? "page" : undefined}
                  className={`m3-state flex min-h-12 items-center gap-3 rounded-md px-4 text-[17px] ${dashboardAktif ? "font-semibold" : "font-medium"}`}
                >
                  <span
                    aria-hidden
                    className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--nav-text)] text-[12px] font-semibold text-[var(--nav-on-text)]"
                  >
                    {peserta.inisial}
                  </span>
                  {t.myDashboard}
                </Link>
              </li>
              <li>
                <form method="post" action={peserta.keluarAction}>
                  <button type="submit" className="m3-state flex min-h-12 w-full items-center rounded-md px-4 text-left text-[17px] font-medium">
                    {t.signOut}
                  </button>
                </form>
              </li>
              {sections.length > 0 ? (
                <li aria-hidden className="mx-4 my-1 border-t border-[color-mix(in_srgb,var(--nav-text)_12%,transparent)]" />
              ) : null}
            </>
          ) : null}
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`${sectionBase}#${section.id}`}
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
