/**
 * Prefiks href dengan `/e/<slug>` dari pathname saat ini.
 *
 * Murni dan tanpa React supaya bisa diuji langsung (`event-path.check.ts`);
 * pemakainya adalah `src/components/event-link.tsx`.
 */
export function withEventPrefix(href: string, pathname: string): string {
  const prefix = pathname.match(/^\/e\/[^/]+/)?.[0] ?? "";
  if (prefix === "") return href;
  // `//` = URL protocol-relative (host lain), `/e/` sudah ber-scope sendiri.
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/e/")) return href;
  return `${prefix}${href}`;
}
