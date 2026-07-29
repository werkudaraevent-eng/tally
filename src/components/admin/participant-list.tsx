"use client";

import { ArrowDown, ArrowUp, ArrowsDownUp, CaretLeft, CaretRight, MagnifyingGlass, UsersThree, WarningCircle, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

type Participant = { id: string; qr_code: string; name: string; company: string | null; title: string | null; participant_type: string | null; rsvp_status: string | null; source_checked_in: boolean; source_total_scans: number; source_synced_at: string | null; source_removed_at: string | null };

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

export function ParticipantList({ reloadKey = 0 }: { reloadKey?: number }) {
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

  useEffect(() => { const timer = window.setTimeout(() => { void load(debouncedQuery, page, sort, dir); }, 0); return () => window.clearTimeout(timer); }, [load, debouncedQuery, page, sort, dir, reloadKey]);

  // Klik kolom yang sama membalik arah; kolom baru mulai dari asc. Selalu balik
  // ke halaman 1 karena urutan baru membuat posisi halaman lama tidak relevan.
  function toggleSort(key: SortKey) {
    if (key === sort) { setDir((current) => (current === "asc" ? "desc" : "asc")); } else { setSort(key); setDir("asc"); }
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (page + 1) * PAGE_SIZE);

  return <section className="mt-8 w-full border border-[var(--line)] bg-[var(--surface)]">
    <div className="flex flex-col justify-between gap-4 border-b border-[var(--line)] p-5 sm:flex-row sm:items-center">
      <div><h2 className="font-semibold">Daftar peserta</h2><p className="mt-1 text-xs text-[var(--ink-muted)]">{activeTotal} peserta aktif{removedCount > 0 ? ` · ${removedCount} sudah dihapus di sumber` : ""}{lastSyncedAt ? ` · sinkron ${new Date(lastSyncedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}` : ""}</p></div>
      <div className="relative"><MagnifyingGlass size={18} className="absolute left-3 top-3 text-[var(--ink-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 w-full border border-[var(--line)] bg-[var(--background)] pl-10 pr-3 text-sm outline-none focus:border-[var(--brand)] sm:w-72" placeholder="Cari nama, perusahaan, QR" /></div>
    </div>
    {error && <div role="alert" className="m-5 flex items-center gap-2 border border-[#E9C7C4] bg-[#FFF2F0] p-3 text-sm text-[var(--danger)]"><XCircle size={18} />{error}</div>}
    {removedCount > 0 && <div className="m-5 flex items-start gap-2 border border-[#E6D3AE] bg-[#FDF6E7] p-3 text-sm text-[var(--warning)]"><WarningCircle size={18} className="mt-0.5 shrink-0" /><span><span className="font-semibold">{removedCount} peserta sudah dihapus di sumber data.</span> Barisnya tetap disimpan di sini untuk audit, tapi tidak muncul lagi di pencarian booth dan kasir serta tidak dihitung di laporan. Karena itu total {total} di sini lebih besar dari angka aktif {activeTotal}.</span></div>}
    {loading ? <div className="flex min-h-48 items-center justify-center text-sm text-[var(--ink-muted)]">Memuat peserta...</div> : participants.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-sm text-[var(--ink-muted)]"><UsersThree size={40} className="opacity-40" />Belum ada peserta cocok.</div> : <>
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]"><tr>
            <th scope="col" className="w-12 px-5 py-4 text-right font-semibold">No</th>
            {COLUMNS.map((column) => {
              const active = sort === column.key;
              return <th key={column.key} scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={`px-5 py-4 ${column.align === "right" ? "text-right" : ""}`}>
                <button type="button" onClick={() => toggleSort(column.key)} className={`inline-flex min-h-6 items-center gap-1.5 uppercase tracking-[0.12em] transition-colors hover:text-[var(--brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] ${active ? "font-semibold text-[var(--ink)]" : ""}`} title={`Urutkan menurut ${column.label}`}>
                  {column.label}
                  {active ? (dir === "asc" ? <ArrowUp size={13} weight="bold" /> : <ArrowDown size={13} weight="bold" />) : <ArrowsDownUp size={13} className="opacity-35" />}
                </button>
              </th>;
            })}
          </tr></thead>
          <tbody className="divide-y divide-[var(--line)]">
            {participants.map((participant, index) => <tr key={participant.id} className="hover:bg-[var(--surface-muted)]">
              {/* Nomor melanjutkan antar-halaman (hal 2 mulai dari 26), bukan reset ke 1. */}
              <td className="px-5 py-4 text-right text-xs tabular-nums text-[var(--ink-muted)]">{page * PAGE_SIZE + index + 1}</td>
              <td className="px-5 py-4"><p className="flex items-center gap-2 font-semibold">{participant.name}{participant.source_removed_at && <span className="inline-flex shrink-0 rounded-sm bg-[#FDF6E7] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--warning)]">Dihapus di sumber</span>}</p><p className="mt-1 text-xs text-[var(--ink-muted)]">{participant.company ?? "Tanpa perusahaan"}{participant.title ? ` · ${participant.title}` : ""}</p></td>
              <td className="px-5 py-4 font-mono text-xs">{participant.qr_code}</td>
              <td className="px-5 py-4 text-xs">{participant.participant_type ?? "-"}</td>
              <td className="px-5 py-4 text-xs">{participant.rsvp_status ?? "-"}</td>
              <td className="px-5 py-4 text-xs">{participant.source_checked_in ? <span className="inline-flex rounded-sm bg-[#EEF8F0] px-2 py-0.5 font-semibold text-[var(--brand-strong)]">Sudah</span> : <span className="inline-flex rounded-sm bg-[var(--surface-muted)] px-2 py-0.5 font-semibold text-[var(--ink-muted)]">Belum</span>}</td>
              <td className="px-5 py-4 text-right text-xs tabular-nums">{participant.source_total_scans}</td>
            </tr>)}
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
  </section>;
}
