"use client";

import { FloppyDisk, Trash, UploadSimple, Warning, X } from "@phosphor-icons/react";
import { Button, DetailSection, IconButton, Pane, PaneBody, PaneFooter, PaneHeader, SegmentedButton, Switch } from "@/components/m3";
import { ImagePreview } from "@/components/admin/image-preview";
import { UndianConditionBuilder } from "@/components/admin/undian-condition-builder";
import {
  ANIMATIONS, EXCLUDE_SCOPE_LABEL, SPIN_MODES, WEIGHT_VAR_LABEL,
  type ExcludeScope, type SpinMode, type UndianAnimation, type UndianPrize, type WeightVar,
} from "@/lib/undian";
import { cx } from "@/lib/m3/cx";
import { Field, INPUT, NumberField, PaneError, UploadButton } from "./form";
import type { EntryGroup, Preview } from "./types";

type Draft = Omit<UndianPrize, "id">;

const rupiah = (value: number) => new Intl.NumberFormat("id-ID").format(value);
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
  draft, isNew, groups, preview, previewFailed, saving, uploading, error,
  onChange, onSave, onClose, onUpload, onDelete,
}: {
  draft: Draft; isNew: boolean; groups: EntryGroup[]; preview: Preview | null; previewFailed: boolean;
  saving: boolean; uploading: boolean; error: string;
  onChange: (changes: Partial<Draft>) => void;
  onSave: () => void; onClose: () => void; onUpload: (file: File) => void;
  /** Tidak ada untuk hadiah baru. */
  onDelete?: () => void;
}) {
  const animasi = ANIMATIONS.find((item) => item.value === draft.animation);
  const modeBerhenti = SPIN_MODES.find((item) => item.value === draft.spin_mode);

  return (
    <Pane as="aside" aria-label={isNew ? "Hadiah baru" : `Detail ${draft.name || "hadiah"}`}>
      <PaneHeader className="px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-title-medium font-semibold">{isNew ? "Hadiah baru" : draft.name || "Tanpa nama"}</h2>
          {draft.sponsor_name ? <p className="truncate text-body-medium text-on-surface-variant">Sponsor {draft.sponsor_name}</p> : null}
        </div>
        <IconButton size="sm" label="Tutup detail hadiah" onClick={onClose} disabled={saving}><X size={16} /></IconButton>
      </PaneHeader>

      <PaneBody>
        <form id="form-hadiah" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
          {error ? <div className="px-5 pt-4"><PaneError>{error}</PaneError></div> : null}

          <DetailSection title="Hadiah">
            <Switch
              checked={draft.is_active}
              onChange={(checked) => onChange({ is_active: checked })}
              label="Aktif"
              description="Hadiah nonaktif tidak muncul di panel operator."
            />
            <Field label="Nama hadiah" htmlFor="prize-name">
              <input id="prize-name" value={draft.name} onChange={(event) => onChange({ name: event.target.value })} className={INPUT} placeholder="Sepeda listrik" />
            </Field>
            <Field label="Sponsor" htmlFor="prize-sponsor">
              <input id="prize-sponsor" value={draft.sponsor_name ?? ""} onChange={(event) => onChange({ sponsor_name: event.target.value || null })} className={INPUT} placeholder="Opsional" />
            </Field>
            <Field label="Keterangan" htmlFor="prize-description" hint="Tampil di bawah nama hadiah di layar panggung.">
              <input id="prize-description" value={draft.description ?? ""} onChange={(event) => onChange({ description: event.target.value || null })} className={INPUT} placeholder="Opsional" />
            </Field>
            <div>
              <p className="text-body-medium font-medium">Gambar hadiah</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {/* Pratinjau, bukan sekadar tombol yang berubah menjadi "Ganti".
                    Tombol memberi tahu bahwa ADA gambar, bukan gambar YANG MANA. */}
                {draft.image_url ? <ImagePreview url={draft.image_url} alt="Pratinjau gambar hadiah" className="h-16 w-16" /> : null}
                <UploadButton label={draft.image_url ? "Ganti gambar" : "Unggah gambar"} accept="image/*" busy={uploading} onFile={onUpload} icon={<UploadSimple size={16} />} />
                {draft.image_url ? <Button variant="text" size="sm" className="text-error" onClick={() => onChange({ image_url: null })}>Hapus gambar</Button> : null}
              </div>
            </div>
          </DetailSection>

          <DetailSection title="Cara mengundi">
            <Field label="Animasi" htmlFor="prize-animation" hint={animasi?.hint}>
              <select id="prize-animation" value={draft.animation} onChange={(event) => onChange({ animation: event.target.value as UndianAnimation })} className={INPUT}>
                {ANIMATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </Field>

            {/* Pilihan berhenti hanya berarti bila ADA animasi. Mode `instant`
                menampilkan pemenang seketika, jadi tidak ada apa pun untuk
                dihentikan. */}
            {draft.animation !== "instant" ? (
              <div>
                <p className="text-body-medium font-medium">Berhenti</p>
                <SegmentedButton<SpinMode>
                  label="Kapan animasi berhenti"
                  value={draft.spin_mode}
                  onChange={(value) => onChange({ spin_mode: value })}
                  options={SPIN_MODES.map((item) => ({ value: item.value, label: item.value === "timed" ? "Otomatis" : "Manual" }))}
                  className="mt-1.5 w-full"
                />
                <p className="mt-1 text-body-medium text-on-surface-variant">{modeBerhenti?.hint}</p>
                {draft.spin_mode === "timed" ? (
                  <div className="mt-3">
                    <label htmlFor="spin-seconds" className="block text-body-medium font-medium">Durasi animasi: <span className="tabular-nums">{draft.spin_seconds.toFixed(1)}</span> detik</label>
                    <input id="spin-seconds" type="range" min={1} max={30} step={0.5} value={draft.spin_seconds} onChange={(event) => onChange({ spin_seconds: Number.parseFloat(event.target.value) })} className="mt-2 w-full accent-[var(--md-sys-color-primary)]" />
                  </div>
                ) : (
                  <p className="mt-3 flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
                    <Warning size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                    <span>Undian tidak selesai sendiri. Operator wajib menekan tombol berhenti di panel operator. Pemenang sudah tersimpan sejak tombol Undi ditekan, jadi tidak ada yang hilang bila peramban tertutup. Jeda tampil pemenang tidak berlaku pada mode ini.</span>
                  </p>
                )}
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-3">
              <NumberField id="winners-per-draw" label="Per undi" value={draft.winners_per_draw} min={1} max={50} onChange={(value) => onChange({ winners_per_draw: value })} />
              <NumberField id="winner-quota" label="Total kuota" value={draft.winner_quota} min={1} max={500} onChange={(value) => onChange({ winner_quota: value })} />
              <NumberField id="backup-per-draw" label="Cadangan" value={draft.backup_per_draw} min={0} max={20} onChange={(value) => onChange({ backup_per_draw: value })} />
            </div>
            <p className="text-body-medium text-on-surface-variant">
              Kuota lebih besar dari pemenang per undi berarti hadiah ini diundi beberapa kali.
              Cadangan ikut diundi bersamaan, dipakai bila pemenang utama tidak ada di tempat.
            </p>
          </DetailSection>

          <DetailSection title="Siapa yang diundi">
            <SegmentedButton<"participants" | "entries">
              label="Sumber nama"
              value={draft.source}
              onChange={(value) => onChange({ source: value })}
              options={[{ value: "participants", label: "Peserta acara" }, { value: "entries", label: "Daftar import" }]}
              className="w-full"
            />

            {draft.source === "entries" ? (
              <Field label="Daftar yang diundi" htmlFor="entry-group" hint={groups.length === 0 ? "Belum ada daftar. Buat di tab Daftar import." : undefined}>
                <select id="entry-group" value={draft.entry_group_id ?? 0} onChange={(event) => onChange({ entry_group_id: Number(event.target.value) || null })} className={INPUT}>
                  <option value={0}>Pilih daftar</option>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name} ({group.entry_count} baris)</option>)}
                </select>
              </Field>
            ) : (
              <>
                <div>
                  <p className="mb-1.5 text-body-medium font-medium">Syarat kelayakan</p>
                  <UndianConditionBuilder
                    value={draft.conditions}
                    participantTypes={preview?.participant_types ?? []}
                    rsvpStatuses={preview?.rsvp_statuses ?? []}
                    companies={preview?.companies ?? []}
                    onChange={(next) => onChange({ conditions: next })}
                  />
                </div>
                <PoolPreview preview={preview} failed={previewFailed} />
              </>
            )}

            <Field label="Boleh menang lagi?" htmlFor="exclude-scope">
              <select id="exclude-scope" value={draft.exclude_scope} onChange={(event) => onChange({ exclude_scope: event.target.value as ExcludeScope })} className={INPUT}>
                {Object.entries(EXCLUDE_SCOPE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </Field>
          </DetailSection>

          {draft.source === "participants" ? (
            <DetailSection title="Peluang menang">
              <SegmentedButton<"equal" | "formula">
                label="Cara menghitung peluang"
                value={draft.weight_mode}
                onChange={(value) => onChange({ weight_mode: value })}
                options={[{ value: "equal", label: "Sama rata" }, { value: "formula", label: "Berbobot" }]}
                className="w-full"
              />
              {draft.weight_mode === "formula" ? (
                <>
                  <Field label="Dasar bobot" htmlFor="weight-var">
                    <select id="weight-var" value={draft.weight_var} onChange={(event) => onChange({ weight_var: event.target.value as WeightVar })} className={INPUT}>
                      {Object.entries(WEIGHT_VAR_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="Setiap berapa dapat 1 tiket tambahan" htmlFor="weight-divisor">
                    <input
                      id="weight-divisor"
                      value={rupiah(draft.weight_divisor)}
                      onChange={(event) => onChange({ weight_divisor: Number(digitsOnly(event.target.value)) || 1 })}
                      inputMode="numeric"
                      className={cx(INPUT, "tabular-nums")}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField id="weight-base" label="Tiket dasar" value={draft.weight_base} min={0} max={100} onChange={(value) => onChange({ weight_base: value })} />
                    <NumberField id="weight-max" label="Tiket maksimum" value={draft.weight_max} min={1} max={1000} onChange={(value) => onChange({ weight_max: value })} />
                  </div>
                  <p className="text-body-medium text-on-surface-variant">
                    Tiket = {draft.weight_base} + ({WEIGHT_VAR_LABEL[draft.weight_var].toLowerCase()} ÷ {rupiah(draft.weight_divisor)}), maksimal {draft.weight_max}.
                    Batas maksimum menjaga satu peserta dengan angka ekstrem tidak menguasai kolam.
                  </p>
                </>
              ) : null}
            </DetailSection>
          ) : null}
        </form>
      </PaneBody>

      <PaneFooter note={onDelete ? <Button simpan variant="text" size="sm" className="-ml-3 text-error" icon={<Trash size={16} />} disabled={saving} onClick={onDelete}>Hapus hadiah</Button> : undefined}>
        <Button simpan type="submit" form="form-hadiah" size="sm" loading={saving} icon={<FloppyDisk size={16} />}>Simpan hadiah</Button>
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
        {failed ? "Kolam peserta gagal dihitung. Ubah syarat untuk mencoba lagi." : "Menghitung kolam peserta..."}
      </p>
    );
  }
  return (
    <div className="rounded-md bg-surface-container-high p-3 text-body-medium" aria-live="polite">
      <p className="text-title-medium font-semibold tabular-nums">{preview.available} nama siap diundi</p>
      <ul className="mt-1.5 space-y-0.5 tabular-nums text-on-surface-variant">
        <li>{preview.total_participants} peserta aktif</li>
        {preview.breakdown.failed_conditions > 0 ? <li>− {preview.breakdown.failed_conditions} tidak memenuhi syarat</li> : null}
        {preview.breakdown.by_rules > 0 ? (
          <li>
            − {preview.breakdown.by_rules} kena aturan pengecualian
            {preview.breakdown.rule_hits.length > 0 ? ` (${preview.breakdown.rule_hits.map((hit) => `${hit.rule_name}: ${hit.count}`).join(", ")})` : ""}
          </li>
        ) : null}
        {preview.breakdown.by_manual > 0 ? <li>− {preview.breakdown.by_manual} dikecualikan per orang</li> : null}
        {preview.breakdown.by_previous_wins > 0 ? <li>− {preview.breakdown.by_previous_wins} sudah pernah menang</li> : null}
      </ul>
      {preview.max_tickets > 1 ? (
        <p className="mt-1.5 tabular-nums text-on-surface-variant">
          {preview.total_tickets} total tiket, peluang tertinggi {(preview.top_share * 100).toFixed(1)}%
        </p>
      ) : null}
      {preview.available === 0 ? (
        <p className="mt-1.5 flex items-start gap-1.5 font-medium text-error">
          <Warning size={16} className="mt-0.5 shrink-0" aria-hidden /> Kolam kosong. Tombol undi akan ditolak.
        </p>
      ) : null}
      {preview.sample.length > 0 ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer rounded-sm font-medium text-primary">Lihat contoh nama</summary>
          <ul className="mt-1.5 space-y-0.5 text-on-surface-variant">
            {preview.sample.map((row, index) => (
              <li key={index} className="tabular-nums">
                {row.name}{row.company ? `, ${row.company}` : ""}
                {row.tickets > 1 ? ` (${row.tickets} tiket)` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
