import assert from "node:assert/strict";
import { withEventPrefix } from "./event-path.ts";

const DI_EVENT = "/e/prima-executive-gathering-2026/admin/settings";

// Kasus yang memicu perbaikan ini: dari settings ber-scope, "Kembali ke
// Dashboard" mendarat di /admin dan kehilangan eventnya.
assert.equal(withEventPrefix("/admin", DI_EVENT), "/e/prima-executive-gathering-2026/admin");
assert.equal(withEventPrefix("/display?fullscreen=1", DI_EVENT), "/e/prima-executive-gathering-2026/display?fullscreen=1");

// Di luar scope event, href dibiarkan apa adanya.
assert.equal(withEventPrefix("/admin", "/admin/settings"), "/admin");

// Sudah ber-scope: prefiks kedua akan menghasilkan /e/x/e/x/admin.
assert.equal(withEventPrefix("/e/lain/admin", DI_EVENT), "/e/lain/admin");

// /events IKUT diprefiks, dan itu tidak apa-apa: proxy me-rewrite-nya menjadi
// /events?eventSlug=... sehingga pemilih event tetap tampil utuh. Dicatat di
// sini supaya perilakunya disengaja, bukan kejutan. Tombol "Ganti event" di
// sidebar sendiri memakai next/link biasa (admin-shell), jadi tidak lewat sini.
assert.equal(withEventPrefix("/events", DI_EVENT), "/e/prima-executive-gathering-2026/events");

// Bukan path absolut / bukan host ini.
assert.equal(withEventPrefix("https://contoh.test/x", DI_EVENT), "https://contoh.test/x");
assert.equal(withEventPrefix("//contoh.test/x", DI_EVENT), "//contoh.test/x");
assert.equal(withEventPrefix("#bagian", DI_EVENT), "#bagian");

console.log("event-path.check.ts OK");
