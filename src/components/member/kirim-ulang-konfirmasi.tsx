"use client";

import { useState } from "react";
import type { LandingLang } from "@/lib/landing-i18n";
import { PESERTA_UI } from "@/lib/member/peserta-i18n";

/**
 * "Kirim ulang" di pita konfirmasi email area peserta. Tombol teks, sebaris
 * dengan kalimat pita; hasilnya menggantikan tombol supaya tidak ditekan
 * berulang-ulang.
 */
export function KirimUlangKonfirmasi({ slug, lang = "id" }: { slug: string; lang?: LandingLang }) {
  const p = PESERTA_UI[lang];
  const [keadaan, setKeadaan] = useState<"siap" | "sibuk" | "terkirim" | { galat: string }>("siap");

  async function kirim() {
    setKeadaan("sibuk");
    const response = await fetch(`/e/${encodeURIComponent(slug)}/api/peserta/konfirmasi${lang === "en" ? "?lang=en" : ""}`, { method: "POST" }).catch(() => null);
    if (response?.ok) {
      setKeadaan("terkirim");
      return;
    }
    const data = await response?.json().catch(() => null);
    // Pesan server berbahasa Indonesia; versi English memetakan kodenya sendiri.
    const kode = data?.error?.code;
    const galat =
      lang === "id"
        ? (data?.error?.message ?? p.resendFailed)
        : kode === "RATE_LIMITED"
          ? p.resendRateLimited
          : kode === "EMAIL_NOT_CONFIGURED"
            ? p.resendNotConfigured
            : p.resendFailed;
    setKeadaan({ galat });
  }

  if (keadaan === "terkirim") {
    return <span role="status" className="font-semibold">{p.resent}</span>;
  }
  return (
    <>
      {" "}
      <button
        type="button"
        onClick={kirim}
        disabled={keadaan === "sibuk"}
        className="min-h-11 font-semibold text-[var(--reg-primary)] underline underline-offset-4 disabled:opacity-60"
      >
        {keadaan === "sibuk" ? p.resending : p.resend}
      </button>
      {typeof keadaan === "object" ? <span role="alert" className="block text-[var(--reg-error)]">{keadaan.galat}</span> : null}
    </>
  );
}
