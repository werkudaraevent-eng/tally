import assert from "node:assert/strict";
import { LANDING_CARD_ICON_POLA, LANDING_CARD_ICON_SARAN, ikonKartu, labelIkon, nadaKartu } from "./landing-card-icons.ts";
import { latarBagian } from "./landing-section-tone.ts";

// Tanpa pilihan: sama dengan sebelum ikon bisa dipilih (#107).
assert.deepEqual([0, 1, 2, 3].map((i) => ikonKartu({}, i)), ["Users", "MapPin", "Lightning", "Heart"]);
assert.deepEqual([0, 1, 2, 3].map((i) => nadaKartu({}, i)), ["button", "brand", "accent", "button"]);
assert.equal(ikonKartu({ icon: "Rocket" }, 0), "Rocket");
// Nama yang tidak berbentuk nama komponen jatuh ke bawaan.
assert.equal(ikonKartu({ icon: "<script>" }, 1), "MapPin");
assert.equal(nadaKartu({ tone: "pink" }, 2), "accent");
assert.equal(labelIkon("MapTrifold"), "Map");
assert.equal(labelIkon("CalendarPlus"), "Calendar plus");
for (const item of LANDING_CARD_ICON_SARAN) assert.ok(LANDING_CARD_ICON_POLA.test(item.nama), item.nama);
assert.equal(new Set(LANDING_CARD_ICON_SARAN.map((item) => item.nama)).size, LANDING_CARD_ICON_SARAN.length);
assert.equal(latarBagian("agenda", undefined), "panel");
assert.equal(latarBagian("about", undefined), "light");
assert.equal(latarBagian("about", { about: "dark" }), "dark");
console.log("landing-card-icons: ok");
