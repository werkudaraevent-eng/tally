/**
 * Penjaga statis setelah pindah ke zod 4. Dua perilaku zod 4 berbeda dari 3:
 * - `.uuid()` hanya menerima UUID RFC 9562 (versi 1-8). Id lama, id buatan
 *   tangan atau id contoh seperti 00000000-...-0001 ditolak. Pakai `.guid()`
 *   (bentuk 8-4-4-4-12 apa pun), seperti zod 3.
 * - `.default()` di dalam `.partial()` atau `.optional()` tetap diisi saat
 *   kolomnya tidak dikirim. PATCH yang memakai `.partial()` lalu menimpa kolom
 *   dengan bawaan. Bawaan dipasang di skema buat saja (lihat pengumuman/route.ts).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { z } from "zod";

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
  if (/\.uuid\(/.test(isi)) salah.push(`${jalur}: pakai .guid(), bukan .uuid()`);
  if (/\.default\([^()]*\)\s*\.(optional|nullish)\(/.test(isi)) salah.push(`${jalur}: .default() lalu .optional() tetap mengisi bawaan di zod 4`);
}
if (salah.length) {
  console.error("zod-4.check:\n  " + salah.join("\n  "));
  process.exit(1);
}

// Perilaku yang diandalkan kode di atas.
assert.equal(z.string().guid().safeParse("00000000-0000-0000-0000-000000000001").success, true);
assert.deepEqual(z.object({ a: z.string().default("x") }).partial().parse({}), { a: "x" });
console.log("zod-4.check: ok");
