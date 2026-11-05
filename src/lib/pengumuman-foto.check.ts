import assert from "node:assert/strict";
import { altFotoPengumuman, awalanFotoPengumuman, fotoPengumumanSah } from "./pengumuman-foto.ts";

const SB = "https://abc.supabase.co";
const ok = `${SB}/storage/v1/object/public/display-assets/pengumuman/1730000000000-ab12.jpg`;

assert.equal(awalanFotoPengumuman(`${SB}/`), `${SB}/storage/v1/object/public/display-assets/pengumuman/`);
assert.equal(awalanFotoPengumuman(""), null);
assert.equal(fotoPengumumanSah(ok, SB), true);
assert.equal(fotoPengumumanSah(ok.replace(".jpg", ".webp"), SB), true);
// Folder lain di bucket yang sama, situs lain, path aneh: ditolak.
assert.equal(fotoPengumumanSah(ok.replace("/pengumuman/", "/logos/"), SB), false);
assert.equal(fotoPengumumanSah("https://evil.example/x.jpg", SB), false);
assert.equal(fotoPengumumanSah(`${SB}/storage/v1/object/public/display-assets/pengumuman/../logos/a.jpg`, SB), false);
assert.equal(fotoPengumumanSah(`${ok}?track=1`, SB), false);
assert.equal(fotoPengumumanSah(`${SB}/storage/v1/object/public/display-assets/pengumuman/a.gif`, SB), false);
assert.equal(fotoPengumumanSah(ok, undefined), false);
assert.equal(fotoPengumumanSah(`${ok}${"a".repeat(1000)}.jpg`, SB), false);

assert.equal(altFotoPengumuman({ image_alt: "  Tim di Peron 4 ", title: "Judul" }), "Tim di Peron 4");
assert.equal(altFotoPengumuman({ image_alt: " ", title: "Judul" }), "Judul");
assert.equal(altFotoPengumuman({ title: "Judul" }), "Judul");
console.log("pengumuman-foto ok");
