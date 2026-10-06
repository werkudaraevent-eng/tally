"use client";

import { CaretDown, Plus, Trash, WarningCircle } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { Button, Dialog, IconButton, SegmentedButton, TextArea, TextField } from "@/components/m3";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import {
  LANDING_BLOCK_ALIGN_LABELS,
  LANDING_BLOCK_DEFAULT_TONE,
  LANDING_BLOCK_DESCRIPTIONS,
  LANDING_BLOCK_LABELS,
  LANDING_BLOCK_LAYOUTS,
  LANDING_BLOCK_TONE_LABELS,
  LANDING_COLUMNS_DEFAULT,
  LANDING_IMAGE_SHAPE_LABELS,
  LANDING_NAV_LABEL_MAX,
  landingColumnCount,
  landingBlockLayout,
  landingBlockLimits,
  type LandingBlock,
  type LandingBlockAlign,
  type LandingBlockId,
  type LandingBlockItem,
  type LandingBlockLayout,
  type LandingBlockTone,
  type LandingBlockType,
  type LandingColumnCount,
  type LandingImageShape,
  type LandingTextLimit,
} from "@/lib/domain";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";

/**
 * CMS pustaka blok: dialog Tambah blok dan editor isi tiap jenis blok.
 * Rancangan: Figma "Pustaka blok (usulan)" (CMS) dan kartu "ISI DI CMS" di
 * "Halaman acara FHF (desain dulu)" (batas isi). Halaman publiknya ada di
 * components/landing/modern/landing-blocks.tsx.
 *
 * Setiap kolom teks memakai batas dari `landingBlockLimits`, sumber yang sama
 * dengan validasi server, dan menampilkan penghitung karakter. Hint tiap gambar
 * menyebut rasio slotnya, karena gambar dipotong otomatis ke rasio itu.
 */

const URUTAN_JENIS: LandingBlockType[] = ["text_image", "multicolumn", "cards", "points", "stats", "logos", "download", "cta", "gallery", "quote"];

export function buatBlok(type: LandingBlockType): LandingBlock {
  const acak = Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 10);
  const id = `blk_${acak}` as LandingBlockId;
  const layout = LANDING_BLOCK_LAYOUTS[type]?.[0]?.value;
  const kolom = type === "multicolumn" ? { columns: LANDING_COLUMNS_DEFAULT, image_shape: "wide" as const, align: "left" as const } : {};
  return { id, type, tone: LANDING_BLOCK_DEFAULT_TONE[type], ...(layout ? { layout } : {}), ...kolom, items: [] };
}

const TAUTAN_SAH = /^(https?:\/\/\S+|#[A-Za-z][\w-]*)$/;

/** Tautan yang akan ditolak server, supaya galatnya bisa disebut per blok. */
export function tautanBlokSalah(block: LandingBlock): boolean {
  const salah = (value?: string) => Boolean(value?.trim()) && !TAUTAN_SAH.test(value!.trim());
  return salah(block.link_url) || salah(block.link2_url) || (block.items ?? []).some((item) => salah(item.href));
}

/** Jumlah butir di atas batas tata letak yang dipilih (0 = aman). */
export function butirBerlebih(block: LandingBlock): number {
  return Math.max(0, (block.items ?? []).length - (landingBlockLimits(block).items?.max ?? 0));
}

/** Satu baris ringkasan untuk daftar susunan. */
export function ringkasanBlok(block: LandingBlock): string | null {
  const jumlah = (block.items ?? []).length;
  switch (block.type) {
    case "cards": return jumlah ? plural(jumlah, "card") : null;
    case "points": return jumlah ? plural(jumlah, "point") : null;
    case "gallery": return jumlah ? plural(jumlah, "photo") : null;
    case "stats": return jumlah ? plural(jumlah, "figure") : null;
    case "logos": return jumlah ? plural(jumlah, "logo") : null;
    case "multicolumn": return jumlah ? `${plural(jumlah, "item")} · ${plural(landingColumnCount(block), "column")}` : null;
    case "quote": return block.name?.trim() || null;
    default: return block.heading?.trim() || null;
  }
}

/** Gambaran kecil tiap jenis blok di dialog Tambah blok. */
function Sketsa({ type }: { type: LandingBlockType }) {
  const gelap = type === "stats" || type === "cta";
  const kotak = "rounded-[3px] bg-outline-variant";
  const garis = (lebar: string, tebal = "h-1") => <span className={cx("block rounded-full", tebal, lebar, gelap ? "bg-white/70" : "bg-on-surface-variant/50")} />;
  return (
    <span aria-hidden className={cx("flex h-20 w-28 shrink-0 gap-1.5 overflow-hidden rounded-md p-2.5", gelap ? "bg-[#111A42]" : "bg-surface-container-high")}>
      {type === "text_image" ? (<><span className={cx(kotak, "w-11")} /><span className="flex flex-1 flex-col justify-center gap-1">{garis("w-full", "h-1.5")}{garis("w-4/5")}{garis("w-full")}{garis("w-3/5")}</span></>) : null}
      {type === "cards" ? (<span className="flex flex-1 gap-1">{[0, 1].map((key) => <span key={key} className="flex flex-1 flex-col justify-end gap-0.5 rounded-[3px] bg-on-surface-variant/40 p-1"><span className="h-1 w-3/4 rounded-full bg-white/80" /><span className="h-1 w-1/2 rounded-full bg-white/60" /></span>)}</span>) : null}
      {type === "points" ? (<span className="flex flex-1 gap-1">{[0, 1, 2].map((key) => <span key={key} className="flex flex-1 flex-col gap-1 rounded-[3px] bg-surface-container-lowest p-1"><span className="h-1.5 w-2.5 rounded-full bg-primary" />{garis("w-full")}{garis("w-3/4")}</span>)}</span>) : null}
      {type === "gallery" ? (<><span className={cx(kotak, "w-12")} /><span className="flex flex-1 flex-col gap-1"><span className={cx(kotak, "flex-1")} /><span className="flex flex-1 gap-1"><span className={cx(kotak, "flex-1")} /><span className={cx(kotak, "flex-1")} /></span></span></>) : null}
      {type === "stats" ? (<span className="flex flex-1 items-center gap-2">{garis("w-6", "h-1.5")}{[0, 1, 2].map((key) => <span key={key} className="flex flex-1 flex-col gap-1 border-l border-white/30 pl-1">{garis("w-full", "h-2")}{garis("w-3/4")}</span>)}</span>) : null}
      {type === "quote" ? (<span className="flex flex-1 flex-col justify-center gap-1.5">{garis("w-full", "h-1.5")}{garis("w-4/5", "h-1.5")}<span className="mt-1 flex items-center gap-1"><span className="size-3 rounded-full bg-outline-variant" />{garis("w-8")}</span></span>) : null}
      {type === "logos" ? (<span className="flex flex-1 items-center gap-1.5">{[0, 1, 2].map((key) => <span key={key} className={cx(kotak, "h-5 flex-1")} />)}</span>) : null}
      {type === "download" ? (<span className="flex flex-1 items-center gap-2 rounded-[3px] bg-surface-container-lowest p-1.5"><span className="flex flex-1 flex-col gap-1">{garis("w-full", "h-1.5")}{garis("w-3/4")}<span className="h-2 w-8 rounded-[2px] bg-primary" /></span><span className={cx(kotak, "h-10 w-7 -rotate-6")} /></span>) : null}
      {type === "multicolumn" ? (<span className="flex flex-1 gap-1.5">{[0, 1, 2].map((key) => <span key={key} className="flex flex-1 flex-col gap-1"><span className={cx(kotak, "h-6")} />{garis("w-full", "h-1.5")}{garis("w-3/4")}</span>)}</span>) : null}
      {type === "cta" ? (<span className="flex flex-1 items-center gap-2"><span className="flex flex-1 flex-col gap-1">{garis("w-full", "h-1.5")}{garis("w-2/3")}</span><span className="h-3 w-8 rounded-[2px] bg-white" /></span>) : null}
    </span>
  );
}

export function TambahBlokDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (type: LandingBlockType) => void }) {
  const [pilih, setPilih] = useState<LandingBlockType>("text_image");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title="Add block"
      description="New blocks go at the end of the page. Drag the handle or use the ⋯ menu to move them."
      actions={
        <>
          <Button variant="text" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onPick(pilih)}>Add {LANDING_BLOCK_LABELS[pilih]}</Button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Block type" className="grid gap-3 sm:grid-cols-2">
        {URUTAN_JENIS.map((type) => {
          const aktif = type === pilih;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={aktif}
              onClick={() => setPilih(type)}
              onDoubleClick={() => onPick(type)}
              className={cx(
                "m3-state flex items-center gap-3 rounded-lg border p-2.5 text-left",
                aktif ? "border-primary bg-primary-soft ring-1 ring-primary" : "border-outline-variant",
              )}
            >
              <Sketsa type={type} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-body-large font-semibold text-on-surface">{LANDING_BLOCK_LABELS[type]}</span>
                <span className="text-body-small text-on-surface-variant">{LANDING_BLOCK_DESCRIPTIONS[type]}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}

const LABEL_BUTIR: Partial<Record<LandingBlockType, string>> = {
  cards: "card",
  points: "point",
  gallery: "photo",
  stats: "figure",
  logos: "logo",
  multicolumn: "column",
};

/** Rasio slot gambar per jenis dan tata letak. Hint menyebutnya karena gambar dipotong ke rasio ini. */
function rasioGambarButir(block: LandingBlock): string {
  if (block.type === "logos") return "PNG or SVG with a transparent background. Shown 40 px tall, 160 px wide at most.";
  if (block.type === "gallery") return "Ratio 4:3, at least 1200×900. Cropped automatically.";
  if (block.type === "multicolumn") {
    const bentuk = block.image_shape ?? "wide";
    if (bentuk === "circle") return "Cropped to a circle, at least 400×400. Keep the face or icon in the centre of the photo.";
    if (bentuk === "square") return "Ratio 1:1, at least 800×800. Cropped automatically.";
    return "Ratio 3:2, at least 960×640. Give every column an image, or none, so they line up.";
  }
  const layout = landingBlockLayout(block);
  if (layout === "overlay") return "Ratio 3:2, at least 1200×800. The bottom of the photo sits under a dark shade that holds the title.";
  if (layout === "columns") return "Ratio 3:2, at least 768×512. Give every card an image, or none, so they line up.";
  return "Ratio 16:9 for the first card, 3:2 for the others. Cropped automatically.";
}

/** Ada teks butir yang melewati batas (mis. setelah impor, atau kolom ditambah sehingga batasnya turun). */
function butirKepanjangan(block: LandingBlock, item: LandingBlockItem, batas: Partial<Record<KolomButir, LandingTextLimit>> | undefined): boolean {
  if (!batas) return false;
  // Isian yang tidak dirender tidak dihitung: lencananya akan membuka butir
  // yang tidak punya kolom untuk diperbaiki.
  return (Object.keys(batas) as KolomButir[]).some((key) => {
    if (!isianButirTampil(block, item, key)) return false;
    const max = batas[key]?.max;
    return max !== undefined && (item[key]?.length ?? 0) > max;
  });
}

function Kelompok({ judul, catatan, children }: { judul: string; catatan?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={judul} className="flex flex-col gap-4 border-t border-outline-variant pt-4">
      <div className="flex flex-col gap-0.5">
        <p className="text-body-medium font-semibold text-on-surface">{judul}</p>
        {catatan ? <p className="text-body-small text-on-surface-variant">{catatan}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Peringatan({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-warning-soft">
      <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

const hitung = (limit?: LandingTextLimit) => ({ maxLength: limit?.max, counter: limit ? { ideal: limit.ideal } : false });

/** "3 atau 6", "2, 3, atau 4". */
function daftarAngka(angka: number[]): string {
  return angka.length <= 2 ? angka.join(" or ") : `${angka.slice(0, -1).join(", ")} or ${angka[angka.length - 1]}`;
}

/**
 * Nama kolom blok seperti tertulis di editor ID di bawah, untuk galat Simpan
 * yang menyebut kolomnya. Ubah bersama label kolom di BlockEditor.
 */
export function labelKolomBlok(block: LandingBlock, key: string): string {
  switch (key) {
    case "eyebrow": return "Small label";
    case "heading": return block.type === "logos" ? "Label" : "Heading";
    case "body": return block.type === "text_image" ? "Body" : block.type === "download" ? "Description" : block.type === "cta" ? "Message" : "Intro";
    case "link_label": return block.type === "text_image" ? "Main button text" : "Button text";
    case "link2_label": return "Second button text";
    case "fact_title": return "Fact card";
    case "fact_body": return "Description";
    case "source": return "Source";
    case "quote": return "Quote";
    case "name": return "Name";
    case "role": return "Position and organisation";
    default: return key;
  }
}

/**
 * Kolom blok yang dirender editor ID. Teks tombol tanpa tautannya tidak tampil
 * di halaman maupun di editor, jadi galat Simpan tidak bisa menunjuknya.
 */
export function kolomBlokTampil(block: LandingBlock, key: string): boolean {
  if (key === "link_label") {
    if (block.type === "download" || block.type === "cta") return true;
    return (block.type === "text_image" || block.type === "cards") && Boolean(block.link_url?.trim());
  }
  if (key === "link2_label") return block.type === "text_image" && Boolean(block.link2_url?.trim());
  return true;
}

/** Label isian butir per jenis dan tata letak; satu sumber untuk editor dan galat Simpan. */
export function labelIsianButir(block: LandingBlock, key: KolomButir): string {
  const layout = landingBlockLayout(block);
  switch (block.type) {
    case "stats": return key === "value" ? "Figure" : "Description";
    case "points": return layout === "numbered" ? "Row text" : layout === "list" ? "Item" : key === "title" ? "Card title" : "Card text";
    case "cards":
      if (key === "label") return layout === "overlay" ? "Chip 1" : "Small label";
      if (key === "value") return "Chip 2";
      if (key === "title") return "Title";
      return layout === "columns" ? "Description or publisher" : "Description";
    case "logos": return "Organisation name";
    case "multicolumn": return key === "title" ? "Title" : key === "body" ? "Text" : "Link text";
    default: return "Photo caption";
  }
}

/** Isian butir yang dirender editor ID: Chip 2 hanya di tata letak overlay, teks tautan Kolom hanya bila tautannya diisi. */
export function isianButirTampil(block: LandingBlock, item: LandingBlockItem, key: KolomButir): boolean {
  const layout = landingBlockLayout(block);
  switch (block.type) {
    case "stats": return key === "value" || key === "label";
    case "points": return layout === "numbered" ? key === "body" : layout === "list" ? key === "title" : key === "title" || key === "body";
    case "cards": return key !== "value" || layout === "overlay";
    case "logos": return key === "label";
    case "multicolumn": return key !== "label" || Boolean(item.href?.trim());
    default: return key === "label";
  }
}

/** "Kartu 2", "Isi kolom 3": nama butir seperti di judul barisnya. */
export function namaButirBlok(block: LandingBlock, index: number): string {
  const butir = LABEL_BUTIR[block.type] ?? "item";
  return `${butir[0].toUpperCase()}${butir.slice(1)} ${index + 1}`;
}

type KolomTeks = "eyebrow" | "heading" | "body" | "link_label" | "link2_label" | "fact_title" | "fact_body" | "source" | "quote" | "name" | "role";
export type KolomButir = "label" | "title" | "body" | "value";

export function BlockEditor({ block, onChange }: { block: LandingBlock; onChange: (next: LandingBlock) => void }) {
  const ubah = (patch: Partial<LandingBlock>) => onChange({ ...block, ...patch });
  const items = block.items ?? [];
  const setItems = (next: LandingBlockItem[]) => ubah({ items: next });
  const ubahItem = (index: number, patch: Partial<LandingBlockItem>) => setItems(items.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  const batas = landingBlockLimits(block);
  const layout = landingBlockLayout(block);
  const maks = batas.items?.max ?? 0;
  const butir = LABEL_BUTIR[block.type];
  const Butir = butir ? butir[0].toUpperCase() + butir.slice(1) : "";
  // Kolom: satu isi terbuka sekaligus, sisanya satu baris ringkas. Delapan
  // formulir terbuka akan mendorong baris blok berikutnya jauh dari layar.
  // Semua mulai terlipat supaya baris blok berikutnya tetap terlihat.
  const ringkas = block.type === "multicolumn";
  const [butirTerbuka, setButirTerbuka] = useState(-1);
  const [tampilanTerbuka, setTampilanTerbuka] = useState(false);
  const hapusButir = (index: number) => {
    setItems(items.filter((_, position) => position !== index));
    // Isi yang sedang terbuka tetap terbuka walau urutannya bergeser.
    setButirTerbuka((terbuka) => (terbuka === index ? -1 : terbuka > index ? terbuka - 1 : terbuka));
  };

  // ---- Kolom tingkat blok ------------------------------------------------------
  const teks = (key: KolomTeks, label: string, opsi: { hint?: string; optional?: boolean; placeholder?: string } = {}) => (
    <TextField
      label={label}
      optional={opsi.optional}
      hint={opsi.hint}
      placeholder={opsi.placeholder}
      {...hitung(batas[key])}
      value={block[key] ?? ""}
      onChange={(event) => ubah({ [key]: event.target.value })}
    />
  );
  const area = (key: KolomTeks, label: string, opsi: { hint?: string; optional?: boolean; rows?: number } = {}) => (
    <TextArea
      label={label}
      optional={opsi.optional}
      hint={opsi.hint}
      rows={opsi.rows ?? 3}
      {...hitung(batas[key])}
      value={block[key] ?? ""}
      onChange={(event) => ubah({ [key]: event.target.value })}
    />
  );
  const tautan = (key: "link_url" | "link2_url", label: string, hint: string) => (
    <TextField label={label} optional hint={hint} placeholder="https:// or #agenda" maxLength={600} value={block[key] ?? ""} onChange={(event) => ubah({ [key]: event.target.value })} />
  );
  const alis = teks("eyebrow", "Small label", { optional: true, hint: "One to three words above the heading." });
  const judul = (label = "Heading", hint?: string) => teks("heading", label, { hint });
  const menuAtas = (
    <TextField
      label="Top menu label"
      optional
      hint="Fill in to list this block in the top menu on wide screens, e.g. Tentang or Program. Leave empty if not needed."
      maxLength={LANDING_NAV_LABEL_MAX}
      counter
      value={block.nav_label ?? ""}
      onChange={(event) => ubah({ nav_label: event.target.value })}
    />
  );
  const latar = block.type === "cta" ? null : (
    <>
    {menuAtas}
    <div className="flex flex-col gap-1.5">
      <p className="text-body-medium font-medium text-on-surface">Background</p>
      <SegmentedButton<LandingBlockTone>
        label="Block background"
        value={block.tone ?? LANDING_BLOCK_DEFAULT_TONE[block.type]}
        onChange={(tone) => ubah({ tone })}
        options={(["light", "panel", "dark"] as const).map((tone) => ({ value: tone, label: LANDING_BLOCK_TONE_LABELS[tone] }))}
      />
    </div>
    </>
  );
  const pilihanTataLetak = LANDING_BLOCK_LAYOUTS[block.type];
  const tataLetak = pilihanTataLetak && layout ? (
    <div className="flex flex-col gap-1.5">
      <p className="text-body-medium font-medium text-on-surface">Layout</p>
      <SegmentedButton<LandingBlockLayout>
        label="Block layout"
        value={layout}
        onChange={(value) => ubah({ layout: value })}
        options={pilihanTataLetak.map((item) => ({ value: item.value, label: item.label }))}
      />
      <p className="text-body-small text-on-surface-variant">{pilihanTataLetak.find((item) => item.value === layout)?.hint}</p>
    </div>
  ) : null;

  // ---- Butir -----------------------------------------------------------------
  const kolomButir = (item: LandingBlockItem, index: number) => {
    const b = batas.item ?? {};
    const isian = (key: KolomButir, opsi: { hint?: string; optional?: boolean; area?: boolean } = {}) => {
      const label = labelIsianButir(block, key);
      return opsi.area ? (
        <TextArea label={label} optional={opsi.optional} hint={opsi.hint} rows={2} {...hitung(b[key])} value={item[key] ?? ""} onChange={(event) => ubahItem(index, { [key]: event.target.value })} />
      ) : (
        <TextField label={label} optional={opsi.optional} hint={opsi.hint} {...hitung(b[key])} value={item[key] ?? ""} onChange={(event) => ubahItem(index, { [key]: event.target.value })} />
      );
    };
    const gambar = (
      <ImageUploadField
        label={block.type === "logos" ? "Logo" : "Image"}
        hint={rasioGambarButir(block)}
        kind="landing"
        value={item.image_url ?? null}
        onChange={(url) => ubahItem(index, { image_url: url })}
        fit={block.type === "logos" ? "contain" : "cover"}
      />
    );
    const tautanButir = (hint: string) => (
      <TextField
        label="Link"
        optional
        hint={hint}
        placeholder="https://"
        maxLength={600}
        value={item.href ?? ""}
        onChange={(event) => {
          const href = event.target.value;
          // Kolom: teks tautan tanpa tautan tidak tampil, jadi ikut dikosongkan
          // supaya tidak dihitung sebagai teks yang belum diterjemahkan.
          ubahItem(index, block.type === "multicolumn" && !href.trim() ? { href, label: undefined, en: item.en ? { ...item.en, label: undefined } : undefined } : { href });
        }}
      />
    );
    switch (block.type) {
      case "stats":
        return (
          <>
            {isian("value", { hint: "e.g. 93,61%" })}
            {isian("label", { area: true, hint: "e.g. Indeks inklusi keuangan 2026, naik dari 76,19% pada 2019" })}
          </>
        );
      case "points":
        if (layout === "numbered") return isian("body", { area: true });
        if (layout === "list") return isian("title");
        return (
          <>
            {isian("title")}
            {isian("body", { area: true, optional: true })}
          </>
        );
      case "cards":
        return (
          <>
            {gambar}
            {layout === "overlay" ? (
              <div className="grid grid-cols-2 gap-3">
                {isian("label", { optional: true, hint: "e.g. Sesi 1" })}
                {isian("value", { optional: true, hint: "e.g. 09.45–10.30" })}
              </div>
            ) : (
              isian("label", { optional: true, hint: "e.g. Kelompok 1" })
            )}
            {isian("title")}
            {isian("body", { area: true, optional: true })}
            {tautanButir("Makes the card clickable.")}
          </>
        );
      case "logos":
        return (
          <>
            {gambar}
            {isian("label", { optional: true, hint: "Read out by screen readers." })}
            {tautanButir("The organisation's website.")}
          </>
        );
      case "multicolumn":
        return (
          <>
            {gambar}
            {isian("title", { optional: true, hint: "Fill in a title or text. A column with only an image is hidden." })}
            {isian("body", { area: true, optional: true })}
            {tautanButir("A link below the text, e.g. to a speaker page or #agenda.")}
            {item.href?.trim() ? isian("label", { optional: true, hint: "Default: Selengkapnya." }) : null}
          </>
        );
      default:
        return (
          <>
            {gambar}
            {isian("label", { optional: true, hint: "Read out by screen readers; not shown on the page." })}
          </>
        );
    }
  };

  const lebih = butirBerlebih(block);
  const penuh = batas.items?.full;
  const daftarButir = butir ? (
    <Kelompok judul={`${Butir}s (${items.length} of ${maks} max)`} catatan={penuh ? `Add ${daftarAngka(penuh)} ${butir}s to fill every row.` : undefined}>
      {lebih > 0 ? <Peringatan>This layout holds {plural(maks, butir)}. Delete {plural(lebih, butir)} before saving, or choose another layout.</Peringatan> : null}
      {penuh && items.length > 0 && !penuh.includes(items.length) && lebih === 0 ? (
        <Peringatan>With {plural(items.length, butir)}, the last row is not full.</Peringatan>
      ) : null}
      {items.length === 0 ? <p className="text-body-medium text-on-surface-variant">No {butir}s yet.</p> : null}
      {items.map((item, index) => {
        const buka = !ringkas || butirTerbuka === index;
        const nama = ringkas && item.title?.trim() ? item.title.trim() : `${Butir} ${index + 1}`;
        const kepanjangan = ringkas && !buka && butirKepanjangan(block, item, batas.item);
        return (
          <div key={index} className={cx("flex flex-col gap-3 rounded-md border border-outline-variant", ringkas && !buka ? "px-3 py-1" : "p-3")}>
            <div className="flex items-center justify-between gap-2">
              {ringkas ? (
                <button
                  type="button"
                  aria-expanded={buka}
                  onClick={() => setButirTerbuka(buka ? -1 : index)}
                  className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-sm text-left"
                >
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image_url} alt="" className="size-8 shrink-0 rounded-sm object-cover" />
                  ) : null}
                  <span className="truncate text-body-medium font-medium text-on-surface" title={nama}>{nama}</span>
                  {kepanjangan ? (
                    <span className="flex shrink-0 items-center gap-1 text-body-small text-error">
                      <WarningCircle size={14} weight="fill" aria-hidden />
                      Too long
                    </span>
                  ) : null}
                  <CaretDown size={14} aria-hidden className={cx("shrink-0 text-on-surface-variant transition-transform", buka && "rotate-180")} />
                </button>
              ) : (
                <p className="text-body-medium font-medium text-on-surface">{Butir} {index + 1}</p>
              )}
              <IconButton size="sm" label={`Delete ${nama}`} className="text-error" onClick={() => hapusButir(index)}>
                <Trash size={16} />
              </IconButton>
            </div>
            {buka ? kolomButir(item, index) : null}
          </div>
        );
      })}
      {items.length < maks ? (
        <div>
          <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => { setItems([...items, {}]); setButirTerbuka(items.length); }}>
            Add {butir}
          </Button>
        </div>
      ) : null}
    </Kelompok>
  ) : null;

  switch (block.type) {
    case "text_image":
      return (
        <div className="flex flex-col gap-4">
          {alis}
          {judul()}
          {area("body", "Body", { rows: 6, hint: "Separate paragraphs with a blank line. This limit keeps the text no taller than the image beside it." })}
          <Kelompok judul="Image" catatan="Ratio 14:13, at least 1120×1040. Cropped automatically.">
            <ImageUploadField label="Image" kind="landing" value={block.image_url ?? null} onChange={(url) => ubah({ image_url: url })} />
            <div className="flex flex-col gap-1.5">
              <p className="text-body-medium font-medium text-on-surface">Image position</p>
              <SegmentedButton<"left" | "right">
                label="Image position"
                value={block.image_side ?? "right"}
                onChange={(image_side) => ubah({ image_side })}
                options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]}
              />
            </div>
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
              {teks("fact_title", "Fact card", { optional: true, placeholder: "15 Okt 2026" })}
              {teks("fact_body", "Description", { optional: true, placeholder: "Nama tempat" })}
            </div>
          </Kelompok>
          <Kelompok judul="Buttons" catatan="Two at most. A button without a link is hidden.">
            {tautan("link_url", "Main button link", "e.g. a PDF link, or #agenda to jump to the Agenda.")}
            {block.link_url?.trim() ? teks("link_label", "Main button text", { optional: true }) : null}
            {tautan("link2_url", "Second button link", "An outlined button beside the main button.")}
            {block.link2_url?.trim() ? teks("link2_label", "Second button text", { optional: true }) : null}
          </Kelompok>
          {latar}
        </div>
      );
    case "cards":
    case "points":
    case "gallery":
      return (
        <div className="flex flex-col gap-4">
          {tataLetak}
          {alis}
          {judul()}
          {area("body", "Intro", { optional: true, rows: 2 })}
          {block.type === "cards" ? (
            <>
              {tautan("link_url", "Button link beside the heading", "e.g. #agenda to jump to the Agenda.")}
              {block.link_url?.trim() ? teks("link_label", "Button text", { optional: true }) : null}
            </>
          ) : null}
          {daftarButir}
          {latar}
        </div>
      );
    case "multicolumn": {
      const ringkasanTampilan = `${plural(landingColumnCount(block), "column")} · ${LANDING_IMAGE_SHAPE_LABELS[block.image_shape ?? "wide"]} · ${block.align === "center" ? "Centre" : "Left"} · ${LANDING_BLOCK_TONE_LABELS[block.tone ?? LANDING_BLOCK_DEFAULT_TONE.multicolumn]}`;
      return (
        <div className="flex flex-col gap-4">
          {alis}
          {judul()}
          {area("body", "Intro", { optional: true, rows: 2 })}
          {daftarButir}
          <div className="flex flex-col gap-4 border-t border-outline-variant pt-2">
            <button
              type="button"
              aria-expanded={tampilanTerbuka}
              onClick={() => setTampilanTerbuka((buka) => !buka)}
              className="m3-state -mx-2 flex min-h-12 items-center gap-2 rounded-sm px-2 text-left"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body-medium font-semibold text-on-surface">Appearance</span>
                <span className="truncate text-body-small text-on-surface-variant">{ringkasanTampilan}</span>
              </span>
              <CaretDown size={14} aria-hidden className={cx("shrink-0 text-on-surface-variant transition-transform", tampilanTerbuka && "rotate-180")} />
            </button>
            {tampilanTerbuka ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <p className="text-body-medium font-medium text-on-surface">Columns on wide screens</p>
                  <SegmentedButton<`${LandingColumnCount}`>
                    label="Number of columns"
                    value={`${landingColumnCount(block)}`}
                    onChange={(value) => ubah({ columns: Number(value) as LandingColumnCount })}
                    options={(["1", "2", "3", "4"] as const).map((value) => ({ value, label: value }))}
                  />
                  <p className="text-body-small text-on-surface-variant">Tablets show 2 columns at most, phones always 1.</p>
                </div>
                <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3">
                  <div className="flex flex-col gap-1.5">
                    <p className="text-body-medium font-medium text-on-surface">Image shape</p>
                    <SegmentedButton<LandingImageShape>
                      label="Image shape"
                      value={block.image_shape ?? "wide"}
                      onChange={(image_shape) => ubah({ image_shape })}
                      options={(["wide", "square", "circle"] as const).map((value) => ({ value, label: LANDING_IMAGE_SHAPE_LABELS[value] }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-body-medium font-medium text-on-surface">Alignment</p>
                    <SegmentedButton<"left" | "center">
                      label="Column alignment"
                      value={block.align === "center" ? "center" : "left"}
                      onChange={(align) => ubah({ align })}
                      options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }]}
                    />
                  </div>
                </div>
                {latar}
              </>
            ) : null}
          </div>
        </div>
      );
    }
    case "stats":
      return (
        <div className="flex flex-col gap-4">
          {judul("Heading", "e.g. Inklusi sudah tinggi. Kesehatan keuangan belum tentu.")}
          <p className="text-body-medium text-on-surface-variant">Use only real figures from the staff. The block stays hidden until it has figures and a source.</p>
          {daftarButir}
          {area("source", "Source", { rows: 2, hint: "Shown after the word \"Sumber:\". e.g. SNLIK 2026 oleh OJK dan BPS." })}
          {latar}
        </div>
      );
    case "quote":
      return (
        <div className="flex flex-col gap-4">
          {area("quote", "Quote", { hint: "Write it exactly as it was said, without quotation marks." })}
          {teks("name", "Name")}
          {teks("role", "Position and organisation", { optional: true })}
          <ImageUploadField label="Photo" hint="Without a photo, the initials of the name are shown." kind="landing" value={block.image_url ?? null} onChange={(url) => ubah({ image_url: url })} previewClassName="size-16" />
          {latar}
        </div>
      );
    case "logos":
      return (
        <div className="flex flex-col gap-4">
          {judul("Label", "e.g. Diselenggarakan oleh")}
          {daftarButir}
          <div className="flex flex-col gap-2">
            <p id={`label-rata-${block.id}`} className="text-body-medium font-medium text-on-surface">Alignment</p>
            <SegmentedButton<LandingBlockAlign>
              className="w-full"
              label="Alignment"
              labelledBy={`label-rata-${block.id}`}
              value={block.align ?? "left"}
              onChange={(align) => ubah({ align: align === "left" ? undefined : align })}
              options={(["left", "center", "right"] as const).map((value) => ({ value, label: LANDING_BLOCK_ALIGN_LABELS[value] }))}
            />
            <p className="text-body-small text-on-surface-variant">Moves the label and a last row that isn&apos;t full. Logos sit in equal cells, two per row on phones.</p>
          </div>
          {latar}
        </div>
      );
    case "download":
      return (
        <div className="flex flex-col gap-4">
          {alis}
          {judul()}
          {area("body", "Description", { optional: true })}
          <TextField
            label="File link"
            hint="A link to a PDF, e.g. from Google Drive, shared with anyone who has the link."
            placeholder="https://"
            maxLength={600}
            value={block.link_url ?? ""}
            onChange={(event) => ubah({ link_url: event.target.value })}
          />
          {teks("link_label", "Button text", { optional: true, hint: "Include the file type and size, e.g. Unduh TOR (PDF, 139 KB)." })}
          <ImageUploadField
            label="Cover"
            hint="Optional. Ratio 3:4. Without a cover, a front page is built from the block heading."
            kind="landing"
            value={block.image_url ?? null}
            onChange={(url) => ubah({ image_url: url })}
          />
          {latar}
        </div>
      );
    case "cta":
      return (
        <div className="flex flex-col gap-4">
          {judul()}
          {area("body", "Message", { optional: true, rows: 2 })}
          {teks("link_label", "Button text", { optional: true, hint: "Default: the registration button text set in the Hero section. The button only shows while registration is open." })}
          <ImageUploadField
            label="Background photo"
            hint="Optional. Ratio 20:7 on wide screens (at least 2400×840); cropped taller on phones. A dark overlay is added automatically so the text stays readable. Without a photo, the background is the brand colour."
            kind="landing"
            value={block.image_url ?? null}
            onChange={(url) => ubah({ image_url: url })}
          />
          <p className="text-body-small text-on-surface-variant">While this block is shown, the default call-to-action banner at the bottom of the page is hidden.</p>
        </div>
      );
  }
}
