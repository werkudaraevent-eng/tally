/**
 * Penjaga (temuan QA H2): tautan yang dikirim ke peserta harus dari
 * linkOrigin() (src/lib/domain-klien/asal.ts), bukan origin permintaan. Origin
 * permintaan mengikuti alamat tempat tombol ditekan, jadi tautan email akan
 * berbeda-beda per admin dan tidak pernah memakai domain klien.
 *
 * Jalankan: node --experimental-strip-types src/lib/domain-klien/tautan.check.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Pengecualian yang disengaja, dengan alasannya di berkas masing-masing.
const BOLEH = new Set([
  // Pengalihan setelah konfirmasi harus tetap di host yang sama (cookie per host).
  "src/app/api/peserta/konfirmasi/route.ts",
]);

function telusuri(dir: string): string[] {
  return readdirSync(dir).flatMap((nama) => {
    const path = join(dir, nama);
    return statSync(path).isDirectory() ? telusuri(path) : /\.tsx?$/.test(nama) ? [path] : [];
  });
}

const pelanggar = telusuri("src/app/api").filter((path) => {
  if (BOLEH.has(path)) return false;
  const isi = readFileSync(path, "utf8");
  return /request\.url\)\.origin|requestUrl:\s*request\.url|registrationCodeUrl\(\s*request\.url/.test(isi);
});

assert.deepEqual(pelanggar, [], `Tautan email memakai origin permintaan; ganti dengan linkOrigin(): ${pelanggar.join(", ")}`);
console.log("tautan.check.ts OK");
