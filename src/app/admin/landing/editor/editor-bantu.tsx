"use client";

import { LANDING_SECTION_TEXT_MAX, LANDING_EYEBROW_DEFAULT, landingBlockLimits, type LandingTextLimit, normalizeLandingSections, isPortalEntry, susunanDenganPortal, type LandingBlock, type LandingBlockItem, type EventLandingConfig, type LandingHeadedSection, type LandingConfigEn, type LandingSectionEntry } from "@/lib/domain";
import { isianButirTampil, kolomBlokTampil, labelIsianButir, labelKolomBlok, namaButirBlok, type KolomButir } from "../blocks";
import { labelIsianButirEn, labelKolomBlokEn, namaButirBlokEn, type BarisRundownEn } from "../editor-en";
import { useState } from "react";
import { TextField } from "@/components/m3";
import { formatClock, type RundownItem, type RundownSection } from "@/lib/rundown";
import { urutRundown } from "../pilih-sesi";

// Supporting pane: halaman publik yang sungguhan di panel utama, setelannya di
// panel kanan. Pratinjau hanya menampilkan versi tersimpan (lihat LandingPreview),
// jadi kaki panel menyebut kapan ada perubahan yang belum terlihat di sana.

// Berkas isi halaman (Ekspor/Impor). Hanya kolom yang disunting di layar ini:
// tanggal acara, rundown, dan peserta tetap di tempatnya masing-masing.
export const BERKAS_FORMAT = "tally-landing";
/** Tajuk kelompok di daftar Sections: abu, bobot 500, 16 px di atas (pola tajuk rel navigasi). */
export const TAJUK_KELOMPOK = "px-4 pb-1 pt-4 text-body-small font-medium text-on-surface-variant";
export const KOLOM_FAKTA = ["description", "tagline", "start_time", "end_time", "end_date", "venue_name", "venue_address", "venue_map_url"] as const;
export type BerkasIsi = {
  format: typeof BERKAS_FORMAT;
  version: 1;
  facts?: Partial<Pick<Facts, (typeof KOLOM_FAKTA)[number]>>;
  landing?: EventLandingConfig;
};

export type Facts = {
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

export type Bagian = "susunan" | "tema";

/** "09:00:00" → "09:00". Kolom <input type="time"> menolak bentuk berdetik. */
export const jamInput = (value: string | null) => (value ? value.slice(0, 5) : "");

/** "2026-10-15" → "15 Oct 2026" (en-GB, untuk teks staf). */
export const formatTanggal = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));

export function PilihWarna({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
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
export function kolomKepanjangan(blok: LandingBlock): { kolom: string; max: number; bahasa: "id" | "en" } | null {
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

export const ada = (nilai: unknown) => typeof nilai === "string" && nilai.trim().length > 0;

/** Ruang di bawah panel yang tertutup toast galat (terukur ~110px), plus jarak. */
export const RUANG_TOAST = 140;

/**
 * Bawa kolom yang ditolak Simpan ke sepertiga atas panel dan beri fokus.
 * Sepertiga atas, bukan tengah: toast galat di bawah layar menutupi
 * penghitung kolom yang terletak di bawah; kolom tinggi diletakkan lebih ke
 * atas lagi supaya penghitungnya tetap di atas toast. Tanpa `kunci`, dicari
 * kolom pertama di baris itu yang isinya melewati maxLength; butir blok yang
 * terlipat dan bertanda "Terlalu panjang" dibuka dulu. `kabar` menerima
 * apakah kolomnya ketemu, supaya toast tidak menjanjikan kolom yang tidak ada.
 */
export function fokusKolomLewat(barisId: string, kunci: string | undefined, kabar: (ketemu: boolean) => void, ulang = true) {
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
export function gulirKeBaris(id: string, bilaDiAtas = false) {
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
export function tampilkanKolom(barisId: string, kunci: string) {
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
export const JUDUL_PRESET_PX: Record<"md" | "lg" | "xl", number> = { md: 52, lg: 64, xl: 72 };
export const HERO_PRESET_PX: Record<"compact" | "standard" | "tall", number> = { compact: 600, standard: 760, tall: 850 };

/** Ukuran dalam px: penggeser untuk mencoba-coba, kolom angka untuk nilai pasti. */
export function AngkaPx({
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
export const PANEL_MIN = 400;
export const PANEL_MAX = 640;
export const PANEL_BAWAAN = 440;
export const KUNCI_PANEL = "tally:landing-panel:v1";
export const KUNCI_BAHASA = "tally:landing-bahasa:v1";
export const jepitPanel = (lebar: number) => Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, lebar)));

export type KunciTeksEn = Extract<Exclude<keyof LandingConfigEn, "program_notes" | "about_cards">, keyof EventLandingConfig>;
export const BAGIAN_BERJUDUL = Object.keys(LANDING_EYEBROW_DEFAULT) as LandingHeadedSection[];

/** Kolom teks di lipatan "Judul bagian" satu bagian: kunci, nama untuk pesan, batas skema. */
export function kolomJudulBagian(id: LandingHeadedSection): [KunciTeksEn, string, number][] {
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
export function judulBagianKepanjangan(landing: EventLandingConfig): { id: LandingHeadedSection; kunci: KunciTeksEn; kolom: string; bahasa: "id" | "en"; max: number } | null {
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
export function tanpaEnYatim(landing: EventLandingConfig): EventLandingConfig {
  if (!landing.en) return landing;
  const en = { ...landing.en };
  for (const id of BAGIAN_BERJUDUL) {
    for (const [kunci] of kolomJudulBagian(id)) if (!landing[kunci]?.trim()) delete en[kunci];
  }
  return { ...landing, en };
}

/** Batas luar skema server untuk teks butir (landing-body-schema), ID dan English. */
export const BATAS_SKEMA_BUTIR: Record<KolomButir, LandingTextLimit> = { label: { max: 160 }, title: { max: 160 }, body: { max: 400 }, value: { max: 30 } };

/**
 * Buang teks blok yang editor tidak tampilkan dan melewati batas: teks tombol
 * tanpa tautan, Chip 2 di luar tata letak overlay, teks tautan Kolom tanpa
 * tautan, teks English yang Indonesianya kosong. Halaman publik juga tidak
 * menampilkannya, tetapi server tetap menolaknya, dengan galat yang tidak
 * menyebut kolom mana. Yang masih dalam batas dibiarkan, supaya pindah tata
 * letak tidak menghapus isi.
 */
export function tanpaTersembunyiKepanjangan(blocks: LandingBlock[] | undefined): LandingBlock[] | undefined {
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
/** Susunan yang diedit: dengan Portal peserta pada gaya gathering. */
export function susunanHalaman(isi: EventLandingConfig): LandingSectionEntry[] {
  const gathering = isi.layout === "modern" && isi.gathering === true;
  return gathering ? susunanDenganPortal(isi.sections, isi.blocks) : normalizeLandingSections(isi.sections, isi.blocks);
}

/**
 * Susunan yang disimpan. Portal di ujung adalah tempat bawaannya, jadi tidak
 * ditulis: entri portal tersimpan berarti admin memilih tempat lain, dan Apply
 * atau Reset Gathering membiarkannya (lihat isiGathering).
 */
export function simpanSusunan(susunan: LandingSectionEntry[]): LandingSectionEntry[] {
  return susunan.length > 0 && isPortalEntry(susunan[susunan.length - 1]) ? susunan.slice(0, -1) : susunan;
}

export type Urungan = { pesan: string; sections: LandingSectionEntry[]; blocks: LandingBlock[] };

export type IsiAdminRundown = { sections?: RundownSection[]; items?: RundownItem[] };

/** Bagian rundown yang tampil di halaman acara (diterbitkan), urut seperti di Rundown. */
export function bagianTerbit(isi: IsiAdminRundown): RundownSection[] {
  return [...(isi.sections ?? [])].filter((bagian) => bagian.is_published).sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Baris rundown untuk kartu terjemahan English: yang sama dengan yang dibaca
 * halaman acara, yaitu baris berjudul yang bagian dan barisnya diterbitkan.
 */
export function barisRundownEnDariAdmin(isi: IsiAdminRundown): BarisRundownEn[] {
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
export function statusRundown(isi: IsiAdminRundown): "ada" | "belum-terbit" | "kosong" {
  const terbit = new Set(bagianTerbit(isi).map((bagian) => bagian.id));
  const adaBagian = new Set((isi.sections ?? []).map((bagian) => bagian.id));
  const berjudul = (isi.items ?? []).filter((item) => item.title?.trim() && adaBagian.has(item.section_id));
  if (berjudul.some((item) => item.is_published && terbit.has(item.section_id))) return "ada";
  return berjudul.length > 0 ? "belum-terbit" : "kosong";
}
