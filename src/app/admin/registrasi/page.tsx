"use client";

import { ArrowLeft, Check, EnvelopeSimple, Hourglass, Link as LinkIcon, PaperPlaneTilt, WarningCircle, X } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { formatEventDateTime } from "@/lib/datetime";
import { eventApiPath } from "@/lib/event-url";
import type { EventTimeZone } from "@/lib/timezone";
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
  email_sent_at: string | null;
  email_error: string | null;
  email_attempts: number;
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
  // Terpisah dari `busy`: tombol kirim ulang ada di setiap baris, dan `busy`
  // global akan mematikan ketiga puluh tombol sekaligus saat satu ditekan.
  const [mengirim, setMengirim] = useState<string | null>(null);
  const [emailAktif, setEmailAktif] = useState(false);
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
    else { setRows(body.registrations ?? []); setConfig(body.event); setPending(body.pending ?? 0); setEmailAktif(body.email_configured === true); setError(""); }
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
    // Kode peserta tetap disebut lebih dulu, apa pun nasib emailnya. Panitia
    // sering membacakannya langsung ke orang yang berdiri di depan meja, dan
    // status pengiriman adalah keterangan kedua — bukan penggantinya.
    const email = (body.email ?? {}) as { state?: string; error?: string };
    toast.success(
      approve ? `${row.name} disetujui` : `${row.name} ditolak`,
      approve
        ? `Kode peserta: ${body.qr_code}${
            email.state === "sent" ? ` — email terkirim ke ${row.email}.`
            : email.state === "failed" ? " — EMAIL GAGAL terkirim. Bacakan kodenya, lalu coba Kirim ulang di tab Disetujui."
            : ""
          }`
        : "Pendaftar tidak dibuatkan kode peserta.",
    );
  }

  async function kirimUlang(row: Row) {
    setMengirim(row.id);
    const response = await fetch(eventApiPath("/api/admin/registrasi/resend"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id }),
    }).catch(() => null);
    setMengirim(null);
    if (!response) { toast.error("Koneksi gagal", "Muat ulang untuk melihat status sebenarnya."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Email gagal dikirim", body.error?.details?.message ?? body.error?.message ?? "Coba lagi.");
      // Baris di layar sekarang basi: email_error dan email_attempts sudah
      // berubah di database, dan membiarkannya membuat panitia membaca sebab
      // kegagalan yang lama.
      void load();
      return;
    }
    setRows((current) => current.map((entry) => (
      entry.id === row.id ? { ...entry, email_sent_at: new Date().toISOString(), email_error: null, email_attempts: entry.email_attempts + 1 } : entry
    )));
    toast.success("Email terkirim", `Kode peserta dikirim ulang ke ${row.email}.`);
  }

  const tautan = config ? `/e/${config.slug}/daftar` : "";

  return <main className="bg-surface px-5 py-6 text-on-surface sm:px-8 lg:py-10">
    <div className="mx-auto max-w-[1200px]">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-body-medium font-semibold text-primary"><ArrowLeft size={18} /> Kembali ke Dashboard</Link>
      <div className="mt-8">
        <p className="text-body-small font-semibold uppercase tracking-[0.2em] text-primary">Registrasi publik</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Pendaftaran.</h1>
        <p className="mt-3 max-w-2xl text-body-medium leading-6 text-on-surface-variant">Peserta mendaftar sendiri lewat tautan publik. Yang disetujui langsung mendapat kode peserta dan bisa discan booth.</p>
      </div>

      {config && <section className="rounded-lg mt-8 border border-outline-variant bg-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <h2 className="font-semibold">Status pendaftaran</h2>
            <p className="mt-1 text-body-medium text-on-surface-variant">
              {config.registration_enabled
                ? "Terbuka. Siapa pun yang punya tautan bisa mendaftar."
                : "Tertutup. Halaman pendaftaran menolak semua pengiriman."}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void simpanKonfigurasi({ registration_enabled: !config.registration_enabled })}
            className={`rounded-md min-h-11 border px-4 text-body-medium font-semibold disabled:opacity-50 ${config.registration_enabled ? "border-error/40 text-error" : "border-transparent bg-primary text-on-primary"}`}
          >{config.registration_enabled ? "Tutup pendaftaran" : "Buka pendaftaran"}</button>
        </div>

        {config.registration_enabled && <>
          <label className="mt-6 flex items-start gap-3 border-t border-outline-variant pt-5 text-body-medium">
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
              <span className="mt-1 block text-on-surface-variant">Pendaftar langsung jadi peserta dan kode terbit seketika, tanpa diperiksa siapa pun. Tanpa ini, setiap pendaftaran menunggu persetujuan di daftar bawah.</span>
            </span>
          </label>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-outline-variant pt-5">
            <LinkIcon size={18} className="text-on-surface-variant" />
            <code className="select-all text-body-medium">{tautan}</code>
            <button
              type="button"
              onClick={() => { void navigator.clipboard.writeText(new URL(tautan, window.location.origin).toString()); toast.success("Tautan disalin", "Sebarkan ke calon peserta."); }}
              className="rounded-md min-h-11 border border-outline-variant px-3 text-body-medium font-semibold"
            >Salin tautan</button>
          </div>
        </>}
      </section>}

      {error && <p role="alert" className="rounded-lg mt-6 border border-error/30 bg-error/5 p-4 text-body-medium font-medium text-error">{error}</p>}

      <div className="mt-8 flex flex-wrap gap-2">
        {TABS.map((entry) => <button
          key={entry.key}
          type="button"
          onClick={() => { setTab(entry.key); setLoading(true); }}
          className={`rounded-md min-h-11 border px-4 text-body-medium font-semibold ${tab === entry.key ? "border-primary text-primary" : "border-outline-variant"}`}
        >{entry.label}{entry.key === "pending" && pending > 0 ? ` (${pending})` : ""}</button>)}
      </div>

      {loading ? <p className="py-16 text-body-medium text-on-surface-variant">Memuat…</p>
        : rows.length === 0 ? <section className="py-20 text-center">
            <Hourglass size={44} className="mx-auto text-on-surface-variant" />
            <p className="mt-4 text-body-medium text-on-surface-variant">Belum ada pendaftaran pada status ini.</p>
          </section>
        : <section className="mt-6 grid gap-3">
            {rows.map((row) => <article key={row.id} className="rounded-lg bg-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold tracking-[-0.02em]">{row.name}</h3>
                  <p className="mt-1 break-words text-body-medium text-on-surface-variant">{row.email} · {row.phone}</p>
                  {(row.company || row.job_title) && <p className="mt-1 text-body-medium text-on-surface-variant">{[row.job_title, row.company].filter(Boolean).join(" · ")}</p>}
                  <p className="mt-2 text-body-small text-on-surface-variant">Didaftarkan {formatEventDateTime(row.created_at, zone)} {abbr}</p>
                  {/* Kode tetap ditampilkan meski email sudah aktif: email bisa
                      masuk spam atau ditolak server penerima, dan panitia harus
                      bisa membacakannya lewat telepon tanpa membuka database. */}
                  {row.qr_code && <p className="mt-2 text-body-medium">Kode peserta: <span className="select-all font-mono font-semibold">{row.qr_code}</span></p>}
                  {row.status === "approved" && row.qr_code && <StatusEmail row={row} emailAktif={emailAktif} zone={zone} abbr={abbr} />}
                  {row.reject_reason && <p className="mt-2 text-body-medium text-error">Alasan penolakan: {row.reject_reason}</p>}
                  {Object.keys(row.extra ?? {}).length > 0 && <dl className="mt-3 grid gap-1 text-body-medium">
                    {Object.entries(row.extra).map(([key, value]) => <div key={key} className="flex gap-2">
                      <dt className="font-semibold">{key}:</dt><dd className="text-on-surface-variant">{value}</dd>
                    </div>)}
                  </dl>}
                </div>

                {row.status === "pending" && <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => void review(row, true)} className="rounded-md flex min-h-11 items-center gap-2 bg-primary px-4 text-body-medium font-semibold text-on-primary disabled:opacity-50"><Check size={16} weight="bold" /> Setujui</button>
                  <button type="button" disabled={busy} onClick={() => setMenolak(row)} className="rounded-md flex min-h-11 items-center gap-2 border border-error/40 px-4 text-body-medium font-semibold text-error disabled:opacity-50"><X size={16} weight="bold" /> Tolak</button>
                </div>}

                {/* Tombol disembunyikan, bukan diredupkan, saat email belum
                    diaktifkan di server: tombol mati tanpa keterangan terbaca
                    sebagai kerusakan. Sebabnya ditulis di StatusEmail. */}
                {row.status === "approved" && row.qr_code && emailAktif && <button
                  type="button"
                  disabled={mengirim === row.id}
                  onClick={() => void kirimUlang(row)}
                  className="rounded-md flex min-h-11 shrink-0 items-center gap-2 border border-outline-variant px-4 text-body-medium font-semibold disabled:opacity-50"
                ><PaperPlaneTilt size={16} /> {mengirim === row.id ? "Mengirim…" : row.email_sent_at ? "Kirim ulang" : "Kirim kode"}</button>}
              </div>
            </article>)}
          </section>}
    </div>

    {menolak && <div className="fixed inset-0 z-50 grid place-items-center bg-scrim/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setMenolak(null); }}>
      <form
        onSubmit={(e) => { e.preventDefault(); void review(menolak, false, String(new FormData(e.currentTarget).get("reason") ?? "")); }}
        className="rounded-lg w-full max-w-md border border-outline-variant bg-panel p-6"
      >
        <h2 className="text-xl font-semibold">Tolak pendaftaran</h2>
        <p className="mt-2 text-body-medium text-on-surface-variant">{menolak.name} · {menolak.email}</p>
        <p className="rounded-lg mt-4 border border-outline-variant bg-panel-high p-4 text-body-medium">Pendaftar tidak dibuatkan kode peserta. Catatannya tetap tersimpan, dan orang ini boleh mendaftar ulang dengan email yang sama.</p>
        <label className="mt-5 block text-body-medium font-semibold">Alasan <span className="font-normal text-on-surface-variant">(opsional, untuk catatan panitia)</span>
          <input name="reason" maxLength={300} className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-4" />
        </label>
        <div className="mt-6 flex gap-2">
          <button disabled={busy} className="rounded-md min-h-12 flex-1 border border-error/40 px-4 font-semibold text-error disabled:opacity-50">{busy ? "Memproses…" : "Tolak"}</button>
          <button type="button" onClick={() => setMenolak(null)} className="rounded-md min-h-12 border border-outline-variant px-4 font-semibold">Batal</button>
        </div>
      </form>
    </div>}
  </main>;
}

/**
 * Nasib email kode peserta untuk satu baris.
 *
 * Empat keadaan, dan masing-masing menuntut tindakan berbeda dari panitia —
 * itulah sebabnya keempatnya dibedakan alih-alih diringkas jadi "terkirim /
 * tidak":
 *
 *   belum aktif  -> tidak ada yang bisa dilakukan panitia; hubungi pemilik sistem.
 *   belum dicoba -> tekan "Kirim kode".
 *   gagal        -> baca sebabnya; salah ketik alamat tidak akan sembuh dengan
 *                   menekan ulang, sedangkan penyedia yang sedang bermasalah akan.
 *   terkirim     -> tidak ada tindakan, dan waktunya disebut supaya "sudah lama
 *                   tapi belum sampai" bisa dibedakan dari "baru sedetik lalu".
 */
function StatusEmail({ row, emailAktif, zone, abbr }: {
  row: Row;
  emailAktif: boolean;
  zone: EventTimeZone;
  abbr: string;
}) {
  if (!emailAktif) {
    return <p className="mt-2 flex items-start gap-2 text-body-medium text-on-surface-variant">
      <EnvelopeSimple size={16} className="mt-0.5 shrink-0" />
      <span>Pengiriman email belum diaktifkan di server. Bacakan kode di atas ke pendaftar.</span>
    </p>;
  }
  if (row.email_error) {
    return <p className="mt-2 flex items-start gap-2 text-body-medium text-error">
      <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" />
      <span>Email gagal terkirim setelah {row.email_attempts}× percobaan: {row.email_error}</span>
    </p>;
  }
  if (row.email_sent_at) {
    return <p className="mt-2 flex items-start gap-2 text-body-medium text-success">
      <Check size={16} weight="bold" className="mt-0.5 shrink-0" />
      <span>Email terkirim {formatEventDateTime(row.email_sent_at, zone)} {abbr}</span>
    </p>;
  }
  return <p className="mt-2 flex items-start gap-2 text-body-medium text-warning">
    <Hourglass size={16} className="mt-0.5 shrink-0" />
    <span>Kode belum pernah dikirim lewat email.</span>
  </p>;
}
