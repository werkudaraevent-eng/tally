"use client";

import { WifiSlash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => { const onOffline = () => setOffline(true); const onOnline = () => setOffline(false); window.addEventListener("offline", onOffline); window.addEventListener("online", onOnline); return () => { window.removeEventListener("offline", onOffline); window.removeEventListener("online", onOnline); }; }, []);
  if (!offline) return null;
  return <div role="alert" className="fixed inset-x-0 bottom-0 z-50 flex min-h-12 items-center justify-center gap-2 bg-[var(--danger)] px-4 text-sm font-semibold text-white"><WifiSlash size={19} /> OFFLINE — jangan buat order</div>;
}
