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
  SegmentedButton, StatusChip, SupportingPane, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";
import { DisplayTabs } from "../display-tabs";

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

const INPUT = "mt-1.5 h-9 w-full rounded-md border border-outline bg-surface-container-lowest px-3 text-body-medium text-on-surface outline-none focus:border-primary";

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
    if (!revealResponse) { setGalatMuat("Koneksi terputus. Status di layar mungkin sudah tidak akurat."); return; }
    if (!revealResponse.ok) { setGalatMuat("Status reveal gagal dimuat."); return; }
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
      const failure = data?.error?.message ?? (response ? "Aksi reveal gagal." : "Koneksi terputus. Aksi belum tentu terkirim, periksa status di atas.");
      setGalatAksi(failure);
      toast.error("Aksi reveal gagal", failure);
      return false;
    }
    apply(data as Record<string, unknown>);
    return true;
  }

  function gantiMode(value: RevealMode) {
    void act("config", { mode: value }).then((ok) => {
      if (ok) toast.success(value === "staged" ? "Mode bertahap aktif" : "Kembali ke papan penuh", value === "staged" ? "Layar menunggu tahap pertama dibuka." : "Layar menampilkan semua peringkat live.");
    });
  }

  function mulai() {
    const beku = row?.freeze_on_start;
    void act("start").then((ok) => { if (ok) toast.success("Reveal dimulai", beku ? "Angka dibekukan. Buka tahap pertama saat MC siap." : "Buka tahap pertama saat MC siap."); });
  }

  function kosongkan() {
    void act("reset").then((ok) => { if (ok) toast.info("Tahap dikosongkan", "Layar kembali ke tahap 0."); });
  }

  const galat = galatAksi || galatMuat;

  const header = (
    <WorkspaceHeader
      title="Papan peringkat"
      meta={row ? (
        <>
          <span>{row.mode === "staged" ? "Mode bertahap" : "Mode papan penuh"}</span>
          <MetaSeparator />
          <span>Status disegarkan tiap {POLL_MS / 1000} detik</span>
        </>
      ) : null}
      actions={<ButtonLink href="/display?fullscreen=1" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Buka papan peringkat</ButtonLink>}
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
    ? "Papan penuh, mengikuti transaksi live"
    : atShowAll ? "Papan penuh (semua peringkat)"
    : currentStage ? currentStage.label
    : "Belum ada peringkat yang dibuka";

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
    <Pane aria-label="Kendali reveal" className="max-lg:overflow-visible">
      <div className="shrink-0 border-b border-outline-variant px-4 py-3">
        <SegmentedButton<RevealMode>
          label="Mode papan peringkat"
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
            { value: "off", label: "Papan penuh", disabled: busy !== null },
            { value: "staged", label: "Bertahap", disabled: busy !== null },
          ]}
        />
      </div>

      <PaneBody className="flex flex-col gap-4 px-4 py-4">
        <section aria-label="Sedang di layar" className="rounded-lg border border-outline-variant p-4">
          <p className="text-body-medium text-on-surface-variant">Sedang di layar</p>
          <p className="mt-1 text-title-large font-semibold text-on-surface">{onScreen}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {staged ? <StatusChip dot tone="primary"><span className="tabular-nums">Tahap {Math.min(row.stage, showAllStageNumber)} / {showAllStageNumber}</span></StatusChip> : null}
            {row.frozen_at
              ? <StatusChip icon={<Lock size={12} aria-hidden />}>Angka dibekukan {formatEventDateTime(row.frozen_at, timeZone)} {timeZoneAbbr(timeZone)}</StatusChip>
              : <StatusChip icon={<LockOpen size={12} aria-hidden />}>Mengikuti data live</StatusChip>}
            {enabled
              ? <StatusChip icon={<Eye size={12} aria-hidden />}>Layar menyala</StatusChip>
              : <StatusChip tone="warning" icon={<EyeSlash size={12} aria-hidden />}>Layar disembunyikan</StatusChip>}
          </div>
        </section>

        {!staged ? (
          <p className="text-body-medium text-on-surface-variant">
            Semua top spender tampil live sekaligus. Pilih Bertahap untuk membuka peringkat sedikit-sedikit lewat tombol.
            Kembali ke papan penuh langsung menampilkan semua peringkat dan mengosongkan tahap.
          </p>
        ) : (
          <>
            {/* Peta tahap: urutan lengkap sekaligus posisi sekarang, supaya
                operator tahu apa yang muncul setelah ketukan berikutnya. */}
            <ol aria-label="Urutan tahap" className="overflow-hidden rounded-lg border border-outline-variant">
              {[...stages.map((item, index) => ({ key: `${index}`, number: index + 1, label: item.label, detail: `Peringkat ${item.from}–${item.to}, ${item.layout === "spotlight" ? "tampilan besar" : "daftar"}` })),
                { key: "all", number: showAllStageNumber, label: "Papan penuh", detail: "Semua peringkat sekaligus" }]
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
                      {active ? <StatusChip dot tone="primary">Di layar</StatusChip> : null}
                    </li>
                  );
                })}
            </ol>

            <div className="flex flex-wrap items-center gap-2">
              {row.frozen_at ? (
                <Button variant="outlined" size="sm" icon={<Play size={16} />} disabled={busy !== null} onClick={() => setKonfirmasi("restart")}>Mulai ulang dari awal</Button>
              ) : null}
              <Button variant="outlined" size="sm" icon={<ArrowClockwise size={16} />} disabled={busy !== null || (row.stage === 0 && !row.frozen_at)} onClick={() => setKonfirmasi("reset")}>Kosongkan tahap</Button>
            </div>
            <p className="text-body-medium text-on-surface-variant">
              Tampilkan semua punya tombolnya sendiri dan tidak terpicu oleh tombol tahap, supaya satu ketukan kelebihan tidak
              membocorkan seluruh peringkat lebih cepat dari rencana MC.
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
              <Button size="xl" block icon={<Play size={20} weight="fill" />} loading={busy === "start"} disabled={busy !== null} onClick={mulai}>Mulai reveal</Button>
              <p className="text-center text-body-medium text-on-surface-variant">Mengunci angka dan urutan saat ini, lalu layar menunggu tahap pertama.</p>
            </>
          ) : (
            // Tombol utama menyebut tahap yang akan dibuka, bukan sekadar "Lanjut":
            // operator membaca apa yang akan dilihat penonton sebelum menekan.
            <Button size="xl" block trailingIcon={nextStage ? <CaretRight size={20} aria-hidden /> : undefined} loading={busy === "next"} disabled={busy !== null || row.stage >= stages.length} onClick={() => { void act("next"); }}>
              {nextStage ? `Buka ${nextStage.label}` : "Semua tahap sudah dibuka"}
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outlined" size="xl" icon={<ArrowLeft size={18} />} loading={busy === "prev"} disabled={busy !== null || row.stage <= 0} onClick={() => { void act("prev"); }}>Kembali</Button>
            <Button
              variant="outlined"
              size="xl"
              icon={<ArrowLineRight size={18} />}
              loading={busy === "show_all"}
              disabled={busy !== null || atShowAll}
              onClick={() => { void act("show_all").then((ok) => { if (ok) toast.info("Papan penuh tampil", "Semua peringkat sekarang terlihat penonton."); }); }}
            >
              Tampilkan semua
            </Button>
          </div>
        </div>
      ) : null}
    </Pane>
  );

  // ---- Panel pendukung: setelan sebelum acara ----------------------------------
  const setelan = (
    <Pane as="aside" aria-label="Setelan reveal">
      <PaneHeader>
        <h2 className="min-w-0 flex-1 text-body-medium font-semibold text-on-surface">Setelan reveal</h2>
      </PaneHeader>
      <PaneBody>
        <DetailSection title="Angka selama pengumuman">
          <div className="flex flex-col gap-2">
            {([
              {
                value: true,
                icon: Snowflake,
                title: "Bekukan angka saat reveal dimulai",
                badge: "Disarankan",
                desc: "Angka dan urutan dikunci saat Mulai reveal ditekan. Transaksi baru tetap tercatat, tetapi tidak mengubah layar sampai tahap dikosongkan. Pakai ini kalau booth masih buka: tanpa dibekukan, peringkat 4 bisa melompat ke peringkat 2 setelah tiga besar diumumkan.",
              },
              {
                value: false,
                icon: LockOpen,
                title: "Ikuti data live",
                badge: null,
                desc: "Layar mengikuti transaksi terbaru, jadi urutan bisa berubah di tengah pengumuman. Pakai hanya kalau semua booth sudah tutup.",
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

        <DetailSection title="Susunan tahap">
          <p className="text-body-medium text-on-surface-variant">Setiap tahap adalah rentang peringkat. Bawaan: peringkat 1–3 tampil besar, lalu diganti peringkat 4–10.</p>
          <div className="flex flex-col gap-2">
            {editing.map((item, index) => (
              <fieldset key={index} className="rounded-lg border border-outline-variant p-3">
                <legend className="sr-only">Tahap {index + 1}</legend>
                <label className="block text-body-medium font-medium text-on-surface">
                  Label tahap {index + 1}
                  <input value={item.label} onChange={(event) => ubahTahap(index, { label: event.target.value })} className={INPUT} />
                </label>
                <div className="mt-3 grid grid-cols-[1fr_1fr_1.4fr] gap-2">
                  <label className="block text-body-medium font-medium text-on-surface">
                    Dari
                    <input type="number" min={1} max={50} value={item.from} onChange={(event) => ubahTahap(index, { from: Math.max(1, Math.min(50, Number(event.target.value) || 1)) })} className={cx(INPUT, "tabular-nums")} />
                  </label>
                  <label className="block text-body-medium font-medium text-on-surface">
                    Sampai
                    <input type="number" min={1} max={50} value={item.to} onChange={(event) => ubahTahap(index, { to: Math.max(1, Math.min(50, Number(event.target.value) || 1)) })} className={cx(INPUT, "tabular-nums")} />
                  </label>
                  <label className="block text-body-medium font-medium text-on-surface">
                    Tampilan
                    <select value={item.layout} onChange={(event) => ubahTahap(index, { layout: event.target.value === "spotlight" ? "spotlight" : "list" })} className={INPUT}>
                      <option value="spotlight">Besar</option>
                      <option value="list">Daftar</option>
                    </select>
                  </label>
                </div>
              </fieldset>
            ))}
          </div>
          {celah.length > 0 ? (
            <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
              <WarningCircle size={16} aria-hidden className="mt-0.5 shrink-0 text-warning" />
              Peringkat {celah.join(", ")} tidak masuk tahap mana pun, jadi hanya akan terlihat lewat Tampilkan semua.
            </p>
          ) : null}
        </DetailSection>
      </PaneBody>
      <PaneFooter note={draft ? "Belum disimpan" : "Susunan perlu disimpan, tidak seketika"}>
        <Button variant="text" size="sm" disabled={busy !== null} onClick={() => setDraft(DEFAULT_REVEAL_STAGES)}>Bawaan</Button>
        <Button variant="text" size="sm" disabled={draft === null} onClick={() => setDraft(null)}>Batalkan</Button>
        {/* Outlined, bukan filled: aksi utama halaman ini tombol tahap di panel kendali. */}
        <Button
          variant="outlined"
          size="sm"
          loading={busy === "config" && draft !== null}
          disabled={busy !== null || draft === null}
          onClick={() => { void act("config", { stages: editing }).then((ok) => { if (ok) { setDraft(null); toast.success("Susunan tahap tersimpan"); } }); }}
        >
          Simpan susunan
        </Button>
      </PaneFooter>
    </Pane>
  );

  const dialog: Record<Konfirmasi, { title: string; description: string; aksi: string; jalankan: () => void }> = {
    off: {
      title: "Kembali ke papan penuh?",
      description: "Semua peringkat langsung terlihat penonton dan mengikuti transaksi live. Tahap dan angka yang dibekukan dikosongkan.",
      aksi: "Tampilkan papan penuh",
      jalankan: () => gantiMode("off"),
    },
    reset: {
      title: "Kosongkan tahap?",
      description: `Layar kembali ke tahap 0 dan tidak menampilkan peringkat.${row.frozen_at ? " Angka yang dibekukan dilepas; pembekuan baru diambil saat Mulai reveal ditekan lagi." : ""}`,
      aksi: "Kosongkan tahap",
      jalankan: kosongkan,
    },
    restart: {
      title: "Mulai ulang dari awal?",
      description: row.freeze_on_start
        ? "Angka dibekukan ulang dari data saat ini, dan layar kembali ke tahap 0."
        : "Pembekuan angka dilepas dan layar kembali ke tahap 0. Angka mengikuti data live.",
      aksi: "Mulai ulang",
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
          <Button variant="outlined" onClick={() => setKonfirmasi(null)}>Batal</Button>
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
          Leaderboard sedang disembunyikan di semua layar. Tahap tetap berpindah saat tombol ditekan, tetapi penonton belum
          melihat apa pun. Nyalakan Tampilkan leaderboard di Setelan, bagian Privasi, saat siap. Tahap yang sudah dibuka tidak hilang.
        </Banner>
      ) : null}

      <SupportingPane main={kendali} pane={setelan} paneWidth={420} />
      {aktifDialog}
    </WorkspacePage>
  );
}
