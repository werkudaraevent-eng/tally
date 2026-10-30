/**
 * Pemeriksaan mandiri untuk izin per modul akun kustom.
 *
 * Jalankan: node --experimental-strip-types src/lib/auth/izin-modul.check.ts
 *
 * Kesalahan di sini tidak terlihat dari layar: route tetap 200 dan akun klien
 * diam-diam bisa menulis ke modul yang tidak pernah diberikan.
 */
import assert from "node:assert/strict";
import { halamanPertama, izinApi, modulHalaman, rapikanIzin } from "./izin-modul.ts";

const klien = rapikanIzin({
  modules: { dashboard: "view", participants: "manage", registration: "view", checkin: "view", messages: "manage" },
  participants_download: true,
  messages_send_email: false,
});
const boleh = (path: string, method = "GET") => izinApi(klien, path, method).boleh;

// Bentuk: kunci asing dibuang, tingkat yang tidak tersedia turun.
const rapi = rapikanIzin({ modules: { checkin: "manage", logistics: "view", hacker: "manage", dashboard: "edit" }, participants_download: true, messages_send_email: true });
assert.deepEqual(rapi.modules, { checkin: "view" });
assert.equal(rapi.participants_download, false, "unduh tanpa modul peserta tidak berarti");
assert.equal(rapi.messages_send_email, false, "kirim email butuh Messages Manage");
assert.deepEqual(rapikanIzin(null).modules, {});
assert.deepEqual(rapikanIzin("x").modules, {});

// Peserta
assert.equal(boleh("/api/admin/participants"), true);
assert.equal(boleh("/e/kso/api/admin/participants"), true, "prefiks /e/<slug> dibuang");
assert.equal(boleh("/api/admin/participants", "POST"), true);
assert.equal(boleh("/api/admin/participants/3f2a", "PATCH"), true);
assert.equal(boleh("/api/admin/participants/3f2a", "DELETE"), true);
assert.equal(boleh("/api/admin/participants/bulk-delete", "POST"), true);
assert.equal(boleh("/api/admin/participants/import", "POST"), false, "impor tetap milik panitia");
assert.equal(boleh("/api/admin/participants/sync", "POST"), false);
assert.equal(boleh("/api/admin/participants/scanner-config"), false);
assert.equal(boleh("/api/admin/participants/scanner-config", "PATCH"), false);
assert.equal(boleh("/api/admin/participants/3f2a/check-in"), true);
assert.equal(boleh("/api/admin/participants/3f2a/check-in", "DELETE"), false, "reset check-in tetap milik panitia");
assert.equal(boleh("/api/admin/participants/export"), true);
assert.equal(izinApi({ ...klien, participants_download: false }, "/api/admin/participants/export", "GET").boleh, false);

// Lihat saja: tulis ditolak.
const lihat = rapikanIzin({ modules: { participants: "view" } });
assert.equal(izinApi(lihat, "/api/admin/participants", "GET").boleh, true);
assert.equal(izinApi(lihat, "/api/admin/participants", "POST").boleh, false);
assert.equal(izinApi(lihat, "/api/admin/participants/x", "DELETE").boleh, false);

// Registrasi: lihat saja di peran ini; PATCH (setelan) tidak pernah.
assert.equal(boleh("/api/admin/registrasi"), true);
assert.equal(boleh("/api/admin/registrasi", "POST"), false);
assert.equal(izinApi(rapikanIzin({ modules: { registration: "manage" } }), "/api/admin/registrasi", "POST").boleh, true);
assert.equal(izinApi(rapikanIzin({ modules: { registration: "manage" } }), "/api/admin/registrasi", "PATCH").boleh, false);

// Check-in: lihat saja.
assert.equal(boleh("/api/admin/attendance"), true);
assert.equal(boleh("/api/admin/attendance", "POST"), false);
assert.equal(boleh("/api/admin/attendance/settings", "PATCH"), false);
assert.equal(boleh("/api/admin/checkpoints", "POST"), false);
assert.equal(boleh("/api/attendance/scan", "POST"), false, "pemindai bukan untuk akun kustom");

// Pesan: tulis boleh, kirim email butuh sakelar.
assert.equal(boleh("/api/admin/pesan", "POST"), true);
assert.equal(boleh("/api/admin/pesan/12", "PATCH"), true);
assert.equal(boleh("/api/admin/pesan/12/kirim", "POST"), false);
assert.equal(boleh("/api/admin/pesan/tes", "POST"), false);
assert.equal(boleh("/api/admin/pengumuman/email", "POST"), false);
assert.equal(boleh("/api/admin/pengumuman", "POST"), true);
assert.equal(boleh("/api/settings", "PATCH"), false);
const kirim = rapikanIzin({ modules: { messages: "manage" }, messages_send_email: true });
assert.equal(izinApi(kirim, "/api/admin/pesan/12/kirim", "POST").boleh, true);

// Modul lain dan route milik pemilik tertutup.
for (const [path, method] of [
  ["/api/admin/logistik", "GET"], ["/api/admin/landing", "PATCH"], ["/api/admin/audit", "GET"], ["/api/admin/users", "GET"],
  ["/api/admin/reset", "POST"], ["/api/admin/domain", "GET"], ["/api/admin/event-details", "GET"], ["/api/admin/undian/exclusions", "GET"],
  ["/api/admin/access-roles", "GET"], ["/api/admin/export", "GET"], ["/api/admin/stats", "GET"],
]) assert.equal(boleh(path, method), false, `${method} ${path} harus tertutup`);

// Halaman
assert.equal(modulHalaman("/admin"), "dashboard");
assert.equal(modulHalaman("/admin/participants"), "participants");
assert.equal(modulHalaman("/admin/pengumuman/kiriman/12"), "messages");
assert.equal(modulHalaman("/admin/participantsx"), null);
assert.equal(modulHalaman("/admin/pengumuman/otomatis"), null, "Email otomatis milik panitia");
assert.equal(modulHalaman("/admin/pengumuman/otomatis?tab=1"), null);
assert.equal(modulHalaman("/admin/participants?peserta=x"), "participants");
assert.equal(modulHalaman("/admin?x=1"), "dashboard");
assert.equal(modulHalaman("/admin/settings"), null);
assert.equal(halamanPertama(klien), "/admin");
assert.equal(halamanPertama(rapikanIzin({ modules: { checkin: "view" } })), "/admin/attendance");
assert.equal(halamanPertama(rapikanIzin({})), null);

console.log("izin-modul OK");
