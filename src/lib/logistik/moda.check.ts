import assert from "node:assert/strict";
import { judulTiket, lompatTiket, modaTiket } from "./moda.ts";

assert.equal(modaTiket([]), null);
assert.equal(modaTiket([{ mode: "train" }, {}]), "train");
assert.equal(modaTiket([{ mode: "flight" }, { mode: "flight" }]), "flight");
assert.equal(modaTiket([{ mode: "flight" }, { mode: "train" }]), "campur");
// Kereta saja: teks lama persis.
assert.equal(judulTiket("id", [{ mode: "train" }], "Tiket kereta"), "Tiket kereta");
assert.equal(judulTiket("id", [{ mode: "flight" }], "Tiket kereta"), "Tiket pesawat");
assert.equal(judulTiket("en", [{ mode: "ship" }, { mode: "train" }], "Train tickets"), "Travel tickets");
assert.equal(lompatTiket("id", [{ mode: "train" }], "Kereta"), "Kereta");
assert.equal(lompatTiket("en", [{ mode: "flight" }], "Train"), "Flights");

console.log("logistik/moda ok");
