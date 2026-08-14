"use client";

import { ArrowLeft, Check, Hourglass, Link as LinkIcon, X } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { formatEventDateTime } from "@/lib/datetime";
import { eventApiPath } from "@/lib/event-url";
import { useEventTimeZone } from "@/lib/use-event-timezone";

type Row = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string | null;
  job_title: string | null;
  extra: Record<string, string>;
  status: "pending" | "approved" | "rejected";
  reject_reason: string | null;
  created_at: string;
  participant_id: string | null;
  qr_code: string | null;
};

type EventConfig = {
  registration_enabled: boolean;
  registration_auto_approve: boolean;
  participant_source: string;
  slug: string;
};

const TABS = [
  { key: "pending", label: "Menunggu" },
  { key: "approved", label: "Disetujui" },
  { key: "rejected", label: "Ditolak" },
] as const;

export default function RegistrasiAdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [config, setConfig] = useState<EventConfig | null>(null);
  const [pending, setPending] = useState(0);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pending");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menolak, setMenolak] = useState<Row | null>(null);
  const { zone, abbr } = useEventTimeZone();
  const toast = useToast();

  const load = useCallback(async () => {
    // eventApiPath WAJIB di ketiga pemanggilan. `/api/...` absolut hanya membawa
    // slug lewat Referer, dan parameter yang ditambahkan proxy saat rewrite tidak
    // pernah sampai ke route handler -- permintaannya jatuh ke "event aktif
    // tunggal", yaitu event PRODUKSI, bukan event yang sedang dibuka.
    const response = await fetch(eventApiPath(`/api/admin/registrasi?status=${tab}`), { cache: "no-store" }).catch(() => null);
    if (!response) { setError("Koneksi gagal. Muat ulang halaman."); setLoading(false); return; }
    if (response.status === 401) { window.location.href = "/login"; return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error?.details?.message ?? body.error?.message ?? "Daftar pendaftaran gagal dimuat.");
    else { setRows(body.registrations ?? []); setConfig(body.event); setPending(body.pending ?? 0); setError(""); }
    setLoading(false);
  }, [tab]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function simpanKonfigurasi(next: Partial<EventConfig>) {
    if (!config) return;
    setBusy(true);
    const response = await fetch(eventApiPath("/api/admin/registrasi"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        registration_enabled: next.registration_enabled ?? config.registration_enabled,
        registration_auto_approve: next.registration_auto_approve ?? config.registration_auto_approve,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!response) { toast.error("Koneksi gagal", "Muat ulang untuk melihat status sebenarnya."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Gagal disimpan", body.error?.details?.message ?? body.error?.message ?? "Coba lagi.");
      return;
    }
    setConfig({ ...config, ...body });
    toast.success("Tersimpan", body.registration_enabled ? "Pendaftaran dibuka." : "Pendaftaran ditutup.");
  }

  async function review(row: Row, approve: boolean, reason?: string) {
    setBusy(true);
    const response = await fetch(eventApiPath("/api/admin/registrasi"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, approve, reason: reason ?? null }),
    }).catch(() => null);
    setBusy(false);
    if (!response) { toast.error("Koneksi gagal", "Muat ulang untuk melihat status sebenarnya."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Gagal diproses", body.error?.details?.message ?? body.error?.message ?? "Coba lagi.");
      // Muat ulang: "sudah diproses admin lain" berarti daftar di layar sudah
      // basi, dan membiarkannya membuat admin menekan tombol yang sama lagi.
      void load();
      return;
    }
    setMenolak(null);
    setRows((current) => current.filter((entry) => entry.id !== row.id));
    setPending((count) => Math.max(0, count - 1));
    toast.success(
      approve ? `${row.name} disetujui` : `${row.name} ditolak`,
      approve ? `Kode peserta: ${body.qr_code}` : "Pendaftar tidak dibuatkan kode peserta.",
    );
  }

  const tautan = config ? `/e/${config.slug}/daftar` : "";

  return <main className="min-h-dvh bg-[var(--background)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:py-10">
    <div className="mx-auto max-w-[1200px]">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand)]"><ArrowLeft size={18} /> Kembali ke Dashboard</Link>
      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Registrasi publik</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Pendaftaran.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">Peserta mendaftar sendiri lewat tautan publik. Yang disetujui langsung mendapat kode peserta dan bisa discan booth.</p>
      </div>

      {config && <section className="mt-8 border border-[var(--line)] bg-[var(--surface)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <h2 className="font-semibold">Status pendaftaran</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              {config.registration_enabled
                ? "Terbuka. Siapa pun yang punya tautan bisa mendaftar."
                : "Tertutup. Halaman pendaftaran menolak semua pengiriman."}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void simpanKonfigurasi({ registration_enabled: !config.registration_enabled })}
            className={`min-h-11 border px-4 text-sm font-semibold disabled:opacity-50 ${config.registration_enabled ? "border-[var(--danger)]/40 text-[var(--danger)]" : "border-transparent bg-[var(--brand)] text-white"}`}
          >{config.registration_enabled ? "Tutup pendaftaran" : "Buka pendaftaran"}</button>
        </div>

        {config.registration_enabled && <>
          <label className="mt-6 flex items-start gap-3 border-t border-[var(--line)] pt-5 text-sm">
            <input
              type="checkbox"
              checked={config.registration_auto_approve}
              disabled={busy}
              onChange={(e) => void simpanKonfigurasi({ registration_auto_approve: e.target.checked })}
              className="mt-1 size-5 shrink-0"
            />
            <span>
              <strong className="font-semibold">Setujui otomatis</strong>
              {/* Akibatnya ditulis, bukan sekadar nama setelannya. Dicentang
                  tanpa membaca, panitia baru sadar ada 40 peserta asing di
                  leaderboard saat acara sudah berjalan. */}
              <span className="mt-1 block text-[var(--ink-muted)]">Pendaftar langsung jadi peserta dan kode terbit seketika, tanpa diperiksa siapa pun. Tanpa ini, setiap pendaftaran menunggu persetujuan di daftar bawah.</span>
            </span>
          </label>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-5">
            <LinkIcon size={18} className="text-[var(--ink-muted)]" />
            <code className="select-all text-sm">{tautan}</code>
            <button
              type="button"
              onClick={() => { void navigator.clipboard.writeText(new URL(tautan, window.location.origin).toString()); toast.success("Tautan disalin", "Sebarkan ke calon peserta."); }}
              className="min-h-11 border border-[var(--line)] px-3 text-sm font-semibold"
            >Salin tautan</button>
          </div>
        </>}
      </section>}

      {error && <p role="alert" className="mt-6 border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-4 text-sm font-medium text-[var(--danger)]">{error}</p>}

      <div className="mt-8 flex flex-wrap gap-2">
        {TABS.map((entry) => <button
          key={entry.key}
          type="button"
          onClick={() => { setTab(entry.key); setLoading(true); }}
          className={`min-h-11 border px-4 text-sm font-semibold ${tab === entry.key ? "border-[var(--brand)] text-[var(--brand)]" : "border-[var(--line)]"}`}
        >{entry.label}{entry.key === "pending" && pending > 0 ? ` (${pending})` : ""}</button>)}
      </div>

      {loading ? <p className="py-16 text-sm text-[var(--ink-muted)]">Memuat…</p>
        : rows.length === 0 ? <section className="py-20 text-center">
            <Hourglass size={44} className="mx-auto text-[var(--ink-muted)]" />
            <p className="mt-4 text-sm text-[var(--ink-muted)]">Belum ada pendaftaran pada status ini.</p>
          </section>
        : <section className="mt-6 grid gap-px border border-[var(--line)] bg-[var(--line)]">
            {rows.map((row) => <article key={row.id} className="bg-[var(--surface)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold tracking-[-0.02em]">{row.name}</h3>
                  <p className="mt-1 break-words text-sm text-[var(--ink-muted)]">{row.email} · {row.phone}</p>
                  {(row.company || row.job_title) && <p className="mt-1 text-sm text-[var(--ink-muted)]">{[row.job_title, row.company].filter(Boolean).join(" · ")}</p>}
                  <p className="mt-2 text-xs text-[var(--ink-muted)]">Didaftarkan {formatEventDateTime(row.created_at, zone)} {abbr}</p>
                  {/* Kode ditampilkan karena belum ada pengiriman email: pendaftar
                      yang lupa memotret layarnya hanya bisa mendapatkannya dari
                      panitia, dan panitia hanya bisa membacanya di sini. */}
                  {row.qr_code && <p className="mt-2 text-sm">Kode peserta: <span className="select-all font-mono font-semibold">{row.qr_code}</span></p>}
                  {row.reject_reason && <p className="mt-2 text-sm text-[var(--danger)]">Alasan penolakan: {row.reject_reason}</p>}
                  {Object.keys(row.extra ?? {}).length > 0 && <dl className="mt-3 grid gap-1 text-sm">
                    {Object.entries(row.extra).map(([key, value]) => <div key={key} className="flex gap-2">
                      <dt className="font-semibold">{key}:</dt><dd className="text-[var(--ink-muted)]">{value}</dd>
                    </div>)}
                  </dl>}
                </div>

                {row.status === "pending" && <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => void review(row, true)} className="flex min-h-11 items-center gap-2 bg-[var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-50"><Check size={16} weight="bold" /> Setujui</button>
                  <button type="button" disabled={busy} onClick={() => setMenolak(row)} className="flex min-h-11 items-center gap-2 border border-[var(--danger)]/40 px-4 text-sm font-semibold text-[var(--danger)] disabled:opacity-50"><X size={16} weight="bold" /> Tolak</button>
                </div>}
              </div>
            </article>)}
          </section>}
    </div>

    {menolak && <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setMenolak(null); }}>
      <form
        onSubmit={(e) => { e.preventDefault(); void review(menolak, false, String(new FormData(e.currentTarget).get("reason") ?? "")); }}
        className="w-full max-w-md border border-[var(--line)] bg-[var(--surface)] p-6"
      >
        <h2 className="text-xl font-semibold">Tolak pendaftaran</h2>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">{menolak.name} · {menolak.email}</p>
        <p className="mt-4 border border-[var(--line)] bg-[var(--surface-muted)] p-4 text-sm">Pendaftar tidak dibuatkan kode peserta. Catatannya tetap tersimpan, dan orang ini boleh mendaftar ulang dengan email yang sama.</p>
        <label className="mt-5 block text-sm font-semibold">Alasan <span className="font-normal text-[var(--ink-muted)]">(opsional, untuk catatan panitia)</span>
          <input name="reason" maxLength={300} className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-4" />
        </label>
        <div className="mt-6 flex gap-2">
          <button disabled={busy} className="min-h-12 flex-1 border border-[var(--danger)]/40 px-4 font-semibold text-[var(--danger)] disabled:opacity-50">{busy ? "Memproses…" : "Tolak"}</button>
          <button type="button" onClick={() => setMenolak(null)} className="min-h-12 border border-[var(--line)] px-4 font-semibold">Batal</button>
        </div>
      </form>
    </div>}
  </main>;
}
