"use client";

import { CaretLeft, CaretRight, MagnifyingGlass, UsersThree, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

type Participant = { id: string; qr_code: string; name: string; company: string | null; title: string | null; participant_type: string | null; rsvp_status: string | null; source_checked_in: boolean; source_total_scans: number; source_synced_at: string | null };

const PAGE_SIZE = 25;

export function ParticipantList({ reloadKey = 0 }: { reloadKey?: number }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (search: string, pageIndex: number) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/participants?q=${encodeURIComponent(search)}&limit=${PAGE_SIZE}&offset=${pageIndex * PAGE_SIZE}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) { setError(data.error?.message ?? "Daftar peserta gagal dimuat."); return; }
      setParticipants(data.participants ?? []); setTotal(data.total ?? 0);
    } catch { setError("Koneksi terputus. Coba lagi."); } finally { setLoading(false); }
  }, []);

  // Debounce search input and reset to first page when the query changes.
  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedQuery(query); setPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(debouncedQuery, page); }, 0); return () => window.clearTimeout(timer); }, [load, debouncedQuery, page, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (page + 1) * PAGE_SIZE);

  return <section className="mt-8 w-full border border-[var(--line)] bg-[var(--surface)]">
    <div className="flex flex-col justify-between gap-4 border-b border-[var(--line)] p-5 sm:flex-row sm:items-center">
      <div><h2 className="font-semibold">Daftar peserta</h2><p className="mt-1 text-xs text-[var(--ink-muted)]">{total} peserta tersimpan di Supabase</p></div>
      <div className="relative"><MagnifyingGlass size={18} className="absolute left-3 top-3 text-[var(--ink-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 w-full border border-[var(--line)] bg-[var(--background)] pl-10 pr-3 text-sm outline-none focus:border-[var(--brand)] sm:w-72" placeholder="Cari nama, perusahaan, QR" /></div>
    </div>
    {error && <div role="alert" className="m-5 flex items-center gap-2 border border-[#E9C7C4] bg-[#FFF2F0] p-3 text-sm text-[var(--danger)]"><XCircle size={18} />{error}</div>}
    {loading ? <div className="flex min-h-48 items-center justify-center text-sm text-[var(--ink-muted)]">Memuat peserta...</div> : participants.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-sm text-[var(--ink-muted)]"><UsersThree size={40} className="opacity-40" />Belum ada peserta cocok.</div> : <>
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]"><tr>
            <th className="px-5 py-4">Peserta</th>
            <th className="px-5 py-4">QR code</th>
            <th className="px-5 py-4">Tipe</th>
            <th className="px-5 py-4">RSVP</th>
            <th className="px-5 py-4">Check-in</th>
            <th className="px-5 py-4 text-right">Scan</th>
          </tr></thead>
          <tbody className="divide-y divide-[var(--line)]">
            {participants.map((participant) => <tr key={participant.id} className="hover:bg-[var(--surface-muted)]">
              <td className="px-5 py-4"><p className="font-semibold">{participant.name}</p><p className="mt-1 text-xs text-[var(--ink-muted)]">{participant.company ?? "Tanpa perusahaan"}{participant.title ? ` · ${participant.title}` : ""}</p></td>
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
