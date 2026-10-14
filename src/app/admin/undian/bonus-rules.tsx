"use client";

import { DownloadSimple, Minus, Plus, UploadSimple } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button, ButtonLink, Dialog } from "@/components/m3";
import { UndianConditionBuilder } from "@/components/admin/undian-condition-builder";
import { cx } from "@/lib/m3/cx";
import {
  BONUS_RULES_MAX, BONUS_TICKETS_MAX, EMPTY_CONDITIONS, describeConditions,
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
  rules, weightMax, winnerQuota, preview, previewFailed, onChange, onWeightMax,
}: {
  rules: BonusRule[]; weightMax: number; winnerQuota: number;
  preview: Preview | null; previewFailed: boolean;
  onChange: (rules: BonusRule[]) => void; onWeightMax: (value: number) => void;
}) {
  const [editing, setEditing] = useState<{ index: number | null; startAt: Step } | null>(null);
  const [names, setNames] = useState<BonusRule | null>(null);
  const sessionNames = preview?.attendance_sessions ? Object.fromEntries(preview.attendance_sessions.map((item) => [item.id, item.name])) : previewFailed ? null : {};

  function save(rule: BonusRule) {
    if (!editing) return;
    onChange(editing.index === null ? [...rules, rule] : rules.map((item, index) => (index === editing.index ? rule : item)));
    setEditing(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {rules.length === 0 ? (
        <div className="flex flex-col items-start gap-2.5 rounded-md border border-dashed border-outline p-4">
          <p className="text-body-medium font-semibold">Belum ada aturan tiket</p>
          <p className="text-body-medium text-on-surface-variant">
            Semua peserta mulai dengan 1 tiket. Tambahkan aturan untuk memberi tiket lebih kepada peserta tertentu, misalnya daftar VIP dari panitia atau yang hadir di sesi tertentu.
          </p>
          <Button size="sm" icon={<Plus size={16} />} onClick={() => setEditing({ index: null, startAt: "rule" })}>Tambah aturan tiket</Button>
        </div>
      ) : (
        <>
          <p className="text-body-medium text-on-surface-variant">Semua peserta mulai dengan 1 tiket. Aturan di bawah menambah tiket, lalu dijumlahkan.</p>
          <ul className="flex flex-col gap-2">
            {rules.map((rule, index) => (
              <li key={index} className="flex flex-col gap-1.5 rounded-md border border-outline-variant bg-surface-container-lowest p-3 text-body-medium">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 break-words font-semibold">{rule.name}</p>
                  <p className="shrink-0 font-bold tabular-nums text-primary">+{rule.tickets} tiket</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="rounded-sm bg-surface-container-high px-2 py-0.5 text-body-small font-medium text-on-surface-variant">
                    {rule.source === "list" ? "Daftar panitia" : "Syarat"}
                  </span>
                  <span className="min-w-0 break-words text-on-surface-variant">
                    {rule.source === "list"
                      ? [`${rule.participant_ids.length.toLocaleString("id-ID")} orang`, rule.file_name, uploadedLabel(rule.uploaded_at)].filter(Boolean).join(" · ")
                      : `${describeConditions(rule.conditions, sessionNames)}${preview?.bonus_rule_counts ? ` · ${(preview.bonus_rule_counts[index] ?? 0).toLocaleString("id-ID")} orang` : ""}`}
                  </span>
                </div>
                <div className="-ml-2 flex flex-wrap">
                  {rule.source === "list" ? (
                    <>
                      <Button variant="text" size="sm" onClick={() => setNames(rule)}>Lihat nama</Button>
                      <Button variant="text" size="sm" onClick={() => setEditing({ index, startAt: "upload" })}>Ganti berkas</Button>
                    </>
                  ) : null}
                  <Button variant="text" size="sm" onClick={() => setEditing({ index, startAt: "rule" })}>Ubah</Button>
                  <Button variant="text" size="sm" className="text-error" onClick={() => onChange(rules.filter((_, i) => i !== index))}>Hapus</Button>
                </div>
              </li>
            ))}
          </ul>
          {rules.length < BONUS_RULES_MAX ? (
            <div><Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => setEditing({ index: null, startAt: "rule" })}>Tambah aturan tiket</Button></div>
          ) : null}
        </>
      )}

      <div className="max-w-40">
        <NumberField id="bonus-max" label="Tiket maksimum per orang" value={weightMax} min={1} max={1000} onChange={onWeightMax} />
      </div>

      {rules.length > 0 ? <OddsTable rules={rules} preview={preview} failed={previewFailed} winnerQuota={winnerQuota} /> : null}

      {editing ? (
        <RuleDialog
          key={`${editing.index}-${editing.startAt}`}
          initial={editing.index === null ? null : rules[editing.index]}
          startAt={editing.startAt}
          preview={preview}
          previewFailed={previewFailed}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
      {names && names.source === "list" ? <NamesDialog rule={names} onClose={() => setNames(null)} /> : null}
    </div>
  );
}

function uploadedLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

/**
 * Peluang per kelompok, dari kolam yang benar-benar diundi. "Peluang vs biasa"
 * adalah jumlah tiketnya, karena peserta biasa memegang tepat 1 tiket.
 */
function OddsTable({ rules, preview, failed, winnerQuota }: { rules: BonusRule[]; preview: Preview | null; failed: boolean; winnerQuota: number }) {
  if (!preview?.bonus_groups) {
    return (
      <p className="rounded-md bg-surface-container-high p-3 text-body-medium text-on-surface-variant" aria-live="polite">
        {failed ? "Peluang gagal dihitung. Ubah aturan untuk mencoba lagi." : "Menghitung peluang..."}
      </p>
    );
  }
  const groups = preview.bonus_groups;
  const total = groups.reduce((sum, group) => sum + group.count * group.tickets, 0);
  const boosted = groups.filter((group) => group.rules.length > 0);
  const boostedPeople = boosted.reduce((sum, group) => sum + group.count, 0);
  const boostedTickets = boosted.reduce((sum, group) => sum + group.count * group.tickets, 0);
  const share = total > 0 ? boostedTickets / total : 0;
  const expected = Math.min(winnerQuota, boostedPeople, winnerQuota * share);
  const percent = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-container-high p-3 text-body-medium" aria-live="polite">
      <p className="font-semibold">Peluang menang</p>
      {groups.length === 0 ? (
        <p className="text-on-surface-variant">Belum ada peserta yang bisa diundi.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse tabular-nums">
            <thead>
              <tr className="text-left text-body-small text-on-surface-variant">
                <th className="py-1 pr-2 font-medium">Kelompok</th>
                <th className="py-1 pr-2 text-right font-medium">Orang</th>
                <th className="py-1 pr-2 text-right font-medium">Tiket</th>
                <th className="py-1 text-right font-medium">Peluang vs biasa</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.rules.join(",") || "biasa"} className="border-t border-outline-variant align-top">
                  <td className="py-1.5 pr-2 break-words">{group.rules.length === 0 ? "Peserta biasa" : group.rules.map((index) => rules[index]?.name ?? "").join(" + ")}</td>
                  <td className="py-1.5 pr-2 text-right">{group.count.toLocaleString("id-ID")}</td>
                  <td className="py-1.5 pr-2 text-right">{group.tickets}</td>
                  <td className={cx("py-1.5 text-right", group.tickets > 1 && "font-semibold")}>{group.tickets}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {boostedPeople > 0 && total > 0 ? (
        <p>
          {boostedPeople.toLocaleString("id-ID")} dari {preview.available.toLocaleString("id-ID")} orang dengan tiket tambahan memegang <strong>{percent.format(share * 100)}% tiket</strong>.
          {" "}Dari {winnerQuota} pemenang, rata-rata <strong>{decimal.format(expected)}</strong> berasal dari mereka.
        </p>
      ) : groups.length > 0 ? (
        <p className="text-on-surface-variant">Belum ada peserta yang cocok dengan aturan tiket tambahan, jadi peluang semua orang masih sama.</p>
      ) : null}
    </div>
  );
}

type Step = "rule" | "upload" | "review";

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
  initial, startAt, preview, previewFailed, onClose, onSave,
}: {
  initial: BonusRule | null; startAt: Step; preview: Preview | null; previewFailed: boolean;
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

  const existingList = initial?.source === "list" ? initial : null;
  const listSteps = source === "list";

  function validRule(): boolean {
    if (!name.trim()) { setError("Isi nama aturan."); return false; }
    if (source === "conditions" && conditions.children.length === 0) { setError("Tambahkan minimal satu syarat."); return false; }
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
      setError(data?.error?.details?.fieldErrors?.file?.[0] ?? data?.error?.message ?? "Berkas gagal dicek. Coba lagi.");
      return;
    }
    setCheck(data as CheckResult);
    setStep("review");
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
    <ol className="flex flex-wrap gap-x-4 text-body-small text-on-surface-variant" aria-label="Langkah">
      {(["rule", "upload", "review"] as const).map((item, index) => (
        <li key={item} aria-current={step === item ? "step" : undefined} className={cx(step === item && "font-semibold text-primary")}>
          {index + 1} {item === "rule" ? "Aturan" : item === "upload" ? "Upload daftar" : "Cek hasil"}
        </li>
      ))}
    </ol>
  ) : null;

  let title = initial ? "Ubah aturan tiket" : "Tambah aturan tiket";
  let actions;
  let content;

  if (step === "rule") {
    actions = (
      <>
        <Button variant="text" onClick={onClose}>Batal</Button>
        {source === "list" && existingList ? <Button variant="outlined" onClick={() => validRule() && setStep("upload")}>Ganti berkas</Button> : null}
        {source === "list" && !existingList
          ? <Button onClick={() => validRule() && setStep("upload")}>Lanjut: upload daftar</Button>
          : <Button onClick={saveRule}>Simpan aturan</Button>}
      </>
    );
    content = (
      <div className="flex flex-col gap-4 text-body-medium">
        {stepper}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">Siapa yang dapat tiket tambahan?</legend>
          <Choice
            checked={source === "list"}
            onSelect={() => setSource("list")}
            title="Daftar dari panitia"
            description="Upload Excel berisi QR atau email peserta. Cocok untuk daftar VIP, tamu khusus, atau pemenang kuis."
          />
          <Choice
            checked={source === "conditions"}
            onSelect={() => setSource("conditions")}
            title="Peserta yang memenuhi syarat"
            description="Dari data acara: check-in di sesi, tipe peserta, perusahaan, jumlah scan."
          />
        </fieldset>
        <label className="block font-medium" htmlFor="bonus-name">
          Nama aturan
          <input
            id="bonus-name"
            value={name}
            maxLength={80}
            placeholder={source === "list" ? "mis. VIP pilihan panitia" : "mis. Hadir di Gala Dinner"}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 h-9 w-full rounded-md border border-outline bg-surface-container-lowest px-3 font-normal text-on-surface outline-none focus:border-primary"
          />
        </label>
        <div>
          <p className="font-medium" id="bonus-tickets-label">Tiket tambahan per orang</p>
          <Stepper value={tickets} onChange={setTickets} labelledBy="bonus-tickets-label" />
        </div>
        {source === "conditions" ? (
          <div>
            <p className="mb-1.5 font-medium">Syarat</p>
            <UndianConditionBuilder
              value={conditions}
              participantTypes={preview?.participant_types ?? []}
              rsvpStatuses={preview?.rsvp_statuses ?? []}
              companies={preview?.companies ?? []}
              sessions={previewFailed ? null : preview?.attendance_sessions}
              onChange={setConditions}
            />
          </div>
        ) : null}
        {error ? <PaneError>{error}</PaneError> : null}
      </div>
    );
  } else if (step === "upload") {
    title = `Upload daftar ${name.trim()}`;
    actions = <Button variant="text" disabled={checking} onClick={() => { setError(""); setStep("rule"); }}>Kembali</Button>;
    content = (
      <div className="flex flex-col gap-4 text-body-medium">
        {stepper}
        <div className="flex gap-3">
          <Num>1</Num>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p><span className="font-semibold">Unduh templat</span> <span className="text-on-surface-variant">lalu isi satu orang per baris.</span></p>
            <div className="overflow-x-auto rounded-sm border border-outline-variant">
              <table className="w-full border-collapse text-body-small">
                <thead className="bg-surface-container-high">
                  <tr>{["QR peserta", "Email", "Nama (untuk dicek)"].map((head) => <th key={head} className="whitespace-nowrap border border-outline-variant px-2 py-1 text-left font-semibold">{head}</th>)}</tr>
                </thead>
                <tbody>
                  <tr><td className="whitespace-nowrap border border-outline-variant px-2 py-1">KSO-0142</td><td className="border border-outline-variant px-2 py-1" /><td className="whitespace-nowrap border border-outline-variant px-2 py-1">Andi Wijaya</td></tr>
                  <tr><td className="border border-outline-variant px-2 py-1" /><td className="whitespace-nowrap border border-outline-variant px-2 py-1">siti.rahma@contoh.co.id</td><td className="whitespace-nowrap border border-outline-variant px-2 py-1">Siti Rahma</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-on-surface-variant">Isi QR atau email, cukup salah satu. Nama tidak dipakai untuk mencocokkan.</p>
            <div>
              {/* `native`: unduhan berkas dari /api, bukan navigasi halaman. */}
              <ButtonLink native variant="outlined" size="sm" href="/api/admin/undian/bonus-list/template" icon={<DownloadSimple size={16} />}>Unduh templat</ButtonLink>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Num>2</Num>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="font-semibold">Upload berkas yang sudah diisi</p>
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-outline p-3">
              <UploadButton label={checking ? "Mengecek..." : "Pilih berkas"} accept=".xlsx,.csv,.txt" busy={checking} icon={<UploadSimple size={16} />} onFile={(file) => void upload(file)} />
              <span className="text-on-surface-variant">.xlsx atau .csv, maksimal 5.000 baris</span>
            </div>
            {error ? <PaneError>{error}</PaneError> : null}
          </div>
        </div>
      </div>
    );
  } else if (check) {
    title = `${check.file_name}: ${check.rows_read.toLocaleString("id-ID")} baris dibaca`;
    actions = (
      <>
        <Button variant="text" onClick={() => { setCheck(null); setStep("upload"); }}>Upload ulang</Button>
        {check.matched.length > 0 ? <Button onClick={saveList}>Simpan {check.matched.length.toLocaleString("id-ID")} orang</Button> : null}
      </>
    );
    content = (
      <div className="flex flex-col gap-4 text-body-medium">
        {stepper}
        <dl className="flex flex-col gap-1.5">
          <Summary value={check.matched.length} tone="good" label="cocok dengan peserta" note={`akan dapat +${tickets} tiket`} />
          {check.duplicates > 0 ? <Summary value={check.duplicates} label="ganda" note="orang yang sama ditulis lebih dari sekali, dihitung sekali" /> : null}
          {check.missing_total > 0 ? <Summary value={check.missing_total} tone="bad" label="tidak ditemukan" note="tidak ikut dapat tiket" /> : null}
        </dl>
        {check.missing.length > 0 ? (
          <div className="max-h-56 overflow-auto">
            <table className="w-full border-collapse tabular-nums">
              <thead><tr className="text-left text-body-small text-on-surface-variant"><th className="py-1 pr-2 font-medium">Baris</th><th className="py-1 pr-2 font-medium">Isi</th><th className="py-1 font-medium">Kenapa</th></tr></thead>
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
            {check.missing_total > check.missing.length ? <p className="mt-1 text-on-surface-variant">Dan {check.missing_total - check.missing.length} baris lainnya.</p> : null}
          </div>
        ) : null}
        <p className="text-on-surface-variant">
          {check.matched.length === 0
            ? "Tidak ada baris yang cocok dengan peserta acara ini. Periksa kolom QR atau Email, lalu upload ulang."
            : check.missing_total > 0
              ? "Perbaiki di Excel lalu upload ulang, atau simpan sekarang dan perbaiki nanti lewat \"Ganti berkas\"."
              : "Semua baris cocok."}
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
      <button type="button" aria-label="Kurangi tiket" disabled={value <= 1} onClick={() => set(value - 1)} className="px-3 hover:bg-primary-soft disabled:opacity-40"><Minus size={14} /></button>
      <span className="flex min-w-16 items-center justify-center border-x border-outline-variant font-semibold tabular-nums" aria-live="polite">+{value}</span>
      <button type="button" aria-label="Tambah tiket" disabled={value >= BONUS_TICKETS_MAX} onClick={() => set(value + 1)} className="px-3 hover:bg-primary-soft disabled:opacity-40"><Plus size={14} /></button>
    </div>
  );
}

function Num({ children }: { children: string }) {
  return <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-body-small font-semibold text-on-primary">{children}</span>;
}

function Summary({ value, label, note, tone }: { value: number; label: string; note: string; tone?: "good" | "bad" }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className={cx("min-w-12 text-right text-title-large font-bold tabular-nums", tone === "good" && "text-success", tone === "bad" && "text-error")}>{value.toLocaleString("id-ID")}</dt>
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
    <Dialog open onClose={onClose} title={rule.name} description={rule.file_name ?? undefined} size="md" scrollBody actions={<Button variant="text" onClick={onClose}>Tutup</Button>}>
      {state === "loading" ? <p className="text-body-medium text-on-surface-variant">Memuat nama...</p>
        : state === "failed" ? <PaneError>Nama gagal dimuat. Tutup lalu coba lagi.</PaneError>
        : (
          <div className="flex flex-col gap-2 text-body-medium">
            <p className="text-on-surface-variant">
              {state.people.length.toLocaleString("id-ID")} orang
              {state.gone > 0 ? `. ${state.gone} orang di daftar ini sudah tidak terdaftar di acara dan tidak ikut diundi.` : ""}
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
