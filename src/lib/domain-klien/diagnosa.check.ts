import assert from "node:assert/strict";
import { dnsProblem, recordsFor } from "./diagnosa.ts";

const cfg = (x: object) => ({ configuredBy: null, misconfigured: true, recommendedCNAME: [{ rank: 2, value: "b.vercel-dns-017.com" }, { rank: 1, value: "a1b2.vercel-dns-017.com." }], recommendedIPv4: [{ rank: 1, value: ["216.198.79.1"] }], ...x });

// Temuan QA M3: nilai CNAME dari API (rank 1), bukan teks tetap.
assert.deepEqual(recordsFor("event.klien.co.id", cfg({}) as never, { name: "event.klien.co.id", verified: true }), [
  { purpose: "arah", type: "CNAME", name: "event", value: "a1b2.vercel-dns-017.com" },
]);
assert.deepEqual(recordsFor("klien.com", cfg({}) as never, null), [{ purpose: "arah", type: "A", name: "@", value: "216.198.79.1" }]);
// Tanpa jawaban API: nilai bawaan Vercel.
assert.equal(recordsFor("event.klien.com", null, null)[0].value, "cname.vercel-dns.com");
// Domain yang pernah dipakai di akun lain: ada kartu kepemilikan TXT.
const belum = { name: "event.klien.com", verified: false, verification: [{ type: "TXT", domain: "_vercel.klien.com", value: "vc-domain-verify=event.klien.com,abc" }] };
assert.deepEqual(recordsFor("event.klien.com", cfg({}) as never, belum)[1], { purpose: "kepemilikan", type: "TXT", name: "_vercel", value: "vc-domain-verify=event.klien.com,abc" });

assert.equal(dnsProblem(cfg({}) as never, belum).masalah, "kepemilikan");
assert.equal(dnsProblem(cfg({}) as never, null).masalah, "belum_ada");
assert.deepEqual(dnsProblem(cfg({ cnames: ["ilo-forum.org."] }) as never, null), { masalah: "mengarah_lain", tujuanLain: "ilo-forum.org" });
assert.equal(dnsProblem(cfg({ configuredBy: "http" }) as never, null).masalah, "cloudflare");
assert.equal(dnsProblem(cfg({ conflicts: [{ name: "klien.com", type: "CAA", value: "0 issue \"digicert.com\"" }] }) as never, null).masalah, "caa");
assert.equal(dnsProblem(cfg({ configuredBy: "CNAME", misconfigured: false }) as never, { name: "x", verified: true }).masalah, null);

console.log("diagnosa.check.ts OK");
