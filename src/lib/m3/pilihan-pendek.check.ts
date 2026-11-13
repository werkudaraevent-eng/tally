import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Penjaga aturan DESIGN.md "Dropdown, segmented, atau switch".
 *
 * Dropdown (`SelectField` atau `<select>`) dengan dua sampai empat pilihan
 * TETAP gagal di sini: pilihan sesedikit itu memakai `SegmentedField`, yang
 * memperlihatkan semua opsi dan memilih dengan satu ketukan (M3 segmented
 * buttons). Aturan ini ditulis setelah dropdown "Direction" di Add ticket lolos
 * ke produksi: komponennya sudah ada, tetapi tidak ada yang mencegah fitur baru
 * memakai dropdown karena itu yang paling gampang ditulis.
 *
 * Yang dihitung hanya `<option>` yang ditulis langsung. Daftar yang dibangun
 * dengan `.map(` dianggap datang dari data dan dilewati: jumlahnya ikut data
 * organiser, jadi segmented bisa pecah kapan saja.
 *
 * Pengecualian harus disebut satu per satu di bawah, dengan alasannya.
 */

type Pengecualian = { berkas: string; cocok: string; alasan: string };

const PENGECUALIAN: Pengecualian[] = [
  { berkas: "src/app/admin/feedback/builder.tsx", cocok: 'label="Was"', alasan: "Operator syarat dalam satu baris aturan, berpasangan dengan pilihan sesi." },
  { berkas: "src/app/admin/feedback/builder.tsx", cocok: 'label="Participant"', alasan: "Operator syarat; labelnya kalimat (\"Didn't win a prize\")." },
  { berkas: "src/components/admin/condition-builder.tsx", cocok: 'value="not_in"', alasan: "Operator syarat penawaran booth, di dalam satu baris aturan." },
  { berkas: "src/components/admin/undian-condition-builder.tsx", cocok: 'value="not_in"', alasan: "Operator syarat undian, di dalam satu baris aturan." },
  { berkas: "src/components/admin/participant-list.tsx", cocok: 'value="confirmed"', alasan: "RSVP: tiga label dua kata (+ Declined dari impor) terpotong sebagai segmen di panel 390px (QA #451 M2)." },
  { berkas: "src/components/badge/badge-editor.tsx", cocok: 'label="Code content"', alasan: "Labelnya kalimat panjang; dua kalimat berjajar pecah di panel editor." },
];

const AKAR = new URL("../../../", import.meta.url).pathname;

function semuaTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((nama) => {
    const jalur = join(dir, nama);
    if (statSync(jalur).isDirectory()) return semuaTsx(jalur);
    return nama.endsWith(".tsx") ? [jalur] : [];
  });
}

export type Temuan = { berkas: string; baris: number; opsi: number; potongan: string };

/** Dropdown dengan 2-4 pilihan tetap di satu berkas. Diekspor untuk diuji. */
export function cariDropdownPendek(berkas: string, isi: string): Temuan[] {
  const hasil: Temuan[] = [];
  const pola = /<(SelectField|select)\b/g;
  for (let m = pola.exec(isi); m; m = pola.exec(isi)) {
    const tutup = isi.indexOf(`</${m[1]}>`, m.index);
    if (tutup < 0) continue;
    const tubuh = isi.slice(m.index, tutup);
    if (tubuh.includes(".map(")) continue;
    const opsi = (tubuh.match(/<option\b/g) ?? []).length;
    if (opsi < 2 || opsi > 4) continue;
    hasil.push({ berkas, baris: isi.slice(0, m.index).split("\n").length, opsi, potongan: tubuh });
  }
  return hasil;
}

// Uji kecil untuk pemindainya sendiri.
assert.equal(cariDropdownPendek("x", `<SelectField label="A"><option/><option/></SelectField>`).length, 1);
assert.equal(cariDropdownPendek("x", `<select>{xs.map((x) => <option key={x}/>)}<option/></select>`).length, 0);
assert.equal(cariDropdownPendek("x", `<select><option/><option/><option/><option/><option/></select>`).length, 0);

const temuan = semuaTsx(join(AKAR, "src"))
  .filter((jalur) => !jalur.includes("/components/m3/"))
  .flatMap((jalur) => cariDropdownPendek(relative(AKAR, jalur), readFileSync(jalur, "utf8")));

const terpakai = new Set<Pengecualian>();
const melanggar = temuan.filter((t) => {
  const p = PENGECUALIAN.find((x) => x.berkas === t.berkas && t.potongan.includes(x.cocok));
  if (p) terpakai.add(p);
  return !p;
});

assert.equal(
  melanggar.length,
  0,
  `Dropdown dengan 2-4 pilihan tetap: pakai SegmentedField (DESIGN.md "Dropdown, segmented, atau switch"), atau tambahkan pengecualian beralasan di src/lib/m3/pilihan-pendek.check.ts.\n${melanggar.map((t) => `  ${t.berkas}:${t.baris} (${t.opsi} pilihan)`).join("\n")}`,
);
// Pengecualian yang sudah tidak cocok dengan apa pun dihapus, supaya daftarnya tidak membusuk.
const basi = PENGECUALIAN.filter((p) => !terpakai.has(p));
assert.equal(basi.length, 0, `Pengecualian basi di pilihan-pendek.check.ts:\n${basi.map((p) => `  ${p.berkas} ${p.cocok}`).join("\n")}`);

console.log("pilihan-pendek ok");
