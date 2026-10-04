import assert from "node:assert/strict";
import { maskEmail, normalizeInviteEmail } from "./email.ts";
import { emailHash, inviteLinkToken, parseInviteToken, verifyInviteToken, verifyInviteUnsubscribe, inviteUnsubscribeSignature } from "./tanda.ts";

const ok = (raw: string, email: string | null) => assert.deepEqual(normalizeInviteEmail(raw), { ok: true, email });
ok("  Maria@ILO.org ", "maria@ilo.org");
ok("mailto:maria@ilo.org", "maria@ilo.org");
ok("Maria Santos <Maria@ilo.org>", "maria@ilo.org");
ok("​maria@ilo.org ", "maria@ilo.org");
ok('"maria@ilo.org"', "maria@ilo.org");
ok("maria.s+event@gmail.com", "maria.s+event@gmail.com");
ok("", null);
ok("   ", null);
assert.deepEqual(normalizeInviteEmail("a@b.id; c@d.id"), { ok: false, reason: "dua_alamat" });
assert.deepEqual(normalizeInviteEmail("a@b.id, c@d.id"), { ok: false, reason: "dua_alamat" });
assert.deepEqual(normalizeInviteEmail("a@b"), { ok: false, reason: "tidak_sah" });
assert.deepEqual(normalizeInviteEmail("maria ilo.org"), { ok: false, reason: "tidak_sah" });

assert.equal(maskEmail("maria.santos@ilo.org"), "m•••@ilo.org");
assert.equal(maskEmail("m@ilo.org"), "m•••@ilo.org");

process.env.INVITE_LINK_SECRET = "x".repeat(40);
const EV = "00000000-0000-0000-0000-0000000000e1";
const ID = "00000000-0000-0000-0000-00000000a001";
const token = inviteLinkToken(EV, ID, "nonce1");
assert.equal(token.split(".")[1].length, 43);
assert.ok(verifyInviteToken(token, EV, "nonce1"));
assert.ok(!verifyInviteToken(token, EV, "nonce2"), "tautan baru mematikan yang lama");
assert.ok(!verifyInviteToken(token, "00000000-0000-0000-0000-0000000000e2", "nonce1"), "acara lain");
assert.ok(!verifyInviteToken(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"), EV, "nonce1"));
assert.equal(parseInviteToken("bukan-token"), null);
assert.equal(parseInviteToken(`${ID}.${"a".repeat(43)}.x`), null);
assert.ok(verifyInviteUnsubscribe(EV, ID, inviteUnsubscribeSignature(EV, ID)));
assert.ok(!verifyInviteUnsubscribe(EV, ID, "x"));
assert.equal(emailHash("a@b.id"), emailHash("a@b.id"));
assert.notEqual(emailHash("a@b.id"), emailHash("a@b.ie"));

console.log("undangan.check.ts OK");
