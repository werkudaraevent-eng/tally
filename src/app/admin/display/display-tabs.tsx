"use client";

import { LinkTabs } from "@/components/m3/link-tabs";
import { cx } from "@/lib/m3/cx";

/** Tab tingkat halaman untuk tiga sub-halaman Papan peringkat. */
export function DisplayTabs({ revealMode }: {
  /** Status reveal bila halaman pemanggil sudah membacanya; null = tidak ditampilkan. */
  revealMode?: "off" | "staged" | null;
}) {
  const badge = revealMode ? (
    <span className={cx(
      "inline-flex items-center gap-1.5 rounded px-1.5 text-label-medium font-medium",
      revealMode === "staged" ? "bg-accent-soft text-primary" : "bg-surface-container-high text-on-surface-variant",
    )}>
      <span aria-hidden className={cx("size-1.5 rounded-full", revealMode === "staged" ? "bg-primary" : "bg-outline")} />
      {revealMode === "staged" ? "Aktif" : "Mati"}
    </span>
  ) : null;

  return (
    <LinkTabs
      label="Bagian papan peringkat"
      tabs={[
        { href: "/admin/display", label: "Setelan" },
        { href: "/admin/display/reveal", label: "Reveal bertahap", badge },
        { href: "/admin/display/exclusions", label: "Pengecualian" },
      ]}
    />
  );
}
