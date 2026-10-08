"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { Popover, SegmentedButton, usePopoverAnchor } from "@/components/m3";
import { LANDING_CARD_ICON_SARAN, LANDING_CARD_TONES, LANDING_CARD_TONE_LABELS, labelIkon, type LandingCardTone } from "@/lib/landing-card-icons";
import { cx } from "@/lib/m3/cx";

// Pemilih ikon kartu Tentang acara (gaya gathering). Saran acara/perjalanan
// tampil lebih dulu; kolom cari mencakup seluruh pustaka Phosphor yang sudah
// dipakai aplikasi, dimuat saat editor kartu dibuka (bukan di halaman publik).
// Di bawahnya admin bisa mengunggah gambar ikon sendiri (mis. ikon 3D), yang
// menggantikan ikon dan ubinnya.

type Pustaka = Record<string, Icon>;
let muatan: Promise<Pustaka> | null = null;

function muatPustaka(): Promise<Pustaka> {
  muatan ??= import("@phosphor-icons/react").then((modul) => {
    const hasil: Pustaka = {};
    for (const [nama, nilai] of Object.entries(modul)) {
      // Hanya komponen ikon: nama berhuruf besar, tanpa alias "...Icon" dan
      // tanpa ekspor pembantu (IconContext, IconBase, SSRBase).
      if (!/^[A-Z]/.test(nama) || nama.endsWith("Icon") || nama === "IconContext" || nama.endsWith("Base")) continue;
      if (nilai && typeof nilai === "object") hasil[nama] = nilai as unknown as Icon;
    }
    return hasil;
  });
  return muatan;
}

/** Pustaka ikon untuk editor; null selama dimuat. */
export function usePustakaIkon(): Pustaka | null {
  const [pustaka, setPustaka] = useState<Pustaka | null>(null);
  useEffect(() => {
    let aktif = true;
    muatPustaka().then((hasil) => {
      if (aktif) setPustaka(hasil);
    });
    return () => {
      aktif = false;
    };
  }, []);
  return pustaka;
}

/** Warna ubin di editor, sama dengan halaman publik (--chip-* dari gatheringColors). */
export type WarnaUbin = Record<LandingCardTone, { latar: string; teks: string }>;

const BATAS_HASIL = 96;

export function PilihIkonKartu({
  nomor,
  ikon,
  nada,
  bawaan,
  warna,
  pustaka,
  gambar,
  onChange,
}: {
  /** Nomor kartu (1, 2, ...) untuk label. */
  nomor: number;
  /** Nama ikon yang berlaku (tersimpan atau bawaan). */
  ikon: string;
  nada: LandingCardTone;
  /** Apakah ikon dan warnanya masih bawaan urutan kartu. */
  bawaan: boolean;
  warna: WarnaUbin;
  pustaka: Pustaka | null;
  /** URL gambar ikon sendiri, bila ada. */
  gambar: string | null;
  /** null = kembali ke ikon dan warna bawaan. Memilih ikon menghapus gambar sendiri. */
  onChange: (ubah: { icon?: string; tone?: LandingCardTone; icon_url?: string | null } | null) => void;
}) {
  const id = useId();
  const [pemicu, setPemicu] = useState<HTMLButtonElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const [cari, setCari] = useState("");
  const Ikon = pustaka?.[ikon];
  const ubin = warna[nada];

  const { saran, lain, jumlahLain } = useMemo(() => {
    const kata = cari.trim().toLowerCase();
    if (!kata) return { saran: LANDING_CARD_ICON_SARAN.map((item) => item.nama), lain: [], jumlahLain: 0 };
    const cocok = (teks: string) => kata.split(/\s+/).every((bagian) => teks.includes(bagian));
    const saran = LANDING_CARD_ICON_SARAN.filter((item) => cocok(`${item.nama} ${item.label} ${item.cari}`.toLowerCase())).map((item) => item.nama);
    const sudah = new Set(saran);
    const semua = pustaka ? Object.keys(pustaka).filter((nama) => !sudah.has(nama) && cocok(labelIkon(nama).toLowerCase() + " " + nama.toLowerCase())) : [];
    return { saran, lain: semua.slice(0, BATAS_HASIL), jumlahLain: semua.length };
  }, [cari, pustaka]);

  const tombol = (nama: string) => {
    const Gambar = pustaka?.[nama];
    const terpilih = !gambar && nama === ikon;
    return (
      <li key={nama}>
        <button
          type="button"
          title={labelIkon(nama)}
          aria-label={labelIkon(nama)}
          aria-pressed={terpilih}
          onClick={() => onChange({ icon: nama, icon_url: null })}
          className={cx(
            "m3-state flex size-9 items-center justify-center rounded-md text-on-surface",
            terpilih && "bg-primary-soft text-primary ring-2 ring-inset ring-primary",
          )}
        >
          {Gambar ? <Gambar size={20} aria-hidden /> : <span className="size-5 rounded bg-surface-container-high" aria-hidden />}
        </button>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-body-medium font-medium text-on-surface" id={`${id}-label`}>Icon</span>
      <button
        ref={setPemicu}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={menu.open}
        aria-labelledby={`${id}-label ${id}-nama`}
        onClick={menu.toggle}
        className="m3-state flex h-9 items-center gap-2 rounded-md border border-outline bg-surface-container-lowest pl-1 pr-2.5 text-body-medium text-on-surface"
      >
        {gambar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={gambar} alt="" aria-hidden className="size-7 object-contain" />
        ) : (
          <span aria-hidden className="flex size-7 items-center justify-center rounded-[7px]" style={{ background: ubin.latar, color: ubin.teks }}>
            {Ikon ? <Ikon size={16} /> : null}
          </span>
        )}
        <span id={`${id}-nama`} className="max-w-[7rem] truncate">{gambar ? "Own image" : labelIkon(ikon)}</span>
      </button>

      <Popover anchor={menu} id={`${id}-menu`} label={`Icon for card ${nomor}`} role="dialog" align="start" width={344} className="flex max-h-[min(30rem,70vh)] flex-col gap-3 p-3">
        <div className="relative shrink-0">
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden />
          <input
            type="search"
            autoFocus
            value={cari}
            onChange={(peristiwa) => setCari(peristiwa.target.value)}
            placeholder="Search icons, e.g. food, bus, music"
            aria-label="Search icons"
            className="h-9 w-full rounded-md border border-outline bg-surface-container-lowest pl-8 pr-2 text-body-medium text-on-surface outline-none focus:border-primary"
          />
        </div>
        {gambar ? null : <div className="flex shrink-0 flex-col gap-1.5">
          <span className="text-body-medium font-medium text-on-surface">Tile colour</span>
          <SegmentedButton<LandingCardTone>
            label={`Tile colour for card ${nomor}`}
            value={nada}
            onChange={(tone) => onChange({ tone })}
            options={LANDING_CARD_TONES.map((tone) => ({
              value: tone,
              label: LANDING_CARD_TONE_LABELS[tone],
              icon: <span aria-hidden className="size-3 rounded-full" style={{ background: warna[tone].teks } as CSSProperties} />,
            }))}
          />
        </div>}
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {saran.length > 0 ? (
            <>
              <p className="pb-1 text-label-medium font-semibold text-on-surface-variant">{cari.trim() ? "Suggested" : "Suggested for events"}</p>
              <ul className="grid grid-cols-8 gap-0.5" aria-label="Suggested icons">{saran.map(tombol)}</ul>
            </>
          ) : null}
          {cari.trim() ? (
            !pustaka ? (
              <p className="py-2 text-body-medium text-on-surface-variant">Loading all icons…</p>
            ) : lain.length > 0 ? (
              <>
                <p className="pb-1 pt-3 text-label-medium font-semibold text-on-surface-variant">All icons</p>
                <ul className="grid grid-cols-8 gap-0.5" aria-label="All icons">{lain.map(tombol)}</ul>
                {jumlahLain > lain.length ? <p className="pt-2 text-body-small text-on-surface-variant">Showing {lain.length} of {jumlahLain}. Type more to narrow down.</p> : null}
              </>
            ) : saran.length === 0 ? (
              <p className="py-2 text-body-medium text-on-surface-variant">No icons match. Try an English word, e.g. food or travel.</p>
            ) : null
          ) : (
            <p className="pt-3 text-body-small text-on-surface-variant">Search to see all {pustaka ? Object.keys(pustaka).length.toLocaleString("en-GB") : "1,500"} icons.</p>
          )}
        </div>
        <div className="shrink-0 border-t border-outline-variant pt-3">
          <ImageUploadField
            label="Your own icon"
            hint="A transparent PNG or WebP, square, at least 256 px, e.g. a 3D icon. It replaces the icon and shows without a tile."
            kind="landing"
            fit="contain"
            previewClassName="size-12"
            perkecil={{ lebar: 256, mutu: 0.9 }}
            value={gambar}
            onChange={(url) => onChange({ icon_url: url })}
          />
        </div>
        {!bawaan ? (
          <button type="button" onClick={() => onChange(null)} className="shrink-0 self-start rounded-sm text-body-medium font-medium text-primary hover:underline">
            Back to the default icon
          </button>
        ) : null}
      </Popover>
    </div>
  );
}
