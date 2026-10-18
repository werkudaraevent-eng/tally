import assert from "node:assert/strict";
import { bacaSaringan, bacaSaringanMentah, cocokSatu, cocokSemua, hitungNilai, kolomSaringanAdmin, kolomSaringanKlien, urutKursi, urutMenurut } from "./saringan-kolom.ts";

const fields = [
  { key: "sesi", label: "Which breakout session?", type: "select" as const, required: true, options: ["BR 1", "BR 2"] },
  { key: "diet", label: "Dietary requirements", type: "text" as const, required: false },
  { key: "tiba", label: "Arrival date", type: "date" as const, required: false },
  { key: "ktp", label: "ID card", type: "file" as const, required: false },
];
const admin = kolomSaringanAdmin(fields);
const json = (v: unknown) => JSON.stringify(v);

// Kunci tidak dikenal dan bentuk yang salah jenis dibuang, bukan dipakai.
assert.deepEqual(bacaSaringan(json([{ k: "field:sesi", in: ["BR 1"] }, { k: "field:nope", in: ["x"] }, { k: "field:diet", in: ["x"] }]), admin), [{ k: "field:sesi", in: ["BR 1"] }]);
assert.deepEqual(bacaSaringan(json([{ k: "field:diet", has: "  veg " }]), admin), [{ k: "field:diet", has: "veg" }]);
assert.deepEqual(bacaSaringan(json([{ k: "registered_at", from: "2026-10-01", to: "bukan" }]), admin), [{ k: "registered_at", from: "2026-10-01" }]);
assert.deepEqual(bacaSaringan(json([{ k: "field:sesi", in: [] }]), admin), []);
assert.equal(bacaSaringan("{", admin), null);
assert.equal(bacaSaringan(json(Array.from({ length: 11 }, () => ({ k: "title", has: "a" }))), admin), null);
assert.deepEqual(bacaSaringan(null, admin), []);

// Layar klien: hanya jawaban yang dibagikan, tanpa QR code.
const klien = kolomSaringanKlien([{ key: "sesi", label: "Which breakout session?", type: "select" }]);
assert.deepEqual(bacaSaringan(json([{ k: "answer:diet", has: "veg" }, { k: "qr_code", has: "REG" }, { k: "field:sesi", in: ["BR 1"] }]), klien), []);
assert.deepEqual(bacaSaringan(json([{ k: "answer:sesi", in: ["BR 1"] }]), klien), [{ k: "answer:sesi", in: ["BR 1"] }]);

// Cocok.
assert.equal(cocokSatu(" BR 1 ", { k: "x", in: ["BR 1"] }), true);
assert.equal(cocokSatu("", { k: "x", in: [""] }), true);
assert.equal(cocokSatu("Vegetarian", { k: "x", has: "VEG" }), true);
assert.equal(cocokSatu("2026-10-05", { k: "x", from: "2026-10-01", to: "2026-10-05" }), true);
assert.equal(cocokSatu("2026-10-06", { k: "x", from: "2026-10-01", to: "2026-10-05" }), false);
assert.equal(cocokSatu("", { k: "x", from: "2026-10-01" }), false);
const baris = { a: "BR 1", b: "veg" };
assert.equal(cocokSemua(baris, [{ k: "a", in: ["BR 1"] }, { k: "b", has: "x" }], (r, k) => r[k as "a" | "b"]), false);

// Nilai: "" (kosong) selalu terakhir.
assert.deepEqual(hitungNilai([{ v: "B" }, { v: "" }, { v: "A" }, { v: "B" }], "v", (r) => r.v), [{ value: "A", count: 1 }, { value: "B", count: 2 }, { value: "", count: 1 }]);

console.log("saringan-kolom ok");

// Tautan rusak tidak boleh meruntuhkan halaman (QA #130 M3).
assert.deepEqual(bacaSaringanMentah(json([{ k: "field:sesi", in: null }, { k: "title", has: 5 }, { k: "a", in: ["x", 3] }, { k: "a", in: ["y"] }, null, "x"])), [{ k: "a", in: ["x"] }]);
assert.deepEqual(bacaSaringanMentah("{rusak"), []);
assert.deepEqual(bacaSaringanMentah(json({ k: "title" })), []);
console.log("saringan-kolom mentah ok");

// Seat: kosong / terisi, urutan alami, tanpa kursi di akhir (ke dua arah).
assert.ok(admin.some((k) => k.key === "seat" && k.jenis === "teks"));
assert.deepEqual(bacaSaringan(json([{ k: "seat", kosong: true }]), admin), [{ k: "seat", kosong: true }]);
assert.deepEqual(bacaSaringan(json([{ k: "seat", kosong: "ya" }]), admin), []);
assert.deepEqual(bacaSaringanMentah(json([{ k: "seat", kosong: false }])), [{ k: "seat", kosong: false }]);
assert.equal(cocokSatu("", { k: "seat", kosong: true }), true);
assert.equal(cocokSatu("A1", { k: "seat", kosong: true }), false);
assert.equal(cocokSatu("A1", { k: "seat", kosong: false }), true);
assert.equal(cocokSatu("A1, VIP1-2", { k: "seat", has: "vip1-2" }), true);
const kursi = (...label: string[]) => ({ seats: label.map((l) => ({ label: l })) });
const urut = [kursi("A10"), kursi(), kursi("VIP1-10"), kursi("A2"), kursi("VIP1-2", "B1"), kursi("b1")];
const label = (daftar: Array<{ seats: Array<{ label: string }> }>) => daftar.map((b) => b.seats[0]?.label ?? "");
assert.deepEqual(label(urutKursi(urut, "asc")), ["A2", "A10", "b1", "VIP1-2", "VIP1-10", ""]);
assert.deepEqual(label(urutKursi(urut, "desc")), ["VIP1-10", "VIP1-2", "b1", "A10", "A2", ""]);
console.log("saringan-kolom kursi ok");

// Semua kolom tabel: check-in per sesi, Room, Bus, Source, Lucky draw ikut; sesi lain tidak.
const lengkap = kolomSaringanAdmin(fields, [{ id: 7, name: "Registration" }]);
for (const k of ["company", "checkin:7", "rsvp", "kamar", "bus", "source", "undian", "seat"]) assert.ok(lengkap.some((c) => c.key === k), k);
assert.deepEqual(bacaSaringan(json([{ k: "checkin:7", in: ["Checked in"] }, { k: "checkin:8", in: ["Checked in"] }]), lengkap), [{ k: "checkin:7", in: ["Checked in"] }]);
// Urutan alami, kosong selalu di akhir, seri tetap urutan masukan.
const teks = ["10", "", "9", "b", "A", "9"];
assert.deepEqual(urutMenurut(teks.map((t, i) => ({ t, i })), (b) => b.t, "asc").map((b) => b.i), [2, 5, 0, 4, 3, 1]);
assert.deepEqual(urutMenurut(teks.map((t, i) => ({ t, i })), (b) => b.t, "desc").map((b) => b.i), [3, 4, 0, 2, 5, 1]);
console.log("saringan-kolom semua kolom ok");

// Kelompok "+ Filter": pertanyaan yang tidak ditanyakan di formulir punya kelompok sendiri
// (judul panel Edit participant); acara tanpa pertanyaan semacam itu tetap dua kelompok.
assert.deepEqual([...new Set(admin.map((c) => c.grup))], ["kolom", "jawaban"]);
const denganStaf = kolomSaringanAdmin([
  ...fields,
  { key: "batch", label: "Batch", type: "select" as const, required: false, options: ["Batch 1"], on_form: false },
  { key: "kota", label: "Kota asal", type: "text" as const, required: false, on_form: false, participant_update: true },
]);
assert.equal(denganStaf.find((c) => c.key === "field:batch")?.grup, "staf");
assert.equal(denganStaf.find((c) => c.key === "field:kota")?.grup, "peserta");
assert.equal(denganStaf.find((c) => c.key === "field:sesi")?.grup, "jawaban");
// Unggahan berkas selalu ditanyakan, jadi tetap jawaban formulir.
assert.equal(kolomSaringanAdmin([{ ...fields[3], on_form: false }]).find((c) => c.key === "field:ktp")?.grup, "jawaban");
console.log("saringan-kolom kelompok ok");
