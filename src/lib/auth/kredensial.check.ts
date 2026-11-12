import assert from "node:assert/strict";
process.env.SESSION_SECRET = "check-session-secret-at-least-32-characters";
process.env.INVITE_LINK_SECRET = "check-invite-secret-at-least-32-characters";
const k = await import("./kredensial.ts");

assert.equal(k.periksaSandi("short", "mas"), "Use at least 12 characters.");
assert.equal(k.periksaSandi("aaaaaaaaaaaaaa", "mas"), "Don't repeat one character.");
assert.equal(k.periksaSandi("Mas.Admin.123", "mas.admin.123"), "Don't use your username as the password.");
assert.equal(k.periksaSandi("kopi tubruk pagi hari", "mas"), null, "spaces and no symbols are fine");
assert.equal(k.periksaSandi("x".repeat(129), "mas")?.startsWith("Use at most"), true);

const h = await k.hashSandi("kopi tubruk pagi hari");
assert.match(h, /^scrypt\$32768\$8\$1\$/);
assert.equal(await k.cocokSandi("kopi tubruk pagi hari", h), true);
assert.equal(await k.cocokSandi("kopi tubruk pagi har", h), false);
assert.equal(await k.cocokSandi("x", null), false);
assert.equal(await k.cocokSandi("x", "$2b$10$bcrypthash"), false, "a bcrypt PIN hash is never a password");

const s = k.sandikanRahasia("JBSWY3DPEHPK3PXP");
assert.notEqual(s, "JBSWY3DPEHPK3PXP");
assert.equal(k.bukaRahasia(s), "JBSWY3DPEHPK3PXP");
assert.equal(k.bukaRahasia(s.slice(0, -2) + "AA"), null, "tampered cipher text");

const kode = k.buatKodeCadangan();
assert.equal(kode.length, 10);
assert.equal(new Set(kode).size, 10);
for (const c of kode) assert.match(c, /^[a-z2-9]{4}-[a-z2-9]{4}$/);
const daftar = kode.map(k.hashKodeCadangan);
// Ketikan longgar (huruf besar, spasi) menghasilkan hash yang sama dengan yang tersimpan.
assert.ok(daftar.includes(k.hashKodeCadangan(kode[3].toUpperCase().replace("-", " "))));
assert.ok(!daftar.includes(k.hashKodeCadangan("zzzz-zzzz")));

const ms = 1_800_000_000_000;
const p = k.bungkusPending({ u: "00000000-0000-4000-8000-000000000001", t: "totp", ingat: true }, ms);
assert.deepEqual(k.bukaPending(p, ms + 1000)?.t, "totp");
assert.equal(k.bukaPending(p, ms + k.PENDING_DETIK * 1000 + 1), null, "expired");
const [isi, sig] = p.split(".");
const palsu = Buffer.from(JSON.stringify({ u: "x", t: "setup", ingat: false, exp: ms * 2 })).toString("base64url");
assert.equal(k.bukaPending(`${palsu}.${sig}`, ms), null, "forged body");
assert.equal(k.bukaPending(`${isi}.x${sig.slice(1)}`, ms), null, "forged signature");

assert.equal(k.butuhDuaLangkah("admin"), true);
assert.equal(k.butuhDuaLangkah("super_admin"), true);
for (const r of ["booth", "cashier", "scanner", "viewer", "custom"]) assert.equal(k.butuhDuaLangkah(r), false);

console.log("kredensial ok");
