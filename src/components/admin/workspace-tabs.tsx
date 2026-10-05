"use client";

import { CalendarDots, ShieldCheck } from "@phosphor-icons/react";
import Link from "next/link";

const TAB = "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-body-medium";
const AKTIF = "bg-[var(--press-active)] font-medium text-on-surface";
const DIAM = "text-on-surface-variant hover:bg-[var(--press-hover)]";

/**
 * Dua halaman tingkat workspace, di luar acara mana pun: daftar acara dan akun
 * panitia. Akun berlaku untuk semua acara, jadi ia duduk di sebelah Events,
 * bukan di dalam salah satu acara (pola yang sama dengan Stripe dan Shopify:
 * tim dikelola di tingkat akun, bukan per toko atau per produk).
 *
 * Hanya untuk admin dan super admin. Peran lain tidak bisa membuka /users, dan
 * tab yang mengantar ke penolakan lebih buruk daripada tidak ada tab.
 */
export function WorkspaceTabs({ current }: { current: "events" | "users" }) {
  return (
    <nav aria-label="Workspace" className="ml-4 flex items-center gap-1">
      <Link href="/events" aria-current={current === "events" ? "page" : undefined} className={`${TAB} ${current === "events" ? AKTIF : DIAM}`}>
        <CalendarDots size={16} /> Events
      </Link>
      <Link href="/users" aria-current={current === "users" ? "page" : undefined} className={`${TAB} ${current === "users" ? AKTIF : DIAM}`}>
        <ShieldCheck size={16} /> Users &amp; roles
      </Link>
    </nav>
  );
}
