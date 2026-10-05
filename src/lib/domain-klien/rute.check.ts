import assert from "node:assert/strict";
import { decideClientHost, redirectToClient, type StatusPeta } from "./rute.ts";

const dasar: { slug: string; status: StatusPeta; tallyOrigin: string } = { slug: "ilo", status: "aktif", tallyOrigin: "https://event.sofish.tech" };
const putuskan = (pathname: string, query = "", lain: Partial<typeof dasar> = {}) => decideClientHost({ ...dasar, ...lain, pathname, search: new URLSearchParams(query) });

assert.deepEqual(putuskan("/"), { kind: "layani", pathname: "/e/ilo", addSlugQuery: false });
assert.deepEqual(putuskan("/en"), { kind: "layani", pathname: "/e/ilo/en", addSlugQuery: false });
// Temuan QA H4: semua halaman peserta dilayani, bukan daftar tetap.
for (const p of ["/e/ilo/rundown", "/e/ilo/denah", "/e/ilo/vote", "/e/ilo/kode/abc", "/e/ilo/masuk", "/e/ilo/peserta", "/api/peserta/sesi", "/api/pesan/berhenti", "/_next/static/x.js"]) {
  assert.equal(putuskan(p).kind, "layani", p);
}
assert.deepEqual(putuskan("/daftar"), { kind: "layani", pathname: "/daftar", addSlugQuery: true });
assert.deepEqual(putuskan("/daftar", "eventSlug=ilo"), { kind: "layani", pathname: "/daftar", addSlugQuery: false });
// Ruang kerja panitia, API admin, dan acara lain tidak pernah dilayani.
for (const p of ["/admin", "/admin/settings", "/login", "/booth", "/cashier", "/scan", "/api/admin/domain", "/api/cron/pesan", "/api/settings", "/e/acara-lain", "/e/acara-lain/rundown", "/e/ilo/admin/settings", "/e/ilo/booth", "/e/ilo/api/admin/domain", "/stasiun", "/cetak-badge", "/e/ilo/stasiun", "/e/ilo/cetak-badge", "/users", "/e/ilo/users"]) {
  assert.equal(putuskan(p).kind, "tolak", p);
}
assert.equal(putuskan("/daftar", "eventSlug=lain").kind, "tolak");
assert.equal(putuskan("/.well-known/tally-domain").kind, "penanda");
// Menunggu juga dilayani (Tally harus bisa membuka domainnya sebelum Aktif).
assert.equal(putuskan("/", "", { status: "menunggu" }).kind, "layani");
// Dilepas: dialihkan ke alamat Tally, path dan query ikut.
assert.deepEqual(putuskan("/", "", { status: "dilepas" }), { kind: "alihkan", to: "https://event.sofish.tech/e/ilo" });
assert.deepEqual(putuskan("/e/ilo/masuk", "sandi=x", { status: "dilepas" }), { kind: "alihkan", to: "https://event.sofish.tech/e/ilo/masuk?sandi=x" });
// Temuan QA M2: path di luar /e/<slug> tidak dibuang, dan API (berhenti
// berlangganan GET dan POST one-click) dilayani tanpa pengalihan.
assert.deepEqual(putuskan("/daftar", "", { status: "dilepas" }), { kind: "alihkan", to: "https://event.sofish.tech/e/ilo/daftar" });
assert.equal(putuskan("/api/pesan/berhenti", "e=1&p=2", { status: "dilepas" }).kind, "layani");
assert.equal(putuskan("/e/ilo/api/leaderboard", "", { status: "dilepas" }).kind, "layani");
assert.equal(putuskan("/admin", "", { status: "dilepas" }).kind, "tolak");

const peta = (slug: string) => (slug === "ilo" ? { domain: "event.ilo-forum.org", status: "aktif" as const } : slug === "tunggu" ? { domain: "x.id", status: "menunggu" as const } : undefined);
const alih = (pathname: string, extra: Partial<{ method: string; fetchDest: string | null; search: string }> = {}) =>
  redirectToClient({ pathname, search: extra.search ?? "", method: extra.method ?? "GET", fetchDest: extra.fetchDest ?? null, domainFor: peta });
assert.equal(alih("/e/ilo", { search: "?ref=wa" }), "https://event.ilo-forum.org/e/ilo?ref=wa");
assert.equal(alih("/e/ilo/masuk", { search: "?sandi=abc" }), "https://event.ilo-forum.org/e/ilo/masuk?sandi=abc");
assert.equal(alih("/e/ilo/api/leaderboard"), null);
assert.equal(alih("/e/ilo", { method: "POST" }), null);
// Temuan QA M6: pratinjau admin di iframe tidak dialihkan.
assert.equal(alih("/e/ilo", { fetchDest: "iframe" }), null);
assert.equal(alih("/e/tunggu"), null);
assert.equal(alih("/admin"), null);
// Temuan QA H1: hanya halaman peserta yang dialihkan.
for (const p of ["/e/ilo/en", "/e/ilo/id/", "/e/ilo/daftar", "/e/ilo/en/daftar", "/e/ilo/peserta", "/e/ilo/peserta/tiket", "/e/ilo/rundown", "/e/ilo/denah", "/e/ilo/kode/ABC123"]) {
  assert.equal(alih(p), `https://event.ilo-forum.org${p}`, p);
}
for (const p of ["/e/ilo/admin", "/e/ilo/admin/settings", "/e/ilo/booth", "/e/ilo/cashier", "/e/ilo/scan", "/e/ilo/display", "/e/ilo/undian", "/e/ilo/workspace", "/e/ilo/pratinjau", "/e/ilo/api/pesan/berhenti", "/e/ilo/vote", "/e/ilo/stasiun", "/e/ilo/cetak-badge"]) {
  assert.equal(alih(p), null, p);
}

console.log("rute.check.ts OK");
