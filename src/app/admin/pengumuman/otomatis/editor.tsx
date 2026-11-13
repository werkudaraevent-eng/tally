"use client";

import { ArrowDown, ArrowUp, CaretDown, CaretRight, LinkSimple, ListBullets, Plus, TextB, TextItalic, Trash, UploadSimple } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import Link from "@/components/event-link";
import { Button, IconButton, Popover, POPOVER_ITEM, SegmentedButton, Switch, TextField, usePopoverAnchor } from "@/components/m3";
import { useToast } from "@/components/toast";
import type { KonteksDasar } from "@/lib/email/konfirmasi/konteks";
import { type RenderState } from "@/lib/email/konfirmasi/render";
import { ADDABLE, BLOCK_LABELS, PRESET_LABELS, type Block, type BlockType, type Preset } from "@/lib/email/konfirmasi/templat";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import { siapkanGambar, unggah } from "./gambar";
import { TeksTumbuh, VERSI, type Data } from "./bersama";

export function KartuPreset({ preset, dipilih, dasar, kvUrl, onPilih }: { preset: Preset; dipilih: boolean; dasar: KonteksDasar; kvUrl: string | null; onPilih: () => void }) {
  const info = PRESET_LABELS[preset];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={dipilih}
      onClick={onPilih}
      className={cx(
        "m3-state flex flex-col gap-2 rounded-md border bg-surface-container-lowest p-2 text-start",
        dipilih ? "border-primary ring-1 ring-primary" : "border-outline-variant",
      )}
    >
      <span aria-hidden className="block h-16 overflow-hidden rounded-sm border border-outline-variant bg-white">
        {preset === "banner" ? (
          <span className="flex h-10 items-center px-2" style={{ background: kvUrl ? `${dasar.brand} url("${kvUrl}") center/cover` : dasar.brand }}>
            <span className="h-3 w-10 rounded-[2px] bg-white/90" />
          </span>
        ) : preset === "pita" ? (
          <span className="flex h-10 flex-col justify-center gap-1 px-2" style={{ background: dasar.brand }}>
            <span className="h-1.5 w-6 rounded-[2px] bg-white/80" />
            <span className="h-2 w-16 rounded-[2px] bg-white" />
          </span>
        ) : (
          <span className="flex h-10 flex-col justify-center gap-1.5 px-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- miniatur logo dari Tema */}
            {dasar.logoUrl ? <img src={dasar.logoUrl} alt="" className="h-4 w-auto self-start" /> : <span className="h-2 w-12 rounded-[2px] bg-on-surface/60" />}
            <span className="h-0.5 w-5" style={{ background: dasar.brand }} />
          </span>
        )}
        <span className="mx-2 mt-1.5 block h-1.5 w-20 rounded-[2px] bg-on-surface/25" />
      </span>
      <span className="text-label-large font-semibold text-on-surface">{info.label}</span>
      <span className="-mt-1.5 text-body-small text-on-surface-variant">{info.note}</span>
    </button>
  );
}

export function ringkasan(block: Block, data: Data, state: RenderState): string {
  if (state === "rejected" && block.type !== "kepala" && block.type !== "pembuka") return "Not in the Rejected version";
  switch (block.type) {
    case "kepala":
      return "From the preset and the event Theme";
    case "pembuka":
      return block[VERSI[state].judul] || "Title and greeting";
    case "tiket":
      return state === "pending" ? "Pending approval box" : "Participant code, QR and button";
    case "detail":
      return [data.dasar.detail.tanggal, data.dasar.detail.tempat].filter(Boolean).join(" · ") || "Date and venue aren't set in the event details";
    case "teks":
      return block.isi.split("\n")[0]?.slice(0, 80) || "Empty text";
    case "gambar":
      return block.url ? block.alt || "Alt text missing" : "No image yet";
    case "tombol":
      return block.label;
    case "info":
      return block.judul || "Info box";
    case "mitra":
      return data.dasar.mitra.length ? `${plural(Math.min(8, data.dasar.mitra.length), "logo")} from the Event page` : "No partner logos on the Event page yet";
    case "garis":
      return "Thin divider line";
  }
}

export function BarisBagian({
  block,
  pertama,
  terakhir,
  terbuka,
  ringkas,
  belumDiterjemahkan,
  onBuka,
  onNyala,
  onGeser,
  onHapus,
  children,
}: {
  block: Block;
  pertama: boolean;
  terakhir: boolean;
  terbuka: boolean;
  ringkas: string;
  belumDiterjemahkan: boolean;
  onBuka: () => void;
  onNyala: (on: boolean) => void;
  onGeser: (arah: -1 | 1) => void;
  onHapus: () => void;
  children: React.ReactNode;
}) {
  const wajib = block.type === "kepala" || block.type === "tiket" || block.type === "pembuka";
  const bisaDibuka = block.type !== "kepala" && block.type !== "tiket" && block.type !== "detail" && block.type !== "garis";
  const panelId = `bagian-${block.id}`;
  return (
    <li className={cx("border-b border-outline-variant last:border-b-0", terbuka && bisaDibuka && "bg-primary-soft/40")}>
      <div className="flex items-center gap-2 py-2 pe-3 ps-2">
        <button
          type="button"
          onClick={bisaDibuka ? onBuka : undefined}
          aria-expanded={bisaDibuka ? terbuka : undefined}
          aria-controls={bisaDibuka ? panelId : undefined}
          disabled={!bisaDibuka}
          className="m3-state flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-sm px-2 text-start disabled:cursor-default"
        >
          <span aria-hidden className="w-4 shrink-0 text-on-surface-variant">
            {bisaDibuka ? terbuka ? <CaretDown size={16} /> : <CaretRight size={16} /> : null}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-body-large font-semibold text-on-surface">
              {BLOCK_LABELS[block.type]}
              {belumDiterjemahkan ? (
                <>
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-warning" />
                  <span className="sr-only">(not translated yet)</span>
                </>
              ) : null}
            </span>
            <span className="block truncate text-body-small text-on-surface-variant">{ringkas}</span>
          </span>
        </button>
        {block.type !== "kepala" ? (
          <>
            <IconButton size="sm" label={`Move ${BLOCK_LABELS[block.type]} up`} disabled={pertama} onClick={() => onGeser(-1)}>
              <ArrowUp size={18} />
            </IconButton>
            <IconButton size="sm" label={`Move ${BLOCK_LABELS[block.type]} down`} disabled={terakhir} onClick={() => onGeser(1)}>
              <ArrowDown size={18} />
            </IconButton>
          </>
        ) : null}
        {wajib ? (
          <Switch label={BLOCK_LABELS[block.type]} labelHidden kunci checked onChange={() => undefined} className="w-11 shrink-0" />
        ) : (
          <>
            <IconButton size="sm" label={`Delete ${BLOCK_LABELS[block.type]}`} onClick={onHapus}>
              <Trash size={18} />
            </IconButton>
            <Switch label={`Show ${BLOCK_LABELS[block.type]}`} labelHidden checked={block.on} onChange={onNyala} className="w-11 shrink-0" />
          </>
        )}
      </div>
      {terbuka && bisaDibuka ? (
        <div id={panelId} className="flex flex-col gap-3 px-5 pb-5 ps-12">
          {children}
        </div>
      ) : null}
    </li>
  );
}

export function Toolbar({ onTebal, onMiring, onTautan, onDaftar }: { onTebal: () => void; onMiring: () => void; onTautan: () => void; onDaftar: () => void }) {
  const tahan = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div role="toolbar" aria-label="Text format" className="flex flex-wrap items-center gap-1">
      <IconButton size="sm" label="Bold (**text**)" onMouseDown={tahan} onClick={onTebal}>
        <TextB size={18} weight="bold" />
      </IconButton>
      <IconButton size="sm" label="Italic (_text_)" onMouseDown={tahan} onClick={onMiring}>
        <TextItalic size={18} />
      </IconButton>
      <IconButton size="sm" label="Link ([text](https://...))" onMouseDown={tahan} onClick={onTautan}>
        <LinkSimple size={18} />
      </IconButton>
      <IconButton size="sm" label="Bulleted list (- at the start of a line)" onMouseDown={tahan} onClick={onDaftar}>
        <ListBullets size={18} />
      </IconButton>
      <span className="ms-2 text-body-small text-on-surface-variant">**bold** · _italic_ · [text](https://…) · - list</span>
    </div>
  );
}

/** Potongan teks Indonesia untuk petunjuk di bawah kolom English. */
function kutip(teks: string): string {
  const satu = teks.replace(/\s+/g, " ").trim();
  return `“${satu.length > 120 ? `${satu.slice(0, 117)}…` : satu}”`;
}

export function EditorBagian({
  block,
  blockEn,
  state,
  data,
  onUbah,
  onFokus,
  toolbar,
  sisipkan,
}: {
  block: Block;
  /** Bagian ini seperti diterima pendaftar English; null saat mengedit Indonesia. */
  blockEn: Block | null;
  state: RenderState;
  data: Data;
  pembuka: Extract<Block, { type: "pembuka" }> | null;
  onUbah: (next: Partial<Block>) => void;
  onFokus: (kunci: string, el: HTMLInputElement | HTMLTextAreaElement) => void;
  toolbar: (kunci: string) => React.ReactNode;
  sisipkan: React.ReactNode;
}) {
  const toast = useToast();
  const [mengunggah, setMengunggah] = useState(false);

  /**
   * Nilai, placeholder, petunjuk, dan pengubah satu kolom dalam bahasa yang
   * diedit. English: kolom kosong memakai yang akan diterima pendaftar English
   * (bawaan English, atau teks Indonesia untuk teks bebas), dan teks Indonesia
   * selalu tampil di bawahnya.
   */
  function kolom(kunci: string, petunjuk?: string) {
    const asli = block as unknown as Record<string, string> & { en?: Record<string, string | undefined> };
    const idNilai = asli[kunci] ?? "";
    if (!blockEn) return { value: idNilai, hint: petunjuk, onChange: (nilai: string) => onUbah({ [kunci]: nilai } as Partial<Block>) };
    const jadi = (blockEn as unknown as Record<string, string>)[kunci] ?? "";
    const tetapIndonesia = !!idNilai.trim() && jadi === idNilai;
    return {
      value: asli.en?.[kunci] ?? "",
      placeholder: tetapIndonesia ? "Not translated: English registrants see the Indonesian text" : jadi,
      hint: idNilai.trim() ? `${tetapIndonesia ? "" : "Empty: uses the English default. "}Indonesian: ${kutip(idNilai)}` : petunjuk,
      onChange: (nilai: string) => onUbah({ en: { ...asli.en, [kunci]: nilai } } as Partial<Block>),
    };
  }

  switch (block.type) {
    case "pembuka": {
      const kJudul = VERSI[state].judul;
      const kIsi = VERSI[state].isi;
      const judul = kolom(kJudul);
      const isi = kolom(kIsi);
      return (
        <>
          <p className="text-body-small text-on-surface-variant">
            Editing the {blockEn ? "English " : ""}
            {VERSI[state].panjang} version. Switch versions and languages in the Editing row.
          </p>
          <TextField label="Title" {...judul} maxLength={120} onFocus={(e) => onFokus(kJudul, e.currentTarget)} onChange={(e) => judul.onChange(e.target.value)} />
          {toolbar(kIsi)}
          <TeksTumbuh label="Greeting" {...isi} maxLength={2000} onFocus={(e) => onFokus(kIsi, e.currentTarget)} onChange={(e) => isi.onChange(e.target.value)} />
          {sisipkan}
        </>
      );
    }
    case "teks": {
      const isi = kolom("isi");
      return (
        <>
          {toolbar("isi")}
          <TeksTumbuh label="Text" {...isi} maxLength={2000} onFocus={(e) => onFokus("isi", e.currentTarget)} onChange={(e) => isi.onChange(e.target.value)} />
          {sisipkan}
        </>
      );
    }
    case "info": {
      const judul = kolom("judul");
      const isi = kolom("isi");
      return (
        <>
          <TextField label="Box title" {...judul} maxLength={120} onFocus={(e) => onFokus("judul", e.currentTarget)} onChange={(e) => judul.onChange(e.target.value)} />
          {toolbar("isi")}
          <TeksTumbuh label="Body" {...isi} maxLength={2000} onFocus={(e) => onFokus("isi", e.currentTarget)} onChange={(e) => isi.onChange(e.target.value)} />
          {sisipkan}
        </>
      );
    }
    case "gambar": {
      const alt = kolom("alt", "Shown when the image is blocked, and read aloud by screen readers. Example: Batik dress code guide.");
      return (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- gambar email dari storage, bukan aset halaman */}
          {block.url ? <img src={block.url} alt="" className="max-h-40 w-auto self-start rounded-sm border border-outline-variant" /> : null}
          <label className="self-start">
            <span className="sr-only">Choose image</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="peer sr-only"
              disabled={mengunggah}
              onChange={async (e) => {
                const berkas = e.target.files?.[0];
                e.target.value = "";
                if (!berkas) return;
                setMengunggah(true);
                try {
                  const siap = await siapkanGambar(berkas);
                  const url = await unggah(siap.blob, "gambar-email.jpg");
                  onUbah({ url, lebar: siap.lebar, tinggi: siap.tinggi });
                } catch {
                  toast.error("Couldn't upload image", "Use a PNG, JPG or WebP under 5 MB.");
                } finally {
                  setMengunggah(false);
                }
              }}
            />
            <span className="m3-state inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-outline px-4 text-label-large font-semibold text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-primary">
              <UploadSimple size={16} aria-hidden />
              {mengunggah ? "Uploading…" : block.url ? "Replace image" : "Upload image"}
            </span>
          </label>
          <p className="text-body-small text-on-surface-variant">Scaled down automatically to 1200 px wide. Don&apos;t put important information only in the image: many work email systems block images.</p>
          <TextField
            label="Alt text"
            {...alt}
            maxLength={200}
            onChange={(e) => alt.onChange(e.target.value)}
            error={!blockEn && block.url && !block.alt.trim() ? "Required." : undefined}
          />
          <TextField label="Link when the image is clicked" optional value={block.href ?? ""} placeholder="https://" maxLength={600} onChange={(e) => onUbah({ href: e.target.value.trim() || undefined })} />
        </>
      );
    }
    case "tombol": {
      const tujuan = [
        ...(data.member_on ? [{ value: "dashboard" as const, label: "My dashboard" }] : []),
        { value: "halaman" as const, label: "Event page" },
        { value: "url" as const, label: "Other link" },
      ];
      return (
        <>
          {(() => {
            const label = kolom("label");
            return <TextField label="Button text" {...label} maxLength={40} onChange={(e) => label.onChange(e.target.value)} />;
          })()}
          <SegmentedButton
            label="Button destination"
            value={block.tujuan === "dashboard" && !data.member_on ? "halaman" : block.tujuan}
            onChange={(nilai) => onUbah({ tujuan: nilai })}
            options={tujuan}
            className="self-start"
          />
          {block.tujuan === "dashboard" && !data.member_on ? (
            <p className="text-body-small text-on-surface-variant">Participant area is off, so this button goes to the Event page.</p>
          ) : null}
          {block.tujuan === "url" ? (
            <TextField label="Link" value={block.url ?? ""} placeholder="https://" maxLength={600} onChange={(e) => onUbah({ url: e.target.value.trim() || undefined })} />
          ) : null}
        </>
      );
    }
    case "mitra":
      return (
        <>
          {(() => {
            const judul = kolom("judul");
            return <TextField label="Title above the logos" {...judul} maxLength={120} onChange={(e) => judul.onChange(e.target.value)} />;
          })()}
          <p className="text-body-small text-on-surface-variant">
            {data.dasar.mitra.length
              ? `${plural(Math.min(8, data.dasar.mitra.length), "logo")} taken from the Event page (8 at most). Change the logos on the Event page.`
              : "No partner logos on the Event page yet, so this section is hidden."}{" "}
            <Link href="/admin/landing" className="font-semibold text-primary underline-offset-4 hover:underline">
              Open Event page
            </Link>
          </p>
        </>
      );
    default:
      return null;
  }
}

export function TambahBagian({ onTambah }: { onTambah: (type: BlockType) => void }) {
  const [pemicu, setPemicu] = useState<HTMLSpanElement | null>(null);
  const anchor = usePopoverAnchor(pemicu);
  return (
    <span ref={setPemicu} className="inline-block">
      <Button variant="outlined" icon={<Plus size={16} weight="bold" />} aria-haspopup="menu" aria-expanded={anchor.open} onClick={anchor.toggle}>
        Add section
      </Button>
      <Popover anchor={anchor} label="Add section" width={300} align="start">
        {ADDABLE.map((item) => (
          <button
            key={item.type}
            type="button"
            role="menuitem"
            className={cx(POPOVER_ITEM, "h-auto! flex-col items-start justify-center gap-0.5 py-2")}
            onClick={() => {
              anchor.tutup();
              onTambah(item.type);
            }}
          >
            <span className="font-semibold">{BLOCK_LABELS[item.type]}</span>
            <span className="text-body-small text-on-surface-variant">{item.note}</span>
          </button>
        ))}
      </Popover>
    </span>
  );
}

/** Logo di gambar kepala: logo terang Forum apa adanya, selain itu logo acara yang diputihkan. */
export function logoKepala(dasar: Data["dasar"]): { url: string; terang: boolean } | null {
  if (dasar.logoPutihUrl) return { url: dasar.logoPutihUrl, terang: true };
  return dasar.logoUrl ? { url: dasar.logoUrl, terang: false } : null;
}

/**
 * Pratinjau di iframe tanpa skrip. Email 600 px diperkecil agar muat di panel
 * 440 px (seperti kotak masuk yang memperkecil email lebar); tingginya
 * mengikuti isi email.
 */
export function PratinjauEmail({ html, lebar }: { html: string; lebar: number }) {
  const [tinggi, setTinggi] = useState(640);
  const [ruang, setRuang] = useState(lebar);
  const [wadah, setWadah] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!wadah) return;
    const amati = new ResizeObserver(([entri]) => setRuang(entri.contentRect.width));
    amati.observe(wadah);
    return () => amati.disconnect();
  }, [wadah]);
  const skala = Math.min(1, ruang / lebar);
  return (
    <div ref={setWadah} className="w-full" style={{ height: tinggi * skala }}>
      <iframe
        title="Email preview"
        srcDoc={html}
        sandbox="allow-same-origin"
        onLoad={(e) => {
          const doc = e.currentTarget.contentDocument;
          if (doc) setTinggi(Math.max(400, doc.documentElement.scrollHeight));
        }}
        style={{ width: lebar, height: tinggi, transform: `scale(${skala})`, transformOrigin: "top left", marginLeft: skala < 1 ? 0 : (ruang - lebar) / 2 }}
        className="block max-w-none border-0 bg-white"
      />
    </div>
  );
}
