/**
 * Penjaga ukuran berkas (audit platform, Fase 3). Berkas kode di src/ paling
 * banyak {BATAS} baris; yang lebih panjang dipecah per bagian. Berkas yang
 * ditulis ulang oleh skrip (DIBUAT) tidak dihitung.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BATAS = 1500;

/** Ditulis ulang oleh scripts/ikon-phosphor.mjs; jangan disunting atau dipecah tangan. */
const DIBUAT = new Set(["src/components/landing/modern/ikon-ssr.ts", "src/app/admin/landing/ikon-csr.ts"]);

function berkas(dir: string): string[] {
  return readdirSync(dir).flatMap((nama) => {
    const jalur = join(dir, nama);
    if (statSync(jalur).isDirectory()) return berkas(jalur);
    return /\.(ts|tsx)$/.test(nama) ? [jalur] : [];
  });
}

const salah: string[] = [];
const semua = new Set(berkas("src"));
for (const jalur of semua) {
  if (DIBUAT.has(jalur)) continue;
  const baris = readFileSync(jalur, "utf8").split("\n").length - 1;
  if (baris > BATAS) salah.push(`${jalur}: ${baris} baris, batas ${BATAS}. Pecah per bagian.`);
}
for (const jalur of DIBUAT) if (!semua.has(jalur)) salah.push(`${jalur}: tidak ada lagi; hapus dari DIBUAT.`);

if (salah.length) {
  console.error("ukuran-berkas.check:\n  " + salah.join("\n  "));
  process.exit(1);
}
console.log("ukuran-berkas.check: ok");
