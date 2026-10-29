"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, CaretRight, MagnifyingGlass, MapPin } from "@phosphor-icons/react";
import { useKehadiran } from "@/components/member/use-kehadiran";
import { angkaKehadiran, hariPendek, jamDiZona, PANITIA_UI, persenKehadiran, type BarisKehadiran, type OrangKehadiran } from "@/lib/member/panitia-i18n";
import { tanggalDiZona } from "@/lib/checkpoint/waktu";
import type { LandingLang } from "@/lib/landing-i18n";

/** Kelas warna per tema portal, disusun di server (panitia-portal.tsx). */
export type NadaPanitia = {
  kartu: string;
  redup: string;
  garis: string;
  chip: string;
  chipAktif: string;
  jalur: string;
  isi: string;
  segAktif: string;
  kolom: string;
  bilah: string;
};

/**
 * Halaman Kehadiran panitia (`?tab=panitia`, `&titik=cp-12` untuk satu titik).
 * Daftar titik per hari dengan jumlah dan persen, lalu satu titik: Belum lebih
 * dulu (pertanyaan di lapangan "siapa yang belum datang?"), Sudah urut yang
 * terbaru, dan pencarian. Pindah titik lewat tautan, jadi tombol kembali
 * peramban bekerja.
 */
export function HalamanPanitia({
  slug,
  lang,
  dasar,
  beranda,
  titik,
  nada,
}: {
  slug: string;
  lang: LandingLang;
  /** `/e/<slug>/peserta?tab=panitia`, tanpa titik. */
  dasar: string;
  beranda: string;
  titik: string | null;
  nada: NadaPanitia;
}) {
  const t = PANITIA_UI[lang];
  const { data, galat } = useKehadiran(slug, lang, titik);
  const zona = data?.time_zone ?? "Asia/Jakarta";
  const baris = titik ? (data?.row ?? null) : null;

  const judul = titik ? (baris?.nama ?? t.halamanJudul) : t.halamanJudul;
  const sub = data ? t.diperbarui(jamDiZona(data.updated_at, zona, lang)) : null;

  return (
    <>
      <header className={`sticky top-0 z-10 border-b ${nada.garis} ${nada.bilah}`}>
        <div className="mx-auto flex min-h-16 w-full max-w-[720px] items-center gap-1 px-2 md:px-4">
          <Link href={titik ? dasar : beranda} aria-label={titik ? t.kembaliKeDaftar : t.kembaliKeBeranda} className="m3-state flex size-12 shrink-0 items-center justify-center rounded-full">
            <ArrowLeft size={22} weight="bold" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1 py-2">
            <h1 className="text-[18px] font-bold leading-6 [overflow-wrap:anywhere]">{judul}</h1>
            {sub ? <p className={`text-[12px] leading-4 ${nada.redup}`}>{sub}</p> : null}
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 pb-16 pt-4 md:px-6 md:pt-6">
        {!data ? (
          <p className={`text-[14px] leading-5 ${nada.redup}`} role={galat !== null ? "alert" : "status"}>
            {galat !== null ? galat || t.gagal : t.memuat}
          </p>
        ) : titik ? (
          baris ? (
            <RinciTitik baris={baris} belum={data.belum ?? []} sudah={data.sudah ?? []} zona={zona} lang={lang} nada={nada} />
          ) : null
        ) : (
          <DaftarTitik rows={data.rows ?? []} zona={zona} lang={lang} dasar={dasar} nada={nada} />
        )}
      </div>
    </>
  );
}

function Batang({ persen, nada }: { persen: number; nada: NadaPanitia }) {
  return (
    <span aria-hidden className={`block h-1.5 overflow-hidden rounded-full ${nada.jalur}`}>
      <span className={`block h-full rounded-full ${nada.isi}`} style={{ width: `${persen}%` }} />
    </span>
  );
}

function DaftarTitik({ rows, zona, lang, dasar, nada }: { rows: BarisKehadiran[]; zona: string; lang: LandingLang; dasar: string; nada: NadaPanitia }) {
  const t = PANITIA_UI[lang];
  const hariIni = tanggalDiZona(new Date(), zona);
  const hari = [...new Set(rows.map((baris) => baris.tanggal).filter((tanggal): tanggal is string => Boolean(tanggal)))].sort();
  const bawaan = hari.includes(hariIni) ? hariIni : (hari.find((tanggal) => tanggal > hariIni) ?? hari[hari.length - 1] ?? null);
  const [pilih, setPilih] = useState<string | null>(null);
  const aktifHari = pilih ?? bawaan;
  if (rows.length === 0) return <p className={`text-[14px] leading-5 ${nada.redup}`}>{t.kosong}</p>;

  const bertanggal = rows.filter((baris) => baris.tanggal && baris.tanggal === aktifHari);
  const tanpa = rows.filter((baris) => !baris.tanggal);
  const kelompok = (isi: BarisKehadiran[]) => (
    <ul className={`overflow-hidden ${nada.kartu}`}>
      {isi.map((baris, urutan) => {
        const persen = persenKehadiran(baris);
        const belum = Math.max(0, baris.diharapkan - baris.sudah);
        return (
          <li key={baris.key} className={urutan > 0 ? `border-t ${nada.garis}` : undefined}>
            <Link href={`${dasar}&titik=${encodeURIComponent(baris.key)}`} className="m3-state flex items-center gap-3 px-4 py-4 md:px-6">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]">{baris.nama}</p>
                    {baris.jam || baris.tempat ? (
                      <p className={`text-[14px] leading-5 [overflow-wrap:anywhere] ${nada.redup}`}>{[baris.jam?.slice(0, 5).replace(":", "."), baris.tempat].filter(Boolean).join(" · ")}</p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-right text-[16px] font-semibold leading-6 tabular-nums">
                    {angkaKehadiran(baris.sudah, lang)}
                    <span className={`font-medium ${nada.redup}`}>{` / ${angkaKehadiran(baris.diharapkan, lang)}`}</span>
                    <span className={`block text-[12px] font-medium leading-4 ${nada.redup}`}>{persen}%</span>
                  </p>
                </div>
                <Batang persen={persen} nada={nada} />
                <p className="flex flex-wrap gap-2 text-[12px] font-semibold leading-4">
                  {!baris.aktif ? <span className={`rounded-full px-2 py-0.5 ${nada.chip}`}>{t.ditutup}</span> : null}
                  {belum > 0 ? (
                    <span className="rounded-full bg-[#FCEBEA] px-2 py-0.5 text-[#B42318]">{t.belumN(belum)}</span>
                  ) : (
                    <span className="rounded-full bg-[#E7F4EC] px-2 py-0.5 text-[#1E7B45]">{t.semuaSudah}</span>
                  )}
                </p>
              </div>
              <CaretRight size={18} aria-hidden className={`shrink-0 ${nada.redup}`} />
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {hari.length > 1 ? (
        <div role="group" aria-label={t.hariLabel} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          {hari.map((tanggal) => (
            <button
              key={tanggal}
              type="button"
              aria-pressed={tanggal === aktifHari}
              onClick={() => setPilih(tanggal)}
              className={`m3-state min-h-12 shrink-0 rounded-full px-4 text-[14px] font-semibold ${tanggal === aktifHari ? nada.chipAktif : nada.chip}`}
            >
              {tanggal === hariIni ? `${t.hariIni} · ${hariPendek(tanggal, lang)}` : hariPendek(tanggal, lang)}
            </button>
          ))}
        </div>
      ) : null}
      {bertanggal.length > 0 ? kelompok(bertanggal) : null}
      {tanpa.length > 0 ? (
        <section className="flex flex-col gap-2">
          {bertanggal.length > 0 ? <h2 className={`px-1 text-[14px] font-semibold leading-5 ${nada.redup}`}>{t.tanpaJadwal}</h2> : null}
          {kelompok(tanpa)}
        </section>
      ) : null}
      <p className={`px-1 text-[12px] leading-4 ${nada.redup}`}>{t.catatanAngka}</p>
    </>
  );
}

function RinciTitik({
  baris,
  belum,
  sudah,
  zona,
  lang,
  nada,
}: {
  baris: BarisKehadiran;
  belum: OrangKehadiran[];
  sudah: OrangKehadiran[];
  zona: string;
  lang: LandingLang;
  nada: NadaPanitia;
}) {
  const t = PANITIA_UI[lang];
  const [tab, setTab] = useState<"belum" | "sudah">("belum");
  const [cari, setCari] = useState("");
  const persen = persenKehadiran(baris);
  const daftar = tab === "belum" ? belum : sudah;
  const kunci = cari.trim().toLocaleLowerCase("id");
  const tampil = useMemo(
    () => (kunci ? daftar.filter((orang) => [orang.nama, orang.unit, orang.kelompok].some((isi) => isi?.toLocaleLowerCase("id").includes(kunci))) : daftar),
    [daftar, kunci],
  );

  return (
    <>
      <section className="flex flex-col gap-3">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[34px] font-bold leading-10 tabular-nums">{angkaKehadiran(baris.sudah, lang)}</span>
          <span className={`text-[14px] leading-5 ${nada.redup}`}>{t.sudahDari(baris.sudah, baris.diharapkan, persen)}</span>
        </p>
        <Batang persen={persen} nada={nada} />
        {baris.tempat || baris.jam ? (
          <p className={`flex items-start gap-1.5 text-[14px] leading-5 ${nada.redup}`}>
            <MapPin size={16} aria-hidden className="mt-0.5 shrink-0" />
            {[baris.jam?.slice(0, 5).replace(":", "."), baris.tempat].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </section>
      <div role="group" className={`grid grid-cols-2 overflow-hidden rounded-full border ${nada.garis}`}>
        {(["belum", "sudah"] as const).map((pilihan) => (
          <button
            key={pilihan}
            type="button"
            aria-pressed={tab === pilihan}
            onClick={() => setTab(pilihan)}
            className={`m3-state min-h-12 text-[14px] font-semibold tabular-nums ${tab === pilihan ? nada.segAktif : ""}`}
          >
            {pilihan === "belum" ? t.tabBelum(belum.length) : t.tabSudah(sudah.length)}
          </button>
        ))}
      </div>
      {/* Garis ada di kolomnya sendiri, jadi cincin fokus global melingkari kotak yang terlihat. */}
      <label className="relative block">
        <span className="sr-only">{t.cariLabel}</span>
        <MagnifyingGlass size={20} aria-hidden className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${nada.redup}`} />
        <input
          type="search"
          value={cari}
          onChange={(event) => setCari(event.target.value)}
          placeholder={t.cari}
          enterKeyHint="search"
          className={`min-h-12 w-full rounded-[12px] border pl-10 pr-3 text-[16px] leading-6 placeholder:text-current placeholder:opacity-60 ${nada.kolom}`}
        />
      </label>
      {tampil.length === 0 ? (
        <p className={`px-1 text-[14px] leading-5 ${nada.redup}`}>{kunci ? t.tidakDitemukan(cari.trim()) : tab === "belum" ? t.belumKosong : t.sudahKosong}</p>
      ) : (
        <ul className={`overflow-hidden ${nada.kartu}`}>
          {tampil.map((orang, urutan) => (
            <li key={`${orang.nama}-${urutan}`} className={`flex min-h-14 items-center gap-3 px-4 py-2.5 md:px-6 ${urutan > 0 ? `border-t ${nada.garis}` : ""}`}>
              <span aria-hidden className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${nada.chip}`}>
                {inisial(orang.nama)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold leading-5 [overflow-wrap:anywhere]">{orang.nama}</p>
                {orang.unit || orang.kelompok ? (
                  <p className={`text-[12px] leading-4 [overflow-wrap:anywhere] ${nada.redup}`}>{[orang.unit, orang.kelompok].filter(Boolean).join(" · ")}</p>
                ) : null}
              </div>
              {orang.at ? <span className={`shrink-0 text-[12px] leading-4 tabular-nums ${nada.redup}`}>{jamDiZona(orang.at, zona, lang)}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {baris.lainnya > 0 ? <p className={`px-1 text-[12px] leading-4 ${nada.redup}`}>{t.lainnya(baris.lainnya)}</p> : null}
      <p className={`px-1 text-[12px] leading-4 ${nada.redup}`}>{t.privasi}</p>
    </>
  );
}

function inisial(nama: string) {
  const kata = nama.trim().split(/\s+/).filter(Boolean);
  return ((kata[0]?.[0] ?? "") + (kata.length > 1 ? (kata[kata.length - 1]?.[0] ?? "") : "")).toUpperCase() || "·";
}
