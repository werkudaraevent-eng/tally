import assert from "node:assert/strict";
import { DAFTAR_JENIS_BLOK, JENIS_BLOK, LABEL_KELOMPOK_BLOK, adaJenisBlok, definisiBlok, petaJenisBlok } from "./jenis.ts";

// Satu entri per jenis, tanpa duplikat.
assert.equal(new Set(DAFTAR_JENIS_BLOK).size, JENIS_BLOK.length);

// Urutan dialog Tambah blok sama dengan sebelum daftar ini ada (0 px di dialog).
assert.deepEqual([...DAFTAR_JENIS_BLOK], ["text_image", "multicolumn", "cards", "points", "stats", "logos", "download", "cta", "countdown", "gallery", "quote", "route", "dos_donts", "dress_code"]);

for (const jenis of JENIS_BLOK) {
  assert.match(jenis.type, /^[a-z_]+$/, `${jenis.type}: type is snake_case`);
  assert.ok(jenis.label.trim(), `${jenis.type}: label`);
  // Deskripsi satu kalimat lengkap, tampil di dialog Tambah blok.
  assert.match(jenis.description, /^[A-Z0-9].*\.$/, `${jenis.type}: description is a sentence`);
  assert.ok(LABEL_KELOMPOK_BLOK[jenis.kelompok], `${jenis.type}: group has a label`);
  if ("butir" in jenis) assert.match(jenis.butir, /^[a-z]+$/, `${jenis.type}: item noun is one lowercase word`);
}

// Jenis tanpa kartu peserta tidak boleh menawarkan "Participant page".
assert.equal(definisiBlok("dos_donts").peserta, false);
assert.equal(definisiBlok("dress_code").peserta, false);
assert.equal(definisiBlok("route").peserta, true);

// Peta turunan sama persis dengan nilai yang dulu ditulis tangan di domain.ts.
assert.deepEqual(petaJenisBlok("latar"), { text_image: "light", cards: "light", points: "light", gallery: "panel", stats: "dark", quote: "light", logos: "light", download: "panel", cta: "light", multicolumn: "light", route: "panel", countdown: "dark", dos_donts: "panel", dress_code: "panel" });
assert.equal(petaJenisBlok("label").stats, "Figures strip");
assert.equal(petaJenisBlok("butir").quote, undefined);

assert.equal(adaJenisBlok("cards"), true);
assert.equal(adaJenisBlok("hero"), false);
assert.throws(() => definisiBlok("hero" as never));

console.log("blok/jenis ok");
