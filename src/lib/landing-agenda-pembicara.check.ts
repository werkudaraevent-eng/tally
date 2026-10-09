import assert from "node:assert/strict";
import { kelompokPeran, keteranganPembicara, sisaKeterangan } from "./landing-agenda-pembicara.ts";
import type { LandingSpeaker } from "./domain.ts";

const luis: LandingSpeaker = { name: "Luis Treviño", company: "AFI", role: "Speaker" };
const nancy: LandingSpeaker = { name: "Nancy Wisjaja", company: "UNSGSA", role: "speaker" };
const andini: LandingSpeaker = { name: "Andini Effendi", title: "News Anchor", role: "Moderator" };
const tanpaPeran: LandingSpeaker = { name: "Simrin C. Singh", title: "Country Director", company: "ILO" };

// Baris pertama di atas daftar nama menjadi subjudul; nama tertaut dan labelnya hilang.
assert.deepEqual(
  sisaKeterangan("Global framing: From Decent Work\nSpeakers:\nAFI - Luis Trevino\nUNSGSA - Nancy Wisjaja (online)\nModerator:\nAndini Effendi, News Anchor", [luis, nancy, andini]),
  { subjudul: "Global framing: From Decent Work", lain: null },
);

// Baris yang tidak cocok dengan siapa pun tetap tampil, labelnya juga.
assert.deepEqual(
  sisaKeterangan("Speakers:\nAFI - Luis Trevino\nOJK - Dicky Kartikoyono", [luis]),
  { subjudul: null, lain: "Speakers:\nOJK - Dicky Kartikoyono" },
);

// Catatan biasa tanpa nama bukan subjudul.
assert.deepEqual(sisaKeterangan("Ruang Ballroom A", [luis]), { subjudul: null, lain: "Ruang Ballroom A" });
assert.deepEqual(sisaKeterangan("Simrin C. Singh, ILO Country Director", [tanpaPeran]), { subjudul: null, lain: null });
assert.deepEqual(sisaKeterangan(null, [luis]), { subjudul: null, lain: null });

// Nama sebagian kata tidak dianggap cocok ("Ann" di "Anna").
assert.deepEqual(sisaKeterangan("Anna Lee", [{ name: "Ann" }]), { subjudul: null, lain: "Anna Lee" });

// Kelompok per peran, tanpa beda huruf besar; Moderator paling akhir; tanpa peran = label bawaan.
const grup = kelompokPeran([andini, luis, tanpaPeran, nancy], "Speakers");
assert.deepEqual(grup.map((g) => [g.label, g.orang.map((o) => o.name)]), [
  ["Speaker", ["Luis Treviño", "Nancy Wisjaja"]],
  ["Speakers", ["Simrin C. Singh"]],
  ["Moderator", ["Andini Effendi"]],
]);

assert.equal(keteranganPembicara(tanpaPeran), "Country Director, ILO");
assert.equal(keteranganPembicara({ name: "X" }), "");

console.log("landing-agenda-pembicara ok");
