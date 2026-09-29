"use client";

import { usePathname } from "next/navigation";
import Link from "@/components/event-link";
import { cx } from "@/lib/m3/cx";

/**
 * Tab tingkat halaman untuk tiga sub-halaman Papan peringkat.
 *
 * Tiap tab adalah ROUTE sendiri, jadi ini navigasi (`<nav>` + tautan dengan
 * `aria-current`), bukan `tablist`. Komponen `Tabs` mengganti panel di memori
 * dan memindah fokus ke tab berikutnya lewat panah; untuk route, panah itu akan
 * memicu perpindahan halaman di setiap ketukan dan fokusnya hilang saat halaman
 * baru dirender. Rupanya meniru `Tabs`: rel 1px, garis aktif 2px di bawah.
 */

const TAB = [
  { href: "/admin/display", label: "Setelan" },
  { href: "/admin/display/reveal", label: "Reveal bertahap" },
  { href: "/admin/display/exclusions", label: "Pengecualian" },
] as const;

export function DisplayTabs({ revealMode }: {
  /** Status reveal bila halaman pemanggil sudah membacanya; null = tidak ditampilkan. */
  revealMode?: "off" | "staged" | null;
}) {
  const pathname = usePathname();
  const path = pathname.replace(/^\/e\/[^/]+/, "").replace(/\/+$/, "") || "/";

  return (
    <nav aria-label="Bagian papan peringkat" className="flex shrink-0 gap-1 overflow-x-auto border-b border-outline-variant">
      {TAB.map((tab) => {
        const aktif = path === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={aktif ? "page" : undefined}
            className={cx(
              "relative flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-t-md px-3 text-body-medium",
              aktif ? "font-medium text-on-surface" : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            {tab.label}
            {tab.href === "/admin/display/reveal" && revealMode ? (
              <span className={cx(
                "inline-flex items-center gap-1.5 rounded px-1.5 text-label-medium font-medium",
                revealMode === "staged" ? "bg-accent-soft text-primary" : "bg-surface-container-high text-on-surface-variant",
              )}>
                <span aria-hidden className={cx("size-1.5 rounded-full", revealMode === "staged" ? "bg-primary" : "bg-outline")} />
                {revealMode === "staged" ? "Aktif" : "Mati"}
              </span>
            ) : null}
            {aktif ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
