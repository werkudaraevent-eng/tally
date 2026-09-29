"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import Link from "@/components/event-link";
import { cx } from "@/lib/m3/cx";

export type LinkTab = {
  /** Path tanpa awalan `/e/<slug>`, misalnya `/admin/display/reveal`. */
  href: string;
  label: string;
  /** Penanda kecil di samping label, misalnya status. */
  badge?: ReactNode;
};

/**
 * Tab tingkat halaman yang tiap tabnya adalah ROUTE sendiri.
 *
 * Ini navigasi (`<nav>` + tautan dengan `aria-current`), bukan `tablist`.
 * Komponen `Tabs` mengganti panel di memori dan memindah fokus ke tab berikutnya
 * lewat panah; untuk route, panah itu akan memicu perpindahan halaman di setiap
 * ketukan dan fokusnya hilang saat halaman baru dirender. Rupanya meniru `Tabs`:
 * rel 1px, garis aktif 2px di bawah.
 */
export function LinkTabs({ tabs, label }: { tabs: readonly LinkTab[]; label: string }) {
  const pathname = usePathname();
  const path = pathname.replace(/^\/e\/[^/]+/, "").replace(/\/+$/, "") || "/";

  return (
    <nav aria-label={label} className="flex shrink-0 gap-1 overflow-x-auto border-b border-outline-variant">
      {tabs.map((tab) => {
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
            {tab.badge}
            {aktif ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
