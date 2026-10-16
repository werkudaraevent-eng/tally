import assert from "node:assert/strict";
import { nomorKru } from "./kontak-kru.ts";

assert.deepEqual(nomorKru("Hadi - 08112836676"), { tel: "08112836676", wa: "https://wa.me/628112836676" });
assert.deepEqual(nomorKru("Pak Budi +62 812-3456-7890"), { tel: "+6281234567890", wa: "https://wa.me/6281234567890" });
assert.deepEqual(nomorKru("Sopir: 0811 2836 676\nKernet: 0812 0000 111"), { tel: "08112836676", wa: "https://wa.me/628112836676" });
assert.deepEqual(nomorKru("6281234567890"), { tel: "6281234567890", wa: "https://wa.me/6281234567890" });
assert.equal(nomorKru("Hadi"), null);
assert.equal(nomorKru("Bus 3"), null);
assert.equal(nomorKru("Kamar 1203"), null);
assert.equal(nomorKru(null), null);
assert.equal(nomorKru("1234567890123456789"), null);
console.log("kontak-kru ok");
