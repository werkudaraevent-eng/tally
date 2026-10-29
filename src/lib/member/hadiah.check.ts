import assert from "node:assert/strict";
import { barisTampil, catatanHadiah, kartuHadiahNyala } from "./hadiah.ts";

assert.equal(kartuHadiahNyala(undefined), false);
assert.equal(kartuHadiahNyala({ enabled: false }), false);
assert.equal(kartuHadiahNyala({ enabled: true }), true);

const b = (id: number, status: string, decided_at: string | null, rehearsal: boolean | null = false) => ({ id, prize_id: 1, status, rehearsal, decided_at, drawn_at: "2026-11-07T12:00:00Z" });
// Pending, rejected, dan latihan tidak pernah tampil.
assert.deepEqual(barisTampil([b(1, "pending", null), b(2, "rejected", "2026-11-07T12:01:00Z"), b(3, "confirmed", "2026-11-07T12:02:00Z", true)]), []);
// Terbaru di atas; baris tanpa decided_at memakai drawn_at.
assert.deepEqual(
  barisTampil([b(4, "confirmed", "2026-11-07T12:05:00Z"), b(5, "confirmed", "2026-11-07T13:00:00Z"), b(6, "confirmed", null, null)]).map((item) => item.id),
  [5, 4, 6],
);

// Catatan per hadiah menang; kosong -> bawaan acara; English -> bawaan English, lalu Indonesia.
const setelan = { enabled: true, note: "Ambil di meja hadiah.", en: { note: "Collect at the prize desk." } };
assert.equal(catatanHadiah("Dikirim ke kantor.", setelan, "id"), "Dikirim ke kantor.");
assert.equal(catatanHadiah("  ", setelan, "id"), "Ambil di meja hadiah.");
assert.equal(catatanHadiah(null, setelan, "en"), "Collect at the prize desk.");
assert.equal(catatanHadiah(null, { enabled: true, note: "Ambil di meja hadiah." }, "en"), "Ambil di meja hadiah.");
assert.equal(catatanHadiah(null, { enabled: true }, "id"), null);
assert.equal(catatanHadiah(null, null, "id"), null);

console.log("hadiah.check ok");
