"use client";

import { CalendarDots, ShieldCheck, Storefront } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CONTAINER_PADDING } from "@/components/m3";
import { UsersPanel } from "@/components/admin/users-panel";
import { UserMenu } from "@/components/admin/user-menu";

/** PROTOTIPE mockup rev 2: Users & roles di tingkat workspace, sejajar Events. */
export default function WorkspaceUsersPage() {
  const [akun, setAkun] = useState<{ username: string; role: string } | null>(null);
  useEffect(() => {
    void fetch("/api/auth/me").then((r) => r.json()).then((d) => setAkun(d.user ?? null));
  }, []);
  return (
    <div lang="en" className="press flex h-dvh flex-col bg-surface text-on-surface">
      <header className={`sticky top-0 z-topbar border-b border-outline-variant bg-surface ${CONTAINER_PADDING}`}>
        <div className="m3-topbar-row mx-auto flex min-h-14 w-full max-w-[1280px] items-center gap-2">
          <Storefront size={18} className="shrink-0 text-on-surface-variant" />
          <span className="text-body-medium font-medium">Tally</span>
          <nav aria-label="Workspace" className="ml-4 flex items-center gap-1">
            <Link href="/events" className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-body-medium text-on-surface-variant hover:bg-[var(--press-hover)]">
              <CalendarDots size={16} /> Events
            </Link>
            <Link href="/users" aria-current="page" className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--press-active)] px-2.5 text-body-medium font-medium text-on-surface">
              <ShieldCheck size={16} /> Users &amp; roles
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <UserMenu username={akun?.username ?? null} role={akun?.role ?? null} version="0.1.0" onLogout={() => {}} loggingOut={false} />
          </div>
        </div>
      </header>
      <div className={`mx-auto flex min-h-0 w-full max-w-[1280px] flex-1 flex-col py-4 ${CONTAINER_PADDING}`}>
        <UsersPanel />
      </div>
    </div>
  );
}
