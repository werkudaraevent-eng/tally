import assert from "node:assert/strict";
import { bacaKursor, bacaStatus, kutip, ringkasPindaian, saringSetelah, tulisKursor } from "./daftar-hadir.ts";

const ID = "aaaaaaaa-0000-4000-8000-000000000001";

assert.equal(bacaStatus("hadir"), "hadir");
assert.equal(bacaStatus("belum"), "belum");
assert.equal(bacaStatus(null), "belum");
assert.equal(bacaStatus("apa"), "belum");

// Kursor bolak-balik, termasuk nama dengan koma, kutip dan huruf non-ASCII.
for (const n of ["Budi Santoso", "Budi, S.E. (BCA)", 'Ana "Nana"', "Ségolène \\ Ä"]) {
  assert.deepEqual(bacaKursor(tulisKursor({ n, i: ID })), { n, i: ID });
}
assert.equal(bacaKursor(null), null);
assert.equal(bacaKursor(""), null);
assert.equal(bacaKursor("bukan-base64-json"), null);
assert.equal(bacaKursor(tulisKursor({ n: "A", i: "1; drop" })), null, "id must be a uuid");
assert.equal(bacaKursor(Buffer.from(JSON.stringify({ n: 5, i: ID })).toString("base64url")), null);
assert.equal(bacaKursor(tulisKursor({ n: "x".repeat(501), i: ID })), null);

assert.equal(kutip("Budi"), '"Budi"');
assert.equal(kutip('A "B"'), '"A \\"B\\""');
assert.equal(kutip("C\\D"), '"C\\\\D"');
assert.equal(
  saringSetelah({ n: "Budi, S.E. (BCA)", i: ID }),
  `name.gt."Budi, S.E. (BCA)",and(name.eq."Budi, S.E. (BCA)",id.gt.${ID})`,
);

assert.deepEqual(ringkasPindaian(null), { scan_count: 0, first_scan_at: null });
assert.deepEqual(
  ringkasPindaian([{ scanned_at: "2026-11-06T03:00:00Z" }, { scanned_at: "2026-11-06T01:00:00Z" }]),
  { scan_count: 2, first_scan_at: "2026-11-06T01:00:00Z" },
);

console.log("daftar-hadir.check: ok");
