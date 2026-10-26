import assert from "node:assert/strict";
import { bacaSasaran, bagianPertama, jawabanPeserta, kolomSasaran, milikPeserta, pilihanPeserta } from "./sasaran-bagian.ts";

// Bentuk tersimpan: kosong atau rusak berarti semua peserta.
assert.equal(bacaSasaran(null), null);
assert.equal(bacaSasaran([]), null);
assert.equal(bacaSasaran({ field: "batch", values: [] }), null);
assert.equal(bacaSasaran({ field: "Batch!", values: ["Batch 1"] }), null);
assert.deepEqual(bacaSasaran({ field: "batch", values: [" Batch 2 ", "batch 2", "", 3] }), { field: "batch", values: ["Batch 2"] });

// Jawaban peserta: teks dipangkas, angka menjadi teks.
assert.equal(jawabanPeserta({ batch: " Batch 2 " }, "batch"), "Batch 2");
assert.equal(jawabanPeserta({ batch: 2 }, "batch"), "2");
assert.equal(jawabanPeserta({ batch: "  " }, "batch"), null);
assert.equal(jawabanPeserta(null, "batch"), null);

// Cocok tanpa peduli huruf besar dan spasi.
const b2 = { field: "batch", values: ["Batch 2"] };
assert.equal(milikPeserta(b2, { batch: "batch 2" }), true);
assert.equal(milikPeserta(b2, { batch: "Batch 1" }), false);
assert.equal(milikPeserta(b2, {}), null);
assert.equal(milikPeserta(null, { batch: "Batch 1" }), null);

// KSO: Kamis untuk semua, Jumat Batch 1 dan 2, Sabtu untuk semua.
const kso = [null, { field: "batch", values: ["Batch 1"] }, b2, null];
const p2 = pilihanPeserta(kso, { batch: "Batch 2" });
assert.deepEqual([...p2.milik], [2]);
assert.deepEqual([...p2.bukanMilik], [1]);
assert.equal(p2.kelompok, "Batch 2");
assert.equal(bagianPertama([1, 2], p2), 2);
assert.equal(bagianPertama([0], p2), 0);

// Tanpa jawaban: semua bagian tetap terbuka, bagian pertama dulu, tanpa kelompok.
const kosong = pilihanPeserta(kso, {});
assert.equal(kosong.milik.size + kosong.bukanMilik.size, 0);
assert.equal(kosong.kelompok, null);
assert.equal(bagianPertama([1, 2], kosong), 1);

// Jawaban di luar sasaran mana pun (mis. "Panitia"): bukan milik keduanya, tetap terbuka.
const lain = pilihanPeserta(kso, { batch: "Panitia" });
assert.deepEqual([...lain.bukanMilik], [1, 2]);
assert.equal(bagianPertama([1, 2], lain), 1);

// Tanpa sasaran sama sekali: kolom staf tidak pernah tampil.
assert.equal(pilihanPeserta([null, null], { batch: "Batch 2" }).kelompok, null);

// Kolom yang ditawarkan: hanya dropdown dan radio berpilihan, termasuk kolom staf.
assert.deepEqual(
  kolomSasaran({
    fields: [
      { key: "batch", label: "Batch", type: "select", options: ["Batch 1", " Batch 2 ", ""], on_form: false, agenda_label: true },
      { key: "kota", label: "Kota", type: "text" },
      { key: "ukuran", label: "", type: "radio", options: [] },
      { key: "Bad Key", label: "X", type: "select", options: ["A"] },
      { key: "menu", label: "Menu", type: "radio", options: ["Ayam"] },
    ],
  }),
  [
    { key: "batch", label: "Batch", options: ["Batch 1", "Batch 2"], staff: true, label_agenda: true },
    { key: "menu", label: "Menu", options: ["Ayam"], staff: false, label_agenda: false },
  ],
);
assert.deepEqual(kolomSasaran(null), []);

// QA #223 L3: dua kolom sasaran; label dari bagian yang cocok, bukan bagian bersasaran pertama.
const dua = pilihanPeserta([{ field: "bus_no", values: ["7"] }, { field: "batch", values: ["Batch 2"] }], { bus_no: "3", batch: "Batch 2" });
assert.equal(dua.kelompok, "Batch 2");
assert.equal(pilihanPeserta([{ field: "bus_no", values: ["7"] }], { bus_no: "3" }).kelompok, "3");
console.log("sasaran-bagian ok");
