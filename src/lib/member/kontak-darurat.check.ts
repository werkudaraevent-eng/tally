import assert from "node:assert/strict";
import { bantuanPratinjau, barisKontakDarurat, kontakDariBlok, nomorTelepon, rapikanBantuan, tautanPeta } from "./kontak-darurat.ts";

assert.deepEqual(nomorTelepon("0811 2836 676"), { tel: "+628112836676", wa: "https://wa.me/628112836676" });
assert.deepEqual(nomorTelepon("+62 812-3456-7890"), { tel: "+6281234567890", wa: "https://wa.me/6281234567890" });
assert.deepEqual(nomorTelepon("(0274) 512 345"), { tel: "0274512345", wa: null });
assert.deepEqual(nomorTelepon("112"), { tel: "112", wa: null });
assert.deepEqual(nomorTelepon("+62 274 512345"), { tel: "+62274512345", wa: null });
assert.deepEqual(nomorTelepon("62 21 5000800"), { tel: "+62215000800", wa: null });
assert.equal(nomorTelepon("ext. 12"), null);
assert.equal(nomorTelepon("12"), null);
assert.equal(nomorTelepon("5000"), null);
assert.equal(nomorTelepon(""), null);
assert.equal(nomorTelepon(null), null);
// Jam dan tanggal tidak pernah jadi tombol Telepon (QA #209 H1).
assert.equal(nomorTelepon("08.00 - 22.00"), null);
assert.equal(nomorTelepon("2024-10-18"), null);
assert.equal(nomorTelepon("06/11/2026"), null);

assert.equal(tautanPeta("https://maps.app.goo.gl/abc"), "https://maps.app.goo.gl/abc");
assert.equal(tautanPeta("javascript:alert(1)"), null);
assert.equal(tautanPeta("maps.google.com"), null);

assert.deepEqual(
  barisKontakDarurat([
    { name: "  Koordinator acara ", phone: "0812 3456 7890", note: "Siaga 24 jam" },
    { name: "", phone: "112" },
    { name: "RS Panti Rapih", phone: "(0274) 514 845", map_url: "https://maps.app.goo.gl/x" },
  ]),
  [
    { judul: "Koordinator acara", nomor: "0812 3456 7890", isi: "Siaga 24 jam", tel: "+6281234567890", wa: "https://wa.me/6281234567890", peta: null },
    { judul: "RS Panti Rapih", nomor: "(0274) 514 845", isi: null, tel: "0274514845", wa: null, peta: "https://maps.app.goo.gl/x" },
  ],
);
assert.equal(barisKontakDarurat(Array.from({ length: 10 }, (_, i) => ({ name: `K${i}` }))).length, 8);

assert.deepEqual(kontakDariBlok([{ title: "Koordinator", body: "Hadi 0811 2836 676" }]), [
  { name: "Koordinator", phone: "0811 2836 676", note: "Hadi", map_url: null },
]);
assert.deepEqual(kontakDariBlok([{ title: "Rumah sakit", body: "RS Panti Rapih", href: "https://maps.app.goo.gl/x" }]), [
  { name: "Rumah sakit", phone: null, note: "RS Panti Rapih", map_url: "https://maps.app.goo.gl/x" },
]);
// Jam tidak diambil sebagai nomor; ponselnya yang diambil.
assert.deepEqual(kontakDariBlok([{ title: "Tim medis", body: "Buka 08.00 - 22.00, hubungi 0812 3456 7890" }]), [
  { name: "Tim medis", phone: "0812 3456 7890", note: "Buka 08.00 - 22.00, hubungi", map_url: null },
]);
// Tanpa nomor yang jelas: nomor kosong, teks utuh di catatan.
assert.deepEqual(kontakDariBlok([{ title: "Jadwal", body: "Tanggal 2024-10-18 pukul 08.00" }]), [
  { name: "Jadwal", phone: null, note: "Tanggal 2024-10-18 pukul 08.00", map_url: null },
]);
// Nomor kantor dikenali.
assert.deepEqual(kontakDariBlok([{ title: "Resepsionis hotel", body: "(0274) 566 353" }]), [
  { name: "Resepsionis hotel", phone: "(0274) 566 353", note: null, map_url: null },
]);
// Tautan selain peta tetap di catatan, bukan tombol Peta.
assert.deepEqual(kontakDariBlok([{ title: "Grup peserta", body: "Info terbaru", href: "https://chat.whatsapp.com/abc" }]), [
  { name: "Grup peserta", phone: null, note: "Info terbaru\nhttps://chat.whatsapp.com/abc", map_url: null },
]);
assert.equal(kontakDariBlok([{ title: "RS", href: "https://www.google.com/maps/place/x" }])[0].map_url, "https://www.google.com/maps/place/x");
// Butir tanpa judul: nama kosong (Save menunjuknya), teks utuh di catatan.
const panjang = "Kalau tertinggal rombongan, tetap di tempat, bagikan lokasi di grup, lalu hubungi koordinator acara secepatnya.";
assert.deepEqual(kontakDariBlok([{ title: "", body: panjang }]), [{ name: "", phone: null, note: panjang, map_url: null }]);
assert.deepEqual(kontakDariBlok([{ title: "", body: "" }]), []);

assert.deepEqual(rapikanBantuan({ note: "  ", contacts: [{ name: " ", phone: "" }] }), { help: null, tanpaNama: null });
assert.deepEqual(rapikanBantuan({ contacts: [{ name: "A " }, { name: "", phone: "112" }] }), {
  help: { title: null, note: null, contacts: [{ name: "A", phone: null, note: null, map_url: null }, { name: "", phone: "112", note: null, map_url: null }] },
  tanpaNama: 1,
});
assert.deepEqual(rapikanBantuan(null), { help: null, tanpaNama: null });

// Pratinjau: kontak tanpa nama dan peta setengah jadi dilewati.
assert.deepEqual(bantuanPratinjau({ title: "Darurat KSO", contacts: [{ name: "" }, { name: "B", phone: "0812", map_url: "https://" }] }), {
  title: "Darurat KSO",
  note: null,
  contacts: [{ name: "B", phone: "0812", note: null, map_url: null }],
});
console.log("kontak-darurat ok");
