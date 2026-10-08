"use client";

import { HighlighterCircle, TextTSlash } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { cx } from "@/lib/m3/cx";

/**
 * Kolom satu paragraf dengan tombol Highlight, seperti stabilo.
 *
 * Kata yang ditandai tetap disimpan sebagai `*kata*` (format yang dibaca hero
 * gathering, lihat landing-tagline.ts), tetapi admin tidak pernah melihat
 * bintangnya: di kolom ini kata itu tampil berlatar warna aksen. Sebelumnya
 * satu-satunya jalan adalah mengetik bintang sendiri, dan petunjuknya tidak
 * terbaca (Mas Hanung harus bertanya ke koder).
 *
 * contentEditable dijaga sempit: hanya teks dan <mark>. Tempel selalu teks
 * polos, Enter tidak membuat baris baru.
 */

const POLA = /(\*[^*\n]+\*)/;

function escape(teks: string) {
  return teks.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function keHtml(nilai: string) {
  return nilai
    .split(POLA)
    .map((bagian) => (POLA.test(bagian) && bagian.startsWith("*") ? `<mark>${escape(bagian.slice(1, -1))}</mark>` : escape(bagian)))
    .join("");
}

function dariDom(akar: HTMLElement): string {
  let hasil = "";
  akar.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) hasil += node.textContent ?? "";
    else if (node instanceof HTMLElement && node.tagName === "MARK") {
      const isi = node.textContent ?? "";
      // Spasi di tepi tanda dikeluarkan: `*kata *` tetap terbaca sebagai tanda,
      // tetapi spasinya ikut berwarna di halaman.
      const awal = isi.match(/^\s*/)?.[0] ?? "";
      const akhir = isi.slice(awal.length).match(/\s*$/)?.[0] ?? "";
      const inti = isi.slice(awal.length, isi.length - akhir.length);
      hasil += inti ? `${awal}*${inti}*${akhir}` : isi;
    } else hasil += node.textContent ?? "";
  });
  return hasil.replace(/\n/g, " ");
}

export function HighlightField({
  label,
  hint,
  optional,
  value,
  onChange,
  accent,
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
  className?: string;
  "data-kolom"?: string;
}) {
  const id = useId();
  const kolom = useRef<HTMLDivElement | null>(null);
  const terakhir = useRef<string | null>(null);
  // Pilihan teks ada di dalam tanda: tombolnya jadi "Remove highlight".
  const [diTanda, setDiTanda] = useState(false);
  const [adaPilihan, setAdaPilihan] = useState(false);

  // Isi kolom hanya ditulis ulang saat nilainya berubah dari luar (muat, Urungkan),
  // bukan setiap ketikan, supaya kursor tidak melompat.
  useLayoutEffect(() => {
    const el = kolom.current;
    if (!el || value === terakhir.current) return;
    el.innerHTML = keHtml(value);
    terakhir.current = value;
  }, [value]);

  const kirim = useCallback(() => {
    const el = kolom.current;
    if (!el) return;
    el.normalize();
    const nilai = dariDom(el);
    terakhir.current = nilai;
    onChange(nilai);
  }, [onChange]);

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
      const tanda = range ? (range.commonAncestorContainer.parentElement?.closest("mark") ?? (range.commonAncestorContainer instanceof HTMLElement ? range.commonAncestorContainer.closest("mark") : null)) : null;
      setDiTanda(Boolean(tanda && kolom.current?.contains(tanda)));
      setAdaPilihan(Boolean(range && !range.collapsed));
    }
    document.addEventListener("selectionchange", ubah);
    return () => document.removeEventListener("selectionchange", ubah);
  }, [pilihan]);

  function lepasTanda(tanda: HTMLElement) {
    tanda.replaceWith(...tanda.childNodes);
  }

  function sorot() {
    const range = pilihan();
    const el = kolom.current;
    if (!range || !el) return;
    const tanda = (range.commonAncestorContainer.parentElement ?? null)?.closest("mark");
    if (tanda && el.contains(tanda)) {
      lepasTanda(tanda);
    } else {
      if (range.collapsed) return;
      // Tanda di dalam pilihan dilebur dulu: satu tanda, bukan tanda bersarang.
      const isi = range.extractContents();
      isi.querySelectorAll("mark").forEach((lama) => lepasTanda(lama));
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

  function tekan(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter") event.preventDefault();
  }

  function tempel(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const teks = event.clipboardData.getData("text/plain").replace(/\s*\n\s*/g, " ");
    const range = pilihan();
    if (!range) return;
    range.deleteContents();
    const node = document.createTextNode(teks);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    kirim();
  }

  const adaTanda = /\*[^*\n]+\*/.test(value);

  return (
    <div className={className} data-kolom={dataKolom}>
      <p id={`${id}-label`} className="m3-field-label flex items-baseline gap-2 text-label-large font-semibold text-on-surface">
        {label}
        {optional ? <span className="text-body-small font-normal text-on-surface-variant">optional</span> : null}
      </p>
      <div
        className="mt-2 rounded-lg border border-outline bg-surface-container-lowest transition-[border-color,box-shadow] duration-150 ease-standard focus-within:border-primary"
        style={{ "--sorot": `color-mix(in srgb, ${accent} 35%, white)` } as React.CSSProperties}
      >
        <div role="toolbar" aria-label={`${label} formatting`} className="flex gap-1 border-b border-outline-variant p-1">
          <button
            type="button"
            // mousedown dicegah supaya pilihan teks di kolom tidak hilang.
            onMouseDown={(event) => event.preventDefault()}
            onClick={sorot}
            disabled={!diTanda && !adaPilihan}
            aria-pressed={diTanda}
            className={cx(
              "m3-state inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-label-large font-medium text-on-surface disabled:opacity-40",
              diTanda && "bg-secondary-container",
            )}
          >
            <HighlighterCircle size={18} aria-hidden />
            {diTanda ? "Remove highlight" : "Highlight"}
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={bersihkan}
            disabled={!adaTanda}
            className="m3-state inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-label-large font-medium text-on-surface disabled:opacity-40"
          >
            <TextTSlash size={18} aria-hidden />
            Clear
          </button>
        </div>
        <div
          ref={kolom}
          role="textbox"
          aria-multiline="false"
          aria-labelledby={`${id}-label`}
          aria-describedby={hint ? `${id}-hint` : undefined}
          contentEditable
          suppressContentEditableWarning
          tabIndex={0}
          onInput={kirim}
          onKeyDown={tekan}
          onPaste={tempel}
          className="min-h-14 px-3 py-3 text-body-large leading-6 text-on-surface outline-none [&_mark]:rounded-[3px] [&_mark]:bg-[var(--sorot)] [&_mark]:px-0.5 [&_mark]:text-on-surface"
        />
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="mt-2 text-body-small text-on-surface-variant">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
