"use client";

import { useEffect, useState } from "react";

/**
 * Daftar topik FAQ di kolom kiri (layar lebar saja; di ponsel judul topik
 * sudah terbaca saat menggulir). Topik yang sedang dibaca ditandai garis aksen,
 * seperti navigasi samping Apple Support dan Stripe Docs.
 */
export function FaqTopik({ label, topik }: { label: string; topik: { id: string; judul: string; jumlah: number }[] }) {
  const [aktif, setAktif] = useState(topik[0]?.id ?? null);

  useEffect(() => {
    const elemen = topik.map((t) => document.getElementById(t.id)).filter((el): el is HTMLElement => el !== null);
    if (!elemen.length) return;
    // Topik aktif = topik terakhir yang bagian atasnya sudah melewati sepertiga layar.
    const hitung = () => {
      const batas = window.innerHeight / 3;
      let terakhir = elemen[0].id;
      for (const el of elemen) if (el.getBoundingClientRect().top <= batas) terakhir = el.id;
      setAktif(terakhir);
    };
    hitung();
    window.addEventListener("scroll", hitung, { passive: true });
    return () => window.removeEventListener("scroll", hitung);
  }, [topik]);

  return (
    <nav aria-label={label} className="hidden border-l border-[var(--reg-outline-variant)] lg:block">
      <ul>
        {topik.map((t) => {
          const ini = t.id === aktif;
          return (
            <li key={t.id}>
              <a
                href={`#${t.id}`}
                aria-current={ini ? "location" : undefined}
                className={`m3-state -ml-px flex min-h-10 items-center justify-between gap-4 border-l-[3px] pl-4 pr-2 text-[15px] leading-5 ${
                  ini ? "border-[var(--alis,var(--reg-primary))] font-semibold text-[var(--reg-on-surface)]" : "border-transparent font-medium text-[var(--reg-on-surface-variant)]"
                }`}
              >
                {t.judul}
                <span className="text-[13px] font-medium tabular-nums text-[var(--reg-on-surface-variant)]">{t.jumlah}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
