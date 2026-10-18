"use client";

import {
  Armchair, Buildings, CaretDown, CheckCircle, EnvelopeSimple, Flag, Hash, IdentificationBadge, ListChecks,
  ListBullets, Plus, QrCode, Receipt, Scan, Star, Storefront, TextAa, Trash, User, UsersThree, Warning, X, type Icon,
} from "@phosphor-icons/react";
import { useCallback, useId, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Button, FilterChip, Popover, POPOVER_ITEM, SelectMenu, usePopoverAnchor } from "@/components/m3";
import type { CheckpointSummary, UndianAnswerField, UndianAnswerLeaf, UndianConditionGroup, UndianConditionNode, UndianCmp, UndianTextCmp, UndianTextVar } from "@/lib/undian";
import { TEXT_CMP_LABEL, TEXT_CMP_WITHOUT_VALUE, TEXT_VAR_LABEL, answerChoices, isChoiceAnswer, isConditionGroup, isTextLeaf } from "@/lib/undian";
import { cx } from "@/lib/m3/cx";
import { withEventPrefix } from "@/lib/event-path";

// Rule builder syarat undian.
//
// Dipakai dua arah dengan komponen yang SAMA:
//   * syarat hadiah        : memenuhi berarti BOLEH ikut
//   * aturan pengecualian  : memenuhi berarti DIKECUALIKAN
// Prop `tone` hanya mengubah kata-kata pada teks bantuan; logikanya identik.
// Menyalin komponennya menjadi dua akan berakhir dengan dua daftar variabel yang
// perlahan berbeda, dan syarat yang bisa ditulis di satu tempat tapi tidak di
// tempat lain tanpa alasan yang bisa dijelaskan.
//
// Idiomnya sengaja identik dengan <ConditionBuilder> milik item spesial supaya
// admin yang sudah memakai satu langsung mengerti yang lain. Yang berbeda hanya
// daftar variabelnya, dan itu memang harus berbeda:
//
//   * Item spesial dievaluasi DI DALAM konteks sebuah booth, jadi punya cakupan
//     "di booth ini". Undian tidak punya konteks booth sama sekali; menyediakan
//     pilihan itu di sini menghasilkan syarat yang tidak punya arti dan diam-diam
//     meloloskan atau menggugurkan semua orang.
//   * Undian justru butuh check-in, kursi, dan pencocokan teks pada nama serta
//     perusahaan, yang tidak relevan bagi item spesial: peserta yang sedang berdiri
//     di depan booth sudah pasti hadir dan sudah teridentifikasi.

type Props = {
  value: UndianConditionGroup;
  onChange: (next: UndianConditionGroup) => void;
  participantTypes: string[];
  rsvpStatuses: string[];
  /** Nilai perusahaan yang benar-benar ada di data, untuk saran ketik. */
  companies?: string[];
  /**
   * Sesi kehadiran acara (Check-in > Sessions), untuk syarat check-in per sesi.
   * `undefined` = belum dimuat dan `null` = gagal dimuat; keduanya tidak
   * menandai sesi yang dipilih sebagai "sudah dihapus".
   */
  sessions?: { id: number; name: string }[] | null;
  onRetrySessions?: () => void;
  /**
   * Checkpoint acara (Check-in > Checkpoints), untuk teks bantuan syarat
   * checkpoint. `undefined` = belum dimuat, `null` = gagal dimuat.
   */
  checkpoint?: CheckpointSummary | null;
  /**
   * Pertanyaan tambahan form registrasi, untuk grup "Form answers".
   * `undefined` = belum dimuat, `null` = gagal dimuat; keduanya tidak menandai
   * pertanyaan yang dipilih sebagai "sudah dihapus".
   */
  answerFields?: UndianAnswerField[] | null;
  tone?: "include" | "exclude";
  depth?: number;
};

const VAR_LABEL: Record<string, string> = {
  company: "Company",
  name: "Participant name",
  job_title: "Job title",
  participant_type: "Participant type",
  rsvp_status: "RSVP status",
  checked_in: "Check-in status",
  has_seat: "Seat assignment",
  seat_label: "Seat number",
  qr_code: "QR / badge code",
  total_spend: "Total spend",
  booth_count: "Booths visited",
  scan_count: "Scan count",
  checkpoint_goal: "Checkpoint points goal",
  checkpoint_points: "Checkpoint points",
  checkpoints_all: "All checkpoints",
};

// Dikelompokkan supaya daftar dua belas variabel tidak terbaca sebagai satu
// gulungan panjang tanpa struktur.
const VAR_GROUPS: { label: string; vars: string[] }[] = [
  { label: "Identity", vars: ["company", "name", "job_title", "qr_code"] },
  { label: "Participant status", vars: ["participant_type", "rsvp_status", "checked_in"] },
  { label: "Seat", vars: ["has_seat", "seat_label"] },
  { label: "Activity", vars: ["total_spend", "booth_count", "scan_count"] },
  // Points goal first: the number is set once in Check-in > Checkpoints and
  // also drives the participant card ("20 more points to enter the draw").
  { label: "Checkpoint", vars: ["checkpoint_goal", "checkpoint_points", "checkpoints_all"] },
];

const VAR_ICON: Record<string, Icon> = {
  company: Buildings,
  name: User,
  job_title: IdentificationBadge,
  qr_code: QrCode,
  participant_type: UsersThree,
  rsvp_status: EnvelopeSimple,
  checked_in: CheckCircle,
  has_seat: Armchair,
  seat_label: Hash,
  total_spend: Receipt,
  booth_count: Storefront,
  scan_count: Scan,
  checkpoint_goal: Flag,
  checkpoint_points: Star,
  checkpoints_all: ListChecks,
};

const CMP_LABEL: Record<UndianCmp, string> = {
  gte: "at least",
  gt: "more than",
  lte: "at most",
  lt: "less than",
  eq: "exactly",
};

const UNIT: Record<string, string> = { total_spend: "rupiah", booth_count: "booth", scan_count: "scan", checkpoint_points: "points" };

const digitsOnly = (value: string) => value.replace(/\D/g, "");
const grouped = (value: number) => new Intl.NumberFormat("en-GB").format(value);

const CONTROL = "h-9 rounded-md border border-outline bg-surface-container-lowest px-2 text-body-medium text-on-surface outline-none focus:border-primary";

function defaultLeaf(variable: string): UndianConditionNode {
  switch (variable) {
    case "checked_in": return { var: "checked_in", is: true };
    case "booth_count": return { var: "booth_count", cmp: "gte", value: 3 };
    case "scan_count": return { var: "scan_count", cmp: "gte", value: 1 };
    case "participant_type": return { var: "participant_type", cmp: "in", values: [] };
    case "rsvp_status": return { var: "rsvp_status", cmp: "in", values: [] };
    case "has_seat": return { var: "has_seat", is: true };
    case "checkpoint_goal": return { var: "checkpoint_goal", is: true };
    case "checkpoint_points": return { var: "checkpoint_points", cmp: "gte", value: 10 };
    case "checkpoints_all": return { var: "checkpoints_all", is: true };
    case "total_spend": return { var: "total_spend", cmp: "gte", value: 500000 };
    // Teks bawaannya `contains`, bukan `eq`. Nama perusahaan hampir tidak pernah
    // diketik sama persis oleh pesertanya ("PT PRIMA", "PT. Prima Indonesia",
    // dan "Prima" adalah satu perusahaan yang sama), sehingga `eq` sebagai bawaan
    // akan menghasilkan nol hasil pada percobaan pertama hampir setiap kali.
    default: return { var: variable as UndianTextVar, cmp: "contains", text: "" };
  }
}

/** Tombol pilihan kecil di dalam syarat. `aria-pressed` membawa keadaannya, bukan warna saja. */
function Pilihan({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    className={cx(
      "inline-flex h-9 items-center rounded-md border px-3 text-body-medium font-medium",
      on ? "border-primary bg-accent-soft text-primary" : "border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-primary-soft",
    )}
  >{children}</button>;
}

function TombolHapus({ label, onClick, icon }: { label: string; onClick: () => void; icon: ReactNode }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className="ml-auto grid size-8 shrink-0 place-items-center rounded-md text-error hover:bg-error-soft">{icon}</button>;
}

export function UndianConditionBuilder({ value, onChange, participantTypes, rsvpStatuses, companies = [], sessions, onRetrySessions, checkpoint, answerFields, tone = "include", depth = 0 }: Props) {
  function updateChild(index: number, next: UndianConditionNode) {
    onChange({ ...value, children: value.children.map((child, i) => (i === index ? next : child)) });
  }

  function removeChild(index: number) {
    onChange({ ...value, children: value.children.filter((_, i) => i !== index) });
  }

  return <div className={depth > 0 ? "border-l border-outline pl-3" : ""}>
    {value.children.length > 1 && <div className="mb-2 flex flex-wrap items-center gap-2 text-body-medium">
      <span className="text-on-surface-variant">Match:</span>
      {(["and", "or"] as const).map((op) => <Pilihan key={op} on={value.op === op} onClick={() => onChange({ ...value, op })}>
        {op === "and" ? "All conditions" : "Any condition"}
      </Pilihan>)}
    </div>}

    <div className="space-y-2">
      {value.children.map((child, index) => <div key={index} className="rounded-md border border-outline-variant bg-surface-container-lowest p-3">
        {isConditionGroup(child) ? <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-body-medium font-medium text-on-surface-variant">Condition group</span>
            <TombolHapus label="Delete group" onClick={() => removeChild(index)} icon={<X size={16} />} />
          </div>
          <UndianConditionBuilder value={child} participantTypes={participantTypes} rsvpStatuses={rsvpStatuses} companies={companies} sessions={sessions} onRetrySessions={onRetrySessions} checkpoint={checkpoint} answerFields={answerFields} tone={tone} depth={depth + 1} onChange={(next) => updateChild(index, next)} />
        </div> : <LeafEditor
          leaf={child}
          participantTypes={participantTypes}
          rsvpStatuses={rsvpStatuses}
          companies={companies}
          sessions={sessions}
          onRetrySessions={onRetrySessions}
          checkpoint={checkpoint}
          answerFields={answerFields}
          tone={tone}
          onChange={(next) => updateChild(index, next)}
          onRemove={() => removeChild(index)}
        />}
      </div>)}
    </div>

    <div className="mt-2 flex flex-wrap gap-2">
      <AddConditionMenu
        answerFields={answerFields ?? []}
        onPick={(variable) => onChange({ ...value, children: [...value.children, defaultLeaf(variable)] })}
        onPickAnswer={(field) => onChange({ ...value, children: [...value.children, defaultAnswerLeaf(field)] })}
      />
      {/* Kedalaman dibatasi 2 agar aturan tetap terbaca. Lebih dalam dari itu
          hampir selalu tanda aturannya perlu dipecah jadi hadiah terpisah. */}
      {depth < 2 && <Button type="button" variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => onChange({ ...value, children: [...value.children, { op: "or", children: [] }] })}>
        Add group
      </Button>}
    </div>

    {value.children.length === 0 && depth === 0 && (tone === "exclude"
      // Peringatan, bukan sekadar keterangan: pohon kosong pada aturan pengecualian
      // bernilai benar untuk semua orang, sehingga seluruh ruangan gugur. Database
      // menolaknya lewat CHECK, tapi pesan itu harus terbaca sebelum tombol Simpan
      // ditekan, bukan sesudahnya.
      ? <p className="mt-2 text-body-medium font-medium text-error">Add at least one condition. A rule without conditions excludes all participants.</p>
      : <p className="mt-2 text-body-medium text-on-surface-variant">Without conditions, all active participants enter the draw.</p>)}
  </div>;
}

function LeafEditor({
  leaf,
  participantTypes,
  rsvpStatuses,
  companies,
  sessions,
  onRetrySessions,
  checkpoint,
  answerFields,
  tone,
  onChange,
  onRemove,
}: {
  leaf: Exclude<UndianConditionNode, UndianConditionGroup>;
  participantTypes: string[];
  rsvpStatuses: string[];
  companies: string[];
  sessions: { id: number; name: string }[] | null | undefined;
  onRetrySessions?: () => void;
  checkpoint: CheckpointSummary | null | undefined;
  answerFields: UndianAnswerField[] | null | undefined;
  tone: "include" | "exclude";
  onChange: (next: UndianConditionNode) => void;
  onRemove: () => void;
}) {
  const numeric = leaf.var === "total_spend" || leaf.var === "booth_count" || leaf.var === "scan_count" || leaf.var === "checkpoint_points";
  const list = leaf.var === "participant_type" || leaf.var === "rsvp_status";
  // Pilihan diambil dari data peserta yang benar-benar ada, bukan dari daftar
  // tetap di kode. Daftar tetap membuat admin memilih nilai yang tidak dipakai
  // sistem lain, lalu bertanya-tanya kenapa kolamnya kosong.
  const options = leaf.var === "participant_type" ? participantTypes : rsvpStatuses;
  const sessionList = sessions ?? [];
  // Sesi yang dipilih sudah dihapus. Server menganggap syarat ini rusak (tidak
  // ada yang lolos), jadi panitia harus memilih ulang sebelum undian.
  const sessionGone = leaf.var === "checked_in" && leaf.session_id !== undefined && sessions != null
    && !sessions.some((session) => session.id === leaf.session_id);

  // Syarat yang tidak terbaca. Ditampilkan sebagai peringatan yang bisa dihapus,
  // bukan disembunyikan: ia membuat seluruh aturan tidak pernah terpenuhi, dan
  // satu-satunya jalan keluar adalah membuangnya lalu menyusun ulang.
  if (leaf.var === "__invalid") {
    return <div className="flex flex-wrap items-center gap-2 text-body-medium">
      <span className="flex items-center gap-1.5 font-medium text-error">
        <Warning size={16} aria-hidden /> This condition cannot be read
      </span>
      <span className="text-on-surface-variant">Its values are incomplete or its format has changed. Delete it and create it again.</span>
      <TombolHapus label="Delete condition" onClick={onRemove} icon={<Trash size={16} />} />
    </div>;
  }

  if (leaf.var === "answer") return <AnswerEditor leaf={leaf} fields={answerFields} tone={tone} onChange={onChange} onRemove={onRemove} />;

  return <div className="flex flex-wrap items-center gap-2 text-body-medium">
    <span className="font-medium">{VAR_LABEL[leaf.var]}</span>

    {numeric && <>
      <select value={leaf.cmp} onChange={(event) => onChange({ ...leaf, cmp: event.target.value as UndianCmp })} aria-label="Comparison" className={CONTROL}>
        {Object.entries(CMP_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <input
        value={leaf.var === "total_spend" ? grouped(leaf.value) : String(leaf.value)}
        onChange={(event) => onChange({ ...leaf, value: Number(digitsOnly(event.target.value)) || 0 })}
        inputMode="numeric"
        aria-label={VAR_LABEL[leaf.var]}
        className={cx(CONTROL, "w-32 tabular-nums")}
      />
      <span className="text-on-surface-variant">{leaf.var === "checkpoint_points" && leaf.value === 1 ? "point" : UNIT[leaf.var]}</span>
    </>}

    {isTextLeaf(leaf) && <>
      <select
        value={leaf.cmp}
        onChange={(event) => onChange({ ...leaf, cmp: event.target.value as UndianTextCmp })}
        aria-label="Comparison"
        className={CONTROL}
      >
        {(Object.keys(TEXT_CMP_LABEL) as UndianTextCmp[]).map((key) => <option key={key} value={key}>{TEXT_CMP_LABEL[key]}</option>)}
      </select>
      {/* `kosong` dan `tidak kosong` tidak butuh nilai. Menyembunyikan kolomnya,
          bukan sekadar menonaktifkan, menghilangkan pertanyaan "ini harus diisi
          apa" yang pasti muncul kalau kolomnya tetap terlihat. */}
      {!TEXT_CMP_WITHOUT_VALUE.includes(leaf.cmp) && <>
        <input
          value={leaf.text}
          onChange={(event) => onChange({ ...leaf, text: event.target.value })}
          aria-label={`${VAR_LABEL[leaf.var]} value`}
          list={leaf.var === "company" ? "undian-company-options" : undefined}
          placeholder={leaf.var === "company" ? "PT PRIMA" : "enter a value"}
          className={cx(CONTROL, "w-52 max-w-full")}
        />
        {/* Saran ketik dari nilai yang benar-benar ada di data. Ini yang mencegah
            kesalahan paling mahal di fitur ini: mengetik "PRIMA" padahal datanya
            "PT PRIMA Indonesia", lalu aturannya diam-diam tidak mengenai siapa pun. */}
        {leaf.var === "company" && companies.length > 0 && <datalist id="undian-company-options">
          {companies.map((company) => <option key={company} value={company} />)}
        </datalist>}
      </>}
    </>}

    {list && <>
      <select value={leaf.cmp} onChange={(event) => onChange({ ...leaf, cmp: event.target.value as "in" | "not_in" })} aria-label="Comparison" className={CONTROL}>
        <option value="in">is one of</option>
        <option value="not_in">is not one of</option>
      </select>
      <div className="flex flex-wrap gap-1">
        {options.length === 0
          ? <span className="text-on-surface-variant">No values in participant data yet.</span>
          : options.map((option) => {
            const chosen = leaf.values.includes(option);
            return <Pilihan key={option} on={chosen} onClick={() => onChange({ ...leaf, values: chosen ? leaf.values.filter((item) => item !== option) : [...leaf.values, option] })}>{option}</Pilihan>;
          })}
      </div>
    </>}

    {(leaf.var === "checked_in" || leaf.var === "has_seat") && <div className="flex gap-1">
      {[true, false].map((option) => <Pilihan key={String(option)} on={leaf.is === option} onClick={() => onChange({ ...leaf, is: option })}>
        {leaf.var === "checked_in"
          ? (option ? "Checked in" : "Not checked in")
          : (option ? "Has a seat" : "No seat")}
      </Pilihan>)}
    </div>}

    {(leaf.var === "checkpoint_goal" || leaf.var === "checkpoints_all") && <div className="flex gap-1">
      {[true, false].map((option) => <Pilihan key={String(option)} on={leaf.is === option} onClick={() => onChange({ ...leaf, is: option })}>
        {leaf.var === "checkpoint_goal"
          ? (option ? "Reached" : "Not reached")
          : (option ? "All done" : "Not all done")}
      </Pilihan>)}
    </div>}

    {(leaf.var === "checkpoint_goal" || leaf.var === "checkpoint_points" || leaf.var === "checkpoints_all") && <CheckpointHint variable={leaf.var} checkpoint={checkpoint} />}

    {/* Check-in dicatat per sesi (registrasi, gala, workshop). Bawaannya "sesi
        mana pun"; pilihannya diambil dari sesi acara ini sendiri. Sesi yang sudah
        dihapus tetap tampil sebagai pilihan terpilih supaya syaratnya tidak
        diam-diam berubah arti saat form dibuka lagi. */}
    {leaf.var === "checked_in" && <select
      value={leaf.session_id ?? 0}
      onChange={(event) => {
        const id = Number(event.target.value);
        onChange(id > 0 ? { ...leaf, session_id: id } : { var: "checked_in", is: leaf.is });
      }}
      aria-label="Check-in session"
      className={cx(CONTROL, "max-w-56")}
    >
      <option value={0}>in any session</option>
      {sessionList.map((session) => <option key={session.id} value={session.id}>in {session.name}</option>)}
      {leaf.session_id !== undefined && !sessionList.some((session) => session.id === leaf.session_id) && <option value={leaf.session_id}>{sessionGone ? "in a deleted session" : sessions === null ? "could not load sessions" : "loading sessions..."}</option>}
    </select>}
    {/* Syarat dengan sesi terhapus selalu bernilai salah. Pada syarat hadiah
        artinya tidak ada yang lolos; pada aturan pengecualian artinya aturan
        ini tidak mengecualikan siapa pun. */}
    {sessionGone && <span role="alert" className="order-last flex basis-full items-center gap-1.5 font-medium text-error">
      <Warning size={16} aria-hidden className="shrink-0" /> {tone === "exclude"
        ? "This session was deleted, so this rule excludes no one. Choose another session."
        : "This session was deleted, so no participants qualify. Choose another session."}
    </span>}

    {leaf.var === "checked_in" && leaf.session_id !== undefined && sessions === null && <span role="status" className="order-last flex basis-full items-center gap-1.5 text-on-surface-variant">
      <span>Check-in sessions could not be loaded. This condition is kept as it is.</span>
      {onRetrySessions && <button type="button" onClick={onRetrySessions} className="min-h-9 shrink-0 font-medium text-primary underline">Retry</button>}
    </span>}

    <TombolHapus label="Delete condition" onClick={onRemove} icon={<Trash size={16} />} />
  </div>;
}

/**
 * "+ Add condition": menu bergrup dengan ikon, bukan `<select>` bawaan. Daftar
 * bawaan tampil dengan huruf dan jarak sistem operasi, judul grup tebal dan
 * isinya menjorok, dan tidak mengikuti menu lain di admin (Badge > Tambah isi).
 */
function AddConditionMenu({ answerFields, onPick, onPickAnswer }: { answerFields: UndianAnswerField[]; onPick: (variable: string) => void; onPickAnswer: (field: UndianAnswerField) => void }) {
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const anchor = usePopoverAnchor(trigger);
  // Pembungkus `span` tidak bisa menerima fokus. Esc di dalam Popover dan
  // memilih item mengembalikan fokus lewat `fokus()`, jadi arahkan ke tombolnya;
  // tanpa ini fokus jatuh ke <body> dan pengguna papan ketik kembali ke atas.
  const fokus = useCallback(() => trigger?.querySelector("button")?.focus(), [trigger]);
  const menu = { ...anchor, fokus };
  const id = useId();

  // Dibuka dari papan ketik: fokus pindah ke pilihan pertama. Panelnya dirender
  // di ujung body, jadi tanpa ini Tab dari tombol melompat ke "Add group".
  function focusFirst() {
    requestAnimationFrame(() => document.getElementById(id)?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
  }

  function pick(variable: string) {
    onPick(variable);
    menu.tutup();
    menu.fokus();
  }

  function pickAnswer(field: UndianAnswerField) {
    onPickAnswer(field);
    menu.tutup();
    menu.fokus();
  }

  // Panah, Home dan End berpindah antar pilihan. Tab menutup menu dan kembali
  // ke tombol, seperti menu lain: panelnya dirender di ujung body, jadi Tab
  // biasa akan meninggalkannya terbuka di belakang.
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Tab") { event.preventDefault(); menu.tutup(); menu.fokus(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? items.length - 1
      : event.key === "ArrowDown" ? (index + 1) % items.length
      : (index - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  return <>
    <span ref={setTrigger} className="inline-flex">
      <Button type="button" variant="outlined" size="sm" icon={<Plus size={16} />} trailingIcon={<CaretDown size={14} />} aria-haspopup="menu" aria-expanded={menu.open}
        onClick={(event) => { const opening = !menu.open; menu.toggle(); if (opening && event.detail === 0) focusFirst(); }}
        onKeyDown={(event) => { if (event.key === "ArrowDown" && !menu.open) { event.preventDefault(); menu.buka(); focusFirst(); } }}>
        Add condition
      </Button>
    </span>
    {menu.open && <Popover anchor={menu} id={id} label="Add condition" align="start" width={264} onKeyDown={onKeyDown}>
      <div className="p-1">
        {VAR_GROUPS.map((group, index) => <div key={group.label} role="group" aria-label={group.label} className={index > 0 ? "mt-1 border-t border-outline-variant pt-1" : undefined}>
          <p className="px-2 pb-1 pt-2 text-label-medium text-on-surface-variant">{group.label}</p>
          {group.vars.map((key) => {
            const ItemIcon = VAR_ICON[key];
            return <button key={key} type="button" role="menuitem" className={POPOVER_ITEM} onClick={() => pick(key)}>
              {ItemIcon && <ItemIcon size={16} aria-hidden className="shrink-0 text-on-surface-variant" />}
              <span className="min-w-0 flex-1 truncate">{VAR_LABEL[key]}</span>
            </button>;
          })}
        </div>)}
        {/* Pertanyaan tambahan Registration > Edit form, termasuk kolom khusus
            panitia: daftarnya mengikuti acara, bukan daftar tetap di kode. */}
        {answerFields.length > 0 && <div role="group" aria-label="Form answers" className="mt-1 border-t border-outline-variant pt-1">
          <p className="px-2 pb-1 pt-2 text-label-medium text-on-surface-variant">Form answers</p>
          {answerFields.map((field) => <button key={field.key} type="button" role="menuitem" className={POPOVER_ITEM} onClick={() => pickAnswer(field)}>
            {isChoiceAnswer(field.type) ? <ListBullets size={16} aria-hidden className="shrink-0 text-on-surface-variant" /> : <TextAa size={16} aria-hidden className="shrink-0 text-on-surface-variant" />}
            <span className="min-w-0 flex-1 truncate">{field.label}</span>
          </button>)}
        </div>}
      </div>
    </Popover>}
  </>;
}

/** Syarat baru dari satu pertanyaan: pilihan mulai tanpa nilai, teks mulai "mengandung". */
function defaultAnswerLeaf(field: UndianAnswerField): UndianAnswerLeaf {
  return isChoiceAnswer(field.type)
    ? { var: "answer", key: field.key, cmp: "in", values: [] }
    : { var: "answer", key: field.key, cmp: "contains", text: "" };
}

const CHOICE_CMP_OPTIONS = [{ value: "in" as const, label: "is one of" }, { value: "not_in" as const, label: "is not one of" }];
const TEXT_CMP_OPTIONS = (Object.keys(TEXT_CMP_LABEL) as UndianTextCmp[]).map((key) => ({ value: key, label: TEXT_CMP_LABEL[key] }));

/**
 * Syarat dari jawaban form. Pertanyaan pilihan memakai chip nilai dari
 * pilihan pertanyaannya (kotak centang: Yes/No, seperti kolom Participant
 * list); pertanyaan lain memakai pembanding teks.
 */
function AnswerEditor({ leaf, fields, tone, onChange, onRemove }: {
  leaf: UndianAnswerLeaf;
  fields: UndianAnswerField[] | null | undefined;
  tone: "include" | "exclude";
  onChange: (next: UndianConditionNode) => void;
  onRemove: () => void;
}) {
  const field = fields?.find((item) => item.key === leaf.key);
  // Pertanyaan sudah dihapus dari form: server menganggap syarat ini tidak
  // pernah terpenuhi. Hanya bila daftar pertanyaan benar-benar termuat.
  const gone = Array.isArray(fields) && !field;
  const label = field?.label ?? (gone ? `Deleted question (${leaf.key})` : leaf.key);
  const choices = field ? answerChoices(field) : [];
  // Nilai tersimpan yang tidak ada lagi di pilihan tetap tampil, supaya syarat
  // tidak diam-diam berubah arti saat form dibuka lagi.
  const shownChoices = "values" in leaf ? [...choices, ...leaf.values.filter((item) => !choices.includes(item))] : [];

  // Tombol hapus di luar baris yang membungkus: tetap di kanan atas, tidak turun
  // sendirian ke baris baru di antara pembanding dan chip.
  return <div className="flex items-start gap-2 text-body-medium">
   <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
    <span className="font-medium">{label}</span>
    {"values" in leaf ? <>
      <SelectMenu label="Comparison" width="11.5rem" options={CHOICE_CMP_OPTIONS} value={leaf.cmp} onChange={(cmp) => onChange({ ...leaf, cmp })} />
      {/* order-last: chip pindah ke baris sendiri di bawah, tombol hapus tetap
          di baris judul (di 390 px chip memenuhi beberapa baris). */}
      <div className="order-last flex basis-full flex-wrap gap-1.5">
        {shownChoices.length === 0
          ? <span className="text-on-surface-variant">This question has no options yet.</span>
          : shownChoices.map((option) => {
            const chosen = leaf.values.includes(option);
            return <FilterChip key={option} selected={chosen} onClick={() => onChange({ ...leaf, values: chosen ? leaf.values.filter((item) => item !== option) : [...leaf.values, option] })}>{option}</FilterChip>;
          })}
      </div>
    </> : <>
      <SelectMenu label="Comparison" width="11.5rem" options={TEXT_CMP_OPTIONS} value={leaf.cmp} onChange={(cmp) => onChange({ ...leaf, cmp })} />
      {!TEXT_CMP_WITHOUT_VALUE.includes(leaf.cmp) && <input
        value={leaf.text}
        onChange={(event) => onChange({ ...leaf, text: event.target.value })}
        aria-label={`Value for ${label}`}
        placeholder="enter a value"
        className={cx(CONTROL, "w-52 min-w-0 max-w-full flex-1 basis-40")}
      />}
    </>}
    {gone && <span className="order-last flex basis-full items-start gap-1.5 font-medium text-error">
      <Warning size={16} aria-hidden className="mt-0.5 shrink-0" /> <span>{tone === "exclude"
        ? "This question was deleted from the form, so draws are refused until you delete this condition."
        : "This question was deleted from the form, so no participant qualifies. Delete this condition."}</span>
    </span>}
    {fields === null && <span role="status" className="order-last basis-full text-on-surface-variant">Form questions could not be loaded. This condition is kept as it is.</span>}
   </div>
    <TombolHapus label="Delete condition" onClick={onRemove} icon={<Trash size={16} />} />
  </div>;
}

/**
 * Satu baris di bawah syarat checkpoint: angka yang sedang berlaku, atau
 * peringatan bila setelan checkpoint membuat syaratnya tidak bermakna. Angkanya
 * diubah di Check-in > Checkpoints, bukan di sini (satu setelan, satu tempat).
 */
function CheckpointHint({ variable, checkpoint }: { variable: "checkpoint_goal" | "checkpoint_points" | "checkpoints_all"; checkpoint: CheckpointSummary | null | undefined }) {
  const pathname = usePathname();
  if (checkpoint === undefined) return null;
  const link = <a href={withEventPrefix("/admin/attendance?tab=checkpoint", pathname)} target="_blank" rel="noopener" className="font-medium text-primary underline">Edit in Check-in &gt; Checkpoints ↗</a>;
  let warning = "";
  let info = "";
  if (checkpoint === null) info = "Checkpoint data could not be loaded.";
  else if (!checkpoint.enabled || checkpoint.count === 0) warning = "Checkpoints are not on for this event, so every participant counts as not done.";
  else if (variable !== "checkpoints_all" && !checkpoint.points_enabled) warning = "Checkpoint points are off, so every participant counts as 0 points.";
  else if (variable === "checkpoint_goal" && checkpoint.goal === null) warning = "No points goal is set yet, so nobody has reached it.";
  else if (variable === "checkpoint_goal" && checkpoint.goal !== null && checkpoint.goal > checkpoint.total_points) warning = `The goal of ${plural(checkpoint.goal, "point")} is more than the ${plural(checkpoint.total_points, "point")} available, so nobody can reach it.`;
  else if (variable === "checkpoint_goal") info = `The goal is ${checkpoint.goal} of ${plural(checkpoint.total_points, "point")} available, the same as the participant checkpoint card.`;
  else if (variable === "checkpoint_points") info = `${plural(checkpoint.total_points, "point")} available across ${plural(checkpoint.count, "checkpoint")}.`;
  else info = `This event has ${plural(checkpoint.count, "checkpoint")}.`;
  // Bukan role="alert": hint ini dirender ulang setiap kali syarat diubah, dan
  // tiga syarat checkpoint berarti tiga pengumuman sekaligus.
  return <span className={cx("order-last flex basis-full items-start gap-2", warning ? "font-medium text-error" : "text-on-surface-variant")}>
    {warning && <Warning size={16} aria-hidden className="mt-0.5 shrink-0" />}
    <span className="min-w-0">{warning || info}{checkpoint !== null && <> {link}</>}</span>
  </span>;
}

export { TEXT_VAR_LABEL };

function plural(count: number, word: string): string {
  return `${count.toLocaleString("en-GB")} ${word}${count === 1 ? "" : "s"}`;
}
