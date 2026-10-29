import assert from "node:assert/strict";
import { barisTampil, catatanHadiah, hadiahDiAtas, kartuHadiahNyala } from "./hadiah.ts";

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

// Atas hanya pada hari dikonfirmasi, menurut zona acara (13.14Z = 20.14 WIB 7 Nov; 17.30Z = 00.30 WIB 8 Nov).
assert.equal(hadiahDiAtas([{ waktu: "2026-11-07T13:14:00Z" }], "Asia/Jakarta", new Date("2026-11-07T15:00:00Z")), true);
assert.equal(hadiahDiAtas([{ waktu: "2026-11-07T13:14:00Z" }], "Asia/Jakarta", new Date("2026-11-07T17:30:00Z")), false);
assert.equal(hadiahDiAtas([{ waktu: "2026-11-06T13:14:00Z" }, { waktu: "2026-11-07T13:14:00Z" }], "Asia/Jakarta", new Date("2026-11-07T01:00:00Z")), true);
assert.equal(hadiahDiAtas([], "Asia/Jakarta", new Date()), false);

console.log("hadiah.check ok");
