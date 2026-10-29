import assert from "node:assert/strict";
import { bacaSetelanPanitia, bolehPantau, masihDalamMasa, tipeTermasuk } from "./akses-panitia.ts";

assert.equal(bacaSetelanPanitia(null), null);
assert.equal(bacaSetelanPanitia({ types: [] }), null);
assert.equal(bacaSetelanPanitia({ types: ["  "] }), null);
assert.deepEqual(bacaSetelanPanitia({ types: ["Panitia", " Panitia ", 3], hidden: ["cp-1", "sesi-2", "x-3", "cp-"] }), { types: ["Panitia"], hidden: ["cp-1", "sesi-2"] });

const s = { types: ["Panitia", "Koordinator  Bus"], hidden: [] };
assert.equal(tipeTermasuk(s, "panitia"), true);
assert.equal(tipeTermasuk(s, "PANITIA "), true);
assert.equal(tipeTermasuk(s, "koordinator bus"), true);
assert.equal(tipeTermasuk(s, "Panitia inti"), false);
assert.equal(tipeTermasuk(s, ""), false);
assert.equal(tipeTermasuk(s, null), false);

const acara = { event_date: "2026-11-06", end_date: "2026-11-08" };
assert.equal(masihDalamMasa(acara, "2026-10-29"), true);
assert.equal(masihDalamMasa(acara, "2026-11-09"), true);
assert.equal(masihDalamMasa(acara, "2026-11-10"), false);
assert.equal(masihDalamMasa({ event_date: "2026-12-31", end_date: null }, "2027-01-01"), true);
assert.equal(masihDalamMasa({ event_date: "2026-12-31", end_date: null }, "2027-01-02"), false);
assert.equal(masihDalamMasa({ event_date: null }, "2030-01-01"), true);

const member = { committee: { types: ["Panitia"], hidden: ["cp-9"] } };
assert.deepEqual(bolehPantau(member, { participant_type: "panitia" }, acara, "2026-11-07"), { types: ["Panitia"], hidden: ["cp-9"] });
assert.equal(bolehPantau(member, { participant_type: "VIP" }, acara, "2026-11-07"), null);
assert.equal(bolehPantau(member, null, acara, "2026-11-07"), null);
assert.equal(bolehPantau(member, { participant_type: "Panitia" }, acara, "2026-11-12"), null);
assert.equal(bolehPantau({}, { participant_type: "Panitia" }, acara, "2026-11-07"), null);

console.log("akses-panitia ok");
