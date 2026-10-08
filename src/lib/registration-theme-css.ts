import type { CSSProperties } from "react";
import { mixHex, parseHex } from "./color";
import { DEFAULT_REGISTRATION_SEED, buildRegistrationThemeRoles, type RegistrationFormTheme, type RegistrationThemeRoles } from "./registration-theme";
import { LANDING_NAV_DEFAULTS, LANDING_NAV_HEIGHT_MAX, LANDING_NAV_HEIGHT_MIN, type EventLandingConfig, type LandingNavConfig } from "./domain";
import { FORUM_DEFAULTS, GATHERING_ACCENT_DEFAULT, HERO_KV_KUAT, landingTokens } from "./landing-tokens";

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
export { FORUM_DEFAULTS };

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

export { GATHERING_ACCENT_DEFAULT };
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
 * - `primerTeks`: warna primary yang terbaca di atas pasir (dan kartu putih).
 */
/** Geser terang (L) dan jenuh (S) sebuah warna dalam HSL (-1..1), rona (H) dalam derajat. */
function geserHsl(hex: string, terang: number, jenuh: number, rona = 0): string {
  const { r, g, b } = parseHex(hex);
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const maks = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  let h = 0;
  const d = maks - min;
  const l0 = (maks + min) / 2;
  const s0 = d === 0 ? 0 : d / (1 - Math.abs(2 * l0 - 1));
  if (d !== 0) h = maks === R ? ((G - B) / d) % 6 : maks === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h = (h * 60 + rona + 360) % 360;
  const l = Math.min(1, Math.max(0, l0 + terang));
  const s = Math.min(1, Math.max(0, s0 + jenuh));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hx = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${hx(r1)}${hx(g1)}${hx(b1)}`;
}

/**
 * Latar hero dan pita penutup gaya gathering. Merek gelap (KSO #1B2D57):
 * gradasi rancangan pen.dev, sedikit lebih terang di kiri atas
 * (#1B2D57 → #14294F → #1B3A6B). Merek terang: digelapkan seperti sebelumnya,
 * supaya teks putih tetap terbaca.
 */
export function latarGathering(seed: string | undefined): { latar: string; terang: string; gelap: string; redup: string | null } {
  const merek = /^#[0-9a-f]{6}$/i.test(seed ?? "") ? seed! : DEFAULT_REGISTRATION_SEED;
  if (kontras(merek, "#ffffff") >= 7) {
    const terang = geserHsl(merek, 0.04, 0.07, -5);
    const gelap = geserHsl(merek, -0.03, 0.07, -4);
    // Teks redup di atas navy: biru muda dari rona merek (#C6D2E8 untuk KSO).
    const redup = geserHsl(merek, 0.62, -0.06, -2);
    return { latar: `linear-gradient(340deg, ${merek} 0%, ${gelap} 55%, ${terang} 100%)`, terang, gelap, redup };
  }
  const gelap = mixHex(merek, "#000000", 0.38);
  return {
    latar: "linear-gradient(160deg, color-mix(in srgb, var(--reg-brand) 62%, black) 0%, color-mix(in srgb, var(--reg-brand) 85%, black) 60%, var(--reg-brand) 100%)",
    terang: merek,
    gelap,
    redup: null,
  };
}

/**
 * Latar bagian "Dark brand" gaya gathering (Halaman acara > bagian > Background).
 * Merek gelap (putih 7:1 ke atas, mis. KSO): null, bagian memakai gradasi hero.
 * Merek terang atau sedang: warna polos dari merek yang dicampur ke hitam
 * sampai teks putih dan teks redup (putih 80%) 4,5:1 dan garis 3:1 (QA #115 H2).
 * Gradasi hero tidak dipakai di sini karena ujungnya merek murni, dan teks
 * putih di atas kuning atau hijau muda tidak terbaca.
 */
export function latarGelapBagian(seed: string | undefined): string | null {
  const merek = /^#[0-9a-f]{6}$/i.test(seed ?? "") ? seed! : DEFAULT_REGISTRATION_SEED;
  if (kontras(merek, "#ffffff") >= 7) return null;
  for (let campur = 0.3; campur < 1; campur += 0.02) {
    const latar = mixHex(merek, "#000000", campur);
    // Putih 4,5:1; teks redup (putih 80%) 4,6:1 di atas isi kartu (putih 8%,
    // --reg-panel), yang sedikit lebih terang daripada latarnya (QA #115 R2);
    // garis tab dan kartu (putih 50%) 3:1.
    const kartu = mixHex(latar, "#ffffff", 0.08);
    if (kontras(latar, "#ffffff") >= 4.5 && kontras(kartu, mixHex(kartu, "#ffffff", 0.8)) >= 4.6 && kontras(latar, mixHex(latar, "#ffffff", 0.5)) >= 3) return latar;
  }
  return mixHex(merek, "#000000", 0.9);
}

/** KV gathering yang siap digambar: lihat kvGathering(). */
export type KvGathering = {
  src: string;
  /** Kekuatan gambar dalam persen (5-50, kelipatan 5). */
  kuat: number;
  /** Gradasi lapisan warna sendiri; null = gradasi merek seperti biasa. */
  latar: string | null;
  /** Bayangan hitam di atas gambar (0-1) per tempat, supaya teks tetap terbaca. */
  bayang: { hero: number; portal: number };
  /** Warna teks dan tombol hero yang dihitung ulang terhadap lapisan warna sendiri. */
  warnaHero: CSSProperties;
  warnaPortal: CSSProperties;
};

/**
 * KV hero gaya gathering (Halaman acara > Hero > Background image), dipakai
 * hero halaman acara dan kepala navy portal: gambar setipis `kuat` persen di
 * atas lapisan warna, seperti dua fill di Figma (Image 20% di atas Linear).
 * Null bila tidak ada gambar atau saklarnya mati.
 *
 * Keterbacaan diukur terhadap piksel terang KV (hero_bg_terang, diukur saat
 * unggah; tanpa ukuran dianggap putih polos) (QA #111 H1/H2):
 * - Lapisan warna sendiri digelapkan sampai 7:1 terhadap putih, lalu menjadi
 *   "merek" hero: biru redup, emas, dan tombol dihitung ulang terhadapnya,
 *   termasuk penjaga tombol QA #103 M3.
 * - Bila gambar membuat teks hero di bawah 4,5:1, bayangan hitam ditambahkan
 *   di atas gambar secukupnya. Makin kuat gambarnya, makin gelap lapisannya.
 */
export function kvGathering(config: EventLandingConfig | null | undefined): KvGathering | null {
  const src = config?.hero_bg_url?.trim();
  if (!config || !src || config.hero_bg_on === false) return null;
  const angka = Number(config.hero_bg_opacity ?? HERO_KV_KUAT.bawaan);
  const kuat = Number.isFinite(angka) ? jepitKuat(angka) : HERO_KV_KUAT.bawaan;
  const tokens = landingTokens(config, "modern");
  const merek = /^#[0-9a-f]{6}$/i.test(tokens.brand ?? "") ? tokens.brand! : DEFAULT_REGISTRATION_SEED;
  const sendiri = /^#[0-9a-f]{6}$/i.test(config.hero_bg_color ?? "") ? config.hero_bg_color! : null;
  const lapisan = sendiri ? gelapkanSampai(sendiri, 7) : null;
  const dasar = lapisan ?? merek;
  const warna = gatheringColors(tokens.accent ?? undefined, dasar, false, config.button_color);
  const latarDasar = latarGathering(dasar);
  // Warna paling terang di tiap gradasi: di situ KV putih paling menyilaukan.
  // Hero: latarGathering (merek gelap) atau merek; portal: LATAR_NAVY, ujungnya merek.
  const terangHero = kontras(dasar, "#ffffff") >= 7 ? latarDasar.terang : dasar;
  const terangPortal = lapisan ? latarDasar.terang : merek;
  // Teks di atas kaca putih 10%: lencana di hero dan label "Agenda
  // selanjutnya" di kepala portal. Warnanya dibuat terbaca di kaca itu dulu
  // (QA #111 R2-M3); yang sudah terbaca tidak berubah.
  const lencana = terbacaDi(warna.heroLencana, mixHex(terangHero, "#ffffff", 0.1));
  const angkaKaca = terbacaDi(warna.heroAngka, mixHex(terangPortal, "#ffffff", 0.1));
  // `warna` null = putih 80% (teks redup tanpa warna turunan merek). `kaca` =
  // di atas kaca putih. `target` 2 = bidang tombol terhadap sekitarnya
  // (QA #103 M3, #111 R2-M4). Pratinjau portal di hero punya latar pekat.
  const teksHero = [{ warna: "#ffffff" }, { warna: latarDasar.redup }, { warna: warna.heroAngka }, { warna: lencana, kaca: 0.1 }, { warna: warna.cta, target: 2 }];
  const teksPortal = [{ warna: "#ffffff" }, { warna: null }, { warna: warna.heroAngka }, { warna: angkaKaca, kaca: 0.1 }, { warna: null, kaca: 0.1 }];
  // Piksel terang KV dari unggahan, hanya bila diukur dari gambar yang sama
  // dan tidak hampir transparan; selain itu anggap putih polos (QA #111 R2-M1).
  const ukurSah =
    /^#[0-9a-f]{8}$/i.test(config.hero_bg_terang ?? "") && config.hero_bg_terang_src === src && parseInt(config.hero_bg_terang!.slice(7), 16) >= 0x20;
  const ukur = ukurSah ? config.hero_bg_terang! : "#ffffffff";
  const kvTerang = { warna: ukur.slice(0, 7), alfa: parseInt(ukur.slice(7), 16) / 255 };
  return {
    src,
    kuat,
    latar: lapisan ? latarDasar.latar : null,
    bayang: { hero: bayangKv(terangHero, kvTerang, kuat, teksHero, Boolean(lapisan)), portal: bayangKv(terangPortal, kvTerang, kuat, teksPortal, Boolean(lapisan)) },
    warnaHero: {
      ...(lapisan
        ? {
            "--hero-redup": latarDasar.redup ?? undefined,
            "--hero-alis": warna.heroAlis,
            "--hero-angka": warna.heroAngka,
            "--aksi": warna.cta,
            "--on-aksi": warna.onCta,
          }
        : {}),
      ...(lapisan || lencana !== warna.heroLencana ? { "--hero-lencana": lencana } : {}),
    } as CSSProperties,
    warnaPortal: (lapisan || angkaKaca !== warna.heroAngka ? { "--hero-angka": angkaKaca } : {}) as CSSProperties,
  };
}

/** Angka kekuatan KV ke rentang dan kelipatan HERO_KV_KUAT, sama dengan penggeser di CMS. */
export function jepitKuat(angka: number): number {
  const { min, max, step } = HERO_KV_KUAT;
  return Math.min(max, Math.max(min, min + Math.round((angka - min) / step) * step));
}

/** Gelapkan warna selangkah demi selangkah sampai teks putih mencapai `rasio`. */
function gelapkanSampai(warna: string, rasio: number): string {
  let hasil = warna;
  for (let langkah = 0; langkah < 30 && kontras(hasil, "#ffffff") < rasio; langkah += 1) hasil = mixHex(hasil, "#000000", 0.1);
  return hasil;
}

/**
 * Bayangan hitam terkecil (0-0,9) supaya setiap warna teks tetap 4,5:1 di atas
 * piksel terburuk: piksel terang KV setipis `kuat` di atas `terang`, lalu bayangannya.
 * Teks yang di latar tanpa KV pun sudah di bawah 4,5 cukup tidak dibuat lebih
 * buruk, kecuali `penuh` (lapisan warna sendiri: fitur baru, jadi tidak ada
 * tampilan lama yang harus dijaga; QA #111 R2). `null` = putih 80% di atas latarnya; `kaca` = di atas kartu putih tembus;
 * `target` = rasio selain 4,5 (bidang tombol 2:1).
 */
function bayangKv(
  terang: string,
  kv: { warna: string; alfa: number },
  kuat: number,
  teks: { warna: string | null; kaca?: number; target?: number }[],
  penuh = false,
): number {
  const lolos = (latar: string, butuh?: number[]) =>
    teks.map(({ warna, kaca = 0, target = 4.5 }, i) => {
      const bawah = mixHex(latar, "#ffffff", kaca);
      const nilai = kontras(warna ?? mixHex(bawah, "#ffffff", 0.8), bawah);
      return butuh ? nilai >= butuh[i] : penuh ? target : Math.min(target, nilai);
    });
  const butuh = lolos(terang) as number[];
  const dgnKv = mixHex(terang, kv.warna, (kuat / 100) * kv.alfa);
  for (let langkah = 0; langkah <= 45; langkah += 1) {
    if (lolos(mixHex(dgnKv, "#000000", langkah / 50), butuh).every(Boolean)) return langkah / 50;
  }
  return 0.9;
}

export function gatheringColors(accent: string | undefined, seed: string | undefined, adaKv: boolean, button?: string | null) {
  const aksen = /^#[0-9a-f]{6}$/i.test(accent ?? "") ? accent! : GATHERING_ACCENT_DEFAULT;
  const merek = /^#[0-9a-f]{6}$/i.test(seed ?? "") ? seed! : DEFAULT_REGISTRATION_SEED;
  // Sama dengan --reg-primary dari modernThemeStyle.
  const primer = kontras(merek, "#ffffff") >= 3 ? merek : TINTA_GELAP;
  const sand = mixHex(aksen, "#ffffff", 0.86);
  // Warna tombol dari Tema (preset Gathering: hijau). Tanpa isian, tombol tetap
  // warna aksen seperti sebelumnya, jadi acara lama tidak berubah warna.
  const tombol = /^#[0-9a-f]{6}$/i.test(button ?? "") ? button! : null;
  // Tombol harus tetap terlihat sebagai bidang di latar tempatnya (QA #103 M3):
  // di hero dan pita navy (merek sampai merek yang digelapkan) dan di putih.
  // Warna yang menyatu (< 2:1) diganti: di navy kembali ke aturan lama (aksen
  // atau putih), di putih digelapkan sampai terbaca.
  const navyGelap = mixHex(merek, "#000000", 0.38);
  const { terang: navyTerang } = latarGathering(merek);
  const ctaLama = kontras(aksen, "#000000") >= 3 ? aksen : "#ffffff";
  const cta = tombol && Math.min(kontras(tombol, merek), kontras(tombol, navyGelap), kontras(tombol, navyTerang)) >= 2 ? tombol : ctaLama;
  const dasarPutih = tombol ?? cta;
  const ctaPutih = kontras(dasarPutih, "#ffffff") >= 2 ? dasarPutih : terbacaDi(dasarPutih, "#ffffff");
  // Teks warna aksi di atas putih: label bagian, ikon, tab aktif.
  const aksiTeks = tombol ? terbacaDi(tombol, "#ffffff") : terbacaDi(aksen.toUpperCase() === GATHERING_ACCENT_DEFAULT ? GATHERING_OKER : aksen, "#ffffff");
  const aksenTeks = terbacaDi(aksen.toUpperCase() === GATHERING_ACCENT_DEFAULT ? GATHERING_OKER : aksen, "#ffffff");
  // Chip berlatar warna yang diencerkan (hari di kartu hari, status di portal):
  // teksnya diperiksa terhadap latar chip itu sendiri, bukan putih (QA #103 L1).
  const chip = (warna: string, encer: number, teks: string) => {
    const latar = mixHex(warna, "#ffffff", encer);
    return { latar, teks: terbacaDi(teks, latar) };
  };
  // KV yang dibayangi tidak pernah hitam murni: KV navy KSO 21 terukur ~#070e1f,
  // dan KV yang lebih terang lebih dari itu. #222 memberi jarak aman untuk
  // keduanya (QA PR #87: #4d72c8 lolos terhadap hitam, 4.17:1 terhadap KV nyata).
  const latarHero = adaKv ? "#222222" : merek;
  return {
    aksen,
    sand,
    cta,
    onCta: tintaTerbaik(cta, merek),
    // Emas bawaan memakai oker yang disetujui di rancangan (audit v2 #5).
    teks: aksen.toUpperCase() === GATHERING_ACCENT_DEFAULT ? terbacaDi(GATHERING_OKER, sand) : terbacaDi(aksen, sand),
    heroAlis: terbacaDi(adaKv ? mixHex(aksen, "#ffffff", 0.55) : aksen, latarHero),
    // Teks lencana di hero gaya aplikasi: emas muda (#F6E3A8 di rancangan).
    heroLencana: terbacaDi(geserHsl(aksen, 0.15, 0.07, 2), latarHero),
    // Tanda nama di bilah atas putih (tanpa logo): kotak aksen, huruf merek.
    tanda: { latar: aksen, teks: tintaTerbaik(aksen, merek) },
    // Teks redup di permukaan putih dan abu-abu: abu kebiruan dari merek
    // (#5F6C89 untuk KSO, rancangan #5A6A85), tetap 4.5:1 di #F4F6F8.
    teksRedup: terbacaDi(mixHex(primer, "#ffffff", 0.3), "#F4F6F8"),
    heroAngka: terbacaDi(aksen, latarHero),
    angka: terbacaDi(aksen, primer),
    // Teks warna primary di atas pasir (jam kartu hari, tautan jadwal lengkap).
    primerTeks: terbacaDi(primer, sand),
    // Warna aksi di atas putih (label bagian, ikon, tab aktif); emas oker bila
    // warna tombol belum diisi. Aksen di atas putih: nomor hari ketiga.
    aksiTeks,
    aksenTeks,
    // Tombol di atas putih (bagian Portal peserta, dialog masuk).
    ctaPutih,
    onCtaPutih: tintaTerbaik(ctaPutih, merek),
    chipAksi: chip(ctaPutih, 0.88, aksiTeks),
    chipMerek: chip(primer, 0.9, primer),
    chipAksen: chip(aksen, 0.78, aksenTeks),
  };
}
