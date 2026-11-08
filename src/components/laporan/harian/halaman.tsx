/**
 * Satu halaman highlight harian, 1080×1920. Ditulis hanya dengan flexbox dan
 * gaya inline, supaya komponen yang sama dipakai pratinjau admin (React di
 * peramban) dan gambar PNG (next/og di server). Jangan pakai grid, kelas CSS,
 * atau hook di sini: next/og tidak mengenalnya.
 */
import type { CSSProperties, ReactNode } from "react";
import type { HalamanHarian, HariHighlight } from "@/lib/laporan/harian/jenis";
import { warnaHalaman, type WarnaHalaman } from "@/lib/laporan/harian/warna";

export const LEBAR = 1080;
export const TINGGI = 1920;
const TEPI = 104;

type Huruf = { judul: string; isi: string };
const kolom = (gaya: CSSProperties = {}): CSSProperties => ({ display: "flex", flexDirection: "column", ...gaya });

function Kepala({ hari, nomor, total, w, di }: { hari: HariHighlight; nomor: number; total: number; w: WarnaHalaman; di?: CSSProperties }) {
  return (
    <div style={{ position: "absolute", top: 72, left: TEPI, right: TEPI, display: "flex", justifyContent: "space-between", fontSize: 30, fontWeight: 800, letterSpacing: 1, color: w.teks, ...di }}>
      <span style={{ textTransform: "uppercase", maxWidth: 700, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{hari.nama}</span>
      <span style={{ fontWeight: 500, opacity: 0.8 }}>{`${nomor}/${total}`}</span>
    </div>
  );
}

const judul = (h: Huruf, w: WarnaHalaman, ukuran = 104): CSSProperties => ({ fontFamily: h.judul, fontSize: ukuran, lineHeight: 1.04, fontWeight: 800, letterSpacing: -3, color: w.teks, margin: 0 });
const isi = (h: Huruf, w: WarnaHalaman): CSSProperties => ({ fontFamily: h.isi, fontSize: 44, lineHeight: 1.32, fontWeight: 500, color: w.teks2, margin: 0 });

function Foto({ src, tinggi }: { src: string; tinggi: number | "penuh" }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={LEBAR} height={tinggi === "penuh" ? TINGGI : tinggi} style={{ width: LEBAR, height: tinggi === "penuh" ? TINGGI : tinggi, objectFit: "cover", flexShrink: 0, ...(tinggi === "penuh" ? { position: "absolute", top: 0, left: 0 } : {}) }} />;
}

function Orang({ isi: penuh, w }: { isi: boolean; w: WarnaHalaman }) {
  return (
    <svg width="68" height="110" viewBox="0 0 40 64" aria-hidden>
      <circle cx="20" cy="12" r="10" fill={penuh ? w.teks : "none"} stroke={w.teks} strokeWidth="2.5" opacity={penuh ? 1 : 0.55} />
      <path d="M3 63V38a17 17 0 0 1 34 0v25z" fill={penuh ? w.teks : "none"} stroke={w.teks} strokeWidth="2.5" opacity={penuh ? 1 : 0.55} />
    </svg>
  );
}

function Isi({ p, h, w }: { p: HalamanHarian; h: Huruf; w: WarnaHalaman }): ReactNode {
  switch (p.kunci) {
    case "sampul":
      return (
        <div style={kolom({ marginTop: "auto", padding: `0 ${TEPI}px ${TEPI}px`, gap: 28 })}>
          <p style={{ ...isi(h, w), fontSize: 38, color: w.teks }}>{p.kecil}</p>
          <p style={{ ...judul(h, w, 112) }}>{p.judul}</p>
        </div>
      );
    case "hadir":
      return (
        <div style={kolom({ margin: "auto 0", padding: `0 ${TEPI}px`, gap: 72 })}>
          <p style={judul(h, w)}>{p.judul}</p>
          <div style={{ display: "flex", justifyContent: "space-between" }}>{Array.from({ length: 10 }, (_, i) => <Orang key={i} isi={i < p.isi} w={w} />)}</div>
          <p style={isi(h, w)}>{p.teks}</p>
        </div>
      );
    case "jam": {
      const maks = Math.max(1, ...p.batang.map((b) => b.nilai));
      return (
        <div style={kolom({ flex: 1, padding: `${p.foto ? 80 : 260}px ${TEPI}px ${TEPI}px`, gap: 40 })}>
          <p style={judul(h, w)}>{p.judul}</p>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 20, height: 520, marginTop: 40 }}>
            {p.batang.map((b) => (
              <div key={b.label} style={kolom({ flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 14 })}>
                <span style={{ fontFamily: h.isi, fontSize: 36, fontWeight: 800, color: w.teks }}>{b.nilai > 0 ? String(b.nilai) : ""}</span>
                <div style={{ width: "100%", height: Math.max(4, Math.round((b.nilai / maks) * 400)), borderRadius: 12, backgroundColor: b.puncak ? w.isi : w.redup }} />
                <span style={{ fontFamily: h.isi, fontSize: 30, color: w.teks2 }}>{b.label}</span>
              </div>
            ))}
          </div>
          <p style={{ ...isi(h, w), marginTop: 24 }}>{p.teks}</p>
        </div>
      );
    }
    case "menit":
      return (
        <div style={kolom({ margin: "auto 0", padding: `0 ${TEPI}px`, gap: 56 })}>
          <p style={{ ...judul(h, w, 230), color: w.angka, letterSpacing: -8, lineHeight: 0.9, whiteSpace: "nowrap" }}>{p.besar}</p>
          <p style={judul(h, w, 80)}>{p.judul}</p>
          <p style={isi(h, w)}>{p.teks}</p>
        </div>
      );
    case "agenda":
      return (
        <div style={kolom({ margin: "auto 0", padding: `0 ${TEPI}px`, gap: 80 })}>
          <p style={judul(h, w)}>{p.judul}</p>
          <div style={kolom({ gap: 56 })}>
            {p.baris.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 28 }}>
                <span style={{ fontFamily: h.isi, fontSize: 34, color: w.teks2, width: 120, flexShrink: 0 }}>{r.jam}</span>
                <div style={kolom({ flex: 1, gap: 16 })}>
                  <span style={{ fontFamily: h.isi, fontSize: 42, fontWeight: 700, color: w.teks, lineHeight: 1.1 }}>{r.nama}</span>
                  {r.persen !== null ? (
                    <div style={{ display: "flex", height: 22, borderRadius: 11, backgroundColor: w.redup }}>
                      <div style={{ width: `${Math.min(100, r.persen)}%`, height: 22, borderRadius: 11, backgroundColor: w.isi }} />
                    </div>
                  ) : null}
                </div>
                <span style={{ fontFamily: h.judul, fontSize: 64, fontWeight: 800, color: w.teks, width: 170, textAlign: "right", flexShrink: 0 }}>{r.teks}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case "rekap":
      return (
        <div style={kolom({ margin: "auto 0", padding: `0 ${TEPI}px`, gap: 72 })}>
          <p style={judul(h, w)}>{p.judul}</p>
          <div style={{ display: "flex", gap: 20 }}>
            {p.hari.map((d) => (
              <div key={d.label} style={kolom({ flex: 1, gap: 8, padding: 28, borderRadius: 24, backgroundColor: w.redup })}>
                <span style={{ fontFamily: h.judul, fontSize: 76, fontWeight: 800, color: w.angka }}>{`${d.persen}%`}</span>
                <span style={{ fontFamily: h.isi, fontSize: 30, color: w.teks }}>{d.label}</span>
              </div>
            ))}
          </div>
          <p style={isi(h, w)}>{p.teks}</p>
        </div>
      );
    case "penutup":
      return (
        <div style={kolom({ flex: 1, padding: `${p.foto ? 88 : 0}px ${TEPI}px ${TEPI}px` })}>
          <div style={kolom({ gap: 48, margin: p.foto ? 0 : "auto 0" })}>
            <p style={judul(h, w)}>{p.judul}</p>
            {p.teks ? <p style={isi(h, w)}>{p.teks}</p> : null}
          </div>
          <p style={{ ...isi(h, w), fontSize: 34, marginTop: "auto" }}>{p.ttd}</p>
        </div>
      );
  }
}

export function HalamanHarianView({ hari, p, nomor, total, huruf }: { hari: HariHighlight; p: HalamanHarian; nomor: number; total: number; huruf?: Huruf }) {
  const h = huruf ?? { judul: hari.huruf.judul, isi: hari.huruf.isi };
  // Sampul tanpa foto memakai latar gelap merek (tulisan putih tidak terbaca di merek terang).
  const w = warnaHalaman(hari.tema, p.permukaan === "foto" && !p.foto ? "gelap" : p.permukaan);
  const penuh = p.kunci === "sampul" && p.foto;
  const atas = !penuh && p.foto && (p.kunci === "jam" || p.kunci === "penutup") ? p.foto : null;
  return (
    <div style={{ position: "relative", width: LEBAR, height: TINGGI, display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: w.bg, fontFamily: h.isi }}>
      {penuh ? <Foto src={p.foto!} tinggi="penuh" /> : null}
      {penuh ? <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1150, backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.86))" }} /> : null}
      {atas ? <Foto src={atas} tinggi={p.kunci === "jam" ? 720 : 860} /> : null}
      {penuh || atas ? <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 260, backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0))" }} /> : null}
      <Isi p={p} h={h} w={w} />
      <Kepala hari={hari} nomor={nomor} total={total} w={atas ? { ...w, teks: "#FFFFFF" } : w} />
    </div>
  );
}
