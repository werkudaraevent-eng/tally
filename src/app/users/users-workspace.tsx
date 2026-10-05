"use client";

import { Storefront } from "@phosphor-icons/react";
import { useState } from "react";
import { CONTAINER_PADDING } from "@/components/m3";
import { UsersPanel } from "@/components/admin/users-panel";
import { UserMenu } from "@/components/admin/user-menu";
import { WorkspaceTabs } from "@/components/admin/workspace-tabs";

/** Bilah atas yang sama dengan /events, supaya berpindah di antara keduanya tidak menggeser apa pun. */
export function UsersWorkspace({ username, role }: { username: string | null; role: string | null }) {
  const [keluar, setKeluar] = useState(false);
  async function logout() {
    setKeluar(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }
  return (
    <div lang="en" className="press flex h-dvh flex-col bg-surface text-on-surface">
      <header className={`sticky top-0 z-topbar border-b border-outline-variant bg-surface ${CONTAINER_PADDING}`}>
        <div className="m3-topbar-row mx-auto flex min-h-14 w-full max-w-[1280px] items-center gap-2">
          <Storefront size={18} className="shrink-0 text-on-surface-variant" />
          <span className="text-body-medium font-medium">Tally</span>
          <WorkspaceTabs current="users" />
          <div className="ml-auto flex items-center gap-1">
            <UserMenu
              username={username}
              role={role}
              version={process.env.NEXT_PUBLIC_APP_VERSION}
              onLogout={() => void logout()}
              loggingOut={keluar}
            />
          </div>
        </div>
      </header>
      <div className={`mx-auto flex min-h-0 w-full max-w-[1280px] flex-1 flex-col py-4 ${CONTAINER_PADDING}`}>
        <UsersPanel />
      </div>
    </div>
  );
}
