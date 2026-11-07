"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { terisi } from "@/lib/kilas-balik/alur";
import { IsianTanya, Penutup, reduksiGerak, ubinRekap } from "./bagian";
import type { Kilas } from "./kilas-client";
import { KataMuncul, Ornamen } from "./meriah";

/**
 * Ringkas: satu halaman, semua pertanyaan sekaligus, satu tombol kirim. Untuk
 * peserta yang buru-buru (atau panitia yang memilihnya). Kenangan diringkas
 * jadi ubin angka di kepala halaman; rekap lengkap muncul sesudah terkirim.
 */
export function TampilanRingkas({ k }: { k: Kilas }) {
  const { t, lang, props, jawaban, kosong, kirim } = k;
  const selesai = kirim === "terkirim" || kirim === "luring" || kirim === "gagal";
  const judulRef = useRef<HTMLHeadingElement>(null);
  const ubin = ubinRekap(lang, props.kenangan);
  const wajibSisa = k.tanyaSemua.filter((q) => q.required && !terisi(jawaban[q.key])).length;

  useEffect(() => {
    if (!selesai) return;
    window.scrollTo({ top: 0, behavior: reduksiGerak() ? "auto" : "smooth" });
    judulRef.current?.focus({ preventScroll: true });
  }, [selesai]);

  const kirimSemua = () => {
    const hilang = k.tanyaSemua.filter((q) => q.required && !terisi(jawaban[q.key])).map((q) => q.key);
    if (hilang.length) {
      k.setKosong(hilang);
      const el = document.getElementById(`kb-q-${hilang[0]}`);
      el?.scrollIntoView({ behavior: reduksiGerak() ? "auto" : "smooth", block: "center" });
      el?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
      return;
    }
    void k.kirimJawaban();
  };

  return (
    <div className="kb-ringkas">
      <header className="kb-r-kepala">
        <Ornamen kepala />
        <div className="kb-r-baris">
          <p className="kb-fakta">{props.namaAcara}</p>
          <a href={props.portalUrl} className="kb-ikon" aria-label={t.close} title={t.close}>
            <X size={22} weight="bold" aria-hidden />
          </a>
        </div>
        {!selesai ? (
          <>
            <h1 className="kb-judul">
              <KataMuncul teks={props.judul?.trim() || t.hello(props.kenangan.nama)} mulai={100} jeda={90} />
            </h1>
            <p className="kb-teks">{props.intro?.trim() || t.introDefault}</p>
            {ubin.length ? (
              <dl className="kb-ubin kb-ubin-kecil">
                {ubin.map((u) => (
                  <div key={u.l}>
                    <dt>{u.l}</dt>
                    <dd>{u.n}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </>
        ) : null}
      </header>

      {selesai ? (
        <section className="kb-kartu kb-kartu-gelap kb-r-penutup" aria-labelledby="kb-judul">
          <Penutup
            lang={lang}
            kenangan={props.kenangan}
            jawaban={jawaban}
            tanya={k.tanyaSemua}
            penutup={props.penutup}
            penanda={props.penanda}
            namaAcara={props.namaAcara}
            kirim={kirim}
            galat={k.galat}
            tutupTanggal={k.tutupTanggal}
            portalUrl={props.portalUrl}
            judulRef={judulRef}
            onKirim={() => void k.kirimJawaban()}
            onUbah={() => k.setKirim("diam")}
          />
        </section>
      ) : (
        <>
          <div className="kb-r-daftar">
            {k.tanyaSemua.map((q) => {
              const salah = kosong.includes(q.key);
              const idJudul = `kb-qj-${q.key}`;
              return (
                <section key={q.key} id={`kb-q-${q.key}`} className="kb-r-tanya" data-kosong={salah || undefined} aria-labelledby={idJudul}>
                  <h2 id={idJudul} tabIndex={-1} className="kb-r-judul">
                    {q.title}
                  </h2>
                  {!q.required ? <p className="kb-r-opsional">{t.optional}</p> : null}
                  <IsianTanya lang={lang} tanya={q} nilai={jawaban[q.key]} idJudul={idJudul} onNilai={(v) => k.setNilai(q.key, v)} />
                  {salah ? (
                    <p className="kb-galat" role="alert">
                      {t.required}
                    </p>
                  ) : null}
                </section>
              );
            })}
          </div>
          <div className="kb-r-kaki">
            <p className="kb-r-sisa" aria-live="polite">
              {t.remaining(wajibSisa)}
            </p>
            <button type="button" className="kb-tombol" aria-disabled={kirim === "mengirim"} onClick={() => (kirim === "mengirim" ? null : kirimSemua())}>
              {kirim === "mengirim" ? t.sending : t.send}
            </button>
            {props.tampilan !== "ringkas" ? (
              <button type="button" className="kb-tombol-teks" onClick={() => k.setTampilan(props.tampilan)}>
                {t.preferStory}
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
