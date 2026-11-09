/**
 * Halaman temuan highlight (9 Nov): semua sesi diurutkan, sesi paling sepi,
 * per hari, per kelompok, dan penutup dengan tiga temuan. Flexbox dan gaya
 * inline saja (next/og). `rendah` dan `sorot` memakai warna peringatan
 * (w.awas); garis tipis di batang = rata-rata.
 */
import type { HalamanHarian } from "@/lib/laporan/harian/jenis";
import type { WarnaHalaman } from "@/lib/laporan/harian/warna";
import { isi, judul, kolom, tengah, tingkatAgenda, TEPI, UK, type Huruf } from "./gaya-halaman";

type P<K extends HalamanHarian["kunci"]> = { p: Extract<HalamanHarian, { kunci: K }>; h: Huruf; w: WarnaHalaman };

/** Batang persen dengan garis rata-rata opsional. */
function Batang({ persen, rata, tinggi, w, awas }: { persen: number; rata: number | null | undefined; tinggi: number; w: WarnaHalaman; awas: boolean }) {
  return (
    <div style={{ display: "flex", position: "relative", height: tinggi, borderRadius: tinggi / 2, backgroundColor: w.redup }}>
      <div data-gerak="isi" style={{ width: `${Math.min(100, Math.max(0, persen))}%`, height: tinggi, borderRadius: tinggi / 2, backgroundColor: awas ? w.awas : w.isi }} />
      {rata !== null && rata !== undefined ? <div style={{ position: "absolute", left: `${Math.min(99, rata)}%`, top: -8, width: 4, height: tinggi + 16, backgroundColor: w.teks }} /> : null}
    </div>
  );
}

export function HalAgenda({ p, h, w }: P<"agenda">) {
  const tingkat = tingkatAgenda(p);
  const ukNama = UK.nama[tingkat];
  return (
    <div style={{ ...tengah(UK.tengah[tingkat]), ...(p.foto ? { justifyContent: "flex-start", paddingTop: 80 } : {}) }}>
      <p style={{ ...judul(h, w, UK.judul[tingkat]), flexShrink: 0 }}>{p.judul}</p>
      <div style={kolom({ gap: UK.antar[tingkat] })}>
        {p.baris.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <span style={{ fontFamily: h.isi, fontSize: [34, 30, 26][tingkat], color: w.teks2, width: UK.jam[tingkat], flexShrink: 0 }}>{r.jam}</span>
            <div style={kolom({ flex: 1, gap: UK.dalam[tingkat], minWidth: 0 })}>
              {tingkat === 2 ? (
                <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                  <span style={{ fontFamily: h.isi, fontSize: ukNama, fontWeight: 700, color: w.teks, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.nama}</span>
                  {r.ket ? <span style={{ fontFamily: h.isi, fontSize: 24, color: w.teks2, flexShrink: 0 }}>{r.ket}</span> : null}
                </div>
              ) : (
                <div style={kolom({ gap: 6 })}>
                  <span style={{ fontFamily: h.isi, fontSize: ukNama, fontWeight: 700, color: w.teks, lineHeight: 1.1 }}>{r.nama}</span>
                  {r.ket ? <span style={{ fontFamily: h.isi, fontSize: 30, color: w.teks2 }}>{r.ket}</span> : null}
                </div>
              )}
              {r.persen !== null ? <Batang persen={r.persen} rata={p.rata} tinggi={UK.batang[tingkat]} w={w} awas={!!r.rendah} /> : null}
            </div>
            <span style={{ fontFamily: h.judul, fontSize: [64, 54, 46][tingkat], fontWeight: 800, color: r.rendah ? w.awas : w.teks, width: UK.persen[tingkat], textAlign: "right", flexShrink: 0 }}>{r.teks}</span>
          </div>
        ))}
      </div>
      {p.teks ? <p style={{ ...isi(h, w), fontSize: 30 }}>{p.teks}</p> : null}
    </div>
  );
}

function BarisKelompok({ baris, rata, h, w }: { baris: Extract<HalamanHarian, { kunci: "kelompok" }>["baris"]; rata: number | null; h: Huruf; w: WarnaHalaman }) {
  const rapat = baris.length > 5;
  return (
    <div style={kolom({ gap: rapat ? 22 : 30 })}>
      {baris.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={kolom({ flex: 1, gap: 8, minWidth: 0 })}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
              <span style={{ fontFamily: h.isi, fontSize: rapat ? 30 : 34, fontWeight: 700, color: w.teks, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
              <span style={{ fontFamily: h.isi, fontSize: 26, color: w.teks2, flexShrink: 0 }}>{r.ket}</span>
            </div>
            <Batang persen={r.persen} rata={rata} tinggi={18} w={w} awas={r.rendah} />
          </div>
          <span style={{ fontFamily: h.judul, fontSize: rapat ? 44 : 52, fontWeight: 800, color: r.rendah ? w.awas : w.teks, width: 130, textAlign: "right", flexShrink: 0 }}>{`${r.persen}%`}</span>
        </div>
      ))}
    </div>
  );
}

export function HalSepi({ p, h, w }: P<"sepi">) {
  return (
    <div style={kolom({ flex: 1, padding: `200px ${TEPI}px ${TEPI}px`, gap: 32 })}>
      <p style={{ ...isi(h, w), fontSize: 34 }}>{p.kecil}</p>
      <p style={judul(h, w, 80)}>{p.judul}</p>
      <p data-gerak="angka" style={{ ...judul(h, w, 220), color: w.awas, letterSpacing: -8, lineHeight: 0.9 }}>{p.besar}</p>
      <p style={isi(h, w)}>{p.teks}</p>
      {p.kelompok.length ? (
        <div style={kolom({ gap: 28, marginTop: "auto" })}>
          <p style={{ ...isi(h, w), fontSize: 32, fontWeight: 700, color: w.teks }}>{p.kelompokJudul}</p>
          <BarisKelompok baris={p.kelompok} rata={null} h={h} w={w} />
        </div>
      ) : null}
    </div>
  );
}

export function HalKelompok({ p, h, w }: P<"kelompok">) {
  return (
    <div style={tengah(48)}>
      <p style={judul(h, w, 88)}>{p.judul}</p>
      <p style={{ ...isi(h, w), fontSize: 38 }}>{p.teks}</p>
      <div style={{ display: "flex", marginTop: 24 }}><div style={kolom({ flex: 1 })}><BarisKelompok baris={p.baris} rata={p.rata} h={h} w={w} /></div></div>
    </div>
  );
}

/** Rata-rata per hari sebagai batang tegak; hari paling sepi diberi warna. */
export function HalRekap({ p, h, w }: P<"rekap">) {
  const n = p.hari.length;
  const kecil = n > 7;
  return (
    <div style={tengah(48)}>
      <p style={judul(h, w, 92)}>{p.judul}</p>
      <p style={{ ...isi(h, w), fontSize: 38 }}>{p.teks}</p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: kecil ? 12 : 24, height: 760, marginTop: 24 }}>
        {p.hari.map((d, i) => {
          const sorot = p.sorot === i;
          const [atas, bawah] = d.label.split(", ");
          return (
            <div key={d.label} style={kolom({ flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 12, minWidth: 0 })}>
              <span data-gerak="nilai" style={{ fontFamily: h.judul, fontSize: kecil ? 30 : 44, fontWeight: 800, color: sorot ? w.awas : w.teks }}>{`${d.persen}%`}</span>
              <div data-gerak="batang" style={{ width: "100%", height: Math.max(6, Math.round((Math.min(100, d.persen) / 100) * 480)), borderRadius: 12, backgroundColor: sorot ? w.awas : w.redup }} />
              <span style={{ fontFamily: h.isi, fontSize: kecil ? 22 : 28, fontWeight: 700, color: w.teks, textAlign: "center" }}>{kecil ? String(i + 1) : atas}</span>
              {!kecil && bawah ? <span style={{ fontFamily: h.isi, fontSize: 24, color: w.teks2, textAlign: "center" }}>{bawah}</span> : null}
              {!kecil && d.ket ? <span style={{ fontFamily: h.isi, fontSize: 20, color: w.teks2, textAlign: "center", height: 52 }}>{d.ket}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Penutup dengan tiga temuan (Whole event) atau satu kalimat (harian, salinan lama). */
export function HalPenutup({ p, h, w }: P<"penutup">) {
  return (
    <div style={kolom({ flex: 1, padding: `${p.foto ? 88 : p.poin ? 200 : 0}px ${TEPI}px ${TEPI}px` })}>
      <div style={kolom({ gap: 48, margin: p.foto || p.poin ? 0 : "auto 0" })}>
        <p style={judul(h, w, p.poin ? 92 : 104)}>{p.judul}</p>
        {p.poin ? (
          <div style={kolom({ gap: 32 })}>
            {p.poin.map((x, i) => (
              <div key={i} style={kolom({ gap: 10, paddingTop: 32, borderTop: `3px solid ${w.redup}` })}>
                <span style={{ fontFamily: h.judul, fontSize: 52, fontWeight: 800, lineHeight: 1.1, color: w.teks }}>{x.judul}</span>
                <span style={{ fontFamily: h.isi, fontSize: 34, color: w.teks2 }}>{x.ket}</span>
              </div>
            ))}
          </div>
        ) : null}
        {p.teks ? <p style={{ ...isi(h, w), ...(p.poin ? { fontSize: 38, padding: 32, borderRadius: 24, backgroundColor: w.redup, color: w.teks } : {}) }}>{p.teks}</p> : null}
      </div>
      <p style={{ ...isi(h, w), fontSize: 34, marginTop: "auto" }}>{p.ttd}</p>
    </div>
  );
}
