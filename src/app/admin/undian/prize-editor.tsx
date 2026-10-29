"use client";

import { FloppyDisk, Trash, UploadSimple, Warning, X } from "@phosphor-icons/react";
import { Button, DetailSection, IconButton, Pane, PaneBody, PaneFooter, PaneHeader, SegmentedButton, Switch, TextArea } from "@/components/m3";
import { CATATAN_HADIAH_MAX } from "@/lib/member/hadiah";
import { ImagePreview } from "@/components/admin/image-preview";
import { UndianConditionBuilder } from "@/components/admin/undian-condition-builder";
import {
  EXCLUDE_SCOPE_LABEL, SPIN_MODES, WEIGHT_VAR_LABEL, ruleBrokenMessage,
  type ExcludeScope, type SpinMode, type UndianPrize, type WeightMode, type WeightVar,
} from "@/lib/undian";
import { cx } from "@/lib/m3/cx";
import { AnimationPicker, type StageLook } from "./animation-picker";
import { BonusRules } from "./bonus-rules";
import { Field, INPUT, NumberField, PaneError, UploadButton } from "./form";
import type { EntryGroup, Preview } from "./types";

type Draft = Omit<UndianPrize, "id">;

const rupiah = (value: number) => new Intl.NumberFormat("en-GB").format(value);
const digitsOnly = (value: string) => value.replace(/\D/g, "");

/**
 * Panel detail hadiah di sisi kanan list-detail.
 *
 * Urutannya mengikuti pertanyaan yang diajukan panitia: hadiah apa, bagaimana
 * diundi, siapa yang ikut, lalu seberapa besar peluangnya. Kolam peserta
 * dihitung ulang langsung di bagian "Siapa yang diundi", jadi dampak setiap
 * syarat terlihat tanpa berpindah tab.
 */
export function PrizeEditor({
  draft, isNew, legacyFormula, groups, preview, previewFailed, saving, uploading, error,
  onChange, onSave, onClose, onUpload, onDelete, onRetrySessions, stage,
}: {
  draft: Draft; isNew: boolean; legacyFormula: boolean; groups: EntryGroup[]; preview: Preview | null; previewFailed: boolean;
  saving: boolean; uploading: boolean; error: string;
  onChange: (changes: Partial<Draft>) => void;
  onSave: () => void; onClose: () => void; onUpload: (file: File) => void;
  /** Tidak ada untuk hadiah baru. */
  onDelete?: () => void;
  onRetrySessions?: () => void;
  stage: StageLook;
}) {
  const modeBerhenti = SPIN_MODES.find((item) => item.value === draft.spin_mode);

  return (
    <Pane as="aside" aria-label={isNew ? "New prize" : `Details for ${draft.name || "prize"}`}>
      <PaneHeader className="px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-title-medium font-semibold">{isNew ? "New prize" : draft.name || "Unnamed"}</h2>
          {draft.sponsor_name ? <p className="truncate text-body-medium text-on-surface-variant">Sponsor {draft.sponsor_name}</p> : null}
        </div>
        <IconButton size="sm" label="Close prize details" onClick={onClose} disabled={saving}><X size={16} /></IconButton>
      </PaneHeader>

      <PaneBody>
        <form id="form-hadiah" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
          {error ? <div className="px-5 pt-4"><PaneError>{error}</PaneError></div> : null}

          <DetailSection title="Prize">
            <Switch
              checked={draft.is_active}
              onChange={(checked) => onChange({ is_active: checked })}
              label="Active"
              description="Inactive prizes do not appear in the operator panel."
            />
            <Field label="Prize name" htmlFor="prize-name">
              <input id="prize-name" value={draft.name} onChange={(event) => onChange({ name: event.target.value })} className={INPUT} placeholder="Electric bike" />
            </Field>
            <Field label="Sponsor" htmlFor="prize-sponsor">
              <input id="prize-sponsor" value={draft.sponsor_name ?? ""} onChange={(event) => onChange({ sponsor_name: event.target.value || null })} className={INPUT} placeholder="Optional" />
            </Field>
            <Field label="Description" htmlFor="prize-description" hint="Shown below the prize name on the stage screen.">
              <input id="prize-description" value={draft.description ?? ""} onChange={(event) => onChange({ description: event.target.value || null })} className={INPUT} placeholder="Optional" />
            </Field>
            <div>
              <p className="text-body-medium font-medium">Prize image</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {/* Pratinjau, bukan sekadar tombol yang berubah menjadi "Ganti".
                    Tombol memberi tahu bahwa ADA gambar, bukan gambar YANG MANA. */}
                {draft.image_url ? <ImagePreview url={draft.image_url} alt="Prize image preview" className="h-16 w-16" /> : null}
                <UploadButton label={draft.image_url ? "Change image" : "Upload image"} accept="image/*" busy={uploading} onFile={onUpload} icon={<UploadSimple size={16} />} />
                {draft.image_url ? <Button variant="text" size="sm" className="text-error" onClick={() => onChange({ image_url: null })}>Delete image</Button> : null}
              </div>
            </div>
            {/* Kartu Hadiah kamu di portal pemenang (lib/member/hadiah.ts). */}
            <TextArea
              label="How winners collect it"
              optional
              rows={2}
              counter
              maxLength={CATATAN_HADIAH_MAX}
              value={draft.claim_note ?? ""}
              onChange={(event) => onChange({ claim_note: event.target.value || null })}
              placeholder="Collect it at the prize desk by the stage before 22.00. Show your QR code."
              hint="Shown to the winner on Participant home after you confirm them, in the event's language. Leave empty to use the default in Participant area › Lucky draw prize."
            />
          </DetailSection>

          <DetailSection title="Draw settings">
            <AnimationPicker
              value={draft.animation} onChange={(value) => onChange({ animation: value })}
              spinMode={draft.spin_mode} spinSeconds={draft.spin_seconds} winnersPerDraw={draft.winners_per_draw}
              sampleNames={(preview?.sample ?? []).map((row) => row.name)} stage={stage}
            />

            {/* Pilihan berhenti hanya berarti bila ADA animasi. Mode `instant`
                menampilkan pemenang seketika, jadi tidak ada apa pun untuk
                dihentikan. */}
            {draft.animation !== "instant" ? (
              <div>
                <p className="text-body-medium font-medium">Stop</p>
                <SegmentedButton<SpinMode>
                  label="When the animation stops"
                  value={draft.spin_mode}
                  onChange={(value) => onChange({ spin_mode: value })}
                  options={SPIN_MODES.map((item) => ({ value: item.value, label: item.value === "timed" ? "Automatic" : "Manual" }))}
                  className="mt-1.5 w-full"
                />
                <p className="mt-1 text-body-medium text-on-surface-variant">{modeBerhenti?.hint}</p>
                {draft.spin_mode === "timed" ? (
                  <div className="mt-3">
                    <label htmlFor="spin-seconds" className="block text-body-medium font-medium">Animation duration: <span className="tabular-nums">{draft.spin_seconds.toFixed(1)}</span> {draft.spin_seconds === 1 ? "second" : "seconds"}</label>
                    <input id="spin-seconds" type="range" min={1} max={30} step={0.5} value={draft.spin_seconds} onChange={(event) => onChange({ spin_seconds: Number.parseFloat(event.target.value) })} className="mt-2 w-full accent-[var(--md-sys-color-primary)]" />
                  </div>
                ) : (
                  <p className="mt-3 flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
                    <Warning size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                    <span>The draw does not finish automatically. The operator must press the stop button in the operator panel. Winners are saved when Draw is pressed, so closing the browser will not lose them. The winner reveal delay does not apply in this mode.</span>
                  </p>
                )}
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-3">
              <NumberField id="winners-per-draw" label="Per draw" value={draft.winners_per_draw} min={1} max={50} onChange={(value) => onChange({ winners_per_draw: value })} />
              <NumberField id="winner-quota" label="Total quota" value={draft.winner_quota} min={1} max={500} onChange={(value) => onChange({ winner_quota: value })} />
              <NumberField id="backup-per-draw" label="Backups" value={draft.backup_per_draw} min={0} max={20} onChange={(value) => onChange({ backup_per_draw: value })} />
            </div>
            <p className="text-body-medium text-on-surface-variant">
              A quota higher than the winners per draw means this prize is drawn several times.
              Backups are drawn at the same time and used if a main winner is absent.
            </p>
          </DetailSection>

          <DetailSection title="Who enters the draw">
            <SegmentedButton<"participants" | "entries">
              label="Name source"
              value={draft.source}
              onChange={(value) => onChange({ source: value })}
              options={[{ value: "participants", label: "Event participants" }, { value: "entries", label: "Entry list" }]}
              className="w-full"
            />

            {draft.source === "entries" ? (
              <Field label="Entry list to draw from" htmlFor="entry-group" hint={groups.length === 0 ? "No entry lists yet. Create one in the Entry lists tab." : undefined}>
                <select id="entry-group" value={draft.entry_group_id ?? 0} onChange={(event) => onChange({ entry_group_id: Number(event.target.value) || null })} className={INPUT}>
                  <option value={0}>Choose an entry list</option>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name} ({group.entry_count} {group.entry_count === 1 ? "row" : "rows"})</option>)}
                </select>
              </Field>
            ) : (
              <>
                <div>
                  <p className="mb-1.5 text-body-medium font-medium">Eligibility conditions</p>
                  <UndianConditionBuilder
                    value={draft.conditions}
                    participantTypes={preview?.participant_types ?? []}
                    rsvpStatuses={preview?.rsvp_statuses ?? []}
                    companies={preview?.companies ?? []}
                    sessions={previewFailed ? null : preview?.attendance_sessions}
                    checkpoint={preview?.checkpoint}
                    answerFields={preview?.answer_fields}
                    onRetrySessions={onRetrySessions}
                    onChange={(next) => onChange({ conditions: next })}
                  />
                </div>
                <PoolPreview preview={preview} failed={previewFailed} />
              </>
            )}

            <Field label="Can participants win again?" htmlFor="exclude-scope">
              <select id="exclude-scope" value={draft.exclude_scope} onChange={(event) => onChange({ exclude_scope: event.target.value as ExcludeScope })} className={INPUT}>
                {Object.entries(EXCLUDE_SCOPE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </Field>
          </DetailSection>

          {draft.source === "participants" ? (
            <DetailSection title="Winning chances">
              <SegmentedButton<WeightMode>
                label="How chances are calculated"
                value={draft.weight_mode}
                onChange={(value) => onChange({ weight_mode: value })}
                options={[
                  { value: "equal", label: "Equal chances" },
                  { value: "bonus", label: "Bonus tickets" },
                  // Hadiah lama yang memakai rumus tetap bisa melihat dan
                  // mempertahankannya; hadiah lain tidak ditawari.
                  ...(legacyFormula ? [{ value: "formula" as const, label: "Legacy formula" }] : []),
                ]}
                className="w-full"
              />
              {draft.weight_mode === "bonus" ? (
                <BonusRules
                  rules={draft.bonus_rules}
                  weightMax={draft.weight_max}
                  winnerQuota={draft.winner_quota}
                  preview={preview}
                  previewFailed={previewFailed}
                  onRetrySessions={onRetrySessions}
                  onChange={(bonus_rules) => onChange({ bonus_rules })}
                  onWeightMax={(weight_max) => onChange({ weight_max })}
                />
              ) : null}
              {draft.weight_mode === "formula" ? (
                <>
                  <Field label="Weight basis" htmlFor="weight-var">
                    <select id="weight-var" value={draft.weight_var} onChange={(event) => onChange({ weight_var: event.target.value as WeightVar })} className={INPUT}>
                      {Object.entries(WEIGHT_VAR_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="Amount for each bonus ticket" htmlFor="weight-divisor">
                    <input
                      id="weight-divisor"
                      value={rupiah(draft.weight_divisor)}
                      onChange={(event) => onChange({ weight_divisor: Number(digitsOnly(event.target.value)) || 1 })}
                      inputMode="numeric"
                      className={cx(INPUT, "tabular-nums")}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField id="weight-base" label="Base tickets" value={draft.weight_base} min={0} max={100} onChange={(value) => onChange({ weight_base: value })} />
                    <NumberField id="weight-max" label="Maximum tickets" value={draft.weight_max} min={1} max={1000} onChange={(value) => onChange({ weight_max: value })} />
                  </div>
                  <p className="text-body-medium text-on-surface-variant">
                    Tickets = {draft.weight_base} + ({WEIGHT_VAR_LABEL[draft.weight_var].toLowerCase()} ÷ {rupiah(draft.weight_divisor)}), up to {draft.weight_max}.
                    The maximum prevents one participant with an extreme value from dominating the pool.
                  </p>
                </>
              ) : null}
            </DetailSection>
          ) : null}
        </form>
      </PaneBody>

      <PaneFooter note={onDelete ? <Button simpan variant="text" size="sm" className="-ml-3 text-error" icon={<Trash size={16} />} disabled={saving} onClick={onDelete}>Delete prize</Button> : undefined}>
        <Button simpan type="submit" form="form-hadiah" size="sm" loading={saving} icon={<FloppyDisk size={16} />}>Save prize</Button>
      </PaneFooter>
    </Pane>
  );
}

/**
 * Rincian penyusutan kolam. Satu angka akhir tidak dapat diperiksa siapa pun;
 * selisih yang terurai bisa, dan kalau salah satunya mengejutkan, panitia tahu
 * persis di mana harus melihat.
 */
function PoolPreview({ preview, failed }: { preview: Preview | null; failed: boolean }) {
  if (!preview) {
    return (
      <p className="rounded-md bg-surface-container-high p-3 text-body-medium text-on-surface-variant" aria-live="polite">
        {failed ? "Could not calculate the participant pool. Change the conditions to try again." : "Calculating participant pool..."}
      </p>
    );
  }
  // Undian akan ditolak selama aturan ini rusak, jadi jumlah nama tidak ditampilkan.
  if (preview.broken_rules && preview.broken_rules.length > 0) {
    return (
      <div className="rounded-md bg-surface-container-high p-3 text-body-medium" aria-live="polite">
        <p className="flex items-start gap-1.5 text-title-medium font-semibold text-error">
          <Warning size={20} className="mt-0.5 shrink-0" aria-hidden /> Draw blocked
        </p>
        <p className="mt-1.5 text-on-surface-variant">{ruleBrokenMessage(preview.broken_rules)}</p>
      </div>
    );
  }
  return (
    <div className="rounded-md bg-surface-container-high p-3 text-body-medium" aria-live="polite">
      <p className="text-title-medium font-semibold tabular-nums">{preview.available} {preview.available === 1 ? "name" : "names"} ready to draw</p>
      <ul className="mt-1.5 space-y-0.5 tabular-nums text-on-surface-variant">
        <li>{preview.total_participants} active {preview.total_participants === 1 ? "participant" : "participants"}</li>
        {preview.breakdown.failed_conditions > 0 ? <li>− {preview.breakdown.failed_conditions} {preview.breakdown.failed_conditions === 1 ? "does" : "do"} not meet the conditions</li> : null}
        {preview.breakdown.by_rules > 0 ? (
          <li>
            − {preview.breakdown.by_rules} excluded by rules
            {preview.breakdown.rule_hits.length > 0 ? ` (${preview.breakdown.rule_hits.map((hit) => `${hit.rule_name}: ${hit.count}`).join(", ")})` : ""}
          </li>
        ) : null}
        {preview.breakdown.by_manual > 0 ? <li>− {preview.breakdown.by_manual} individually excluded</li> : null}
        {preview.breakdown.by_previous_wins > 0 ? <li>− {preview.breakdown.by_previous_wins} already won</li> : null}
      </ul>
      {preview.max_tickets > 1 ? (
        <p className="mt-1.5 tabular-nums text-on-surface-variant">
          {preview.total_tickets} total {preview.total_tickets === 1 ? "ticket" : "tickets"}, highest chance {(preview.top_share * 100).toFixed(1)}%
        </p>
      ) : null}
      {preview.available === 0 ? (
        <p className="mt-1.5 flex items-start gap-1.5 font-medium text-error">
          <Warning size={16} className="mt-0.5 shrink-0" aria-hidden /> Empty pool. Draw requests will be rejected.
        </p>
      ) : null}
      {preview.sample.length > 0 ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer rounded-sm font-medium text-primary">View sample names</summary>
          <ul className="mt-1.5 space-y-0.5 text-on-surface-variant">
            {preview.sample.map((row, index) => (
              <li key={index} className="tabular-nums">
                {row.name}{row.company ? `, ${row.company}` : ""}
                {row.tickets > 1 ? ` (${row.tickets} tickets)` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
