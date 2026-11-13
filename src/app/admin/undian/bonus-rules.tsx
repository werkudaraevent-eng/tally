"use client";

import { Check, DownloadSimple, MagnifyingGlass, Minus, Plus, UploadSimple, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, ButtonLink, Dialog, SegmentedButton, TextField } from "@/components/m3";
import { UndianConditionBuilder } from "@/components/admin/undian-condition-builder";
import { cx } from "@/lib/m3/cx";
import { BONUS_TEMPLATE_HEADERS } from "@/lib/undian-bonus-list";
import {
  BONUS_LIST_MAX, BONUS_RULES_MAX, BONUS_TICKETS_MAX, EMPTY_CONDITIONS, describeConditions,
  type BonusRule, type UndianConditionGroup,
} from "@/lib/undian";
import { NumberField, PaneError, UploadButton } from "./form";
import type { Preview } from "./types";

/**
 * Bagian "Tiket tambahan" pada Peluang menang.
 *
 * Semua peserta mulai dengan 1 tiket; setiap aturan menambah tiket bagi yang
 * cocok, lalu dijumlahkan dan dibatasi Tiket maksimum. Aturan diedit di dialog
 * tiga langkah (aturan, upload daftar, cek hasil) dan tersimpan bersama hadiah
 * lewat "Simpan hadiah", sama seperti isian hadiah lain.
 */
export function BonusRules({
  rules, weightMax, winnerQuota, preview, previewFailed, onRetrySessions, onPreviewRules, onChange, onWeightMax,
}: {
  rules: BonusRule[]; weightMax: number; winnerQuota: number;
  preview: Preview | null; previewFailed: boolean;
  onRetrySessions?: () => void;
  onPreviewRules?: (rules: BonusRule[]) => Promise<Preview | null>;
  onChange: (rules: BonusRule[]) => void; onWeightMax: (value: number) => void;
}) {
  const [editing, setEditing] = useState<{ index: number | null; startAt: Step } | null>(null);
  const [names, setNames] = useState<BonusRule | null>(null);
  // Kartu aturan menulis "+N tiket" apa adanya; tanpa catatan ini, batas
  // maksimum memotong tiket diam-diam (+20 dengan maksimum 10 menjadi 10).
  const fullTickets = 1 + rules.reduce((sum, rule) => sum + rule.tickets, 0);
  const answerLabels = Array.isArray(preview?.answer_fields) ? Object.fromEntries(preview.answer_fields.map((item) => [item.key, item.label])) : undefined;
  const sessionNames = preview?.attendance_sessions ? Object.fromEntries(preview.attendance_sessions.map((item) => [item.id, item.name])) : null;

  function save(rule: BonusRule) {
    if (!editing) return;
    onChange(editing.index === null ? [...rules, rule] : rules.map((item, index) => (index === editing.index ? rule : item)));
    setEditing(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {rules.length === 0 ? (
        <div className="flex flex-col items-start gap-2.5 rounded-md border border-dashed border-outline p-4">
          <p className="text-body-medium font-semibold">No ticket rules yet</p>
          <p className="text-body-medium text-on-surface-variant">
            All participants start with 1 ticket. Add rules to give extra tickets to selected participants, such as the organisers’ VIP list or those attending a particular session.
          </p>
          <Button type="button" size="sm" icon={<Plus size={16} />} onClick={() => setEditing({ index: null, startAt: "rule" })}>Add ticket rule</Button>
        </div>
      ) : (
        <>
          <p className="text-body-medium text-on-surface-variant">All participants start with 1 ticket. Bonus tickets from the rules below are added together.</p>
          <ul className="flex flex-col gap-2">
            {rules.map((rule, index) => (
              <li key={index} className="flex flex-col gap-1.5 rounded-md border border-outline-variant bg-surface-container-lowest p-3 text-body-medium">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 break-words font-semibold">{rule.name}</p>
                  <p className="shrink-0 font-bold tabular-nums text-primary">+{rule.tickets} {rule.tickets === 1 ? "ticket" : "tickets"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="rounded-sm bg-surface-container-high px-2 py-0.5 text-body-small font-medium text-on-surface-variant">
                    {rule.source === "list" ? "Organisers’ list" : "Conditions"}
                  </span>
                  <span className="min-w-0 break-words text-on-surface-variant">
                    {rule.source === "list"
                      ? [`${rule.participant_ids.length.toLocaleString("en-GB")} ${rule.participant_ids.length === 1 ? "person" : "people"}`, rule.file_name ?? "Picked by name", uploadedLabel(rule.uploaded_at)].filter(Boolean).join(" · ")
                      : `${describeConditions(rule.conditions, sessionNames, answerLabels)}${preview?.bonus_rule_counts ? ` · ${(preview.bonus_rule_counts[index] ?? 0).toLocaleString("en-GB")} ${(preview.bonus_rule_counts[index] ?? 0) === 1 ? "person" : "people"}` : ""}`}
                  </span>
                </div>
                <div className="-ml-2 flex flex-wrap">
                  {rule.source === "list" ? (
                    <>
                      <Button type="button" variant="text" size="sm" onClick={() => setNames(rule)}>View names</Button>
                      <Button type="button" variant="text" size="sm" onClick={() => setEditing({ index, startAt: "upload" })}>Change people</Button>
                    </>
                  ) : null}
                  <Button type="button" variant="text" size="sm" onClick={() => setEditing({ index, startAt: "rule" })}>Edit</Button>
                  <Button type="button" variant="text" size="sm" className="text-error" onClick={() => onChange(rules.filter((_, i) => i !== index))}>Delete</Button>
                </div>
              </li>
            ))}
          </ul>
          {rules.length < BONUS_RULES_MAX ? (
            <div><Button type="button" variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setEditing({ index: null, startAt: "rule" })}>Add ticket rule</Button></div>
          ) : null}
        </>
      )}

      <div className="max-w-56">
        <NumberField id="bonus-max" label="Maximum tickets per person" value={weightMax} min={1} max={1000} onChange={onWeightMax} />
      </div>
      {fullTickets > weightMax ? (
        <p className="-mt-2 text-body-small text-on-surface-variant">
          Anyone matching all rules gets {weightMax} {weightMax === 1 ? "ticket" : "tickets"}, not {fullTickets}: the maximum ticket limit applies.
        </p>
      ) : null}

      {rules.length > 0 ? <OddsTable rules={rules} preview={preview} failed={previewFailed} winnerQuota={winnerQuota} /> : null}

      {/* Dialog dipasang di luar <form id="form-hadiah">. Di dalamnya, Enter di
          kolom nama aturan atau tombol dialog mana pun ikut mengirim formulir
          hadiah dan menyimpan hadiah yang belum selesai diatur. */}
      {editing ? createPortal(
        <RuleDialog
          key={`${editing.index}-${editing.startAt}`}
          initial={editing.index === null ? null : rules[editing.index]}
          startAt={editing.startAt}
          preview={preview}
          previewFailed={previewFailed}
          onRetrySessions={onRetrySessions}
          chances={onPreviewRules ? { rules, index: editing.index, winnerQuota, weightMax, preview: onPreviewRules } : undefined}
          onClose={() => setEditing(null)}
          onSave={save}
        />,
        document.body,
      ) : null}
      {names && names.source === "list" ? createPortal(<NamesDialog rule={names} onClose={() => setNames(null)} />, document.body) : null}
    </div>
  );
}

function uploadedLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

/**
 * Peluang per kelompok, dari kolam yang benar-benar diundi. "Peluang vs biasa"
 * adalah jumlah tiketnya, karena peserta biasa memegang tepat 1 tiket.
 */
function OddsTable({ rules, preview, failed, winnerQuota }: { rules: BonusRule[]; preview: Preview | null; failed: boolean; winnerQuota: number }) {
  if (!preview?.bonus_groups) {
    return (
      <p className="rounded-md bg-surface-container-high p-3 text-body-medium text-on-surface-variant" aria-live="polite">
        {failed ? "Could not calculate chances. Change the rules to try again." : "Calculating chances..."}
      </p>
    );
  }
  const groups = preview.bonus_groups;
  const total = groups.reduce((sum, group) => sum + group.count * group.tickets, 0);
  const percent = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
  // Satu kalimat per aturan: berapa orang yang terkena, berapa bagian tiket yang
  // mereka pegang, dan perkiraan pemenang dari mereka. Dijumlah per aturan, bukan
  // untuk "semua yang bertiket tambahan", karena aturan luas seperti "hadir di
  // Gala" menenggelamkan angka daftar VIP yang justru ingin diperiksa panitia.
  const perRule = rules.map((rule, index) => {
    const hit = groups.filter((group) => group.rules.includes(index));
    const people = hit.reduce((sum, group) => sum + group.count, 0);
    const share = total > 0 ? hit.reduce((sum, group) => sum + group.count * group.tickets, 0) / total : 0;
    return { name: rule.name, people, share, expected: Math.min(winnerQuota, people, winnerQuota * share) };
  });

  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-container-high p-3 text-body-medium" aria-live="polite">
      <p className="font-semibold">Winning chances</p>
      {groups.length === 0 ? (
        <p className="text-on-surface-variant">No eligible participants yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse tabular-nums">
            <thead>
              <tr className="text-left text-body-small text-on-surface-variant">
                <th className="py-1 pr-2 font-medium">Group</th>
                <th className="py-1 pr-2 text-right font-medium">People</th>
                <th className="py-1 pr-2 text-right font-medium">Tickets</th>
                <th className="py-1 text-right font-medium">Chance vs standard</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.rules.join(",") || "biasa"} className="border-t border-outline-variant align-top">
                  <td className="py-1.5 pr-2 break-words">{group.rules.length === 0 ? "Standard participants" : group.rules.map((index) => rules[index]?.name ?? "").join(" + ")}</td>
                  <td className="py-1.5 pr-2 text-right">{group.count.toLocaleString("en-GB")}</td>
                  <td className="py-1.5 pr-2 text-right">{group.tickets}</td>
                  <td className={cx("py-1.5 text-right", group.tickets > 1 && "font-semibold")}>{group.tickets}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {groups.length > 0 && total > 0 ? (
        <ul className="flex flex-col gap-1">
          {perRule.map((item, index) => (
            <li key={index}>
              {item.people === 0
                ? <><span className="font-medium">{item.name}</span>: no matching participants yet.</>
                : <>
                    <span className="font-medium">{item.name}</span> ({item.people.toLocaleString("en-GB")} {item.people === 1 ? "person" : "people"}) holds <strong>{percent.format(item.share * 100)}% of tickets</strong>.
                    {" "}Of {winnerQuota} {winnerQuota === 1 ? "winner" : "winners"}, an average of <strong>{decimal.format(item.expected)}</strong> will come from this group.
                  </>}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type Step = "rule" | "upload" | "review";

type Person = { participant_id: string; name: string; company: string | null; qr_code?: string | null };
type AddMode = "pick" | "file";

type CheckResult = {
  file_name: string;
  rows_read: number;
  matched: { participant_id: string; name: string; company: string | null }[];
  duplicates: number;
  missing: { row: number; value: string; reason: string }[];
  missing_total: number;
};

/** Dialog tambah atau ubah aturan: Aturan, lalu (untuk daftar) Upload dan Cek hasil. */
function RuleDialog({
  initial, startAt, preview, previewFailed, onRetrySessions, chances, onClose, onSave,
}: {
  initial: BonusRule | null; startAt: Step; preview: Preview | null; previewFailed: boolean;
  onRetrySessions?: () => void;
  chances?: ChanceContext;
  onClose: () => void; onSave: (rule: BonusRule) => void;
}) {
  const [step, setStep] = useState<Step>(startAt);
  const [source, setSource] = useState<BonusRule["source"]>(initial?.source ?? "list");
  const [name, setName] = useState(initial?.name ?? "");
  const [tickets, setTickets] = useState(initial?.tickets ?? 1);
  const [conditions, setConditions] = useState<UndianConditionGroup>(initial?.source === "conditions" ? initial.conditions : EMPTY_CONDITIONS);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<AddMode>(initial?.source === "list" && initial.file_name ? "file" : "pick");
  // Peserta yang dipilih lewat "Pick names". Untuk daftar yang sudah ada, diisi
  // dari server saat langkah 2 dibuka, supaya mengubah daftar dimulai dari isinya.
  const [picked, setPicked] = useState<Person[] | null>(initial?.source === "list" ? null : []);
  const [pickedFailed, setPickedFailed] = useState(false);

  const existingList = initial?.source === "list" ? initial : null;
  const listSteps = source === "list";

  function validRule(): boolean {
    if (!name.trim()) { setError("Enter a rule name."); return false; }
    if (source === "conditions" && conditions.children.length === 0) { setError("Add at least one condition."); return false; }
    setError("");
    return true;
  }

  function saveRule() {
    if (!validRule()) return;
    if (source === "conditions") { onSave({ name: name.trim(), tickets, source, conditions }); return; }
    // Ubah nama atau tiket pada daftar yang sudah ada: berkasnya tetap.
    if (existingList) onSave({ ...existingList, name: name.trim(), tickets });
  }

  async function upload(file: File) {
    setChecking(true); setError("");
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/admin/undian/bonus-list", { method: "POST", body }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setChecking(false);
    if (!response?.ok) {
      setError(data?.error?.details?.fieldErrors?.file?.[0] ?? data?.error?.message ?? "Could not check file. Try again.");
      return;
    }
    setCheck(data as CheckResult);
    setStep("review");
  }

  useEffect(() => {
    if (step !== "upload" || picked !== null || initial?.source !== "list") return;
    let alive = true;
    void fetch("/api/admin/undian/bonus-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_ids: initial.participant_ids }),
    }).then(async (response) => {
      if (!response.ok) throw new Error("load");
      const data = await response.json();
      if (alive) setPicked(data.participants ?? []);
    }).catch(() => { if (alive) setPickedFailed(true); });
    return () => { alive = false; };
  }, [step, picked, initial]);

  // Aturan seperti yang sedang diisi, untuk perkiraan peluang yang ikut bergerak
  // saat tiket, orang, atau syaratnya diubah. Daftar dari berkas memakai hasil
  // cek berkas bila ada, kalau belum: isi daftar lama.
  const candidateIds = mode === "file" && check
    ? check.matched.map((item) => item.participant_id)
    : picked?.map((item) => item.participant_id) ?? (initial?.source === "list" ? initial.participant_ids : []);
  const candidate: BonusRule | null = source === "conditions"
    ? (conditions.children.length > 0 ? { name: name.trim() || "New rule", tickets, source, conditions } : null)
    : (candidateIds.length > 0 ? { name: name.trim() || "New rule", tickets, source: "list", participant_ids: candidateIds, file_name: null, uploaded_at: null } : null);
  const chanceLine = chances ? <ChanceLine context={chances} candidate={candidate} source={source} /> : null;

  function savePicked() {
    if (!picked || picked.length === 0 || !validRule()) return;
    onSave({
      name: name.trim(), tickets, source: "list",
      participant_ids: picked.map((item) => item.participant_id),
      file_name: null, uploaded_at: new Date().toISOString(),
    });
  }

  function saveList() {
    if (!check || check.matched.length === 0) return;
    onSave({
      name: name.trim(), tickets, source: "list",
      participant_ids: check.matched.map((item) => item.participant_id),
      file_name: check.file_name, uploaded_at: new Date().toISOString(),
    });
  }

  const stepper = listSteps ? (
    <ol className="flex flex-wrap gap-x-4 text-body-small text-on-surface-variant" aria-label="Steps">
      {(["rule", "upload", "review"] as const).map((item, index) => (
        <li key={item} aria-current={step === item ? "step" : undefined} className={cx(step === item && "font-semibold text-primary")}>
          {index + 1} {item === "rule" ? "Rule" : item === "upload" ? "Add people" : "Review results"}
        </li>
      ))}
    </ol>
  ) : null;

  let title = initial ? "Edit ticket rule" : "Add ticket rule";
  let actions;
  let content;

  if (step === "rule") {
    actions = (
      <>
        <Button type="button" variant="text" onClick={onClose}>Cancel</Button>
        {source === "list" && existingList ? <Button type="button" variant="outlined" onClick={() => validRule() && setStep("upload")}>Change people</Button> : null}
        {source === "list" && !existingList
          ? <Button type="button" onClick={() => validRule() && setStep("upload")}>Next: add people</Button>
          : <Button type="button" onClick={saveRule}>Save rule</Button>}
      </>
    );
    content = (
      <div className="flex flex-col gap-4 text-body-medium">
        {stepper}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">Who gets bonus tickets?</legend>
          <Choice
            checked={source === "list"}
            onSelect={() => setSource("list")}
            title="List from organisers"
            description="Pick participants by name, or upload an Excel file with QR codes or email addresses. Use it for VIPs, special guests or quiz winners."
          />
          <Choice
            checked={source === "conditions"}
            onSelect={() => setSource("conditions")}
            title="Participants meeting conditions"
            description="From event data: session check-in, checkpoint points, form answers, participant type, company or scan count."
          />
        </fieldset>
        <label className="block font-medium" htmlFor="bonus-name">
          Rule name
          <input
            id="bonus-name"
            value={name}
            maxLength={80}
            placeholder={source === "list" ? "e.g. Organisers’ selected VIPs" : "e.g. Attended the gala dinner"}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 h-9 w-full rounded-md border border-outline bg-surface-container-lowest px-3 font-normal text-on-surface outline-none focus:border-primary"
          />
        </label>
        <div>
          <p className="font-medium" id="bonus-tickets-label">Bonus tickets per person</p>
          <Stepper value={tickets} onChange={setTickets} labelledBy="bonus-tickets-label" />
        </div>
        {source === "list" ? chanceLine : null}
        {source === "conditions" ? (
          <div>
            <p className="mb-1.5 font-medium">Conditions</p>
            <UndianConditionBuilder
              value={conditions}
              participantTypes={preview?.participant_types ?? []}
              rsvpStatuses={preview?.rsvp_statuses ?? []}
              companies={preview?.companies ?? []}
              sessions={previewFailed ? null : preview?.attendance_sessions}
              checkpoint={preview?.checkpoint}
              answerFields={preview?.answer_fields}
              onRetrySessions={onRetrySessions}
              onChange={setConditions}
            />
          </div>
        ) : null}
        {source === "conditions" ? chanceLine : null}
        {error ? <PaneError>{error}</PaneError> : null}
      </div>
    );
  } else if (step === "upload") {
    title = `Add people to ${name.trim()}`;
    const count = picked?.length ?? 0;
    actions = (
      <>
        <Button type="button" variant="text" disabled={checking} onClick={() => { setError(""); setStep("rule"); }}>Back</Button>
        {mode === "pick"
          ? <Button type="button" disabled={count === 0} onClick={savePicked}>{count === 0 ? "Save" : `Save ${count.toLocaleString("en-GB")} ${count === 1 ? "person" : "people"}`}</Button>
          : null}
      </>
    );
    content = (
      <div className="flex flex-col gap-4 text-body-medium">
        {stepper}
        <SegmentedButton<AddMode>
          label="How to add people"
          value={mode}
          onChange={(value) => { setError(""); setMode(value); }}
          options={[{ value: "pick", label: "Pick names" }, { value: "file", label: "Upload file" }]}
          className="w-full"
        />
        {mode === "pick" ? (
          pickedFailed ? <PaneError>Could not load the people on this list. Close and try again.</PaneError>
            : picked === null ? <p className="text-on-surface-variant">Loading names...</p>
            : <PeoplePicker picked={picked} onChange={setPicked} chances={chanceLine} />
        ) : (
        <>
        <div className="flex gap-3">
          <Num>1</Num>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p><span className="font-semibold">Download the template</span> <span className="text-on-surface-variant">and enter one person per row.</span></p>
            <div className="overflow-x-auto rounded-sm border border-outline-variant">
              <table className="w-full border-collapse text-body-small">
                <thead className="bg-surface-container-high">
                  <tr>{BONUS_TEMPLATE_HEADERS.map((head) => <th key={head} className="whitespace-nowrap border border-outline-variant px-2 py-1 text-left font-semibold">{head}</th>)}</tr>
                </thead>
                <tbody>
                  <tr><td className="whitespace-nowrap border border-outline-variant px-2 py-1">KSO-0142</td><td className="border border-outline-variant px-2 py-1" /><td className="whitespace-nowrap border border-outline-variant px-2 py-1">Andi Wijaya</td></tr>
                  <tr><td className="border border-outline-variant px-2 py-1" /><td className="whitespace-nowrap border border-outline-variant px-2 py-1">siti.rahma@contoh.co.id</td><td className="whitespace-nowrap border border-outline-variant px-2 py-1">Siti Rahma</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-on-surface-variant">Enter either the Participant QR or the Email column. The Name column is not used for matching.</p>
            <div>
              {/* `native`: unduhan berkas dari /api, bukan navigasi halaman. */}
              <ButtonLink native variant="outlined" size="sm" href="/api/admin/undian/bonus-list/template" icon={<DownloadSimple size={16} />}>Download template</ButtonLink>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Num>2</Num>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="font-semibold">Upload the completed file</p>
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-outline p-3">
              <UploadButton label={checking ? "Checking..." : "Choose file"} accept=".xlsx,.csv,.txt" busy={checking} icon={<UploadSimple size={16} />} onFile={(file) => void upload(file)} />
              <span className="text-on-surface-variant">.xlsx or .csv, up to 5,000 rows</span>
            </div>
            {error ? <PaneError>{error}</PaneError> : null}
          </div>
        </div>
        </>
        )}
      </div>
    );
  } else if (check) {
    title = `${check.file_name}: ${check.rows_read.toLocaleString("en-GB")} ${check.rows_read === 1 ? "row" : "rows"} read`;
    actions = (
      <>
        <Button type="button" variant="text" onClick={() => { setCheck(null); setStep("upload"); }}>Upload again</Button>
        {check.matched.length > 0 ? <Button type="button" onClick={saveList}>Save {check.matched.length.toLocaleString("en-GB")} {check.matched.length === 1 ? "person" : "people"}</Button> : null}
      </>
    );
    content = (
      <div className="flex flex-col gap-4 text-body-medium">
        {stepper}
        <dl className="flex flex-col gap-1.5">
          <Summary value={check.matched.length} tone="good" label="matched to participants" note={`will receive +${tickets} ${tickets === 1 ? "ticket" : "tickets"}`} />
          {check.duplicates > 0 ? <Summary value={check.duplicates} label="duplicates" note="the same person listed more than once, counted once" /> : null}
          {check.missing_total > 0 ? <Summary value={check.missing_total} tone="bad" label="not found" note="will not receive tickets" /> : null}
        </dl>
        {chanceLine}
        {check.missing.length > 0 ? (
          <div className="max-h-56 overflow-auto">
            <table className="w-full border-collapse tabular-nums">
              <thead><tr className="text-left text-body-small text-on-surface-variant"><th className="py-1 pr-2 font-medium">Row</th><th className="py-1 pr-2 font-medium">Value</th><th className="py-1 font-medium">Reason</th></tr></thead>
              <tbody>
                {check.missing.map((item) => (
                  <tr key={item.row} className="border-t border-outline-variant align-top">
                    <td className="py-1.5 pr-2">{item.row}</td>
                    <td className="py-1.5 pr-2 break-all">{item.value}</td>
                    <td className="py-1.5">{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {check.missing_total > check.missing.length ? <p className="mt-1 text-on-surface-variant">And {check.missing_total - check.missing.length} more {check.missing_total - check.missing.length === 1 ? "row" : "rows"}.</p> : null}
          </div>
        ) : null}
        <p className="text-on-surface-variant">
          {check.matched.length === 0
            ? "No rows match participants in this event. Check the QR or Email column, then upload again."
            : check.missing_total > 0
              ? "Correct the file in Excel and upload again, or save now and fix it later using \"Change people\"."
              : "All rows matched."}
        </p>
      </div>
    );
  }

  return (
    <Dialog open onClose={onClose} dismissible={!checking} title={title} size="lg" scrollBody fullScreenOnMobile actions={actions}>
      {content}
    </Dialog>
  );
}

type ChanceContext = {
  rules: BonusRule[]; index: number | null; winnerQuota: number; weightMax: number;
  preview: (rules: BonusRule[]) => Promise<Preview | null>;
};

/**
 * Perkiraan peluang aturan yang sedang diisi, dihitung server dari kolam yang
 * benar-benar diundi (syarat hadiah, pengecualian, aturan lain, batas tiket).
 * Diminta ulang dengan jeda setiap kali tiket, orang, atau syaratnya berubah.
 */
function ChanceLine({ context, candidate, source }: { context: ChanceContext; candidate: BonusRule | null; source: BonusRule["source"] }) {
  const [result, setResult] = useState<{ key: string; preview: Preview | null } | null>(null);
  const key = candidate ? JSON.stringify(candidate) : "";
  const contextRef = useRef(context);
  useEffect(() => { contextRef.current = context; });

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      const { rules, index, preview } = contextRef.current;
      const rule = JSON.parse(key) as BonusRule;
      const next = index === null ? [...rules, rule] : rules.map((item, i) => (i === index ? rule : item));
      void preview(next).then((data) => { if (alive) setResult({ key, preview: data }); });
    }, 400);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [key]);

  const box = (children: ReactNode) => (
    <div className="rounded-md bg-surface-container-high p-3 text-body-medium" aria-live="polite">
      <p className="mb-1 font-semibold">Winning chances</p>
      {children}
    </div>
  );
  if (!candidate) {
    return box(<p className="text-on-surface-variant">{source === "conditions" ? "Add a condition to see the chances for this rule." : "Add people to see the chances for this rule."}</p>);
  }
  if (result?.key !== key) return box(<p className="text-on-surface-variant">Calculating...</p>);
  const groups = result.preview?.bonus_groups;
  if (!groups) return box(<p className="text-on-surface-variant">Could not calculate chances. Change the rule to try again.</p>);

  const at = context.index ?? context.rules.length;
  const total = groups.reduce((sum, group) => sum + group.count * group.tickets, 0);
  const hit = groups.filter((group) => group.rules.includes(at));
  const people = hit.reduce((sum, group) => sum + group.count, 0);
  if (people === 0 || total === 0) {
    return box(<p className="text-on-surface-variant">Nobody this rule adds tickets to is in the draw for this prize yet{source === "conditions" ? "" : " (they may not meet the prize conditions or be excluded)"}.</p>);
  }
  const share = hit.reduce((sum, group) => sum + group.count * group.tickets, 0) / total;
  const quota = context.winnerQuota;
  const expected = Math.min(quota, people, quota * share);
  // Tiket orang yang hanya kena aturan ini (tanpa aturan lain yang tumpang
  // tindih), dibatasi tiket maksimum: itulah "N× peserta biasa" untuk aturan ini.
  const ticketsEach = Math.min(1 + candidate.tickets, context.weightMax);
  const capped = 1 + candidate.tickets > context.weightMax;
  const listed = candidate.source === "list" ? candidate.participant_ids.length : 0;
  const percent = new Intl.NumberFormat("en-GB", { maximumFractionDigits: share < 0.01 ? 1 : 0 });
  const decimal = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
  // Kalimat biasa, satu fakta per kalimat (Mas 5 Nov: "penjelasan saya ga
  // paham"). Untuk satu pemenang, "peluang pemenang dari kelompok ini" sama
  // dengan bagian tiketnya; untuk banyak pemenang, perkiraan jumlahnya.
  const notIn = listed - people;
  return box(
    <>
      <p>
        {listed > 0
          ? <>{people.toLocaleString("en-GB")} of the {listed.toLocaleString("en-GB")} {listed === 1 ? "person" : "people"} {people === 1 ? "is" : "are"} in this prize’s draw.</>
          : <>{people.toLocaleString("en-GB")} {people === 1 ? "person matches" : "people match"} this rule and {people === 1 ? "is" : "are"} in this prize’s draw.</>}
        {" "}Each has <strong>{ticketsEach}×</strong> the chance of a standard participant.
      </p>
      <p className="mt-1">
        {quota === 1
          ? <>Chance the winner comes from this group: <strong>about {percent.format(share * 100)}%</strong>.</>
          : <>Of {quota} winners, about <strong>{decimal.format(expected)}</strong> will come from this group.</>}
      </p>
      {notIn > 0 ? <p className="mt-1 text-on-surface-variant">{notIn} not in the draw: prize conditions, exclusion rules or already won.</p> : null}
      {capped ? <p className="mt-1 text-on-surface-variant">Limited to {context.weightMax} tickets each by Maximum tickets per person, under the rule list. Raise it to give more.</p> : null}
    </>,
  );
}

/**
 * Cari lalu centang peserta, untuk daftar kecil yang tidak perlu dibuat di
 * Excel. Yang terpilih tampil sebagai chip di atas hasil pencarian; nama kembar
 * dibedakan dari perusahaan dan QR di baris hasil.
 */
function PeoplePicker({ picked, onChange, chances }: { picked: Person[]; onChange: (people: Person[]) => void; chances?: ReactNode }) {
  const [query, setQuery] = useState("");
  // Hasil disimpan bersama kata kuncinya; "mencari" = hasil untuk kata kunci
  // yang sekarang belum tiba. Tidak ada setState langsung di effect.
  const [found, setFound] = useState<{ q: string; people: Person[] | "failed" } | null>(null);
  const latest = useRef("");
  const term = query.trim();
  const results: Person[] | "loading" | "failed" = term.length < 2 ? [] : found?.q === term ? found.people : "loading";
  const chosen = new Set(picked.map((item) => item.participant_id));
  const full = picked.length >= BONUS_LIST_MAX;

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (q.length < 2) return;
    const timer = window.setTimeout(() => {
      void fetch(`/api/admin/undian/bonus-list?q=${encodeURIComponent(q)}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("search");
          const data = await response.json();
          if (latest.current === q) setFound({ q, people: data.participants ?? [] });
        })
        .catch(() => { if (latest.current === q) setFound({ q, people: "failed" }); });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  function toggle(person: Person) {
    if (chosen.has(person.participant_id)) onChange(picked.filter((item) => item.participant_id !== person.participant_id));
    else if (!full) onChange([...picked, person]);
  }

  return (
    <div className="flex flex-col gap-3">
      {picked.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="font-medium">Selected ({picked.length.toLocaleString("en-GB")})</p>
          <ul className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto" aria-label="Selected participants">
            {picked.map((person) => (
              <li key={person.participant_id} className="inline-flex h-8 max-w-full items-center gap-1 rounded-sm bg-primary-soft pl-2.5 pr-1 text-body-medium text-on-primary-soft">
                <span className="min-w-0 truncate">{person.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${person.name}`}
                  onClick={() => toggle(person)}
                  className="flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-surface-container-high"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {picked.length > 0 ? chances : null}
      <TextField
        label="Search participants"
        type="search"
        value={query}
        autoComplete="off"
        placeholder="Name, company, QR or email"
        leading={<MagnifyingGlass size={16} />}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div aria-live="polite">
        {query.trim().length < 2 ? (
          <p className="text-on-surface-variant">{picked.length === 0 ? "Type at least 2 letters, then tap a name to add it." : "Search for more people, or save."}</p>
        ) : results === "loading" ? (
          <p className="text-on-surface-variant">Searching...</p>
        ) : results === "failed" ? (
          <PaneError>Could not search participants. Try again.</PaneError>
        ) : results.length === 0 ? (
          <p className="text-on-surface-variant">No participants match “{query.trim()}”.</p>
        ) : (
          <ul className="flex max-h-64 flex-col divide-y divide-outline-variant overflow-y-auto rounded-md border border-outline-variant">
            {results.map((person) => {
              const on = chosen.has(person.participant_id);
              return (
                <li key={person.participant_id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={!on && full}
                    onClick={() => toggle(person)}
                    className="flex min-h-12 w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-primary-soft disabled:opacity-40"
                  >
                    <span className={cx(
                      "flex size-[18px] shrink-0 items-center justify-center rounded-[2px] border-2",
                      on ? "border-primary bg-primary text-on-primary" : "border-outline",
                    )} aria-hidden>
                      {on ? <Check size={14} weight="bold" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-medium">{person.name}</span>
                      <span className="block break-words text-body-small text-on-surface-variant">{[person.company, person.qr_code].filter(Boolean).join(" · ") || "No company"}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {results !== "loading" && results !== "failed" && results.length === 20 ? <p className="-mt-2 text-body-small text-on-surface-variant">Showing the first 20 matches. Type more to narrow the search.</p> : null}
    </div>
  );
}

function Choice({ checked, onSelect, title, description }: { checked: boolean; onSelect: () => void; title: string; description: string }) {
  return (
    <label className={cx(
      "flex cursor-pointer items-start gap-3 rounded-md border p-3",
      checked ? "border-2 border-primary bg-primary-soft p-[11px]" : "border-outline-variant",
    )}>
      <input type="radio" name="bonus-source" checked={checked} onChange={onSelect} className="mt-0.5 size-4 shrink-0 accent-primary" />
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-on-surface-variant">{description}</span>
      </span>
    </label>
  );
}

function Stepper({ value, onChange, labelledBy }: { value: number; onChange: (value: number) => void; labelledBy: string }) {
  const set = (next: number) => onChange(Math.max(1, Math.min(BONUS_TICKETS_MAX, next)));
  return (
    <div role="group" aria-labelledby={labelledBy} className="mt-1.5 inline-flex h-9 items-stretch overflow-hidden rounded-md border border-outline bg-surface-container-lowest">
      <button type="button" aria-label="Decrease tickets" disabled={value <= 1} onClick={() => set(value - 1)} className="px-3 hover:bg-primary-soft disabled:opacity-40"><Minus size={14} /></button>
      <span className="flex min-w-16 items-center justify-center border-x border-outline-variant font-semibold tabular-nums" aria-live="polite">+{value}</span>
      <button type="button" aria-label="Increase tickets" disabled={value >= BONUS_TICKETS_MAX} onClick={() => set(value + 1)} className="px-3 hover:bg-primary-soft disabled:opacity-40"><Plus size={14} /></button>
    </div>
  );
}

function Num({ children }: { children: string }) {
  return <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-body-small font-semibold text-on-primary">{children}</span>;
}

function Summary({ value, label, note, tone }: { value: number; label: string; note: string; tone?: "good" | "bad" }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className={cx("min-w-12 text-right text-title-large font-bold tabular-nums", tone === "good" && "text-success", tone === "bad" && "text-error")}>{value.toLocaleString("en-GB")}</dt>
      <dd><span className="font-semibold">{label}</span> <span className="text-on-surface-variant">{note}</span></dd>
    </div>
  );
}

/** Nama peserta pada satu daftar, dibaca ulang dari server supaya selalu nama terbaru. */
function NamesDialog({ rule, onClose }: { rule: Extract<BonusRule, { source: "list" }>; onClose: () => void }) {
  const [state, setState] = useState<{ people: { participant_id: string; name: string; company: string | null }[]; gone: number } | "loading" | "failed">("loading");
  useEffect(() => {
    let alive = true;
    void fetch("/api/admin/undian/bonus-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_ids: rule.participant_ids }),
    }).then(async (response) => {
      if (!response.ok) { if (alive) setState("failed"); return; }
      const data = await response.json();
      if (alive) setState({ people: data.participants ?? [], gone: data.gone ?? 0 });
    }).catch(() => { if (alive) setState("failed"); });
    return () => { alive = false; };
  }, [rule]);
  return (
    <Dialog open onClose={onClose} title={rule.name} description={rule.file_name ?? undefined} size="md" scrollBody actions={<Button type="button" variant="text" onClick={onClose}>Close</Button>}>
      {state === "loading" ? <p className="text-body-medium text-on-surface-variant">Loading names...</p>
        : state === "failed" ? <PaneError>Could not load names. Close and try again.</PaneError>
        : (
          <div className="flex flex-col gap-2 text-body-medium">
            <p className="text-on-surface-variant">
              {state.people.length.toLocaleString("en-GB")} {state.people.length === 1 ? "person" : "people"}
              {state.gone > 0 ? `. ${state.gone} ${state.gone === 1 ? "person on this list is" : "people on this list are"} no longer registered for the event and will not enter the draw.` : ""}
            </p>
            <ul className="divide-y divide-outline-variant">
              {state.people.map((person) => (
                <li key={person.participant_id} className="py-1.5">
                  <span className="font-medium">{person.name}</span>
                  {person.company ? <span className="text-on-surface-variant"> · {person.company}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}
    </Dialog>
  );
}
