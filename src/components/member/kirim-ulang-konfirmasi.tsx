"use client";

import { useState } from "react";

/**
 * "Kirim ulang" di pita konfirmasi email area peserta. Tombol teks, sebaris
 * dengan kalimat pita; hasilnya menggantikan tombol supaya tidak ditekan
 * berulang-ulang.
 */
export function KirimUlangKonfirmasi({ slug }: { slug: string }) {
  const [keadaan, setKeadaan] = useState<"siap" | "sibuk" | "terkirim" | { galat: string }>("siap");

  async function kirim() {
    setKeadaan("sibuk");
    const response = await fetch(`/e/${encodeURIComponent(slug)}/api/peserta/konfirmasi`, { method: "POST" }).catch(() => null);
    if (response?.ok) {
      setKeadaan("terkirim");
      return;
    }
    const data = await response?.json().catch(() => null);
    setKeadaan({ galat: data?.error?.message ?? "Belum terkirim. Coba lagi sebentar lagi." });
  }

  if (keadaan === "terkirim") {
    return <span role="status" className="font-semibold"> Tautan baru sudah kami kirim.</span>;
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
        {keadaan === "sibuk" ? "Mengirim..." : "Kirim ulang"}
      </button>
      {typeof keadaan === "object" ? <span role="alert" className="block text-[var(--reg-error)]">{keadaan.galat}</span> : null}
    </>
  );
}
