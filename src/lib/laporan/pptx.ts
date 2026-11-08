/**
 * Ekspor PPTX dari deck yang sama dengan pratinjau. Ukuran 16:9 (13,33 × 7,5
 * inci), dihitung dari kanvas 1280×720 px supaya posisi sama dengan HTML.
 * Grafik memakai chart asli PowerPoint, jadi panitia masih bisa mengubahnya.
 */
import PptxGenJS from "pptxgenjs";
import type { Blok, BlokAngka, BlokBatang, BlokGaris, BlokTabel, BlokTeks, Deck, SlideIsi, SlideSampul } from "./jenis";
import { BARIS_SEL, lebarKolom, muatSatuBaris, potong, ukuranAngka, ukuranCatatan, ukuranJudul } from "./ukuran";
import { WARNA_TETAP, warnaDeck } from "./warna";

const IN = (px: number) => px / 96;
const PT = (px: number) => Math.round(px * 0.75 * 10) / 10;
const h = (warna: string) => warna.replace("#", "");
const FONT = "Inter";
const KIRI = 64;
const LEBAR = 1280 - 128;
const ATAS_ISI = 196;
const BAWAH_ISI = 640;

type Kotak = { x: number; y: number; w: number; h: number };
type Warna = { aksen: string; aksen2: string };

function kaki(s: PptxGenJS.Slide, teks: string, nomor: string, putih: boolean) {
  const warna = putih ? "FFFFFF" : h(WARNA_TETAP.tinta2);
  s.addShape("line", { x: IN(KIRI), y: IN(668), w: IN(LEBAR), h: 0, line: { color: putih ? "FFFFFF" : h(WARNA_TETAP.garis), width: 0.75, transparency: putih ? 60 : 0 } });
  s.addText(teks, { x: IN(KIRI), y: IN(676), w: IN(LEBAR - 120), h: IN(28), fontFace: FONT, fontSize: PT(15), color: warna, margin: 0, valign: "top" });
  s.addText(nomor, { x: IN(KIRI + LEBAR - 120), y: IN(676), w: IN(120), h: IN(28), fontFace: FONT, fontSize: PT(15), color: warna, align: "right", margin: 0, valign: "top" });
}

function sampul(p: PptxGenJS, sl: SlideSampul, w: Warna, nomor: string) {
  const s = p.addSlide();
  s.background = { color: h(w.aksen) };
  s.addText(sl.judul, { x: IN(KIRI), y: IN(200), w: IN(960), h: IN(200), fontFace: FONT, fontSize: PT(68), bold: true, color: "FFFFFF", margin: 0, valign: "bottom" });
  s.addText(sl.baris.map((t, i) => ({ text: t, options: { breakLine: i < sl.baris.length - 1 } })), { x: IN(KIRI), y: IN(428), w: IN(960), h: IN(90), fontFace: FONT, fontSize: PT(24), color: "FFFFFF", margin: 0, valign: "top", paraSpaceAfter: 4 });
  kaki(s, sl.kaki, nomor, true);
}

function angka(s: PptxGenJS.Slide, b: BlokAngka, k: Kotak) {
  const n = Math.max(b.isi.length, 1);
  const lebar = k.w / n;
  s.addShape("line", { x: IN(k.x), y: IN(k.y), w: IN(k.w), h: 0, line: { color: h(WARNA_TETAP.garis), width: 0.75 } });
  s.addShape("line", { x: IN(k.x), y: IN(k.y + k.h), w: IN(k.w), h: 0, line: { color: h(WARNA_TETAP.garis), width: 0.75 } });
  const besar = Math.min(60, ukuranAngka(b, k.w));
  b.isi.forEach((x, i) => {
    const kiri = k.x + i * lebar + (i ? 24 : 0);
    const w = lebar - (i ? 48 : 24);
    // Label satu baris: kecilkan bila tidak muat, supaya tidak turun ke angka.
    const lbl = x.label.length > muatSatuBaris(w + 20, 18) ? 15 : 18;
    if (i) s.addShape("line", { x: IN(k.x + i * lebar), y: IN(k.y), w: 0, h: IN(k.h), line: { color: h(WARNA_TETAP.garis), width: 0.75 } });
    s.addText(x.label, { x: IN(kiri), y: IN(k.y + 20), w: IN(w), h: IN(26), fontFace: FONT, fontSize: PT(lbl), color: h(WARNA_TETAP.tinta), margin: 0, fit: "shrink" });
    s.addText(x.nilai, { x: IN(kiri), y: IN(k.y + 52), w: IN(w), h: IN(68), fontFace: FONT, fontSize: PT(besar), wrap: false, bold: true, color: h(x.masalah ? WARNA_TETAP.masalah : WARNA_TETAP.tinta), margin: 0 });
    if (x.ket) s.addText(x.ket, { x: IN(kiri), y: IN(k.y + 124), w: IN(w), h: IN(k.h - 130), fontFace: FONT, fontSize: PT(16), color: h(WARNA_TETAP.tinta2), margin: 0, valign: "top" });
  });
}

function tabel(s: PptxGenJS.Slide, b: BlokTabel, k: Kotak, w: Warna) {
  const setelah = b.batangSetelah ?? -1;
  const adaBatang = setelah >= 0 && b.baris.some((r) => typeof r.batang === "number");
  const lebar = lebarKolom(b, k.w);
  // Lebar tiap kolom data (tanpa kolom batang), untuk memotong teks supaya baris tidak tumbuh.
  const lebarData = lebar.filter((_, i) => !(adaBatang && i === setelah + 1));
  const font = b.bungkus ? 15 : b.baris.length > 7 ? 16 : 18;
  const muat = (t: string, i: number) => (b.kolom[i]?.kanan ? t : potong(t, muatSatuBaris(lebarData[i], font) * (b.bungkus ? BARIS_SEL : 1)));
  const perlu = b.bungkus ? BARIS_SEL * font * 1.25 + 12 : 42;
  const tinggi = Math.min(perlu, (k.h - 40) / Math.max(b.baris.length, 1));
  const batas = { type: "solid" as const, pt: 0.75, color: h(WARNA_TETAP.garis) };
  const tanpa: PptxGenJS.BorderProps = { type: "none" };
  const sel = (teks: string, kanan: boolean | undefined, opsi: Partial<PptxGenJS.TableCellProps> = {}): PptxGenJS.TableCell => ({
    text: teks,
    options: { align: kanan ? "right" : "left", border: [tanpa, tanpa, batas, tanpa], ...opsi },
  });
  const kolom = b.kolom.flatMap((c, i) => {
    const kepala = sel(c.label, c.kanan, { color: h(WARNA_TETAP.tinta2), fontSize: PT(15) });
    return adaBatang && i === setelah ? [kepala, sel("", false)] : [kepala];
  });
  const baris = b.baris.map((r) =>
    r.sel.flatMap((t, i) => {
      const isi = sel(muat(t, i), b.kolom[i]?.kanan, { bold: r.total === true, color: h(r.sorot === "masalah" && i === 0 ? WARNA_TETAP.masalah : WARNA_TETAP.tinta), valign: b.bungkus ? "top" : "middle" });
      return adaBatang && i === setelah ? [isi, sel("", false)] : [isi];
    }),
  );
  const tinggiBaris = [40, ...b.baris.map(() => tinggi)].map(IN);
  s.addTable([kolom, ...baris], { x: IN(k.x), y: IN(k.y), w: IN(k.w), colW: lebar.map(IN), rowH: tinggiBaris, fontFace: FONT, fontSize: PT(font), color: h(WARNA_TETAP.tinta), margin: [0.04, 0.06, 0.04, 0.06], valign: "middle" });
  if (!adaBatang) return;
  const lebarBatang = lebar[setelah + 1] - 16;
  const xBatang = k.x + lebar.slice(0, setelah + 1).reduce((a, x) => a + x, 0) + 8;
  b.baris.forEach((r, i) => {
    if (typeof r.batang !== "number" || r.total) return;
    const y = k.y + 40 + tinggi * i + tinggi / 2 - 6;
    s.addShape("rect", { x: IN(xBatang), y: IN(y), w: IN(lebarBatang), h: IN(12), fill: { color: h(WARNA_TETAP.garis) }, line: { type: "none" } });
    const isi = (Math.max(0, Math.min(100, r.batang)) / 100) * lebarBatang;
    if (isi > 0) s.addShape("rect", { x: IN(xBatang), y: IN(y), w: IN(isi), h: IN(12), fill: { color: h(r.sorot === "masalah" ? WARNA_TETAP.masalah : w.aksen) }, line: { type: "none" } });
  });
}

/** Format label angka dari teks yang tampil di HTML: "45%", "+43", atau angka biasa. */
const formatAngka = (teks: string[]) => (teks.some((t) => t.endsWith("%")) ? '0"%"' : teks.some((t) => /^[+-]/.test(t)) ? "+0;-0;0" : "#,##0");

const warnaSorot = (sorot: string | null | undefined, w: Warna, dasar: string) =>
  h(sorot === "masalah" ? WARNA_TETAP.masalah : sorot === "kedua" ? w.aksen2 : sorot === "utama" ? w.aksen : dasar);

const sumbu = {
  fontFace: FONT,
  catAxisLabelFontFace: FONT,
  valAxisLabelFontFace: FONT,
  catAxisLabelColor: h(WARNA_TETAP.tinta2),
  valAxisLabelColor: h(WARNA_TETAP.tinta2),
  dataLabelColor: h(WARNA_TETAP.tinta),
  dataLabelFontFace: FONT,
  catAxisLineShow: true,
  catAxisLineColor: h(WARNA_TETAP.garis),
  valGridLine: { color: h(WARNA_TETAP.garis), size: 0.75, style: "solid" as const },
  catGridLine: { style: "none" as const },
};

function batang(p: PptxGenJS, s: PptxGenJS.Slide, b: BlokBatang, k: Kotak, w: Warna) {
  const label = b.seri.map((x) => (x.sub ? `${x.label}\n${x.sub}` : x.label));
  const datar = b.arah === "datar";
  const data = [{ name: b.legenda?.[0] ?? "", labels: label, values: b.seri.map((x) => x.nilai) }];
  if (b.pasangan) data.push({ name: b.legenda?.[1] ?? "", labels: label, values: b.pasangan.map((x) => x.nilai) });
  const warna = b.pasangan ? [h(w.aksen), h(WARNA_TETAP.konteks)] : b.seri.map((x) => warnaSorot(x.sorot ?? (datar ? "utama" : null), w, WARNA_TETAP.konteks));
  // Satu seri dengan satu warna: pptxgenjs hanya mewarnai per batang bila warnanya lebih dari satu.
  if (warna.length === 1) warna.push(warna[0]);
  s.addChart(p.ChartType.bar, datar ? data.map((d) => ({ ...d, labels: [...d.labels].reverse(), values: [...d.values].reverse() })) : data, {
    x: IN(k.x),
    y: IN(k.y),
    w: IN(k.w),
    h: IN(k.h),
    barDir: datar ? "bar" : "col",
    barGapWidthPct: datar ? 60 : 50,
    chartColors: datar && !b.pasangan ? [...warna].reverse() : warna,
    showValue: true,
    dataLabelFontSize: PT(17),
    dataLabelPosition: "outEnd",
    dataLabelFormatCode: formatAngka(b.seri.map((x) => x.teks)),
    catAxisLabelFontSize: PT(15),
    // Label kategori di tepi bawah/kiri, bukan di garis nol: batang negatif tidak menutupinya.
    catAxisLabelPos: "low",
    valAxisHidden: true,
    // NPS bisa negatif: sumbu ikut turun, batang negatif merah.
    valAxisMinVal: Math.min(0, ...b.seri.map((x) => x.nilai * 1.25)),
    valAxisMaxVal: b.maks && b.maks > 0 ? b.maks * (datar ? 1.15 : 1.2) : undefined,
    invertedColors: [h(WARNA_TETAP.masalah)],
    showLegend: !!b.pasangan,
    legendPos: "t",
    legendFontFace: FONT,
    legendFontSize: PT(15),
    legendColor: h(WARNA_TETAP.tinta2),
    ...sumbu,
    valGridLine: { style: "none" },
  });
  if (b.penanda && !datar) {
    const x = k.x + 40 + ((k.w - 60) * (b.penanda.setelah + 1)) / b.seri.length;
    s.addShape("line", { x: IN(x), y: IN(k.y + 24), w: 0, h: IN(k.h - 70), line: { color: h(WARNA_TETAP.masalah), width: 1.5 } });
    s.addText(b.penanda.label, { x: IN(x + 8), y: IN(k.y + 8), w: IN(260), h: IN(24), fontFace: FONT, fontSize: PT(16), color: h(WARNA_TETAP.masalah), margin: 0 });
  }
}

function garis(p: PptxGenJS, s: PptxGenJS.Slide, b: BlokGaris, k: Kotak, w: Warna) {
  s.addChart(p.ChartType.line, [{ name: "", labels: b.titik.map((t) => (t.sub ? `${t.label}\n${t.sub}` : t.label)), values: b.titik.map((t) => t.nilai) }], {
    x: IN(k.x),
    y: IN(k.y),
    w: IN(k.w),
    h: IN(k.h),
    chartColors: [h(w.aksen)],
    lineSize: 2.25,
    lineDataSymbol: "circle",
    lineDataSymbolSize: 8,
    showValue: true,
    dataLabelPosition: "t",
    dataLabelFontSize: PT(18),
    dataLabelFormatCode: b.satuan === "%" ? '0"%"' : "#,##0",
    catAxisLabelFontSize: PT(15),
    valAxisLabelFontSize: PT(14),
    valAxisMinVal: b.min,
    valAxisMaxVal: b.maks,
    valAxisLabelFormatCode: b.satuan === "%" ? '0"%"' : "#,##0",
    showLegend: false,
    ...sumbu,
  });
}

function teks(s: PptxGenJS.Slide, b: BlokTeks, k: Kotak) {
  const isi: PptxGenJS.TextProps[] = [
    ...b.paragraf.map((t) => ({ text: t, options: { fontSize: PT(22), color: h(WARNA_TETAP.tinta), breakLine: true, paraSpaceAfter: 12 } })),
    ...(b.poin ?? []).map((t) => ({ text: t, options: { fontSize: PT(21), color: h(WARNA_TETAP.tinta), bullet: { indent: 18 }, breakLine: true, paraSpaceAfter: 12 } })),
    ...(b.kecil ?? []).map((t) => ({ text: t, options: { fontSize: PT(17), color: h(WARNA_TETAP.tinta2), breakLine: true, paraSpaceAfter: 8 } })),
  ];
  if (isi.length) s.addText(isi, { x: IN(k.x), y: IN(k.y), w: IN(k.w), h: IN(k.h), fontFace: FONT, margin: 0, valign: "top" });
}

/** Tinggi yang diminta tiap blok di tata penuh; grafik mengambil sisa ruang. */
function tinggiBlok(b: Blok): number | null {
  if (b.jenis === "angka") return 172;
  if (b.jenis === "tabel") return 40 + (b.bungkus ? BARIS_SEL * 20 + 12 : 42) * b.baris.length + 4;
  if (b.jenis === "teks") return 48 * (b.paragraf.length + (b.poin?.length ?? 0)) + 30 * (b.kecil?.length ?? 0);
  if (b.jenis === "batang" && b.arah === "datar") return Math.min(320, 52 * b.seri.length + (b.pasangan ? 40 : 0));
  return null;
}

function blok(p: PptxGenJS, s: PptxGenJS.Slide, b: Blok, k: Kotak, w: Warna) {
  if (b.jenis === "angka") angka(s, b, k);
  else if (b.jenis === "tabel") tabel(s, b, k, w);
  else if (b.jenis === "batang") batang(p, s, b, k, w);
  else if (b.jenis === "garis") garis(p, s, b, k, w);
  else teks(s, b, k);
}

function isi(p: PptxGenJS, sl: SlideIsi, w: Warna, nomor: string, labelCatatan: string) {
  const s = p.addSlide();
  s.background = { color: "FFFFFF" };
  s.addText(sl.judul, { x: IN(KIRI), y: IN(48), w: IN(1080), h: IN(124), fontFace: FONT, fontSize: PT(ukuranJudul(sl.judul)), bold: true, color: h(WARNA_TETAP.tinta), margin: 0, valign: "top", fit: "shrink" });
  const bawah = sl.catatan ? BAWAH_ISI - 72 : BAWAH_ISI;
  if (sl.tata === "dua" && sl.blok.length > 1) {
    const kiriW = Math.round(((LEBAR - 56) * 1.4) / 2.4);
    blok(p, s, sl.blok[0], { x: KIRI, y: ATAS_ISI, w: kiriW, h: bawah - ATAS_ISI }, w);
    const kanan = { x: KIRI + kiriW + 56, y: ATAS_ISI, w: LEBAR - kiriW - 56, h: bawah - ATAS_ISI };
    let y = kanan.y;
    for (const b of sl.blok.slice(1)) {
      const t = Math.min(tinggiBlok(b) ?? kanan.h, kanan.y + kanan.h - y);
      blok(p, s, b, { ...kanan, y, h: t }, w);
      y += t + 20;
    }
  } else {
    const minta = sl.blok.map(tinggiBlok);
    const tetap = minta.reduce<number>((a, t) => a + (t ?? 0), 0) + 28 * Math.max(sl.blok.length - 1, 0);
    const lentur = minta.filter((t) => t === null).length;
    const sisa = Math.max(160, (bawah - ATAS_ISI - tetap) / Math.max(lentur, 1));
    let y = ATAS_ISI;
    sl.blok.forEach((b, i) => {
      const t = Math.min(minta[i] ?? sisa, Math.max(bawah - y, 60));
      blok(p, s, b, { x: KIRI, y, w: LEBAR, h: t }, w);
      y += t + 28;
    });
  }
  if (sl.catatan) {
    s.addText([{ text: `${labelCatatan} `, options: { bold: true } }, { text: sl.catatan }], { x: IN(KIRI), y: IN(BAWAH_ISI - 56), w: IN(LEBAR), h: IN(56), fontFace: FONT, fontSize: PT(ukuranCatatan(sl.catatan)), fit: "shrink", color: h(WARNA_TETAP.tinta), margin: 0, valign: "bottom" });
  }
  kaki(s, sl.kaki, nomor, false);
}

export async function deckKePptx(deck: Deck): Promise<Buffer> {
  const p = new PptxGenJS();
  p.layout = "LAYOUT_WIDE";
  p.title = deck.nama;
  p.company = "Tally";
  const w = warnaDeck(deck.warna);
  const labelCatatan = deck.bahasa === "en" ? "Committee note." : "Catatan panitia.";
  const total = deck.slide.length;
  deck.slide.forEach((sl, i) => {
    const nomor = `${i + 1} / ${total}`;
    if (sl.jenis === "sampul") sampul(p, sl, w, nomor);
    else isi(p, sl, w, nomor, labelCatatan);
  });
  return (await p.write({ outputType: "nodebuffer" })) as Buffer;
}
