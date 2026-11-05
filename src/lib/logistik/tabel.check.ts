import assert from "node:assert/strict";
import { bandingAlami, cocokCari, cocokSel, hitungSel, keCsv, selCsv, urutBaris } from "./tabel.ts";

// Dua seri label tidak berselang-seling.
const label = ["RY002", "RY01", "RY10", "RY001", "RY02", "RY9"];
assert.deepEqual([...label].sort(bandingAlami), ["RY9", "RY01", "RY02", "RY10", "RY001", "RY002"]);
assert.ok(bandingAlami("1208", "907") > 0);
assert.ok(bandingAlami("Bus 2", "Bus 10") < 0);
assert.equal(bandingAlami("GH20", "gh20"), 0);

// Kosong di akhir, ke dua arah; seri stabil.
const b = [{ v: "" }, { v: "B" }, { v: "A" }, { v: "B" }];
assert.deepEqual(urutBaris(b, (x) => x.v, "asc").map((x) => x.v), ["A", "B", "B", ""]);
assert.deepEqual(urutBaris(b, (x) => x.v, "desc").map((x) => x.v), ["B", "B", "A", ""]);
assert.equal(urutBaris(b, (x) => x.v, "asc")[1], b[1]);

// Sel bernilai banyak.
assert.equal(cocokSel(["Andi", "Budi"], { k: "x", in: ["Budi"] }), true);
assert.equal(cocokSel(["Andi"], { k: "x", in: ["Budi"] }), false);
assert.equal(cocokSel([], { k: "x", in: [""] }), true);
assert.equal(cocokSel([], { k: "x", kosong: true }), true);
assert.equal(cocokSel(["", " "], { k: "x", kosong: true }), true);
assert.equal(cocokSel(["Andi"], { k: "x", kosong: false }), true);
assert.equal(cocokSel(["Andi Saputra"], { k: "x", has: "sapu" }), true);

// Cari: semua kata, kolom mana saja.
assert.equal(cocokCari(["RY01", "Andi Saputra", "Cabang Medan"], "andi medan"), true);
assert.equal(cocokCari(["RY01", "Andi Saputra"], "andi medan"), false);
assert.equal(cocokCari(["x"], "  "), true);

// Hitungan: satu baris dihitung sekali per nilai.
assert.deepEqual(hitungSel([{ o: ["A", "A"] }, { o: [] }, { o: ["B", "A"] }], (x) => x.o), [
  { value: "A", count: 2 }, { value: "B", count: 1 }, { value: "", count: 1 },
]);

// CSV aman untuk Excel.
assert.equal(selCsv("=SUM(A1)"), "'=SUM(A1)");
assert.equal(selCsv('a "b", c'), '"a ""b"", c"');
assert.equal(keCsv(["Room", "Occupant"], [[["1208"], ["Andi", "Budi"]]]), "﻿Room,Occupant\r\n1208,\"Andi; Budi\"\r\n");

console.log("logistik/tabel ok");
