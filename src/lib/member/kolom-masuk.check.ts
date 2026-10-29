import assert from "node:assert/strict";
import { caraMasukPublik, KOLOM_MASUK_POLA, kolomMasukPublik, pilihanKolomMasuk, samakanIsian } from "./kolom-masuk.ts";

// Telepon: format apa pun dari nomor yang sama bertemu di satu bentuk.
for (const nomor of ["0812-3456-7890", "+62 812 3456 7890", "62812.3456.7890", "812 3456 7890", " (0812) 34567890 "]) {
  assert.equal(samakanIsian("phone", "tel", nomor), "081234567890", nomor);
}
// Pertanyaan berjenis Phone mengikuti aturan yang sama.
assert.equal(samakanIsian("x:hp_kantor", "tel", "+62 811-222-333"), "0811222333");
// Lainnya: tanpa spasi dan tanda baca, huruf kecil. NIK dengan titik = NIK polos.
assert.equal(samakanIsian("x:nik", "text", "3404.0123 4567-0001"), "3404012345670001");
assert.equal(samakanIsian("name", "text", "  Rina  Setiawati "), samakanIsian("name", "text", "rina setiawati"));
assert.equal(samakanIsian("email", "email", " Rina.S@KSO.co.id "), "rina.s@kso.co.id");
// Kosong dan bukan teks tidak pernah cocok dengan apa pun.
for (const kosong of ["", "   ", null, undefined, {}, ["a"]]) assert.equal(samakanIsian("x:nik", "text", kosong), "");
assert.equal(samakanIsian("x:nik", "text", "---"), "");

// Kolom yang boleh dipilih: bawaan + pertanyaan selain unggahan. Kode QR,
// perusahaan, dan jabatan tidak pernah ada di daftar.
const fields = [
  { key: "nik", label: "NIK", type: "text", required: false, placeholder: "16 digit" },
  { key: "ktp", label: "Foto KTP", type: "file", required: false },
  { key: "hp_kantor", label: "HP kantor", type: "tel", required: false },
  { key: "gender", label: "Gender", type: "radio", required: false, options: ["L", "P"] },
  { key: "ukuran", label: "Ukuran kaos", type: "select", required: false, options: ["S", "M"] },
  { key: "lahir", label: "Tanggal lahir", type: "date", required: false },
  { key: "setuju", label: "Setuju", type: "checkbox", required: false },
  { key: "no_pegawai", label: "No. pegawai", type: "number", required: false },
  { key: "email_kantor", label: "Email kantor", type: "email", required: false },
] as never;
const pilihan = pilihanKolomMasuk(fields).map((item) => item.id);
// Pilihan, tanggal, dan centang tidak bisa: jawabannya sedikit kemungkinan.
assert.deepEqual(pilihan, ["email", "phone", "name", "x:nik", "x:hp_kantor", "x:no_pegawai", "x:email_kantor"]);
for (const id of ["x:gender", "x:ukuran", "x:lahir", "x:setuju"]) assert.equal(kolomMasukPublik(id, fields, "id"), null, id);
// Pertanyaan berjenis Email disamakan seperti email: titiknya tetap.
assert.equal(samakanIsian("x:email_kantor", "email", " A.B@X.com"), "a.b@x.com");
for (const id of ["qr_code", "company", "title", "x:", "x:a-b", "x:a.b"]) assert.equal(KOLOM_MASUK_POLA.test(id), false, id);
assert.equal(kolomMasukPublik("x:ktp", fields, "id"), null);
assert.deepEqual(kolomMasukPublik("phone", fields, "en"), { label: "Phone number", jenis: "tel" });

// Cara masuk publik: kosong = kata sandi; dua kolom yang tidak lengkap juga kata sandi.
const acara = (member: unknown) => ({ landing_config: { member }, registration_form_config: { fields } });
assert.deepEqual(caraMasukPublik(acara({ enabled: true }), "id"), { jenis: "password" });
assert.deepEqual(caraMasukPublik(acara({ enabled: true, sign_in: "email_code" }), "id"), { jenis: "email_code" });
assert.deepEqual(caraMasukPublik(acara({ enabled: true, sign_in: "fields", sign_in_fields: ["phone", "x:nik"] }), "id"), {
  jenis: "fields",
  kolom: [{ label: "Nomor HP", jenis: "tel", contoh: null }, { label: "NIK", jenis: "text", contoh: "16 digit" }],
});
// Contoh isian: tulisan panitia dulu (English di halaman English, kosong =
// Indonesia), lalu bawaan Email dan placeholder pertanyaan form.
const contoh = (sign_in_examples: unknown, lang: "id" | "en") => {
  const cara = caraMasukPublik(acara({ enabled: true, sign_in: "fields", sign_in_fields: ["email", "x:nik"], sign_in_examples }), lang);
  return cara.jenis === "fields" ? cara.kolom.map((k) => k.contoh) : null;
};
assert.deepEqual(contoh(undefined, "id"), ["nama@perusahaan.com", "16 digit"]);
assert.deepEqual(contoh(undefined, "en"), ["name@company.com", "16 digit"]);
assert.deepEqual(contoh({ email: { text: "nama@scisi.com" }, "x:nik": { text: " ", en: "" } }, "en"), ["nama@scisi.com", "16 digit"]);
assert.deepEqual(contoh({ email: { text: "nama@scisi.com", en: "name@scisi.com" } }, "en"), ["name@scisi.com", "16 digit"]);
assert.deepEqual(pilihanKolomMasuk(fields).slice(0, 4).map((k) => k.contoh), ["nama@perusahaan.com", undefined, undefined, "16 digit"]);
assert.deepEqual(caraMasukPublik(acara({ enabled: true, sign_in: "fields", sign_in_fields: ["phone", "x:dihapus"] }), "id"), { jenis: "password" });
assert.deepEqual(caraMasukPublik(acara({ enabled: true, sign_in: "fields", sign_in_fields: ["phone", "phone"] }), "id"), { jenis: "password" });
assert.deepEqual(caraMasukPublik(acara({ enabled: true, sign_in: "fields" }), "id"), { jenis: "password" });

console.log("kolom-masuk ok");
