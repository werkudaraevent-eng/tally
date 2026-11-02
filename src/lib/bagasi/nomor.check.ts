import assert from "node:assert/strict";
import { kunciBaruNomorBagasi, kunciNomorBagasi, nomorBagasi, pertahankanNomorBagasi } from "./nomor.ts";

const fields = [
  { key: "nomor_luggage", label: "Nomor Luggage", type: "text" as const, required: false, on_form: false },
  { key: "foto", label: "Foto", type: "file" as const, required: false },
];

assert.equal(kunciNomorBagasi({ fields, luggage_number_field: "nomor_luggage" }), "nomor_luggage");
assert.equal(kunciNomorBagasi({ fields }), null);
// Pertanyaan yang dihapus atau jenis yang tidak cocok: tidak berlaku, tanpa galat.
assert.equal(kunciNomorBagasi({ fields, luggage_number_field: "hilang" }), null);
assert.equal(kunciNomorBagasi({ fields, luggage_number_field: "foto" }), null);
assert.equal(kunciNomorBagasi(null), null);

assert.equal(nomorBagasi("nomor_luggage", { nomor_luggage: "  045 " }), "045");
assert.equal(nomorBagasi("nomor_luggage", { nomor_luggage: 45 }), "45");
assert.equal(nomorBagasi("nomor_luggage", { nomor_luggage: "" }), null);
assert.equal(nomorBagasi("nomor_luggage", { nomor_luggage: ["a"] }), null);
assert.equal(nomorBagasi("nomor_luggage", null), null);
assert.equal(nomorBagasi(null, { nomor_luggage: "045" }), null);

assert.equal(pertahankanNomorBagasi({ luggage_number_field: "nomor_luggage" }, fields), "nomor_luggage");
assert.equal(pertahankanNomorBagasi({ luggage_number_field: "nomor_luggage" }, [fields[1]]), undefined);
assert.equal(pertahankanNomorBagasi({ luggage_number_field: "nomor_luggage" }, [{ ...fields[0], type: "file" }]), undefined);
assert.equal(pertahankanNomorBagasi(null, fields), undefined);

assert.equal(kunciBaruNomorBagasi({ fields }), "luggage_number");
assert.equal(kunciBaruNomorBagasi({ fields: [{ ...fields[0], key: "luggage_number" }], retired_keys: ["luggage_number_2"] }), "luggage_number_3");

console.log("bagasi/nomor OK");
