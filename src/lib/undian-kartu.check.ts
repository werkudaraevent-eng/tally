import assert from "node:assert/strict";
import {
  PACK_MAX_CARDS, cardMs, isBigCard, isLegendCard, normalizeCardTier, normalizePackContents, packAllPlan, packOpenMs, packRevealMs, packTiers,
  type PackCandidatePrize,
} from "./undian-kartu.ts";

const p = (id: number, tier: PackCandidatePrize["tier"], count: number, sort_order = id): PackCandidatePrize => ({ id, name: `P${id}`, tier, sort_order, count });

// Normalisasi: nilai asing jatuh ke bawaan.
assert.equal(normalizePackContents("all"), "all");
assert.equal(normalizePackContents("x"), "one");
assert.equal(normalizeCardTier("grand"), "grand");
assert.equal(normalizeCardTier(null), "common");

// Semua hadiah: pemegang di akhir dan emas, sisanya dari yang paling umum.
{
  const { groups, drawOrder } = packAllPlan(p(9, "common", 1), [p(1, "common", 10), p(2, "rare", 2), p(3, "common", 5, 0), p(9, "common", 4)]);
  assert.deepEqual(groups.map((g) => g.prize_id), [3, 1, 2, 9], "biru urut undi, ungu, lalu pemegang");
  assert.equal(groups.at(-1)!.tier, 3, "pemegang selalu emas");
  assert.deepEqual(drawOrder, [9, 2, 1, 3], "diundi dari yang paling langka");
  assert.equal(groups.reduce((n, g) => n + g.count, 0), 18);
}

// Batas 30: yang terpotong hadiah paling umum.
{
  const { groups } = packAllPlan(p(9, "grand", 1), [p(1, "common", 25), p(2, "rare", 6), p(3, "common", 10, 5)]);
  assert.equal(groups.reduce((n, g) => n + g.count, 0), PACK_MAX_CARDS);
  assert.equal(groups.find((g) => g.prize_id === 2)!.count, 6, "ungu utuh");
  assert.equal(groups.find((g) => g.prize_id === 3)!.count, 10, "biru yang lebih akhir di urutan undi didahulukan");
  assert.equal(groups.find((g) => g.prize_id === 1)!.count, 13, "biru paling awal terpotong");
}

// Hadiah tanpa sisa kuota tidak masuk.
{
  const { groups, drawOrder } = packAllPlan(p(9, "grand", 1), [p(1, "common", 0)]);
  assert.deepEqual(groups.map((g) => g.prize_id), [9]);
  assert.deepEqual(drawOrder, [9]);
}

// Babak Grand Prize: hanya kartu terakhir, dan tidak saat semua kartu emas.
assert.equal(isLegendCard([3], 0), true, "satu kartu emas");
assert.equal(isLegendCard([1, 1, 2, 3], 3), true);
assert.equal(isLegendCard([1, 1, 2, 3], 2), false);
assert.equal(isLegendCard([3, 3, 3], 2), false, "tiga Grand Prize sekaligus: semua kartu besar biasa");
assert.equal(isLegendCard([1, 1], 1), false);

// Kartu besar: tiga pertama, terakhir, ganti warna, dan semua non-biru.
const t10 = packTiers({ mode: "all", groups: [{ prize_id: 1, prize: "a", tier: 1, count: 7 }, { prize_id: 2, prize: "b", tier: 2, count: 2 }, { prize_id: 3, prize: "c", tier: 3, count: 1 }] });
assert.deepEqual(t10.map((_, i) => isBigCard(t10, i)), [true, true, true, false, false, false, false, true, true, true]);

// Jadwal: naik monoton dengan jumlah kartu, dan masuk akal untuk 1 dan 30.
const one = packRevealMs([3]);
assert.ok(one > 12_000 && one < 20_000, `1 Grand Prize ${one} ms`);
const many = packRevealMs(Array.from({ length: 30 }, () => 1 as const));
assert.ok(many > 30_000 && many < 50_000, `30 doorprize ${many} ms`);
assert.ok(packOpenMs([1]) < packOpenMs([3]), "bungkus emas lebih menegangkan");
assert.equal(cardMs([1, 1, 1, 1, 1], 3), 1080, "kartu biru di tengah dibalik cepat");

console.log("undian-kartu ok");
