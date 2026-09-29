"use client";

import { ArrowSquareOut, CaretDown, Info, Monitor, Plus, Trash, UploadSimple, Warning, XCircle } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { SeatMapView } from "@/components/seat-map-view";
import { useToast } from "@/components/toast";
import { normalizeBranding, type Branding } from "@/lib/branding";
import { cx } from "@/lib/m3/cx";
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
  { value: "search", label: "Pencarian nama", detail: "Untuk HP tamu dan layar sentuh. Tamu mengetik namanya, kursinya disorot." },
  { value: "qr", label: "QR untuk LED", detail: "Untuk LED tanpa sentuh. Layar menampilkan QR besar; nama peserta tidak ditampilkan." },
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
    if (!response) { setError("Koneksi terputus. Data denah tidak bisa dimuat."); return; }
    if (!response.ok) { setError("Data denah gagal dimuat."); return; }
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
      const failure = data?.error?.details?.file ?? data?.error?.message ?? "Upload gambar gagal.";
      toast.error("Upload gambar gagal", failure);
      return;
    }
    updateSession(session.id, { background_image_url: data.url });
    toast.info("Gambar terunggah", "Tekan Simpan agenda untuk menerapkannya.");
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
      const failure = data?.error?.details?.message ?? data?.error?.message ?? "Denah gagal disimpan.";
      toast.error("Denah gagal disimpan", failure);
      return;
    }
    toast.success("Denah tersimpan", "Berlaku untuk semua agenda.");
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
      const failure = data?.error?.details?.message ?? data?.error?.message ?? "Agenda gagal ditambahkan.";
      toast.error("Agenda gagal ditambahkan", failure);
      return;
    }
    setNewAgendaName("");
    setAddOpen(false);
    toast.success("Agenda ditambahkan", "Masih draf. Pilih sumber penempatan lalu tampilkan ke tamu.");
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
      toast.error("Agenda gagal dihapus", data?.error?.message ?? "Coba lagi.");
      return;
    }
    setPreviewSlug((current) => (current === session.slug ? null : current));
    toast.success("Agenda dihapus", "Data peserta tidak terpengaruh.");
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
      toast.error("Agenda gagal disimpan", data?.error?.message ?? "Coba lagi.");
      return;
    }
    toast.success("Agenda tersimpan", session.is_published ? "Agenda ini tampil di halaman publik." : "Agenda ini belum tampil ke tamu.");
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
    <Pane aria-label="Pratinjau denah">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-outline-variant px-4 py-2.5 text-body-medium text-on-surface-variant">
        {warnaEfektif ? (
          <>
            {([["Kosong", warnaEfektif.available], ["Terisi", warnaEfektif.occupied], ["Sudah check-in", warnaEfektif.checkedIn]] as const).map(([label, warna]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-full border border-outline-variant" style={{ background: warna }} />{label}
              </span>
            ))}
          </>
        ) : <span>Contoh keterisian: meja 1 sudah check-in, meja 2 terisi.</span>}
        <span className="ml-auto">Tampilan: {VIEW_MODES.find((mode) => mode.value === config.public_view_mode)?.label}</span>
      </div>
      <div
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
            <span className="text-on-surface-variant">{report.matched_seats} terisi, {report.empty_seats} kosong, {report.participants_without_seat} peserta belum punya kursi</span>
            <span className="ml-auto">
              {report.unmatched_count > 0
                ? <StatusChip tone="warning" title={`Contoh: ${report.unmatched_labels.slice(0, 6).join(", ")}`}>{report.unmatched_count} label tidak ada di denah</StatusChip>
                : report.total_assignments > 0 ? <StatusChip dot tone="success">Semua label cocok</StatusChip> : null}
            </span>
          </>
        ) : (
          <span className="text-on-surface-variant">{payload?.geometry.total_tables ?? 0} meja, {payload?.geometry.total_seats ?? 0} kursi. Pencocokan data muncul setelah agenda punya sumber penempatan.</span>
        )}
      </div>
    </Pane>
  ) : null;

  // ---- Panel pendukung ---------------------------------------------------------
  const isiRuangan = config ? (
    <div className="flex flex-col gap-5">
      <p className="flex items-start gap-2 rounded-md bg-surface-container-high p-3 text-body-medium text-on-surface-variant"><Info size={16} className="mt-0.5 shrink-0" />Berlaku untuk semua agenda.</p>
      <Kelompok title="Bentuk ruangan" first>
        <Field label="Jenis tata ruang" htmlFor="layout-type" hint={`${LAYOUT_INFO[config.layout_type].desc} ${LAYOUT_INFO[config.layout_type].labelHint}.`}>
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
          Jangan ganti tata ruang setelah peserta punya nomor kursi: label kursi ikut berubah dan penempatan yang sudah masuk gugur.
        </p>
        {BULAT.includes(config.layout_type) ? (
          <Field label="Busur kursi (derajat)" hint="300 = hampir mengelilingi meja. 190 = cabaret.">
            <input type="number" min={60} max={340} value={config.layout_params.arc_sweep} onChange={(event) => updateParam("arc_sweep", Number(event.target.value))} className={cx(INPUT, "w-32")} />
          </Field>
        ) : null}
        {config.layout_type === "theater" || config.layout_type === "classroom" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jumlah baris"><input type="number" min={1} max={40} value={config.layout_params.rows} onChange={(event) => updateParam("rows", Number(event.target.value))} className={INPUT} /></Field>
            <Field label={config.layout_type === "theater" ? "Kursi per baris" : "Meja per baris"}><input type="number" min={1} max={40} value={config.layout_params.per_row} onChange={(event) => updateParam("per_row", Number(event.target.value))} className={INPUT} /></Field>
          </div>
        ) : null}
        {config.layout_type === "classroom" ? (
          <Field label="Kursi per meja"><input type="number" min={1} max={12} value={config.layout_params.seats_per_table} onChange={(event) => updateParam("seats_per_table", Number(event.target.value))} className={cx(INPUT, "w-32")} /></Field>
        ) : null}
        {config.layout_type === "theater" ? (
          <Field label="Lorong setelah kursi ke-" hint="Pisahkan dengan koma. Kosongkan bila tanpa lorong.">
            <input
              value={config.layout_params.aisles.join(", ")}
              onChange={(event) => updateParam("aisles", event.target.value.split(",").map((bagian) => Number(bagian.trim())).filter((angka) => Number.isFinite(angka) && angka > 0))}
              placeholder="mis. 5, 10"
              className={INPUT}
            />
          </Field>
        ) : null}
        {config.layout_type === "u_shape" || config.layout_type === "hollow_square" || config.layout_type === "boardroom" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kursi per sisi panjang"><input type="number" min={1} max={40} value={config.layout_params.seats_per_side} onChange={(event) => updateParam("seats_per_side", Number(event.target.value))} className={INPUT} /></Field>
            <Field label={config.layout_type === "boardroom" ? "Kursi di ujung meja" : "Kursi di sisi kepala"}><input type="number" min={0} max={20} value={config.layout_params.seats_head} onChange={(event) => updateParam("seats_head", Number(event.target.value))} className={INPUT} /></Field>
          </div>
        ) : null}
        {config.layout_type === "head_table" ? (
          <Field label="Kursi meja utama"><input type="number" min={1} max={26} value={config.layout_params.head_seats} onChange={(event) => updateParam("head_seats", Number(event.target.value))} className={cx(INPUT, "w-32")} /></Field>
        ) : null}
      </Kelompok>

      <Kelompok title="Meja dan label">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nama denah" htmlFor="map-name"><input id="map-name" value={config.name} onChange={(event) => updateConfig("name", event.target.value)} className={INPUT} /></Field>
          <Field label="Label panggung" htmlFor="stage-label"><input id="stage-label" value={config.stage_label} onChange={(event) => updateConfig("stage_label", event.target.value)} className={INPUT} /></Field>
        </div>
        {BULAT.includes(config.layout_type) ? (
          <Field label="Meja per baris, dari panggung" hint={`Total ${totalTablesFromRows} meja. Nomor meja berjalan menerus.`}>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {config.row_table_counts.map((count, index) => (
                <span key={index} className="inline-flex items-center rounded-md border border-outline bg-surface-container-lowest">
                  <input
                    type="number" min={1} max={40} value={count}
                    aria-label={`Jumlah meja baris ${index + 1}`}
                    onChange={(event) => {
                      const next = [...config.row_table_counts];
                      next[index] = Math.max(1, Number(event.target.value) || 1);
                      updateConfig("row_table_counts", next);
                    }}
                    className="h-9 w-14 rounded-l-md bg-transparent px-2 text-body-medium outline-none"
                  />
                  <button
                    type="button"
                    aria-label={`Hapus baris ${index + 1}`}
                    disabled={config.row_table_counts.length <= 1}
                    onClick={() => updateConfig("row_table_counts", config.row_table_counts.filter((_, i) => i !== index))}
                    className="grid h-9 w-7 place-items-center rounded-r-md text-on-surface-variant hover:bg-primary-soft disabled:opacity-40"
                  >
                    <XCircle size={14} />
                  </button>
                </span>
              ))}
              <IconButton size="sm" variant="outlined" label="Tambah baris meja" onClick={() => updateConfig("row_table_counts", [...config.row_table_counts, 8])}><Plus size={16} /></IconButton>
            </div>
          </Field>
        ) : null}
        {BULAT.includes(config.layout_type) ? (
          <Field label="Kursi per meja bundar" hint="Diatur per rentang nomor meja. Aturan paling bawah menang bila bertumpuk.">
            <div className="mt-1.5 flex flex-col gap-2">
              {config.seat_rules.map((rule, index) => (
                <div key={index} className="flex items-center gap-2 text-body-medium">
                  <span className="text-on-surface-variant">Meja</span>
                  {(["from", "to"] as const).map((field, i) => (
                    <span key={field} className="contents">
                      {i === 1 ? <span className="text-on-surface-variant">sampai</span> : null}
                      <input
                        type="number" min={1} max={999} value={rule[field]}
                        aria-label={field === "from" ? `Aturan ${index + 1}: meja dari` : `Aturan ${index + 1}: meja sampai`}
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
                    aria-label={`Aturan ${index + 1}: jumlah kursi`}
                    onChange={(event) => {
                      const next: SeatRule[] = [...config.seat_rules];
                      next[index] = { ...rule, seats: Math.max(0, Number(event.target.value) || 0) };
                      updateConfig("seat_rules", next);
                    }}
                    className="h-9 w-14 rounded-md border border-outline bg-surface-container-lowest px-2 outline-none focus:border-primary"
                  />
                  <span className="text-on-surface-variant">kursi</span>
                  <IconButton size="sm" label={`Hapus aturan ${index + 1}`} onClick={() => updateConfig("seat_rules", config.seat_rules.filter((_, i) => i !== index))}><Trash size={14} /></IconButton>
                </div>
              ))}
              <div><Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => updateConfig("seat_rules", [...config.seat_rules, { from: 1, to: 1, seats: 6 }])}>Tambah aturan</Button></div>
            </div>
          </Field>
        ) : null}
        <Field label="Pola label kursi" htmlFor="label-pattern" hint="Wajib memuat {table} dan {seat}, dan harus sama dengan penulisan label di scanner API.">
          <input id="label-pattern" value={config.seat_label_pattern} onChange={(event) => updateConfig("seat_label_pattern", event.target.value)} className={INPUT} />
        </Field>
        <Field label="Label meja khusus" hint="Untuk meja yang tulisannya berbeda dari nomor urutnya, mis. meja ke-4 ditulis 3A. Posisi meja tidak bergeser.">
          <div className="mt-1.5 flex flex-col gap-2">
            {labeledTables.length === 0 ? <p className="text-body-medium text-on-surface-variant">Belum ada. Semua meja memakai nomor urutnya.</p> : null}
            {labeledTables.map((position) => (
              <div key={position} className="flex items-center gap-2 text-body-medium">
                <span className="w-24 shrink-0 text-on-surface-variant">Meja ke-{position}</span>
                <input
                  value={config.table_labels[String(position)] ?? ""}
                  maxLength={MAX_TABLE_LABEL_LENGTH}
                  aria-label={`Label untuk meja ke-${position}`}
                  onChange={(event) => setTableLabel(position, event.target.value)}
                  className="h-9 w-24 rounded-md border border-outline bg-surface-container-lowest px-2 outline-none focus:border-primary"
                />
                <IconButton size="sm" label={`Hapus label meja ke-${position}`} onClick={() => setTableLabel(position, "")}><Trash size={14} /></IconButton>
              </div>
            ))}
            <select
              value=""
              aria-label="Tambah label untuk meja"
              onChange={(event) => { const position = Number(event.target.value); if (position) setTableLabel(position, String(position)); }}
              className={cx(INPUT, "mt-0")}
            >
              <option value="">Tambah label untuk meja...</option>
              {Array.from({ length: totalTablesFromRows }, (_, index) => index + 1)
                .filter((position) => !(String(position) in config.table_labels))
                .map((position) => <option key={position} value={position}>Meja ke-{position} (sekarang {tableLabelFor(position, config.table_labels)})</option>)}
            </select>
            {labelConflicts.length > 0 ? (
              <p className="flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error">
                <Warning size={16} className="mt-0.5 shrink-0" />
                Label {labelConflicts.join(", ")} dipakai lebih dari satu meja, jadi tamu bisa diarahkan ke meja yang salah. Betulkan sebelum menyimpan.
              </p>
            ) : null}
          </div>
        </Field>
      </Kelompok>
    </div>
  ) : null;

  const isiLayar = config ? (
    <div className="flex flex-col gap-5">
      <p className="flex items-start gap-2 rounded-md bg-surface-container-high p-3 text-body-medium text-on-surface-variant"><Info size={16} className="mt-0.5 shrink-0" />Berlaku untuk semua layar yang membuka /denah.</p>
      <Kelompok title="Agenda yang tampil" first>
        <Field label="Agenda aktif" htmlFor="default-session" hint={config.default_session_id ? "Layar tanpa agenda di alamatnya menampilkan agenda ini." : "Saat otomatis, layar mengikuti agenda publik yang urutannya paling awal."}>
          <select id="default-session" value={config.default_session_id ?? ""} onChange={(event) => updateConfig("default_session_id", event.target.value ? Number(event.target.value) : null)} className={INPUT}>
            <option value="">Agenda publik pertama (otomatis)</option>
            {publik.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        {publik.length === 0 ? <p className="text-body-medium text-warning">Belum ada agenda yang tampil ke tamu. Nyalakan &quot;Tampil ke tamu&quot; di salah satu agenda.</p> : null}
        <p className="text-body-medium text-on-surface-variant">Dua layar dengan agenda berbeda: sebut agendanya di alamat, mis. /denah?sesi={sessions[0]?.slug ?? "slug-agenda"}. Alamat selalu menang atas setelan ini.</p>
      </Kelompok>
      <Kelompok title="Mode tampilan">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Mode tampilan halaman publik</legend>
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
        <p className="text-body-medium text-on-surface-variant">Satu layar bisa dipaksa lewat /denah?mode=qr atau ?mode=search.</p>
      </Kelompok>
    </div>
  ) : null;

  const isiAgenda = aktif ? (
    <div className="flex flex-col gap-5">
      <Switch
        checked={aktif.is_published}
        onChange={(checked) => updateSession(aktif.id, { is_published: checked })}
        label="Tampil ke tamu"
        description={`/denah?sesi=${aktif.slug}`}
      />
      <Kelompok title="Isi">
        <Field label="Nama agenda" htmlFor="agenda-name" hint="Dipakai di tab dan tombol pemilih agenda.">
          <input id="agenda-name" value={aktif.name} maxLength={120} onChange={(event) => updateSession(aktif.id, { name: event.target.value })} className={INPUT} />
        </Field>
        <Field label="Judul di halaman publik" htmlFor="agenda-title"><input id="agenda-title" value={aktif.title} onChange={(event) => updateSession(aktif.id, { title: event.target.value })} className={INPUT} /></Field>
        <Field label="Sub judul" htmlFor="agenda-subtitle"><input id="agenda-subtitle" value={aktif.subtitle ?? ""} onChange={(event) => updateSession(aktif.id, { subtitle: event.target.value })} className={INPUT} /></Field>
        <Field label="Sumber penempatan" htmlFor="agenda-source" hint="Sub-event scanner API yang mengisi nomor kursi peserta.">
          <select id="agenda-source" value={aktif.sub_event_id ?? ""} onChange={(event) => updateSession(aktif.id, { sub_event_id: event.target.value || null })} className={INPUT}>
            <option value="">Belum dipilih</option>
            {payload?.available_sub_events.map((item) => <option key={item.subEventId} value={item.subEventId}>{item.subEventName} ({item.seatCount} kursi)</option>)}
            {orphanSubEvent && aktif.sub_event_id ? <option value={aktif.sub_event_id}>{aktif.sub_event_id} (tidak ada di data terbaru)</option> : null}
          </select>
        </Field>
        {payload?.available_sub_events.length === 0 ? <p className="text-body-medium text-warning">Scanner API belum mengirim data kursi. Pilihan muncul setelah panitia mengisinya.</p> : null}
        {aktif.is_published && (!aktif.sub_event_id || orphanSubEvent) ? (
          <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
            <Warning size={16} className="mt-0.5 shrink-0 text-warning" />
            {aktif.sub_event_id
              ? "Agenda ini tampil ke tamu, tapi sumber penempatannya tidak ada lagi di data scanner API, jadi semua kursi tampak kosong."
              : "Agenda ini tampil ke tamu, tapi sumber penempatan belum dipilih, jadi semua kursi tampak kosong."}
          </p>
        ) : null}
      </Kelompok>
      <Kelompok title="Tampilan">
        <div className="grid grid-cols-3 gap-2">
          {([["background_color", "Latar"], ["text_color", "Teks"], ["accent_color", "Aksen"]] as const).map(([key, label]) => (
            <Field key={key} label={label} htmlFor={`${key}-${aktif.id}`}>
              <input id={`${key}-${aktif.id}`} type="color" value={aktif[key]} onChange={(event) => updateSession(aktif.id, { [key]: event.target.value })} className="mt-1.5 h-9 w-full rounded-md border border-outline" />
            </Field>
          ))}
        </div>
        <div>
          <Lipatan title="Warna kursi" detail="Kosong, terisi, sudah check-in, garis tepi">
            <div className="grid grid-cols-2 gap-3">
              {([
                ["seat_available_color", "Kursi kosong", "Bawaan: warna latar"],
                ["seat_occupied_color", "Kursi terisi", "Bawaan: warna teks"],
                ["seat_checked_in_color", "Sudah check-in", "Bawaan: hijau"],
                ["seat_outline_color", "Garis tepi", "Bawaan: warna teks"],
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
                      <Button variant="outlined" size="sm" disabled={aktif[key] === null} onClick={() => updateSession(aktif.id, { [key]: null })}>Bawaan</Button>
                    </div>
                    <p className="mt-1 text-body-medium text-on-surface-variant">{aktif[key] ? aktif[key]?.toUpperCase() : hint}</p>
                  </div>
                );
              })}
            </div>
          </Lipatan>
          <Lipatan title="Gambar latar" detail={aktif.background_image_url ? "Terpasang" : "Belum ada, PNG/JPG/WebP maks 5 MB"}>
            <div className="flex flex-col gap-3">
              <p className="text-body-medium text-on-surface-variant">Gambar diberi lapisan gelap otomatis agar nomor meja dan QR tetap terbaca.</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className={cx("inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-outline bg-surface-container-lowest px-3 text-body-medium font-medium hover:bg-primary-soft focus-within:ring-2 focus-within:ring-primary", uploadingBackground === aktif.id && "pointer-events-none opacity-60")}>
                  <UploadSimple size={16} />
                  {uploadingBackground === aktif.id ? "Mengunggah..." : "Unggah gambar"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploadingBackground === aktif.id}
                    onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadSessionBackground(aktif, file); event.target.value = ""; }} />
                </label>
                {aktif.background_image_url ? <Button variant="text" size="sm" className="text-error" onClick={() => updateSession(aktif.id, { background_image_url: null })}>Hapus gambar</Button> : null}
              </div>
              {aktif.background_image_url ? (
                <>
                  <span className="h-16 w-28 rounded-md border border-outline-variant bg-cover bg-center" style={{ backgroundImage: `url(${aktif.background_image_url})` }} />
                  <label className="flex cursor-pointer items-start gap-3 text-body-medium">
                    <input type="checkbox" checked={aktif.map_panel_transparent} onChange={(event) => updateSession(aktif.id, { map_panel_transparent: event.target.checked })} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
                    <span><span className="block font-medium">Denah tembus pandang</span><span className="block text-on-surface-variant">Gambar latar terlihat penuh di belakang meja.</span></span>
                  </label>
                </>
              ) : null}
            </div>
          </Lipatan>
          <Lipatan title="Header & footer" detail="Logo, blok sponsor, jenis dan ukuran huruf">
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
          <p className="text-body-medium font-medium">Hapus agenda</p>
          <p className="text-body-medium text-on-surface-variant">Tampilan dan sumbernya hilang; data peserta tetap.</p>
        </div>
        <Button variant="outlined" size="sm" className="text-error" icon={<Trash size={16} />} onClick={() => setConfirmDelete(aktif)}>Hapus</Button>
      </section>
    </div>
  ) : (
    <EmptyState
      plain
      title="Belum ada agenda"
      description="Agenda menentukan apa yang dilihat tamu di halaman denah. Agenda baru selalu dibuat sebagai draf."
      action={<Button size="sm" icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>Tambah agenda</Button>}
    />
  );

  const kaki: Record<Bagian, { note: ReactNode; aksi: ReactNode }> = {
    ruangan: {
      note: labelConflicts.length > 0 ? <span className="inline-flex items-center gap-1.5 text-warning"><Warning size={16} />Betulkan label meja ganda dulu</span> : "Semua agenda ikut berubah",
      aksi: <Button size="sm" onClick={() => void saveConfig()} loading={savingConfig} disabled={labelConflicts.length > 0}>Simpan tata letak</Button>,
    },
    layar: {
      note: "Berlaku untuk semua layar",
      aksi: <Button size="sm" onClick={() => void saveConfig()} loading={savingConfig} disabled={labelConflicts.length > 0}>Simpan</Button>,
    },
    agenda: {
      note: aktif ? "Hanya agenda ini" : null,
      aksi: aktif ? <Button size="sm" onClick={() => void saveSession(aktif)} loading={savingSession === aktif.id}>Simpan agenda</Button> : null,
    },
  };

  const panel = (
    <Pane as="aside" aria-label="Setelan denah">
      <div className="shrink-0 border-b border-outline-variant px-4 py-3">
        <SegmentedButton<Bagian>
          label="Bagian setelan"
          value={bagian}
          onChange={setBagian}
          className="w-full"
          options={[{ value: "ruangan", label: "Ruangan" }, { value: "agenda", label: "Agenda ini" }, { value: "layar", label: "Layar publik" }]}
        />
      </div>
      <PaneBody className="px-4 py-4">{bagian === "ruangan" ? isiRuangan : bagian === "layar" ? isiLayar : isiAgenda}</PaneBody>
      <PaneFooter note={kaki[bagian].note}>{kaki[bagian].aksi}</PaneFooter>
    </Pane>
  );

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        meta={config ? (
          <>
            <span>{LAYOUT_INFO[config.layout_type].name}</span>
            <MetaSeparator />
            <span>{payload?.geometry.total_tables ?? 0} meja, {payload?.geometry.total_seats ?? 0} kursi</span>
            <MetaSeparator />
            <span>Penempatan peserta dari scanner API</span>
          </>
        ) : null}
        actions={
          <>
            <ButtonLink href="/denah?mode=qr" target="_blank" rel="noreferrer" variant="outlined" icon={<Monitor size={16} />}>Pratinjau LED</ButtonLink>
            <ButtonLink href="/denah" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Halaman publik</ButtonLink>
          </>
        }
      />

      {error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : null}

      {!config ? <PageLoading /> : (
        <>
          <div className="flex shrink-0 items-end gap-2 border-b border-outline-variant">
            {sessions.length > 0 ? (
              <Tabs
                label="Agenda"
                idPrefix="agenda"
                value={aktif?.slug ?? ""}
                onChange={(slug) => setPreviewSlug(slug)}
                className="min-w-0 border-b-0"
                options={sessions.map((item) => ({ value: item.slug, label: item.name, badge: item.is_published ? undefined : "Draf" }))}
              />
            ) : <span className="py-2.5 text-body-medium text-on-surface-variant">Belum ada agenda</span>}
            <button type="button" onClick={() => setAddOpen(true)} className="mb-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-body-medium font-medium text-primary hover:bg-primary-soft">
              <Plus size={14} />Agenda
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
        title="Tambah agenda"
        description="Agenda baru dibuat sebagai draf, jadi belum tampil ke tamu."
        actions={
          <>
            <Button variant="outlined" disabled={creating} onClick={() => { setAddOpen(false); setNewAgendaName(""); }}>Batal</Button>
            <Button type="submit" form="form-agenda" loading={creating} disabled={!newAgendaName.trim()}>Tambah agenda</Button>
          </>
        }
      >
        <form id="form-agenda" onSubmit={(event) => { event.preventDefault(); void createAgenda(); }}>
          <Field label="Nama agenda" htmlFor="new-agenda">
            <input id="new-agenda" autoFocus value={newAgendaName} maxLength={120} onChange={(event) => setNewAgendaName(event.target.value)} placeholder="Misalnya: Coffee Break Siang" className={INPUT} />
          </Field>
        </form>
      </Dialog>

      <Dialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        dismissible={!deleting}
        tone="danger"
        title={`Hapus agenda ${confirmDelete?.name ?? ""}?`}
        description={`${confirmDelete?.is_published ? "Agenda ini sedang tampil ke tamu. " : ""}Tampilan dan pilihan sumbernya hilang. Data peserta tidak terpengaruh karena penempatan tersimpan di scanner API.`}
        actions={
          <>
            <Button variant="outlined" disabled={deleting} onClick={() => setConfirmDelete(null)}>Batal</Button>
            <Button variant="danger" loading={deleting} onClick={() => { if (confirmDelete) void deleteAgenda(confirmDelete); }}>Hapus agenda</Button>
          </>
        }
      />
    </WorkspacePage>
  );
}
