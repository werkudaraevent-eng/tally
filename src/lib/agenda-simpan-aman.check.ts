import assert from "node:assert/strict";
import { adaBeda, drafBaruBerubah, formTerbuka, judulBuang, keteranganBuang, kunciForm, lapisanSisa, samaNilai, sisaSunting, type FormAgenda } from "./agenda-simpan-aman.ts";

// Formulir terbuka: tanpa tab hanya header; baris terpilih = Edit item, tanpa = New item.
assert.deepEqual(formTerbuka("baris", null, null), { jenis: "header" });
assert.deepEqual(formTerbuka("bagian", null, 9), { jenis: "header" });
assert.deepEqual(formTerbuka("baris", 3, null), { jenis: "baru", bagian: 3 });
assert.deepEqual(formTerbuka("baris", 3, 9), { jenis: "baris", id: 9 });
assert.deepEqual(formTerbuka("bagian", 3, 9), { jenis: "bagian", id: 3 });
assert.deepEqual(formTerbuka("header", 3, 9), { jenis: "header" });
assert.deepEqual(formTerbuka("dresscode", 3, 9), { jenis: "dresscode", bagian: 3 });
assert.deepEqual(formTerbuka("dresscode", null, null), { jenis: "header" });

// Pindah tab meninggalkan Section, Dress code dan New item, tetapi tidak Header (satu untuk seluruh acara).
assert.notEqual(kunciForm(formTerbuka("dresscode", 3, null)), kunciForm(formTerbuka("dresscode", 4, null)));
assert.notEqual(kunciForm(formTerbuka("dresscode", 3, null)), kunciForm(formTerbuka("bagian", 3, null)));
assert.notEqual(kunciForm(formTerbuka("bagian", 3, null)), kunciForm(formTerbuka("bagian", 4, null)));
assert.notEqual(kunciForm(formTerbuka("baris", 3, null)), kunciForm(formTerbuka("baris", 4, null)));
assert.equal(kunciForm(formTerbuka("header", 3, null)), kunciForm(formTerbuka("header", 4, null)));
assert.notEqual(kunciForm(formTerbuka("baris", 3, 9)), kunciForm(formTerbuka("baris", 3, 10)));

// Kosong sama dengan kosong; angka dibandingkan sebagai angka.
assert.ok(samaNilai(null, ""));
assert.ok(samaNilai(undefined, null));
assert.ok(samaNilai("1.00", 1));
assert.ok(!samaNilai(false, null));
assert.ok(!samaNilai(true, false));
assert.ok(!samaNilai("Gala Dinner", "Gala dinner"));

// Baris: jam "HH:MM" dari kolom sama dengan "HH:MM:SS" dari database.
const gala = { start_time: "19:00:00", end_time: null as string | null, title: "Gala Dinner", subtitle: null as string | null, is_break: false, is_published: true };
assert.equal(adaBeda(gala, {}), false);
assert.equal(adaBeda(gala, { start_time: "19:00" }), false);
assert.equal(adaBeda(gala, { start_time: "19:30" }), true);
assert.equal(adaBeda(gala, { end_time: "" }), false);
assert.equal(adaBeda(gala, { end_time: "21:00" }), true);
assert.equal(adaBeda(gala, { subtitle: "" }), false);
assert.equal(adaBeda(gala, { title: "Gala Dinner " }), true);
assert.equal(adaBeda(gala, { is_published: false }), true);
// Disunting lalu dikembalikan: bersih lagi.
assert.equal(adaBeda(gala, { start_time: "19:00", title: "Gala Dinner", is_published: true }), false);

// Header: skala bisa tersimpan sebagai teks, editornya mengirim angka.
const header = { title_scale: "1.00" as unknown as number, footer_text: null as string | null };
assert.equal(adaBeda(header, { title_scale: 1, footer_text: "" }), false);
assert.equal(adaBeda(header, { title_scale: 1.2 }), true);

// Sesudah simpan: yang dikirim kini tersimpan; ketikan selama permintaan berjalan tetap ada.
type Isi = { title: string; start_time: string; is_break: boolean };
assert.equal(sisaSunting<Isi>({ title: "A", start_time: "10:00" }, { title: "A", start_time: "10:00" }), null);
assert.deepEqual(sisaSunting<Isi>({ title: "AB", start_time: "10:00" }, { title: "A", start_time: "10:00" }), { title: "AB" });
assert.deepEqual(sisaSunting<Isi>({ title: "A", is_break: true }, { title: "A" }), { is_break: true });
assert.equal(lapisanSisa<Isi>({ id: 7, isi: { title: "A" } }, { title: "A" }), null);
assert.deepEqual(lapisanSisa<Isi>({ id: 7, isi: { title: "AB", is_break: true } }, { title: "A", is_break: true }), { id: 7, isi: { title: "AB" } });

// New item: jam mulai yang diisikan dari jam selesai baris sebelumnya bukan suntingan.
const kosong = { start_time: "", end_time: "", title: "", subtitle: "", is_break: false };
assert.equal(drafBaruBerubah(kosong, ""), false);
assert.equal(drafBaruBerubah({ ...kosong, start_time: "10:30" }, "10:30"), false);
assert.equal(drafBaruBerubah({ ...kosong, start_time: "11:00" }, "10:30"), true);
assert.equal(drafBaruBerubah({ ...kosong, title: "  " }, ""), false);
assert.equal(drafBaruBerubah({ ...kosong, title: "Lunch" }, ""), true);
assert.equal(drafBaruBerubah({ ...kosong, subtitle: "Moderator:" }, ""), true);
assert.equal(drafBaruBerubah({ ...kosong, end_time: "12:00" }, ""), true);
assert.equal(drafBaruBerubah({ ...kosong, is_break: true }, ""), true);

// Dialog: nama tersimpan, atau kata umum bila kosong.
assert.equal(judulBuang({ jenis: "baris", id: 1 }, "Gala Dinner"), "Discard changes to Gala Dinner?");
assert.equal(judulBuang({ jenis: "baris", id: 1 }, " "), "Discard changes to this item?");
assert.equal(judulBuang({ jenis: "baru", bagian: 2 }), "Discard the new item?");
assert.equal(judulBuang({ jenis: "bagian", id: 2 }, "Day 1"), "Discard changes to the Day 1 tab?");
assert.equal(judulBuang({ jenis: "bagian", id: 2 }, null), "Discard changes to this section?");
assert.equal(judulBuang({ jenis: "header" }), "Discard changes to the page header?");
assert.equal(judulBuang({ jenis: "dresscode", bagian: 2 }, "Jumat, 06 November 2026 (Batch 1)"), "Discard changes to the Jumat, 06 November 2026 (Batch 1) dress code?");
assert.equal(judulBuang({ jenis: "dresscode", bagian: 2 }, ""), "Discard changes to this dress code?");
const semua: FormAgenda[] = [{ jenis: "baris", id: 1 }, { jenis: "baru", bagian: 2 }, { jenis: "bagian", id: 2 }, { jenis: "dresscode", bagian: 2 }, { jenis: "header" }];
for (const form of semua) assert.ok(!(judulBuang(form, "x") + keteranganBuang(form)).includes(String.fromCharCode(0x2014)), kunciForm(form));

console.log("agenda-simpan-aman: ok");
