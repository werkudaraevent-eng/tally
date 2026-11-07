import assert from "node:assert/strict";
import { inisialAcara, namaPendek, warnaTeksDi } from "./ikon.ts";

assert.equal(inisialAcara("KSO 24 · Fly Beyond Limit"), "KSO");
assert.equal(inisialAcara("Gathering Klasik 2026"), "GK");
assert.equal(inisialAcara("Forum IFC 2026"), "FI");
assert.equal(inisialAcara("2026 Annual Meeting"), "AM");
assert.equal(inisialAcara("ünïcode acara"), "UA");
assert.equal(inisialAcara("2026"), "20");
assert.equal(inisialAcara(""), "T");

assert.equal(namaPendek("Gathering"), "Gathering");
assert.equal(namaPendek("KSO 24 · Fly Beyond Limit"), "KSO 24");
assert.equal(namaPendek("Konferensi Modern 2026"), "Konferensi");
assert.equal(namaPendek("Supercalifragilistic"), "Supercalifra");

assert.equal(warnaTeksDi("#0B182D"), "#ffffff");
assert.equal(warnaTeksDi("#E8C968"), "#1b1b1f");
assert.equal(warnaTeksDi("salah"), "#ffffff");
