import assert from "node:assert/strict";
import { kolomImporAi, rapikanBaris, rapikanNilai, selKeCsv, skemaKeluaran } from "./peserta-impor.ts";

const fields = [
  { key: "batch", label: "Batch", type: "select", options: ["Batch 1", "Batch 2"] },
  { key: "diet", label: "Dietary needs", type: "radio", options: ["None", "Halal"] },
  { key: "ktp", label: "KTP", type: "file" },
  { key: "ikut", label: "Ikut doorprize", type: "checkbox" },
  { key: "umur", label: "Umur", type: "number", min: 17 },
  { key: "lahir", label: "Tanggal lahir", type: "date" },
  { key: "kota asal", label: "Kota asal", type: "text" },
];

const kolom = kolomImporAi(fields);
// Bawaan dulu, lalu pertanyaan form; unggahan berkas tidak ikut.
assert.deepEqual(kolom.map((k) => k.header), ["qr_code", "name", "company", "title", "email", "phone", "participant_type", "rsvp_status", "batch", "diet", "ikut", "umur", "lahir", "kota asal"]);
// Kunci yang tidak aman untuk skema mendapat nama urut, judul berkasnya tetap kuncinya.
const kota = kolom.find((k) => k.header === "kota asal");
assert.ok(kota && /^field_\d+$/.test(kota.prop));
const skema = skemaKeluaran(kolom);
assert.equal(skema.properties.rows.items.required.length, kolom.length);

const pilih = kolom.find((k) => k.header === "batch")!;
assert.equal(rapikanNilai(pilih, "batch 2"), "Batch 2");
assert.equal(rapikanNilai(pilih, "Batch 3"), null);
assert.equal(rapikanNilai(pilih, "  "), "");
const centang = kolom.find((k) => k.header === "ikut")!;
assert.equal(rapikanNilai(centang, "Ya"), "true");
assert.equal(rapikanNilai(centang, "tidak"), null);
const umur = kolom.find((k) => k.header === "umur")!;
assert.equal(rapikanNilai(umur, "35"), "35");
assert.equal(rapikanNilai(umur, "12"), null);
assert.equal(rapikanNilai(umur, "tiga puluh"), null);
const lahir = kolom.find((k) => k.header === "lahir")!;
assert.equal(rapikanNilai(lahir, "5/11/1990"), "1990-11-05");
assert.equal(rapikanNilai(lahir, "1990-11-05"), "1990-11-05");
assert.equal(rapikanNilai(lahir, "31/02/1990"), null);
const email = kolom.find((k) => k.header === "email")!;
assert.equal(rapikanNilai(email, "Budi@Example.COM"), "budi@example.com");
assert.equal(rapikanNilai(email, "budi at example"), null);
const rsvp = kolom.find((k) => k.header === "rsvp_status")!;
assert.equal(rapikanNilai(rsvp, "Hadir"), "confirmed");
assert.equal(rapikanNilai(rsvp, "maybe"), null);

const hasil = rapikanBaris(kolom, [
  { name: "Budi Santoso", company: "Bank Nusantara", batch: "Batch 3", diet: "halal", email: "budi@x.id" },
  { name: "", company: "Total" },
  { name: "Ani", batch: "Batch 9" },
]);
assert.equal(hasil.orang, 2);
assert.equal(hasil.tanpaNama, 1);
assert.deepEqual(hasil.dikosongkan, [{ label: "Batch", jumlah: 2, contoh: "Batch 3" }]);
const budi = hasil.sel[1];
assert.equal(budi[kolom.findIndex((k) => k.header === "diet")], "Halal");
assert.equal(budi[kolom.findIndex((k) => k.header === "batch")], "");

assert.equal(selKeCsv([["name", "company"], ['Budi "B"', "A, B"]]), '"name","company"\r\n"Budi ""B""","A, B"');

console.log("peserta-impor: ok");
