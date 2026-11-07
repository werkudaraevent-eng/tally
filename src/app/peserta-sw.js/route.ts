/**
 * Service worker portal peserta Horizon (U-02), di `/e/<slug>/peserta-sw.js`
 * (proxy me-rewrite ke sini). Lingkupnya alamat portal (`/e/<slug>/peserta`),
 * didaftarkan oleh lapisan QR (components/member/lapisan-qr.tsx).
 *
 * Tugasnya satu: bila halaman portal dibuka TANPA sinyal, sajikan halaman QR
 * luring yang disimpan portal di Cache Storage (lib/member/halaman-qr-luring),
 * bukan halaman galat peramban. Selama sinyal ada semua permintaan langsung ke
 * jaringan; tidak ada aset atau halaman lain yang di-cache. Untuk `?tab=qr`
 * sinyal yang terlalu lambat (lebih dari 4 detik) juga jatuh ke salinan itu,
 * karena QR dibutuhkan di gerbang, saat itu juga.
 *
 * Tugas kedua: notifikasi HP (Participant area > Phone notifications). Pesan
 * push berbentuk Declarative Web Push (lib/push/pesan.ts): Safari iOS 18.4+
 * menampilkannya tanpa skrip ini, peramban lain lewat handler `push` di bawah.
 * Ketukan membuka alamat `navigate` (portal acara), memakai jendela portal
 * yang sudah terbuka bila ada.
 *
 * Sengaja kecil dan tanpa versi aset: kode yang salah di service worker
 * menempel di perangkat peserta. Mematikannya: ganti isinya dengan
 * `self.registration.unregister()`.
 */
export const dynamic = "force-static";

const SKRIP = `"use strict";
const CACHE = "tally-qr-luring-v1";
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try { if (self.registration.navigationPreload) await self.registration.navigationPreload.enable(); } catch (e) {}
    await self.clients.claim();
  })());
});
async function salinan() {
  try {
    const cache = await caches.open(CACHE);
    return (await cache.match(self.registration.scope + "?tally-qr-luring")) || null;
  } catch (e) {
    return null;
  }
}
async function jaringan(event) {
  const awal = await event.preloadResponse;
  return awal || fetch(event.request);
}
async function layani(event) {
  try {
    if (new URL(event.request.url).searchParams.get("tab") === "qr") {
      const simpan = await salinan();
      if (simpan) return await Promise.race([jaringan(event), new Promise((ok) => setTimeout(() => ok(simpan), 4000))]);
    }
    return await jaringan(event);
  } catch (e) {
    return (await salinan()) || Response.error();
  }
}
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(layani(event));
});
self.addEventListener("push", (event) => {
  let isi = null;
  try { isi = event.data ? event.data.json() : null; } catch (e) {}
  const n = isi && isi.notification;
  if (!n || typeof n.title !== "string") return;
  event.waitUntil(self.registration.showNotification(n.title, {
    body: typeof n.body === "string" ? n.body : "",
    lang: n.lang,
    tag: n.tag,
    data: { navigate: n.navigate },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const tujuan = event.notification.data && event.notification.data.navigate;
  if (typeof tujuan !== "string") return;
  event.waitUntil((async () => {
    // Selalu di origin service worker ini: notifikasi tidak pernah membuka situs lain.
    const asal = new URL(tujuan, self.location.origin);
    const url = new URL(asal.pathname + asal.search, self.location.origin);
    const jendela = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const satu of jendela) {
      if (new URL(satu.url).pathname.startsWith(url.pathname) && "focus" in satu) {
        await satu.focus();
        if ("navigate" in satu) { try { await satu.navigate(url.href); } catch (e) {} }
        return;
      }
    }
    await self.clients.openWindow(url.href);
  })());
});
`;

export function GET() {
  return new Response(SKRIP, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      // Peramban memeriksa pembaruan service worker; jangan biarkan cache HTTP menahannya.
      "Cache-Control": "no-cache, max-age=0",
    },
  });
}
