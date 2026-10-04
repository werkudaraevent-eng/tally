/**
 * Penjaga statis: PostgREST di bawah v14 menolak PATCH yang memadukan `or=`
 * dengan `select=` (42703 "column ... does not exist"), dan menyaring ulang
 * baris hasil PATCH sehingga `select` bisa kosong padahal baris berubah.
 * Pernah mematahkan "Batalkan" kiriman. Tidak boleh ada satu pernyataan yang
 * berisi `.update(` dan `.or(` sekaligus `.select(`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function berkas(dir: string): string[] {
  return readdirSync(dir).flatMap((nama) => {
    const jalur = join(dir, nama);
    if (statSync(jalur).isDirectory()) return berkas(jalur);
    return /\.(ts|tsx)$/.test(nama) && !nama.endsWith(".check.ts") ? [jalur] : [];
  });
}

const salah: string[] = [];
for (const jalur of berkas("src")) {
  const isi = readFileSync(jalur, "utf8");
  for (const pernyataan of isi.split(";")) {
    if (pernyataan.includes(".update(") && pernyataan.includes(".or(") && pernyataan.includes(".select(")) {
      const baris = isi.slice(0, isi.indexOf(pernyataan)).split("\n").length;
      salah.push(`${jalur}:${baris}`);
    }
  }
}

if (salah.length) {
  console.error("PATCH dengan .or(...) dan .select(...) dalam satu pernyataan:\n" + salah.join("\n"));
  process.exit(1);
}
console.log("patch-or: ok");
