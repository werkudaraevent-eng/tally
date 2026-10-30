import assert from "node:assert/strict";
import { angkaTelepon, cocokCari, kataCari, kolomCari, kunciTelepon } from "./cari-peserta.ts";

const fields = [
  { key: "batch", label: "Batch", type: "select" as const, required: true, options: ["Batch 1", "Batch 2"] },
  { key: "diet", label: "Dietary requirements", type: "text" as const, required: false },
  { key: "wa", label: "WhatsApp", type: "tel" as const, required: false },
  { key: "ukuran", label: "Shoe size", type: "number" as const, required: false },
  { key: "setuju", label: "I agree", type: "checkbox" as const, required: true },
  { key: "tiba", label: "Arrival date", type: "date" as const, required: false },
  { key: "ktp", label: "ID card", type: "file" as const, required: false },
];

type Baris = Record<string, unknown> & { extra: Record<string, unknown> };
const nilai = (b: Baris, kunci: string) => {
  const v = kunci.startsWith("field:") ? b.extra[kunci.slice(6)] : b[kunci];
  return v === null || v === undefined ? "" : String(v);
};
const budi: Baris = {
  name: "Budi Santoso", company: "PT Maju", title: "Manager", email: "budi@maju.co.id", phone: "+62 812-3456-7890",
  participant_type: "VIP", qr_code: "KSO-0042",
  extra: { batch: "Batch 2", diet: "Vegetarian", wa: "0813 1111 2222", ukuran: 42, setuju: "true", tiba: "2026-11-06", ktp: "https://x/ktp.jpg" },
};

const admin = kolomCari(fields, { qr: true });
const kustom = kolomCari(fields, { qr: false });
const telp = kunciTelepon(fields);
const cari = (q: string, kolom = admin) => cocokCari(budi, kataCari(q), kolom, nilai, telp)?.map((k) => k.key) ?? null;

// Kolom yang dicari: tanpa centang, tanggal, file. QR hanya admin.
assert.deepEqual(admin.map((k) => k.key), ["name", "company", "title", "email", "phone", "participant_type", "qr_code", "field:batch", "field:diet", "field:wa", "field:ukuran"]);
assert.ok(!kustom.some((k) => k.key === "qr_code"));
assert.deepEqual([...telp], ["phone", "field:wa"]);

// Kosong cocok semua; huruf besar-kecil diabaikan.
assert.deepEqual(cari(""), []);
assert.deepEqual(cari("VEGETARIAN"), ["field:diet"]);
// Kata 1-2 huruf hanya di awal kata, dan kata di bawah 4 huruf tidak dicari di
// nomor telepon: "2" ketemu "Batch 2", bukan "+62", "2222", atau "0042".
assert.deepEqual(cari("batch 2"), ["field:batch"]);
assert.equal(cari("batch 12"), null);
// Angka pendek harus utuh: "batch 1" bukan Batch 12 (QA #344 M2).
const b12 = { ...budi, name: "Ani 15", extra: { ...budi.extra, batch: "Batch 12" } };
assert.equal(cocokCari(b12, kataCari("batch 1"), admin, nilai, telp), null);
assert.deepEqual(cocokCari(b12, kataCari("batch 12"), admin, nilai, telp)?.map((k) => k.key), ["field:batch"]);
assert.deepEqual(cari("bu"), ["name", "email"]);
assert.equal(cari("di"), null);
assert.equal(cari("+6"), null);
assert.deepEqual(cari("+62 8"), null);
// Semua kata harus ketemu, boleh di kolom berbeda.
assert.deepEqual(cari("budi vegetarian"), ["name", "email", "field:diet"]);
assert.equal(cari("budi vegan"), null);
// Angka jawaban ikut dicari; centang, tanggal, dan file tidak.
assert.deepEqual(cari("42"), ["field:ukuran"]);
assert.deepEqual(cari("0042"), ["qr_code"]);
assert.equal(cari("true"), null);
assert.equal(cari("2026-11"), null);
assert.equal(cari("ktp.jpg"), null);
// QR: admin ya, peran kustom tidak (QA #341 H1).
assert.deepEqual(cari("kso-0042"), ["qr_code"]);
assert.equal(cari("kso-0042", kustom), null);
assert.equal(cari("0042", kustom), null);
// Telepon dicocokkan angkanya: 0812 = +62 812, spasi dan strip diabaikan.
assert.equal(angkaTelepon("0812-3456"), "628123456");
assert.equal(angkaTelepon("+62 812"), "62812");
// Excel membuang 0 di depan: "81299887766" tersimpan tanpa 0 (QA #344 M1).
assert.equal(angkaTelepon("81299887766"), "6281299887766");
const tanpaNol = { ...budi, phone: "81299887766" };
for (const q of ["081299887766", "0812 9988 7766", "+6281299887766", "9988", "8877"]) {
  assert.deepEqual(cocokCari(tanpaNol, kataCari(q), admin, nilai, telp)?.map((k) => k.key), ["phone"], q);
}
// Potongan tengah nomor tetap ketemu walau diawali 8.
assert.deepEqual(cari("8901"), null);
assert.deepEqual(cari("8123"), ["phone"]);
assert.deepEqual(cari("08123456"), ["phone"]);
assert.deepEqual(cari("+6281311112222"), ["field:wa"]);
assert.deepEqual(cari("3456-7890"), ["phone"]);
// Di bawah 4 angka nomor telepon tidak dicari.
assert.equal(cari("081"), null);
assert.deepEqual(cari("0813"), ["field:wa"]);
// Batas 8 kata.
assert.equal(kataCari("a b c d e f g h i j").length, 8);

console.log("cari-peserta.check: ok");
