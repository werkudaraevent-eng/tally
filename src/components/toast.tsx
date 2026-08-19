"use client";

// Sistem toast terpusat.
//
// Kenapa dibuat sendiri, bukan memakai library (mis. sonner):
// - Tidak menambah dependensi baru menjelang hari-H (risiko supply chain).
// - framer-motion sudah ada di proyek, jadi animasinya gratis.
// - Kontrol penuh atas warna brand & bahasa Indonesia.
//
// Pola yang diikuti (Linear/Stripe/Vercel):
// - Toast HANYA untuk konfirmasi transien hasil aksi pengguna.
// - Error validasi yang perlu diperbaiki di tempat tetap inline, bukan toast.
// - Status persisten (mis. offline) tetap banner, bukan toast.
// - Mobile: bottom-center (jangkauan jempol, tidak menutupi header sticky).
//   Desktop: top-right.
// - Sukses auto-hilang cepat; error bertahan lebih lama karena perlu dibaca.

import { CheckCircle, Info, WarningCircle, X, XCircle } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { standard } from "@/lib/m3/motion";

type ToastVariant = "success" | "error" | "warning" | "info";

type Toast = {
  id: number;
  variant: ToastVariant;
  title: string;
  description?: string;
};

type ToastApi = {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  dismiss: (id: number) => void;
};

const DURATION: Record<ToastVariant, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  // Error bertahan paling lama: operator sering sedang melayani tamu dan
  // butuh waktu untuk membaca penyebab kegagalan.
  error: 7000,
};

// Pita warna DAN ikon, bukan salah satu. Toast muncul di tepi layar tempat mata
// belum tentu tertuju; pita memberi tahu jenisnya sebelum teksnya terbaca, dan
// ikon menanggung arti yang sama untuk siapa pun yang tidak membedakan warnanya.
const STYLE: Record<ToastVariant, { icon: typeof CheckCircle; bar: string; iconColor: string }> = {
  success: { icon: CheckCircle, bar: "bg-success", iconColor: "text-success" },
  error: { icon: XCircle, bar: "bg-error", iconColor: "text-error" },
  warning: { icon: WarningCircle, bar: "bg-warning", iconColor: "text-warning" },
  info: { icon: Info, bar: "bg-primary", iconColor: "text-primary" },
};

const ToastContext = createContext<ToastApi | null>(null);

/** Memanggil toast dari komponen client mana pun. */
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast harus dipakai di dalam <ToastProvider>.");
  return context;
}

export function ToastProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) { window.clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const push = useCallback((variant: ToastVariant, title: string, description?: string) => {
    const id = (nextId.current += 1);
    setToasts((current) => {
      // Batasi 3 toast agar layar HP tidak tertutup penuh.
      const next = [...current, { id, variant, title, description }];
      return next.slice(-3);
    });
    timers.current.set(id, window.setTimeout(() => dismiss(id), DURATION[variant]));
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({
    success: (title, description) => push("success", title, description),
    error: (title, description) => push("error", title, description),
    warning: (title, description) => push("warning", title, description),
    info: (title, description) => push("info", title, description),
    dismiss,
  }), [push, dismiss]);

  return <ToastContext.Provider value={api}>
    {children}
    {/* aria-live agar pembaca layar mengumumkan hasil aksi. */}
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:items-end"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const { icon: Icon, bar, iconColor } = STYLE[toast.variant];
          return <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            // Pegas M3 skema tenang, bukan angka pegas yang ditebak. Toast muncul
            // saat operator sedang mengerjakan hal lain; pantulan menarik mata
            // ke tepi layar tepat ketika ia tidak boleh berpaling.
            transition={standard.spatial.default}
            role={toast.variant === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-md overflow-hidden rounded-2xl bg-surface-container-high text-on-surface shadow-level3"
          >
            <span className={`w-1.5 shrink-0 ${bar}`} aria-hidden="true" />
            <div className="flex flex-1 items-start gap-3 p-4">
              <Icon size={22} weight="fill" className={`mt-0.5 shrink-0 ${iconColor}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-body-large font-semibold leading-snug">{toast.title}</p>
                {toast.description && <p className="mt-1 text-body-small leading-relaxed text-on-surface-variant">{toast.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="m3-state -m-1 flex size-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant"
                aria-label="Tutup notifikasi"
              >
                <X size={16} weight="bold" />
              </button>
            </div>
          </motion.div>;
        })}
      </AnimatePresence>
    </div>
  </ToastContext.Provider>;
}
