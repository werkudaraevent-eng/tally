import assert from "node:assert/strict";
import { dnsRecordName, isApex, normalizeDomain, relativeName } from "./normalisasi.ts";

// Input yang biasa ditempel admin dinormalkan diam-diam.
assert.deepEqual(normalizeDomain(" https://Event.Klien.co.id/daftar?x=1 "), { ok: true, domain: "event.klien.co.id", apex: false });
assert.deepEqual(normalizeDomain("event.klien.com."), { ok: true, domain: "event.klien.com", apex: false });
assert.deepEqual(normalizeDomain("klien.com"), { ok: true, domain: "klien.com", apex: true });
assert.deepEqual(normalizeDomain("klien.co.id"), { ok: true, domain: "klien.co.id", apex: true });

// Yang bukan domain ditolak dengan pesan biasa.
for (const salah of ["", "klien", "event klien.com", "-a.klien.com", "http://", "klien.c0m"]) {
  assert.equal(normalizeDomain(salah).ok, false, salah);
}

// Domain Tally dan Vercel tidak boleh dipakai.
assert.equal((normalizeDomain("ilo.sofish.tech") as { code: string }).code, "DOMAIN_RESERVED");
assert.equal((normalizeDomain("event.sofish.tech") as { code: string }).code, "DOMAIN_RESERVED");
assert.equal((normalizeDomain("tally.vercel.app") as { code: string }).code, "DOMAIN_RESERVED");
assert.equal((normalizeDomain("eventhub.werkudara.group") as { code: string }).code, "DOMAIN_RESERVED");
assert.equal((normalizeDomain("tally.contoh.id", ["tally.contoh.id"]) as { code: string }).code, "DOMAIN_RESERVED");

assert.equal(isApex("event.klien.com"), false);
assert.equal(dnsRecordName("event.klien.co.id"), "event");
assert.equal(dnsRecordName("forum.event.klien.com"), "forum.event");
assert.equal(dnsRecordName("klien.com"), "@");
assert.equal(relativeName("_vercel.klien.co.id", "event.klien.co.id"), "_vercel");
assert.equal(relativeName("_vercel.event.klien.com", "event.klien.com"), "_vercel.event");

console.log("normalisasi.check.ts OK");
