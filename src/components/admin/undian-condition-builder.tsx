"use client";

import { Plus, Trash, Warning, X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { UndianConditionGroup, UndianConditionNode, UndianCmp, UndianTextCmp, UndianTextVar } from "@/lib/undian";
import { TEXT_CMP_LABEL, TEXT_CMP_WITHOUT_VALUE, TEXT_VAR_LABEL, isConditionGroup, isTextLeaf } from "@/lib/undian";
import { cx } from "@/lib/m3/cx";

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
};

// Dikelompokkan supaya daftar dua belas variabel tidak terbaca sebagai satu
// gulungan panjang tanpa struktur.
const VAR_GROUPS: { label: string; vars: string[] }[] = [
  { label: "Identity", vars: ["company", "name", "job_title", "qr_code"] },
  { label: "Participant status", vars: ["participant_type", "rsvp_status", "checked_in"] },
  { label: "Seat", vars: ["has_seat", "seat_label"] },
  { label: "Activity", vars: ["total_spend", "booth_count", "scan_count"] },
];

const CMP_LABEL: Record<UndianCmp, string> = {
  gte: "at least",
  gt: "more than",
  lte: "at most",
  lt: "less than",
  eq: "exactly",
};

const UNIT: Record<string, string> = { total_spend: "rupiah", booth_count: "booth", scan_count: "scan" };

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

export function UndianConditionBuilder({ value, onChange, participantTypes, rsvpStatuses, companies = [], sessions, onRetrySessions, tone = "include", depth = 0 }: Props) {
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
          <UndianConditionBuilder value={child} participantTypes={participantTypes} rsvpStatuses={rsvpStatuses} companies={companies} sessions={sessions} onRetrySessions={onRetrySessions} tone={tone} depth={depth + 1} onChange={(next) => updateChild(index, next)} />
        </div> : <LeafEditor
          leaf={child}
          participantTypes={participantTypes}
          rsvpStatuses={rsvpStatuses}
          companies={companies}
          sessions={sessions}
          onRetrySessions={onRetrySessions}
          tone={tone}
          onChange={(next) => updateChild(index, next)}
          onRemove={() => removeChild(index)}
        />}
      </div>)}
    </div>

    <div className="mt-2 flex flex-wrap gap-2">
      <select
        value=""
        aria-label="Add condition"
        onChange={(event) => { if (event.target.value) onChange({ ...value, children: [...value.children, defaultLeaf(event.target.value)] }); }}
        className={cx(CONTROL, "font-medium")}
      >
        <option value="">+ Add condition</option>
        {VAR_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>
          {group.vars.map((key) => <option key={key} value={key}>{VAR_LABEL[key]}</option>)}
        </optgroup>)}
      </select>
      {/* Kedalaman dibatasi 2 agar aturan tetap terbaca. Lebih dalam dari itu
          hampir selalu tanda aturannya perlu dipecah jadi hadiah terpisah. */}
      {depth < 2 && <button type="button" onClick={() => onChange({ ...value, children: [...value.children, { op: "or", children: [] }] })} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-medium font-medium hover:bg-primary-soft">
        <Plus size={14} aria-hidden /> Add group
      </button>}
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
  tone: "include" | "exclude";
  onChange: (next: UndianConditionNode) => void;
  onRemove: () => void;
}) {
  const numeric = leaf.var === "total_spend" || leaf.var === "booth_count" || leaf.var === "scan_count";
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
      <span className="text-on-surface-variant">{UNIT[leaf.var]}</span>
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

export { TEXT_VAR_LABEL };
