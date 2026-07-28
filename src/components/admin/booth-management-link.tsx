"use client";

import { Storefront } from "@phosphor-icons/react";
import Link from "next/link";

export function BoothManagementLink() {
  return <Link href="/admin/booths" className="block bg-[var(--surface)] p-5 transition-colors hover:bg-[var(--surface-muted)]"><Storefront size={23} className="text-[var(--brand)]" /><p className="mt-4 font-semibold">Booth & item</p><p className="mt-1 text-xs text-[var(--ink-muted)]">Edit nama, item diskon, stok, dan status.</p></Link>;
}
