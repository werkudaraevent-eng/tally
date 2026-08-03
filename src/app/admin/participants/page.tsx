"use client";

import { ArrowLeft, CheckCircle, CloudArrowDown, UsersThree, XCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ParticipantList } from "@/components/admin/participant-list";
import { useToast } from "@/components/toast";
import { formatEventDateTime } from "@/lib/datetime";
import { useEventTimeZone } from "@/lib/use-event-timezone";

const AUTO_OPTIONS = [
  { label: "Mati", value: 0 },
  { label: "5 menit", value: 5 },
  { label: "15 menit", value: 15 },
  { label: "30 menit", value: 30 },
  { label: "60 menit", value: 60 },
];

export default function ParticipantsAdminPage() {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [autoMinutes, setAutoMinutes] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { zone, abbr } = useEventTimeZone();
  const toast = useToast();

  const sync = useCallback(async () => {
    setSyncing(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/participants/sync", { method: "POST", signal: AbortSignal.timeout(90000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const failure = data.error?.message ?? `Sync peserta gagal (HTTP ${response.status}).`;
        setError(failure);
        toast.error("Sync peserta gagal", failure);
        return;
      }
      setMessage(`${data.synced} peserta tersinkron dari API client. Total sumber: ${data.source_total}.`);
      toast.success(`${data.synced} peserta tersinkron`, `Total di sumber: ${data.source_total}.`);
      setLastSyncedAt(new Date().toISOString());
      setReloadKey((key) => key + 1);
    } catch (syncError) {
      const failure = syncError instanceof DOMException && syncError.name === "TimeoutError" ? "Sync terlalu lama. Periksa koneksi API client lalu coba lagi." : "Sync gagal karena koneksi terputus. Coba lagi.";
      setError(failure);
      toast.error("Sync peserta gagal", failure);
    } finally {
      setSyncing(false);
    }
  }, [toast]);

  useEffect(() => {
    if (autoMinutes <= 0) return;
    const interval = window.setInterval(() => { void sync(); }, autoMinutes * 60000);
    return () => window.clearInterval(interval);
  }, [autoMinutes, sync]);

  return <main className="min-h-dvh bg-[var(--background)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:py-10">
    <div className="mx-auto max-w-[1440px]">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand)]"><ArrowLeft size={18} /> Kembali ke Dashboard</Link>
      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Participant directory</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Peserta.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">Ambil directory peserta dari Event Scanner API dan pantau di tabel. API key tidak pernah masuk browser.</p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="border border-[var(--line)] bg-[var(--surface)] p-6">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center bg-[#E8ECFB] text-[var(--brand)]"><CloudArrowDown size={25} weight="duotone" /></div>
            <div>
              <h2 className="font-semibold">External Event Scanner API</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">Pagination otomatis sampai seluruh peserta tersalin. Batas waktu 90 detik.</p>
            </div>
          </div>
          <button onClick={() => void sync()} disabled={syncing} className="mt-6 flex min-h-14 w-full items-center justify-center gap-3 bg-[var(--brand)] text-base font-semibold text-white hover:bg-[var(--brand-strong)] disabled:cursor-wait disabled:opacity-60"><UsersThree size={22} />{syncing ? "Mengambil dan menyimpan peserta..." : "Sync sekarang"}</button>
          {error && <div role="alert" className="mt-5 flex items-center gap-3 border border-[#E9C7C4] bg-[#FFF2F0] p-4 text-sm text-[var(--danger)]"><XCircle size={20} />{error}</div>}
          {message && <div role="status" className="mt-5 flex items-center gap-3 border border-[#B9DCC5] bg-[#EEF8F0] p-4 text-sm text-[var(--brand-strong)]"><CheckCircle size={20} />{message}</div>}
        </section>

        <section className="border border-[var(--line)] bg-[var(--surface)] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Sync otomatis</h2>
          <p className="mt-3 text-sm text-[var(--ink-muted)]">Jalankan sync berkala agar data peserta tetap terbaru selama acara berlangsung.</p>
          <label className="mt-5 block text-sm font-semibold">Interval sync
            <select value={autoMinutes} onChange={(event) => setAutoMinutes(Number(event.target.value))} className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]">
              {AUTO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <div className="mt-5 border border-[var(--line)] bg-[var(--surface-muted)] p-4 text-xs leading-5 text-[var(--ink-muted)]">
            <p>{autoMinutes > 0 ? <>Sync otomatis aktif setiap <span className="font-semibold text-[var(--ink)]">{autoMinutes} menit</span> selama halaman ini terbuka.</> : "Sync otomatis mati. Data hanya diperbarui saat tombol Sync ditekan."}</p>
            <p className="mt-2">Sync terakhir: <span className="font-semibold text-[var(--ink)]">{lastSyncedAt ? `${formatEventDateTime(lastSyncedAt, zone)} ${abbr}` : "belum ada"}</span>{syncing ? " · sedang berjalan..." : ""}</p>
          </div>
        </section>
      </div>

      {/* Zona diteruskan sebagai prop, bukan dibaca ulang di dalam ParticipantList:
          keduanya menampilkan jam sync yang sama, dan dua permintaan terpisah bisa
          sesaat menunjukkan zona berbeda di satu halaman. */}
      <ParticipantList reloadKey={reloadKey} timeZone={zone} timeZoneAbbr={abbr} />
    </div>
  </main>;
}
