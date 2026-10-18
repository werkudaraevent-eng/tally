"use client";

import { CheckCircle, CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { LandingLang } from "@/lib/landing-i18n";
import { kirimQrCheckpoint, type KabarCheckpoint } from "@/components/member/pindai-checkpoint";

const TEKS = {
  id: {
    mencatat: "Mencatat checkpoint…",
    masuk: "Masuk dulu ke Dashboard saya, lalu pindai lagi QR di layar panitia.",
    rusak: "QR ini tidak lengkap. Pindai lagi dari layar panitia.",
    keHalaman: "Buka Dashboard saya",
    keMasuk: "Masuk",
  },
  en: {
    mencatat: "Recording the checkpoint…",
    masuk: "Sign in to My dashboard first, then scan the QR on the organisers' screen again.",
    rusak: "This QR is incomplete. Scan it again from the organisers' screen.",
    keHalaman: "Open My dashboard",
    keMasuk: "Sign in",
  },
} as const;

export function HalamanPindai({
  slug,
  namaAcara,
  lang,
  sesi,
  kode,
  masuk,
}: {
  slug: string;
  namaAcara: string;
  lang: LandingLang;
  sesi: number | null;
  kode: string | null;
  masuk: boolean;
}) {
  const t = TEKS[lang];
  const [hasil, setHasil] = useState<{ ok: true; kabar: KabarCheckpoint } | { ok: false; pesan: string } | null>(null);

  useEffect(() => {
    if (!masuk || sesi === null || kode === null) return;
    let batal = false;
    void kirimQrCheckpoint(slug, sesi, kode, lang).then((jawaban) => { if (!batal) setHasil(jawaban); });
    return () => { batal = true; };
  }, [masuk, slug, sesi, kode, lang]);

  const portal = `/e/${encodeURIComponent(slug)}/peserta`;
  const pesan = !masuk ? t.masuk : sesi === null || kode === null ? t.rusak : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#F4F5F8] px-4 py-10 text-[#151A24]">
      <section className="w-full max-w-sm rounded-[20px] bg-white p-6 text-center shadow-[0_1px_2px_rgb(16_24_40/0.06)]">
        <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#5F6B7F]">{namaAcara}</p>
        {pesan ? (
          <p className="mt-5 flex items-start gap-2 text-left text-[16px] leading-6">
            <WarningCircle size={24} weight="fill" aria-hidden className="shrink-0 text-[#B3261E]" />
            {pesan}
          </p>
        ) : !hasil ? (
          <p role="status" className="mt-6 flex items-center justify-center gap-2 text-[16px]">
            <CircleNotch size={22} aria-hidden className="animate-spin motion-reduce:animate-none" />
            {t.mencatat}
          </p>
        ) : hasil.ok ? (
          <div role="status" className="mt-5 flex flex-col items-center gap-2">
            <CheckCircle size={56} weight="fill" aria-hidden className="text-[#1E8E4E]" />
            <p className="text-[20px] font-semibold leading-7 [overflow-wrap:anywhere]">{hasil.kabar.judul}</p>
            {hasil.kabar.rinci ? <p className="text-[15px] text-[#4A5568]">{hasil.kabar.rinci}</p> : null}
          </div>
        ) : (
          <p role="alert" className="mt-5 flex items-start gap-2 text-left text-[16px] leading-6">
            <WarningCircle size={24} weight="fill" aria-hidden className="shrink-0 text-[#B3261E]" />
            {hasil.pesan}
          </p>
        )}
        <a href={portal} className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#151A24] px-5 text-[15px] font-semibold text-white">
          {masuk ? t.keHalaman : t.keMasuk}
        </a>
      </section>
    </main>
  );
}
