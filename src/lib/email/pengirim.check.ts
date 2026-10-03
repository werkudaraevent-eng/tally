import assert from "node:assert/strict";
import { fromWithName, senderAddress } from "./pengirim.ts";

const ENV = "Werkudara Event <registration@sofish.tech>";

// Temuan QA M1: koma dan kurung tanpa kutip memecah header From.
assert.equal(fromWithName("PT Nusa, Tbk (Panitia)", ENV), '"PT Nusa, Tbk (Panitia)" <registration@sofish.tech>');
assert.equal(fromWithName("Panitia A\\B", ENV), '"Panitia A\\\\B" <registration@sofish.tech>');
assert.equal(fromWithName("ILO Jakarta", "registration@sofish.tech"), '"ILO Jakarta" <registration@sofish.tech>');

// Kosong = pakai EMAIL_FROM apa adanya.
assert.equal(fromWithName(null, ENV), ENV);
assert.equal(fromWithName("  ", ENV), ENV);

assert.equal(senderAddress(ENV), "registration@sofish.tech");
assert.equal(senderAddress("registration@sofish.tech"), "registration@sofish.tech");

console.log("pengirim.check.ts OK");
