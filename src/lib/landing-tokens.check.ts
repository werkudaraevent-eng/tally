import assert from "node:assert/strict";
import { landingFontStyle, landingFontUrls, landingLayout, landingTokens } from "./landing-tokens.ts";
import { readFileSync, existsSync } from "node:fs";
import { LANDING_BODY_FONTS, LANDING_HEADING_FONTS } from "./domain.ts";
import type { EventLandingConfig } from "./domain.ts";
import type { LandingTokens } from "./landing-tokens.ts";
import { LANDING_THEME_PRESETS, gayaPreset, presetCocok, presetDiubah, terapkanPreset } from "./landing-theme-presets.ts";

const pick = (t: LandingTokens) => [t.heroAlign, t.heroPosition];

// Config kosong = tampilan sebelum token ada: bawaan per tata letak.
const polos = { bodyFontChosen: false, corners: "soft", heroAlign: "left" } as const;
assert.deepEqual(landingTokens({}), { layout: "editorial", brand: "#2649D0", accent: null, secondary: null, headingFont: "serif", bodyFont: "sans", ...polos, heroPosition: "bottom" });
assert.deepEqual(landingTokens({ layout: "modern" }), { layout: "modern", brand: "#2649D0", accent: null, secondary: null, headingFont: "source", bodyFont: "sans", ...polos, heroPosition: "middle" });
assert.deepEqual(landingTokens({ layout: "forum" }), { layout: "forum", brand: "#002f54", accent: "#ffc72c", secondary: "#00aeef", headingFont: "ubuntu", bodyFont: "ubuntu", ...polos, heroPosition: "bottom" });
assert.deepEqual(landingTokens(null), landingTokens({}));

// Tata letak tak dikenal dirender sebagai Editorial (render-landing.tsx).
assert.equal(landingLayout({ layout: "lain" as EventLandingConfig["layout"] }), "editorial");

// Gathering hanya di Modern; aksen bawaannya emas.
assert.equal(landingTokens({ layout: "modern", gathering: true }).accent, "#E9C46A");
assert.equal(landingTokens({ layout: "modern", gathering: true, accent: "#2a9d8f" }).accent, "#2a9d8f");
assert.equal(landingTokens({ gathering: true, accent: "#2a9d8f" }).accent, null);
assert.equal(landingTokens({ layout: "modern", accent: "#2a9d8f" }).accent, null);

// Warna yang bukan #rrggbb jatuh ke bawaan, sama dengan modernThemeStyle dan forumThemeStyle.
assert.equal(landingTokens({ layout: "modern", theme: { seed: "biru" } }).brand, "#2649D0");
assert.equal(landingTokens({ layout: "modern", theme: { seed: "#fff" } }).brand, "#2649D0");
assert.equal(landingTokens({ layout: "forum", theme: { seed: "#0B6E69" }, forum: { accent: "x", secondary: "#264653" } }).accent, "#ffc72c");
assert.equal(landingTokens({ layout: "forum", theme: { seed: "#0B6E69" } }).brand, "#0B6E69");

// Huruf judul: pilihan admin menang; kunci tak dikenal (termasuk nama properti Object) jatuh ke bawaan.
assert.equal(landingTokens({ layout: "forum", heading_font: "serif" }).headingFont, "serif");
assert.equal(landingTokens({ heading_font: "toString" as EventLandingConfig["heading_font"] }).headingFont, "serif");
assert.equal(landingTokens({ heading_font: null as unknown as EventLandingConfig["heading_font"] }).headingFont, "serif");

// Hero Modern: kiri-bawah dengan KV, kiri-tengah tanpa KV, tengah-tengah untuk gathering; pilihan admin menang.
assert.deepEqual(pick(landingTokens({ layout: "modern", banner_url: "https://x/kv.jpg" })), ["left", "bottom"]);
assert.deepEqual(pick(landingTokens({ layout: "modern", gathering: true, banner_url: "https://x/kv.jpg" })), ["center", "middle"]);
assert.deepEqual(pick(landingTokens({ layout: "modern", gathering: true, hero_align: "left", hero_position: "bottom" })), ["left", "bottom"]);
assert.deepEqual(pick(landingTokens({ layout: "modern", hero_align: "center" })), ["center", "middle"]);
// Editorial dan Forum tidak membaca perataan hero.
assert.deepEqual(pick(landingTokens({ hero_align: "center", hero_position: "middle" })), ["left", "bottom"]);
assert.deepEqual(pick(landingTokens({ layout: "forum", hero_align: "center" })), ["left", "bottom"]);

// Sudut: Forum tidak membacanya; nilai tak dikenal = soft.
assert.equal(landingTokens({ layout: "forum", corners: "round" }).corners, "soft");
assert.equal(landingTokens({ corners: "bulat" as EventLandingConfig["corners"] }).corners, "soft");
assert.equal(landingFontStyle(landingTokens({ layout: "modern", corners: "square" }))["--md-sys-shape-corner-medium" as "color"], "0px");
assert.equal("--md-sys-shape-corner-medium" in landingFontStyle(landingTokens({ layout: "modern" })), false);

// Huruf isi: hanya huruf isi yang terdaftar; tanpa pilihan, tidak ada font-family di akar.
assert.equal(landingTokens({ layout: "modern", body_font: "source" }).bodyFont, "source");
assert.equal(landingTokens({ layout: "modern", body_font: "serif" as EventLandingConfig["body_font"] }).bodyFont, "sans");
assert.equal(landingFontStyle(landingTokens({ layout: "modern", body_font: "source" })).fontFamily, "var(--landing-body)");
assert.equal("fontFamily" in landingFontStyle(landingTokens({ layout: "modern" })), false);

assert.deepEqual(landingFontStyle(landingTokens({ layout: "forum", heading_font: "grotesk" })), {
  "--landing-heading": "var(--font-grotesk)",
  "--landing-body": "var(--font-ubuntu)",
  fontSynthesisWeight: "none",
});


// Formulir v2 acara Editorial berbingkai Modern, tapi huruf judulnya tetap serif Editorial.
assert.equal(landingTokens({}, "modern").headingFont, "serif");
assert.equal(landingTokens({ layout: "modern" }, "modern").headingFont, "source");

// Preset: Apply menulis semua token gaya; perataan hero dan isi tidak disentuh (QA #90 M2).
const [conference, forumIfc, gatheringPreset] = LANDING_THEME_PRESETS;
const ifc = terapkanPreset(forumIfc, { layout: "modern", body_font: "source", corners: "round", hero_align: "center", public_name: "X" });
assert.deepEqual(pick(landingTokens(ifc)), ["left", "bottom"]); // Forum tidak membaca hero
assert.equal(ifc.hero_align, "center");
assert.equal(ifc.public_name, "X");
assert.equal(landingTokens(ifc).bodyFont, "ubuntu");
assert.equal(ifc.body_font, undefined);
assert.equal(ifc.corners, undefined);
assert.equal(presetCocok(forumIfc, ifc) && !presetDiubah(forumIfc, ifc), true);
const gath = terapkanPreset(gatheringPreset, { layout: "forum", body_font: "source", corners: "square" });
assert.equal(presetCocok(gatheringPreset, gath) && !presetDiubah(gatheringPreset, gath), true);
assert.equal(landingTokens(gath).corners, "soft");
assert.equal(landingTokens(gath).accent?.toLowerCase(), "#e9c46a");
// Satu token berubah = Edited; Reset (gayaPreset) mengembalikannya tanpa mengubah fitur.
const diubah = { ...gath, corners: "round" as const };
assert.equal(presetCocok(gatheringPreset, diubah), true);
assert.equal(presetDiubah(gatheringPreset, diubah), true);
assert.equal(presetDiubah(gatheringPreset, gayaPreset(gatheringPreset, diubah)), false);
// Conference: config kosong Modern sudah sama dengan bundelnya.
assert.equal(presetCocok(conference, { layout: "modern" }) && !presetDiubah(conference, { layout: "modern" }), true);
assert.equal(presetCocok(conference, gath), false);

// Preload per acara: hanya huruf judulnya, plus huruf isi pilihan admin. Forum: Ubuntu 700 saja.
assert.deepEqual(landingFontUrls(landingTokens({ layout: "modern" })), ["/fonts/v1/source-sans-3/source-sans-3-latin.woff2"]);
assert.deepEqual(landingFontUrls(landingTokens({})), ["/fonts/v1/playfair-display/playfair-display-latin.woff2"]);
assert.deepEqual(landingFontUrls(landingTokens({ layout: "forum" })), ["/fonts/v1/ubuntu/ubuntu-latin-700.woff2"]);
assert.deepEqual(landingFontUrls(landingTokens({ layout: "modern", heading_font: "sans" })), []);
assert.deepEqual(landingFontUrls(landingTokens({ layout: "modern", heading_font: "sourceserif", body_font: "sourceserif" })), ["/fonts/v1/source-serif-4/source-serif-4-latin.woff2"]);
assert.deepEqual(landingFontUrls(landingTokens({ layout: "modern", heading_font: "fraunces", body_font: "jakarta" })), [
  "/fonts/v1/fraunces/fraunces-latin.woff2",
  "/fonts/v1/plus-jakarta-sans/plus-jakarta-sans-latin.woff2",
]);

// Setiap huruf di registri: variabelnya ditulis landing.css (atau fonts.ts untuk
// Inter), dan berkas preload-nya ada di public/ serta dirujuk @font-face.
const css = readFileSync(new URL("../app/fonts/landing.css", import.meta.url), "utf8");
for (const [key, font] of Object.entries(LANDING_HEADING_FONTS)) {
  const nama = font.cssVar.slice(4, -1);
  assert.ok(key === "sans" || css.includes(`\t${nama}: `), `${key}: ${nama} tidak ada di landing.css`);
  for (const url of landingFontUrls({ headingFont: key as keyof typeof LANDING_HEADING_FONTS, bodyFont: "sans", bodyFontChosen: false })) {
    assert.ok(existsSync(new URL(`../../public${url}`, import.meta.url)), `${key}: ${url} tidak ada`);
    assert.ok(css.includes(`url(${url})`), `${key}: ${url} tidak dirujuk landing.css`);
  }
}
for (const key of LANDING_BODY_FONTS) {
  for (const url of landingFontUrls({ headingFont: "sans", bodyFont: key, bodyFontChosen: true })) {
    assert.ok(existsSync(new URL(`../../public${url}`, import.meta.url)) && css.includes(`url(${url})`), `isi ${key}: ${url}`);
  }
}

// Warna tombol: hanya preset Gathering yang mengisinya; preset lain mengosongkannya,
// jadi acara non-gathering tidak pernah membawa warna tombol (PR gaya aplikasi).
{
  const gathering = LANDING_THEME_PRESETS.find((p) => p.key === "gathering")!;
  const conference = LANDING_THEME_PRESETS.find((p) => p.key === "modern")!;
  const g = terapkanPreset(gathering, {});
  assert.equal(g.button_color, "#007F50");
  assert.equal(presetDiubah(gathering, g), false);
  assert.equal(presetDiubah(gathering, { ...g, button_color: "#123456" }), true);
  assert.equal(terapkanPreset(conference, g).button_color, undefined);
}


// Preset Gathering = rancangan pen.dev: navy, emas, hijau, bilah atas putih penuh.
// Preset lain hanya melepas putih Gathering; warna bilah pilihan admin tetap.
{
  const gathering = LANDING_THEME_PRESETS.find((p) => p.key === "gathering")!;
  const conference = LANDING_THEME_PRESETS.find((p) => p.key === "modern")!;
  const g = terapkanPreset(gathering, { nav: { logo_url: "https://x/logo.png", height: 72 } });
  assert.equal(landingTokens(g).brand.toLowerCase(), "#1b2d57");
  assert.deepEqual(g.nav, { logo_url: "https://x/logo.png", height: 82, color: "#ffffff", opacity: 100 });
  assert.equal(presetDiubah(gathering, g), false);
  assert.equal(presetDiubah(gathering, { ...g, nav: { ...g.nav, opacity: 72 } }), true);
  assert.equal(presetDiubah(gathering, { ...g, nav: { ...g.nav, height: 64 } }), true);
  assert.deepEqual(terapkanPreset(conference, g).nav, { logo_url: "https://x/logo.png" });
  // Tinggi yang diubah admin setelah Gathering tetap saat pindah preset.
  assert.deepEqual(terapkanPreset(conference, { ...g, nav: { ...g.nav, height: 72 } }).nav, { logo_url: "https://x/logo.png", height: 72 });
  // Reset di Conference tidak menyentuh bilah putih pilihan admin (QA #106 L1).
  const putihSendiri = { layout: "modern" as const, nav: { color: "#ffffff", opacity: 100 } };
  assert.deepEqual(gayaPreset(conference, putihSendiri).nav, { color: "#ffffff", opacity: 100 });
  assert.deepEqual(terapkanPreset(forumIfc, putihSendiri).nav, { color: "#ffffff", opacity: 100 });
  assert.equal(terapkanPreset(conference, terapkanPreset(gathering, {})).nav, undefined);
  assert.deepEqual(terapkanPreset(conference, { nav: { color: "#223344", opacity: 90 } }).nav, { color: "#223344", opacity: 90 });
}
console.log("landing-tokens.check.ts OK");
