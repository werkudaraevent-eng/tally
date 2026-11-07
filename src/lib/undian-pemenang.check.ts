import assert from "node:assert/strict";
import { ANIMATIONS, ANIMATION_BEST_WINNERS, bestWinnersLabel, maxWinnersPerDraw, winnerFit } from "./undian.ts";

// Panduan jumlah pemenang per animasi di CMS: rentang terbaik selalu muat di
// batas keras animasinya, dan winnerFit membaca posisinya dengan benar.

for (const { value } of ANIMATIONS) {
  const best = ANIMATION_BEST_WINNERS[value];
  assert.ok(best, `${value} has a best range`);
  assert.ok(best.min >= 1 && best.min <= best.max, `${value} range is ordered`);
  assert.ok(best.max <= maxWinnersPerDraw(value), `${value} best range fits its cap`);
}

assert.equal(bestWinnersLabel("wheel"), "1");
assert.equal(bestWinnersLabel("arena"), "3–10");
assert.equal(winnerFit("arena", 2), "few");
assert.equal(winnerFit("arena", 3), "best");
assert.equal(winnerFit("arena", 10), "best");
assert.equal(winnerFit("arena", 11), "many");
assert.equal(winnerFit("arena", 20), "many");
assert.equal(winnerFit("arena", 21), "over");
assert.equal(winnerFit("drum", 7), "over");
assert.equal(winnerFit("wall", 50), "many");

console.log("undian-pemenang: ok");
