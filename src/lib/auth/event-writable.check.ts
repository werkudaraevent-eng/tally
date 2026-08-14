/**
 * Pemeriksaan mandiri untuk isWriteBlocked().
 *
 * Jalankan: node --experimental-strip-types src/lib/auth/event-writable.check.ts
 *
 * Alasan ada: pendahulunya (ensureEventWritable) LOLOS typecheck dan lint selama
 * berbulan-bulan padahal tidak pernah dipanggil dari mana pun. Aturan izin yang
 * salah di sini gagal secara senyap -- permintaan tetap 200, datanya tetap
 * tersimpan, dan tidak ada yang tahu sampai laporan klien berubah sendiri.
 */
import assert from "node:assert/strict";

import { isWriteBlocked } from "./event-writable.ts";

// Inti masalahnya: admin klien menulis ke event yang sudah ditutup.
assert.equal(isWriteBlocked({ method: "POST", status: "completed", role: "admin" }), true);
assert.equal(isWriteBlocked({ method: "PATCH", status: "archived", role: "admin" }), true);
assert.equal(isWriteBlocked({ method: "DELETE", status: "completed", role: "booth" }), true);

// Membaca event selesai memang dirancang tetap boleh (buka + ekspor laporan).
assert.equal(isWriteBlocked({ method: "GET", status: "completed", role: "admin" }), false);
assert.equal(isWriteBlocked({ method: "HEAD", status: "archived", role: "admin" }), false);

// Event yang masih berjalan tidak tersentuh aturan ini.
assert.equal(isWriteBlocked({ method: "POST", status: "active", role: "booth" }), false);
// draft WAJIB bisa ditulis: menyiapkan booth & pengaturan adalah syarat aktivasi.
assert.equal(isWriteBlocked({ method: "POST", status: "draft", role: "admin" }), false);

// Pemilik platform boleh mengoreksi setelah acara ditutup.
assert.equal(isWriteBlocked({ method: "POST", status: "completed", role: "super_admin" }), false);
assert.equal(isWriteBlocked({ method: "POST", status: "archived", role: "super_admin" }), false);

// Route baca-saja yang memakai POST karena badan permintaannya besar.
assert.equal(isWriteBlocked({ method: "POST", status: "completed", role: "admin", readOnly: true }), false);

// Method huruf kecil tidak boleh menembus penjaga. Node menormalkan method pada
// Request, tetapi penjaga ini juga dipanggil dari tempat lain.
assert.equal(isWriteBlocked({ method: "get", status: "completed", role: "admin" }), false);
assert.equal(isWriteBlocked({ method: "post", status: "completed", role: "admin" }), true);

console.log("event-writable.check.ts OK");
