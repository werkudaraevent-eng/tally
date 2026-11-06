"use client";

import { ArrowSquareOut, FloppyDisk, MusicNotes, UploadSimple, Warning } from "@phosphor-icons/react";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { ImagePreview } from "@/components/admin/image-preview";
import { Button, ButtonLink, DetailSection, Pane, PaneBody, PaneFooter, SegmentedButton, Switch } from "@/components/m3";
import type { Branding } from "@/lib/branding";
import { Field, INPUT, UploadButton } from "./form";
import { FALLBACK, type Settings } from "./types";
import { namaMusik, type SlotMusik } from "@/lib/undian-musik";

const MUSIC_SLOTS: { slot: SlotMusik; key: "music_waiting_url" | "music_drawing_url" | "music_winner_url"; label: string; hint: string }[] = [
  { slot: "waiting", key: "music_waiting_url", label: "Waiting screen", hint: "Loops before and between draws." },
  { slot: "drawing", key: "music_drawing_url", label: "While drawing", hint: "Loops from Draw until the names appear." },
  { slot: "winner", key: "music_winner_url", label: "When winners appear", hint: "Plays once. Replaces the Sound chime." },
];

/**
 * Tab tampilan panggung: satu panel setelan dengan tombol simpan menempel di
 * kakinya. Semua isian di sini disimpan bersama lewat satu PATCH, jadi satu
 * tombol simpan untuk seluruh panel memang cerminan perilakunya.
 */
export function DisplaySettings({
  settings, branding, saving, uploading, uploadingMusic, onChange, onSave, onUpload, onUploadMusic,
}: {
  settings: Settings; branding: Branding; saving: boolean; uploading: boolean; uploadingMusic: SlotMusik | null;
  onChange: (changes: Partial<Settings>) => void; onSave: () => void; onUpload: (file: File) => void;
  onUploadMusic: (slot: SlotMusik, file: File) => void;
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

        <DetailSection title="Waiting screen">
          <Switch
            checked={settings.show_lineup === true}
            onChange={(checked) => onChange({ show_lineup: checked })}
            label="Show the prize lineup"
            description="Lists the active prizes in draw order on the waiting screen, before and between draws. Drawn prizes are marked done. Off keeps the prizes a surprise."
          />
          <Switch
            checked={settings.show_pool_size !== false}
            onChange={(checked) => onChange({ show_pool_size: checked })}
            label="Show the number in the draw"
            description="How many participants are in the draw, on the waiting screen (“309 peserta siap diundi”) and under the Spotlight wall. Off hides the number; the draw itself does not change."
          />
        </DetailSection>

        <DetailSection title="Stage effects">
          <Switch
            checked={settings.sound_enabled}
            onChange={(checked) => onChange({ sound_enabled: checked })}
            label="Sound"
            description="A short chime when winners appear. Turn off if the venue sound system is already playing music."
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
          {/* Lewat link, bukan setelan: proyektor ruangan dan input vMix bisa
              menyala bersamaan, masing-masing dengan tampilannya. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 max-w-md">
              <p className="text-body-medium font-medium">Green screen for vMix</p>
              <p className="text-body-medium text-on-surface-variant">A copy of the stage on flat green for chroma key, without background glow, shadows or faded text. Use this link as the vMix input; the normal stage screen does not change.</p>
            </div>
            <ButtonLink href="/undian?greenscreen=1" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Open green screen</ButtonLink>
          </div>
        </DetailSection>

        {settings.music_available ? (
          <DetailSection title="Music">
            <Switch
              checked={settings.music_enabled}
              onChange={(checked) => onChange({ music_enabled: checked })}
              label="Play music on the stage screen"
              description="Plays from the computer running the stage screen, through its sound output. Browsers only play sound after a click, so click the stage screen once after opening it."
            />
            {settings.music_enabled ? (
              <>
                <ul className="divide-y divide-outline-variant rounded-md border border-outline-variant">
                  {MUSIC_SLOTS.map(({ slot, key, label, hint }) => {
                    const url = settings[key];
                    return (
                      <li key={slot} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4">
                        <div className="min-w-0 sm:w-48 sm:shrink-0">
                          <p className="text-body-medium font-medium">{label}</p>
                          <p className="text-body-medium text-on-surface-variant">{hint}</p>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          {url ? (
                            <>
                              <p className="flex min-w-0 items-center gap-1.5 text-body-medium">
                                <MusicNotes size={16} className="shrink-0 text-on-surface-variant" aria-hidden />
                                <span className="truncate">{namaMusik(url)}</span>
                              </p>
                              <audio controls preload="none" src={url} className="h-9 w-full max-w-sm" aria-label={`${label} music preview`} />
                            </>
                          ) : <p className="text-body-medium text-on-surface-variant">No music. Silent for this part.</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <UploadButton
                            label={url ? "Change" : "Upload"}
                            accept="audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav,.mp3,.m4a,.aac,.ogg,.wav"
                            busy={uploadingMusic === slot}
                            onFile={(file) => onUploadMusic(slot, file)}
                            icon={<UploadSimple size={16} />}
                          />
                          {url ? <Button variant="text" size="sm" className="text-error" onClick={() => onChange({ [key]: null } as Partial<Settings>)}>Remove</Button> : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-body-medium text-on-surface-variant">MP3, M4A, AAC, OGG or WAV, up to 15 MB each. Use music you have the rights to play at the event.</p>
                <div>
                  <label htmlFor="music-volume" className="block text-body-medium font-medium">Volume: <span className="tabular-nums">{settings.music_volume}%</span></label>
                  <input id="music-volume" type="range" min={0} max={100} step={5} value={settings.music_volume} onChange={(event) => onChange({ music_volume: Number.parseInt(event.target.value, 10) })} className="mt-2 w-full max-w-md accent-[var(--md-sys-color-primary)]" />
                  <p className="mt-1 text-body-medium text-on-surface-variant">Lower this if the music drowns out the MC. The venue mixer still sets the overall level.</p>
                </div>
              </>
            ) : null}
          </DetailSection>
        ) : null}

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
