// Peta ikon Phosphor (scripts/ikon-phosphor.mjs) harus sama dengan paket yang
// terpasang. Setelah @phosphor-icons/react naik versi, jalankan ulang skripnya.
import assert from "node:assert/strict";
import fs from "node:fs";
import { NAMA_IKON_PHOSPHOR } from "./ikon-phosphor-nama.ts";

const map = "node_modules/@phosphor-icons/react/dist/ssr";
const terpasang = fs
  .readdirSync(map)
  .filter((berkas) => /^[A-Z][A-Za-z0-9]*\.es\.js$/.test(berkas))
  .map((berkas) => berkas.replace(/\.es\.js$/, ""))
  .filter((n) => n !== "SSRBase" && n !== "IconBase" && n !== "index")
  .sort();
assert.deepEqual([...NAMA_IKON_PHOSPHOR], terpasang, "Peta ikon basi: jalankan node scripts/ikon-phosphor.mjs");

for (const [berkas, jenis] of [
  ["src/components/landing/modern/ikon-ssr.ts", "ssr"],
  ["src/app/admin/landing/ikon-csr.ts", "csr"],
] as const) {
  const isi = fs.readFileSync(berkas, "utf8");
  const baris = isi.split("\n").filter((b) => b.startsWith("  ") && b.includes("import("));
  assert.equal(baris.length, terpasang.length, `${berkas}: jumlah ikon berbeda`);
  for (const nama of terpasang) {
    assert.ok(isi.includes(`  ${nama}: () => import("@phosphor-icons/react/dist/${jenis}/${nama}").then((m) => m.${nama}),`), `${berkas}: ${nama} tidak ada`);
  }
}

console.log(`ikon-phosphor: ${terpasang.length} ikon cocok`);
