"use client";

import { WifiSlash } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { standard } from "@/lib/m3/motion";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => { const onOffline = () => setOffline(true); const onOnline = () => setOffline(false); window.addEventListener("offline", onOffline); window.addEventListener("online", onOnline); return () => { window.removeEventListener("offline", onOffline); window.removeEventListener("online", onOnline); }; }, []);
  return (
    <AnimatePresence>
      {offline ? (
        // Naik dari tepi bawah, bukan muncul seketika: spanduk yang tiba-tiba
        // ada di layar terbaca sebagai galat render, bukan sebagai kabar.
        // Skema tenang — ini peringatan di layar transaksi, bukan perayaan.
        <motion.div
          role="alert"
          className="fixed inset-x-0 bottom-0 z-50 flex min-h-12 items-center justify-center gap-2 bg-error px-4 text-body-medium font-semibold text-on-error"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={standard.spatial.fast}
        >
          <WifiSlash size={19} /> OFFLINE — jangan buat order
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
