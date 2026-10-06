import assert from "node:assert/strict";
import { landingFontStyle, landingLayout, landingTokens } from "./landing-tokens.ts";
import type { EventLandingConfig } from "./domain.ts";
import type { LandingTokens } from "./landing-tokens.ts";

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

console.log("landing-tokens.check.ts OK");

// Formulir v2 acara Editorial berbingkai Modern, tapi huruf judulnya tetap serif Editorial.
assert.equal(landingTokens({}, "modern").headingFont, "serif");
assert.equal(landingTokens({ layout: "modern" }, "modern").headingFont, "source");
