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
// - Mobile: bottom-center (jangkauan jempol). Desktop: BOTTOM-right.
//
//   Bukan top-right, dan itu perbaikan dari kegagalan yang terlihat: di pojok
//   kanan atas ia duduk persis di atas tombol aksi utama halaman ("Buat event",
//   "Tambah peserta") dan menutupinya selama empat detik pertama — tepat detik
//   ketika orang baru sampai di halaman dan hendak menekannya.
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

// IKON saja yang berwarna. Pita 6px di tepi kiri dibuang.
//
// Ia dipasang sebagai anak flex di dalam wadah `overflow-hidden rounded-2xl`,
// dan itu cukup selama wadahnya diam. Tidak diam: `motion.div` di bawah memakai
// `layout` dan animasi `scale`, dan framer-motion mengoreksi skala anak-anaknya
// satu per satu. Pita yang bukan anak `layout` ikut teregang, lalu muncul
// sebagai balok hijau yang menjulur keluar sudut membulat kartunya. Terlihat
// persis begitu di layar.
//
// Yang dikerjakan pita tetap dikerjakan: ikon memberi tahu jenisnya sebelum
// teksnya terbaca, dan bentuknya berbeda per jenis, jadi ia tetap terbaca oleh
// siapa pun yang tidak membedakan warna.
const STYLE: Record<ToastVariant, { icon: typeof CheckCircle; iconColor: string }> = {
  success: { icon: CheckCircle, iconColor: "text-success" },
  error: { icon: XCircle, iconColor: "text-error" },
  warning: { icon: WarningCircle, iconColor: "text-warning" },
  info: { icon: Info, iconColor: "text-on-surface-variant" },
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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-toast flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:items-end"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const { icon: Icon, iconColor } = STYLE[toast.variant];
          return <motion.div
            key={toast.id}
            layout
            // Geser + pudar 150ms, tanpa `scale`. Skala pada kartu yang punya
            // sudut membulat dan garis tepi membuat keduanya ikut mengecil lalu
            // membesar, dan itu terbaca sebagai kartu yang "bernapas" di sudut
            // layar. Geser sudah cukup memberi tahu ia datang dari mana.
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
            role={toast.variant === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-[380px] items-start gap-2.5 rounded-[10px] border border-outline-variant bg-surface-container-lowest px-3.5 py-3 text-on-surface shadow-[0_4px_16px_rgb(0_0_0/0.08)]"
          >
            <Icon size={16} weight="fill" className={`mt-0.5 shrink-0 ${iconColor}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-body-medium font-medium leading-snug">{toast.title}</p>
              {toast.description && <p className="mt-0.5 text-body-small leading-relaxed text-on-surface-variant">{toast.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="-mr-1 -mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm text-on-surface-variant transition-colors duration-150 hover:bg-primary-soft"
              aria-label="Tutup notifikasi"
            >
              <X size={14} />
            </button>
          </motion.div>;
        })}
      </AnimatePresence>
    </div>
  </ToastContext.Provider>;
}
