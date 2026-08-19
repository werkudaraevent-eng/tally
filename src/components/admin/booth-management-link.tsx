"use client";

import { Storefront } from "@phosphor-icons/react";
import Link from "next/link";

export function BoothManagementLink() {
  return <Link href="/admin/booths" className="rounded-lg block bg-panel p-5 transition-colors hover:bg-panel-high"><Storefront size={23} className="text-primary" /><p className="mt-4 font-semibold">Booth & item</p><p className="mt-1 text-body-small text-on-surface-variant">Edit nama, item diskon, stok, dan status.</p></Link>;
}
