"use client";

import { PencilSimple, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { terisi } from "@/lib/kilas-balik/alur";
import { IsianTanya, Penutup, isiKenangan, reduksiGerak, teksJawaban } from "./bagian";
import type { Kilas } from "./kilas-client";

/** Jeda "sedang mengetik" sebelum pesan panitia berikutnya muncul. */
const JEDA_KETIK = 650;
/** Kartu kenangan dibiarkan terbaca sebentar sebelum pertanyaan berikutnya. */
const JEDA_KARTU = 1600;

/**
 * Percakapan: kilas balik sebagai obrolan dengan panitia. Kenangan dan
 * pertanyaan datang sebagai gelembung pesan, jawaban peserta jadi balasan di
 * kanan yang bisa diketuk untuk diubah. Isian ada di bawah seperti kolom
 * ketik, jadi rasanya membalas pesan, bukan mengisi formulir.
 */
export function TampilanPercakapan({ k }: { k: Kilas }) {
  const { t, lang, layar, i, iTutup, props, jawaban } = k;
  const [tampilI, setTampilI] = useState(i);
  const [reaksi, setReaksi] = useState<Record<string, string>>({});
  const akhirRef = useRef<HTMLDivElement>(null);
  const judulRef = useRef<HTMLHeadingElement>(null);
  const mengetik = tampilI < i;
  const pengirim = props.penanda?.trim() || t.organiser;
  const inisial = pengirim.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("") || "P";

  // Pesan panitia untuk layar baru muncul sesudah titik-titik mengetik.
  useEffect(() => {
    if (i <= tampilI || reduksiGerak()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTampilI(i);
      return;
    }
    const jeda = window.setTimeout(() => setTampilI(i), JEDA_KETIK);
    return () => window.clearTimeout(jeda);
  }, [i, tampilI]);

  // Kartu kenangan lanjut sendiri sesudah sempat terbaca.
  const sekarang = layar[i];
  const { maju } = k;
  useEffect(() => {
    if (sekarang.jenis !== "kartu" || tampilI !== i) return;
    const jeda = window.setTimeout(() => maju(true), reduksiGerak() ? 700 : JEDA_KARTU);
    return () => window.clearTimeout(jeda);
  }, [sekarang, tampilI, i, maju]);

  useEffect(() => {
    // Ke dasar halaman: kolom isian menempel di bawah, jadi pesan terakhir tepat di atasnya.
    if (!akhirRef.current) return;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reduksiGerak() ? "auto" : "smooth" });
  }, [tampilI, i, k.kirim, jawaban]);

  const sisa = layar.slice(i).filter((l) => l.jenis === "tanya").length;
  const tanya = sekarang.jenis === "tanya" && tampilI === i ? sekarang.q : null;
  const nilai = tanya ? jawaban[tanya.key] : undefined;
  const bolehLanjut = !tanya || !tanya.required || terisi(nilai);

  const pesanPanitia = (isi: ReactNode, kunci: string, kelas = "") => (
    <li key={kunci} className={`kb-o-pesan kb-o-panitia ${kelas}`}>
      {isi}
    </li>
  );

  const utas: ReactNode[] = [];
  layar.forEach((l, n) => {
    if (n > i) return;
    const tampak = n < i || tampilI >= n;
    if (l.jenis === "buka") {
      utas.push(pesanPanitia(<p>{props.judul?.trim() || t.hello(props.kenangan.nama)}</p>, "b1"));
      utas.push(pesanPanitia(<p>{props.intro?.trim() || t.introDefault}</p>, "b2"));
      if (n < i) utas.push(<li key="b3" className="kb-o-pesan kb-o-saya"><p>{t.letsGo}</p></li>);
      return;
    }
    if (!tampak) return;
    if (l.jenis === "kartu") {
      const isi = isiKenangan(lang, l.kartu, props.kenangan);
      if (!isi) return;
      utas.push(
        pesanPanitia(
          <>
            {isi.fakta ? <p className="kb-fakta">{isi.fakta}</p> : null}
            <p className="kb-o-judul">{isi.judul}</p>
            {isi.isi}
          </>,
          `k-${n}`,
          "kb-o-kenangan",
        ),
      );
      return;
    }
    if (l.jenis === "tanya") {
      utas.push(pesanPanitia(<p id={`kb-oj-${l.q.key}`} className="kb-o-judul">{l.q.title}</p>, `q-${n}`));
      if (n < i) {
        const teks = teksJawaban(lang, l.q, jawaban[l.q.key]);
        utas.push(
          <li key={`a-${n}`} className="kb-o-pesan kb-o-saya" data-lewat={teks === null || undefined}>
            <p>{teks ?? t.skipped}</p>
            {k.kirim !== "mengirim" ? (
              <button type="button" className="kb-o-ubah" onClick={() => { k.batalTimer(); if (k.kirim === "terkirim") k.setKirim("diam"); k.setArah(-1); k.setI(n); }} aria-label={`${t.edit}: ${l.q.title}`}>
                <PencilSimple size={16} aria-hidden />
                {t.edit}
              </button>
            ) : null}
          </li>,
        );
        if (reaksi[l.q.key] && teks !== null) utas.push(pesanPanitia(<p>{reaksi[l.q.key]}</p>, `r-${n}`, "kb-o-reaksi"));
      }
      return;
    }
    utas.push(
      <li key="tutup" className="kb-o-pesan kb-o-penutup">
        <section className="kb-kartu kb-kartu-gelap" aria-labelledby="kb-judul">
          <Penutup
            lang={lang}
            kenangan={props.kenangan}
            jawaban={jawaban}
            tanya={k.tanyaSemua}
            penutup={props.penutup}
            penanda={props.penanda}
            kirim={k.kirim}
            galat={k.galat}
            tutupTanggal={k.tutupTanggal}
            portalUrl={props.portalUrl}
            judulRef={judulRef}
            onKirim={() => void k.kirimJawaban()}
            onUbah={() => {
              k.setKirim("diam");
              k.setArah(-1);
              const pertama = layar.findIndex((x) => x.jenis === "tanya");
              k.setI(pertama >= 0 ? pertama : 0);
            }}
          />
        </section>
      </li>,
    );
  });

  return (
    <div className="kb-obrolan">
      <header className="kb-o-kepala">
        <span className="kb-o-avatar" aria-hidden>
          {inisial}
        </span>
        <div className="kb-o-nama">
          <b>{pengirim}</b>
          <span>{i === 0 || i === iTutup ? props.namaAcara : t.left(sisa)}</span>
        </div>
        <a href={props.portalUrl} className="kb-ikon" aria-label={t.close} title={t.close}>
          <X size={22} weight="bold" aria-hidden />
        </a>
      </header>

      <ol className="kb-o-utas" aria-live="polite">
        {utas}
        {mengetik ? (
          <li className="kb-o-pesan kb-o-panitia kb-o-ketik" aria-label={t.typing}>
            <span />
            <span />
            <span />
          </li>
        ) : null}
      </ol>
      <div ref={akhirRef} />

      {sekarang.jenis === "buka" ? (
        <div className="kb-o-tulis">
          {k.lanjutDari !== null && k.lanjutDari > 0 ? (
            <>
              <button type="button" className="kb-tombol" onClick={() => { k.setArah(1); k.setI(k.lanjutDari!); k.setLanjutDari(null); }}>
                {t.resume}
              </button>
              <button type="button" className="kb-tombol-teks" onClick={() => { k.setLanjutDari(null); k.maju(); }}>
                {t.start}
              </button>
            </>
          ) : (
            <button type="button" className="kb-tombol" onClick={() => k.maju()}>
              {t.letsGo}
            </button>
          )}
          <button type="button" className="kb-tombol-teks" onClick={() => k.setTampilan("ringkas")}>
            {t.preferOnePage}
          </button>
        </div>
      ) : null}

      {tanya ? (
        <div className="kb-o-tulis kb-kartu-terang" key={tanya.key}>
          <IsianTanya
            lang={lang}
            tanya={tanya}
            nilai={nilai}
            idJudul={`kb-oj-${tanya.key}`}
            onNilai={(v) => k.setNilai(tanya.key, v)}
            onReaksi={(r) => setReaksi((lama) => ({ ...lama, [tanya.key]: r }))}
            onWajah={() => k.majuNanti(true)}
          />
          {k.galat ? (
            <p className="kb-galat" role="alert">
              {k.galat}
            </p>
          ) : null}
          {tanya.type !== "faces" || terisi(nilai) ? (
            <div className="kb-o-aksi">
              {!tanya.required && !terisi(nilai) ? (
                <button type="button" className="kb-tombol-teks" onClick={() => k.maju(true)}>
                  {t.skip}
                </button>
              ) : null}
              <button
                type="button"
                className="kb-tombol"
                aria-disabled={!bolehLanjut}
                onClick={() => (bolehLanjut ? k.maju(true) : k.setGalat(t.required))}
              >
                {i + 1 === iTutup ? t.send : t.next}
              </button>
            </div>
          ) : !tanya.required ? (
            <div className="kb-o-aksi">
              <button type="button" className="kb-tombol-teks" onClick={() => k.maju(true)}>
                {t.skip}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
