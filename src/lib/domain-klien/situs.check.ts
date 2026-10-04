import assert from "node:assert/strict";
import { domainReadiness, fixedSiteOrigin, productionSiteOrigin, tallyHosts } from "./situs.ts";

// Temuan QA M2: asal produksi TIDAK BOLEH bergantung pada domain terpendek.
const pendek = { VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "ilo-forum.id", TALLY_SITE_URL: "https://event.sofish.tech/" };
assert.equal(productionSiteOrigin(pendek), "https://event.sofish.tech");
assert.equal(fixedSiteOrigin({ TALLY_SITE_URL: "event.sofish.tech" }), "https://event.sofish.tech");
// Tanpa TALLY_SITE_URL perilaku lama tetap (belum ada domain klien yang bisa ditambahkan).
assert.equal(productionSiteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "event.sofish.tech" }), "https://event.sofish.tech");
assert.equal(productionSiteOrigin({}), null);
assert.deepEqual(tallyHosts(pendek), ["event.sofish.tech", "ilo-forum.id"]);

const vercel = { VERCEL_API_TOKEN: "t", VERCEL_TEAM_ID: "team_x", VERCEL_PROJECT_ID: "prj_x" };
// Kunci keras: tanpa TALLY_SITE_URL fitur menolak, apa pun yang lain.
assert.deepEqual(domainReadiness({ VERCEL_ENV: "production", ...vercel }), { ready: false, reason: "site_url_missing" });
// Preview tidak pernah boleh menambah domain (database produksi dipakai bersama).
assert.deepEqual(domainReadiness({ VERCEL_ENV: "preview", TALLY_SITE_URL: "https://event.sofish.tech", ...vercel }), { ready: false, reason: "not_production" });
assert.deepEqual(domainReadiness({ VERCEL_ENV: "preview", DOMAIN_KLIEN_UJI: "1", TALLY_SITE_URL: "x.id", ...vercel }), { ready: false, reason: "not_production" });
assert.deepEqual(domainReadiness({ VERCEL_ENV: "production", TALLY_SITE_URL: "https://event.sofish.tech" }), { ready: false, reason: "vercel_missing" });
const siap = domainReadiness({ VERCEL_ENV: "production", TALLY_SITE_URL: "https://event.sofish.tech", ...vercel });
assert.equal(siap.ready, true);
assert.equal(siap.ready && siap.apiBase, "https://api.vercel.com");
assert.equal(domainReadiness({ DOMAIN_KLIEN_UJI: "1", TALLY_SITE_URL: "localhost.test", ...vercel, VERCEL_API_BASE: "http://localhost:4010/" }).ready, true);

console.log("situs.check.ts OK");
