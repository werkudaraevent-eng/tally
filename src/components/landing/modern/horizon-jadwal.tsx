"use client";

import { useId, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import type { LandingSpeaker } from "@/lib/domain";
import type { AgendaItem } from "@/lib/landing-agenda";
import { kelompokPeran, sisaKeterangan } from "@/lib/landing-agenda-pembicara";
import { pembicaraSesi } from "@/lib/landing-speaker-tabs";
import { TeksKaya } from "@/components/landing/teks-kaya";
import { LabelUntuk } from "@/components/landing/label-untuk";
import { hariBerkelompok, PilihKelompok, saringKelompok, usePilihanKelompok } from "@/components/landing/pilih-kelompok";
import { jamPenting } from "./hari-gathering";
import { LANDING_UI, type LandingLang } from "@/lib/landing-i18n";

/**
 * Jam di kanan baris hari Horizon (rancangan V5: "07.00 Kereta berangkat",
 * tanpa garis, krem di layar lebar). Bawaannya tiga jam penting; "Lihat semua"
 * membuka seluruh acara hari itu di daftar yang sama, dengan gaya yang sama,
 * jadi jadwal lengkap tidak menjadi pola baru di halaman.
 *
 * Saat terbuka, keterangan dan pembicara sesi (Speakers, `session_refs`) tampil
 * kecil di bawah judul. Baris keterangan yang hanya mengulang nama pembicara
 * tertaut tidak ditulis dua kali (sisaKeterangan, sama dengan agenda Modern);
 * catatan dalam kurungnya ("(online)") pindah ke sebelah nama pembicara.
 */
export function JamHariHorizon({
  penting: pentingAsli,
  semua: semuaAsli,
  speakers,
  lang,
  pilihan,
}: {
  penting: AgendaItem[];
  semua: AgendaItem[];
  speakers: LandingSpeaker[];
  lang: LandingLang;
  /** Jawaban kelompok halaman acara ("Batch 1", "Batch 2"): pilihan di atas daftar (pilih-kelompok.tsx). */
  pilihan?: string[][];
}) {
  const [buka, setBuka] = useState(false);
  // Hari dengan baris per kelompok mendapat pilihan "Semua · Batch 1 · …";
  // pilihan tamu menyaring daftar dan jam pentingnya dihitung ulang darinya.
  const berkelompok = Boolean(pilihan?.length) && hariBerkelompok(semuaAsli);
  const pilihanTamu = usePilihanKelompok(berkelompok ? pilihan : undefined);
  const semua = berkelompok ? saringKelompok(semuaAsli, pilihanTamu) : semuaAsli;
  const penting = berkelompok && semua !== semuaAsli ? jamPenting(semua).tampil : pentingAsli;
  const idDaftar = useId();
  const t = LANDING_UI[lang];
  const isi = buka ? semua : penting;
  // Hari pendek (tiga acara atau kurang) tetap bisa dibuka bila ada keterangan
  // atau pembicara: keduanya hanya tampil saat terbuka (QA #165 H2).
  const bisaBuka = semua.length > penting.length || semua.some((item) => Boolean(item.subtitle?.trim()) || pembicaraSesi(speakers, item).length > 0);
  return (
    <div className="flex flex-col md:w-[260px] md:shrink-0 lg:w-[360px] 2xl:w-[420px]">
      {berkelompok && pilihan ? (
        <div className="mb-2 print:hidden">
          <PilihKelompok pilihan={pilihan} lang={lang} nada="gelap" />
        </div>
      ) : null}
      {isi.length > 0 ? (
        <ul id={idDaftar} className="flex flex-col text-[14px] leading-[2] text-[#CDD7EA] md:text-[15px] md:leading-[2.2] md:text-[#FAF8F2]">
          {isi.map((item) => {
            const orang = buka ? pembicaraSesi(speakers, item) : [];
            const { subjudul, lain, catatan } = orang.length > 0 ? sisaKeterangan(item.subtitle, orang) : { subjudul: item.subtitle, lain: null, catatan: new Map<string, string>() };
            const keterangan = buka ? [subjudul, lain].filter(Boolean).join("\n") : "";
            return (
              <li key={item.id} className="flex gap-[8px]">
                <span className={`shrink-0 tabular-nums ${item.jeda ? "text-[#CDD7EA]/70" : ""}`}>{item.time}</span>
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <span className={item.jeda ? "text-[#CDD7EA]/70" : undefined}>{item.title}</span>
                  <LabelUntuk teks={item.untuk} className="text-[#CDD7EA]" />
                  {keterangan ? (
                    <TeksKaya teks={keterangan} warna={null} className="mb-1 whitespace-pre-line text-[13px] leading-[1.6] text-[#CDD7EA]" />
                  ) : null}
                  {orang.length > 0
                    ? kelompokPeran(orang, t.agendaSpeakers).map((grup) => (
                        <p key={grup.kunci} className="mb-1 text-[13px] leading-[1.6] text-[#CDD7EA]">
                          <span className="font-bold">{grup.label}:</span> {grup.orang
                            .map((speaker) => {
                              const kurung = catatan.get(speaker.name);
                              return kurung ? `${speaker.name.trim()} ${kurung}` : speaker.name.trim();
                            })
                            .join(", ")}
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
          {buka ? t.horizon.scheduleLess : semua.length > penting.length ? t.horizon.scheduleAll(semua.length) : t.horizon.scheduleDetails}
          <CaretDown size={14} weight="bold" aria-hidden className={buka ? "rotate-180" : undefined} />
        </button>
      ) : null}
    </div>
  );
}
