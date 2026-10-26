"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowSquareOut, ArrowUp, Bus as IkonBus, DotsSixVertical, Info, Plus, Stack, Trash, UploadSimple, UsersThree, Warning } from "@phosphor-icons/react";
import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { keInputWaktu } from "@/components/admin/logistik/bersama";
import Link from "@/components/event-link";
import { useToast } from "@/components/toast";
import { normalizeBranding } from "@/lib/branding";
import { cx } from "@/lib/m3/cx";
import { DEFAULT_HEADER, formatClock, type RundownHeader, type RundownItem, type RundownSection } from "@/lib/rundown";
import { eventApiPath } from "@/lib/event-url";
import { hrefTrip, jamBerangkatBaru, kalimatHapus, kapanBerangkat, selisihMenit, type TripTertaut } from "@/lib/logistik/trip-agenda";
import type { EventTimeZone } from "@/lib/timezone";
import { bacaSasaran, type KolomSasaran, type SasaranBagian } from "@/lib/sasaran-bagian";
import { OUTFIT_MAX, alasanDaftarOutfit, cekDaftarOutfit, labelOutfit, labelTabOutfit, tabTerlihatOutfit, type OutfitEntry } from "@/lib/outfit";
import { FOTO_OUTFIT_SALAH, fotoOutfitSah, unggahFotoOutfit } from "@/lib/outfit-foto";
import { bacaOutfitSetiapHari, setiapHariDiTab, type OutfitSetiapHari } from "@/lib/outfit-setiap-hari";
import { bandingkanBagian, bandingkanBaris, geserBagian, geserDalamSlot, kunciSlot, pindahDalamSlot, susunUlangBagian, susunUlangSlot, urutBagianMenurutTanggal } from "@/lib/rundown-urutan";
import { plural } from "@/lib/plural";
import { useEventTimeZone } from "@/lib/use-event-timezone";
import {
  Banner, Button, ButtonLink, Dialog, EmptyState, FilterChip, ListRow, MetaSeparator, PageLoading, Pane, PaneBody, PaneFooter, PaneHeader,
  SegmentedButton, SelectMenu, StatusChip, SupportingPane, Switch, Tabs, TextField, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";
import { FieldMessages } from "@/components/m3/text-field";
import { Kelompok } from "@/components/admin/compact-form";
import { teksPolos } from "@/lib/landing-teks-kaya";
import { RichDetailsField } from "@/components/admin/rich-details-field";
import {
  adaBeda, drafBaruBerubah, formTerbuka, judulBuang, keteranganBuang, kunciForm, lapisanSisa, sisaSunting, type DrafBaru, type FormAgenda, type Panel,
} from "@/lib/agenda-simpan-aman";
import { useJagaNavigasi } from "@/lib/jaga-navigasi";
import { bacaSyaratBaris } from "@/lib/sasaran-baris";
import { KelompokSiapaMelihat, ringkasSyarat, syaratLengkap, syaratMati, type DrafSyarat, type InfoSiapaMelihat } from "./siapa-melihat";
import {
  BarisDresscode, CatatanDresscodeBaris, EditorDresscode, bannerDresscode, drafKurang, kartuBaru, keDraf, keKiriman, keteranganTersimpan, ringkasDresscode, samaDraf, urutDraf,
  type BarisDc, type DrafDresscode,
} from "./editor-dresscode";

// CMS rundown acara. Supporting pane: jadwal bagian aktif di panel utama,
// penyunting di panel kanan (baris terpilih, setelan bagian, header publik).
//
// Bentuknya daftar, bukan kanvas: rundown adalah urutan waktu, dan satu-satunya
// tata letak yang benar adalah dari jam paling awal ke paling akhir. Karena itu
// tidak ada drag-and-drop bebas di sini: urutan dihitung dari jam mulai, sehingga
// admin yang mengetik jam yang benar tidak perlu lagi menyusun ulang barisnya.
// Pengecualiannya baris berjam mulai sama (sesi paralel): urutan di dalam slot
// itu disimpan di `sort_order` dan diatur admin lewat pegangan geser atau tombol
// Move up/Move down. Baris berjam unik tidak punya pegangan, karena menggesernya
// ke luar slot jamnya akan membuat jadwal berbohong.

/**
 * Baris di CMS. `bus_trips`: trip bus yang ditautkan ke baris ini di Logistics
 * (tidak ada = tanpa tautan). Tautannya disunting di sana; di sini hanya chip
 * Bus, catatan di Edit item, dan kalimat di dialog hapus.
 */
type ItemAgenda = RundownItem & { bus_trips?: TripTertaut[] };

type Payload = { sections: RundownSection[]; items: ItemAgenda[]; event_dates?: { start: string | null; end: string | null } };

const EMPTY_DRAFT: DrafBaru = { start_time: "", end_time: "", title: "", subtitle: "", is_break: false };

/** Kolom yang disunting di Edit item dan Section. Lapisan suntingan hanya memuat yang diubah. */
type IsiBaris = Pick<RundownItem, "start_time" | "end_time" | "title" | "subtitle" | "is_break" | "is_published">;
type IsiBagian = Pick<RundownSection, "name" | "event_date" | "highlight_current" | "is_published">;

/** Permintaan yang tidak mendapat jawaban sama sekali. */
const PUTUS = "Connection lost. Try again.";

/** Salinan tanpa satu kunci; objek yang sama bila kuncinya memang tidak ada. */
function tanpa<T>(isi: Record<number, T>, kunci: number): Record<number, T> {
  if (!(kunci in isi)) return isi;
  const sisa = { ...isi };
  delete sisa[kunci];
  return sisa;
}

/** Aksi yang meninggalkan formulir terbuka. `ke` dan `fokus`: lihat lindungi(). */
type Tunda = { aksi: () => void; ke?: FormAgenda; fokus: HTMLElement | null };

function fokusSekarang(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

/**
 * Dress code dari /api/admin/rundown/sections/outfit. `available` false: kolomnya
 * belum ada (migrasi 202610160001 belum dijalankan). `horizon`: Dress code hanya
 * tampil untuk preset Gathering Horizon, satu-satunya portal yang punya
 * halamannya. `label`: nama halaman, dan `every_day`: dress code Every day
 * seluruh acara; keduanya disunting di Participant area, di sini hanya dibaca.
 */
type OutfitInfo = { available: boolean; horizon: boolean; label: string | null; every_day: OutfitSetiapHari | null };

/** Dress code: permintaan yang tidak mendapat jawaban sama sekali. */
const CEK_KONEKSI = "Check your connection and try again.";

/**
 * Untuk siapa tiap bagian, dari /api/admin/rundown/sections/sasaran.
 * `available` false: migrasi 202610180002 belum dijalankan. Hanya untuk
 * Gathering Horizon, satu-satunya portal yang membuka bagian milik peserta.
 */
type SasaranInfo = { available: boolean; horizon: boolean; fields: KolomSasaran[] };

// Petunjuk satu kalimat per aturan: baris per pembicara, label, format.
const HINT_KETERANGAN = "One line per speaker. A line ending in a colon becomes a label (e.g. Moderator:). Bold, italic, theme colour and lists show on the event page.";
const CONTOH_KETERANGAN = "Panelists:\nSantoso, Chairman - ASPI\nModerator:\nAbraham J. Adriaansz, President Director - PT Rintis Sejahtera";

// Nilai yang ditampilkan <input type="color"> ketika kolomnya masih null.
//
// Bukan nilai yang disimpan: kolomnya tetap null sampai admin benar-benar memilih
// warna. `<input type="color">` tidak bisa berkeadaan kosong, jadi ia harus diberi
// sesuatu, dan yang paling tidak mengejutkan adalah warna yang memang sedang
// tampil di halaman publik.
const BRANDING_FALLBACK = {
  background_color: "#ffffff",
  text_color: "#1a1a1a",
  accent_color: "#2649d0",
} as const;

/** Tanggal bagian di luar rentang tanggal acara. Tanpa tanggal acara: tidak diperiksa. */
function diLuarAcara(tanggal: string | null | undefined, acara: { start: string | null; end: string | null } | null): boolean {
  if (!tanggal || !acara?.start) return false;
  const akhir = acara.end && acara.end >= acara.start ? acara.end : acara.start;
  return tanggal < acara.start || tanggal > akhir;
}

/** "5 Nov 2026" atau "5 Nov 2026 to 8 Nov 2026". */
function rentangAcara(acara: { start: string | null; end: string | null }): string {
  const pendek = (tanggal: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(tanggal) ? new Date(`${tanggal}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : tanggal;
  const awal = pendek(acara.start ?? "");
  return acara.end && acara.end > (acara.start ?? "") ? `${awal} to ${pendek(acara.end)}` : awal;
}

/** "Monday, 24 August 2026" untuk keterangan staf. formatEventDate di lib/rundown dipakai halaman publik, jadi tetap id-ID. */
function formatStaffDate(eventDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return eventDate;
  const date = new Date(`${eventDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return eventDate;
  return date.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function fokusJudulBaru() {
  window.setTimeout(() => document.querySelector<HTMLInputElement>("[data-draft-title]")?.focus(), 0);
}

export default function RundownAdminPage() {
  // Hanya yang tersimpan di server. Suntingan formulir yang terbuka hidup di
  // lapisan sunting* (kolom yang diubah saja), jadi load() sesudah simpanan atau
  // aksi lain tidak pernah menimpanya. Jam dan tanggal tersimpan juga dibaca
  // dari sini: server menilai slot dari jam tersimpan, dan selisih trip bus
  // dijaga pemicu database terhadap nilai tersimpan.
  const [sections, setSections] = useState<RundownSection[]>([]);
  const [items, setItems] = useState<ItemAgenda[]>([]);
  const [suntingBagian, setSuntingBagian] = useState<{ id: number; isi: Partial<IsiBagian> } | null>(null);
  const [suntingBaris, setSuntingBaris] = useState<{ id: number; isi: Partial<IsiBaris> } | null>(null);
  // Baris dari tautan ?section=&item= ("Edit in Agenda" di Logistics), digulir
  // ke dalam layar sekali sesudah dimuat.
  const barisTautan = useRef<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [panel, setPanel] = useState<Panel>("baris");
  const [drafts, setDrafts] = useState<Record<number, DrafBaru>>({});
  // Jam mulai New item yang diisikan dari jam selesai baris yang baru
  // ditambahkan, per bagian. Isian awal ini bukan suntingan.
  const [jamAwal, setJamAwal] = useState<Record<number, string>>({});
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [creatingSection, setCreatingSection] = useState(false);
  const [savingSection, setSavingSection] = useState(false);
  const [deletingSection, setDeletingSection] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  // Logo atau gambar sponsor yang sedang diunggah di BrandingEditor.
  const [uploadingBranding, setUploadingBranding] = useState(false);
  // Header berdiri sendiri dari bagian: satu setelan untuk seluruh acara, dengan
  // tombol Simpan sendiri. Digabung ke tombol Simpan bagian, admin yang hanya ingin
  // mengubah warna header terpaksa ikut menyimpan setelan tab yang tidak dia sentuh.
  const [header, setHeader] = useState<RundownHeader>(DEFAULT_HEADER);
  const [suntingHeader, setSuntingHeader] = useState<Partial<RundownHeader> | null>(null);
  const [savingHeader, setSavingHeader] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  // Penanda simpan dan hapus dilacak PER baris, bukan satu penanda global: satu
  // penanda akan menonaktifkan seluruh tombol di halaman padahal hanya satu baris
  // yang sedang bekerja.
  const [savingItem, setSavingItem] = useState<number | null>(null);
  const [deletingItem, setDeletingItem] = useState<number | null>(null);
  // Konfirmasi hapus lewat dialog: satu klik tak sengaja tidak boleh langsung
  // membuang data.
  const [confirmItem, setConfirmItem] = useState<ItemAgenda | null>(null);
  const [confirmSection, setConfirmSection] = useState<RundownSection | null>(null);
  // Susun ulang sesi paralel. Satu permintaan pada satu waktu: dua geseran yang
  // berbalapan bisa saling menimpa nomor urut.
  const [reordering, setReordering] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: number; after: boolean } | null>(null);
  const [reorderNote, setReorderNote] = useState("");
  const [error, setError] = useState("");
  // Galat aksi panel kanan tampil di kaki panel, dekat tombolnya, bukan di
  // Banner atas halaman. `kunci`: formulir tempat galat itu terjadi.
  const [galatPanel, setGalatPanel] = useState<{ kunci: string; pesan: string } | null>(null);
  // Aksi yang menunggu jawaban dialog "Discard changes to …?".
  const [tertunda, setTertunda] = useState<(Tunda & { form: FormAgenda }) | null>(null);
  // Aksi yang diminta selagi formulir terbuka disimpan. Discard tidak
  // ditawarkan selama permintaannya berjalan, karena permintaan itu tetap
  // mendarat: aksinya menunggu jawaban server, lalu lewat lindungi() lagi.
  const [sesudahSimpan, setSesudahSimpan] = useState<Tunda | null>(null);
  // Sesi formulir terbuka, naik tiap kali formulir ditinggalkan atau dibuang.
  // Unggahan mencatat sesinya saat mulai, dan hasil yang tiba sesudah sesinya
  // berganti dibuang: formulirnya sudah ditinggalkan. `sesi` salinannya untuk
  // render (callback BrandingEditor).
  const sesiForm = useRef(0);
  const [sesi, setSesi] = useState(0);
  // Tanggal mulai dan selesai acara (Event page), untuk peringatan tanggal bagian.
  const [eventDates, setEventDates] = useState<{ start: string | null; end: string | null } | null>(null);
  // Dress code per bagian: dimuat sekali saat halaman dibuka, terpisah dari
  // load() yang dipanggil ulang tiap simpan. Kartu yang belum disimpan ada di
  // outfitDrafts; outfitSaved yang tersimpan, yang dibaca peserta.
  const [outfitInfo, setOutfitInfo] = useState<OutfitInfo | null>(null);
  const [outfitMuat, setOutfitMuat] = useState<"memuat" | "gagal" | "siap">("memuat");
  const [outfitSaved, setOutfitSaved] = useState<Record<number, OutfitEntry[]>>({});
  const [outfitDrafts, setOutfitDrafts] = useState<Record<number, DrafDresscode[]>>({});
  const [savingOutfit, setSavingOutfit] = useState<number | null>(null);
  // Bagian yang Save dress code-nya pernah ditekan: kolom wajib yang kosong baru ditandai sesudahnya.
  const [percobaanDc, setPercobaanDc] = useState<number | null>(null);
  // Foto dress code yang sedang diunggah: bagian dan kunci kartunya. Kunci,
  // bukan nomor: Whole day selalu di depan, jadi nomor kartu bisa bergeser.
  const [uploadingOutfit, setUploadingOutfit] = useState<{ bagian: number; kunci: string } | null>(null);
  // Untuk siapa bagian ini: dimuat dan disimpan seperti outfit. Draf null =
  // untuk semua peserta; tidak ada di peta = belum disentuh.
  const [sasaranInfo, setSasaranInfo] = useState<SasaranInfo | null>(null);
  const [sasaranSaved, setSasaranSaved] = useState<Record<number, SasaranBagian | null>>({});
  const [sasaranDrafts, setSasaranDrafts] = useState<Record<number, SasaranBagian | null>>({});
  // Show before sign-in per bagian, pola yang sama: tidak ada di peta draf =
  // belum disentuh. null = migrasinya belum ada (sakelar tidak tampil).
  const [publikAda, setPublikAda] = useState<boolean | null>(null);
  const [publikSaved, setPublikSaved] = useState<Record<number, boolean>>({});
  const [publikDrafts, setPublikDrafts] = useState<Record<number, boolean>>({});
  // Siapa yang melihat tiap baris (Edit item > Who sees it), pola yang sama:
  // null = semua; tidak ada di peta draf = belum disentuh. Hanya baris bersyarat yang tersimpan di peta.
  const [syaratInfo, setSyaratInfo] = useState<InfoSiapaMelihat | null>(null);
  const [syaratSaved, setSyaratSaved] = useState<Record<number, DrafSyarat>>({});
  const [syaratDrafts, setSyaratDrafts] = useState<Record<number, DrafSyarat | null>>({});
  // Who sees it di New item, per bagian. Ikut dikirim bersama barisnya.
  const [syaratBaru, setSyaratBaru] = useState<Record<number, DrafSyarat | null>>({});
  // Zona acara dipakai supaya tanggal yang diecho di bawah kolom tanggal dihitung
  // dengan zona yang sama dengan halaman publik. Kalau tidak, admin bisa membaca
  // "Kamis" di CMS sementara tamu membaca "Rabu". Jam trip bus juga dibaca di
  // zona ini.
  const { zone, abbr } = useEventTimeZone();
  const toast = useToast();
  const idGalat = useId();
  const idJudulDc = useId();

  /** true bila bagian dan baris berhasil dimuat. */
  async function load(): Promise<boolean> {
    // Bagian dan header dimuat bersamaan: keduanya dibutuhkan sebelum halaman ini
    // berguna, dan memuatnya berurutan hanya menambah satu perjalanan jaringan.
    const hasil = await Promise.all([
      fetch("/api/admin/rundown/sections", { cache: "no-store" }),
      fetch("/api/admin/rundown/header", { cache: "no-store" }),
    ]).catch(() => null);
    if (!hasil) { setError("Connection lost. The agenda could not be loaded."); return false; }
    const [sectionResponse, headerResponse] = hasil;
    if (!sectionResponse.ok) { setError("The agenda could not be loaded."); return false; }
    const data = (await sectionResponse.json()) as Payload;
    setSections(data.sections);
    setItems(data.items);
    setEventDates(data.event_dates ?? null);
    setActiveId((current) => (current && data.sections.some((row) => row.id === current) ? current : data.sections[0]?.id ?? null));
    // Header yang gagal dimuat tidak menggagalkan seluruh halaman: jadwalnya tetap
    // bisa disusun, dan nilai bawaan tetap aman disimpan.
    if (headerResponse.ok) setHeader((await headerResponse.json()) as RundownHeader);
    setLoaded(true);
    return true;
  }

  // setState langsung di badan effect ditolak React Compiler, jadi pemuatan awal
  // ditunda satu tick. Pola yang sama dipakai di seluruh halaman admin.
  async function loadOutfit() {
    // Gagal dimuat: baris Dress code menyebutnya dengan Try again; sisa halaman tetap berjalan.
    setOutfitMuat("memuat");
    const response = await fetch(eventApiPath("/api/admin/rundown/sections/outfit"), { cache: "no-store" }).catch(() => null);
    const data = response?.ok
      ? ((await response.json().catch(() => null)) as (Omit<OutfitInfo, "every_day"> & { every_day?: unknown; sections: Array<{ id: number; outfit: OutfitEntry[] }> }) | null)
      : null;
    if (!data) {
      setOutfitMuat("gagal");
      return;
    }
    setOutfitInfo({ available: data.available, horizon: data.horizon, label: data.label, every_day: bacaOutfitSetiapHari(data.every_day) });
    setOutfitSaved(Object.fromEntries(data.sections.map((row) => [row.id, row.outfit])));
    setOutfitMuat("siap");
  }

  async function loadSasaran() {
    // Gagal dimuat = kelompok Who it's for tidak tampil; sisa halaman tetap berjalan.
    const response = await fetch(eventApiPath("/api/admin/rundown/sections/sasaran"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json()) as SasaranInfo & { sections: Array<{ id: number; audience: unknown }> };
    setSasaranInfo({ available: data.available, horizon: data.horizon, fields: data.fields });
    setSasaranSaved(Object.fromEntries(data.sections.map((row) => [row.id, bacaSasaran(row.audience)])));
  }

  async function loadPublik() {
    // Gagal dimuat = sakelar Show before sign-in tidak tampil; sisa halaman tetap berjalan.
    const response = await fetch(eventApiPath("/api/admin/rundown/sections/publik"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json()) as { available: boolean; sections: Array<{ id: number; show_before_sign_in: boolean }> };
    setPublikAda(data.available);
    setPublikSaved(Object.fromEntries(data.sections.map((row) => [row.id, row.show_before_sign_in])));
  }

  async function loadSyarat() {
    // Gagal dimuat = kelompok Who sees it tidak tampil; sisa halaman tetap berjalan.
    const response = await fetch(eventApiPath("/api/admin/rundown/items/sasaran"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json()) as InfoSiapaMelihat & { items: Array<{ id: number; audience: unknown }> };
    setSyaratInfo({ available: data.available, fields: data.fields, hotels: data.hotels, hotels_failed: data.hotels_failed, rooms_shown: data.rooms_shown });
    setSyaratSaved(Object.fromEntries(data.items.flatMap((row) => {
      const syarat = bacaSyaratBaris(row.audience);
      return syarat ? [[row.id, syarat]] : [];
    })));
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      // ?section=<id>&item=<id> dari "Edit in Agenda" di Logistics: tab baris
      // itu, dengan barisnya terbuka di Edit item. load() mempertahankan tab
      // ini selama masih ada.
      const query = new URLSearchParams(window.location.search);
      const bagian = Number(query.get("section"));
      const baris = Number(query.get("item"));
      if (Number.isInteger(bagian) && bagian > 0) {
        setActiveId(bagian);
        if (Number.isInteger(baris) && baris > 0) {
          setSelectedItemId(baris);
          setPanel("baris");
          barisTautan.current = baris;
        }
      }
      void load();
      void loadOutfit();
      void loadSasaran();
      void loadPublik();
      void loadSyarat();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Strip tab di 1280 px bergulir, dan jadwalnya bisa panjang: tab dan baris
  // dari tautan digulir ke dalam layar.
  useEffect(() => {
    const baris = barisTautan.current;
    if (!loaded || baris === null) return;
    barisTautan.current = null;
    window.requestAnimationFrame(() => {
      document.getElementById(`bagian-tab-${activeId}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
      document.querySelector(`[data-rundown-row="${baris}"]`)?.scrollIntoView({ block: "nearest" });
    });
  }, [loaded, activeId]);

  // Tersimpan ditambah suntingan formulir yang terbuka: daftar, tab dan formulir
  // menampilkan ini. Lencana Draft dan hitungan bagian publik membaca yang
  // tersimpan, karena sakelar yang belum disimpan belum mengubah halaman publik.
  const sectionsTampil = useMemo(
    () => (suntingBagian ? sections.map((row) => (row.id === suntingBagian.id ? { ...row, ...suntingBagian.isi } : row)) : sections),
    [sections, suntingBagian],
  );
  const itemsTampil = useMemo(
    () => (suntingBaris ? items.map((row) => (row.id === suntingBaris.id ? { ...row, ...suntingBaris.isi } : row)) : items),
    [items, suntingBaris],
  );
  const headerTampil = useMemo(() => ({ ...header, ...suntingHeader }), [header, suntingHeader]);
  const barisTersimpan = useMemo(() => new Map(items.map((row) => [row.id, row])), [items]);

  const active = sectionsTampil.find((row) => row.id === activeId) ?? null;
  // Tab tampil menurut sort_order lalu id, sama dengan halaman publik.
  const sectionsUrut = useMemo(() => [...sectionsTampil].sort(bandingkanBagian), [sectionsTampil]);
  const idBagian = sectionsUrut.map((row) => row.id);
  const idMenurutTanggal = urutBagianMenurutTanggal(sectionsTampil);
  const sudahUrutTanggal = idMenurutTanggal.every((id, index) => id === idBagian[index]);
  const draftAwal = activeId !== null && jamAwal[activeId] ? { ...EMPTY_DRAFT, start_time: jamAwal[activeId] } : EMPTY_DRAFT;
  const draft = (activeId !== null ? drafts[activeId] : undefined) ?? draftAwal;

  // Urut jam, lalu sort_order untuk butir berjam sama. Urutan yang sama dipakai
  // halaman publik, supaya yang dilihat admin sama dengan yang dilihat tamu.
  const activeItems = useMemo(() => {
    if (activeId === null) return [];
    // Baris yang jam mulainya diubah tetapi belum disimpan ditaruh di akhir slot
    // jam barunya, sama dengan tempat server menaruhnya saat disimpan. Tanpa ini
    // ia tampil menurut sort_order lamanya lalu melompat begitu disimpan.
    return itemsTampil
      .filter((item) => item.section_id === activeId)
      .map((item) => {
        const tersimpan = barisTersimpan.get(item.id)?.start_time;
        return tersimpan !== undefined && kunciSlot(tersimpan) !== kunciSlot(item.start_time) ? { ...item, sort_order: Number.MAX_SAFE_INTEGER } : item;
      })
      .sort(bandingkanBaris);
  }, [itemsTampil, activeId, barisTersimpan]);

  // Ada jam mulai yang diubah tetapi belum disimpan di bagian ini.
  const jamBelumDisimpan = activeItems.some((item) => kunciSlot(item.start_time) !== kunciSlot(barisTersimpan.get(item.id)?.start_time ?? item.start_time));

  // Id baris per slot jam, dalam urutan tampil. Slot berisi satu baris tidak
  // bisa disusun ulang. Kosong selama ada jam yang belum disimpan: slot dari jam
  // lokal bisa berbeda dari slot di server, dan susunannya akan ditolak.
  const slots = useMemo(() => {
    const peta = new Map<string, number[]>();
    if (jamBelumDisimpan) return peta;
    for (const item of activeItems) {
      const kunci = kunciSlot(item.start_time);
      peta.set(kunci, [...(peta.get(kunci) ?? []), item.id]);
    }
    return peta;
  }, [activeItems, jamBelumDisimpan]);
  const adaSlotParalel = [...slots.values()].some((ids) => ids.length > 1);

  const selectedItem = activeItems.find((item) => item.id === selectedItemId) ?? null;
  const selectedSlot = selectedItem ? slots.get(kunciSlot(selectedItem.start_time)) ?? [] : [];
  // Baris lain yang berjam mulai sama dengan baris terpilih menurut jam lokal.
  // Dipakai untuk menjelaskan kenapa susun ulang terkunci.
  const selectedSlotLokal = selectedItem ? activeItems.filter((item) => kunciSlot(item.start_time) === kunciSlot(selectedItem.start_time)).length : 0;

  // Branding dinormalisasi sebelum diserahkan ke <BrandingEditor>.
  //
  // Kolom skala bertipe `numeric` dan datang dari driver sebagai string; editor
  // memakainya sebagai angka pada penggeser. Tanpa langkah ini penggesernya lompat
  // ke nilai bawaan pada render pertama, dan admin yang menyimpan tanpa menyentuh
  // apa pun justru menimpa skala yang sudah dia setel sebelumnya.
  const headerBranding = useMemo(
    () => normalizeBranding(headerTampil as unknown as Record<string, unknown>),
    [headerTampil],
  );

  function updateSection(id: number, changes: Partial<IsiBagian>) {
    setSuntingBagian((kini) => ({ id, isi: { ...(kini?.id === id ? kini.isi : {}), ...changes } }));
  }

  function updateHeader(changes: Partial<RundownHeader>) {
    setSuntingHeader((kini) => ({ ...kini, ...changes }));
  }

  function pilihBagian(id: number) {
    pindah({ bagian: id, baris: null });
  }

  function mulaiTambahBaris() {
    pindah({ baris: null, panel: "baris" }, fokusJudulBaru);
  }

  /**
   * Unggah gambar latar header.
   *
   * Memakai endpoint yang sama dengan Papan peringkat dan denah
   * (`/api/display/background`). Endpoint itu sudah generik: menerima berkas,
   * memvalidasi jenis dan ukuran, lalu mengembalikan URL publik. Membuat endpoint
   * ketiga hanya menyalin aturan yang sama, dan salinan selalu berakhir berbeda.
   *
   * Hasilnya hanya masuk state; admin tetap harus menekan Simpan header, sama
   * seperti perubahan warna dan judul.
   */
  async function uploadHeaderBackground(file: File) {
    const sesiAwal = sesiForm.current;
    setUploadingBackground(true); setError(""); setGalatPanel(null);
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/display/background", { method: "POST", body: form }).catch(() => null);
    const data = response ? await response.json().catch(() => null) : null;
    // Header dibuang (Discard) selama unggahan berjalan: hasilnya ikut dibuang.
    if (sesiAwal !== sesiForm.current) return;
    setUploadingBackground(false);
    if (!response?.ok) {
      gagalPanel("Image upload failed", response ? data?.error?.details?.file ?? data?.error?.message ?? "Image upload failed." : PUTUS);
      return;
    }
    updateHeader({ background_image_url: data.url });
    toast.info("Image uploaded", "Select Save header to apply it to the public page.");
  }

  async function saveHeader() {
    // Kolom yang dikirim: sesudah berhasil, hanya itu yang dibuang dari lapisan.
    const dikirim = suntingHeader;
    setSavingHeader(true); setError(""); setGalatPanel(null);
    const response = await fetch("/api/admin/rundown/header", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(headerTampil),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setSavingHeader(false);
    if (!response?.ok) {
      gagalPanel("Header not saved", response ? failureMessage(data, "Header not saved.") : PUTUS);
      return;
    }
    setHeader(data as RundownHeader);
    if (dikirim) setSuntingHeader((kini) => (kini ? sisaSunting(kini, dikirim) : kini));
    toast.success("Header saved", "Applies to every tab on the public page.");
  }

  function updateItem(id: number, changes: Partial<IsiBaris>) {
    setSuntingBaris((kini) => ({ id, isi: { ...(kini?.id === id ? kini.isi : {}), ...changes } }));
  }

  function updateDraft(changes: Partial<DrafBaru>) {
    if (activeId === null) return;
    setDrafts((current) => ({ ...current, [activeId]: { ...(current[activeId] ?? draftAwal), ...changes } }));
  }

  /** Pesan gagal dari API. `details.message` lebih spesifik dari pesan generiknya. */
  function failureMessage(data: { error?: { message?: string; details?: { message?: string } } }, fallback: string) {
    return data.error?.details?.message ?? data.error?.message ?? fallback;
  }

  async function createSection() {
    const name = newSectionName.trim();
    if (!name) return;
    setCreatingSection(true); setError("");
    const response = await fetch("/api/admin/rundown/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await response.json();
    setCreatingSection(false);
    if (!response.ok) {
      const failure = failureMessage(data, "Section not added.");
      setError(failure); toast.error("Section not added", failure);
      return;
    }
    setNewSectionName("");
    setAddSectionOpen(false);
    // Suntingan yang terbuka sudah ditanyakan saat + Section ditekan.
    pindah({ bagian: (data as RundownSection).id, baris: null, panel: "bagian" });
    toast.success("Section added", "It is still a draft. Set the date, add the schedule, then publish it.");
    await load();
  }

  async function saveSection(section: RundownSection) {
    // Dress code punya segmen dan tombol simpannya sendiri, jadi isiannya yang
    // belum lengkap tidak lagi memblokir Save section. Who it's for tetap di sini.
    const simpanSasaran = sasaranBerubah(section.id);
    if (simpanSasaran && !sasaranLengkap(section.id)) return;
    const simpanPublik = publikBerubah(section.id);
    // Menyempit dulu (pola Who sees it baris): Show before sign-in yang dimatikan
    // disimpan SEBELUM bagian diterbitkan, jadi hari itu tidak sempat publik
    // walau satu permintaan gagal. Menyalakannya disimpan sesudahnya.
    const publikDulu = simpanPublik && publikDrafts[section.id] === false;
    const dikirim = suntingBagian?.id === section.id ? suntingBagian.isi : null;
    setSavingSection(true); setError(""); setGalatPanel(null);
    if (publikDulu && !(await savePublik(section))) { setSavingSection(false); return; }
    const response = await fetch("/api/admin/rundown/sections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: section.id,
        name: section.name,
        title: section.title,
        subtitle: section.subtitle,
        event_date: section.event_date,
        highlight_current: section.highlight_current,
        is_published: section.is_published,
        // sort_order sengaja tidak dikirim: urutan tab hanya lewat
        // /sections/order, supaya simpanan dari halaman basi tidak memindahkan
        // tab kembali ke tempat lamanya.
        // Branding TIDAK dikirim dari sini. Ia setelan global dengan tombol Simpan
        // sendiri di panel Header publik, karena header adalah identitas acara.
      }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      setSavingSection(false);
      gagalPanel("Section not saved", response ? failureMessage(data, "Section not saved.") : PUTUS);
      return;
    }
    // Gagal menyimpan Who it's for sudah menampilkan pesannya sendiri; drafnya tetap ada.
    const sasaranOk = simpanSasaran ? await saveSasaran(section) : true;
    const publikOk = simpanPublik && !publikDulu ? await savePublik(section) : true;
    // Muat ulang dulu, baru lapisan suntingan dibuang: tanggal bagian menggeser
    // jam bus lewat pemicu, dan catatan bus membaca tanggal tersimpan bersama
    // trip yang dimuat. Gagal memuat = bagian ini saja diperbarui. Kolom yang
    // diketik selama permintaan berjalan tetap di lapisan.
    if (!(await load())) setSections((kini) => kini.map((row) => (row.id === section.id ? { ...row, ...(data as RundownSection) } : row)));
    if (dikirim) setSuntingBagian((kini) => (kini?.id === section.id ? lapisanSisa(kini, dikirim) : kini));
    setSavingSection(false);
    if (sasaranOk && publikOk) {
      const sebelumMasuk = publikAktif(section.id);
      toast.success("Section saved", !section.is_published ? "This section is a draft. Nobody sees it yet." : sebelumMasuk ? "Shown on the event page and in the participant portal." : "Shown only to participants who have signed in.");
    }
  }

  async function deleteSection(section: RundownSection) {
    setError(""); setGalatPanel(null);
    setDeletingSection(true);
    const response = await fetch(`/api/admin/rundown/sections?id=${section.id}`, { method: "DELETE" }).catch(() => null);
    setDeletingSection(false);
    setConfirmSection(null);
    if (!response?.ok) {
      const data = response ? await response.json().catch(() => ({})) : {};
      gagalPanel("Section not deleted", response ? failureMessage(data, "Section not deleted.") : PUTUS);
      return;
    }
    // Suntingan bagian ini ikut terhapus bersama bagiannya (sudah dikonfirmasi),
    // termasuk kartu Dress code-nya: dress code tersimpan di baris bagian itu.
    setGalatPanel(null);
    sesiBaru();
    buangBagian(section.id);
    buangDresscode(section.id);
    setDrafts((kini) => tanpa(kini, section.id));
    setSyaratBaru((kini) => tanpa(kini, section.id));
    setActiveId(null);
    setSelectedItemId(null);
    toast.success("Section deleted", "All of its agenda items were deleted too.");
    await load();
  }

  async function addItem() {
    if (activeId === null) return;
    const title = draft.title.trim();
    if (!title || !draft.start_time) {
      setGalatPanel({ kunci: kunciForm(terbuka), pesan: "Start time and title are required." });
      return;
    }
    const bagian = activeId;
    const syarat = syaratInfo?.available ? syaratBaru[bagian] ?? null : null;
    if (!syaratLengkap(syarat)) {
      setGalatPanel({ kunci: kunciForm(terbuka), pesan: "Choose a field and at least one answer for each condition under Who sees it, or select Everyone." });
      return;
    }
    setAddingItem(true); setError(""); setGalatPanel(null);
    const response = await fetch("/api/admin/rundown/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section_id: activeId,
        start_time: draft.start_time,
        // String kosong berarti butir tanpa durasi, bukan jam kosong yang akan
        // ditolak validasi.
        end_time: draft.end_time || null,
        title,
        subtitle: draft.subtitle.trim() || null,
        is_break: draft.is_break,
        ...(syarat ? { audience: syarat } : {}),
      }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setAddingItem(false);
    if (!response?.ok) {
      if (response?.status === 409 && (data as { error?: { code?: string } }).error?.code === "AUDIENCE_NOT_READY") {
        setSyaratInfo((kini) => kini && { ...kini, available: false });
      }
      gagalPanel("Agenda item not added", response ? failureMessage(data, "Agenda item not added.") : PUTUS);
      return;
    }
    const baru = data as { id?: number; audience?: unknown };
    const tersimpan = bacaSyaratBaris(baru.audience);
    if (typeof baru.id === "number" && tersimpan) setSyaratSaved((kini) => ({ ...kini, [baru.id as number]: tersimpan }));
    setSyaratBaru((kini) => tanpa(kini, bagian));
    // Jam mulai baris berikutnya diisi jam selesai baris ini. Rundown disusun
    // berurutan dan bersambung, jadi ini menghilangkan pengetikan yang berulang
    // sekaligus mengurangi celah waktu yang tidak disengaja.
    setJamAwal((kini) => ({ ...kini, [bagian]: draft.end_time || "" }));
    setDrafts((kini) => tanpa(kini, bagian));
    toast.success("Agenda item added");
    await load();
  }

  async function saveItem(item: RundownItem) {
    // Kolom yang dikirim: sesudah berhasil, hanya itu yang dibuang dari lapisan.
    const dikirim = suntingBaris?.id === item.id ? suntingBaris.isi : null;
    const simpanSyarat = syaratBerubah(item.id);
    if (simpanSyarat && !syaratLengkap(syaratDrafts[item.id] ?? null)) {
      gagalPanel("Agenda item not saved", "Choose a field and at least one answer for each condition under Who sees it, or select Everyone.");
      return;
    }
    setSavingItem(item.id); setError(""); setGalatPanel(null);
    // Urutan dua permintaan dipilih supaya gagal di tengah tidak pernah membuka
    // baris ke lebih banyak peserta: syarat yang mempersempit disimpan DULU
    // (baru sesudahnya Published), Everyone disimpan TERAKHIR (sesudah
    // baris mungkin disembunyikan). Gagal = berhenti, sisanya tetap draf.
    const keSemua = simpanSyarat && !syaratDrafts[item.id];
    if (simpanSyarat && !keSemua && !(await saveSyarat(item.id))) {
      setSavingItem(null);
      return;
    }
    const response = await fetch("/api/admin/rundown/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        start_time: formatClock(item.start_time),
        end_time: item.end_time ? formatClock(item.end_time) : null,
        title: item.title,
        subtitle: item.subtitle,
        is_break: item.is_break,
        is_published: item.is_published,
      }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      setSavingItem(null);
      gagalPanel("Agenda item not saved", response ? failureMessage(data, "Agenda item not saved.") : PUTUS);
      return;
    }
    // Muat ulang dulu, baru lapisan suntingan dibuang: pemicu menggeser jam bus
    // yang tertaut, dan catatan bus menghitung selisihnya dari jam tersimpan yang
    // dimuat bersama trip itu. Gagal memuat = baris ini saja diperbarui (bus_trips
    // tetap). Kolom yang diketik selama permintaan berjalan tetap di lapisan.
    if (!(await load())) setItems((kini) => kini.map((row) => (row.id === item.id ? { ...row, ...(data as RundownItem) } : row)));
    if (dikirim) setSuntingBaris((kini) => (kini?.id === item.id ? lapisanSisa(kini, dikirim) : kini));
    // Gagal menyimpan Who sees it sudah menampilkan pesannya sendiri; drafnya tetap ada.
    const syaratOk = keSemua ? await saveSyarat(item.id) : true;
    setSavingItem(null);
    if (syaratOk) toast.success("Agenda item saved");
  }

  async function deleteItem(item: RundownItem) {
    setDeletingItem(item.id); setError(""); setGalatPanel(null);
    const response = await fetch(`/api/admin/rundown/items?id=${item.id}`, { method: "DELETE" }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setDeletingItem(null);
    setConfirmItem(null);
    if (!response?.ok) {
      gagalPanel("Agenda item not deleted", response ? failureMessage(data, "Agenda item not deleted.") : PUTUS);
      return;
    }
    // Dress code yang menaut ke baris ini dihapus server sesudah barisnya. Tanpa
    // `outfit` (tulisan kedua gagal) yang tersimpan tetap: "Item not found".
    const dresscode = (data as { outfit?: { section_id: number; entries: OutfitEntry[] } }).outfit;
    if (dresscode) setOutfitSaved((kini) => ({ ...kini, [dresscode.section_id]: dresscode.entries }));
    // Suntingan baris ini ikut terhapus bersama barisnya (sudah dikonfirmasi).
    setSuntingBaris((kini) => (kini?.id === item.id ? null : kini));
    setSelectedItemId((current) => (current === item.id ? null : current));
    toast.success("Agenda item deleted");
    await load();
  }

  /** `dariPanel`: Move up/down di Edit item, jadi galatnya tampil di kaki panel. */
  async function reorderSlot(ids: number[], movedId: number, dariPanel = false) {
    if (activeId === null || reordering) return;
    const sectionItems = items.filter((item) => item.section_id === activeId);
    const changes = susunUlangSlot(sectionItems, ids);
    if (!changes) return;
    // Optimistis: hanya sort_order yang diubah. Suntingan yang belum disimpan
    // ada di lapisan suntingBaris dan tidak tersentuh.
    const before = sectionItems.filter((row) => changes.some((change) => change.id === row.id)).map(({ id, sort_order }) => ({ id, sort_order }));
    const apply = (list: Array<{ id: number; sort_order: number }>) =>
      setItems((current) => current.map((row) => {
        const found = list.find((change) => change.id === row.id);
        return found ? { ...row, sort_order: found.sort_order } : row;
      }));
    apply(changes);
    setReordering(true); setError("");
    if (dariPanel) setGalatPanel(null);
    const response = await fetch("/api/admin/rundown/items/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section_id: activeId, ids }),
    }).catch(() => null);
    setReordering(false);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      // Kembali ke susunan sebelumnya, lalu baca ulang sort_order saja: server
      // menulis baris satu per satu, jadi kegagalan di tengah bisa meninggalkan
      // sebagian perubahan. Yang dikembalikan hanya sort_order yang digeser
      // tadi: simpanan atau baris baru yang dimuat selama permintaan berjalan
      // tetap, dan suntingan yang belum disimpan ada di lapisannya sendiri.
      apply(before);
      const failure = response ? failureMessage(data, "Something went wrong. Try again.") : PUTUS;
      if (dariPanel) gagalPanel("Order not saved", failure);
      else { setError(failure); toast.error("Order not saved", failure); }
      const fresh = await fetch("/api/admin/rundown/sections", { cache: "no-store" }).catch(() => null);
      if (fresh?.ok) apply(((await fresh.json()) as Payload).items);
      return;
    }
    apply((data as { items?: RundownItem[] }).items ?? []);
    const moved = sectionItems.find((item) => item.id === movedId);
    setReorderNote(`${moved?.title.trim() || "Item"} moved to position ${ids.indexOf(movedId) + 1} of ${ids.length}.`);
  }

  async function reorderSections(ids: number[], note: string) {
    if (reordering) return;
    const changes = susunUlangBagian(sections, ids);
    if (!changes || changes.length === 0) return;
    // Optimistis dan hanya sort_order. Suntingan bagian yang belum disimpan ada
    // di lapisan suntingBagian dan tidak tersentuh. Gagal = sort_order yang
    // digeser saja yang kembali, sama dengan reorderSlot.
    const before = sections.filter((row) => changes.some((change) => change.id === row.id)).map(({ id, sort_order }) => ({ id, sort_order }));
    const apply = (list: Array<{ id: number; sort_order: number }>) =>
      setSections((current) => current.map((row) => {
        const found = list.find((change) => change.id === row.id);
        return found ? { ...row, sort_order: found.sort_order } : row;
      }));
    apply(changes);
    setReordering(true); setError(""); setGalatPanel(null);
    const response = await fetch("/api/admin/rundown/sections/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, expected: idBagian }),
    }).catch(() => null);
    setReordering(false);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      apply(before);
      gagalPanel("Tab order not saved", response ? failureMessage(data, "Something went wrong. Try again.") : PUTUS);
      const fresh = await fetch("/api/admin/rundown/sections", { cache: "no-store" }).catch(() => null);
      if (fresh?.ok) apply(((await fresh.json()) as Payload).sections);
      return;
    }
    apply((data as { sections?: RundownSection[] }).sections ?? []);
    setReorderNote(note);
  }

  function moveSection(section: RundownSection, direction: -1 | 1) {
    const next = geserBagian(idBagian, section.id, direction);
    if (!next) return;
    void reorderSections(next, `${section.name} moved to tab ${next.indexOf(section.id) + 1} of ${next.length}.`);
    // Sampai di ujung: tombol yang baru dipakai jadi mati, fokus pindah ke arah sebaliknya.
    const posisi = next.indexOf(section.id);
    const tujuan = posisi === 0 ? "right" : posisi === next.length - 1 ? "left" : null;
    if (tujuan) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-move-tab="${tujuan}"]`)?.focus());
  }

  function moveInSlot(item: RundownItem, direction: -1 | 1, fromPanel = false) {
    const ids = slots.get(kunciSlot(item.start_time)) ?? [];
    const next = geserDalamSlot(ids, item.id, direction);
    if (!next) return;
    void reorderSlot(next, item.id, fromPanel);
    // Baris sampai di ujung slot: tombol yang baru dipakai jadi mati, jadi fokus
    // dipindah ke tombol arah sebaliknya supaya pengguna keyboard tidak tersesat.
    if (fromPanel) {
      const posisi = next.indexOf(item.id);
      const tujuan = posisi === 0 ? "down" : posisi === next.length - 1 ? "up" : null;
      if (tujuan) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-move="${tujuan}"]`)?.focus());
    }
  }

  // ---- Dress code bagian aktif ------------------------------------------------------
  // Hanya Gathering Horizon dengan kolom outfit (migrasi 202610160001).
  const dresscodeAda = outfitMuat === "siap" && Boolean(outfitInfo?.horizon && outfitInfo.available);
  // Baris Dress code tampil juga saat memuat atau gagal, bila Who it's for sudah
  // memastikan acaranya Horizon. Acara lain tidak bergeser satu piksel pun.
  const barisDcTampil = outfitMuat === "siap" ? dresscodeAda : Boolean(sasaranInfo?.horizon);
  const drafDc = (id: number): DrafDresscode[] => outfitDrafts[id] ?? keDraf(outfitSaved[id] ?? []);

  /** Kartu Dress code bagian ini berbeda dari yang tersimpan. */
  function dcBerubah(id: number) {
    const draf = outfitDrafts[id];
    return draf !== undefined && !samaDraf(draf, keDraf(outfitSaved[id] ?? []));
  }

  /** Baris tersimpan satu bagian, urut jadwal: server dan peserta membaca yang tersimpan. */
  function barisTab(id: number): BarisDc[] {
    return items.filter((row) => row.section_id === id).sort(bandingkanBaris);
  }

  // Tab yang dibuka portal: terbit dan punya butir publik berjudul
  // (loadAgendaPreview). Banner, toast dan label batch memakai aturan yang
  // sama dengan server, jadi "Participants see" sama dengan teks tersimpan.
  const tabTerlihat = tabTerlihatOutfit(sections, items);
  function terlihat(id: number) {
    return tabTerlihat.has(id);
  }

  /**
   * Dress code tersimpan satu bagian dibaca ulang, misalnya sesudah 422
   * karena barisnya dihapus di tempat lain. Bukan loadOutfit(): keadaan
   * "memuat" menutup segmen Dress code dan memasang ulang editornya. Kartu
   * yang belum disimpan tetap di outfitDrafts.
   */
  async function muatUlangDresscode(id: number) {
    const response = await fetch(eventApiPath("/api/admin/rundown/sections/outfit"), { cache: "no-store" }).catch(() => null);
    const data = response?.ok ? ((await response.json().catch(() => null)) as { sections?: Array<{ id: number; outfit: OutfitEntry[] }> } | null) : null;
    const baris = data?.sections?.find((row) => row.id === id);
    if (baris) setOutfitSaved((kini) => ({ ...kini, [id]: baris.outfit }));
  }

  /**
   * Foto contoh lewat endpoint unggah yang sama dengan latar header (lib/outfit-foto.ts,
   * juga dipakai Every day di Participant area); masuk draf sampai Save dress code.
   */
  async function uploadFotoDresscode(kunci: string, file: File) {
    if (!active) return;
    const id = active.id;
    // Diperiksa di sini dulu: berkas yang salah tidak perlu diunggah untuk ditolak.
    if (!fotoOutfitSah(file)) {
      gagalPanel("Photo not uploaded", FOTO_OUTFIT_SALAH);
      return;
    }
    const sesiAwal = sesiForm.current;
    setUploadingOutfit({ bagian: id, kunci }); setError(""); setGalatPanel(null);
    const hasil = await unggahFotoOutfit(file);
    // Dress code ini dibuang (Discard) atau bagiannya dihapus selama unggahan berjalan: hasilnya ikut dibuang.
    if (sesiAwal !== sesiForm.current) return;
    setUploadingOutfit(null);
    if ("galat" in hasil) {
      gagalPanel("Photo not uploaded", hasil.galat);
      return;
    }
    // Hanya foto kartu ini, di draf terkini: yang diketik selama unggahan tetap
    // ada. outfitSaved dari render ini masih berlaku karena unggahan berjalan
    // satu per satu (Add photo mati di semua kartu) dan Save dress code
    // menunggunya selesai.
    const url = hasil.url;
    setOutfitDrafts((kini) => ({ ...kini, [id]: (kini[id] ?? keDraf(outfitSaved[id] ?? [])).map((isi) => (isi.kunci === kunci ? { ...isi, photo_url: url } : isi)) }));
    toast.info("Photo uploaded", "Select Save dress code to show it to participants.");
  }

  /**
   * Save dress code: hanya dress code tab ini, bukan setelan bagiannya. Server
   * memeriksa tautan baris dan menulis teks waktunya.
   */
  async function saveDresscode(section: RundownSection) {
    const id = section.id;
    const daftar = drafDc(id);
    const dikirim = outfitDrafts[id];
    setPercobaanDc(id);
    // Isian yang belum lengkap ditolak sebelum dikirim; kolom pertamanya difokus.
    const kurang = urutDraf(daftar).find((isi) => drafKurang(isi) !== null);
    if (kurang) {
      gagalPanel("Dress code not saved", "Fill in the missing fields, or remove those lines.");
      window.setTimeout(() => document.querySelector<HTMLElement>(`[data-dresscode-kartu="${kurang.kunci}"] [data-dresscode-${drafKurang(kurang)}]`)?.focus(), 0);
      return;
    }
    // Aturan daftar yang sama dengan server, sebelum dikirim: isian lama tanpa
    // When terbaca sebagai beberapa Whole day. For kartu kedua difokus.
    const masalah = cekDaftarOutfit(keKiriman(daftar));
    if (masalah) {
      const ganda = urutDraf(daftar).filter((isi) => (masalah.jenis === "barisGanda" ? isi.jenis === "baris" && isi.item_id === masalah.item_id : isi.jenis === "seharian"))[1];
      gagalPanel("Dress code not saved", alasanDaftarOutfit(masalah, (itemId) => barisTersimpan.get(itemId)?.title.trim() || "That item"));
      if (ganda) window.setTimeout(() => document.querySelector<HTMLElement>(`[data-dresscode-kartu="${ganda.kunci}"] [data-dresscode-untuk]`)?.focus(), 0);
      return;
    }
    setSavingOutfit(id); setError(""); setGalatPanel(null);
    const response = await fetch(eventApiPath("/api/admin/rundown/sections/outfit"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, outfit: keKiriman(daftar) }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setSavingOutfit(null);
    if (!response?.ok) {
      if (response?.status === 409 && (data as { error?: { code?: string } }).error?.code === "OUTFIT_NOT_READY") {
        setOutfitInfo((current) => current && { ...current, available: false });
      }
      gagalPanel("Dress code not saved", response ? failureMessage(data, "Dress code not saved.") : CEK_KONEKSI);
      // Baris yang dihapus di tab atau oleh admin lain: agenda dan dress code
      // tersimpan dimuat ulang, jadi baris Dress code dan kartunya menyebut
      // yang benar-benar dibaca peserta.
      if (response?.status === 422) {
        void load();
        void muatUlangDresscode(id);
      }
      return;
    }
    const simpanan = (data as { outfit?: OutfitEntry[] }).outfit ?? [];
    setOutfitSaved((kini) => ({ ...kini, [id]: simpanan }));
    // Draf yang diganti selama permintaan berjalan belum tersimpan: tetap ada.
    setOutfitDrafts((kini) => (kini[id] === dikirim ? tanpa(kini, id) : kini));
    setPercobaanDc(null);
    const tersimpan = sections.find((row) => row.id === id);
    toast.success("Dress code saved", keteranganTersimpan({
      jumlah: simpanan.length,
      terbit: Boolean(tersimpan?.is_published),
      terlihat: terlihat(id),
      siapa: sasaranSaved[id]?.values ?? [],
      tanggal: tersimpan?.event_date ?? section.event_date,
      setiapHari: Boolean(outfitInfo?.every_day),
    }));
  }

  // ---- Untuk siapa bagian aktif ---------------------------------------------------
  const sasaranAktif: SasaranBagian | null = active ? (active.id in sasaranDrafts ? sasaranDrafts[active.id] : sasaranSaved[active.id] ?? null) : null;

  function setSasaranAktif(next: SasaranBagian | null) {
    if (!active) return;
    setSasaranDrafts((current) => ({ ...current, [active.id]: next }));
  }

  // ---- Siapa yang melihat baris terpilih ------------------------------------------
  function syaratBerubah(itemId: number) {
    if (!syaratInfo?.available || !(itemId in syaratDrafts)) return false;
    return JSON.stringify(syaratDrafts[itemId]) !== JSON.stringify(syaratSaved[itemId] ?? null);
  }

  /** "Show <question> answers on the event page": satu tanda per pertanyaan, langsung disimpan. */
  async function ubahLabel(field: string, on: boolean): Promise<boolean> {
    const response = await fetch(eventApiPath("/api/admin/rundown/items/label"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, on }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      gagalPanel("Event page setting not saved", response ? failureMessage(data, "Event page setting not saved.") : PUTUS);
      return false;
    }
    setSyaratInfo((kini) => kini && { ...kini, fields: kini.fields.map((k) => (k.key === field ? { ...k, label_agenda: on } : k)) });
    const nama = syaratInfo?.fields.find((k) => k.key === field)?.label ?? "These";
    toast.success(on ? `${nama} answers now show on the event page` : `${nama} answers hidden from the event page`);
    return true;
  }

  async function saveSyarat(itemId: number): Promise<boolean> {
    const dikirim = syaratDrafts[itemId];
    const response = await fetch(eventApiPath("/api/admin/rundown/items/sasaran"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId, audience: dikirim ?? null }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      if (response?.status === 409 && (data as { error?: { code?: string } }).error?.code === "AUDIENCE_NOT_READY") {
        setSyaratInfo((kini) => kini && { ...kini, available: false });
      }
      gagalPanel("Who sees it not saved", response ? failureMessage(data, "Who sees it not saved.") : PUTUS);
      return false;
    }
    const tersimpan = bacaSyaratBaris((data as { audience?: unknown }).audience);
    setSyaratSaved((kini) => {
      const next = tanpa(kini, itemId);
      return tersimpan ? { ...next, [itemId]: tersimpan } : next;
    });
    // Draf yang diubah lagi selama permintaan berjalan tetap ada.
    setSyaratDrafts((kini) => (JSON.stringify(kini[itemId]) === JSON.stringify(dikirim) ? tanpa(kini, itemId) : kini));
    return true;
  }

  function sasaranBerubah(sectionId: number) {
    if (!sasaranInfo?.available || !(sectionId in sasaranDrafts)) return false;
    return JSON.stringify(sasaranDrafts[sectionId]) !== JSON.stringify(sasaranSaved[sectionId] ?? null);
  }

  /** "One group" tanpa jawaban terpilih tidak disimpan setengah jadi. */
  function sasaranLengkap(sectionId: number) {
    const draf = sasaranDrafts[sectionId];
    if (!draf || draf.values.length > 0) return true;
    gagalPanel("Section not saved", "Choose a participant field and at least one answer under Show first for, or select Everyone.");
    return false;
  }

  async function saveSasaran(section: RundownSection): Promise<boolean> {
    const dikirim = sasaranDrafts[section.id];
    const response = await fetch(eventApiPath("/api/admin/rundown/sections/sasaran"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: section.id, audience: sasaranDrafts[section.id] ?? null }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      if (response?.status === 409 && (data as { error?: { code?: string } }).error?.code === "AUDIENCE_NOT_READY") {
        setSasaranInfo((current) => current && { ...current, available: false });
      }
      gagalPanel("Show first for not saved", response ? failureMessage(data, "Show first for not saved.") : PUTUS);
      return false;
    }
    setSasaranSaved((current) => ({ ...current, [section.id]: bacaSasaran((data as { audience?: unknown }).audience) }));
    // Draf yang diganti selama permintaan berjalan belum tersimpan: tetap ada.
    setSasaranDrafts((current) => (current[section.id] === dikirim ? tanpa(current, section.id) : current));
    return true;
  }

  // ---- Show before sign-in ---------------------------------------------------------
  /** Nilai draf bila ada, lalu yang tersimpan. Bagian baru = tampil (bawaan kolom). */
  function publikAktif(sectionId: number): boolean {
    return sectionId in publikDrafts ? publikDrafts[sectionId] : publikSaved[sectionId] ?? true;
  }

  function publikBerubah(sectionId: number) {
    if (!publikAda || !(sectionId in publikDrafts)) return false;
    return publikDrafts[sectionId] !== (publikSaved[sectionId] ?? true);
  }

  async function savePublik(section: RundownSection): Promise<boolean> {
    const dikirim = publikDrafts[section.id];
    const response = await fetch(eventApiPath("/api/admin/rundown/sections/publik"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: section.id, show_before_sign_in: dikirim }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      if (response?.status === 409 && (data as { error?: { code?: string } }).error?.code === "PUBLIC_DAY_NOT_READY") setPublikAda(false);
      gagalPanel("Show before sign-in not saved", response ? failureMessage(data, "Show before sign-in not saved.") : PUTUS);
      return false;
    }
    setPublikSaved((current) => ({ ...current, [section.id]: (data as { show_before_sign_in?: boolean }).show_before_sign_in !== false }));
    // Draf yang diganti selama permintaan berjalan belum tersimpan: tetap ada.
    setPublikDrafts((current) => (current[section.id] === dikirim ? tanpa(current, section.id) : current));
    return true;
  }

  // Dari `sections` yang tersimpan: sakelar yang belum disimpan belum mengubah halaman publik.
  const publishedCount = sections.filter((row) => row.is_published).length;
  // Menghapus bagian ikut menghapus barisnya: trip bus yang tertaut ke baris
  // itu disebut di dialog hapus, sama dengan dialog hapus satu baris.
  const tripBagian = kalimatHapus(activeItems.flatMap((item) => item.bus_trips ?? []).map((trip) => trip.name));
  // Dress code tersimpan yang ikut terhapus: yang menaut ke baris itu, atau seluruh isian bagian itu.
  const dcHapus = confirmItem ? (outfitSaved[confirmItem.section_id] ?? []).find((isian) => isian.item_id === confirmItem.id)?.what ?? null : null;
  const jumlahDcBagian = confirmSection ? (outfitSaved[confirmSection.id] ?? []).length : 0;

  // ---- Penjaga suntingan --------------------------------------------------------
  // Panel kanan membuka satu formulir, dan hanya formulir itu yang boleh punya
  // suntingan belum disimpan. Pindah tab, segmen atau baris, Close, Add item,
  // + Section dan meninggalkan halaman ditanyakan dulu (pola Speakers). Susun
  // ulang, urutan tab dan simpanan tidak menyentuh lapisan suntingan.
  // Tanpa bagian, hanya header yang bisa disunting. Dress code yang ternyata
  // belum bisa dipakai (kolomnya belum ada) kembali ke Section.
  const panelAktif: Panel = !active ? "header" : panel === "dresscode" && !dresscodeAda ? "bagian" : panel;
  const terbuka = formTerbuka(panelAktif, active?.id ?? null, selectedItem?.id ?? null);

  // Unggahan yang masih berjalan dihitung suntingan: hasilnya milik formulir
  // ini, jadi meninggalkannya ditanyakan dulu.
  function formBerubah(form: FormAgenda): boolean {
    if (form.jenis === "baris") {
      const asli = barisTersimpan.get(form.id);
      return Boolean(asli && suntingBaris?.id === form.id && adaBeda(asli, suntingBaris.isi)) || syaratBerubah(form.id);
    }
    if (form.jenis === "baru") {
      const draf = drafts[form.bagian];
      return (draf !== undefined && drafBaruBerubah(draf, jamAwal[form.bagian] ?? "")) || Boolean(syaratBaru[form.bagian]);
    }
    if (form.jenis === "bagian") {
      const asli = sections.find((row) => row.id === form.id);
      return Boolean(asli && suntingBagian?.id === form.id && adaBeda(asli, suntingBagian.isi)) || sasaranBerubah(form.id) || publikBerubah(form.id);
    }
    if (form.jenis === "dresscode") return dcBerubah(form.bagian) || uploadingOutfit?.bagian === form.bagian;
    return Boolean(suntingHeader && adaBeda(header, suntingHeader)) || uploadingBackground || uploadingBranding;
  }
  const berubah = formBerubah(terbuka);
  // Formulir terbuka sedang disimpan, atau New item-nya sedang ditambahkan.
  const menyimpan = terbuka.jenis === "baris" ? savingItem === terbuka.id
    : terbuka.jenis === "baru" ? addingItem
      : terbuka.jenis === "bagian" ? savingSection
        : terbuka.jenis === "dresscode" ? savingOutfit === terbuka.bagian
          : savingHeader;

  /** Unggahan yang masih berjalan untuk formulir yang ditinggalkan tidak lagi mendarat. */
  function sesiBaru() {
    sesiForm.current += 1;
    setSesi(sesiForm.current);
  }

  /** Lapisan formulir Section satu bagian: kolomnya dan Who it's for. */
  function buangBagian(id: number) {
    setSuntingBagian((kini) => (kini?.id === id ? null : kini));
    setSasaranDrafts((kini) => tanpa(kini, id));
    setPublikDrafts((kini) => tanpa(kini, id));
  }

  /** Kartu Dress code satu bagian dan foto yang sedang diunggah untuknya. */
  function buangDresscode(id: number) {
    setOutfitDrafts((kini) => tanpa(kini, id));
    setUploadingOutfit((kini) => (kini?.bagian === id ? null : kini));
    setPercobaanDc((kini) => (kini === id ? null : kini));
  }

  /** Formulir kembali ke nilai tersimpan: lapisan suntingannya dibuang. */
  function buangForm(form: FormAgenda) {
    setGalatPanel(null);
    sesiBaru();
    if (form.jenis === "baris") {
      const id = form.id;
      setSuntingBaris((kini) => (kini?.id === id ? null : kini));
      setSyaratDrafts((kini) => tanpa(kini, id));
    } else if (form.jenis === "baru") {
      const bagian = form.bagian;
      setDrafts((kini) => tanpa(kini, bagian));
      setSyaratBaru((kini) => tanpa(kini, bagian));
    } else if (form.jenis === "bagian") {
      buangBagian(form.id);
    } else if (form.jenis === "dresscode") {
      buangDresscode(form.bagian);
    } else {
      setSuntingHeader(null);
      setUploadingBackground(false);
      setUploadingBranding(false);
    }
  }

  /**
   * Jalankan `aksi` yang meninggalkan formulir terbuka (`ke`: formulir sesudah
   * aksi; tanpa `ke` selalu meninggalkan). Yang bersih dikosongkan, supaya
   * lapisannya tidak basi saat dibuka lagi. Yang bersuntingan ditanyakan dulu,
   * atau menunggu selama formulirnya disimpan. `fokus`: elemen yang terfokus
   * sebelum strip tab atau segmen memindahkan fokus ke tujuannya (sesudah
   * onChange), untuk Keep editing.
   */
  function lindungi(aksi: () => void, ke?: FormAgenda, fokus = fokusSekarang()) {
    if (ke && kunciForm(ke) === kunciForm(terbuka)) {
      aksi();
    } else if (!berubah) {
      buangForm(terbuka);
      aksi();
    } else if (menyimpan) {
      setSesudahSimpan({ aksi, ke, fokus });
    } else {
      setTertunda({ form: terbuka, aksi, fokus });
    }
  }

  // Simpanan selesai: aksi yang menunggu lewat lindungi() lagi. Berhasil dan
  // bersih = langsung jalan; gagal, atau ada ketikan baru selama permintaan
  // berjalan = ditanyakan.
  useEffect(() => {
    if (!sesudahSimpan || menyimpan) return;
    const timer = window.setTimeout(() => {
      setSesudahSimpan(null);
      lindungi(sesudahSimpan.aksi, sesudahSimpan.ke, sesudahSimpan.fokus);
    }, 0);
    return () => window.clearTimeout(timer);
  });

  /** Keep editing atau Esc: tetap di formulir. */
  function tetapSunting() {
    const fokus = tertunda?.fokus;
    setTertunda(null);
    // Sesudah Dialog mengembalikan fokusnya sendiri: ke tab atau segmen yang
    // masih terpilih, bukan ke tujuan yang batal dipilih.
    if (fokus) window.requestAnimationFrame(() => fokus.focus());
  }

  /** Pindah tab, baris terpilih atau segmen panel lewat lindungi(). */
  function pindah(tujuan: { bagian?: number; baris?: number | null; panel?: Panel }, lalu?: () => void) {
    const bagian = tujuan.bagian ?? activeId;
    const baris = tujuan.baris !== undefined ? tujuan.baris : bagian === activeId ? selectedItemId : null;
    const adaBaris = baris !== null && itemsTampil.some((row) => row.id === baris && row.section_id === bagian);
    lindungi(() => {
      if (tujuan.bagian !== undefined) setActiveId(tujuan.bagian);
      setSelectedItemId(baris);
      if (tujuan.panel) setPanel(tujuan.panel);
      lalu?.();
    }, formTerbuka(tujuan.panel ?? panel, bagian, adaBaris ? baris : null));
  }

  /** Galat aksi panel kanan: di kaki panel, dekat tombolnya, dan di toast. */
  function gagalPanel(judul: string, pesan: string) {
    setGalatPanel({ kunci: kunciForm(terbuka), pesan });
    toast.error(judul, pesan);
  }

  /** Nama tersimpan untuk judul dialog: judul baris atau label tab. */
  function namaForm(form: FormAgenda): string | null {
    if (form.jenis === "baris") return barisTersimpan.get(form.id)?.title ?? null;
    if (form.jenis === "bagian") return sections.find((row) => row.id === form.id)?.name ?? null;
    if (form.jenis === "dresscode") return sections.find((row) => row.id === form.bagian)?.name ?? null;
    return null;
  }

  /**
   * Segmen Dress code lewat penjaga. Di bawah 1024px panelnya di bawah jadwal,
   * jadi judulnya digulir ke layar dan difokus; tanpa itu klik di baris Dress
   * code tampak tidak berbuat apa-apa.
   */
  function bukaDresscode() {
    pindah({ panel: "dresscode" }, () => window.setTimeout(() => {
      if (window.matchMedia("(min-width: 1024px)").matches) return;
      const judul = document.getElementById(idJudulDc);
      judul?.scrollIntoView({ block: "start" });
      judul?.focus({ preventScroll: true });
    }, 0));
  }

  /** Dari Edit item: segmen Dress code, lalu What to wear di kartu baris itu, atau kartu baru untuknya. */
  function dresscodeBaris(item: RundownItem, baru: boolean) {
    const bagian = item.section_id;
    pindah({ panel: "dresscode" }, () => {
      const kartu = baru ? kartuBaru("baris", item.id) : null;
      if (kartu) setOutfitDrafts((kini) => ({ ...kini, [bagian]: [...(kini[bagian] ?? keDraf(outfitSaved[bagian] ?? [])), kartu] }));
      const pilih = kartu ? `[data-dresscode-kartu="${kartu.kunci}"]` : `[data-dresscode-baris="${item.id}"]`;
      window.setTimeout(() => document.querySelector<HTMLElement>(`${pilih} [data-dresscode-apa]`)?.focus(), 0);
    });
  }

  // Menutup atau memuat ulang tab, rel navigasi dan palet perintah juga
  // ditanyakan selama formulir terbuka punya suntingan.
  useJagaNavigasi(berubah, (lanjut) => lindungi(lanjut, undefined, null));
  const galatKaki = galatPanel?.kunci === kunciForm(terbuka) ? galatPanel.pesan : null;

  // ---- Panel utama: jadwal bagian aktif -------------------------------------------
  const jadwal = active ? (
    <Pane aria-label={`${active.name} schedule`}>
      <PaneHeader>
        <h2 className="text-body-medium font-semibold text-on-surface">Schedule</h2>
        <span className="tabular-nums text-body-medium text-on-surface-variant">{plural(activeItems.length, "item")}</span>
        <span className="min-w-0 flex-1 truncate text-body-medium text-on-surface-variant max-sm:hidden">
          {adaSlotParalel ? "Drag to reorder same-time items" : "Sorted by start time automatically"}
        </span>
        <Button variant="outlined" size="sm" className="ml-auto" icon={<Plus size={16} />} onClick={mulaiTambahBaris}>Add item</Button>
      </PaneHeader>
      {barisDcTampil ? (
        // Di antara kepala panel dan daftar yang bergulir: tidak pernah tergulir hilang.
        <BarisDresscode
          keadaan={outfitMuat}
          baris={ringkasDresscode(outfitSaved[active.id] ?? [], (id) => {
            const row = barisTersimpan.get(id);
            return row && row.section_id === active.id ? row : null;
          })}
          // Every day tampil seperti dibaca peserta: tidak, bila tab punya Whole day tersimpan sendiri.
          setiap={setiapHariDiTab(outfitSaved[active.id] ?? [], outfitInfo?.every_day)?.what ?? null}
          labelTab={(sections.find((row) => row.id === active.id)?.name ?? active.name).trim()}
          dipilih={panelAktif === "dresscode"}
          belum={dcBerubah(active.id) || uploadingOutfit?.bagian === active.id}
          onBuka={bukaDresscode}
          onCobaLagi={() => void loadOutfit()}
        />
      ) : null}
      <PaneBody>
        {activeItems.length === 0 ? (
          <EmptyState
            plain
            title="No agenda items yet"
            description="Fill in the New item form in the side panel. Items are sorted by start time, so there is nothing to reorder."
          />
        ) : (
          <div>
            {activeItems.map((item) => {
              const keterangan = teksPolos(item.subtitle).split("\n").map((line) => line.trim()).filter(Boolean).join(" · ");
              const kunci = kunciSlot(item.start_time);
              const slotIds = slots.get(kunci) ?? [];
              const paralel = slotIds.length > 1;
              const posisi = slotIds.indexOf(item.id);
              const judul = item.title.trim() || "Untitled";
              const garis = dropTarget?.id === item.id && dragId !== null && dragId !== item.id ? (dropTarget.after ? "bottom" : "top") : null;
              return (
                <div key={item.id}>
                  {paralel && posisi === 0 ? (
                    <div className="flex items-center gap-2 border-b border-outline-variant py-2 pr-4 pl-4 text-body-small pointer-fine:pl-10 text-on-surface-variant">
                      <Stack size={16} aria-hidden />
                      {slotIds.length} items start at {formatClock(item.start_time)}
                    </div>
                  ) : null}
                  <div
                    data-rundown-row={item.id}
                    className={cx("relative", dragId === item.id && "opacity-50")}
                    onDragOver={paralel && dragId !== null && slotIds.includes(dragId) ? (event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      const kotak = event.currentTarget.getBoundingClientRect();
                      const after = event.clientY > kotak.top + kotak.height / 2;
                      if (dropTarget?.id !== item.id || dropTarget.after !== after) setDropTarget({ id: item.id, after });
                    } : undefined}
                    onDrop={paralel && dragId !== null && slotIds.includes(dragId) ? (event) => {
                      event.preventDefault();
                      const tanpa = slotIds.filter((id) => id !== dragId);
                      const ke = tanpa.indexOf(item.id) + (dropTarget?.after ? 1 : 0);
                      const next = dragId === item.id ? null : pindahDalamSlot(slotIds, dragId, ke);
                      const moved = dragId;
                      setDragId(null); setDropTarget(null);
                      if (next) void reorderSlot(next, moved);
                    } : undefined}
                  >
                    <ListRow
                      selected={item.id === selectedItemId}
                      onSelect={() => pindah({ baris: item.id, panel: "baris" })}
                      className={cx("items-start py-3", adaSlotParalel && "pointer-fine:pl-10!")}
                    >
                      <span className="w-28 shrink-0 tabular-nums text-on-surface">
                        {formatClock(item.start_time)}{item.end_time ? `–${formatClock(item.end_time)}` : ""}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={cx("min-w-0 truncate", item.is_break ? "text-on-surface-variant" : "font-medium text-on-surface")}>
                            {judul}
                          </span>
                          {item.is_break ? <StatusChip>Break</StatusChip> : null}
                          {item.is_published ? null : <StatusChip tone="warning">Hidden</StatusChip>}
                          {item.bus_trips?.length ? (
                            <StatusChip title={item.bus_trips.length === 1 ? "Vehicle trip linked in Logistics" : `${item.bus_trips.length} vehicle trips linked in Logistics`}>Vehicle</StatusChip>
                          ) : null}
                        </span>
                        {keterangan ? <span className="mt-0.5 block truncate text-on-surface-variant">{keterangan}</span> : null}
                        {/* Baris sendiri, supaya judul tidak terpotong di layar sempit. */}
                        {syaratSaved[item.id] ? (
                          <span className="mt-1 flex min-w-0">
                            {syaratMati(syaratSaved[item.id], syaratInfo) ? (
                              <StatusChip tone="error" icon={<UsersThree size={14} aria-hidden />} title="Who sees it: a chosen field or answer no longer exists, so nobody sees this row">
                                <span className="truncate">Nobody sees this{ringkasSyarat(syaratSaved[item.id], syaratInfo) ? ` · ${ringkasSyarat(syaratSaved[item.id], syaratInfo)}` : ""}</span>
                              </StatusChip>
                            ) : (
                              <StatusChip tone="primary" icon={<UsersThree size={14} aria-hidden />} title="Who sees it: only participants who match every condition">
                                <span className="truncate">{ringkasSyarat(syaratSaved[item.id], syaratInfo)}</span>
                              </StatusChip>
                            )}
                          </span>
                        ) : null}
                      </span>
                    </ListRow>
                    {/* Pegangan berada di luar <ListRow> karena ListRow sendiri sebuah
                        <button>; tombol di dalam tombol tidak sah. Panah atas/bawah
                        pada pegangan menggeser baris tanpa tetikus. */}
                    {paralel ? (
                      <button
                        type="button"
                        // aria-disabled, bukan disabled: tombol yang dinonaktifkan
                        // kehilangan fokus, sehingga pengguna keyboard terlempar
                        // keluar setiap kali satu langkah sedang disimpan.
                        draggable={!reordering}
                        aria-disabled={reordering || undefined}
                        aria-label={`Reorder ${judul}, position ${posisi + 1} of ${slotIds.length} at ${formatClock(item.start_time)}`}
                        title="Drag to reorder, or use the arrow keys"
                        aria-describedby="rundown-reorder-hint"
                        className="absolute top-3 left-2 flex pointer-coarse:hidden size-6 cursor-grab items-center justify-center rounded-md text-on-surface-variant hover:bg-primary-soft hover:text-on-surface active:cursor-grabbing aria-disabled:cursor-default aria-disabled:opacity-40"
                        onKeyDown={(event) => {
                          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                          event.preventDefault();
                          moveInSlot(item, event.key === "ArrowUp" ? -1 : 1);
                        }}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", String(item.id));
                          const baris = event.currentTarget.closest("[data-rundown-row]");
                          if (baris instanceof HTMLElement) event.dataTransfer.setDragImage(baris, 24, 20);
                          setDragId(item.id);
                        }}
                        onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                      >
                        <DotsSixVertical size={18} weight="bold" aria-hidden />
                      </button>
                    ) : null}
                    {garis ? (
                      <span aria-hidden className={cx("pointer-events-none absolute right-4 left-10 h-0.5 rounded-full bg-primary", garis === "top" ? "-top-px" : "-bottom-px")} />
                    ) : null}
                  </div>
                </div>
              );
            })}
            <p role="status" className="sr-only">{reorderNote}</p>
            <span id="rundown-reorder-hint" hidden>Use the up and down arrow keys to move this item among items with the same start time.</span>
          </div>
        )}
      </PaneBody>
    </Pane>
  ) : (
    <Pane aria-label="Schedule">
      <EmptyState
        plain
        title="No agenda sections yet"
        description="Each section is a tab on the public page, usually one per day or per event. New sections start as drafts."
        action={<Button size="sm" icon={<Plus size={16} />} onClick={() => lindungi(() => setAddSectionOpen(true))}>Add section</Button>}
      />
    </Pane>
  );

  // ---- Panel samping: baris --------------------------------------------------------
  // Dress code tersimpan tab baris terpilih, untuk catatan di bawah Title.
  const dcBaris = selectedItem && dresscodeAda ? outfitSaved[selectedItem.section_id] ?? [] : null;
  const isiBaris = selectedItem ? (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 text-body-medium font-semibold text-on-surface">Edit item</h3>
        <Button variant="text" size="sm" onClick={() => pindah({ baris: null })}>Close</Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Start"
          type="time"
          inputClassName="tabular-nums"
          value={formatClock(selectedItem.start_time)}
          onChange={(event) => updateItem(selectedItem.id, { start_time: event.target.value })}
        />
        <TextField
          label="End"
          optional
          type="time"
          inputClassName="tabular-nums"
          value={selectedItem.end_time ? formatClock(selectedItem.end_time) : ""}
          onChange={(event) => updateItem(selectedItem.id, { end_time: event.target.value || null })}
        />
        {selectedItem.bus_trips?.length ? (
          <CatatanBus
            item={selectedItem}
            trips={selectedItem.bus_trips}
            jamTersimpan={barisTersimpan.get(selectedItem.id)?.start_time ?? selectedItem.start_time}
            tanggalTersimpan={sections.find((row) => row.id === selectedItem.section_id)?.event_date ?? active?.event_date ?? ""}
            zone={zone}
          />
        ) : null}
      </div>
      <TextField label="Title" value={selectedItem.title} onChange={(event) => updateItem(selectedItem.id, { title: event.target.value })} />
      {dcBaris ? (
        <CatatanDresscodeBaris
          apa={dcBaris.find((isian) => isian.item_id === selectedItem.id)?.what ?? null}
          penuh={dcBaris.length >= OUTFIT_MAX}
          tersembunyi={!barisTersimpan.get(selectedItem.id)?.is_published}
          onBuka={() => (dcBaris.some((isian) => isian.item_id === selectedItem.id) ? dresscodeBaris(selectedItem, false) : bukaDresscode())}
          onTambah={() => dresscodeBaris(selectedItem, true)}
        />
      ) : null}
      {jamBelumDisimpan && selectedSlotLokal > 1 ? (
        <p className="border-t border-outline-variant pt-4 text-body-small text-on-surface-variant">
          Save the time change first to reorder items that start at {kunciSlot(selectedItem.start_time).slice(0, 5)}.
        </p>
      ) : null}
      {selectedSlot.length > 1 ? (
        <div className="flex flex-col gap-2 border-t border-outline-variant pt-4">
          <div>
            <p className="text-body-medium font-medium text-on-surface">Order at {formatClock(selectedItem.start_time)}</p>
            <p className="text-body-small text-on-surface-variant">
              {selectedSlot.indexOf(selectedItem.id) + 1} of {selectedSlot.length} items that start at {formatClock(selectedItem.start_time)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outlined"
              size="sm"
              icon={<ArrowUp size={16} />}
              data-move="up"
              // aria-disabled, bukan disabled: tombol yang dinonaktifkan melepas
              // fokus ke <body>. Klik saat tidak berlaku diabaikan di sini.
              aria-disabled={reordering || selectedSlot[0] === selectedItem.id || undefined}
              className="aria-disabled:cursor-default aria-disabled:opacity-40"
              onClick={() => { if (!reordering && selectedSlot[0] !== selectedItem.id) moveInSlot(selectedItem, -1, true); }}
            >
              Move up
            </Button>
            <Button
              variant="outlined"
              size="sm"
              icon={<ArrowDown size={16} />}
              data-move="down"
              aria-disabled={reordering || selectedSlot[selectedSlot.length - 1] === selectedItem.id || undefined}
              className="aria-disabled:cursor-default aria-disabled:opacity-40"
              onClick={() => { if (!reordering && selectedSlot[selectedSlot.length - 1] !== selectedItem.id) moveInSlot(selectedItem, 1, true); }}
            >
              Move down
            </Button>
          </div>
        </div>
      ) : null}
      {/* textarea, bukan input satu baris: satu butir acara bisa memuat beberapa
          pembicara, dan tiap baris tampil sebagai butir terpisah di halaman publik. */}
      <RichDetailsField
        key={selectedItem.id}
        label="Details"
        optional
        placeholder={CONTOH_KETERANGAN}
        hint={HINT_KETERANGAN}
        value={selectedItem.subtitle ?? ""}
        onChange={(value) => updateItem(selectedItem.id, { subtitle: value })}
      />
      <Switch
        checked={selectedItem.is_break}
        onChange={(checked) => updateItem(selectedItem.id, { is_break: checked })}
        label="Break"
        description="Shown dimmed on the public page."
      />
      <Switch
        checked={selectedItem.is_published}
        onChange={(checked) => updateItem(selectedItem.id, { is_published: checked })}
        label="Published"
        description="Off hides this row everywhere, participant pages and its dress code line included."
      />
      {syaratInfo ? (
        <KelompokSiapaMelihat
          info={syaratInfo}
          value={selectedItem.id in syaratDrafts ? syaratDrafts[selectedItem.id] : syaratSaved[selectedItem.id] ?? null}
          tersimpan={syaratSaved[selectedItem.id] ?? null}
          tanggal={sections.find((row) => row.id === selectedItem.section_id)?.event_date ?? null}
          onChange={(next) => setSyaratDrafts((kini) => ({ ...kini, [selectedItem.id]: next }))}
          onUbahLabel={ubahLabel}
        />
      ) : null}
    </div>
  ) : active ? (
    <div className="flex flex-col gap-4">
      <h3 className="text-body-medium font-semibold text-on-surface">New item</h3>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Start" type="time" inputClassName="tabular-nums" value={draft.start_time} onChange={(event) => updateDraft({ start_time: event.target.value })} />
        <TextField label="End" optional type="time" inputClassName="tabular-nums" value={draft.end_time} onChange={(event) => updateDraft({ end_time: event.target.value })} />
      </div>
      <TextField
        label="Title"
        placeholder="e.g. Opening Keynote Speech"
        data-draft-title=""
        value={draft.title}
        onChange={(event) => updateDraft({ title: event.target.value })}
      />
      <RichDetailsField
        label="Details"
        optional
        placeholder={CONTOH_KETERANGAN}
        hint={HINT_KETERANGAN}
        value={draft.subtitle}
        onChange={(value) => updateDraft({ subtitle: value })}
      />
      <Switch checked={draft.is_break} onChange={(checked) => updateDraft({ is_break: checked })} label="Break" description="Shown dimmed on the public page." />
      {syaratInfo ? (
        <KelompokSiapaMelihat
          info={syaratInfo}
          tombol="Add item"
          tanggal={active.event_date ?? null}
          value={syaratBaru[active.id] ?? null}
          onChange={(next) => setSyaratBaru((kini) => ({ ...kini, [active.id]: next }))}
          onUbahLabel={ubahLabel}
        />
      ) : null}
      <p className="text-body-medium text-on-surface-variant">Leave the end time empty to mark a single moment. Select an item in the schedule to edit it.</p>
    </div>
  ) : null;

  // ---- Panel samping: bagian -------------------------------------------------------
  const isiBagian = active ? (
    <div className="flex flex-col gap-5">
      <Kelompok title="This section" first>
        <TextField
          label="Tab label"
          hint="Keep it short so several tabs fit on a phone screen."
          value={active.name}
          onChange={(event) => updateSection(active.id, { name: event.target.value })}
        />
        <TextField
          label="Date"
          type="date"
          hint={`Used to highlight what is happening now. ${formatStaffDate(active.event_date)} (${abbr})`}
          value={active.event_date}
          onChange={(event) => updateSection(active.id, { event_date: event.target.value })}
        />
        {diLuarAcara(active.event_date, eventDates) ? (
          // U-09: bagian bertanggal di luar acara membuat hitungan hari dan
          // penanda "sekarang" salah, dan biasanya tanda tanggal yang tertinggal.
          <Banner tone="warning" icon={<Warning size={18} />}>
            This date is outside the event ({rentangAcara(eventDates!)}). Check it, or change the event dates on the Event page.
          </Banner>
        ) : null}
        {sectionsUrut.length > 1 ? (
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-body-medium font-medium text-on-surface">Tab order</p>
              <p className="text-body-small text-on-surface-variant">
                Tab {idBagian.indexOf(active.id) + 1} of {idBagian.length}. Saved straight away; the event page uses the same order.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outlined"
                size="md"
                icon={<ArrowLeft size={16} />}
                data-move-tab="left"
                aria-disabled={reordering || idBagian[0] === active.id || undefined}
                className="aria-disabled:cursor-default aria-disabled:opacity-40"
                onClick={() => { if (!reordering && idBagian[0] !== active.id) moveSection(active, -1); }}
              >
                Move left
              </Button>
              <Button
                variant="outlined"
                size="md"
                icon={<ArrowRight size={16} />}
                data-move-tab="right"
                aria-disabled={reordering || idBagian[idBagian.length - 1] === active.id || undefined}
                className="aria-disabled:cursor-default aria-disabled:opacity-40"
                onClick={() => { if (!reordering && idBagian[idBagian.length - 1] !== active.id) moveSection(active, 1); }}
              >
                Move right
              </Button>
              <Button
                variant="text"
                size="md"
                aria-disabled={reordering || sudahUrutTanggal || undefined}
                className="aria-disabled:cursor-default aria-disabled:opacity-40"
                onClick={() => { if (!reordering && !sudahUrutTanggal) void reorderSections(idMenurutTanggal, "Tabs sorted by date."); }}
              >
                Sort all by date
              </Button>
            </div>
          </div>
        ) : null}
        {/* Kolom "Judul di halaman publik" dan "Sub judul" per bagian sengaja
            tidak ada: judul header kini satu untuk seluruh acara (panel Header
            publik). Kolomnya tetap ada di database supaya data lama tidak rusak. */}
      </Kelompok>
      <Kelompok title="On the public page">
        {/* Sakelar penanda ditaruh bersama tanggal karena keduanya satu urusan:
            penanda hanya benar bila tanggalnya benar. */}
        <Switch
          checked={active.highlight_current}
          onChange={(checked) => updateSection(active.id, { highlight_current: checked })}
          label="Highlight the current item"
          description={active.highlight_current
            ? "The public page highlights the current item, marks the next one, dims finished items and scrolls to the current item automatically. The date above must be correct."
            : "The schedule shows as a plain list, with no highlight and no automatic scrolling. Use this until the event date arrives."}
        />
      </Kelompok>
      <Kelompok title="Visibility">
        {/* is_published menyembunyikan bagian di mana pun, portal peserta juga:
            namanya dulu "Show on public page" dan tertukar dengan sakelar di bawahnya. */}
        <Switch
          checked={active.is_published}
          onChange={(checked) => updateSection(active.id, { is_published: checked })}
          label="Published"
          description="Participants see this section. Off hides it everywhere."
        />
        {publikAda ? (
          <Switch
            checked={publikAktif(active.id)}
            onChange={(checked) => setPublikDrafts((current) => ({ ...current, [active.id]: checked }))}
            label="Show before sign-in"
            description={!active.is_published
              ? "Applies once Published is on."
              : publikAktif(active.id)
                ? `Visitors who have not signed in see this day on the event page and at /rundown?sesi=${active.slug}.`
                : "Only participants who have signed in see this day. The event page and /rundown leave it out."}
          />
        ) : null}
      </Kelompok>
      {sasaranInfo?.horizon ? <KelompokSasaran info={sasaranInfo} value={sasaranAktif} onChange={setSasaranAktif} /> : null}
      <section className="flex items-center gap-3 border-t border-outline-variant pt-5">
        <div className="min-w-0 flex-1">
          <p className="text-body-medium font-medium text-on-surface">Delete section</p>
          <p className="text-body-medium text-on-surface-variant">All of its agenda items are deleted too.</p>
        </div>
        <Button simpan variant="outlined" size="sm" className="text-error" icon={<Trash size={16} />} onClick={() => setConfirmSection(sections.find((row) => row.id === active.id) ?? active)}>Delete</Button>
      </section>
    </div>
  ) : null;

  // ---- Panel samping: dress code ---------------------------------------------------
  // Segmen sendiri, bukan kelompok di Section: dress code disimpan sendiri, jadi
  // isian yang belum lengkap tidak memblokir Save section. `key` dengan sesi:
  // Discard memasang kartu baru tanpa catatan yang tadi dibuka.
  const tabDc = active ? sections.find((row) => row.id === active.id) ?? null : null;
  const isiDresscode = active && tabDc && dresscodeAda ? (
    <EditorDresscode
      key={`${active.id}-${sesi}`}
      idJudul={idJudulDc}
      tab={{ id: active.id, name: tabDc.name }}
      labelHalaman={labelOutfit(outfitInfo?.label)}
      labelBatch={labelTabOutfit(sections, active.id, tabTerlihat)}
      setiapHari={outfitInfo?.every_day ?? null}
      daftar={drafDc(active.id)}
      onUbah={(next) => setOutfitDrafts((kini) => ({ ...kini, [active.id]: next }))}
      baris={barisTab(active.id)}
      tautanTersimpan={new Set((outfitSaved[active.id] ?? []).flatMap((isian) => (isian.item_id ? [isian.item_id] : [])))}
      banner={bannerDresscode({
        tab: tabDc,
        tabs: sections,
        terlihat,
        bersasaran: sasaranInfo ? (id) => Boolean(sasaranSaved[id]) : null,
        jumlahIsian: (id) => (id === active.id ? drafDc(id).length : (outfitSaved[id] ?? []).length),
      })}
      tabLain={[...sections]
        .sort(bandingkanBagian)
        .filter((row) => row.id !== active.id && row.event_date === tabDc.event_date && (outfitSaved[row.id] ?? []).length === 0)
        .map((row) => ({ id: row.id, name: row.name }))}
      coba={percobaanDc === active.id}
      unggah={uploadingOutfit?.bagian === active.id ? uploadingOutfit.kunci : null}
      menyimpan={savingOutfit === active.id}
      onUnggah={(kunci, file) => void uploadFotoDresscode(kunci, file)}
      onBukaBagian={() => pindah({ panel: "bagian" })}
      onBukaTab={(id) => pindah({ bagian: id, panel: "dresscode" })}
    />
  ) : null;

  // ---- Panel samping: header publik -------------------------------------------------
  // Header ditaruh di segmen tersendiri, bukan di dalam setelan bagian: posisinya
  // harus mencerminkan cakupannya. Di dalam setelan bagian, admin wajar
  // menyimpulkan isinya hanya berlaku untuk tab yang sedang dipilih.
  const isiHeader = (
    <div className="flex flex-col gap-5">
      <p className="flex items-start gap-2 rounded-md bg-surface-container-high p-3 text-body-medium text-on-surface-variant">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
        Applies to every tab. The appearance fields are optional; left empty, the header uses the default theme.
      </p>
      <Kelompok title="Title" first>
        <TextField
          label="Event title"
          hint="Shown the same on every tab."
          placeholder="e.g. PRIMA EXECUTIVE GATHERING"
          value={headerTampil.event_title}
          onChange={(event) => updateHeader({ event_title: event.target.value })}
        />
        <TextField
          label="Event subtitle"
          optional
          hint="Up to two lines on the public page."
          placeholder="e.g. Beyond Tomorrow: Securing Progress"
          value={headerTampil.event_subtitle ?? ""}
          onChange={(event) => updateHeader({ event_subtitle: event.target.value })}
        />
      </Kelompok>

      {/* Warna boleh dikosongkan, dan itu tidak bisa dilakukan <input type="color">
          yang selalu punya nilai. Jadi tiap warna dipasangkan tombol kembali ke
          bawaan (null). */}
      <Kelompok title="Colours">
        {([
          ["background_color", "Header background"],
          ["text_color", "Text colour"],
          ["accent_color", "Accent (tab underline)"],
        ] as const).map(([key, label]) => (
          <div key={key} className="flex items-center gap-3">
            <input
              id={`header-${key}`}
              type="color"
              value={headerTampil[key] ?? BRANDING_FALLBACK[key]}
              onChange={(event) => updateHeader({ [key]: event.target.value })}
              className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-outline-variant bg-transparent"
            />
            <label htmlFor={`header-${key}`} className="min-w-0 flex-1">
              <span className="block text-body-medium font-medium text-on-surface">{label}</span>
              <span className="block text-body-medium text-on-surface-variant">{headerTampil[key] ? headerTampil[key]?.toUpperCase() : "Uses the default theme"}</span>
            </label>
            <Button variant="outlined" size="sm" disabled={!headerTampil[key]} onClick={() => updateHeader({ [key]: null })} aria-label={`Reset ${label.toLowerCase()} to default`}>
              Default
            </Button>
          </div>
        ))}
      </Kelompok>

      {/* Gambar latar berdiri DI ATAS warna, bukan menggantikannya. Warna tetap
          dipakai di belakangnya supaya teks tidak hilang bila gambar gagal dimuat. */}
      <Kelompok title="Background image" note="A dark overlay is added automatically and the text turns white so it stays readable. PNG, JPG or WebP, up to 5 MB.">
        <div className="flex flex-wrap items-center gap-2">
          {headerTampil.background_image_url ? (
            <span className="h-12 w-20 shrink-0 rounded-md border border-outline-variant bg-cover bg-center" style={{ backgroundImage: `url(${headerTampil.background_image_url})` }} />
          ) : null}
          <label className={cx(
            "inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-medium font-medium text-on-surface hover:bg-primary-soft focus-within:ring-2 focus-within:ring-primary",
            uploadingBackground && "pointer-events-none opacity-60",
          )}>
            <UploadSimple size={16} aria-hidden />
            {uploadingBackground ? "Uploading…" : headerTampil.background_image_url ? "Replace image" : "Upload image"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={uploadingBackground}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadHeaderBackground(file);
                // Direset supaya memilih berkas yang sama dua kali tetap memicu onChange.
                event.target.value = "";
              }}
            />
          </label>
          {headerTampil.background_image_url ? (
            <Button variant="text" size="sm" className="text-error" onClick={() => updateHeader({ background_image_url: null })}>Remove image</Button>
          ) : null}
        </div>
      </Kelompok>

      {/* Editor logo, jenis huruf, ukuran, dan warna per elemen. Komponen yang sama
          dipakai /admin/seat-map dan /admin/display. */}
      <Kelompok title="Logo and type">
        {/* Unggahan logo atau gambar sponsor ikut penjaga suntingan header. Hasil
            yang tiba sesudah header dibuang ditolak: sesinya sudah berganti, dan
            `key` memasang editor baru tanpa "Uploading…" yang tertinggal. */}
        <BrandingEditor
          key={sesi}
          value={headerBranding}
          onChange={(changes) => {
            if (sesi !== sesiForm.current) return false;
            updateHeader(changes);
          }}
          onUploadingChange={(uploading) => {
            if (sesi === sesiForm.current) setUploadingBranding(uploading);
          }}
          idPrefix="rundown-header"
          baseTextColor={headerTampil.text_color ?? "#1a1a1a"}
          baseBackgroundColor={headerTampil.background_color ?? "#ffffff"}
          baseAccentColor={headerTampil.accent_color ?? "#2649d0"}
        />
      </Kelompok>
    </div>
  );

  const draftLengkap = Boolean(draft.title.trim() && draft.start_time);
  // Catatan kaki mengatakan yang benar: "Unsaved changes" selama formulir ini
  // punya suntingan yang belum disimpan.
  const belumDisimpan = berubah ? "Unsaved changes" : null;
  const kaki: Record<Panel, { note: ReactNode; aksi: ReactNode }> = {
    baris: selectedItem
      ? {
        note: belumDisimpan,
        aksi: (
          <>
            <Button simpan variant="outlined" size="sm" className="text-error" icon={<Trash size={16} />} onClick={() => setConfirmItem(barisTersimpan.get(selectedItem.id) ?? selectedItem)}>Delete</Button>
            <Button simpan size="sm" onClick={() => void saveItem(selectedItem)} loading={savingItem === selectedItem.id}>Save item</Button>
          </>
        ),
      }
      : {
        note: draftLengkap ? belumDisimpan : "Start time and title are required",
        aksi: active ? <Button simpan size="sm" icon={<Plus size={16} />} onClick={() => void addItem()} loading={addingItem} disabled={!draftLengkap}>Add item</Button> : null,
      },
    bagian: {
      note: belumDisimpan ?? "This section only",
      aksi: active ? <Button simpan size="sm" onClick={() => void saveSection(active)} loading={savingSection}>Save section</Button> : null,
    },
    dresscode: {
      note: belumDisimpan ?? "This tab only",
      // Menunggu foto selesai diunggah: tersimpan bersama, bukan sesudahnya sebagai suntingan baru.
      aksi: active ? (
        <Button simpan size="sm" onClick={() => void saveDresscode(active)} loading={savingOutfit === active.id} disabled={!dcBerubah(active.id) || uploadingOutfit?.bagian === active.id}>
          Save dress code
        </Button>
      ) : null,
    },
    header: {
      note: belumDisimpan ?? "Applies to every tab",
      aksi: <Button simpan size="sm" onClick={() => void saveHeader()} loading={savingHeader}>Save header</Button>,
    },
  };

  const samping = (
    <Pane as="aside" aria-label="Agenda editor">
      <div className="shrink-0 border-b border-outline-variant px-4 py-3">
        {/* Empat segmen di Horizon: padat, supaya muat di ponsel 360px. Acara lain tetap tiga. */}
        <SegmentedButton<Panel>
          label="Editing"
          value={panelAktif}
          onChange={(next) => pindah({ panel: next })}
          className="w-full"
          padat={dresscodeAda}
          options={[
            { value: "baris", label: "Item", disabled: !active },
            { value: "bagian", label: "Section", disabled: !active },
            ...(dresscodeAda ? [{ value: "dresscode" as const, label: "Dress code", disabled: !active }] : []),
            { value: "header", label: "Header" },
          ]}
        />
      </div>
      <PaneBody className="px-4 py-4">
        {panelAktif === "baris" ? isiBaris : panelAktif === "bagian" ? isiBagian : panelAktif === "dresscode" ? isiDresscode : isiHeader}
      </PaneBody>
      <PaneFooter
        note={galatKaki ? (
          // Galat simpan di samping tombolnya, dengan bentuk galat TextField.
          <div className="[&>p]:mt-0"><FieldMessages id={idGalat} error={galatKaki} /></div>
        ) : kaki[panelAktif].note}
      >
        {kaki[panelAktif].aksi}
      </PaneFooter>
    </Pane>
  );

  return (
    <WorkspacePage fill>
      <div lang="en" className="contents">
      <WorkspaceHeader
        meta={loaded ? (
          <>
            <span>
              {publishedCount === 0
                ? "No sections are published yet, so the public page still shows a holding message"
                : `${publishedCount} of ${plural(sections.length, "section")} published`}
            </span>
            <MetaSeparator />
            <span>The current-item highlight uses the section date and item times</span>
          </>
        ) : null}
        actions={<ButtonLink href="/rundown" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Open public page</ButtonLink>}
      />

      {error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : null}

      {!loaded ? (error ? null : <PageLoading />) : (
        <>
          <div className="flex shrink-0 items-end gap-2 border-b border-outline-variant">
            {sections.length > 0 ? (
              // Tabs membawa shrink-0; pembungkus ini yang menyempit agar tombol + Bagian tetap di layar.
              <div className="min-w-0">
                <Tabs
                  label="Agenda sections"
                  idPrefix="bagian"
                  value={String(activeId ?? "")}
                  onChange={(value) => pilihBagian(Number(value))}
                  className="border-b-0"
                  // Draft mengikuti is_published yang tersimpan, bukan sakelar yang belum disimpan.
                  options={sectionsUrut.map((section) => ({
                    value: String(section.id),
                    label: section.name,
                    badge: sections.some((row) => row.id === section.id && row.is_published) ? undefined : "Draft",
                  }))}
                />
              </div>
            ) :<span className="py-2.5 text-body-medium text-on-surface-variant">No sections yet</span>}
            <button type="button" onClick={() => lindungi(() => setAddSectionOpen(true))} className="mb-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-body-medium font-medium text-primary hover:bg-primary-soft">
              <Plus size={14} aria-hidden />Section
            </button>
          </div>
          <div
            role={active ? "tabpanel" : undefined}
            id={active ? `bagian-panel-${active.id}` : undefined}
            aria-labelledby={active ? `bagian-tab-${active.id}` : undefined}
            className="flex min-h-0 flex-1 flex-col"
          >
            <SupportingPane main={jadwal} pane={samping} paneWidth={420} />
          </div>
        </>
      )}

      <Dialog
        open={addSectionOpen}
        onClose={() => { setAddSectionOpen(false); setNewSectionName(""); }}
        dismissible={!creatingSection}
        size="sm"
        title="Add section"
        description="New sections start as drafts, so they are not on the public page yet."
        actions={
          <>
            <Button variant="outlined" disabled={creatingSection} onClick={() => { setAddSectionOpen(false); setNewSectionName(""); }}>Cancel</Button>
            <Button simpan type="submit" form="form-bagian" loading={creatingSection} disabled={!newSectionName.trim()}>Add section</Button>
          </>
        }
      >
        <form id="form-bagian" className="mt-4" onSubmit={(event) => { event.preventDefault(); void createSection(); }}>
          <TextField label="Section name" autoFocus placeholder="e.g. Prima Awards" value={newSectionName} onChange={(event) => setNewSectionName(event.target.value)} />
        </form>
      </Dialog>

      <Dialog
        open={confirmItem !== null}
        onClose={() => setConfirmItem(null)}
        dismissible={deletingItem === null}
        tone="danger"
        title={`Delete ${confirmItem?.title.trim() || "this item"}?`}
        // Trip bus yang tertaut tetap ada dengan jam terakhirnya; tautannya
        // dikosongkan database (FK on delete set null). Dress code yang menaut
        // ke baris ini ikut dihapus server, jadi keduanya disebut.
        description={[
          "This item is removed from the agenda and the public page.",
          dcHapus ? `Its dress code (${dcHapus}) is deleted too.` : "",
          kalimatHapus((confirmItem?.bus_trips ?? []).map((trip) => trip.name)),
          "A copy is kept in the audit log.",
        ].filter(Boolean).join(" ")}
        actions={
          <>
            <Button variant="outlined" disabled={deletingItem !== null} onClick={() => setConfirmItem(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={deletingItem !== null} onClick={() => { if (confirmItem) void deleteItem(confirmItem); }}>Delete item</Button>
          </>
        }
      />

      <Dialog
        open={confirmSection !== null}
        onClose={() => setConfirmSection(null)}
        dismissible={!deletingSection}
        tone="danger"
        title={`Delete section ${confirmSection?.name ?? ""}?`}
        description={`${confirmSection?.is_published ? "This section is published now. " : ""}${activeItems.length === 0 ? "" : activeItems.length === 1 ? "Its 1 agenda item is deleted too. " : `All ${plural(activeItems.length, "agenda item")} in this section are deleted too. `}${jumlahDcBagian === 0 ? "" : jumlahDcBagian === 1 ? "Its dress code is deleted too. " : "Its dress codes are deleted too. "}${tripBagian ? `${tripBagian} ` : ""}A copy is kept in the audit log.`}
        actions={
          <>
            <Button variant="outlined" disabled={deletingSection} onClick={() => setConfirmSection(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={deletingSection} onClick={() => { if (confirmSection) void deleteSection(confirmSection); }}>Delete section</Button>
          </>
        }
      />

      {/* Pola Speakers: Escape dan klik di luar berarti Keep editing. Discard
          mengembalikan formulir ke nilai tersimpan, lalu menjalankan aksinya. */}
      <Dialog
        open={tertunda !== null}
        onClose={tetapSunting}
        title={tertunda ? judulBuang(tertunda.form, namaForm(tertunda.form)) : ""}
        description={tertunda ? keteranganBuang(tertunda.form) : undefined}
        actions={
          <>
            <Button variant="outlined" onClick={tetapSunting}>Keep editing</Button>
            <Button
              variant="danger"
              onClick={() => {
                const tunda = tertunda;
                setTertunda(null);
                if (!tunda) return;
                buangForm(tunda.form);
                tunda.aksi();
              }}
            >
              Discard
            </Button>
          </>
        }
      />
      </div>
    </WorkspacePage>
  );
}

/**
 * Catatan di bawah Start dan End untuk baris yang ditautkan trip bus di
 * Logistics. Tautannya disunting di sana ("Edit in Logistics"); di sini hanya
 * diberi tahu bahwa jam busnya ikut bergeser bersama baris ini.
 *
 * Selisihnya dihitung dari jam dan tanggal yang tersimpan, yang dijaga pemicu
 * database, lalu jam busnya dari jam mulai di kolom: jam yang belum disimpan
 * langsung menunjukkan ke mana busnya akan bergeser.
 */
function CatatanBus({ item, trips, jamTersimpan, tanggalTersimpan, zone }: {
  item: RundownItem;
  trips: TripTertaut[];
  jamTersimpan: string;
  tanggalTersimpan: string;
  zone: EventTimeZone;
}) {
  const waktu = (trip: TripTertaut) => {
    if (!trip.depart_at) return null;
    const berangkat = keInputWaktu(trip.depart_at, zone);
    const selisih = selisihMenit(berangkat, tanggalTersimpan, jamTersimpan);
    if (selisih === null) return null;
    return { selisih, jam: jamBerangkatBaru(item.start_time, selisih) ?? berangkat.slice(11, 16) };
  };
  const TAUTAN = "inline-flex items-center gap-1 rounded-sm font-medium text-primary hover:underline";
  const tabBaru = (
    <>
      <ArrowSquareOut size={14} aria-hidden />
      <span className="sr-only">(new tab)</span>
    </>
  );
  const [satu] = trips;
  const waktuSatu = trips.length === 1 ? waktu(satu) : null;
  return (
    <div className="col-span-2 flex items-start gap-2 rounded-md bg-surface-container-high p-3 text-body-medium text-on-surface-variant">
      <IkonBus size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        {trips.length === 1 ? (
          <>
            <p>
              Bus trip <span className="font-medium text-on-surface">{satu.name}</span>{" "}
              {waktuSatu ? kapanBerangkat(waktuSatu.jam, waktuSatu.selisih) : "is linked to this item but has no departure time yet."}
            </p>
            <Link href={hrefTrip(satu.id)} target="_blank" rel="noreferrer" className={cx("mt-1", TAUTAN)}>Edit in Logistics{tabBaru}</Link>
          </>
        ) : (
          // Dua trip atau lebih (berangkat dan pulang): tiap nama membuka tripnya.
          <p>
            {plural(trips.length, "vehicle trip")} move with this item:{" "}
            {trips.map((trip, urutan) => {
              const isi = waktu(trip);
              return (
                <Fragment key={trip.id}>
                  {urutan > 0 ? ", " : ""}
                  <Link href={hrefTrip(trip.id)} target="_blank" rel="noreferrer" className={TAUTAN}>{trip.name}{tabBaru}</Link>
                  {` (${isi ? isi.jam : "no time yet"})`}
                </Fragment>
              );
            })}
            .
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Agenda > This section > Show first for (dulu "Who it's for"; hanya mengurutkan,
 * yang menyembunyikan adalah Who sees it per baris). Everyone (bawaan) atau satu kelompok:
 * satu pertanyaan pilihan dan satu atau beberapa jawabannya. Peserta kelompok
 * itu melihat bagian ini lebih dulu di Home dan Schedule; yang lain tetap bisa
 * membukanya. Disimpan lewat Save section.
 */
function KelompokSasaran({ info, value, onChange }: { info: SasaranInfo; value: SasaranBagian | null; onChange: (next: SasaranBagian | null) => void }) {
  const kolom = value ? info.fields.find((isi) => isi.key === value.field) ?? null : null;
  const pilih = (field: string) => onChange({ field, values: [] });
  const TAUTAN = "inline-flex items-center gap-1 self-start rounded-sm text-body-medium font-medium text-primary hover:underline";
  return (
    <Kelompok
      title="Show first for"
      note={info.available && info.fields.length > 0 ? "Participants in this group see this section first on Home and Schedule. Everyone else can still open it. To hide a row from others, use Who sees it on that item. Saved with Save section." : undefined}
    >
      {!info.available ? (
        <p className="text-body-medium text-on-surface-variant">Show first for needs a database update first (migration 202610180002).</p>
      ) : info.fields.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-body-medium text-on-surface-variant">Add a dropdown or single-choice participant field first, such as Batch. It can be staff only.</p>
          <Link href="/admin/registrasi" target="_blank" rel="noreferrer" className={TAUTAN}>
            Edit in Registration <ArrowSquareOut size={14} aria-hidden /><span className="sr-only">(new tab)</span>
          </Link>
        </div>
      ) : (
        <>
          <SegmentedButton
            label="Show first for"
            options={[{ value: "semua", label: "Everyone" }, { value: "kelompok", label: "One group" }]}
            value={value ? "kelompok" : "semua"}
            onChange={(next) => onChange(next === "semua" ? null : { field: value?.field ?? "", values: value?.values ?? [] })}
          />
          {value ? (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-body-medium font-medium text-on-surface">Participant field</p>
                <SelectMenu<string>
                  label="Participant field"
                  width="100%"
                  value={kolom ? value.field : ""}
                  onChange={(field) => { if (field && field !== value.field) pilih(field); }}
                  options={[
                    ...(kolom ? [] : [{ value: "", label: "Choose a field" }]),
                    ...info.fields.map((isi) => ({ value: isi.key, label: isi.staff ? `${isi.label} (staff only)` : isi.label })),
                  ]}
                />
                <p className="text-body-small text-on-surface-variant">Only dropdown and single-choice columns are listed: a group needs a fixed list of answers.</p>
                <Link href="/admin/registrasi" target="_blank" rel="noreferrer" className={TAUTAN}>
                  Add or edit columns in Registration <ArrowSquareOut size={14} aria-hidden /><span className="sr-only">(new tab)</span>
                </Link>
              </div>
              {kolom ? (
                <div className="flex flex-col gap-2">
                  <p id="sasaran-nilai" className="text-body-medium font-medium text-on-surface">Answers in this group</p>
                  <div role="group" aria-labelledby="sasaran-nilai" className="flex flex-wrap gap-2">
                    {kolom.options.map((nilai) => {
                      const aktif = value.values.includes(nilai);
                      return (
                        <FilterChip
                          key={nilai}
                          selected={aktif}
                          onClick={() => onChange({ field: value.field, values: aktif ? value.values.filter((isi) => isi !== nilai) : [...value.values, nilai] })}
                        >
                          {nilai}
                        </FilterChip>
                      );
                    })}
                  </div>
                  {value.values.length === 0 ? <p className="text-body-small text-on-surface-variant">Choose at least one answer.</p> : null}
                </div>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </Kelompok>
  );
}
