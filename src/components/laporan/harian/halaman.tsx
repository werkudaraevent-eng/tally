/**
 * Satu halaman highlight harian, 1080×1920. Ditulis hanya dengan flexbox dan
 * gaya inline, supaya komponen yang sama dipakai pratinjau admin (React di
 * peramban) dan gambar PNG (next/og di server). Jangan pakai grid, kelas CSS,
 * atau hook di sini: next/og tidak mengenalnya.
 *
 * Gerak (Mode cerita di tab Report klien) hanya lewat atribut `data-gerak`
 * yang dianimasikan CSS pemutar (cerita.tsx). next/og mengabaikan atribut
 * itu, jadi PNG tidak berubah.
 */
import type { CSSProperties, ReactNode } from "react";
import type { HalamanHarian, HariHighlight } from "@/lib/laporan/harian/jenis";
import { warnaHalaman, type WarnaHalaman } from "@/lib/laporan/harian/warna";
import { isi, judul, kolom, LEBAR, TEPI, TINGGI, type Huruf } from "./gaya-halaman";
import { HalAgenda, HalKelompok, HalPenutup, HalRekap, HalSepi } from "./halaman-temuan";

export { LEBAR, TINGGI };

function Kepala({ hari, nomor, total, w, di }: { hari: HariHighlight; nomor: number; total: number; w: WarnaHalaman; di?: CSSProperties }) {
  return (
    <div style={{ position: "absolute", top: 72, left: TEPI, right: TEPI, display: "flex", justifyContent: "space-between", fontSize: 30, fontWeight: 800, letterSpacing: 1, color: w.teks, ...di }}>
      <span style={{ textTransform: "uppercase", maxWidth: 700, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{hari.nama}</span>
      <span style={{ fontWeight: 500, opacity: 0.8 }}>{`${nomor}/${total}`}</span>
    </div>
  );
}


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
          <p data-gerak="angka" style={{ ...judul(h, w, 112) }}>{p.judul}</p>
          {p.teks ? <p style={{ ...isi(h, w), fontSize: 40, color: w.teks2 }}>{p.teks}</p> : null}
        </div>
      );
    case "hadir":
      return (
        <div style={kolom({ margin: "auto 0", padding: `0 ${TEPI}px`, gap: 72 })}>
          <p style={judul(h, w)}>{p.judul}</p>
          <div style={{ display: "flex", justifyContent: "space-between" }}>{Array.from({ length: 10 }, (_, i) => <div key={i} data-gerak="orang" style={{ display: "flex" }}><Orang isi={i < p.isi} w={w} /></div>)}</div>
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
                <span data-gerak="nilai" style={{ fontFamily: h.isi, fontSize: 36, fontWeight: 800, color: w.teks }}>{b.nilai > 0 ? String(b.nilai) : ""}</span>
                <div data-gerak="batang" style={{ width: "100%", height: Math.max(4, Math.round((b.nilai / maks) * 400)), borderRadius: 12, backgroundColor: b.puncak ? w.isi : w.redup }} />
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
          <p data-gerak="angka" style={{ ...judul(h, w, 230), color: w.angka, letterSpacing: -8, lineHeight: 0.9, whiteSpace: "nowrap" }}>{p.besar}</p>
          <p style={judul(h, w, 80)}>{p.judul}</p>
          <p style={isi(h, w)}>{p.teks}</p>
        </div>
      );
    case "agenda":
      return <HalAgenda p={p} h={h} w={w} />;
    case "sepi":
      return <HalSepi p={p} h={h} w={w} />;
    case "rekap":
      return <HalRekap p={p} h={h} w={w} />;
    case "kelompok":
      return <HalKelompok p={p} h={h} w={w} />;
    case "puas": {
      const warna = [w.isi, w.redup, w.teks2];
      return (
        <div style={kolom({ margin: "auto 0", padding: `0 ${TEPI}px`, gap: 56 })}>
          <p data-gerak="angka" style={{ ...judul(h, w, 260), color: w.angka, letterSpacing: -10, lineHeight: 0.9 }}>{p.besar}</p>
          <p style={judul(h, w, 88)}>{p.judul}</p>
          <div style={kolom({ gap: 28, marginTop: 16 })}>
            <div style={{ display: "flex", height: 56, borderRadius: 28, overflow: "hidden", backgroundColor: w.redup }}>
              {p.segmen.map((g, i) => <div key={i} data-gerak="isi" style={{ width: `${g.persen}%`, height: 56, backgroundColor: warna[i] }} />)}
            </div>
            {p.segmen.map((g, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ width: 28, height: 28, borderRadius: 14, flexShrink: 0, backgroundColor: warna[i] }} />
                <div style={kolom({ flex: 1 })}>
                  <span style={{ fontFamily: h.isi, fontSize: 36, color: w.teks }}>{g.label}</span>
                  <span style={{ fontFamily: h.isi, fontSize: 30, color: w.teks2 }}>{g.ket}</span>
                </div>
                <span style={{ fontFamily: h.judul, fontSize: 52, fontWeight: 800, color: w.teks }}>{`${g.persen}%`}</span>
              </div>
            ))}
          </div>
          <p style={isi(h, w)}>{p.teks}</p>
        </div>
      );
    }
    case "layar":
      return (
        <div style={kolom({ margin: "auto 0", padding: `0 ${TEPI}px`, gap: 64 })}>
          <p style={judul(h, w)}>{p.judul}</p>
          <div style={kolom({})}>
            {p.baris.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 36, padding: "36px 0", borderTop: `3px solid ${w.redup}` }}>
                <span data-gerak="angka" style={{ fontFamily: h.judul, fontSize: 96, fontWeight: 800, letterSpacing: -2, color: w.isi, width: 380, flexShrink: 0 }}>{r.besar}</span>
                <span style={{ fontFamily: h.isi, fontSize: 40, lineHeight: 1.25, color: w.teks }}>{r.teks}</span>
              </div>
            ))}
          </div>
          {p.catatan ? <p style={{ ...isi(h, w), fontSize: 32 }}>{p.catatan}</p> : null}
        </div>
      );
    case "penutup":
      return <HalPenutup p={p} h={h} w={w} />;
  }
}

export function HalamanHarianView({ hari, p, nomor, total, huruf }: { hari: HariHighlight; p: HalamanHarian; nomor: number; total: number; huruf?: Huruf }) {
  const h = huruf ?? { judul: hari.huruf.judul, isi: hari.huruf.isi };
  // Sampul tanpa foto memakai latar gelap merek (tulisan putih tidak terbaca di merek terang).
  const w = warnaHalaman(hari.tema, p.permukaan === "foto" && !p.foto ? "gelap" : p.permukaan);
  const penuh = p.kunci === "sampul" && p.foto;
  const atas = !penuh && p.foto && (p.kunci === "jam" || p.kunci === "agenda" || p.kunci === "penutup") ? p.foto : null;
  return (
    <div style={{ position: "relative", width: LEBAR, height: TINGGI, display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: w.bg, fontFamily: h.isi, lineHeight: 1.2 }}>
      {penuh ? <Foto src={p.foto!} tinggi="penuh" /> : null}
      {penuh ? <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1150, backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.86))" }} /> : null}
      {atas ? <Foto src={atas} tinggi={p.kunci === "penutup" ? 860 : 720} /> : null}
      {penuh || atas ? <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 260, backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0))" }} /> : null}
      <Isi p={p} h={h} w={w} />
      <Kepala hari={hari} nomor={nomor} total={total} w={atas ? { ...w, teks: "#FFFFFF" } : w} />
    </div>
  );
}
