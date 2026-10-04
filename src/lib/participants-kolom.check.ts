import assert from "node:assert/strict";
import { kolomImpor } from "./participants-kolom.ts";

const tanpa = new Map<string, string>();
// Judul English dan Indonesia sama-sama dikenali.
assert.deepEqual(kolomImpor("Participant name", tanpa), { kind: "base", field: "name" });
assert.deepEqual(kolomImpor("Organisation", tanpa), { kind: "base", field: "company" });
assert.deepEqual(kolomImpor("No. HP", tanpa), { kind: "base", field: "phone" });
assert.deepEqual(kolomImpor("Mobile", tanpa), { kind: "base", field: "phone" });

// Pertanyaan tambahan berkunci sama dengan alias tetap jawaban tambahan.
const tambahan = new Map([["position", "position"], ["type", "type"], ["mobile", "mobile"], ["ukuran_kaos", "kaos"]]);
assert.deepEqual(kolomImpor("position", tambahan), { kind: "extra", key: "position" });
assert.deepEqual(kolomImpor("Type", tambahan), { kind: "extra", key: "type" });
assert.deepEqual(kolomImpor("mobile", tambahan), { kind: "extra", key: "mobile" });
assert.deepEqual(kolomImpor("Ukuran kaos", tambahan), { kind: "extra", key: "kaos" });
// Nama kolom bawaan yang persis tidak bisa direbut pertanyaan tambahan.
assert.deepEqual(kolomImpor("phone", new Map([["phone", "phone"]])), { kind: "base", field: "phone" });

console.log("participants-kolom.check: ok");
