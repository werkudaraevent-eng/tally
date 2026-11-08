/**
 * Menggambar satu slide Event report di kanvas 1280×720. Tanpa state, jadi
 * dipakai sama oleh pratinjau admin, tab Laporan klien dan halaman cetak PDF.
 * Bentuk blok ada di lib/laporan/jenis.ts; warna dari tema acara per permukaan.
 */
import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { Blok, BlokAngka, BlokBatang, BlokChip, BlokGaris, BlokPanas, BlokTabel, BlokTeks, Deck, Latar, Slide, Sorot, TemaDeck } from "@/lib/laporan/jenis";
import { temaDeck, warnaPermukaan } from "@/lib/laporan/warna";
import { LEBAR_KANAN, LEBAR_KIRI, LEBAR_PENUH, lebarKolom, ukuranAngka, ukuranCatatan, ukuranJudul } from "@/lib/laporan/ukuran";

const cxs = (...k: Array<string | false | undefined>) => k.filter(Boolean).join(" ");

const isiBatang = (s: Sorot | undefined) =>
  s === "masalah" ? "var(--lp-merah)" : s === "kedua" ? "color-mix(in srgb,var(--lp-isi) 45%,var(--lp-bg))" : s === "utama" ? "var(--lp-isi)" : "var(--lp-trek)";

function Angka({ b, lebar }: { b: BlokAngka; lebar: number }) {
  if (b.raksasa && b.isi.length > 0) {
    const [utama, ...lain] = b.isi;
    return (
      <div className="lp-raksasa">
        <div className="lp-utama">
          <span className="lp-lbl">{utama.label}</span>
          <span className={cxs("lp-fig", utama.masalah && "lp-m")}>{utama.nilai}</span>
          {utama.ket ? <span className="lp-ket">{utama.ket}</span> : null}
        </div>
        {lain.length ? (
          <ul className="lp-kpi">
            {lain.map((x) => (
              <li key={x.label}>
                <b className={cxs("lp-fig", x.masalah && "lp-m")}>{x.nilai}</b>
                <span>{x.ket ? `${x.label}, ${x.ket}` : x.label}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }
  if (b.tumpuk) {
    return (
      <div className="lp-tumpuk">
        {b.isi.map((x) => (
          <div key={x.label}>
            <span className="lp-lbl">{x.label}</span>
            <span className={cxs("lp-fig", x.masalah && "lp-m")}>{x.nilai}</span>
            {x.ket ? <span className="lp-kecil">{x.ket}</span> : null}
          </div>
        ))}
      </div>
    );
  }
  const ukuran = ukuranAngka(b, lebar);
  return (
    <div className="lp-angka">
      {b.isi.map((x) => (
        <div key={x.label}>
          <span className="lp-lbl">{x.label}</span>
          <span className={cxs("lp-fig", x.masalah && "lp-m")} style={ukuran < 64 ? { fontSize: ukuran } : undefined}>{x.nilai}</span>
          {x.ket ? <span className="lp-kecil">{x.ket}</span> : null}
        </div>
      ))}
    </div>
  );
}

function Tabel({ b, lebarBlok }: { b: BlokTabel; lebarBlok: number }) {
  const setelah = b.batangSetelah ?? -1;
  const adaBatang = setelah >= 0 && b.baris.some((r) => typeof r.batang === "number");
  const lebar = lebarKolom(b, lebarBlok);
  const rapat = b.baris.length > 7;
  return (
    <table className={cxs("lp-tbl", b.bungkus && "lp-tbl-b", rapat && "lp-tbl-r")}>
      <colgroup>{lebar.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <thead>
        <tr>
          {b.kolom.map((k, i) => (
            <FragmenKolom key={k.label + i} tampilBatang={adaBatang && i === setelah}>
              <th className={k.kanan ? "lp-n" : undefined}>{k.label}</th>
            </FragmenKolom>
          ))}
        </tr>
      </thead>
      <tbody>
        {b.baris.map((r, ri) => (
          <tr key={ri} className={r.total ? "lp-total" : r.sorot === "masalah" ? "lp-mr" : undefined}>
            {r.sel.map((sel, i) => (
              <FragmenKolom key={i} tampilBatang={adaBatang && i === setelah} batang={r.total ? undefined : r.batang} sorot={r.sorot}>
                <td className={b.kolom[i]?.kanan ? "lp-n" : undefined} title={b.kolom[i]?.kanan ? undefined : sel}>{b.bungkus ? <span className="lp-sel">{sel}</span> : sel}</td>
              </FragmenKolom>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Sel biasa, ditambah sel batang tepat sesudahnya bila ini kolom `batangSetelah`. */
function FragmenKolom({ children, tampilBatang, batang, sorot }: { children: ReactNode; tampilBatang: boolean; batang?: number; sorot?: Sorot }) {
  if (!tampilBatang) return <>{children}</>;
  return (
    <>
      {children}
      <td aria-hidden>
        {typeof batang === "number" ? (
          <div className="lp-bar" style={{ width: "100%" }}>
            <i className={sorot === "masalah" ? "lp-m" : undefined} style={{ width: `${Math.max(0, Math.min(100, batang))}%` }} />
          </div>
        ) : null}
      </td>
    </>
  );
}

const TINGGI = { besar: 360, sedang: 236, kecil: 130 } as const;

function BatangTegak({ b, lebar: W }: { b: BlokBatang; lebar: number }) {
  // Lebar viewBox sama dengan lebar kolomnya (px kanvas), jadi teks tidak membesar.
  const kecil = b.tinggi === "kecil";
  const H = TINGGI[b.tinggi ?? "besar"];
  const adaSub = b.seri.some((s) => s.sub);
  const bawah = H - (adaSub ? 60 : 38);
  // Garis mulai: labelnya di jalur atas sendiri, di atas angka batang tertinggi.
  const ruang = bawah - (kecil ? 28 : 40) - (b.penanda ? 30 : 0);
  const n = b.seri.length;
  const langkah = W / Math.max(n, 1);
  const lebar = Math.min(W >= LEBAR_PENUH ? 96 : 64, langkah * 0.66);
  const maks = b.maks ?? Math.max(...b.seri.map((s) => s.nilai), 1);
  const tinggi = (v: number) => Math.max(v > 0 ? 3 : 0, (v / maks) * ruang);
  const huruf = kecil ? 15 : n > 14 ? 15 : 17;
  return (
    <div className="lp-sisi" style={{ gap: 8 }}>
      {b.judul ? <p className="lp-judul-kecil">{b.judul}</p> : null}
      <svg className="lp-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={b.judul ?? b.seri.map((s) => `${s.label} ${s.teks}`).join(", ")}>
        <line x1={0} x2={W} y1={bawah} y2={bawah} stroke="var(--lp-garis)" />
        {b.seri.map((s, i) => {
          const x = i * langkah + (langkah - lebar) / 2;
          const t = tinggi(s.nilai);
          return (
            <g key={i}>
              <rect x={x} y={bawah - t} width={lebar} height={t} rx={Math.min(6, lebar / 4)} fill={isiBatang(s.sorot)} />
              {s.teks ? <text className="lp-v" x={x + lebar / 2} y={bawah - t - 8} textAnchor="middle" style={kecil ? { fontSize: 16 } : undefined}>{s.teks}</text> : null}
              <text x={x + lebar / 2} y={bawah + (kecil ? 22 : 26)} textAnchor="middle" style={{ fontSize: huruf }}>{s.label}</text>
              {s.sub ? <text x={x + lebar / 2} y={bawah + 48} textAnchor="middle">{s.sub}</text> : null}
            </g>
          );
        })}
        {b.penanda ? (
          <g>
            <line x1={(b.penanda.setelah + 1) * langkah} x2={(b.penanda.setelah + 1) * langkah} y1={2} y2={bawah} stroke="var(--lp-teks)" strokeWidth={3} />
            <text className="lp-pn" x={(b.penanda.setelah + 1) * langkah + 10} y={18} textAnchor={b.penanda.setelah + 1 > n * 0.7 ? "end" : "start"} dx={b.penanda.setelah + 1 > n * 0.7 ? -20 : 0}>{b.penanda.label}</text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function BatangDatar({ b }: { b: BlokBatang }) {
  const maks = b.maks ?? Math.max(...b.seri.map((s) => Math.abs(s.nilai)), ...(b.pasangan ?? []).map((p) => p.nilai), 1);
  const lebar = (v: number) => `${Math.max(0, Math.min(100, (v / maks) * 100))}%`;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {b.judul ? <p className="lp-kecil">{b.judul}</p> : null}
      {b.legenda ? (
        <div className="lp-key">
          <span><i style={{ background: "var(--lp-isi)" }} />{b.legenda[0]}</span>
          <span><i style={{ background: "var(--lp-trek)" }} />{b.legenda[1]}</span>
        </div>
      ) : null}
      {b.seri.map((s, i) => {
        const p = b.pasangan?.[i];
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,240px) minmax(0,1fr) 72px", gap: 16, alignItems: "center" }}>
            <span style={{ fontSize: 19, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.label}
              {s.sub ? <span className="lp-kecil" style={{ display: "block", fontSize: 15 }}>{s.sub}</span> : null}
            </span>
            <span style={{ display: "grid", gap: 4 }}>
              <span style={{ display: "block", height: 22, borderRadius: 6, width: lebar(Math.abs(s.nilai)), background: isiBatang(s.nilai < 0 ? "masalah" : s.sorot ?? "utama") }} />
              {p ? <span style={{ display: "block", height: 12, borderRadius: 6, width: lebar(p.nilai), background: "var(--lp-trek)" }} /> : null}
            </span>
            <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 19, fontWeight: 600 }}>
              {s.teks}
              {p ? <span className="lp-kecil" style={{ display: "block", fontSize: 15, fontWeight: 400 }}>{p.teks}</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Garis({ b, lebar }: { b: BlokGaris; lebar: number }) {
  const W = lebar;
  const H = 360;
  // Sumbu di kiri, lalu jarak 56 px supaya label titik pertama tidak menimpa label sumbu.
  const kiri = 64;
  const tepi = 56;
  const atas = 40;
  const bawah = 280;
  const n = b.titik.length;
  const x = (i: number) => kiri + tepi + (n <= 1 ? (W - kiri - 2 * tepi) / 2 : (i * (W - kiri - 2 * tepi)) / (n - 1));
  const y = (v: number) => bawah - ((v - b.min) / Math.max(b.maks - b.min, 1)) * (bawah - atas);
  const garisBantu = [b.min, Math.round((b.min + b.maks) / 2), b.maks];
  return (
    <svg className="lp-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={b.titik.map((t) => `${t.label} ${t.teks}`).join(", ")}>
      {garisBantu.map((v) => (
        <g key={v}>
          <line x1={kiri} x2={W} y1={y(v)} y2={y(v)} stroke="var(--lp-garis)" />
          <text x={0} y={y(v) + 6}>{`${v}${b.satuan}`}</text>
        </g>
      ))}
      <polyline points={b.titik.map((t, i) => `${x(i)},${y(t.nilai)}`).join(" ")} fill="none" stroke="var(--lp-isi)" strokeWidth={4} strokeLinejoin="round" />
      {b.titik.map((t, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(t.nilai)} r={7} fill={t.masalah ? "var(--lp-merah)" : "var(--lp-isi)"} />
          <text className="lp-v" x={x(i)} y={y(t.nilai) - 14} textAnchor="middle">{t.teks}</text>
          <text x={x(i)} y={bawah + 32} textAnchor="middle">{t.label.length > 22 ? `${t.label.slice(0, 21)}…` : t.label}</text>
          {t.sub ? <text x={x(i)} y={bawah + 54} textAnchor="middle">{t.sub}</text> : null}
        </g>
      ))}
    </svg>
  );
}

function Teks({ b }: { b: BlokTeks }) {
  if (b.kartu && b.poin?.length) {
    return <ol className="lp-kartu">{b.poin.map((p, i) => <li key={i}><span>{p}</span></li>)}</ol>;
  }
  return (
    <div className="lp-sisi">
      {b.paragraf.map((p, i) => <p key={i} className="lp-p">{p}</p>)}
      {b.poin?.length ? <ul className="lp-poin">{b.poin.map((p, i) => <li key={i}>{p}</li>)}</ul> : null}
      {b.kecil?.map((p, i) => <p key={i} className="lp-kecil">{p}</p>)}
    </div>
  );
}

/** Peta panas: makin pekat makin ramai; angka hanya di sel yang cukup ramai. */
function Panas({ b }: { b: BlokPanas }) {
  const rapat = b.baris.length > 5;
  const tinggi = rapat ? 38 : 52;
  return (
    <div className="lp-sisi" style={{ gap: 14 }}>
      <div className="lp-panas" style={{ gridTemplateColumns: `200px repeat(${b.kolom.length}, minmax(0,1fr)) 150px`, gridAutoRows: "auto" }}>
        <span />
        {b.kolom.map((k) => <span key={k} className="lp-jk">{k}</span>)}
        <span className="lp-jk lp-kanan">{b.labelTotal}</span>
        {b.baris.map((r, ri) => (
          <Fragment key={ri}>
            <span className="lp-nm"><span>{r.label}</span>{r.sub ? <small>{r.sub}</small> : null}</span>
            {r.nilai.map((v, i) => {
              const a = b.maks > 0 ? v / b.maks : 0;
              return (
                <span
                  key={i}
                  className="lp-c"
                  style={{
                    height: tinggi,
                    background: v ? `color-mix(in srgb,var(--lp-isi) ${Math.round(18 + a * 82)}%,var(--lp-kartu))` : "var(--lp-kartu)",
                    color: a > 0.5 ? "var(--lp-bg)" : "var(--lp-teks)",
                    fontSize: b.kolom.length > 12 ? 15 : 17,
                  }}
                >
                  {v >= b.ambang ? v : ""}
                </span>
              );
            })}
            <span className="lp-tot">{r.total}{r.ket ? <small>{r.ket}</small> : null}</span>
          </Fragment>
        ))}
      </div>
      <p className="lp-kecil" style={{ fontSize: 15 }}>{b.keterangan}</p>
    </div>
  );
}

function Chip({ b }: { b: BlokChip }) {
  return <div className="lp-chip">{b.isi.map((x, i) => <span key={i}>{x.label}<b>{x.nilai}</b></span>)}</div>;
}

/** `lebar`: lebar kolom tempat blok digambar (px kanvas). */
function SatuBlok({ b, lebar = LEBAR_PENUH }: { b: Blok; lebar?: number }) {
  if (b.jenis === "angka") return <Angka b={b} lebar={lebar} />;
  if (b.jenis === "tabel") return <Tabel b={b} lebarBlok={lebar} />;
  if (b.jenis === "batang") return b.arah === "tegak" ? <BatangTegak b={b} lebar={lebar} /> : <BatangDatar b={b} />;
  if (b.jenis === "garis") return <Garis b={b} lebar={lebar} />;
  if (b.jenis === "panas") return <Panas b={b} />;
  if (b.jenis === "chip") return <Chip b={b} />;
  return <Teks b={b} />;
}

/** Variabel CSS satu slide: permukaan, huruf judul, dan warna tema mentah untuk stiker dan foto. */
export function gayaSlide(tema: TemaDeck, latar: Latar): CSSProperties {
  const p = warnaPermukaan(tema, latar);
  const v: Record<string, string> = {
    "--lp-bg": p.bg,
    "--lp-teks": p.teks,
    "--lp-teks2": p.teks2,
    "--lp-isi": p.isi,
    "--lp-merah": p.merah,
    "--lp-angka": p.angka,
    "--lp-judul": `${tema.judul},var(--font-sans),Inter,system-ui,sans-serif`,
    "--lp-aksen": tema.aksen,
    "--lp-aksen-teks": tema.aksenTeks,
    "--lp-latar": tema.latar,
    "--lp-latar2": tema.latar2,
    "--lp-latar-teks": tema.latarTeks,
  };
  return v as CSSProperties;
}

function Foto({ src }: { src: string | null }) {
  return (
    <div className="lp-foto" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- kanvas cetak dan pratinjau, ukurannya tetap */}
      {src ? <img src={src} alt="" /> : null}
    </div>
  );
}

/**
 * Satu slide. `nomor`/`total` untuk kaki kanan. `petunjuk`: teks pengganti
 * bila slide belum punya isi (mis. Usulan tanpa baris), hanya di admin.
 */
export function SlideLaporan({ slide, deck, nomor, total, catatanLabel, petunjuk }: { slide: Slide; deck: Pick<Deck, "tema" | "warna" | "bahasa">; nomor: number; total: number; catatanLabel?: string; petunjuk?: string }) {
  const tema = temaDeck(deck);
  if (slide.jenis === "sampul") {
    return (
      <div className="lp-stage lp-sampul lp-gelap" style={gayaSlide(tema, "gelap")}>
        <Foto src={tema.foto} />
        <div className="lp-lead">
          {/* eslint-disable-next-line @next/next/no-img-element -- kanvas cetak dan pratinjau, ukurannya tetap */}
          {slide.logo ? <img className="lp-logo" src={slide.logo} alt="" /> : null}
          {slide.stiker ? <span className="lp-stiker">{slide.stiker}</span> : null}
          <h2 className="lp-h">{slide.judul}</h2>
          <div className="lp-meta">{slide.baris.map((x) => <span key={x}>{x}</span>)}</div>
        </div>
        <div className="lp-foot"><span>{slide.kaki}</span><span>{nomor} / {total}</span></div>
      </div>
    );
  }
  const latar: Latar = slide.tata === "pembatas" ? "gelap" : slide.latar ?? "kertas";
  const stiker = slide.stiker ? <span className={cxs("lp-stiker", slide.stiker.merah && "lp-merah")}>{slide.stiker.teks}</span> : null;
  const kaki = <div className="lp-foot"><span>{slide.kaki}</span><span>{nomor} / {total}</span></div>;
  if (slide.tata === "pembatas") {
    return (
      <div className="lp-stage lp-pembatas lp-gelap" style={gayaSlide(tema, "gelap")}>
        <Foto src={tema.foto} />
        <div className="lp-lead">
          {stiker}
          <h2 className="lp-h">{slide.judul}</h2>
          {slide.blok.map((b, i) => <SatuBlok key={i} b={b} />)}
          {slide.catatan ? <p className="lp-catatan"><b>{catatanLabel ?? (deck.bahasa === "en" ? "Committee note." : "Catatan panitia.")}</b> {slide.catatan}</p> : null}
        </div>
        {kaki}
      </div>
    );
  }
  const [kiri, ...kanan] = slide.blok;
  const label = catatanLabel ?? (deck.bahasa === "en" ? "Committee note." : "Catatan panitia.");
  return (
    <div className={cxs("lp-stage", `lp-${latar}`)} style={gayaSlide(tema, latar)}>
      <div className="lp-kepala">
        <h2 className="lp-h" style={{ fontSize: ukuranJudul(slide.judul) }}>{slide.judul}</h2>
        {stiker}
      </div>
      <div className="lp-body">
        {slide.blok.length === 0 && petunjuk ? <div className="lp-petunjuk">{petunjuk}</div> : null}
        {slide.tata === "dua" && kiri ? (
          <div className="lp-dua">
            <SatuBlok b={kiri} lebar={LEBAR_KIRI} />
            <div className="lp-sisi">{kanan.map((b, i) => <SatuBlok key={i} b={b} lebar={LEBAR_KANAN} />)}</div>
          </div>
        ) : (
          slide.blok.map((b, i) => <SatuBlok key={i} b={b} />)
        )}
      </div>
      <div className="lp-bawah">
        {slide.catatan ? <p className="lp-catatan" style={{ fontSize: ukuranCatatan(slide.catatan) }}><b>{label}</b> {slide.catatan}</p> : null}
        {kaki}
      </div>
    </div>
  );
}
