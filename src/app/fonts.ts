import localFont from "next/font/local";
import "./fonts/fallback.css";

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
// `spaceGrotesk`, ...), bukan nama aslinya: Turbopack menulis nilai variabel CSS
// dari nama konstanta, bukan dari `declarations`. Tidak ada kode yang merujuk
// nama keluarga secara langsung; semuanya lewat var(--font-*).
//
// Hanya subset latin yang di-preload (sama dengan perilaku next/font/google).
// Fallback berukuran (`inter Fallback` dst.) ditulis di fonts/fallback.css
// dengan angka yang sama persis dengan yang dulu dihasilkan next/font/google;
// adjustFontFallback dimatikan supaya next/font/local tidak menghitung ulang.
//
// Bobot: keluarga selain Inter dideklarasikan per bobot (mis. 600, 700, 800),
// bukan rentang, walau berkasnya font variabel. Ini meniru CSS Google: bobot di
// antara angka itu (mis. 650) dibulatkan ke face terdekat, bukan diinterpolasi.
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
// Montserrat
const montserratCyrillicExt = localFont({
  src: [
    { path: "./fonts/montserrat/montserrat-cyrillic-ext.woff2", weight: "600", style: "normal" },
    { path: "./fonts/montserrat/montserrat-cyrillic-ext.woff2", weight: "700", style: "normal" },
    { path: "./fonts/montserrat/montserrat-cyrillic-ext.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "montserrat" }, { prop: "unicode-range", value: "U+460-52F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F" }],
});
const montserratCyrillic = localFont({
  src: [
    { path: "./fonts/montserrat/montserrat-cyrillic.woff2", weight: "600", style: "normal" },
    { path: "./fonts/montserrat/montserrat-cyrillic.woff2", weight: "700", style: "normal" },
    { path: "./fonts/montserrat/montserrat-cyrillic.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "montserrat" }, { prop: "unicode-range", value: "U+301,U+400-45F,U+490-491,U+4B0-4B1,U+2116" }],
});
const montserratVietnamese = localFont({
  src: [
    { path: "./fonts/montserrat/montserrat-vietnamese.woff2", weight: "600", style: "normal" },
    { path: "./fonts/montserrat/montserrat-vietnamese.woff2", weight: "700", style: "normal" },
    { path: "./fonts/montserrat/montserrat-vietnamese.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "montserrat" }, { prop: "unicode-range", value: "U+102-103,U+110-111,U+128-129,U+168-169,U+1A0-1A1,U+1AF-1B0,U+300-301,U+303-304,U+308-309,U+323,U+329,U+1EA0-1EF9,U+20AB" }],
});
const montserratLatinExt = localFont({
  src: [
    { path: "./fonts/montserrat/montserrat-latin-ext.woff2", weight: "600", style: "normal" },
    { path: "./fonts/montserrat/montserrat-latin-ext.woff2", weight: "700", style: "normal" },
    { path: "./fonts/montserrat/montserrat-latin-ext.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "montserrat" }, { prop: "unicode-range", value: "U+100-2BA,U+2BD-2C5,U+2C7-2CC,U+2CE-2D7,U+2DD-2FF,U+304,U+308,U+329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" }],
});
const montserrat = localFont({
  src: [
    { path: "./fonts/montserrat/montserrat-latin.woff2", weight: "600", style: "normal" },
    { path: "./fonts/montserrat/montserrat-latin.woff2", weight: "700", style: "normal" },
    { path: "./fonts/montserrat/montserrat-latin.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
  variable: "--font-geometric",
  fallback: ["montserrat Fallback"],
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "montserrat" }, { prop: "unicode-range", value: "U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});
// Oswald
const oswaldCyrillicExt = localFont({
  src: [
    { path: "./fonts/oswald/oswald-cyrillic-ext.woff2", weight: "500", style: "normal" },
    { path: "./fonts/oswald/oswald-cyrillic-ext.woff2", weight: "600", style: "normal" },
    { path: "./fonts/oswald/oswald-cyrillic-ext.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "oswald" }, { prop: "unicode-range", value: "U+460-52F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F" }],
});
const oswaldCyrillic = localFont({
  src: [
    { path: "./fonts/oswald/oswald-cyrillic.woff2", weight: "500", style: "normal" },
    { path: "./fonts/oswald/oswald-cyrillic.woff2", weight: "600", style: "normal" },
    { path: "./fonts/oswald/oswald-cyrillic.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "oswald" }, { prop: "unicode-range", value: "U+301,U+400-45F,U+490-491,U+4B0-4B1,U+2116" }],
});
const oswaldVietnamese = localFont({
  src: [
    { path: "./fonts/oswald/oswald-vietnamese.woff2", weight: "500", style: "normal" },
    { path: "./fonts/oswald/oswald-vietnamese.woff2", weight: "600", style: "normal" },
    { path: "./fonts/oswald/oswald-vietnamese.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "oswald" }, { prop: "unicode-range", value: "U+102-103,U+110-111,U+128-129,U+168-169,U+1A0-1A1,U+1AF-1B0,U+300-301,U+303-304,U+308-309,U+323,U+329,U+1EA0-1EF9,U+20AB" }],
});
const oswaldLatinExt = localFont({
  src: [
    { path: "./fonts/oswald/oswald-latin-ext.woff2", weight: "500", style: "normal" },
    { path: "./fonts/oswald/oswald-latin-ext.woff2", weight: "600", style: "normal" },
    { path: "./fonts/oswald/oswald-latin-ext.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "oswald" }, { prop: "unicode-range", value: "U+100-2BA,U+2BD-2C5,U+2C7-2CC,U+2CE-2D7,U+2DD-2FF,U+304,U+308,U+329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" }],
});
const oswald = localFont({
  src: [
    { path: "./fonts/oswald/oswald-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/oswald/oswald-latin.woff2", weight: "600", style: "normal" },
    { path: "./fonts/oswald/oswald-latin.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-condensed",
  fallback: ["oswald Fallback"],
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "oswald" }, { prop: "unicode-range", value: "U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});
// Space Grotesk
const spaceGroteskVietnamese = localFont({
  src: [
    { path: "./fonts/space-grotesk/space-grotesk-vietnamese.woff2", weight: "500", style: "normal" },
    { path: "./fonts/space-grotesk/space-grotesk-vietnamese.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "spaceGrotesk" }, { prop: "unicode-range", value: "U+102-103,U+110-111,U+128-129,U+168-169,U+1A0-1A1,U+1AF-1B0,U+300-301,U+303-304,U+308-309,U+323,U+329,U+1EA0-1EF9,U+20AB" }],
});
const spaceGroteskLatinExt = localFont({
  src: [
    { path: "./fonts/space-grotesk/space-grotesk-latin-ext.woff2", weight: "500", style: "normal" },
    { path: "./fonts/space-grotesk/space-grotesk-latin-ext.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "spaceGrotesk" }, { prop: "unicode-range", value: "U+100-2BA,U+2BD-2C5,U+2C7-2CC,U+2CE-2D7,U+2DD-2FF,U+304,U+308,U+329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" }],
});
const spaceGrotesk = localFont({
  src: [
    { path: "./fonts/space-grotesk/space-grotesk-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/space-grotesk/space-grotesk-latin.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-grotesk",
  fallback: ["spaceGrotesk Fallback"],
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "spaceGrotesk" }, { prop: "unicode-range", value: "U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});
// Playfair Display
const playfairDisplayCyrillic = localFont({
  src: [
    { path: "./fonts/playfair-display/playfair-display-cyrillic.woff2", weight: "600", style: "normal" },
    { path: "./fonts/playfair-display/playfair-display-cyrillic.woff2", weight: "700", style: "normal" },
    { path: "./fonts/playfair-display/playfair-display-cyrillic.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "playfairDisplay" }, { prop: "unicode-range", value: "U+301,U+400-45F,U+490-491,U+4B0-4B1,U+2116" }],
});
const playfairDisplayVietnamese = localFont({
  src: [
    { path: "./fonts/playfair-display/playfair-display-vietnamese.woff2", weight: "600", style: "normal" },
    { path: "./fonts/playfair-display/playfair-display-vietnamese.woff2", weight: "700", style: "normal" },
    { path: "./fonts/playfair-display/playfair-display-vietnamese.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "playfairDisplay" }, { prop: "unicode-range", value: "U+102-103,U+110-111,U+128-129,U+168-169,U+1A0-1A1,U+1AF-1B0,U+300-301,U+303-304,U+308-309,U+323,U+329,U+1EA0-1EF9,U+20AB" }],
});
const playfairDisplayLatinExt = localFont({
  src: [
    { path: "./fonts/playfair-display/playfair-display-latin-ext.woff2", weight: "600", style: "normal" },
    { path: "./fonts/playfair-display/playfair-display-latin-ext.woff2", weight: "700", style: "normal" },
    { path: "./fonts/playfair-display/playfair-display-latin-ext.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "playfairDisplay" }, { prop: "unicode-range", value: "U+100-2BA,U+2BD-2C5,U+2C7-2CC,U+2CE-2D7,U+2DD-2FF,U+304,U+308,U+329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" }],
});
const playfairDisplay = localFont({
  src: [
    { path: "./fonts/playfair-display/playfair-display-latin.woff2", weight: "600", style: "normal" },
    { path: "./fonts/playfair-display/playfair-display-latin.woff2", weight: "700", style: "normal" },
    { path: "./fonts/playfair-display/playfair-display-latin.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
  variable: "--font-serif",
  fallback: ["playfairDisplay Fallback"],
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "playfairDisplay" }, { prop: "unicode-range", value: "U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});
// Source Sans 3
const sourceSans3CyrillicExt = localFont({
  src: [
    { path: "./fonts/source-sans-3/source-sans-3-cyrillic-ext.woff2", weight: "400", style: "normal" },
    { path: "./fonts/source-sans-3/source-sans-3-cyrillic-ext.woff2", weight: "600", style: "normal" },
    { path: "./fonts/source-sans-3/source-sans-3-cyrillic-ext.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "sourceSans3" }, { prop: "unicode-range", value: "U+460-52F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F" }],
});
const sourceSans3Cyrillic = localFont({
  src: [
    { path: "./fonts/source-sans-3/source-sans-3-cyrillic.woff2", weight: "400", style: "normal" },
    { path: "./fonts/source-sans-3/source-sans-3-cyrillic.woff2", weight: "600", style: "normal" },
    { path: "./fonts/source-sans-3/source-sans-3-cyrillic.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "sourceSans3" }, { prop: "unicode-range", value: "U+301,U+400-45F,U+490-491,U+4B0-4B1,U+2116" }],
});
const sourceSans3GreekExt = localFont({
  src: [
    { path: "./fonts/source-sans-3/source-sans-3-greek-ext.woff2", weight: "400", style: "normal" },
    { path: "./fonts/source-sans-3/source-sans-3-greek-ext.woff2", weight: "600", style: "normal" },
    { path: "./fonts/source-sans-3/source-sans-3-greek-ext.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "sourceSans3" }, { prop: "unicode-range", value: "U+1F??" }],
});
const sourceSans3Greek = localFont({
  src: [
    { path: "./fonts/source-sans-3/source-sans-3-greek.woff2", weight: "400", style: "normal" },
    { path: "./fonts/source-sans-3/source-sans-3-greek.woff2", weight: "600", style: "normal" },
    { path: "./fonts/source-sans-3/source-sans-3-greek.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "sourceSans3" }, { prop: "unicode-range", value: "U+370-377,U+37A-37F,U+384-38A,U+38C,U+38E-3A1,U+3A3-3FF" }],
});
const sourceSans3Vietnamese = localFont({
  src: [
    { path: "./fonts/source-sans-3/source-sans-3-vietnamese.woff2", weight: "400", style: "normal" },
    { path: "./fonts/source-sans-3/source-sans-3-vietnamese.woff2", weight: "600", style: "normal" },
    { path: "./fonts/source-sans-3/source-sans-3-vietnamese.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "sourceSans3" }, { prop: "unicode-range", value: "U+102-103,U+110-111,U+128-129,U+168-169,U+1A0-1A1,U+1AF-1B0,U+300-301,U+303-304,U+308-309,U+323,U+329,U+1EA0-1EF9,U+20AB" }],
});
const sourceSans3LatinExt = localFont({
  src: [
    { path: "./fonts/source-sans-3/source-sans-3-latin-ext.woff2", weight: "400", style: "normal" },
    { path: "./fonts/source-sans-3/source-sans-3-latin-ext.woff2", weight: "600", style: "normal" },
    { path: "./fonts/source-sans-3/source-sans-3-latin-ext.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "sourceSans3" }, { prop: "unicode-range", value: "U+100-2BA,U+2BD-2C5,U+2C7-2CC,U+2CE-2D7,U+2DD-2FF,U+304,U+308,U+329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" }],
});
const sourceSans3 = localFont({
  src: [
    { path: "./fonts/source-sans-3/source-sans-3-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/source-sans-3/source-sans-3-latin.woff2", weight: "600", style: "normal" },
    { path: "./fonts/source-sans-3/source-sans-3-latin.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-source",
  fallback: ["sourceSans3 Fallback"],
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "sourceSans3" }, { prop: "unicode-range", value: "U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});
// Ubuntu (tata letak Forum, Figma IFC). Berbeda dengan keluarga lain di sini,
// Ubuntu bukan font variabel: Google memberi satu berkas per bobot, jadi `src`
// menunjuk berkas yang berbeda untuk 400, 500, dan 700. Lisensi: UFL.txt.
const ubuntuCyrillicExt = localFont({
  src: [
    { path: "./fonts/ubuntu/ubuntu-cyrillic-ext-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ubuntu/ubuntu-cyrillic-ext-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ubuntu/ubuntu-cyrillic-ext-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "ubuntu" }, { prop: "unicode-range", value: "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F" }],
});
const ubuntuCyrillic = localFont({
  src: [
    { path: "./fonts/ubuntu/ubuntu-cyrillic-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ubuntu/ubuntu-cyrillic-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ubuntu/ubuntu-cyrillic-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "ubuntu" }, { prop: "unicode-range", value: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116" }],
});
const ubuntuGreekExt = localFont({
  src: [
    { path: "./fonts/ubuntu/ubuntu-greek-ext-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ubuntu/ubuntu-greek-ext-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ubuntu/ubuntu-greek-ext-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "ubuntu" }, { prop: "unicode-range", value: "U+1F00-1FFF" }],
});
const ubuntuGreek = localFont({
  src: [
    { path: "./fonts/ubuntu/ubuntu-greek-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ubuntu/ubuntu-greek-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ubuntu/ubuntu-greek-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "ubuntu" }, { prop: "unicode-range", value: "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF" }],
});
const ubuntuLatinExt = localFont({
  src: [
    { path: "./fonts/ubuntu/ubuntu-latin-ext-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ubuntu/ubuntu-latin-ext-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ubuntu/ubuntu-latin-ext-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "ubuntu" }, { prop: "unicode-range", value: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" }],
});
const ubuntu = localFont({
  src: [
    { path: "./fonts/ubuntu/ubuntu-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ubuntu/ubuntu-latin-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ubuntu/ubuntu-latin-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-ubuntu",
  fallback: ["ubuntu Fallback"],
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "ubuntu" }, { prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});
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

// Variabel CSS (--font-sans, --font-geometric, ...) hanya dipasang oleh panggilan
// subset latin. Subset lain cukup ikut dimuat supaya @font-face-nya masuk CSS.
export const fontVariables = [inter, montserrat, oswald, spaceGrotesk, playfairDisplay, sourceSans3, ubuntu, geistMono]
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
  montserratCyrillicExt,
  montserratCyrillic,
  montserratVietnamese,
  montserratLatinExt,
  oswaldCyrillicExt,
  oswaldCyrillic,
  oswaldVietnamese,
  oswaldLatinExt,
  spaceGroteskVietnamese,
  spaceGroteskLatinExt,
  playfairDisplayCyrillic,
  playfairDisplayVietnamese,
  playfairDisplayLatinExt,
  sourceSans3CyrillicExt,
  sourceSans3Cyrillic,
  sourceSans3GreekExt,
  sourceSans3Greek,
  sourceSans3Vietnamese,
  sourceSans3LatinExt,
  ubuntuCyrillicExt,
  ubuntuCyrillic,
  ubuntuGreekExt,
  ubuntuGreek,
  ubuntuLatinExt,
  geistMonoCyrillicExt,
  geistMonoCyrillic,
  geistMonoSymbols2,
  geistMonoVietnamese,
  geistMonoLatinExt,
];
