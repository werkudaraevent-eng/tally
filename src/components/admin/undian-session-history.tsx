"use client";

import {
  CheckCircle, ClockCounterClockwise, DownloadSimple, Play, Prohibit, Trash, Trophy, Warning, X,
} from "@phosphor-icons/react";
import { useEffect, useState, type ReactNode } from "react";
import {
  Banner, Button, ButtonLink, Dialog, EmptyCell, EmptyState, IconButton, ListDetail, ListRow, PageLoading, Pane, PaneBody,
  PaneHeader, SegmentedButton, StatusChip, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import { WINNER_STATUS_LABEL, normalizeSessionSummary, type UndianSessionSummary } from "@/lib/undian";
import { INPUT } from "@/components/admin/compact-form";

// Riwayat hasil undian per sesi, beserta arsip dan hapus permanen.
//
// Dua cara mengakhiri sesi, dan perbedaannya ditulis di layar berkali-kali karena
// hanya satu di antaranya bisa dibatalkan:
//
//   TUTUP  hasil tetap tersimpan dan tetap bisa diekspor; pemenangnya berhenti
//          menghalangi undian sesi berikutnya. Ini yang dipakai hampir selalu.
//   HAPUS  baris pemenang benar-benar dibuang. Hanya super_admin, dan hanya untuk
//          membersihkan sisa gladi bersih.
//
// Susunannya list-detail: daftar sesi di kiri, hasil sesi yang dipilih di kanan.

const DELETE_PHRASE = "HAPUS HASIL UNDIAN";

type Winner = {
  id: number;
  session_name: string | null;
  prize_name: string;
  draw_round: number;
  display_name: string;
  company: string | null;
  seat_label: string | null;
  is_backup: boolean;
  slot_order: number;
  status: "pending" | "confirmed" | "rejected";
  reject_reason: string | null;
  drawn_at: string;
  drawn_by_username: string | null;
  decided_at: string | null;
};

type TimelineEvent = { at: string; kind: "draw" | "confirm" | "reject"; prize_name: string; detail: string; actor: string | null };
type Recap = { prize_name: string; draws: number; total: number; confirmed: number; pending: number; rejected: number; backups: number };
type View = "winners" | "timeline" | "recap";

const KIND_LABEL = { draw: "Diundi", confirm: "Hadir", reject: "Dibatalkan" } as const;
const KIND_TONE = { draw: "primary", confirm: "success", reject: "error" } as const;


/**
 * Waktu selalu ditampilkan dalam zona Asia/Jakarta, bukan zona peramban.
 *
 * Panitia membandingkan jam di layar ini dengan jam di berkas export dan dengan
 * rundown acara. Ketiganya harus menyebut jam yang sama, sekalipun laptop yang
 * dipakai kebetulan masih berzona lain.
 */
const clock = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

const clockShort = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** `"all"` = seluruh riwayat, termasuk pemenang yang diundi sebelum fitur sesi ada. `null` = belum ada yang dibuka. */
type Pilihan = number | "all" | null;
const idSesi = (pilihan: Exclude<Pilihan, null>) => (pilihan === "all" ? null : pilihan);

export function SessionHistory({ isOwner, onChanged }: { isOwner: boolean; onChanged: () => void }) {
  const [sessions, setSessions] = useState<UndianSessionSummary[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [sessionsFailed, setSessionsFailed] = useState(false);
  // Pemenang yang belum masuk sesi mana pun. Mereka tidak bisa dibebaskan lewat
  // tutup sesi karena tidak ada sesi yang bisa ditutup.
  const [orphanWinners, setOrphanWinners] = useState(0);
  const [adopting, setAdopting] = useState(false);
  const [selected, setSelected] = useState<Pilihan>(null);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [recap, setRecap] = useState<Recap[]>([]);
  const [view, setView] = useState<View>("winners");
  const [loading, setLoading] = useState(false);
  const [resultsFailed, setResultsFailed] = useState(false);

  const [startOpen, setStartOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [starting, setStarting] = useState(false);
  const [closeTarget, setCloseTarget] = useState<UndianSessionSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UndianSessionSummary | null>(null);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  async function loadSessions() {
    const response = await fetch("/api/admin/undian/sessions", { cache: "no-store" }).catch(() => null);
    setSessionsLoaded(true);
    if (!response?.ok) { setSessionsFailed(true); setError("Riwayat sesi gagal dimuat."); return; }
    setSessionsFailed(false);
    const data = await response.json();
    setSessions((data.sessions as Record<string, unknown>[]).map(normalizeSessionSummary));
    setOrphanWinners(data.orphan_winners ?? 0);
  }

  async function loadResults(sessionId: number | null) {
    setLoading(true); setResultsFailed(false);
    const query = sessionId === null ? "" : `?session=${sessionId}`;
    const response = await fetch(`/api/admin/undian/results${query}`, { cache: "no-store" }).catch(() => null);
    setLoading(false);
    if (!response?.ok) { setResultsFailed(true); return; }
    const data = await response.json();
    setWinners(data.winners ?? []);
    setTimeline(data.timeline ?? []);
    setRecap(data.recap ?? []);
  }

  async function reloadOpenResults(pilihan: Pilihan = selected) {
    if (pilihan !== null) await loadResults(idSesi(pilihan));
  }

  /**
   * Bungkus hasil lama ke dalam satu sesi tertutup.
   *
   * Setelah ini tidak ada lagi keadaan khusus: hasil lama menjadi sesi tertutup
   * biasa yang tetap tampil di riwayat dan tetap bisa diekspor, dan pemenangnya
   * kembali bisa ikut undian berikutnya.
   */
  async function adoptOrphans() {
    setAdopting(true); setError("");
    const response = await fetch("/api/admin/undian/sessions/adopt", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setAdopting(false);
    if (!response.ok) {
      const failure = data?.error?.message ?? "Hasil lama gagal diarsipkan.";
      setError(failure); toast.error("Gagal mengarsipkan", failure); return;
    }
    await loadSessions();
    await reloadOpenResults();
    onChanged();
    toast.success("Hasil lama diarsipkan", `${data.adopted_winners} pemenang kembali bisa ikut undian.`);
  }

  // setState langsung di badan effect ditolak React Compiler, jadi pemuatan awal
  // ditunda satu tick. Pola yang sama dipakai di seluruh halaman admin.
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadSessions(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function startSession() {
    if (!newName.trim()) { setError("Nama sesi wajib diisi."); return; }
    setStarting(true); setError("");
    const response = await fetch("/api/admin/undian/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    const data = await response.json().catch(() => ({}));
    setStarting(false);
    if (!response.ok) {
      const failure = data?.error?.details?.message ?? data?.error?.message ?? "Sesi gagal dimulai.";
      setError(failure); toast.error("Sesi gagal dimulai", failure); return;
    }
    setNewName(""); setStartOpen(false);
    await loadSessions();
    onChanged();
    toast.success("Sesi dimulai", "Semua undian setelah ini masuk ke sesi tersebut.");
  }

  async function closeSession() {
    if (!closeTarget) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/admin/undian/sessions/${closeTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close" }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      const failure = data?.error?.message ?? "Sesi gagal ditutup.";
      setError(failure); toast.error("Sesi gagal ditutup", failure); return;
    }
    setCloseTarget(null);
    await loadSessions();
    await reloadOpenResults();
    onChanged();
    toast.success("Sesi ditutup", "Hasil tetap tersimpan. Peserta kembali bisa ikut undian berikutnya.");
  }

  async function deleteSession() {
    if (!deleteTarget) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/admin/undian/sessions/${deleteTarget.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: deletePhrase }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      const failure = data?.error?.message ?? "Sesi gagal dihapus.";
      setError(failure); toast.error("Sesi gagal dihapus", failure); return;
    }
    const removedId = deleteTarget.id;
    setDeleteTarget(null); setDeletePhrase("");
    const next: Pilihan = selected === removedId ? null : selected;
    setSelected(next);
    await loadSessions();
    await reloadOpenResults(next);
    onChanged();
    toast.success("Hasil dihapus permanen", `${data.deleted_winners} baris pemenang terhapus.`);
  }

  function pick(pilihan: Exclude<Pilihan, null>) {
    if (selected === pilihan) { setSelected(null); return; }
    setSelected(pilihan);
    void loadResults(idSesi(pilihan));
  }

  const active = sessions.find((session) => session.status === "active") ?? null;
  const terpilih = typeof selected === "number" ? sessions.find((session) => session.id === selected) ?? null : null;
  const exportHref = selected === null || selected === "all"
    ? "/api/admin/undian/export"
    : `/api/admin/undian/export?session=${selected}`;

  const list = (
    <Pane aria-label="Sesi undian">
      <PaneHeader>
        <h2 className="min-w-0 flex-1 text-body-medium font-semibold">Sesi</h2>
        {!active && sessionsLoaded && !sessionsFailed ? (
          <Button variant="outlined" size="sm" icon={<Play size={16} />} onClick={() => { setStartOpen(true); setError(""); }}>Mulai sesi</Button>
        ) : null}
      </PaneHeader>
      <PaneBody>
        {!sessionsLoaded ? <PageLoading /> : sessionsFailed ? (
          <EmptyState
            plain
            icon={<Warning size={40} />}
            title="Riwayat sesi gagal dimuat"
            description="Periksa koneksi, lalu coba lagi."
            action={<Button variant="outlined" size="sm" onClick={() => void loadSessions()}>Coba lagi</Button>}
          />
        ) : (
          <>
            {active ? (
              <div className="flex flex-wrap items-center gap-3 border-b border-outline-variant px-4 py-3">
                <div className="min-w-0 flex-1 text-body-medium">
                  <p className="flex items-center gap-2 font-medium"><span aria-hidden className="size-2 shrink-0 rounded-full bg-success" />Sesi berjalan: {active.name}</p>
                  <p className="tabular-nums text-on-surface-variant">
                    Mulai {clockShort(active.started_at)} · {active.winner_total} pemenang · {active.draw_count} kali undi
                  </p>
                </div>
                <Button variant="outlined" size="sm" icon={<CheckCircle size={16} />} onClick={() => setCloseTarget(active)}>Tutup sesi</Button>
              </div>
            ) : (
              <p className="border-b border-outline-variant px-4 py-3 text-body-medium text-on-surface-variant">
                Belum ada sesi berjalan. Undian tetap bisa jalan, hasilnya saja yang tidak terkelompok.
              </p>
            )}

            <ListRow selected={selected === "all"} onSelect={() => pick("all")}>
              <ClockCounterClockwise size={16} aria-hidden className="shrink-0 text-on-surface-variant" />
              <span className="min-w-0 flex-1 font-medium">Semua sesi</span>
              <span className="text-on-surface-variant">Termasuk hasil tanpa sesi</span>
            </ListRow>
            {sessions.map((session) => (
              <ListRow key={session.id} selected={selected === session.id} onSelect={() => pick(session.id)}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{session.name}</span>
                    {session.status === "active" ? <StatusChip dot tone="success">Berjalan</StatusChip> : <StatusChip>Ditutup</StatusChip>}
                  </span>
                  <span className="block tabular-nums text-on-surface-variant">
                    {clockShort(session.started_at)}{session.closed_at ? ` – ${clockShort(session.closed_at)}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right tabular-nums text-on-surface-variant">
                  <span className="block text-on-surface">{session.winner_total} pemenang</span>
                  {session.winner_confirmed} sah{session.winner_pending > 0 ? `, ${session.winner_pending} belum` : ""}
                </span>
              </ListRow>
            ))}
            {sessions.length === 0 ? (
              <p className="px-4 py-4 text-body-medium text-on-surface-variant">Belum ada sesi. Hasil undian tetap tercatat di Semua sesi.</p>
            ) : null}
          </>
        )}
      </PaneBody>
    </Pane>
  );

  const detail = selected !== null ? (
    <Pane as="aside" aria-label={terpilih ? `Hasil ${terpilih.name}` : "Hasil semua sesi"}>
      <div className="flex shrink-0 flex-col gap-3 border-b border-outline-variant px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-title-medium font-semibold">{terpilih ? terpilih.name : "Semua sesi"}</h2>
            <p className="text-body-medium tabular-nums text-on-surface-variant">
              {terpilih
                ? `${clockShort(terpilih.started_at)}${terpilih.closed_at ? ` – ${clockShort(terpilih.closed_at)}` : ", masih berjalan"}`
                : "Seluruh riwayat, termasuk pemenang sebelum fitur sesi ada."}
            </p>
          </div>
          <IconButton size="sm" label="Tutup hasil" onClick={() => setSelected(null)}><X size={16} /></IconButton>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedButton<View>
            label="Tampilan hasil"
            value={view}
            onChange={setView}
            options={[
              { value: "winners", label: "Pemenang", badge: winners.length },
              { value: "timeline", label: "Timeline", badge: timeline.length },
              { value: "recap", label: "Rekap", badge: recap.length },
            ]}
          />
          <span className="flex-1" />
          {/* `native`: ini unduhan berkas. Navigasi sisi klien tidak pernah
              menyimpan berkasnya. */}
          <ButtonLink native variant="outlined" size="sm" href={exportHref} icon={<DownloadSimple size={16} />}>Ekspor Excel</ButtonLink>
        </div>
        {terpilih && (terpilih.status === "active" || isOwner) ? (
          <div className="flex flex-wrap gap-2">
            {terpilih.status === "active" ? <Button variant="outlined" size="sm" icon={<CheckCircle size={16} />} onClick={() => setCloseTarget(terpilih)}>Tutup sesi</Button> : null}
            {/* Hapus permanen hanya tampil untuk pemilik sistem. Server juga
                menolaknya lewat requireUser(["super_admin"]); tombolnya
                disembunyikan agar klien tidak menemui aksi yang pasti gagal. */}
            {isOwner ? <Button variant="text" size="sm" className="text-error" icon={<Trash size={16} />} onClick={() => { setDeleteTarget(terpilih); setDeletePhrase(""); }}>Hapus hasil sesi</Button> : null}
          </div>
        ) : null}
      </div>
      <PaneBody className="overflow-x-auto">
        {loading ? <PageLoading /> : resultsFailed ? (
          <EmptyState
            plain
            icon={<Warning size={40} />}
            title="Hasil undian gagal dimuat"
            description="Periksa koneksi, lalu coba lagi."
            action={<Button variant="outlined" size="sm" onClick={() => void reloadOpenResults()}>Coba lagi</Button>}
          />
        ) : winners.length === 0 ? (
          <EmptyState plain icon={<Trophy size={40} />} title="Belum ada hasil undian" description="Hasil muncul di sini setelah hadiah diundi dari panel operator." />
        ) : view === "winners" ? <WinnerTable winners={winners} showSession={selected === "all"} />
          : view === "timeline" ? <TimelineList events={timeline} />
            : <RecapTable recap={recap} />}
      </PaneBody>
    </Pane>
  ) : null;

  return (
    <>
      {/* Hasil yang belum bersesi.

          Diletakkan paling atas karena ia adalah keadaan yang MENGHALANGI: selama
          belum diarsipkan, orang-orang itu tidak akan pernah kembali masuk kolam,
          dan tidak ada apa pun di layar lain yang menjelaskan mengapa. */}
      {orphanWinners > 0 ? (
        <Banner
          tone="warning"
          icon={<Warning size={18} />}
          className="shrink-0"
          actions={<Button variant="outlined" size="sm" loading={adopting} onClick={() => void adoptOrphans()}>Arsipkan hasil lama</Button>}
        >
          <span className="font-medium">{orphanWinners} pemenang belum masuk sesi.</span>{" "}
          Mereka diundi sebelum fitur sesi ada, jadi tidak ada sesi yang bisa ditutup untuk membebaskannya. Selama dibiarkan, mereka terus dianggap sudah pernah menang.
          Arsipkan untuk membungkusnya menjadi satu sesi tertutup; datanya tetap utuh dan tetap bisa diekspor.
        </Banner>
      ) : null}
      {error && !startOpen ? <Banner tone="error" icon={<Warning size={18} />} className="shrink-0">{error}</Banner> : null}

      <ListDetail list={list} detail={detail} detailWidth={720} />

      {/* --- Mulai sesi --- */}
      <Dialog
        open={startOpen}
        onClose={() => setStartOpen(false)}
        dismissible={!starting}
        title="Mulai sesi baru"
        description="Semua undian setelah ini dikelompokkan ke sesi tersebut, sehingga hasilnya bisa dilihat dan diekspor terpisah."
        actions={
          <>
            <Button variant="outlined" disabled={starting} onClick={() => setStartOpen(false)}>Batal</Button>
            <Button type="submit" form="form-sesi" loading={starting} disabled={!newName.trim()} icon={<Play size={16} />}>Mulai sesi</Button>
          </>
        }
      >
        <form id="form-sesi" onSubmit={(event) => { event.preventDefault(); void startSession(); }} className="mt-4 flex flex-col gap-3 text-body-medium">
          {error ? <p role="alert" className="flex items-start gap-2 rounded-md bg-error-soft p-3 text-error"><Warning size={16} className="mt-0.5 shrink-0" />{error}</p> : null}
          <div>
            <label htmlFor="session-name" className="block font-medium">Nama sesi</label>
            <input id="session-name" autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Gala dinner" className={INPUT} />
          </div>
          {/* Menjawab pertanyaan yang pasti muncul saat sesi kedua: apakah hadiahnya
              perlu dibuat ulang. Jawabannya tidak, dan menuliskannya di sini
              mencegah panitia membuat hadiah duplikat yang lalu mengacaukan rekap. */}
          <p className="text-on-surface-variant">
            <span className="font-medium text-on-surface">Hadiah tidak perlu dibuat ulang.</span> Pakai hadiah yang sama; kuota dan daftar pemenangnya dihitung ulang untuk setiap sesi.
          </p>
        </form>
      </Dialog>

      {/* --- Tutup sesi --- */}
      <Dialog
        open={closeTarget !== null}
        onClose={() => setCloseTarget(null)}
        dismissible={!busy}
        title={`Tutup sesi ${closeTarget?.name ?? ""}?`}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setCloseTarget(null)}>Batal</Button>
            <Button loading={busy} icon={<CheckCircle size={16} />} onClick={() => void closeSession()}>Tutup sesi</Button>
          </>
        }
      >
        <ul className="mt-4 space-y-2 text-body-medium">
          <Butir icon={<CheckCircle size={16} className="text-success" />}>Hasil tetap tersimpan dan tetap bisa diekspor.</Butir>
          <Butir icon={<CheckCircle size={16} className="text-success" />}>{closeTarget?.winner_total ?? 0} pemenang sesi ini kembali bisa ikut undian berikutnya.</Butir>
          <Butir icon={<CheckCircle size={16} className="text-success" />}>Layar panggung dimatikan dan kembali diam.</Butir>
        </ul>
        {/* Pemenang yang belum dikonfirmasi diperingatkan, bukan diubah otomatis.
            Menandainya sah secara diam-diam akan mencatat hadiah sebagai terserahkan
            padahal orangnya mungkin tidak pernah naik panggung. */}
        {closeTarget && closeTarget.winner_pending > 0 ? (
          <p className="mt-4 flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
            <Warning size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            <span>
              Masih ada <span className="font-medium">{closeTarget.winner_pending} pemenang</span> yang belum ditandai hadir. Statusnya tetap belum dikonfirmasi di laporan.
              Batalkan dialog ini bila ingin menandainya dulu di panel operator.
            </span>
          </p>
        ) : null}
      </Dialog>

      {/* --- Hapus permanen --- */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        dismissible={!busy}
        tone="danger"
        size="md"
        title="Hapus hasil undian"
        description={<>Seluruh hasil sesi <span className="font-medium text-on-surface">{deleteTarget?.name}</span> dihapus dari basis data.</>}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setDeleteTarget(null)}>Batal</Button>
            <Button variant="danger" loading={busy} disabled={deletePhrase !== DELETE_PHRASE} icon={<Trash size={16} />} onClick={() => void deleteSession()}>Hapus permanen</Button>
          </>
        }
      >
        <ul className="mt-4 space-y-2 rounded-md bg-error-soft p-3 text-body-medium text-error">
          <Butir icon={<Prohibit size={16} />}>{deleteTarget?.winner_total ?? 0} baris pemenang terhapus permanen, termasuk {deleteTarget?.winner_confirmed ?? 0} yang sudah sah.</Butir>
          <Butir icon={<Prohibit size={16} />}>Tindakan ini tidak dapat dibatalkan.</Butir>
          <Butir icon={<Prohibit size={16} />}>Isinya disalin ke jejak audit sebelum dihapus.</Butir>
        </ul>
        <p className="mt-4 text-body-medium text-on-surface-variant">
          Untuk mengakhiri sesi tanpa kehilangan data, pakai <span className="font-medium text-on-surface">Tutup sesi</span>. Hapus permanen hanya untuk membersihkan sisa gladi bersih.
        </p>
        <label htmlFor="delete-phrase" className="mt-4 block text-body-medium font-medium">
          Ketik <span className="text-error">{DELETE_PHRASE}</span> untuk konfirmasi
        </label>
        <input
          id="delete-phrase"
          value={deletePhrase}
          onChange={(event) => setDeletePhrase(event.target.value)}
          placeholder={DELETE_PHRASE}
          autoComplete="off"
          className={INPUT}
        />
      </Dialog>
    </>
  );
}

function Butir({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <li className="flex items-start gap-2"><span className="mt-0.5 shrink-0" aria-hidden>{icon}</span><span>{children}</span></li>;
}

function WinnerTable({ winners, showSession }: { winners: Winner[]; showSession: boolean }) {
  return <Table density="flush" minWidth="640px">
    <TableHead>
      <TableRow>
        {showSession && <TableHeaderCell>Sesi</TableHeaderCell>}
        <TableHeaderCell>Hadiah</TableHeaderCell>
        <TableHeaderCell>Pemenang</TableHeaderCell>
        <TableHeaderCell>Status</TableHeaderCell>
        <TableHeaderCell>Waktu</TableHeaderCell>
      </TableRow>
    </TableHead>
    <TableBody>
      {/* `muted` untuk pemenang yang ditolak: barisnya tetap terbaca (panitia
          masih perlu tahu siapa yang ditolak dan alasannya), tetapi ia tidak lagi
          menuntut perhatian yang sama dengan pemenang yang berlaku. */}
      {winners.map((winner) => <TableRow key={winner.id} muted={winner.status === "rejected"}>
        {showSession && <TableCell className="text-on-surface-variant">{winner.session_name ?? "Tanpa sesi"}</TableCell>}
        <TableCell>
          <span className="font-medium">{winner.prize_name}</span>
          <span className="block tabular-nums text-on-surface-variant">Undian ke-{winner.draw_round}</span>
        </TableCell>
        <TableCell>
          <span className="flex flex-wrap items-center gap-1.5 font-medium">
            {winner.display_name}
            {winner.is_backup && <StatusChip>Cadangan</StatusChip>}
          </span>
          <span className="block text-on-surface-variant">
            {[winner.company, winner.seat_label && `Kursi ${winner.seat_label}`].filter(Boolean).join(" · ") || <EmptyCell />}
          </span>
        </TableCell>
        <TableCell>
          <StatusChip dot tone={winner.status === "confirmed" ? "success" : winner.status === "rejected" ? "error" : "warning"}>
            {WINNER_STATUS_LABEL[winner.status]}
          </StatusChip>
          {winner.reject_reason && <span className="mt-0.5 block text-on-surface-variant">{winner.reject_reason}</span>}
        </TableCell>
        <TableCell className="tabular-nums text-on-surface-variant">{clock(winner.drawn_at)}</TableCell>
      </TableRow>)}
    </TableBody>
  </Table>;
}

function TimelineList({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <p className="px-5 py-4 text-body-medium text-on-surface-variant">Belum ada kejadian.</p>;
  return <ol>
    {events.map((event, index) => <li key={index} className="flex gap-3 border-b border-outline-variant px-5 py-2.5 text-body-medium">
      <span className="w-32 shrink-0 tabular-nums text-on-surface-variant">{clock(event.at)}</span>
      <span className="w-24 shrink-0"><StatusChip dot tone={KIND_TONE[event.kind]}>{KIND_LABEL[event.kind]}</StatusChip></span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{event.prize_name}</span>
        <span className="block text-on-surface-variant">{event.detail}</span>
      </span>
      {event.actor && <span className="hidden shrink-0 text-on-surface-variant sm:block">{event.actor}</span>}
    </li>)}
  </ol>;
}

function RecapTable({ recap }: { recap: Recap[] }) {
  return <Table density="flush" minWidth="560px">
    <TableHead>
      <TableRow>
        <TableHeaderCell>Hadiah</TableHeaderCell>
        <TableHeaderCell align="end">Diundi</TableHeaderCell>
        <TableHeaderCell align="end">Total</TableHeaderCell>
        <TableHeaderCell align="end">Sah</TableHeaderCell>
        <TableHeaderCell align="end">Belum</TableHeaderCell>
        <TableHeaderCell align="end">Batal</TableHeaderCell>
        <TableHeaderCell align="end">Cadangan</TableHeaderCell>
      </TableRow>
    </TableHead>
    <TableBody>
      {recap.map((row) => <TableRow key={row.prize_name}>
        <TableCell className="font-medium">{row.prize_name}</TableCell>
        <TableCell className="text-right tabular-nums">{row.draws}×</TableCell>
        <TableCell className="text-right tabular-nums">{row.total}</TableCell>
        <TableCell className="text-right font-medium tabular-nums">{row.confirmed}</TableCell>
        <TableCell className="text-right tabular-nums">{row.pending}</TableCell>
        <TableCell className="text-right tabular-nums text-error">{row.rejected}</TableCell>
        <TableCell className="text-right tabular-nums text-on-surface-variant">{row.backups}</TableCell>
      </TableRow>)}
    </TableBody>
  </Table>;
}
