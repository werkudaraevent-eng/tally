"use client";

import { ArrowDown, ArrowUp, FloppyDisk, Trash, UploadSimple, Warning, X } from "@phosphor-icons/react";
import { Button, DetailSection, IconButton, Pane, PaneBody, PaneFooter, PaneHeader, SegmentedButton, Switch, TextArea } from "@/components/m3";
import { CATATAN_HADIAH_MAX } from "@/lib/member/hadiah";
import { ImagePreview } from "@/components/admin/image-preview";
import { UndianConditionBuilder } from "@/components/admin/undian-condition-builder";
import {
  AFTER_WIN_TEXT, ANIM_SPEEDS, ANIMATIONS, EXCLUDE_SCOPE_LABEL, SPEED_ANIMATIONS, SPIN_MODES, maxWinnersPerDraw, STAGE_NOTE_MAX, WEIGHT_VAR_LABEL, ruleBrokenMessage,
  type AfterWin, type AnimSpeed, type BonusRule, type ExcludeScope, type SpinMode, type UndianPrize, type WallNames, type WallTiles, type WeightMode, type WeightVar,
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
  onChange, onSave, onClose, onUpload, onDelete, onRetrySessions, onPreviewRules, onNewEntryList, stage, order,
}: {
  draft: Draft; isNew: boolean; legacyFormula: boolean; groups: EntryGroup[]; preview: Preview | null; previewFailed: boolean;
  saving: boolean; uploading: boolean; error: string;
  onChange: (changes: Partial<Draft>) => void;
  onSave: () => void; onClose: () => void; onUpload: (file: File) => void;
  /** Tidak ada untuk hadiah baru. */
  onDelete?: () => void;
  /** Membuka dialog import daftar entri tanpa meninggalkan editor. */
  onNewEntryList?: () => void;
  onRetrySessions?: () => void;
  /** Pratinjau kolam dengan aturan tiket yang belum disimpan (dialog aturan tiket). */
  onPreviewRules?: (rules: BonusRule[]) => Promise<Preview | null>;
  stage: StageLook;
  /**
   * Urutan undi (run of show). Tidak ada untuk hadiah baru: hadiah baru selalu
   * masuk di urutan terakhir, dan memindahkannya baru masuk akal setelah ada.
   */
  order?: { position: number; total: number; moving: boolean; onMove: (direction: "up" | "down") => void };
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
            {order && order.total > 1 ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="text-body-medium font-medium">Draw order</p>
                  <p className="text-body-medium tabular-nums text-on-surface-variant">{order.position} of {order.total} prizes{draft.is_active ? "" : ", hidden while inactive"}</p>
                </div>
                <div className="flex gap-2">
                  <Button simpan type="button" variant="outlined" size="sm" icon={<ArrowUp size={16} />} disabled={saving || order.moving || order.position <= 1} onClick={() => order.onMove("up")}>Move up</Button>
                  <Button simpan type="button" variant="outlined" size="sm" icon={<ArrowDown size={16} />} disabled={saving || order.moving || order.position >= order.total} onClick={() => order.onMove("down")}>Move down</Button>
                </div>
              </div>
            ) : null}
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
              hint="Shown to the winner on Participant home after you confirm them, as typed on every language page. Leave empty to use the default in Participant area › Lucky draw prize."
            />
          </DetailSection>

          <DetailSection title="Draw settings">
            <AnimationPicker
              // Terowongan dan tabung punya batas pemenang per undi; angka yang
              // melewatinya diturunkan saat animasi dipilih, bukan ditolak saat Save.
              value={draft.animation}
              onChange={(value) => onChange({ animation: value, winners_per_draw: Math.min(draft.winners_per_draw, maxWinnersPerDraw(value)) })}
              spinMode={draft.spin_mode} spinSeconds={draft.spin_seconds} winnersPerDraw={draft.winners_per_draw}
              sampleNames={(preview?.sample ?? []).map((row) => row.name)} stage={stage}
              wallNames={draft.wall_names} wallTiles={draft.wall_tiles} speed={draft.anim_speed}
            />

            {/* Spotlight wall saja: nama di dinding selama undian. Inisial
                dibentuk di server (api/undian/control), jadi nama lengkap kolam
                tidak sampai ke layar publik. */}
            {draft.animation === "wall" ? (
              <div>
                <p className="text-body-medium font-medium">Names on the wall</p>
                <SegmentedButton<WallNames>
                  label="Names on the wall while drawing"
                  value={draft.wall_names}
                  onChange={(value) => onChange({ wall_names: value })}
                  options={[{ value: "full", label: "Full names" }, { value: "initials", label: "Initials" }]}
                  className="mt-1.5 w-full"
                />
                <p className="mt-1 text-body-medium text-on-surface-variant">
                  {draft.wall_names === "initials"
                    ? "The wall shows two letters per person, such as \"A.W.\", and the full name appears only on the winner card. Use it when the guest list should not be on screen."
                    : "Everyone sees their own name on the wall before the draw lands. The winner card always shows the full name."}
                </p>
                <p className="mt-4 text-body-medium font-medium">Wall size</p>
                <SegmentedButton<WallTiles>
                  label="Tiles on the wall"
                  value={draft.wall_tiles}
                  onChange={(value) => onChange({ wall_tiles: value })}
                  options={[{ value: "all", label: "One tile per person" }, { value: "fixed", label: "Full wall, names rotate" }]}
                  className="mt-1.5 w-full"
                />
                <p className="mt-1 text-body-medium text-on-surface-variant">
                  {draft.wall_tiles === "fixed"
                    ? "The wall is always full, whatever the number in the draw, and names keep changing on the tiles. Guests cannot count the tiles to work out how many are in the draw."
                    : "Each person in the draw has one tile, so the number of tiles is the number in the draw."}
                </p>
              </div>
            ) : null}

            {/* Kecepatan gerak hanya untuk animasi yang memakainya (SPEED_ANIMATIONS). */}
            {SPEED_ANIMATIONS.includes(draft.animation) ? (
              <div>
                <p className="text-body-medium font-medium">Speed</p>
                <SegmentedButton<AnimSpeed>
                  label={draft.animation === "drum" ? "How fast the balls are blown around" : "How fast the names fly"}
                  value={draft.anim_speed}
                  onChange={(value) => onChange({ anim_speed: value })}
                  options={ANIM_SPEEDS}
                  className="mt-1.5 w-full"
                />
                <p className="mt-1 text-body-medium text-on-surface-variant">
                  {draft.animation === "drum"
                    ? "How hard the air blows the balls around the drum while drawing. How long the draw lasts is set under Stop."
                    : "How fast names fly through the tunnel while drawing. How long the draw lasts is set under Stop."}
                </p>
              </div>
            ) : null}

            {/* Pilihan berhenti hanya berarti bila ADA animasi. Mode `instant`
                menampilkan pemenang seketika, jadi tidak ada apa pun untuk
                dihentikan. */}
            {draft.animation !== "instant" ? (
              <div>
                <p className="text-body-medium font-medium">Stop</p>
                {draft.animation === "cahaya" ? (
                  <p className="mt-1 text-body-medium text-on-surface-variant">
                    Phone lights always stops on its own: the dark waves on every phone are timed to this duration.
                  </p>
                ) : (
                  <>
                    <SegmentedButton<SpinMode>
                      label="When the animation stops"
                      value={draft.spin_mode}
                      onChange={(value) => onChange({ spin_mode: value })}
                      options={SPIN_MODES.map((item) => ({ value: item.value, label: item.value === "timed" ? "Automatic" : "Manual" }))}
                      className="mt-1.5 w-full"
                    />
                    <p className="mt-1 text-body-medium text-on-surface-variant">{modeBerhenti?.hint}</p>
                  </>
                )}
                {draft.spin_mode === "timed" || draft.animation === "cahaya" ? (
                  <div className="mt-3">
                    <label htmlFor="spin-seconds" className="block text-body-medium font-medium">Animation duration: <span className="tabular-nums">{draft.spin_seconds.toFixed(1)}</span> {draft.spin_seconds === 1 ? "second" : "seconds"}</label>
                    <input id="spin-seconds" type="range" min={1} max={30} step={0.5} value={draft.spin_seconds} onChange={(event) => onChange({ spin_seconds: Number.parseFloat(event.target.value) })} className="mt-2 w-full accent-[var(--md-sys-color-primary)]" />
                    {draft.animation === "arena" && draft.spin_seconds < 15 ? (
                      <p className="mt-1 text-body-medium text-warning">
                        Elimination arena needs about 20 seconds for the crowd to shrink over several rounds. Shorter than that, most of the crowd drops in a single round.
                      </p>
                    ) : null}
                    {draft.animation === "cahaya" && draft.spin_seconds < 15 ? (
                      <p className="mt-1 text-body-medium text-warning">
                        Phone lights needs about 20 seconds for the colour show and several dark waves. A duration under 12 seconds is lengthened to 12 when you draw.
                      </p>
                    ) : null}
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
              <NumberField id="winners-per-draw" label="Per draw" value={draft.winners_per_draw} min={1} max={maxWinnersPerDraw(draft.animation)} onChange={(value) => onChange({ winners_per_draw: value })} />
              <NumberField id="winner-quota" label="Total quota" value={draft.winner_quota} min={1} max={500} onChange={(value) => onChange({ winner_quota: value })} />
              <NumberField id="backup-per-draw" label="Backups" value={draft.backup_per_draw} min={0} max={20} onChange={(value) => onChange({ backup_per_draw: value })} />
            </div>
            <p className="text-body-medium text-on-surface-variant">
              A quota higher than the winners per draw means this prize is drawn several times.
              Backups are drawn at the same time and used if a main winner is absent.
            </p>
            {maxWinnersPerDraw(draft.animation) < 50 ? (
              <p className="text-body-medium text-on-surface-variant">
                {draft.animation === "arena"
                  ? `Elimination arena ends on a podium that fits ${maxWinnersPerDraw(draft.animation)} winners per draw.`
                  : `${ANIMATIONS.find((item) => item.value === draft.animation)?.label ?? "This animation"} reveals winners one at a time, so it takes up to ${maxWinnersPerDraw(draft.animation)} winners per draw.`}
                {" "}For more winners, raise the quota and draw again.
              </p>
            ) : null}
          </DetailSection>

          {/* Tulisan layar panggung setelah nama keluar (stageMessage di
              lib/undian). Bawaan "Nothing" = layar seperti sebelumnya. */}
          <DetailSection title="After the winner is revealed">
            <SegmentedButton<AfterWin>
              label="Text on the stage screen"
              value={draft.after_win}
              onChange={(value) => onChange({ after_win: value })}
              options={[
                { value: "none", label: "Nothing" },
                { value: "stage", label: "To the stage" },
                { value: "desk", label: "At the desk" },
              ]}
              className="w-full"
            />
            {draft.after_win === "none" ? (
              <p className="text-body-medium text-on-surface-variant">The stage screen shows only the winner names. Choose To the stage for a prize handed over on stage, or At the desk for a prize collected at the committee desk.</p>
            ) : (
              <TextArea
                label="Your own text"
                optional
                rows={2}
                counter
                maxLength={STAGE_NOTE_MAX}
                value={draft.stage_note ?? ""}
                onChange={(event) => onChange({ stage_note: event.target.value || null })}
                placeholder={AFTER_WIN_TEXT[draft.after_win]}
                hint={`Shown under the winner names once they are revealed. Leave empty to show "${AFTER_WIN_TEXT[draft.after_win]}".`}
              />
            )}
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
              <div className="flex flex-col gap-2">
                {groups.length > 0 ? (
                  <Field label="Entry list to draw from" htmlFor="entry-group">
                    <select id="entry-group" value={draft.entry_group_id ?? 0} onChange={(event) => onChange({ entry_group_id: Number(event.target.value) || null })} className={INPUT}>
                      <option value={0}>Choose an entry list</option>
                      {groups.map((group) => <option key={group.id} value={group.id}>{group.name} ({group.entry_count} {group.entry_count === 1 ? "row" : "rows"})</option>)}
                    </select>
                  </Field>
                ) : (
                  <p className="text-body-medium text-on-surface-variant">No entry lists yet. Import one from a file or pasted text; your prize details stay as they are.</p>
                )}
                {onNewEntryList ? (
                  <Button type="button" variant="outlined" size="sm" className="self-start" icon={<UploadSimple size={16} />} onClick={onNewEntryList}>
                    Import a new list
                  </Button>
                ) : null}
              </div>
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
                  onPreviewRules={onPreviewRules}
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
