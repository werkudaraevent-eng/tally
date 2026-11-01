"use client";

import { Armchair, ArrowDown, ArrowLeft, ArrowSquareOut, ArrowUp, CaretDown, Monitor, Plus, Trash, UploadSimple, Warning, XCircle } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { SeatMapView } from "@/components/seat-map-view";
import { AssignSeatDialog, type KursiDipilih, type Urungkan } from "./assign-seat-dialog";
import { SeatsPanel, type Orang } from "./seats-panel";
import { LayoutPicker } from "./layout-picker";
import { LAYOUT_FIELDS, pakaiMejaBulat, SEMUA_LAYOUT, type IsianAngka } from "@/lib/seat-map-layout-fields";

const SEAT_MAP_LAYOUTS_BULAT: string[] = SEMUA_LAYOUT.filter(pakaiMejaBulat);
import { useToast } from "@/components/toast";
import { normalizeBranding, type Branding } from "@/lib/branding";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import {
  computeSeatMapGeometry, duplicateSeatLabels, duplicateTableLabels, MAX_TABLE_LABEL_LENGTH, normalizeSeatLabel, resolveSeatColors, tableLabelFor,
  type PublicViewMode, type SeatColors, type SeatMapConfig, type SeatMapLayout, type SeatMapLayoutParams, type SeatRule, type SeatSection, type SeatShape,
  LAYOUT_INFO, layoutDefaults, defaultSection, MAX_SECTIONS, nextSectionPrefix, sectionPrefixError,
} from "@/lib/seat-map";
import { tallySeatSource } from "@/lib/seat-tally-source";
import {
  Banner, Button, Dialog, EmptyState, IconButton, MetaSeparator, PageLoading, Pane, PaneBody, PaneFooter,
  Popover, SegmentedButton, usePopoverAnchor, StatusChip, SupportingPane, Switch, Tabs, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";
import { INPUT, Field, Kelompok } from "@/components/admin/compact-form";

// Pratinjau memakai renderer yang sama dengan halaman publik, jadi yang ditata
// admin persis yang dilihat tamu.

type Session = {
  id: number;
  slug: string;
  name: string;
  sub_event_id: string | null;
  title: string;
  subtitle: string | null;
  background_color: string;
  text_color: string;
  accent_color: string;
  background_image_url: string | null;
  map_panel_transparent: boolean;
  is_published: boolean;
  sort_order: number;
} & Branding & SeatColors;

type SubEvent = { subEventId: string; subEventName: string; seatCount: number };

type MatchReport = {
  session_id: number;
  slug: string;
  total_assignments: number;
  matched_seats: number;
  unmatched_labels: string[];
  unmatched_count: number;
  empty_seats: number;
  participants_without_seat: number;
  total_active_participants: number;
};

const VIEW_MODES: { value: PublicViewMode; label: string; detail: string }[] = [
  { value: "search", label: "Name search", detail: "For participants' phones and touch screens. Participants type their name and their seat is highlighted." },
  { value: "qr", label: "QR for LED", detail: "For non-touch LED screens. The screen shows a large QR code and no participant names." },
];

type ConfigState = SeatMapConfig & { name: string; public_view_mode: PublicViewMode; default_session_id: number | null };

type Payload = {
  config: ConfigState;
  sessions: Session[];
  available_sub_events: SubEvent[];
  geometry: { total_tables: number; total_seats: number };
  reports: MatchReport[];
};

/**
 * Dua tampilan dengan cakupan berbeda. "sesi": semua yang di bawah tab sesi
 * berlaku untuk sesi itu saja. "ruangan": penyunting tata ruang, dipakai
 * bersama semua sesi, jadi tab sesi diganti tombol kembali. Setelan layar
 * publik (berlaku untuk semua layar) ada di dialognya sendiri.
 */
type Tampilan = "sesi" | "ruangan";

type LayarDraft = { public_view_mode: PublicViewMode; default_session_id: number | null; search_company: boolean };

/** Meja bulat: baris meja, aturan kursi per meja, label meja. */
const BULAT = SEAT_MAP_LAYOUTS_BULAT;

/** Pilihan jadi untuk sudut kursi di meja bulat, dalam bahasa panitia. */
const BUSUR = [
  { value: 300, label: "Almost all the way round" },
  { value: 240, label: "Two thirds, open to the stage" },
  { value: 190, label: "Facing the stage only" },
];

function Lipatan({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <details className="group border-t border-outline-variant">
      <summary className="flex cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-body-medium font-medium text-on-surface">{title}</span>
          <span className="block text-body-medium text-on-surface-variant">{detail}</span>
        </span>
        <CaretDown size={16} aria-hidden className="shrink-0 text-on-surface-variant transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

/** Kolom yang disunting di Room layout. Setelan layar publik dikecualikan. */
function bagianRuangan(config: ConfigState) {
  const { public_view_mode: _mode, default_session_id: _bawaan, layout_params, ...ruangan } = config;
  const { search_company: _cari, ...params } = layout_params;
  void _mode; void _bawaan; void _cari;
  return { ...ruangan, layout_params: params };
}

function bacaLorong(teks: string): number[] {
  return teks.split(",").map((bagian) => Number(bagian.trim())).filter((angka) => Number.isFinite(angka) && angka > 0);
}

/**
 * Teks yang diketik disimpan apa adanya. Kalau nilainya dibentuk ulang dari
 * angka di setiap ketukan, "8," langsung kembali menjadi "8" dan koma tidak
 * pernah bisa diketik.
 */
function InputLorong({ aisles, onChange }: { aisles: number[]; onChange: (aisles: number[]) => void }) {
  const [teks, setTeks] = useState(() => aisles.join(", "));
  // Nilai dari luar (muat ulang, ganti tata ruang) menggantikan teks hanya
  // bila memang berbeda dari yang sedang diketik.
  const [terakhir, setTerakhir] = useState(aisles);
  if (aisles !== terakhir) {
    setTerakhir(aisles);
    if (bacaLorong(teks).join(",") !== aisles.join(",")) setTeks(aisles.join(", "));
  }
  return (
    <input
      value={teks}
      onChange={(event) => { setTeks(event.target.value); onChange(bacaLorong(event.target.value)); }}
      placeholder="e.g. 8, 16"
      className={INPUT}
    />
  );
}

export default function SeatMapAdminPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingSession, setSavingSession] = useState<number | null>(null);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [tampilan, setTampilan] = useState<Tampilan>("sesi");
  const [konfirmasiKeluar, setKonfirmasiKeluar] = useState(false);
  const [layarOpen, setLayarOpen] = useState(false);
  const [layarDraft, setLayarDraft] = useState<LayarDraft | null>(null);
  const [pemicuBuka, setPemicuBuka] = useState<HTMLElement | null>(null);
  const menuBuka = usePopoverAnchor(pemicuBuka);
  const menuBukaId = useId();
  const [addOpen, setAddOpen] = useState(false);
  const [newAgendaName, setNewAgendaName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Session | null>(null);
  const [uploadingBackground, setUploadingBackground] = useState<number | null>(null);
  const [error, setError] = useState("");
  // Assign seats: denah menampilkan isi kursi sebenarnya dan kursinya bisa diklik.
  // Orang yang dipilih di panel Seats; klik kursi kosong mendudukkannya.
  const [orangDipilih, setOrangDipilih] = useState<Orang | null>(null);
  const [mendudukkan, setMendudukkan] = useState(false);
  const [segar, setSegar] = useState(0);
  const [panelSesi, setPanelSesi] = useState<"kursi" | "setelan">("kursi");
  const [terisi, setTerisi] = useState<Record<number, Record<string, { participantId: string; name: string; label: string }>> | null>(null);
  const [kursiDipilih, setKursiDipilih] = useState<KursiDipilih | null>(null);
  // Perubahan kursi terakhir yang masih bisa dibatalkan (Remove / Change person).
  const [urungkan, setUrungkan] = useState<{ pesan: string; langkah: Urungkan } | null>(null);
  const [mengurungkan, setMengurungkan] = useState(false);
  const [busurKustom, setBusurKustom] = useState(false);
  const toast = useToast();

  /**
   * Muat ulang dari server. Ruangan dan sesi masing-masing bisa dipertahankan,
   * supaya menyimpan yang satu tidak menimpa suntingan yang belum disimpan di
   * yang lain. Setelan layar publik tidak punya draf di halaman (ia disunting
   * di dialognya sendiri), jadi selalu diambil dari server.
   */
  async function load(opsi: { ruangan?: "muat" | "pertahankan"; sesi?: "muat" | "pertahankan" | number } = {}) {
    const { ruangan = "muat", sesi = "muat" } = opsi;
    const response = await fetch("/api/admin/seat-map", { cache: "no-store" }).catch(() => null);
    if (!response) { setError("Connection lost. The seating plan could not be loaded."); return; }
    if (!response.ok) { setError("The seating plan could not be loaded."); return; }
    const data = (await response.json()) as Payload;
    setPayload(data);
    setSessions((current) => data.sessions.map((row) => {
      if (sesi === "muat" || sesi === row.id) return row;
      return current.find((item) => item.id === row.id) ?? row;
    }));
    setConfig((current) => {
      if (ruangan === "muat" || !current) return data.config;
      const { search_company } = data.config.layout_params;
      return {
        ...current,
        public_view_mode: data.config.public_view_mode,
        default_session_id: data.config.default_session_id,
        layout_params: { ...current.layout_params, search_company },
      };
    });
    setPreviewSlug((current) => (current && data.sessions.some((row) => row.slug === current) ? current : data.sessions[0]?.slug ?? null));
  }

  // Sekali saat halaman dibuka.
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); void muatKursi(); }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function muatKursi() {
    const response = await fetch("/api/admin/participants/seat-options", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { toast.error("Seats could not be loaded", "Reload the page and try again."); return; }
    setTerisi(((await response.json()) as { taken: NonNullable<typeof terisi> }).taken);
  }

  useEffect(() => {
    if (!urungkan) return;
    const timer = window.setTimeout(() => setUrungkan(null), 10000);
    return () => window.clearTimeout(timer);
  }, [urungkan]);

  async function batalkanPerubahan() {
    if (!urungkan) return;
    const { langkah } = urungkan;
    setMengurungkan(true);
    const response = await fetch("/api/admin/seat-map/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: langkah.sessionId, label: langkah.label, participant_id: langkah.participantId, current_participant_id: langkah.currentParticipantId }),
    }).catch(() => null);
    setMengurungkan(false);
    setUrungkan(null);
    setSegar((nilai) => nilai + 1);
    if (response?.ok) toast.success(`Seat ${langkah.label} restored.`);
    else toast.error("Couldn't undo", "The seat changed again in the meantime. Check the map.");
    void muatKursi();
    void load({ ruangan: "pertahankan", sesi: "pertahankan" });
  }

  function updateConfig<K extends keyof ConfigState>(key: K, value: ConfigState[K]) {
    setConfig((current) => current && { ...current, [key]: value });
  }

  function updateParam<K extends keyof SeatMapLayoutParams>(key: K, value: SeatMapLayoutParams[K]) {
    setConfig((current) => current && { ...current, layout_params: { ...current.layout_params, [key]: value } });
  }

  function updateSession(id: number, changes: Partial<Session>) {
    setSessions((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  // Hasil unggahan hanya masuk ke state; tetap perlu Simpan agenda.
  async function uploadSessionBackground(session: Session, file: File) {
    setUploadingBackground(session.id); setError("");
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/display/background", { method: "POST", body: form }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setUploadingBackground(null);
    if (!response?.ok) {
      const failure = data?.error?.details?.file ?? data?.error?.message ?? "Image upload failed.";
      toast.error("Image upload failed", failure);
      return;
    }
    updateSession(session.id, { background_image_url: data.url });
    toast.info("Image uploaded", "Select Save session to apply it.");
  }

  /**
   * Ruangan dan layar publik disimpan TERPISAH, masing-masing hanya kolomnya
   * sendiri. Dulu satu fungsi mengirim seluruh konfigurasi, sehingga Save di
   * "Public screens" ikut menyimpan suntingan ruangan yang belum disimpan.
   * `search_company` tinggal di `layout_params`, jadi tiap jalur mengambil
   * nilainya dari yang TERSIMPAN, bukan dari draf jalur lain.
   */
  async function patchConfig(body: Record<string, unknown>, judulGagal: string) {
    const response = await fetch("/api/admin/seat-map", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      toast.error(judulGagal, data?.error?.details?.message ?? data?.error?.message ?? "Try again.");
      return false;
    }
    return true;
  }

  async function saveRoom() {
    if (!config || !payload) return;
    setSavingConfig(true); setError("");
    const tersimpan = payload.config.layout_params;
    const { search_company: _abaikan, ...params } = config.layout_params;
    void _abaikan;
    const ok = await patchConfig({
      name: config.name,
      stage_label: config.stage_label,
      row_table_counts: config.row_table_counts,
      seat_rules: config.seat_rules,
      seat_label_pattern: config.seat_label_pattern,
      table_overrides: config.table_overrides,
      table_labels: config.table_labels,
      layout_type: config.layout_type,
      layout_params: { ...params, ...(tersimpan.search_company ? { search_company: true } : {}) },
    }, "Room layout not saved");
    setSavingConfig(false);
    if (!ok) return;
    toast.success("Room layout saved", "Applies to every session.");
    await load({ ruangan: "muat", sesi: "pertahankan" });
  }

  async function saveScreens(draft: LayarDraft) {
    if (!payload) return;
    setSavingConfig(true);
    const ok = await patchConfig({
      public_view_mode: draft.public_view_mode,
      default_session_id: draft.default_session_id,
      layout_params: { ...payload.config.layout_params, search_company: draft.search_company },
    }, "Screen settings not saved");
    setSavingConfig(false);
    if (!ok) return;
    toast.success("Screen settings saved", "Applies to every screen that opens the seating plan.");
    setLayarOpen(false);
    await load({ ruangan: "pertahankan", sesi: "pertahankan" });
  }

  async function createAgenda() {
    const name = newAgendaName.trim();
    if (!name) return;
    setCreating(true);
    const response = await fetch("/api/admin/seat-map/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    setCreating(false);
    if (!response?.ok) {
      const failure = data?.error?.details?.message ?? data?.error?.message ?? "Session not added.";
      toast.error("Session not added", failure);
      return;
    }
    setNewAgendaName("");
    setAddOpen(false);
    toast.success("Session added", "It is still a draft. Choose a seat source, then show it to participants.");
    await load({ ruangan: "pertahankan", sesi: "pertahankan" });
    if (data?.slug) setPreviewSlug(data.slug);
  }

  async function deleteAgenda(session: Session) {
    setDeleting(true);
    const response = await fetch(`/api/admin/seat-map/sessions?id=${session.id}`, { method: "DELETE" }).catch(() => null);
    setDeleting(false);
    setConfirmDelete(null);
    if (!response?.ok) {
      const data = await response?.json().catch(() => ({}));
      toast.error("Session not deleted", data?.error?.message ?? "Try again.");
      return;
    }
    setPreviewSlug((current) => (current === session.slug ? null : current));
    toast.success("Session deleted", "Participant data is not affected.");
    await load({ ruangan: "pertahankan", sesi: "pertahankan" });
  }

  async function saveSession(session: Session) {
    setSavingSession(session.id);
    const response = await fetch("/api/admin/seat-map/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: session.id,
        name: session.name,
        sub_event_id: session.sub_event_id,
        title: session.title,
        subtitle: session.subtitle,
        background_color: session.background_color,
        text_color: session.text_color,
        accent_color: session.accent_color,
        background_image_url: session.background_image_url,
        map_panel_transparent: session.map_panel_transparent,
        is_published: session.is_published,
        sort_order: session.sort_order,
        // Null dikirim apa adanya: itu cara mengembalikan satu warna ke bawaan.
        seat_available_color: session.seat_available_color,
        seat_occupied_color: session.seat_occupied_color,
        seat_checked_in_color: session.seat_checked_in_color,
        seat_outline_color: session.seat_outline_color,
        ...normalizeBranding(session as unknown as Record<string, unknown>),
      }),
    }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    setSavingSession(null);
    if (!response?.ok) {
      toast.error("Session not saved", data?.error?.message ?? "Try again.");
      return;
    }
    toast.success("Session saved", session.is_published ? "This session is shown on the public page." : "This session is not shown to participants yet.");
    await load({ ruangan: "pertahankan", sesi: session.id });
  }

  const aktif = sessions.find((item) => item.slug === previewSlug) ?? sessions[0] ?? null;
  const report = aktif ? payload?.reports.find((item) => item.session_id === aktif.id) : undefined;
  const totalTablesFromRows = (config?.row_table_counts ?? []).reduce((sum, count) => sum + count, 0);
  const labelConflicts = config ? duplicateTableLabels(config) : [];
  const seatConflicts = config?.layout_params.sections?.length ? duplicateSeatLabels(config) : [];
  const prefixInvalid = (config?.layout_params.sections ?? []).some((section) => sectionPrefixError(section.prefix) !== null);
  const labeledTables = Object.keys(config?.table_labels ?? {})
    .map(Number)
    .filter((position) => Number.isFinite(position) && position >= 1 && position <= totalTablesFromRows)
    .sort((a, b) => a - b);

  function setTableLabel(position: number, label: string) {
    if (!config) return;
    const next = { ...config.table_labels };
    if (label.trim()) next[String(position)] = label;
    else delete next[String(position)];
    updateConfig("table_labels", next);
  }

  // Keterisian CONTOH: meja 1 terisi + check-in, meja 2 terisi, sisanya kosong,
  // supaya ketiga warna kursi terlihat berdampingan di pratinjau.
  const previewSeatStates = useMemo(() => {
    if (!config) return {};
    const states: Record<string, { occupied: boolean; checkedIn: boolean }> = {};
    for (const table of computeSeatMapGeometry(config).tables.slice(0, 2)) {
      for (const seat of table.seats) states[normalizeSeatLabel(seat.label)] = { occupied: true, checkedIn: table.number === 1 };
    }
    return states;
  }, [config]);

  const warnaEfektif = aktif ? resolveSeatColors(aktif, { backgroundColor: aktif.background_color, textColor: aktif.text_color }) : null;
  const sumberTally = aktif ? tallySeatSource(aktif.id) : null;
  const pakaiTally = aktif?.sub_event_id != null && aktif.sub_event_id === sumberTally;
  const orphanSubEvent = aktif?.sub_event_id != null && !pakaiTally && payload !== null && !payload.available_sub_events.some((item) => item.subEventId === aktif.sub_event_id);
  const publik = sessions.filter((item) => item.is_published);
  const menugaskan = tampilan === "sesi" && pakaiTally && aktif !== null;
  // Kursi diisi pada tata ruang yang TERSIMPAN; suntingan yang belum disimpan bisa mengubah label kursi.
  const configTersimpan = payload?.config ?? null;
  const tataRuangBerubah = config !== null && configTersimpan !== null && JSON.stringify(bagianRuangan(config)) !== JSON.stringify(bagianRuangan(configTersimpan));
  const sesiTersimpan = aktif ? payload?.sessions.find((item) => item.id === aktif.id) ?? null : null;
  const sesiBerubah = aktif !== null && sesiTersimpan !== null && JSON.stringify(aktif) !== JSON.stringify(sesiTersimpan);
  const adaPerubahan = tataRuangBerubah || sessions.some((item) => {
    const asli = payload?.sessions.find((row) => row.id === item.id);
    return asli !== undefined && JSON.stringify(item) !== JSON.stringify(asli);
  });

  // Peramban memperingatkan sebelum menutup tab atau memuat ulang dengan
  // suntingan yang belum disimpan.
  useEffect(() => {
    if (!adaPerubahan) return;
    const tahan = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", tahan);
    return () => window.removeEventListener("beforeunload", tahan);
  }, [adaPerubahan]);

  function keluarRuangan(buang = false) {
    if (tataRuangBerubah && !buang) { setKonfirmasiKeluar(true); return; }
    if (tataRuangBerubah && configTersimpan) setConfig(configTersimpan);
    setKonfirmasiKeluar(false);
    setTampilan("sesi");
  }

  function bukaLayar() {
    if (!configTersimpan) return;
    setLayarDraft({
      public_view_mode: configTersimpan.public_view_mode,
      default_session_id: configTersimpan.default_session_id,
      search_company: Boolean(configTersimpan.layout_params.search_company),
    });
    setLayarOpen(true);
  }
  const kursiAsli = useMemo(() => {
    const states: Record<string, { occupied: boolean; checkedIn: boolean }> = {};
    for (const kunci of Object.keys((aktif && terisi?.[aktif.id]) ?? {})) states[kunci] = { occupied: true, checkedIn: false };
    return states;
  }, [aktif, terisi]);

  function bukaKursi(label: string) {
    if (!aktif) return;
    const pemegang = terisi?.[aktif.id]?.[normalizeSeatLabel(label)] ?? null;
    setKursiDipilih({ sessionId: aktif.id, sessionName: aktif.name, label, holder: pemegang ? { participantId: pemegang.participantId, name: pemegang.name } : null });
  }

  // Kursi kosong pertama dari panggung (urutan geometri), untuk jalur papan
  // ketik di panel Seats.
  const geometriTersimpan = useMemo(() => (configTersimpan ? computeSeatMapGeometry(configTersimpan) : null), [configTersimpan]);
  const geometriDraf = useMemo(() => (config && tampilan === "ruangan" ? computeSeatMapGeometry(config) : null), [config, tampilan]);
  const isiSesi = useMemo(() => (aktif && terisi?.[aktif.id]) ?? {}, [aktif, terisi]);
  const kursiBerikut = useMemo(() => {
    if (!geometriTersimpan) return null;
    for (const table of geometriTersimpan.tables) for (const seat of table.seats) if (!isiSesi[normalizeSeatLabel(seat.label)]) return seat.label;
    return null;
  }, [geometriTersimpan, isiSesi]);
  const diLuarDenah = useMemo(() => {
    if (!geometriTersimpan) return [];
    const ada = new Set(geometriTersimpan.tables.flatMap((table) => table.seats.map((seat) => normalizeSeatLabel(seat.label))));
    return Object.entries(isiSesi).filter(([kunci]) => !ada.has(kunci)).map(([, isi]) => ({ name: isi.name, label: isi.label }));
  }, [geometriTersimpan, isiSesi]);
  const jumlahTerisi = Object.keys(isiSesi).length - diLuarDenah.length;
  const jumlahKosong = (payload?.geometry.total_seats ?? 0) - jumlahTerisi;

  // Esc membatalkan pilihan orang.
  useEffect(() => {
    if (!orangDipilih) return;
    const tekan = (event: KeyboardEvent) => { if (event.key === "Escape" && !kursiDipilih) setOrangDipilih(null); };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  }, [orangDipilih, kursiDipilih]);

  async function dudukkan(label: string) {
    if (!aktif || !orangDipilih) return;
    const orang = orangDipilih;
    setMendudukkan(true);
    const response = await fetch("/api/admin/seat-map/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: aktif.id, label, participant_id: orang.id, current_participant_id: null }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setMendudukkan(false);
    if (!response?.ok) {
      toast.error("Seat not changed", response?.status === 409 ? "Someone took this seat just now. The map has been refreshed." : data?.error?.details?.seat ?? data?.error?.message ?? "Try again.");
    } else {
      setOrangDipilih(null);
      setUrungkan({
        pesan: orang.seat ? `${orang.name} moved from ${orang.seat} to ${label}.` : `${orang.name} is now in seat ${label}.`,
        // Urungkan: kembali ke kursi lama, atau kosongkan kursi baru.
        langkah: orang.seat
          ? { sessionId: aktif.id, label: orang.seat, participantId: orang.id, currentParticipantId: null }
          : { sessionId: aktif.id, label, participantId: null, currentParticipantId: orang.id },
      });
    }
    setSegar((nilai) => nilai + 1);
    void muatKursi();
    void load({ ruangan: "pertahankan", sesi: "pertahankan" });
  }

  function klikKursi(label: string) {
    if (orangDipilih && aktif && !isiSesi[normalizeSeatLabel(label)]) { void dudukkan(label); return; }
    bukaKursi(label);
  }

  // ---- Panel utama: denah hidup --------------------------------------------
  const legenda = (daftar: ReadonlyArray<readonly [string, string | undefined]>) => daftar.map(([label, warna]) => (
    <span key={label} className="inline-flex items-center gap-1.5">
      <span aria-hidden className="size-2.5 rounded-full border border-outline-variant" style={{ background: warna }} />{label}
    </span>
  ));
  const peta = config ? (
    <Pane aria-label="Seating plan">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-outline-variant px-4 py-2.5 text-body-medium text-on-surface-variant">
        {menugaskan ? (
          <>
            {report ? <span className="font-medium text-on-surface">{(jumlahTerisi + diLuarDenah.length).toLocaleString("en-GB")} of {report.total_active_participants.toLocaleString("en-GB")} seated</span> : null}
            {warnaEfektif ? legenda([[`Empty ${jumlahKosong.toLocaleString("en-GB")}`, warnaEfektif.available], ["Seated", warnaEfektif.occupied]]) : null}
            <span className="ml-auto">
              {orangDipilih ? <>Click an empty seat for <span className="font-medium text-on-surface">{orangDipilih.name}</span></> : "Click a seat to see or change who sits there."}
            </span>
            {orangDipilih ? <Button variant="text" size="sm" onClick={() => setOrangDipilih(null)}>Cancel</Button> : null}
          </>
        ) : (
          <>
            {warnaEfektif ? legenda([["Empty", warnaEfektif.available], ["Occupied", warnaEfektif.occupied], ["Checked in", warnaEfektif.checkedIn]]) : null}
            <span className="ml-auto">{tampilan === "ruangan" ? "Sample occupancy. Updates as you type." : "Sample occupancy. Seats from the scanner API show on the public page."}</span>
          </>
        )}
      </div>
      {/* Pratinjau memakai renderer publik, yang teksnya berbahasa Indonesia. */}
      <div
        lang="id"
        className="min-h-0 flex-1 overflow-auto bg-cover bg-center bg-no-repeat"
        style={{
          backgroundColor: aktif?.background_color ?? "#111a63",
          backgroundImage: aktif?.background_image_url ? `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${aktif.background_image_url})` : undefined,
        }}
      >
        <SeatMapView
          config={menugaskan && configTersimpan ? configTersimpan : config}
          seatStates={menugaskan ? kursiAsli : previewSeatStates}
          highlightedSeatLabels={menugaskan && orangDipilih?.seat ? [orangDipilih.seat] : undefined}
          onSeatClick={menugaskan && terisi && !mendudukkan ? (label) => klikKursi(label) : undefined}
          showAttendance
          backgroundColor={aktif?.background_color ?? "#111a63"}
          canvasColor={aktif?.map_panel_transparent && aktif.background_image_url ? "transparent" : undefined}
          textColor={aktif?.text_color ?? "#ffffff"}
          accentColor={aktif?.accent_color ?? "#f2c14e"}
          seatColors={aktif ?? undefined}
          maxHeight="100%"
          className="mx-auto min-w-[480px]"
        />
      </div>
      {menugaskan ? null : (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-outline-variant px-4 py-2.5 text-body-medium">
          {report && tampilan === "sesi" ? (
            <>
              <span className="text-on-surface-variant">{plural(report.matched_seats, "seat")} occupied, {report.empty_seats.toLocaleString("en-GB")} empty, {plural(report.participants_without_seat, "participant")} without a seat</span>
              <span className="ml-auto">
                {report.unmatched_count > 0
                  ? <StatusChip tone="warning">{plural(report.unmatched_count, "label")} not on the seating plan: {report.unmatched_labels.slice(0, 3).join(", ")}{report.unmatched_count > 3 ? "…" : ""}</StatusChip>
                  : report.total_assignments > 0 ? <StatusChip dot tone="success">All labels match</StatusChip> : null}
              </span>
            </>
          ) : (
            tampilan === "ruangan" ? (
              <span className="text-on-surface-variant">{plural(geometriDraf?.totalTables ?? 0, "table")}, {plural(geometriDraf?.totalSeats ?? 0, "seat")}{tataRuangBerubah ? ` (saved: ${payload?.geometry.total_seats.toLocaleString("en-GB") ?? 0} seats)` : ""}</span>
            ) : (
              <span className="text-on-surface-variant">{plural(payload?.geometry.total_tables ?? 0, "table")}, {plural(payload?.geometry.total_seats ?? 0, "seat")}. Seat matching appears once the session has a seat source.</span>
            )
          )}
        </div>
      )}
      {/* Snackbar M3: dipasang ke body supaya tetap di layar, juga saat
          pane digulir atau di 390 ketika tombol "Seat in" jauh di bawah denah. */}
      {menugaskan && urungkan && typeof document !== "undefined" ? createPortal(
        <div role="status" className="fixed inset-x-4 bottom-4 z-toast mx-auto flex w-fit max-w-[560px] items-center gap-3 rounded-sm bg-inverse-surface py-1.5 pl-4 pr-2 text-body-medium text-inverse-on-surface shadow-lg sm:bottom-6">
          <span className="min-w-0 flex-1">{urungkan.pesan}</span>
          <button type="button" onClick={() => void batalkanPerubahan()} disabled={mengurungkan} className="min-h-9 shrink-0 rounded-full px-3 text-label-large font-semibold text-inverse-primary disabled:opacity-60">{mengurungkan ? "Undoing…" : "Undo"}</button>
        </div>,
        document.body,
      ) : null}
    </Pane>
  ) : null;

  // ---- Panel pendukung ---------------------------------------------------------
  const sections = config?.layout_params.sections ?? [];
  // Penempatan kursi di semua sesi. Server menolak ganti layout begitu ada satu
  // saja; di sini pilihan lain dinonaktifkan dengan alasannya.
  const jumlahPenempatan = (payload?.reports ?? []).reduce((total, item) => total + item.total_assignments, 0);
  function pilihLayout(value: string) {
    if (value === "mixed") {
      // Ruangan gabungan dimulai dari contoh yang paling sering diminta: sofa VIP
      // di depan, theater di belakang. Layout dasarnya tidak diubah.
      setConfig((current) => current && { ...current, layout_params: { ...current.layout_params, sections: [defaultSection("sofa"), defaultSection("theater")] } });
      return;
    }
    const layout = value as SeatMapLayout;
    // Parameter kembali ke bawaan layout baru; nilai lama menimpa bawaan dan pilihannya tampak tidak berpengaruh.
    // `sections: []` dikirim eksplisit supaya server menghapus bagian yang tersimpan.
    setConfig((current) => current && { ...current, layout_type: layout, layout_params: { ...layoutDefaults(layout), sections: [], ...(current.layout_params.search_company ? { search_company: true } : {}), ...(current.layout_params.seat_shape ? { seat_shape: current.layout_params.seat_shape } : {}) } });
  }
  function pindahBagian(index: number, arah: -1 | 1) {
    const next = [...sections];
    [next[index], next[index + arah]] = [next[index + arah], next[index]];
    updateParam("sections", next);
  }

  const isiRuangan = config ? (
    <div className="flex flex-col gap-5">
      <Kelompok title="Room shape" first>
        <LayoutPicker value={sections.length ? "mixed" : config.layout_type} onChange={pilihLayout} terkunci={jumlahPenempatan > 0} />
        {jumlahPenempatan > 0 ? (
          <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
            <Warning size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            <span><span className="font-medium">The layout is locked: {plural(jumlahPenempatan, "seat")} {jumlahPenempatan === 1 ? "is" : "are"} assigned.</span> Another layout changes every seat label, so those people would lose their seats. Remove the seat assignments first to change it.</span>
          </p>
        ) : null}
        {sections.length ? (
          <>
            <div className="flex flex-col gap-2">
              {sections.map((section, index) => {
                const set = (patch: Partial<SeatSection>) => updateParam("sections", sections.map((item, i) => (i === index ? { ...item, ...patch } : item)));
                const contoh = section.kind === "sofa" ? `${section.prefix}1 … ${section.prefix}${section.rows * section.per_row * section.seats_per_sofa}` : `${section.prefix}A1 … ${section.prefix}${String.fromCharCode(64 + section.rows)}${section.per_row}`;
                return (
                  <div key={index} className="rounded-md border border-outline-variant bg-surface-container-lowest">
                    <div className="flex h-11 items-center gap-2 border-b border-outline-variant px-2">
                      <span className="truncate pl-1 text-label-large font-semibold">{index + 1}. {section.name || (section.kind === "sofa" ? "Sofas" : "Theater")}</span>
                      <span className="ml-auto shrink-0 text-body-small text-on-surface-variant">{section.kind === "sofa" ? section.rows * section.per_row * section.seats_per_sofa : section.rows * section.per_row} seats</span>
                      <IconButton size="sm" label="Move section towards the stage" disabled={index === 0} onClick={() => pindahBagian(index, -1)}><ArrowUp size={16} /></IconButton>
                      <IconButton size="sm" label="Move section away from the stage" disabled={index === sections.length - 1} onClick={() => pindahBagian(index, 1)}><ArrowDown size={16} /></IconButton>
                      <IconButton size="sm" label="Delete section" disabled={sections.length <= 1} onClick={() => updateParam("sections", sections.filter((_, i) => i !== index))}><Trash size={16} /></IconButton>
                    </div>
                    <div className="grid grid-cols-3 gap-3 p-3">
                      <Field label="Type">
                        <select value={section.kind} onChange={(event) => set({ kind: event.target.value as SeatSection["kind"] })} className={INPUT}>
                          <option value="sofa">Sofas</option>
                          <option value="theater">Theater</option>
                                                  </select>
                      </Field>
                      <Field label="Name on map"><input value={section.name} placeholder="None" onChange={(event) => set({ name: event.target.value })} className={INPUT} /></Field>
                      <Field label="Label prefix" htmlFor={`awalan-${index}`} hint={sectionPrefixError(section.prefix) ? <span id={`awalan-${index}-galat`} className="text-error">{sectionPrefixError(section.prefix)}</span> : undefined}>
                        <input id={`awalan-${index}`} value={section.prefix} placeholder="None" aria-invalid={sectionPrefixError(section.prefix) ? true : undefined} aria-describedby={sectionPrefixError(section.prefix) ? `awalan-${index}-galat` : undefined} onChange={(event) => set({ prefix: event.target.value })} className={INPUT} />
                      </Field>
                      <Field label="Rows"><input type="number" min={1} max={40} value={section.rows} onChange={(event) => set({ rows: Number(event.target.value) })} className={INPUT} /></Field>
                      <Field label={section.kind === "sofa" ? "Sofas per row" : "Seats per row"}><input type="number" min={1} max={40} value={section.per_row} onChange={(event) => set({ per_row: Number(event.target.value) })} className={INPUT} /></Field>
                      {section.kind === "sofa" ? (
                        <Field label="Seats per sofa"><input type="number" min={1} max={6} value={section.seats_per_sofa} onChange={(event) => set({ seats_per_sofa: Number(event.target.value) })} className={INPUT} /></Field>
                      ) : <div />}
                      <div className="col-span-3">
                        <Field label={section.kind === "sofa" ? "Aisle after sofa number" : "Aisle after seat number"} hint={`Seat labels: ${contoh}`}>
                          <InputLorong aisles={section.aisles} onChange={(aisles) => set({ aisles })} />
                        </Field>
                      </div>
                    </div>
                  </div>
                );
              })}
              {seatConflicts.length > 0 ? (
                <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
                  <Warning size={16} className="mt-0.5 shrink-0 text-warning" />
                  Seat labels {seatConflicts.slice(0, 3).join(", ")}{seatConflicts.length > 3 ? ` and ${seatConflicts.length - 3} more` : ""} appear in more than one section. Give each section its own label prefix.
                </p>
              ) : null}
              {sections.length < MAX_SECTIONS ? (
                <div><Button variant="outlined" size="sm" onClick={() => updateParam("sections", [...sections, { ...defaultSection("theater"), prefix: nextSectionPrefix(sections) }])}><Plus size={16} />Add section</Button></div>
              ) : null}
            </div>
          </>
        ) : (
          <>
        {LAYOUT_FIELDS[config.layout_type].map((barisIsian, index) => {
          const angka = (isian: IsianAngka, lebar?: string) => (
            <Field key={isian.key} label={isian.label}>
              <input type="number" min={isian.min} max={isian.max} value={config.layout_params[isian.key]} onChange={(event) => updateParam(isian.key, Number(event.target.value))} className={cx(INPUT, lebar)} />
            </Field>
          );
          if (barisIsian.kind === "arc") return (
            <Field key={index} label="Seats around the table" htmlFor="arc-sweep">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  id="arc-sweep"
                  value={busurKustom || !BUSUR.some((item) => item.value === config.layout_params.arc_sweep) ? "custom" : String(config.layout_params.arc_sweep)}
                  onChange={(event) => { const kustom = event.target.value === "custom"; setBusurKustom(kustom); updateParam("arc_sweep", kustom ? 270 : Number(event.target.value)); }}
                  className={cx(INPUT, "w-auto flex-1")}
                >
                  {BUSUR.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  <option value="custom">Custom angle</option>
                </select>
                {/* Tetap terpasang selama Custom dipilih, juga saat angkanya kebetulan sama dengan preset. */}
                {!busurKustom && BUSUR.some((item) => item.value === config.layout_params.arc_sweep) ? null : (
                  <input type="number" min={60} max={340} aria-label="Angle in degrees" value={config.layout_params.arc_sweep} onChange={(event) => updateParam("arc_sweep", Number(event.target.value))} className={cx(INPUT, "w-24")} />
                )}
              </div>
            </Field>
          );
          if (barisIsian.kind === "pair") return <div key={index} className="grid grid-cols-2 gap-3">{barisIsian.fields.map((isian) => angka(isian))}</div>;
          if (barisIsian.kind === "single") return angka(barisIsian.field, "w-32");
          return (
            <Field key={index} label={barisIsian.label} hint={barisIsian.hint}>
              <InputLorong aisles={config.layout_params.aisles} onChange={(aisles) => updateParam("aisles", aisles)} />
            </Field>
          );
        })}
          </>
        )}
      </Kelompok>

      <Kelompok title="Seat shape">
        <SegmentedButton<SeatShape>
          label="Seat shape"
          value={config.layout_params.seat_shape ?? "circle"}
          onChange={(shape) => updateParam("seat_shape", shape)}
          className="w-full"
          options={[{ value: "circle", label: "Circle" }, { value: "square", label: "Square" }, { value: "cinema", label: "Cinema seat" }]}
        />
        <p className="text-body-medium text-on-surface-variant">Applies to every screen and the participant&apos;s ticket. Seats on sofas stay round.</p>
      </Kelompok>

      <Kelompok title="Tables and labels">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Seating plan name" htmlFor="map-name"><input id="map-name" value={config.name} onChange={(event) => updateConfig("name", event.target.value)} className={INPUT} /></Field>
          <Field label="Stage label" htmlFor="stage-label"><input id="stage-label" value={config.stage_label} onChange={(event) => updateConfig("stage_label", event.target.value)} className={INPUT} /></Field>
        </div>
        {BULAT.includes(config.layout_type) ? (
          <Field label="Tables per row, from the stage" hint={`${plural(totalTablesFromRows, "table")} in total. Table numbers run on continuously.`}>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {config.row_table_counts.map((count, index) => (
                <span key={index} className="inline-flex items-center rounded-md border border-outline bg-surface-container-lowest">
                  <input
                    type="number" min={1} max={40} value={count}
                    aria-label={`Tables in row ${index + 1}`}
                    onChange={(event) => {
                      const next = [...config.row_table_counts];
                      next[index] = Math.max(1, Number(event.target.value) || 1);
                      updateConfig("row_table_counts", next);
                    }}
                    className="h-9 w-14 rounded-l-md bg-transparent px-2 text-body-medium outline-none"
                  />
                  <button
                    type="button"
                    aria-label={`Delete row ${index + 1}`}
                    disabled={config.row_table_counts.length <= 1}
                    onClick={() => updateConfig("row_table_counts", config.row_table_counts.filter((_, i) => i !== index))}
                    className="grid h-9 w-7 place-items-center rounded-r-md text-on-surface-variant hover:bg-primary-soft disabled:opacity-40"
                  >
                    <XCircle size={14} />
                  </button>
                </span>
              ))}
              <IconButton size="sm" variant="outlined" label="Add table row" onClick={() => updateConfig("row_table_counts", [...config.row_table_counts, 8])}><Plus size={16} /></IconButton>
            </div>
          </Field>
        ) : null}
        {BULAT.includes(config.layout_type) ? (
          <Field label="Seats per round table" hint="Set per range of table numbers. Where rules overlap, the lowest rule wins.">
            <div className="mt-1.5 flex flex-col gap-2">
              {config.seat_rules.map((rule, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2 text-body-medium">
                  <span className="text-on-surface-variant">Tables</span>
                  {(["from", "to"] as const).map((field, i) => (
                    <span key={field} className="contents">
                      {i === 1 ? <span className="text-on-surface-variant">to</span> : null}
                      <input
                        type="number" min={1} max={999} value={rule[field]}
                        aria-label={field === "from" ? `Rule ${index + 1}: first table` : `Rule ${index + 1}: last table`}
                        onChange={(event) => {
                          const next: SeatRule[] = [...config.seat_rules];
                          next[index] = { ...rule, [field]: Math.max(1, Number(event.target.value) || 1) };
                          updateConfig("seat_rules", next);
                        }}
                        className="h-9 w-14 rounded-md border border-outline bg-surface-container-lowest px-2 outline-none focus:border-primary"
                      />
                    </span>
                  ))}
                  <input
                    type="number" min={0} max={26} value={rule.seats}
                    aria-label={`Rule ${index + 1}: number of seats`}
                    onChange={(event) => {
                      const next: SeatRule[] = [...config.seat_rules];
                      next[index] = { ...rule, seats: Math.max(0, Number(event.target.value) || 0) };
                      updateConfig("seat_rules", next);
                    }}
                    className="h-9 w-14 rounded-md border border-outline bg-surface-container-lowest px-2 outline-none focus:border-primary"
                  />
                  <span className="text-on-surface-variant">seats</span>
                  <IconButton size="sm" label={`Delete rule ${index + 1}`} onClick={() => updateConfig("seat_rules", config.seat_rules.filter((_, i) => i !== index))}><Trash size={14} /></IconButton>
                </div>
              ))}
              <div><Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => updateConfig("seat_rules", [...config.seat_rules, { from: 1, to: 1, seats: 6 }])}>Add rule</Button></div>
            </div>
          </Field>
        ) : null}
        <Field label="Seat label pattern" htmlFor="label-pattern" hint="Must include {table} and {seat}, e.g. {table}{seat} gives 12A. If seats come from the scanner, use the format it uses.">
          <input id="label-pattern" value={config.seat_label_pattern} onChange={(event) => updateConfig("seat_label_pattern", event.target.value)} className={INPUT} />
        </Field>
        <Field label="Custom table labels" hint="For tables whose label differs from their position number, e.g. table 4 labelled 3A. The table does not move.">
          <div className="mt-1.5 flex flex-col gap-2">
            {labeledTables.length === 0 ? <p className="text-body-medium text-on-surface-variant">No custom labels yet. Every table uses its position number.</p> : null}
            {labeledTables.map((position) => (
              <div key={position} className="flex items-center gap-2 text-body-medium">
                <span className="w-24 shrink-0 text-on-surface-variant">Table {position}</span>
                <input
                  value={config.table_labels[String(position)] ?? ""}
                  maxLength={MAX_TABLE_LABEL_LENGTH}
                  aria-label={`Label for table ${position}`}
                  onChange={(event) => setTableLabel(position, event.target.value)}
                  className="h-9 w-24 rounded-md border border-outline bg-surface-container-lowest px-2 outline-none focus:border-primary"
                />
                <IconButton size="sm" label={`Remove label for table ${position}`} onClick={() => setTableLabel(position, "")}><Trash size={14} /></IconButton>
              </div>
            ))}
            <select
              value=""
              aria-label="Add a label for a table"
              onChange={(event) => { const position = Number(event.target.value); if (position) setTableLabel(position, String(position)); }}
              className={cx(INPUT, "mt-0")}
            >
              <option value="">Add a label for a table…</option>
              {Array.from({ length: totalTablesFromRows }, (_, index) => index + 1)
                .filter((position) => !(String(position) in config.table_labels))
                .map((position) => <option key={position} value={position}>Table {position} (now {tableLabelFor(position, config.table_labels)})</option>)}
            </select>
            {labelConflicts.length > 0 ? (
              <p className="flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error">
                <Warning size={16} className="mt-0.5 shrink-0" />
                {labelConflicts.length === 1 ? "Label" : "Labels"} {labelConflicts.join(", ")} {labelConflicts.length === 1 ? "is" : "are"} used on more than one table, so participants could be sent to the wrong table. Fix this before saving.
              </p>
            ) : null}
          </div>
        </Field>
      </Kelompok>
    </div>
  ) : null;

  const isiLayar = layarDraft ? (
    <div className="flex flex-col gap-5 pt-4">
      <Kelompok title="Session shown" first>
        <Field label="Default session" htmlFor="default-session" hint={layarDraft.default_session_id ? "Screens with no session in their address show this session." : "On automatic, screens show the first public session in the list."}>
          <select id="default-session" value={layarDraft.default_session_id ?? ""} onChange={(event) => setLayarDraft({ ...layarDraft, default_session_id: event.target.value ? Number(event.target.value) : null })} className={INPUT}>
            <option value="">First public session (automatic)</option>
            {(payload?.sessions ?? []).filter((item) => item.is_published).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        {publik.length === 0 ? <p className="text-body-medium text-warning">No session is shown to participants yet. Turn on &quot;Show to participants&quot; in a session&apos;s settings.</p> : null}
        <p className="text-body-medium text-on-surface-variant">For two screens showing different sessions, put the session in the address, e.g. /denah?sesi={sessions[0]?.slug ?? "session-slug"}. The address always overrides this setting.</p>
      </Kelompok>
      <Kelompok title="Display mode">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Public page display mode</legend>
          {VIEW_MODES.map((mode) => {
            const on = layarDraft.public_view_mode === mode.value;
            return (
              <label key={mode.value} className={cx("flex cursor-pointer gap-3 rounded-lg border p-3 text-body-medium", on ? "border-2 border-primary" : "border-outline")}>
                <input type="radio" name="public-view-mode" value={mode.value} checked={on} onChange={() => setLayarDraft({ ...layarDraft, public_view_mode: mode.value })} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
                <span>
                  <span className="block font-medium">{mode.label}</span>
                  <span className="block text-on-surface-variant">{mode.detail}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <p className="text-body-medium text-on-surface-variant">To force one screen into a mode, use /denah?mode=qr or ?mode=search.</p>
        <Switch
          checked={layarDraft.search_company}
          onChange={(checked) => setLayarDraft({ ...layarDraft, search_company: checked })}
          label="Search by organisation"
          description="Name search also finds participants by their Organisation, and each result shows it under the name."
        />
      </Kelompok>
    </div>
  ) : null;

  const isiAgenda = aktif ? (
    <div className="flex flex-col gap-5">
      <Switch
        checked={aktif.is_published}
        onChange={(checked) => updateSession(aktif.id, { is_published: checked })}
        label="Show to participants"
        description={`/denah?sesi=${aktif.slug}`}
      />
      <Kelompok title="Content">
        <Field label="Session name" htmlFor="agenda-name" hint="Used on the tabs and the session picker buttons.">
          <input id="agenda-name" value={aktif.name} maxLength={120} onChange={(event) => updateSession(aktif.id, { name: event.target.value })} className={INPUT} />
        </Field>
        <Field label="Title on the public page" htmlFor="agenda-title"><input id="agenda-title" value={aktif.title} onChange={(event) => updateSession(aktif.id, { title: event.target.value })} className={INPUT} /></Field>
        <Field label="Subtitle" htmlFor="agenda-subtitle"><input id="agenda-subtitle" value={aktif.subtitle ?? ""} onChange={(event) => updateSession(aktif.id, { subtitle: event.target.value })} className={INPUT} /></Field>
        <Field label="Seat source" htmlFor="agenda-source" hint={pakaiTally ? "Seats are typed in Participant list › Edit, one field per session." : "The scanner API sub-event that fills in participants' seat numbers."}>
          <select id="agenda-source" value={aktif.sub_event_id ?? ""} onChange={(event) => updateSession(aktif.id, { sub_event_id: event.target.value || null })} className={INPUT}>
            <option value="">Not selected</option>
            {sumberTally ? <option value={sumberTally}>Set in Tally (participant list)</option> : null}
            {payload?.available_sub_events.map((item) => <option key={item.subEventId} value={item.subEventId}>{item.subEventName} ({plural(item.seatCount, "seat")})</option>)}
            {orphanSubEvent && aktif.sub_event_id ? <option value={aktif.sub_event_id}>{aktif.sub_event_id} (not in the latest data)</option> : null}
          </select>
        </Field>
        {payload?.available_sub_events.length === 0 && !pakaiTally ? <p className="text-body-medium text-warning">The scanner API has not sent any seat data yet. To type seats yourself, choose Set in Tally.</p> : null}
        {aktif.is_published && (!aktif.sub_event_id || orphanSubEvent) ? (
          <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
            <Warning size={16} className="mt-0.5 shrink-0 text-warning" />
            {aktif.sub_event_id
              ? "This session is shown to participants, but its seat source is no longer in the scanner API data, so every seat looks empty."
              : "This session is shown to participants, but no seat source is selected, so every seat looks empty."}
          </p>
        ) : null}
      </Kelompok>
      <Kelompok title="Appearance">
        <div className="grid grid-cols-3 gap-2">
          {([["background_color", "Background"], ["text_color", "Text"], ["accent_color", "Accent"]] as const).map(([key, label]) => (
            <Field key={key} label={label} htmlFor={`${key}-${aktif.id}`}>
              <input id={`${key}-${aktif.id}`} type="color" value={aktif[key]} onChange={(event) => updateSession(aktif.id, { [key]: event.target.value })} className="mt-1.5 h-9 w-full rounded-md border border-outline" />
            </Field>
          ))}
        </div>
        <div>
          <Lipatan title="Seat colours" detail="Empty, occupied, checked in, outline">
            <div className="grid grid-cols-2 gap-3">
              {([
                ["seat_available_color", "Empty seat", "Default: background colour"],
                ["seat_occupied_color", "Occupied seat", "Default: text colour"],
                ["seat_checked_in_color", "Checked in", "Default: green"],
                ["seat_outline_color", "Outline", "Default: text colour"],
              ] as const).map(([key, label, hint]) => {
                const shown = aktif[key] ?? (
                  key === "seat_available_color" ? warnaEfektif?.available
                    : key === "seat_occupied_color" ? warnaEfektif?.occupied
                      : key === "seat_checked_in_color" ? warnaEfektif?.checkedIn
                        : warnaEfektif?.outline
                ) ?? "#000000";
                return (
                  <div key={key}>
                    <label className="block text-body-medium font-medium" htmlFor={`${key}-${aktif.id}`}>{label}</label>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <input id={`${key}-${aktif.id}`} type="color" value={shown} onChange={(event) => updateSession(aktif.id, { [key]: event.target.value })} className="h-9 w-full rounded-md border border-outline" />
                      <Button variant="outlined" size="sm" disabled={aktif[key] === null} onClick={() => updateSession(aktif.id, { [key]: null })}>Default</Button>
                    </div>
                    <p className="mt-1 text-body-medium text-on-surface-variant">{aktif[key] ? aktif[key]?.toUpperCase() : hint}</p>
                  </div>
                );
              })}
            </div>
          </Lipatan>
          <Lipatan title="Background image" detail={aktif.background_image_url ? "Added" : "None yet. PNG, JPG or WebP, up to 5 MB"}>
            <div className="flex flex-col gap-3">
              <p className="text-body-medium text-on-surface-variant">A dark overlay is added automatically so table numbers and the QR code stay readable.</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className={cx("inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-outline bg-surface-container-lowest px-3 text-body-medium font-medium hover:bg-primary-soft focus-within:ring-2 focus-within:ring-primary", uploadingBackground === aktif.id && "pointer-events-none opacity-60")}>
                  <UploadSimple size={16} />
                  {uploadingBackground === aktif.id ? "Uploading…" : "Upload image"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploadingBackground === aktif.id}
                    onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadSessionBackground(aktif, file); event.target.value = ""; }} />
                </label>
                {aktif.background_image_url ? <Button variant="text" size="sm" className="text-error" onClick={() => updateSession(aktif.id, { background_image_url: null })}>Remove image</Button> : null}
              </div>
              {aktif.background_image_url ? (
                <>
                  <span className="h-16 w-28 rounded-md border border-outline-variant bg-cover bg-center" style={{ backgroundImage: `url(${aktif.background_image_url})` }} />
                  <label className="flex cursor-pointer items-start gap-3 text-body-medium">
                    <input type="checkbox" checked={aktif.map_panel_transparent} onChange={(event) => updateSession(aktif.id, { map_panel_transparent: event.target.checked })} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
                    <span><span className="block font-medium">Transparent seating plan</span><span className="block text-on-surface-variant">The background image shows in full behind the tables.</span></span>
                  </label>
                </>
              ) : null}
            </div>
          </Lipatan>
          <Lipatan title="Header & footer" detail="Logo, sponsor block, typeface and text size">
            <BrandingEditor
              idPrefix={`session-${aktif.id}`}
              value={normalizeBranding(aktif as unknown as Record<string, unknown>)}
              onChange={(changes) => updateSession(aktif.id, changes)}
              baseTextColor={aktif.text_color}
              baseBackgroundColor={aktif.background_color}
              baseAccentColor={aktif.accent_color}
            />
          </Lipatan>
        </div>
      </Kelompok>
      <section className="flex items-center gap-3 border-t border-outline-variant pt-5">
        <div className="min-w-0 flex-1">
          <p className="text-body-medium font-medium">Delete session</p>
          <p className="text-body-medium text-on-surface-variant">Its appearance and seat source are removed; participant data stays.</p>
        </div>
        <Button simpan variant="outlined" size="sm" className="text-error" icon={<Trash size={16} />} onClick={() => setConfirmDelete(aktif)}>Delete</Button>
      </section>
    </div>
  ) : (
    <EmptyState
      plain
      title="No sessions yet"
      description="A session decides what participants see on the seating plan page. New sessions always start as drafts."
      action={<Button size="sm" icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>Add session</Button>}
    />
  );

  const galatRuangan = prefixInvalid ? "Fix the label prefix first" : seatConflicts.length > 0 ? "Give each section its own label prefix" : labelConflicts.length > 0 ? "Fix duplicate table labels first" : null;
  const catatanBelumSimpan = (teks: string) => <span className="inline-flex items-center gap-1.5 text-on-surface"><span aria-hidden className="size-2 rounded-full bg-warning" />{teks}</span>;

  const tombolPanelSesi = (
    <div className="shrink-0 border-b border-outline-variant px-4 py-3">
      <SegmentedButton<"kursi" | "setelan">
        label="Panel"
        value={panelSesi}
        onChange={(nilai) => { setPanelSesi(nilai); setOrangDipilih(null); }}
        className="w-full"
        options={[{ value: "kursi", label: "Seats" }, { value: "setelan", label: sesiBerubah ? "Session settings •" : "Session settings" }]}
      />
    </div>
  );

  const panel = tampilan === "ruangan" ? (
    <Pane as="aside" aria-label="Room layout">
      <PaneBody className="px-4 py-4">{isiRuangan}</PaneBody>
      <PaneFooter
        note={galatRuangan ? <span className="inline-flex items-center gap-1.5 text-warning"><Warning size={16} />{galatRuangan}</span> : tataRuangBerubah ? catatanBelumSimpan("Unsaved changes") : "Shared by every session"}
      >
        {tataRuangBerubah ? <Button variant="outlined" size="sm" disabled={savingConfig} onClick={() => configTersimpan && setConfig(configTersimpan)}>Discard</Button> : null}
        <Button simpan size="sm" onClick={() => void saveRoom()} loading={savingConfig} disabled={!tataRuangBerubah || galatRuangan !== null}>Save layout</Button>
      </PaneFooter>
    </Pane>
  ) : pakaiTally && aktif && report && panelSesi === "kursi" ? (
    <Pane as="aside" aria-label="Seats">
      {tombolPanelSesi}
      <PaneBody className="px-4 py-4">
        <SeatsPanel
          sessionId={aktif.id}
          tanpaKursi={report.participants_without_seat}
          terisi={jumlahTerisi + diLuarDenah.length}
          dipilih={orangDipilih}
          onPilih={setOrangDipilih}
          kursiBerikut={kursiBerikut}
          onDudukkan={(label) => void dudukkan(label)}
          menyimpan={mendudukkan}
          diLuarDenah={diLuarDenah}
          segar={segar}
        />
      </PaneBody>
    </Pane>
  ) : (
    <Pane as="aside" aria-label="Session settings">
      {pakaiTally && aktif && report ? tombolPanelSesi : null}
      <PaneBody className="px-4 py-4">{isiAgenda}</PaneBody>
      {aktif ? (
        <PaneFooter note={sesiBerubah ? catatanBelumSimpan("Unsaved changes") : "This session only"}>
          {sesiBerubah ? <Button variant="outlined" size="sm" disabled={savingSession === aktif.id} onClick={() => sesiTersimpan && updateSession(aktif.id, sesiTersimpan)}>Discard</Button> : null}
          <Button simpan size="sm" onClick={() => void saveSession(aktif)} loading={savingSession === aktif.id} disabled={!sesiBerubah}>Save session</Button>
        </PaneFooter>
      ) : null}
    </Pane>
  );

  return (
    <WorkspacePage fill>
      <div lang="en" className="contents">
      <WorkspaceHeader
        meta={config ? (
          <>
            <span>{configTersimpan?.layout_params.sections?.length ? "Mixed (sections)" : LAYOUT_INFO[configTersimpan?.layout_type ?? config.layout_type].name}</span>
            <MetaSeparator />
            <span>{plural(payload?.geometry.total_tables ?? 0, "table")}, {plural(payload?.geometry.total_seats ?? 0, "seat")}</span>
            <MetaSeparator />
            <span>{plural(sessions.length, "session")}</span>
          </>
        ) : null}
        actions={config ? (
          <>
            {tampilan === "sesi" ? <Button variant="outlined" icon={<Armchair size={16} />} onClick={() => setTampilan("ruangan")}>Room layout</Button> : null}
            <Button variant="outlined" icon={<Monitor size={16} />} onClick={bukaLayar}>Screen settings</Button>
            <span ref={setPemicuBuka} className="inline-flex">
              <Button variant="outlined" icon={<ArrowSquareOut size={16} />} aria-haspopup="menu" aria-expanded={menuBuka.open} aria-controls={menuBukaId} onClick={menuBuka.toggle}>
                Open public page<CaretDown size={14} aria-hidden />
              </Button>
            </span>
            <Popover anchor={menuBuka} id={menuBukaId} label="Open public page" width={280} className="p-0">
              {[
                { href: "/denah", label: "Name search page", detail: "Phones and touch screens" },
                { href: "/denah?mode=qr", label: "LED screen", detail: "Large QR code, no names" },
              ].map((item) => (
                <a key={item.href} role="menuitem" href={item.href} target="_blank" rel="noreferrer" className="flex items-start gap-3 border-b border-outline-variant p-3 text-left last:border-b-0 hover:bg-primary-soft" onClick={() => menuBuka.tutup()}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-medium font-medium">{item.label}</span>
                    <span className="mt-0.5 block text-body-small text-on-surface-variant">{item.detail}</span>
                  </span>
                  <ArrowSquareOut size={16} aria-hidden className="mt-0.5 shrink-0 text-on-surface-variant" />
                </a>
              ))}
            </Popover>
          </>
        ) : null}
      />

      {error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : null}

      {!config ? <PageLoading /> : tampilan === "ruangan" ? (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-outline-variant py-2">
            <Button variant="text" size="sm" icon={<ArrowLeft size={16} />} onClick={() => keluarRuangan()}>Back to sessions</Button>
            <span className="text-title-small text-on-surface">Room layout</span>
            <span className="text-body-medium text-on-surface-variant">
              Shared by {sessions.length === 1 ? "the session" : sessions.length === 2 ? "both sessions" : `all ${sessions.length} sessions`}{sessions.length > 0 ? `: ${sessions.map((item) => item.name).join(", ")}` : ""}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <SupportingPane main={peta} pane={panel} />
          </div>
        </>
      ) : (
        <>
          <div className="flex shrink-0 items-end gap-2 border-b border-outline-variant">
            {sessions.length > 0 ? (
              // Tabs membawa shrink-0; pembungkus ini yang menyempit agar tombol + Session tetap di layar.
              <div className="min-w-0">
                <Tabs
                  label="Sessions"
                  idPrefix="agenda"
                  value={aktif?.slug ?? ""}
                  onChange={(slug) => { setPreviewSlug(slug); setOrangDipilih(null); }}
                  className="border-b-0"
                  options={sessions.map((item) => ({ value: item.slug, label: item.name, badge: item.is_published ? undefined : "Draft" }))}
                />
              </div>
            ) : <span className="py-2.5 text-body-medium text-on-surface-variant">No sessions yet</span>}
            <Button variant="text" size="sm" className="mb-1 shrink-0" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Session</Button>
          </div>
          <div role="tabpanel" id={`agenda-panel-${aktif?.slug ?? ""}`} aria-labelledby={aktif ? `agenda-tab-${aktif.slug}` : undefined} className="flex min-h-0 flex-1 flex-col">
            <SupportingPane main={peta} pane={panel} />
          </div>
        </>
      )}

      <Dialog
        open={konfirmasiKeluar}
        onClose={() => setKonfirmasiKeluar(false)}
        size="sm"
        title="Leave without saving?"
        description="Your changes to the room layout are not saved. Leaving discards them."
        actions={
          <>
            <Button variant="outlined" onClick={() => setKonfirmasiKeluar(false)}>Keep editing</Button>
            <Button variant="danger" onClick={() => keluarRuangan(true)}>Discard changes</Button>
          </>
        }
      />

      <Dialog
        open={layarOpen}
        onClose={() => setLayarOpen(false)}
        dismissible={!savingConfig}
        scrollBody
        fullScreenOnMobile
        title="Screen settings"
        description="Applies to every screen that opens the seating plan page."
        actions={
          <>
            <Button variant="outlined" disabled={savingConfig} onClick={() => setLayarOpen(false)}>Cancel</Button>
            <Button simpan loading={savingConfig} onClick={() => layarDraft && void saveScreens(layarDraft)}>Save screen settings</Button>
          </>
        }
      >
        {isiLayar}
      </Dialog>

      <AssignSeatDialog
        kursi={kursiDipilih}
        onClose={() => setKursiDipilih(null)}
        onSaved={(pesan, langkah) => {
          setKursiDipilih(null);
          if (!pesan) toast.error("Seat not changed", "Someone else changed this seat. The map has been refreshed.");
          else if (langkah) setUrungkan({ pesan, langkah });
          else { setUrungkan(null); toast.success(pesan); }
          void muatKursi();
          void load({ ruangan: "pertahankan", sesi: "pertahankan" });
        }}
      />

      <Dialog
        open={addOpen}
        onClose={() => { setAddOpen(false); setNewAgendaName(""); }}
        dismissible={!creating}
        size="sm"
        title="Add session"
        description="New sessions start as drafts, so participants cannot see them yet."
        actions={
          <>
            <Button variant="outlined" disabled={creating} onClick={() => { setAddOpen(false); setNewAgendaName(""); }}>Cancel</Button>
            <Button simpan type="submit" form="form-agenda" loading={creating} disabled={!newAgendaName.trim()}>Add session</Button>
          </>
        }
      >
        <form id="form-agenda" onSubmit={(event) => { event.preventDefault(); void createAgenda(); }}>
          <Field label="Session name" htmlFor="new-agenda">
            <input id="new-agenda" autoFocus value={newAgendaName} maxLength={120} onChange={(event) => setNewAgendaName(event.target.value)} placeholder="e.g. Afternoon coffee break" className={INPUT} />
          </Field>
        </form>
      </Dialog>

      <Dialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        dismissible={!deleting}
        tone="danger"
        title={`Delete session ${confirmDelete?.name ?? ""}?`}
        description={`${confirmDelete?.is_published ? "Participants can see this session now. " : ""}Its appearance and seat source are removed. Participant data is not affected, because seat assignments are stored in the scanner API.`}
        actions={
          <>
            <Button variant="outlined" disabled={deleting} onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={deleting} onClick={() => { if (confirmDelete) void deleteAgenda(confirmDelete); }}>Delete session</Button>
          </>
        }
      />
      </div>
    </WorkspacePage>
  );
}
