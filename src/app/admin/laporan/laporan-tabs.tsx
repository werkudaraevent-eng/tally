"use client";

import { LinkTabs } from "@/components/m3";

/** Event report: deck untuk manajemen, dan highlight harian untuk klien. */
export function LaporanTabs() {
  return (
    <LinkTabs
      label="Event report"
      tabs={[
        { href: "/admin/laporan", label: "Deck" },
        { href: "/admin/laporan/harian", label: "Daily highlights" },
      ]}
    />
  );
}
