"use client";

import {
  ArrowLeft, ArrowSquareOut, CheckCircle, Gift, Power, SkipForward,
  Sparkle, Trophy, Warning, XCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ImagePreview } from "@/components/admin/image-preview";
import { useToast } from "@/components/toast";
import { ANIMATIONS, type UndianPrize, normalizePrize } from "@/lib/undian";

// Kontrol undian, dipakai di atas panggung.
//
// Tiga aturan yang membentuk halaman ini:
//
//   1. TOMBOL BEKERJA SEKETIKA, tanpa "Simpan". Operator berdiri di samping MC
//      dan tidak punya kesempatan meninjau lalu menyimpan.
//   2. SASARAN SENTUH BESAR. Ditekan sambil berdiri, kadang di ruangan gelap.
//   3. MENYEGARKAN DIRI setiap 2 detik, sehingga dua orang yang membuka halaman
//      ini (operator dan koordinator) melihat keadaan yang sama.
//
// Nama pemenang di halaman ini muncul pada saat yang SAMA dengan di layar
// panggung, bukan lebih dulu. Ia membaca endpoint publik yang sama, dan endpoint
// itu menahan nama sampai waktu reveal lewat. Memberi operator bocoran lebih awal
// terdengar praktis, tapi cukup satu ekspresi wajah yang salah untuk merusak
// momen yang sedang dibangun.

const POLL_MS = 2000;

type Winner = {
  id?: number; name: string; company: string | null; seat: string | null;
  is_backup: boolean; slot_order: number; status?: "pending" | "confirmed" | "rejected";
};

type State = {
  mode: "off" | "live";
  phase: "idle" | "spinning" | "revealed";
  draw_round: number;
  prize: { id: number; name: string; winners_per_draw: number; winner_quota: number } | null;
  pool_size: number;
  reveal_at: string | null;
  winners: Winner[];
  confirmed: Winner[];
};

export default function UndianControlPage() {
  const [state, setState] = useState<State | null>(null);
  const [prizes, setPrizes] = useState<UndianPrize[]>([]);
  const [winnerCounts, setWinnerCounts] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState("");
  const toast = useToast();

  const load = useCallback(async () => {
    const response = await fetch("/api/undian/state", { cache: "no-store" });
    if (response.ok) setState((await response.json()) as State);
  }, []);

  // Daftar hadiah dimuat terpisah dan TANPA `?pool=1`.
  //
  // Menghitung ukuran kolam memanggil RPC agregat lintas seluruh tabel order per
  // hadiah. Pada halaman yang menyegarkan diri setiap dua detik, itu berarti
  // puluhan query agregat per menit sepanjang acara berlangsung.
  const loadPrizes = useCallback(async () => {
    const response = await fetch("/api/admin/undian/prizes", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setPrizes((data.prizes as Record<string, unknown>[]).map(normalizePrize).filter((prize) => prize.is_active));
    setWinnerCounts(data.winner_counts ?? {});
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); void loadPrizes(); }, 0);
    const interval = window.setInterval(() => { void load(); }, POLL_MS);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [load, loadPrizes]);

  // Hitung mundur sisa animasi. Dihitung ulang setiap 200ms secara lokal, bukan
  // ikut polling 2 detik: angka yang melompat 6 → 4 → 2 terlihat seperti halaman
  // yang tersendat justru pada saat semua orang menatapnya.
  //
  // Dua batasan React Compiler membentuk bentuknya:
  //   * setState sinkron di badan effect ditolak, jadi penyetelan ulang saat
  //     undian berganti dikerjakan saat render lewat perbandingan nilai sebelumnya;
  //   * Date.now() tidak boleh dipanggil saat render, jadi pembacaan jam pertama
  //     ditunda satu tick lewat setTimeout — pola yang sama dengan pemuatan awal
  //     di seluruh halaman admin.
  const revealTarget = state?.phase === "spinning" && state.reveal_at ? new Date(state.reveal_at).getTime() : null;
  const [seenTarget, setSeenTarget] = useState<number | null>(revealTarget);
  if (seenTarget !== revealTarget) {
    setSeenTarget(revealTarget);
    setCountdown(0);
  }

  useEffect(() => {
    if (revealTarget === null) return;
    const tick = () => setCountdown(Math.max(0, (revealTarget - Date.now()) / 1000));
    const timer = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 200);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [revealTarget]);

  async function send(body: Record<string, unknown>, label: string) {
    setBusy(label); setError("");
    const response = await fetch("/api/undian/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      const failure = data?.error?.message ?? "Aksi gagal.";
      setError(failure); toast.error("Aksi gagal", failure);
      return false;
    }
    await load();
    await loadPrizes();
    return true;
  }

  const activePrize = prizes.find((prize) => prize.id === state?.prize?.id) ?? null;
  const quotaUsed = activePrize ? winnerCounts[activePrize.id] ?? 0 : 0;
  const quotaFull = activePrize ? quotaUsed >= activePrize.winner_quota : false;
  const spinning = state?.phase === "spinning";

  return <main className="min-h-dvh bg-[var(--background)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:py-10">
    <div className="mx-auto max-w-[1440px]">
      <Link href="/admin/undian" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand)]">
        <ArrowLeft size={18} /> Kembali ke CMS Undian
      </Link>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Kontrol undian</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Panel operator.</h1>
        </div>
        <Link href="/undian?fullscreen=1" target="_blank" className="flex min-h-12 items-center gap-2 border border-[var(--line)] px-5 text-sm font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]">
          <ArrowSquareOut size={18} /> Buka layar panggung
        </Link>
      </div>

      {error && <p className="mt-5 flex items-start gap-2 border border-[var(--danger)] bg-[#FDECEC] p-4 text-sm text-[var(--danger)]">
        <Warning size={18} className="mt-0.5 shrink-0" /> {error}
      </p>}

      {/* --- Saklar mode --- */}
      <section className="mt-8 flex flex-wrap items-center justify-between gap-4 border border-[var(--line)] bg-[var(--surface)] p-5">
        <div>
          <p className="text-sm font-semibold">Layar panggung {state?.mode === "live" ? "AKTIF" : "mati"}</p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            {state?.mode === "live"
              ? "Layar /undian menampilkan hadiah dan hasil undian."
              : "Layar /undian diam. Nyalakan sebelum sesi undian dimulai."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => send({ action: "mode", mode: state?.mode === "live" ? "off" : "live" }, "mode")}
          disabled={busy !== null}
          className={`flex min-h-12 items-center gap-2 border px-6 text-sm font-semibold disabled:opacity-60 ${state?.mode === "live" ? "border-[var(--line)]" : "border-[var(--brand)] bg-[var(--brand)] text-white"}`}
        >
          <Power size={18} /> {state?.mode === "live" ? "Matikan layar" : "Nyalakan layar"}
        </button>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* --- Pilih hadiah --- */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Pilih hadiah</h2>
          {prizes.length === 0 ? <p className="border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--ink-muted)]">
            Belum ada hadiah aktif. Tambahkan di <Link href="/admin/undian" className="font-semibold text-[var(--brand)] underline">CMS Undian</Link>.
          </p> : <div className="space-y-px border border-[var(--line)] bg-[var(--line)]">
            {prizes.map((prize) => {
              const used = winnerCounts[prize.id] ?? 0;
              const full = used >= prize.winner_quota;
              const active = state?.prize?.id === prize.id;
              return <button
                key={prize.id}
                type="button"
                // Berganti hadiah di tengah animasi akan membuang pemenang yang
                // sudah ditentukan dan belum sempat tampil.
                onClick={() => send({ action: "select", prize_id: prize.id }, `select-${prize.id}`)}
                disabled={busy !== null || spinning}
                className={`flex w-full items-center gap-3 p-4 text-left disabled:opacity-60 ${active ? "bg-[#E8ECFB] ring-2 ring-inset ring-[var(--brand)]" : "bg-[var(--surface)] hover:bg-[#F7F8FC]"}`}
              >
                {prize.image_url
                  ? <ImagePreview url={prize.image_url} alt="" className="h-12 w-12" />
                  : <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-dashed border-[var(--line)] text-[var(--ink-muted)]"><Gift size={18} /></div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{prize.name}</p>
                  <p className="text-xs tabular-nums text-[var(--ink-muted)]">
                    {used}/{prize.winner_quota} pemenang · {ANIMATIONS.find((item) => item.value === prize.animation)?.label}
                  </p>
                </div>
                {full && <span className="shrink-0 border border-[var(--line)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--ink-muted)]">Penuh</span>}
              </button>;
            })}
          </div>}
        </section>

        {/* --- Panel undi --- */}
        <section className="space-y-px self-start border border-[var(--line)] bg-[var(--line)]">
          <div className="bg-[var(--surface)] p-6">
            {!state?.prize ? <p className="py-8 text-center text-sm text-[var(--ink-muted)]">Pilih hadiah untuk mulai mengundi.</p> : <>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Sedang diundi</p>
              <p className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{state.prize.name}</p>
              <p className="mt-1 text-sm tabular-nums text-[var(--ink-muted)]">
                {quotaUsed}/{state.prize.winner_quota} pemenang
                {state.pool_size > 0 && ` · ${state.pool_size} nama di kolam`}
              </p>

              {spinning && <div className="mt-5 border border-[var(--brand)] bg-[#E8ECFB] p-5 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--brand-strong)]">Sedang mengundi</p>
                <p className="mt-2 text-5xl font-semibold tabular-nums tracking-[-0.05em] text-[var(--brand-strong)]">{countdown.toFixed(1)}</p>
                <p className="mt-2 text-xs text-[var(--brand-strong)]/80">
                  Pemenang sudah ditentukan dan dirahasiakan sampai animasi berhenti.
                </p>
              </div>}

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => send({ action: "draw" }, "draw")}
                  disabled={busy !== null || spinning || quotaFull || state.mode !== "live"}
                  className="flex min-h-14 flex-1 items-center justify-center gap-2 border border-[var(--brand)] bg-[var(--brand)] px-6 text-base font-semibold text-white disabled:opacity-50"
                >
                  <Sparkle size={20} weight="fill" /> {busy === "draw" ? "Mengundi..." : "UNDI SEKARANG"}
                </button>
                {spinning && <button
                  type="button"
                  onClick={() => send({ action: "reveal" }, "reveal")}
                  disabled={busy !== null}
                  className="flex min-h-14 items-center gap-2 border border-[var(--line)] px-5 text-sm font-semibold disabled:opacity-60"
                >
                  <SkipForward size={18} /> Langsung tampilkan
                </button>}
              </div>

              {state.mode !== "live" && <p className="mt-3 text-xs text-[var(--ink-muted)]">Nyalakan layar panggung dulu sebelum mengundi.</p>}
              {quotaFull && <p className="mt-3 text-xs font-semibold text-[var(--ink-muted)]">Kuota hadiah ini sudah penuh.</p>}

              <button
                type="button"
                onClick={() => send({ action: "reset" }, "reset")}
                disabled={busy !== null}
                className="mt-3 min-h-11 text-xs font-semibold text-[var(--ink-muted)] underline disabled:opacity-60"
              >
                Bersihkan tampilan layar (pemenang tetap tercatat)
              </button>
            </>}
          </div>

          {/* --- Pemenang undian terakhir --- */}
          {state && state.winners.length > 0 && <div className="bg-[var(--surface)] p-6">
            <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Pemenang undian ini</h3>
            <ul className="mt-3 space-y-2">
              {state.winners.map((winner) => <li key={winner.id} className={`border p-4 ${winner.status === "confirmed" ? "border-[var(--brand)] bg-[#E8ECFB]" : winner.status === "rejected" ? "border-[var(--line)] opacity-60" : "border-[var(--line)]"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold">{winner.name}</span>
                      {winner.is_backup && <span className="border border-[var(--line)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--ink-muted)]">Cadangan {winner.slot_order}</span>}
                      {winner.status === "confirmed" && <span className="border border-[var(--brand)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--brand)]">Sah</span>}
                      {winner.status === "rejected" && <span className="border border-[var(--danger)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--danger)]">Dibatalkan</span>}
                    </div>
                    <p className="mt-1 text-xs text-[var(--ink-muted)]">
                      {[winner.company, winner.seat && `Kursi ${winner.seat}`].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>

                  {winner.status === "pending" && winner.id !== undefined && <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => send({ action: "decide", winner_id: winner.id, status: "confirmed" }, `confirm-${winner.id}`)}
                      disabled={busy !== null}
                      className="flex min-h-11 items-center gap-1.5 border border-[var(--brand)] bg-[var(--brand)] px-4 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      <CheckCircle size={16} /> Hadir
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRejecting(winner.id ?? null); setRejectReason(""); }}
                      disabled={busy !== null}
                      className="flex min-h-11 items-center gap-1.5 border border-[var(--line)] px-4 text-xs font-semibold text-[var(--danger)] hover:border-[var(--danger)] disabled:opacity-60"
                    >
                      <XCircle size={16} /> Tidak hadir
                    </button>
                  </div>}
                </div>

                {/* Konfirmasi ditahan di dalam barisnya, bukan lewat dialog browser. */}
                {rejecting === winner.id && <div className="mt-3 border-t border-[var(--line)] pt-3">
                  <label htmlFor={`reason-${winner.id}`} className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">Alasan (opsional)</label>
                  <input
                    id={`reason-${winner.id}`}
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    className="mt-1.5 h-11 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]"
                    placeholder="Tidak ada di tempat"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await send({ action: "decide", winner_id: winner.id, status: "rejected", reason: rejectReason }, `reject-${winner.id}`);
                        if (ok) { setRejecting(null); toast.info("Pemenang dibatalkan", "Peserta kembali masuk kolam undian berikutnya."); }
                      }}
                      disabled={busy !== null}
                      className="min-h-11 border border-[var(--danger)] bg-[var(--danger)] px-4 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      Ya, batalkan
                    </button>
                    <button type="button" onClick={() => setRejecting(null)} className="min-h-11 border border-[var(--line)] px-4 text-xs font-semibold">Batal</button>
                  </div>
                </div>}
              </li>)}
            </ul>
          </div>}

          {/* --- Rekap --- */}
          {state && state.confirmed.length > 0 && <div className="bg-[var(--surface)] p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
              <Trophy size={16} /> Sudah sah ({state.confirmed.length})
            </h3>
            <ul className="mt-3 grid gap-1 sm:grid-cols-2">
              {state.confirmed.map((winner) => <li key={winner.id} className="truncate text-sm">
                {winner.name}
                {winner.company && <span className="text-[var(--ink-muted)]"> — {winner.company}</span>}
              </li>)}
            </ul>
          </div>}
        </section>
      </div>
    </div>
  </main>;
}
