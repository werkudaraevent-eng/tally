"use client";

import {
  ArrowLeft, ArrowSquareOut, ArrowsClockwise, CheckCircle, Flask, Gift, Power, SkipForward, Stop,
  Sparkle, Trophy, Warning, XCircle,
} from "@phosphor-icons/react";
import Link from "@/components/event-link";
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
  // `id` sengaja opsional: MODE LATIHAN tidak menulis baris `undian_winners`,
  // jadi pemenang latihan tidak punya id. Karena itu `ref` yang dipakai sebagai
  // key React — ia selalu ada, baik pada latihan maupun undian sungguhan.
  id?: number; ref: string; name: string; company: string | null; seat: string | null;
  is_backup: boolean; slot_order: number; status?: "pending" | "confirmed" | "rejected";
};

type State = {
  mode: "off" | "live";
  /** true = undian berjalan tetapi hasilnya tidak dicatat. */
  rehearsal: boolean;
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
  // Berapa pemenang yang masih menunggu konfirmasi per hadiah. Ini yang
  // menentukan tombol "Undi ulang" muncul: hanya pemenang pending yang dapat
  // dibatalkan, jadi tanpa angka ini panel akan menawarkan tombol yang gagal.
  const [pendingCounts, setPendingCounts] = useState<Record<number, number>>({});
  // Nama sesi aktif. Badge "Penuh" tanpa menyebut sesinya terbaca sebagai
  // "hadiah ini habis selamanya".
  const [activeSession, setActiveSession] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  // Konfirmasi undi ulang ditahan di dalam panelnya, bukan window.confirm:
  // membatalkan sepuluh pemenang sekaligus tidak boleh terjadi karena satu
  // ketukan tak sengaja di atas panggung.
  const [confirmRedraw, setConfirmRedraw] = useState(false);
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
    setPendingCounts(data.pending_counts ?? {});
    setActiveSession(data.active_session ?? null);
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
  // Diturunkan dari state, bukan dari kolom hadiah yang dipipa ke sini.
  // `reveal_at` kosong saat berputar HANYA terjadi pada mode manual, dan itu
  // kebenaran runtime-nya sendiri: kalau hadiahnya diubah ke mode lain di
  // tengah putaran, tombol di layar ini tetap cocok dengan undian yang sedang
  // berjalan, bukan dengan setelan terbarunya.
  const manualSpin = spinning && !state?.reveal_at;
  const rehearsal = state?.rehearsal === true;
  // Berapa nama yang akan dibatalkan bila "Undi ulang" ditekan.
  const pendingHere = activePrize ? pendingCounts[activePrize.id] ?? 0 : 0;
  // Pada mode latihan kuota tidak berlaku: tidak ada pemenang yang dicatat,
  // jadi tidak ada kuota yang terpakai. Tombol undi harus tetap hidup, termasuk
  // untuk hadiah yang kuotanya kebetulan sudah penuh — justru hadiah itulah yang
  // paling perlu diuji ulang.
  const drawBlocked = quotaFull && !rehearsal;

  return <main className="bg-surface px-5 py-6 text-on-surface sm:px-8 lg:py-10">
    <div className="mx-auto max-w-[1440px]">
      <Link href="/admin/undian" className="inline-flex min-h-11 items-center gap-2 text-body-medium font-semibold text-primary">
        <ArrowLeft size={18} /> Kembali ke CMS Undian
      </Link>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-body-small font-semibold uppercase tracking-[0.2em] text-primary">Kontrol undian</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Panel operator.</h1>
        </div>
        <Link href="/undian?fullscreen=1" target="_blank" className="rounded-md flex min-h-12 items-center gap-2 border border-outline-variant px-5 text-body-medium font-semibold hover:border-primary hover:text-primary">
          <ArrowSquareOut size={18} /> Buka layar panggung
        </Link>
      </div>

      {error && <p className="rounded-lg mt-5 flex items-start gap-2 border border-error bg-error-soft p-4 text-body-medium text-error">
        <Warning size={18} className="mt-0.5 shrink-0" /> {error}
      </p>}

      {/* --- Saklar mode --- */}
      <section className="rounded-lg mt-8 flex flex-wrap items-center justify-between gap-4 border border-outline-variant bg-panel p-5">
        <div>
          <p className="text-body-medium font-semibold">Layar panggung {state?.mode === "live" ? "AKTIF" : "mati"}</p>
          <p className="mt-1 text-body-small text-on-surface-variant">
            {state?.mode === "live"
              ? "Layar /undian menampilkan hadiah dan hasil undian."
              : "Layar /undian diam. Nyalakan sebelum sesi undian dimulai."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => send({ action: "mode", mode: state?.mode === "live" ? "off" : "live" }, "mode")}
          disabled={busy !== null}
          className={`rounded-md flex min-h-12 items-center gap-2 border px-6 text-body-medium font-semibold disabled:opacity-60 ${state?.mode === "live" ? "border-outline-variant" : "border-primary bg-primary text-on-primary"}`}
        >
          <Power size={18} /> {state?.mode === "live" ? "Matikan layar" : "Nyalakan layar"}
        </button>
      </section>

      {/* --- Saklar mode latihan ---
          Terpisah dari saklar layar karena menjawab pertanyaan yang berbeda:
          saklar di atas menentukan layar panggung menyala atau tidak, yang ini
          menentukan hasilnya dicatat atau tidak. Menggabungkan keduanya membuat
          gladi bersih mustahil dilakukan dengan layar menyala — padahal justru
          itu inti gladi bersih.

          Warnanya oranye, tidak mengikuti warna brand: keadaan ini harus terbaca
          sebagai "sedang tidak normal" dari ujung ruangan. */}
      <section className={`rounded-lg mt-px flex flex-wrap items-center justify-between gap-4 border p-5 ${rehearsal ? "border-warning-soft-outline bg-warning-soft" : "border-outline-variant bg-panel"}`}>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-body-medium font-semibold">
            {rehearsal && <Flask size={18} weight="fill" className="text-on-warning-soft" />}
            Mode latihan {rehearsal ? "AKTIF" : "mati"}
          </p>
          <p className="mt-1 text-body-small text-on-surface-variant">
            {rehearsal
              ? "Undian berjalan normal di layar, tetapi pemenang TIDAK dicatat dan kuota tidak terpakai. Matikan sebelum undian sungguhan."
              : "Untuk gladi bersih. Undian berjalan seperti biasa tetapi hasilnya tidak disimpan, jadi tidak perlu dibersihkan sebelum acara."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => send({ action: "rehearsal", on: !rehearsal }, "rehearsal")}
          disabled={busy !== null || spinning}
          className={`rounded-md flex min-h-12 items-center gap-2 border px-6 text-body-medium font-semibold disabled:opacity-60 ${rehearsal ? "border-warning-soft-outline bg-warning text-on-warning" : "border-outline-variant"}`}
        >
          {rehearsal ? "Selesai latihan" : "Mulai latihan"}
        </button>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* --- Pilih hadiah --- */}
        <section>
          <h2 className="mb-3 text-body-medium font-semibold uppercase tracking-[0.15em] text-on-surface-variant">Pilih hadiah</h2>
          {prizes.length === 0 ? <p className="rounded-lg border border-dashed border-outline-variant p-8 text-center text-body-medium text-on-surface-variant">
            Belum ada hadiah aktif. Tambahkan di <Link href="/admin/undian" className="font-semibold text-primary underline">CMS Undian</Link>.
          </p> : <div className="space-y-2">
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
                className={`flex w-full items-center gap-3 p-4 text-left disabled:opacity-60 ${active ? "bg-primary-soft ring-2 ring-inset ring-primary" : "bg-panel hover:bg-surface-container-high"}`}
              >
                {prize.image_url
                  ? <ImagePreview url={prize.image_url} alt="" className="h-12 w-12" />
                  : <div className="rounded-md flex h-12 w-12 shrink-0 items-center justify-center border border-dashed border-outline-variant text-on-surface-variant"><Gift size={18} /></div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-medium font-semibold">{prize.name}</p>
                  <p className="text-body-small tabular-nums text-on-surface-variant">
                    {used}/{prize.winner_quota} pemenang · {ANIMATIONS.find((item) => item.value === prize.animation)?.label}
                  </p>
                </div>
                {full && <span
                  className="rounded-sm shrink-0 border border-outline-variant px-1.5 py-0.5 text-[10px] font-semibold uppercase text-on-surface-variant"
                  // "Penuh" saja terbaca sebagai "hadiah ini habis selamanya",
                  // dan tafsir itulah yang membuat orang membuat hadiah duplikat
                  // atau menghapus hasil undian. Kuota dihitung per SESI.
                  title={activeSession ? `Kuota penuh di sesi "${activeSession.name}". Hadiah yang sama bisa diundi lagi di sesi berikutnya.` : "Kuota penuh"}
                >
                  {activeSession ? "Penuh di sesi ini" : "Penuh"}
                </span>}
              </button>;
            })}
          </div>}
        </section>

        {/* --- Panel undi --- */}
        <section className="rounded-lg overflow-hidden space-y-px self-start border border-outline-variant bg-outline-variant">
          <div className="rounded-lg bg-panel p-6">
            {!state?.prize ? <p className="py-8 text-center text-body-medium text-on-surface-variant">Pilih hadiah untuk mulai mengundi.</p> : <>
              <p className="text-body-small font-semibold uppercase tracking-[0.15em] text-on-surface-variant">Sedang diundi</p>
              <p className="mt-2 text-headline-small font-semibold tracking-[-0.03em]">{state.prize.name}</p>
              <p className="mt-1 text-body-medium tabular-nums text-on-surface-variant">
                {quotaUsed}/{state.prize.winner_quota} pemenang
                {state.pool_size > 0 && ` · ${state.pool_size} nama di kolam`}
              </p>

              {/* Pada mode manual tidak ada angka yang bisa dihitung mundur.
                  Menampilkan "0.0" di sana akan terbaca sebagai animasi yang
                  macet, padahal justru itulah perilaku yang diminta. */}
              {spinning && <div className="rounded-lg mt-5 border border-primary bg-primary-soft p-5 text-center">
                <p className="text-body-small font-semibold uppercase tracking-[0.15em] text-primary-dim">Sedang mengundi</p>
                {manualSpin
                  ? <p className="mt-2 flex items-center justify-center gap-2 text-headline-small font-semibold tracking-[-0.03em] text-primary-dim">
                      <span className="inline-block size-2.5 animate-pulse rounded-full bg-primary" /> Menunggu aba-aba
                    </p>
                  : <p className="mt-2 text-5xl font-semibold tabular-nums tracking-[-0.05em] text-primary-dim">{countdown.toFixed(1)}</p>}
                <p className="mt-2 text-body-small text-primary-dim/80">
                  {manualSpin
                    ? "Roda berputar sampai Anda menekan Berhenti. Pemenang sudah ditentukan dan tersimpan sejak tombol Undi ditekan — menutup halaman ini tidak menghilangkannya."
                    : "Pemenang sudah ditentukan dan dirahasiakan sampai animasi berhenti."}
                </p>
              </div>}

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => send({ action: "draw" }, "draw")}
                  disabled={busy !== null || spinning || drawBlocked || state.mode !== "live"}
                  className="rounded-md flex min-h-14 flex-1 items-center justify-center gap-2 border border-primary bg-primary px-6 text-body-large font-semibold text-on-primary disabled:opacity-50"
                >
                  <Sparkle size={20} weight="fill" /> {busy === "draw" ? "Mengundi..." : rehearsal ? "UNDI (LATIHAN)" : "UNDI SEKARANG"}
                </button>
                {/* Aksi yang sama (`reveal`), bobot visual berbeda. Pada mode
                    durasi tetap ia jalan pintas darurat; pada mode manual ia
                    satu-satunya cara undian selesai, jadi ia harus terlihat
                    seperti tombol utama — operator yang berdiri di samping MC
                    tidak punya waktu mencari tombol sekunder. */}
                {spinning && <button
                  type="button"
                  onClick={() => send({ action: "reveal" }, "reveal")}
                  disabled={busy !== null}
                  className={manualSpin
                    ? "flex min-h-14 flex-1 items-center justify-center gap-2 border border-error bg-error px-6 text-body-large font-semibold text-on-error disabled:opacity-60"
                    : "flex min-h-14 items-center gap-2 border border-outline-variant px-5 text-body-medium font-semibold disabled:opacity-60"}
                >
                  {manualSpin
                    ? <><Stop size={20} weight="fill" /> {busy === "reveal" ? "Menghentikan..." : "BERHENTI & TAMPILKAN"}</>
                    : <><SkipForward size={18} /> Langsung tampilkan</>}
                </button>}
              </div>

              {state.mode !== "live" && <p className="mt-3 text-body-small text-on-surface-variant">Nyalakan layar panggung dulu sebelum mengundi.</p>}

              {/* Kuota penuh: JALAN KELUAR, bukan kalimat buntu.
                  Sebelumnya di sini hanya tertulis "Kuota hadiah ini sudah penuh."
                  Jalan keluarnya sebenarnya sudah ada tiga — batalkan pemenang,
                  tutup sesi lalu buka baru, atau hapus hasil — tetapi tidak satu
                  pun terlihat dari layar ini. Operator menyimpulkan harus MENGHAPUS
                  hasil, tindakan paling merusak dari ketiganya dan satu-satunya
                  yang membuang bukti serah terima hadiah. */}
              {drawBlocked && <div className="rounded-lg mt-4 border border-outline-variant bg-panel-high p-4">
                <p className="text-body-medium font-semibold">
                  Kuota penuh{activeSession ? ` di sesi "${activeSession.name}"` : ""} ({quotaUsed}/{state.prize.winner_quota})
                </p>

                {pendingHere > 0 ? <>
                  <p className="mt-1 text-body-small leading-5 text-on-surface-variant">
                    {pendingHere} pemenang belum ditandai hadir. Undi ulang akan membatalkan {pendingHere} nama itu supaya kuota kembali kosong.
                    Datanya tetap tersimpan lengkap dengan alasannya, tidak dihapus.
                  </p>
                  {!confirmRedraw ? <button
                    type="button"
                    onClick={() => setConfirmRedraw(true)}
                    disabled={busy !== null || spinning}
                    className="rounded-md mt-3 flex min-h-12 items-center gap-2 border border-primary px-4 text-body-medium font-semibold text-primary disabled:opacity-60"
                  >
                    <ArrowsClockwise size={18} /> Undi ulang hadiah ini
                  </button> : <div className="mt-3 border-t border-outline-variant pt-3">
                    <p className="text-body-small font-semibold text-error">
                      Batalkan {pendingHere} pemenang {state.prize.name} yang belum hadir?
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await send({ action: "redraw", prize_id: state.prize?.id }, "redraw");
                          setConfirmRedraw(false);
                          if (ok) toast.info("Kuota dikosongkan", `${pendingHere} pemenang dibatalkan. Hadiah ini bisa diundi lagi.`);
                        }}
                        disabled={busy !== null}
                        className="rounded-md min-h-11 border border-error bg-error px-4 text-body-small font-semibold text-on-error disabled:opacity-60"
                      >
                        Ya, undi ulang
                      </button>
                      <button type="button" onClick={() => setConfirmRedraw(false)} className="rounded-md min-h-11 border border-outline-variant px-4 text-body-small font-semibold">Batal</button>
                    </div>
                  </div>}
                </> : <p className="mt-1 text-body-small leading-5 text-on-surface-variant">
                  Semua pemenang sudah ditandai hadir, jadi tidak dapat dibatalkan dari sini — hadiahnya sudah diserahkan.
                  Untuk mengundi hadiah ini lagi, tutup sesi di <Link href="/admin/undian" className="font-semibold text-primary underline">CMS Undian</Link> lalu mulai sesi baru.
                  Pemenang lama tetap tercatat.
                </p>}
              </div>}

              {/* Pada mode latihan kuota tidak menghalangi, tapi angkanya tetap
                  perlu terlihat supaya operator tahu keadaan sungguhannya. */}
              {quotaFull && rehearsal && <p className="mt-3 text-body-small text-on-surface-variant">
                Kuota sebenarnya sudah penuh, tetapi mode latihan tidak memakai kuota.
              </p>}

              <button
                type="button"
                onClick={() => send({ action: "reset" }, "reset")}
                disabled={busy !== null}
                className="mt-3 min-h-11 text-body-small font-semibold text-on-surface-variant underline disabled:opacity-60"
              >
                Bersihkan tampilan layar (pemenang tetap tercatat)
              </button>
            </>}
          </div>

          {/* --- Pemenang undian terakhir --- */}
          {state && state.winners.length > 0 && <div className="rounded-lg bg-panel p-6">
            <h3 className="text-body-medium font-semibold uppercase tracking-[0.15em] text-on-surface-variant">Pemenang undian ini</h3>
            <ul className="mt-3 space-y-2">
              {/* Key memakai `ref`, BUKAN `id`.

                  `id` bertipe opsional dan memang kosong pada MODE LATIHAN: undian
                  latihan tidak menulis baris `undian_winners` sama sekali (lihat
                  cabang rehearsal di /api/undian/state). `key={undefined}` diterima
                  React sebagai "tanpa key", dan itulah sumber peringatan
                  "Each child in a list should have a unique key prop" yang muncul di
                  konsol.

                  `ref` selalu ada dan unik per peserta, jadi ia benar untuk kedua
                  mode. Rangkaian is_backup+slot_order+name yang dipakai sebelumnya
                  hanya sebagai jaring pengaman: dua peserta bernama sama pada slot
                  yang sama akan bertabrakan, dan React lalu menggabungkan barisnya. */}
              {state.winners.map((winner) => <li key={winner.ref} className={`rounded-lg border p-4 ${winner.status === "confirmed" ? "border-primary bg-primary-soft" : winner.status === "rejected" ? "border-outline-variant opacity-60" : "border-outline-variant"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold">{winner.name}</span>
                      {winner.is_backup && <span className="rounded-sm border border-outline-variant px-1.5 py-0.5 text-[10px] font-semibold uppercase text-on-surface-variant">Cadangan {winner.slot_order}</span>}
                      {winner.status === "confirmed" && <span className="rounded-sm border border-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">Sah</span>}
                      {winner.status === "rejected" && <span className="rounded-sm border border-error px-1.5 py-0.5 text-[10px] font-semibold uppercase text-error">Dibatalkan</span>}
                    </div>
                    <p className="mt-1 text-body-small text-on-surface-variant">
                      {[winner.company, winner.seat && `Kursi ${winner.seat}`].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>

                  {winner.status === "pending" && winner.id !== undefined && <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => send({ action: "decide", winner_id: winner.id, status: "confirmed" }, `confirm-${winner.id}`)}
                      disabled={busy !== null}
                      className="rounded-md flex min-h-11 items-center gap-1.5 border border-primary bg-primary px-4 text-body-small font-semibold text-on-primary disabled:opacity-60"
                    >
                      <CheckCircle size={16} /> Hadir
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRejecting(winner.id ?? null); setRejectReason(""); }}
                      disabled={busy !== null}
                      className="rounded-md flex min-h-11 items-center gap-1.5 border border-outline-variant px-4 text-body-small font-semibold text-error hover:border-error disabled:opacity-60"
                    >
                      <XCircle size={16} /> Tidak hadir
                    </button>
                  </div>}
                </div>

                {/* Konfirmasi ditahan di dalam barisnya, bukan lewat dialog browser. */}
                {rejecting === winner.id && <div className="mt-3 border-t border-outline-variant pt-3">
                  <label htmlFor={`reason-${winner.id}`} className="text-body-small font-semibold uppercase tracking-[0.1em] text-on-surface-variant">Alasan (opsional)</label>
                  <input
                    id={`reason-${winner.id}`}
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    className="rounded-md mt-1.5 h-11 w-full border border-outline-variant bg-surface px-3 text-body-medium outline-none focus:border-primary"
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
                      className="rounded-md min-h-11 border border-error bg-error px-4 text-body-small font-semibold text-on-error disabled:opacity-60"
                    >
                      Ya, batalkan
                    </button>
                    <button type="button" onClick={() => setRejecting(null)} className="rounded-md min-h-11 border border-outline-variant px-4 text-body-small font-semibold">Batal</button>
                  </div>
                </div>}
              </li>)}
            </ul>
          </div>}

          {/* --- Rekap --- */}
          {state && state.confirmed.length > 0 && <div className="rounded-lg bg-panel p-6">
            <h3 className="flex items-center gap-2 text-body-medium font-semibold uppercase tracking-[0.15em] text-on-surface-variant">
              <Trophy size={16} /> Sudah sah ({state.confirmed.length})
            </h3>
            <ul className="mt-3 grid gap-1 sm:grid-cols-2">
              {/* `ref` juga di sini, dengan alasan yang sama seperti daftar di atas:
                  `id` opsional pada tipe `UndianWinner`, jadi memakainya berarti
                  bergantung pada jaminan yang tidak dinyatakan tipenya. */}
              {state.confirmed.map((winner) => <li key={winner.ref} className="truncate text-body-medium">
                {winner.name}
                {winner.company && <span className="text-on-surface-variant"> — {winner.company}</span>}
              </li>)}
            </ul>
          </div>}
        </section>
      </div>
    </div>
  </main>;
}
