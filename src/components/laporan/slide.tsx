/**
 * Menggambar satu slide Event report di kanvas 1280×720. Tanpa state, jadi
 * dipakai sama oleh pratinjau admin, tab Laporan klien dan halaman cetak PDF.
 * Lima bentuk blok saja (lib/laporan/jenis.ts).
 */
import type { CSSProperties } from "react";
import type { Blok, BlokAngka, BlokBatang, BlokGaris, BlokTabel, BlokTeks, Deck, Slide, Sorot } from "@/lib/laporan/jenis";
import { warnaDeck } from "@/lib/laporan/warna";
import { LEBAR_KANAN, LEBAR_KIRI, LEBAR_PENUH, lebarKolom, ukuranAngka, ukuranCatatan, ukuranJudul } from "@/lib/laporan/ukuran";

const cxs = (...k: Array<string | false | undefined>) => k.filter(Boolean).join(" ");

const isiBatang = (s: Sorot | undefined) => (s === "masalah" ? "#B3261E" : s === "kedua" ? "var(--lp-aksen2)" : s === "utama" ? "var(--lp-aksen)" : "#CDD2DB");

function Angka({ b, lebar }: { b: BlokAngka; lebar: number }) {
  const ukuran = ukuranAngka(b, lebar);
  return (
    <div className="lp-angka">
      {b.isi.map((x) => (
        <div key={x.label}>
          <span className="lp-lbl">{x.label}</span>
          <span className={x.masalah ? "lp-fig lp-m" : "lp-fig"} style={ukuran < 64 ? { fontSize: ukuran } : undefined}>{x.nilai}</span>
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
function FragmenKolom({ children, tampilBatang, batang, sorot }: { children: React.ReactNode; tampilBatang: boolean; batang?: number; sorot?: Sorot }) {
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

function BatangTegak({ b, lebar: W }: { b: BlokBatang; lebar: number }) {
  // Lebar viewBox sama dengan lebar kolomnya (px kanvas), jadi teks tidak membesar.
  const penuh = W >= LEBAR_PENUH;
  const H = 360;
  const bawah = 300;
  const n = b.seri.length;
  const lebar = Math.min(penuh ? 96 : 56, (W / Math.max(n, 1)) * 0.6);
  const langkah = W / Math.max(n, 1);
  const maks = b.maks ?? Math.max(...b.seri.map((s) => s.nilai), 1);
  const tinggi = (v: number) => (v / maks) * 250;
  return (
    <svg className="lp-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={b.judul ?? b.seri.map((s) => `${s.label} ${s.teks}`).join(", ")}>
      <line x1={0} x2={W} y1={bawah} y2={bawah} stroke="#E3E6EB" />
      {b.seri.map((s, i) => {
        const x = i * langkah + (langkah - lebar) / 2;
        const t = tinggi(s.nilai);
        return (
          <g key={i}>
            <rect x={x} y={bawah - t} width={lebar} height={t} fill={isiBatang(s.sorot)} />
            {s.teks ? <text className="lp-v" x={x + lebar / 2} y={bawah - t - 10} textAnchor="middle">{s.teks}</text> : null}
            <text x={x + lebar / 2} y={bawah + 26} textAnchor="middle">{s.label}</text>
            {s.sub ? <text x={x + lebar / 2} y={bawah + 48} textAnchor="middle">{s.sub}</text> : null}
          </g>
        );
      })}
      {b.penanda ? (
        <g>
          <line x1={(b.penanda.setelah + 1) * langkah} x2={(b.penanda.setelah + 1) * langkah} y1={20} y2={bawah} stroke="#B3261E" strokeWidth={2} />
          <text x={(b.penanda.setelah + 1) * langkah + 8} y={34} style={{ fill: "#B3261E" }}>{b.penanda.label}</text>
        </g>
      ) : null}
    </svg>
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
          <span><i style={{ background: "var(--lp-aksen)" }} />{b.legenda[0]}</span>
          <span><i style={{ background: "#CDD2DB" }} />{b.legenda[1]}</span>
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
              <span style={{ display: "block", height: 22, width: lebar(Math.abs(s.nilai)), background: isiBatang(s.nilai < 0 ? "masalah" : s.sorot ?? "utama") }} />
              {p ? <span style={{ display: "block", height: 12, width: lebar(p.nilai), background: "#CDD2DB" }} /> : null}
            </span>
            <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 19 }}>
              {s.teks}
              {p ? <span className="lp-kecil" style={{ display: "block", fontSize: 15 }}>{p.teks}</span> : null}
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
          <line x1={kiri} x2={W} y1={y(v)} y2={y(v)} stroke="#E3E6EB" />
          <text x={0} y={y(v) + 6}>{`${v}${b.satuan}`}</text>
        </g>
      ))}
      <polyline points={b.titik.map((t, i) => `${x(i)},${y(t.nilai)}`).join(" ")} fill="none" stroke="var(--lp-aksen)" strokeWidth={3} />
      {b.titik.map((t, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(t.nilai)} r={6} fill={t.masalah ? "#B3261E" : "var(--lp-aksen)"} />
          <text className="lp-v" x={x(i)} y={y(t.nilai) - 14} textAnchor="middle">{t.teks}</text>
          <text x={x(i)} y={bawah + 32} textAnchor="middle">{t.label.length > 22 ? `${t.label.slice(0, 21)}…` : t.label}</text>
          {t.sub ? <text x={x(i)} y={bawah + 54} textAnchor="middle">{t.sub}</text> : null}
        </g>
      ))}
    </svg>
  );
}

function Teks({ b }: { b: BlokTeks }) {
  return (
    <div className="lp-sisi">
      {b.paragraf.map((p, i) => <p key={i} className="lp-p">{p}</p>)}
      {b.poin?.length ? <ul className="lp-poin">{b.poin.map((p, i) => <li key={i}>{p}</li>)}</ul> : null}
      {b.kecil?.map((p, i) => <p key={i} className="lp-kecil">{p}</p>)}
    </div>
  );
}

/** `lebar`: lebar kolom tempat blok digambar (px kanvas), sama dengan kotak di PPTX. */
function SatuBlok({ b, lebar = LEBAR_PENUH }: { b: Blok; lebar?: number }) {
  if (b.jenis === "angka") return <Angka b={b} lebar={lebar} />;
  if (b.jenis === "tabel") return <Tabel b={b} lebarBlok={lebar} />;
  if (b.jenis === "batang") return b.arah === "tegak" ? <BatangTegak b={b} lebar={lebar} /> : <BatangDatar b={b} />;
  if (b.jenis === "garis") return <Garis b={b} lebar={lebar} />;
  return <Teks b={b} />;
}

export function gayaAksen(deck: Pick<Deck, "warna">): CSSProperties {
  const w = warnaDeck(deck.warna);
  return { ["--lp-aksen" as string]: w.aksen, ["--lp-aksen2" as string]: w.aksen2 } as CSSProperties;
}

/**
 * Satu slide. `nomor`/`total` untuk kaki kanan. `petunjuk`: teks pengganti
 * bila slide belum punya isi (mis. Usulan tanpa baris), hanya di admin.
 */
export function SlideLaporan({ slide, deck, nomor, total, catatanLabel, petunjuk }: { slide: Slide; deck: Pick<Deck, "warna" | "bahasa">; nomor: number; total: number; catatanLabel?: string; petunjuk?: string }) {
  const aksen = gayaAksen(deck);
  if (slide.jenis === "sampul") {
    return (
      <div className="lp-stage lp-sampul" style={aksen}>
        <div className="lp-lead">
          {/* eslint-disable-next-line @next/next/no-img-element -- kanvas cetak dan pratinjau, ukurannya tetap */}
          {slide.logo ? <img className="lp-logo" src={slide.logo} alt="" /> : null}
          <h2 className="lp-h">{slide.judul}</h2>
          <div className="lp-meta">{slide.baris.map((x) => <span key={x}>{x}</span>)}</div>
        </div>
        <div className="lp-foot"><span>{slide.kaki}</span><span>{nomor} / {total}</span></div>
      </div>
    );
  }
  const [kiri, ...kanan] = slide.blok;
  const label = catatanLabel ?? (deck.bahasa === "en" ? "Committee note." : "Catatan panitia.");
  return (
    <div className="lp-stage" style={aksen}>
      <h2 className="lp-h" style={{ fontSize: ukuranJudul(slide.judul) }}>{slide.judul}</h2>
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
        <div className="lp-foot"><span>{slide.kaki}</span><span>{nomor} / {total}</span></div>
      </div>
    </div>
  );
}
