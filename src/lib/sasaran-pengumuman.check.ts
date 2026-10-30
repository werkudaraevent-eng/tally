import assert from "node:assert/strict";
import { KOLOM_HOTEL } from "./sasaran-blok.ts";
import { bacaSyaratPengumuman, KOLOM_ORGANISASI, PILIH_MAX, pengumumanUntuk, SYARAT_PENGUMUMAN_MAX, syaratKolom } from "./sasaran-pengumuman.ts";

const RUSAK = { field: "", values: [] };

// Bentuk tersimpan: kosong atau rusak = tidak cocok dengan siapa pun.
assert.deepEqual(bacaSyaratPengumuman(null), [RUSAK]);
assert.deepEqual(bacaSyaratPengumuman([]), [RUSAK]);
assert.deepEqual(bacaSyaratPengumuman({ field: "batch", values: ["Batch 1"] }), [RUSAK]);
assert.deepEqual(bacaSyaratPengumuman(Array.from({ length: SYARAT_PENGUMUMAN_MAX + 1 }, () => ({ field: "batch", values: ["Batch 1"] }))), [RUSAK]);
assert.deepEqual(bacaSyaratPengumuman([{ field: "batch", values: [] }]), [RUSAK]);
assert.deepEqual(bacaSyaratPengumuman([{ field: "Batch!", values: ["Batch 1"] }]), [RUSAK]);
assert.deepEqual(bacaSyaratPengumuman([{ field: KOLOM_ORGANISASI, values: [" PT Satu ", "pt satu", ""] }]), [{ field: KOLOM_ORGANISASI, values: ["PT Satu"] }]);
assert.deepEqual(bacaSyaratPengumuman([{ field: KOLOM_ORGANISASI, values: [] }]), [RUSAK]);

const kolom = [{ key: "batch", options: ["Batch 1", "Batch 2"] }];
const data = (jawaban: Record<string, unknown>, hotelId: number | null = null) => ({ jawaban, stays: hotelId === null ? [] : [{ hotel_id: hotelId, masuk: "2026-11-05", keluar: "2026-11-06" }], offset: "+07:00", kolom });
const orang = (opsi: Partial<{ disetujui: boolean; participantId: string | null; company: string | null; data: ReturnType<typeof data> | null }> = {}) => ({
  disetujui: true,
  participantId: "p1",
  company: "PT Satu",
  data: data({ batch: "Batch 2" }, 7),
  ...opsi,
});

// Semua dan disetujui: perilaku lama.
assert.equal(pengumumanUntuk({ audience: "semua" }, orang({ disetujui: false, participantId: null })), true);
assert.equal(pengumumanUntuk({ audience: "disetujui" }, orang({ disetujui: false, participantId: null })), false);
assert.equal(pengumumanUntuk({ audience: "disetujui" }, orang()), true);
// Penerima yang tidak dikenal: tidak tampil.
assert.equal(pengumumanUntuk({ audience: "lain" }, orang()), false);

// Pilih: hanya id yang tercantum, dan hanya akun yang tertaut.
assert.equal(pengumumanUntuk({ audience: "pilih", audience_ids: ["p1", "p2"] }, orang()), true);
assert.equal(pengumumanUntuk({ audience: "pilih", audience_ids: ["p2"] }, orang()), false);
assert.equal(pengumumanUntuk({ audience: "pilih", audience_ids: ["p1"] }, orang({ disetujui: false })), false);
assert.equal(pengumumanUntuk({ audience: "pilih", audience_ids: ["p1"] }, orang({ participantId: null })), false);
assert.equal(pengumumanUntuk({ audience: "pilih", audience_ids: null }, orang()), false);
assert.equal(pengumumanUntuk({ audience: "pilih", audience_ids: Array.from({ length: PILIH_MAX + 1 }, () => "p1") }, orang()), false);

// Syarat kolom: aturan Who sees it.
const batch2 = { audience: "syarat", audience_rules: [{ field: "batch", values: ["Batch 2"] }] };
assert.equal(pengumumanUntuk(batch2, orang()), true);
assert.equal(pengumumanUntuk(batch2, orang({ data: data({ batch: "Batch 1" }) })), false);
assert.equal(pengumumanUntuk(batch2, orang({ data: null })), false);
assert.equal(pengumumanUntuk(batch2, orang({ disetujui: false })), false);
// Jawaban yang sudah dihapus dari pilihan formulir: tidak cocok.
assert.equal(pengumumanUntuk({ audience: "syarat", audience_rules: [{ field: "batch", values: ["Batch 9"] }] }, orang({ data: data({ batch: "Batch 9" }) })), false);
// Hotel tanpa tanggal: hotel mana pun yang pernah ditinggali.
assert.equal(pengumumanUntuk({ audience: "syarat", audience_rules: [{ field: KOLOM_HOTEL, values: ["7"] }] }, orang()), true);
assert.equal(pengumumanUntuk({ audience: "syarat", audience_rules: [{ field: KOLOM_HOTEL, values: ["8"] }] }, orang()), false);

// Organisasi: tanpa beda huruf besar dan spasi tepi; tanpa organisasi tidak cocok.
const org = { audience: "syarat", audience_rules: [{ field: KOLOM_ORGANISASI, values: ["pt satu", "PT Dua"] }] };
assert.equal(pengumumanUntuk(org, orang({ company: " PT SATU " })), true);
assert.equal(pengumumanUntuk(org, orang({ company: "PT Tiga" })), false);
assert.equal(pengumumanUntuk(org, orang({ company: null })), false);
assert.equal(pengumumanUntuk(org, orang({ company: "  " })), false);

// Beberapa syarat: semua harus cocok. Satu rusak: tidak tampil.
const dua = { audience: "syarat", audience_rules: [{ field: "batch", values: ["Batch 2"] }, { field: KOLOM_ORGANISASI, values: ["PT Satu"] }] };
assert.equal(pengumumanUntuk(dua, orang()), true);
assert.equal(pengumumanUntuk(dua, orang({ company: "PT Dua" })), false);
assert.equal(pengumumanUntuk({ audience: "syarat", audience_rules: [null, { field: "batch", values: ["Batch 2"] }] }, orang()), false);
assert.equal(pengumumanUntuk({ audience: "syarat", audience_rules: null }, orang()), false);

// Kolom yang perlu dimuat: tanpa Organisasi dan tanpa pengumuman lain.
assert.deepEqual(syaratKolom([dua, { audience: "semua" }, { audience: "pilih", audience_ids: ["p1"] }]), [{ field: "batch", values: ["Batch 2"] }]);

console.log("sasaran-pengumuman ok");
