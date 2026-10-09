"use client";

import { ListBullets, ListNumbers, TextB, TextItalic } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { FieldMessages } from "@/components/m3/text-field";
import { cx } from "@/lib/m3/cx";
import { pecahTeks, susunTeks, type Blok, type Potongan } from "@/lib/landing-teks-kaya";

/**
 * Kolom Details butir agenda dengan toolbar: Bold, Italic, Theme colour,
 * Bulleted list, Numbered list. Admin melihat hasilnya langsung (tebal, miring,
 * berwarna, berbulet); yang disimpan teks bertanda dari landing-teks-kaya.ts,
 * bukan HTML.
 *
 * Perintah format memakai execCommand supaya Urungkan/Ulangi dan Enter di
 * dalam daftar (butir baru) mengikuti perilaku peramban. Yang dibaca kembali
 * dari DOM hanya teks, <b>/<strong>, <i>/<em>, warna tema, dan blok
 * baris/daftar; selebihnya (garis bawah, ukuran, tempelan Word) dibuang.
 * Tempel selalu teks polos. Mengetik "- " atau "1. " di awal baris memulai
 * daftar, seperti di Google Docs.
 */

/** Warna tanda di editor: primary panel admin. Halaman publik memakai warna tema acara. */
const WARNA = "#0b57d0";

function escape(teks: string) {
  return teks.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isiHtml(isi: Potongan[]) {
  const html = isi
    .map((p) => {
      let h = escape(p.teks);
      if (p.miring) h = `<i>${h}</i>`;
      if (p.tebal) h = `<b>${h}</b>`;
      if (p.warna) h = `<font color="${WARNA}">${h}</font>`;
      return h;
    })
    .join("");
  return html || "<br>";
}

function keHtml(nilai: string) {
  if (!nilai) return "";
  let html = "";
  let daftar: "ul" | "ol" | null = null;
  for (const b of pecahTeks(nilai)) {
    if (b.jenis !== daftar) {
      if (daftar) html += `</${daftar}>`;
      daftar = b.jenis === "p" ? null : b.jenis;
      if (daftar) html += `<${daftar}>`;
    }
    html += daftar ? `<li>${isiHtml(b.isi)}</li>` : `<div>${isiHtml(b.isi)}</div>`;
  }
  if (daftar) html += `</${daftar}>`;
  return html;
}

function warnaTema(el: HTMLElement): boolean {
  const warna = (el.tagName === "FONT" ? el.getAttribute("color") : el.style.color) ?? "";
  if (!warna) return false;
  const uji = document.createElement("span");
  uji.style.color = warna;
  const acuan = document.createElement("span");
  acuan.style.color = WARNA;
  return uji.style.color === acuan.style.color;
}

type Gaya = { tebal: boolean; miring: boolean; warna: boolean };

/** DOM kolom dibaca kembali menjadi blok. */
function bacaBlok(akar: HTMLElement): Blok[] {
  const blok: Blok[] = [];
  let baris: Blok | null = null;
  const tutup = () => {
    if (baris) blok.push(baris);
    baris = null;
  };
  const tambah = (teks: string, gaya: Gaya) => {
    if (!baris) baris = { jenis: "p", isi: [] };
    const akhir = baris.isi[baris.isi.length - 1];
    const p: Potongan = { teks, ...(gaya.tebal ? { tebal: true } : {}), ...(gaya.miring ? { miring: true } : {}), ...(gaya.warna ? { warna: true } : {}) };
    if (akhir && !!akhir.tebal === gaya.tebal && !!akhir.miring === gaya.miring && !!akhir.warna === gaya.warna) akhir.teks += teks;
    else baris.isi.push(p);
  };
  const inline = (node: Node, gaya: Gaya, jenis: Blok["jenis"]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const teks = (node.textContent ?? "").replace(/ /g, " ").replace(/[\r\n]+/g, " ");
      if (teks) {
        if (!baris) baris = { jenis, isi: [] };
        tambah(teks, gaya);
      }
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName;
    if (tag === "BR") {
      // <br> terakhir di blok hanya pengganjal baris kosong.
      if (node.nextSibling || !node.parentElement || node.parentElement === akar) {
        if (!baris) baris = { jenis, isi: [] };
        tutup();
        baris = { jenis, isi: [] };
      } else if (!baris) baris = { jenis, isi: [] };
      return;
    }
    if (tag === "UL" || tag === "OL") {
      tutup();
      node.childNodes.forEach((anak) => {
        if (anak instanceof HTMLElement && anak.tagName === "LI") {
          baris = { jenis: tag === "UL" ? "ul" : "ol", isi: [] };
          anak.childNodes.forEach((n) => inline(n, gaya, tag === "UL" ? "ul" : "ol"));
          tutup();
        } else inline(anak, gaya, jenis);
      });
      return;
    }
    if (tag === "DIV" || tag === "P" || tag === "LI") {
      tutup();
      baris = { jenis, isi: [] };
      node.childNodes.forEach((n) => inline(n, gaya, jenis));
      tutup();
      return;
    }
    const gayaAnak: Gaya = {
      tebal: gaya.tebal || tag === "B" || tag === "STRONG" || Number(node.style.fontWeight) >= 600 || node.style.fontWeight === "bold",
      miring: gaya.miring || tag === "I" || tag === "EM" || node.style.fontStyle === "italic",
      warna: (gaya.warna && !((tag === "FONT" || node.style.color) && !warnaTema(node))) || ((tag === "FONT" || !!node.style.color) && warnaTema(node)),
    };
    node.childNodes.forEach((n) => inline(n, gayaAnak, jenis));
  };
  akar.childNodes.forEach((n) => inline(n, { tebal: false, miring: false, warna: false }, "p"));
  tutup();
  // Isi kosong di butir/baris dibuang dari tepi, baris kosong di tengah tetap.
  for (const b of blok) b.isi = b.isi.filter((p) => p.teks);
  while (blok.length && blok[blok.length - 1].isi.length === 0) blok.pop();
  return blok;
}

function TombolAlat({ label, aktif, onClick, children }: { label: string; aktif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={aktif}
      // mousedown dicegah supaya pilihan teks di kolom tidak hilang.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cx("m3-state inline-flex size-8 items-center justify-center rounded-sm text-on-surface", aktif && "bg-secondary-container text-on-secondary-container")}
    >
      {children}
    </button>
  );
}

type Aktif = { tebal: boolean; miring: boolean; warna: boolean; ul: boolean; ol: boolean };
const TANPA: Aktif = { tebal: false, miring: false, warna: false, ul: false, ol: false };

export function RichDetailsField({
  label,
  hint,
  optional,
  placeholder,
  value,
  onChange,
  className,
  "data-kolom": dataKolom,
}: {
  label: string;
  hint?: ReactNode;
  optional?: boolean;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  "data-kolom"?: string;
}) {
  const id = useId();
  const kolom = useRef<HTMLDivElement | null>(null);
  const terakhir = useRef<string | null>(null);
  const [aktif, setAktif] = useState<Aktif>(TANPA);
  const [kosong, setKosong] = useState(!value);

  // Isi kolom hanya ditulis ulang saat nilainya berubah dari luar (pilih butir
  // lain, muat ulang), bukan setiap ketikan, supaya kursor tidak melompat.
  useLayoutEffect(() => {
    const el = kolom.current;
    if (!el || value === terakhir.current) return;
    el.innerHTML = keHtml(value);
    terakhir.current = value;
    setKosong(!value);
  }, [value]);

  const kirim = useCallback(() => {
    const el = kolom.current;
    if (!el) return;
    const nilai = susunTeks(bacaBlok(el));
    setKosong(!el.textContent?.trim() && !el.querySelector("li"));
    if (nilai === terakhir.current) return;
    terakhir.current = nilai;
    onChange(nilai);
  }, [onChange]);

  const diKolom = useCallback(() => {
    const sel = window.getSelection();
    const el = kolom.current;
    return Boolean(sel && sel.rangeCount && el && el.contains(sel.getRangeAt(0).commonAncestorContainer));
  }, []);

  useEffect(() => {
    function ubah() {
      if (!diKolom()) return setAktif(TANPA);
      const sel = window.getSelection()!;
      const node = sel.anchorNode;
      const el = node instanceof Element ? node : node?.parentElement;
      let warna = false;
      for (let n: HTMLElement | null | undefined = el as HTMLElement | null; n && n !== kolom.current; n = n.parentElement) {
        if (n.tagName === "FONT" || n.style?.color) {
          warna = warnaTema(n);
          break;
        }
      }
      setAktif({
        tebal: document.queryCommandState("bold"),
        miring: document.queryCommandState("italic"),
        warna,
        ul: document.queryCommandState("insertUnorderedList"),
        ol: document.queryCommandState("insertOrderedList"),
      });
    }
    document.addEventListener("selectionchange", ubah);
    return () => document.removeEventListener("selectionchange", ubah);
  }, [diKolom]);

  function perintah(nama: string, nilai?: string) {
    const el = kolom.current;
    if (!el) return;
    if (!diKolom()) el.focus();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(nama, false, nilai);
    kirim();
    document.dispatchEvent(new Event("selectionchange"));
  }

  // "- " atau "1. " di awal baris biasa: ubah jadi daftar.
  function pintasDaftar() {
    const sel = window.getSelection();
    const el = kolom.current;
    if (!sel || !sel.rangeCount || !el || !sel.isCollapsed) return false;
    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE || !el.contains(node)) return false;
    if ((node.parentElement as HTMLElement | null)?.closest("li")) return false;
    const teks = node.textContent ?? "";
    const cocok = /^(-|\d{1,2}\.)[  ]$/.exec(teks.slice(0, sel.anchorOffset));
    const awalBlok = !node.previousSibling || (node.previousSibling as HTMLElement).tagName === "BR";
    if (!cocok || !awalBlok) return false;
    const r = document.createRange();
    r.setStart(node, 0);
    r.setEnd(node, sel.anchorOffset);
    sel.removeAllRanges();
    sel.addRange(r);
    document.execCommand("delete");
    document.execCommand(cocok[1] === "-" ? "insertUnorderedList" : "insertOrderedList");
    return true;
  }

  // beforeinput asli, bukan onBeforeInput React (yang tidak membawa inputType).
  useEffect(() => {
    const el = kolom.current;
    if (!el) return;
    const masuk = (event: Event) => {
      const jenis = (event as InputEvent).inputType ?? "";
      // Hanya tebal dan miring yang tersimpan; format lain (garis bawah, coret) ditolak.
      if ((jenis.startsWith("format") && jenis !== "formatBold" && jenis !== "formatItalic") || jenis === "insertFromDrop" || jenis === "deleteByDrag") event.preventDefault();
    };
    el.addEventListener("beforeinput", masuk);
    return () => el.removeEventListener("beforeinput", masuk);
  }, []);

  function tekan(event: KeyboardEvent<HTMLDivElement>) {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "u") event.preventDefault();
  }

  function tempel(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const teks = event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
    document.execCommand("insertText", false, teks);
    kirim();
  }

  return (
    <div className={className} data-kolom={dataKolom}>
      <label id={`${id}-label`} onClick={() => kolom.current?.focus()} className="m3-field-label flex items-baseline gap-2 text-label-large font-semibold text-on-surface">
        {label}
        {optional ? <span className="text-body-small font-normal text-on-surface-variant">optional</span> : null}
      </label>
      <div className="mt-2 rounded-lg border border-outline bg-surface-container-lowest transition-[border-color,box-shadow] duration-150 ease-standard focus-within:border-primary focus-within:shadow-[0_0_0_1px_var(--color-primary)]">
        <div role="toolbar" aria-label={`${label} formatting`} className="flex items-center gap-0.5 border-b border-outline-variant px-1 py-0.5">
          <TombolAlat label="Bold (Ctrl+B)" aktif={aktif.tebal} onClick={() => perintah("bold")}>
            <TextB size={18} weight="bold" aria-hidden />
          </TombolAlat>
          <TombolAlat label="Italic (Ctrl+I)" aktif={aktif.miring} onClick={() => perintah("italic")}>
            <TextItalic size={18} aria-hidden />
          </TombolAlat>
          <TombolAlat label="Theme colour" aktif={aktif.warna} onClick={() => perintah("foreColor", aktif.warna ? "#1f1f1f" : WARNA)}>
            <span aria-hidden className="flex flex-col items-center text-[14px] font-semibold leading-[14px]">
              A<span className="mt-0.5 h-[3px] w-3.5 rounded-full" style={{ background: WARNA }} />
            </span>
          </TombolAlat>
          <span aria-hidden className="mx-1 h-5 w-px bg-outline-variant" />
          <TombolAlat label="Bulleted list" aktif={aktif.ul} onClick={() => perintah("insertUnorderedList")}>
            <ListBullets size={18} aria-hidden />
          </TombolAlat>
          <TombolAlat label="Numbered list" aktif={aktif.ol} onClick={() => perintah("insertOrderedList")}>
            <ListNumbers size={18} aria-hidden />
          </TombolAlat>
        </div>
        <div className="relative">
          {kosong && placeholder ? (
            <div aria-hidden className="pointer-events-none absolute inset-x-3 top-3 whitespace-pre-line text-body-large leading-6 text-on-surface-variant/70">
              {placeholder}
            </div>
          ) : null}
          <div
            ref={kolom}
            role="textbox"
            aria-multiline="true"
            aria-labelledby={`${id}-label`}
            aria-describedby={hint ? `${id}-hint` : undefined}
            aria-placeholder={placeholder}
            contentEditable
            suppressContentEditableWarning
            tabIndex={0}
            onInput={() => {
              pintasDaftar();
              kirim();
            }}
            onKeyDown={tekan}
            onPaste={tempel}
            onDrop={(event) => event.preventDefault()}
            onBlur={() => {
              // DOM dirapikan ke bentuk tersimpan saat kolom ditinggalkan.
              const el = kolom.current;
              if (el && terakhir.current !== null) el.innerHTML = keHtml(terakhir.current);
            }}
            className="min-h-[136px] px-3 py-3 text-body-large leading-6 text-on-surface outline-none focus-visible:outline-none! focus-visible:shadow-none! [&_b]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
          />
        </div>
      </div>
      <FieldMessages id={id} hint={hint} />
    </div>
  );
}
