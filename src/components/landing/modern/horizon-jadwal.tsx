"use client";

import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import type { AgendaItem } from "@/lib/landing-agenda";
import { TeksKaya } from "@/components/landing/teks-kaya";
import { LANDING_UI, type LandingLang } from "@/lib/landing-i18n";

/**
 * Jam di kanan baris hari Horizon (rancangan V5: "07.00 Kereta berangkat",
 * tanpa garis, krem di layar lebar). Bawaannya tiga jam penting; "Lihat semua"
 * membuka seluruh acara hari itu di daftar yang sama, dengan gaya yang sama,
 * jadi jadwal lengkap tidak menjadi pola baru di halaman.
 */
export function JamHariHorizon({ penting, semua, lang }: { penting: AgendaItem[]; semua: AgendaItem[]; lang: LandingLang }) {
  const [buka, setBuka] = useState(false);
  const t = LANDING_UI[lang];
  const isi = buka ? semua : penting;
  const bisaBuka = semua.length > penting.length;
  return (
    <div className="flex flex-col md:w-[260px] md:shrink-0">
      {isi.length > 0 ? (
        <ul className="flex flex-col text-[14px] leading-[2] text-[#CDD7EA] md:text-[15px] md:leading-[2.2] md:text-[#FAF8F2]">
          {isi.map((item) => (
            <li key={item.id} className="flex gap-[8px]">
              <span className={`shrink-0 tabular-nums ${item.jeda ? "text-[#CDD7EA]/70" : ""}`}>{item.time}</span>
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className={item.jeda ? "text-[#CDD7EA]/70" : undefined}>{item.title}</span>
                {buka && item.subtitle ? (
                  <TeksKaya teks={item.subtitle} warna={null} className="mb-1 whitespace-pre-line text-[13px] leading-[1.6] text-[#CDD7EA]" />
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {bisaBuka ? (
        <button
          type="button"
          aria-expanded={buka}
          onClick={() => setBuka((v) => !v)}
          className="m3-state -mx-3 mt-1 inline-flex min-h-12 items-center gap-2 self-start rounded-md px-3 text-[13px] font-bold text-[var(--hz-sorot,var(--hz-emas))] [--m3-state-color:var(--hz-emas)]"
        >
          {buka ? t.horizon.scheduleLess : t.horizon.scheduleAll(semua.length)}
          <CaretDown size={14} weight="bold" aria-hidden className={buka ? "rotate-180" : undefined} />
        </button>
      ) : null}
    </div>
  );
}
