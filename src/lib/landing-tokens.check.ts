import assert from "node:assert/strict";
import { landingFontStyle, landingLayout, landingTokens } from "./landing-tokens.ts";
import type { EventLandingConfig } from "./domain.ts";

// Config kosong = tampilan sebelum token ada: bawaan per tata letak.
assert.deepEqual(landingTokens({}), { layout: "editorial", brand: "#2649D0", accent: null, secondary: null, headingFont: "serif", bodyFont: "sans" });
assert.deepEqual(landingTokens({ layout: "modern" }), { layout: "modern", brand: "#2649D0", accent: null, secondary: null, headingFont: "source", bodyFont: "sans" });
assert.deepEqual(landingTokens({ layout: "forum" }), { layout: "forum", brand: "#002f54", accent: "#ffc72c", secondary: "#00aeef", headingFont: "ubuntu", bodyFont: "ubuntu" });
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

// Bingkai formulir v2 memakai bawaan Modern walau halamannya Editorial.
assert.equal(landingTokens({}, "modern").headingFont, "source");

assert.deepEqual(landingFontStyle(landingTokens({ layout: "forum", heading_font: "grotesk" })), {
  "--landing-heading": "var(--font-grotesk)",
  "--landing-body": "var(--font-ubuntu)",
  fontSynthesisWeight: "none",
});

console.log("landing-tokens.check.ts OK");
