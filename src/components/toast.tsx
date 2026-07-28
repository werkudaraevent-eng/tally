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

const STYLE: Record<ToastVariant, { icon: typeof CheckCircle; bar: string; iconColor: string }> = {
  success: { icon: CheckCircle, bar: "bg-[var(--success)]", iconColor: "text-[var(--success)]" },
  error: { icon: XCircle, bar: "bg-[var(--danger)]", iconColor: "text-[var(--danger)]" },
  warning: { icon: WarningCircle, bar: "bg-[var(--warning)]", iconColor: "text-[var(--warning)]" },
  info: { icon: Info, bar: "bg-[var(--brand)]", iconColor: "text-[var(--brand)]" },
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
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            role={toast.variant === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-md overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-lg"
          >
            <span className={`w-1.5 shrink-0 ${bar}`} aria-hidden="true" />
            <div className="flex flex-1 items-start gap-3 p-4">
              <Icon size={22} weight="fill" className={`mt-0.5 shrink-0 ${iconColor}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug">{toast.title}</p>
                {toast.description && <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">{toast.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="-m-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
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
