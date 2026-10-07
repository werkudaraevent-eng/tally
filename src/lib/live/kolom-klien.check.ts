import assert from "node:assert/strict";
import { kolomJawabanKlien, rapikanPersetujuan, setujuiKunci, statusPertanyaanKlien, tanpaPersetujuanKlien, teksJawaban } from "./kolom-klien.ts";

const sesi = { key: "pertanyaan_baru_2", label: "Session choice", type: "radio" as const, required: false, options: ["A", "B"] };
const nik = { key: "nik", label: "NIK", type: "text" as const, required: true };
const ktp = { key: "ktp", label: "ID card", type: "file" as const, required: false };
const disetujui = [{ key: "pertanyaan_baru_2", label: "Session choice", type: "radio" as const }];

// Dibagikan selama pertanyaannya sama persis.
assert.deepEqual(kolomJawabanKlien({ fields: [sesi, nik], client_fields: disetujui }).map((k) => k.key), ["pertanyaan_baru_2"]);
// Bawaan: tidak ada yang dibagikan; kunci polos (bentuk lama) juga tidak.
assert.deepEqual(kolomJawabanKlien({ fields: [sesi, nik] }), []);
assert.deepEqual(kolomJawabanKlien({ fields: [sesi, nik], client_fields: ["pertanyaan_baru_2", "nik"] }), []);

// H1: dihapus, lalu pertanyaan baru mendapat kunci yang sama dengan judul lain -> tertutup.
const paspor = { key: "pertanyaan_baru_2", label: "Passport number", type: "text" as const, required: true };
assert.deepEqual(kolomJawabanKlien({ fields: [paspor], client_fields: disetujui }), []);
assert.equal(statusPertanyaanKlien({ fields: [paspor], client_fields: disetujui })[0].status, "changed");
assert.equal(statusPertanyaanKlien({ fields: [paspor], client_fields: disetujui })[0].approvedLabel, "Session choice");
// Ganti judul saja, atau jenis saja -> tertutup.
assert.deepEqual(kolomJawabanKlien({ fields: [{ ...sesi, label: "Session" }], client_fields: disetujui }), []);
assert.deepEqual(kolomJawabanKlien({ fields: [{ ...sesi, type: "select" as const }], client_fields: disetujui }), []);
// Jenis berkas tidak pernah dibagikan, bahkan dengan persetujuan yang cocok.
assert.deepEqual(kolomJawabanKlien({ fields: [ktp], client_fields: [{ key: "ktp", label: "ID card", type: "file" }] }), []);
assert.deepEqual(statusPertanyaanKlien({ fields: [ktp] }), []);

// Menyetujui: judul/jenis saat ini, urutan form, tanpa duplikat; kunci asing dan berkas ditolak.
assert.deepEqual(setujuiKunci({ fields: [sesi, nik, ktp] }, ["nik", "pertanyaan_baru_2", "nik"]).approvals, [
  { key: "pertanyaan_baru_2", label: "Session choice", type: "radio" },
  { key: "nik", label: "NIK", type: "text" },
]);
assert.deepEqual(setujuiKunci({ fields: [sesi, nik, ktp] }, ["ktp", "hilang"]).unknown, ["ktp", "hilang"]);

// Penyunting form: persetujuan pertanyaan yang dihapus dibuang, yang diubah dibiarkan.
assert.deepEqual(rapikanPersetujuan(disetujui, [nik]), undefined);
assert.deepEqual(rapikanPersetujuan(disetujui, [paspor]), disetujui);
assert.deepEqual(rapikanPersetujuan(undefined, [nik]), undefined);

// Kotak centang: Yes / No.
const centang = { key: "gala", label: "Gala", type: "checkbox" as const };
assert.equal(teksJawaban(centang, "true"), "Yes");
assert.equal(teksJawaban(centang, ""), "No");
assert.equal(teksJawaban(centang, undefined), "No");
assert.equal(teksJawaban({ key: "x", label: "X", type: "text" }, null), "");

// Duplikasi acara: persetujuan tidak ikut, isi form lain tetap.
assert.deepEqual(tanpaPersetujuanKlien({ fields: [sesi], theme: { seed: "#123456" }, client_fields: disetujui }), { fields: [sesi], theme: { seed: "#123456" } });
assert.equal(tanpaPersetujuanKlien({ fields: [sesi] }), null);
assert.equal(tanpaPersetujuanKlien(null), null);
assert.deepEqual(kolomJawabanKlien(tanpaPersetujuanKlien({ fields: [sesi], client_fields: disetujui })), []);

console.log("kolom-klien: ok");
