"use client";

import "./kilas.css";
import { CaretLeft, Confetti, HandWaving, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { eventApiPath } from "@/lib/event-url";
import type { LandingLang } from "@/lib/landing-i18n";
import { layarLanjut, terisi, type Kenangan } from "@/lib/kilas-balik/alur";
import { KILAS_UI } from "@/lib/kilas-balik/i18n";
import type { NilaiJawaban, Tampilan } from "@/lib/kilas-balik/setelan";
import { IsianTanya, Penutup, reduksiGerak, type Kirim, type LayarKlien } from "./bagian";
import { Hitung, KataMuncul, Ornamen, Reaksi, Stiker, kenanganMeriah, labelTanya, warnaLayar } from "./meriah";
import { TampilanPercakapan } from "./tampilan-percakapan";
import { TampilanRingkas } from "./tampilan-ringkas";

export type { LayarKlien, TanyaKlien } from "./bagian";

type Simpanan = { jawaban: Record<string, NilaiJawaban>; i: number; tertunda: boolean };

export type PropsKilas = {
  gaya: CSSProperties;
  lang: LandingLang;
  slug: string;
  /** Null = pratinjau admin: tidak ada yang disimpan di HP atau dikirim. */
  kunciSimpan: string | null;
  tampilan: Tampilan;
  namaAcara: string;
  judul: string | null;
  intro: string | null;
  penutup: string | null;
  penanda: string | null;
  kenangan: Kenangan;
  layar: LayarKlien[];
  jawabanAwal: Record<string, NilaiJawaban> | null;
  portalUrl: string;
  tutupPada: string | null;
  zona: string;
  /** Nama peserta yang dipratinjau admin. */
  pratinjau: string | null;
};

/**
 * Kilas balik untuk peserta. Tiga tampilan (Admin > Feedback > Display)
 * berbagi satu keadaan di sini: jawaban, posisi, simpanan di HP, dan kiriman.
 *
 * Supaya tidak terasa "dikejar": tidak ada nomor soal dan tidak ada batas
 * waktu, wajah 1–5 lanjut sendiri sesudah diketuk, pertanyaan tidak wajib bisa
 * dilewati, dan Tutup selalu ada. Jawaban dan posisi disimpan di HP
 * (localStorage) setiap kali berubah, jadi menutup halaman atau kehilangan
 * sinyal di kereta tidak menghapus apa pun: halaman dibuka lagi tepat di
 * tempat yang sama, dan kiriman yang tertunda dikirim begitu ada sinyal.
 */
export function useKilas(props: PropsKilas) {
  const { layar, lang } = props;
  const t = KILAS_UI[lang];
  const sudahKirim = props.jawabanAwal !== null;
  const iTutup = layar.length - 1;
  const [tampilan, setTampilan] = useState<Tampilan>(props.tampilan);
  const [i, setIState] = useState(sudahKirim ? iTutup : 0);
  const [jauh, setJauh] = useState(sudahKirim ? iTutup : 0);
  const [jawaban, setJawaban] = useState<Record<string, NilaiJawaban>>(props.jawabanAwal ?? {});
  const [kirim, setKirim] = useState<Kirim>(sudahKirim ? "terkirim" : "diam");
  const [galat, setGalat] = useState<string | null>(null);
  const [kosong, setKosong] = useState<string[]>([]);
  const [arah, setArah] = useState<1 | -1>(1);
  const [lanjutDari, setLanjutDari] = useState<number | null>(null);
  // Jawaban dan posisi terbaru untuk kiriman dan lompatan: wajah yang diketuk
  // tepat sebelum layar akhir lanjut lewat setTimeout, yang memegang render lama.
  const jawabanRef = useRef(jawaban);
  const iRef = useRef(i);
  const jauhRef = useRef(jauh);
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    jawabanRef.current = jawaban;
    iRef.current = i;
    jauhRef.current = jauh;
  }, [jawaban, i, jauh]);

  const setI = useCallback((n: number) => {
    iRef.current = n;
    setIState(n);
    setJauh((lama) => Math.max(lama, n));
  }, []);

  const tanyaSemua = useMemo(() => layar.flatMap((l) => (l.jenis === "tanya" ? [l.q] : [])), [layar]);

  // Simpanan di HP baru bisa dibaca sesudah hidrasi (server tidak punya localStorage).
  useEffect(() => {
    if (!props.kunciSimpan) return;
    let simpan: Simpanan | null = null;
    try {
      simpan = JSON.parse(window.localStorage.getItem(props.kunciSimpan) ?? "null") as Simpanan | null;
    } catch {
      simpan = null;
    }
    if (!simpan || typeof simpan !== "object" || !simpan.jawaban) return;
    if (simpan.tertunda) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setJawaban(simpan.jawaban);
      setI(iTutup);
      setKirim("luring");
      return;
    }
    if (sudahKirim) return;
    if (props.tampilan === "ringkas") setJawaban(simpan.jawaban);
    else if (simpan.i > 0) {
      setJawaban(simpan.jawaban);
      setLanjutDari(layarLanjut(layar as never, simpan.jawaban, simpan.i));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!props.kunciSimpan || kirim === "terkirim") return;
    try {
      window.localStorage.setItem(props.kunciSimpan, JSON.stringify({ jawaban, i, tertunda: kirim === "luring" || kirim === "gagal" } satisfies Simpanan));
    } catch {
      /* penyimpanan diblokir: tetap jalan tanpa lanjut-nanti */
    }
  }, [jawaban, i, kirim, props.kunciSimpan]);

  const kirimJawaban = useCallback(async () => {
    setKirim("mengirim");
    setGalat(null);
    if (props.pratinjau !== null) {
      window.setTimeout(() => setKirim("terkirim"), 400);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setKirim("luring");
      return;
    }
    const res = await fetch(eventApiPath("/api/peserta/kilas-balik"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lang, answers: jawabanRef.current }),
    }).catch(() => null);
    if (!res) {
      setKirim("luring");
      return;
    }
    if (res.ok) {
      setKirim("terkirim");
      setKosong([]);
      try {
        if (props.kunciSimpan) window.localStorage.removeItem(props.kunciSimpan);
      } catch {
        /* abaikan */
      }
      return;
    }
    const isi = await res.json().catch(() => null);
    const hilang: string[] = isi?.error?.details?.missing ?? [];
    if (hilang.length) {
      setKosong(hilang);
      setKirim("diam");
      setGalat(t.required);
      const ke = layar.findIndex((l) => l.jenis === "tanya" && hilang.includes(l.q.key));
      if (ke >= 0) {
        setArah(-1);
        setI(ke);
      }
      return;
    }
    setKirim("gagal");
    setGalat(isi?.error?.message ?? t.failed);
  }, [lang, layar, props.kunciSimpan, props.pratinjau, setI, t.failed, t.required]);

  // Kiriman tertunda: kirim lagi begitu ada sinyal.
  useEffect(() => {
    if (kirim !== "luring") return;
    const coba = () => void kirimJawaban();
    window.addEventListener("online", coba);
    return () => window.removeEventListener("online", coba);
  }, [kirim, kirimJawaban]);

  const batalTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  /**
   * Layar berikutnya. Saat mengubah jawaban lama di Percakapan (`lompat`),
   * kembali ke tempat terjauh yang sudah dicapai, bukan berjalan ulang.
   */
  const maju = useCallback((lompat = false) => {
    batalTimer();
    setArah(1);
    setGalat(null);
    const lama = iRef.current;
    const berikut = lompat && jauhRef.current > lama + 1 ? jauhRef.current : Math.min(lama + 1, iTutup);
    setI(berikut);
    if (berikut === iTutup && lama !== iTutup) void kirimJawaban();
  }, [batalTimer, iTutup, kirimJawaban, setI]);

  /** Wajah diketuk: lanjut sendiri sesudah reaksi sempat terbaca. */
  const majuNanti = useCallback((lompat = false) => {
    batalTimer();
    timerRef.current = window.setTimeout(() => maju(lompat), reduksiGerak() ? 300 : 900);
  }, [batalTimer, maju]);

  const mundur = useCallback(() => {
    batalTimer();
    setArah(-1);
    setGalat(null);
    setI(Math.max(0, iRef.current - 1));
  }, [batalTimer, setI]);

  const setNilai = useCallback((key: string, v: NilaiJawaban | undefined) => {
    setGalat(null);
    setKosong((lama) => (lama.includes(key) ? lama.filter((k) => k !== key) : lama));
    setJawaban((lama) => {
      const baru = { ...lama };
      if (v === undefined) delete baru[key];
      else baru[key] = v;
      jawabanRef.current = baru;
      return baru;
    });
  }, []);

  const tutupTanggal = props.tutupPada
    ? new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: props.zona }).format(new Date(props.tutupPada))
    : null;

  return {
    props, t, lang, layar, iTutup, tanyaSemua, tutupTanggal,
    tampilan, setTampilan,
    i, setI, jauh, arah, setArah, maju, majuNanti, mundur, batalTimer,
    jawaban, setNilai, kosong, setKosong,
    kirim, setKirim, kirimJawaban, galat, setGalat,
    lanjutDari, setLanjutDari,
  };
}

export type Kilas = ReturnType<typeof useKilas>;

export function KilasClient(props: PropsKilas) {
  const k = useKilas(props);
  return (
    <main className="kb-akar" style={props.gaya} data-tampilan={k.tampilan} data-warna={k.tampilan === "kilas" ? warnaLayar(k.layar, k.i) : undefined}>
      {props.pratinjau !== null ? (
        <p className="kb-pratinjau" role="note">
          {k.t.preview(props.pratinjau)}
        </p>
      ) : null}
      {k.tampilan === "ringkas" ? <TampilanRingkas k={k} /> : k.tampilan === "percakapan" ? <TampilanPercakapan k={k} /> : <TampilanKilas k={k} />}
    </main>
  );
}

/** Kilas: satu layar per kartu, garis progres seperti Stories, latar berganti warna tiap layar. */
function TampilanKilas({ k }: { k: Kilas }) {
  const { t, layar, i, iTutup, lang, jawaban, props } = k;
  const kenangan = props.kenangan;
  const [reaksi, setReaksi] = useState<{ teks: string | null; kunci: number }>({ teks: null, kunci: 0 });
  const judulRef = useRef<HTMLHeadingElement>(null);
  const pertamaRef = useRef(true);

  // Fokus ke judul layar baru untuk pembaca layar, kecuali saat halaman pertama dibuka.
  useEffect(() => {
    if (pertamaRef.current) {
      pertamaRef.current = false;
      return;
    }
    judulRef.current?.focus({ preventScroll: true });
    setReaksi((r) => ({ teks: null, kunci: r.kunci }));
  }, [i]);

  const sisa = layar.slice(i).filter((l) => l.jenis === "tanya").length;
  const menit = Math.max(1, Math.round(k.tanyaSemua.length * 0.3 + layar.filter((l) => l.jenis === "kartu").length * 0.1));
  const sekarang = layar[i];
  const tanya = sekarang.jenis === "tanya" ? sekarang.q : null;
  const urutanTanya = tanya ? layar.slice(0, i).filter((l) => l.jenis === "tanya").length : 0;
  const nilai = tanya ? jawaban[tanya.key] : undefined;
  const bolehLanjut = !tanya || !tanya.required || terisi(nilai);
  const kartu = sekarang.jenis === "kartu" ? kenanganMeriah(lang, sekarang.kartu, kenangan) : null;
  const sapa = props.judul?.trim() || t.hello(kenangan.nama);

  const ubah = () => {
    k.setKirim("diam");
    k.setArah(-1);
    const pertama = layar.findIndex((l) => l.jenis === "tanya");
    k.setI(pertama >= 0 ? pertama : 0);
  };

  return (
    <div className="kb-layar">
      <header className="kb-atas">
        <div className="kb-garis" aria-hidden>
          {layar.map((_, n) => (
            <span key={n} className="kb-garis-isi">
              <span style={{ transform: `scaleX(${n < i ? 1 : n === i ? 0.5 : 0})` }} />
            </span>
          ))}
        </div>
        <div className="kb-meta">
          {i > 0 && i < iTutup ? (
            <button type="button" className="kb-ikon" onClick={k.mundur} aria-label={t.back}>
              <CaretLeft size={22} weight="bold" aria-hidden />
            </button>
          ) : (
            <span className="kb-ikon-kosong" />
          )}
          <p className="kb-sisa" aria-live="polite">
            {sekarang.jenis === "tutup" ? props.namaAcara : sekarang.jenis === "buka" ? t.duration(menit) : t.left(sisa)}
          </p>
          <a href={props.portalUrl} className="kb-ikon" aria-label={t.close} title={t.close}>
            <X size={22} weight="bold" aria-hidden />
          </a>
        </div>
      </header>

      <section key={i} className={`kb-kartu kb-kartu-polos ${k.arah === 1 ? "kb-masuk" : "kb-masuk-balik"}`} aria-labelledby="kb-judul">
        {sekarang.jenis !== "tutup" ? <Ornamen pola={i} ikon={kartu?.coretan ?? (sekarang.jenis === "buka" ? <Confetti size={260} weight="thin" /> : null)} /> : null}
        <Reaksi teks={reaksi.teks} kunci={reaksi.kunci} />

        {sekarang.jenis === "buka" ? (
          <>
            <p className="kb-sudut">{props.namaAcara}</p>
            <span className="kb-lambai" aria-hidden>
              <HandWaving size={72} weight="fill" />
            </span>
            <h1 id="kb-judul" ref={judulRef} tabIndex={-1} className="kb-judul kb-judul-raksasa">
              <KataMuncul teks={sapa} mulai={150} jeda={110} />
            </h1>
            <p className="kb-teks kb-pelan">{props.intro?.trim() || t.introDefault}</p>
            <Stiker label={[{ teks: t.daysTogether(kenangan.hari) }, { teks: t.duration(menit) }]} mulai={900} />
            <div className="kb-isi-bawah">
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
                  {t.start}
                </button>
              )}
              <button type="button" className="kb-tombol-teks" onClick={() => k.setTampilan("ringkas")}>
                {t.preferOnePage}
              </button>
            </div>
          </>
        ) : null}

        {sekarang.jenis === "kartu" && kartu ? (
          <>
            {"angka" in kartu.besar ? (
              <p className="kb-besar">
                <b>
                  <Hitung ke={kartu.besar.angka} />
                </b>
                <span>{kartu.besar.satuan}</span>
              </p>
            ) : (
              <p className="kb-besar kb-besar-ikon" data-gerak={kartu.besar.gerak} aria-hidden>
                {kartu.besar.ikon}
              </p>
            )}
            <h1 id="kb-judul" ref={judulRef} tabIndex={-1} className="kb-judul">
              <KataMuncul teks={kartu.judul} mulai={350} />
            </h1>
            <Stiker label={kartu.label} mulai={750} />
            <div className="kb-isi-bawah">
              <button type="button" className="kb-tombol" onClick={() => k.maju()}>
                {t.next}
              </button>
            </div>
          </>
        ) : null}

        {tanya ? (
          <>
            <p className="kb-sudut kb-sudut-miring">{labelTanya(lang, urutanTanya, sisa)}</p>
            <h1 id="kb-judul" ref={judulRef} tabIndex={-1} className="kb-judul kb-judul-tanya">
              <KataMuncul teks={tanya.title} mulai={120} jeda={55} />
            </h1>
            <div className="kb-isian-wadah">
              <IsianTanya
                lang={lang}
                tanya={tanya}
                nilai={nilai}
                idJudul="kb-judul"
                onNilai={(v) => k.setNilai(tanya.key, v)}
                onReaksi={(teks) => setReaksi((r) => ({ teks, kunci: r.kunci + 1 }))}
                onWajah={() => k.majuNanti()}
              />
            </div>
            {k.galat ? (
              <p className="kb-galat" role="alert">
                {k.galat}
              </p>
            ) : null}
            <div className="kb-isi-bawah">
              <button
                type="button"
                className="kb-tombol"
                aria-disabled={!bolehLanjut}
                onClick={() => (bolehLanjut ? k.maju() : k.setGalat(t.required))}
              >
                {i + 1 === iTutup ? t.send : t.next}
              </button>
              {!tanya.required && !terisi(nilai) ? (
                <button type="button" className="kb-tombol-teks" onClick={() => k.maju()}>
                  {t.skip}
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        {sekarang.jenis === "tutup" ? (
          <Penutup
            lang={lang}
            kenangan={kenangan}
            jawaban={jawaban}
            tanya={k.tanyaSemua}
            penutup={props.penutup}
            penanda={props.penanda}
            namaAcara={props.namaAcara}
            kirim={k.kirim}
            galat={k.galat}
            tutupTanggal={k.tutupTanggal}
            portalUrl={props.portalUrl}
            judulRef={judulRef}
            onKirim={() => void k.kirimJawaban()}
            onUbah={ubah}
          />
        ) : null}
      </section>
    </div>
  );
}
