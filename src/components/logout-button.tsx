"use client";

import { SignOut } from "@phosphor-icons/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="flex min-h-11 items-center gap-2 border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-wait disabled:opacity-60"
    >
      <SignOut size={18} weight="duotone" aria-hidden="true" />
      {pending ? "Keluar..." : "Logout"}
    </button>
  );
}
