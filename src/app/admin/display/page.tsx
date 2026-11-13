"use client";

import { ArrowSquareOut, UploadSimple, Warning, XCircle } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useEffect, useState, type ReactNode } from "react";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { useToast } from "@/components/toast";
import { normalizeBranding, type Branding } from "@/lib/branding";
import { formatEventDateTime } from "@/lib/datetime";
import { cx } from "@/lib/m3/cx";
import { DEFAULT_TIME_ZONE, normalizeTimeZone, timeZoneAbbr, type EventTimeZone } from "@/lib/timezone";
import {
  Banner, Button, ButtonLink, DetailSection, MetaSeparator, PageLoading, Pane, PaneBody, PaneFooter, PaneHeader,
  SegmentedButton, StatusChip, SupportingPane, Switch, TextField, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";
import { DisplayTabs } from "./display-tabs";

type NameDisplayMode = "full" | "initials" | "company_only" | "hidden";
type EventSettings = {
  leaderboard_enabled: boolean;
  name_display_mode: NameDisplayMode;
  // Hanya dibaca di halaman ini, tidak diubah: zona diatur di /admin/settings
  // supaya tidak ada dua form yang menulis satu nilai yang sama.
  time_zone: EventTimeZone;
};

const NAME_MODES: { value: NameDisplayMode; label: string; contoh: string }[] = [
  { value: "full", label: "Full name", contoh: "Budi Santoso · PT Maju Jaya" },
  { value: "initials", label: "Initials", contoh: "B. S. · PT Maju Jaya" },
  { value: "company_only", label: "Company only", contoh: "PT Maju Jaya" },
  { value: "hidden", label: "Hidden", contoh: "Peserta #14" },
];

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

type Bagian = "isi" | "tampilan" | "privasi" | "tata-letak";

function WarnaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-body-medium font-medium text-on-surface">
      {label}
      <span className="mt-1.5 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label}, pemilih warna`}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-outline bg-surface-container-lowest"
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label}, colour code`}
          className="h-9 w-full min-w-0 rounded-md border border-outline bg-surface-container-lowest px-3 text-body-medium tabular-nums text-on-surface outline-none focus:border-primary"
        />
      </span>
    </label>
  );
}

export default function DisplaySettingsPage() {
  const [settings, setSettings] = useState<DisplaySettings | null>(null);
  const [event, setEvent] = useState<EventSettings | null>(null);
  const [eventGagal, setEventGagal] = useState(false);
  // Nilai yang SUDAH tersimpan, untuk baris meta. Form di panel kanan adalah draf.
  const [tersimpan, setTersimpan] = useState<{ enabled: boolean | null; limit: number | null }>({ enabled: null, limit: null });
  // Status reveal hanya DIBACA di sini (untuk penanda di tab); kontrolnya di /admin/display/reveal.
  const [reveal, setReveal] = useState<{ mode: string; stage_label: string | null } | null>(null);
  /**
   * Draf mentah untuk dua kolom angka.
   *
   * Kolom itu dulu menjepit nilainya pada SETIAP ketukan: mengetik "25" di batas
   * peringkat berarti "2" dijepit ke 3 sebelum digit kedua ditekan. Jadi teks
   * mentahnya ditahan di sini selama kolom disunting, dan penjepitan baru
   * dikerjakan saat fokus lepas atau saat menyimpan.
   */
  const [draftAngka, setDraftAngka] = useState<{ leaderboard_limit?: string; refresh_seconds?: string }>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [bagian, setBagian] = useState<Bagian>("isi");
  const toast = useToast();

  useEffect(() => { const timer = window.setTimeout(() => {
    void fetch("/api/display/settings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) { setError("Could not load the leaderboard settings."); return; }
        const data = (await response.json()) as DisplaySettings;
        setSettings(data);
        setTersimpan((current) => ({ ...current, limit: data.leaderboard_limit }));
      })
      .catch(() => setError("Connection lost while loading the leaderboard settings."));
    // Cabang gagal untuk setelan leaderboard. Tanpa itu, kegagalan berakhir
    // sebagai bagian layar yang diam dan Simpan melewatinya tanpa sepatah kata.
    void fetch("/api/settings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) { setEventGagal(true); setError("Could not load the leaderboard settings. Reload before saving, or changes in the Privacy section will not be saved."); return; }
        const data = await response.json();
        setEvent({ leaderboard_enabled: data.leaderboard_enabled, name_display_mode: data.name_display_mode, time_zone: normalizeTimeZone(data.time_zone) });
        setTersimpan((current) => ({ ...current, enabled: Boolean(data.leaderboard_enabled) }));
      })
      .catch(() => { setEventGagal(true); setError("Connection lost while loading the leaderboard settings. Reload before saving."); });
    void fetch("/api/display/reveal", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        setReveal({ mode: data.mode, stage_label: data.stage_label ?? null });
      })
      .catch(() => undefined);
  }, 0); return () => window.clearTimeout(timer); }, []);

  function update<K extends keyof DisplaySettings>(key: K, value: DisplaySettings[K]) {
    setSettings((current) => current && { ...current, [key]: value });
  }

  type KunciAngka = "leaderboard_limit" | "refresh_seconds";

  /** Menjepit teks yang diketik menjadi angka yang sah. Dipakai saat fokus lepas dan saat menyimpan. */
  function jepit(key: KunciAngka, raw: string | undefined, current: number) {
    if (raw === undefined) return current;
    const batas = key === "leaderboard_limit" ? { min: 3, max: 50, bawaan: 10 } : { min: 5, max: 300, bawaan: 30 };
    const angka = Math.round(Number(raw));
    if (raw.trim() === "" || !Number.isFinite(angka)) return batas.bawaan;
    return Math.max(batas.min, Math.min(batas.max, angka));
  }

  function lepasFokusAngka(key: KunciAngka) {
    setSettings((current) => current && { ...current, [key]: jepit(key, draftAngka[key], current[key]) });
    setDraftAngka((current) => ({ ...current, [key]: undefined }));
  }

  function updateEvent<K extends keyof EventSettings>(key: K, value: EventSettings[K]) {
    setEvent((current) => current && { ...current, [key]: value });
  }

  async function uploadBackground(file: File) {
    setUploading(true); setError(""); setMessage("");
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/display/background", { method: "POST", body: form }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    setUploading(false);
    if (!response?.ok) {
      const failure = data?.error?.details?.file ?? data?.error?.message ?? "Image upload failed.";
      setError(failure);
      toast.error("Image upload failed", failure);
      return;
    }
    update("background_image_url", data.url);
    setMessage("Image uploaded. Press Save display to apply it.");
    toast.info("Image uploaded", "Press Save display to apply it to the leaderboard.");
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
      // Draf yang belum kehilangan fokus tetap ikut tersimpan. Menekan Simpan
      // lewat papan ketik tidak selalu melepas fokus kolom.
      leaderboard_limit: jepit("leaderboard_limit", draftAngka.leaderboard_limit, settings.leaderboard_limit),
      show_company: settings.show_company,
      show_booth_progress: settings.show_booth_progress,
      show_ticker: settings.show_ticker,
      show_amount: settings.show_amount,
      ticker_text: settings.ticker_text?.trim() ? settings.ticker_text.trim() : null,
      refresh_seconds: jepit("refresh_seconds", draftAngka.refresh_seconds, settings.refresh_seconds),
      // Branding header dan footer. Dilewatkan `normalizeBranding` supaya hanya
      // kolom milik branding yang ikut dan skalanya sudah berupa angka.
      ...normalizeBranding(settings as unknown as Record<string, unknown>),
    };
    const [response, eventResponse] = await Promise.all([
      fetch("/api/display/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => null),
      event ? fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leaderboard_enabled: event.leaderboard_enabled, name_display_mode: event.name_display_mode }) }).catch(() => null) : Promise.resolve(null),
    ]);
    const data = await response?.json().catch(() => ({}));
    setSaving(false);
    if (!response?.ok) {
      const failure = data?.error?.message ?? (response ? "Could not save the display settings." : "Connection lost. Settings may not be saved.");
      setError(failure);
      toast.error("Could not save the display settings", failure);
      return;
    }
    if (event && !eventResponse?.ok) {
      setError("Some leaderboard settings could not be saved.");
      toast.error("Some settings could not be saved", "Display saved, but the leaderboard settings failed. Try saving again.");
      return;
    }
    setSettings(data);
    setTersimpan({ enabled: event ? event.leaderboard_enabled : tersimpan.enabled, limit: (data as DisplaySettings).leaderboard_limit });
    // Draf dibuang setelah tersimpan: nilai yang berlaku sekarang datang dari
    // server, dan draf yang tertinggal akan menutupinya di layar.
    setDraftAngka({});
    setMessage("Saved. The leaderboard updates within a few seconds.");
    toast.success("Display saved", "The leaderboard updates within a few seconds.");
  }

  const zona = event?.time_zone ?? DEFAULT_TIME_ZONE;

  // ---- Panel utama: pratinjau ---------------------------------------------------
  const pratinjau = settings ? (
    <Pane aria-label="Leaderboard preview">
      <PaneHeader>
        <span className="min-w-0 flex-1 text-body-medium text-on-surface-variant">Approximate preview · 16:9</span>
      </PaneHeader>
      <PaneBody className="flex flex-col items-center gap-3 bg-surface-container-high px-4 py-6 sm:px-6">
        <div
          className="@container aspect-video w-full max-w-[720px] overflow-hidden rounded-lg border border-outline-variant"
          style={{ backgroundColor: settings.background_color, color: settings.text_color, backgroundImage: settings.background_image_url ? `url(${settings.background_image_url})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}
        >
          <div className="flex h-full flex-col p-[3.5cqw]" style={{ background: settings.background_image_url ? "rgba(0,0,0,0.45)" : "transparent" }}>
            {/* Huruf, warna, dan latar diwarisi dari pilihan panitia. Pratinjau
                yang memakai huruf lain dari layar aslinya adalah pratinjau yang
                berbohong. */}
            <p className="font-semibold" style={{ opacity: 0.6, fontSize: "1.6cqw" }}>{settings.event_title}</p>
            <p className="mt-[0.6cqw] font-semibold" style={{ fontSize: "2.2cqw" }}>{settings.headline}</p>
            <p className="mt-[2cqw] font-semibold" style={{ color: settings.accent_color, fontSize: "4cqw" }}>{settings.tagline}</p>
            <div className="mt-[2cqw] flex flex-col gap-[1cqw]">
              {/* Nominal contoh ikut dipratinjau supaya efek mematikan sakelarnya
                  terlihat di sini, bukan baru diketahui setelah proyektor menyala. */}
              {[1, 2, 3].map((rank) => (
                <div key={rank} className="flex items-center gap-[1.6cqw] border-t pt-[1cqw]" style={{ borderColor: "rgba(255,255,255,0.15)", fontSize: "1.8cqw" }}>
                  <span className="font-semibold tabular-nums" style={{ color: rank === 1 ? settings.accent_color : undefined, opacity: rank === 1 ? 1 : 0.5 }}>{String(rank).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 truncate">Peserta {rank}{settings.show_company ? <span style={{ opacity: 0.5 }}> · PT Contoh</span> : null}</span>
                  {settings.show_amount ? <span className="shrink-0 tabular-nums" style={{ color: rank === 1 ? settings.accent_color : undefined }}>{["13.436.025", "6.749.463", "5.747.650"][rank - 1]}</span> : null}
                  {settings.show_booth_progress ? <span aria-hidden className="shrink-0" style={{ color: settings.accent_color }}>●●●</span> : null}
                </div>
              ))}
            </div>
            {settings.show_ticker ? (
              <p className="mt-auto border-t pt-[1cqw]" style={{ borderColor: "rgba(255,255,255,0.15)", opacity: 0.6, fontSize: "1.4cqw" }}>{settings.ticker_text?.trim() || "Leaderboard ter-update dari transaksi live"}</p>
            ) : null}
          </div>
        </div>
        <p className="max-w-[720px] text-center text-body-medium text-on-surface-variant">Approximate. Open the leaderboard for the full projector view.</p>
      </PaneBody>
    </Pane>
  ) : null;

  // ---- Panel pendukung: setelan -------------------------------------------------
  const isi = settings ? (
    <DetailSection title="Screen text">
      <div className="flex flex-col gap-4">
        <TextField label="Event title" value={settings.event_title} onChange={(e) => update("event_title", e.target.value)} />
        <TextField label="Headline" value={settings.headline} onChange={(e) => update("headline", e.target.value)} />
        <TextField label="Large tagline" value={settings.tagline} onChange={(e) => update("tagline", e.target.value)} />
      </div>
    </DetailSection>
  ) : null;

  const tampilan = settings ? (
    <>
      <DetailSection title="Colours">
        <div className="flex flex-col gap-3">
          {([["background_color", "Background"], ["text_color", "Text"], ["accent_color", "Accent"]] as const).map(([key, label]) => (
            <WarnaField key={key} label={label} value={settings[key]} onChange={(value) => update(key, value)} />
          ))}
        </div>
      </DetailSection>
      <DetailSection title="Background image">
        <div className="flex flex-wrap items-center gap-3">
          <label className={cx(
            "inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-outline bg-surface-container-lowest px-3 text-body-medium font-medium text-on-surface hover:bg-primary-soft focus-within:ring-2 focus-within:ring-primary",
            uploading && "pointer-events-none opacity-60",
          )}>
            <UploadSimple size={16} aria-hidden />
            {uploading ? "Uploading…" : "Upload image"}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadBackground(file); e.target.value = ""; }} />
          </label>
          {settings.background_image_url ? (
            <Button variant="text" size="sm" icon={<XCircle size={16} />} onClick={() => update("background_image_url", null)}>Remove image</Button>
          ) : null}
        </div>
        <p className="text-body-medium text-on-surface-variant">Optional. PNG, JPG or WebP, up to 5 MB. 1920×1080 recommended.</p>
        {settings.background_image_url ? (
          <span className="h-16 w-28 rounded-md border border-outline-variant bg-cover bg-center" style={{ backgroundImage: `url(${settings.background_image_url})` }} />
        ) : null}
      </DetailSection>
      {/* Editor yang sama dengan /admin/seat-map supaya field di kedua CMS tidak pernah berbeda. */}
      <DetailSection title="Header & footer">
        <BrandingEditor
          idPrefix="display"
          value={normalizeBranding(settings as unknown as Record<string, unknown>)}
          onChange={(changes) => setSettings((current) => current && { ...current, ...changes })}
          baseTextColor={settings.text_color}
          baseBackgroundColor={settings.background_color}
          baseAccentColor={settings.accent_color}
        />
      </DetailSection>
    </>
  ) : null;

  const privasi = !event ? (
    <p className="px-5 py-4 text-body-medium text-on-surface-variant">
      {eventGagal ? "Leaderboard settings could not be read. Reload the page before changing this section." : "Loading leaderboard settings…"}
    </p>
  ) : (
    <>
      <DetailSection>
        <Switch
          checked={event.leaderboard_enabled}
          onChange={(value) => updateEvent("leaderboard_enabled", value)}
          label="Show leaderboard"
          description="Main switch. When off, the leaderboard is hidden on every display screen."
        />
      </DetailSection>
      <DetailSection title="Participant names on screen">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Participant names on the leaderboard</legend>
          {NAME_MODES.map((mode) => {
            const on = event.name_display_mode === mode.value;
            return (
              <label key={mode.value} className={cx("flex cursor-pointer gap-3 rounded-lg border p-3 text-body-medium", on ? "border-primary bg-accent-soft" : "border-outline-variant hover:bg-primary-soft")}>
                <input type="radio" name="name-mode" checked={on} onChange={() => updateEvent("name_display_mode", mode.value)} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
                <span>
                  <span className="block font-medium text-on-surface">{mode.label}</span>
                  <span className="block text-on-surface-variant">{mode.contoh}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </DetailSection>
      {/* Pengecualian adalah aturan KELAYAKAN, bukan setelan tampilan, jadi hanya
          tautannya yang tinggal di sini. Kalau daftarnya diedit di form ini, ia
          ikut terkirim setiap kali ada yang mengganti warna latar. */}
      <DetailSection>
        <div className="flex items-start gap-3 rounded-md bg-surface-container-high p-3 text-body-medium">
          <p className="min-w-0 flex-1 text-on-surface-variant">
            <span className="block font-medium text-on-surface">Participant exclusions</span>
            Companies or participants not eligible for top spender. Their transactions still count in full in Reports.
          </p>
          <Link href="/admin/display/exclusions" className="shrink-0 rounded-sm font-medium text-primary hover:underline">Manage</Link>
        </div>
      </DetailSection>
    </>
  );

  const tataLetak = settings ? (
    <>
      <DetailSection title="Board size">
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Number of top spenders"
            type="number" min={3} max={50}
            hint="3–50"
            value={draftAngka.leaderboard_limit ?? String(settings.leaderboard_limit)}
            onChange={(e) => { const raw = e.target.value; setDraftAngka((current) => ({ ...current, leaderboard_limit: raw })); }}
            onBlur={() => lepasFokusAngka("leaderboard_limit")}
            inputClassName="tabular-nums"
          />
          <TextField
            label="Settings refresh (seconds)"
            type="number" min={5} max={300}
            hint="5–300"
            value={draftAngka.refresh_seconds ?? String(settings.refresh_seconds)}
            onChange={(e) => { const raw = e.target.value; setDraftAngka((current) => ({ ...current, refresh_seconds: raw })); }}
            onBlur={() => lepasFokusAngka("refresh_seconds")}
            inputClassName="tabular-nums"
          />
        </div>
      </DetailSection>
      <DetailSection title="Row content">
        <div className="flex flex-col gap-4">
          <Switch checked={settings.show_company} onChange={(value) => update("show_company", value)} label="Show participant company" />
          <Switch checked={settings.show_amount} onChange={(value) => update("show_amount", value)} label="Show spending amount" />
          <Switch checked={settings.show_booth_progress} onChange={(value) => update("show_booth_progress", value)} label="Show booth explorer panel" />
          <Switch checked={settings.show_ticker} onChange={(value) => update("show_ticker", value)} label="Show bottom ticker" />
          {settings.show_ticker ? (
            <TextField
              label="Ticker text"
              optional
              hint="Empty = default text."
              value={settings.ticker_text ?? ""}
              onChange={(e) => update("ticker_text", e.target.value)}
              placeholder="Leaderboard ter-update dari transaksi live"
            />
          ) : null}
        </div>
        {/* Dua keterangan terpisah: yang pertama jaminan teknis (angkanya tidak
            dikirim), yang kedua peringatan tata letak yang hanya berlaku bila
            nominal dan progress booth mati bersamaan. */}
        {!settings.show_amount ? (
          <div className="flex flex-col gap-2 rounded-md bg-surface-container-high p-3 text-body-medium text-on-surface-variant">
            <p>Ranks still show, amounts do not. Amounts are not sent to the screen at all, so nobody who opens the leaderboard can read them in the browser’s developer tools.</p>
            {!settings.show_booth_progress ? (
              <p className="text-warning">Nominal dan progress booth dua-duanya mati, jadi setiap baris hanya berisi nama{settings.show_company ? " dan perusahaan" : ""}. Penonton tidak punya petunjuk tentang alasan urutannya.</p>
            ) : null}
          </div>
        ) : null}
      </DetailSection>
    </>
  ) : null;

  const isiPanel: Record<Bagian, ReactNode> = { isi, tampilan, privasi, "tata-letak": tataLetak };

  const panel = settings ? (
    <Pane as="aside" aria-label="Leaderboard settings">
      <div className="shrink-0 border-b border-outline-variant px-4 py-3">
        <SegmentedButton<Bagian>
          label="Settings sections"
          value={bagian}
          onChange={setBagian}
          className="w-full"
          options={[
            { value: "isi", label: "Content" },
            { value: "tampilan", label: "Display" },
            { value: "privasi", label: "Privacy" },
            { value: "tata-letak", label: "Layout" },
          ]}
        />
      </div>
      <PaneBody>{isiPanel[bagian]}</PaneBody>
      <PaneFooter note={message || (settings.updated_at ? `Last changed ${formatEventDateTime(settings.updated_at, zona)} ${timeZoneAbbr(zona)}` : null)}>
        <Button simpan size="sm" loading={saving} onClick={() => void save()}>Save display</Button>
      </PaneFooter>
    </Pane>
  ) : null;

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        title="Leaderboard"
        meta={tersimpan.enabled !== null || tersimpan.limit !== null ? (
          <>
            {tersimpan.enabled !== null ? (
              <StatusChip dot tone={tersimpan.enabled ? "success" : "neutral"}>{tersimpan.enabled ? "On screen" : "Hidden"}</StatusChip>
            ) : null}
            {tersimpan.limit !== null ? <span className="tabular-nums">Top {tersimpan.limit}</span> : null}
            <MetaSeparator />
            <span>From paid transactions</span>
          </>
        ) : null}
        actions={<ButtonLink href="/display" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Open leaderboard</ButtonLink>}
      />
      <DisplayTabs revealMode={reveal ? (reveal.mode === "staged" ? "staged" : "off") : null} />

      {error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : null}

      {!settings ? (error ? null : <PageLoading />) : <SupportingPane main={pratinjau} pane={panel} />}
    </WorkspacePage>
  );
}
