"use client";

import { pesanGalatApi } from "@/lib/api-message";
import { ArrowDown, ArrowSquareOut, ArrowUp, CaretDown, CopySimple, DotsSixVertical, DownloadSimple, Eye, EyeSlash, Info, Plus, Trash, UploadSimple, Warning } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type DragEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import Link from "@/components/event-link";
import {
  Banner, Button, ButtonLink, Dialog, FilterChip, IconButton, MetaSeparator, PageLoading, PaneBody, Pane, SegmentedButton, segmentTabId,
  StatusChip, Switch, TextArea, TextField,
} from "@/components/m3";
import { AdminBarPortal, useAdminPage } from "@/components/admin/page-context";
import { bacaLokal, langgananLokal, tulisLokal } from "@/lib/local-store";
import { useToast } from "@/components/toast";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { LandingPreview } from "@/components/admin/landing-preview";
import {
  LANDING_BANNER_STYLE_LABELS,
  LANDING_HEADING_FONTS,
  LANDING_HEADING_SIZE,
  LANDING_HERO_HEIGHT_PX,
  LANDING_MEMBER_AUDIENCE_LABELS,
  LANDING_LAYOUT_LABELS,
  LANDING_NAV_HEIGHT_MAX,
  LANDING_NAV_HEIGHT_MIN,
  LANDING_SECTION_LABELS,
  LANDING_SECTION_SOURCES,
  LANDING_SECTION_TEXT_MAX,
  LANDING_BLOCK_LABELS,
  isLandingBlockId,
  landingBlockHasContent,
  landingBlockLimits,
  normalizeLandingSections,
  type LandingBlock,
  type LandingBlockType,
  type EventLandingConfig,
  type LandingHeadingFont,
  type LandingLayout,
  type LandingMemberConfig,
  type LandingMemberAudience,
  type LandingHeadedSection,
  type LandingSection,
  type LandingSectionId,
  type RegistrationFormConfig,
} from "@/lib/domain";
import { formatEventDate } from "@/lib/event-datetime";
import { DEFAULT_TIME_ZONE } from "@/lib/timezone";
import { jumlahLembaga } from "@/lib/landing-speaker-tabs";
import { DEFAULT_REGISTRATION_SEED } from "@/lib/registration-theme";
import { eventApiPath } from "@/lib/event-url";
import { Kelompok } from "@/components/admin/compact-form";
import { BilahAtasEditor } from "@/components/admin/landing-nav-editor";
import { cx } from "@/lib/m3/cx";
import { BlockEditor, butirBerlebih, ringkasanBlok, TambahBlokDialog, tautanBlokSalah, buatBlok } from "./blocks";
import { MenuBlok, type ItemMenuBlok } from "./menu-blok";
import { BagianEn, BlockEditorEn, kartuRundownId, rundownBelumDiterjemahkan, type BarisRundownEn } from "./editor-en";
import { formatClock, type RundownItem } from "@/lib/rundown";
import { LANDING_UI, landingEyebrowShown, landingSessionEn, landingUntranslated } from "@/lib/landing-i18n";

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

const NAMA_KOLOM: Record<string, string> = {
  eyebrow: "label kecil", heading: "judul", body: "isi", link_label: "teks tombol", link2_label: "teks tombol kedua",
  fact_title: "judul fakta", fact_body: "isi fakta", source: "sumber", quote: "kutipan", name: "nama", role: "peran",
  label: "label butir", title: "judul butir", value: "angka",
};

/**
 * Kolom pertama yang melewati batas karakter blok, atau null. Teks English
 * (`en`) memakai batas yang sama; `bahasa` menyebut mode editor tempat kolom itu.
 */
function kolomKepanjangan(blok: LandingBlock): { kolom: string; max: number; bahasa: "id" | "en" } | null {
  const batas = landingBlockLimits(blok);
  for (const bahasa of ["id", "en"] as const) {
    const sumber = (bahasa === "id" ? blok : blok.en ?? {}) as Record<string, unknown>;
    for (const [kunci, limit] of Object.entries(batas)) {
      if (kunci === "item" || kunci === "items" || !limit || !("max" in limit)) continue;
      const nilai = sumber[kunci];
      if (typeof nilai === "string" && nilai.length > limit.max) return { kolom: NAMA_KOLOM[kunci] ?? kunci, max: limit.max, bahasa };
    }
    for (const [nomor, butir] of (blok.items ?? []).entries()) {
      const isiButir = (bahasa === "id" ? butir : butir.en ?? {}) as Record<string, unknown>;
      for (const [kunci, limit] of Object.entries(batas.item ?? {})) {
        const nilai = isiButir[kunci];
        if (limit && typeof nilai === "string" && nilai.length > limit.max) return { kolom: `${NAMA_KOLOM[kunci] ?? kunci} ${nomor + 1}`, max: limit.max, bahasa };
      }
    }
  }
  return null;
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
}: {
  label: string;
  hint: string;
  rentang: { min: number; max: number; step: number };
  value: number;
  onChange: (value: number) => void;
}) {
  // Teks yang sedang diketik; null = ikuti nilai tersimpan (mis. dari penggeser).
  const [draf, setDraf] = useState<string | null>(null);
  const jepit = (angka: number) => Math.min(rentang.max, Math.max(rentang.min, Math.round(angka)));
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
          trailing={<span className="text-body-medium text-on-surface-variant">px</span>}
          value={draf ?? String(value)}
          onChange={(event) => {
            setDraf(event.target.value);
            const angka = Number(event.target.value);
            if (event.target.value !== "" && angka >= rentang.min && angka <= rentang.max) onChange(Math.round(angka));
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
          aria-label={`${label}, penggeser`}
          min={rentang.min}
          max={rentang.max}
          step={rentang.step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-11 w-full accent-primary"
        />
      <p className="text-body-medium text-on-surface-variant">
        {hint} Rentang {rentang.min} sampai {rentang.max} px.
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

/** Hapus yang bisa diurungkan. Berlaku di draf; baru permanen saat Simpan. */
type Urungan = { pesan: string; sections: LandingSection[]; blocks: LandingBlock[] };

export default function LandingCmsPage() {
  const [facts, setFacts] = useState<Facts | null>(null);
  const [landing, setLanding] = useState<EventLandingConfig>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bagian, setBagian] = useState<Bagian>("susunan");
  // Lipatan "Judul bagian" yang terbuka (satu bagian), awalnya tertutup.
  const [judulTerbuka, setJudulTerbuka] = useState<LandingHeadedSection | null>(null);
  // Baris Susunan halaman yang sedang terbuka ("pembuka", id bagian, atau "kaki").
  const [terbuka, setTerbuka] = useState<string | null>(null);
  // Bagian yang disorot di pratinjau; `n` naik di setiap klik supaya klik ulang
  // pada baris yang sama tetap menggulir pratinjau ke sana.
  const [sorot, setSorot] = useState<{ id: string; n: number } | null>(null);
  // null = belum diketahui (gagal dimuat); lencana hanya muncul bila pasti kosong.
  const [rundownKosong, setRundownKosong] = useState<boolean | null>(null);
  // Teks English baris Rundown. Disimpan ke tabel rundown, bukan landing_config,
  // jadi keadaan tersimpannya dicatat terpisah.
  // null: rundown gagal dimuat, beda dengan rundown tanpa sesi.
  const [rundownEn, setRundownEn] = useState<BarisRundownEn[] | null>([]);
  const [rundownEnTersimpan, setRundownEnTersimpan] = useState<BarisRundownEn[]>([]);
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
  // Potret keadaan terakhir yang tersimpan, untuk memberi tahu bahwa pratinjau
  // belum memuat perubahan yang sedang diketik.
  const [tersimpan, setTersimpan] = useState<string | null>(null);
  // Terjemahan sesi yang ditinggalkan saat nama sesi Indonesia diubah, menurut
  // nama sesinya. Mengetik nama itu kembali memulihkan terjemahannya, walau
  // sesinya sempat tidak dipakai pembicara mana pun.
  const terjemahanSesi = useRef(new Map<string, string>());
  const toast = useToast();

  const load = useCallback(async () => {
    terjemahanSesi.current.clear();
    const response = await fetch(eventApiPath("/api/events"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setError("Data acara gagal dimuat."); return; }
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
    if (!found) { setError("Acara ini tidak ada di daftar acara yang bisa Anda buka. Minta super admin memberi akses."); return; }
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
    // Rundown hanya dibaca untuk lencana "Rundown kosong": bagian Susunan acara
    // tidak tampil di halaman publik selama belum ada sesi yang diterbitkan.
    const rundown = await fetch(eventApiPath("/api/rundown"), { cache: "no-store" }).catch(() => null);
    const isiRundown = rundown?.ok ? await rundown.json().catch(() => null) : null;
    setRundownKosong(isiRundown ? !isiRundown.published : null);
    // Baris yang sama dengan yang dibaca halaman acara (loadAgendaPreview):
    // semua baris berjudul, urut bagian lalu urutan baris.
    const admin = await fetch(eventApiPath("/api/admin/rundown/sections"), { cache: "no-store" }).catch(() => null);
    const isiAdmin = admin?.ok ? await admin.json().catch(() => null) : null;
    if (!isiAdmin) {
      setRundownEn(null);
      setRundownEnTersimpan([]);
    } else {
      const daftarBagian = (isiAdmin.sections ?? []) as Array<{ id: number; name?: string | null; title?: string | null }>;
      const urutBagian = new Map<number, number>(daftarBagian.map((bagian, index) => [bagian.id, index]));
      const namaBagian = new Map(daftarBagian.map((bagian) => [bagian.id, bagian.name?.trim() || bagian.title?.trim() || "Bagian"]));
      const baris: BarisRundownEn[] = ((isiAdmin.items ?? []) as RundownItem[])
        .filter((item) => item.title?.trim() && urutBagian.has(item.section_id))
        .sort((a, b) => (urutBagian.get(a.section_id) ?? 0) - (urutBagian.get(b.section_id) ?? 0))
        .map((item) => ({
          id: item.id,
          jam: formatClock(item.start_time).replace(":", "."),
          bagian: daftarBagian.length > 1 ? namaBagian.get(item.section_id) ?? null : null,
          title: item.title,
          subtitle: item.subtitle,
          title_en: item.title_en ?? "",
          subtitle_en: item.subtitle_en ?? "",
        }));
      setRundownEn(baris);
      setRundownEnTersimpan(baris);
    }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const sections: LandingSection[] = normalizeLandingSections(landing.sections, landing.blocks);
  const cuplikan = facts ? JSON.stringify({ facts, landing, formInherit, formSeed }) : null;
  // Dibandingkan setelah trim: spasi saja tidak dihitung perubahan, sama dengan yang dikirim.
  const rundownBerubah = (rundownEn ?? []).filter(
    (baris, index) => baris.title_en.trim() !== (rundownEnTersimpan[index]?.title_en ?? "").trim() || baris.subtitle_en.trim() !== (rundownEnTersimpan[index]?.subtitle_en ?? "").trim(),
  );
  const berubah = tersimpan !== null && (cuplikan !== tersimpan || rundownBerubah.length > 0);
  const ubahRundown = (id: number, patch: Partial<Pick<BarisRundownEn, "title_en" | "subtitle_en">>) =>
    setRundownEn((current) => current && current.map((baris) => (baris.id === id ? { ...baris, ...patch } : baris)));
  // Draf untuk pratinjau langsung. Dibuat ulang hanya saat isinya berubah,
  // supaya pratinjau tidak dirender ulang di setiap render CMS.
  const drafPratinjau = useMemo(() => (cuplikan && facts ? isiKirim(facts) : null), [cuplikan]); // eslint-disable-line react-hooks/exhaustive-deps

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
    tautan.download = `isi-halaman-${facts.slug}-${new Date().toISOString().slice(0, 10)}.json`;
    tautan.click();
    URL.revokeObjectURL(url);
  }

  async function impor(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const isi = await file.text().then((teks) => JSON.parse(teks) as Partial<BerkasIsi>).catch(() => null);
    if (!isi || isi.format !== BERKAS_FORMAT || typeof isi.landing !== "object" || isi.landing === null) {
      toast.error("Berkas tidak dikenali", "Pilih berkas .json hasil Ekspor isi dari halaman ini.");
      return;
    }
    const fakta = Object.fromEntries(
      KOLOM_FAKTA.filter((kolom) => isi.facts && kolom in isi.facts).map((kolom) => [kolom, isi.facts?.[kolom] ?? null]),
    ) as Partial<Facts>;
    patchFacts(fakta);
    // Kunci yang tidak ada di berkas (gambar sampul, warna, dsb.) tetap memakai
    // isi yang sekarang, jadi berkas tanpa gambar tidak menghapus gambar yang ada.
    terjemahanSesi.current.clear();
    setLanding((current) => ({ ...current, ...isi.landing }));
    setBagian("susunan");
    toast.success("Isi dimuat", "Periksa isinya, lalu tekan Simpan. Muat ulang halaman untuk membatalkan.");
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
      case "about": return Boolean(facts?.description?.trim());
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
  function isiKirim(facts: Facts) {
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
        ...landing,
        sections,
        theme: { seed: landing.theme?.seed ?? DEFAULT_REGISTRATION_SEED },
        member: landing.member
          ? { ...landing.member, feedback_url: landing.member.feedback_url?.trim() || null }
          : undefined,
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
      toast.error("Angka penting belum lengkap", `Baris ${angkaKosong + 1}: isi keterangan dan angkanya, atau hapus baris itu.`);
      return;
    }
    const tanyaKosong = (landing.faq ?? []).findIndex((item) => !item.q.trim() || !item.a.trim());
    if (tanyaKosong >= 0) {
      toast.error("Pertanyaan umum belum lengkap", `Pertanyaan ${tanyaKosong + 1}: isi pertanyaan dan jawabannya, atau hapus pertanyaan itu.`);
      return;
    }
    const umpanBalik = landing.member?.feedback_url?.trim();
    if (landing.member?.enabled && umpanBalik && !/^https?:\/\/\S+\.\S+/.test(umpanBalik)) {
      toast.error("Tautan umpan balik belum valid", "Tulis alamat lengkap yang diawali https://, atau kosongkan.");
      return;
    }
    const pembicaraKosong = (landing.speakers ?? []).findIndex((item) => !item.name.trim());
    if (pembicaraKosong >= 0) {
      toast.error("Pembicara belum lengkap", `Pembicara ${pembicaraKosong + 1}: isi namanya, atau hapus baris itu.`);
      return;
    }
    const blokSalah = sections.findIndex((section) => {
      const blok = isLandingBlockId(section.id) ? (landing.blocks ?? []).find((item) => item.id === section.id) : undefined;
      return blok ? tautanBlokSalah(blok) : false;
    });
    if (blokSalah >= 0) {
      toast.error("Tautan di blok belum valid", `Bagian ${blokSalah + 1}: tulis alamat lengkap yang diawali https://, # untuk bagian di halaman ini, atau kosongkan.`);
      return;
    }
    const blokPenuh = sections.findIndex((section) => {
      const blok = isLandingBlockId(section.id) ? (landing.blocks ?? []).find((item) => item.id === section.id) : undefined;
      return blok ? butirBerlebih(blok) > 0 : false;
    });
    if (blokPenuh >= 0) {
      toast.error("Butir blok terlalu banyak", `Bagian ${blokPenuh + 1}: tata letak yang dipilih menampung lebih sedikit butir. Hapus butir yang berlebih atau pilih tata letak lain.`);
      return;
    }
    // Batas karakter juga diperiksa server, tetapi galatnya hanya "Maksimal 24
    // karakter" tanpa menyebut blok mana. Di sini blok itu dibuka dan disebut.
    for (const [index, section] of sections.entries()) {
      const blok = isLandingBlockId(section.id) ? (landing.blocks ?? []).find((item) => item.id === section.id) : undefined;
      const lewat = blok ? kolomKepanjangan(blok) : null;
      if (blok && lewat) {
        setBagian("susunan");
        setBahasa(lewat.bahasa);
        setTerbuka(blok.id);
        setSorot((current) => ({ id: blok.id, n: (current?.n ?? 0) + 1 }));
        gulirKeBaris(blok.id);
        toast.error("Teks terlalu panjang", `Bagian ${index + 2}, ${lewat.kolom}${lewat.bahasa === "en" ? " (English)" : ""}: maksimal ${lewat.max} karakter. Bagiannya sudah dibuka.`);
        return;
      }
    }
    const tinggiBilah = landing.nav?.height;
    if (tinggiBilah != null && (tinggiBilah < LANDING_NAV_HEIGHT_MIN || tinggiBilah > LANDING_NAV_HEIGHT_MAX)) {
      setBagian("susunan");
      setBahasa("id");
      setTerbuka("pembuka");
      gulirKeBaris("pembuka");
      toast.error("Tinggi bilah atas di luar batas", `Pembuka, Bilah atas: isi ${LANDING_NAV_HEIGHT_MIN} sampai ${LANDING_NAV_HEIGHT_MAX} px. Bagiannya sudah dibuka.`);
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
        const sudah = rundownTerkirim > 0 ? ` ${rundownTerkirim} sesi sebelumnya sudah tayang.` : "";
        toast.error("Gagal disimpan", `Susunan acara, sesi ${baris.jam} (English): ${(hasil && pesanGalatApi(await hasil.json().catch(() => ({})))) ?? "coba lagi."}${sudah} Kartunya sudah dibuka.`);
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
      body: JSON.stringify(isiKirim(facts)),
    }).catch(() => null);
    setBusy(false);
    if (!response) { toast.error("Koneksi gagal", "Muat ulang untuk melihat keadaan sebenarnya."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Gagal disimpan", pesanGalatApi(body) ?? "Coba lagi.");
      return;
    }
    setTersimpan(kirim);
    setPreviewKey((current) => current + 1);
    toast.success("Tersimpan", "Halaman acara publik langsung memakai isi baru.");
  }

  // ---- Isian per bagian ------------------------------------------------------------
  // Setiap bagian halaman punya isiannya sendiri, dibuka di bawah barisnya di
  // Susunan halaman. Kolom yang dulu tersebar di tab Isi dan Tampilan pindah ke
  // bagian tempat ia tampil, supaya admin mencari isian di tempat ia melihatnya.
  const gayaBanner = landing.banner_style ?? "theme";
  const tataLetak: LandingLayout = landing.layout ?? "editorial";
  const modern = tataLetak === "modern";
  // Teks yang tampil di halaman Indonesia tetapi belum punya versi English.
  const kurangEn = landingUntranslated({
    landing_config: { ...landing, sections },
    tagline: facts?.tagline,
    description: facts?.description,
    venue_address: facts?.venue_address,
  });
  // Baris Rundown dihitung hanya bila Susunan acara tampil, sama dengan teks lain.
  const agendaAktif = sections.some((section) => section.id === "agenda" && section.enabled);
  const rundownKurangEn = agendaAktif ? rundownBelumDiterjemahkan(rundownEn ?? []) : 0;
  const belumDiterjemahkan = kurangEn.length + rundownKurangEn;
  const barisKurangEn = new Set(kurangEn.map((teks) => teks.section));
  // Rundown gagal dimuat: jumlahnya tidak diketahui, jadi barisnya tetap ditandai.
  if (rundownKurangEn > 0 || (agendaAktif && rundownEn === null)) barisKurangEn.add("agenda");
  const modeEn = modern && bahasa === "en";
  // Bawaan huruf judul mengikuti tata letak; harus sama dengan halaman publik.
  const hurufJudul: LandingHeadingFont = landing.heading_font ?? (modern ? "source" : "serif");
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

  const isiPembuka = facts ? (
    <div className="flex flex-col gap-5">
      <Kelompok title="Isi" first>
        <TextField
          label="Nama acara di halaman publik"
          optional
          hint="Judul besar di hero, bilah atas, formulir, dan kartu tautan. Kosongkan untuk memakai nama acara di admin."
          maxLength={120}
          value={landing.public_name ?? ""}
          onChange={(event) => setLanding({ ...landing, public_name: event.target.value })}
        />
        <TextArea
          label="Tagline"
          optional
          rows={2}
          hint="Satu kalimat di bawah nama acara."
          value={facts.tagline ?? ""}
          onChange={(event) => patchFacts({ tagline: event.target.value })}
        />
      </Kelompok>

      {/* Bilah atas hanya ada di tata letak Modern; Editorial punya nav sendiri. */}
      {modern ? (
        <BilahAtasEditor
          value={landing.nav ?? {}}
          onChange={(nav) => setLanding({ ...landing, nav })}
          eventName={landing.public_name?.trim() || facts.name || "Nama acara"}
          disabled={busy}
        />
      ) : null}

      <Kelompok title="Ukuran" note="Dalam px, untuk layar lebar. Di ponsel mengecil otomatis.">
        <AngkaPx
          label="Ukuran nama acara"
          rentang={LANDING_HEADING_SIZE}
          value={landing.heading_size ?? JUDUL_PRESET_PX[landing.heading_scale ?? "lg"]}
          onChange={(value) => setLanding({ ...landing, heading_size: value })}
          hint="Nama yang panjang lebih rapi di 48 sampai 64. Di ponsel sekitar 60% dari angka ini."
        />
        <AngkaPx
          label="Tinggi hero"
          rentang={LANDING_HERO_HEIGHT_PX}
          value={landing.hero_min_height ?? HERO_PRESET_PX[landing.hero_height ?? "standard"]}
          onChange={(value) => setLanding({ ...landing, hero_min_height: value })}
          hint="Tidak pernah melebihi tinggi layar tamu, jadi tombol daftar tetap terlihat. Di ponsel 75% dari angka ini."
        />
      </Kelompok>

      <Kelompok title="Gambar latar (KV)">
        <ImageUploadField
          label="Gambar hero (KV)"
          kind="landing"
          fit="cover"
          previewClassName="h-20 w-36"
          hint="Rasio 16:9, minimal 1920×1080. Taruh bagian penting gambar di sisi atas atau kanan: judul berdiri di kiri bawah. PNG, JPG, atau WebP, maks 5 MB."
          value={landing.banner_url ?? null}
          onChange={(url) => setLanding({ ...landing, banner_url: url })}
          disabled={busy}
        />
        {/* Pilihan ini hanya muncul saat bannernya ada. Tanpa gambar, kedua
            opsi menghasilkan halaman yang sama persis, dan kontrol yang tidak
            mengubah apa pun membuat admin ragu apakah dirinya salah pakai. */}
        {landing.banner_url ? (
          <div>
            <p className="text-body-medium font-medium text-on-surface">Tampilan KV</p>
            <SegmentedButton
              className="mt-1.5 w-full"
              label="Tampilan KV"
              value={gayaBanner}
              onChange={(value) => setLanding({ ...landing, banner_style: value })}
              options={[
                { value: "theme", label: LANDING_BANNER_STYLE_LABELS.theme },
                { value: "photo", label: LANDING_BANNER_STYLE_LABELS.photo },
              ]}
            />
            <p className="mt-1.5 text-body-medium text-on-surface-variant">
              {gayaBanner === "theme"
                ? "Gambar dilebur ke warna halaman. Senada, tapi gambar berwarna pekat jadi pucat."
                : "Gambar tampil dengan warna aslinya. Bagian bawah diberi bayangan gelap dan teks hero jadi putih agar tetap terbaca."}
            </p>
          </div>
        ) : null}
      </Kelompok>

      <Kelompok title="Tombol">
        <TextField
          label="Teks tombol daftar"
          optional
          placeholder="Daftar sekarang"
          maxLength={40}
          counter
          value={landing.cta_label ?? ""}
          onChange={(event) => setLanding({ ...landing, cta_label: event.target.value })}
        />
      </Kelompok>

      <Kelompok title="Waktu" note="Juga dipakai berkas kalender dan email, bukan hanya halaman ini.">
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Jam mulai"
            optional
            type="time"
            value={jamInput(facts.start_time)}
            onChange={(event) => patchFacts({ start_time: event.target.value || null })}
          />
          <TextField
            label="Jam selesai"
            optional
            type="time"
            value={jamInput(facts.end_time)}
            onChange={(event) => patchFacts({ end_time: event.target.value || null })}
          />
        </div>
        <TextField
          label="Tanggal selesai"
          optional
          type="date"
          hint={`Isi hanya bila acara lebih dari satu hari. Tanggal mulai (${facts.event_date ?? "belum diisi"}) diatur di Pengaturan.`}
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
    const nyala = landingEyebrowShown(landing, id);
    const alis = landing[`${id}_eyebrow`] ?? "";
    const kunciJudul = id === "about" ? "about_heading" : (`${id}_heading` as const);
    const judul = landing[kunciJudul] ?? "";
    const buka = judulTerbuka === id;
    const ringkasan = `Label: ${nyala ? alis.trim() || LANDING_SECTION_LABELS[id] : "mati"} · Judul: ${judul.trim() || otomatis.jenis}`;
    return (
      <div className="flex flex-col gap-4 border-t border-outline-variant pt-2">
        <button
          type="button"
          aria-expanded={buka}
          onClick={() => setJudulTerbuka(buka ? null : id)}
          className="m3-state -mx-2 flex min-h-12 items-center gap-2 rounded-sm px-2 text-left"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body-medium font-semibold text-on-surface">Judul bagian</span>
            <span className="truncate text-body-small text-on-surface-variant">{ringkasan}</span>
          </span>
          <CaretDown size={14} aria-hidden className={cx("shrink-0 text-on-surface-variant transition-transform", buka && "rotate-180")} />
        </button>
        {buka ? (
          <>
            <Switch
              checked={nyala}
              onChange={(value) => setLanding({ ...landing, eyebrow_shown: { ...landing.eyebrow_shown, [id]: value } })}
              label="Label kecil di atas judul"
            />
            {/* Dimatikan: kolomnya disembunyikan, isinya tetap tersimpan. */}
            {nyala ? (
              <TextField
                label="Label kecil"
                optional
                placeholder={LANDING_SECTION_LABELS[id]}
                hint="Satu sampai tiga kata di atas judul."
                maxLength={LANDING_SECTION_TEXT_MAX.eyebrow}
                counter
                value={alis}
                onChange={(event) => setLanding({ ...landing, [`${id}_eyebrow`]: event.target.value })}
              />
            ) : null}
            <TextField
              label="Judul"
              placeholder={otomatis.judul}
              hint={otomatis.hint}
              maxLength={LANDING_SECTION_TEXT_MAX.heading}
              counter={{ ideal: 48 }}
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
  const KOSONG_BAWAAN = "Kosongkan untuk teks bawaan.";

  const isiTentang = facts ? (
    <div className="flex flex-col gap-4">
      <TextArea
        label="Deskripsi acara"
        optional
        rows={6}
        hint="Pisahkan paragraf dengan enter; jedanya ikut tampil."
        value={facts.description ?? ""}
        onChange={(event) => patchFacts({ description: event.target.value })}
      />
      {judulBagian("about", { judul: LANDING_SECTION_LABELS.about, jenis: "bawaan", hint: "Kalimat besar di samping deskripsi acara." })}
    </div>
  ) : null;

  const isiLokasi = facts ? (
    <div className="flex flex-col gap-4">
      <TextField
        label="Nama tempat"
        optional
        placeholder="mis. Grand Ballroom, Hotel Mulia"
        hint="Juga dipakai berkas kalender dan email."
        value={facts.venue_name ?? ""}
        onChange={(event) => patchFacts({ venue_name: event.target.value })}
      />
      <TextArea
        label="Alamat"
        optional
        rows={3}
        value={facts.venue_address ?? ""}
        onChange={(event) => patchFacts({ venue_address: event.target.value })}
      />
      <TextField
        label="Tautan peta"
        optional
        type="url"
        hint="Google Maps atau sejenisnya. Dibuka sebagai tautan, tidak disematkan, supaya halaman tamu tidak memuat skrip pihak ketiga."
        placeholder="https://maps.app.goo.gl/..."
        value={facts.venue_map_url ?? ""}
        onChange={(event) => patchFacts({ venue_map_url: event.target.value })}
      />
      {judulBagian(
        "venue",
        facts.venue_name?.trim()
          ? { judul: facts.venue_name.trim(), jenis: "otomatis (nama tempat)", hint: "Kosongkan untuk memakai nama tempat." }
          : { judul: LANDING_SECTION_LABELS.venue, jenis: "bawaan", hint: "Kosongkan untuk memakai nama tempat setelah diisi." },
      )}
    </div>
  ) : null;

  const isiAgenda = modern ? (
    <div className="flex flex-col gap-5">
      {judulBagian(
        "agenda",
        tanggalAcara
          ? { judul: tanggalAcara, jenis: "otomatis (tanggal)", hint: "Kosongkan untuk memakai tanggal acara." }
          : { judul: LANDING_SECTION_LABELS.agenda, jenis: "bawaan", hint: "Kosongkan untuk memakai tanggal acara setelah diisi." },
        <TextField
          label="Catatan"
          optional
          placeholder="Registrasi dibuka pukul 08.00 WIB."
          hint="Di bawah judul, di atas daftar sesi."
          maxLength={LANDING_SECTION_TEXT_MAX.intro}
          counter
          value={landing.agenda_note ?? ""}
          onChange={(event) => setLanding({ ...landing, agenda_note: event.target.value })}
        />,
      )}
      <Kelompok title="Kartu program" note="Kartu besar dari bagian-bagian Rundown, tampil di bawah Tentang.">
        <Switch
          checked={!landing.program_hidden}
          onChange={(value) => setLanding({ ...landing, program_hidden: !value })}
          label="Tampilkan kartu program"
          description="Matikan bila sesi utama sudah ditulis di blok Kartu bergambar, supaya tidak tampil dua kali."
        />
        {!landing.program_hidden ? (
          <>
            <TextField
              label="Judul bagian Program"
              optional
              placeholder="Program"
              hint="Bagian Program tampil bila Rundown punya dua bagian atau lebih."
              value={landing.program_heading ?? ""}
              onChange={(event) => setLanding({ ...landing, program_heading: event.target.value })}
            />
            <TextArea
              label="Pengantar Program"
              optional
              rows={2}
              value={landing.program_intro ?? ""}
              onChange={(event) => setLanding({ ...landing, program_intro: event.target.value })}
            />
            <div className="flex flex-col gap-3">
              <p className="text-body-medium font-medium text-on-surface">Keterangan kartu program</p>
              <p className="text-body-medium text-on-surface-variant">
                Urut sesuai bagian di Rundown: keterangan 1 untuk bagian pertama, dan seterusnya. Jam dan jumlah sesi diisi otomatis.
              </p>
              {catatanProgram.map((item, index) => (
                <div key={index} className="flex items-start gap-2">
                  <TextArea
                    className="min-w-0 flex-1"
                    label={`Keterangan program ${index + 1}`}
                    rows={2}
                    value={item}
                    onChange={(event) => { const next = [...catatanProgram]; next[index] = event.target.value; setCatatanProgram(next); }}
                  />
                  <IconButton size="sm" label={`Hapus keterangan ${index + 1}`} className="mt-6 text-error" onClick={() => hapusCatatanProgram(index)}>
                    <Trash size={16} />
                  </IconButton>
                </div>
              ))}
              <div>
                <Button variant="outlined" size="sm" icon={<Plus size={16} />} disabled={catatanProgram.length >= 10} onClick={() => setCatatanProgram([...catatanProgram, ""])}>Tambah keterangan</Button>
              </div>
            </div>
          </>
        ) : null}
      </Kelompok>
    </div>
  ) : null;

  const isiKaki = (
    <div className="flex flex-col gap-5">
      <Kelompok first>
        <TextArea
          label="Kalimat penyelenggara"
          optional
          rows={2}
          placeholder="Diselenggarakan oleh ..."
          hint={modern ? "Di bawah nama acara di kaki halaman. Kosong = tagline dan nama tempat." : "Tampil di tata letak Modern."}
          maxLength={180}
          counter
          value={landing.footer_note ?? ""}
          onChange={(event) => setLanding({ ...landing, footer_note: event.target.value })}
        />
      </Kelompok>
      {modern ? (
        <Kelompok title="Banner ajakan" note="Di atas kaki halaman, tampil selama pendaftaran terbuka dan tidak ada blok Pita ajakan.">
          <TextField
            label="Judul banner"
            optional
            placeholder="Amankan tempat Anda"
            value={landing.cta_heading ?? ""}
            onChange={(event) => setLanding({ ...landing, cta_heading: event.target.value })}
          />
          <TextArea
            label="Kalimat banner"
            optional
            rows={2}
            placeholder="mis. Pendaftaran perlu persetujuan panitia. Kode QR dikirim setelah disetujui."
            value={landing.cta_note ?? ""}
            onChange={(event) => setLanding({ ...landing, cta_note: event.target.value })}
          />
        </Kelompok>
      ) : null}
    </div>
  );

  // ---- Tema ----------------------------------------------------------------------
  const isiTema = (
    <div className="flex flex-col gap-5">
      <Kelompok title="Tata letak" first>
        <SegmentedButton<LandingLayout>
          className="w-full"
          label="Tata letak"
          value={tataLetak}
          onChange={(value) =>
            // Huruf judul yang belum pernah dipilih ikut disimpan saat pindah ke
            // Modern, supaya area peserta (yang membaca `heading_font`) memakai
            // huruf yang sama dengan halaman acara.
            setLanding({
              ...landing,
              layout: value,
              heading_font: landing.heading_font ?? (value === "modern" ? "source" : undefined),
            })
          }
          options={[
            { value: "editorial", label: LANDING_LAYOUT_LABELS.editorial },
            { value: "modern", label: LANDING_LAYOUT_LABELS.modern },
          ]}
        />
        <p className="text-body-medium text-on-surface-variant">
          {modern
            ? "KV selebar layar dengan nav gelap, kartu program dari Rundown, kartu pembicara tinggi, dan blok tambahan."
            : "Tenang dan tipografis: judul bagian di rel kiri, garis rambut sebagai pemisah. Blok tambahan tidak tampil di sini."}
        </p>
      </Kelompok>

      {/* Versi English. Teks English-nya diisi per kolom; sampai mode EN di
          editor ada, lewat Ekspor/Impor (kunci `en`, lihat landing-i18n.ts). */}
      <Kelompok title="Bahasa">
        <Switch
          checked={Boolean(landing.en_enabled)}
          onChange={(value) => setLanding({ ...landing, en_enabled: value })}
          disabled={!modern}
          label="Tampilkan versi English"
          description={
            !modern
              ? "Hanya untuk tata letak Modern."
              : landing.en_enabled
                ? "Pilihan ID | EN tampil di bilah atas halaman."
                : "Selama mati, halaman hanya berbahasa Indonesia dan alamat /en tidak bisa dibuka."
          }
        />
        {modern && landing.en_enabled ? (
          <div className="flex flex-col gap-2">
            <p id="label-bahasa-utama" className="text-body-medium font-medium text-on-surface">Bahasa utama</p>
            <SegmentedButton<"id" | "en">
              className="w-full"
              label="Bahasa utama"
              labelledBy="label-bahasa-utama"
              value={landing.default_lang ?? "id"}
              onChange={(value) => setLanding({ ...landing, default_lang: value })}
              options={[
                { value: "id", label: "Indonesia" },
                { value: "en", label: "English" },
              ]}
            />
            <p className="text-body-medium text-on-surface-variant">
              {(landing.default_lang ?? "id") === "en"
                ? `/e/${facts?.slug ?? "slug"} tampil dalam English. Versi Indonesia di /e/${facts?.slug ?? "slug"}/id.`
                : `/e/${facts?.slug ?? "slug"} tampil dalam Bahasa Indonesia. Versi English di /e/${facts?.slug ?? "slug"}/en.`}{" "}
              Alamat di undangan dan QR tidak berubah.
              {(landing.default_lang ?? "id") === "en"
                ? " Tamu yang memindai QR atau membuka tautan undangan melihat versi English lebih dulu. Tautan /en yang sudah dibagikan dialihkan ke alamat utama."
                : null}
            </p>
          </div>
        ) : null}
        {modern && belumDiterjemahkan > 0 ? (
          <p className="text-body-medium text-on-surface-variant">
            {belumDiterjemahkan} teks belum diterjemahkan. Halaman English menampilkan teks Indonesianya.{" "}
            <button type="button" onClick={() => pilihBahasa("en")} className="rounded-sm font-medium text-primary hover:underline">
              Terjemahkan di Susunan halaman
            </button>
          </p>
        ) : null}
      </Kelompok>

      <Kelompok title="Huruf judul" note="Dipakai untuk nama acara dan judul bagian. Isi halaman tetap memakai huruf yang mudah dibaca.">
        <div role="radiogroup" aria-label="Huruf judul" className="flex flex-col gap-2">
          {(Object.keys(LANDING_HEADING_FONTS) as LandingHeadingFont[]).map((key) => {
            const font = LANDING_HEADING_FONTS[key];
            const pilih = hurufJudul === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={pilih}
                onClick={() => setLanding({ ...landing, heading_font: key })}
                className={`m3-state flex min-h-16 flex-col items-start gap-0.5 rounded-md border px-4 py-3 text-left ${
                  pilih ? "border-primary bg-primary-container/40 ring-1 ring-primary" : "border-outline-variant"
                }`}
              >
                <span className="text-title-large font-semibold text-on-surface" style={{ fontFamily: font.cssVar }}>
                  {landing.public_name?.trim() || facts?.name || "Nama acara"}
                </span>
                <span className="text-body-small text-on-surface-variant">
                  {font.label} <MetaSeparator /> {font.note}
                </span>
              </button>
            );
          })}
        </div>
      </Kelompok>

      <Kelompok title="Warna" note="Satu warna; sisanya diturunkan otomatis supaya teks tetap terbaca.">
        <PilihWarna
          label="Warna merek"
          value={landing.theme?.seed ?? DEFAULT_REGISTRATION_SEED}
          onChange={(value) => setLanding({ ...landing, theme: { seed: value } })}
        />
        {/* Saklar warna formulir tinggal DI SINI, bukan di CMS Registrasi.
            Warna acara punya satu sumber; kontrol yang tersebar di dua layar
            akan berbeda isinya dan tidak ada yang tahu mana yang menang. */}
        <Switch
          checked={!formInherit}
          onChange={(value) => setFormInherit(!value)}
          label="Formulir pendaftaran pakai warna berbeda"
          description={formInherit
            ? "Halaman pendaftaran memakai warna merek di atas, jadi tamu tidak berpindah identitas visual."
            : "Halaman pendaftaran memakai warnanya sendiri. Dua warna dalam dua ketukan berurutan terbaca seperti pindah ke situs lain."}
        />
        {!formInherit ? <PilihWarna label="Warna formulir" value={formSeed} onChange={setFormSeed} /> : null}
      </Kelompok>
    </div>
  );

  // ---- Bagian --------------------------------------------------------------------
  function editorBagian(id: LandingSectionId): ReactNode {
    switch (id) {
      case "highlights": {
        const list = landing.highlights ?? [];
        const setList = (next: typeof list) => setLanding({ ...landing, highlights: next });
        return (
          <div className="flex flex-col gap-3">
            {list.length === 0 ? <p className="text-body-medium text-on-surface-variant">Belum ada angka.</p> : null}
            {list.map((item, index) => (
              <div key={index} className="flex items-end gap-2">
                <TextField
                  className="min-w-0 flex-1"
                  label="Keterangan"
                  placeholder="mis. Peserta"
                  value={item.label}
                  onChange={(event) => { const next = [...list]; next[index] = { ...next[index], label: event.target.value }; setList(next); }}
                />
                <TextField
                  className="w-24"
                  label="Angka"
                  value={item.value}
                  onChange={(event) => { const next = [...list]; next[index] = { ...next[index], value: event.target.value }; setList(next); }}
                />
                <IconButton size="sm" label={`Hapus angka ${index + 1}`} className="text-error" onClick={() => setList(list.filter((_, position) => position !== index))}>
                  <Trash size={16} />
                </IconButton>
              </div>
            ))}
            <div>
              <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setList([...list, { label: "", value: "" }])}>Tambah angka</Button>
            </div>
          </div>
        );
      }
      case "faq": {
        const list = landing.faq ?? [];
        const setList = (next: typeof list) => setLanding({ ...landing, faq: next });
        return (
          <div className="flex flex-col gap-3">
            {list.length === 0 ? <p className="text-body-medium text-on-surface-variant">Belum ada pertanyaan.</p> : null}
            {list.map((item, index) => (
              <div key={index} className="flex flex-col gap-3 rounded-md border border-outline-variant p-3">
                <div className="flex items-end gap-2">
                  <TextField
                    className="min-w-0 flex-1"
                    label="Pertanyaan"
                    value={item.q}
                    onChange={(event) => { const next = [...list]; next[index] = { ...next[index], q: event.target.value }; setList(next); }}
                  />
                  <IconButton size="sm" label={`Hapus pertanyaan ${index + 1}`} className="text-error" onClick={() => setList(list.filter((_, position) => position !== index))}>
                    <Trash size={16} />
                  </IconButton>
                </div>
                <TextArea
                  label="Jawaban"
                  rows={3}
                  value={item.a}
                  onChange={(event) => { const next = [...list]; next[index] = { ...next[index], a: event.target.value }; setList(next); }}
                />
              </div>
            ))}
            <div>
              <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setList([...list, { q: "", a: "" }])}>Tambah pertanyaan</Button>
            </div>
            {judulBagian(
              "faq",
              { judul: LANDING_UI.id.faqHeading, jenis: "bawaan", hint: KOSONG_BAWAAN },
              <TextArea
                label="Pengantar"
                optional
                rows={2}
                placeholder={LANDING_UI.id.faqIntro}
                hint="Bila bagian Kontak tampil, kalimat “Hubungi panitia…” ditambahkan di belakangnya."
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
              Paling banyak 8 pembicara tampil sekaligus di tab Sorotan (yang ditonjolkan lebih dulu). Sisanya dibuka per sesi lewat tab. Tanpa foto, inisial nama dipakai.
            </p>
            {list.length === 0 ? <p className="text-body-medium text-on-surface-variant">Belum ada pembicara.</p> : null}
            {list.map((speaker, index) => (
              <div key={index} className="flex flex-col gap-3 rounded-md border border-outline-variant p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                  <ImageUploadField
                    label={`Foto pembicara ${index + 1}`}
                    kind="landing"
                    fit="cover"
                    previewClassName="size-16 rounded-full"
                    hint="Persegi, minimal 400×400."
                    value={speaker.photo_url ?? null}
                    disabled={busy}
                    onChange={(url) => ubah(index, { photo_url: url })}
                  />
                  </div>
                  <IconButton size="sm" label={`Hapus pembicara ${index + 1}`} className="text-error" onClick={() => setList(list.filter((_, position) => position !== index))}>
                    <Trash size={16} />
                  </IconButton>
                </div>
                <TextField label="Nama" value={speaker.name} onChange={(event) => ubah(index, { name: event.target.value })} />
                <TextField
                  label="Jabatan"
                  optional
                  placeholder="mis. Direktur Utama"
                  value={speaker.title ?? ""}
                  onChange={(event) => ubah(index, { title: event.target.value })}
                />
                <TextField
                  label="Instansi"
                  optional
                  placeholder="mis. Bank Indonesia"
                  hint="Tampil di bawah jabatan, berwarna utama."
                  value={speaker.company ?? ""}
                  onChange={(event) => ubah(index, { company: event.target.value })}
                />
                <TextField
                  label="Peran"
                  optional
                  placeholder="mis. Moderator"
                  value={speaker.role ?? ""}
                  onChange={(event) => ubah(index, { role: event.target.value })}
                />
                <TextField
                  label="Sesi"
                  optional
                  placeholder="mis. Sesi 1"
                  hint="Pembicara bersesi sama menjadi satu tab. Tulis sama dengan awal judul sesi di rundown supaya jam sesinya ikut tampil."
                  value={speaker.session ?? ""}
                  onChange={(event) => {
                    // Terjemahan ikut nama sesinya: pindah sesi berarti memakai
                    // terjemahan sesi tujuan (kalau sudah ada), bukan membawa yang lama.
                    // Sesi yang masih dipakai pembicara lain memakai terjemahan yang
                    // tampil di editor sekarang. Ingatan hanya untuk nama yang sempat
                    // tidak dipakai siapa pun, dan ikut mengingat terjemahan kosong.
                    const lama = speaker.session?.trim();
                    if (lama) terjemahanSesi.current.set(lama, speaker.en?.session ?? "");
                    const baru = event.target.value.trim();
                    const lain = list.filter((_, posisi) => posisi !== index);
                    const dipakai = lain.some((s) => s.session?.trim() === baru);
                    ubah(index, {
                      session: event.target.value,
                      en: {
                        ...speaker.en,
                        session: dipakai ? landingSessionEn(lain, baru) : terjemahanSesi.current.get(baru) || undefined,
                      },
                    });
                  }}
                />
                <Switch
                  checked={Boolean(speaker.featured)}
                  onChange={(value) => ubah(index, { featured: value })}
                  label="Tonjolkan"
                  description="Masuk tab Sorotan (paling banyak 8), untuk pejabat sambutan atau pembicara utama."
                />
                <div className="flex gap-1">
                  <IconButton size="sm" label={`Naikkan pembicara ${index + 1}`} disabled={index === 0} onClick={() => { const next = [...list]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setList(next); }}>
                    <ArrowUp size={16} />
                  </IconButton>
                  <IconButton size="sm" label={`Turunkan pembicara ${index + 1}`} disabled={index === list.length - 1} onClick={() => { const next = [...list]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setList(next); }}>
                    <ArrowDown size={16} />
                  </IconButton>
                </div>
              </div>
            ))}
            <div>
              <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setList([...list, { name: "" }])}>Tambah pembicara</Button>
            </div>
            {judulBagian(
              "speakers",
              lembaga >= 3
                ? { judul: LANDING_UI.id.speakersFrom(pembicaraIsi.length, lembaga), jenis: "otomatis (jumlah)", hint: "Kosongkan untuk memakai jumlah pembicara dan lembaga." }
                : { judul: LANDING_SECTION_LABELS.speakers, jenis: "bawaan", hint: "Kosongkan untuk teks bawaan. Dari tiga lembaga, jumlah pembicara dipakai." },
            )}
          </div>
        );
      }
      case "sponsors": {
        const list = landing.sponsors ?? [];
        return (
          <div className="flex flex-col gap-3">
            <p className="text-body-medium text-on-surface-variant">Ditampilkan sebagai kisi berukuran sama, apa pun urutan unggahnya.</p>
            {list.length === 0 ? <p className="text-body-medium text-on-surface-variant">Belum ada sponsor.</p> : null}
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
                  label="Nama"
                  optional
                  hint="Teks alternatif gambar, tidak ditampilkan."
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
              <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setLanding({ ...landing, sponsors: [...list, { logo_url: "" }] })}>Tambah sponsor</Button>
            </div>
          </div>
        );
      }
      case "contact":
        return (
          <div className="flex flex-col gap-3">
            <TextField label="Nama" optional value={landing.contact_name ?? ""} onChange={(event) => setLanding({ ...landing, contact_name: event.target.value })} />
            <TextField label="Telepon" optional value={landing.contact_phone ?? ""} onChange={(event) => setLanding({ ...landing, contact_phone: event.target.value })} />
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
  const anggota: LandingMemberConfig = landing.member ?? { enabled: false };
  const setAnggota = (patch: Partial<LandingMemberConfig>) =>
    setLanding({ ...landing, member: { ...anggota, ...patch } });
  const isiPeserta = (
    <div className="flex flex-col gap-5">
      <Kelompok title="Area peserta" first>
        <Switch
          checked={anggota.enabled}
          onChange={(value) => setAnggota({ enabled: value })}
          label="Buka area peserta"
          description="Tombol Masuk tampil di halaman acara. Peserta masuk dengan email pendaftaran dan kata sandi yang mereka buat sendiri dengan kode peserta."
        />
      </Kelompok>
      {anggota.enabled ? (
        <>
          <Kelompok title="Siapa yang bisa masuk">
            <div role="radiogroup" aria-label="Siapa yang bisa masuk" className="flex flex-col gap-2">
              {(Object.keys(LANDING_MEMBER_AUDIENCE_LABELS) as LandingMemberAudience[]).map((key) => {
                const pilih = (anggota.audience ?? "approved") === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={pilih}
                    onClick={() => setAnggota({ audience: key })}
                    className={`m3-state flex min-h-12 flex-col items-start gap-0.5 rounded-md border px-4 py-2.5 text-left ${
                      pilih ? "border-primary bg-primary-container/40 ring-1 ring-primary" : "border-outline-variant"
                    }`}
                  >
                    <span className="text-body-medium font-medium text-on-surface">{LANDING_MEMBER_AUDIENCE_LABELS[key]}</span>
                    <span className="text-body-small text-on-surface-variant">
                      {key === "approved"
                        ? "Dari Pendaftaran publik dengan status disetujui."
                        : "Termasuk peserta impor, selama datanya punya email."}
                    </span>
                  </button>
                );
              })}
            </div>
          </Kelompok>
          <Kelompok title="Yang tampil di area peserta">
            <Switch checked={anggota.show_code !== false} onChange={(value) => setAnggota({ show_code: value })} label="Kode QR dan kode peserta" description="Untuk registrasi di pintu masuk." />
            <Switch checked={anggota.show_seat !== false} onChange={(value) => setAnggota({ show_seat: value })} label="Kursi" description="Dari Denah kursi." />
            <Switch checked={anggota.show_schedule !== false} onChange={(value) => setAnggota({ show_schedule: value })} label="Susunan acara" description="Dari Rundown acara." />
            <Switch checked={anggota.show_vote !== false} onChange={(value) => setAnggota({ show_vote: value })} label="Voting langsung" description="Kode peserta terisi otomatis di halaman voting." />
            <TextField
              label="Tautan formulir umpan balik"
              optional
              type="url"
              placeholder="https://"
              hint="Kosongkan bila tidak ada. Dibuka di tab baru."
              value={anggota.feedback_url ?? ""}
              onChange={(event) => setAnggota({ feedback_url: event.target.value })}
            />
          </Kelompok>
          <Banner tone="info" icon={<Info size={18} />}>
            Belum ada email aktivasi. Peserta membuat kata sandi sendiri di halaman Masuk dengan email pendaftaran dan kode peserta dari email konfirmasi atau undangan. Peserta tanpa email di datanya belum bisa masuk.
          </Banner>
        </>
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
      pesan: ids.length === 1 ? "Blok dihapus. Berlaku saat Simpan." : `${ids.length} blok dihapus. Berlaku saat Simpan.`,
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
    nomor: number;
    judul: string;
    sub?: string | null;
    lencana?: string | null;
    saklar?: { checked: boolean; onChange: (value: boolean) => void };
    /** Posisi di `sections`; kosong untuk Pembuka dan Kaki yang tidak bisa dipindah. */
    indeks?: number;
    isi: ReactNode;
    menu?: ItemMenuBlok[];
    /** Mode EN: baris ini masih punya teks yang belum diterjemahkan. */
    titik?: boolean;
  }) {
    const buka = terbuka === id;
    const tersembunyi = saklar ? !saklar.checked : false;
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
              title="Seret untuk memindah"
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
            aria-controls={`isi-${id}`}
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
            {titik ? <span className="sr-only">Ada teks yang belum diterjemahkan.</span> : null}
            {sub ? (
              <span title={sub} className="block truncate text-body-small text-on-surface-variant">
                {tersembunyi ? `${sub} · tersembunyi` : sub}
              </span>
            ) : null}
          </button>
          {titik ? (
            <span className="mr-2 size-2 shrink-0 rounded-full bg-warning" title="Ada teks yang belum diterjemahkan" aria-hidden />
          ) : null}
          {lencana ? <StatusChip tone="warning" className="shrink-0">{lencana}</StatusChip> : null}
          {saklar ? (
            <IconButton
              size="sm"
              className="size-10!"
              label={saklar.checked ? `Sembunyikan ${judul}` : `Tampilkan ${judul}`}
              onClick={() => saklar.onChange(!saklar.checked)}
            >
              {saklar.checked ? <Eye size={20} /> : <EyeSlash size={20} />}
            </IconButton>
          ) : null}
          {menu ? <MenuBlok label={`Menu blok: ${judul}`} items={menu} /> : null}
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
      { label: "Naikkan", icon: <ArrowUp size={18} />, disabled: index === 0, onSelect: () => moveSection(index, -1) },
      { label: "Turunkan", icon: <ArrowDown size={18} />, disabled: index === sections.length - 1, onSelect: () => moveSection(index, 1) },
    ];
    if (blok) {
      items.push({ label: "Duplikat", icon: <CopySimple size={18} />, disabled: (landing.blocks ?? []).length >= 30, onSelect: () => duplikatBlok(index, blok) });
    }
    items.push({
      label: tampil ? "Sembunyikan" : "Tampilkan",
      icon: tampil ? <EyeSlash size={18} /> : <Eye size={18} />,
      onSelect: () => setTampil(index, !tampil),
    });
    if (blok) {
      items.push({ label: "Hapus blok…", icon: <Trash size={18} />, bahaya: true, onSelect: () => setKonfirmasiHapus({ ids: [blok.id], judul }) });
    }
    return items;
  }

  const blokById = new Map((landing.blocks ?? []).map((block) => [block.id, block]));

  function subBawaan(id: LandingSectionId): string {
    switch (id) {
      case "about": return "Teks · dari deskripsi acara";
      case "agenda": return "Bawaan · dari Rundown acara";
      case "venue": return "Nama tempat, alamat, peta";
      case "speakers": return `Bawaan · ${JUMLAH.speakers ?? 0} pembicara`;
      case "faq": return `Bawaan · ${JUMLAH.faq ?? 0} pertanyaan`;
      case "highlights": return `Bawaan · ${JUMLAH.highlights ?? 0} angka`;
      case "sponsors": return `Bawaan · ${JUMLAH.sponsors ?? 0} logo`;
      case "contact": return "Nama, telepon, email";
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
        {id === "agenda" ? <p className="text-body-medium text-on-surface-variant">Sesi diambil otomatis dari Rundown acara. Bagian ini tidak tampil selama Rundown kosong.</p> : null}
        {tautanSumber}
        {isi}
      </>
    );
  }

  // Blok tambahan yang tersembunyi: satu-satunya yang bisa dihapus massal.
  // Bagian bawaan (Pembicara, FAQ, ...) hanya bisa disembunyikan.
  const tersembunyi = sections.filter((section) => !section.enabled);
  const blokTersembunyi = tersembunyi.filter((section) => isLandingBlockId(section.id) && blokById.has(section.id)).map((section) => section.id);

  // Mode EN: baris yang sama dalam urutan yang sama, tetapi hanya yang tampil di
  // halaman, tanpa seret, mata, dan menu; isinya kolom English (editor-en.tsx).
  const isiSusunanEn = facts ? (
    <div className="flex flex-col">
      <ol className="flex flex-col">
        {barisSusunan({ id: "pembuka", nomor: 1, judul: "Pembuka", sub: "Nama acara, tagline, tombol daftar", titik: barisKurangEn.has("pembuka"), isi: <BagianEn id="pembuka" landing={landing} facts={facts} setLanding={setLanding} /> })}
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
            judul: LANDING_SECTION_LABELS[id],
            sub: subBawaan(id),
            titik: barisKurangEn.has(id),
            isi: <BagianEn id={id} landing={landing} facts={facts} setLanding={setLanding} rundown={rundownEn} ubahRundown={ubahRundown} />,
          });
        })}
        {barisSusunan({ id: "kaki", nomor: sections.length + 2, judul: "Kaki halaman", sub: "Kalimat penyelenggara, banner ajakan", titik: barisKurangEn.has("kaki"), isi: <BagianEn id="kaki" landing={landing} facts={facts} setLanding={setLanding} /> })}
      </ol>
    </div>
  ) : null;

  const isiSusunan = facts ? (
    <div className="flex flex-col">
      {!modern ? (
        <div className="px-4 py-2">
          <Banner tone="info">Blok tambahan hanya tampil di tata letak Modern. Pilih Modern di tab Tema untuk memakainya.</Banner>
        </div>
      ) : null}
      <ol className="flex flex-col">
        {barisSusunan({ id: "pembuka", nomor: 1, judul: "Pembuka", sub: modern ? "Bilah atas, nama acara, tagline, KV, tombol daftar" : "Nama acara, tagline, KV, tombol daftar", isi: isiPembuka })}
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
              lencana: section.enabled && !landingBlockHasContent(blok) ? "Belum ada isinya" : null,
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
            judul: LANDING_SECTION_LABELS[id],
            sub: subBawaan(id),
            lencana: kosong ? (id === "agenda" ? "Rundown kosong" : "Belum ada isinya") : null,
            saklar,
            indeks: index,
            menu: menuBaris(index, LANDING_SECTION_LABELS[id]),
            isi: isiBawaan(id),
          });
        })}
        {barisSusunan({
          id: "kaki",
          nomor: sections.length + 2,
          judul: "Kaki halaman",
          sub: modern ? "Kalimat penyelenggara, banner ajakan" : "Kalimat penyelenggara",
          isi: isiKaki,
        })}
      </ol>
      <div className="px-4 py-4">
        <Button variant="outlined" icon={<Plus size={18} />} onClick={() => setTambahTerbuka(true)} disabled={(landing.blocks ?? []).length >= 30}>
          Tambah blok
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
      label="Bahasa yang disunting"
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
        {belumDiterjemahkan > 0 ? `${belumDiterjemahkan} teks belum diterjemahkan` : "Semua teks sudah diterjemahkan"}
      </p>
    </div>
  ) : (
    <div className={cx("flex h-12 shrink-0 items-center gap-1 border-b border-outline-variant pr-2", pilihanBahasa ? "pl-3" : "pl-4")}>
      {pilihanBahasa}
      {/* Dengan pilihan ID | EN, petunjuknya tidak muat di panel 440: ia
          disembunyikan, dan ruangnya hanya mendorong penyaring ke kanan. */}
      <p
        className={cx("min-w-0 flex-1 truncate text-body-small text-on-surface-variant max-sm:hidden", pilihanBahasa && "invisible")}
        title="Urutan di sini sama dengan urutan di halaman, dari atas ke bawah. Klik baris untuk menyunting; pratinjau melompat ke bagian itu. Seret pegangan di kiri baris untuk memindah."
      >
        Klik untuk menyunting
      </p>
      {tersembunyi.length > 0 ? (
        <>
          <FilterChip selected={tampilTersembunyi} onClick={() => setTampilTersembunyi((nilai) => !nilai)} className="shrink-0">
            Tampilkan {tersembunyi.length} tersembunyi
          </FilterChip>
          <MenuBlok
            label="Menu blok tersembunyi"
            width={272}
            items={[{
              label: blokTersembunyi.length > 0 ? `Hapus ${blokTersembunyi.length} blok tersembunyi…` : "Tak ada blok untuk dihapus",
              icon: <Trash size={18} />,
              bahaya: true,
              disabled: blokTersembunyi.length === 0,
              onSelect: () => setKonfirmasiHapus({ ids: blokTersembunyi, judul: "" }),
            }]}
          />
        </>
      ) : null}
    </div>
  );

  const panel = (
    <Pane as="aside" id="panel-setelan" aria-label="Setelan halaman acara">
      <div className="flex h-12 shrink-0 items-center border-b border-outline-variant px-3">
        <SegmentedButton<Bagian>
          label="Bagian setelan"
          panel="isi-setelan"
          value={bagian}
          onChange={setBagian}
          className="w-full"
          options={[{ value: "susunan", label: "Susunan halaman" }, { value: "tema", label: "Tema" }, { value: "peserta", label: "Peserta" }]}
        />
      </div>
      {/* Satu tabpanel memuat baris saringan dan isinya, supaya Tab sesudah
          daftar tab langsung masuk ke panel yang dipilih (pola tabs WAI-ARIA). */}
      <div id="isi-setelan" role="tabpanel" aria-labelledby={segmentTabId("isi-setelan", bagian)} className="flex min-h-0 flex-1 flex-col">
        {saringan}
        {/* scroll-pt: field yang difokus dengan Tab tidak boleh tertutup kepala baris yang menempel (72px).
            Tema dan Peserta bisa dimulai dengan teks biasa, jadi bidang gulirnya sendiri
            ikut menerima fokus agar bisa digulir dengan papan ketik. */}
        <PaneBody
          key={`${bagian}-${modeEn ? "en" : "id"}`}
          tabIndex={bagian === "susunan" ? undefined : 0}
          role={bagian === "susunan" ? undefined : "group"}
          aria-labelledby={bagian === "susunan" ? undefined : segmentTabId("isi-setelan", bagian)}
          // `!`: aturan :focus-visible global tidak berlapis, jadi mengalahkan utilitas biasa.
          className={bagian === "susunan" ? "scroll-pt-22" : "px-4 py-4 focus-visible:shadow-none! focus-visible:-outline-offset-2!"}>
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

  const jumlahHapus = konfirmasiHapus?.ids.length ?? 0;

  return (
    // Tidak memakai `WorkspacePage fill`: pada layar pendek (laptop berskala
    // 150%) `fill` melepas kunci tinggi dan halaman bergulir. Editor ini selalu
    // setinggi layar; pratinjau dan panel setelan masing-masing bergulir sendiri.
    // Judul, aksi, dan Simpan ada di bilah atas, jadi tidak ada kepala halaman
    // yang memakan tinggi di sini.
    <main className="flex w-full flex-col gap-4 bg-surface p-4 text-on-surface lg:h-[calc(100dvh-var(--workspace-top,58px))] lg:overflow-hidden">
      <AdminBarPortal
        judul={
          <div className="flex min-w-0 shrink items-baseline gap-3">
            <h1 className="truncate text-title-medium font-semibold text-on-surface">Halaman acara</h1>
            {facts ? (
              <span className="hidden truncate text-body-small text-on-surface-variant xl:inline" title="Alamat yang dicetak di undangan dan QR">
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
                Ekspor
              </Button>
              <Button variant="text" size="sm" icon={<UploadSimple size={16} />} onClick={() => pilihBerkas.current?.click()}>
                Impor
              </Button>
              <input ref={pilihBerkas} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void impor(event)} />
              <ButtonLink href={`/e/${facts.slug}`} target="_blank" rel="noreferrer" variant="outlined" size="sm" icon={<ArrowSquareOut size={16} />}>
                Lihat halaman
              </ButtonLink>
            </span>
            <span aria-hidden className="mx-1 hidden h-7 w-px bg-outline-variant md:block" />
            <span role="status" className="hidden min-w-[7.5rem] items-center justify-end gap-1.5 whitespace-nowrap text-body-small text-on-surface-variant md:inline-flex">
              <span aria-hidden className={cx("size-2 rounded-full", berubah ? "bg-warning" : "bg-success")} />
              {berubah ? "Belum disimpan" : "Tersimpan"}
            </span>
            <Button simpan size="sm" onClick={() => void save()} loading={busy}>Simpan</Button>
          </>
        ) : null}
      />

      {error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : null}

      {facts ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-0">
          <div className="flex min-h-[70vh] min-w-0 flex-1 flex-col *:flex-1 lg:min-h-0">
            <LandingPreview slug={facts.slug} reloadKey={previewKey} sorot={sorot} draf={drafPratinjau} bahasa={modeEn && bagian === "susunan" ? "en" : "id"} onBahasa={pilihBahasa} />
          </div>
          <div
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label="Lebar panel setelan"
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
            title="Seret untuk mengubah lebar panel. Klik dua kali untuk lebar bawaan."
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
        title={jumlahHapus > 1 ? `Hapus ${jumlahHapus} blok tersembunyi?` : `Hapus “${konfirmasiHapus?.judul || "blok ini"}”?`}
        description={
          jumlahHapus > 1
            ? `Isi ${jumlahHapus} blok ini ikut terhapus. Bagian bawaan yang tersembunyi tetap ada. Baru berlaku saat Anda menekan Simpan, dan sebelum itu masih bisa diurungkan.`
            : "Isi blok ini ikut terhapus. Baru berlaku saat Anda menekan Simpan, dan sebelum itu masih bisa diurungkan."
        }
        actions={
          <>
            <Button variant="text" onClick={() => setKonfirmasiHapus(null)}>Batal</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (konfirmasiHapus) hapusBlok(konfirmasiHapus.ids);
                setKonfirmasiHapus(null);
              }}
            >
              {jumlahHapus > 1 ? `Hapus ${jumlahHapus} blok` : "Hapus blok"}
            </Button>
          </>
        }
      />

      {urungan ? (
        <div role="status" className="fixed bottom-4 left-1/2 z-popover flex -translate-x-1/2 items-center gap-2 rounded-sm bg-inverse-surface py-1.5 pl-4 pr-1.5 text-body-medium text-inverse-on-surface shadow-level3">
          <span>{urungan.pesan}</span>
          <button type="button" onClick={urungkan} className="h-9 rounded-sm px-3 font-medium text-inverse-primary hover:bg-white/10">
            Urungkan
          </button>
        </div>
      ) : null}
    </main>
  );
}
