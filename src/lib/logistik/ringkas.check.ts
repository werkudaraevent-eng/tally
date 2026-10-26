import assert from "node:assert/strict";
import { kolomLogistik, labelStay, type LogistikRingkas } from "./ringkas.ts";

const WIB = "+07:00";

// Satu stay: tanpa nomor slot, kunci lama "kamar" dan "bus" tetap ada.
const satu = kolomLogistik({ stays: 1, kit: [], kereta: false });
assert.deepEqual(satu.map((k) => k.label), ["Hotel", "Room", "Hotel check-in", "Hotel check-out", "Vehicle"]);
assert.deepEqual(satu.map((k) => k.key), ["kamar", "stay:room:1", "stay:in:1", "stay:out:1", "bus"]);

// Dua stay: satu kolom per fakta per hotel, bukan satu kolom gabungan.
const dua = kolomLogistik({ stays: 2, kit: [{ id: 7, name: "T-shirt" }, { id: 8, name: "Lanyard" }], kereta: true });
const label = dua.map((k) => k.label);
assert.deepEqual(label.slice(0, 9), [
  "Hotel 1", "Room 1", "Hotel check-in 1", "Hotel check-out 1",
  "Hotel 2", "Room 2", "Hotel check-in 2", "Hotel check-out 2", "Vehicle",
]);
assert.equal(dua[0].key, "kamar");
assert.equal(dua[4].key, "stay:hotel:2");
assert.ok(label.includes("Outbound train") && label.includes("Return seat") && label.includes("Outbound booking code"));
assert.deepEqual(label.slice(-2), ["Kit: T-shirt", "Kit: Lanyard"]);
assert.equal(new Set(dua.map((k) => k.key)).size, dua.length);

const pindah: LogistikRingkas = {
  kamar: labelStay([{ hotel: "GRAMM", room: "301" }, { hotel: "Royal Ambarrukmo", room: null }]),
  bus: "B2",
  stays: [
    { hotel: "GRAMM", room: "301", check_in_at: "2026-11-05T07:00:00Z", check_out_at: "2026-11-06T05:00:00Z" },
    { hotel: "Royal Ambarrukmo", room: null, check_in_at: "2026-11-06T07:00:00Z", check_out_at: "2026-11-08T05:00:00Z" },
  ],
  kereta: {
    outbound: {
      direction: "outbound", train_name: "Taksaka", travel_class: "Executive", origin: "Gambir", destination: "Yogyakarta",
      depart_date: "2026-11-05", depart_time: "08:45:00", arrive_time: "15:10:00", carriage: "3", seat: "12A", booking_code: "ABC123",
    } as never,
  },
  kit: { "7": "L", "8": null },
};
assert.equal(pindah.kamar, "GRAMM · 301 → Royal Ambarrukmo · room to follow");

const nilai = (key: string, r: LogistikRingkas | null, bentuk: "layar" | "berkas") => dua.find((k) => k.key === key)!.nilai(r, WIB, bentuk);
assert.equal(nilai("kamar", pindah, "layar"), "GRAMM");
assert.equal(nilai("stay:room:1", pindah, "layar"), "301");
assert.equal(nilai("stay:hotel:2", pindah, "layar"), "Royal Ambarrukmo");
assert.equal(nilai("stay:room:2", pindah, "layar"), "To follow");
assert.equal(nilai("stay:in:1", pindah, "layar"), "Thu 5 Nov");
assert.equal(nilai("stay:out:2", pindah, "layar"), "Sun 8 Nov");
assert.equal(nilai("stay:in:2", pindah, "berkas"), "06/11/2026");
assert.equal(nilai("bus", pindah, "layar"), "B2");
assert.equal(nilai("kereta:outbound:train_name", pindah, "layar"), "Taksaka");
assert.equal(nilai("kereta:outbound:depart_time", pindah, "layar"), "08:45");
assert.equal(nilai("kereta:outbound:depart_date", pindah, "layar"), "Thu 5 Nov");
assert.equal(nilai("kereta:outbound:depart_date", pindah, "berkas"), "05/11/2026");
assert.equal(nilai("kereta:return:seat", pindah, "layar"), "");
assert.equal(nilai("kit:7", pindah, "layar"), "L");
assert.equal(nilai("kit:8", pindah, "layar"), "Collected");

// Peserta tanpa logistik dan slot ke-2 untuk peserta satu hotel: semua kosong.
for (const k of dua) assert.equal(k.nilai(null, WIB, "berkas"), "");
const diam: LogistikRingkas = { kamar: "Royal Ambarrukmo · 1208", bus: null, stays: [{ hotel: "Royal Ambarrukmo", room: "1208", check_in_at: null, check_out_at: null }] };
assert.equal(nilai("stay:hotel:2", diam, "layar"), "");
assert.equal(nilai("stay:room:2", diam, "layar"), "");
assert.equal(nilai("stay:in:1", diam, "layar"), "");
assert.equal(nilai("kit:7", diam, "layar"), "");
assert.equal(labelStay([]), null);

// Barang kit bernama sama: header tetap unik.
const kembar = kolomLogistik({ stays: 1, kit: [{ id: 1, name: "Kaos" }, { id: 2, name: "kaos " }, { id: 3, name: "Topi" }], kereta: false }).map((k) => k.label);
assert.deepEqual(kembar.slice(-3), ["Kit: Kaos (1)", "Kit: kaos (2)", "Kit: Topi"]);
assert.equal(new Set(kembar).size, kembar.length);

console.log("ringkas.check: ok");
