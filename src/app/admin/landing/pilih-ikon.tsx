"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { createElement, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { Popover, SegmentedButton, usePopoverAnchor } from "@/components/m3";
import { LANDING_CARD_ICON_SARAN, LANDING_CARD_TONES, LANDING_CARD_TONE_LABELS, labelIkon, type LandingCardTone } from "@/lib/landing-card-icons";
import { cx } from "@/lib/m3/cx";

// Pemilih ikon kartu Tentang acara (gaya gathering). Saran acara/perjalanan
// tampil lebih dulu; kolom cari mencakup seluruh pustaka Phosphor. Setiap ikon
// dimuat sendiri-sendiri saat tampil (peta impor di ikon-csr.ts), jadi editor
// tidak pernah memuat seluruh pustaka. Di bawahnya admin bisa mengunggah gambar
// ikon sendiri (mis. ikon 3D), yang menggantikan ikon dan ubinnya.

type Peta = Record<string, () => Promise<Icon>>;
let muatanPeta: Promise<Peta> | null = null;
const muatPeta = () => (muatanPeta ??= import("./ikon-csr").then((modul) => modul.MUAT_IKON));

const tersimpan = new Map<string, Icon>();
const dimuat = new Map<string, Promise<Icon | null>>();

function muatIkon(nama: string): Promise<Icon | null> {
  let janji = dimuat.get(nama);
  if (!janji) {
    janji = muatPeta()
      .then((peta) => (Object.hasOwn(peta, nama) ? peta[nama]() : null))
      .then((ikon) => {
        if (ikon) tersimpan.set(nama, ikon);
        return ikon;
      })
      .catch(() => null);
    dimuat.set(nama, janji);
  }
  return janji;
}

/** Satu ikon Phosphor berdasarkan nama, dimuat saat pertama tampil. */
function IkonBernama({ nama, size }: { nama: string; size: number }) {
  const [, setSiap] = useState(0);
  const Ikon = tersimpan.get(nama);
  useEffect(() => {
    if (tersimpan.has(nama)) return;
    let aktif = true;
    muatIkon(nama).then(() => {
      if (aktif) setSiap((n) => n + 1);
    });
    return () => {
      aktif = false;
    };
  }, [nama]);
  return Ikon ? createElement(Ikon, { size, "aria-hidden": true }) : <span aria-hidden className="rounded bg-current opacity-15" style={{ width: size, height: size }} />;
}

/** Semua nama ikon, dimuat saat kolom cari dipakai. */
function useNamaIkon(perlu: boolean): readonly string[] | null {
  const [nama, setNama] = useState<readonly string[] | null>(null);
  useEffect(() => {
    if (!perlu || nama) return;
    let aktif = true;
    muatPeta().then((peta) => {
      if (aktif) setNama(Object.keys(peta));
    });
    return () => {
      aktif = false;
    };
  }, [perlu, nama]);
  return nama;
}

/** Warna ubin di editor, sama dengan halaman publik (--chip-* dari gatheringColors). */
export type WarnaUbin = Record<LandingCardTone, { latar: string; teks: string }>;

const BATAS_HASIL = 96;
const KOLOM = 8;
const JUMLAH_PUSTAKA = "1,500";

const FOKUSABEL = 'button:not([disabled]), input:not([disabled]), [tabindex="0"]';

export function PilihIkonKartu({
  nomor,
  ikon,
  nada,
  bawaan,
  warna,
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
  /** URL gambar ikon sendiri, bila ada. */
  gambar: string | null;
  /** null = kembali ke ikon dan warna bawaan. Memilih ikon menghapus gambar sendiri. */
  onChange: (ubah: { icon?: string; tone?: LandingCardTone; icon_url?: string | null } | null) => void;
}) {
  const id = useId();
  const [pemicu, setPemicu] = useState<HTMLButtonElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const [cari, setCari] = useState("");
  const kata = cari.trim().toLowerCase();
  const semuaNama = useNamaIkon(menu.open && kata.length > 0);
  const ubin = warna[nada];

  const { saran, lain, jumlahLain } = useMemo(() => {
    if (!kata) return { saran: LANDING_CARD_ICON_SARAN.map((item) => item.nama), lain: [] as string[], jumlahLain: 0 };
    const cocok = (teks: string) => kata.split(/\s+/).every((bagian) => teks.includes(bagian));
    const saran = LANDING_CARD_ICON_SARAN.filter((item) => cocok(`${item.nama} ${item.label} ${item.cari}`.toLowerCase())).map((item) => item.nama);
    const sudah = new Set(saran);
    const semua = semuaNama ? semuaNama.filter((nama) => !sudah.has(nama) && cocok(labelIkon(nama).toLowerCase() + " " + nama.toLowerCase())) : [];
    return { saran, lain: semua.slice(0, BATAS_HASIL), jumlahLain: semua.length };
  }, [kata, semuaNama]);

  // Kisi ikon adalah satu perhentian Tab (roving tabindex); panah, Home dan
  // End berpindah di dalamnya. Indeks berlaku atas saran lalu hasil lain.
  const daftar = useMemo(() => [...saran, ...lain], [saran, lain]);
  const [fokus, setFokus] = useState<string | null>(null);
  const tombolRef = useRef<(HTMLButtonElement | null)[]>([]);
  const indeksAktif = [fokus, ikon].map((nama) => (nama ? daftar.indexOf(nama) : -1)).find((i) => i >= 0) ?? 0;

  const geser = (peristiwa: KeyboardEvent<HTMLElement>, indeks: number) => {
    const akhir = daftar.length - 1;
    const tujuan = (() => {
      switch (peristiwa.key) {
        case "ArrowRight": return Math.min(akhir, indeks + 1);
        case "ArrowLeft": return Math.max(0, indeks - 1);
        case "ArrowDown": return indeks + KOLOM <= akhir ? indeks + KOLOM : indeks;
        case "ArrowUp": return indeks - KOLOM >= 0 ? indeks - KOLOM : indeks;
        case "Home": return 0;
        case "End": return akhir;
        default: return null;
      }
    })();
    if (tujuan === null) return;
    peristiwa.preventDefault();
    setFokus(daftar[tujuan]);
    tombolRef.current[tujuan]?.focus();
  };

  // Fokus tetap di dalam dialog: Tab dari elemen terakhir kembali ke kolom cari.
  const kurung = (peristiwa: KeyboardEvent) => {
    if (peristiwa.key !== "Tab") return;
    const elemen = Array.from((peristiwa.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(FOKUSABEL)).filter((el) => el.offsetParent !== null);
    if (elemen.length === 0) return;
    const pertama = elemen[0];
    const terakhir = elemen[elemen.length - 1];
    if (peristiwa.shiftKey && document.activeElement === pertama) {
      peristiwa.preventDefault();
      terakhir.focus();
    } else if (!peristiwa.shiftKey && document.activeElement === terakhir) {
      peristiwa.preventDefault();
      pertama.focus();
    }
  };

  const tombol = (nama: string, indeks: number) => {
    const terpilih = !gambar && nama === ikon;
    return (
      <li key={nama}>
        <button
          ref={(el) => {
            tombolRef.current[indeks] = el;
          }}
          type="button"
          tabIndex={indeks === indeksAktif ? 0 : -1}
          title={labelIkon(nama)}
          aria-label={labelIkon(nama)}
          aria-pressed={terpilih}
          onClick={() => onChange({ icon: nama, icon_url: null })}
          onKeyDown={(peristiwa) => geser(peristiwa, indeks)}
          onFocus={() => setFokus(nama)}
          className={cx(
            "m3-state flex size-9 items-center justify-center rounded-md text-on-surface",
            terpilih && "bg-primary-soft text-primary ring-2 ring-inset ring-primary",
          )}
        >
          <IkonBernama nama={nama} size={20} />
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
          <img src={gambar} alt="" aria-hidden width={28} height={28} className="size-7 object-contain" />
        ) : (
          <span aria-hidden className="flex size-7 items-center justify-center rounded-[7px]" style={{ background: ubin.latar, color: ubin.teks }}>
            <IkonBernama nama={ikon} size={16} />
          </span>
        )}
        <span id={`${id}-nama`} className="max-w-[7rem] truncate">{gambar ? "Own image" : labelIkon(ikon)}</span>
      </button>

      {/* Seluruh panel yang menggulir, kolom cari menempel di atas. Kisi punya
          tinggi minimum tiga baris, jadi tidak pernah kempis di layar pendek. */}
      <Popover anchor={menu} id={`${id}-menu`} label={`Icon for card ${nomor}`} role="dialog" align="start" width={344} onKeyDown={kurung} className="flex flex-col gap-3 p-3 pt-0">
        <div className="sticky top-0 z-10 -mx-3 shrink-0 bg-surface-container-lowest px-3 pb-1 pt-3">
          <div className="relative">
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
        </div>
        <div className="-mx-1 max-h-[15rem] min-h-[8.5rem] shrink-0 overflow-y-auto px-1">
          {saran.length > 0 ? (
            <>
              <p className="pb-1 text-label-medium font-semibold text-on-surface-variant">{kata ? "Suggested" : "Suggested for events"}</p>
              <ul className="grid grid-cols-8 gap-0.5" aria-label="Suggested icons">{saran.map((nama, indeks) => tombol(nama, indeks))}</ul>
            </>
          ) : null}
          {kata ? (
            !semuaNama ? (
              <p className="py-2 text-body-medium text-on-surface-variant">Loading all icons…</p>
            ) : lain.length > 0 ? (
              <>
                <p className="pb-1 pt-3 text-label-medium font-semibold text-on-surface-variant">All icons</p>
                <ul className="grid grid-cols-8 gap-0.5" aria-label="All icons">{lain.map((nama, indeks) => tombol(nama, saran.length + indeks))}</ul>
                {jumlahLain > lain.length ? <p className="pt-2 text-body-small text-on-surface-variant">Showing {lain.length} of {jumlahLain}. Type more to narrow down.</p> : null}
              </>
            ) : saran.length === 0 ? (
              <p className="py-2 text-body-medium text-on-surface-variant">No icons match. Try an English word, e.g. food or travel.</p>
            ) : null
          ) : (
            <p className="pt-3 text-body-small text-on-surface-variant">Search to see all {JUMLAH_PUSTAKA} icons.</p>
          )}
        </div>
        {gambar ? null : (
          <div className="flex shrink-0 flex-col gap-1.5">
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
          </div>
        )}
        <div className="shrink-0 border-t border-outline-variant pt-3">
          <ImageUploadField
            label="Your own icon"
            hint="Transparent PNG or WebP, square, at least 256 px. Shows without a tile."
            kind="landing"
            fit="contain"
            previewClassName="size-12"
            perkecil={{ lebar: 256, mutu: 0.9 }}
            terima={["image/png", "image/webp"]}
            periksa={({ lebar, tinggi }) => {
              if (Math.min(lebar, tinggi) < 256) return `This image is ${lebar} × ${tinggi} px. Use one at least 256 px on each side.`;
              const rasio = lebar / tinggi;
              if (rasio < 0.8 || rasio > 1.25) return `This image is ${lebar} × ${tinggi} px. Use a square image, or close to square.`;
              return null;
            }}
            value={gambar}
            onChange={(url) => onChange({ icon_url: url })}
          />
        </div>
        {!bawaan ? (
          <button type="button" onClick={() => onChange(null)} className="shrink-0 self-start rounded-sm text-body-medium font-medium text-primary hover:underline">
            Back to the default icon and colour
          </button>
        ) : null}
      </Popover>
    </div>
  );
}
