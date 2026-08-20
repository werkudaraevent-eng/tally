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

  if (!row) return <main className="bg-surface px-5 pb-8 pt-6 text-on-surface sm:px-8 lg:pb-10">
    <div className="mx-auto max-w-[1440px] [&>*]:max-w-[900px]">
      <Link href="/admin/display" className="inline-flex min-h-11 items-center gap-2 text-body-medium font-semibold text-primary"><ArrowLeft size={18} /> Kembali ke Live Display</Link>
      <p className="mt-6 text-body-medium text-on-surface-variant">{error || "Memuat status reveal..."}</p>
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

  return <main className="bg-surface px-5 pb-8 pt-6 text-on-surface sm:px-8 lg:pb-10">
    <div className="mx-auto max-w-[1440px] [&>*]:max-w-[900px]">
      <Link href="/admin/display" className="inline-flex min-h-11 items-center gap-2 text-body-medium font-semibold text-primary"><ArrowLeft size={18} /> Kembali ke Live Display</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-headline-small font-semibold tracking-tight">Reveal bertahap</h2>
          <p className="mt-3 max-w-2xl text-body-medium leading-6 text-on-surface-variant">Umumkan peringkat sedikit-sedikit di layar proyektor. Setiap tombol di halaman ini berlaku seketika, tanpa perlu disimpan.</p>
        </div>
        <Link href="/display?fullscreen=1" target="_blank" rel="noreferrer" className="rounded-lg inline-flex min-h-11 items-center gap-2 border border-outline-variant bg-panel px-4 text-body-medium font-semibold"><MonitorPlay size={18} /> Buka Live Display</Link>
      </div>

      {error && <p className="rounded-lg mt-6 flex items-start gap-2 border border-error bg-panel p-3 text-body-medium text-error"><WarningCircle size={18} className="mt-0.5 shrink-0" /> {error}</p>}

      {/* Peringatan saklar master. Tanpa ini, operator yang menekan "tahap
          berikutnya" pada layar yang sedang dimatikan akan menyimpulkan tombolnya
          rusak, lalu menekannya berulang — dan tahap sudah melewati beberapa
          nomor ketika layar akhirnya dinyalakan. */}
      {!enabled && <div className="rounded-lg mt-6 flex items-start gap-3 border border-warning bg-panel p-4 text-body-medium">
        <EyeSlash size={20} className="mt-0.5 shrink-0 text-warning" />
        <div>
          <p className="font-semibold">Leaderboard sedang disembunyikan di semua layar.</p>
          <p className="mt-1 text-on-surface-variant">Tahap tetap berpindah saat kamu menekan tombol, tetapi penonton belum melihat apa pun. Nyalakan kembali saklar <span className="font-semibold">Tampilkan leaderboard</span> di Live Display saat siap. Tahap yang sudah dibuka tidak hilang.</p>
        </div>
      </div>}

      <div className="mt-8 space-y-2">
        {/* --- Saklar mode --- */}
        <section className="rounded-lg bg-panel p-6">
          <h2 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Mode</h2>
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
                className={`rounded-lg flex min-h-24 flex-col items-start gap-1 border p-4 text-left disabled:opacity-50 ${active ? "border-primary bg-primary-soft" : "border-outline-variant hover:bg-panel-high"}`}
              >
                <span className="flex items-center gap-2 text-body-medium font-semibold"><Icon size={18} className={active ? "text-primary" : "text-on-surface-variant"} /> {option.title}</span>
                <span className="text-body-small leading-5 text-on-surface-variant">{option.desc}</span>
              </button>;
            })}
          </div>
          <p className="mt-3 text-body-small text-on-surface-variant">Mematikan mode bertahap langsung menampilkan papan penuh dan mengosongkan tahap. Aman dipakai kalau pengumuman dibatalkan di tengah acara.</p>
        </section>

        {/* --- Status sekarang --- */}
        <section className="rounded-lg bg-panel p-6">
          <h2 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Sedang di layar</h2>
          <p className="mt-3 text-headline-small font-semibold tracking-[-0.02em]">{onScreen}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-body-small">
            {staged && <span className="rounded-lg border border-outline-variant bg-panel-high px-2 py-1 font-semibold tabular-nums">Tahap {Math.min(row.stage, showAllStageNumber)} / {showAllStageNumber}</span>}
            <span className={`rounded-sm flex items-center gap-1.5 border px-2 py-1 font-semibold ${row.frozen_at ? "border-primary text-primary" : "border-outline-variant text-on-surface-variant"}`}>
              {row.frozen_at ? <><Lock size={13} /> Angka dibekukan {formatEventDateTime(row.frozen_at, timeZone)} {timeZoneAbbr(timeZone)}</> : <><LockOpen size={13} /> Mengikuti data live</>}
            </span>
            <span className={`rounded-sm flex items-center gap-1.5 border px-2 py-1 font-semibold ${enabled ? "border-outline-variant text-on-surface-variant" : "border-warning text-warning"}`}>
              {enabled ? <><Eye size={13} /> Layar menyala</> : <><EyeSlash size={13} /> Layar disembunyikan</>}
            </span>
          </div>

          {/* Peta tahap. Menunjukkan urutan lengkap sekaligus posisi sekarang,
              supaya operator tahu apa yang muncul setelah klik berikutnya tanpa
              harus mengingat susunannya. */}
          {staged && <ol className="mt-5 space-y-2">
            {[...stages.map((item, index) => ({ key: `${index}`, number: index + 1, label: item.label, detail: `Peringkat ${item.from}-${item.to} · ${item.layout === "spotlight" ? "tampilan besar" : "daftar"}` })),
              { key: "all", number: showAllStageNumber, label: "Papan penuh", detail: "Semua peringkat sekaligus" }]
              .map((item) => {
                const done = row.stage >= item.number;
                const active = Math.min(row.stage, showAllStageNumber) === item.number;
                return <li key={item.key} className={`flex items-center gap-3 p-3 text-body-medium ${active ? "bg-primary-soft" : "bg-panel"}`}>
                  <span className={`flex size-7 shrink-0 items-center justify-center text-body-small font-bold ${done ? "bg-primary text-on-primary" : "bg-panel-high text-on-surface-variant"}`}>{item.number}</span>
                  <span className="min-w-0 flex-1"><span className="font-semibold">{item.label}</span> <span className="text-on-surface-variant">— {item.detail}</span></span>
                  {active && <span className="shrink-0 text-body-small font-bold uppercase tracking-[0.14em] text-primary">Di layar</span>}
                </li>;
              })}
          </ol>}
        </section>

        {/* --- Kontrol tahap --- */}
        {staged && <section className="rounded-lg bg-panel p-6">
          <h2 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Kontrol</h2>

          <button
            onClick={() => { void act("start").then((ok) => { if (ok) toast.success("Reveal dimulai", row.freeze_on_start ? "Angka dibekukan. Tekan Tahap berikutnya saat MC siap." : "Tekan Tahap berikutnya saat MC siap."); }); }}
            disabled={busy !== null}
            className="rounded-md mt-4 flex min-h-14 w-full items-center justify-center gap-2 bg-primary text-body-medium font-semibold text-on-primary hover:bg-primary-dim disabled:opacity-50"
          ><Play size={20} weight="fill" /> {busy === "start" ? "Memulai..." : row.frozen_at ? "Mulai ulang dari awal" : "Mulai reveal"}</button>
          <p className="mt-2 text-body-small text-on-surface-variant">{row.freeze_on_start ? "Mengunci angka dan urutan apa adanya saat ini, lalu mengosongkan layar ke tahap 0." : "Mengosongkan layar ke tahap 0. Angka tetap mengikuti transaksi live."}</p>

          {/* Tombol paling sering dipakai dibuat paling besar. Next diberi porsi
              dua kali Prev: dalam satu ceremony Next ditekan berkali-kali,
              sedangkan Prev hanya dipakai kalau salah tekan. */}
          <div className="rounded-lg overflow-hidden mt-5 grid grid-cols-3 gap-px bg-outline-variant">
            <button
              onClick={() => { void act("prev"); }}
              disabled={busy !== null || row.stage <= 0}
              className="rounded-md flex min-h-16 items-center justify-center gap-2 bg-panel text-body-medium font-semibold hover:bg-panel-high disabled:opacity-40"
            ><ArrowPrev size={18} /> Kembali</button>
            <button
              onClick={() => { void act("next"); }}
              disabled={busy !== null || row.stage >= stages.length}
              className="rounded-md col-span-2 flex min-h-16 items-center justify-center gap-2 bg-primary text-body-large font-semibold text-on-primary hover:bg-primary-dim disabled:opacity-40"
            >{nextStage ? <>Buka {nextStage.label} <CaretRight size={20} weight="bold" /></> : <>Semua tahap sudah dibuka</>}</button>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button
              onClick={() => { void act("show_all").then((ok) => { if (ok) toast.info("Papan penuh tampil", "Semua peringkat sekarang terlihat penonton."); }); }}
              disabled={busy !== null || atShowAll}
              className="rounded-lg flex min-h-12 items-center justify-center gap-2 border border-outline-variant text-body-medium font-semibold hover:bg-panel-high disabled:opacity-40"
            ><ArrowLineRight size={18} /> Tampilkan semua</button>
            <button
              onClick={() => { void act("reset").then((ok) => { if (ok) toast.info("Tahap dikosongkan", "Layar kembali ke tahap 0."); }); }}
              disabled={busy !== null || (row.stage === 0 && !row.frozen_at)}
              className="rounded-lg flex min-h-12 items-center justify-center gap-2 border border-outline-variant text-body-medium font-semibold hover:bg-panel-high disabled:opacity-40"
            ><ArrowClockwise size={18} /> Kosongkan tahap</button>
          </div>
          <p className="mt-2 text-body-small text-on-surface-variant"><span className="font-semibold">Tampilkan semua</span> punya tombolnya sendiri dan tidak akan terpicu oleh Tahap berikutnya, supaya satu klik kelebihan tidak membocorkan seluruh peringkat lebih cepat dari rencana MC.</p>
        </section>}

        {/* --- Pembekuan angka --- */}
        <section className="rounded-lg bg-panel p-6">
          <h2 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Angka selama pengumuman</h2>
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
                className={`rounded-lg flex w-full items-start gap-3 border p-4 text-left disabled:opacity-50 ${active ? "border-primary bg-primary-soft" : "border-outline-variant hover:bg-panel-high"}`}
              >
                <Icon size={20} className={`mt-0.5 shrink-0 ${active ? "text-primary" : "text-on-surface-variant"}`} />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-body-medium font-semibold">{option.title}{option.badge && <span className="rounded-sm border border-primary px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-primary">{option.badge}</span>}</span>
                  <span className="mt-1 block text-body-small leading-5 text-on-surface-variant">{option.desc}</span>
                </span>
              </button>;
            })}
          </div>
          {row.frozen_at && <p className="rounded-lg mt-3 border border-outline-variant bg-panel-high p-3 text-body-small text-on-surface-variant">Perubahan pilihan ini berlaku pada <span className="font-semibold">Mulai reveal</span> berikutnya. Angka yang sekarang tampil masih memakai pembekuan {formatEventDateTime(row.frozen_at, timeZone)} {timeZoneAbbr(timeZone)}.</p>}
        </section>

        {/* --- Susunan tahap --- */}
        <section className="rounded-lg bg-panel p-6">
          <h2 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Susunan tahap</h2>
          <p className="mt-3 text-body-medium text-on-surface-variant">Setiap tahap adalah rentang peringkat. Bawaan: peringkat 1-3 tampil besar, lalu diganti peringkat 4-10.</p>
          <div className="mt-4 space-y-2">
            {editing.map((item, index) => <div key={index} className="rounded-lg grid gap-3 bg-panel p-4 sm:grid-cols-[1fr_auto_auto_auto]">
              <label className="block text-body-small font-semibold uppercase tracking-[0.1em] text-on-surface-variant">Label
                <input
                  value={item.label}
                  onChange={(event) => setDraft(editing.map((entry, position) => position === index ? { ...entry, label: event.target.value } : entry))}
                  className="rounded-md mt-1.5 h-11 w-full border border-outline-variant bg-surface px-3 text-body-medium font-normal normal-case tracking-normal text-on-surface outline-none focus:border-primary"
                />
              </label>
              <label className="block text-body-small font-semibold uppercase tracking-[0.1em] text-on-surface-variant">Dari
                <input
                  type="number" min={1} max={50} value={item.from}
                  onChange={(event) => setDraft(editing.map((entry, position) => position === index ? { ...entry, from: Math.max(1, Math.min(50, Number(event.target.value) || 1)) } : entry))}
                  className="rounded-md mt-1.5 h-11 w-20 border border-outline-variant bg-surface px-3 text-body-medium tabular-nums text-on-surface outline-none focus:border-primary"
                />
              </label>
              <label className="block text-body-small font-semibold uppercase tracking-[0.1em] text-on-surface-variant">Sampai
                <input
                  type="number" min={1} max={50} value={item.to}
                  onChange={(event) => setDraft(editing.map((entry, position) => position === index ? { ...entry, to: Math.max(1, Math.min(50, Number(event.target.value) || 1)) } : entry))}
                  className="rounded-md mt-1.5 h-11 w-20 border border-outline-variant bg-surface px-3 text-body-medium tabular-nums text-on-surface outline-none focus:border-primary"
                />
              </label>
              <label className="block text-body-small font-semibold uppercase tracking-[0.1em] text-on-surface-variant">Tampilan
                <select
                  value={item.layout}
                  onChange={(event) => setDraft(editing.map((entry, position) => position === index ? { ...entry, layout: event.target.value === "spotlight" ? "spotlight" : "list" } : entry))}
                  className="rounded-md mt-1.5 h-11 w-full border border-outline-variant bg-surface px-3 text-body-medium font-normal normal-case tracking-normal text-on-surface outline-none focus:border-primary sm:w-32"
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
            return gaps.length > 0 ? <p className="rounded-lg mt-3 flex items-start gap-2 border border-warning bg-panel p-3 text-body-small"><WarningCircle size={16} className="mt-0.5 shrink-0 text-warning" /> Peringkat {gaps.join(", ")} tidak masuk tahap mana pun, jadi hanya akan terlihat lewat tombol Tampilkan semua.</p> : null;
          })()}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => { void act("config", { stages: editing }).then((ok) => { if (ok) { setDraft(null); toast.success("Susunan tahap tersimpan"); } }); }}
              disabled={busy !== null || draft === null}
              className="rounded-md flex min-h-12 items-center justify-center gap-2 bg-primary px-5 text-body-medium font-semibold text-on-primary hover:bg-primary-dim disabled:opacity-40"
            >{busy === "config" ? "Menyimpan..." : "Simpan susunan"}</button>
            <button
              onClick={() => setDraft(null)}
              disabled={draft === null}
              className="rounded-lg flex min-h-12 items-center justify-center gap-2 border border-outline-variant px-5 text-body-medium font-semibold hover:bg-panel-high disabled:opacity-40"
            >Batalkan perubahan</button>
            <button
              onClick={() => setDraft(DEFAULT_REVEAL_STAGES)}
              disabled={busy !== null}
              className="rounded-lg flex min-h-12 items-center justify-center gap-2 border border-outline-variant px-5 text-body-medium font-semibold hover:bg-panel-high disabled:opacity-40"
            >Kembalikan ke bawaan</button>
          </div>
          <p className="mt-3 text-body-small text-on-surface-variant">Berbeda dari tombol lain di halaman ini, susunan tahap perlu disimpan — supaya angka yang masih setengah ditulis tidak langsung tampil di proyektor.</p>
        </section>
      </div>

      <p className="mt-6 text-center text-body-small text-on-surface-variant">Status disegarkan otomatis tiap {POLL_MS / 1000} detik{row.settings_updated_at ? ` · terakhir diubah ${formatEventDateTime(row.settings_updated_at, timeZone)} ${timeZoneAbbr(timeZone)}` : ""}</p>
    </div>
  </main>;
}
