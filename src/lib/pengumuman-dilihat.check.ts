import assert from "node:assert/strict";
import { persenDilihat, ringkasDilihat, statusDilihat } from "./pengumuman-dilihat.ts";

const TERBIT = "2026-11-06T21:05:00.000Z";

// Tanpa akun: belum pernah masuk portal, jadi belum bisa melihat apa pun.
assert.equal(statusDilihat(TERBIT, null), "belum_masuk");
assert.equal(statusDilihat(TERBIT, undefined), "belum_masuk");
// Akun ada tapi belum pernah masuk dan belum pernah membuka lonceng.
assert.equal(statusDilihat(TERBIT, { last_login_at: null, announcements_seen_at: null }), "belum_masuk");
// Sudah masuk, lonceng belum pernah dibuka.
assert.equal(statusDilihat(TERBIT, { last_login_at: "2026-11-05T10:00:00Z", announcements_seen_at: null }), "belum");
// Lonceng dibuka sebelum terbit: belum melihat yang ini.
assert.equal(statusDilihat(TERBIT, { last_login_at: "2026-11-05T10:00:00Z", announcements_seen_at: "2026-11-06T21:04:59Z" }), "belum");
// Tepat saat terbit dan sesudahnya: sudah dilihat.
assert.equal(statusDilihat(TERBIT, { last_login_at: "2026-11-05T10:00:00Z", announcements_seen_at: TERBIT }), "dilihat");
assert.equal(statusDilihat(TERBIT, { last_login_at: "2026-11-05T10:00:00Z", announcements_seen_at: "2026-11-06T22:00:00Z" }), "dilihat");
// Membuka lonceng berarti pernah masuk, walau last_login_at kosong.
assert.equal(statusDilihat(TERBIT, { last_login_at: null, announcements_seen_at: "2026-11-06T22:00:00Z" }), "dilihat");
assert.equal(statusDilihat(TERBIT, { last_login_at: null, announcements_seen_at: "2026-11-06T20:00:00Z" }), "belum");
// Notify again memajukan published_at: yang melihat sebelumnya kembali belum.
assert.equal(statusDilihat("2026-11-06T23:00:00Z", { last_login_at: "2026-11-05T10:00:00Z", announcements_seen_at: "2026-11-06T22:00:00Z" }), "belum");
// Stempel rusak tidak dihitung dilihat.
assert.equal(statusDilihat("bukan waktu", { last_login_at: "2026-11-05T10:00:00Z", announcements_seen_at: "2026-11-06T22:00:00Z" }), "belum");

assert.deepEqual(ringkasDilihat(["dilihat", "belum", "dilihat", "belum_masuk"]), { total: 4, dilihat: 2, belum: 1, belum_masuk: 1 });
assert.deepEqual(ringkasDilihat([]), { total: 0, dilihat: 0, belum: 0, belum_masuk: 0 });
assert.equal(persenDilihat({ total: 446, dilihat: 312 }), 70);
assert.equal(persenDilihat({ total: 0, dilihat: 0 }), 0);

console.log("pengumuman-dilihat ok");
