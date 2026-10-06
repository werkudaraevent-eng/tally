import localFont from "next/font/local";
import "./fonts/fallback.css";
import "./fonts/landing.css";

// Semua huruf disimpan di repo (src/app/fonts/, lisensi OFL atau UFL di tiap folder) dan
// dimuat lewat next/font/local. Sebelumnya next/font/google mengunduhnya dari
// Google saat build, dan build Vercel berkali-kali gagal karena unduhan itu.
//
// Berkasnya adalah berkas yang PERSIS sama dengan yang dulu diberikan Google
// (disalin dari .next/static/media hasil build main), dipecah per subset dengan
// unicode-range yang sama. Karena itu tiap keluarga ditulis sebagai beberapa
// panggilan localFont: next/font/local hanya menerima satu unicode-range per
// panggilan, lewat `declarations`. Semua panggilan satu keluarga memakai nama
// keluarga yang sama, jadi peramban menggabungkannya menjadi satu keluarga dan
// hanya mengunduh subset yang memang dipakai di halaman, seperti sebelumnya.
//
// Nama keluarga itu SENGAJA sama dengan nama konstanta subset latin (`inter`,
// `geistMono`), bukan nama aslinya: Turbopack menulis nilai variabel CSS
// dari nama konstanta, bukan dari `declarations`. Tidak ada kode yang merujuk
// nama keluarga secara langsung; semuanya lewat var(--font-*).
//
// Di sini hanya huruf antarmuka: Inter dan Geist Mono, dengan subset latin
// di-preload karena dipakai hampir setiap layar. Huruf halaman acara (Montserrat,
// Oswald, Playfair, Source Sans 3, Ubuntu, Plus Jakarta Sans, dst.) ada di
// fonts/landing.css dengan URL tetap, supaya halaman acara bisa mem-preload
// hanya huruf pilihannya (lihat komentar di berkas itu).
//
// Fallback berukuran (`inter Fallback` dst.) ditulis di fonts/fallback.css
// dengan angka yang sama persis dengan yang dulu dihasilkan next/font/google;
// adjustFontFallback dimatikan supaya next/font/local tidak menghitung ulang.
//
// Bobot: Geist Mono dideklarasikan per bobot (500, 700), bukan rentang, walau
// berkasnya font variabel. Ini meniru CSS Google: bobot di antara angka itu
// dibulatkan ke face terdekat, bukan diinterpolasi.
//
// Berkas ini dibuat dari CSS hasil build; jangan sunting satu per satu. Untuk
// menambah bobot atau keluarga, ambil berkas woff2 dan unicode-range dari CSS
// Google untuk keluarga itu dan tambahkan panggilan dengan pola yang sama.

// Inter
const interCyrillicExt = localFont({
  src: [{ path: "./fonts/inter/inter-cyrillic-ext.woff2", weight: "100 900", style: "normal" }],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "inter" }, { prop: "unicode-range", value: "U+460-52F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F" }],
});
const interCyrillic = localFont({
  src: [{ path: "./fonts/inter/inter-cyrillic.woff2", weight: "100 900", style: "normal" }],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "inter" }, { prop: "unicode-range", value: "U+301,U+400-45F,U+490-491,U+4B0-4B1,U+2116" }],
});
const interGreekExt = localFont({
  src: [{ path: "./fonts/inter/inter-greek-ext.woff2", weight: "100 900", style: "normal" }],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "inter" }, { prop: "unicode-range", value: "U+1F??" }],
});
const interGreek = localFont({
  src: [{ path: "./fonts/inter/inter-greek.woff2", weight: "100 900", style: "normal" }],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "inter" }, { prop: "unicode-range", value: "U+370-377,U+37A-37F,U+384-38A,U+38C,U+38E-3A1,U+3A3-3FF" }],
});
const interVietnamese = localFont({
  src: [{ path: "./fonts/inter/inter-vietnamese.woff2", weight: "100 900", style: "normal" }],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "inter" }, { prop: "unicode-range", value: "U+102-103,U+110-111,U+128-129,U+168-169,U+1A0-1A1,U+1AF-1B0,U+300-301,U+303-304,U+308-309,U+323,U+329,U+1EA0-1EF9,U+20AB" }],
});
const interLatinExt = localFont({
  src: [{ path: "./fonts/inter/inter-latin-ext.woff2", weight: "100 900", style: "normal" }],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "inter" }, { prop: "unicode-range", value: "U+100-2BA,U+2BD-2C5,U+2C7-2CC,U+2CE-2D7,U+2DD-2FF,U+304,U+308,U+329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" }],
});
const inter = localFont({
  src: [{ path: "./fonts/inter/inter-latin.woff2", weight: "100 900", style: "normal" }],
  display: "swap",
  variable: "--font-sans",
  fallback: ["inter Fallback"],
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "inter" }, { prop: "unicode-range", value: "U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});
// Ubuntu (tata letak Forum, Figma IFC). Berbeda dengan keluarga lain di sini,
// Ubuntu bukan font variabel: Google memberi satu berkas per bobot, jadi `src`
// menunjuk berkas yang berbeda untuk 400, 500, dan 700. Lisensi: UFL.txt.
// Geist Mono
const geistMonoCyrillicExt = localFont({
  src: [
    { path: "./fonts/geist-mono/geist-mono-cyrillic-ext.woff2", weight: "500", style: "normal" },
    { path: "./fonts/geist-mono/geist-mono-cyrillic-ext.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "geistMono" }, { prop: "unicode-range", value: "U+460-52F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F" }],
});
const geistMonoCyrillic = localFont({
  src: [
    { path: "./fonts/geist-mono/geist-mono-cyrillic.woff2", weight: "500", style: "normal" },
    { path: "./fonts/geist-mono/geist-mono-cyrillic.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "geistMono" }, { prop: "unicode-range", value: "U+301,U+400-45F,U+490-491,U+4B0-4B1,U+2116" }],
});
const geistMonoSymbols2 = localFont({
  src: [
    { path: "./fonts/geist-mono/geist-mono-symbols2.woff2", weight: "500", style: "normal" },
    { path: "./fonts/geist-mono/geist-mono-symbols2.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "geistMono" }, { prop: "unicode-range", value: "U+2000-2001,U+2004-2008,U+200A,U+23B8-23BD,U+2500-259F" }],
});
const geistMonoVietnamese = localFont({
  src: [
    { path: "./fonts/geist-mono/geist-mono-vietnamese.woff2", weight: "500", style: "normal" },
    { path: "./fonts/geist-mono/geist-mono-vietnamese.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "geistMono" }, { prop: "unicode-range", value: "U+102-103,U+110-111,U+128-129,U+168-169,U+1A0-1A1,U+1AF-1B0,U+300-301,U+303-304,U+308-309,U+323,U+329,U+1EA0-1EF9,U+20AB" }],
});
const geistMonoLatinExt = localFont({
  src: [
    { path: "./fonts/geist-mono/geist-mono-latin-ext.woff2", weight: "500", style: "normal" },
    { path: "./fonts/geist-mono/geist-mono-latin-ext.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "geistMono" }, { prop: "unicode-range", value: "U+100-2BA,U+2BD-2C5,U+2C7-2CC,U+2CE-2D7,U+2DD-2FF,U+304,U+308,U+329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" }],
});
const geistMono = localFont({
  src: [
    { path: "./fonts/geist-mono/geist-mono-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/geist-mono/geist-mono-latin.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-mono",
  fallback: ["geistMono Fallback"],
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "geistMono" }, { prop: "unicode-range", value: "U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});

// Variabel CSS (--font-sans, --font-mono) hanya dipasang oleh panggilan
// subset latin. Subset lain cukup ikut dimuat supaya @font-face-nya masuk CSS.
export const fontVariables = [inter, geistMono]
  .map((font) => font.variable)
  .join(" ");

// Dirujuk supaya panggilan subset non-latin tidak dibuang sebagai impor tak terpakai.
export const fontSubsets = [
  interCyrillicExt,
  interCyrillic,
  interGreekExt,
  interGreek,
  interVietnamese,
  interLatinExt,
  geistMonoCyrillicExt,
  geistMonoCyrillic,
  geistMonoSymbols2,
  geistMonoVietnamese,
  geistMonoLatinExt,
];
