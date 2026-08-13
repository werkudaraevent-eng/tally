"use client";

/**
 * Prefix API path dengan event dari URL browser.
 *
 * Halaman tetap berada di /e/<slug>/..., tetapi file page lama dipakai ulang
 * lewat rewrite Next.js. Fetch absolut `/api/...` akan kehilangan slug; helper
 * ini mempertahankannya sebagai `/e/<slug>/api/...` lalu rewrite meneruskannya
 * ke route handler sebagai query `eventSlug`.
 */
export function eventApiPath(path: string, pathname = window.location.pathname) {
  const match = pathname.match(/^\/e\/([^/]+)/);
  if (!match) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `/e/${encodeURIComponent(decodeURIComponent(match[1]))}${normalized}`;
}