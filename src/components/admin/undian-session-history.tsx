"use client";

import {
  CalendarCheck, CheckCircle, ClockCounterClockwise, DownloadSimple, Play,
  Prohibit, Trash, Trophy, Warning, X,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { WINNER_STATUS_LABEL, normalizeSessionSummary, type UndianSessionSummary } from "@/lib/undian";

// Riwayat hasil undian per sesi, beserta arsip dan hapus permanen.
//
// Dua cara mengakhiri sesi, dan perbedaannya ditulis di layar berkali-kali karena
// hanya satu di antaranya bisa dibatalkan:
//
//   TUTUP  hasil tetap tersimpan dan tetap bisa diekspor; pemenangnya berhenti
//          menghalangi undian sesi berikutnya. Ini yang dipakai hampir selalu.
//   HAPUS  baris pemenang benar-benar dibuang. Hanya super_admin, dan hanya untuk
//          membersihkan sisa gladi bersih.

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

const KIND_LABEL = { draw: "Diundi", confirm: "Hadir", reject: "Dibatalkan" } as const;

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

export function SessionHistory({ isOwner, onChanged }: { isOwner: boolean; onChanged: () => void }) {
  const [sessions, setSessions] = useState<UndianSessionSummary[]>([]);
  // Pemenang yang belum masuk sesi mana pun. Mereka tidak bisa dibebaskan lewat
  // tutup sesi karena tidak ada sesi yang bisa ditutup.
  const [orphanWinners, setOrphanWinners] = useState(0);
  const [adopting, setAdopting] = useState(false);
  // null = seluruh riwayat, termasuk pemenang yang diundi sebelum fitur sesi ada.
  const [selected, setSelected] = useState<number | null>(null);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [recap, setRecap] = useState<Recap[]>([]);
  const [view, setView] = useState<"winners" | "timeline" | "recap">("winners");
  const [loading, setLoading] = useState(false);

  const [newName, setNewName] = useState("");
  const [starting, setStarting] = useState(false);
  const [closeTarget, setCloseTarget] = useState<UndianSessionSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UndianSessionSummary | null>(null);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  async function loadSessions() {
    const response = await fetch("/api/admin/undian/sessions", { cache: "no-store" });
    if (!response.ok) { setError("Riwayat sesi gagal dimuat."); return; }
    const data = await response.json();
    setSessions((data.sessions as Record<string, unknown>[]).map(normalizeSessionSummary));
    setOrphanWinners(data.orphan_winners ?? 0);
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
    await loadResults(selected);
    onChanged();
    toast.success("Hasil lama diarsipkan", `${data.adopted_winners} pemenang kembali bisa ikut undian.`);
  }

  async function loadResults(sessionId: number | null) {
    setLoading(true);
    const query = sessionId === null ? "" : `?session=${sessionId}`;
    const response = await fetch(`/api/admin/undian/results${query}`, { cache: "no-store" });
    setLoading(false);
    if (!response.ok) { setError("Hasil undian gagal dimuat."); return; }
    const data = await response.json();
    setWinners(data.winners ?? []);
    setTimeline(data.timeline ?? []);
    setRecap(data.recap ?? []);
  }

  // setState langsung di badan effect ditolak React Compiler, jadi pemuatan awal
  // ditunda satu tick. Pola yang sama dipakai di seluruh halaman admin.
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadSessions(); void loadResults(null); }, 0);
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
    setNewName("");
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
    await loadResults(selected);
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
    if (selected === removedId) setSelected(null);
    await loadSessions();
    await loadResults(selected === removedId ? null : selected);
    onChanged();
    toast.success("Hasil dihapus permanen", `${data.deleted_winners} baris pemenang terhapus.`);
  }

  function pick(sessionId: number | null) {
    setSelected(sessionId);
    void loadResults(sessionId);
  }

  const active = sessions.find((session) => session.status === "active") ?? null;
  const exportHref = selected === null
    ? "/api/admin/undian/export"
    : `/api/admin/undian/export?session=${selected}`;

  return <div className="mt-6 space-y-6">
    {error && <p className="flex items-start gap-2 border border-[var(--danger)] bg-[#FDECEC] p-4 text-sm text-[var(--danger)]">
      <Warning size={18} className="mt-0.5 shrink-0" /> {error}
    </p>}

    {/* Hasil yang belum bersesi.

        Diletakkan paling atas karena ia adalah keadaan yang MENGHALANGI: selama
        belum diarsipkan, sepuluh orang itu tidak akan pernah kembali masuk kolam,
        dan tidak ada apa pun di layar lain yang menjelaskan mengapa. */}
    {orphanWinners > 0 && <section className="border border-[#E6D3AE] bg-[#FDF6E7] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.15em] text-[#7A5B00]">
            <Warning size={16} /> {orphanWinners} pemenang belum masuk sesi
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-[#7A5B00]">
            Mereka diundi sebelum fitur sesi ada, sehingga tidak ada sesi yang bisa ditutup untuk membebaskannya
            &mdash; selama dibiarkan, mereka terus dianggap &ldquo;sudah pernah menang&rdquo; dan tidak akan pernah ikut undian lagi.
            Arsipkan untuk membungkusnya menjadi satu sesi tertutup: datanya tetap utuh dan tetap bisa diekspor.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void adoptOrphans()}
          disabled={adopting}
          className="flex min-h-12 items-center gap-2 border border-[#7A5B00] bg-[#7A5B00] px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          <CheckCircle size={18} /> {adopting ? "Mengarsipkan..." : "Arsipkan hasil lama"}
        </button>
      </div>
    </section>}

    {/* --- Sesi aktif / mulai sesi --- */}
    <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
      {active ? <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--brand)]">
            <span className="inline-block size-2 animate-pulse rounded-full bg-[var(--brand)]" /> Sesi berjalan
          </p>
          <p className="mt-2 text-xl font-semibold tracking-[-0.02em]">{active.name}</p>
          <p className="mt-1 text-xs tabular-nums text-[var(--ink-muted)]">
            Mulai {clockShort(active.started_at)} · {active.winner_total} pemenang · {active.draw_count} kali undi
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCloseTarget(active)}
          className="flex min-h-12 items-center gap-2 border border-[var(--line)] px-5 text-sm font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]"
        >
          <CheckCircle size={18} /> Tutup sesi
        </button>
      </div> : <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
            <CalendarCheck size={16} /> Mulai sesi baru
          </h2>
          <p className="mt-2 max-w-xl text-xs leading-relaxed text-[var(--ink-muted)]">
            Semua undian setelah ini dikelompokkan ke sesi tersebut, sehingga hasilnya bisa dilihat
            dan diekspor terpisah. Tanpa sesi aktif undian tetap bisa jalan, hasilnya saja yang tidak terkelompok.
          </p>
          {/* Menjawab pertanyaan yang pasti muncul saat sesi kedua: apakah
              hadiahnya perlu dibuat ulang. Jawabannya tidak, dan menuliskannya di
              sini mencegah panitia membuat hadiah duplikat yang lalu mengacaukan
              rekap. */}
          <p className="mt-2 max-w-xl text-xs leading-relaxed text-[var(--ink-muted)]">
            <span className="font-semibold text-[var(--ink)]">Hadiah tidak perlu dibuat ulang.</span> Pakai hadiah yang sama;
            kuota dan daftar pemenangnya dihitung ulang untuk setiap sesi.
          </p>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Gala Dinner"
            className="mt-3 h-11 w-full max-w-sm border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>
        <button
          type="button"
          onClick={() => void startSession()}
          disabled={starting}
          className="flex min-h-12 items-center gap-2 border border-[var(--brand)] bg-[var(--brand)] px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Play size={18} weight="fill" /> {starting ? "Memulai..." : "Mulai sesi"}
        </button>
      </div>}
    </section>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      {/* --- Daftar sesi --- */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Sesi</h2>
        <div className="space-y-px border border-[var(--line)] bg-[var(--line)]">
          <button
            type="button"
            onClick={() => pick(null)}
            className={`flex w-full items-center justify-between gap-2 p-4 text-left ${selected === null ? "bg-[#E8ECFB] ring-2 ring-inset ring-[var(--brand)]" : "bg-[var(--surface)] hover:bg-[#F7F8FC]"}`}
          >
            <span className="text-sm font-semibold">Semua sesi</span>
            <ClockCounterClockwise size={16} className="shrink-0 text-[var(--ink-muted)]" />
          </button>

          {sessions.map((session) => <div
            key={session.id}
            className={`p-4 ${selected === session.id ? "bg-[#E8ECFB] ring-2 ring-inset ring-[var(--brand)]" : "bg-[var(--surface)]"}`}
          >
            <button type="button" onClick={() => pick(session.id)} className="w-full text-left">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{session.name}</span>
                {session.status === "active"
                  ? <span className="border border-[var(--brand)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--brand)]">Berjalan</span>
                  : <span className="border border-[var(--line)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--ink-muted)]">Ditutup</span>}
              </div>
              <p className="mt-1 text-xs tabular-nums text-[var(--ink-muted)]">
                {clockShort(session.started_at)}
                {session.closed_at && ` → ${clockShort(session.closed_at)}`}
              </p>
              <p className="mt-1 text-xs tabular-nums text-[var(--ink-muted)]">
                {session.winner_total} pemenang · {session.winner_confirmed} sah
                {session.winner_pending > 0 && ` · ${session.winner_pending} belum`}
              </p>
            </button>

            <div className="mt-3 flex flex-wrap gap-2">
              {session.status === "active" && <button type="button" onClick={() => setCloseTarget(session)} className="min-h-9 border border-[var(--line)] px-2.5 text-xs font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]">Tutup</button>}
              {/* Hapus permanen hanya tampil untuk pemilik sistem. Server juga
                  menolaknya lewat requireUser(["super_admin"]); menyembunyikan
                  tombol agar klien tidak menemui aksi yang pasti gagal. */}
              {isOwner && <button type="button" onClick={() => { setDeleteTarget(session); setDeletePhrase(""); }} className="flex min-h-9 items-center gap-1 border border-[var(--line)] px-2.5 text-xs font-semibold text-[var(--danger)] hover:border-[var(--danger)]">
                <Trash size={13} /> Hapus
              </button>}
            </div>
          </div>)}

          {sessions.length === 0 && <p className="bg-[var(--surface)] p-6 text-center text-sm text-[var(--ink-muted)]">
            Belum ada sesi. Hasil undian tetap tercatat di &ldquo;Semua sesi&rdquo;.
          </p>}
        </div>
      </section>

      {/* --- Hasil --- */}
      <section className="space-y-px self-start border border-[var(--line)] bg-[var(--line)]">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--surface)] p-5">
          <div className="flex flex-wrap gap-px border border-[var(--line)] bg-[var(--line)]">
            {([
              ["winners", `Pemenang (${winners.length})`],
              ["timeline", `Timeline (${timeline.length})`],
              ["recap", `Rekap (${recap.length})`],
            ] as const).map(([key, label]) => <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`min-h-10 px-4 text-xs font-semibold ${view === key ? "bg-[var(--brand)] text-white" : "bg-[var(--surface)] hover:text-[var(--brand)]"}`}
            >{label}</button>)}
          </div>
          {/* `<a download>`, bukan next/link: ini unduhan berkas. Navigasi sisi
              klien tidak pernah menyimpan berkasnya. */}
          <a
            href={exportHref}
            download
            className="flex min-h-11 items-center gap-2 border border-[var(--ink)] bg-[var(--ink)] px-4 text-xs font-semibold text-white"
          >
            <DownloadSimple size={16} /> Export Excel
          </a>
        </div>

        <div className="bg-[var(--surface)] p-5">
          {loading ? <p className="py-10 text-center text-sm text-[var(--ink-muted)]">Memuat...</p>
            : winners.length === 0 ? <p className="py-10 text-center text-sm text-[var(--ink-muted)]">Belum ada hasil undian.</p>
            : view === "winners" ? <WinnerTable winners={winners} showSession={selected === null} />
            : view === "timeline" ? <TimelineList events={timeline} />
            : <RecapTable recap={recap} />}
        </div>
      </section>
    </div>

    {/* --- Modal tutup sesi --- */}
    {closeTarget && <Modal onClose={() => setCloseTarget(null)} title="Tutup sesi" tone="brand">
      <p className="text-sm leading-relaxed">
        Sesi <span className="font-semibold">{closeTarget.name}</span> akan ditutup.
      </p>
      <ul className="mt-4 space-y-2 border border-[var(--line)] bg-[var(--background)] p-4 text-sm">
        <li className="flex items-start gap-2"><CheckCircle size={16} className="mt-0.5 shrink-0 text-[var(--brand)]" /> Hasil <span className="font-semibold">tetap tersimpan</span> dan tetap bisa diekspor.</li>
        <li className="flex items-start gap-2"><CheckCircle size={16} className="mt-0.5 shrink-0 text-[var(--brand)]" /> {closeTarget.winner_total} pemenang sesi ini <span className="font-semibold">kembali bisa ikut</span> undian berikutnya.</li>
        <li className="flex items-start gap-2"><CheckCircle size={16} className="mt-0.5 shrink-0 text-[var(--brand)]" /> Layar panggung dikembalikan ke keadaan diam.</li>
      </ul>
      {/* Pemenang yang belum dikonfirmasi diperingatkan, bukan diubah otomatis.
          Menandainya sah secara diam-diam akan mencatat hadiah sebagai terserahkan
          padahal orangnya mungkin tidak pernah naik panggung. */}
      {closeTarget.winner_pending > 0 && <p className="mt-4 flex items-start gap-2 border border-[#E6D3AE] bg-[#FDF6E7] p-3 text-xs leading-relaxed text-[#7A5B00]">
        <Warning size={15} className="mt-0.5 shrink-0" />
        <span>
          Masih ada <span className="font-semibold">{closeTarget.winner_pending} pemenang</span> yang belum ditandai hadir.
          Statusnya akan tetap &ldquo;belum dikonfirmasi&rdquo; di laporan. Tutup dialog ini bila ingin menandainya dulu di halaman kontrol.
        </span>
      </p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={() => void closeSession()} disabled={busy} className="flex min-h-12 items-center gap-2 border border-[var(--brand)] bg-[var(--brand)] px-5 text-sm font-semibold text-white disabled:opacity-60">
          <CheckCircle size={18} /> {busy ? "Menutup..." : "Ya, tutup sesi"}
        </button>
        <button type="button" onClick={() => setCloseTarget(null)} disabled={busy} className="min-h-12 border border-[var(--line)] px-5 text-sm font-semibold">Batal</button>
      </div>
    </Modal>}

    {/* --- Modal hapus permanen --- */}
    {deleteTarget && <Modal onClose={() => setDeleteTarget(null)} title="Hapus hasil undian" tone="danger">
      <p className="text-sm leading-relaxed">
        Seluruh hasil sesi <span className="font-semibold">{deleteTarget.name}</span> akan dihapus dari database.
      </p>
      <ul className="mt-4 space-y-2 border border-[var(--danger)] bg-[#FDECEC] p-4 text-sm text-[var(--danger)]">
        <li className="flex items-start gap-2"><Prohibit size={16} className="mt-0.5 shrink-0" /> <span className="font-semibold">{deleteTarget.winner_total} baris pemenang</span> terhapus permanen, termasuk {deleteTarget.winner_confirmed} yang sudah sah.</li>
        <li className="flex items-start gap-2"><Prohibit size={16} className="mt-0.5 shrink-0" /> Tindakan ini <span className="font-semibold">tidak dapat dibatalkan</span>.</li>
        <li className="flex items-start gap-2"><Prohibit size={16} className="mt-0.5 shrink-0" /> Isinya disalin ke audit trail sebelum dihapus.</li>
      </ul>
      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-[var(--ink-muted)]">
        <Warning size={15} className="mt-0.5 shrink-0" />
        Untuk mengakhiri sesi tanpa kehilangan data, gunakan <span className="font-semibold">Tutup sesi</span>.
        Hapus permanen hanya untuk membersihkan sisa gladi bersih.
      </p>
      <label htmlFor="delete-phrase" className="mt-4 block text-sm font-semibold">
        Ketik <span className="font-mono text-[var(--danger)]">{DELETE_PHRASE}</span> untuk konfirmasi
        <input
          id="delete-phrase"
          value={deletePhrase}
          onChange={(event) => setDeletePhrase(event.target.value)}
          placeholder={DELETE_PHRASE}
          className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--danger)]"
        />
      </label>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void deleteSession()}
          disabled={busy || deletePhrase !== DELETE_PHRASE}
          className="flex min-h-12 items-center gap-2 border border-[var(--danger)] bg-[var(--danger)] px-5 text-sm font-semibold text-white disabled:opacity-40"
        >
          <Trash size={18} weight="bold" /> {busy ? "Menghapus..." : "Hapus permanen"}
        </button>
        <button type="button" onClick={() => setDeleteTarget(null)} disabled={busy} className="min-h-12 border border-[var(--line)] px-5 text-sm font-semibold">Batal</button>
      </div>
    </Modal>}
  </div>;
}

/**
 * Dialog konfirmasi.
 *
 * Menutup lewat Esc dan lewat klik latar, dua jalan keluar yang dicari orang
 * secara refleks. Tanpa keduanya, dialog yang terbuka tidak sengaja terasa macet
 * — dan pada dialog berisi tombol hapus, terasa macet mendorong orang menekan
 * tombol apa pun yang terlihat.
 */
function Modal({
  title, tone, children, onClose,
}: {
  title: string; tone: "brand" | "danger"; children: React.ReactNode; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" role="dialog" aria-modal="true" aria-label={title}>
    {/* Latar sebagai tombol tersendiri, bukan onClick pada pembungkus: klik di
        dalam kartu tidak boleh ikut menutup dialog. */}
    <button type="button" onClick={onClose} className="absolute inset-0 cursor-default" aria-label="Tutup dialog" />
    <div className={`relative w-full max-w-lg border-2 bg-[var(--surface)] p-6 ${tone === "danger" ? "border-[var(--danger)]" : "border-[var(--brand)]"}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 className={`text-lg font-semibold tracking-[-0.02em] ${tone === "danger" ? "text-[var(--danger)]" : ""}`}>{title}</h2>
        <button type="button" onClick={onClose} className="flex min-h-9 items-center px-1 text-[var(--ink-muted)] hover:text-[var(--ink)]" aria-label="Tutup"><X size={18} /></button>
      </div>
      {children}
    </div>
  </div>;
}

function WinnerTable({ winners, showSession }: { winners: Winner[]; showSession: boolean }) {
  return <div className="overflow-x-auto">
    <table className="w-full text-left text-sm">
      <thead className="border-b border-[var(--line)] text-xs uppercase tracking-[0.1em] text-[var(--ink-muted)]">
        <tr>
          {showSession && <th scope="col" className="py-3 pr-4 font-semibold">Sesi</th>}
          <th scope="col" className="py-3 pr-4 font-semibold">Hadiah</th>
          <th scope="col" className="py-3 pr-4 font-semibold">Pemenang</th>
          <th scope="col" className="py-3 pr-4 font-semibold">Status</th>
          <th scope="col" className="py-3 font-semibold">Waktu</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--line)]">
        {winners.map((winner) => <tr key={winner.id} className={winner.status === "rejected" ? "opacity-55" : ""}>
          {showSession && <td className="py-3 pr-4 text-xs text-[var(--ink-muted)]">{winner.session_name ?? "(tanpa sesi)"}</td>}
          <td className="py-3 pr-4">
            <span className="text-xs font-semibold">{winner.prize_name}</span>
            <span className="mt-0.5 block text-[11px] tabular-nums text-[var(--ink-muted)]">Undian ke-{winner.draw_round}</span>
          </td>
          <td className="py-3 pr-4">
            <span className="flex flex-wrap items-center gap-1.5 font-semibold">
              {winner.display_name}
              {winner.is_backup && <span className="border border-[var(--line)] px-1 py-0.5 text-[10px] font-semibold uppercase text-[var(--ink-muted)]">Cadangan</span>}
            </span>
            <span className="mt-0.5 block text-[11px] text-[var(--ink-muted)]">
              {[winner.company, winner.seat_label && `Kursi ${winner.seat_label}`].filter(Boolean).join(" · ") || "—"}
            </span>
          </td>
          <td className="py-3 pr-4">
            <span className={`inline-flex px-1.5 py-0.5 text-[11px] font-semibold ${
              winner.status === "confirmed" ? "bg-[#EEF8F0] text-[var(--brand-strong)]"
                : winner.status === "rejected" ? "bg-[#FDECEC] text-[var(--danger)]"
                : "bg-[var(--surface-muted)] text-[var(--ink-muted)]"}`}>
              {WINNER_STATUS_LABEL[winner.status]}
            </span>
            {winner.reject_reason && <span className="mt-0.5 block text-[11px] text-[var(--ink-muted)]">{winner.reject_reason}</span>}
          </td>
          <td className="py-3 text-[11px] tabular-nums text-[var(--ink-muted)]">{clock(winner.drawn_at)}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function TimelineList({ events }: { events: TimelineEvent[] }) {
  return <ol className="space-y-px border border-[var(--line)] bg-[var(--line)]">
    {events.map((event, index) => <li key={index} className="flex gap-3 bg-[var(--surface)] p-3">
      <span className="w-28 shrink-0 text-[11px] tabular-nums text-[var(--ink-muted)]">{clock(event.at)}</span>
      <span className={`h-fit shrink-0 border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
        event.kind === "draw" ? "border-[var(--brand)] text-[var(--brand)]"
          : event.kind === "confirm" ? "border-[#B9DCC5] text-[var(--brand-strong)]"
          : "border-[var(--danger)] text-[var(--danger)]"}`}>
        {KIND_LABEL[event.kind]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold">{event.prize_name}</span>
        <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">{event.detail}</span>
      </span>
      {event.actor && <span className="hidden shrink-0 text-[11px] text-[var(--ink-muted)] sm:block">{event.actor}</span>}
    </li>)}
  </ol>;
}

function RecapTable({ recap }: { recap: Recap[] }) {
  return <div className="overflow-x-auto">
    <table className="w-full text-left text-sm">
      <thead className="border-b border-[var(--line)] text-xs uppercase tracking-[0.1em] text-[var(--ink-muted)]">
        <tr>
          <th scope="col" className="py-3 pr-4 font-semibold">Hadiah</th>
          <th scope="col" className="py-3 pr-4 text-right font-semibold">Diundi</th>
          <th scope="col" className="py-3 pr-4 text-right font-semibold">Total</th>
          <th scope="col" className="py-3 pr-4 text-right font-semibold">Sah</th>
          <th scope="col" className="py-3 pr-4 text-right font-semibold">Belum</th>
          <th scope="col" className="py-3 pr-4 text-right font-semibold">Batal</th>
          <th scope="col" className="py-3 text-right font-semibold">Cadangan</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--line)]">
        {recap.map((row) => <tr key={row.prize_name}>
          <td className="py-3 pr-4 font-semibold">
            <Trophy size={14} className="mr-1.5 inline text-[var(--ink-muted)]" />{row.prize_name}
          </td>
          <td className="py-3 pr-4 text-right tabular-nums">{row.draws}×</td>
          <td className="py-3 pr-4 text-right tabular-nums">{row.total}</td>
          <td className="py-3 pr-4 text-right tabular-nums font-semibold text-[var(--brand-strong)]">{row.confirmed}</td>
          <td className="py-3 pr-4 text-right tabular-nums">{row.pending}</td>
          <td className="py-3 pr-4 text-right tabular-nums text-[var(--danger)]">{row.rejected}</td>
          <td className="py-3 text-right tabular-nums text-[var(--ink-muted)]">{row.backups}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}
