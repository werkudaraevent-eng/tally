import assert from "node:assert/strict";
import { berbagiMalam, emailKabarKamar, kabarBerubah, kunciKabar, perluKabar, waktuKabar } from "./kabar-kamar.ts";

// Tanpa nomor: tidak ada kunci, tidak perlu dikabari.
assert.equal(kunciKabar([{ hotel_id: 1, room: null }]), null);
assert.equal(kunciKabar([{ hotel_id: 1, room: "  " }]), null);
assert.equal(perluKabar(null, undefined), false);

// Satu nomor, spasi dirapikan; urutan stay tidak mengubah kunci.
assert.equal(kunciKabar([{ hotel_id: 1, room: " 1208 " }]), "1:1208");
assert.equal(kunciKabar([{ hotel_id: 2, room: "B 1" }, { hotel_id: 1, room: "1208" }]), "1:1208|2:B 1");
assert.equal(kunciKabar([{ hotel_id: 1, room: "1208" }, { hotel_id: 2, room: "B  1" }]), "1:1208|2:B 1");
// Satu bernomor, satu menyusul: hanya yang bernomor.
assert.equal(kunciKabar([{ hotel_id: 1, room: "1208" }, { hotel_id: 2, room: null }]), "1:1208");

// Baru, sama, berubah.
assert.equal(perluKabar("1:1208", undefined), true);
assert.equal(perluKabar("1:1208", "1:1208"), false);
assert.equal(perluKabar("1:1410", "1:1208"), true);
// Hotel kedua dapat nomor belakangan: kabar lagi.
assert.equal(perluKabar("1:1208|2:B 1", "1:1208"), true);

// Berubah vs baru: hotel kedua yang baru bernomor bukan "berubah".
assert.equal(kabarBerubah("1:1208", undefined), false);
assert.equal(kabarBerubah("1:1410", "1:1208"), true);
assert.equal(kabarBerubah("1:1208|2:B 1", "1:1208"), false);
assert.equal(kabarBerubah("1:1208|2:B 2", "1:1208|2:B 1"), true);
// Hotel lama dicopot, hotel baru bernomor: kabar baru.
assert.equal(kabarBerubah("2:B 1", "1:1208"), false);

// Berbagi malam: [masuk, keluar), kosong = tak terbatas.
const M = (masuk: string | null, keluar: string | null) => ({ masuk, keluar });
assert.equal(berbagiMalam(M("2026-11-05T07:00:00Z", "2026-11-06T05:00:00Z"), M("2026-11-06T07:00:00Z", "2026-11-08T05:00:00Z")), false);
assert.equal(berbagiMalam(M("2026-11-05T07:00:00Z", "2026-11-07T05:00:00Z"), M("2026-11-06T07:00:00Z", "2026-11-08T05:00:00Z")), true);
assert.equal(berbagiMalam(M(null, null), M("2026-11-06T07:00:00Z", "2026-11-08T05:00:00Z")), true);
assert.equal(berbagiMalam(M("2026-11-06T07:00:00Z", "2026-11-06T07:00:00Z"), M(null, null)), false);
// Keluar tepat saat yang lain masuk: tidak berbagi malam.
assert.equal(berbagiMalam(M("2026-11-05T07:00:00Z", "2026-11-06T07:00:00Z"), M("2026-11-06T07:00:00Z", null)), false);

// Waktu di zona acara, bahasa acara.
assert.equal(waktuKabar("2026-11-06T07:00:00Z", "Asia/Jakarta", "id"), "Jumat, 6 November pukul 14.00");
assert.equal(waktuKabar(null, "Asia/Jakarta", "id"), null);

const stays = [{ hotel_id: 1, hotel: "Hotel <A>", alamat: null, room: "1208", masuk: "2026-11-06T07:00:00Z", keluar: "2026-11-08T05:00:00Z", teman: ["Abdul Kadir"] }];
const id = emailKabarKamar({ bahasa: "id", eventName: "Acara", nama: "Bayu", stays, berubah: false, portalUrl: "https://x.test/e/a/peserta?tab=perjalanan", zona: "Asia/Jakarta" });
assert.equal(id.subject, "Kamar 1208 sudah siap · Acara");
assert.ok(id.html.includes("Hotel &lt;A&gt;") && !id.html.includes("Hotel <A>"));
assert.ok(id.text.includes("Teman sekamar: Abdul Kadir"));
assert.ok(id.text.includes("Check-in: Jumat, 6 November pukul 14.00"));
const ubah = emailKabarKamar({ bahasa: "en", eventName: "Event", nama: "Bayu", stays, berubah: true, portalUrl: "https://x.test", zona: "Asia/Jakarta" });
assert.equal(ubah.subject, "Your room is now 1208 · Event");
assert.ok(ubah.html.includes('lang="en"'));

console.log("kabar-kamar ok");
