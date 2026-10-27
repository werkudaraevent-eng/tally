import assert from "node:assert/strict";
import { kelompokFaq, namaKelompokFaq } from "./landing-faq.ts";

const q = (n: number, group?: string, group_id?: string) => ({ q: `Q${n}`, a: "A", ...(group !== undefined ? { group } : {}), ...(group_id ? { group_id } : {}) });

// Tanpa kelompok: satu kelompok tanpa judul, urutan tetap.
assert.deepEqual(kelompokFaq([q(1), q(2)]).map((k) => [k.judul, k.butir.map((b) => b.q)]), [[null, ["Q1", "Q2"]]]);
// Urutan kelompok mengikuti pertanyaan pertamanya; yang terpisah tetap disatukan.
assert.deepEqual(
  kelompokFaq([q(1, "Hotel"), q(2, "Masuk"), q(3, "Hotel")]).map((k) => [k.judul, k.butir.map((b) => b.q)]),
  [["Hotel", ["Q1", "Q3"]], ["Masuk", ["Q2"]]],
);
// Beda spasi/huruf besar tetap satu kelompok; judul dari yang pertama.
assert.deepEqual(kelompokFaq([q(1, "Perjalanan & hotel"), q(2, " perjalanan  & Hotel ")]).map((k) => [k.judul, k.butir.length]), [["Perjalanan & hotel", 2]]);
// Tanpa kelompok di tengah: dikumpulkan tanpa judul di posisi pertamanya.
assert.deepEqual(kelompokFaq([q(1, "A"), q(2, ""), q(3, "B"), q(4)]).map((k) => [k.judul, k.butir.map((b) => b.q)]), [["A", ["Q1"]], [null, ["Q2", "Q4"]], ["B", ["Q3"]]]);
// /en: dikelompokkan menurut nama Indonesia, walau terjemahannya berbeda atau belum ada.
assert.deepEqual(kelompokFaq([q(1, "Travel", "Perjalanan"), q(2, "Perjalanan", "Perjalanan")]).map((k) => [k.judul, k.butir.length]), [["Travel", 2]]);
// Saran editor: unik, rapi, urutan pertama muncul.
assert.deepEqual(namaKelompokFaq([q(1, "Hotel "), q(2, "hotel"), q(3), q(4, "Masuk")]), ["Hotel", "Masuk"]);
console.log("landing-faq ok");
