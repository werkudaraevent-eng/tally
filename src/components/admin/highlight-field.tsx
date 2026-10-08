"use client";

import { HighlighterCircle, TextTSlash } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { FieldMessages } from "@/components/m3/text-field";
import { cx } from "@/lib/m3/cx";
import { pecahJudul, susunJudul, type PotonganJudul } from "@/lib/landing-tagline";

/**
 * Kolom satu paragraf dengan tombol Highlight, seperti stabilo.
 *
 * Kata yang ditandai tetap disimpan sebagai `*kata*` (aturan bacanya di
 * landing-tagline.ts, sama dengan hero gathering), tetapi admin tidak pernah
 * melihat bintangnya: di kolom ini kata itu tampil berlatar warna aksen.
 * Bintang yang diketik admin disimpan terlindung (`\*`), jadi tandanya tidak
 * bergeser setelah dimuat ulang. Sebelumnya satu-satunya jalan adalah mengetik
 * bintang sendiri, dan petunjuknya tidak terbaca (Mas Hanung harus bertanya
 * ke koder).
 *
 * contentEditable dijaga sempit: yang dibaca hanya teks dan <mark> (di
 * kedalaman mana pun). Format bawaan peramban (Ctrl+B dan sejenisnya),
 * baris baru, dan seret-lepas ditolak; tempel selalu teks polos. Urungkan dan
 * Ulangi memakai riwayat kolom ini sendiri, karena Highlight, Clear, dan
 * tempel mengubah DOM langsung dan tidak masuk riwayat peramban (QA #109).
 */

function escape(teks: string) {
  return teks.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function keHtml(nilai: string) {
  return pecahJudul(nilai)
    .map((bagian) => (bagian.sorot ? `<mark>${escape(bagian.teks)}</mark>` : escape(bagian.teks)))
    .join("");
}

function bacaPotongan(akar: HTMLElement): PotonganJudul[] {
  const mentah: PotonganJudul[] = [];
  const jalan = (node: Node, sorot: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      // NBSP dari peramban dan baris baru menjadi spasi biasa (QA #109 L1, M4).
      const teks = (node.textContent ?? "").replace(/ /g, " ").replace(/\s*\n\s*/g, " ");
      if (teks) mentah.push({ teks, sorot });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      mentah.push({ teks: " ", sorot });
      return;
    }
    node.childNodes.forEach((anak) => jalan(anak, sorot || node.tagName === "MARK"));
  };
  akar.childNodes.forEach((anak) => jalan(anak, false));

  // Spasi di tepi tanda dikeluarkan: tanda dimulai dan diakhiri huruf.
  const hasil: PotonganJudul[] = [];
  const tambah = (teks: string, sorot: boolean) => {
    if (!teks) return;
    const akhir = hasil[hasil.length - 1];
    if (akhir && akhir.sorot === sorot) akhir.teks += teks;
    else hasil.push({ teks, sorot });
  };
  for (const bagian of mentah) {
    if (!bagian.sorot) {
      tambah(bagian.teks, false);
      continue;
    }
    const [, awal, inti, akhir] = bagian.teks.match(/^(\s*)([\s\S]*?)(\s*)$/) ?? ["", "", bagian.teks, ""];
    tambah(awal, false);
    tambah(inti, true);
    tambah(akhir, false);
  }
  return hasil;
}

/** Tanda tempat node ini berada, bila ada, di dalam kolom `akar`. */
function tandaDari(node: Node | null, akar: HTMLElement | null): HTMLElement | null {
  const el = node instanceof Element ? node : node?.parentElement;
  const tanda = el?.closest<HTMLElement>("mark") ?? null;
  return tanda && akar?.contains(tanda) ? tanda : null;
}

const HURUF_KATA = /[\p{L}\p{N}]/u;

type Riwayat = { daftar: string[]; posisi: number; ketikTerakhir: number };

export function HighlightField({
  label,
  hint,
  optional,
  value,
  onChange,
  accent,
  maxLength,
  className,
  "data-kolom": dataKolom,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  value: string;
  onChange: (value: string) => void;
  /** Warna aksen halaman; latar kata yang ditandai memakai versi encernya. */
  accent: string;
  /** Batas teks tersimpan (bintang ikut dihitung, sama dengan batas server). */
  maxLength?: number;
  className?: string;
  "data-kolom"?: string;
}) {
  const id = useId();
  const kolom = useRef<HTMLDivElement | null>(null);
  const terakhir = useRef<string | null>(null);
  const riwayat = useRef<Riwayat>({ daftar: [value], posisi: 0, ketikTerakhir: 0 });
  // Pilihan teks ada di dalam tanda: tombolnya jadi "Remove highlight".
  const [diTanda, setDiTanda] = useState(false);
  const [adaPilihan, setAdaPilihan] = useState(false);

  // Isi kolom hanya ditulis ulang saat nilainya berubah dari luar (muat, impor),
  // bukan setiap ketikan, supaya kursor tidak melompat.
  useLayoutEffect(() => {
    const el = kolom.current;
    if (!el || value === terakhir.current) return;
    el.innerHTML = keHtml(value);
    terakhir.current = value;
    riwayat.current = { daftar: [value], posisi: 0, ketikTerakhir: 0 };
  }, [value]);

  const catat = useCallback((nilai: string, ketik: boolean) => {
    const r = riwayat.current;
    if (r.daftar[r.posisi] === nilai) return;
    const sekarang = Date.now();
    // Ketikan beruntun digabung, seperti riwayat peramban.
    const gabung = ketik && r.ketikTerakhir > 0 && sekarang - r.ketikTerakhir < 1000 && r.posisi > 0;
    r.daftar = r.daftar.slice(0, gabung ? r.posisi : r.posisi + 1);
    r.daftar.push(nilai);
    r.posisi = r.daftar.length - 1;
    r.ketikTerakhir = ketik ? sekarang : 0;
  }, []);

  const kirim = useCallback(
    (ketik = false) => {
      const el = kolom.current;
      if (!el) return;
      el.normalize();
      const nilai = susunJudul(bacaPotongan(el));
      terakhir.current = nilai;
      catat(nilai, ketik);
      onChange(nilai);
    },
    [catat, onChange],
  );

  function pulihkan(arah: -1 | 1) {
    const r = riwayat.current;
    const tujuan = r.posisi + arah;
    const el = kolom.current;
    if (!el || tujuan < 0 || tujuan >= r.daftar.length) return;
    r.posisi = tujuan;
    r.ketikTerakhir = 0;
    const nilai = r.daftar[tujuan];
    el.innerHTML = keHtml(nilai);
    terakhir.current = nilai;
    const sel = window.getSelection();
    sel?.selectAllChildren(el);
    sel?.collapseToEnd();
    onChange(nilai);
  }

  const pilihan = useCallback((): Range | null => {
    const sel = window.getSelection();
    const el = kolom.current;
    if (!sel || sel.rangeCount === 0 || !el) return null;
    const range = sel.getRangeAt(0);
    return el.contains(range.commonAncestorContainer) ? range : null;
  }, []);

  useEffect(() => {
    function ubah() {
      const range = pilihan();
      setDiTanda(Boolean(range && tandaDari(range.commonAncestorContainer, kolom.current)));
      setAdaPilihan(Boolean(range && !range.collapsed));
    }
    document.addEventListener("selectionchange", ubah);
    return () => document.removeEventListener("selectionchange", ubah);
  }, [pilihan]);

  function lepasTanda(tanda: HTMLElement) {
    tanda.replaceWith(...tanda.childNodes);
  }

  /** Pilihan diperlebar ke batas kata, supaya tanda tidak memotong kata. */
  function lebarkanKeKata(range: Range) {
    const { startContainer, startOffset, endContainer, endOffset } = range;
    if (startContainer.nodeType === Node.TEXT_NODE) {
      const teks = startContainer.textContent ?? "";
      let awal = startOffset;
      while (awal > 0 && HURUF_KATA.test(teks[awal - 1]) && HURUF_KATA.test(teks[awal] ?? "")) awal -= 1;
      range.setStart(startContainer, awal);
    }
    if (endContainer.nodeType === Node.TEXT_NODE) {
      const teks = endContainer.textContent ?? "";
      let akhir = endOffset;
      while (akhir < teks.length && HURUF_KATA.test(teks[akhir]) && HURUF_KATA.test(teks[akhir - 1] ?? "")) akhir += 1;
      range.setEnd(endContainer, akhir);
    }
  }

  function sorot() {
    const range = pilihan();
    const el = kolom.current;
    if (!range || !el) return;
    // Satu cara mencari tanda untuk tombol dan aksinya (QA #109 M1).
    const tanda = tandaDari(range.commonAncestorContainer, el);
    if (tanda) {
      const sisa = document.createRange();
      sisa.setStartBefore(tanda);
      sisa.setEndAfter(tanda);
      lepasTanda(tanda);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(sisa);
    } else {
      if (range.collapsed) return;
      lebarkanKeKata(range);
      // Tanda di dalam pilihan dilebur dulu: satu tanda, bukan tanda bersarang.
      const isi = range.extractContents();
      const baru = document.createElement("mark");
      baru.textContent = isi.textContent;
      range.insertNode(baru);
      window.getSelection()?.selectAllChildren(baru);
    }
    kirim();
  }

  function bersihkan() {
    const el = kolom.current;
    if (!el) return;
    el.querySelectorAll("mark").forEach((tanda) => lepasTanda(tanda as HTMLElement));
    kirim();
  }

  function sisipkanTeks(teks: string) {
    const range = pilihan();
    if (!range) return;
    let isi = teks.replace(/ /g, " ").replace(/\s*[\r\n]+\s*/g, " ");
    if (maxLength) {
      // Bintang yang diketik admin dihitung dua (tersimpan terlindung).
      const sisa = maxLength - (value.length - range.toString().length);
      isi = Array.from(isi).slice(0, Math.max(0, sisa)).join("");
    }
    range.deleteContents();
    if (!isi) return kirim();
    const node = document.createTextNode(isi);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    kirim();
  }

  function tekan(event: KeyboardEvent<HTMLDivElement>) {
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === "Enter") event.preventDefault();
    if (mod && ["b", "i", "u"].includes(event.key.toLowerCase())) event.preventDefault();
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      pulihkan(event.shiftKey ? 1 : -1);
    } else if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      pulihkan(1);
    }
  }

  function sebelumMasuk(event: FormEvent<HTMLDivElement>) {
    const asli = event.nativeEvent as InputEvent;
    const jenis = asli.inputType ?? "";
    // Format bawaan (tebal, miring, garis bawah) tidak tersimpan: tolak (H2).
    if (jenis.startsWith("format") || jenis === "insertParagraph" || jenis === "insertLineBreak" || jenis === "insertFromDrop" || jenis === "deleteByDrag") {
      event.preventDefault();
      return;
    }
    if (jenis === "historyUndo" || jenis === "historyRedo") {
      event.preventDefault();
      pulihkan(jenis === "historyUndo" ? -1 : 1);
      return;
    }
    if (maxLength && jenis === "insertText" && asli.data) {
      const range = pilihan();
      const ganti = range ? range.toString().length : 0;
      if (value.length - ganti + asli.data.length > maxLength) event.preventDefault();
    }
  }

  function tempel(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    sisipkanTeks(event.clipboardData.getData("text/plain"));
  }

  const adaTanda = pecahJudul(value).some((bagian) => bagian.sorot);
  const count = maxLength ? { length: value.length, max: maxLength } : null;
  const tombol = "m3-state inline-flex h-[30px] items-center gap-1.5 rounded-sm px-2.5 text-label-large font-medium text-on-surface disabled:opacity-40";

  return (
    <div className={className} data-kolom={dataKolom}>
      {/* Label menuju kolom: contentEditable tidak bisa dihubungkan lewat htmlFor (L7). */}
      <label
        id={`${id}-label`}
        onClick={() => kolom.current?.focus()}
        className="m3-field-label flex items-baseline gap-2 text-label-large font-semibold text-on-surface"
      >
        {label}
        {optional ? <span className="text-body-small font-normal text-on-surface-variant">optional</span> : null}
      </label>
      <div
        className="mt-2 rounded-lg border border-outline bg-surface-container-lowest transition-[border-color,box-shadow] duration-150 ease-standard focus-within:border-primary focus-within:shadow-[0_0_0_1px_var(--color-primary)]"
        style={{ "--sorot": `color-mix(in srgb, ${accent} 35%, white)` } as CSSProperties}
      >
        <div className="flex gap-1 border-b border-outline-variant p-1">
          <button
            type="button"
            // mousedown dicegah supaya pilihan teks di kolom tidak hilang.
            onMouseDown={(event) => event.preventDefault()}
            onClick={sorot}
            disabled={!diTanda && !adaPilihan}
            className={cx(tombol, diTanda && "bg-secondary-container")}
          >
            <HighlighterCircle size={18} aria-hidden />
            {diTanda ? "Remove highlight" : "Highlight"}
          </button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={bersihkan} disabled={!adaTanda} className={tombol}>
            <TextTSlash size={18} aria-hidden />
            Clear
          </button>
        </div>
        <div
          ref={kolom}
          role="textbox"
          aria-multiline="false"
          aria-labelledby={`${id}-label`}
          aria-describedby={[hint ? `${id}-hint` : null, count ? `${id}-count` : null].filter(Boolean).join(" ") || undefined}
          aria-invalid={count && count.length > count.max ? true : undefined}
          contentEditable
          suppressContentEditableWarning
          tabIndex={0}
          onBeforeInput={sebelumMasuk}
          onInput={() => kirim(true)}
          onKeyDown={tekan}
          onPaste={tempel}
          onDrop={(event) => event.preventDefault()}
          // Garis fokus cukup tepi kotak di atas, bukan dua garis (L4).
          className="min-h-14 px-3 py-3 text-body-large leading-6 text-on-surface outline-none focus-visible:outline-none! focus-visible:shadow-none! [&_mark]:rounded-[3px] [&_mark]:bg-[var(--sorot)] [&_mark]:px-0.5 [&_mark]:text-on-surface"
        />
      </div>
      <FieldMessages id={id} hint={hint} count={count} />
    </div>
  );
}
