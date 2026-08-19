"use client";

import { SignOut } from "@phosphor-icons/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/m3";

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
    <Button
      variant="outlined"
      size="sm"
      onClick={handleLogout}
      loading={pending}
      icon={pending ? undefined : <SignOut size={18} weight="duotone" aria-hidden="true" />}
    >
      {pending ? "Keluar..." : "Logout"}
    </Button>
  );
}
