// Membuat peta ikon Phosphor untuk kartu Tentang acara (gaya gathering).
//
// Kenapa peta impor per ikon, bukan `import * as Phosphor`: seluruh pustaka
// (±1.500 ikon, 4,7 MB) ikut dimuat setiap kali halaman publik dirender di
// server dan setiap kali editor dibuka (QA #115 M3/M5). Dengan peta ini setiap
// ikon menjadi potongan sendiri, dan yang dimuat hanya ikon yang dipakai.
//
// Jalankan ulang setelah @phosphor-icons/react dinaikkan versinya:
//   node scripts/ikon-phosphor.mjs
// `npm run check` menolak peta yang tidak sama dengan paket terpasang.
import fs from "node:fs";
import path from "node:path";

const akar = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const map = path.join(akar, "node_modules/@phosphor-icons/react/dist/ssr");
const nama = fs
  .readdirSync(map)
  .filter((berkas) => /^[A-Z][A-Za-z0-9]*\.es\.js$/.test(berkas))
  .map((berkas) => berkas.replace(/\.es\.js$/, ""))
  .filter((n) => n !== "SSRBase" && n !== "IconBase" && n !== "index")
  .sort();
const versi = JSON.parse(fs.readFileSync(path.join(akar, "node_modules/@phosphor-icons/react/package.json"), "utf8")).version;
const kepala = (isi) => `// DIBUAT OTOMATIS oleh scripts/ikon-phosphor.mjs dari @phosphor-icons/react ${versi}. Jangan disunting.\n${isi}`;

fs.writeFileSync(
  path.join(akar, "src/lib/ikon-phosphor-nama.ts"),
  kepala(`\n/** Semua nama ikon Phosphor yang bisa dipilih untuk kartu Tentang acara. */\nexport const NAMA_IKON_PHOSPHOR: readonly string[] = ${JSON.stringify(nama)};\n`),
);
for (const [berkas, jenis, catatan] of [
  ["src/components/landing/modern/ikon-ssr.ts", "ssr", "Server (halaman publik): tanpa context React."],
  ["src/app/admin/landing/ikon-csr.ts", "csr", "Peramban (editor CMS)."],
]) {
  const baris = nama.map((n) => `  ${n}: () => import("@phosphor-icons/react/dist/${jenis}/${n}").then((m) => m.${n}),`).join("\n");
  fs.writeFileSync(
    path.join(akar, berkas),
    kepala(`// ${catatan} Satu impor dinamis per ikon, jadi tiap ikon menjadi potongan sendiri.\nimport type { Icon } from "@phosphor-icons/react";\n\nexport const MUAT_IKON: Record<string, () => Promise<Icon>> = {\n${baris}\n};\n`),
  );
}
console.log(`${nama.length} ikon, versi ${versi}`);
