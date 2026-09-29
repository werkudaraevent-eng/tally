"use client";

import { CaretRight, Storefront } from "@phosphor-icons/react";
// `event-link`, bukan `next/link`: tautan admin harus mempertahankan `/e/<slug>`
// supaya tidak mendarat di booth acara lain.
import Link from "@/components/event-link";

export function BoothManagementLink() {
  return (
    <Link href="/admin/booths" className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 text-body-medium hover:bg-primary-soft">
      <Storefront size={20} aria-hidden className="shrink-0 text-on-surface" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-on-surface">Booth & item</span>
        <span className="block text-on-surface-variant">Nama, kode, status booth, dan item spesialnya.</span>
      </span>
      <CaretRight size={14} aria-hidden className="shrink-0 text-on-surface-variant" />
    </Link>
  );
}
