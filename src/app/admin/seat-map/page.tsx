"use client";

import { ArrowSquareOut, CaretDown, Info, Monitor, Plus, Trash, UploadSimple, Warning, XCircle } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { SeatMapView } from "@/components/seat-map-view";
import { useToast } from "@/components/toast";
import { normalizeBranding, type Branding } from "@/lib/branding";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import {
  computeSeatMapGeometry, duplicateTableLabels, MAX_TABLE_LABEL_LENGTH, normalizeSeatLabel, resolveSeatColors, tableLabelFor,
  type PublicViewMode, type SeatColors, type SeatMapConfig, type SeatMapLayout, type SeatMapLayoutParams, type SeatRule,
  LAYOUT_INFO, layoutDefaults, SEAT_MAP_LAYOUTS,
} from "@/lib/seat-map";
import {
  Banner, Button, ButtonLink, Dialog, EmptyState, IconButton, MetaSeparator, PageLoading, Pane, PaneBody, PaneFooter,
  SegmentedButton, StatusChip, SupportingPane, Switch, Tabs, WorkspaceHeader, WorkspacePage,
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

type Bagian = "ruangan" | "agenda" | "layar";

const BULAT = ["banquet_round", "cabaret", "head_table"];

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

export default function SeatMapAdminPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingSession, setSavingSession] = useState<number | null>(null);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [bagian, setBagian] = useState<Bagian>("ruangan");
  const [addOpen, setAddOpen] = useState(false);
  const [newAgendaName, setNewAgendaName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Session | null>(null);
  const [uploadingBackground, setUploadingBackground] = useState<number | null>(null);
  const [error, setError] = useState("");
  const toast = useToast();

  /**
   * `pertahankanSuntingan`: tambah/hapus agenda hanya menyegarkan DAFTAR agenda.
   * Tanpa ini, suntingan tata ruang yang belum disimpan tertimpa isi database.
   */
  async function load(pertahankanSuntingan = false) {
    const response = await fetch("/api/admin/seat-map", { cache: "no-store" }).catch(() => null);
    if (!response) { setError("Connection lost. The seating plan could not be loaded."); return; }
    if (!response.ok) { setError("The seating plan could not be loaded."); return; }
    const data = (await response.json()) as Payload;
    setPayload(data);
    if (pertahankanSuntingan) {
      setSessions((current) => data.sessions.map((row) => current.find((item) => item.id === row.id) ?? row));
      setConfig((current) =>
        current && current.default_session_id !== null && !data.sessions.some((row) => row.id === current.default_session_id)
          ? { ...current, default_session_id: null }
          : current,
      );
    } else {
      setConfig(data.config);
      setSessions(data.sessions);
    }
    setPreviewSlug((current) => (current && data.sessions.some((row) => row.slug === current) ? current : data.sessions[0]?.slug ?? null));
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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

  async function saveConfig() {
    if (!config) return;
    setSavingConfig(true); setError("");
    const response = await fetch("/api/admin/seat-map", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: config.name,
        stage_label: config.stage_label,
        row_table_counts: config.row_table_counts,
        seat_rules: config.seat_rules,
        seat_label_pattern: config.seat_label_pattern,
        table_overrides: config.table_overrides,
        table_labels: config.table_labels,
        layout_type: config.layout_type,
        layout_params: config.layout_params,
        public_view_mode: config.public_view_mode,
        default_session_id: config.default_session_id,
      }),
    }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    setSavingConfig(false);
    if (!response?.ok) {
      const failure = data?.error?.details?.message ?? data?.error?.message ?? "Seating plan not saved.";
      toast.error("Seating plan not saved", failure);
      return;
    }
    toast.success("Seating plan saved", "Applies to every session.");
    await load();
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
    await load(true);
    if (data?.slug) { setPreviewSlug(data.slug); setBagian("agenda"); }
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
    await load(true);
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
    await load();
  }

  const aktif = sessions.find((item) => item.slug === previewSlug) ?? sessions[0] ?? null;
  const report = aktif ? payload?.reports.find((item) => item.session_id === aktif.id) : undefined;
  const totalTablesFromRows = (config?.row_table_counts ?? []).reduce((sum, count) => sum + count, 0);
  const labelConflicts = config ? duplicateTableLabels(config) : [];
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
  const orphanSubEvent = aktif?.sub_event_id != null && payload !== null && !payload.available_sub_events.some((item) => item.subEventId === aktif.sub_event_id);
  const publik = sessions.filter((item) => item.is_published);

  // ---- Panel utama: denah hidup --------------------------------------------
  const peta = config ? (
    <Pane aria-label="Seating plan preview">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-outline-variant px-4 py-2.5 text-body-medium text-on-surface-variant">
        {warnaEfektif ? (
          <>
            {([["Empty", warnaEfektif.available], ["Occupied", warnaEfektif.occupied], ["Checked in", warnaEfektif.checkedIn]] as const).map(([label, warna]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-full border border-outline-variant" style={{ background: warna }} />{label}
              </span>
            ))}
          </>
        ) : <span>Sample occupancy: table 1 checked in, table 2 occupied.</span>}
        <span className="ml-auto">Display: {VIEW_MODES.find((mode) => mode.value === config.public_view_mode)?.label}</span>
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
          config={config}
          seatStates={previewSeatStates}
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
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-outline-variant px-4 py-2.5 text-body-medium">
        {report ? (
          <>
            <span className="text-on-surface-variant">{plural(report.matched_seats, "seat")} occupied, {report.empty_seats.toLocaleString("en-GB")} empty, {plural(report.participants_without_seat, "participant")} without a seat</span>
            <span className="ml-auto">
              {report.unmatched_count > 0
                ? <StatusChip tone="warning" title={`For example: ${report.unmatched_labels.slice(0, 6).join(", ")}`}>{plural(report.unmatched_count, "label")} not on the seating plan</StatusChip>
                : report.total_assignments > 0 ? <StatusChip dot tone="success">All labels match</StatusChip> : null}
            </span>
          </>
        ) : (
          <span className="text-on-surface-variant">{plural(payload?.geometry.total_tables ?? 0, "table")}, {plural(payload?.geometry.total_seats ?? 0, "seat")}. Seat matching appears once the session has a seat source.</span>
        )}
      </div>
    </Pane>
  ) : null;

  // ---- Panel pendukung ---------------------------------------------------------
  const isiRuangan = config ? (
    <div className="flex flex-col gap-5">
      <p className="flex items-start gap-2 rounded-md bg-surface-container-high p-3 text-body-medium text-on-surface-variant"><Info size={16} className="mt-0.5 shrink-0" />Applies to every session.</p>
      <Kelompok title="Room shape" first>
        <Field label="Layout type" htmlFor="layout-type" hint={`${LAYOUT_INFO[config.layout_type].desc} ${LAYOUT_INFO[config.layout_type].labelHint}.`}>
          <select
            id="layout-type"
            value={config.layout_type}
            onChange={(event) => {
              const layout = event.target.value as SeatMapLayout;
              // Parameter kembali ke bawaan layout baru; nilai lama menimpa bawaan dan pilihannya tampak tidak berpengaruh.
              setConfig((current) => current && { ...current, layout_type: layout, layout_params: layoutDefaults(layout) });
            }}
            className={INPUT}
          >
            {SEAT_MAP_LAYOUTS.map((layout) => <option key={layout} value={layout}>{LAYOUT_INFO[layout].name}</option>)}
          </select>
        </Field>
        <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
          <Warning size={16} className="mt-0.5 shrink-0 text-warning" />
          Don&rsquo;t change the layout once participants have seat numbers: the seat labels change and existing seat assignments stop matching.
        </p>
        {BULAT.includes(config.layout_type) ? (
          <Field label="Seat arc (degrees)" hint="300 = almost all the way round the table. 190 = cabaret.">
            <input type="number" min={60} max={340} value={config.layout_params.arc_sweep} onChange={(event) => updateParam("arc_sweep", Number(event.target.value))} className={cx(INPUT, "w-32")} />
          </Field>
        ) : null}
        {config.layout_type === "theater" || config.layout_type === "classroom" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rows"><input type="number" min={1} max={40} value={config.layout_params.rows} onChange={(event) => updateParam("rows", Number(event.target.value))} className={INPUT} /></Field>
            <Field label={config.layout_type === "theater" ? "Seats per row" : "Tables per row"}><input type="number" min={1} max={40} value={config.layout_params.per_row} onChange={(event) => updateParam("per_row", Number(event.target.value))} className={INPUT} /></Field>
          </div>
        ) : null}
        {config.layout_type === "classroom" ? (
          <Field label="Seats per table"><input type="number" min={1} max={12} value={config.layout_params.seats_per_table} onChange={(event) => updateParam("seats_per_table", Number(event.target.value))} className={cx(INPUT, "w-32")} /></Field>
        ) : null}
        {config.layout_type === "theater" ? (
          <Field label="Aisle after seat number" hint="Separate with commas. Leave empty for no aisles.">
            <input
              value={config.layout_params.aisles.join(", ")}
              onChange={(event) => updateParam("aisles", event.target.value.split(",").map((bagian) => Number(bagian.trim())).filter((angka) => Number.isFinite(angka) && angka > 0))}
              placeholder="e.g. 5, 10"
              className={INPUT}
            />
          </Field>
        ) : null}
        {config.layout_type === "u_shape" || config.layout_type === "hollow_square" || config.layout_type === "boardroom" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Seats per long side"><input type="number" min={1} max={40} value={config.layout_params.seats_per_side} onChange={(event) => updateParam("seats_per_side", Number(event.target.value))} className={INPUT} /></Field>
            <Field label={config.layout_type === "boardroom" ? "Seats at the table ends" : "Seats on the head side"}><input type="number" min={0} max={20} value={config.layout_params.seats_head} onChange={(event) => updateParam("seats_head", Number(event.target.value))} className={INPUT} /></Field>
          </div>
        ) : null}
        {config.layout_type === "head_table" ? (
          <Field label="Head table seats"><input type="number" min={1} max={26} value={config.layout_params.head_seats} onChange={(event) => updateParam("head_seats", Number(event.target.value))} className={cx(INPUT, "w-32")} /></Field>
        ) : null}
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
                    aria-label={`Remove row ${index + 1}`}
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
        <Field label="Seat label pattern" htmlFor="label-pattern" hint="Must include {table} and {seat}, and must match how the scanner API writes labels.">
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

  const isiLayar = config ? (
    <div className="flex flex-col gap-5">
      <p className="flex items-start gap-2 rounded-md bg-surface-container-high p-3 text-body-medium text-on-surface-variant"><Info size={16} className="mt-0.5 shrink-0" />Applies to every screen that opens /denah.</p>
      <Kelompok title="Session shown" first>
        <Field label="Default session" htmlFor="default-session" hint={config.default_session_id ? "Screens with no session in their address show this session." : "On automatic, screens show the first public session in the list."}>
          <select id="default-session" value={config.default_session_id ?? ""} onChange={(event) => updateConfig("default_session_id", event.target.value ? Number(event.target.value) : null)} className={INPUT}>
            <option value="">First public session (automatic)</option>
            {publik.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        {publik.length === 0 ? <p className="text-body-medium text-warning">No session is shown to participants yet. Turn on &quot;Show to participants&quot; for one of the sessions.</p> : null}
        <p className="text-body-medium text-on-surface-variant">For two screens showing different sessions, put the session in the address, e.g. /denah?sesi={sessions[0]?.slug ?? "session-slug"}. The address always overrides this setting.</p>
      </Kelompok>
      <Kelompok title="Display mode">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Public page display mode</legend>
          {VIEW_MODES.map((mode) => {
            const on = config.public_view_mode === mode.value;
            return (
              <label key={mode.value} className={cx("flex cursor-pointer gap-3 rounded-lg border p-3 text-body-medium", on ? "border-2 border-primary" : "border-outline")}>
                <input type="radio" name="public-view-mode" value={mode.value} checked={on} onChange={() => updateConfig("public_view_mode", mode.value)} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
                <span>
                  <span className="block font-medium">{mode.label}</span>
                  <span className="block text-on-surface-variant">{mode.detail}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <p className="text-body-medium text-on-surface-variant">To force one screen into a mode, use /denah?mode=qr or ?mode=search.</p>
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
        <Field label="Seat source" htmlFor="agenda-source" hint="The scanner API sub-event that fills in participants' seat numbers.">
          <select id="agenda-source" value={aktif.sub_event_id ?? ""} onChange={(event) => updateSession(aktif.id, { sub_event_id: event.target.value || null })} className={INPUT}>
            <option value="">Not selected</option>
            {payload?.available_sub_events.map((item) => <option key={item.subEventId} value={item.subEventId}>{item.subEventName} ({plural(item.seatCount, "seat")})</option>)}
            {orphanSubEvent && aktif.sub_event_id ? <option value={aktif.sub_event_id}>{aktif.sub_event_id} (not in the latest data)</option> : null}
          </select>
        </Field>
        {payload?.available_sub_events.length === 0 ? <p className="text-body-medium text-warning">The scanner API has not sent any seat data yet. Options appear once staff fill it in.</p> : null}
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

  const kaki: Record<Bagian, { note: ReactNode; aksi: ReactNode }> = {
    ruangan: {
      note: labelConflicts.length > 0 ? <span className="inline-flex items-center gap-1.5 text-warning"><Warning size={16} />Fix duplicate table labels first</span> : "Changes every session",
      aksi: <Button simpan size="sm" onClick={() => void saveConfig()} loading={savingConfig} disabled={labelConflicts.length > 0}>Save layout</Button>,
    },
    layar: {
      note: "Applies to every screen",
      aksi: <Button simpan size="sm" onClick={() => void saveConfig()} loading={savingConfig} disabled={labelConflicts.length > 0}>Save</Button>,
    },
    agenda: {
      note: aktif ? "This session only" : null,
      aksi: aktif ? <Button simpan size="sm" onClick={() => void saveSession(aktif)} loading={savingSession === aktif.id}>Save session</Button> : null,
    },
  };

  const panel = (
    <Pane as="aside" aria-label="Seating plan settings">
      <div className="shrink-0 border-b border-outline-variant px-4 py-3">
        <SegmentedButton<Bagian>
          label="Settings"
          value={bagian}
          onChange={setBagian}
          className="w-full"
          options={[{ value: "ruangan", label: "Room" }, { value: "agenda", label: "This session" }, { value: "layar", label: "Public screens" }]}
        />
      </div>
      <PaneBody className="px-4 py-4">{bagian === "ruangan" ? isiRuangan : bagian === "layar" ? isiLayar : isiAgenda}</PaneBody>
      <PaneFooter note={kaki[bagian].note}>{kaki[bagian].aksi}</PaneFooter>
    </Pane>
  );

  return (
    <WorkspacePage fill>
      <div lang="en" className="contents">
      <WorkspaceHeader
        meta={config ? (
          <>
            <span>{LAYOUT_INFO[config.layout_type].name}</span>
            <MetaSeparator />
            <span>{plural(payload?.geometry.total_tables ?? 0, "table")}, {plural(payload?.geometry.total_seats ?? 0, "seat")}</span>
            <MetaSeparator />
            <span>Seat assignments come from the scanner API</span>
          </>
        ) : null}
        actions={
          <>
            <ButtonLink href="/denah?mode=qr" target="_blank" rel="noreferrer" variant="outlined" icon={<Monitor size={16} />}>Preview LED</ButtonLink>
            <ButtonLink href="/denah" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Public page</ButtonLink>
          </>
        }
      />

      {error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : null}

      {!config ? <PageLoading /> : (
        <>
          <div className="flex shrink-0 items-end gap-2 border-b border-outline-variant">
            {sessions.length > 0 ? (
              // Tabs membawa shrink-0; pembungkus ini yang menyempit agar tombol + Agenda tetap di layar.
              <div className="min-w-0">
                <Tabs
                  label="Sessions"
                  idPrefix="agenda"
                  value={aktif?.slug ?? ""}
                  onChange={(slug) => setPreviewSlug(slug)}
                  className="border-b-0"
                  options={sessions.map((item) => ({ value: item.slug, label: item.name, badge: item.is_published ? undefined : "Draft" }))}
                />
              </div>
            ) : <span className="py-2.5 text-body-medium text-on-surface-variant">No sessions yet</span>}
            <button type="button" onClick={() => setAddOpen(true)} className="mb-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-body-medium font-medium text-primary hover:bg-primary-soft">
              <Plus size={14} />Session
            </button>
          </div>
          <div role="tabpanel" id={`agenda-panel-${aktif?.slug ?? ""}`} aria-labelledby={aktif ? `agenda-tab-${aktif.slug}` : undefined} className="flex min-h-0 flex-1 flex-col">
            <SupportingPane main={peta} pane={panel} />
          </div>
        </>
      )}

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
