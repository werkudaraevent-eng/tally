"use client";

import {
  ArrowSquareOut, ArrowsClockwise, CaretLeft, Check, Flask, Gift, Power, SkipForward, Sparkle, Stop, Trophy, Warning, X, XCircle,
} from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useCallback, useEffect, useState } from "react";
import { ImagePreview } from "@/components/admin/image-preview";
import { useToast } from "@/components/toast";
import { ANIMATIONS, type UndianPrize, normalizePrize } from "@/lib/undian";
import { cx } from "@/lib/m3/cx";
import {
  Banner, Button, ButtonLink, Dialog, EmptyState, IconButton, MetaSeparator, PageLoading, Pane, PaneBody, PaneHeader,
  StatusChip, StatusDot, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";

// Kontrol undian, dipakai di atas panggung.
//
// Tiga aturan yang membentuk halaman ini:
//
//   1. TOMBOL BEKERJA SEKETIKA, tanpa "Simpan". Operator berdiri di samping MC
//      dan tidak punya kesempatan meninjau lalu menyimpan.
//   2. SASARAN SENTUH BESAR. Ditekan sambil berdiri, kadang di ruangan gelap.
//      Aksi utama tiap keadaan setinggi 64px dan hanya ada satu.
//   3. MENYEGARKAN DIRI setiap 2 detik, sehingga dua orang yang membuka halaman
//      ini (operator dan koordinator) melihat keadaan yang sama.
//
// Nama pemenang di halaman ini muncul pada saat yang SAMA dengan di layar
// panggung, bukan lebih dulu. Ia membaca endpoint publik yang sama, dan endpoint
// itu menahan nama sampai waktu reveal lewat. Memberi operator bocoran lebih awal
// terdengar praktis, tapi cukup satu ekspresi wajah yang salah untuk merusak
// momen yang sedang dibangun.
//
// Susunan: pilih hadiah di kiri, satu panel undi di kanan. Aksi yang membatalkan
// pemenang (undi ulang, tidak hadir) selalu lewat dialog: ketukan tak sengaja di
// atas panggung tidak boleh membatalkan nama siapa pun.

const POLL_MS = 2000;

type Winner = {
  // `id` sengaja opsional: MODE LATIHAN tidak menulis baris `undian_winners`,
  // jadi pemenang latihan tidak punya id. Karena itu `ref` yang dipakai sebagai
  // key React; ia selalu ada, baik pada latihan maupun undian sungguhan.
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
  const [stateFailed, setStateFailed] = useState(false);
  const [prizes, setPrizes] = useState<UndianPrize[]>([]);
  const [prizesLoaded, setPrizesLoaded] = useState(false);
  const [prizesFailed, setPrizesFailed] = useState(false);
  const [winnerCounts, setWinnerCounts] = useState<Record<number, number>>({});
  // Berapa pemenang yang masih menunggu konfirmasi per hadiah. Ini yang
  // menentukan tombol "Undi ulang" muncul: hanya pemenang pending yang dapat
  // dibatalkan, jadi tanpa angka ini panel akan menawarkan tombol yang gagal.
  const [pendingCounts, setPendingCounts] = useState<Record<number, number>>({});
  // Nama sesi aktif. Label "Penuh" tanpa menyebut sesinya terbaca sebagai
  // "hadiah ini habis selamanya".
  const [activeSession, setActiveSession] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Winner | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  // Konfirmasi undi ulang lewat dialog, bukan window.confirm: membatalkan
  // sepuluh pemenang sekaligus tidak boleh terjadi karena satu ketukan tak
  // sengaja di atas panggung.
  const [confirmRedraw, setConfirmRedraw] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState("");
  const toast = useToast();

  const load = useCallback(async () => {
    const response = await fetch("/api/undian/state", { cache: "no-store" }).catch(() => null);
    if (response?.ok) { setState((await response.json()) as State); setStateFailed(false); }
    else setStateFailed(true);
  }, []);

  // Daftar hadiah dimuat terpisah dan TANPA `?pool=1`.
  //
  // Menghitung ukuran kolam memanggil RPC agregat lintas seluruh tabel order per
  // hadiah. Pada halaman yang menyegarkan diri setiap dua detik, itu berarti
  // puluhan query agregat per menit sepanjang acara berlangsung.
  const loadPrizes = useCallback(async () => {
    const response = await fetch("/api/admin/undian/prizes", { cache: "no-store" }).catch(() => null);
    setPrizesLoaded(true);
    if (!response?.ok) { setPrizesFailed(true); return; }
    setPrizesFailed(false);
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
  // ikut polling 2 detik: angka yang melompat 6, 4, 2 terlihat seperti halaman
  // yang tersendat justru pada saat semua orang menatapnya.
  //
  // Dua batasan React Compiler membentuk bentuknya:
  //   * setState sinkron di badan effect ditolak, jadi penyetelan ulang saat
  //     undian berganti dikerjakan saat render lewat perbandingan nilai sebelumnya;
  //   * Date.now() tidak boleh dipanggil saat render, jadi pembacaan jam pertama
  //     ditunda satu tick lewat setTimeout, pola yang sama dengan pemuatan awal
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

  const live = state?.mode === "live";
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
  // Kalimat status mengikuti ANIMASI hadiah yang dipilih. Pada hadiah berjenis
  // panah, panel yang mengatakan "roda berputar" sementara layar menampilkan
  // kertas melayang membuat operator menyimpulkan salah satunya rusak.
  const animasi = ANIMATIONS.find((item) => item.value === activePrize?.animation);
  const gerakManual: Record<string, string> = {
    wheel: "Roda berputar",
    slot: "Gulungan bergulir",
    cards: "Nama berkedip di kartu",
    digits: "Digit berputar",
    dart: "Kertas undian melayang",
    instant: "Layar menunggu",
  };
  // Tombol merah menyebut TINDAKANNYA di layar, bukan "berhenti" yang generik.
  // Pada panah, yang ditunggu ruangan adalah lemparan; pada kartu, pembukaan.
  const labelAkhiri: Record<string, string> = {
    wheel: "Berhenti & tampilkan",
    slot: "Hentikan gulungan",
    cards: "Buka kartu",
    digits: "Kunci angka",
    dart: "Lempar panah",
    instant: "Tampilkan pemenang",
  };
  const tombolAkhiri = labelAkhiri[animasi?.value ?? ""] ?? "Berhenti & tampilkan";
  const kalimatManual = `${gerakManual[animasi?.value ?? ""] ?? "Animasi berjalan"} di layar panggung sampai Anda menekan ${tombolAkhiri}. Pemenang sudah ditentukan dan tersimpan sejak tombol Undi ditekan, jadi menutup halaman ini tidak menghilangkannya.`;
  // Berapa nama yang akan dibatalkan bila "Undi ulang" ditekan.
  const pendingHere = activePrize ? pendingCounts[activePrize.id] ?? 0 : 0;
  // Pada mode latihan kuota tidak berlaku: tidak ada pemenang yang dicatat, jadi
  // tidak ada kuota yang terpakai. Tombol undi harus tetap hidup, termasuk untuk
  // hadiah yang kuotanya kebetulan sudah penuh; justru hadiah itulah yang paling
  // perlu diuji ulang.
  const drawBlocked = quotaFull && !rehearsal;

  const sah = state?.winners.filter((winner) => winner.status === "confirmed").length ?? 0;
  const menunggu = state?.winners.filter((winner) => winner.status === "pending").length ?? 0;

  // ---- Pilih hadiah ---------------------------------------------------------
  const daftarHadiah = (
    <Pane aria-label="Pilih hadiah" className="lg:w-[360px] lg:shrink-0">
      <PaneHeader>
        <h2 className="min-w-0 flex-1 text-body-medium font-semibold">Pilih hadiah</h2>
        {spinning ? <span className="text-body-medium text-on-surface-variant">Terkunci selama mengundi</span> : null}
      </PaneHeader>
      <PaneBody>
        {!prizesLoaded ? <PageLoading /> : prizesFailed ? (
          <EmptyState
            plain
            icon={<Warning size={40} />}
            title="Daftar hadiah gagal dimuat"
            description="Periksa koneksi, lalu coba lagi."
            action={<Button variant="outlined" size="sm" onClick={() => void loadPrizes()}>Coba lagi</Button>}
          />
        ) : prizes.length === 0 ? (
          <EmptyState
            plain
            icon={<Gift size={40} />}
            title="Belum ada hadiah aktif"
            description="Hadiah nonaktif tidak muncul di sini. Tambahkan atau aktifkan hadiah di halaman Hadiah & aturan."
            action={<ButtonLink href="/admin/undian" variant="outlined" size="sm">Buka Hadiah & aturan</ButtonLink>}
          />
        ) : prizes.map((prize) => {
          const used = winnerCounts[prize.id] ?? 0;
          const full = used >= prize.winner_quota;
          const active = state?.prize?.id === prize.id;
          return (
            <button
              key={prize.id}
              type="button"
              aria-pressed={active}
              // Berganti hadiah di tengah animasi akan membuang pemenang yang
              // sudah ditentukan dan belum sempat tampil.
              onClick={() => void send({ action: "select", prize_id: prize.id }, `select-${prize.id}`)}
              disabled={busy !== null || spinning}
              className={cx(
                "flex min-h-16 w-full items-center gap-3 border-b border-outline-variant px-4 py-3 text-left text-body-medium disabled:cursor-not-allowed",
                active ? "bg-secondary-container" : "hover:bg-primary-soft disabled:opacity-60",
              )}
            >
              {prize.image_url
                ? <ImagePreview url={prize.image_url} alt="" className="h-10 w-10 shrink-0" />
                : <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-container-high text-on-surface-variant"><Gift size={18} /></span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{prize.name}</span>
                <span className="block truncate tabular-nums text-on-surface-variant">
                  {used}/{prize.winner_quota} pemenang · {ANIMATIONS.find((item) => item.value === prize.animation)?.label}
                </span>
              </span>
              {/* "Penuh" saja terbaca sebagai "hadiah ini habis selamanya", dan
                  tafsir itulah yang membuat orang membuat hadiah duplikat atau
                  menghapus hasil undian. Kuota dihitung per SESI. */}
              {full ? (
                <StatusChip dot title={activeSession ? `Kuota penuh di sesi "${activeSession.name}". Hadiah yang sama bisa diundi lagi di sesi berikutnya.` : "Kuota penuh"}>
                  {activeSession ? "Penuh di sesi ini" : "Penuh"}
                </StatusChip>
              ) : null}
            </button>
          );
        })}
      </PaneBody>
    </Pane>
  );

  // ---- Panel undi -----------------------------------------------------------
  let isiUndi: React.ReactNode;
  if (!state) {
    isiUndi = stateFailed ? (
      <EmptyState plain icon={<Warning size={40} />} title="Keadaan undian gagal dimuat" description="Halaman mencoba lagi setiap 2 detik. Periksa koneksi bila pesan ini tidak hilang." />
    ) : <PageLoading />;
  } else if (!live) {
    isiUndi = (
      <div className="flex flex-col gap-4 p-6">
        <div>
          <p className="text-body-medium text-on-surface-variant">Layar panggung</p>
          <p className="mt-1 text-headline-small font-semibold">Mati</p>
          <p className="mt-2 text-body-medium text-on-surface-variant">Layar /undian diam. Nyalakan sebelum sesi undian dimulai; setelah itu hadiah bisa dipilih dan diundi.</p>
        </div>
        <Button
          size="xl"
          block
          className="h-16 text-title-medium"
          icon={<Power size={22} />}
          loading={busy === "mode"}
          disabled={busy !== null}
          onClick={() => void send({ action: "mode", mode: "live" }, "mode")}
        >
          Nyalakan layar panggung
        </Button>
      </div>
    );
  } else if (!state.prize) {
    isiUndi = <EmptyState plain icon={<Gift size={40} />} title="Pilih hadiah untuk mulai mengundi" />;
  } else {
    isiUndi = (
      <div className="flex flex-col gap-5 p-6">
        <div>
          <p className="text-body-medium text-on-surface-variant">Sedang diundi</p>
          <p className="mt-1 text-headline-small font-semibold">{state.prize.name}</p>
          <p className="mt-2 text-body-medium tabular-nums text-on-surface-variant">
            {/* Animasi dan mode berhentinya ditulis di sini supaya operator tahu
                apa yang akan terjadi di layar SEBELUM menekan Undi. */}
            {[
              `${quotaUsed}/${state.prize.winner_quota} pemenang`,
              state.pool_size > 0 ? `${state.pool_size} nama di kolam` : null,
              animasi?.label,
              activePrize ? (activePrize.spin_mode === "manual" ? "berhenti manual" : `${activePrize.spin_seconds} detik`) : null,
            ].filter(Boolean).join(" · ")}
          </p>
        </div>

        {/* Pada mode manual tidak ada angka yang bisa dihitung mundur.
            Menampilkan "0.0" di sana akan terbaca sebagai animasi yang macet,
            padahal justru itulah perilaku yang diminta. */}
        {spinning ? (
          <div className="rounded-md bg-accent-soft p-5 text-center" aria-live="polite">
            <p className="text-body-medium font-medium text-primary">Sedang mengundi</p>
            {manualSpin
              ? <p className="mt-2 flex items-center justify-center gap-2 text-title-large font-semibold text-on-surface"><StatusDot tone="success" />Berjalan di layar, menunggu aba-aba</p>
              : <p className="mt-2 text-display-medium font-semibold tabular-nums text-on-surface">{countdown.toFixed(1)}</p>}
            <p className="mt-2 text-body-medium text-on-surface-variant">
              {manualSpin ? kalimatManual : "Pemenang sudah ditentukan dan dirahasiakan sampai animasi berhenti."}
            </p>
          </div>
        ) : null}

        {/* Satu aksi utama per keadaan. Pada mode manual, aksi `reveal` adalah
            satu-satunya cara undian selesai, jadi ia menggantikan tombol Undi
            dengan bobot yang sama. Pada mode durasi tetap ia jalan pintas
            darurat, jadi cukup tombol sekunder di bawah hitung mundur. */}
        {spinning ? (
          manualSpin ? (
            <Button
              variant="danger"
              size="xl"
              block
              className="h-16 text-title-medium"
              icon={<Stop size={22} weight="fill" />}
              loading={busy === "reveal"}
              disabled={busy !== null}
              onClick={() => void send({ action: "reveal" }, "reveal")}
            >
              {tombolAkhiri}
            </Button>
          ) : (
            <Button variant="outlined" icon={<SkipForward size={16} />} loading={busy === "reveal"} disabled={busy !== null} onClick={() => void send({ action: "reveal" }, "reveal")} className="self-start">
              Langsung tampilkan
            </Button>
          )
        ) : drawBlocked ? (
          // Kuota penuh: JALAN KELUAR, bukan kalimat buntu. Jalan keluarnya ada
          // tiga (batalkan pemenang, tutup sesi lalu buka baru, atau hapus
          // hasil), dan tanpa petunjuk di sini operator cenderung memilih yang
          // paling merusak: menghapus hasil, satu-satunya yang membuang bukti
          // serah terima hadiah.
          <div className="rounded-md bg-surface-container-high p-4 text-body-medium">
            <p className="font-medium tabular-nums">
              Kuota penuh{activeSession ? ` di sesi ${activeSession.name}` : ""} ({quotaUsed}/{state.prize.winner_quota})
            </p>
            {pendingHere > 0 ? (
              <>
                <p className="mt-1 text-on-surface-variant">
                  {pendingHere} pemenang belum ditandai hadir. Undi ulang membatalkan {pendingHere} nama itu supaya kuota kembali kosong. Datanya tetap tersimpan dengan alasannya, tidak dihapus.
                </p>
                <Button variant="outlined" className="mt-3" icon={<ArrowsClockwise size={16} />} disabled={busy !== null} onClick={() => setConfirmRedraw(true)}>
                  Undi ulang hadiah ini
                </Button>
              </>
            ) : (
              <p className="mt-1 text-on-surface-variant">
                Semua pemenang sudah ditandai hadir, jadi tidak dapat dibatalkan dari sini karena hadiahnya sudah diserahkan.
                Untuk mengundi hadiah ini lagi, tutup sesi di <Link href="/admin/undian" className="rounded-sm font-medium text-primary hover:underline">Hadiah & aturan</Link> lalu mulai sesi baru. Pemenang lama tetap tercatat.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              size="xl"
              block
              className="h-16 text-title-medium"
              icon={<Sparkle size={22} weight="fill" />}
              loading={busy === "draw"}
              disabled={busy !== null}
              onClick={() => void send({ action: "draw" }, "draw")}
            >
              {rehearsal ? "Undi (latihan)" : "Undi sekarang"}
            </Button>
            {activePrize && activePrize.animation !== "instant" ? (
              <p className="text-body-medium text-on-surface-variant">
                {activePrize.spin_mode === "manual"
                  ? `Setelah ditekan, tombol ini berganti menjadi ${tombolAkhiri} (merah) sampai Anda menghentikannya.`
                  : `Animasi berhenti sendiri setelah ${activePrize.spin_seconds} detik.`}
              </p>
            ) : null}
          </div>
        )}

        {/* Pada mode latihan kuota tidak menghalangi, tapi angkanya tetap perlu
            terlihat supaya operator tahu keadaan sungguhannya. */}
        {quotaFull && rehearsal ? (
          <p className="text-body-medium text-on-surface-variant">Kuota sebenarnya sudah penuh, tetapi mode latihan tidak memakai kuota.</p>
        ) : null}

        <button
          type="button"
          onClick={() => void send({ action: "reset" }, "reset")}
          disabled={busy !== null}
          className="self-start rounded-sm text-body-medium font-medium text-on-surface-variant hover:underline disabled:opacity-50"
        >
          Bersihkan tampilan layar (pemenang tetap tercatat)
        </button>
      </div>
    );
  }

  const panelUndi = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 lg:overflow-y-auto">
      <Pane aria-label="Panel undi" className="shrink-0">{isiUndi}</Pane>

      {state && state.winners.length > 0 ? (
        <Pane aria-label="Pemenang undian ini" className="shrink-0">
          <PaneHeader>
            <h2 className="min-w-0 flex-1 text-body-medium font-semibold">Pemenang undian ini</h2>
            <span className="text-body-medium tabular-nums text-on-surface-variant">{sah} sah · {menunggu} menunggu</span>
          </PaneHeader>
          <ul>
            {/* Key memakai `ref`, BUKAN `id`. `id` kosong pada MODE LATIHAN karena
                undian latihan tidak menulis baris `undian_winners`, dan
                `key={undefined}` diterima React sebagai "tanpa key". `ref` selalu
                ada dan unik per peserta, jadi benar untuk kedua mode. */}
            {state.winners.map((winner) => (
              <li
                key={winner.ref}
                className={cx(
                  "flex flex-wrap items-center gap-3 border-b border-outline-variant px-5 py-3 last:border-b-0",
                  winner.status === "pending" && "bg-warning-soft",
                  winner.status === "rejected" && "text-on-surface-variant",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-title-medium font-semibold">{winner.name}</span>
                    {winner.is_backup ? <StatusChip>Cadangan {winner.slot_order}</StatusChip> : null}
                  </p>
                  <p className="text-body-medium text-on-surface-variant">
                    {[winner.company, winner.seat && `Kursi ${winner.seat}`].filter(Boolean).join(" · ") || "Tanpa perusahaan dan kursi"}
                  </p>
                </div>
                {winner.status === "confirmed" ? <StatusChip dot tone="success">Sah</StatusChip> : null}
                {winner.status === "rejected" ? <StatusChip dot tone="error">Dibatalkan</StatusChip> : null}
                {winner.status === "pending" && winner.id !== undefined ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      variant="outlined"
                      className="text-error"
                      icon={<XCircle size={16} />}
                      disabled={busy !== null}
                      onClick={() => { setRejecting(winner); setRejectReason(""); }}
                    >
                      Tidak hadir
                    </Button>
                    <Button
                      variant="tonal"
                      icon={<Check size={16} weight="bold" />}
                      loading={busy === `confirm-${winner.id}`}
                      disabled={busy !== null}
                      onClick={() => void send({ action: "decide", winner_id: winner.id, status: "confirmed" }, `confirm-${winner.id}`)}
                    >
                      Hadir
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Pane>
      ) : null}

      {state && state.confirmed.length > 0 ? (
        <Pane aria-label="Sudah sah untuk hadiah ini" className="shrink-0">
          <PaneHeader>
            <Trophy size={16} aria-hidden className="text-on-surface-variant" />
            <h2 className="min-w-0 flex-1 text-body-medium font-semibold">Sudah sah untuk hadiah ini</h2>
            <span className="text-body-medium tabular-nums text-on-surface-variant">{state.confirmed.length}</span>
          </PaneHeader>
          <ul className="grid gap-x-6 gap-y-1 px-5 py-3 text-body-medium sm:grid-cols-2">
            {state.confirmed.map((winner) => (
              <li key={winner.ref} className="truncate">
                {winner.name}
                {winner.company ? <span className="text-on-surface-variant">, {winner.company}</span> : null}
              </li>
            ))}
          </ul>
        </Pane>
      ) : null}
    </div>
  );

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        back={
          <Link href="/admin/undian" className="inline-flex items-center gap-1 rounded-sm text-body-medium font-medium text-primary hover:underline">
            <CaretLeft size={14} aria-hidden />Hadiah & aturan
          </Link>
        }
        meta={state ? (
          <>
            <span className="inline-flex items-center gap-1.5"><StatusDot tone={live ? "success" : "neutral"} />Layar panggung {live ? "menyala" : "mati"}</span>
            <MetaSeparator />
            <span className="inline-flex items-center gap-1.5"><StatusDot tone={rehearsal ? "warning" : "neutral"} />Mode latihan {rehearsal ? "aktif" : "mati"}</span>
            <MetaSeparator />
            <span>{activeSession ? `Sesi: ${activeSession.name}` : "Tanpa sesi"}</span>
            <MetaSeparator />
            <span>Diperbarui tiap 2 detik</span>
          </>
        ) : <span>Memuat keadaan undian</span>}
        actions={
          <>
            {/* Latihan terpisah dari saklar layar karena menjawab pertanyaan yang
                berbeda: yang satu menentukan layar menyala atau tidak, yang ini
                menentukan hasilnya dicatat atau tidak. Menggabungkan keduanya
                membuat gladi bersih mustahil dilakukan dengan layar menyala. */}
            <Button
              variant="outlined"
              icon={<Flask size={16} />}
              loading={busy === "rehearsal"}
              disabled={!state || busy !== null || spinning}
              title={rehearsal ? undefined : "Untuk gladi bersih: undian berjalan seperti biasa tetapi hasilnya tidak disimpan."}
              onClick={() => void send({ action: "rehearsal", on: !rehearsal }, "rehearsal")}
            >
              {rehearsal ? "Selesai latihan" : "Mulai latihan"}
            </Button>
            {live ? (
              <Button variant="outlined" icon={<Power size={16} />} loading={busy === "mode"} disabled={busy !== null} onClick={() => void send({ action: "mode", mode: "off" }, "mode")}>
                Matikan layar
              </Button>
            ) : null}
            <ButtonLink href="/undian?fullscreen=1" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Buka layar panggung</ButtonLink>
          </>
        }
      />

      {/* Latihan diberi pita peringatan, bukan hanya titik di baris meta:
          keadaan ini harus terbaca sebagai "sedang tidak normal" sekilas. */}
      {rehearsal ? (
        <Banner tone="warning" icon={<Flask size={18} weight="fill" />} className="shrink-0">
          <span className="font-medium">Mode latihan aktif.</span> Undian berjalan normal di layar, tetapi pemenang tidak dicatat dan kuota tidak terpakai. Matikan sebelum undian sungguhan.
        </Banner>
      ) : null}

      {error ? (
        <Banner tone="error" icon={<Warning size={18} />} className="shrink-0" actions={<IconButton size="sm" label="Tutup pesan" onClick={() => setError("")}><X size={16} /></IconButton>}>{error}</Banner>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
        {daftarHadiah}
        {panelUndi}
      </div>

      <Dialog
        open={confirmRedraw}
        onClose={() => setConfirmRedraw(false)}
        dismissible={busy !== "redraw"}
        tone="danger"
        icon={<ArrowsClockwise size={22} />}
        title={`Undi ulang ${state?.prize?.name ?? "hadiah ini"}?`}
        description={`${pendingHere} pemenang yang belum ditandai hadir dibatalkan dengan alasan "Diundi ulang", jadi kuota kembali kosong. Datanya tetap tersimpan, tidak dihapus. Tampilan layar panggung ikut dibersihkan.`}
        actions={
          <>
            <Button variant="outlined" disabled={busy === "redraw"} onClick={() => setConfirmRedraw(false)}>Batal</Button>
            <Button
              variant="danger"
              loading={busy === "redraw"}
              disabled={busy !== null && busy !== "redraw"}
              onClick={async () => {
                const ok = await send({ action: "redraw", prize_id: state?.prize?.id }, "redraw");
                setConfirmRedraw(false);
                if (ok) toast.info("Kuota dikosongkan", `${pendingHere} pemenang dibatalkan. Hadiah ini bisa diundi lagi.`);
              }}
            >
              Batalkan {pendingHere} pemenang
            </Button>
          </>
        }
      />

      <Dialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        dismissible={busy === null}
        tone="danger"
        title={`Tandai ${rejecting?.name ?? "pemenang"} tidak hadir?`}
        description="Pemenang ini dibatalkan dan keputusannya tidak bisa diubah. Peserta kembali masuk kolam undian berikutnya."
        actions={
          <>
            <Button variant="outlined" disabled={busy !== null} onClick={() => setRejecting(null)}>Batal</Button>
            <Button type="submit" form="form-tidak-hadir" variant="danger" loading={busy === `reject-${rejecting?.id}`} disabled={busy !== null}>Tandai tidak hadir</Button>
          </>
        }
      >
        <form
          id="form-tidak-hadir"
          className="mt-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!rejecting) return;
            const ok = await send({ action: "decide", winner_id: rejecting.id, status: "rejected", reason: rejectReason }, `reject-${rejecting.id}`);
            if (ok) { setRejecting(null); toast.info("Pemenang dibatalkan", "Peserta kembali masuk kolam undian berikutnya."); }
          }}
        >
          <label htmlFor="reject-reason" className="block text-body-medium font-medium">Alasan <span className="font-normal text-on-surface-variant">opsional</span></label>
          <input
            id="reject-reason"
            autoFocus
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Tidak ada di tempat"
            className="mt-1.5 h-9 w-full rounded-md border border-outline bg-surface-container-lowest px-3 text-body-medium text-on-surface outline-none focus:border-primary"
          />
        </form>
      </Dialog>
    </WorkspacePage>
  );
}
