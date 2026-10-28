"use client";

import { useState } from "react";
import type { AgendaPreview } from "@/lib/landing-agenda";
import { hariBerkelompok, PilihKelompok, saringKelompok, usePilihanKelompok } from "@/components/landing/pilih-kelompok";
import { TeksKaya } from "@/components/landing/teks-kaya";
import { LabelUntuk } from "@/components/landing/label-untuk";
import { LANDING_LANG_LABELS, LANDING_UI, type LandingLang } from "@/lib/landing-i18n";

const TINTA = "#101E38";
const REDUP = "#526078";
const GARIS = "rgb(16 30 56 / 0.12)";
/** Baris yang tampil sebelum "Lihat semua": cukup untuk gambaran satu hari. */
const RINGKAS = 5;

/**
 * Susunan acara tema Gathering Trip: chip hari, pilihan kelompok (Batch) bila
 * ada, lalu satu kartu berisi lima baris pertama hari itu dengan tombol buka
 * semua. Datanya sama dengan Horizon (rundown dan Siapa yang melihat).
 */
export function AgendaTrip({ agenda, lang }: { agenda: AgendaPreview[]; lang: LandingLang }) {
  const t = LANDING_UI[lang];
  const [aktif, setAktif] = useState(0);
  const [semua, setSemua] = useState(false);
  const blok = agenda[aktif] ?? agenda[0];
  const berkelompok = Boolean(blok?.pilihan?.length) && hariBerkelompok(blok?.items ?? []);
  const pilihan = usePilihanKelompok(berkelompok ? blok?.pilihan : undefined);
  if (!blok) return null;
  const baris = berkelompok ? saringKelompok(blok.items, pilihan) : blok.items;
  const tampil = semua ? baris : baris.slice(0, RINGKAS);
  const locale = LANDING_LANG_LABELS[lang].locale;
  // Dua bagian bertanggal sama (rundown per Batch): chip memakai keterangan
  // dalam kurung di judul bagiannya ("Batch 2"), atau nomor urutnya.
  const kembar = (tanggal: string | null) => Boolean(tanggal) && agenda.filter((bagian) => bagian.tanggal === tanggal).length > 1;
  const label = (bagian: AgendaPreview, index: number) => {
    if (bagian.tanggal) {
      const tgl = new Date(`${bagian.tanggal}T00:00:00Z`);
      const ke = agenda.slice(0, index + 1).filter((lain) => lain.tanggal === bagian.tanggal).length;
      return {
        atas: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(tgl),
        bawah: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(tgl),
        tambah: kembar(bagian.tanggal) ? (/\(([^)]+)\)\s*$/.exec(bagian.sectionTitle ?? "")?.[1]?.trim() ?? `#${ke}`) : null,
      };
    }
    return { atas: bagian.sectionTitle ?? `${index + 1}`, bawah: bagian.hari ?? "", tambah: null };
  };
  return (
    <div className="flex flex-col gap-3" style={{ color: TINTA }}>
      {agenda.length > 1 ? (
        <div role="group" aria-label={t.agendaParts} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0">
          {agenda.map((bagian, index) => {
            const { atas, bawah, tambah } = label(bagian, index);
            const on = index === aktif;
            return (
              <button
                key={bagian.id ?? index}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setAktif(index);
                  setSemua(false);
                }}
                className="m3-state flex min-h-14 min-w-[76px] max-w-[120px] shrink-0 flex-col items-center justify-center rounded-[12px] px-3 py-1"
                style={on ? { background: "var(--hz-emas)", color: "var(--hz-on-emas)" } : { background: "#fff", boxShadow: `inset 0 0 0 1px ${GARIS}` }}
              >
                <span className="text-[12px] leading-4">{atas}</span>
                <span className="text-[14px] font-semibold leading-5">{bawah}</span>
                {tambah ? <span className="max-w-full truncate text-[12px] font-semibold leading-4">{tambah}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
      {berkelompok && blok.pilihan ? <PilihKelompok pilihan={blok.pilihan} items={blok.items} lang={lang} nada="terang" /> : null}
      <div className="rounded-[16px] bg-white p-4 shadow-[inset_0_0_0_1px_rgb(16_30_56/0.12)]">
        {blok.sectionTitle ? <p className="mb-3 text-[14px] font-semibold leading-5 [overflow-wrap:anywhere]" style={{ color: REDUP }}>{blok.sectionTitle}</p> : null}
        <ol className="flex flex-col">
          {tampil.map((item, index) => (
            <li key={`${item.key}-${index}`} className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 py-3 first:pt-0" style={index > 0 ? { borderTop: `1px solid ${GARIS}` } : undefined}>
              <span className="text-[14px] font-semibold leading-6 tabular-nums" style={item.jeda ? { color: REDUP } : undefined}>
                {item.time}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <p className={`text-[16px] leading-6 [overflow-wrap:anywhere] ${item.jeda ? "font-normal" : "font-semibold"}`} style={item.jeda ? { color: REDUP } : undefined}>
                  {item.title}
                  <LabelUntuk teks={item.untuk} className="font-medium" />
                </p>
                {item.subtitle ? <TeksKaya teks={item.subtitle} className="whitespace-pre-line text-[14px] leading-5 text-[#526078]" warna={TINTA} /> : null}
              </div>
            </li>
          ))}
        </ol>
        {baris.length > RINGKAS ? (
          <button
            type="button"
            aria-expanded={semua}
            onClick={() => setSemua((nilai) => !nilai)}
            className="m3-state mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full text-[14px] font-semibold shadow-[inset_0_0_0_1px_rgb(16_30_56/0.24)]"
          >
            {semua ? t.horizon.scheduleLess : t.horizon.scheduleAll(baris.length)}
          </button>
        ) : null}
      </div>
    </div>
  );
}
