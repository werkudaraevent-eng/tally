"use client";

import { ArrowDown, ArrowUp, Plus, Trash } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { IconButton, SegmentedButton, TextArea, TextField } from "@/components/m3";
import { DOS_DONTS_MAX, landingBlockLimits, type LandingBlock, type LandingBlockItem, type LandingDoKind } from "@/lib/domain";
import { PilihIkonKartu } from "./pilih-ikon";

/** Ikon yang ditawarkan paling depan: pakaian, bawaan, kesehatan, dan larangan yang umum di buku panduan acara. */
const IKON_SARAN = [
  "TShirt", "Sneaker", "Sunglasses", "Sun", "Umbrella", "Backpack", "Pill", "Drop", "ShieldCheck", "IdentificationCard", "Clock", "UsersThree",
  "Diamond", "Money", "Trash", "Plant", "Cigarette", "Wine", "Camera", "SpeakerSlash", "Megaphone", "HardHat",
] as const;

const JENIS: { value: LandingDoKind; label: string }[] = [
  { value: "do", label: "Do" },
  { value: "dont", label: "Don’t" },
];

/**
 * Editor blok Do's and Don'ts. Butir disimpan dalam satu daftar dengan `kind`;
 * di sini dibagi dua kelompok seperti di halaman, supaya admin melihat urutan
 * yang sama dengan tamu. Mengganti Do/Don't memindahkan butir ke akhir
 * kelompok lainnya.
 */
export function EditorDosDonts({
  block,
  ubah,
  tataLetak,
  alis,
  judul,
  pengantar,
  judulDo,
  judulDont,
}: {
  block: LandingBlock;
  ubah: (patch: Partial<LandingBlock>) => void;
  tataLetak: ReactNode;
  alis: ReactNode;
  judul: ReactNode;
  pengantar: ReactNode;
  judulDo: ReactNode;
  judulDont: ReactNode;
}) {
  const items = block.items ?? [];
  const batas = landingBlockLimits(block).item ?? {};
  const jenisDari = (item: LandingBlockItem): LandingDoKind => (item.kind === "dont" ? "dont" : "do");
  const ubahItem = (index: number, patch: Partial<LandingBlockItem>) => ubah({ items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const penuh = items.length >= DOS_DONTS_MAX;

  /** Tukar dengan butir sejenis sebelum atau sesudahnya. */
  const geser = (index: number, arah: -1 | 1) => {
    const jenis = jenisDari(items[index]);
    let tujuan = index + arah;
    while (tujuan >= 0 && tujuan < items.length && jenisDari(items[tujuan]) !== jenis) tujuan += arah;
    if (tujuan < 0 || tujuan >= items.length) return;
    const next = [...items];
    [next[index], next[tujuan]] = [next[tujuan], next[index]];
    ubah({ items: next });
  };
  const gantiJenis = (index: number, kind: LandingDoKind) => {
    const item = { ...items[index], kind: kind === "dont" ? ("dont" as const) : undefined };
    ubah({ items: [...items.filter((_, i) => i !== index), item] });
  };

  const kelompok = (jenis: LandingDoKind) => {
    const daftar = items.map((item, index) => ({ item, index })).filter(({ item }) => jenisDari(item) === jenis);
    const nama = jenis === "do" ? "Do" : "Don’t";
    return (
      <div role="group" aria-label={`${nama} items`} className="flex flex-col gap-2">
        <p className="text-body-medium font-semibold text-on-surface">{nama} items ({daftar.length})</p>
        {daftar.length === 0 ? <p className="text-body-medium text-on-surface-variant">No {nama} items yet.</p> : null}
        {daftar.map(({ item, index }, posisi) => (
          <div key={index} className="flex flex-col gap-3 rounded-lg border border-outline-variant p-3">
            <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-start gap-3">
              <PilihIkonKartu
                nomor={posisi + 1}
                label="Icon"
                namaPopover={`Icon for ${nama} item ${posisi + 1}`}
                tanpaWarna
                saranDepan={IKON_SARAN}
                teksKembali="No icon (shows a tick or cross)"
                ikon={item.icon ?? ""}
                nada="brand"
                bawaan={!item.icon && !item.icon_url}
                warna={{ brand: { latar: jenis === "do" ? "#E6F2EA" : "#FBE9E7", teks: "var(--color-on-surface)" }, button: { latar: "", teks: "" }, accent: { latar: "", teks: "" } }}
                gambar={item.icon_url?.trim() || null}
                onChange={(x) => ubahItem(index, x ?? { icon: undefined, icon_url: undefined })}
              />
              <TextField
                label="Text"
                placeholder={jenis === "do" ? "e.g. Pakai sepatu yang nyaman" : "e.g. Membawa barang berharga"}
                maxLength={batas.title?.max}
                counter={{ ideal: batas.title?.ideal }}
                value={item.title ?? ""}
                onChange={(event) => ubahItem(index, { title: event.target.value })}
              />
            </div>
            {item.body !== undefined ? (
              <TextArea
                label="Note"
                optional
                rows={2}
                hint="A short reason or tip under the text."
                maxLength={batas.body?.max}
                counter={{ ideal: batas.body?.ideal }}
                value={item.body}
                onChange={(event) => ubahItem(index, { body: event.target.value })}
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedButton<LandingDoKind>
                label={`${nama} item ${posisi + 1}: do or don't`}
                value={jenis}
                onChange={(kind) => gantiJenis(index, kind)}
                options={JENIS}
              />
              {item.body === undefined ? (
                <button type="button" onClick={() => ubahItem(index, { body: "" })} className="m3-state inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-label-large font-semibold text-primary">
                  <Plus size={16} aria-hidden /> Add note
                </button>
              ) : null}
              <div className="ml-auto flex items-center gap-1">
                <IconButton label={`Move ${nama} item ${posisi + 1} up`} disabled={posisi === 0} onClick={() => geser(index, -1)}><ArrowUp size={16} /></IconButton>
                <IconButton label={`Move ${nama} item ${posisi + 1} down`} disabled={posisi === daftar.length - 1} onClick={() => geser(index, 1)}><ArrowDown size={16} /></IconButton>
                <IconButton label={`Remove ${nama} item ${posisi + 1}`} onClick={() => ubah({ items: items.filter((_, i) => i !== index) })}><Trash size={16} /></IconButton>
              </div>
            </div>
          </div>
        ))}
        {!penuh ? (
          <button
            type="button"
            onClick={() => ubah({ items: [...items, jenis === "dont" ? { kind: "dont" } : {}] })}
            className="m3-state inline-flex min-h-9 items-center gap-1.5 self-start rounded-md px-2 text-label-large font-semibold text-primary"
          >
            <Plus size={16} aria-hidden /> Add a {nama} item
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {tataLetak}
      {alis}
      {judul}
      {pengantar}
      <div className="grid gap-3 sm:grid-cols-2">
        {judulDo}
        {judulDont}
      </div>
      <p className="text-body-small text-on-surface-variant">
        {items.length} of {DOS_DONTS_MAX} items. Pick an icon from the library or upload your own; an item without an icon shows a tick or cross.
      </p>
      {kelompok("do")}
      {kelompok("dont")}
    </div>
  );
}
