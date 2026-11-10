import assert from "node:assert/strict";
import { albumTerbuka, bacaSetelanDokumentasi, layananTautan, selesaiBaris, selesaiHari, tautanSesiTerbuka } from "./dokumentasi.ts";

const D1 = "https://drive.google.com/drive/folders/hari1";
const D2 = "https://drive.google.com/drive/folders/hari2";

// Bawaan mati, dan setelan rusak tidak pernah menampilkan apa pun.
assert.equal(bacaSetelanDokumentasi(undefined), null);
assert.equal(bacaSetelanDokumentasi({ enabled: false, mode: "event", url: D1 }), null);
assert.equal(bacaSetelanDokumentasi("x"), null);
// Hanya https; kunci harus angka (id Agenda).
const baca = bacaSetelanDokumentasi({ enabled: true, mode: "day", url: "javascript:alert(1)", days: { "10": D1, "11": "http://drive.google.com/x", abc: D2, "12": " " } });
assert.deepEqual(baca, { enabled: true, mode: "day", url: null, days: { "10": D1 }, sessions: {} });
assert.equal(bacaSetelanDokumentasi({ enabled: true, mode: "aneh" })?.mode, "event");

const jadwal = { event_date: "2026-11-06", end_date: "2026-11-08", start_time: "05:00", end_time: "17:00", time_zone: "Asia/Jakarta" as const };
const WIB = (iso: string) => Date.parse(`${iso}+07:00`);
const agenda = [
  { id: 10, sectionTitle: "Keberangkatan", tanggal: "2026-11-06", items: [
    { id: 100, time: "05.00", end: "06.00", title: "Kumpul di Gambir", jeda: false },
    { id: 101, time: "21.00", end: "22.00", title: "Makan malam", jeda: false },
  ] },
  { id: 11, sectionTitle: null, tanggal: "2026-11-07", items: [{ id: 110, time: "23.00", end: "01.00", title: "Gala lewat tengah malam", jeda: false }] },
  { id: 12, sectionTitle: "Tanpa tanggal", tanggal: null, items: [{ id: 120, time: "09.00", end: null, title: "Sesi lepas", jeda: false }] },
];

// Jam selesai: titik atau titik dua; lewat tengah malam = hari berikutnya; tanpa jam selesai = jam mulai.
assert.equal(selesaiBaris("2026-11-06", { time: "05.00", end: "06.00" }, "Asia/Jakarta"), WIB("2026-11-06T06:00:00"));
assert.equal(selesaiBaris("2026-11-07", { time: "23:00", end: "01:00" }, "Asia/Jakarta"), WIB("2026-11-08T01:00:00"));
assert.equal(selesaiBaris("2026-11-06", { time: "09.30", end: null }, "Asia/Jakarta"), WIB("2026-11-06T09:30:00"));
assert.equal(selesaiBaris(null, { time: "09.30", end: null }, "Asia/Jakarta"), null);
assert.equal(selesaiBaris("2026-11-06", { time: "x", end: null }, "Asia/Jakarta"), null);
// Hari selesai = baris yang paling akhir selesai; hari tanpa baris = ujung tanggal.
assert.equal(selesaiHari(agenda[0], "Asia/Jakarta"), WIB("2026-11-06T22:00:00"));
assert.equal(selesaiHari({ id: 1, sectionTitle: null, tanggal: "2026-11-06", items: [] }, "Asia/Jakarta"), WIB("2026-11-07T00:00:00"));
// Zona lain bergeser sesuai offset.
assert.equal(selesaiBaris("2026-11-06", { time: "06.00", end: null }, "Asia/Makassar"), WIB("2026-11-06T05:00:00"));

// Mode acara: hanya setelah jam selesai acara.
const acara = bacaSetelanDokumentasi({ enabled: true, mode: "event", url: D1 });
assert.deepEqual(albumTerbuka(acara, agenda, jadwal, WIB("2026-11-08T16:59:00")), []);
assert.equal(albumTerbuka(acara, agenda, jadwal, WIB("2026-11-08T17:00:00")).length, 1);
// Acara tanpa tanggal: langsung tampil.
assert.equal(albumTerbuka(acara, agenda, { ...jadwal, event_date: null }, 0).length, 1);
// Mode acara tanpa link: kosong.
assert.deepEqual(albumTerbuka(bacaSetelanDokumentasi({ enabled: true, mode: "event" }), agenda, jadwal, WIB("2026-12-01T00:00:00")), []);

// Mode hari: per hari setelah baris terakhirnya selesai; hari kosong dilewati; tanpa tanggal ikut akhir acara.
const hari = bacaSetelanDokumentasi({ enabled: true, mode: "day", days: { "10": D1, "11": D2, "12": D1 } });
assert.deepEqual(albumTerbuka(hari, agenda, jadwal, WIB("2026-11-06T21:59:00")).map((a) => a.kunci), []);
assert.deepEqual(albumTerbuka(hari, agenda, jadwal, WIB("2026-11-06T22:00:00")).map((a) => a.kunci), ["hari-10"]);
assert.deepEqual(albumTerbuka(hari, agenda, jadwal, WIB("2026-11-08T00:30:00")).map((a) => a.kunci), ["hari-10"]);
assert.deepEqual(albumTerbuka(hari, agenda, jadwal, WIB("2026-11-08T01:00:00")).map((a) => a.kunci), ["hari-10", "hari-11"]);
assert.deepEqual(albumTerbuka(hari, agenda, jadwal, WIB("2026-11-08T17:00:00")).map((a) => a.kunci), ["hari-10", "hari-11", "hari-12"]);
assert.equal(albumTerbuka(hari, agenda, jadwal, WIB("2026-11-08T17:00:00"))[0].judul, "Keberangkatan");

// Mode sesi: per baris setelah selesai, hanya baris yang ada di agenda peserta (Who sees it sudah menyaring).
const sesi = bacaSetelanDokumentasi({ enabled: true, mode: "session", sessions: { "100": D1, "101": D2, "999": D1 } });
const terbuka = albumTerbuka(sesi, agenda, jadwal, WIB("2026-11-06T07:00:00"));
assert.deepEqual(terbuka.map((a) => a.kunci), ["sesi-100"]);
assert.equal(terbuka[0].judul, "Kumpul di Gambir");
assert.deepEqual([...tautanSesiTerbuka(terbuka)], [[100, D1]]);
assert.deepEqual(albumTerbuka(sesi, agenda.slice(1), jadwal, WIB("2026-12-01T00:00:00")), []);
// Mode lain tidak memakai link mode lain.
assert.deepEqual(albumTerbuka(bacaSetelanDokumentasi({ enabled: true, mode: "session", url: D1, days: { "10": D1 } }), agenda, jadwal, WIB("2026-12-01T00:00:00")), []);

// Nama layanan dari alamat.
assert.equal(layananTautan(D1), "Google Drive");
assert.equal(layananTautan("https://photos.app.goo.gl/abc"), "Google Photos");
assert.equal(layananTautan("https://www.dropbox.com/sh/x"), "Dropbox");
assert.equal(layananTautan("https://galeri.contoh.id/album/1"), "galeri.contoh.id");
assert.equal(layananTautan("bukan url"), null);

console.log("dokumentasi.check: ok");
