"use client";

import { ArrowDown, ArrowUp, ArrowsDownUp, CaretLeft, CaretRight, Check, LockSimple, MagnifyingGlass, PencilSimple, Plus, Prohibit, Trash, UsersThree, WarningCircle, X, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { formatEventDateTime } from "@/lib/datetime";
import { DEFAULT_TIME_ZONE, timeZoneAbbr, type EventTimeZone } from "@/lib/timezone";

type ParticipantSeat = { subEventId: string; subEventName: string; label: string };
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
  // Penentu tunggal apakah baris ini milik panitia atau milik Scanner API.
  source_participant_id: string | null;
  source_checked_in: boolean;
  source_total_scans: number;
  source_synced_at: string | null;
  source_removed_at: string | null;
  seats: ParticipantSeat[] | null;
};

const PAGE_SIZE = 25;

// Harus cocok dengan whitelist SORTABLE di /api/admin/participants.
type SortKey = "name" | "qr_code" | "participant_type" | "rsvp_status" | "source_checked_in" | "source_total_scans";

const COLUMNS: Array<{ key: SortKey; label: string; align?: "right" }> = [
  { key: "name", label: "Peserta" },
  { key: "qr_code", label: "QR code" },
  { key: "participant_type", label: "Tipe" },
  { key: "rsvp_status", label: "RSVP" },
  { key: "source_checked_in", label: "Check-in" },
  { key: "source_total_scans", label: "Scan", align: "right" },
];

// Kolom kursi tidak bisa diurutkan, jadi berdiri di luar COLUMNS: header yang
// bisa diklik tapi tidak mengubah apa pun hanya membingungkan. Kontak menyusul
// dengan alasan yang sama -- mengurutkan menurut nomor telepon tidak menjawab
// pertanyaan siapa pun.
const SEAT_COLUMN_LABEL = "Kursi";

/** Bentuk satu baris saat sedang disunting. Semua string supaya terikat langsung
 *  ke input tanpa konversi bolak-balik yang bisa kehilangan nilai kosong. */
type Draft = {
  qr_code: string;
  name: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  participant_type: string;
  rsvp_status: string;
};

const EMPTY_DRAFT: Draft = { qr_code: "", name: "", company: "", title: "", email: "", phone: "", participant_type: "", rsvp_status: "" };

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
  };
}

const inputClass = "mt-1.5 h-11 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]";
const lockedClass = "mt-1.5 flex min-h-11 items-center border border-dashed border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--ink-muted)]";

export function ParticipantList({ reloadKey = 0, timeZone = DEFAULT_TIME_ZONE, timeZoneAbbr: abbr, onChanged, toolbar }: {
  reloadKey?: number;
  timeZone?: EventTimeZone;
  timeZoneAbbr?: string;
  /** Dipanggil setelah tabel berhasil menulis, supaya halaman induk bisa
   *  menyegarkan angka yang ia tampilkan sendiri. */
  onChanged?: () => void;
  /**
   * Tombol milik halaman induk (impor, ekspor) yang ditempatkan di header tabel.
   *
   * Diterima sebagai node dan bukan dibangun di sini karena keadaannya --
   * berkas terpilih, hasil pratinjau -- milik halaman, dan menariknya ke dalam
   * komponen ini berarti tabel peserta ikut memikirkan urusan unggah berkas.
   */
  toolbar?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [total, setTotal] = useState(0);
  const [activeTotal, setActiveTotal] = useState(0);
  const [removedCount, setRemovedCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Peserta yang dikecualikan dari undian. Dimuat sekali, lalu diperbarui secara
  // optimis: daftarnya berisi belasan orang, tidak sepadan memuat ulang seluruh
  // tabel peserta hanya untuk mengubah satu tanda.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [togglingExclusion, setTogglingExclusion] = useState<string | null>(null);
  // `"new"` menandai peserta baru; selain itu berisi id peserta yang sedang
  // disunting. Satu state karena hanya satu modal yang boleh terbuka.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // Baris yang sedang disunting disimpan utuh, bukan hanya id-nya: modal perlu
  // tahu apakah barisnya milik Scanner API, dan mencarinya ulang di `participants`
  // gagal begitu tabel dimuat ulang di belakang modal yang masih terbuka.
  const [editingRow, setEditingRow] = useState<Participant | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (search: string, pageIndex: number, sortKey: SortKey, sortDir: "asc" | "desc") => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/participants?q=${encodeURIComponent(search)}&limit=${PAGE_SIZE}&offset=${pageIndex * PAGE_SIZE}&sort=${sortKey}&dir=${sortDir}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) { setError(data.error?.message ?? "Daftar peserta gagal dimuat."); return; }
      setParticipants(data.participants ?? []); setTotal(data.total ?? 0);
      setActiveTotal(data.active_total ?? data.total ?? 0);
      setRemovedCount(data.removed_count ?? 0); setLastSyncedAt(data.last_synced_at ?? null);
    } catch { setError("Koneksi terputus. Coba lagi."); } finally { setLoading(false); }
  }, []);

  // Debounce search input and reset to first page when the query changes.
  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedQuery(query); setPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Daftar pengecualian undian dimuat sekali. Kegagalannya tidak menggagalkan
  // tabel peserta: tandanya sekadar tidak muncul, dan fungsi utama halaman tetap
  // berjalan.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const response = await fetch("/api/admin/undian/exclusions", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        setExcluded(new Set((data.exclusions ?? []).map((row: { participant_id: string }) => row.participant_id)));
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reloadKey]);

  async function toggleExclusion(participant: Participant) {
    const isExcluded = excluded.has(participant.id);
    setTogglingExclusion(participant.id);
    const response = isExcluded
      ? await fetch(`/api/admin/undian/exclusions?participant_id=${participant.id}`, { method: "DELETE" })
      : await fetch("/api/admin/undian/exclusions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participant_id: participant.id }),
        });
    setTogglingExclusion(null);
    if (!response.ok) { setError("Status undian gagal diubah."); return; }
    setExcluded((current) => {
      const next = new Set(current);
      if (isExcluded) next.delete(participant.id); else next.add(participant.id);
      return next;
    });
  }

  useEffect(() => { const timer = window.setTimeout(() => { void load(debouncedQuery, page, sort, dir); }, 0); return () => window.clearTimeout(timer); }, [load, debouncedQuery, page, sort, dir, reloadKey]);

  // Klik kolom yang sama membalik arah; kolom baru mulai dari asc. Selalu balik
  // ke halaman 1 karena urutan baru membuat posisi halaman lama tidak relevan.
  function toggleSort(key: SortKey) {
    if (key === sort) { setDir((current) => (current === "asc" ? "desc" : "asc")); } else { setSort(key); setDir("asc"); }
    setPage(0);
  }

  function startAdd() {
    setEditingId("new"); setEditingRow(null); setDraft(EMPTY_DRAFT); setError(""); setNotice("");
  }

  function startEdit(participant: Participant) {
    setEditingId(participant.id); setEditingRow(participant); setDraft(toDraft(participant)); setError(""); setNotice("");
  }

  function cancelEdit() { setEditingId(null); setEditingRow(null); setDraft(EMPTY_DRAFT); }

  // Escape menutup modal. Ditangani di sini dan bukan diserahkan ke <dialog>
  // bawaan browser: seluruh dialog lain di aplikasi ini memakai div biasa, dan
  // satu modal yang berperilaku berbeda lebih mengganggu daripada tidak konsisten
  // dengan platform.
  useEffect(() => {
    if (editingId === null) return;
    function onKey(event: KeyboardEvent) { if (event.key === "Escape" && !saving) cancelEdit(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingId, saving]);

  async function save() {
    if (!editingId) return;
    setSaving(true); setError(""); setNotice("");
    const isNew = editingId === "new";
    const response = await fetch(isNew ? "/api/admin/participants" : `/api/admin/participants/${editingId}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    }).catch(() => null);
    setSaving(false);
    if (!response) { setError("Koneksi terputus. Peserta belum tersimpan."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error?.details?.message ?? body.error?.message ?? "Peserta gagal disimpan."); return; }
    cancelEdit();
    setNotice(isNew ? `${draft.name} ditambahkan.` : `${draft.name} diperbarui.`);
    void load(debouncedQuery, page, sort, dir);
    onChanged?.();
  }

  async function remove(participant: Participant) {
    setSaving(true); setError(""); setNotice("");
    const response = await fetch(`/api/admin/participants/${participant.id}`, { method: "DELETE" }).catch(() => null);
    setSaving(false);
    if (!response) { setError("Koneksi terputus. Muat ulang untuk melihat apakah peserta terhapus."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error?.details?.message ?? body.error?.message ?? "Peserta gagal dihapus."); return; }
    setNotice(`${participant.name} dihapus.`);
    void load(debouncedQuery, page, sort, dir);
    onChanged?.();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (page + 1) * PAGE_SIZE);

  /**
   * Satu field di modal.
   *
   * Kolom milik Scanner API ditampilkan sebagai teks di dalam kotak putus-putus,
   * BUKAN sebagai input yang dinonaktifkan. Input abu-abu tetap mengundang klik
   * dan terbaca seperti kerusakan; kotak putus-putus dengan gembok terbaca
   * sebagai keputusan.
   */
  function field(label: string, node: React.ReactNode, hint?: string) {
    return <label className="block text-sm font-semibold">{label}{node}
      {hint && <span className="mt-1 block text-xs font-normal text-[var(--ink-muted)]">{hint}</span>}
    </label>;
  }

  function textField(label: string, key: keyof Draft, options?: { locked?: boolean; value?: string; placeholder?: string; type?: string; mono?: boolean }) {
    if (options?.locked) {
      return field(label, <p className={`${lockedClass} ${options.mono ? "font-mono" : ""}`}><LockSimple size={14} className="mr-2 shrink-0" />{options.value || "-"}</p>);
    }
    return field(label, <input
      value={draft[key]}
      onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
      className={`${inputClass} ${options?.mono ? "font-mono" : ""}`}
      placeholder={options?.placeholder}
      type={options?.type ?? "text"}
    />);
  }

  const editingLocked = editingRow?.source_participant_id != null;

  return <section className="mt-8 w-full border border-[var(--line)] bg-[var(--surface)]">
    <div className="flex flex-col justify-between gap-4 border-b border-[var(--line)] p-5 sm:flex-row sm:items-center">
      <div><h2 className="font-semibold">Daftar peserta</h2><p className="mt-1 text-xs text-[var(--ink-muted)]">{activeTotal} peserta aktif{removedCount > 0 ? ` · ${removedCount} sudah dihapus di sumber` : ""}{lastSyncedAt ? ` · sinkron ${formatEventDateTime(lastSyncedAt, timeZone)} ${abbr ?? timeZoneAbbr(timeZone)}` : ""}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><MagnifyingGlass size={18} className="absolute left-3 top-3 text-[var(--ink-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 w-full border border-[var(--line)] bg-[var(--background)] pl-10 pr-3 text-sm outline-none focus:border-[var(--brand)] sm:w-56" placeholder="Cari nama, perusahaan, QR" /></div>
        {toolbar}
        <button type="button" onClick={startAdd} disabled={editingId !== null} className="inline-flex min-h-11 items-center gap-2 bg-[var(--brand)] px-3 text-sm font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-40"><Plus size={16} /> Tambah peserta</button>
      </div>
    </div>
    {error && <div role="alert" className="m-5 flex items-start gap-2 border border-[#E9C7C4] bg-[#FFF2F0] p-3 text-sm text-[var(--danger)]"><XCircle size={18} className="mt-0.5 shrink-0" />{error}</div>}
    {notice && <div role="status" className="m-5 flex items-center gap-2 border border-[#B9DCC5] bg-[#EEF8F0] p-3 text-sm text-[var(--brand-strong)]"><Check size={18} />{notice}</div>}
    {removedCount > 0 && <div className="m-5 flex items-start gap-2 border border-[#E6D3AE] bg-[#FDF6E7] p-3 text-sm text-[var(--warning)]"><WarningCircle size={18} className="mt-0.5 shrink-0" /><span><span className="font-semibold">{removedCount} peserta sudah dihapus di sumber data.</span> Barisnya tetap disimpan di sini untuk audit, tapi tidak muncul lagi di pencarian booth dan kasir serta tidak dihitung di laporan. Karena itu total {total} di sini lebih besar dari angka aktif {activeTotal}.</span></div>}
    {loading ? <div className="flex min-h-48 items-center justify-center text-sm text-[var(--ink-muted)]">Memuat peserta...</div> : participants.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-sm text-[var(--ink-muted)]"><UsersThree size={40} className="opacity-40" />Belum ada peserta cocok.</div> : <>
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]"><tr>
            <th scope="col" className="w-12 px-5 py-4 text-right font-semibold">No</th>
            {COLUMNS.slice(0, 4).map((column) => {
              const active = sort === column.key;
              return <th key={column.key} scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className="px-5 py-4">
                <button type="button" onClick={() => toggleSort(column.key)} className={`inline-flex min-h-6 items-center gap-1.5 uppercase tracking-[0.12em] transition-colors hover:text-[var(--brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] ${active ? "font-semibold text-[var(--ink)]" : ""}`} title={`Urutkan menurut ${column.label}`}>
                  {column.label}
                  {active ? (dir === "asc" ? <ArrowUp size={13} weight="bold" /> : <ArrowDown size={13} weight="bold" />) : <ArrowsDownUp size={13} className="opacity-35" />}
                </button>
              </th>;
            })}
            <th scope="col" className="px-5 py-4 font-semibold">Email</th>
            <th scope="col" className="px-5 py-4 font-semibold">Telepon</th>
            {COLUMNS.slice(4).map((column) => {
              const active = sort === column.key;
              return <th key={column.key} scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={`px-5 py-4 ${column.align === "right" ? "text-right" : ""}`}>
                <button type="button" onClick={() => toggleSort(column.key)} className={`inline-flex min-h-6 items-center gap-1.5 uppercase tracking-[0.12em] transition-colors hover:text-[var(--brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] ${active ? "font-semibold text-[var(--ink)]" : ""}`} title={`Urutkan menurut ${column.label}`}>
                  {column.label}
                  {active ? (dir === "asc" ? <ArrowUp size={13} weight="bold" /> : <ArrowDown size={13} weight="bold" />) : <ArrowsDownUp size={13} className="opacity-35" />}
                </button>
              </th>;
            })}
            <th scope="col" className="px-5 py-4 font-semibold">{SEAT_COLUMN_LABEL}</th>
            <th scope="col" className="px-5 py-4 text-right font-semibold">Undian</th>
            <th scope="col" className="px-5 py-4 text-right font-semibold">Aksi</th>
          </tr></thead>
          <tbody className="divide-y divide-[var(--line)]">
            {participants.map((participant, index) => {
              const fromSource = participant.source_participant_id != null;
              return <tr key={participant.id} className="hover:bg-[var(--surface-muted)]">
                {/* Nomor melanjutkan antar-halaman (hal 2 mulai dari 26), bukan reset ke 1. */}
                <td className="px-5 py-4 text-right text-xs tabular-nums text-[var(--ink-muted)]">{page * PAGE_SIZE + index + 1}</td>
                <td className="px-5 py-4">
                  <p className="flex items-center gap-2 font-semibold">
                    {participant.name}
                    {participant.source_removed_at && <span className="inline-flex shrink-0 rounded-sm bg-[#FDF6E7] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--warning)]">Dihapus di sumber</span>}
                    {/* Penanda asal baris ditulis di kolom nama, bukan disembunyikan
                        di tooltip tombol: ia menjelaskan kenapa sebagian sel tidak
                        bisa disunting, dan penjelasan itu harus terbaca sebelum
                        orang mencoba menyuntingnya. */}
                    {!fromSource && <span className="inline-flex shrink-0 rounded-sm bg-[#E8ECFB] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-strong)]">Manual</span>}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">{participant.company ?? "Tanpa perusahaan"}{participant.title ? ` · ${participant.title}` : ""}</p>
                </td>
                <td className="px-5 py-4 font-mono text-xs">{participant.qr_code}</td>
                <td className="px-5 py-4 text-xs">{participant.participant_type ?? "-"}</td>
                <td className="px-5 py-4 text-xs">{participant.rsvp_status ?? "-"}</td>
                <td className="px-5 py-4 text-xs">{participant.email ?? <span className="text-[var(--ink-muted)]">-</span>}</td>
                <td className="px-5 py-4 text-xs">{participant.phone ?? <span className="text-[var(--ink-muted)]">-</span>}</td>
                <td className="px-5 py-4 text-xs">{participant.source_checked_in ? <span className="inline-flex rounded-sm bg-[#EEF8F0] px-2 py-0.5 font-semibold text-[var(--brand-strong)]">Sudah</span> : <span className="inline-flex rounded-sm bg-[var(--surface-muted)] px-2 py-0.5 font-semibold text-[var(--ink-muted)]">Belum</span>}</td>
                <td className="px-5 py-4 text-right text-xs tabular-nums">{participant.source_total_scans}</td>
                {/* Datang dari scanner API dan hanya ditampilkan. Nama sesi ikut
                    ditulis karena satu peserta bisa punya kursi berbeda di sesi
                    pagi dan malam; label saja akan ambigu. */}
                <td className="px-5 py-4 text-xs">
                  {participant.seats && participant.seats.length > 0
                    ? <span className="flex flex-wrap gap-1">{participant.seats.map((seat) => <span key={`${seat.subEventId}-${seat.label}`} title={seat.subEventName} className="inline-flex rounded-sm bg-[#E8ECFB] px-2 py-0.5 font-mono font-semibold text-[var(--brand-strong)]">{seat.label}</span>)}</span>
                    : <span className="text-[var(--ink-muted)]">Belum ada</span>}
                </td>
                {/* Pengecualian undian: panitia, MC, dan perwakilan sponsor lazimnya
                    tidak boleh menang meski terdaftar dan memenuhi syarat. */}
                <td className="px-5 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => void toggleExclusion(participant)}
                    disabled={togglingExclusion === participant.id}
                    title={excluded.has(participant.id) ? "Ikutkan lagi ke undian" : "Kecualikan dari semua undian"}
                    className={`inline-flex min-h-9 items-center gap-1.5 border px-2.5 text-xs font-semibold disabled:opacity-50 ${excluded.has(participant.id) ? "border-[var(--warning)] bg-[#FDF6E7] text-[var(--warning)]" : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--brand)] hover:text-[var(--brand)]"}`}
                  >
                    <Prohibit size={14} />{excluded.has(participant.id) ? "Dikecualikan" : "Ikut"}
                  </button>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-1.5">
                    <button type="button" onClick={() => startEdit(participant)} disabled={editingId !== null || saving} title={fromSource ? "Sunting email dan telepon" : "Sunting peserta"} className="inline-flex min-h-9 items-center gap-1.5 border border-[var(--line)] px-2 text-xs font-semibold text-[var(--ink-muted)] hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-40"><PencilSimple size={14} /></button>
                    {/* Tombol hapus hanya untuk baris manual. Untuk baris scanner ia
                        tidak ditampilkan sama sekali: menampilkannya lalu menolak
                        dengan galat membuat aturan yang disengaja terbaca sebagai
                        kerusakan. */}
                    {!fromSource && <button type="button" onClick={() => void remove(participant)} disabled={editingId !== null || saving} title="Hapus peserta manual" className="inline-flex min-h-9 items-center border border-[var(--line)] px-2 text-xs font-semibold text-[var(--ink-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:opacity-40"><Trash size={14} /></button>}
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col items-center justify-between gap-3 border-t border-[var(--line)] p-4 sm:flex-row">
        <p className="text-xs text-[var(--ink-muted)]">Menampilkan {rangeStart}–{rangeEnd} dari {total} peserta</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0 || loading} className="flex min-h-10 items-center gap-1 border border-[var(--line)] px-3 text-sm font-semibold disabled:opacity-40"><CaretLeft size={16} /> Sebelumnya</button>
          <span className="text-sm tabular-nums text-[var(--ink-muted)]">Hal {page + 1} / {totalPages}</span>
          <button onClick={() => setPage((current) => (current + 1 < totalPages ? current + 1 : current))} disabled={page + 1 >= totalPages || loading} className="flex min-h-10 items-center gap-1 border border-[var(--line)] px-3 text-sm font-semibold disabled:opacity-40">Berikutnya <CaretRight size={16} /></button>
        </div>
      </div>
    </>}

    {/* Modal tambah/sunting. Menggantikan penyuntingan di dalam baris: tabel ini
        punya dua belas kolom dan menggulir horizontal, sehingga sel yang sedang
        disunting rutin berada di luar layar bersama tombol simpannya. */}
    {editingId !== null && <div
      role="dialog"
      aria-modal="true"
      aria-label={editingId === "new" ? "Tambah peserta" : "Sunting peserta"}
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) cancelEdit(); }}
    >
      <form
        onSubmit={(event) => { event.preventDefault(); void save(); }}
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">{editingId === "new" ? "Peserta baru" : "Sunting peserta"}</p>
            <h2 className="mt-2 text-2xl font-semibold">{editingId === "new" ? "Tambah peserta manual" : editingRow?.name}</h2>
          </div>
          <button type="button" onClick={cancelEdit} disabled={saving} className="min-h-11 px-2 text-sm font-semibold disabled:opacity-40" aria-label="Tutup"><X size={18} /></button>
        </div>

        {editingLocked && <p className="mt-5 flex items-start gap-2 border border-[#E6D3AE] bg-[#FDF6E7] p-4 text-sm leading-6 text-[var(--warning)]">
          <LockSimple size={18} className="mt-0.5 shrink-0" />
          <span>Peserta ini ditarik dari Scanner API. Nama, perusahaan, jabatan, kode QR, tipe, dan RSVP dikelola di sana dan akan ditimpa pada sync berikutnya — karena itu tidak dapat diubah dari sini. <span className="font-semibold">Email dan telepon tetap bisa diisi</span>, karena Scanner API tidak mengirim keduanya.</span>
        </p>}

        {error && <p role="alert" className="mt-5 flex items-start gap-2 border border-[#E9C7C4] bg-[#FFF2F0] p-4 text-sm text-[var(--danger)]"><XCircle size={18} className="mt-0.5 shrink-0" />{error}</p>}

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">{textField("Nama lengkap", "name", { locked: editingLocked, value: editingRow?.name, placeholder: "Nama peserta" })}</div>
          {textField("Perusahaan", "company", { locked: editingLocked, value: editingRow?.company ?? "", placeholder: "Opsional" })}
          {textField("Jabatan", "title", { locked: editingLocked, value: editingRow?.title ?? "", placeholder: "Opsional" })}
          {/* Kode QR dipisah barisnya sendiri secara visual lewat hint: ia satu-
              satunya kolom yang bentrokannya menolak penyimpanan, dan panitia perlu
              tahu itu sebelum mengetik, bukan sesudah galat muncul. */}
          {editingLocked
            ? field("Kode QR", <p className={`${lockedClass} font-mono`}><LockSimple size={14} className="mr-2 shrink-0" />{editingRow?.qr_code}</p>)
            : field("Kode QR", <input value={draft.qr_code} onChange={(event) => setDraft({ ...draft, qr_code: event.target.value })} className={`${inputClass} font-mono`} placeholder="REG000000" required />, "Harus unik di event ini. Kode inilah yang dipindai booth dan kasir.")}
          {textField("Tipe peserta", "participant_type", { locked: editingLocked, value: editingRow?.participant_type ?? "", placeholder: "mis. VIP, reguler" })}
          {editingLocked
            ? field("RSVP", <p className={lockedClass}><LockSimple size={14} className="mr-2 shrink-0" />{editingRow?.rsvp_status ?? "-"}</p>)
            : field("RSVP", <select value={draft.rsvp_status} onChange={(event) => setDraft({ ...draft, rsvp_status: event.target.value })} className={inputClass}>
                <option value="">Tidak diisi</option>
                <option value="invited">invited</option>
                <option value="confirmed">confirmed</option>
              </select>)}
          {/* Email dan telepon tidak pernah dikunci: Scanner API tidak mengirim
              kedua kolom ini, jadi sinkronisasi tidak punya nilai untuk menimpanya. */}
          {textField("Email", "email", { placeholder: "nama@contoh.com", type: "email" })}
          {textField("Telepon", "phone", { placeholder: "08xx / +62xx" })}
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          <button type="submit" disabled={saving || !draft.name.trim() || !draft.qr_code.trim()} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 bg-[var(--brand)] px-4 font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-40">
            <Check size={18} />{saving ? "Menyimpan..." : editingId === "new" ? "Tambah peserta" : "Simpan perubahan"}
          </button>
          <button type="button" onClick={cancelEdit} disabled={saving} className="min-h-12 border border-[var(--line)] px-4 font-semibold disabled:opacity-40">Batal</button>
        </div>
      </form>
    </div>}
  </section>;
}
