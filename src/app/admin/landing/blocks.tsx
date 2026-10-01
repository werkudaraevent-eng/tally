"use client";

import { Plus, Trash, WarningCircle } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { Button, Dialog, IconButton, SegmentedButton, TextArea, TextField } from "@/components/m3";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import {
  LANDING_BLOCK_DEFAULT_TONE,
  LANDING_BLOCK_DESCRIPTIONS,
  LANDING_BLOCK_LABELS,
  LANDING_BLOCK_LAYOUTS,
  LANDING_BLOCK_TONE_LABELS,
  landingBlockLayout,
  landingBlockLimits,
  type LandingBlock,
  type LandingBlockId,
  type LandingBlockItem,
  type LandingBlockLayout,
  type LandingBlockTone,
  type LandingBlockType,
  type LandingTextLimit,
} from "@/lib/domain";
import { cx } from "@/lib/m3/cx";

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

const URUTAN_JENIS: LandingBlockType[] = ["text_image", "cards", "points", "stats", "logos", "download", "cta", "gallery", "quote"];

export function buatBlok(type: LandingBlockType): LandingBlock {
  const acak = Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 10);
  const id = `blk_${acak}` as LandingBlockId;
  const layout = LANDING_BLOCK_LAYOUTS[type]?.[0]?.value;
  return { id, type, tone: LANDING_BLOCK_DEFAULT_TONE[type], ...(layout ? { layout } : {}), items: [] };
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
    case "cards": return jumlah ? `${jumlah} kartu` : null;
    case "points": return jumlah ? `${jumlah} poin` : null;
    case "gallery": return jumlah ? `${jumlah} foto` : null;
    case "stats": return jumlah ? `${jumlah} angka` : null;
    case "logos": return jumlah ? `${jumlah} logo` : null;
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
      title="Tambah blok"
      description="Blok baru masuk di akhir susunan. Seret atau pakai tombol panah untuk memindahkannya."
      actions={
        <>
          <Button variant="text" onClick={onClose}>Batal</Button>
          <Button onClick={() => onPick(pilih)}>Tambahkan {LANDING_BLOCK_LABELS[pilih]}</Button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Jenis blok" className="grid gap-3 sm:grid-cols-2">
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
  cards: "kartu",
  points: "poin",
  gallery: "foto",
  stats: "angka",
  logos: "logo",
};

/** Rasio slot gambar per jenis dan tata letak. Hint menyebutnya karena gambar dipotong ke rasio ini. */
function rasioGambarButir(block: LandingBlock): string {
  if (block.type === "logos") return "PNG atau SVG berlatar transparan. Tampil setinggi 40 px, lebar paling banyak 160 px.";
  if (block.type === "gallery") return "Rasio 4:3, minimal 1200×900. Dipotong otomatis.";
  const layout = landingBlockLayout(block);
  if (layout === "overlay") return "Rasio 3:2, minimal 1200×800. Bagian bawah foto tertutup bayangan gelap tempat judul berdiri.";
  if (layout === "columns") return "Rasio 3:2, minimal 768×512. Isi semua kartu dengan gambar, atau kosongkan semuanya, supaya sejajar.";
  return "Rasio 16:9 untuk kartu pertama, 3:2 untuk yang lain. Dipotong otomatis.";
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
  return angka.length <= 2 ? angka.join(" atau ") : `${angka.slice(0, -1).join(", ")}, atau ${angka[angka.length - 1]}`;
}

type KolomTeks = "eyebrow" | "heading" | "body" | "link_label" | "link2_label" | "fact_title" | "fact_body" | "source" | "quote" | "name" | "role";
type KolomButir = "label" | "title" | "body" | "value";

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
    <TextField label={label} optional hint={hint} placeholder="https:// atau #agenda" maxLength={600} value={block[key] ?? ""} onChange={(event) => ubah({ [key]: event.target.value })} />
  );
  const alis = teks("eyebrow", "Label kecil", { optional: true, hint: "Satu sampai tiga kata di atas judul." });
  const judul = (label = "Judul", hint?: string) => teks("heading", label, { hint });
  const latar = block.type === "cta" ? null : (
    <div className="flex flex-col gap-1.5">
      <p className="text-body-medium font-medium text-on-surface">Latar</p>
      <SegmentedButton<LandingBlockTone>
        label="Latar blok"
        value={block.tone ?? LANDING_BLOCK_DEFAULT_TONE[block.type]}
        onChange={(tone) => ubah({ tone })}
        options={(["light", "panel", "dark"] as const).map((tone) => ({ value: tone, label: LANDING_BLOCK_TONE_LABELS[tone] }))}
      />
    </div>
  );
  const pilihanTataLetak = LANDING_BLOCK_LAYOUTS[block.type];
  const tataLetak = pilihanTataLetak && layout ? (
    <div className="flex flex-col gap-1.5">
      <p className="text-body-medium font-medium text-on-surface">Tata letak</p>
      <SegmentedButton<LandingBlockLayout>
        label="Tata letak blok"
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
    const isian = (key: KolomButir, label: string, opsi: { hint?: string; optional?: boolean; area?: boolean } = {}) =>
      opsi.area ? (
        <TextArea label={label} optional={opsi.optional} hint={opsi.hint} rows={2} {...hitung(b[key])} value={item[key] ?? ""} onChange={(event) => ubahItem(index, { [key]: event.target.value })} />
      ) : (
        <TextField label={label} optional={opsi.optional} hint={opsi.hint} {...hitung(b[key])} value={item[key] ?? ""} onChange={(event) => ubahItem(index, { [key]: event.target.value })} />
      );
    const gambar = (
      <ImageUploadField
        label={block.type === "logos" ? "Logo" : "Gambar"}
        hint={rasioGambarButir(block)}
        kind="landing"
        value={item.image_url ?? null}
        onChange={(url) => ubahItem(index, { image_url: url })}
        fit={block.type === "logos" ? "contain" : "cover"}
      />
    );
    const tautanButir = (hint: string) => (
      <TextField label="Tautan" optional hint={hint} placeholder="https://" maxLength={600} value={item.href ?? ""} onChange={(event) => ubahItem(index, { href: event.target.value })} />
    );
    switch (block.type) {
      case "stats":
        return (
          <>
            {isian("value", "Angka", { hint: "Mis. 93,61%" })}
            {isian("label", "Keterangan", { area: true, hint: "Mis. Indeks inklusi keuangan 2026, naik dari 76,19% pada 2019" })}
          </>
        );
      case "points":
        if (layout === "numbered") return isian("body", "Isi baris", { area: true });
        if (layout === "list") return isian("title", "Butir");
        return (
          <>
            {isian("title", "Judul kartu")}
            {isian("body", "Isi kartu", { area: true, optional: true })}
          </>
        );
      case "cards":
        return (
          <>
            {gambar}
            {layout === "overlay" ? (
              <div className="grid grid-cols-2 gap-3">
                {isian("label", "Chip 1", { optional: true, hint: "Mis. Sesi 1" })}
                {isian("value", "Chip 2", { optional: true, hint: "Mis. 09.45–10.30" })}
              </div>
            ) : (
              isian("label", "Label kecil", { optional: true, hint: "Mis. Kelompok 1" })
            )}
            {isian("title", "Judul")}
            {isian("body", layout === "columns" ? "Keterangan atau penerbit" : "Keterangan", { area: true, optional: true })}
            {tautanButir("Kartu bisa dibuka bila diisi.")}
          </>
        );
      case "logos":
        return (
          <>
            {gambar}
            {isian("label", "Nama lembaga", { optional: true, hint: "Dibacakan pembaca layar." })}
            {tautanButir("Situs lembaga, opsional.")}
          </>
        );
      default:
        return (
          <>
            {gambar}
            {isian("label", "Keterangan foto", { optional: true, hint: "Dibacakan pembaca layar; tidak tampil di halaman." })}
          </>
        );
    }
  };

  const lebih = butirBerlebih(block);
  const penuh = batas.items?.full;
  const daftarButir = butir ? (
    <Kelompok judul={`${Butir} (${items.length} dari maks ${maks})`} catatan={penuh ? `Isi ${daftarAngka(penuh)} ${butir} supaya barisnya penuh.` : undefined}>
      {lebih > 0 ? <Peringatan>Tata letak ini menampung {maks} {butir}. Hapus {lebih} {butir} sebelum menyimpan, atau pilih tata letak lain.</Peringatan> : null}
      {penuh && items.length > 0 && !penuh.includes(items.length) && lebih === 0 ? (
        <Peringatan>Dengan {items.length} {butir}, baris terakhir tidak penuh.</Peringatan>
      ) : null}
      {items.length === 0 ? <p className="text-body-medium text-on-surface-variant">Belum ada {butir}.</p> : null}
      {items.map((item, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-md border border-outline-variant p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-body-medium font-medium text-on-surface">{Butir} {index + 1}</p>
            <IconButton size="sm" label={`Hapus ${butir} ${index + 1}`} className="text-error" onClick={() => setItems(items.filter((_, position) => position !== index))}>
              <Trash size={16} />
            </IconButton>
          </div>
          {kolomButir(item, index)}
        </div>
      ))}
      {items.length < maks ? (
        <div>
          <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setItems([...items, {}])}>
            Tambah {butir}
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
          {area("body", "Isi", { rows: 6, hint: "Pisahkan paragraf dengan satu baris kosong. Batas ini menjaga teks tidak lebih tinggi dari gambar di sampingnya." })}
          <Kelompok judul="Gambar" catatan="Rasio 14:13, minimal 1120×1040. Dipotong otomatis.">
            <ImageUploadField label="Gambar" kind="landing" value={block.image_url ?? null} onChange={(url) => ubah({ image_url: url })} />
            <div className="flex flex-col gap-1.5">
              <p className="text-body-medium font-medium text-on-surface">Posisi gambar</p>
              <SegmentedButton<"left" | "right">
                label="Posisi gambar"
                value={block.image_side ?? "right"}
                onChange={(image_side) => ubah({ image_side })}
                options={[{ value: "left", label: "Kiri" }, { value: "right", label: "Kanan" }]}
              />
            </div>
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
              {teks("fact_title", "Kartu fakta", { optional: true, placeholder: "15 Okt 2026" })}
              {teks("fact_body", "Keterangan", { optional: true, placeholder: "Nama tempat" })}
            </div>
          </Kelompok>
          <Kelompok judul="Tombol" catatan="Paling banyak dua. Tombol tanpa tautan tidak tampil.">
            {tautan("link_url", "Tautan tombol utama", "Mis. tautan PDF, atau #agenda untuk menuju Susunan acara.")}
            {block.link_url?.trim() ? teks("link_label", "Teks tombol utama", { optional: true }) : null}
            {tautan("link2_url", "Tautan tombol kedua", "Tombol bergaris di samping tombol utama.")}
            {block.link2_url?.trim() ? teks("link2_label", "Teks tombol kedua", { optional: true }) : null}
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
          {area("body", "Pengantar", { optional: true, rows: 2 })}
          {block.type === "cards" ? (
            <>
              {tautan("link_url", "Tautan tombol di samping judul", "Mis. #agenda untuk menuju Susunan acara.")}
              {block.link_url?.trim() ? teks("link_label", "Teks tombol", { optional: true }) : null}
            </>
          ) : null}
          {daftarButir}
          {latar}
        </div>
      );
    case "stats":
      return (
        <div className="flex flex-col gap-4">
          {judul("Judul", "Mis. Inklusi sudah tinggi. Kesehatan keuangan belum tentu.")}
          <p className="text-body-medium text-on-surface-variant">Isi hanya dengan angka asli dari panitia. Blok tidak tampil selama belum ada angka dan sumbernya.</p>
          {daftarButir}
          {area("source", "Sumber", { rows: 2, hint: "Tampil setelah kata \"Sumber:\". Mis. SNLIK 2026 oleh OJK dan BPS." })}
          {latar}
        </div>
      );
    case "quote":
      return (
        <div className="flex flex-col gap-4">
          {area("quote", "Kutipan", { hint: "Tulis persis seperti yang disampaikan, tanpa tanda kutip." })}
          {teks("name", "Nama")}
          {teks("role", "Jabatan dan lembaga", { optional: true })}
          <ImageUploadField label="Foto" hint="Tanpa foto, inisial nama yang tampil." kind="landing" value={block.image_url ?? null} onChange={(url) => ubah({ image_url: url })} previewClassName="size-16" />
          {latar}
        </div>
      );
    case "logos":
      return (
        <div className="flex flex-col gap-4">
          {judul("Label", "Mis. Diselenggarakan oleh")}
          {daftarButir}
          {latar}
        </div>
      );
    case "download":
      return (
        <div className="flex flex-col gap-4">
          {alis}
          {judul()}
          {area("body", "Keterangan", { optional: true })}
          <TextField
            label="Tautan berkas"
            hint="Tautan ke PDF, mis. dari Google Drive dengan akses siapa saja yang punya tautan."
            placeholder="https://"
            maxLength={600}
            value={block.link_url ?? ""}
            onChange={(event) => ubah({ link_url: event.target.value })}
          />
          {teks("link_label", "Teks tombol", { optional: true, hint: "Sertakan jenis dan ukuran berkas, mis. Unduh TOR (PDF, 139 KB)." })}
          <ImageUploadField
            label="Sampul"
            hint="Opsional. Rasio 3:4. Tanpa sampul, halaman depan disusun dari judul blok."
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
          {area("body", "Kalimat", { optional: true, rows: 2 })}
          {teks("link_label", "Teks tombol", { optional: true, hint: "Bawaan: teks tombol daftar di tab Tampilan. Tombol hanya tampil saat pendaftaran dibuka." })}
          <ImageUploadField
            label="Foto latar"
            hint="Opsional. Rasio 20:7 di layar lebar (minimal 2400×840); di ponsel dipotong lebih tegak. Lapisan gelap dipasang otomatis supaya teks terbaca. Tanpa foto, latarnya warna merek."
            kind="landing"
            value={block.image_url ?? null}
            onChange={(url) => ubah({ image_url: url })}
          />
          <p className="text-body-small text-on-surface-variant">Selama blok ini tampil, banner ajakan bawaan di bawah halaman tidak ditampilkan.</p>
        </div>
      );
  }
}
