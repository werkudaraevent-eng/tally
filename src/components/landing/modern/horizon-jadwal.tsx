"use client";

import { useId, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import type { LandingSpeaker } from "@/lib/domain";
import type { AgendaItem } from "@/lib/landing-agenda";
import { kelompokPeran, sisaKeterangan } from "@/lib/landing-agenda-pembicara";
import { pembicaraSesi } from "@/lib/landing-speaker-tabs";
import { TeksKaya } from "@/components/landing/teks-kaya";
import { LANDING_UI, type LandingLang } from "@/lib/landing-i18n";

/**
 * Jam di kanan baris hari Horizon (rancangan V5: "07.00 Kereta berangkat",
 * tanpa garis, krem di layar lebar). Bawaannya tiga jam penting; "Lihat semua"
 * membuka seluruh acara hari itu di daftar yang sama, dengan gaya yang sama,
 * jadi jadwal lengkap tidak menjadi pola baru di halaman.
 *
 * Saat terbuka, keterangan dan pembicara sesi (Speakers, `session_refs`) tampil
 * kecil di bawah judul. Baris keterangan yang hanya mengulang nama pembicara
 * tertaut tidak ditulis dua kali (sisaKeterangan, sama dengan agenda Modern).
 */
export function JamHariHorizon({
  penting,
  semua,
  speakers,
  lang,
}: {
  penting: AgendaItem[];
  semua: AgendaItem[];
  speakers: LandingSpeaker[];
  lang: LandingLang;
}) {
  const [buka, setBuka] = useState(false);
  const idDaftar = useId();
  const t = LANDING_UI[lang];
  const isi = buka ? semua : penting;
  const bisaBuka = semua.length > penting.length;
  return (
    <div className="flex flex-col md:w-[260px] md:shrink-0 lg:w-[360px] 2xl:w-[420px]">
      {isi.length > 0 ? (
        <ul id={idDaftar} className="flex flex-col text-[14px] leading-[2] text-[#CDD7EA] md:text-[15px] md:leading-[2.2] md:text-[#FAF8F2]">
          {isi.map((item) => {
            const orang = buka ? pembicaraSesi(speakers, item) : [];
            const { subjudul, lain } = orang.length > 0 ? sisaKeterangan(item.subtitle, orang) : { subjudul: item.subtitle, lain: null };
            const keterangan = buka ? [subjudul, lain].filter(Boolean).join("\n") : "";
            return (
              <li key={item.id} className="flex gap-[8px]">
                <span className={`shrink-0 tabular-nums ${item.jeda ? "text-[#CDD7EA]/70" : ""}`}>{item.time}</span>
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <span className={item.jeda ? "text-[#CDD7EA]/70" : undefined}>{item.title}</span>
                  {keterangan ? (
                    <TeksKaya teks={keterangan} warna={null} className="mb-1 whitespace-pre-line text-[13px] leading-[1.6] text-[#CDD7EA]" />
                  ) : null}
                  {orang.length > 0
                    ? kelompokPeran(orang, t.agendaSpeakers).map((grup) => (
                        <p key={grup.kunci} className="mb-1 text-[13px] leading-[1.6] text-[#CDD7EA]">
                          <span className="font-bold">{grup.label}:</span> {grup.orang.map((speaker) => speaker.name).join(", ")}
                        </p>
                      ))
                    : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {bisaBuka ? (
        <button
          type="button"
          aria-expanded={buka}
          aria-controls={idDaftar}
          onClick={() => setBuka((v) => !v)}
          className="m3-state -mx-3 mt-1 inline-flex min-h-12 items-center gap-2 self-start rounded-md px-3 text-[13px] font-bold text-[var(--hz-sorot,var(--hz-emas))] [--m3-state-color:var(--hz-emas)] print:hidden"
        >
          {buka ? t.horizon.scheduleLess : t.horizon.scheduleAll(semua.length)}
          <CaretDown size={14} weight="bold" aria-hidden className={buka ? "rotate-180" : undefined} />
        </button>
      ) : null}
    </div>
  );
}
