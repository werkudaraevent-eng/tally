"use client";

// Remote control reveal bertahap leaderboard.
//
// Kenapa terpisah dari setelan papan peringkat: halaman ini dipakai berdiri di
// dekat panggung, dari layar ponsel, sambil mendengarkan MC. Tombolnya harus
// langsung terjangkau tanpa menggulir melewati pemilih warna, dan setiap ketukan
// BERLAKU SEKETIKA, bukan menunggu tombol Simpan. Kalau digabung, operator bisa
// tanpa sengaja menerbitkan perubahan tampilan yang belum siap.
//
// Tata letak: supporting pane. Panel utama = kendali saat acara (satu aksi utama
// per langkah, menempel di bawah layar ponsel). Panel kanan = setelan yang
// disiapkan sebelum acara.

import { ArrowClockwise, ArrowLeft, ArrowLineRight, ArrowSquareOut, CaretRight, Eye, EyeSlash, Lock, LockOpen, Play, Snowflake, Warning, WarningCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useToast } from "@/components/toast";
import { formatEventDateTime } from "@/lib/datetime";
import { cx } from "@/lib/m3/cx";
import { DEFAULT_REVEAL_STAGES, normalizeStages, type RevealAction, type RevealMode, type RevealStage } from "@/lib/reveal";
import { DEFAULT_TIME_ZONE, normalizeTimeZone, timeZoneAbbr, type EventTimeZone } from "@/lib/timezone";
import {
  Banner, Button, ButtonLink, DetailSection, Dialog, MetaSeparator, PageLoading, Pane, PaneBody, PaneFooter, PaneHeader,
  SegmentedButton, SegmentedField, StatusChip, SupportingPane, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";
import { DisplayTabs } from "../display-tabs";
import { INPUT } from "@/components/admin/compact-form";

type RevealRow = {
  mode: RevealMode;
  stage: number;
  stages: RevealStage[];
  freeze_on_start: boolean;
  frozen_at: string | null;
  settings_updated_at: string | null;
};

type Konfirmasi = "off" | "reset" | "restart";

// Halaman ini menyegarkan dirinya sendiri agar dua panitia yang membuka layar
// berbeda tidak melihat tahap yang berbeda. Sama dengan interval layar display.
//
// Penyegarannya memakai GET, bukan POST no-op. POST akan menulis `updated_at`
// dan satu baris audit setiap dua detik selama tab ini terbuka.
const POLL_MS = 2000;


export default function RevealControlPage() {
  const [row, setRow] = useState<RevealRow | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [timeZone, setTimeZone] = useState<EventTimeZone>(DEFAULT_TIME_ZONE);
  // Daftar tahap diedit sebagai draf lokal supaya angka yang setengah ditulis
  // tidak langsung dikirim. Aksi tahap (next/prev) tetap seketika.
  const [draft, setDraft] = useState<RevealStage[] | null>(null);
  const [busy, setBusy] = useState<RevealAction | null>(null);
  const [konfirmasi, setKonfirmasi] = useState<Konfirmasi | null>(null);
  /**
   * DUA saluran galat, bukan satu.
   *
   * Halaman ini menarik status tiap dua detik. Satu saluran bersama berarti
   * `load()` yang berhasil menghapus pesan kegagalan aksi dalam dua detik, tepat
   * saat panitia sedang mencari tahu kenapa tahap tidak mau maju. `galatMuat`
   * milik polling; `galatAksi` bertahan sampai tombol berikutnya ditekan.
   */
  const [galatMuat, setGalatMuat] = useState("");
  const [galatAksi, setGalatAksi] = useState("");
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
    // `.catch` di kedua permintaan: jaringan panggung putus-nyambung, dan fetch
    // yang ditolak hanya menjadi unhandled rejection sementara layar tetap
    // memajang angka lama seolah masih hidup.
    const [revealResponse, settingsResponse] = await Promise.all([
      fetch("/api/display/reveal", { cache: "no-store" }).catch(() => null),
      fetch("/api/settings", { cache: "no-store" }).catch(() => null),
    ]);
    if (settingsResponse?.ok) {
      const data = await settingsResponse.json();
      setEnabled(data.leaderboard_enabled !== false);
      setTimeZone(normalizeTimeZone(data.time_zone));
    }
    if (!revealResponse) { setGalatMuat("Connection lost. The status shown may be out of date."); return; }
    if (!revealResponse.ok) { setGalatMuat("Could not load the reveal status."); return; }
    apply(await revealResponse.json());
    setGalatMuat("");
  }, [apply]);

  // React Compiler melarang setState di badan effect, jadi pemuatan awal
  // ditunda satu tick. Pola yang sama dipakai halaman admin lain.
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    const interval = window.setInterval(() => { void load(); }, POLL_MS);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [load]);

  async function act(action: RevealAction, body: Record<string, unknown> = {}) {
    setBusy(action); setGalatAksi("");
    const response = await fetch("/api/display/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setBusy(null);
    if (!response?.ok) {
      const failure = data?.error?.message ?? (response ? "Reveal action failed." : "Connection lost. The action may not have been sent; check the status above.");
      setGalatAksi(failure);
      toast.error("Reveal action failed", failure);
      return false;
    }
    apply(data as Record<string, unknown>);
    return true;
  }

  function gantiMode(value: RevealMode) {
    void act("config", { mode: value }).then((ok) => {
      if (ok) toast.success(value === "staged" ? "Step-by-step mode on" : "Back to the full board", value === "staged" ? "The screen is waiting for the first step." : "The screen shows all ranks live.");
    });
  }

  function mulai() {
    const beku = row?.freeze_on_start;
    void act("start").then((ok) => { if (ok) toast.success("Reveal started", beku ? "Figures frozen. Open the first step when the MC is ready." : "Open the first step when the MC is ready."); });
  }

  function kosongkan() {
    void act("reset").then((ok) => { if (ok) toast.info("Steps cleared", "The screen is back at step 0."); });
  }

  const galat = galatAksi || galatMuat;

  const header = (
    <WorkspaceHeader
      title="Leaderboard"
      meta={row ? (
        <>
          <span>{row.mode === "staged" ? "Step-by-step mode" : "Full board mode"}</span>
          <MetaSeparator />
          <span>Status disegarkan tiap {POLL_MS / 1000} detik</span>
        </>
      ) : null}
      actions={<ButtonLink href="/display?fullscreen=1" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Open leaderboard</ButtonLink>}
    />
  );

  if (!row) {
    return (
      <WorkspacePage fill>
        {header}
        <DisplayTabs revealMode={null} />
        {galat ? <Banner tone="error" icon={<Warning size={18} />}>{galat}</Banner> : <PageLoading />}
      </WorkspacePage>
    );
  }

  const stages = row.stages;
  const staged = row.mode === "staged";
  const showAllStageNumber = stages.length + 1;
  const atShowAll = row.stage >= showAllStageNumber;
  const currentStage = row.stage >= 1 && row.stage <= stages.length ? stages[row.stage - 1] : null;
  const nextStage = row.stage < stages.length ? stages[row.stage] : null;
  const editing = draft ?? stages;
  // Satu aksi utama per langkah. Selama angka belum dibekukan dan belum ada tahap
  // yang dibuka, langkahnya adalah Mulai reveal; setelah itu, tahap berikutnya.
  const perluMulai = staged && row.freeze_on_start && !row.frozen_at && row.stage === 0;

  // Apa yang SEDANG di layar, sebagai satu kalimat. Operator tidak boleh harus
  // menerjemahkan "tahap 2 dari 3" menjadi peringkat berapa yang tampil.
  const onScreen = !staged
    ? "Full board, following live transactions"
    : atShowAll ? "Full board (all ranks)"
    : currentStage ? currentStage.label
    : "No ranks opened yet";

  // Peringatan celah peringkat. Susunan 1-3 lalu 5-10 lolos validasi bentuk
  // tetapi membuat peringkat 4 tidak pernah tampil.
  const tercakup = new Set(editing.flatMap((item) => Array.from({ length: item.to - item.from + 1 }, (_, offset) => item.from + offset)));
  const tertinggi = editing.reduce((max, item) => Math.max(max, item.to), 0);
  const celah = Array.from({ length: tertinggi }, (_, index) => index + 1).filter((rank) => !tercakup.has(rank));

  const ubahTahap = (index: number, changes: Partial<RevealStage>) =>
    setDraft(editing.map((entry, position) => (position === index ? { ...entry, ...changes } : entry)));

  // ---- Panel utama: kendali saat acara ---------------------------------------
  const kendali = (
    // Di bawah `lg` panel ini tidak memotong isinya, supaya bilah tombol bisa
    // menempel di tepi bawah layar ponsel selama panel masih terlihat.
    <Pane aria-label="Reveal controls" className="max-lg:overflow-visible">
      <div className="shrink-0 border-b border-outline-variant px-4 py-3">
        <SegmentedButton<RevealMode>
          label="Leaderboard mode"
          value={row.mode}
          onChange={(value) => {
            if (value === row.mode) return;
            // Kembali ke papan penuh membuka SEMUA peringkat seketika. Satu
            // ketukan meleset di ponsel tidak boleh cukup untuk itu.
            if (value === "off") setKonfirmasi("off");
            else gantiMode(value);
          }}
          className="w-full"
          options={[
            { value: "off", label: "Full board", disabled: busy !== null },
            { value: "staged", label: "Step by step", disabled: busy !== null },
          ]}
        />
      </div>

      <PaneBody className="flex flex-col gap-4 px-4 py-4">
        <section aria-label="On screen now" className="rounded-lg border border-outline-variant p-4">
          <p className="text-body-medium text-on-surface-variant">On screen now</p>
          <p className="mt-1 text-title-large font-semibold text-on-surface">{onScreen}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {staged ? <StatusChip dot tone="primary"><span className="tabular-nums">Tahap {Math.min(row.stage, showAllStageNumber)} / {showAllStageNumber}</span></StatusChip> : null}
            {row.frozen_at
              ? <StatusChip icon={<Lock size={12} aria-hidden />}>Angka dibekukan {formatEventDateTime(row.frozen_at, timeZone)} {timeZoneAbbr(timeZone)}</StatusChip>
              : <StatusChip icon={<LockOpen size={12} aria-hidden />}>Following live data</StatusChip>}
            {enabled
              ? <StatusChip icon={<Eye size={12} aria-hidden />}>Screen on</StatusChip>
              : <StatusChip tone="warning" icon={<EyeSlash size={12} aria-hidden />}>Screen hidden</StatusChip>}
          </div>
        </section>

        {!staged ? (
          <p className="text-body-medium text-on-surface-variant">
            All top spenders show live at once. Pick Step by step to open the ranks a few at a time with a button.
            Back to the full board shows every rank right away and clears the steps.
          </p>
        ) : (
          <>
            {/* Peta tahap: urutan lengkap sekaligus posisi sekarang, supaya
                operator tahu apa yang muncul setelah ketukan berikutnya. */}
            <ol aria-label="Step order" className="overflow-hidden rounded-lg border border-outline-variant">
              {[...stages.map((item, index) => ({ key: `${index}`, number: index + 1, label: item.label, detail: `Ranks ${item.from}–${item.to}, ${item.layout === "spotlight" ? "large view" : "list"}` })),
                { key: "all", number: showAllStageNumber, label: "Full board", detail: "All ranks at once" }]
                .map((item) => {
                  const done = row.stage >= item.number;
                  const active = Math.min(row.stage, showAllStageNumber) === item.number;
                  return (
                    <li
                      key={item.key}
                      aria-current={active ? "step" : undefined}
                      className={cx("flex items-center gap-3 border-b border-outline-variant px-4 py-3 text-body-medium last:border-b-0", active && "bg-secondary-container")}
                    >
                      <span className={cx("w-5 shrink-0 text-center font-medium tabular-nums", done ? "text-primary" : "text-on-surface-variant")}>{item.number}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-on-surface">{item.label}</span>
                        <span className="block text-on-surface-variant">{item.detail}</span>
                      </span>
                      {active ? <StatusChip dot tone="primary">On screen</StatusChip> : null}
                    </li>
                  );
                })}
            </ol>

            <div className="flex flex-wrap items-center gap-2">
              {row.frozen_at ? (
                <Button variant="outlined" size="sm" icon={<Play size={16} />} disabled={busy !== null} onClick={() => setKonfirmasi("restart")}>Start again from the beginning</Button>
              ) : null}
              <Button variant="outlined" size="sm" icon={<ArrowClockwise size={16} />} disabled={busy !== null || (row.stage === 0 && !row.frozen_at)} onClick={() => setKonfirmasi("reset")}>Clear steps</Button>
            </div>
            <p className="text-body-medium text-on-surface-variant">
              Show all has its own button and is never triggered by the step button, so one extra tap cannot
              reveal every rank sooner than the MC planned.
            </p>
          </>
        )}

        {row.settings_updated_at ? (
          <p className="text-body-medium text-on-surface-variant">Terakhir diubah {formatEventDateTime(row.settings_updated_at, timeZone)} {timeZoneAbbr(timeZone)}</p>
        ) : null}
      </PaneBody>

      {staged ? (
        <div className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-2 rounded-b-lg border-t border-outline-variant bg-surface-container-high p-4">
          {perluMulai ? (
            <>
              <Button size="xl" block icon={<Play size={20} weight="fill" />} loading={busy === "start"} disabled={busy !== null} onClick={mulai}>Start reveal</Button>
              <p className="text-center text-body-medium text-on-surface-variant">Locks the current figures and order, then the screen waits for the first step.</p>
            </>
          ) : (
            // Tombol utama menyebut tahap yang akan dibuka, bukan sekadar "Lanjut":
            // operator membaca apa yang akan dilihat penonton sebelum menekan.
            <Button size="xl" block trailingIcon={nextStage ? <CaretRight size={20} aria-hidden /> : undefined} loading={busy === "next"} disabled={busy !== null || row.stage >= stages.length} onClick={() => { void act("next"); }}>
              {nextStage ? `Open ${nextStage.label}` : "All steps opened"}
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outlined" size="xl" icon={<ArrowLeft size={18} />} loading={busy === "prev"} disabled={busy !== null || row.stage <= 0} onClick={() => { void act("prev"); }}>Back</Button>
            <Button
              variant="outlined"
              size="xl"
              icon={<ArrowLineRight size={18} />}
              loading={busy === "show_all"}
              disabled={busy !== null || atShowAll}
              onClick={() => { void act("show_all").then((ok) => { if (ok) toast.info("Full board showing", "The audience now sees every rank."); }); }}
            >
              Show all
            </Button>
          </div>
        </div>
      ) : null}
    </Pane>
  );

  // ---- Panel pendukung: setelan sebelum acara ----------------------------------
  const setelan = (
    <Pane as="aside" aria-label="Reveal settings">
      <PaneHeader>
        <h2 className="min-w-0 flex-1 text-body-medium font-semibold text-on-surface">Reveal settings</h2>
      </PaneHeader>
      <PaneBody>
        <DetailSection title="Figures during the announcement">
          <div className="flex flex-col gap-2">
            {([
              {
                value: true,
                icon: Snowflake,
                title: "Freeze figures when the reveal starts",
                badge: "Recommended",
                desc: "Figures and order are locked when Start reveal is pressed. New transactions are still recorded but do not change the screen until the steps are cleared. Use this while booths are still open: without freezing, rank 4 can jump to rank 2 after the top three are announced.",
              },
              {
                value: false,
                icon: LockOpen,
                title: "Follow live data",
                badge: null,
                desc: "The screen follows the latest transactions, so the order can change mid-announcement. Use only when every booth has closed.",
              },
            ]).map((option) => {
              const Icon = option.icon;
              const active = row.freeze_on_start === option.value;
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { if (!active) void act("config", { freeze_on_start: option.value }); }}
                  disabled={busy !== null}
                  className={cx(
                    "flex w-full items-start gap-3 rounded-lg border p-3 text-left text-body-medium disabled:opacity-50",
                    active ? "border-primary bg-accent-soft" : "border-outline-variant hover:bg-primary-soft",
                  )}
                >
                  <Icon size={18} aria-hidden className={cx("mt-0.5 shrink-0", active ? "text-primary" : "text-on-surface-variant")} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-medium text-on-surface">
                      {option.title}
                      {option.badge ? <StatusChip tone="primary">{option.badge}</StatusChip> : null}
                    </span>
                    <span className="mt-0.5 block text-on-surface-variant">{option.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {row.frozen_at ? (
            <p className="text-body-medium text-on-surface-variant">
              Perubahan pilihan ini berlaku pada Mulai reveal berikutnya. Angka yang sekarang tampil masih memakai pembekuan{" "}
              {formatEventDateTime(row.frozen_at, timeZone)} {timeZoneAbbr(timeZone)}.
            </p>
          ) : null}
        </DetailSection>

        <DetailSection title="Step order">
          <p className="text-body-medium text-on-surface-variant">Each step is a range of ranks. Default: ranks 1–3 shown large, then replaced by ranks 4–10.</p>
          <div className="flex flex-col gap-2">
            {editing.map((item, index) => (
              <fieldset key={index} className="rounded-lg border border-outline-variant p-3">
                <legend className="sr-only">Tahap {index + 1}</legend>
                <label className="block text-body-medium font-medium text-on-surface">
                  Label tahap {index + 1}
                  <input value={item.label} onChange={(event) => ubahTahap(index, { label: event.target.value })} className={INPUT} />
                </label>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="block text-body-medium font-medium text-on-surface">
                    From
                    <input type="number" min={1} max={50} value={item.from} onChange={(event) => ubahTahap(index, { from: Math.max(1, Math.min(50, Number(event.target.value) || 1)) })} className={cx(INPUT, "tabular-nums")} />
                  </label>
                  <label className="block text-body-medium font-medium text-on-surface">
                    To
                    <input type="number" min={1} max={50} value={item.to} onChange={(event) => ubahTahap(index, { to: Math.max(1, Math.min(50, Number(event.target.value) || 1)) })} className={cx(INPUT, "tabular-nums")} />
                  </label>
                  <SegmentedField
                    label="View"
                    className="col-span-2"
                    value={item.layout === "spotlight" ? "spotlight" : "list"}
                    onChange={(layout) => ubahTahap(index, { layout })}
                    options={[{ value: "spotlight", label: "Large" }, { value: "list", label: "List" }]}
                  />
                </div>
              </fieldset>
            ))}
          </div>
          {celah.length > 0 ? (
            <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
              <WarningCircle size={16} aria-hidden className="mt-0.5 shrink-0 text-warning" />
              Ranks {celah.join(", ")} are not in any step, so they only show through Show all.
            </p>
          ) : null}
        </DetailSection>
      </PaneBody>
      <PaneFooter note={draft ? "Not saved" : "The order must be saved; it does not apply instantly"}>
        <Button variant="text" size="sm" disabled={busy !== null} onClick={() => setDraft(DEFAULT_REVEAL_STAGES)}>Default</Button>
        <Button variant="text" size="sm" disabled={draft === null} onClick={() => setDraft(null)}>Cancel</Button>
        {/* Outlined, bukan filled: aksi utama halaman ini tombol tahap di panel kendali. */}
        <Button simpan
          variant="outlined"
          size="sm"
          loading={busy === "config" && draft !== null}
          disabled={busy !== null || draft === null}
          onClick={() => { void act("config", { stages: editing }).then((ok) => { if (ok) { setDraft(null); toast.success("Step order saved"); } }); }}
        >
          Save order
        </Button>
      </PaneFooter>
    </Pane>
  );

  const dialog: Record<Konfirmasi, { title: string; description: string; aksi: string; jalankan: () => void }> = {
    off: {
      title: "Back to the full board?",
      description: "Every rank becomes visible to the audience right away and follows live transactions. Steps and frozen figures are cleared.",
      aksi: "Show full board",
      jalankan: () => gantiMode("off"),
    },
    reset: {
      title: "Clear steps?",
      description: `The screen goes back to step 0 and shows no ranks.${row.frozen_at ? " Frozen figures are released; a new freeze is taken when Start reveal is pressed again." : ""}`,
      aksi: "Clear steps",
      jalankan: kosongkan,
    },
    restart: {
      title: "Start again from the beginning?",
      description: row.freeze_on_start
        ? "Figures are frozen again from the current data, and the screen goes back to step 0."
        : "Frozen figures are released and the screen goes back to step 0. Figures follow live data.",
      aksi: "Start again",
      jalankan: mulai,
    },
  };
  const aktifDialog: ReactNode = konfirmasi ? (
    <Dialog
      open
      onClose={() => setKonfirmasi(null)}
      tone="danger"
      size="sm"
      title={dialog[konfirmasi].title}
      description={dialog[konfirmasi].description}
      actions={
        <>
          <Button variant="outlined" onClick={() => setKonfirmasi(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => { const pilihan = dialog[konfirmasi]; setKonfirmasi(null); pilihan.jalankan(); }}>{dialog[konfirmasi].aksi}</Button>
        </>
      }
    />
  ) : null;

  return (
    <WorkspacePage fill>
      {header}
      <DisplayTabs revealMode={row.mode} />

      {galat ? <Banner tone="error" icon={<WarningCircle size={18} />}>{galat}</Banner> : null}

      {/* Peringatan saklar master. Tanpa ini, operator yang menekan tombol tahap
          pada layar yang sedang disembunyikan akan menyimpulkan tombolnya rusak,
          lalu menekannya berulang. */}
      {!enabled ? (
        <Banner tone="warning" icon={<EyeSlash size={18} />}>
          The leaderboard is hidden on every screen. Steps still move when you press the button, but the audience
          sees nothing yet. Turn on Show leaderboard in Settings, Privacy section, when ready. Steps already opened stay open.
        </Banner>
      ) : null}

      <SupportingPane main={kendali} pane={setelan} paneWidth={420} />
      {aktifDialog}
    </WorkspacePage>
  );
}
