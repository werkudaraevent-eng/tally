"use client";

import {
  ArrowDown, ArrowUp, CaretLeft, CaretRight, CaretUpDown, Check, Copy, LockSimple, MagnifyingGlass, Paperclip,
  PencilSimple, Trash, UsersThree, X, XCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Banner, Button, ButtonLink, ChipMenu, ColumnMenu, DetailSection, Dialog, EmptyCell, EmptyState, IconButton, KeyValue,
  ListDetail, Pane, PaneBody, PaneFooter, PaneHeader, StatusChip, useColumnPrefs, type ColumnOption,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import { cx } from "@/lib/m3/cx";
import type { RegistrationField } from "@/lib/domain";
import { FILE_FIELD_TYPES } from "@/lib/registration-fields";
import { DEFAULT_TIME_ZONE, type EventTimeZone } from "@/lib/timezone";

type ParticipantSeat = { subEventId: string; subEventName: string; label: string };
type AsalPeserta = "walkin" | "scanner" | "registration" | "manual";
type Participant = {
  id: string;
  qr_code: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  participant_type: string | null;
  rsvp_status: string | null;
  extra: Record<string, string> | null;
  source_participant_id: string | null;
  source_checked_in: boolean;
  source_total_scans: number;
  source_synced_at: string | null;
  source_removed_at: string | null;
  walk_in_at: string | null;
  source: AsalPeserta;
  attendance: Record<string, { count: number; first: string }>;
  seats: ParticipantSeat[] | null;
  /** Kamar dan bus bawaan dari Logistik. Null bila belum ditempatkan di keduanya. */
  logistik: { kamar: string | null; bus: string | null } | null;
};
type SesiKehadiran = { id: number; name: string; is_active: boolean };
type FacetPerusahaan = { company: string; count: number };

const ASAL: Record<AsalPeserta, { label: string; judul: string }> = {
  walkin: { label: "Walk-in", judul: "Didaftarkan petugas di meja registrasi pada hari-H" },
  registration: { label: "Daftar sendiri", judul: "Mengisi formulir pendaftaran publik" },
  manual: { label: "Manual", judul: "Diketik atau diimpor panitia" },
  scanner: { label: "Scanner API", judul: "Ditarik dari Scanner API; sebagian kolom dikelola di sana" },
};

const LABEL_RSVP: Record<string, string> = { confirmed: "Konfirmasi", invited: "Menunggu", declined: "Tidak hadir" };
const RSVP_TONE: Record<string, "success" | "warning" | "error"> = { confirmed: "success", invited: "warning", declined: "error" };

const PAGE_SIZE = 25;
const LEBAR_NAMA = 240;

// Harus cocok dengan whitelist SORTABLE di /api/admin/participants.
type SortKey = "name" | "company" | "title" | "qr_code" | "participant_type" | "rsvp_status" | "source_checked_in" | "source_total_scans";

type Draft = {
  qr_code: string; name: string; company: string; title: string; email: string; phone: string;
  participant_type: string; rsvp_status: string; extra: Record<string, string>;
};
const EMPTY_DRAFT: Draft = { qr_code: "", name: "", company: "", title: "", email: "", phone: "", participant_type: "", rsvp_status: "", extra: {} };

function toDraft(participant: Participant): Draft {
  return {
    qr_code: participant.qr_code,
    name: participant.name,
    company: participant.company ?? "",
    title: participant.title ?? "",
    email: participant.email ?? "",
    phone: participant.phone ?? "",
    participant_type: participant.participant_type ?? "",
    rsvp_status: participant.rsvp_status ?? "",
    extra: { ...(participant.extra ?? {}) },
  };
}

const inputClass = "mt-1.5 h-9 w-full rounded-md border border-outline bg-surface-container-lowest px-3 text-body-medium outline-none focus:border-primary";
const lockedClass = "mt-1.5 flex min-h-9 items-center rounded-md border border-dashed border-outline-variant bg-surface-container-high px-3 text-body-medium text-on-surface-variant";

function teksJawaban(field: RegistrationField, value: string | undefined): string {
  if (!value) return "";
  if (field.type === "checkbox") return value === "true" ? "Ya" : "";
  return value;
}

function inisial(nama: string) {
  return nama.split(/\s+/).filter(Boolean).slice(0, 2).map((kata) => kata[0]?.toUpperCase() ?? "").join("");
}

export type ParticipantListHandle = { tambah: () => void };
export type ParticipantStats = { total: number; activeTotal: number; removedCount: number; lastSyncedAt: string | null };

type Mode = { kind: "view"; id: string } | { kind: "edit"; row: Participant } | { kind: "new" } | null;

type Kolom = {
  key: string;
  label: string;
  sort?: SortKey;
  /** Lebar kolom dalam piksel. Tabel `table-fixed`, jadi isi panjang dipotong, bukan melebarkan tabel. */
  width: number;
  align?: "right";
  cell: (participant: Participant) => ReactNode;
};

export function ParticipantList({ reloadKey = 0, timeZone = DEFAULT_TIME_ZONE, onChanged, onStats, ref }: {
  reloadKey?: number;
  timeZone?: EventTimeZone;
  onChanged?: () => void;
  onStats?: (stats: ParticipantStats) => void;
  ref?: React.Ref<ParticipantListHandle>;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(0);
  const [perPage] = useState(PAGE_SIZE);
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [fields, setFields] = useState<RegistrationField[]>([]);
  const [sessions, setSessions] = useState<SesiKehadiran[]>([]);
  const [companies, setCompanies] = useState<FacetPerusahaan[]>([]);
  const [scannerColumns, setScannerColumns] = useState(false);
  const [filterAsal, setFilterAsal] = useState("");
  const [filterHadir, setFilterHadir] = useState("");
  const [filterRsvp, setFilterRsvp] = useState("");
  const [filterPerusahaan, setFilterPerusahaan] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [removedCount, setRemovedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [togglingExclusion, setTogglingExclusion] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [lastViewed, setLastViewed] = useState<Participant | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Participant | null>(null);

  // Hanya respons dari permintaan terakhir yang boleh mengubah tabel.
  const urutanMuat = useRef(0);
  const load = useCallback(async (search: string, pageIndex: number, sortKey: SortKey, sortDir: "asc" | "desc", size: number) => {
    const nomor = ++urutanMuat.current;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ q: search, limit: String(size), offset: String(pageIndex * size), sort: sortKey, dir: sortDir });
      if (filterAsal) params.set("source", filterAsal);
      if (filterRsvp) params.set("rsvp", filterRsvp);
      if (filterHadir) {
        const [sesiId, keadaan] = filterHadir.split(":");
        params.set("session", sesiId);
        params.set("attended", keadaan);
      }
      for (const nama of filterPerusahaan) params.append("company", nama);
      const response = await fetch(`/api/admin/participants?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (nomor !== urutanMuat.current) return;
      if (!response.ok) { setError(data.error?.details?.message ?? data.error?.message ?? "Daftar peserta gagal dimuat."); return; }
      setParticipants(data.participants ?? []);
      setTotal(data.total ?? 0);
      setFields((data.fields ?? []) as RegistrationField[]);
      setSessions((data.sessions ?? []) as SesiKehadiran[]);
      setCompanies((data.companies ?? []) as FacetPerusahaan[]);
      setScannerColumns(Boolean(data.scanner_columns));
      setRemovedCount(data.removed_count ?? 0);
      onStats?.({ total: data.total ?? 0, activeTotal: data.active_total ?? data.total ?? 0, removedCount: data.removed_count ?? 0, lastSyncedAt: data.last_synced_at ?? null });
    } catch {
      if (nomor === urutanMuat.current) setError("Koneksi terputus. Coba lagi.");
    } finally {
      if (nomor === urutanMuat.current) setLoading(false);
    }
  }, [filterAsal, filterHadir, filterRsvp, filterPerusahaan, onStats]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedQuery(query); setPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const response = await fetch("/api/admin/undian/exclusions", { cache: "no-store" }).catch(() => null);
        if (!response?.ok) return;
        const data = await response.json();
        setExcluded(new Set((data.exclusions ?? []).map((row: { participant_id: string }) => row.participant_id)));
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reloadKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(debouncedQuery, page, sort, dir, perPage); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, debouncedQuery, page, sort, dir, perPage, reloadKey]);

  // Tautan dari halaman lain, mis. nama di Logistik: `?peserta=<kode QR>`
  // mencari kode itu lalu membuka orangnya begitu barisnya termuat. Kode QR,
  // bukan id, karena pencarian daftar ini sudah mengenalnya.
  const bukaKode = useRef<string | null>(null);
  useEffect(() => {
    const kode = new URLSearchParams(window.location.search).get("peserta")?.trim();
    if (!kode) return;
    bukaKode.current = kode;
    const timer = window.setTimeout(() => setQuery(kode), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const kode = bukaKode.current;
    const orang = kode && !loading ? participants.find((baris) => baris.qr_code === kode) : undefined;
    if (!orang) return;
    bukaKode.current = null;
    const timer = window.setTimeout(() => { setLastViewed(orang); setMode({ kind: "view", id: orang.id }); }, 0);
    return () => window.clearTimeout(timer);
  }, [participants, loading]);

  async function toggleExclusion(participant: Participant) {
    const isExcluded = excluded.has(participant.id);
    setTogglingExclusion(participant.id);
    const response = await (isExcluded
      ? fetch(`/api/admin/undian/exclusions?participant_id=${participant.id}`, { method: "DELETE" })
      : fetch("/api/admin/undian/exclusions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participant_id: participant.id }) })
    ).catch(() => null);
    setTogglingExclusion(null);
    if (!response?.ok) { toast.error("Status undian gagal diubah"); return; }
    setExcluded((current) => {
      const next = new Set(current);
      if (isExcluded) next.delete(participant.id); else next.add(participant.id);
      return next;
    });
  }

  function toggleSort(key: SortKey) {
    if (key === sort) setDir((current) => (current === "asc" ? "desc" : "asc"));
    else { setSort(key); setDir("asc"); }
    setPage(0);
  }

  function select(participant: Participant) {
    if (mode?.kind === "edit" || mode?.kind === "new") return;
    if (mode?.kind === "view" && mode.id === participant.id) { setMode(null); return; }
    setLastViewed(participant);
    setMode({ kind: "view", id: participant.id });
  }

  function startAdd() {
    if (mode?.kind === "edit" || mode?.kind === "new") return;
    setDraft(EMPTY_DRAFT); setFormError(""); setNotice("");
    setMode({ kind: "new" });
  }

  useImperativeHandle(ref, () => ({ tambah: startAdd }));

  function startEdit(participant: Participant) {
    setDraft(toDraft(participant)); setFormError(""); setNotice("");
    setMode({ kind: "edit", row: participant });
  }

  function cancelEdit() {
    setMode(mode?.kind === "edit" ? { kind: "view", id: mode.row.id } : null);
    setDraft(EMPTY_DRAFT); setFormError("");
  }

  async function save() {
    if (mode?.kind !== "edit" && mode?.kind !== "new") return;
    setSaving(true); setFormError(""); setNotice("");
    const isNew = mode.kind === "new";
    const response = await fetch(isNew ? "/api/admin/participants" : `/api/admin/participants/${mode.row.id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    }).catch(() => null);
    setSaving(false);
    if (!response) { setFormError("Koneksi terputus. Peserta belum tersimpan."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const rincian = body.error?.details && typeof body.error.details === "object"
        ? Object.values(body.error.details as Record<string, unknown>).find((value) => typeof value === "string")
        : undefined;
      setFormError((typeof rincian === "string" ? rincian : undefined) ?? body.error?.message ?? "Peserta gagal disimpan.");
      return;
    }
    setNotice(isNew ? `${draft.name} ditambahkan.` : `${draft.name} diperbarui.`);
    const savedId: string | undefined = body.participant?.id ?? body.id ?? (isNew ? undefined : mode.row.id);
    setMode(savedId ? { kind: "view", id: savedId } : null);
    setDraft(EMPTY_DRAFT);
    void load(debouncedQuery, page, sort, dir, perPage);
    onChanged?.();
  }

  async function remove(participant: Participant) {
    setSaving(true); setNotice("");
    const response = await fetch(`/api/admin/participants/${participant.id}`, { method: "DELETE" }).catch(() => null);
    setSaving(false);
    setConfirmDelete(null);
    if (!response) { setError("Koneksi terputus. Muat ulang untuk melihat apakah peserta terhapus."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error?.details?.message ?? body.error?.message ?? "Peserta gagal dihapus."); return; }
    setNotice(`${participant.name} dihapus.`);
    setMode(null);
    void load(debouncedQuery, page, sort, dir, perPage);
    onChanged?.();
  }

  async function bukaBerkas(id: string) {
    const response = await fetch(`/api/admin/registrasi/upload?id=${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
    const body = await response?.json().catch(() => null);
    if (!response?.ok || !body?.url) { toast.error("Berkas tidak bisa dibuka", "Coba lagi."); return; }
    window.open(body.url, "_blank", "noopener");
  }

  async function salinKode(kode: string) {
    try { await navigator.clipboard.writeText(kode); toast.success("Kode disalin", kode); }
    catch { toast.error("Kode tidak bisa disalin", "Salin manual dari layar."); }
  }

  const jam = useCallback((iso: string) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone }), [timeZone]);

  // ---- Kolom -------------------------------------------------------------
  const kolom = useMemo<Kolom[]>(() => {
    const daftar: Kolom[] = [
      { key: "company", label: "Perusahaan", sort: "company", width: 200, cell: (p) => p.company ? <span className="block truncate" title={p.company}>{p.company}</span> : <EmptyCell /> },
      { key: "title", label: "Jabatan", sort: "title", width: 180, cell: (p) => p.title ? <span className="block truncate" title={p.title}>{p.title}</span> : <EmptyCell /> },
      ...sessions.map<Kolom>((sesi) => ({
        key: `sesi:${sesi.id}`,
        label: sesi.is_active ? sesi.name : `${sesi.name} (ditutup)`,
        width: 140,
        cell: (p) => {
          const catatan = p.attendance?.[String(sesi.id)];
          return catatan
            ? <StatusChip dot tone="success" className="tabular-nums" title={catatan.count > 1 ? `Dipindai ${catatan.count} kali` : "Dipindai sekali"}>{jam(catatan.first)}</StatusChip>
            : <StatusChip dot tone="neutral">Belum</StatusChip>;
        },
      })),
      { key: "rsvp", label: "RSVP", sort: "rsvp_status", width: 128, cell: (p) => p.rsvp_status ? <StatusChip dot tone={RSVP_TONE[p.rsvp_status] ?? "neutral"}>{LABEL_RSVP[p.rsvp_status] ?? p.rsvp_status}</StatusChip> : <EmptyCell /> },
      { key: "kamar", label: "Kamar", width: 120, cell: (p) => p.logistik?.kamar ? <span className="block truncate" title={p.logistik.kamar}>{p.logistik.kamar}</span> : <EmptyCell /> },
      { key: "bus", label: "Bus", width: 96, cell: (p) => p.logistik?.bus ?? <EmptyCell /> },
      { key: "seat", label: "Kursi", width: 168, cell: (p) => p.seats?.length ? <span className="block truncate" title={p.seats.map((s) => `${s.subEventName}: ${s.label}`).join(", ")}>{p.seats.map((s) => s.label).join(", ")}</span> : <EmptyCell /> },
      { key: "source", label: "Asal", width: 128, cell: (p) => <span title={ASAL[p.source].judul}>{ASAL[p.source].label}</span> },
      { key: "type", label: "Tipe", sort: "participant_type", width: 112, cell: (p) => p.participant_type ?? <EmptyCell /> },
      { key: "qr", label: "Kode QR", sort: "qr_code", width: 128, cell: (p) => <span className="tabular-nums">{p.qr_code}</span> },
      { key: "email", label: "Email", width: 220, cell: (p) => p.email ? <span className="block truncate" title={p.email}>{p.email}</span> : <EmptyCell /> },
      { key: "phone", label: "Telepon", width: 140, cell: (p) => p.phone ?? <EmptyCell /> },
      { key: "undian", label: "Undian", width: 128, cell: (p) => excluded.has(p.id) ? <StatusChip tone="warning">Dikecualikan</StatusChip> : <span className="text-on-surface-variant">Ikut</span> },
      ...fields.map<Kolom>((item) => ({
        key: `field:${item.key}`,
        label: item.label,
        width: 180,
        cell: (p) => {
          const value = p.extra?.[item.key];
          if (FILE_FIELD_TYPES.includes(item.type)) return value ? <span className="inline-flex items-center gap-1"><Paperclip size={14} aria-hidden />Berkas</span> : <EmptyCell />;
          const teks = teksJawaban(item, value);
          return teks ? <span className="block truncate" title={teks}>{teks}</span> : <EmptyCell />;
        },
      })),
    ];
    if (scannerColumns) {
      daftar.push(
        { key: "scanner_status", label: "Status sumber", width: 150, cell: (p) => p.source_removed_at ? <StatusChip tone="warning">Dihapus di sumber</StatusChip> : <span className="text-on-surface-variant">Aktif</span> },
        { key: "checked_in", label: "Check-in sumber", sort: "source_checked_in", width: 140, cell: (p) => p.source_checked_in ? <Check size={16} className="text-success" aria-label="Sudah check-in" /> : <EmptyCell /> },
        { key: "scans", label: "Scan", sort: "source_total_scans", width: 88, align: "right", cell: (p) => <span className="tabular-nums">{p.source_total_scans}</span> },
      );
    }
    return daftar;
  }, [sessions, fields, scannerColumns, excluded, jam]);

  const bawaan = useMemo(() => ["company", ...(sessions[0] ? [`sesi:${sessions[0].id}`] : []), "rsvp", "seat"], [sessions]);
  const { visible, setVisible, isDefault } = useColumnPrefs("peserta", bawaan);
  const kolomTampil = kolom.filter((item) => visible.includes(item.key));
  const opsiKolom: ColumnOption[] = [{ key: "name", label: "Nama", locked: true }, ...kolom.map((item) => ({ key: item.key, label: item.label }))];
  const jabatanDiBawahNama = !visible.includes("title");

  const adaFilter = Boolean(filterAsal || filterHadir || filterRsvp || filterPerusahaan.length);
  const resetFilter = () => { setFilterAsal(""); setFilterHadir(""); setFilterRsvp(""); setFilterPerusahaan([]); setPage(0); };
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const dari = total === 0 ? 0 : page * perPage + 1;
  const sampai = Math.min(total, (page + 1) * perPage);

  const terpilih: Participant | null = mode?.kind === "view"
    ? participants.find((p) => p.id === mode.id) ?? (lastViewed?.id === mode.id ? lastViewed : null)
    : mode?.kind === "edit" ? mode.row : null;

  const sortHeader = (label: string, key?: SortKey, align?: "right") => {
    if (!key) return <span className={cx("block truncate", align === "right" && "text-right")}>{label}</span>;
    const active = sort === key;
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={cx("inline-flex max-w-full items-center gap-1 whitespace-nowrap hover:text-on-surface", active && "text-on-surface", align === "right" && "ml-auto")}
        title={`Urutkan menurut ${label}`}
      >
        <span className="truncate">{label}</span>
        {active ? (dir === "asc" ? <ArrowUp size={14} className="shrink-0" /> : <ArrowDown size={14} className="shrink-0" />) : <CaretUpDown size={14} className="shrink-0 text-outline" />}
      </button>
    );
  };

  const ariaSort = (key?: SortKey) => (key && sort === key ? (dir === "asc" ? "ascending" : "descending") : undefined);

  // ---- Panel daftar --------------------------------------------------------
  const list = (
    <Pane aria-label="Daftar peserta">
      <PaneHeader className="flex-wrap gap-2 px-3 py-3">
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Cari peserta</span>
          <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari nama, perusahaan, kode QR..."
            className="h-8 w-full rounded-md border border-outline bg-surface-container-lowest pl-9 pr-3 text-body-medium outline-none placeholder:text-on-surface-variant focus:border-primary"
          />
        </label>
        <ChipMenu
          label="Perusahaan"
          multiple
          searchable
          options={companies.map((row) => ({ value: row.company, label: row.company || "Tanpa perusahaan", count: row.count }))}
          selected={filterPerusahaan}
          onChange={(next) => { setFilterPerusahaan(next); setPage(0); }}
        />
        <ChipMenu
          label="Asal"
          options={[
            { value: "walkin", label: "Walk-in" },
            { value: "registration", label: "Daftar sendiri" },
            { value: "manual", label: "Manual" },
            ...(scannerColumns ? [{ value: "scanner", label: "Scanner API" }] : []),
          ]}
          selected={filterAsal ? [filterAsal] : []}
          onChange={(next) => { setFilterAsal(next[0] ?? ""); setPage(0); }}
        />
        {sessions.length > 0 ? (
          <ChipMenu
            label="Kehadiran"
            options={sessions.flatMap((sesi) => [
              { value: `${sesi.id}:yes`, label: `Sudah hadir: ${sesi.name}` },
              { value: `${sesi.id}:no`, label: `Belum hadir: ${sesi.name}` },
            ])}
            selected={filterHadir ? [filterHadir] : []}
            onChange={(next) => { setFilterHadir(next[0] ?? ""); setPage(0); }}
            summary={(pilihan) => pilihan[0]?.label ?? "Kehadiran"}
          />
        ) : null}
        <ChipMenu
          label="RSVP"
          options={[
            { value: "confirmed", label: "Konfirmasi" },
            { value: "invited", label: "Menunggu" },
            { value: "none", label: "Belum diisi" },
          ]}
          selected={filterRsvp ? [filterRsvp] : []}
          onChange={(next) => { setFilterRsvp(next[0] ?? ""); setPage(0); }}
        />
        <ColumnMenu columns={opsiKolom} visible={visible} onChange={setVisible} onReset={() => setVisible(null)} isDefault={isDefault} />
      </PaneHeader>

      <PaneBody className="overflow-x-auto">
        {error ? (
          <p role="alert" className="m-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={18} className="mt-0.5 shrink-0" />{error}</p>
        ) : loading && participants.length === 0 ? (
          <div aria-label="Memuat peserta" className="flex flex-col">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-outline-variant px-4 py-4">
                <div className="h-3 w-48 animate-pulse rounded bg-surface-container-high" />
                <div className="h-3 w-32 animate-pulse rounded bg-surface-container-high" />
              </div>
            ))}
          </div>
        ) : participants.length === 0 ? (
          <EmptyState
            plain
            icon={<UsersThree size={40} />}
            title={adaFilter || debouncedQuery ? "Tidak ada peserta yang cocok" : "Belum ada peserta"}
            description={adaFilter || debouncedQuery ? "Longgarkan salah satu saringan atau ubah kata cari." : "Tambahkan peserta satu per satu, atau impor dari berkas CSV atau XLSX."}
            action={adaFilter ? <Button variant="outlined" size="sm" onClick={resetFilter}>Hapus semua saringan</Button> : !debouncedQuery ? <Button size="sm" onClick={startAdd}>Tambah peserta</Button> : undefined}
          />
        ) : (
          <table
            className={cx("w-full table-fixed border-separate border-spacing-0 text-left text-body-medium", loading && "opacity-60")}
            style={{ minWidth: LEBAR_NAMA + kolomTampil.reduce((jumlah, item) => jumlah + item.width, 0) }}
          >
            <colgroup>
              <col style={{ minWidth: LEBAR_NAMA }} />
              {kolomTampil.map((item) => <col key={item.key} style={{ width: item.width }} />)}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface-container-lowest text-label-large text-on-surface-variant">
              <tr>
                <th scope="col" aria-sort={ariaSort("name")} className="sticky left-0 z-10 border-b border-outline-variant bg-surface-container-lowest px-4 py-2 font-normal">{sortHeader("Nama", "name")}</th>
                {kolomTampil.map((item) => (
                  <th key={item.key} scope="col" aria-sort={ariaSort(item.sort)} className="border-b border-outline-variant px-3 py-2 font-normal">{sortHeader(item.label, item.sort, item.align)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {participants.map((participant) => {
                const aktif = mode?.kind === "view" && mode.id === participant.id || mode?.kind === "edit" && mode.row.id === participant.id;
                return (
                  <tr
                    key={participant.id}
                    onClick={() => select(participant)}
                    className={cx("cursor-pointer", aktif ? "bg-secondary-container" : "bg-surface-container-lowest hover:bg-primary-soft", participant.source_removed_at && "text-on-surface-variant")}
                  >
                    <td className="sticky left-0 border-b border-outline-variant bg-inherit px-4 py-2.5">
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); select(participant); }}
                        aria-pressed={aktif}
                        className="block w-full min-w-0 rounded-sm text-left"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-on-surface" title={participant.name}>{participant.name}</span>
                          {participant.source_removed_at ? <StatusChip tone="warning" className="shrink-0">Dihapus di sumber</StatusChip> : null}
                        </span>
                        {jabatanDiBawahNama ? <span className="block truncate text-on-surface-variant">{participant.title || " "}</span> : null}
                      </button>
                    </td>
                    {kolomTampil.map((item) => (
                      <td key={item.key} className={cx("border-b border-outline-variant px-3 py-2.5", item.align === "right" && "text-right")}>
                        <div className="max-w-full overflow-hidden">{item.cell(participant)}</div>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </PaneBody>

      <PaneFooter
        className="bg-surface-container-lowest py-2"
        note={
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="tabular-nums">{error ? "Daftar tidak dimuat" : `${dari}–${sampai} dari ${total}`}</span>
            {/* Menjelaskan selisih "dari 278" dengan "247 peserta aktif" di kepala halaman.
                removed_count dihitung tanpa saringan, jadi hanya benar saat tidak ada saringan. */}
            {!error && removedCount > 0 && !adaFilter && !query.trim() ? (
              <span className="tabular-nums" title="Tetap disimpan untuk audit, tapi tidak muncul di pencarian booth dan kasir serta tidak dihitung di laporan.">
                termasuk {removedCount} dihapus di sumber
              </span>
            ) : null}
            {adaFilter ? <button type="button" onClick={resetFilter} className="rounded-sm font-medium text-primary hover:underline">Hapus semua saringan</button> : null}
          </span>
        }
      >
        <IconButton size="sm" variant="outlined" label="Halaman sebelumnya" disabled={page === 0 || loading} onClick={() => setPage((current) => Math.max(0, current - 1))}><CaretLeft size={16} /></IconButton>
        <span className="min-w-14 text-center text-body-medium tabular-nums text-on-surface-variant">{page + 1} / {totalPages}</span>
        <IconButton size="sm" variant="outlined" label="Halaman berikutnya" disabled={page + 1 >= totalPages || loading || Boolean(error)} onClick={() => setPage((current) => current + 1)}><CaretRight size={16} /></IconButton>
      </PaneFooter>
    </Pane>
  );

  // ---- Panel detail --------------------------------------------------------
  const editing = mode?.kind === "edit" || mode?.kind === "new";
  const editingRow = mode?.kind === "edit" ? mode.row : null;
  const editingLocked = editingRow?.source_participant_id != null;

  function field(label: string, node: ReactNode, hint?: string) {
    return (
      <label className="block text-body-medium font-medium text-on-surface">
        {label}
        {node}
        {hint ? <span className="mt-1 block font-normal text-on-surface-variant">{hint}</span> : null}
      </label>
    );
  }

  function textField(label: string, key: Exclude<keyof Draft, "extra">, options?: { locked?: boolean; value?: string; placeholder?: string; type?: string; hint?: string }) {
    if (options?.locked) return field(label, <p className={lockedClass}><LockSimple size={14} className="mr-2 shrink-0" />{options.value || "Tidak diisi"}</p>);
    return field(label, (
      <input
        value={draft[key]}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
        className={inputClass}
        placeholder={options?.placeholder}
        type={options?.type ?? "text"}
      />
    ), options?.hint);
  }

  function jawabanField(item: RegistrationField) {
    const value = draft.extra[item.key] ?? "";
    const set = (next: string) => setDraft({ ...draft, extra: { ...draft.extra, [item.key]: next } });
    const label = item.required ? item.label : `${item.label} (opsional)`;
    if (FILE_FIELD_TYPES.includes(item.type)) {
      return field(label, value
        ? <p className={lockedClass}><Paperclip size={14} className="mr-2 shrink-0" />Berkas terlampir.<button type="button" onClick={() => void bukaBerkas(value)} className="ml-1 font-medium text-primary underline">Buka</button></p>
        : <p className={lockedClass}><LockSimple size={14} className="mr-2 shrink-0" />Hanya bisa diunggah pendaftar sendiri.</p>);
    }
    if (item.type === "checkbox") {
      return (
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={value === "true"} onChange={(event) => set(event.target.checked ? "true" : "")} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
          <span className="text-body-medium">
            <span className="block font-medium">{label}</span>
            {item.help_text ? <span className="block text-on-surface-variant">{item.help_text}</span> : null}
          </span>
        </label>
      );
    }
    if (item.type === "select" || item.type === "radio") {
      return field(label, (
        <select value={value} onChange={(event) => set(event.target.value)} className={inputClass}>
          <option value="">Tidak diisi</option>
          {(item.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ), item.help_text);
    }
    if (item.type === "textarea") {
      return field(label, <textarea value={value} onChange={(event) => set(event.target.value)} rows={3} maxLength={2000} placeholder={item.placeholder} className={`${inputClass} h-auto resize-y py-2 leading-6`} />, item.help_text);
    }
    return field(label, (
      <input
        value={value}
        onChange={(event) => set(event.target.value)}
        type={item.type === "tel" ? "tel" : item.type === "email" ? "email" : item.type === "number" ? "number" : item.type === "date" ? "date" : "text"}
        min={item.type === "number" ? item.min : undefined}
        max={item.type === "number" ? item.max : undefined}
        placeholder={item.placeholder}
        className={inputClass}
      />
    ), item.help_text);
  }

  const editor = editing ? (
    <Pane as="aside" aria-label={mode?.kind === "new" ? "Tambah peserta" : "Sunting peserta"}>
      <PaneHeader className="px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-title-medium font-semibold">{mode?.kind === "new" ? "Tambah peserta" : `Sunting ${editingRow?.name ?? "peserta"}`}</h2>
          {mode?.kind === "new" ? <p className="text-body-medium text-on-surface-variant">Peserta manual tidak disentuh sinkronisasi Scanner API.</p> : null}
        </div>
        <IconButton size="sm" label="Batal" onClick={cancelEdit} disabled={saving}><X size={16} /></IconButton>
      </PaneHeader>
      <PaneBody>
        <form id="form-peserta" onSubmit={(event) => { event.preventDefault(); void save(); }} className="flex flex-col gap-4 px-5 py-4">
          {editingLocked ? (
            <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
              <LockSimple size={16} className="mt-0.5 shrink-0 text-warning" />
              <span>Nama, perusahaan, jabatan, kode QR, tipe, dan RSVP dikelola di Scanner API. Email, telepon, dan jawaban formulir tetap bisa diisi di sini.</span>
            </p>
          ) : null}
          {formError ? <p role="alert" className="flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{formError}</p> : null}
          {textField("Nama lengkap", "name", { locked: editingLocked, value: editingRow?.name, placeholder: "Nama peserta" })}
          {textField("Perusahaan", "company", { locked: editingLocked, value: editingRow?.company ?? "", placeholder: "Opsional" })}
          {textField("Jabatan", "title", { locked: editingLocked, value: editingRow?.title ?? "", placeholder: "Opsional" })}
          {editingLocked
            ? field("Kode QR", <p className={lockedClass}><LockSimple size={14} className="mr-2 shrink-0" />{editingRow?.qr_code}</p>)
            : field("Kode QR", <input value={draft.qr_code} onChange={(event) => setDraft({ ...draft, qr_code: event.target.value })} className={`${inputClass} tabular-nums`} placeholder="REG000000" required />, "Harus unik di acara ini. Kode ini yang dipindai booth dan kasir.")}
          {textField("Tipe peserta", "participant_type", { locked: editingLocked, value: editingRow?.participant_type ?? "", placeholder: "mis. VIP, reguler" })}
          {editingLocked
            ? field("RSVP", <p className={lockedClass}><LockSimple size={14} className="mr-2 shrink-0" />{LABEL_RSVP[editingRow?.rsvp_status ?? ""] ?? "Tidak diisi"}</p>)
            : field("RSVP", (
              <select value={draft.rsvp_status} onChange={(event) => setDraft({ ...draft, rsvp_status: event.target.value })} className={inputClass}>
                <option value="">Tidak diisi</option>
                <option value="invited">Menunggu</option>
                <option value="confirmed">Konfirmasi</option>
              </select>
            ))}
          {textField("Email", "email", { placeholder: "email@example.com", type: "email" })}
          {textField("Telepon", "phone", { placeholder: "08xx atau +62xx" })}
          {fields.length > 0 ? (
            <div className="flex flex-col gap-4 border-t border-outline-variant pt-4">
              <p className="text-body-medium font-semibold">Jawaban formulir pendaftaran</p>
              {fields.map((item) => <div key={item.key}>{jawabanField(item)}</div>)}
            </div>
          ) : null}
        </form>
      </PaneBody>
      <PaneFooter>
        <Button type="button" variant="outlined" size="sm" disabled={saving} onClick={cancelEdit}>Batal</Button>
        <Button simpan type="submit" form="form-peserta" size="sm" loading={saving} disabled={!draft.name.trim() || !draft.qr_code.trim()} icon={<Check size={16} weight="bold" />}>
          {mode?.kind === "new" ? "Tambah peserta" : "Simpan perubahan"}
        </Button>
      </PaneFooter>
    </Pane>
  ) : null;

  const viewer = !editing && terpilih ? (() => {
    const p = terpilih;
    const fromSource = p.source_participant_id != null;
    const pertama = sessions.map((sesi) => ({ sesi, catatan: p.attendance?.[String(sesi.id)] })).find((item) => item.catatan);
    const subjudul = [p.title, p.company].filter(Boolean).join(" · ");
    return (
      <Pane as="aside" aria-label={`Detail ${p.name}`}>
        <div className="flex shrink-0 flex-col gap-3 border-b border-outline-variant px-5 py-4">
          <div className="flex items-start gap-3">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-body-medium font-semibold text-primary">{inisial(p.name)}</span>
            <div className="min-w-0 flex-1">
              <h2 className="text-title-medium font-semibold leading-6">{p.name}</h2>
              {subjudul ? <p className="text-body-medium text-on-surface-variant">{subjudul}</p> : null}
            </div>
            <IconButton size="sm" label="Tutup detail" onClick={() => setMode(null)}><X size={16} /></IconButton>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pertama?.catatan ? <StatusChip dot tone="success">Hadir {jam(pertama.catatan.first)}</StatusChip> : sessions.length > 0 ? <StatusChip dot tone="neutral">Belum hadir</StatusChip> : null}
            {p.participant_type ? <StatusChip>{p.participant_type}</StatusChip> : null}
            <StatusChip title={ASAL[p.source].judul}>{ASAL[p.source].label}</StatusChip>
            {p.source_removed_at ? <StatusChip tone="warning">Dihapus di sumber</StatusChip> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outlined" size="sm" icon={<PencilSimple size={16} />} onClick={() => startEdit(p)}>{fromSource ? "Sunting kontak" : "Sunting"}</Button>
            {!fromSource ? <Button simpan variant="text" size="sm" className="text-error" icon={<Trash size={16} />} onClick={() => setConfirmDelete(p)}>Hapus</Button> : null}
          </div>
        </div>
        <PaneBody>
          <dl>
            <DetailSection title="Undangan">
              <KeyValue label="Kode QR">
                <span className="inline-flex items-center gap-1.5">
                  <span className="tabular-nums">{p.qr_code}</span>
                  <IconButton size="sm" label="Salin kode QR" onClick={() => void salinKode(p.qr_code)}><Copy size={14} /></IconButton>
                </span>
              </KeyValue>
              <KeyValue label="Tipe">{p.participant_type ?? <EmptyCell />}</KeyValue>
              <KeyValue label="RSVP">{p.rsvp_status ? <StatusChip dot tone={RSVP_TONE[p.rsvp_status] ?? "neutral"}>{LABEL_RSVP[p.rsvp_status] ?? p.rsvp_status}</StatusChip> : <EmptyCell />}</KeyValue>
            </DetailSection>
            {sessions.length > 0 ? (
              <DetailSection title="Kehadiran">
                {sessions.map((sesi) => {
                  const catatan = p.attendance?.[String(sesi.id)];
                  return (
                    <KeyValue key={sesi.id} label={sesi.name}>
                      {catatan ? <StatusChip dot tone="success" title={catatan.count > 1 ? `Dipindai ${catatan.count} kali` : undefined}>Hadir {jam(catatan.first)}</StatusChip> : <StatusChip dot>Belum</StatusChip>}
                    </KeyValue>
                  );
                })}
              </DetailSection>
            ) : null}
            <DetailSection title="Logistik" action={<ButtonLink href="/admin/logistik" variant="text" size="sm">Atur di Logistik</ButtonLink>}>
              <KeyValue label="Kamar">{p.logistik?.kamar ?? <span className="text-on-surface-variant">Belum dapat kamar</span>}</KeyValue>
              <KeyValue label="Bus bawaan">{p.logistik?.bus ?? <span className="text-on-surface-variant">Belum punya bus</span>}</KeyValue>
            </DetailSection>
            <DetailSection title="Tempat duduk">
              {p.seats?.length ? p.seats.map((seat) => <KeyValue key={`${seat.subEventId}-${seat.label}`} label={seat.subEventName}>{seat.label}</KeyValue>) : <p className="text-body-medium text-on-surface-variant">Belum ada kursi.</p>}
            </DetailSection>
            <DetailSection
              title="Undian"
              action={
                <Button simpan variant="text" size="sm" loading={togglingExclusion === p.id} onClick={() => void toggleExclusion(p)}>
                  {excluded.has(p.id) ? "Ikutkan lagi" : "Kecualikan"}
                </Button>
              }
            >
              <p className="text-body-medium">
                {excluded.has(p.id) ? <StatusChip tone="warning">Dikecualikan dari semua undian</StatusChip> : <span className="text-on-surface-variant">Ikut undian bila memenuhi syarat hadiah.</span>}
              </p>
            </DetailSection>
            <DetailSection title="Kontak">
              <KeyValue label="Email">{p.email ?? <EmptyCell />}</KeyValue>
              <KeyValue label="Telepon">{p.phone ?? <EmptyCell />}</KeyValue>
            </DetailSection>
            {fields.length > 0 ? (
              <DetailSection title="Jawaban formulir">
                {fields.map((item) => {
                  const value = p.extra?.[item.key];
                  return (
                    <KeyValue key={item.key} label={item.label}>
                      {FILE_FIELD_TYPES.includes(item.type)
                        ? value ? <button type="button" onClick={() => void bukaBerkas(value)} className="inline-flex items-center gap-1 font-medium text-primary underline"><Paperclip size={14} />Buka berkas</button> : <EmptyCell />
                        : teksJawaban(item, value) || <EmptyCell />}
                    </KeyValue>
                  );
                })}
              </DetailSection>
            ) : null}
            {fromSource ? (
              <DetailSection title="Scanner API">
                <KeyValue label="Status">
                  {p.source_removed_at ? (
                    <>
                      Dihapus di sumber
                      <span className="mt-0.5 block text-on-surface-variant">Disimpan untuk audit. Tidak muncul di pencarian booth dan kasir, tidak dihitung di laporan.</span>
                    </>
                  ) : "Aktif"}
                </KeyValue>
                <KeyValue label="Check-in">{p.source_checked_in ? "Sudah" : "Belum"}</KeyValue>
                <KeyValue label="Pemindaian">{p.source_total_scans}</KeyValue>
              </DetailSection>
            ) : null}
          </dl>
        </PaneBody>
      </Pane>
    );
  })() : null;

  return (
    <>
      {notice ? (
        <Banner tone="success" icon={<Check size={18} />} actions={<IconButton size="sm" label="Tutup" onClick={() => setNotice("")}><X size={16} /></IconButton>}>{notice}</Banner>
      ) : null}
      <ListDetail list={list} detail={editor ?? viewer} />
      <Dialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        dismissible={!saving}
        title={`Hapus ${confirmDelete?.name ?? "peserta"}?`}
        tone="danger"
        description="Dihapus permanen dan tercatat di jejak audit. Peserta yang sudah punya order atau pernah menang undian tidak bisa dihapus."
        actions={
          <>
            <Button type="button" variant="outlined" disabled={saving} onClick={() => setConfirmDelete(null)}>Batal</Button>
            <Button simpan variant="danger" loading={saving} onClick={() => { if (confirmDelete) void remove(confirmDelete); }}>Hapus peserta</Button>
          </>
        }
      />
    </>
  );
}
