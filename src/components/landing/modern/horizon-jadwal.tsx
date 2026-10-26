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
import { LANDING_UI, type LandingLang } from "@/lib/landing-i18n";

/** Baris yang tampil sebelum "Lihat semua"; hari sampai satu baris lebih panjang tampil utuh. */
const BARIS_RINGKAS = 6;

/**
 * Jadwal satu hari Horizon: daftar jam selebar kolom kanan, kolom jam tetap
 * (tabular) dan judul acara di sebelahnya, garis tipis antarbaris, seperti
 * agenda publik Sched dan Eventbrite. Keterangan acara selalu tampil; pembicara
 * sesi (Speakers, `session_refs`) tampil saat hari dibuka.
 *
 * Hari panjang tampil enam baris pertama berurutan (bukan potongan acak), lalu
 * "Lihat semua N acara" membuka sisanya di daftar yang sama. Baris keterangan
 * yang hanya mengulang nama pembicara tertaut tidak ditulis dua kali
 * (sisaKeterangan, sama dengan agenda Modern).
 */
export function JamHariHorizon({
  semua: semuaAsli,
  speakers,
  lang,
  pilihan,
}: {
  semua: AgendaItem[];
  speakers: LandingSpeaker[];
  lang: LandingLang;
  /** Jawaban kelompok halaman acara ("Batch 1", "Batch 2"): pilihan di atas daftar (pilih-kelompok.tsx). */
  pilihan?: string[][];
}) {
  const [buka, setBuka] = useState(false);
  // Hari dengan baris per kelompok mendapat pilihan "Semua · Batch 1 · …".
  const berkelompok = Boolean(pilihan?.length) && hariBerkelompok(semuaAsli);
  const pilihanTamu = usePilihanKelompok(berkelompok ? pilihan : undefined);
  const semua = berkelompok ? saringKelompok(semuaAsli, pilihanTamu) : semuaAsli;
  const idDaftar = useId();
  const t = LANDING_UI[lang];
  const panjang = semua.length > BARIS_RINGKAS + 1;
  const adaPembicara = semua.some((item) => pembicaraSesi(speakers, item).length > 0);
  const isi = buka || !panjang ? semua : semua.slice(0, BARIS_RINGKAS);
  const bisaBuka = panjang || adaPembicara;
  return (
    <div className="flex min-w-0 flex-col">
      {berkelompok && pilihan ? (
        <div className="mb-3 print:hidden">
          <PilihKelompok pilihan={pilihan} items={semuaAsli} lang={lang} nada="gelap" />
        </div>
      ) : null}
      {isi.length > 0 ? (
        <ul id={idDaftar} className={`flex flex-col ${berkelompok ? "border-t border-[#405272]/70" : ""}`}>
          {isi.map((item) => {
            const orang = buka ? pembicaraSesi(speakers, item) : [];
            const { subjudul, lain, catatan } = orang.length > 0 ? sisaKeterangan(item.subtitle, orang) : { subjudul: item.subtitle, lain: null, catatan: new Map<string, string>() };
            const keterangan = [subjudul, lain].filter(Boolean).join("\n");
            const redup = item.jeda ? "text-[#CDD7EA]/70" : "";
            return (
              <li key={item.id} className={`grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 border-b border-[#405272]/70 py-3 md:grid-cols-[7.5rem_minmax(0,1fr)] md:gap-x-6 md:py-4 ${berkelompok ? "" : "first:pt-0"}`}>
                <span className={`pt-px text-[14px] leading-6 tabular-nums text-[#CDD7EA] md:text-[15px] ${redup}`}>
                  {item.time}
                  {item.end ? <span className="hidden md:inline">–{item.end}</span> : null}
                </span>
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <p className={`text-[15px] font-semibold leading-6 text-[#FAF8F2] md:text-[16px] ${redup}`}>
                    {item.title}
                    <LabelUntuk teks={item.untuk} className="text-[#CDD7EA]" />
                  </p>
                  {keterangan ? (
                    <TeksKaya teks={keterangan} warna={null} className={`mt-0.5 whitespace-pre-line text-[13px] leading-5 text-[#CDD7EA] md:text-[14px] ${buka ? "" : "line-clamp-2"}`} />
                  ) : null}
                  {orang.length > 0
                    ? kelompokPeran(orang, t.agendaSpeakers).map((grup) => (
                        <p key={grup.kunci} className="mt-0.5 text-[13px] leading-5 text-[#CDD7EA] md:text-[14px]">
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
          className="m3-state -mx-3 mt-2 inline-flex min-h-12 items-center gap-2 self-start rounded-md px-3 text-[14px] font-bold text-[var(--hz-sorot,var(--hz-emas))] [--m3-state-color:var(--hz-emas)] print:hidden"
        >
          {buka ? t.horizon.scheduleLess : panjang ? t.horizon.scheduleAll(semua.length) : t.horizon.scheduleDetails}
          <CaretDown size={14} weight="bold" aria-hidden className={buka ? "rotate-180" : undefined} />
        </button>
      ) : null}
    </div>
  );
}
