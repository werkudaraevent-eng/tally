"use client";

import { pesanGalatApi } from "@/lib/api-message";
import { ArrowDown, ArrowSquareOut, ArrowUp, CaretDown, CopySimple, DotsSixVertical, DownloadSimple, Eye, EyeSlash, Lightning, Plus, Trash, UploadSimple, Warning } from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type DragEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import Link from "@/components/event-link";
import {
  Banner, Button, ButtonLink, Dialog, FilterChip, IconButton, PageLoading, PaneBody, Pane, SegmentedButton, segmentTabId,
  StatusChip, Switch, TextArea, TextField,
} from "@/components/m3";
import { AdminBarPortal, useAdminPage } from "@/components/admin/page-context";
import { bacaLokal, langgananLokal, tulisLokal } from "@/lib/local-store";
import { useToast } from "@/components/toast";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { HighlightField } from "@/components/admin/highlight-field";
import { LandingPreview } from "@/components/admin/landing-preview";
import {
  LANDING_ABOUT_CARDS,
  LANDING_ABOUT_MEDIA_LABELS,
  LANDING_IMAGE_ALT_MAX,
  LANDING_BANNER_STYLE_LABELS,
  LANDING_HEADING_SIZE,
  LANDING_HERO_HEIGHT_PX,
  LANDING_NAV_HEIGHT_MAX,
  LANDING_NAV_HEIGHT_MIN,
  LANDING_SECTION_ADMIN_LABELS,
  LANDING_SECTION_LABELS,
  LANDING_SECTION_SOURCES,
  LANDING_SECTION_TEXT_MAX,
  LANDING_EYEBROW_DEFAULT,
  LANDING_BLOCK_LABELS,
  isLandingBlockId,
  landingBlockHasContent,
  landingBlockLimits,
  type LandingTextLimit,
  normalizeLandingSections,
  type LandingBlock,
  type LandingBlockItem,
  type LandingBlockType,
  type EventLandingConfig,
  type LandingForumPage,
  type LandingLayout,
  type LandingHeadedSection,
  type LandingConfigEn,
  type LandingSection,
  type LandingSectionId,
  type RegistrationFormConfig,
  type LandingHeroAlign,
  type LandingHeroPosition,
  LANDING_SPEAKER_FRAMES,
  LANDING_SPEAKER_FRAME_LABELS,
  type LandingSpeakerFrame,
} from "@/lib/domain";
import { ukurTerangKv } from "@/lib/kv-terang";
import { HERO_KV_KUAT, landingTokens } from "@/lib/landing-tokens";
import { formatEventDate } from "@/lib/event-datetime";
import { DEFAULT_TIME_ZONE } from "@/lib/timezone";
import { jumlahLembaga } from "@/lib/landing-speaker-tabs";
import { DEFAULT_REGISTRATION_SEED } from "@/lib/registration-theme";
import { eventApiPath } from "@/lib/event-url";
import { Kelompok } from "@/components/admin/compact-form";
import { BilahAtasEditor } from "@/components/admin/landing-nav-editor";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import { BlockEditor, butirBerlebih, isianButirTampil, kolomBlokTampil, labelIsianButir, labelKolomBlok, namaButirBlok, ringkasanBlok, TambahBlokDialog, tautanBlokSalah, buatBlok, type KolomButir } from "./blocks";
import { ForumSusunan, forumTautanSalah, halamanBagianForum } from "./forum-editor";
import { MenuBlok, type ItemMenuBlok } from "./menu-blok";
import { BentukBingkai, UrutanPembicara } from "./urutan-pembicara";
import { pakaiPreset } from "./theme-presets";
import { TabTema } from "./theme-tab";
import { LANDING_THEME_PRESETS } from "@/lib/landing-theme-presets";
import { BagianEn, BlockEditorEn, kartuRundownId, labelIsianButirEn, labelKolomBlokEn, namaButirBlokEn, rundownBelumDiterjemahkan, type BarisRundownEn } from "./editor-en";
import { barisSesiDariAdmin, petakanSesiLama, PilihSesi, sesiHilang, urutRundown, type BarisSesi, type HasilPetakan } from "./pilih-sesi";
import { formatClock, type RundownItem, type RundownSection } from "@/lib/rundown";
import { LANDING_UI, landingEyebrowShown, landingUntranslated } from "@/lib/landing-i18n";
import { sesiDariRundown } from "@/lib/landing-speaker-tabs";

// Supporting pane: halaman publik yang sungguhan di panel utama, setelannya di
// panel kanan. Pratinjau hanya menampilkan versi tersimpan (lihat LandingPreview),
// jadi kaki panel menyebut kapan ada perubahan yang belum terlihat di sana.

// Berkas isi halaman (Ekspor/Impor). Hanya kolom yang disunting di layar ini:
// tanggal acara, rundown, dan peserta tetap di tempatnya masing-masing.
const BERKAS_FORMAT = "tally-landing";
const KOLOM_FAKTA = ["description", "tagline", "start_time", "end_time", "end_date", "venue_name", "venue_address", "venue_map_url"] as const;
type BerkasIsi = {
  format: typeof BERKAS_FORMAT;
  version: 1;
  facts?: Partial<Pick<Facts, (typeof KOLOM_FAKTA)[number]>>;
  landing?: EventLandingConfig;
};

type Facts = {
  slug: string;
  name: string;
  description: string | null;
  event_date: string | null;
  tagline: string | null;
  start_time: string | null;
  end_time: string | null;
  end_date: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_map_url: string | null;
};

type Bagian = "susunan" | "tema" | "peserta";

/** "09:00:00" → "09:00". Kolom <input type="time"> menolak bentuk berdetik. */
const jamInput = (value: string | null) => (value ? value.slice(0, 5) : "");

/** "2026-10-15" → "15 Oct 2026" (en-GB, untuk teks staf). */
const formatTanggal = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));

function PilihWarna({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-outline-variant bg-transparent"
        aria-label={label}
      />
      <span className="min-w-0">
        <span className="block text-body-medium font-medium text-on-surface">{label}</span>
        <span className="block text-body-medium text-on-surface-variant">{value.toUpperCase()}</span>
      </span>
    </label>
  );
}

/**
 * Kolom pertama yang melewati batas karakter blok, atau null, dengan nama
 * seperti tertulis di editor. Teks English (`en`) memakai batas yang sama;
 * `bahasa` menyebut mode editor tempat kolom itu. Kolom yang tidak dirender
 * editor dilewati (teks tombol tanpa tautan, teks English tanpa teks ID): galat
 * tidak bisa menunjuknya, dan halaman publik juga tidak menampilkannya.
 */
function kolomKepanjangan(blok: LandingBlock): { kolom: string; max: number; bahasa: "id" | "en" } | null {
  const batas = landingBlockLimits(blok);
  const asal = blok as unknown as Record<string, unknown>;
  for (const bahasa of ["id", "en"] as const) {
    const sumber = (bahasa === "id" ? blok : blok.en ?? {}) as Record<string, unknown>;
    for (const [kunci, limit] of Object.entries(batas)) {
      if (kunci === "item" || kunci === "items" || !limit || !("max" in limit)) continue;
      const tampil = bahasa === "id" ? kolomBlokTampil(blok, kunci) : ada(asal[kunci]);
      const nilai = sumber[kunci];
      if (tampil && typeof nilai === "string" && nilai.length > limit.max) {
        return { kolom: bahasa === "id" ? labelKolomBlok(blok, kunci) : labelKolomBlokEn(kunci), max: limit.max, bahasa };
      }
    }
    for (const [nomor, butir] of (blok.items ?? []).entries()) {
      const isiButir = (bahasa === "id" ? butir : butir.en ?? {}) as Record<string, unknown>;
      for (const [kunci, limit] of Object.entries(batas.item ?? {}) as [KolomButir, LandingTextLimit | undefined][]) {
        const tampil = bahasa === "id" ? isianButirTampil(blok, butir, kunci) : ada(butir[kunci]);
        const nilai = isiButir[kunci];
        if (tampil && limit && typeof nilai === "string" && nilai.length > limit.max) {
          const kolom = bahasa === "id" ? `${namaButirBlok(blok, nomor)}, ${labelIsianButir(blok, kunci)}` : `${namaButirBlokEn(blok, nomor)}, ${labelIsianButirEn(blok, kunci)}`;
          return { kolom, max: limit.max, bahasa };
        }
      }
    }
  }
  return null;
}

const ada = (nilai: unknown) => typeof nilai === "string" && nilai.trim().length > 0;

/** Ruang di bawah panel yang tertutup toast galat (terukur ~110px), plus jarak. */
const RUANG_TOAST = 140;

/**
 * Bawa kolom yang ditolak Simpan ke sepertiga atas panel dan beri fokus.
 * Sepertiga atas, bukan tengah: toast galat di bawah layar menutupi
 * penghitung kolom yang terletak di bawah; kolom tinggi diletakkan lebih ke
 * atas lagi supaya penghitungnya tetap di atas toast. Tanpa `kunci`, dicari
 * kolom pertama di baris itu yang isinya melewati maxLength; butir blok yang
 * terlipat dan bertanda "Terlalu panjang" dibuka dulu. `kabar` menerima
 * apakah kolomnya ketemu, supaya toast tidak menjanjikan kolom yang tidak ada.
 */
function fokusKolomLewat(barisId: string, kunci: string | undefined, kabar: (ketemu: boolean) => void, ulang = true) {
  window.setTimeout(() => {
    const baris = document.getElementById(`baris-${barisId}`);
    if (!baris) return kabar(false);
    const kolom = kunci
      ? baris.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-kolom="${kunci}"]`)
      : [...baris.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")].find((el) => el.maxLength > 0 && el.value.length > el.maxLength);
    if (!kolom) {
      const terlipat = [...baris.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"]')].find((tombol) => /Terlalu panjang|Too long/.test(tombol.textContent ?? ""));
      if (terlipat && ulang) {
        terlipat.click();
        fokusKolomLewat(barisId, kunci, kabar, false);
      } else {
        kabar(false);
      }
      return;
    }
    const wadah = kolom.closest<HTMLElement>(".overflow-y-auto");
    if (wadah) {
      const atas = kolom.getBoundingClientRect().top - wadah.getBoundingClientRect().top + wadah.scrollTop;
      // Kolom plus penghitung (~28px) harus selesai sebelum ruang toast.
      // Kolom tinggi boleh naik melewati tepi atas panel: yang harus terlihat
      // adalah penghitungnya, bukan awal kolom.
      const ruang = wadah.clientHeight - RUANG_TOAST - kolom.offsetHeight - 28;
      const jarak = Math.min(96, ruang >= 16 ? ruang : Math.max(ruang, 64 - kolom.offsetHeight));
      wadah.scrollTo({ top: Math.max(0, atas - jarak), behavior: "smooth" });
    }
    kolom.focus({ preventScroll: true });
    kabar(true);
  }, ulang ? 350 : 150);
}

/**
 * Gulir panel setelan sampai baris ini di atasnya, setelah React merendernya:
 * bagian yang terbuka sebelumnya ikut menutup dan menggeser daftar. Yang digulir
 * hanya wadah panelnya; scrollIntoView ikut menggeser seluruh halaman CMS.
 */
function gulirKeBaris(id: string, bilaDiAtas = false) {
  window.requestAnimationFrame(() => {
    const baris = document.getElementById(`baris-${id}`);
    const wadah = baris?.closest<HTMLElement>(".overflow-y-auto");
    if (!baris || !wadah) return;
    const atas = baris.getBoundingClientRect().top - wadah.getBoundingClientRect().top + wadah.scrollTop;
    // `bilaDiAtas`: gulir hanya kalau baris sudah lewat ke atas panel.
    if (bilaDiAtas && atas >= wadah.scrollTop) return;
    wadah.scrollTo({ top: Math.max(0, atas), behavior: "smooth" });
  });
}

/**
 * Bawa satu kolom baris yang baru dibuka ke pandangan, setelah klik di
 * pratinjau (`data-sunting` di halaman = `data-kolom` di sini). Kolom isian
 * diberi fokus; kelompok (Top bar) hanya digulir ke atas panel.
 */
function tampilkanKolom(barisId: string, kunci: string) {
  window.setTimeout(() => {
    const baris = document.getElementById(`baris-${barisId}`);
    const kolom = baris?.querySelector<HTMLElement>(`[data-kolom="${CSS.escape(kunci)}"]`);
    const wadah = kolom?.closest<HTMLElement>(".overflow-y-auto");
    if (!kolom || !wadah) return;
    const atas = kolom.getBoundingClientRect().top - wadah.getBoundingClientRect().top + wadah.scrollTop;
    // Di bawah kepala baris yang menempel (56px) dan label kolomnya.
    wadah.scrollTo({ top: Math.max(0, atas - 96), behavior: "smooth" });
    if (kolom.matches("input, textarea")) {
      const isian = kolom as HTMLInputElement | HTMLTextAreaElement;
      isian.focus({ preventScroll: true });
      // Kursor di akhir isi, siap menyambung tulisan (QA #108 L1). Kolom
      // seperti type="url" tidak punya pilihan teks dan melempar galat.
      try {
        isian.setSelectionRange(isian.value.length, isian.value.length);
      } catch {}
      return;
    }
    // Kolom Highlight (contentEditable): kursor juga di akhir.
    const sunting = kolom.querySelector<HTMLElement>("[contenteditable]");
    if (!sunting) return;
    sunting.focus({ preventScroll: true });
    const pilihan = window.getSelection();
    pilihan?.selectAllChildren(sunting);
    pilihan?.collapseToEnd();
  }, 350);
}

/** Angka yang setara dengan pilihan lama, supaya kolom angka tidak mulai kosong. */
const JUDUL_PRESET_PX: Record<"md" | "lg" | "xl", number> = { md: 52, lg: 64, xl: 72 };
const HERO_PRESET_PX: Record<"compact" | "standard" | "tall", number> = { compact: 600, standard: 760, tall: 850 };

/** Ukuran dalam px: penggeser untuk mencoba-coba, kolom angka untuk nilai pasti. */
function AngkaPx({
  label,
  hint,
  rentang,
  value,
  onChange,
  satuan = "px",
}: {
  label: string;
  hint: string;
  rentang: { min: number; max: number; step: number };
  value: number;
  onChange: (value: number) => void;
  /** Satuan di kolom dan petunjuk ("px", "%"). */
  satuan?: string;
}) {
  // Teks yang sedang diketik; null = ikuti nilai tersimpan (mis. dari penggeser).
  const [draf, setDraf] = useState<string | null>(null);
  // Kelipatan langkah penggeser, supaya angka ketik dan penggeser selalu sama (QA #111 L3).
  const jepit = (angka: number) => Math.min(rentang.max, Math.max(rentang.min, rentang.min + Math.round((angka - rentang.min) / rentang.step) * rentang.step));
  return (
    <div className="flex flex-col gap-1.5">
      <TextField
          className="w-32"
          label={label}
          type="number"
          inputMode="numeric"
          min={rentang.min}
          max={rentang.max}
          step={rentang.step}
          trailing={<span className="text-body-medium text-on-surface-variant">{satuan}</span>}
          value={draf ?? String(value)}
          onChange={(event) => {
            setDraf(event.target.value);
            const angka = Number(event.target.value);
            if (event.target.value !== "" && angka >= rentang.min && angka <= rentang.max) onChange(jepit(angka));
          }}
          onBlur={() => {
            const angka = Number(draf);
            const sah = draf === null || draf === "" || Number.isNaN(angka) ? value : jepit(angka);
            setDraf(null);
            if (sah !== value) onChange(sah);
          }}
        />
        <input
          type="range"
          aria-label={`${label}, slider`}
          min={rentang.min}
          max={rentang.max}
          step={rentang.step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-11 w-full accent-primary"
        />
      <p className="text-body-medium text-on-surface-variant">
        {hint} Range {rentang.min} to {rentang.max}{satuan === "%" ? "" : " "}{satuan}.
      </p>
    </div>
  );
}

/**
 * Lebar panel setelan. 440 bawaan memberi kolom isian ~270px dan pratinjau
 * 1280px pada skala ~0,53 di layar 1280. Batas 400: di bawahnya dua kolom
 * isian berdampingan tidak muat. Batas 640: di atasnya pratinjau terlalu kecil
 * untuk dibaca. Disimpan per akun, karena satu laptop panitia dipakai bergantian.
 */
const PANEL_MIN = 400;
const PANEL_MAX = 640;
const PANEL_BAWAAN = 440;
const KUNCI_PANEL = "tally:landing-panel:v1";
const KUNCI_BAHASA = "tally:landing-bahasa:v1";
const jepitPanel = (lebar: number) => Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, lebar)));

type KunciTeksEn = Extract<Exclude<keyof LandingConfigEn, "program_notes" | "about_cards">, keyof EventLandingConfig>;
const BAGIAN_BERJUDUL = Object.keys(LANDING_EYEBROW_DEFAULT) as LandingHeadedSection[];

/** Kolom teks di lipatan "Judul bagian" satu bagian: kunci, nama untuk pesan, batas skema. */
function kolomJudulBagian(id: LandingHeadedSection): [KunciTeksEn, string, number][] {
  const { eyebrow, heading, intro } = LANDING_SECTION_TEXT_MAX;
  return [
    [`${id}_eyebrow`, "small label", eyebrow],
    // Judul Tentang: skema tetap 160 supaya judul lama tetap bisa disimpan.
    id === "about" ? ["about_heading", "heading", 160] : [`${id}_heading`, "heading", heading],
    ...(id === "faq" ? [["faq_intro", "intro", intro] as [KunciTeksEn, string, number]] : []),
    ...(id === "agenda" ? [["agenda_note", "note", intro] as [KunciTeksEn, string, number]] : []),
  ];
}

/**
 * Judul bagian bawaan yang melewati batas skema (mis. dari Impor atau data
 * lama). Server menolaknya dengan galat mentah tanpa nama bagian; di sini
 * bagian dan kolomnya disebut, lalu dibuka. Teks English yang Indonesianya
 * kosong tidak diperiksa: kolomnya tidak tampil dan tidak ikut dikirim
 * (tanpaEnYatim).
 */
function judulBagianKepanjangan(landing: EventLandingConfig): { id: LandingHeadedSection; kunci: KunciTeksEn; kolom: string; bahasa: "id" | "en"; max: number } | null {
  for (const id of BAGIAN_BERJUDUL) {
    for (const bahasa of ["id", "en"] as const) {
      for (const [kunci, kolom, max] of kolomJudulBagian(id)) {
        const teks = bahasa === "id" ? landing[kunci] : landing[kunci]?.trim() ? landing.en?.[kunci] : undefined;
        if ((teks?.trim().length ?? 0) > max) return { id, kunci, kolom, bahasa, max };
      }
    }
  }
  return null;
}

/**
 * Buang teks English judul bagian yang Indonesianya kosong. Halaman English
 * tidak memakainya (resolveLanding), editor EN tidak menampilkannya, jadi
 * tanpa ini sisa Impor bisa menolak Simpan tanpa kolom yang bisa diperbaiki.
 */
function tanpaEnYatim(landing: EventLandingConfig): EventLandingConfig {
  if (!landing.en) return landing;
  const en = { ...landing.en };
  for (const id of BAGIAN_BERJUDUL) {
    for (const [kunci] of kolomJudulBagian(id)) if (!landing[kunci]?.trim()) delete en[kunci];
  }
  return { ...landing, en };
}

/** Batas luar skema server untuk teks butir (landing-body-schema), ID dan English. */
const BATAS_SKEMA_BUTIR: Record<KolomButir, LandingTextLimit> = { label: { max: 160 }, title: { max: 160 }, body: { max: 400 }, value: { max: 30 } };

/**
 * Buang teks blok yang editor tidak tampilkan dan melewati batas: teks tombol
 * tanpa tautan, Chip 2 di luar tata letak overlay, teks tautan Kolom tanpa
 * tautan, teks English yang Indonesianya kosong. Halaman publik juga tidak
 * menampilkannya, tetapi server tetap menolaknya, dengan galat yang tidak
 * menyebut kolom mana. Yang masih dalam batas dibiarkan, supaya pindah tata
 * letak tidak menghapus isi.
 */
function tanpaTersembunyiKepanjangan(blocks: LandingBlock[] | undefined): LandingBlock[] | undefined {
  if (!blocks) return blocks;
  return blocks.map((blok) => {
    const batas = landingBlockLimits(blok);
    const lewat = (nilai: unknown, limit: unknown) =>
      typeof nilai === "string" && !!limit && typeof limit === "object" && "max" in limit && nilai.length > (limit as LandingTextLimit).max;
    const hasil = { ...blok } as Record<string, unknown>;
    const en = blok.en ? ({ ...blok.en } as Record<string, unknown>) : undefined;
    for (const [kunci, limit] of Object.entries(batas)) {
      if (kunci === "item" || kunci === "items") continue;
      if (!kolomBlokTampil(blok, kunci) && lewat(hasil[kunci], limit)) delete hasil[kunci];
      if (en && !ada(blok[kunci as keyof LandingBlock]) && lewat(en[kunci], limit)) delete en[kunci];
    }
    if (en) hasil.en = en;
    if (blok.items) {
      hasil.items = blok.items.map((butir) => {
        const baru = { ...butir } as Record<string, unknown>;
        const enButir = butir.en ? ({ ...butir.en } as Record<string, unknown>) : undefined;
        // Semua kunci butir, bukan hanya yang dibatasi tata letak: mis. Chip 2
        // di luar overlay tidak punya batas tata letak, tetapi skema tetap 30.
        for (const kunci of Object.keys(BATAS_SKEMA_BUTIR) as KolomButir[]) {
          const limit = batas.item?.[kunci] ?? BATAS_SKEMA_BUTIR[kunci];
          if (!isianButirTampil(blok, butir, kunci) && lewat(baru[kunci], limit)) delete baru[kunci];
          if (enButir && !ada(butir[kunci]) && lewat(enButir[kunci], limit)) delete enButir[kunci];
        }
        if (enButir) baru.en = enButir;
        return baru as LandingBlockItem;
      });
    }
    return hasil as LandingBlock;
  });
}

/** Hapus yang bisa diurungkan. Berlaku di draf; baru permanen saat Simpan. */
type Urungan = { pesan: string; sections: LandingSection[]; blocks: LandingBlock[] };

export default function LandingCmsPage() {
  const [facts, setFacts] = useState<Facts | null>(null);
  const [landing, setLanding] = useState<EventLandingConfig>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bagianDipilih, setBagian] = useState<Bagian>("susunan");
  // Hanya formulir: tidak ada halaman acara, jadi Susunan halaman tidak tampil
  // dan bagian yang terbuka jatuh ke Tema (juga saat sebuah tindakan meminta
  // Susunan halaman, mis. klik bagian di pratinjau).
  const hanyaFormulir = landing.tayang === "formulir";
  const bagian: Bagian = hanyaFormulir && bagianDipilih === "susunan" ? "tema" : bagianDipilih;
  // `?bagian=tema|peserta`: tautan "Ubah di Tema" dan "Atur di Peserta" dari
  // Atur formulir membuka langsung tab yang dimaksud.
  // Dibaca setelah hidrasi (bukan di penginisialisasi useState): server tidak
  // tahu kueri ini, dan render pertama klien harus sama dengan markup server.
  useEffect(() => {
    const diminta = new URLSearchParams(window.location.search).get("bagian");
    if (diminta !== "tema" && diminta !== "peserta") return;
    const timer = window.setTimeout(() => setBagian(diminta), 0);
    return () => window.clearTimeout(timer);
  }, []);
  // Lipatan "Judul bagian" yang terbuka (satu bagian), awalnya tertutup.
  const [judulTerbuka, setJudulTerbuka] = useState<LandingHeadedSection | null>(null);
  // Baris Susunan halaman yang sedang terbuka ("pembuka", id bagian, atau "kaki").
  const [terbuka, setTerbuka] = useState<string | null>(null);
  // Bagian yang disorot di pratinjau; `n` naik di setiap klik supaya klik ulang
  // pada baris yang sama tetap menggulir pratinjau ke sana.
  const [sorot, setSorot] = useState<{ id: string; n: number; diam?: boolean } | null>(null);
  // Halaman tata letak Forum yang sedang dipratinjau (Beranda, Program, Info).
  const [halamanPratinjau, setHalamanPratinjau] = useState<LandingForumPage>("beranda");
  // null = belum diketahui (gagal dimuat); lencana hanya muncul bila pasti kosong.
  /**
   * Isi rundown untuk lencana Susunan acara: "ada" bila paling tidak satu
   * sesi berjudul tampil di halaman acara, "belum-terbit" bila ada sesi tetapi
   * belum satu pun diterbitkan (bagian dan barisnya), "kosong" bila tidak ada
   * sesi sama sekali. null selama belum diketahui.
   */
  const [isiRundown, setIsiRundown] = useState<"ada" | "belum-terbit" | "kosong" | null>(null);
  const rundownKosong = isiRundown === null ? null : isiRundown !== "ada";
  const lencanaRundown = isiRundown === "belum-terbit" ? "Not published yet" : "No agenda items yet";
  // Teks English baris Rundown. Disimpan ke tabel rundown, bukan landing_config,
  // jadi keadaan tersimpannya dicatat terpisah.
  // null: rundown gagal dimuat, beda dengan rundown tanpa sesi.
  const [rundownEn, setRundownEn] = useState<BarisRundownEn[] | null>([]);
  const [rundownEnTersimpan, setRundownEnTersimpan] = useState<BarisRundownEn[]>([]);
  // Baris rundown yang bisa dipilih sebagai sesi pembicara. null = belum ada
  // atau gagal dimuat (lihat sesiMemuat): pilihan tersimpan tidak disentuh.
  const [barisSesi, setBarisSesi] = useState<BarisSesi[] | null>(null);
  // Tab yang sedang diurutkan di "Order on the page": pratinjau membuka tab yang sama.
  const [tabPembicara, setTabPembicara] = useState<string | null>(null);
  /** Rundown gagal dimuat saat editor dibuka: pemetaan sesi lama menunggu muat ulang yang berhasil. */
  const petakanTertunda = useRef(false);
  const terkini = useRef<{ facts: Facts | null; landing: EventLandingConfig; formInherit: boolean; formSeed: string; tersimpan: string | null }>({
    facts: null, landing: {}, formInherit: true, formSeed: DEFAULT_REGISTRATION_SEED, tersimpan: null,
  });
  const [sesiMemuat, setSesiMemuat] = useState(true);
  const [hasilPetakan, setHasilPetakan] = useState<HasilPetakan | null>(null);
  const [tambahTerbuka, setTambahTerbuka] = useState(false);
  // Baris tersembunyi tetap di tempatnya; penyaring ini hanya menyembunyikannya dari daftar.
  const [tampilTersembunyi, setTampilTersembunyi] = useState(true);
  const [konfirmasiHapus, setKonfirmasiHapus] = useState<{ ids: string[]; judul: string } | null>(null);
  const [urungan, setUrungan] = useState<Urungan | null>(null);
  const akun = useAdminPage()?.username ?? null;
  const kunciPanel = akun ? `${KUNCI_PANEL}:${akun}` : null;
  // Mode bahasa Susunan halaman: ID menyunting halaman, EN hanya teks English-nya.
  // Disimpan per akun seperti lebar panel: penerjemah yang memuat ulang halaman
  // kembali ke mode EN, bukan ke ID lalu mencari pilihannya lagi.
  const kunciBahasa = akun ? `${KUNCI_BAHASA}:${akun}` : null;
  const bahasaTersimpan = useSyncExternalStore(
    langgananLokal,
    () => (kunciBahasa ? bacaLokal<"id" | "en">(kunciBahasa, "id") : "id"),
    () => "id" as const,
  );
  const [bahasaSesi, setBahasaSesi] = useState<"id" | "en" | null>(null);
  const bahasa: "id" | "en" = (bahasaSesi ?? bahasaTersimpan) === "en" ? "en" : "id";
  const setBahasa = useCallback((pilihan: "id" | "en") => {
    setBahasaSesi(pilihan);
    if (kunciBahasa) tulisLokal(kunciBahasa, pilihan);
  }, [kunciBahasa]);
  const lebarTersimpan = useSyncExternalStore(
    langgananLokal,
    () => (kunciPanel ? bacaLokal(kunciPanel, PANEL_BAWAAN) : PANEL_BAWAAN),
    () => PANEL_BAWAAN,
  );
  // Selama diseret lebarnya hidup di state; baru ditulis ke penyimpanan saat dilepas.
  const [lebarSeret, setLebarSeret] = useState<number | null>(null);
  const lebarPanel = jepitPanel(lebarSeret ?? lebarTersimpan);
  const [seret, setSeret] = useState<number | null>(null);
  const [sasaran, setSasaran] = useState<number | null>(null);
  // Dinaikkan setiap kali penyimpanan BERHASIL. Pratinjau memuat halaman publik
  // yang sungguhan, jadi ia hanya boleh disegarkan ketika ada yang benar-benar
  // berubah di sana. Menyegarkannya di setiap ketikan berarti memuat ulang satu
  // halaman penuh berkali-kali per detik.
  const [previewKey, setPreviewKey] = useState(0);
  // Warna formulir disimpan di kolom lain (`registration_form_config.theme`),
  // jadi ia punya keadaan sendiri di layar ini alih-alih ikut `landing`.
  const [formInherit, setFormInherit] = useState(true);
  const [formSeed, setFormSeed] = useState(DEFAULT_REGISTRATION_SEED);
  // Preset yang sedang dipratinjau di tab Theme. Hanya pratinjau yang memakainya;
  // `landing` (dan status Saved) baru berubah saat Apply.
  const [pratinjauPreset, setPratinjauPreset] = useState<string | null>(null);
  // Potret keadaan terakhir yang tersimpan, untuk memberi tahu bahwa pratinjau
  // belum memuat perubahan yang sedang diketik.
  const [tersimpan, setTersimpan] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const response = await fetch(eventApiPath("/api/events"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setError("Couldn't load the event."); return; }
    const body = await response.json().catch(() => null);
    // /api/events mengembalikan daftar; slug dari URL yang menentukan mana.
    const slug = window.location.pathname.match(/^\/e\/([^/]+)/)?.[1];
    const list = (body?.events ?? []) as (Facts & {
      landing_config?: EventLandingConfig;
      registration_form_config?: RegistrationFormConfig;
    })[];
    const found = slug ? list.find((item) => item.slug === slug) : list[0];
    // /api/events hanya memuat acara yang boleh dibuka akun ini, jadi "tidak ada
    // di daftar" bisa berarti acaranya tidak ada ATAU aksesnya belum diberikan.
    if (!found) { setError("This event isn't in the list of events you can open. Ask a super admin for access."); return; }
    const nextLanding = found.landing_config ?? {};
    // `inherit` yang belum pernah disimpan berarti konfigurasi dibuat sebelum
    // saklar ini ada. Acara yang sudah punya warna formulir sendiri dianggap
    // memang memilihnya: ia tidak boleh berganti warna karena sebuah pembaruan.
    const formTheme = found.registration_form_config?.theme;
    const nextInherit = formTheme?.inherit ?? !formTheme?.seed;
    const nextSeed = formTheme?.seed ?? found.landing_config?.theme?.seed ?? DEFAULT_REGISTRATION_SEED;
    setFacts(found);
    setLanding(nextLanding);
    setFormInherit(nextInherit);
    setFormSeed(nextSeed);
    setTersimpan(JSON.stringify({ facts: found, landing: nextLanding, formInherit: nextInherit, formSeed: nextSeed }));
    setError("");
    // Baris yang sama dengan yang dibaca halaman acara (loadAgendaPreview):
    // baris berjudul yang bagian dan barisnya diterbitkan, urut bagian lalu
    // urutan baris.
    const admin = await fetch(eventApiPath("/api/admin/rundown/sections"), { cache: "no-store" }).catch(() => null);
    const isiAdmin = admin?.ok ? await admin.json().catch(() => null) : null;
    if (isiAdmin) {
      setIsiRundown(statusRundown(isiAdmin));
    } else {
      // Tanpa data admin, rundown publik hanya bisa bilang ada atau tidak.
      const rundown = await fetch(eventApiPath("/api/rundown"), { cache: "no-store" }).catch(() => null);
      const publik = rundown?.ok ? await rundown.json().catch(() => null) : null;
      setIsiRundown(publik ? (publik.published ? "ada" : "kosong") : null);
    }
    if (!isiAdmin) {
      setRundownEn(null);
      setRundownEnTersimpan([]);
      setBarisSesi(null);
      petakanTertunda.current = true;
    } else {
      const baris = barisRundownEnDariAdmin(isiAdmin);
      setRundownEn(baris);
      setRundownEnTersimpan(baris);
      // Sesi teks lama dihubungkan ke baris rundown begitu barisnya diketahui.
      // Ikut dicatat sebagai tersimpan: halaman acara sudah menampilkan baris
      // yang sama persis, jadi ini bukan perubahan yang perlu ditekan Simpan.
      const sesi = barisSesiDariAdmin(isiAdmin);
      setBarisSesi(sesi);
      const { landing: terpetakan, hasil } = petakanSesiLama(nextLanding, sesi);
      setHasilPetakan(hasil.terhubung || hasil.perluDipilih ? hasil : null);
      if (terpetakan !== nextLanding) {
        setLanding(terpetakan);
        setTersimpan(JSON.stringify({ facts: found, landing: terpetakan, formInherit: nextInherit, formSeed: nextSeed }));
      }
    }
    setSesiMemuat(false);
  }, []);

  // Baris sesi dimuat ulang saat tab ini kembali difokus: "Atur rundown" membuka
  // Rundown di tab baru, dan baris yang baru ditambahkan harus bisa dipilih.
  const muatBarisSesi = useCallback(async () => {
    const admin = await fetch(eventApiPath("/api/admin/rundown/sections"), { cache: "no-store" }).catch(() => null);
    const isiAdmin = admin?.ok ? await admin.json().catch(() => null) : null;
    // Gagal memuat ulang tidak menghapus daftar yang sudah ada.
    if (!isiAdmin) return;
    const sesi = barisSesiDariAdmin(isiAdmin);
    setBarisSesi(sesi);
    // Rundown gagal dimuat saat editor dibuka: sesi teks lama dihubungkan
    // sekarang, sekali, sama dengan saat memuat. Tercatat tersimpan hanya bila
    // belum ada suntingan, supaya suntingan yang belum disimpan tetap terlihat.
    if (!petakanTertunda.current) return;
    petakanTertunda.current = false;
    // Hanya di sini, sekali: muat ulang karena fokus jendela tidak boleh
    // menimpa terjemahan rundown yang sedang disunting.
    const en = barisRundownEnDariAdmin(isiAdmin);
    setRundownEn(en);
    setRundownEnTersimpan(en);
    setIsiRundown(statusRundown(isiAdmin));
    const kini = terkini.current;
    const { landing: terpetakan, hasil } = petakanSesiLama(kini.landing, sesi);
    setHasilPetakan(hasil.terhubung || hasil.perluDipilih ? hasil : null);
    if (terpetakan === kini.landing) return;
    setLanding(terpetakan);
    // Pemetaan yang sama diterapkan pada salinan tersimpan, supaya hubungan
    // otomatis tidak terhitung suntingan: membatalkan semua suntingan kembali
    // ke "Tersimpan".
    if (kini.tersimpan) {
      const tersimpanLama = JSON.parse(kini.tersimpan) as { landing: EventLandingConfig };
      tersimpanLama.landing = petakanSesiLama(tersimpanLama.landing, sesi).landing;
      setTersimpan(JSON.stringify(tersimpanLama));
    }
  }, []);
  useEffect(() => {
    const onFocus = () => void muatBarisSesi();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [muatBarisSesi]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const sections: LandingSection[] = normalizeLandingSections(landing.sections, landing.blocks);
  const cuplikan = facts ? JSON.stringify({ facts, landing, formInherit, formSeed }) : null;
  // Nilai terbaru untuk muatBarisSesi, yang juga dipanggil dari pendengar fokus jendela.
  useEffect(() => {
    terkini.current = { facts, landing, formInherit, formSeed, tersimpan };
  });
  // Dibandingkan setelah trim: spasi saja tidak dihitung perubahan, sama dengan yang dikirim.
  const rundownBerubah = (rundownEn ?? []).filter(
    (baris, index) => baris.title_en.trim() !== (rundownEnTersimpan[index]?.title_en ?? "").trim() || baris.subtitle_en.trim() !== (rundownEnTersimpan[index]?.subtitle_en ?? "").trim(),
  );
  const berubah = tersimpan !== null && (cuplikan !== tersimpan || rundownBerubah.length > 0);
  const ubahRundown = (id: number, patch: Partial<Pick<BarisRundownEn, "title_en" | "subtitle_en">>) =>
    setRundownEn((current) => current && current.map((baris) => (baris.id === id ? { ...baris, ...patch } : baris)));
  // Draf untuk pratinjau langsung. Dibuat ulang hanya saat isinya berubah,
  // supaya pratinjau tidak dirender ulang di setiap render CMS.
  // Pratinjau preset hanya berlaku selama tab Theme terbuka: pindah tab berarti
  // pratinjau besar kembali menunjukkan isi CMS yang sebenarnya.
  const presetDilihat = bagian === "tema" ? LANDING_THEME_PRESETS.find((preset) => preset.key === pratinjauPreset) ?? null : null;
  const drafPratinjau = useMemo(
    () => (cuplikan && facts ? isiKirim(facts, presetDilihat ? pakaiPreset(presetDilihat, landing) : landing) : null),
    [cuplikan, presetDilihat], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Bilah pratinjau muncul di atas bidang gulir panel dan mendorong isinya
  // turun setinggi bilah. Di desktop bidang gulir itu sendiri yang digeser
  // sebesar selisihnya, supaya kartu yang baru diketuk tetap di tempatnya.
  const bilahPratinjau = useRef<HTMLDivElement>(null);
  // Posisi gulir terakhir dicatat dari event scroll: saat bilah hilang, browser
  // sudah menjepit scrollTop ke batas yang baru sebelum efek ini berjalan.
  const tinggiBilah = useRef(0);
  const gulirTerakhir = useRef(0);
  const bagianTerakhir = useRef(bagian);
  useLayoutEffect(() => {
    const tinggi = bilahPratinjau.current?.offsetHeight ?? 0;
    const selisih = tinggi - tinggiBilah.current;
    tinggiBilah.current = tinggi;
    // Bidang gulir dibuat ulang per tab (key) dan mulai dari 0. Bilah yang sudah
    // ada saat kembali ke Theme hanya dicatat sebagai titik awal, bukan digeser.
    if (bagianTerakhir.current !== bagian) {
      bagianTerakhir.current = bagian;
      gulirTerakhir.current = 0;
      return;
    }
    const gulir = document.querySelector<HTMLElement>("#isi-setelan > .overflow-y-auto");
    if (!selisih || !gulir || gulir.scrollHeight <= gulir.clientHeight) return;
    gulir.scrollTop = gulirTerakhir.current + selisih;
    gulirTerakhir.current = gulir.scrollTop;
  }, [presetDilihat, bagian]);
  function terapkanPratinjau() {
    if (presetDilihat) setLanding(pakaiPreset(presetDilihat, landing));
    setPratinjauPreset(null);
  }

  // Pilihan ID | EN yang diklik di pratinjau memindah mode editor.
  // Baris yang terbuka tetap terbuka di mode lain; daftarnya dirender ulang,
  // jadi panel digulir kembali ke baris itu.
  const pilihBahasa = useCallback((pilihan: "id" | "en") => {
    setBagian("susunan");
    setBahasa(pilihan);
    if (terbuka) gulirKeBaris(terbuka);
  }, [terbuka, setBahasa]);

  function patchFacts(patch: Partial<Facts>) {
    setFacts((current) => (current ? { ...current, ...patch } : current));
  }

  // ---- Ekspor/Impor isi ----------------------------------------------------------
  // Ekspor mengambil isi yang sedang tampil di layar (termasuk yang belum
  // disimpan). Impor hanya mengisi layar: tidak ada yang berubah di halaman
  // publik sampai admin menekan Simpan, jadi isi lama masih bisa dikembalikan
  // dengan memuat ulang halaman.
  const pilihBerkas = useRef<HTMLInputElement>(null);
  const kartuTentangRef = useRef<HTMLDivElement>(null);

  function ekspor() {
    if (!facts) return;
    const berkas: BerkasIsi = {
      format: BERKAS_FORMAT,
      version: 1,
      facts: Object.fromEntries(KOLOM_FAKTA.map((kolom) => [kolom, facts[kolom]])),
      landing: { ...landing, sections },
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(berkas, null, 2)], { type: "application/json" }));
    const tautan = document.createElement("a");
    tautan.href = url;
    tautan.download = `event-page-${facts.slug}-${new Date().toISOString().slice(0, 10)}.json`;
    tautan.click();
    URL.revokeObjectURL(url);
  }

  async function impor(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const isi = await file.text().then((teks) => JSON.parse(teks) as Partial<BerkasIsi>).catch(() => null);
    if (!isi || isi.format !== BERKAS_FORMAT || typeof isi.landing !== "object" || isi.landing === null) {
      toast.error("File not recognised", "Choose a .json file exported from this page.");
      return;
    }
    const fakta = Object.fromEntries(
      KOLOM_FAKTA.filter((kolom) => isi.facts && kolom in isi.facts).map((kolom) => [kolom, isi.facts?.[kolom] ?? null]),
    ) as Partial<Facts>;
    patchFacts(fakta);
    // Kunci yang tidak ada di berkas (gambar sampul, warna, dsb.) tetap memakai
    // isi yang sekarang, jadi berkas tanpa gambar tidak menghapus gambar yang ada.
    setLanding((current) => (barisSesi ? petakanSesiLama({ ...current, ...isi.landing }, barisSesi).landing : { ...current, ...isi.landing }));
    setBagian("susunan");
    toast.success("Content imported", "Check the content, then select Save. Reload the page to discard it.");
  }

  /**
   * Apakah bagian ini punya isi.
   *
   * Aturannya HARUS sama dengan yang dipakai halaman publik: di sana bagian
   * tanpa isi tidak dirender sama sekali. Tanpa penanda ini, saklar menjadi
   * tombol yang berbohong: admin menyalakannya, halaman publik tidak berubah,
   * dan tidak ada apa pun yang menjelaskan kenapa.
   *
   * `agenda` tidak bisa dijawab dari sini: isinya ada di tabel rundown, dan
   * memuatnya hanya untuk lencana berarti satu kueri tambahan setiap kali
   * halaman ini dibuka. Ia dibiarkan `null`: "tidak diketahui", bukan "kosong".
   */
  function sectionHasContent(id: LandingSectionId): boolean | null {
    switch (id) {
      case "about": return Boolean(facts?.description?.trim()) || Boolean(landing.gathering === true && (landing.about_cards ?? []).some((kartu) => kartu.title.trim()));
      case "highlights": return (landing.highlights ?? []).length > 0;
      case "speakers": return (landing.speakers ?? []).some((speaker) => speaker.name.trim());
      case "venue": return Boolean(facts?.venue_name?.trim() || facts?.venue_address?.trim());
      case "faq": return (landing.faq ?? []).length > 0;
      case "sponsors": return (landing.sponsors ?? []).length > 0;
      case "contact": return Boolean(landing.contact_name || landing.contact_phone || landing.contact_email);
      default: return null;
    }
  }

  function moveSection(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setLanding({ ...landing, sections: next });
  }

  /** Isi yang dikirim saat Simpan, dan yang dirender pratinjau langsung. */
  function isiKirim(facts: Facts, isi: EventLandingConfig = landing) {
    // `isi` = landing, kecuali pratinjau preset (yang belum diterapkan).
    const susunan = isi === landing ? sections : normalizeLandingSections(isi.sections, isi.blocks);
    return {
      description: facts.description?.trim() || null,
      tagline: facts.tagline?.trim() || null,
      start_time: facts.start_time || null,
      end_time: facts.end_time || null,
      end_date: facts.end_date || null,
      venue_name: facts.venue_name?.trim() || null,
      venue_address: facts.venue_address?.trim() || null,
      venue_map_url: facts.venue_map_url?.trim() || null,
      landing: {
        ...tanpaEnYatim(isi),
        blocks: tanpaTersembunyiKepanjangan(isi.blocks),
        sections: susunan,
        // Warna merek yang berlaku, satu sumber dengan pemilih warna dan
        // pratinjau: Forum tanpa seed tersimpan sebagai navy, bukan biru formulir.
        theme: { seed: landingTokens(isi).brand },
        // Hanya untuk pratinjau (tombol Masuk). Server mengabaikannya: area
        // peserta disimpan di /admin/area-peserta.
        member: isi.member,
      },
      form_theme: { inherit: formInherit, seed: formSeed },
    };
  }

  async function save() {
    if (!facts) return;
    // Diperiksa di sini, bukan diserahkan ke server: server menolak baris kosong
    // (min 1) tetapi galatnya hanya menyebut "landing", tanpa bagian dan baris mana.
    const angkaKosong = (landing.highlights ?? []).findIndex((item) => !item.label.trim() || !item.value.trim());
    if (angkaKosong >= 0) {
      toast.error("Key figures incomplete", `Row ${angkaKosong + 1}: fill in the label and the figure, or delete the row.`);
      return;
    }
    const tanyaKosong = (landing.faq ?? []).findIndex((item) => !item.q.trim() || !item.a.trim());
    if (tanyaKosong >= 0) {
      toast.error("FAQ incomplete", `Question ${tanyaKosong + 1}: fill in the question and the answer, or delete the question.`);
      return;
    }
    const pembicaraKosong = (landing.speakers ?? []).findIndex((item) => !item.name.trim());
    if (pembicaraKosong >= 0) {
      toast.error("Speakers incomplete", `Speaker ${pembicaraKosong + 1}: fill in the name, or delete the row.`);
      return;
    }
    const blokSalah = sections.findIndex((section) => {
      const blok = isLandingBlockId(section.id) ? (landing.blocks ?? []).find((item) => item.id === section.id) : undefined;
      return blok ? tautanBlokSalah(blok) : false;
    });
    if (blokSalah >= 0) {
      toast.error("Invalid link in a block", `Section ${blokSalah + 1}: enter a full address starting with https://, # for a section on this page, or leave it empty.`);
      return;
    }
    const blokPenuh = sections.findIndex((section) => {
      const blok = isLandingBlockId(section.id) ? (landing.blocks ?? []).find((item) => item.id === section.id) : undefined;
      return blok ? butirBerlebih(blok) > 0 : false;
    });
    if (blokPenuh >= 0) {
      toast.error("Too many items in a block", `Section ${blokPenuh + 1}: the chosen layout holds fewer items. Delete the extra items or choose another layout.`);
      return;
    }
    // Batas karakter juga diperiksa server, tetapi galatnya hanya "Maximum 24
    // characters" tanpa menyebut blok mana. Di sini blok itu dibuka dan disebut.
    for (const [index, section] of sections.entries()) {
      const blok = isLandingBlockId(section.id) ? (landing.blocks ?? []).find((item) => item.id === section.id) : undefined;
      const lewat = blok ? kolomKepanjangan(blok) : null;
      if (blok && lewat) {
        setBagian("susunan");
        setBahasa(lewat.bahasa);
        setTerbuka(blok.id);
        setSorot((current) => ({ id: blok.id, n: (current?.n ?? 0) + 1 }));
        gulirKeBaris(blok.id);
        // Toast langsung; fokus menyusul setelah baris terbuka. Bila kolomnya
        // ternyata tidak ada, toast kedua menyusul (toast tidak bisa diganti).
        const pesan = (akhir: string) => `Section ${index + 2}, ${lewat.kolom}${lewat.bahasa === "en" ? " (English)" : ""}: up to ${plural(lewat.max, "character")}. ${akhir}`;
        toast.error("Text too long", pesan("The field is now shown."));
        fokusKolomLewat(blok.id, undefined, (ketemu) => {
          if (!ketemu) toast.error("Text too long", pesan("The section is now open."));
        });
        return;
      }
    }
    const judulLewat = modern ? judulBagianKepanjangan(landing) : null;
    if (judulLewat) {
      setBagian("susunan");
      setBahasa(judulLewat.bahasa);
      setTerbuka(judulLewat.id);
      if (judulLewat.bahasa === "id") setJudulTerbuka(judulLewat.id);
      gulirKeBaris(judulLewat.id);
      // Kolomnya bisa jauh di bawah baris (mis. judul FAQ di bawah semua pertanyaan).
      const pesan = (akhir: string) =>
        `${LANDING_SECTION_ADMIN_LABELS[judulLewat.id]}, ${judulLewat.kolom}${judulLewat.bahasa === "en" ? " (English)" : ""}: up to ${plural(judulLewat.max, "character")}. ${akhir}`;
      toast.error("Text too long", pesan("The field is now shown."));
      fokusKolomLewat(judulLewat.id, judulLewat.kunci, (ketemu) => {
        if (!ketemu) toast.error("Text too long", pesan("The section is now open."));
      });
      return;
    }
    const forumSalah = landing.layout === "forum" ? forumTautanSalah(landing.forum) : null;
    if (forumSalah) {
      setBagian("susunan");
      setTerbuka(forumSalah.baris);
      gulirKeBaris(forumSalah.baris);
      toast.error("Invalid link", `${forumSalah.pesan} The section is now open.`);
      return;
    }
    const tinggiBilah = landing.nav?.height;
    if (tinggiBilah != null && (tinggiBilah < LANDING_NAV_HEIGHT_MIN || tinggiBilah > LANDING_NAV_HEIGHT_MAX)) {
      setBagian("susunan");
      setBahasa("id");
      setTerbuka("pembuka");
      gulirKeBaris("pembuka");
      toast.error("Top bar height out of range", `Hero, Top bar: enter ${LANDING_NAV_HEIGHT_MIN} to ${LANDING_NAV_HEIGHT_MAX} px. The section is now open.`);
      return;
    }
    const kirim = cuplikan;
    setBusy(true);
    // Teks English Rundown lebih dulu: bila gagal, isi halaman belum disimpan dan
    // admin bisa mencoba lagi dengan satu tombol yang sama.
    let rundownTerkirim = 0;
    for (const baris of rundownBerubah) {
      const hasil = await fetch(eventApiPath("/api/admin/rundown/items"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: baris.id, title_en: baris.title_en.trim() || null, subtitle_en: baris.subtitle_en.trim() || null }),
      }).catch(() => null);
      if (!hasil?.ok) {
        setBusy(false);
        if (rundownTerkirim > 0) setPreviewKey((current) => current + 1);
        // Buka dan tunjukkan kartunya, sama dengan galat Simpan lainnya.
        setBagian("susunan");
        setBahasa("en");
        setTerbuka("agenda");
        gulirKeBaris("agenda");
        window.setTimeout(() => {
          const kartu = document.getElementById(kartuRundownId(baris.id));
          const wadah = kartu?.closest<HTMLElement>(".overflow-y-auto");
          if (kartu && wadah) {
            const atas = kartu.getBoundingClientRect().top - wadah.getBoundingClientRect().top + wadah.scrollTop;
            wadah.scrollTo({ top: Math.max(0, atas - 96), behavior: "smooth" });
          }
          kartu?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
        }, 300);
        const sudah = rundownTerkirim > 0 ? ` ${plural(rundownTerkirim, "earlier session")} already live.` : "";
        toast.error("Couldn't save", `Agenda, session ${baris.jam} (English): ${(hasil && pesanGalatApi(await hasil.json().catch(() => ({})))) ?? "try again."}${sudah} The card is now open.`);
        return;
      }
      rundownTerkirim += 1;
      setRundownEnTersimpan((current) => current.map((lama) => (lama.id === baris.id ? baris : lama)));
    }
    // Pratinjau membaca rundown dari database: muat ulang begitu teks English
    // sesi tersimpan, juga bila isi halaman di bawah ini gagal disimpan.
    if (rundownTerkirim > 0) setPreviewKey((current) => current + 1);
    const response = await fetch(eventApiPath("/api/admin/landing"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // `member` hanya untuk pratinjau; area peserta disimpan di halamannya sendiri.
      body: JSON.stringify(isiKirim(facts), (kunci, nilai) => (kunci === "member" ? undefined : nilai)),
    }).catch(() => null);
    setBusy(false);
    if (!response) { toast.error("Connection failed", "Reload to see what was saved."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Couldn't save", pesanGalatApi(body) ?? "Try again.");
      return;
    }
    setTersimpan(kirim);
    setPreviewKey((current) => current + 1);
    toast.success("Saved", "The public event page now shows the new content.");
  }

  // ---- Isian per bagian ------------------------------------------------------------
  // Setiap bagian halaman punya isiannya sendiri, dibuka di bawah barisnya di
  // Susunan halaman. Kolom yang dulu tersebar di tab Isi dan Tampilan pindah ke
  // bagian tempat ia tampil, supaya admin mencari isian di tempat ia melihatnya.
  const gayaBanner = landing.banner_style ?? "theme";
  const tataLetak: LandingLayout = landing.layout ?? "editorial";
  const modern = tataLetak === "modern";
  const forum = tataLetak === "forum";
  // Gaya gathering (preset Gathering) hanya dibaca tata letak Modern.
  const gathering = modern && landing.gathering === true;
  // Teks yang tampil di halaman Indonesia tetapi belum punya versi English.
  const kurangEn = landingUntranslated({
    landing_config: { ...landing, sections },
    event_date: facts?.event_date,
    end_date: facts?.end_date,
    venue_name: facts?.venue_name,
    tagline: facts?.tagline,
    description: facts?.description,
    venue_address: facts?.venue_address,
  });
  // Baris Rundown dihitung hanya bila Susunan acara tampil, sama dengan teks lain.
  const agendaAktif = sections.some((section) => section.id === "agenda" && section.enabled);
  const rundownKurangEn = agendaAktif ? rundownBelumDiterjemahkan(rundownEn ?? []) : 0;
  // Judul rundown juga menjadi label tab sesi Pembicara. Tanpa Susunan acara,
  // baris yang dipegang pembicara tetap dihitung, supaya tab English tidak diam-diam
  // berbahasa Indonesia. Dengan Susunan acara, barisnya sudah terhitung di atas.
  const idSesiDipakai = new Set((landing.speakers ?? []).flatMap((speaker) => (speaker.name?.trim() ? speaker.session_refs ?? [] : []).map((item) => item.id)));
  const sesiKurangEn = !agendaAktif && sections.some((section) => section.id === "speakers" && section.enabled)
    ? (rundownEn ?? []).filter((baris) => idSesiDipakai.has(baris.id) && baris.title.trim() && !baris.title_en.trim()).length
    : 0;
  const belumDiterjemahkan = kurangEn.length + rundownKurangEn + sesiKurangEn;
  const barisKurangEn = new Set(kurangEn.map((teks) => teks.section));
  // Rundown gagal dimuat: jumlahnya tidak diketahui, jadi barisnya tetap ditandai.
  if (rundownKurangEn > 0 || (agendaAktif && rundownEn === null)) barisKurangEn.add("agenda");
  if (sesiKurangEn > 0) barisKurangEn.add("speakers");
  const modeEn = modern && bahasa === "en";
  // Pembicara yang sesinya hilang dari rundown atau masih teks lama yang belum
  // terhubung: ditandai titik di baris Pembicara. Selama rundown belum dimuat
  // (atau gagal) teks lama tidak dihitung: cocok tidaknya belum diketahui.
  const sesiLamaBelumTerhubung =
    barisSesi === null ? 0 : (landing.speakers ?? []).filter((speaker) => speaker.name?.trim() && !sesiDariRundown(speaker) && !!speaker.session?.trim()).length;
  const sesiPerluDipilih =
    (landing.speakers ?? []).filter((speaker) => speaker.name?.trim() && sesiHilang(speaker, barisSesi).length > 0).length + sesiLamaBelumTerhubung;
  const catatanProgram = landing.program_notes ?? [];
  const setCatatanProgram = (next: string[]) => setLanding({ ...landing, program_notes: next });
  // Terjemahannya ikut terhapus, supaya terjemahan keterangan berikutnya tidak
  // bergeser ke kartu yang salah (en.program_notes diurutkan sama).
  const hapusCatatanProgram = (index: number) => {
    const buang = (daftar: string[]) => daftar.filter((_, position) => position !== index);
    setLanding({
      ...landing,
      program_notes: buang(catatanProgram),
      en: landing.en?.program_notes ? { ...landing.en, program_notes: buang(landing.en.program_notes) } : landing.en,
    });
  };

  const tokensHero = landingTokens(landing);
  // Kotak HP di kanan hero gathering. Isinya otomatis dari layar lain, jadi
  // panel ini menyebut sumber tiap bagiannya dan memberi jalan ke sana (CMS
  // mudah, butir 1): sebelumnya kotak ini tidak punya baris di editor sama sekali.
  const portalAktif = landing.member?.enabled === true;
  const sesiPertama = barisSesi?.[0] ?? null;
  const tautanSumberPortal = (href: string, label: string) =>
    facts ? (
      // Tab baru, sesuai ikonnya: editor ini tidak menahan perubahan yang belum disimpan (QA #109 M6).
      <Link href={`/e/${facts.slug}${href}`} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-sm text-body-medium font-medium text-primary hover:underline">
        {label}
        <ArrowSquareOut size={14} aria-hidden />
      </Link>
    ) : null;
  const panelPratinjauPortal = (
    <Kelompok
      title={
        <>
          Portal preview
          <StatusChip tone="neutral">Automatic</StatusChip>
        </>
      }
      note="The phone on the right of the hero. It shows while the Participant area is open, and fills itself from the Agenda and the Participant area. Hidden on phones."
    >
      <Switch
        checked={landing.portal_preview !== false}
        onChange={(value) => setLanding({ ...landing, portal_preview: value })}
        label="Show the portal preview"
        disabled={busy || !portalAktif}
        description={portalAktif ? undefined : "The Participant area is closed, so the preview is not shown."}
      />
      {portalAktif ? (
        <dl className="flex flex-col divide-y divide-outline-variant rounded-md border border-outline-variant">
          <div className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <dt className="text-body-medium font-semibold text-on-surface">First up</dt>
              <dd className="mt-0.5 text-body-medium text-on-surface-variant">
                {sesiPertama ? `The next session from the Agenda. Before the event: ${sesiPertama.jam} ${sesiPertama.title}.` : "The next session from the Agenda. No published session yet, so this card is empty."}
              </dd>
            </div>
            {tautanSumberPortal("/admin/rundown", "Agenda")}
          </div>
          <div className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <dt className="text-body-medium font-semibold text-on-surface">Tiles</dt>
              <dd className="mt-0.5 text-body-medium text-on-surface-variant">
                {landing.member?.show_logistics ? "Bus and Room, because Room and bus is on in the Participant area." : "Entry ticket and Announcements. Turn on Room and bus in the Participant area to show Bus and Room instead."}
              </dd>
            </div>
            {tautanSumberPortal("/admin/area-peserta", "Participant area")}
          </div>
          <div className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <dt className="text-body-medium font-semibold text-on-surface">Card title</dt>
              <dd className="mt-0.5 text-body-medium text-on-surface-variant">Fixed text: &ldquo;Perjalanan Anda&rdquo;, or &ldquo;Your trip&rdquo; on the English page.</dd>
            </div>
          </div>
        </dl>
      ) : (
        <div>{tautanSumberPortal("/admin/area-peserta", "Open Participant area")}</div>
      )}
    </Kelompok>
  );
  const isiPortal = (
    <>
      <p className="text-body-medium text-on-surface-variant">
        This section appears automatically at the end of the page while the Participant area is open. Its text is fixed, and its tiles follow the Participant area: entry ticket, room and bus, and announcements. The top bar gets a link to it, &ldquo;Perjalanan&rdquo; (&ldquo;Your trip&rdquo; in English).
      </p>
      {tautanSumberPortal("/admin/area-peserta", "Open Participant area")}
    </>
  );
  const isiPembuka = facts ? (
    <div className="flex flex-col gap-5">
      <Kelompok title="Content" first>
        <TextField
          label="Event name on the public page"
          data-kolom="public_name"
          optional
          hint={
            gathering
              ? "Shown in the top bar, the label above the title, the form and link preview. In the gathering layout the Title below is the large heading, or this name when Title is empty. Leave empty to use the event name from admin."
              : "The large title in the hero, top bar, form and link preview. Leave empty to use the event name from admin."
          }
          maxLength={120}
          value={landing.public_name ?? ""}
          onChange={(event) => setLanding({ ...landing, public_name: event.target.value })}
        />
        {gathering ? (
          <HighlightField
            label="Title"
            data-kolom="tagline"
            optional
            hint="The large title in the hero. Select a word and press Highlight to show it in the accent colour."
            accent={tokensHero.accent ?? "#d4a72c"}
            maxLength={200}
            value={facts.tagline ?? ""}
            onChange={(tagline) => patchFacts({ tagline })}
          />
        ) : (
          <TextArea
            label="Tagline"
            data-kolom="tagline"
            optional
            rows={2}
            hint="One sentence below the event name."
            value={facts.tagline ?? ""}
            onChange={(event) => patchFacts({ tagline: event.target.value })}
          />
        )}
      </Kelompok>

      {/* Bilah atas hanya ada di tata letak Modern; Editorial punya nav sendiri. */}
      {modern ? (
        <div data-kolom="nav">
        <BilahAtasEditor
          value={landing.nav ?? {}}
          onChange={(nav) => setLanding({ ...landing, nav })}
          eventName={landing.public_name?.trim() || facts.name || "Nama acara"}
          disabled={busy}
          gathering={gathering}
        />
        </div>
      ) : null}

      {/* Hero gathering punya ukuran dan susunan sendiri: kontrol yang tidak
          mengubah apa pun tidak ditampilkan (QA #103 L4). */}
      {gathering ? null : (
      <Kelompok title="Size" note="In px, for wide screens. Scales down automatically on phones.">
        <AngkaPx
          label="Event name size"
          rentang={LANDING_HEADING_SIZE}
          value={landing.heading_size ?? JUDUL_PRESET_PX[landing.heading_scale ?? "lg"]}
          onChange={(value) => setLanding({ ...landing, heading_size: value })}
          hint="Long names look tidier at 48 to 64. On phones about 60% of this value."
        />
        <AngkaPx
          label="Hero height"
          rentang={LANDING_HERO_HEIGHT_PX}
          value={landing.hero_min_height ?? HERO_PRESET_PX[landing.hero_height ?? "standard"]}
          onChange={(value) => setLanding({ ...landing, hero_min_height: value })}
          hint="Never taller than the visitor's screen, so the register button stays visible. On phones 75% of this value."
        />
      </Kelompok>
      )}

      {/* Setelan bagian, bukan tema global (Shopify: Image banner). Kiri/Tengah
          saja: rata kanan di teks Latin membuat mata mencari awal baris, dan di
          ponsel harus jatuh ke kiri juga. Editorial hanya Kiri, karena kolom
          fakta acara berdiri di kanan judul. */}
      {gathering ? null : modern ? (
        <Kelompok title="Text placement" note={landing.banner_url ? "Bottom keeps the KV visible above the title." : undefined}>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-2">
              <p id="label-hero-rata" className="text-body-medium font-medium text-on-surface">Alignment</p>
              <SegmentedButton<LandingHeroAlign>
                className="w-full"
                label="Alignment"
                labelledBy="label-hero-rata"
                value={tokensHero.heroAlign}
                onChange={(hero_align) => setLanding({ ...landing, hero_align })}
                options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }]}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <p id="label-hero-posisi" className="text-body-medium font-medium text-on-surface">Position</p>
              <SegmentedButton<LandingHeroPosition>
                className="w-full"
                label="Position"
                labelledBy="label-hero-posisi"
                value={tokensHero.heroPosition}
                onChange={(hero_position) => setLanding({ ...landing, hero_position })}
                options={[{ value: "bottom", label: "Bottom" }, { value: "middle", label: "Middle" }]}
              />
            </div>
          </div>
        </Kelompok>
      ) : (
        <Kelompok title="Text placement" note="Editorial keeps the title on the left, because the event facts sit in the column to its right. Modern can centre it.">
          <div className="flex flex-col gap-2">
            <p id="label-hero-rata" className="text-body-medium font-medium text-on-surface">Alignment</p>
            <SegmentedButton<LandingHeroAlign>
              className="w-full"
              label="Alignment"
              labelledBy="label-hero-rata"
              value="left"
              onChange={() => undefined}
              options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre", disabled: true }]}
            />
          </div>
        </Kelompok>
      )}

      {gathering ? (
        <Kelompok title="Hero text" note="The gathering hero: a label, the tagline as the title, and a line below it.">
          <TextField
            label="Label above the title"
            data-kolom="hero_eyebrow"
            optional
            maxLength={60}
            hint={'Empty shows "You\'re invited · event name" while the page is invite only.'}
            value={landing.hero_eyebrow ?? ""}
            onChange={(event) => setLanding({ ...landing, hero_eyebrow: event.target.value })}
          />
          <TextArea
            label="Line below the title"
            data-kolom="hero_note"
            optional
            rows={3}
            maxLength={240}
            counter
            hint="One or two sentences on what the trip is. Press Enter to start a new line."
            value={landing.hero_note ?? ""}
            onChange={(event) => setLanding({ ...landing, hero_note: event.target.value })}
          />
          {/* Logo hero dari gaya sebelumnya: tidak lagi digambar, jadi admin
              melihatnya dan bisa menghapusnya (QA #103 L5). */}
          {landing.hero_logo_url ? (
            <div className="flex items-center gap-3 rounded-md border border-outline-variant p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={landing.hero_logo_url} alt="" className="h-10 w-16 shrink-0 object-contain" />
              <p className="min-w-0 flex-1 text-body-medium text-on-surface-variant">
                This hero logo is not shown in the gathering layout. Put it in Top bar, Event logo instead, or remove it.
              </p>
              <Button variant="outlined" size="sm" disabled={busy} onClick={() => setLanding({ ...landing, hero_logo_url: null })}>
                Remove
              </Button>
            </div>
          ) : null}
        </Kelompok>
      ) : null}

      {/* KV gathering: tekstur 20% di atas gradasi navy hero dan kepala portal
          (Figma Hanung 2026-10-08). Kosong = gradasi saja seperti sebelumnya. */}
      {gathering ? (
        <div data-kolom="hero_bg_url">
          <Kelompok title="Background image" note="Two layers behind the hero and at the top of the participant portal: the image, faded, on top of a colour layer.">
            <ImageUploadField
              label="Hero background image"
              kind="landing"
              fit="cover"
              previewClassName="h-20 w-36"
              perkecil={{ lebar: 1920, mutu: 0.75 }}
              hint="Use an artwork without text, such as the event ornaments. It is cropped to fill the area, so keep the important parts near the middle. Landscape, at least 1440×480. Most browsers save wider images at 1920 px wide. PNG, JPG or WebP, up to 5 MB and 8000 px."
              value={landing.hero_bg_url ?? null}
              onChange={(url, berkas) => {
                setLanding({ ...landing, hero_bg_url: url, hero_bg_on: url ? true : landing.hero_bg_on, hero_bg_terang: undefined, hero_bg_terang_src: undefined });
                // Terangnya diukur dari berkas yang diunggah, bersama URL-nya
                // (kvGathering menakar bayangan darinya).
                if (url && berkas)
                  void ukurTerangKv(berkas).then(
                    (terang) => terang && setLanding((kini) => (kini.hero_bg_url === url ? { ...kini, hero_bg_terang: terang, hero_bg_terang_src: url } : kini)),
                  );
              }}
              disabled={busy}
            />
            <Switch
              checked={Boolean(landing.hero_bg_url) && landing.hero_bg_on !== false}
              onChange={(value) => setLanding({ ...landing, hero_bg_on: value })}
              label="Show the image"
              description={landing.hero_bg_url ? "Off keeps the image saved and shows the hero as it was without it." : "Upload an image first."}
              disabled={busy || !landing.hero_bg_url}
            />
            {landing.hero_bg_url && landing.hero_bg_on !== false ? (
              <AngkaPx
                label="Image strength"
                satuan="%"
                rentang={HERO_KV_KUAT}
                value={landing.hero_bg_opacity ?? HERO_KV_KUAT.bawaan}
                onChange={(value) => setLanding({ ...landing, hero_bg_opacity: value })}
                hint="How much of the image shows through. 20 matches the design. Higher values add a dark shade over the image where needed, so the text stays readable."
              />
            ) : null}
            {landing.hero_bg_url && landing.hero_bg_on !== false ? (
            <div className="flex flex-col gap-2">
              <p id="label-lapisan-warna" className="text-body-medium font-medium text-on-surface">Colour layer</p>
              <SegmentedButton<"merek" | "sendiri">
                className="w-full"
                label="Colour layer"
                labelledBy="label-lapisan-warna"
                value={landing.hero_bg_color ? "sendiri" : "merek"}
                onChange={(value) => setLanding({ ...landing, hero_bg_color: value === "sendiri" ? (landing.hero_bg_color ?? tokensHero.brand ?? "#1B2D57") : undefined })}
                options={[
                  { value: "merek", label: "Brand colour" },
                  { value: "sendiri", label: "Custom colour" },
                ]}
              />
              {landing.hero_bg_color ? (
                <PilihWarna label="Layer colour" value={landing.hero_bg_color} onChange={(value) => setLanding({ ...landing, hero_bg_color: value })} />
              ) : null}
              <p className="text-body-medium text-on-surface-variant">
                {landing.hero_bg_color
                  ? "Shown as a gradient. A light colour is darkened so the text stays readable; the text and button colours follow it."
                  : "The navy gradient from Theme, the same as without an image."}
              </p>
            </div>
            ) : null}
          </Kelompok>
        </div>
      ) : null}

      {gathering ? <div data-kolom="portal">{panelPratinjauPortal}</div> : null}

      {/* Gathering tidak memakai KV di hero: kolomnya pindah ke tab Theme,
          grup Page, dengan nama sesuai gunanya (QA #110, Mas Hanung 8 Okt). */}
      {gathering ? null : (
      <Kelompok title="Background image (KV)">
        <ImageUploadField
          label="Hero image (KV)"
          kind="landing"
          fit="cover"
          previewClassName="h-20 w-36"
          hint="16:9 ratio, at least 1920×1080. Keep the important part of the image at the top or right: the title sits bottom left. PNG, JPG or WebP, up to 5 MB."
          value={landing.banner_url ?? null}
          onChange={(url) => setLanding({ ...landing, banner_url: url })}
          disabled={busy}
        />
        {/* Pilihan ini hanya muncul saat bannernya ada. Tanpa gambar, kedua
            opsi menghasilkan halaman yang sama persis, dan kontrol yang tidak
            mengubah apa pun membuat admin ragu apakah dirinya salah pakai. */}
        {landing.banner_url && !gathering ? (
          <div>
            <p className="text-body-medium font-medium text-on-surface">KV style</p>
            <SegmentedButton
              className="mt-1.5 w-full"
              label="KV style"
              value={gayaBanner}
              onChange={(value) => setLanding({ ...landing, banner_style: value })}
              options={[
                { value: "theme", label: LANDING_BANNER_STYLE_LABELS.theme },
                { value: "photo", label: LANDING_BANNER_STYLE_LABELS.photo },
              ]}
            />
            <p className="mt-1.5 text-body-medium text-on-surface-variant">
              {gayaBanner === "theme"
                ? "The image is blended into the page colour. It matches, but strongly coloured images turn pale."
                : "The image keeps its original colours. The bottom gets a dark shade and the hero text turns white so it stays readable."}
            </p>
          </div>
        ) : null}
      </Kelompok>
      )}

      <Kelompok title="Button">
        <TextField
          label="Register button text"
          optional
          placeholder="Daftar sekarang"
          maxLength={40}
          counter
          value={landing.cta_label ?? ""}
          onChange={(event) => setLanding({ ...landing, cta_label: event.target.value })}
        />
      </Kelompok>

      <Kelompok
        title="Time"
        note={
          gathering
            ? "The gathering hero shows the dates and the trip length (like 3 days 2 nights), counted from the start and end date. It does not show the times; they are used in calendar files and emails."
            : "Also used in calendar files and emails, not only on this page."
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Start time"
            optional
            type="time"
            value={jamInput(facts.start_time)}
            onChange={(event) => patchFacts({ start_time: event.target.value || null })}
          />
          <TextField
            label="End time"
            optional
            type="time"
            value={jamInput(facts.end_time)}
            onChange={(event) => patchFacts({ end_time: event.target.value || null })}
          />
        </div>
        <TextField
          label="End date"
          optional
          type="date"
          hint={`Fill in only if the event runs over more than one day. The start date (${facts.event_date ? formatTanggal(facts.event_date) : "not set yet"}) is set in Edit details on the dashboard.`}
          value={facts.end_date ?? ""}
          onChange={(event) => patchFacts({ end_date: event.target.value || null })}
        />
      </Kelompok>
    </div>
  ) : null;

  // ---- Judul bagian (Modern) ----------------------------------------------------
  // Label kecil dan judul bagian bawaan, terlipat di bawah isi bagian supaya
  // daftar pertanyaan dan rundown tetap terlihat. Kolom mulai kosong: teks
  // abu-abunya adalah yang tampil bila dibiarkan kosong, jadi judul otomatis
  // (tanggal, nama tempat, jumlah pembicara) tetap ikut data acara.
  function judulBagian(id: LandingHeadedSection, otomatis: { judul: string; jenis: string; hint: string }, tambahan?: ReactNode): ReactNode {
    if (!modern) return null;
    // Rundown gathering selalu memakai label kecil ("Rundown" bila kosong) dan
    // tidak membaca sakelarnya: panel menampilkan yang benar-benar tampil (CMS mudah, butir 6).
    const selalu = gathering && id === "agenda";
    const nyala = selalu || landingEyebrowShown(landing, id);
    const alisBawaan = selalu ? "Rundown" : LANDING_SECTION_LABELS[id];
    const alis = landing[`${id}_eyebrow`] ?? "";
    const kunciJudul = id === "about" ? "about_heading" : (`${id}_heading` as const);
    const judul = landing[kunciJudul] ?? "";
    const buka = judulTerbuka === id;
    const catatan = id === "agenda" && landing.agenda_note?.trim() ? " · Note filled in" : "";
    const ringkasan = `Label: ${nyala ? alis.trim() || alisBawaan : "hidden"} · Heading: ${judul.trim() || otomatis.jenis}${catatan}`;
    return (
      <div className="flex flex-col gap-4 border-t border-outline-variant pt-2">
        <button
          type="button"
          aria-expanded={buka}
          onClick={() => setJudulTerbuka(buka ? null : id)}
          className="m3-state -mx-2 flex min-h-12 items-center gap-2 rounded-sm px-2 text-left"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body-medium font-semibold text-on-surface">Section heading</span>
            <span className="truncate text-body-small text-on-surface-variant">{ringkasan}</span>
          </span>
          <CaretDown size={14} aria-hidden className={cx("shrink-0 text-on-surface-variant transition-transform", buka && "rotate-180")} />
        </button>
        {buka ? (
          <>
            {selalu ? null : (
              <Switch
                checked={nyala}
                onChange={(value) => setLanding({ ...landing, eyebrow_shown: { ...landing.eyebrow_shown, [id]: value } })}
                label="Small label above the heading"
              />
            )}
            {/* Dimatikan: kolomnya disembunyikan, isinya tetap tersimpan (kecuali
                terlalu panjang: Simpan menolaknya, jadi harus terlihat). */}
            {nyala || alis.trim().length > LANDING_SECTION_TEXT_MAX.eyebrow ? (
              <TextField
                data-kolom={`${id}_eyebrow`}
                className={TEKS_BAWAAN}
                label="Small label"
                optional
                placeholder={alisBawaan}
                hint={selalu ? "One to three words above the heading. The gathering layout always shows this label." : "One to three words above the heading."}
                maxLength={LANDING_SECTION_TEXT_MAX.eyebrow}
                counter
                value={alis}
                onChange={(event) => setLanding({ ...landing, [`${id}_eyebrow`]: event.target.value })}
              />
            ) : null}
            <TextField
              data-kolom={kunciJudul}
              className={TEKS_BAWAAN}
              label="Heading"
              placeholder={otomatis.judul}
              hint={otomatis.hint}
              maxLength={LANDING_SECTION_TEXT_MAX.heading}
              counter={{ ideal: LANDING_SECTION_TEXT_MAX.headingIdeal }}
              value={judul}
              onChange={(event) => setLanding({ ...landing, [kunciJudul]: event.target.value })}
            />
            {tambahan}
          </>
        ) : null}
      </div>
    );
  }
  const tanggalAcara = facts ? formatEventDate({ ...facts, time_zone: DEFAULT_TIME_ZONE }) : null;
  const pembicaraIsi = (landing.speakers ?? []).filter((speaker) => speaker.name?.trim());
  const lembaga = jumlahLembaga(pembicaraIsi);
  const KOSONG_BAWAAN = "Leave empty for the default text.";
  // Placeholder judul bagian adalah teks yang benar-benar tampil bila kolom
  // kosong, jadi warnanya penuh on-surface-variant (5,33:1), bukan /70 contoh.
  const TEKS_BAWAAN = "[&_input::placeholder]:text-on-surface-variant [&_textarea::placeholder]:text-on-surface-variant";

  // Gambar di samping deskripsi (Modern). Otomatis = perilaku sebelum pilihan
  // ini ada, jadi acara lama tidak berubah sampai admin memilih.
  const mediaTentang = landing.about_media ?? "auto";
  const gambarTentang = (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-body-medium font-medium text-on-surface">Image</p>
        <SegmentedButton<keyof typeof LANDING_ABOUT_MEDIA_LABELS>
          className="mt-1.5 w-full"
          label="Image"
          value={mediaTentang}
          onChange={(about_media) => setLanding({ ...landing, about_media })}
          options={(["auto", "image", "none"] as const).map((value) => ({ value, label: LANDING_ABOUT_MEDIA_LABELS[value] }))}
        />
        <p className="mt-1.5 text-body-medium text-on-surface-variant">
          {mediaTentang === "auto" && gathering
            ? "No image in the gathering style: the heading and cards stand alone. Choose Image to show one."
            : mediaTentang === "auto"
            ? landing.banner_url
              ? "The hero image (KV) with a figure on top: the first figure in Key figures, or the number of agenda sessions. Breaks such as registration and lunch are not counted."
              : "A panel in the page colour with a figure: the first figure in Key figures, or the number of agenda sessions. Breaks such as registration and lunch are not counted."
            : mediaTentang === "image"
              ? "Shown as uploaded, without a figure on top."
              : "The description stands alone, without an image."}
        </p>
      </div>
      {mediaTentang === "image" ? (
        <>
          <ImageUploadField
            label="About image"
            kind="landing"
            fit="cover"
            previewClassName="h-24 w-28"
            hint={
              gathering
                ? "Landscape (4:3), at least 1250×940. PNG, JPG or WebP, up to 5 MB. Until an image is uploaded, no image shows."
                : "Close to square (8:7), at least 1250×1100. PNG, JPG or WebP, up to 5 MB. Until an image is uploaded, the automatic panel shows."
            }
            value={landing.about_image_url ?? null}
            onChange={(url) => setLanding({ ...landing, about_image_url: url })}
            disabled={busy}
          />
          {landing.about_image_url ? (
            <TextField
              label="Image description"
              optional
              maxLength={LANDING_IMAGE_ALT_MAX}
              counter
              placeholder="e.g. Participants at last year's forum"
              hint="Read aloud by screen readers. Leave empty if the image is only decoration."
              value={landing.about_image_alt ?? ""}
              onChange={(event) => setLanding({ ...landing, about_image_alt: event.target.value })}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );

  // Gaya gathering: kartu berikon di bawah judul Tentang acara (rancangan pen.dev).
  const kartuTentang = landing.about_cards ?? [];
  const setKartuTentang = (next: typeof kartuTentang) => setLanding({ ...landing, about_cards: next });
  // Fokus setelah Add card dan Delete (QA #107 L2): ke judul kartu yang dituju,
  // atau ke Add card bila tidak ada kartu lagi. Tanpa ini fokus jatuh ke <body>.
  const fokusKartu = (index: number) =>
    requestAnimationFrame(() => {
      const wadah = kartuTentangRef.current;
      const judul = wadah?.querySelectorAll<HTMLInputElement>("[data-kartu-tentang] input");
      const tujuan = judul && judul.length > 0 ? judul[Math.min(index, judul.length - 1)] : wadah?.querySelector<HTMLButtonElement>("[data-tambah-kartu] button");
      tujuan?.focus();
    });
  const hapusKartu = (index: number) => {
    // Terjemahan English ikut bergeser supaya tetap sepasang dengan kartunya.
    const en = landing.en?.about_cards ? { ...landing.en, about_cards: landing.en.about_cards.filter((_, position) => position !== index) } : landing.en;
    setLanding({ ...landing, about_cards: kartuTentang.filter((_, position) => position !== index), ...(en ? { en } : {}) });
    fokusKartu(index);
  };
  const editorKartuTentang = (
    <div ref={kartuTentangRef} className="flex flex-col gap-3">
      <div>
        <p className="text-body-medium font-medium text-on-surface">Cards</p>
        <p className="mt-0.5 text-body-medium text-on-surface-variant">
          Up to {LANDING_ABOUT_CARDS.max} cards with an icon under the heading. Cards without a title are not shown.
        </p>
      </div>
      {kartuTentang.map((kartu, index) => (
        <div key={index} data-kartu-tentang className="flex flex-col gap-3 rounded-md border border-outline-variant p-3">
          <div className="flex items-end gap-2">
            <TextField
              className="min-w-0 flex-1"
              label={`Card ${index + 1} title`}
              maxLength={LANDING_ABOUT_CARDS.title}
              value={kartu.title}
              onChange={(event) => { const next = [...kartuTentang]; next[index] = { ...next[index], title: event.target.value }; setKartuTentang(next); }}
            />
            <IconButton size="sm" label={`Delete card ${index + 1}`} className="text-error" onClick={() => hapusKartu(index)}>
              <Trash size={16} />
            </IconButton>
          </div>
          <TextArea
            label="Text"
            optional
            rows={2}
            maxLength={LANDING_ABOUT_CARDS.body}
            counter
            value={kartu.body}
            onChange={(event) => { const next = [...kartuTentang]; next[index] = { ...next[index], body: event.target.value }; setKartuTentang(next); }}
          />
        </div>
      ))}
      {kartuTentang.length < LANDING_ABOUT_CARDS.max ? (
        <div data-tambah-kartu>
          <Button
            variant="outlined"
            size="sm"
            icon={<Plus size={16} />}
            onClick={() => {
              setKartuTentang([...kartuTentang, { title: "", body: "" }]);
              fokusKartu(kartuTentang.length);
            }}
          >
            Add card
          </Button>
        </div>
      ) : null}
    </div>
  );

  const isiTentang = facts ? (
    <div className="flex flex-col gap-4">
      <TextArea
        label="Event description"
        optional
        rows={6}
        hint="Separate paragraphs with Enter; the breaks show on the page."
        value={facts.description ?? ""}
        onChange={(event) => patchFacts({ description: event.target.value })}
      />
      {modern ? gambarTentang : null}
      {judulBagian("about", { judul: LANDING_SECTION_LABELS.about, jenis: "default", hint: gathering ? "The large sentence above the cards." : "The large sentence next to the event description." })}
      {gathering ? editorKartuTentang : null}
    </div>
  ) : null;

  const isiLokasi = facts ? (
    <div className="flex flex-col gap-4">
      <TextField
        label="Venue name"
        optional
        placeholder="e.g. Grand Ballroom, Hotel Mulia"
        hint="Also used in calendar files and emails."
        value={facts.venue_name ?? ""}
        onChange={(event) => patchFacts({ venue_name: event.target.value })}
      />
      <TextArea
        label="Address"
        optional
        rows={3}
        value={facts.venue_address ?? ""}
        onChange={(event) => patchFacts({ venue_address: event.target.value })}
      />
      <TextField
        label="Map link"
        optional
        type="url"
        hint={
          gathering
            ? "Google Maps or similar, for the \"Buka peta\" or \"Buka di Google Maps\" button. Not used while Logistics has a hotel, because the page shows the hotel instead. Empty = the button searches the venue name and address."
            : modern
            ? "Google Maps or similar, for the \"Buka peta\" or \"Buka di Google Maps\" button. The map on the page is drawn from the venue name and address, so check those match. Empty = the button searches them."
            : "Google Maps or similar. Opens as a link instead of being embedded, so the page loads no third-party scripts for visitors."
        }
        placeholder="https://maps.app.goo.gl/..."
        value={facts.venue_map_url ?? ""}
        onChange={(event) => patchFacts({ venue_map_url: event.target.value })}
      />
      {judulBagian(
        "venue",
        facts.venue_name?.trim()
          ? { judul: facts.venue_name.trim(), jenis: "automatic (venue name)", hint: "Leave empty to use the venue name." }
          : { judul: LANDING_SECTION_LABELS.venue, jenis: "default", hint: "Leave empty to use the venue name once it is filled in." },
      )}
    </div>
  ) : null;

  // Keterangan per bagian rundown: kartu Program, atau cerita kartu hari pada gaya gathering.
  const daftarCatatan = (
    <div className="flex flex-col gap-3">
      <p className="text-body-medium font-medium text-on-surface">{gathering ? "Day card stories" : "Programme card descriptions"}</p>
      <p className="text-body-medium text-on-surface-variant">
        {gathering
          ? "One or two sentences per day, in the order of the published agenda sections: story 1 goes with Day 1, and so on. The date, title and key times come from the agenda."
          : "In the order of the published agenda sections: description 1 goes with the first section shown, and so on. Times and session counts are filled in automatically."}
      </p>
      {catatanProgram.map((item, index) => (
        <div key={index} className="flex items-start gap-2">
          <TextArea
            className="min-w-0 flex-1"
            label={gathering ? `Day ${index + 1} story` : `Programme description ${index + 1}`}
            rows={2}
            value={item}
            onChange={(event) => { const next = [...catatanProgram]; next[index] = event.target.value; setCatatanProgram(next); }}
          />
          <IconButton size="sm" label={gathering ? `Delete Day ${index + 1} story` : `Delete description ${index + 1}`} className="mt-6 text-error" onClick={() => hapusCatatanProgram(index)}>
            <Trash size={16} />
          </IconButton>
        </div>
      ))}
      <div>
        <Button variant="outlined" size="sm" icon={<Plus size={16} />} disabled={catatanProgram.length >= 10} onClick={() => setCatatanProgram([...catatanProgram, ""])}>{gathering ? "Add day story" : "Add description"}</Button>
      </div>
    </div>
  );

  const isiAgenda = modern ? (
    <div className="flex flex-col gap-5">
      {judulBagian(
        "agenda",
        tanggalAcara
          ? { judul: tanggalAcara, jenis: "automatic (date)", hint: "Leave empty to use the event date." }
          : { judul: LANDING_SECTION_LABELS.agenda, jenis: "default", hint: "Leave empty to use the event date once it is set." },
        <TextField
          data-kolom="agenda_note"
          label="Note"
          optional
          placeholder="Registrasi dibuka pukul 08.00 WIB."
          hint="Below the heading, above the list of sessions."
          maxLength={LANDING_SECTION_TEXT_MAX.intro}
          counter
          value={landing.agenda_note ?? ""}
          onChange={(event) => setLanding({ ...landing, agenda_note: event.target.value })}
        />,
      )}
      {gathering ? (
        <Kelompok title="Day cards" note="One card per agenda section. A day with more than three sessions shows the first two and the last, plus how many more; breaks are skipped. The full schedule folds out below the cards.">
          {daftarCatatan}
        </Kelompok>
      ) : (
        <Kelompok title="Programme cards" note="Large cards made from the agenda sections, shown below About.">
          <Switch
            checked={!landing.program_hidden}
            onChange={(value) => setLanding({ ...landing, program_hidden: !value })}
            label="Show programme cards"
            description="Turn off if the main sessions are already in an image card block, so they don't show twice."
          />
          {!landing.program_hidden ? (
            <>
              <TextField
                label="Programme section heading"
                optional
                placeholder="Program"
                hint="The Programme section shows when the agenda has two or more sections."
                value={landing.program_heading ?? ""}
                onChange={(event) => setLanding({ ...landing, program_heading: event.target.value })}
              />
              <TextArea
                label="Programme intro"
                optional
                rows={2}
                value={landing.program_intro ?? ""}
                onChange={(event) => setLanding({ ...landing, program_intro: event.target.value })}
              />
              {daftarCatatan}
            </>
          ) : null}
        </Kelompok>
      )}
    </div>
  ) : null;

  const isiKaki = (
    <div className="flex flex-col gap-5">
      <Kelompok first>
        <TextArea
          label="Organiser line"
          optional
          rows={2}
          placeholder="Diselenggarakan oleh ..."
          hint={
            gathering
              ? "The gold line on the right of the footer. Empty = no line."
              : modern
                ? "Below the event name in the footer. Empty = event date and venue name."
                : "Shown in the Modern layout."
          }
          maxLength={180}
          counter
          value={landing.footer_note ?? ""}
          onChange={(event) => setLanding({ ...landing, footer_note: event.target.value })}
        />
      </Kelompok>
      {modern ? (
        <Kelompok
          title="Call-to-action banner"
          note={
            // Isinya mengikuti keadaan, bukan selalu "masuk" (CMS mudah, butir 12).
            (landing.blocks ?? []).some((blok) => blok.type === "cta" && landingBlockHasContent(blok) && sections.some((section) => section.enabled && section.id === blok.id))
              ? "Hidden now, because the page has a call-to-action strip block. Hide or delete that block to show this banner above the footer."
              : "Above the footer. While registration is open it asks guests to register. On an invite-only page with registration closed it asks them to sign in, using standard text: the heading and text below are not used there. Otherwise it is hidden."
          }
        >
          <TextField
            label="Banner heading"
            data-kolom="cta_heading"
            optional
            placeholder="Amankan tempat Anda"
            value={landing.cta_heading ?? ""}
            onChange={(event) => setLanding({ ...landing, cta_heading: event.target.value })}
          />
          <TextArea
            label="Banner text"
            optional
            rows={2}
            placeholder="e.g. Pendaftaran perlu persetujuan panitia. Kode QR dikirim setelah disetujui."
            value={landing.cta_note ?? ""}
            onChange={(event) => setLanding({ ...landing, cta_note: event.target.value })}
          />
        </Kelompok>
      ) : null}
    </div>
  );

  // ---- Tema ----------------------------------------------------------------------
  // Grup Page di tab Theme. "What /e/… shows" tinggal di Theme, bukan Page
  // sections: Hanya formulir menyembunyikan tab Page sections, dan kontrol yang
  // menyembunyikan tabnya sendiri tidak bisa dibatalkan dari sana.
  const isiHalamanTema = (
    <>
      <Kelompok title={`What /e/${facts?.slug ?? "slug"} shows`} first>
        <SegmentedButton<"halaman" | "formulir">
          className="w-full"
          label={`What /e/${facts?.slug ?? "slug"} shows`}
          value={hanyaFormulir ? "formulir" : "halaman"}
          onChange={(value) => {
            setLanding({ ...landing, tayang: value === "formulir" ? "formulir" : undefined });
            // Tab yang dipilih memang Tema, bukan hanya jatuh ke sana: kembali ke
            // Halaman acara tidak boleh melempar admin ke Susunan halaman dan
            // menghilangkan kontrol yang baru ia klik.
            setBagian("tema");
          }}
          options={[
            { value: "halaman", label: "Event page" },
            { value: "formulir", label: "Form only" },
          ]}
        />
        <p className="text-body-medium text-on-surface-variant">
          {hanyaFormulir
            ? "No event page: this address opens the registration form directly. The logo, main image, colours and fonts below still apply to the form and the participant sign-in page."
            : "An event page with a register button that leads to the form. Arrange its content in Page sections."}
        </p>
      </Kelompok>

      {/* Gathering: KV tidak tampil di halaman, tetapi tetap dipakai di luar
          halaman. Disebut menurut gunanya, bukan "Hero image". */}
      {gathering ? (
        <Kelompok title="Sharing image">
          <ImageUploadField
            label="Link preview image"
            kind="landing"
            fit="cover"
            previewClassName="h-20 w-36"
            hint="The picture WhatsApp, LinkedIn and others show when the event link is shared. Also used at the top of the registration form, as the header of the confirmation email while it has no saved template, and as the badge background when a badge uses the KV. Not shown on the gathering page itself. Landscape, at least 1200×630. PNG, JPG or WebP, up to 5 MB."
            value={landing.banner_url ?? null}
            onChange={(url) => setLanding({ ...landing, banner_url: url })}
            disabled={busy}
          />
        </Kelompok>
      ) : null}

      {/* Versi English. Teks English-nya diisi per kolom; sampai mode EN di
          editor ada, lewat Ekspor/Impor (kunci `en`, lihat landing-i18n.ts). */}
      <Kelompok title="Language">
        <Switch
          // Di luar Modern tampil mati walau tersimpan menyala: halaman tata
          // letak lain memang tidak punya versi English (landingEnAvailable).
          checked={modern && Boolean(landing.en_enabled)}
          onChange={(value) => setLanding({ ...landing, en_enabled: value })}
          disabled={!modern}
          label="English version"
          description={
            !modern
              ? landing.en_enabled
                ? `Modern layout only. The English version is kept and comes back when Modern is chosen again${landing.default_lang === "en" ? ", including English as the main language" : ""}.`
                : "Modern layout only."
              : landing.en_enabled
                ? "An ID | EN switch shows in the page's top bar."
                : "While off, the page is in Indonesian only and the /en address doesn't open."
          }
        />
        {modern && landing.en_enabled ? (
          <div className="flex flex-col gap-2">
            <p id="label-bahasa-utama" className="text-body-medium font-medium text-on-surface">Main language</p>
            <SegmentedButton<"id" | "en">
              className="w-full"
              label="Main language"
              labelledBy="label-bahasa-utama"
              value={landing.default_lang ?? "id"}
              onChange={(value) => setLanding({ ...landing, default_lang: value })}
              options={[
                { value: "id", label: "Indonesian" },
                { value: "en", label: "English" },
              ]}
            />
            <p className="text-body-medium text-on-surface-variant">
              {(landing.default_lang ?? "id") === "en"
                ? `/e/${facts?.slug ?? "slug"} shows in English. The Indonesian version is at /e/${facts?.slug ?? "slug"}/id.`
                : `/e/${facts?.slug ?? "slug"} shows in Indonesian. The English version is at /e/${facts?.slug ?? "slug"}/en.`}{" "}
              The address on invitations and QR codes stays the same.
              {(landing.default_lang ?? "id") === "en"
                ? " Visitors who scan the QR code or open an invitation link see the English version first. /en links already shared redirect to the main address."
                : null}
            </p>
          </div>
        ) : null}
        {modern && belumDiterjemahkan > 0 ? (
          <p className="text-body-medium text-on-surface-variant">
            {plural(belumDiterjemahkan, "text")} not translated yet. The English page shows the Indonesian text instead.{" "}
            <button type="button" onClick={() => pilihBahasa("en")} className="rounded-sm font-medium text-primary hover:underline">
              Translate in Page sections
            </button>
          </p>
        ) : null}
      </Kelompok>

      {forum ? (
        <Kelompok title="Label language" note="For the menu, section headings and default buttons. Content you write is shown as typed.">
          <SegmentedButton<"id" | "en">
            className="w-full"
            label="Label language"
            value={landing.forum?.language ?? "id"}
            onChange={(language) => setLanding({ ...landing, forum: { ...landing.forum, language } })}
            options={[
              { value: "id", label: "Indonesian" },
              { value: "en", label: "English" },
            ]}
          />
        </Kelompok>
      ) : null}
    </>
  );

  const isiTema = (
    <TabTema
      landing={landing}
      setLanding={setLanding}
      nama={landing.public_name?.trim() || facts?.name || "Nama acara"}
      contohIsi={facts?.tagline?.trim() || "Join us for two days of talks and conversations."}
      pratinjau={pratinjauPreset}
      onPratinjau={(key) => {
        setPratinjauPreset(key);
        // Di bawah lg pratinjau berdiri di atas panel, di luar layar: bawa ke sana
        // supaya perubahan preset terlihat (QA #90 L5).
        if (key && !window.matchMedia("(min-width: 1024px)").matches) {
          document.getElementById("pratinjau-acara")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }}
      formInherit={formInherit}
      setFormInherit={setFormInherit}
      formSeed={formSeed}
      setFormSeed={setFormSeed}
      PilihWarna={PilihWarna}
      halaman={isiHalamanTema}
      ringkasHalaman={[hanyaFormulir ? "Form only" : "Event page", modern && landing.en_enabled ? "ID + EN" : forum && landing.forum?.language === "en" ? "EN labels" : null, gathering ? (landing.banner_url ? "Link preview image" : "No link preview image") : null].filter(Boolean).join(" · ")}
    />
  );

  // ---- Bagian --------------------------------------------------------------------
  function editorBagian(id: LandingSectionId): ReactNode {
    switch (id) {
      case "highlights": {
        const list = landing.highlights ?? [];
        const setList = (next: typeof list) => setLanding({ ...landing, highlights: next });
        return (
          <div className="flex flex-col gap-3">
            {list.length === 0 ? <p className="text-body-medium text-on-surface-variant">No key figures yet.</p> : null}
            {list.map((item, index) => (
              <div key={index} className="flex items-end gap-2">
                <TextField
                  className="min-w-0 flex-1"
                  label="Label"
                  placeholder="e.g. Peserta"
                  value={item.label}
                  onChange={(event) => { const next = [...list]; next[index] = { ...next[index], label: event.target.value }; setList(next); }}
                />
                <TextField
                  className="w-24"
                  label="Figure"
                  value={item.value}
                  onChange={(event) => { const next = [...list]; next[index] = { ...next[index], value: event.target.value }; setList(next); }}
                />
                <IconButton size="sm" label={`Delete figure ${index + 1}`} className="text-error" onClick={() => setList(list.filter((_, position) => position !== index))}>
                  <Trash size={16} />
                </IconButton>
              </div>
            ))}
            <div>
              <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setList([...list, { label: "", value: "" }])}>Add figure</Button>
            </div>
          </div>
        );
      }
      case "faq": {
        const list = landing.faq ?? [];
        const setList = (next: typeof list) => setLanding({ ...landing, faq: next });
        return (
          <div className="flex flex-col gap-3">
            {list.length === 0 ? <p className="text-body-medium text-on-surface-variant">No questions yet.</p> : null}
            {list.map((item, index) => (
              <div key={index} className="flex flex-col gap-3 rounded-md border border-outline-variant p-3">
                <div className="flex items-end gap-2">
                  <TextField
                    className="min-w-0 flex-1"
                    label="Question"
                    value={item.q}
                    onChange={(event) => { const next = [...list]; next[index] = { ...next[index], q: event.target.value }; setList(next); }}
                  />
                  <IconButton size="sm" label={`Delete question ${index + 1}`} className="text-error" onClick={() => setList(list.filter((_, position) => position !== index))}>
                    <Trash size={16} />
                  </IconButton>
                </div>
                <TextArea
                  label="Answer"
                  rows={3}
                  value={item.a}
                  onChange={(event) => { const next = [...list]; next[index] = { ...next[index], a: event.target.value }; setList(next); }}
                />
              </div>
            ))}
            <div>
              <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setList([...list, { q: "", a: "" }])}>Add question</Button>
            </div>
            {judulBagian(
              "faq",
              { judul: LANDING_UI.id.faqHeading, jenis: "default", hint: KOSONG_BAWAAN },
              <TextArea
                data-kolom="faq_intro"
                className={TEKS_BAWAAN}
                label="Intro"
                optional
                rows={2}
                placeholder={LANDING_UI.id.faqIntro}
                hint="If the Contact section is shown, the sentence “Hubungi panitia…” is added after it."
                maxLength={LANDING_SECTION_TEXT_MAX.intro}
                counter
                value={landing.faq_intro ?? ""}
                onChange={(event) => setLanding({ ...landing, faq_intro: event.target.value })}
              />,
            )}
          </div>
        );
      }
      case "speakers": {
        const list = landing.speakers ?? [];
        const setList = (next: typeof list) => setLanding({ ...landing, speakers: next });
        const ubah = (index: number, patch: Partial<(typeof list)[number]>) => {
          const next = [...list];
          next[index] = { ...next[index], ...patch };
          setList(next);
        };
        return (
          <div className="flex flex-col gap-3">
            <p className="text-body-medium text-on-surface-variant">
              Featured speakers (up to 8) open first in the Highlights tab. Without any featured speaker, the first session tab opens. The rest open per session through the tabs. Without a photo, initials are used.
            </p>
            {list.length === 0 ? <p className="text-body-medium text-on-surface-variant">No speakers yet.</p> : null}
            {list.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p id="label-bingkai-foto" className="text-body-medium font-medium text-on-surface">Photo frame</p>
                <SegmentedButton<LandingSpeakerFrame>
                  className="w-full"
                  label="Photo frame"
                  labelledBy="label-bingkai-foto"
                  value={modern ? landing.speaker_frame ?? "portrait" : "portrait"}
                  onChange={(speaker_frame) => setLanding({ ...landing, speaker_frame: speaker_frame === "portrait" ? undefined : speaker_frame })}
                  options={LANDING_SPEAKER_FRAMES.map((value) => ({ value, label: LANDING_SPEAKER_FRAME_LABELS[value], icon: <BentukBingkai bentuk={value} />, disabled: !modern }))}
                />
                <p className="text-body-small text-on-surface-variant">
                  {modern
                    ? "For the speaker cards. Portrait and Arch follow Theme › Corners; Circle doesn't. Agenda photos stay round."
                    : forum
                      ? "Forum keeps the photo shape of its own design. Switch to the Modern layout to choose a frame."
                      : "Editorial shows small round photos. Switch to the Modern layout to choose a frame."}
                </p>
              </div>
            ) : null}
            {list.filter((speaker) => speaker.name?.trim()).length > 1 ? (
              <div className="flex flex-col gap-2 border-t border-outline-variant pt-3">
                <p className="text-body-medium font-medium text-on-surface">Order on the page</p>
                <UrutanPembicara speakers={list} baris={barisSesi} bingkai={modern ? landing.speaker_frame ?? "portrait" : "portrait"} onChange={setList} onTab={setTabPembicara} />
              </div>
            ) : null}
            {hasilPetakan?.terhubung || sesiLamaBelumTerhubung ? (
              <p className="rounded-md bg-surface-container-high px-3 py-2 text-body-small text-on-surface" role="status">
                {[
                  hasilPetakan?.terhubung ? `${plural(hasilPetakan.terhubung, "speaker")} linked to the agenda automatically` : null,
                  sesiLamaBelumTerhubung ? `${plural(sesiLamaBelumTerhubung, "speaker")} still need a session chosen` : null,
                ].filter(Boolean).join(", ")}.
              </p>
            ) : null}
            {list.map((speaker, index) => (
              <div key={index} className="flex flex-col gap-3 rounded-md border border-outline-variant p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                  <ImageUploadField
                    label={speaker.name.trim() ? `Photo · ${speaker.name.trim()}` : "Speaker photo"}
                    kind="landing"
                    fit="cover"
                    previewClassName="size-16 rounded-full"
                    hint="Square, at least 400×400."
                    value={speaker.photo_url ?? null}
                    disabled={busy}
                    onChange={(url) => ubah(index, { photo_url: url })}
                  />
                  </div>
                  <IconButton size="sm" label={`Delete speaker ${index + 1}`} className="text-error" onClick={() => setList(list.filter((_, position) => position !== index))}>
                    <Trash size={16} />
                  </IconButton>
                </div>
                <TextField label="Name" value={speaker.name} onChange={(event) => ubah(index, { name: event.target.value })} />
                <TextField
                  label="Job title"
                  optional
                  placeholder="e.g. Direktur Utama"
                  value={speaker.title ?? ""}
                  onChange={(event) => ubah(index, { title: event.target.value })}
                />
                <TextField
                  label="Organisation"
                  optional
                  placeholder="e.g. Bank Indonesia"
                  hint="Shown below the job title, in the primary colour."
                  value={speaker.company ?? ""}
                  onChange={(event) => ubah(index, { company: event.target.value })}
                />
                <TextField
                  label="Role"
                  optional
                  placeholder="e.g. Moderator"
                  hint="Main role. Used in Highlights and in sessions without their own role."
                  value={speaker.role ?? ""}
                  onChange={(event) => ubah(index, { role: event.target.value })}
                />
                <PilihSesi
                  speaker={speaker}
                  speakers={list}
                  baris={barisSesi}
                  memuat={sesiMemuat}
                  onMuatUlang={() => void muatBarisSesi()}
                  onChange={(next) => { const daftar = [...list]; daftar[index] = next; setList(daftar); }}
                />
                <Switch
                  checked={Boolean(speaker.featured)}
                  onChange={(value) => ubah(index, { featured: value })}
                  label="Feature this speaker"
                  description="Goes in the Highlights tab (up to 8), for officials giving remarks or keynote speakers."
                />
                <div className="flex gap-1">
                  <IconButton size="sm" label={`Move speaker ${index + 1} up`} disabled={index === 0} onClick={() => { const next = [...list]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setList(next); }}>
                    <ArrowUp size={16} />
                  </IconButton>
                  <IconButton size="sm" label={`Move speaker ${index + 1} down`} disabled={index === list.length - 1} onClick={() => { const next = [...list]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setList(next); }}>
                    <ArrowDown size={16} />
                  </IconButton>
                </div>
              </div>
            ))}
            <div>
              <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setList([...list, { name: "" }])}>Add speaker</Button>
            </div>
            {judulBagian(
              "speakers",
              lembaga >= 3
                ? { judul: LANDING_UI.id.speakersFrom(pembicaraIsi.length, lembaga), jenis: "automatic (count)", hint: "Leave empty to use the number of speakers and organisations." }
                : { judul: LANDING_SECTION_LABELS.speakers, jenis: "default", hint: "Leave empty for the default text. From three organisations on, the speaker count is used." },
            )}
          </div>
        );
      }
      case "sponsors": {
        const list = landing.sponsors ?? [];
        return (
          <div className="flex flex-col gap-3">
            <p className="text-body-medium text-on-surface-variant">Shown as an even grid, whatever the upload order.</p>
            {list.length === 0 ? <p className="text-body-medium text-on-surface-variant">No sponsors yet.</p> : null}
            {list.map((sponsor, index) => (
              <div key={index} className="flex flex-col gap-3 rounded-md border border-outline-variant p-3">
                <ImageUploadField
                  label={`Logo ${index + 1}`}
                  kind="landing"
                  fit="contain"
                  previewClassName="h-14 w-24"
                  value={sponsor.logo_url || null}
                  disabled={busy}
                  onChange={(url) => {
                    const next = [...list];
                    if (!url) {
                      setLanding({ ...landing, sponsors: next.filter((_, position) => position !== index) });
                      return;
                    }
                    next[index] = { ...next[index], logo_url: url };
                    setLanding({ ...landing, sponsors: next });
                  }}
                />
                <TextField
                  label="Name"
                  optional
                  hint="Alt text for the image, not shown on the page."
                  value={sponsor.name ?? ""}
                  onChange={(event) => {
                    const next = [...list];
                    next[index] = { ...next[index], name: event.target.value };
                    setLanding({ ...landing, sponsors: next });
                  }}
                />
              </div>
            ))}
            {/* Baris baru ditambahkan tanpa logo, lalu logonya diunggah di baris
                itu. Membuka pemilih berkas lebih dulu berarti baris kosong akan
                tertinggal setiap kali admin membatalkan pemilihan. */}
            <div>
              <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setLanding({ ...landing, sponsors: [...list, { logo_url: "" }] })}>Add sponsor</Button>
            </div>
          </div>
        );
      }
      case "contact":
        return (
          <div className="flex flex-col gap-3">
            <TextField label="Name" optional value={landing.contact_name ?? ""} onChange={(event) => setLanding({ ...landing, contact_name: event.target.value })} />
            <TextField label="Phone" optional value={landing.contact_phone ?? ""} onChange={(event) => setLanding({ ...landing, contact_phone: event.target.value })} />
            <TextField label="Email" optional type="email" value={landing.contact_email ?? ""} onChange={(event) => setLanding({ ...landing, contact_email: event.target.value })} />
          </div>
        );
      default:
        return null;
    }
  }

  const JUMLAH: Partial<Record<LandingSectionId, number>> = {
    highlights: (landing.highlights ?? []).length,
    speakers: (landing.speakers ?? []).length,
    faq: (landing.faq ?? []).length,
    sponsors: (landing.sponsors ?? []).length,
  };

  // ---- Peserta (area peserta) -------------------------------------------------
  // Setelannya pindah ke halaman sendiri, di samping Daftar peserta dan
  // Pengumuman. Tab ini tinggal penunjuk bagi yang terbiasa mencarinya di sini.
  const isiPeserta = (
    <div className="flex flex-col gap-4">
      <Kelompok title="Participant area" first>
        <p className="text-body-medium text-on-surface-variant">
          {landing.member?.enabled ? "The participant area is open." : "The participant area is closed."} Its settings, including who can sign in and what shows on My dashboard, are now on the Participant area page.
        </p>
        <div>
          <ButtonLink href="/admin/area-peserta" variant="outlined" size="sm">Open Participant area</ButtonLink>
        </div>
      </Kelompok>
      {/* Sebelumnya hanya bisa dinyalakan lewat preset Gathering (CMS mudah, butir 11). */}
      {modern ? (
        <Kelompok>
          <Switch
            checked={landing.invite_only === true}
            onChange={(value) => setLanding({ ...landing, invite_only: value })}
            disabled={busy}
            label="Invite only"
            description="While registration is closed, the page asks invited guests to sign in instead of saying registration opens soon. The sign-in banner above the footer uses standard text. Works only while the participant area is open."
            note={landing.member?.enabled === true ? undefined : <span className="text-body-medium text-on-surface-variant">The participant area is closed, so this has no effect now.</span>}
          />
        </Kelompok>
      ) : null}
    </div>
  );

  /**
   * Menghapus blok dari DRAF. Belum ada yang hilang dari server sampai Simpan,
   * dan sampai saat itu "Urungkan" mengembalikan blok di posisi semula.
   */
  function hapusBlok(ids: string[]) {
    const buang = new Set(ids);
    setUrungan({
      pesan: `${ids.length === 1 ? "Block" : plural(ids.length, "block")} deleted. Takes effect when you save.`,
      sections,
      blocks: landing.blocks ?? [],
    });
    setLanding({
      ...landing,
      sections: sections.filter((item) => !buang.has(item.id)),
      blocks: (landing.blocks ?? []).filter((item) => !buang.has(item.id)),
    });
    if (terbuka && buang.has(terbuka)) setTerbuka(null);
  }

  function urungkan() {
    if (!urungan) return;
    setLanding({ ...landing, sections: urungan.sections, blocks: urungan.blocks });
    setUrungan(null);
  }

  /** Salinan tepat di bawah aslinya, dengan id baru. */
  function duplikatBlok(index: number, blok: LandingBlock) {
    const salinan: LandingBlock = { ...structuredClone(blok), id: buatBlok(blok.type).id };
    const next = [...sections];
    next.splice(index + 1, 0, { id: salinan.id, enabled: sections[index].enabled });
    setLanding({ ...landing, sections: next, blocks: [...(landing.blocks ?? []), salinan] });
  }

  function setTampil(index: number, value: boolean) {
    setLanding({ ...landing, sections: sections.map((item, position) => (position === index ? { ...item, enabled: value } : item)) });
  }

  function ubahBlok(next: LandingBlock) {
    setLanding({ ...landing, blocks: (landing.blocks ?? []).map((item) => (item.id === next.id ? next : item)) });
  }

  function tambahBlok(type: LandingBlockType) {
    const blok = buatBlok(type);
    setLanding({ ...landing, sections: [...sections, { id: blok.id, enabled: true }], blocks: [...(landing.blocks ?? []), blok] });
    setTambahTerbuka(false);
    setBagian("susunan");
    setTerbuka(blok.id);
  }

  /** Seret-lepas di daftar susunan. Tombol panah tetap ada untuk papan ketik. */
  function lepas(target: number) {
    if (seret === null || seret === target) { setSeret(null); setSasaran(null); return; }
    const next = [...sections];
    const [pindah] = next.splice(seret, 1);
    next.splice(target, 0, pindah);
    setLanding({ ...landing, sections: next });
    setSeret(null);
    setSasaran(null);
  }


  // ---- Susunan halaman -----------------------------------------------------------
  // Satu daftar dengan urutan yang sama dengan halaman publik: Pembuka di atas,
  // bagian dan blok di tengah (bisa diseret), Kaki di bawah. Hanya satu bagian
  // terbuka sekaligus, supaya daftarnya tetap terbaca sebagai peta halaman.
  function bukaTutup(id: string) {
    const buka = terbuka !== id;
    setTerbuka(buka ? id : null);
    if (!buka) {
      // Ditutup dari kepala yang menempel: kembalikan barisnya ke pandangan,
      // bukan menyisakan panel di tengah blok-blok sesudahnya.
      gulirKeBaris(id, true);
      return;
    }
    if (forum) setHalamanPratinjau((current) => halamanBagianForum(id, current));
    setSorot((current) => ({ id, n: (current?.n ?? 0) + 1 }));
    gulirKeBaris(id);
  }

  function barisSusunan({
    id,
    nomor,
    judul,
    sub,
    lencana,
    saklar,
    indeks,
    isi,
    menu,
    titik = false,
  }: {
    id: string;
    /** Angka urutan, atau ikon untuk baris otomatis yang tidak punya tempat di `sections`. */
    nomor: ReactNode;
    judul: string;
    sub?: string | null;
    lencana?: string | null;
    saklar?: { checked: boolean; onChange: (value: boolean) => void };
    /** Posisi di `sections`; kosong untuk Pembuka dan Kaki yang tidak bisa dipindah. */
    indeks?: number;
    isi: ReactNode;
    menu?: ItemMenuBlok[];
    /**
     * Titik jingga: baris ini perlu dilihat. `true` = mode EN, ada teks yang
     * belum diterjemahkan; teks = alasan lain, dibacakan apa adanya.
     */
    titik?: boolean | string;
  }) {
    const buka = terbuka === id;
    const tersembunyi = saklar ? !saklar.checked : false;
    const alasanTitik = typeof titik === "string" ? titik : "Some text isn't translated yet.";
    // Yang bisa diseret hanya pegangannya: kalau seluruh baris draggable,
    // memblok teks di kolom isian ikut memulai seretan. Pegangannya selebar
    // seluruh tinggi baris (24x56), bukan ikon 16px.
    const bisaSeret = indeks !== undefined;
    return (
      <li
        key={id}
        id={`baris-${id}`}
        className={cx(
          "border-b border-outline-variant",
          bisaSeret && seret === indeks && "opacity-50",
          bisaSeret && sasaran === indeks && seret !== null && seret !== indeks && (seret < indeks ? "border-b-2 border-b-primary" : "border-t-2 border-t-primary"),
        )}
        onDragOver={bisaSeret ? (event: DragEvent<HTMLLIElement>) => { if (seret === null) return; event.preventDefault(); setSasaran(indeks); } : undefined}
        onDrop={bisaSeret ? (event: DragEvent<HTMLLIElement>) => { event.preventDefault(); lepas(indeks); } : undefined}
      >
        <div
          className={cx(
            "flex items-center gap-2 pr-2",
            // Terbuka: kepala menempel di atas panel, supaya blok yang panjang
            // bisa ditutup tanpa menggulir balik ke atas.
            buka ? "sticky top-0 z-10 min-h-14 bg-primary-soft py-2 shadow-[inset_3px_0_0_var(--color-primary)]" : "h-14",
          )}
        >
          {bisaSeret ? (
            <span
              draggable
              onDragStart={(event) => { setSeret(indeks); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", judul); }}
              onDragEnd={() => { setSeret(null); setSasaran(null); }}
              className="flex h-14 w-6 shrink-0 cursor-grab items-center justify-center self-stretch text-on-surface-variant opacity-80 hover:opacity-100"
              title="Drag to move"
            >
              <DotsSixVertical size={16} aria-hidden />
            </span>
          ) : <span className="w-6 shrink-0" aria-hidden />}
          <span
            className={cx(
              "grid size-7 shrink-0 place-items-center rounded-sm text-body-small font-medium tabular-nums",
              buka
                ? "bg-primary text-on-primary"
                : tersembunyi
                  ? "border border-dashed border-outline-variant text-on-surface-variant"
                  : "bg-surface-container-high text-on-surface-variant",
            )}
            aria-hidden
          >
            {nomor}
          </span>
          <button
            type="button"
            aria-expanded={buka}
            aria-controls={buka ? `isi-${id}` : undefined}
            onClick={() => bukaTutup(id)}
            className="min-w-0 flex-1 self-stretch rounded-sm text-left"
          >
            {/* Terbuka: judul utuh, karena di situlah orang membaca apa yang
                sedang ia sunting. Tertutup: satu baris, judul utuh di `title`. */}
            <span
              title={buka ? undefined : judul}
              className={cx(
                "block text-body-medium",
                buka ? "font-medium text-on-surface" : "truncate",
                !buka && (tersembunyi ? "text-on-surface-variant" : "font-medium text-on-surface"),
              )}
            >
              {judul}
            </span>
            {titik ? <span className="sr-only">{alasanTitik}</span> : null}
            {sub ? (
              <span title={sub} className="block truncate text-body-small text-on-surface-variant">
                {tersembunyi ? `${sub} · hidden` : sub}
              </span>
            ) : null}
          </button>
          {titik ? (
            <span className="mr-2 size-2 shrink-0 rounded-full bg-warning" title={alasanTitik} aria-hidden />
          ) : null}
          {lencana ? <StatusChip tone="warning" className="shrink-0">{lencana}</StatusChip> : null}
          {saklar ? (
            <IconButton
              size="sm"
              className="size-10!"
              label={saklar.checked ? `Hide ${judul}` : `Show ${judul}`}
              onClick={() => saklar.onChange(!saklar.checked)}
            >
              {saklar.checked ? <Eye size={20} /> : <EyeSlash size={20} />}
            </IconButton>
          ) : null}
          {menu ? (
            <MenuBlok label={`Menu: ${judul}`} items={menu} />
          ) : saklar && id === "portal" ? (
            // Baris otomatis tanpa menu: matanya tetap di kolom mata baris lain (QA #109 L4).
            <span className="size-10 shrink-0" aria-hidden />
          ) : null}
        </div>
        {buka ? (
          <div id={`isi-${id}`} className="flex flex-col gap-4 bg-primary-soft/40 px-4 pb-4 pt-2">
            {isi}
          </div>
        ) : null}
      </li>
    );
  }

  /** Isi menu ⋯ sebuah baris. Naik/turun juga jalan papan ketik pengganti seret. */
  function menuBaris(index: number, judul: string, blok?: LandingBlock): ItemMenuBlok[] {
    const tampil = sections[index].enabled;
    const items: ItemMenuBlok[] = [
      { label: "Move up", icon: <ArrowUp size={18} />, disabled: index === 0, onSelect: () => moveSection(index, -1) },
      { label: "Move down", icon: <ArrowDown size={18} />, disabled: index === sections.length - 1, onSelect: () => moveSection(index, 1) },
    ];
    if (blok) {
      items.push({ label: "Duplicate", icon: <CopySimple size={18} />, disabled: (landing.blocks ?? []).length >= 30, onSelect: () => duplikatBlok(index, blok) });
    }
    items.push({
      label: tampil ? "Hide" : "Show",
      icon: tampil ? <EyeSlash size={18} /> : <Eye size={18} />,
      onSelect: () => setTampil(index, !tampil),
    });
    if (blok) {
      items.push({ label: "Delete block…", icon: <Trash size={18} />, bahaya: true, onSelect: () => setKonfirmasiHapus({ ids: [blok.id], judul }) });
    }
    return items;
  }

  const blokById = new Map((landing.blocks ?? []).map((block) => [block.id, block]));

  function subBawaan(id: LandingSectionId): string {
    switch (id) {
      case "about": return gathering ? "Heading, cards and description" : "From the event description";
      case "agenda": return "Built-in · from the Agenda";
      // Gathering menampilkan hotel dari Logistik di tempat Venue (CMS mudah, butir 5).
      case "venue": return gathering ? "Your hotel from Logistics, else the venue" : "Venue name, address, map";
      case "speakers": return `Built-in · ${plural(JUMLAH.speakers ?? 0, "speaker")}`;
      case "faq": return `Built-in · ${plural(JUMLAH.faq ?? 0, "question")}`;
      // Modern tidak memberi tiga bagian ini tempat sendiri: subjudulnya
      // menyebut di mana isinya tampil, karena posisinya di daftar tidak
      // berpengaruh (CMS mudah, butir 4).
      case "highlights":
        return gathering
          ? "Not shown in the gathering layout"
          : modern
            ? `First figure beside About (automatic picture) · ${plural(JUMLAH.highlights ?? 0, "figure")}`
            : `Built-in · ${plural(JUMLAH.highlights ?? 0, "figure")}`;
      case "sponsors": return modern ? `Logo strip above the footer · ${plural(JUMLAH.sponsors ?? 0, "logo")}` : `Built-in · ${plural(JUMLAH.sponsors ?? 0, "logo")}`;
      case "contact": return modern ? "Shown in the footer · name, phone, email" : "Name, phone, email";
    }
  }

  function isiBawaan(id: LandingSectionId): ReactNode {
    const sumber = LANDING_SECTION_SOURCES[id];
    const tautanSumber = sumber.href && facts ? (
      <Link href={`/e/${facts.slug}${sumber.href}`} className="inline-flex items-center gap-1 self-start rounded-sm text-body-medium font-medium text-primary hover:underline">
        {sumber.linkLabel}
        <ArrowSquareOut size={14} aria-hidden />
      </Link>
    ) : null;
    const isi = id === "about" ? isiTentang : id === "venue" ? isiLokasi : id === "agenda" ? isiAgenda : editorBagian(id);
    return (
      <>
        {id === "agenda" ? <p className="text-body-medium text-on-surface-variant">Sessions come from the Agenda automatically. Only published agenda sections and sessions show; this section stays hidden until something is published.</p> : null}
        {id === "venue" && gathering && facts ? (
          <>
            <p className="text-body-medium text-on-surface-variant">
              In the gathering layout this section shows the hotel from Logistics, with check-in and check-out times, and the menu calls it Hotel. The venue fields below show only while Logistics has no hotel.
            </p>
            <Link href={`/e/${facts.slug}/admin/logistik`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 self-start rounded-sm text-body-medium font-medium text-primary hover:underline">
              Open Logistics
              <ArrowSquareOut size={14} aria-hidden />
            </Link>
          </>
        ) : null}
        {tautanSumber}
        {isi}
      </>
    );
  }

  // Blok tambahan yang tersembunyi: satu-satunya yang bisa dihapus massal.
  // Bagian bawaan (Pembicara, FAQ, ...) hanya bisa disembunyikan.
  const tersembunyi = sections.filter((section) => !section.enabled);
  const blokTersembunyi = tersembunyi.filter((section) => isLandingBlockId(section.id) && blokById.has(section.id)).map((section) => section.id);
  // Forum menyimpan bagian tersembunyinya sendiri (forum.hidden), urutannya tetap.
  // Bagian Portal peserta otomatis (gathering) ikut dihitung: tanpa itu,
  // portal yang disembunyikan tidak bisa ditemukan lagi di daftar.
  const barisPortal = gathering && landing.member?.enabled === true;
  const jumlahTersembunyi = forum ? (landing.forum?.hidden ?? []).length : tersembunyi.length + (barisPortal && landing.portal_section === false ? 1 : 0);

  // Mode EN: baris yang sama dalam urutan yang sama, tetapi hanya yang tampil di
  // halaman, tanpa seret, mata, dan menu; isinya kolom English (editor-en.tsx).
  const isiSusunanEn = facts ? (
    <div className="flex flex-col">
      <ol className="flex flex-col">
        {barisSusunan({ id: "pembuka", nomor: 1, judul: "Hero", sub: gathering ? "Event name, title, buttons" : "Event name, tagline, register button", titik: barisKurangEn.has("pembuka"), isi: <BagianEn id="pembuka" landing={landing} facts={facts} setLanding={setLanding} /> })}
        {sections.map((section, index) => {
          // Bagian tersembunyi tidak perlu diterjemahkan, kecuali yang sedang
          // dibuka: Simpan membukanya bila teks English-nya melewati batas
          // (hanya bisa terjadi lewat Impor).
          if (!section.enabled && terbuka !== section.id) return null;
          if (isLandingBlockId(section.id)) {
            const blok = blokById.get(section.id);
            if (!blok) return null;
            const jenis = LANDING_BLOCK_LABELS[blok.type];
            return barisSusunan({
              id: section.id,
              nomor: index + 2,
              judul: blok.heading?.trim() || blok.name?.trim() || jenis,
              sub: jenis,
              titik: barisKurangEn.has(section.id),
              isi: <BlockEditorEn block={blok} onChange={ubahBlok} />,
            });
          }
          const id: LandingSectionId = section.id;
          return barisSusunan({
            id,
            nomor: index + 2,
            judul: LANDING_SECTION_ADMIN_LABELS[id],
            sub: subBawaan(id),
            titik: barisKurangEn.has(id),
            isi: <BagianEn id={id} landing={landing} facts={facts} setLanding={setLanding} rundown={rundownEn} ubahRundown={ubahRundown} sesiRundown={agendaAktif ? [] : (rundownEn ?? []).filter((baris) => idSesiDipakai.has(baris.id))} />,
          });
        })}
        {/* Portal peserta juga tampil di /en; teksnya tetap dan sudah berbahasa Inggris (QA #109 L5). */}
        {gathering && landing.member?.enabled === true && landing.portal_section !== false
          ? barisSusunan({
              id: "portal",
              nomor: <Lightning size={14} weight="fill" aria-hidden />,
              judul: "Portal peserta",
              sub: "Automatic · fixed English text",
              isi: <p className="text-body-medium text-on-surface-variant">This section has fixed text in both languages, so there is nothing to translate.</p>,
            })
          : null}
        {barisSusunan({ id: "kaki", nomor: sections.length + 2, judul: "Footer", sub: "Organiser line, call-to-action banner", titik: barisKurangEn.has("kaki"), isi: <BagianEn id="kaki" landing={landing} facts={facts} setLanding={setLanding} /> })}
      </ol>
    </div>
  ) : null;

  const isiSusunan = facts && forum ? (
    <ForumSusunan
      landing={landing}
      setLanding={setLanding}
      facts={facts}
      patchFacts={patchFacts}
      busy={busy}
      baris={barisSusunan}
      isiPembicara={editorBagian("speakers")}
      rundownKosong={rundownKosong}
      lencanaRundown={lencanaRundown}
      tampilTersembunyi={tampilTersembunyi}
    />
  ) : facts ? (
    <div className="flex flex-col">
      {!modern ? (
        <div className="px-4 py-2">
          <Banner tone="info">Extra blocks show only in the Modern layout. Choose Modern in the Theme tab to use them.</Banner>
        </div>
      ) : null}
      <ol className="flex flex-col">
        {barisSusunan({ id: "pembuka", nomor: 1, judul: "Hero", sub: gathering ? "Top bar, title, portal preview, buttons" : modern ? "Top bar, event name, tagline, KV, register button" : "Event name, tagline, KV, register button", isi: isiPembuka })}
        {sections.map((section, index) => {
          if (!section.enabled && !tampilTersembunyi) return null;
          const saklar = { checked: section.enabled, onChange: (value: boolean) => setTampil(index, value) };

          if (isLandingBlockId(section.id)) {
            const blok = blokById.get(section.id);
            if (!blok) return null;
            const jenis = LANDING_BLOCK_LABELS[blok.type];
            const ringkas = ringkasanBlok(blok);
            const judul = blok.heading?.trim() || blok.name?.trim() || jenis;
            return barisSusunan({
              id: section.id,
              nomor: index + 2,
              judul,
              sub: ringkas && ringkas !== judul ? `${jenis} · ${ringkas}` : jenis,
              lencana: section.enabled && !landingBlockHasContent(blok) ? "No content yet" : null,
              saklar,
              indeks: index,
              menu: menuBaris(index, judul, blok),
              isi: <BlockEditor block={blok} onChange={ubahBlok} />,
            });
          }

          const id: LandingSectionId = section.id;
          const berisi = sectionHasContent(id);
          const kosong = section.enabled && (berisi === false || (id === "agenda" && rundownKosong));
          return barisSusunan({
            id,
            nomor: index + 2,
            judul: LANDING_SECTION_ADMIN_LABELS[id],
            sub: subBawaan(id),
            lencana: kosong ? (id === "agenda" ? lencanaRundown : "No content yet") : null,
            titik: id === "speakers" && sesiPerluDipilih > 0 ? "Some speaker sessions need to be chosen again." : false,
            saklar,
            indeks: index,
            menu: menuBaris(index, LANDING_SECTION_ADMIN_LABELS[id]),
            isi: isiBawaan(id),
          });
        })}
        {/* Bagian otomatis di akhir halaman gathering: tidak bisa diseret karena
            tempatnya tetap, tetapi bisa disembunyikan (CMS mudah, butir 2). */}
        {barisPortal && (landing.portal_section !== false || tampilTersembunyi)
          ? barisSusunan({
              id: "portal",
              nomor: <Lightning size={14} weight="fill" aria-hidden />,
              judul: "Portal peserta",
              sub: "Automatic · what guests find after signing in",
              saklar: { checked: landing.portal_section !== false, onChange: (value) => setLanding({ ...landing, portal_section: value }) },
              isi: isiPortal,
            })
          : null}
        {barisSusunan({
          id: "kaki",
          nomor: sections.length + 2,
          judul: "Footer",
          sub: modern ? "Organiser line, call-to-action banner" : "Organiser line",
          isi: isiKaki,
        })}
      </ol>
      <div className="px-4 py-4">
        <Button variant="outlined" icon={<Plus size={18} />} onClick={() => setTambahTerbuka(true)} disabled={(landing.blocks ?? []).length >= 30}>
          Add block
        </Button>
      </div>
      <TambahBlokDialog open={tambahTerbuka} onClose={() => setTambahTerbuka(false)} onPick={tambahBlok} />
    </div>
  ) : null;

  // Satu baris di atas daftar: petunjuk singkat, lalu penyaring tersembunyi bila
  // memang ada yang tersembunyi. Tidak bergulir, supaya penyaringnya selalu terjangkau.
  // Modern: pilihan ID | EN di depan. Mode EN tidak punya penyaring tersembunyi
  // (hanya bagian yang tampil yang perlu diterjemahkan); gantinya jumlah teks
  // yang belum diterjemahkan.
  const pilihanBahasa = modern ? (
    <SegmentedButton<"id" | "en">
      label="Language being edited"
      value={bahasa}
      onChange={pilihBahasa}
      className="w-24 shrink-0"
      options={[{ value: "id", label: "ID" }, { value: "en", label: "EN" }]}
    />
  ) : null;
  const saringan = bagian !== "susunan" ? null : modeEn ? (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-outline-variant pl-3 pr-2">
      {pilihanBahasa}
      <p role="status" className={cx("min-w-0 flex-1 truncate text-body-small", belumDiterjemahkan > 0 ? "font-medium text-on-warning-soft" : "text-on-surface-variant")}>
        {belumDiterjemahkan > 0 ? `${plural(belumDiterjemahkan, "text")} not translated yet` : "All text translated"}
      </p>
    </div>
  ) : (
    <div className={cx("flex h-12 shrink-0 items-center gap-1 border-b border-outline-variant pr-2", pilihanBahasa ? "pl-3" : "pl-4")}>
      {pilihanBahasa}
      {/* Dengan pilihan ID | EN, petunjuknya tidak muat di panel 440: ia
          disembunyikan, dan ruangnya hanya mendorong penyaring ke kanan. */}
      <p
        className={cx("min-w-0 flex-1 truncate text-body-small text-on-surface-variant max-sm:hidden", pilihanBahasa && "invisible")}
        title={
          forum
            ? "The Forum layout has a fixed section order. Click a row to edit it; the preview moves to the page with that section. The eye button hides a section without deleting its content."
            : "The order here matches the page, top to bottom. Click a row to edit it; the preview jumps to that section. Drag the handle on the left of a row to move it."
        }
      >
        Click a row to edit
      </p>
      {jumlahTersembunyi > 0 ? (
        <>
          <FilterChip selected={tampilTersembunyi} onClick={() => setTampilTersembunyi((nilai) => !nilai)} className="shrink-0">
            Show {jumlahTersembunyi} hidden
          </FilterChip>
          {/* Forum tidak punya blok tambahan, jadi tidak ada yang bisa dihapus massal. */}
          {forum ? null : <MenuBlok
            label="Hidden blocks menu"
            width={272}
            items={[{
              label: blokTersembunyi.length > 0 ? `Delete ${plural(blokTersembunyi.length, "hidden block")}…` : "No blocks to delete",
              icon: <Trash size={18} />,
              bahaya: true,
              disabled: blokTersembunyi.length === 0,
              onSelect: () => setKonfirmasiHapus({ ids: blokTersembunyi, judul: "" }),
            }]}
          />}
        </>
      ) : null}
    </div>
  );

  const panel = (
    // overflow-visible di bawah lg: `overflow-hidden` bawaan Pane memutus
    // sticky bilah pratinjau dari gulir halaman.
    <Pane as="aside" id="panel-setelan" aria-label="Event page settings" className="max-lg:overflow-visible">
      <div className="flex h-12 shrink-0 items-center border-b border-outline-variant px-3">
        <SegmentedButton<Bagian>
          label="Settings tabs"
          panel="isi-setelan"
          value={bagian}
          onChange={setBagian}
          className="w-full"
          options={[
            ...(hanyaFormulir ? [] : [{ value: "susunan" as const, label: "Page sections" }]),
            { value: "tema", label: "Theme" },
            { value: "peserta", label: "Participants" },
          ]}
        />
      </div>
      {/* Satu tabpanel memuat baris saringan dan isinya, supaya Tab sesudah
          daftar tab langsung masuk ke panel yang dipilih (pola tabs WAI-ARIA). */}
      <div id="isi-setelan" role="tabpanel" aria-labelledby={segmentTabId("isi-setelan", bagian)} className="flex min-h-0 flex-1 flex-col">
        {saringan}
        {/* Bilah konteks pratinjau preset berdiri di luar bidang gulir, tepat di
            bawah tab: tidak ada celah dari padding bidang gulir dan tidak ada isi
            yang terlihat di atasnya. Di bawah lg halamannya yang bergulir, jadi
            bilah menempel di bawah bilah atas aplikasi agar Cancel dan Apply
            tetap terjangkau saat kartu preset digulir. */}
        {presetDilihat ? (
          <div ref={bilahPratinjau} className="z-10 flex shrink-0 items-center gap-2 border-b border-outline-variant bg-primary-soft px-4 py-2 max-lg:sticky max-lg:top-(--topbar-height)" role="status">
            <p className="min-w-0 flex-1 truncate text-body-medium text-on-surface" title="Not applied yet">
              Previewing <b className="font-semibold">{presetDilihat.label}</b>
            </p>
            <Button variant="text" size="sm" onClick={() => setPratinjauPreset(null)}>Cancel</Button>
            <Button size="sm" onClick={terapkanPratinjau}>Apply</Button>
          </div>
        ) : null}
        {/* scroll-pt: field yang difokus dengan Tab tidak boleh tertutup kepala baris yang menempel (72px).
            Tema dan Peserta bisa dimulai dengan teks biasa, jadi bidang gulirnya sendiri
            ikut menerima fokus agar bisa digulir dengan papan ketik. */}
        <PaneBody
          key={`${bagian}-${modeEn ? "en" : "id"}`}
          tabIndex={bagian === "susunan" ? undefined : 0}
          role={bagian === "susunan" ? undefined : "group"}
          aria-labelledby={bagian === "susunan" ? undefined : segmentTabId("isi-setelan", bagian)}
          onScroll={(event) => { gulirTerakhir.current = event.currentTarget.scrollTop; }}
          // `!`: aturan :focus-visible global tidak berlapis, jadi mengalahkan utilitas biasa.
          // pb-40 di Susunan: kolom terbawah tetap bisa digulir ke atas toast galat.
          className={bagian === "susunan" ? "scroll-pt-22 pb-40" : "px-4 py-4 focus-visible:shadow-none! focus-visible:-outline-offset-2!"}>
          {bagian === "susunan" ? (modeEn ? isiSusunanEn : isiSusunan) : bagian === "tema" ? isiTema : isiPeserta}
        </PaneBody>
      </div>
    </Pane>
  );

  /* ---- Pembatas panel ---------------------------------------------------- */
  // Diseret dengan penunjuk atau digeser dengan panah. Nilainya lebar PANEL
  // setelan, jadi panah kiri (pembatas bergerak ke kiri) melebarkannya.
  const awalSeret = useRef<{ x: number; lebar: number } | null>(null);

  function simpanLebar(lebar: number) {
    const nilai = jepitPanel(lebar);
    if (kunciPanel) {
      tulisLokal(kunciPanel, nilai);
      setLebarSeret(null);
    } else {
      setLebarSeret(nilai);
    }
  }

  function mulaiSeretPanel(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    awalSeret.current = { x: event.clientX, lebar: lebarPanel };
  }

  function seretPanel(event: PointerEvent<HTMLDivElement>) {
    const awal = awalSeret.current;
    if (!awal) return;
    setLebarSeret(jepitPanel(awal.lebar + (awal.x - event.clientX)));
  }

  function lepasPanel() {
    if (!awalSeret.current) return;
    awalSeret.current = null;
    simpanLebar(lebarPanel);
  }

  function tombolPanel(event: KeyboardEvent<HTMLDivElement>) {
    const langkah = event.shiftKey ? 64 : 16;
    const target =
      event.key === "ArrowLeft" ? lebarPanel + langkah
        : event.key === "ArrowRight" ? lebarPanel - langkah
          : event.key === "Home" ? PANEL_MIN
            : event.key === "End" ? PANEL_MAX
              : null;
    if (target === null) return;
    event.preventDefault();
    simpanLebar(target);
  }

  // Snackbar "Urungkan" hilang sendiri. 8 detik: cukup untuk membaca dan menekan,
  // tidak cukup lama untuk menutupi baris terbawah panel sepanjang sesi.
  useEffect(() => {
    if (!urungan) return;
    const timer = window.setTimeout(() => setUrungan(null), 8000);
    return () => window.clearTimeout(timer);
  }, [urungan]);

  // Klik di pratinjau memilih baris Susunan halaman (pilih-bagian.ts). Nama
  // baris sama dengan di daftar; kolom `bagian:kolom` sama dengan data-sunting
  // di halaman publik. Forum punya editor dan nama bagian sendiri: belum ikut.
  // Editorial belum menandai bagiannya (QA #108 L3): hanya Modern dan Gathering.
  const kunciLabel = !modern || hanyaFormulir || bagian !== "susunan"
    ? ""
    : JSON.stringify([
        ["pembuka", "Hero"],
        ...sections.filter((section) => section.enabled).map((section) => [
          section.id,
          isLandingBlockId(section.id)
            ? (() => {
                const blok = blokById.get(section.id);
                return blok ? blok.heading?.trim() || blok.name?.trim() || LANDING_BLOCK_LABELS[blok.type] : "Block";
              })()
            : LANDING_SECTION_ADMIN_LABELS[section.id],
        ]),
        ["kaki", "Footer"],
        ["pembuka:nav", "Top bar"],
        ["pembuka:public_name", "Event name"],
        ["pembuka:tagline", gathering ? "Title" : "Tagline"],
        ["pembuka:portal", "Portal preview"],
        ["portal", "Portal peserta"],
        ["pembuka:hero_eyebrow", "Label above the title"],
        ["pembuka:hero_note", "Line below the title"],
        ["pembuka:hero_bg_url", "Background image"],
        ["kaki:cta_heading", "Call-to-action banner"],
      ]);
  const labelPilih = useMemo<Record<string, string> | null>(() => (kunciLabel ? Object.fromEntries(JSON.parse(kunciLabel)) : null), [kunciLabel]);

  const pilihDariPratinjau = useCallback((id: string, kolom: string | null) => {
    if (terbuka !== id) {
      setTerbuka(id);
      setSorot((current) => ({ id, n: (current?.n ?? 0) + 1, diam: true }));
      gulirKeBaris(id);
    }
    if (kolom) tampilkanKolom(id, kolom);
  }, [terbuka]);

  const jumlahHapus = konfirmasiHapus?.ids.length ?? 0;

  return (
    // Tidak memakai `WorkspacePage fill`: pada layar pendek (laptop berskala
    // 150%) `fill` melepas kunci tinggi dan halaman bergulir. Editor ini selalu
    // setinggi layar; pratinjau dan panel setelan masing-masing bergulir sendiri.
    // Judul, aksi, dan Simpan ada di bilah atas, jadi tidak ada kepala halaman
    // yang memakan tinggi di sini.
    <main lang="en" className="flex w-full flex-col gap-4 bg-surface p-4 text-on-surface lg:h-[calc(100dvh-var(--workspace-top,58px))] lg:overflow-hidden">
      <AdminBarPortal
        judul={
          <div className="flex min-w-0 shrink items-baseline gap-3">
            <h1 className="truncate text-title-medium font-semibold text-on-surface">Event page</h1>
            {facts ? (
              <span className="hidden truncate text-body-small text-on-surface-variant xl:inline" title="The address printed on invitations and QR codes">
                /e/{facts.slug}
              </span>
            ) : null}
          </div>
        }
        aksi={facts ? (
          <>
            {/* Di ponsel bilahnya hanya muat judul dan Simpan; Ekspor/Impor jarang dipakai di sana. */}
            <span className="hidden md:contents">
              <Button variant="text" size="sm" icon={<DownloadSimple size={16} />} onClick={ekspor}>
                Export
              </Button>
              <Button variant="text" size="sm" icon={<UploadSimple size={16} />} onClick={() => pilihBerkas.current?.click()}>
                Import
              </Button>
              <input ref={pilihBerkas} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void impor(event)} />
              <ButtonLink href={`/e/${facts.slug}`} target="_blank" rel="noreferrer" variant="outlined" size="sm" icon={<ArrowSquareOut size={16} />}>
                View page
              </ButtonLink>
            </span>
            <span aria-hidden className="mx-1 hidden h-7 w-px bg-outline-variant md:block" />
            <span role="status" className="hidden min-w-[7.5rem] items-center justify-end gap-1.5 whitespace-nowrap text-body-small text-on-surface-variant md:inline-flex">
              <span aria-hidden className={cx("size-2 rounded-full", berubah ? "bg-warning" : "bg-success")} />
              {berubah ? "Unsaved changes" : "Saved"}
            </span>
            <Button simpan size="sm" onClick={() => void save()} loading={busy}>Save</Button>
          </>
        ) : null}
      />

      {error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : null}

      {facts ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-0">
          <div id="pratinjau-acara" className="flex min-h-[70vh] min-w-0 flex-1 scroll-mt-4 flex-col *:flex-1 lg:min-h-0">
            <LandingPreview
              slug={facts.slug}
              reloadKey={previewKey}
              sorot={sorot}
              tabPembicara={tabPembicara}
              draf={drafPratinjau}
              halaman={forum ? halamanPratinjau : null}
              onHalaman={setHalamanPratinjau}
              bahasa={modeEn && bagian === "susunan" ? "en" : "id"}
              onBahasa={pilihBahasa}
              formulir={hanyaFormulir}
              labelPilih={labelPilih}
              onPilih={pilihDariPratinjau}
            />
          </div>
          <div
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label="Settings panel width"
            aria-controls="panel-setelan"
            aria-valuemin={PANEL_MIN}
            aria-valuemax={PANEL_MAX}
            aria-valuenow={lebarPanel}
            onPointerDown={mulaiSeretPanel}
            onPointerMove={seretPanel}
            onPointerUp={lepasPanel}
            onPointerCancel={lepasPanel}
            onKeyDown={tombolPanel}
            onDoubleClick={() => simpanLebar(PANEL_BAWAAN)}
            title="Drag to resize the panel. Double-click for the default width."
            className="group hidden w-4 shrink-0 cursor-col-resize touch-none items-center justify-center rounded-sm outline-none lg:flex"
          >
            <span className="h-10 w-1 rounded-full bg-outline transition-colors group-hover:bg-on-surface-variant group-focus-visible:h-16 group-focus-visible:bg-primary group-active:bg-primary" />
          </div>
          <div
            className="flex min-h-[70vh] w-full flex-col *:flex-1 lg:min-h-0 lg:w-[var(--panel-w)] lg:shrink-0"
            style={{ "--panel-w": `${lebarPanel}px` } as React.CSSProperties}
          >
            {panel}
          </div>
        </div>
      ) : error ? null : <PageLoading />}

      <Dialog
        open={konfirmasiHapus !== null}
        onClose={() => setKonfirmasiHapus(null)}
        tone="danger"
        icon={<Trash size={20} />}
        title={jumlahHapus > 1 ? `Delete ${plural(jumlahHapus, "hidden block")}?` : `Delete “${konfirmasiHapus?.judul || "this block"}”?`}
        description={
          jumlahHapus > 1
            ? `The content of these ${jumlahHapus} blocks is deleted too. Hidden built-in sections stay. Takes effect when you save, and you can undo it until then.`
            : "The content of this block is deleted too. Takes effect when you save, and you can undo it until then."
        }
        actions={
          <>
            <Button variant="text" onClick={() => setKonfirmasiHapus(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (konfirmasiHapus) hapusBlok(konfirmasiHapus.ids);
                setKonfirmasiHapus(null);
              }}
            >
              {jumlahHapus > 1 ? `Delete ${plural(jumlahHapus, "block")}` : "Delete block"}
            </Button>
          </>
        }
      />

      {urungan ? (
        <div role="status" className="fixed bottom-4 left-1/2 z-popover flex -translate-x-1/2 items-center gap-2 rounded-sm bg-inverse-surface py-1.5 pl-4 pr-1.5 text-body-medium text-inverse-on-surface shadow-level3">
          <span>{urungan.pesan}</span>
          <button type="button" onClick={urungkan} className="h-9 rounded-sm px-3 font-medium text-inverse-primary hover:bg-white/10">
            Undo
          </button>
        </div>
      ) : null}
    </main>
  );
}

type IsiAdminRundown = { sections?: RundownSection[]; items?: RundownItem[] };

/** Bagian rundown yang tampil di halaman acara (diterbitkan), urut seperti di Rundown. */
function bagianTerbit(isi: IsiAdminRundown): RundownSection[] {
  return [...(isi.sections ?? [])].filter((bagian) => bagian.is_published).sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Baris rundown untuk kartu terjemahan English: yang sama dengan yang dibaca
 * halaman acara, yaitu baris berjudul yang bagian dan barisnya diterbitkan.
 */
function barisRundownEnDariAdmin(isi: IsiAdminRundown): BarisRundownEn[] {
  const daftarBagian = bagianTerbit(isi);
  const urutBagian = new Map<number, number>(daftarBagian.map((bagian, index) => [bagian.id, index]));
  const namaBagian = new Map(daftarBagian.map((bagian) => [bagian.id, bagian.name?.trim() || bagian.title?.trim() || "Section"]));
  return (isi.items ?? [])
    .filter((item) => item.title?.trim() && item.is_published && urutBagian.has(item.section_id))
    .sort((a, b) => (urutBagian.get(a.section_id) ?? 0) - (urutBagian.get(b.section_id) ?? 0) || urutRundown(a, b))
    .map((item) => ({
      id: item.id,
      jam: formatClock(item.start_time),
      bagian: daftarBagian.length > 1 ? namaBagian.get(item.section_id) ?? null : null,
      title: item.title,
      subtitle: item.subtitle,
      title_en: item.title_en ?? "",
      subtitle_en: item.subtitle_en ?? "",
    }));
}

/** Lencana Susunan acara: ada sesi yang tampil, ada sesi tetapi belum diterbitkan, atau kosong. */
function statusRundown(isi: IsiAdminRundown): "ada" | "belum-terbit" | "kosong" {
  const terbit = new Set(bagianTerbit(isi).map((bagian) => bagian.id));
  const adaBagian = new Set((isi.sections ?? []).map((bagian) => bagian.id));
  const berjudul = (isi.items ?? []).filter((item) => item.title?.trim() && adaBagian.has(item.section_id));
  if (berjudul.some((item) => item.is_published && terbit.has(item.section_id))) return "ada";
  return berjudul.length > 0 ? "belum-terbit" : "kosong";
}
