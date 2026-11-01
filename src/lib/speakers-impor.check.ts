import assert from "node:assert/strict";
import { parseCsv } from "./csv.ts";
import { imporPembicara, petaHeader } from "./speakers-impor.ts";

const labelSesi = (judul: string) => judul.split(/[.:]\s/)[0]!.trim();
const agenda = [
  { id: 1, title: "Sesi 1. Kerangka global" },
  { id: 2, title: "Sesi 2: Pembiayaan hijau" },
  { id: 3, title: "Keynote" },
];
const opsi = { maks: 5, sorotanMaks: 1, labelSesi };

// Header ID atau EN, huruf besar/kecil dan garis bawah diabaikan; kolom lain dilaporkan.
const { peta, takDikenal } = petaHeader(["Nama", "JOB_TITLE", "Instansi", "Catatan"]);
assert.deepEqual([...peta.values()], ["name", "title", "company"]);
assert.deepEqual(takDikenal, ["Catatan"]);

// Tanpa kolom Name: galat, bukan impor kosong.
assert.ok("galat" in imporPembicara([["Jabatan"], ["CEO"]], [], agenda, opsi));

const csv = [
  "Name,Job title,Organisation,Session,Bio,Profile link,Photo,Highlights",
  'Andini Putri,Direktur,"PT Maju, Tbk",Sesi 1|Keynote,"Paragraf satu.\n\nParagraf dua.",https://example.com/andini,ftp://x,ya',
  "budi  santoso,,,Sesi 9,,http://insecure.example.com,,yes",
  ",Tanpa nama,,,,,,",
].join("\n");
const daftar = [{ name: "Budi Santoso", title: "Lama", company: "Bank" }];
const r = imporPembicara(parseCsv(csv), daftar, agenda, opsi);
assert.ok(!("galat" in r));
if (!("galat" in r)) {
  assert.equal(r.baru, 1);
  // Baris Budi hanya berisi sel yang tidak sah: tidak terhitung diperbarui.
  assert.equal(r.diperbarui, 0);
  // Koma di dalam petik tetap satu sel; sesi dicocokkan ke label pendek dan judul.
  const andini = r.hasil[1]!;
  assert.equal(andini.company, "PT Maju, Tbk");
  assert.deepEqual(andini.session_refs?.map((ref) => ref.id), [1, 3]);
  assert.equal(andini.session_refs?.[0]?.label, "Sesi 1");
  assert.equal(andini.bio, "Paragraf satu.\n\nParagraf dua.");
  assert.equal(andini.link, "https://example.com/andini");
  assert.equal(andini.photo_url, undefined);
  assert.equal(andini.featured, true);
  // Pembicara lama dicocokkan lewat nama; sel kosong tidak menghapus.
  const budi = r.hasil[0]!;
  assert.equal(budi.title, "Lama");
  assert.equal(budi.company, "Bank");
  // Highlights penuh (maks 1): tidak ditambahkan, disebut di peringatan.
  assert.equal(budi.featured, undefined);
  assert.ok(r.peringatan.some((p) => p.teks.includes("Highlights")));
  assert.ok(r.peringatan.some((p) => p.teks.includes('"Sesi 9" not found')));
  assert.ok(r.peringatan.some((p) => p.teks.includes("https://")));
  assert.ok(r.peringatan.some((p) => p.teks.includes("photo")));
  assert.deepEqual(r.dilewati, [{ baris: 4, teks: "No name" }]);
}

// Batas jumlah pembicara: baris baru di atas batas dilewati.
const penuh = imporPembicara(parseCsv("Name\nA\nB\nC"), [{ name: "X" }, { name: "Y" }, { name: "Z" }, { name: "W" }], agenda, opsi);
if (!("galat" in penuh)) {
  assert.equal(penuh.baru, 1);
  assert.equal(penuh.dilewati.length, 2);
}

// Titik koma (Excel Indonesia) dan tab (tempel dari Sheets).
const tab = imporPembicara(parseCsv("Nama\tJabatan\nCitra\tMenteri"), [], agenda, opsi);
if (!("galat" in tab)) assert.equal(tab.hasil[0]?.title, "Menteri");

// Petik di tengah sel tanpa petik tetap huruf biasa.
assert.deepEqual(parseCsv('Name,Job title\nAndi,Layar 5" HD'), [["Name", "Job title"], ["Andi", 'Layar 5" HD']]);

console.log("speakers-impor OK");
