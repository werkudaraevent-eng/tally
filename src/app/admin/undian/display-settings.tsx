"use client";

import { FloppyDisk, UploadSimple, Warning } from "@phosphor-icons/react";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { ImagePreview } from "@/components/admin/image-preview";
import { Button, DetailSection, Pane, PaneBody, PaneFooter, SegmentedButton, Switch } from "@/components/m3";
import type { Branding } from "@/lib/branding";
import { Field, INPUT, UploadButton } from "./form";
import { FALLBACK, type Settings } from "./types";

/**
 * Tab tampilan panggung: satu panel setelan dengan tombol simpan menempel di
 * kakinya. Semua isian di sini disimpan bersama lewat satu PATCH, jadi satu
 * tombol simpan untuk seluruh panel memang cerminan perilakunya.
 */
export function DisplaySettings({
  settings, branding, saving, uploading, onChange, onSave, onUpload,
}: {
  settings: Settings; branding: Branding; saving: boolean; uploading: boolean;
  onChange: (changes: Partial<Settings>) => void; onSave: () => void; onUpload: (file: File) => void;
}) {
  return (
    <Pane aria-label="Stage display" className="w-full max-w-[960px] flex-1">
      <PaneBody>
        <DetailSection title="Screen title">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="page-title">
              <input id="page-title" value={settings.page_title} onChange={(event) => onChange({ page_title: event.target.value })} className={INPUT} />
            </Field>
            <Field label="Subtitle" htmlFor="page-subtitle">
              <input id="page-subtitle" value={settings.page_subtitle ?? ""} onChange={(event) => onChange({ page_subtitle: event.target.value || null })} className={INPUT} placeholder="Optional" />
            </Field>
          </div>
        </DetailSection>

        <DetailSection title="Winner names">
          <SegmentedButton<Settings["name_display"]>
            label="How names are displayed"
            value={settings.name_display}
            onChange={(value) => onChange({ name_display: value })}
            options={[{ value: "full", label: "Always show full names" }, { value: "follow_event", label: "Follow event privacy rules" }]}
            className="w-full max-w-md"
          />
          {settings.name_display === "follow_event" ? (
            <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
              <Warning size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
              Event privacy rules may hide names, showing only initials or company names. The MC usually needs full names to call winners onto the stage, so make sure this is intended.
            </p>
          ) : null}
          <Switch checked={settings.show_company} onChange={(checked) => onChange({ show_company: checked })} label="Show company" />
          <Switch checked={settings.show_seat} onChange={(checked) => onChange({ show_seat: checked })} label="Show seat number" />
        </DetailSection>

        <DetailSection title="Stage effects">
          <Switch
            checked={settings.sound_enabled}
            onChange={(checked) => onChange({ sound_enabled: checked })}
            label="Sound"
            description="Turn off if the venue sound system is already playing music."
          />
          <Switch
            checked={settings.confetti_enabled}
            onChange={(checked) => onChange({ confetti_enabled: checked })}
            label="Confetti"
            description="Turn off if it interferes with live-streaming cameras."
          />
          <div>
            <label htmlFor="reveal-delay" className="block text-body-medium font-medium">Delay before names appear: <span className="tabular-nums">{settings.reveal_delay_seconds.toFixed(1)}</span> {settings.reveal_delay_seconds === 1 ? "second" : "seconds"}</label>
            <input id="reveal-delay" type="range" min={0} max={5} step={0.5} value={settings.reveal_delay_seconds} onChange={(event) => onChange({ reveal_delay_seconds: Number.parseFloat(event.target.value) })} className="mt-2 w-full max-w-md accent-[var(--md-sys-color-primary)]" />
            <p className="mt-1 text-body-medium text-on-surface-variant">Extra time after the animation stops, giving the MC a moment to pause.</p>
          </div>
        </DetailSection>

        <DetailSection title="Colours and background">
          <div className="grid grid-cols-3 gap-3 sm:max-w-md">
            {([
              ["background_color", "Background", FALLBACK.background_color],
              ["text_color", "Text", FALLBACK.text_color],
              ["accent_color", "Accent", FALLBACK.accent_color],
            ] as const).map(([key, label, fallback]) => (
              <div key={key}>
                <label htmlFor={`color-${key}`} className="block text-body-medium font-medium">{label}</label>
                <input id={`color-${key}`} type="color" value={settings[key] ?? fallback} onChange={(event) => onChange({ [key]: event.target.value } as Partial<Settings>)} className="mt-1.5 h-9 w-full cursor-pointer rounded-md border border-outline bg-surface-container-lowest px-1" />
                {settings[key] ? (
                  <button type="button" onClick={() => onChange({ [key]: null } as Partial<Settings>)} className="mt-1 rounded-sm text-body-medium font-medium text-primary hover:underline">Restore default</button>
                ) : <p className="mt-1 text-body-medium text-on-surface-variant">Default</p>}
              </div>
            ))}
          </div>

          <div>
            <p className="text-body-medium font-medium">Background image</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <UploadButton label={settings.background_image_url ? "Change image" : "Upload image"} accept="image/*" busy={uploading} onFile={onUpload} icon={<UploadSimple size={16} />} />
              {settings.background_image_url ? <Button variant="text" size="sm" className="text-error" onClick={() => onChange({ background_image_url: null })}>Delete image</Button> : null}
            </div>
            {/* Pratinjau latar dibuat lebar dan memakai `cover`, meniru cara gambar
                ini benar-benar dipakai di layar panggung. Kotak kecil `contain`
                menyembunyikan bagian yang justru akan terpotong di proyektor. */}
            {settings.background_image_url ? (
              <div className="mt-3">
                <ImagePreview url={settings.background_image_url} alt="Background image preview" fit="cover" className="aspect-video h-auto w-full max-w-md" showUrl />
              </div>
            ) : null}
          </div>
        </DetailSection>

        <DetailSection title="Header and footer">
          <BrandingEditor
            value={branding}
            onChange={(changes) => onChange(changes as Partial<Settings>)}
            idPrefix="undian"
            baseTextColor={settings.text_color ?? FALLBACK.text_color}
            baseBackgroundColor={settings.background_color ?? FALLBACK.background_color}
            baseAccentColor={settings.accent_color ?? FALLBACK.accent_color}
          />
        </DetailSection>
      </PaneBody>
      <PaneFooter note="The draw screen will update a few seconds after saving.">
        <Button simpan size="sm" loading={saving} onClick={onSave} icon={<FloppyDisk size={16} />}>Save display settings</Button>
      </PaneFooter>
    </Pane>
  );
}
