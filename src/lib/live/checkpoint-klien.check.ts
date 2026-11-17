import assert from "node:assert/strict";
import { BATAS_CHECKPOINT_KLIEN, checkpointKlienTersimpan, kolomCheckpointKlien, setujuiCheckpoint, waktuPertama } from "./checkpoint-klien.ts";

// Tersimpan: hanya bilangan bulat positif, tanpa duplikat; bentuk lain = tidak dibagikan.
assert.deepEqual(checkpointKlienTersimpan(null), []);
assert.deepEqual(checkpointKlienTersimpan({}), []);
assert.deepEqual(checkpointKlienTersimpan({ client_checkpoints: "1,2" }), []);
assert.deepEqual(checkpointKlienTersimpan({ client_checkpoints: [3, "4", 3, -1, 1.5, 0, 9] }), [3, 9]);
assert.equal(checkpointKlienTersimpan({ client_checkpoints: Array.from({ length: 40 }, (_, i) => i + 1) }).length, BATAS_CHECKPOINT_KLIEN);

// Kolom: urutan sesi, nama terbaru, sesi yang dihapus hilang.
const sesi = [{ id: 5, name: "Registration" }, { id: 2, name: "Gala dinner (renamed)" }, { id: 9, name: "Photo booth" }];
assert.deepEqual(kolomCheckpointKlien({ client_checkpoints: [9, 2, 77] }, sesi), [{ id: 2, label: "Gala dinner (renamed)" }, { id: 9, label: "Photo booth" }]);
assert.deepEqual(kolomCheckpointKlien({ client_fields: [] }, sesi), []);

// Simpan: id asing ditolak, urutan mengikuti sesi.
assert.deepEqual(setujuiCheckpoint([9, 5, 5], sesi), { ids: [5, 9], unknown: [] });
assert.deepEqual(setujuiCheckpoint([9, 123], sesi), { ids: [9], unknown: [123] });

// Pindaian pertama menang, apa pun urutan bacanya.
const peta = waktuPertama([
  { participant_id: "a", session_id: 5, scanned_at: "2026-11-01T03:00:00+00:00" },
  { participant_id: "a", session_id: 5, scanned_at: "2026-11-01T02:00:00Z" },
  { participant_id: "a", session_id: 9, scanned_at: "2026-11-02T10:00:00Z" },
  { participant_id: "b", session_id: 5, scanned_at: "2026-11-01T04:00:00Z" },
]);
assert.deepEqual(peta.get("a"), { "5": "2026-11-01T02:00:00Z", "9": "2026-11-02T10:00:00Z" });
assert.deepEqual(peta.get("b"), { "5": "2026-11-01T04:00:00Z" });
assert.equal(peta.get("c"), undefined);

console.log("checkpoint-klien ok");
