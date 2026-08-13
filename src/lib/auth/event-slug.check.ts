/**
 * Pemeriksaan mandiri untuk eventSlugFromRequest().
 *
 * Jalankan: node --experimental-strip-types src/lib/auth/event-slug.check.ts
 *
 * Alasan ada: urutan prioritas sumber slug (query > path > referer) pernah salah
 * dan gagalnya SENYAP -- permintaan tetap dilayani, hanya event-nya yang keliru.
 * Galat semacam itu tidak muncul di typecheck maupun lint.
 */
import assert from "node:assert/strict";

// Ekstensi .ts ditulis eksplisit karena berkas ini dijalankan langsung oleh
// Node (ESM), bukan lewat bundler Next.
import { eventSlugFromRequest } from "./event-slug.ts";

function req(url: string, referer?: string) {
  return new Request(url, referer ? { headers: { referer } } : undefined);
}

const BASE = "http://x";

// Query menang atas semuanya.
assert.equal(
  eventSlugFromRequest(req(`${BASE}/e/dari-path/api/settings?eventSlug=dari-query`, `${BASE}/e/dari-referer/admin`)),
  "dari-query",
);

// Path menang atas referer.
assert.equal(eventSlugFromRequest(req(`${BASE}/e/dari-path/api/settings`, `${BASE}/e/dari-referer/admin`)), "dari-path");

// Referer dipakai saat pemanggil klien memakai `/api/...` absolut.
assert.equal(eventSlugFromRequest(req(`${BASE}/api/settings`, `${BASE}/e/dari-referer/admin/orders`)), "dari-referer");

// Referer yang bukan halaman event tidak menghasilkan slug.
assert.equal(eventSlugFromRequest(req(`${BASE}/api/settings`, `${BASE}/admin/orders`)), undefined);

// Tanpa referer: jatuh ke fallback event aktif tunggal.
assert.equal(eventSlugFromRequest(req(`${BASE}/api/settings`)), undefined);

// Referer rusak tidak boleh melempar galat.
assert.equal(eventSlugFromRequest(req(`${BASE}/api/settings`, "bukan-url")), undefined);

// Referer TIDAK dipakai untuk halaman (non-/api). Halaman menerima slug lewat
// rewrite proxy; membaca referer di sana berarti navigasi dari halaman event
// bisa membajak halaman yang seharusnya netral.
assert.equal(eventSlugFromRequest(req(`${BASE}/admin/orders`, `${BASE}/e/dari-referer/admin`)), undefined);

// Slug ter-encode dikembalikan dalam bentuk terbaca.
assert.equal(eventSlugFromRequest(req(`${BASE}/api/settings`, `${BASE}/e/acara%20dua/admin`)), "acara dua");

// `/e/<slug>` tanpa sisa path bukan permintaan API; polanya butuh garis miring.
assert.equal(eventSlugFromRequest(req(`${BASE}/e/tanpa-sisa`)), undefined);

console.log("event-slug: 9 pemeriksaan lolos");
