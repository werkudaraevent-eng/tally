"use client";

import { ArrowLeft, CheckCircle, Eye, MonitorPlay, UploadSimple, XCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { useToast } from "@/components/toast";
import { normalizeBranding, type Branding } from "@/lib/branding";
import { formatWibDateTime } from "@/lib/datetime";

type NameDisplayMode = "full" | "initials" | "company_only" | "hidden";
type EventSettings = {
  leaderboard_enabled: boolean;
  name_display_mode: NameDisplayMode;
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
  ticker_text: string | null;
  refresh_seconds: number;
  updated_at?: string;
} & Branding;

export default function DisplaySettingsPage() {
  const [settings, setSettings] = useState<DisplaySettings | null>(null);
  const [event, setEvent] = useState<EventSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const toast = useToast();

  useEffect(() => { const timer = window.setTimeout(() => {
    void fetch("/api/display/settings", { cache: "no-store" }).then(async (response) => { if (response.ok) setSettings(await response.json()); else setError("Setting display gagal dimuat."); });
    void fetch("/api/settings", { cache: "no-store" }).then(async (response) => { if (response.ok) { const data = await response.json(); setEvent({ leaderboard_enabled: data.leaderboard_enabled, name_display_mode: data.name_display_mode }); } });
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

  return <main className="min-h-dvh bg-[var(--background)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:py-10">
    <div className="mx-auto max-w-[1440px]">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand)]"><ArrowLeft size={18} /> Kembali ke Dashboard</Link>
      <div className="mt-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Live display CMS</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Tampilan top spender.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">Atur teks, warna, background, dan layout layar leaderboard yang tampil di proyektor.</p>
        </div>
        <a href="/display" target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 border border-[var(--line)] px-4 text-sm font-semibold"><MonitorPlay size={19} /> Buka Live Display</a>
      </div>

      {error && <div role="alert" className="mt-6 flex items-center gap-2 border border-[#E9C7C4] bg-[#FFF2F0] p-4 text-sm text-[var(--danger)]"><XCircle size={20} />{error}</div>}
      {message && <div role="status" className="mt-6 flex items-center gap-2 border border-[#B9DCC5] bg-[#EEF8F0] p-4 text-sm text-[var(--brand-strong)]"><CheckCircle size={20} />{message}</div>}

      {!settings ? <p className="mt-8 text-sm text-[var(--ink-muted)]">Memuat setting...</p> : <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-start">
        <div className="space-y-px border border-[var(--line)] bg-[var(--line)]">
          <section className="bg-[var(--surface)] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Teks</h2>
            <label className="mt-4 block text-sm font-semibold">Judul acara
              <input value={settings.event_title} onChange={(event) => update("event_title", event.target.value)} className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]" />
            </label>
            <label className="mt-4 block text-sm font-semibold">Headline
              <input value={settings.headline} onChange={(event) => update("headline", event.target.value)} className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]" />
            </label>
            <label className="mt-4 block text-sm font-semibold">Tagline besar
              <input value={settings.tagline} onChange={(event) => update("tagline", event.target.value)} className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]" />
            </label>
          </section>

          <section className="bg-[var(--surface)] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Warna</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {([["background_color", "Background"], ["text_color", "Teks"], ["accent_color", "Aksen"]] as const).map(([key, label]) => <label key={key} className="block text-sm font-semibold">{label}
                <span className="mt-2 flex items-center gap-2">
                  <input type="color" value={settings[key]} onChange={(event) => update(key, event.target.value)} className="h-10 w-12 cursor-pointer border border-[var(--line)] bg-[var(--background)]" />
                  <input value={settings[key]} onChange={(event) => update(key, event.target.value)} className="h-10 w-full border border-[var(--line)] bg-[var(--background)] px-2 font-mono text-xs uppercase outline-none focus:border-[var(--brand)]" />
                </span>
              </label>)}
            </div>
            <div className="mt-4">
              <p className="text-sm font-semibold">Background image <span className="font-normal text-[var(--ink-muted)]">(opsional, disarankan 1920×1080)</span></p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className={`inline-flex h-12 cursor-pointer items-center gap-2 border border-[var(--line)] bg-[var(--background)] px-4 text-sm font-semibold hover:border-[var(--brand)] ${uploading ? "pointer-events-none opacity-60" : ""}`}>
                  <UploadSimple size={18} weight="bold" />
                  {uploading ? "Mengunggah..." : "Upload gambar"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadBackground(file); event.target.value = ""; }} />
                </label>
                {settings.background_image_url ? (
                  <button type="button" onClick={() => update("background_image_url", null)} className="inline-flex h-12 items-center gap-2 border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--danger)] hover:border-[var(--danger)]">
                    <XCircle size={18} weight="bold" /> Hapus gambar
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-[var(--ink-muted)]">Format PNG, JPG, atau WebP. Maksimal 5 MB.</p>
              {settings.background_image_url ? (
                <div className="mt-3 flex items-center gap-3">
                  <span className="h-16 w-28 shrink-0 border border-[var(--line)] bg-cover bg-center" style={{ backgroundImage: `url(${settings.background_image_url})` }} />
                  <span className="break-all text-xs text-[var(--ink-muted)]">{settings.background_image_url}</span>
                </div>
              ) : null}
            </div>
          </section>

          {/* Header dan footer branding. Memakai editor yang sama dengan
              /admin/seat-map supaya field di kedua CMS tidak pernah berbeda.

              `idPrefix` tetap diberikan meski di halaman ini hanya ada satu editor:
              propnya wajib, dan nilai yang bermakna lebih mudah dilacak daripada
              string kosong bila kelak ada editor kedua di halaman ini. */}
          <section className="bg-[var(--surface)] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Header &amp; footer</h2>
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

          <section className="bg-[var(--surface)] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Leaderboard & privasi</h2>
            {!event ? <p className="mt-4 text-sm text-[var(--ink-muted)]">Memuat setting leaderboard...</p> : <>
              <label className="mt-4 flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={event.leaderboard_enabled} onChange={(e) => updateEvent("leaderboard_enabled", e.target.checked)} className="size-5 accent-[var(--brand)]" /> Tampilkan leaderboard di Live Display</label>
              <p className="mt-2 flex items-start gap-2 text-xs text-[var(--ink-muted)]"><Eye size={16} className="mt-0.5 shrink-0 text-[var(--brand)]" /> Saklar master. Jika dimatikan, leaderboard disembunyikan di semua layar display.</p>
              <p className="mt-5 text-sm font-semibold">Nama peserta di leaderboard</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(["full", "initials", "company_only", "hidden"] as const).map((mode) => <label key={mode} className={`flex cursor-pointer items-center gap-3 border p-3 text-sm ${event.name_display_mode === mode ? "border-[var(--brand)] bg-[#E8ECFB]" : "border-[var(--line)]"}`}>
                  <input type="radio" name="name-mode" checked={event.name_display_mode === mode} onChange={() => updateEvent("name_display_mode", mode)} className="size-4 accent-[var(--brand)]" />
                  {mode === "full" ? "Nama lengkap" : mode === "initials" ? "Inisial" : mode === "company_only" ? "Perusahaan saja" : "Sembunyikan"}
                </label>)}
              </div>
              <p className="mt-3 border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm">Preview: <span className="font-semibold">{namePreview[event.name_display_mode]}</span></p>
            </>}
          </section>

          <section className="bg-[var(--surface)] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Layout</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">Jumlah top spender
                <input type="number" min={3} max={50} value={settings.leaderboard_limit} onChange={(event) => update("leaderboard_limit", Math.max(3, Math.min(50, Number(event.target.value) || 10)))} className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-lg tabular-nums outline-none focus:border-[var(--brand)]" />
              </label>
              <label className="block text-sm font-semibold">Refresh (detik)
                <input type="number" min={5} max={300} value={settings.refresh_seconds} onChange={(event) => update("refresh_seconds", Math.max(5, Math.min(300, Number(event.target.value) || 30)))} className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-lg tabular-nums outline-none focus:border-[var(--brand)]" />
              </label>
            </div>
            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={settings.show_company} onChange={(event) => update("show_company", event.target.checked)} className="size-5 accent-[var(--brand)]" /> Tampilkan perusahaan peserta</label>
              <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={settings.show_booth_progress} onChange={(event) => update("show_booth_progress", event.target.checked)} className="size-5 accent-[var(--brand)]" /> Tampilkan panel booth explorer</label>
              <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={settings.show_ticker} onChange={(event) => update("show_ticker", event.target.checked)} className="size-5 accent-[var(--brand)]" /> Tampilkan ticker bawah</label>
            </div>
            {settings.show_ticker && <label className="mt-4 block text-sm font-semibold">Teks ticker <span className="font-normal text-[var(--ink-muted)]">(kosong = default)</span>
              <input value={settings.ticker_text ?? ""} onChange={(event) => update("ticker_text", event.target.value)} placeholder="Leaderboard ter-update dari transaksi live" className="mt-2 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]" />
            </label>}
          </section>

          <section className="bg-[var(--surface)] p-6">
            <button onClick={save} disabled={saving} className="flex min-h-14 w-full items-center justify-center gap-2 bg-[var(--brand)] text-sm font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50">{saving ? "Menyimpan..." : "Simpan tampilan"}</button>
            {settings.updated_at && <p className="mt-3 text-center text-xs text-[var(--ink-muted)]">Terakhir diubah {formatWibDateTime(settings.updated_at)} WIB</p>}
          </section>
        </div>

        <section className="lg:sticky lg:top-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Preview</h2>
          <div className="mt-4 aspect-video w-full overflow-hidden border border-[var(--line)]" style={{ backgroundColor: settings.background_color, color: settings.text_color, backgroundImage: settings.background_image_url ? `url(${settings.background_image_url})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}>
            <div className="flex h-full flex-col p-5" style={{ background: settings.background_image_url ? "rgba(0,0,0,0.45)" : "transparent" }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ opacity: 0.6 }}>{settings.event_title}</p>
              <p className="mt-1 text-sm font-semibold">{settings.headline}</p>
              <p className="mt-4 text-xl font-semibold tracking-[-0.03em]" style={{ color: settings.accent_color }}>{settings.tagline}</p>
              <div className="mt-4 space-y-2">
                {[1, 2, 3].map((rank) => <div key={rank} className="flex items-center gap-3 border-t pt-2 text-xs" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
                  <span className="font-mono font-semibold" style={{ color: rank === 1 ? settings.accent_color : undefined, opacity: rank === 1 ? 1 : 0.5 }}>{String(rank).padStart(2, "0")}</span>
                  <span className="flex-1">Peserta {rank}{settings.show_company && <span style={{ opacity: 0.5 }}> — PT Contoh</span>}</span>
                  {settings.show_booth_progress && <span style={{ color: settings.accent_color }}>●●●</span>}
                </div>)}
              </div>
              {settings.show_ticker && <p className="mt-auto border-t pt-2 text-[10px]" style={{ borderColor: "rgba(255,255,255,0.15)", opacity: 0.6 }}>{settings.ticker_text?.trim() || "Leaderboard ter-update dari transaksi live"}</p>}
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--ink-muted)]">Preview perkiraan. Buka Live Display untuk tampilan penuh di proyektor.</p>
        </section>
      </div>}
    </div>
  </main>;
}
