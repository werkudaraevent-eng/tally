/**
 * Penjaga ukuran berkas (audit platform, Fase 3). Berkas kode baru paling
 * banyak {BATAS} baris. Berkas yang sudah lebih panjang tercatat di LAMA dengan
 * panjangnya hari ini: boleh memendek, tidak boleh bertambah. Pecah saat
 * fiturnya dikerjakan, lalu turunkan atau hapus angkanya di sini.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BATAS = 1500;

const LAMA: Record<string, number> = {
  "src/app/admin/landing/page.tsx": 3620,
  "src/components/member/dashboard-gathering.tsx": 2899,
  "src/app/scan/scan-client.tsx": 2672,
  "src/app/admin/rundown/page.tsx": 2589,
  "src/lib/domain.ts": 2197,
  "src/components/member/portal-horizon.tsx": 1789,
  "src/components/admin/participant-list.tsx": 1778,
  "src/components/landing/event-landing-modern.tsx": 1726,
  "src/lib/logistik/impor.ts": 1524,
  "src/components/landing/modern/ikon-ssr.ts": 1518,
  "src/app/admin/landing/ikon-csr.ts": 1518,
  "src/app/admin/pengumuman/otomatis/page.tsx": 1514,
};

function berkas(dir: string): string[] {
  return readdirSync(dir).flatMap((nama) => {
    const jalur = join(dir, nama);
    if (statSync(jalur).isDirectory()) return berkas(jalur);
    return /\.(ts|tsx)$/.test(nama) ? [jalur] : [];
  });
}

const salah: string[] = [];
const ada = new Set<string>();
for (const jalur of berkas("src")) {
  const baris = readFileSync(jalur, "utf8").split("\n").length - 1;
  const batas = LAMA[jalur] ?? BATAS;
  if (jalur in LAMA) ada.add(jalur);
  if (baris > batas) {
    salah.push(jalur in LAMA
      ? `${jalur}: ${baris} baris, dulu ${batas}. Jangan menambah; pindahkan bagian yang disentuh ke berkas sendiri.`
      : `${jalur}: ${baris} baris, batas ${BATAS}. Pecah per bagian.`);
  }
}
for (const jalur of Object.keys(LAMA)) if (!ada.has(jalur)) salah.push(`${jalur}: tidak ada lagi; hapus dari LAMA.`);

if (salah.length) {
  console.error("ukuran-berkas.check:\n  " + salah.join("\n  "));
  process.exit(1);
}
console.log("ukuran-berkas.check: ok");
