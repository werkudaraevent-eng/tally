"use client";

// Remote control reveal bertahap leaderboard.
//
// Kenapa halaman TERPISAH dari /admin/display:
//
// /admin/display adalah form panjang yang diedit lalu disimpan. Halaman ini
// dipakai berdiri di dekat panggung, dari layar ponsel, sambil mendengarkan MC —
// tombolnya harus langsung terjangkau tanpa menggulir melewati pemilih warna,
// dan setiap klik harus BERLAKU SEKETIKA, bukan menunggu tombol Simpan. Kalau
// digabung, operator bisa tanpa sengaja menerbitkan perubahan tampilan yang
// belum siap hanya karena ingin memindahkan tahap.

import { ArrowClockwise, ArrowLeft, ArrowLineRight, ArrowLeft as ArrowPrev, CaretRight, Eye, EyeSlash, ListNumbers, Lock, LockOpen, MonitorPlay, Play, Rows, Snowflake, WarningCircle } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { formatEventDateTime } from "@/lib/datetime";
import { DEFAULT_REVEAL_STAGES, normalizeStages, type RevealAction, type RevealMode, type RevealStage } from "@/lib/reveal";
import { DEFAULT_TIME_ZONE, normalizeTimeZone, timeZoneAbbr, type EventTimeZone } from "@/lib/timezone";

type RevealRow = {
  mode: RevealMode;
  stage: number;
  stages: RevealStage[];
  freeze_on_start: boolean;
  frozen_at: string | null;
  settings_updated_at: string | null;
};

// Halaman ini menyegarkan dirinya sendiri agar dua panitia yang membuka layar
// berbeda tidak melihat tahap yang berbeda. Sama dengan interval layar display.
//
// Penyegarannya memakai GET, bukan POST no-op. POST akan menulis `updated_at`
// dan satu baris audit setiap dua detik selama tab ini terbuka — riwayat audit
// hari acara akan tenggelam oleh ribuan baris yang tidak berarti.
const POLL_MS = 2000;

export default function RevealControlPage() {
  const [row, setRow] = useState<RevealRow | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [timeZone, setTimeZone] = useState<EventTimeZone>(DEFAULT_TIME_ZONE);
  // Daftar tahap diedit sebagai draf lokal supaya angka yang setengah ditulis
  // tidak langsung dikirim. Aksi tahap (next/prev) tetap seketika.
  const [draft, setDraft] = useState<RevealStage[] | null>(null);
  const [busy, setBusy] = useState<RevealAction | null>(null);
  const [error, setError] = useState("");
  const toast = useToast();

  const apply = useCallback((data: Record<string, unknown>) => {
    setRow({
      mode: data.mode === "staged" ? "staged" : "off",
      stage: Number(data.stage) || 0,
      stages: normalizeStages(data.stages),
      freeze_on_start: data.freeze_on_start !== false,
      frozen_at: (data.frozen_at as string | null) ?? null,
      settings_updated_at: (data.settings_updated_at as string | null) ?? (data.updated_at as string | null) ?? null,
    });
  }, []);

  const load = useCallback(async () => {
    const [revealResponse, settingsResponse] = await Promise.all([
      fetch("/api/display/reveal", { cache: "no-store" }),
      fetch("/api/settings", { cache: "no-store" }),
    ]);
    if (settingsResponse.ok) {
      const data = await settingsResponse.json();
      setEnabled(data.leaderboard_enabled !== false);
      setTimeZone(normalizeTimeZone(data.time_zone));
    }
    if (!revealResponse.ok) { setError("Status reveal gagal dimuat."); return; }
    apply(await revealResponse.json());
    setError("");
  }, [apply]);

  // React Compiler melarang setState di badan effect, jadi pemuatan awal
  // ditunda satu tick. Pola yang sama dipakai halaman admin lain.
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    const interval = window.setInterval(() => { void load(); }, POLL_MS);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [load]);

  async function act(action: RevealAction, body: Record<string, unknown> = {}) {
    setBusy(action); setError("");
    const response = await fetch("/api/display/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    const data = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      const failure = data?.error?.message ?? "Aksi reveal gagal.";
      setError(failure);
      toast.error("Aksi reveal gagal", failure);
      return false;
    }
    apply(data as Record<string, unknown>);
    return true;
  }

  if (!row) return <main className="min-h-dvh bg-[var(--background)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:py-10">
    <div className="mx-auto max-w-[900px]">
      <Link href="/admin/display" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand)]"><ArrowLeft size={18} /> Kembali ke Live Display</Link>
      <p className="mt-6 text-sm text-[var(--ink-muted)]">{error || "Memuat status reveal..."}</p>
    </div>
  </main>;

  const stages = row.stages;
  const staged = row.mode === "staged";
  const showAllStageNumber = stages.length + 1;
  const atShowAll = row.stage >= showAllStageNumber;
  const currentStage = row.stage >= 1 && row.stage <= stages.length ? stages[row.stage - 1] : null;
  const nextStage = row.stage < stages.length ? stages[row.stage] : null;
  const editing = draft ?? stages;

  // Ringkasan apa yang SEDANG di layar, ditulis sebagai satu kalimat.
  //
  // Operator tidak boleh harus menerjemahkan "stage 2 dari 2" menjadi peringkat
  // berapa yang tampil. Yang dia lihat harus sama dengan yang penonton lihat.
  const onScreen = !staged
    ? "Papan penuh, mengikuti transaksi live"
    : atShowAll ? "Papan penuh (semua peringkat)"
    : currentStage ? `${currentStage.label} (peringkat ${currentStage.from}-${currentStage.to})`
    : "Belum ada peringkat yang dibuka";

  return <main className="min-h-dvh bg-[var(--background)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:py-10">
    <div className="mx-auto max-w-[900px]">
      <Link href="/admin/display" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand)]"><ArrowLeft size={18} /> Kembali ke Live Display</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Reveal bertahap</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">Umumkan peringkat sedikit-sedikit di layar proyektor. Setiap tombol di halaman ini berlaku seketika, tanpa perlu disimpan.</p>
        </div>
        <Link href="/display?fullscreen=1" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold"><MonitorPlay size={18} /> Buka Live Display</Link>
      </div>

      {error && <p className="mt-6 flex items-start gap-2 border border-[var(--danger)] bg-[var(--surface)] p-3 text-sm text-[var(--danger)]"><WarningCircle size={18} className="mt-0.5 shrink-0" /> {error}</p>}

      {/* Peringatan saklar master. Tanpa ini, operator yang menekan "tahap
          berikutnya" pada layar yang sedang dimatikan akan menyimpulkan tombolnya
          rusak, lalu menekannya berulang — dan tahap sudah melewati beberapa
          nomor ketika layar akhirnya dinyalakan. */}
      {!enabled && <div className="mt-6 flex items-start gap-3 border border-[var(--warning)] bg-[var(--surface)] p-4 text-sm">
        <EyeSlash size={20} className="mt-0.5 shrink-0 text-[var(--warning)]" />
        <div>
          <p className="font-semibold">Leaderboard sedang disembunyikan di semua layar.</p>
          <p className="mt-1 text-[var(--ink-muted)]">Tahap tetap berpindah saat kamu menekan tombol, tetapi penonton belum melihat apa pun. Nyalakan kembali saklar <span className="font-semibold">Tampilkan leaderboard</span> di Live Display saat siap. Tahap yang sudah dibuka tidak hilang.</p>
        </div>
      </div>}

      <div className="mt-8 space-y-px border border-[var(--line)] bg-[var(--line)]">
        {/* --- Saklar mode --- */}
        <section className="bg-[var(--surface)] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Mode</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {([
              { value: "off" as const, icon: Rows, title: "Papan penuh", desc: "Seperti biasa: semua top spender tampil live sekaligus." },
              { value: "staged" as const, icon: ListNumbers, title: "Bertahap", desc: "Peringkat dibuka sedikit-sedikit lewat tombol di bawah." },
            ]).map((option) => {
              const Icon = option.icon;
              const active = row.mode === option.value;
              return <button
                key={option.value}
                onClick={() => { void act("config", { mode: option.value }).then((ok) => { if (ok) toast.success(option.value === "staged" ? "Mode bertahap aktif" : "Kembali ke papan penuh", option.value === "staged" ? "Layar menunggu tahap pertama dibuka." : "Layar menampilkan semua peringkat live."); }); }}
                disabled={busy !== null}
                className={`flex min-h-24 flex-col items-start gap-1 border p-4 text-left disabled:opacity-50 ${active ? "border-[var(--brand)] bg-[#E8ECFB]" : "border-[var(--line)] hover:bg-[var(--surface-muted)]"}`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold"><Icon size={18} className={active ? "text-[var(--brand)]" : "text-[var(--ink-muted)]"} /> {option.title}</span>
                <span className="text-xs leading-5 text-[var(--ink-muted)]">{option.desc}</span>
              </button>;
            })}
          </div>
          <p className="mt-3 text-xs text-[var(--ink-muted)]">Mematikan mode bertahap langsung menampilkan papan penuh dan mengosongkan tahap. Aman dipakai kalau pengumuman dibatalkan di tengah acara.</p>
        </section>

        {/* --- Status sekarang --- */}
        <section className="bg-[var(--surface)] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Sedang di layar</h2>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.02em]">{onScreen}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {staged && <span className="border border-[var(--line)] bg-[var(--surface-muted)] px-2 py-1 font-semibold tabular-nums">Tahap {Math.min(row.stage, showAllStageNumber)} / {showAllStageNumber}</span>}
            <span className={`flex items-center gap-1.5 border px-2 py-1 font-semibold ${row.frozen_at ? "border-[var(--brand)] text-[var(--brand)]" : "border-[var(--line)] text-[var(--ink-muted)]"}`}>
              {row.frozen_at ? <><Lock size={13} /> Angka dibekukan {formatEventDateTime(row.frozen_at, timeZone)} {timeZoneAbbr(timeZone)}</> : <><LockOpen size={13} /> Mengikuti data live</>}
            </span>
            <span className={`flex items-center gap-1.5 border px-2 py-1 font-semibold ${enabled ? "border-[var(--line)] text-[var(--ink-muted)]" : "border-[var(--warning)] text-[var(--warning)]"}`}>
              {enabled ? <><Eye size={13} /> Layar menyala</> : <><EyeSlash size={13} /> Layar disembunyikan</>}
            </span>
          </div>

          {/* Peta tahap. Menunjukkan urutan lengkap sekaligus posisi sekarang,
              supaya operator tahu apa yang muncul setelah klik berikutnya tanpa
              harus mengingat susunannya. */}
          {staged && <ol className="mt-5 space-y-px border border-[var(--line)] bg-[var(--line)]">
            {[...stages.map((item, index) => ({ key: `${index}`, number: index + 1, label: item.label, detail: `Peringkat ${item.from}-${item.to} · ${item.layout === "spotlight" ? "tampilan besar" : "daftar"}` })),
              { key: "all", number: showAllStageNumber, label: "Papan penuh", detail: "Semua peringkat sekaligus" }]
              .map((item) => {
                const done = row.stage >= item.number;
                const active = Math.min(row.stage, showAllStageNumber) === item.number;
                return <li key={item.key} className={`flex items-center gap-3 p-3 text-sm ${active ? "bg-[#E8ECFB]" : "bg-[var(--surface)]"}`}>
                  <span className={`flex size-7 shrink-0 items-center justify-center text-xs font-bold ${done ? "bg-[var(--brand)] text-white" : "bg-[var(--surface-muted)] text-[var(--ink-muted)]"}`}>{item.number}</span>
                  <span className="min-w-0 flex-1"><span className="font-semibold">{item.label}</span> <span className="text-[var(--ink-muted)]">— {item.detail}</span></span>
                  {active && <span className="shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-[var(--brand)]">Di layar</span>}
                </li>;
              })}
          </ol>}
        </section>

        {/* --- Kontrol tahap --- */}
        {staged && <section className="bg-[var(--surface)] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Kontrol</h2>

          <button
            onClick={() => { void act("start").then((ok) => { if (ok) toast.success("Reveal dimulai", row.freeze_on_start ? "Angka dibekukan. Tekan Tahap berikutnya saat MC siap." : "Tekan Tahap berikutnya saat MC siap."); }); }}
            disabled={busy !== null}
            className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 bg-[var(--brand)] text-sm font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50"
          ><Play size={20} weight="fill" /> {busy === "start" ? "Memulai..." : row.frozen_at ? "Mulai ulang dari awal" : "Mulai reveal"}</button>
          <p className="mt-2 text-xs text-[var(--ink-muted)]">{row.freeze_on_start ? "Mengunci angka dan urutan apa adanya saat ini, lalu mengosongkan layar ke tahap 0." : "Mengosongkan layar ke tahap 0. Angka tetap mengikuti transaksi live."}</p>

          {/* Tombol paling sering dipakai dibuat paling besar. Next diberi porsi
              dua kali Prev: dalam satu ceremony Next ditekan berkali-kali,
              sedangkan Prev hanya dipakai kalau salah tekan. */}
          <div className="mt-5 grid grid-cols-3 gap-px bg-[var(--line)]">
            <button
              onClick={() => { void act("prev"); }}
              disabled={busy !== null || row.stage <= 0}
              className="flex min-h-16 items-center justify-center gap-2 bg-[var(--surface)] text-sm font-semibold hover:bg-[var(--surface-muted)] disabled:opacity-40"
            ><ArrowPrev size={18} /> Kembali</button>
            <button
              onClick={() => { void act("next"); }}
              disabled={busy !== null || row.stage >= stages.length}
              className="col-span-2 flex min-h-16 items-center justify-center gap-2 bg-[var(--brand)] text-base font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-40"
            >{nextStage ? <>Buka {nextStage.label} <CaretRight size={20} weight="bold" /></> : <>Semua tahap sudah dibuka</>}</button>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button
              onClick={() => { void act("show_all").then((ok) => { if (ok) toast.info("Papan penuh tampil", "Semua peringkat sekarang terlihat penonton."); }); }}
              disabled={busy !== null || atShowAll}
              className="flex min-h-12 items-center justify-center gap-2 border border-[var(--line)] text-sm font-semibold hover:bg-[var(--surface-muted)] disabled:opacity-40"
            ><ArrowLineRight size={18} /> Tampilkan semua</button>
            <button
              onClick={() => { void act("reset").then((ok) => { if (ok) toast.info("Tahap dikosongkan", "Layar kembali ke tahap 0."); }); }}
              disabled={busy !== null || (row.stage === 0 && !row.frozen_at)}
              className="flex min-h-12 items-center justify-center gap-2 border border-[var(--line)] text-sm font-semibold hover:bg-[var(--surface-muted)] disabled:opacity-40"
            ><ArrowClockwise size={18} /> Kosongkan tahap</button>
          </div>
          <p className="mt-2 text-xs text-[var(--ink-muted)]"><span className="font-semibold">Tampilkan semua</span> punya tombolnya sendiri dan tidak akan terpicu oleh Tahap berikutnya, supaya satu klik kelebihan tidak membocorkan seluruh peringkat lebih cepat dari rencana MC.</p>
        </section>}

        {/* --- Pembekuan angka --- */}
        <section className="bg-[var(--surface)] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Angka selama pengumuman</h2>
          <div className="mt-4 space-y-2">
            {([
              {
                value: true,
                icon: Snowflake,
                title: "Bekukan angka saat reveal dimulai",
                badge: "Disarankan",
                desc: "Angka dan urutan dikunci saat kamu menekan Mulai reveal. Transaksi baru tetap tercatat tetapi tidak mengubah layar sampai tahap dikosongkan. Pakai ini kalau booth masih buka — tanpa dibekukan, peserta peringkat 4 bisa melompat ke peringkat 2 setelah tiga besar diumumkan, dan panitia tidak punya cara menjelaskannya di depan penonton.",
              },
              {
                value: false,
                icon: LockOpen,
                title: "Ikuti data live",
                badge: null,
                desc: "Layar mengikuti transaksi terbaru, sehingga urutan bisa berubah di tengah pengumuman. Pakai hanya kalau semua booth sudah tutup dan tidak ada transaksi yang masuk lagi.",
              },
            ]).map((option) => {
              const Icon = option.icon;
              const active = row.freeze_on_start === option.value;
              return <button
                key={String(option.value)}
                onClick={() => { void act("config", { freeze_on_start: option.value }); }}
                disabled={busy !== null}
                className={`flex w-full items-start gap-3 border p-4 text-left disabled:opacity-50 ${active ? "border-[var(--brand)] bg-[#E8ECFB]" : "border-[var(--line)] hover:bg-[var(--surface-muted)]"}`}
              >
                <Icon size={20} className={`mt-0.5 shrink-0 ${active ? "text-[var(--brand)]" : "text-[var(--ink-muted)]"}`} />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">{option.title}{option.badge && <span className="border border-[var(--brand)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--brand)]">{option.badge}</span>}</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--ink-muted)]">{option.desc}</span>
                </span>
              </button>;
            })}
          </div>
          {row.frozen_at && <p className="mt-3 border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--ink-muted)]">Perubahan pilihan ini berlaku pada <span className="font-semibold">Mulai reveal</span> berikutnya. Angka yang sekarang tampil masih memakai pembekuan {formatEventDateTime(row.frozen_at, timeZone)} {timeZoneAbbr(timeZone)}.</p>}
        </section>

        {/* --- Susunan tahap --- */}
        <section className="bg-[var(--surface)] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Susunan tahap</h2>
          <p className="mt-3 text-sm text-[var(--ink-muted)]">Setiap tahap adalah rentang peringkat. Bawaan: peringkat 1-3 tampil besar, lalu diganti peringkat 4-10.</p>
          <div className="mt-4 space-y-px border border-[var(--line)] bg-[var(--line)]">
            {editing.map((item, index) => <div key={index} className="grid gap-3 bg-[var(--surface)] p-4 sm:grid-cols-[1fr_auto_auto_auto]">
              <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">Label
                <input
                  value={item.label}
                  onChange={(event) => setDraft(editing.map((entry, position) => position === index ? { ...entry, label: event.target.value } : entry))}
                  className="mt-1.5 h-11 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm font-normal normal-case tracking-normal text-[var(--ink)] outline-none focus:border-[var(--brand)]"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">Dari
                <input
                  type="number" min={1} max={50} value={item.from}
                  onChange={(event) => setDraft(editing.map((entry, position) => position === index ? { ...entry, from: Math.max(1, Math.min(50, Number(event.target.value) || 1)) } : entry))}
                  className="mt-1.5 h-11 w-20 border border-[var(--line)] bg-[var(--background)] px-3 text-sm tabular-nums text-[var(--ink)] outline-none focus:border-[var(--brand)]"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">Sampai
                <input
                  type="number" min={1} max={50} value={item.to}
                  onChange={(event) => setDraft(editing.map((entry, position) => position === index ? { ...entry, to: Math.max(1, Math.min(50, Number(event.target.value) || 1)) } : entry))}
                  className="mt-1.5 h-11 w-20 border border-[var(--line)] bg-[var(--background)] px-3 text-sm tabular-nums text-[var(--ink)] outline-none focus:border-[var(--brand)]"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">Tampilan
                <select
                  value={item.layout}
                  onChange={(event) => setDraft(editing.map((entry, position) => position === index ? { ...entry, layout: event.target.value === "spotlight" ? "spotlight" : "list" } : entry))}
                  className="mt-1.5 h-11 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm font-normal normal-case tracking-normal text-[var(--ink)] outline-none focus:border-[var(--brand)] sm:w-32"
                >
                  <option value="spotlight">Besar</option>
                  <option value="list">Daftar</option>
                </select>
              </label>
            </div>)}
          </div>

          {/* Peringatan celah peringkat. Susunan seperti 1-3 lalu 5-10 lolos
              validasi bentuk tetapi membuat peringkat 4 tidak pernah tampil, dan
              itu baru diketahui saat pesertanya menunggu namanya disebut. */}
          {(() => {
            const missing = editing.flatMap((item) => Array.from({ length: item.to - item.from + 1 }, (_, offset) => item.from + offset));
            const covered = new Set(missing);
            const highest = editing.reduce((max, item) => Math.max(max, item.to), 0);
            const gaps = Array.from({ length: highest }, (_, index) => index + 1).filter((rank) => !covered.has(rank));
            return gaps.length > 0 ? <p className="mt-3 flex items-start gap-2 border border-[var(--warning)] bg-[var(--surface)] p-3 text-xs"><WarningCircle size={16} className="mt-0.5 shrink-0 text-[var(--warning)]" /> Peringkat {gaps.join(", ")} tidak masuk tahap mana pun, jadi hanya akan terlihat lewat tombol Tampilkan semua.</p> : null;
          })()}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => { void act("config", { stages: editing }).then((ok) => { if (ok) { setDraft(null); toast.success("Susunan tahap tersimpan"); } }); }}
              disabled={busy !== null || draft === null}
              className="flex min-h-12 items-center justify-center gap-2 bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-40"
            >{busy === "config" ? "Menyimpan..." : "Simpan susunan"}</button>
            <button
              onClick={() => setDraft(null)}
              disabled={draft === null}
              className="flex min-h-12 items-center justify-center gap-2 border border-[var(--line)] px-5 text-sm font-semibold hover:bg-[var(--surface-muted)] disabled:opacity-40"
            >Batalkan perubahan</button>
            <button
              onClick={() => setDraft(DEFAULT_REVEAL_STAGES)}
              disabled={busy !== null}
              className="flex min-h-12 items-center justify-center gap-2 border border-[var(--line)] px-5 text-sm font-semibold hover:bg-[var(--surface-muted)] disabled:opacity-40"
            >Kembalikan ke bawaan</button>
          </div>
          <p className="mt-3 text-xs text-[var(--ink-muted)]">Berbeda dari tombol lain di halaman ini, susunan tahap perlu disimpan — supaya angka yang masih setengah ditulis tidak langsung tampil di proyektor.</p>
        </section>
      </div>

      <p className="mt-6 text-center text-xs text-[var(--ink-muted)]">Status disegarkan otomatis tiap {POLL_MS / 1000} detik{row.settings_updated_at ? ` · terakhir diubah ${formatEventDateTime(row.settings_updated_at, timeZone)} ${timeZoneAbbr(timeZone)}` : ""}</p>
    </div>
  </main>;
}
