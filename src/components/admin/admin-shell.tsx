"use client";

import { ArmchairIcon, CalendarDots, ChartBar, ClipboardText, GearSix, Gift, ListChecks, MonitorPlay, Receipt, ShieldCheck, SignOut, Storefront, Tag, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const navigation = [
  { href: "/admin", label: "Dashboard", icon: ChartBar, ownerOnly: false },
  { href: "/admin/orders", label: "Orders", icon: ListChecks, ownerOnly: false },
  { href: "/admin/reports", label: "Reports", icon: Receipt, ownerOnly: false },
  { href: "/admin/participants", label: "Peserta", icon: UsersThree, ownerOnly: false },
  { href: "/admin/booths", label: "Booth & item", icon: Storefront, ownerOnly: false },
  { href: "/admin/offers", label: "Item spesial", icon: Tag, ownerOnly: false },
  { href: "/admin/users", label: "User & role", icon: ShieldCheck, ownerOnly: false },
  { href: "/admin/display", label: "Live Display", icon: MonitorPlay, ownerOnly: false },
  { href: "/admin/seat-map", label: "Denah kursi", icon: ArmchairIcon, ownerOnly: false },
  { href: "/admin/rundown", label: "Rundown acara", icon: CalendarDots, ownerOnly: false },
  // Cocok dengan startsWith, jadi /admin/undian/kontrol ikut menyorot entri ini.
  { href: "/admin/undian", label: "Undian", icon: Gift, ownerOnly: false },
  // Audit trail merekam tindakan klien, jadi hanya pemilik sistem yang melihatnya.
  // Server juga menolak lewat requireUser(["super_admin"]); menyembunyikan link
  // agar klien tidak menemui halaman yang pasti gagal.
  { href: "/admin/audit", label: "Audit trail", icon: ClipboardText, ownerOnly: true },
  { href: "/admin/settings", label: "Settings", icon: GearSix, ownerOnly: false },
];

export function AdminShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
        if (response.ok) setIsOwner((await response.json()).user?.role === "super_admin");
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const visibleNavigation = navigation.filter((item) => !item.ownerOnly || isOwner);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return <div className="admin-shell min-h-dvh bg-[var(--background)] text-[var(--ink)]"><button type="button" onClick={() => setMobileOpen((open) => !open)} className="fixed left-4 top-4 z-50 flex size-11 items-center justify-center border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-sm lg:hidden" aria-label="Buka menu admin"><span className="text-xl leading-none">{mobileOpen ? "×" : "☰"}</span></button><aside className={`fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col overflow-y-auto overscroll-contain border-r border-[var(--line)] bg-[var(--surface)] transition-transform duration-200 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}><div className="border-b border-[var(--line)] px-6 py-5"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center bg-[var(--brand)] text-white"><Storefront size={22} weight="duotone" /></div><div><p className="text-sm font-semibold tracking-tight">Tally Control Room</p><p className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">Admin workspace</p></div></div></div><div className="border-b border-[var(--line)] px-6 py-5"><p className="truncate text-sm font-semibold">Event Transaction Hub</p><p className="mt-1 truncate text-xs text-[var(--ink-muted)]">/event-transaction-hub</p></div><nav className="flex-1 space-y-1 px-3 py-5" aria-label="Admin navigation">{visibleNavigation.map(({ href, label, icon: Icon }) => { const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href); return <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`flex min-h-12 items-center gap-3 px-4 text-sm font-semibold transition-colors ${active ? "bg-[var(--brand)] text-white" : "text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"}`}><Icon size={20} weight={active ? "fill" : "regular"} />{label}</Link>; })}</nav><div className="border-t border-[var(--line)] p-3"><button type="button" onClick={logout} disabled={loggingOut} className="flex min-h-12 w-full items-center gap-3 px-4 text-sm font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] disabled:opacity-50"><SignOut size={20} />{loggingOut ? "Keluar..." : "Logout"}</button></div></aside>{mobileOpen && <button type="button" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-[var(--ink)]/30 lg:hidden" aria-label="Tutup menu admin" />}{children}</div>;
}
