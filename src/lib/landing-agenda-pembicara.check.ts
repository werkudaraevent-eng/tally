import assert from "node:assert/strict";
import { kelompokPeran, keteranganLengkap, keteranganPembicara, sisaKeterangan } from "./landing-agenda-pembicara.ts";
import type { LandingSpeaker } from "./domain.ts";

const luis: LandingSpeaker = { name: "Luis Treviño", company: "AFI", role: "Speaker" };
const nancy: LandingSpeaker = { name: "Nancy Wisjaja", company: "UNSGSA", role: "speaker" };
const andini: LandingSpeaker = { name: "Andini Effendi", title: "News Anchor", role: "Moderator" };
const tanpaPeran: LandingSpeaker = { name: "Simrin C. Singh", title: "Country Director", company: "ILO" };
const kosong = new Map<string, string>();

// Baris pertama di atas daftar nama menjadi subjudul; nama tertaut dan labelnya hilang.
// Catatan dalam kurung di baris satu pembicara pindah ke sebelah namanya.
assert.deepEqual(
  sisaKeterangan("Global framing: From Decent Work\nSpeakers:\nAFI - Luis Trevino\nUNSGSA - Nancy Wisjaja (online)\nModerator:\nAndini Effendi, News Anchor", [luis, nancy, andini]),
  { subjudul: "Global framing: From Decent Work", lain: null, catatan: new Map([["Nancy Wisjaja", "(online)"]]) },
);

// Baris yang tidak cocok dengan siapa pun tetap tampil, labelnya juga.
assert.deepEqual(
  sisaKeterangan("Speakers:\nAFI - Luis Trevino\nOJK - Dicky Kartikoyono", [luis]),
  { subjudul: null, lain: "Speakers:\nOJK - Dicky Kartikoyono", catatan: kosong },
);

// Catatan biasa tanpa nama bukan subjudul.
assert.deepEqual(sisaKeterangan("Ruang Ballroom A", [luis]), { subjudul: null, lain: "Ruang Ballroom A", catatan: kosong });
assert.deepEqual(sisaKeterangan("Simrin C. Singh, ILO Country Director", [tanpaPeran]), { subjudul: null, lain: null, catatan: kosong });
assert.deepEqual(sisaKeterangan(null, [luis]), { subjudul: null, lain: null, catatan: kosong });

// Nama sebagian kata tidak dianggap cocok ("Ann" di "Anna").
assert.equal(sisaKeterangan("Anna Lee", [{ name: "Ann" }]).lain, "Anna Lee");

// Rekan panel yang belum tertaut tidak ikut hilang.
assert.equal(sisaKeterangan("Moderator: Andini Effendi & Bayu Saputra (Kompas TV)", [andini]).lain, "Moderator: Andini Effendi & Bayu Saputra (Kompas TV)");
assert.equal(sisaKeterangan("Panel: Luis Trevino, Dewi Lestari, Rudi Hartono", [luis]).lain, "Panel: Luis Trevino, Dewi Lestari, Rudi Hartono");
// Topik yang menyebut pembicara tetap tampil.
assert.equal(sisaKeterangan("Keynote oleh Simrin C. Singh: Kerja layak untuk semua", [tanpaPeran]).lain, "Keynote oleh Simrin C. Singh: Kerja layak untuk semua");
// Nama satu kata tidak menyembunyikan orang lain yang namanya diawali kata itu.
assert.equal(sisaKeterangan("Budi Santoso - BRI\nBudi Gunawan - BNI", [{ name: "Budi", company: "Kemenkeu" }]).lain, "Budi Santoso - BRI\nBudi Gunawan - BNI");
// Dua pembicara tertaut di satu baris: dibuang.
assert.equal(sisaKeterangan("Luis Trevino dan Nancy Wisjaja", [luis, nancy]).lain, null);

// Gelar dan sapaan tidak menghalangi kecocokan, di nama maupun di Details.
const hendra: LandingSpeaker = { name: "Dr. Ir. Hendra Wijaya, M.Sc.", company: "Kemenko" };
assert.equal(sisaKeterangan("Hendra Wijaya - Kemenko", [hendra]).lain, null);
assert.equal(sisaKeterangan("Ricky Satria, S.E., M.M. - BI", [{ name: "Ricky Satria", company: "BI" }]).lain, null);

// Label tanpa titik dua tetap label, bukan subjudul.
assert.deepEqual(sisaKeterangan("Pembicara\nLuis Trevino - AFI\nModerator\nAndini Effendi", [luis, andini]), { subjudul: null, lain: null, catatan: kosong });

// Kelompok per peran, tanpa beda huruf besar; Moderator paling akhir; tanpa peran
// menyatu dengan label bawaan, "Speaker" dan "Speakers" satu kelompok.
const grup = kelompokPeran([andini, luis, tanpaPeran, nancy], "Speakers");
assert.deepEqual(grup.map((g) => [g.label, g.orang.map((o) => o.name)]), [
  ["Speakers", ["Luis Treviño", "Simrin C. Singh", "Nancy Wisjaja"]],
  ["Moderator", ["Andini Effendi"]],
]);
assert.deepEqual(kelompokPeran([tanpaPeran, { name: "B", role: "Pembicara" }], "Pembicara").map((g) => g.orang.length), [2]);
// Moderator di /en dikenali dari peran Indonesia; Co-moderator juga moderator.
const host: LandingSpeaker = { name: "H", role: "Host", role_id: "Moderator" };
const co: LandingSpeaker = { name: "C", role: "Co-moderator" };
assert.deepEqual(kelompokPeran([host, co, luis], "Speakers").map((g) => g.label), ["Speakers", "Host", "Co-moderator"]);

// Baris kedua satu keterangan: instansi, atau jabatan bila tanpa instansi.
assert.equal(keteranganPembicara(tanpaPeran), "ILO");
assert.equal(keteranganPembicara(andini), "News Anchor");
assert.equal(keteranganPembicara({ name: "X" }), "");
assert.equal(keteranganLengkap(tanpaPeran), "Country Director, ILO");

console.log("landing-agenda-pembicara ok");
