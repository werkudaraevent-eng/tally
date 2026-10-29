"use client";

import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react";
import { useKehadiran } from "@/components/member/use-kehadiran";
import { PANITIA_UI, persenKehadiran, type BarisKehadiran } from "@/lib/member/panitia-i18n";
import { tanggalDiZona } from "@/lib/checkpoint/waktu";
import type { LandingLang } from "@/lib/landing-i18n";

/**
 * Isi kartu "Pantau kehadiran" di Beranda panitia: dua titik yang sedang
 * berjalan (yang terakhir mencatat orang, di antara yang terbuka), lalu
 * tautan ke halaman Kehadiran. Tanpa aktivitas: dua titik pertama hari ini.
 */
export function pilihBerjalan(rows: readonly BarisKehadiran[], hariIni: string): BarisKehadiran[] {
  const terbuka = rows.filter((baris) => baris.aktif);
  const aktif = terbuka.filter((baris) => baris.terakhir).sort((a, b) => (b.terakhir ?? "").localeCompare(a.terakhir ?? ""));
  if (aktif.length > 0) return aktif.slice(0, 2);
  const hari = terbuka.filter((baris) => baris.tanggal === hariIni);
  return (hari.length > 0 ? hari : terbuka).slice(0, 2);
}

export function RingkasPanitia({
  slug,
  lang,
  href,
  kelas,
}: {
  slug: string;
  lang: LandingLang;
  href: string;
  kelas: { alis: string; nama: string; angka: string; jalur: string; isi: string; tautan: string; redup: string };
}) {
  const t = PANITIA_UI[lang];
  const { data, galat } = useKehadiran(slug, lang, null);
  const rows = data?.rows ?? null;
  const pilihan = rows && data ? pilihBerjalan(rows, tanggalDiZona(new Date(), data.time_zone)) : [];

  return (
    <div className="mt-4 flex flex-col gap-3">
      {!rows ? (
        <p className={`text-[14px] leading-5 ${kelas.redup}`} role={galat !== null ? "alert" : undefined}>
          {galat !== null ? galat || t.gagal : t.memuat}
        </p>
      ) : pilihan.length === 0 ? (
        <p className={`text-[14px] leading-5 ${kelas.redup}`}>{t.kosong}</p>
      ) : (
        <>
          <p className={kelas.alis}>{t.berjalan}</p>
          <ul className="flex flex-col gap-3">
            {pilihan.map((baris) => {
              const persen = persenKehadiran(baris);
              return (
                <li key={baris.key} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`min-w-0 [overflow-wrap:anywhere] ${kelas.nama}`}>{baris.nama}</span>
                    <span className={`shrink-0 tabular-nums ${kelas.angka}`}>{t.dari(baris.sudah, baris.diharapkan)}</span>
                  </div>
                  <span aria-hidden className={`block h-1.5 overflow-hidden rounded-full ${kelas.jalur}`}>
                    <span className={`block h-full rounded-full ${kelas.isi}`} style={{ width: `${persen}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <Link href={href} className={kelas.tautan}>
        {t.lihatSemua}
        <CaretRight size={16} weight="bold" aria-hidden />
      </Link>
    </div>
  );
}
