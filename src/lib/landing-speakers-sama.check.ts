import assert from "node:assert/strict";
import { samaJson } from "./landing-speakers-sama.ts";

// Urutan kunci dari jsonb berbeda dengan yang dikirim klien: tetap sama.
assert.ok(samaJson([{ name: "A", role: "Speaker", session_refs: [{ id: 1, label: "S1" }] }], [{ session_refs: [{ label: "S1", id: 1 }], role: "Speaker", name: "A" }]));
// Kunci undefined sama dengan kunci yang tidak ada (JSON.stringify membuangnya).
assert.ok(samaJson({ name: "A", title: undefined }, { name: "A" }));
// null bukan undefined: photo_url null tersimpan sebagai null.
assert.ok(!samaJson({ name: "A", photo_url: null }, { name: "A" }));
// Urutan larik penting: urutan pembicara adalah data.
assert.ok(!samaJson([{ name: "A" }, { name: "B" }], [{ name: "B" }, { name: "A" }]));
assert.ok(!samaJson([{ name: "A" }], [{ name: "A" }, { name: "B" }]));
assert.ok(!samaJson({ pos: 1 }, { pos: "1" }));
assert.ok(!samaJson([], {}));
assert.ok(samaJson([], []));
assert.ok(samaJson(undefined, undefined));
assert.ok(!samaJson(undefined, []));
console.log("landing-speakers-sama ok");
