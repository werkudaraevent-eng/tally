import type { CSSProperties } from "react";
import { mixHex, parseHex } from "./color";
import { DEFAULT_REGISTRATION_SEED, buildRegistrationThemeRoles, type RegistrationFormTheme, type RegistrationThemeRoles } from "./registration-theme";
import { LANDING_NAV_DEFAULTS, LANDING_NAV_HEIGHT_MAX, LANDING_NAV_HEIGHT_MIN, type LandingNavConfig } from "./domain";

/**
 * Tema mana yang dipakai halaman pendaftaran sebuah acara.
 *
 * Satu tempat, dipakai halaman publik DAN pratinjau di CMS. Aturan yang hidup di
 * dua tempat akan berbeda pendapat, dan yang terlihat admin adalah pratinjau
 * berwarna A sementara pendaftarnya melihat warna B.
 */
export function resolveFormTheme(
  formTheme: RegistrationFormTheme | undefined,
  landingTheme: RegistrationFormTheme | undefined,
): RegistrationFormTheme | undefined {
  const pakaiSendiri = Boolean(formTheme?.seed) && formTheme?.inherit !== true;
  return pakaiSendiri ? formTheme : (landingTheme ?? formTheme);
}

/**
 * Mengubah peran warna form menjadi variabel CSS untuk dipasang di elemen
 * pembungkus halaman pendaftaran.
 *
 * Variabelnya berawalan `--reg-`, bukan `--md-sys-color-`. Halaman ini memakai
 * tema milik penyelenggara acara, bukan tema aplikasi, dan menimpa variabel
 * sistem akan ikut mengubah komponen bersama apa pun yang kebetulan dirender di
 * dalamnya — termasuk toast, yang muncul di seluruh aplikasi.
 */
export function registrationThemeStyle(theme: RegistrationFormTheme | undefined): CSSProperties {
  // Peran dihitung ulang di sini HANYA bila konfigurasi lama belum memilikinya.
  // Event yang disimpan sebelum fitur tema ada tidak punya `roles`, dan halaman
  // publiknya tetap harus tampil — bukan gagal render.
  const roles: RegistrationThemeRoles =
    theme?.roles ?? buildRegistrationThemeRoles(theme?.seed ?? DEFAULT_REGISTRATION_SEED, false);

  return {
    "--reg-surface": roles.surface,
    "--reg-field": roles.surface_container,
    "--reg-panel": roles.surface_container_high,
    "--reg-on-surface": roles.on_surface,
    "--reg-on-surface-variant": roles.on_surface_variant,
    "--reg-outline": roles.outline,
    "--reg-outline-variant": roles.outline_variant,
    "--reg-primary": roles.primary,
    "--reg-on-primary": roles.on_primary,
    // Pasangan tonal untuk penanda non-tombol (pil tanggal, angka penting).
    // Fallback ke primary/on-primary karena konfigurasi yang disimpan sebelum
    // kedua peran ini ikut dihitung tetap ada di database — variabel kosong akan
    // membuat teksnya hilang di atas latar yang juga kosong.
    "--reg-primary-container": roles.primary_container ?? roles.primary,
    "--reg-on-primary-container": roles.on_primary_container ?? roles.on_primary,
    "--reg-error": roles.error,
    "--reg-error-soft": roles.error_soft,
    "--reg-on-error-soft": roles.on_error_soft,
    backgroundColor: roles.surface,
    color: roles.on_surface,
  } as CSSProperties;
}

/** Rasio kontras WCAG antara dua warna hex. */
function kontras(a: string, b: string) {
  const lum = (hex: string) => {
    const { r, g, b: bl } = parseHex(hex);
    const kanal = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(bl);
  };
  const [terang, gelap] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (terang + 0.05) / (gelap + 0.05);
}

const TINTA_GELAP = "#181d27";

/** Putih atau tinta gelap, mana yang kontrasnya lebih tinggi di atas `hex`. */
function tintaDiAtas(hex: string) {
  return kontras(hex, "#ffffff") >= kontras(hex, TINTA_GELAP) ? "#ffffff" : TINTA_GELAP;
}

/**
 * Warna untuk tata letak Modern (halaman acara v2 dan formulirnya).
 *
 * Permukaan, teks, dan garis memakai abu-abu netral. Peran permukaan M3
 * diturunkan dari warna merek dan pada biru condong ke ungu muda; Hanung menolak
 * nuansa itu.
 *
 * Warna merek dipakai PERSIS seperti yang dipilih admin, bukan peran `primary`
 * M3. `primary` M3 adalah nada 40 dari palet merek: putih jadi abu-abu gelap,
 * biru terang jadi biru tua yang terbaca ungu. Admin yang memilih putih lalu
 * melihat hero abu-abu tidak punya cara mengerti kenapa.
 *
 * Dua pasangan:
 * - `--reg-brand` / `--reg-on-brand`: bidang lebar (hero tanpa KV, kartu
 *   Sekilas, banner ajakan, kepala formulir). Selalu warna merek apa adanya,
 *   termasuk putih; teksnya putih atau gelap menurut kontras.
 * - `--reg-primary` / `--reg-on-primary`: tombol, tautan, dan ikon di atas
 *   permukaan putih. Warna merek bila cukup kontras dengan putih (3:1); merek
 *   yang terlalu terang (putih, kuning muda) jatuh ke tinta gelap supaya tombol
 *   tidak hilang di atas latar putih.
 */
export function modernThemeStyle(seed: string | undefined): CSSProperties {
  const merek = /^#[0-9a-f]{6}$/i.test(seed ?? "") ? seed! : DEFAULT_REGISTRATION_SEED;
  const aksen = kontras(merek, "#ffffff") >= 3 ? merek : TINTA_GELAP;
  return {
    "--reg-surface": "#ffffff",
    "--reg-field": "#ffffff",
    "--reg-panel": "#f5f5f5",
    "--reg-on-surface": TINTA_GELAP,
    "--reg-on-surface-variant": "#414651",
    "--reg-outline": "#a4a7ae",
    "--reg-outline-variant": "#e9eaeb",
    "--reg-brand": merek,
    "--reg-on-brand": tintaDiAtas(merek),
    "--reg-primary": aksen,
    "--reg-on-primary": tintaDiAtas(aksen),
    "--reg-primary-container": mixHex(aksen, "#ffffff", 0.9),
    "--reg-on-primary-container": TINTA_GELAP,
    backgroundColor: "#ffffff",
    color: TINTA_GELAP,
  } as CSSProperties;
}

/**
 * Warna tata letak Forum (Figma IFC). Tiga warna dari CMS, dipakai apa adanya:
 *
 * - primer (warna merek): hero tanpa KV, kartu Tentang, kepala tabel rundown,
 *   banner Program acara, kaki halaman, tombol daftar.
 * - aksen (bawaan kuning #FFC72C): lencana hero dan tombol "Selengkapnya".
 * - sekunder (bawaan biru #00AEEF): tombol Masuk, dan panel Susunan acara yang
 *   memakai warna ini diencerkan hampir putih.
 *
 * Teks di atas tiap warna putih atau gelap menurut kontras, sama seperti tata
 * letak Modern. Akibatnya teks tombol Masuk di atas biru muda bawaan berwarna
 * gelap, bukan putih seperti di Figma: putih di atas #00AEEF kontrasnya 2,5:1.
 */
export const FORUM_DEFAULTS = { primary: "#002f54", accent: "#ffc72c", secondary: "#00aeef" } as const;

export function forumThemeStyle(seed: string | undefined, accent: string | undefined, secondary: string | undefined): CSSProperties {
  const hex = (value: string | undefined, fallback: string) => (/^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : fallback);
  const primer = hex(seed, FORUM_DEFAULTS.primary);
  const aksen = hex(accent, FORUM_DEFAULTS.accent);
  const sekunder = hex(secondary, FORUM_DEFAULTS.secondary);
  // Primer sebagai teks di atas putih (judul tab Info praktis, tautan): merek
  // yang terlalu terang jatuh ke tinta gelap supaya tetap terbaca.
  const primerTeks = kontras(primer, "#ffffff") >= 3 ? primer : TINTA_GELAP;
  return {
    "--f-primary": primer,
    "--f-on-primary": tintaDiAtas(primer),
    "--f-primary-text": primerTeks,
    "--f-accent": aksen,
    "--f-on-accent": kontras(aksen, primer) >= 4.5 ? primer : tintaDiAtas(aksen),
    "--f-secondary": sekunder,
    "--f-on-secondary": tintaDiAtas(sekunder),
    "--f-panel": mixHex(sekunder, "#ffffff", 0.91),
    "--f-title": "#2e2e2e",
    "--f-ink": "#292e3d",
    // Peran --reg-* untuk komponen bersama (formulir, area peserta).
    ...modernThemeStyle(primer),
  } as CSSProperties;
}

/**
 * Warna tombol utama (filled M3) di atas KV hero yang sudah dibayangi gelap.
 * M3: aksi utama = tombol filled berwarna primary/merek. Merek yang terlalu
 * gelap untuk berdiri di atas foto yang digelapkan (kontras < 3:1 terhadap
 * hitam) jatuh ke putih supaya tombolnya tetap terlihat.
 */
export function heroCtaColors(seed: string | undefined): { bg: string; fg: string } {
  const merek = /^#[0-9a-f]{6}$/i.test(seed ?? "") ? seed! : DEFAULT_REGISTRATION_SEED;
  const bg = kontras(merek, "#000000") >= 3 ? merek : "#ffffff";
  return { bg, fg: tintaDiAtas(bg) };
}

/**
 * Warna bilah atas tata letak Modern dari pengaturan CMS.
 *
 * `--nav-bg` dipakai saat bilah berdiri di atas hero (transparansi persis
 * pilihan admin). Setelah hero lewat, bilah menempel di atas permukaan putih:
 * bilah bening dengan teks putih akan hilang di sana, jadi `--nav-bg-scrolled`
 * menaikkan ketidaktembusannya ke paling sedikit 90%.
 *
 * Teks: bila bilah cukup pekat (>= 50%), putih atau gelap menurut kontras
 * warna bilah. Bila lebih bening, yang terlihat di belakang teks adalah hero,
 * jadi teks mengikuti tinta hero. `--nav-on-ink*` adalah warna teks tombol
 * Daftar, yang latarnya tinta itu sendiri.
 */
export function modernNavStyle(
  nav: LandingNavConfig | undefined,
  hero: { ink: string; onInk: string },
): CSSProperties {
  const warna = /^#[0-9a-f]{6}$/i.test(nav?.color ?? "") ? nav!.color! : LANDING_NAV_DEFAULTS.color;
  const opasitas = Math.min(100, Math.max(0, Math.round(nav?.opacity ?? LANDING_NAV_DEFAULTS.opacity)));
  const tinggi = Math.min(LANDING_NAV_HEIGHT_MAX, Math.max(LANDING_NAV_HEIGHT_MIN, Math.round(nav?.height ?? LANDING_NAV_DEFAULTS.height)));
  const { r, g, b } = parseHex(warna);
  const tintaBilah = tintaDiAtas(warna);
  const lawan = (tinta: string) => (tinta === "#ffffff" ? TINTA_GELAP : "#ffffff");
  const pekat = opasitas >= 50;
  return {
    "--nav-h": `${tinggi}px`,
    "--nav-bg": `rgb(${r} ${g} ${b} / ${opasitas / 100})`,
    "--nav-bg-scrolled": `rgb(${r} ${g} ${b} / ${Math.max(opasitas, 90) / 100})`,
    "--nav-ink": pekat ? tintaBilah : hero.ink,
    "--nav-on-ink": pekat ? lawan(tintaBilah) : hero.onInk,
    // Bilah 0% benar-benar bening: tanpa kaburan, yang di belakangnya tetap tajam.
    "--nav-blur": opasitas > 0 ? "blur(12px)" : "none",
    "--nav-ink-scrolled": tintaBilah,
    "--nav-on-ink-scrolled": lawan(tintaBilah),
  } as CSSProperties;
}

/** Aksen bawaan gaya gathering: emas, pasangan navy di rancangan KSO 21. */
export const GATHERING_ACCENT_DEFAULT = "#E9C46A";
/** Label kecil di atas pasir untuk aksen emas bawaan (rancangan v3). */
const GATHERING_OKER = "#8A5F10";

/** Warna yang sama dengan kecerahan HSL `terang` (0..1): rona dan saturasi tetap. */
function ubahTerang(hex: string, terang: number): string {
  const { r, g, b } = parseHex(hex);
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const maks = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (maks + min) / 2;
  const d = maks - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let rona = 0;
  if (d !== 0) {
    if (maks === rr) rona = ((gg - bb) / d) % 6;
    else if (maks === gg) rona = (bb - rr) / d + 2;
    else rona = (rr - gg) / d + 4;
  }
  const c = (1 - Math.abs(2 * terang - 1)) * sat;
  const x = c * (1 - Math.abs((((rona % 6) + 6) % 6) % 2 - 1));
  const m = terang - c / 2;
  const sektor = Math.floor((((rona % 6) + 6) % 6));
  const [r1, g1, b1] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][sektor];
  const hexKanal = (v: number) => Math.round(Math.min(255, Math.max(0, (v + m) * 255))).toString(16).padStart(2, "0");
  return `#${hexKanal(r1)}${hexKanal(g1)}${hexKanal(b1)}`;
}

/** Kecerahan HSL `hex` (0..1). */
function terangDari(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
}

/**
 * `warna` bila terbaca (4.5:1) di atas `latar`; selain itu digeser kecerahannya
 * (rona tetap) menjauhi latar sampai terbaca. Putih atau tinta gelap bila
 * pergeseran pun tidak cukup.
 */
function terbacaDi(warna: string, latar: string): string {
  if (kontras(warna, latar) >= 4.5) return warna;
  const keGelap = kontras(latar, "#000000") >= kontras(latar, "#ffffff");
  for (let langkah = 1; langkah <= 50; langkah += 1) {
    const terang = terangDari(warna) + (keGelap ? -1 : 1) * langkah * 0.02;
    if (terang < 0 || terang > 1) break;
    const coba = ubahTerang(warna, terang);
    if (kontras(coba, latar) >= 4.5) return coba;
  }
  return keGelap ? "#000000" : "#ffffff";
}

/** Tinta paling kontras di atas `latar`: merek bila 4.5:1, selain itu putih, tinta gelap, atau hitam. */
function tintaTerbaik(latar: string, merek: string): string {
  if (kontras(merek, latar) >= 4.5) return merek;
  return ["#ffffff", TINTA_GELAP, "#000000"].reduce((terbaik, coba) => (kontras(coba, latar) > kontras(terbaik, latar) ? coba : terbaik));
}

/**
 * Warna gaya gathering (preset Gathering, tata letak Modern) dari aksen admin.
 * Setiap warna teks diperiksa terhadap latar tempat ia benar-benar tampil.
 *
 * - `sand`: permukaan halaman, aksen yang sangat diencerkan. Kartu di atasnya putih.
 * - `cta`/`onCta`: tombol utama hero. Aksen yang terlalu gelap untuk berdiri di
 *   atas foto gelap (< 3:1 terhadap hitam) jatuh ke putih, sama dengan
 *   heroCtaColors. Teksnya warna merek bila 4.5:1 (navy di atas emas), selain
 *   itu tinta yang paling kontras.
 * - `teks`: label kecil di atas pasir. Aksen yang digelapkan dengan rona tetap
 *   (emas jadi oker, bukan zaitun) sampai 4.5:1.
 * - `heroAlis`/`heroAngka`: label kecil dan angka hitung mundur di hero, diukur
 *   terhadap KV yang dibayangi (kira-kira hitam) atau, tanpa KV, warna merek.
 * - `angka`: nomor hari di lingkaran warna primary.
 */
export function gatheringColors(accent: string | undefined, seed: string | undefined, adaKv: boolean) {
  const aksen = /^#[0-9a-f]{6}$/i.test(accent ?? "") ? accent! : GATHERING_ACCENT_DEFAULT;
  const merek = /^#[0-9a-f]{6}$/i.test(seed ?? "") ? seed! : DEFAULT_REGISTRATION_SEED;
  // Sama dengan --reg-primary dari modernThemeStyle.
  const primer = kontras(merek, "#ffffff") >= 3 ? merek : TINTA_GELAP;
  const sand = mixHex(aksen, "#ffffff", 0.86);
  const cta = kontras(aksen, "#000000") >= 3 ? aksen : "#ffffff";
  const latarHero = adaKv ? "#000000" : merek;
  return {
    aksen,
    sand,
    cta,
    onCta: tintaTerbaik(cta, merek),
    // Emas bawaan memakai oker yang disetujui di rancangan (audit v2 #5).
    teks: aksen.toUpperCase() === GATHERING_ACCENT_DEFAULT ? terbacaDi(GATHERING_OKER, sand) : terbacaDi(aksen, sand),
    heroAlis: terbacaDi(adaKv ? mixHex(aksen, "#ffffff", 0.55) : aksen, latarHero),
    heroAngka: terbacaDi(aksen, latarHero),
    angka: terbacaDi(aksen, primer),
  };
}
