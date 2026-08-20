"use client";

import { ArrowRight, CheckCircle, Eye, ListNumbers, MonitorPlay, Prohibit, UploadSimple, XCircle } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useEffect, useState } from "react";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { useToast } from "@/components/toast";
import { normalizeBranding, type Branding } from "@/lib/branding";
import { formatEventDateTime } from "@/lib/datetime";
import { DEFAULT_TIME_ZONE, normalizeTimeZone, timeZoneAbbr, type EventTimeZone } from "@/lib/timezone";

type NameDisplayMode = "full" | "initials" | "company_only" | "hidden";
type EventSettings = {
  leaderboard_enabled: boolean;
  name_display_mode: NameDisplayMode;
  // Hanya dibaca di halaman ini, tidak diubah: zona diatur di /admin/settings
  // supaya tidak ada dua form yang menulis satu nilai yang sama.
  time_zone: EventTimeZone;
};

const namePreview: Record<NameDisplayMode, string> = {
  full: "Budi Santoso — PT Maju Jaya",
  initials: "B. S. — PT Maju Jaya",
  company_only: "PT Maju Jaya",
  hidden: "Peserta #14",
};

type DisplaySettings = {
  event_title: string;
  headline: string;
  tagline: string;
  background_color: string;
  text_color: string;
  accent_color: string;
  background_image_url: string | null;
  leaderboard_limit: number;
  show_company: boolean;
  show_booth_progress: boolean;
  show_ticker: boolean;
  show_amount: boolean;
  ticker_text: string | null;
  refresh_seconds: number;
  updated_at?: string;
} & Branding;

export default function DisplaySettingsPage() {
  const [settings, setSettings] = useState<DisplaySettings | null>(null);
  const [event, setEvent] = useState<EventSettings | null>(null);
  // Status reveal hanya DIBACA di sini; kontrolnya ada di /admin/display/reveal.
  const [reveal, setReveal] = useState<{ mode: string; stage_label: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const toast = useToast();

  useEffect(() => { const timer = window.setTimeout(() => {
    void fetch("/api/display/settings", { cache: "no-store" }).then(async (response) => { if (response.ok) setSettings(await response.json()); else setError("Setting display gagal dimuat."); });
    void fetch("/api/settings", { cache: "no-store" }).then(async (response) => { if (response.ok) { const data = await response.json(); setEvent({ leaderboard_enabled: data.leaderboard_enabled, name_display_mode: data.name_display_mode, time_zone: normalizeTimeZone(data.time_zone) }); } });
    void fetch("/api/display/reveal", { cache: "no-store" }).then(async (response) => { if (response.ok) { const data = await response.json(); setReveal({ mode: data.mode, stage_label: data.stage_label ?? null }); } });
  }, 0); return () => window.clearTimeout(timer); }, []);

  function update<K extends keyof DisplaySettings>(key: K, value: DisplaySettings[K]) {
    setSettings((current) => current && { ...current, [key]: value });
  }

  function updateEvent<K extends keyof EventSettings>(key: K, value: EventSettings[K]) {
    setEvent((current) => current && { ...current, [key]: value });
  }

  async function uploadBackground(file: File) {
    setUploading(true); setError(""); setMessage("");
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/display/background", { method: "POST", body: form });
    const data = await response.json();
    setUploading(false);
    if (!response.ok) {
      const failure = data.error?.details?.file ?? data.error?.message ?? "Upload gambar gagal.";
      setError(failure);
      toast.error("Upload gambar gagal", failure);
      return;
    }
    update("background_image_url", data.url);
    setMessage("Gambar terunggah. Klik Simpan untuk menerapkan ke Live Display.");
    toast.info("Gambar terunggah", "Klik Simpan tampilan untuk menerapkannya ke Live Display.");
  }

  async function save() {
    if (!settings) return;
    setSaving(true); setError(""); setMessage("");
    const payload = {
      event_title: settings.event_title,
      headline: settings.headline,
      tagline: settings.tagline,
      background_color: settings.background_color,
      text_color: settings.text_color,
      accent_color: settings.accent_color,
      background_image_url: settings.background_image_url?.trim() ? settings.background_image_url.trim() : null,
      leaderboard_limit: settings.leaderboard_limit,
      show_company: settings.show_company,
      show_booth_progress: settings.show_booth_progress,
      show_ticker: settings.show_ticker,
      show_amount: settings.show_amount,
      ticker_text: settings.ticker_text?.trim() ? settings.ticker_text.trim() : null,
      refresh_seconds: settings.refresh_seconds,
      // Branding header dan footer. Dilewatkan `normalizeBranding` supaya hanya
      // kolom milik branding yang ikut dan skalanya sudah berupa angka, bukan
      // string seperti yang dikirim driver Postgres untuk kolom `numeric`.
      ...normalizeBranding(settings as unknown as Record<string, unknown>),
    };
    const [response, eventResponse] = await Promise.all([
      fetch("/api/display/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
      event ? fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leaderboard_enabled: event.leaderboard_enabled, name_display_mode: event.name_display_mode }) }) : Promise.resolve(null),
    ]);
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      const failure = data.error?.message ?? "Setting display gagal disimpan.";
      setError(failure);
      toast.error("Setting display gagal disimpan", failure);
      return;
    }
    if (eventResponse && !eventResponse.ok) {
      setError("Sebagian setting leaderboard gagal disimpan.");
      toast.error("Sebagian setting gagal disimpan", "Tampilan tersimpan, tetapi setting leaderboard gagal. Coba simpan ulang.");
      return;
    }
    setSettings(data); setMessage("Setting display tersimpan. Live Display akan menyesuaikan dalam beberapa detik.");
    toast.success("Tampilan tersimpan", "Live Display menyesuaikan dalam beberapa detik.");
  }

  return <main className="bg-surface px-5 pb-8 pt-6 text-on-surface sm:px-8 lg:pb-10">
    <div className="mx-auto max-w-[1440px]">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="max-w-2xl text-body-medium leading-6 text-on-surface-variant">Atur teks, warna, background, dan layout layar leaderboard yang tampil di proyektor.</p>
        </div>
        <Link href="/display" target="_blank" rel="noreferrer" className="rounded-md flex min-h-12 items-center justify-center gap-2 border border-outline-variant px-4 text-body-medium font-semibold"><MonitorPlay size={19} /> Buka Live Display</Link>
      </div>

      {error && <div role="alert" className="rounded-lg mt-6 flex items-center gap-2 border border-error-soft-outline bg-error-soft p-4 text-body-medium text-error"><XCircle size={20} />{error}</div>}
      {message && <div role="status" className="rounded-lg mt-6 flex items-center gap-2 border border-success-soft-outline bg-success-soft p-4 text-body-medium text-primary-dim"><CheckCircle size={20} />{message}</div>}

      {!settings ? <p className="mt-8 text-body-medium text-on-surface-variant">Memuat setting...</p> : <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-start">
        <div className="space-y-2">
          <section className="rounded-lg bg-panel p-6">
            <h2 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Teks</h2>
            <label className="mt-4 block text-body-medium font-semibold">Judul acara
              <input value={settings.event_title} onChange={(event) => update("event_title", event.target.value)} className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-3 text-body-medium outline-none focus:border-primary" />
            </label>
            <label className="mt-4 block text-body-medium font-semibold">Headline
              <input value={settings.headline} onChange={(event) => update("headline", event.target.value)} className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-3 text-body-medium outline-none focus:border-primary" />
            </label>
            <label className="mt-4 block text-body-medium font-semibold">Tagline besar
              <input value={settings.tagline} onChange={(event) => update("tagline", event.target.value)} className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-3 text-body-medium outline-none focus:border-primary" />
            </label>
          </section>

          <section className="rounded-lg bg-panel p-6">
            <h2 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Warna</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {([["background_color", "Background"], ["text_color", "Teks"], ["accent_color", "Aksen"]] as const).map(([key, label]) => <label key={key} className="block text-body-medium font-semibold">{label}
                <span className="mt-2 flex items-center gap-2">
                  <input type="color" value={settings[key]} onChange={(event) => update(key, event.target.value)} className="rounded-md h-10 w-12 cursor-pointer border border-outline-variant bg-surface" />
                  <input value={settings[key]} onChange={(event) => update(key, event.target.value)} className="rounded-md h-10 w-full border border-outline-variant bg-surface px-2 font-mono text-body-small uppercase outline-none focus:border-primary" />
                </span>
              </label>)}
            </div>
            <div className="mt-4">
              <p className="text-body-medium font-semibold">Background image <span className="font-normal text-on-surface-variant">(opsional, disarankan 1920×1080)</span></p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className={`rounded-md inline-flex h-12 cursor-pointer items-center gap-2 border border-outline-variant bg-surface px-4 text-body-medium font-semibold hover:border-primary ${uploading ? "pointer-events-none opacity-60" : ""}`}>
                  <UploadSimple size={18} weight="bold" />
                  {uploading ? "Mengunggah..." : "Upload gambar"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadBackground(file); event.target.value = ""; }} />
                </label>
                {settings.background_image_url ? (
                  <button type="button" onClick={() => update("background_image_url", null)} className="rounded-lg inline-flex h-12 items-center gap-2 border border-outline-variant bg-panel px-4 text-body-medium font-semibold text-error hover:border-error">
                    <XCircle size={18} weight="bold" /> Hapus gambar
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-body-small text-on-surface-variant">Format PNG, JPG, atau WebP. Maksimal 5 MB.</p>
              {settings.background_image_url ? (
                <div className="mt-3 flex items-center gap-3">
                  <span className="rounded-md h-16 w-28 shrink-0 border border-outline-variant bg-cover bg-center" style={{ backgroundImage: `url(${settings.background_image_url})` }} />
                  <span className="break-all text-body-small text-on-surface-variant">{settings.background_image_url}</span>
                </div>
              ) : null}
            </div>
          </section>

          {/* Header dan footer branding. Memakai editor yang sama dengan
              /admin/seat-map supaya field di kedua CMS tidak pernah berbeda.

              `idPrefix` tetap diberikan meski di halaman ini hanya ada satu editor:
              propnya wajib, dan nilai yang bermakna lebih mudah dilacak daripada
              string kosong bila kelak ada editor kedua di halaman ini. */}
          <section className="rounded-lg bg-panel p-6">
            <h2 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Header &amp; footer</h2>
            <div className="mt-4">
              <BrandingEditor
                idPrefix="display"
                value={normalizeBranding(settings as unknown as Record<string, unknown>)}
                onChange={(changes) => setSettings((current) => current && { ...current, ...changes })}
                baseTextColor={settings.text_color}
                baseBackgroundColor={settings.background_color}
                baseAccentColor={settings.accent_color}
              />
            </div>
          </section>

          <section className="rounded-lg bg-panel p-6">
            <h2 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Leaderboard & privasi</h2>
            {!event ? <p className="mt-4 text-body-medium text-on-surface-variant">Memuat setting leaderboard...</p> : <>
              <label className="mt-4 flex items-center gap-3 text-body-medium font-semibold"><input type="checkbox" checked={event.leaderboard_enabled} onChange={(e) => updateEvent("leaderboard_enabled", e.target.checked)} className="size-5 accent-primary" /> Tampilkan leaderboard di Live Display</label>
              <p className="mt-2 flex items-start gap-2 text-body-small text-on-surface-variant"><Eye size={16} className="mt-0.5 shrink-0 text-primary" /> Saklar master. Jika dimatikan, leaderboard disembunyikan di semua layar display.</p>
              <p className="mt-5 text-body-medium font-semibold">Nama peserta di leaderboard</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(["full", "initials", "company_only", "hidden"] as const).map((mode) => <label key={mode} className={`rounded-lg flex cursor-pointer items-center gap-3 border p-3 text-body-medium ${event.name_display_mode === mode ? "border-primary bg-primary-soft" : "border-outline-variant"}`}>
                  <input type="radio" name="name-mode" checked={event.name_display_mode === mode} onChange={() => updateEvent("name_display_mode", mode)} className="size-4 accent-primary" />
                  {mode === "full" ? "Nama lengkap" : mode === "initials" ? "Inisial" : mode === "company_only" ? "Perusahaan saja" : "Sembunyikan"}
                </label>)}
              </div>
              <p className="rounded-lg mt-3 border border-outline-variant bg-panel-high p-3 text-body-medium">Preview: <span className="font-semibold">{namePreview[event.name_display_mode]}</span></p>
            </>}

            {/* Pintu masuk ke remote control reveal.
                Kontrolnya sengaja TIDAK ditaruh di halaman ini: tombolnya dipakai
                saat acara berjalan dari layar ponsel, sementara halaman ini adalah
                form panjang yang diedit lalu disimpan. Yang tinggal di sini hanya
                status ringkas dan tautannya. */}
            <div className="rounded-lg mt-6 border border-outline-variant bg-panel-high p-4">
              <p className="flex items-center gap-2 text-body-medium font-semibold"><ListNumbers size={18} className="shrink-0 text-primary" /> Reveal bertahap</p>
              <p className="mt-2 text-body-small leading-5 text-on-surface-variant">
                {reveal === null ? "Memuat status..."
                  : reveal.mode === "staged"
                    ? <>Sedang <span className="font-semibold text-on-surface">aktif</span> — {reveal.stage_label ? `layar menampilkan ${reveal.stage_label.toLowerCase()}` : "layar menunggu tahap pertama dibuka"}.</>
                    : <>Mati. Live Display menampilkan seluruh top {settings.leaderboard_limit} sekaligus, mengikuti transaksi live.</>}
              </p>
              <Link href="/admin/display/reveal" className="rounded-lg mt-3 inline-flex min-h-11 items-center gap-2 border border-outline-variant bg-panel px-4 text-body-medium font-semibold">Buka kontrol reveal <ArrowRight size={16} /></Link>
            </div>

            {/* Pengecualian top spender.
                Sama seperti kontrol reveal, hanya ringkasan + tautan yang tinggal
                di sini. Ini aturan KELAYAKAN, bukan setelan tampilan: kalau
                daftarnya diedit di form ini, ia akan ikut terkirim setiap kali
                ada yang mengganti warna latar, dan sebaliknya menambah satu
                perusahaan akan menerbitkan perubahan warna yang belum selesai. */}
            <div className="rounded-lg mt-4 border border-outline-variant bg-panel-high p-4">
              <p className="flex items-center gap-2 text-body-medium font-semibold"><Prohibit size={18} className="shrink-0 text-primary" /> Pengecualian peserta</p>
              <p className="mt-2 text-body-small leading-5 text-on-surface-variant">Perusahaan atau peserta yang tidak berhak masuk top spender, misalnya internal klien. Transaksinya tetap terhitung penuh di Reports.</p>
              <Link href="/admin/display/exclusions" className="rounded-lg mt-3 inline-flex min-h-11 items-center gap-2 border border-outline-variant bg-panel px-4 text-body-medium font-semibold">Atur pengecualian <ArrowRight size={16} /></Link>
            </div>
          </section>

          <section className="rounded-lg bg-panel p-6">
            <h2 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Layout</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-body-medium font-semibold">Jumlah top spender
                <input type="number" min={3} max={50} value={settings.leaderboard_limit} onChange={(event) => update("leaderboard_limit", Math.max(3, Math.min(50, Number(event.target.value) || 10)))} className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-3 text-lg tabular-nums outline-none focus:border-primary" />
              </label>
              <label className="block text-body-medium font-semibold">Refresh (detik)
                <input type="number" min={5} max={300} value={settings.refresh_seconds} onChange={(event) => update("refresh_seconds", Math.max(5, Math.min(300, Number(event.target.value) || 30)))} className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-3 text-lg tabular-nums outline-none focus:border-primary" />
              </label>
            </div>
            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-3 text-body-medium font-semibold"><input type="checkbox" checked={settings.show_company} onChange={(event) => update("show_company", event.target.checked)} className="size-5 accent-primary" /> Tampilkan perusahaan peserta</label>
              <label className="flex items-center gap-3 text-body-medium font-semibold"><input type="checkbox" checked={settings.show_amount} onChange={(event) => update("show_amount", event.target.checked)} className="size-5 accent-primary" /> Tampilkan nominal belanja</label>
              <label className="flex items-center gap-3 text-body-medium font-semibold"><input type="checkbox" checked={settings.show_booth_progress} onChange={(event) => update("show_booth_progress", event.target.checked)} className="size-5 accent-primary" /> Tampilkan panel booth explorer</label>
              <label className="flex items-center gap-3 text-body-medium font-semibold"><input type="checkbox" checked={settings.show_ticker} onChange={(event) => update("show_ticker", event.target.checked)} className="size-5 accent-primary" /> Tampilkan ticker bawah</label>
            </div>
            {/* Dua keterangan berbeda, bukan satu kalimat gabungan: yang pertama
                menjelaskan jaminan teknisnya (angkanya benar-benar tidak dikirim),
                yang kedua adalah peringatan tata letak yang hanya berlaku bila
                kedua kolom kanan mati sekaligus. Menggabungkannya berarti
                peringatan itu ikut tampil pada keadaan yang tidak bermasalah. */}
            {!settings.show_amount && <div className="rounded-lg mt-4 space-y-2 border border-outline-variant bg-panel-high p-4 text-body-small leading-5 text-on-surface-variant">
              <p>Peringkat tetap tampil, nominalnya tidak. Angka juga tidak dikirim ke layar sama sekali, jadi tidak dapat dibaca dari alat pengembang browser oleh siapa pun yang membuka Live Display.</p>
              {!settings.show_booth_progress && <p className="text-warning">Nominal dan progress booth dua-duanya mati, jadi setiap baris hanya berisi nama{settings.show_company ? " dan perusahaan" : ""}. Penonton tidak punya petunjuk apa pun tentang alasan urutannya.</p>}
            </div>}
            {settings.show_ticker && <label className="mt-4 block text-body-medium font-semibold">Teks ticker <span className="font-normal text-on-surface-variant">(kosong = default)</span>
              <input value={settings.ticker_text ?? ""} onChange={(event) => update("ticker_text", event.target.value)} placeholder="Leaderboard ter-update dari transaksi live" className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-3 text-body-medium outline-none focus:border-primary" />
            </label>}
          </section>

          <section className="rounded-lg bg-panel p-6">
            <button onClick={save} disabled={saving} className="rounded-md flex min-h-14 w-full items-center justify-center gap-2 bg-primary text-body-medium font-semibold text-on-primary hover:bg-primary-dim disabled:opacity-50">{saving ? "Menyimpan..." : "Simpan tampilan"}</button>
            {settings.updated_at && <p className="mt-3 text-center text-body-small text-on-surface-variant">Terakhir diubah {formatEventDateTime(settings.updated_at, event?.time_zone ?? DEFAULT_TIME_ZONE)} {timeZoneAbbr(event?.time_zone ?? DEFAULT_TIME_ZONE)}</p>}
          </section>
        </div>

        <section className="lg:sticky lg:top-6">
          <h2 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Preview</h2>
          <div className="mt-4 aspect-video w-full overflow-hidden rounded-lg border border-outline-variant" style={{ backgroundColor: settings.background_color, color: settings.text_color, backgroundImage: settings.background_image_url ? `url(${settings.background_image_url})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}>
            <div className="flex h-full flex-col p-5" style={{ background: settings.background_image_url ? "rgba(0,0,0,0.45)" : "transparent" }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ opacity: 0.6 }}>{settings.event_title}</p>
              <p className="mt-1 text-body-medium font-semibold">{settings.headline}</p>
              <p className="mt-4 text-xl font-semibold tracking-[-0.03em]" style={{ color: settings.accent_color }}>{settings.tagline}</p>
              <div className="mt-4 space-y-2">
                {/* Nominal contoh ikut dipratinjau supaya efek mematikan togglenya
                    terlihat di sini, bukan baru diketahui setelah proyektor menyala.
                    Angkanya sengaja berbeda per peringkat agar terbaca sebagai data,
                    bukan sebagai label yang sama berulang. */}
                {[1, 2, 3].map((rank) => <div key={rank} className="flex items-center gap-3 border-t pt-2 text-body-small" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
                  <span className="font-mono font-semibold" style={{ color: rank === 1 ? settings.accent_color : undefined, opacity: rank === 1 ? 1 : 0.5 }}>{String(rank).padStart(2, "0")}</span>
                  <span className="flex-1 truncate">Peserta {rank}{settings.show_company && <span style={{ opacity: 0.5 }}> — PT Contoh</span>}</span>
                  {settings.show_amount && <span className="shrink-0 font-mono tabular-nums" style={{ color: rank === 1 ? settings.accent_color : undefined }}>{["13.436.025", "6.749.463", "5.747.650"][rank - 1]}</span>}
                  {settings.show_booth_progress && <span className="shrink-0" style={{ color: settings.accent_color }}>●●●</span>}
                </div>)}
              </div>
              {settings.show_ticker && <p className="mt-auto border-t pt-2 text-[10px]" style={{ borderColor: "rgba(255,255,255,0.15)", opacity: 0.6 }}>{settings.ticker_text?.trim() || "Leaderboard ter-update dari transaksi live"}</p>}
            </div>
          </div>
          <p className="mt-3 text-body-small text-on-surface-variant">Preview perkiraan. Buka Live Display untuk tampilan penuh di proyektor.</p>
        </section>
      </div>}
    </div>
  </main>;
}
