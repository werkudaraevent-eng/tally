"use client";

import { Plus, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { Button, Dialog, IconButton, SegmentedButton, TextArea, TextField } from "@/components/m3";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import {
  LANDING_BLOCK_DEFAULT_TONE,
  LANDING_BLOCK_DESCRIPTIONS,
  LANDING_BLOCK_LABELS,
  LANDING_BLOCK_MAX_ITEMS,
  LANDING_BLOCK_TONE_LABELS,
  type LandingBlock,
  type LandingBlockId,
  type LandingBlockItem,
  type LandingBlockTone,
  type LandingBlockType,
} from "@/lib/domain";
import { cx } from "@/lib/m3/cx";

/**
 * CMS pustaka blok: dialog Tambah blok dan editor isi tiap jenis blok.
 * Rancangan: Figma "Pustaka blok (usulan)", frame CMS. Halaman publiknya ada di
 * components/landing/modern/landing-blocks.tsx.
 */

const URUTAN_JENIS: LandingBlockType[] = ["text_image", "cards", "gallery", "stats", "quote", "logos", "download", "cta"];

export function buatBlok(type: LandingBlockType): LandingBlock {
  const acak = Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 10);
  const id = `blk_${acak}` as LandingBlockId;
  return { id, type, tone: LANDING_BLOCK_DEFAULT_TONE[type], items: [] };
}

/** Tautan yang akan ditolak server, supaya galatnya bisa disebut per blok. */
export function tautanBlokSalah(block: LandingBlock): boolean {
  const salah = (value?: string) => Boolean(value?.trim()) && !/^https?:\/\/\S+$/.test(value!.trim());
  return salah(block.link_url) || (block.items ?? []).some((item) => salah(item.href));
}

/** Satu baris ringkasan untuk daftar susunan. */
export function ringkasanBlok(block: LandingBlock): string | null {
  const jumlah = (block.items ?? []).length;
  switch (block.type) {
    case "cards": return jumlah ? `${jumlah} kartu` : null;
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
      {type === "text_image" ? (<><span className="flex flex-1 flex-col justify-center gap-1">{garis("w-full", "h-1.5")}{garis("w-4/5")}{garis("w-full")}{garis("w-3/5")}</span><span className={cx(kotak, "w-11")} /></>) : null}
      {type === "cards" ? (<><span className="flex w-14 flex-col gap-1"><span className={cx(kotak, "h-9")} />{garis("w-4/5", "h-1.5")}</span><span className="flex flex-1 flex-col gap-1"><span className={cx(kotak, "flex-1")} /><span className={cx(kotak, "flex-1")} /></span></>) : null}
      {type === "gallery" ? (<><span className={cx(kotak, "w-12")} /><span className="flex flex-1 flex-col gap-1"><span className={cx(kotak, "flex-1")} /><span className="flex flex-1 gap-1"><span className={cx(kotak, "flex-1")} /><span className={cx(kotak, "flex-1")} /></span></span></>) : null}
      {type === "stats" ? (<span className="flex flex-1 items-center gap-2">{garis("w-6", "h-1.5")}{[0, 1, 2].map((key) => <span key={key} className="flex flex-1 flex-col gap-1 border-l border-white/30 pl-1">{garis("w-full", "h-2")}{garis("w-3/4")}</span>)}</span>) : null}
      {type === "quote" ? (<span className="flex flex-1 flex-col justify-center gap-1.5">{garis("w-full", "h-1.5")}{garis("w-4/5", "h-1.5")}<span className="mt-1 flex items-center gap-1"><span className="size-3 rounded-full bg-outline-variant" />{garis("w-8")}</span></span>) : null}
      {type === "logos" ? (<span className="flex flex-1 items-center gap-1.5">{[0, 1, 2].map((key) => <span key={key} className={cx(kotak, "h-5 flex-1")} />)}</span>) : null}
      {type === "download" ? (<span className="flex flex-1 items-center gap-2 rounded-[3px] bg-surface-container-lowest p-1.5"><span className={cx(kotak, "h-10 w-7")} /><span className="flex flex-1 flex-col gap-1">{garis("w-full", "h-1.5")}{garis("w-3/4")}<span className="h-2 w-8 rounded-[2px] bg-primary" /></span></span>) : null}
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

const ITEM_BARU: Partial<Record<LandingBlockType, LandingBlockItem>> = {
  cards: { title: "" },
  gallery: { image_url: null },
  stats: { value: "", label: "" },
  logos: { image_url: null },
};

const LABEL_BUTIR: Partial<Record<LandingBlockType, string>> = {
  cards: "kartu",
  gallery: "foto",
  stats: "angka",
  logos: "logo",
};

export function BlockEditor({ block, onChange }: { block: LandingBlock; onChange: (next: LandingBlock) => void }) {
  const ubah = (patch: Partial<LandingBlock>) => onChange({ ...block, ...patch });
  const items = block.items ?? [];
  const setItems = (next: LandingBlockItem[]) => ubah({ items: next });
  const ubahItem = (index: number, patch: Partial<LandingBlockItem>) => setItems(items.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  const maks = LANDING_BLOCK_MAX_ITEMS[block.type] ?? 0;
  const butir = LABEL_BUTIR[block.type];

  const judul = (label = "Judul", hint?: string) => (
    <TextField label={label} hint={hint} maxLength={160} value={block.heading ?? ""} onChange={(event) => ubah({ heading: event.target.value })} />
  );
  const alis = <TextField label="Label kecil" optional hint="Satu-dua kata di atas judul." maxLength={60} value={block.eyebrow ?? ""} onChange={(event) => ubah({ eyebrow: event.target.value })} />;
  const isi = (label = "Isi", rows = 4) => (
    <TextArea label={label} optional rows={rows} maxLength={1200} value={block.body ?? ""} onChange={(event) => ubah({ body: event.target.value })} />
  );
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

  const daftarButir = butir ? (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? <p className="text-body-medium text-on-surface-variant">Belum ada {butir}.</p> : null}
      {items.map((item, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-md border border-outline-variant p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-body-medium font-medium text-on-surface">
              {butir[0].toUpperCase() + butir.slice(1)} {index + 1}
            </p>
            <IconButton size="sm" label={`Hapus ${butir} ${index + 1}`} className="text-error" onClick={() => setItems(items.filter((_, position) => position !== index))}>
              <Trash size={16} />
            </IconButton>
          </div>
          {block.type === "stats" ? (
            <div className="flex items-end gap-2">
              <TextField className="w-28" label="Angka" maxLength={30} value={item.value ?? ""} onChange={(event) => ubahItem(index, { value: event.target.value })} />
              <TextField className="min-w-0 flex-1" label="Keterangan" maxLength={80} value={item.label ?? ""} onChange={(event) => ubahItem(index, { label: event.target.value })} />
            </div>
          ) : (
            <>
              <ImageUploadField
                label={block.type === "logos" ? "Logo" : "Gambar"}
                kind="landing"
                value={item.image_url ?? null}
                onChange={(url) => ubahItem(index, { image_url: url })}
                fit={block.type === "logos" ? "contain" : "cover"}
              />
              {block.type === "cards" ? (
                <>
                  <TextField label="Label kecil" optional hint="Mis. Sesi 1" maxLength={80} value={item.label ?? ""} onChange={(event) => ubahItem(index, { label: event.target.value })} />
                  <TextField label="Judul" maxLength={160} value={item.title ?? ""} onChange={(event) => ubahItem(index, { title: event.target.value })} />
                  <TextArea label="Keterangan" optional rows={2} maxLength={400} value={item.body ?? ""} onChange={(event) => ubahItem(index, { body: event.target.value })} />
                  <TextField label="Tautan" optional hint="Kartu bisa dibuka bila diisi." placeholder="https://" maxLength={600} value={item.href ?? ""} onChange={(event) => ubahItem(index, { href: event.target.value })} />
                </>
              ) : (
                <TextField
                  label={block.type === "logos" ? "Nama mitra" : "Keterangan foto"}
                  optional
                  hint={block.type === "logos" ? "Dibacakan pembaca layar." : "Dibacakan pembaca layar; tidak tampil di halaman."}
                  maxLength={80}
                  value={item.label ?? ""}
                  onChange={(event) => ubahItem(index, { label: event.target.value })}
                />
              )}
            </>
          )}
        </div>
      ))}
      {items.length < maks ? (
        <div>
          <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setItems([...items, { ...ITEM_BARU[block.type] }])}>
            Tambah {butir}
          </Button>
        </div>
      ) : null}
    </div>
  ) : null;

  switch (block.type) {
    case "text_image":
      return (
        <div className="flex flex-col gap-4">
          {alis}
          {judul()}
          {isi()}
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
          <TextField label="Tautan tombol" optional placeholder="https://" maxLength={600} value={block.link_url ?? ""} onChange={(event) => ubah({ link_url: event.target.value })} />
          {block.link_url?.trim() ? (
            <TextField label="Teks tombol" optional maxLength={60} value={block.link_label ?? ""} onChange={(event) => ubah({ link_label: event.target.value })} />
          ) : null}
          {latar}
        </div>
      );
    case "cards":
    case "gallery":
      return (
        <div className="flex flex-col gap-4">
          {block.type === "cards" ? alis : null}
          {judul()}
          {isi("Pengantar", 2)}
          {daftarButir}
          {latar}
        </div>
      );
    case "stats":
      return (
        <div className="flex flex-col gap-4">
          {judul("Judul", "Mis. Forum dalam angka")}
          <p className="text-body-medium text-on-surface-variant">Isi hanya dengan angka asli dari panitia. Blok tidak tampil selama belum ada angka.</p>
          {daftarButir}
          {latar}
        </div>
      );
    case "quote":
      return (
        <div className="flex flex-col gap-4">
          <TextArea label="Kutipan" rows={3} maxLength={600} hint="Tulis persis seperti yang disampaikan, tanpa tanda kutip." value={block.quote ?? ""} onChange={(event) => ubah({ quote: event.target.value })} />
          <TextField label="Nama" maxLength={120} value={block.name ?? ""} onChange={(event) => ubah({ name: event.target.value })} />
          <TextField label="Jabatan dan lembaga" optional maxLength={160} value={block.role ?? ""} onChange={(event) => ubah({ role: event.target.value })} />
          <ImageUploadField label="Foto" hint="Tanpa foto, inisial nama yang tampil." kind="landing" value={block.image_url ?? null} onChange={(url) => ubah({ image_url: url })} previewClassName="size-16" />
          {latar}
        </div>
      );
    case "logos":
      return (
        <div className="flex flex-col gap-4">
          {judul("Judul", "Mis. Diselenggarakan bersama")}
          {daftarButir}
          {latar}
        </div>
      );
    case "download":
      return (
        <div className="flex flex-col gap-4">
          {judul()}
          {isi("Keterangan", 2)}
          <TextField
            label="Tautan berkas"
            hint="Tautan ke PDF, mis. dari Google Drive dengan akses siapa saja yang punya tautan."
            placeholder="https://"
            maxLength={600}
            value={block.link_url ?? ""}
            onChange={(event) => ubah({ link_url: event.target.value })}
          />
          <TextField label="Teks tombol" optional hint="Bawaan: Unduh materi" maxLength={60} value={block.link_label ?? ""} onChange={(event) => ubah({ link_label: event.target.value })} />
          {latar}
        </div>
      );
    case "cta":
      return (
        <div className="flex flex-col gap-4">
          {judul()}
          {isi("Kalimat", 2)}
          <TextField label="Teks tombol" optional hint="Bawaan: teks tombol daftar di tab Tampilan. Tombol hanya tampil saat pendaftaran dibuka." maxLength={60} value={block.link_label ?? ""} onChange={(event) => ubah({ link_label: event.target.value })} />
        </div>
      );
  }
}
