"use client";

import { Plus, Trash, X } from "@phosphor-icons/react";
import type { OfferConditionGroup, OfferConditionNode, OfferSpendScope } from "@/lib/domain";

// Rule builder syarat penawaran.
//
// Menggantikan satu field "Syarat total transaksi (Rp)" yang ambigu: labelnya
// tidak menyebutkan cakupan, padahal hasilnya berbeda. Contoh nyata di data:
// peserta dengan total 1.320.000 lintas 4 booth hanya punya 470.000 di booth
// tertinggi, jadi ambang 500.000 meloloskannya bila dihitung semua booth dan
// menolaknya bila per booth.
//
// Setiap kondisi kini menyatakan variabel, cakupan, pembanding, dan nilai secara
// eksplisit, dan dapat digabung dengan grup DAN/ATAU bersarang.

type BoothOption = { id: number; code: string; name: string };

const VAR_LABEL: Record<string, string> = {
  total_spend: "Total transaksi",
  booth_count: "Jumlah booth dikunjungi",
  participant_type: "Tipe peserta",
};

const SCOPE_LABEL: Record<OfferSpendScope, string> = {
  all_booths: "di semua booth",
  this_booth: "di booth ini saja",
  booth: "di booth tertentu",
};

const CMP_LABEL: Record<string, string> = {
  gte: "minimal",
  gt: "lebih dari",
  lte: "maksimal",
  lt: "kurang dari",
  eq: "tepat",
};

const PARTICIPANT_TYPES = ["Delegates", "Committee", "Media", "Speaker"];

const digitsOnly = (value: string) => value.replace(/\D/g, "");
const grouped = (value: number) => new Intl.NumberFormat("id-ID").format(value);

function isGroup(node: OfferConditionNode): node is OfferConditionGroup {
  return "op" in node;
}

function defaultLeaf(variable: string): OfferConditionNode {
  if (variable === "booth_count") return { var: "booth_count", cmp: "gte", value: 3 };
  if (variable === "participant_type") return { var: "participant_type", cmp: "in", values: ["Delegates"] };
  return { var: "total_spend", scope: "all_booths", cmp: "gte", value: 500000 };
}

export function ConditionBuilder({
  value,
  booths,
  onChange,
  depth = 0,
}: {
  value: OfferConditionGroup;
  booths: BoothOption[];
  onChange: (next: OfferConditionGroup) => void;
  depth?: number;
}) {
  function updateChild(index: number, next: OfferConditionNode) {
    onChange({ ...value, children: value.children.map((child, i) => (i === index ? next : child)) });
  }

  function removeChild(index: number) {
    onChange({ ...value, children: value.children.filter((_, i) => i !== index) });
  }

  return <div className={depth > 0 ? "border-l-2 border-[var(--brand)]/30 pl-4" : ""}>
    {value.children.length > 1 && <div className="mb-3 flex items-center gap-2">
      <span className="text-xs text-[var(--ink-muted)]">Gabungan:</span>
      {(["and", "or"] as const).map((op) => <button key={op} type="button" onClick={() => onChange({ ...value, op })} className={`min-h-9 border px-3 text-xs font-semibold ${value.op === op ? "border-[var(--brand)] bg-[#E8ECFB] text-[var(--brand-strong)]" : "border-[var(--line)]"}`}>
        {op === "and" ? "SEMUA harus terpenuhi" : "SALAH SATU cukup"}
      </button>)}
    </div>}

    <div className="space-y-2">
      {value.children.map((child, index) => <div key={index} className="border border-[var(--line)] bg-[var(--surface)] p-3">
        {isGroup(child) ? <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">Grup syarat</span>
            <button type="button" onClick={() => removeChild(index)} className="flex min-h-9 items-center px-2 text-[var(--danger)]" aria-label="Hapus grup"><X size={15} /></button>
          </div>
          <ConditionBuilder value={child} booths={booths} depth={depth + 1} onChange={(next) => updateChild(index, next)} />
        </div> : <LeafEditor leaf={child} booths={booths} onChange={(next) => updateChild(index, next)} onRemove={() => removeChild(index)} />}
      </div>)}
    </div>

    <div className="mt-3 flex flex-wrap gap-2">
      <select
        value=""
        onChange={(event) => { if (event.target.value) onChange({ ...value, children: [...value.children, defaultLeaf(event.target.value)] }); }}
        className="min-h-11 border border-[var(--line)] bg-[var(--background)] px-3 text-xs font-semibold outline-none focus:border-[var(--brand)]"
      >
        <option value="">+ Tambah syarat</option>
        {Object.entries(VAR_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      {/* Kedalaman dibatasi 2 agar aturan tetap terbaca; lebih dalam dari ini
          hampir selalu tanda aturannya perlu dipecah jadi penawaran terpisah. */}
      {depth < 2 && <button type="button" onClick={() => onChange({ ...value, children: [...value.children, { op: "or", children: [] }] })} className="flex min-h-11 items-center gap-1.5 border border-[var(--line)] px-3 text-xs font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]">
        <Plus size={14} /> Grup ATAU
      </button>}
    </div>

    {value.children.length === 0 && depth === 0 && <p className="mt-2 text-xs text-[var(--ink-muted)]">Tanpa syarat — penawaran terbuka untuk semua peserta.</p>}
  </div>;
}

function LeafEditor({
  leaf,
  booths,
  onChange,
  onRemove,
}: {
  leaf: Exclude<OfferConditionNode, OfferConditionGroup>;
  booths: BoothOption[];
  onChange: (next: OfferConditionNode) => void;
  onRemove: () => void;
}) {
  return <div className="flex flex-wrap items-center gap-2">
    <span className="text-sm font-semibold">{VAR_LABEL[leaf.var]}</span>

    {leaf.var === "total_spend" && <>
      <select value={leaf.scope} onChange={(event) => onChange({ ...leaf, scope: event.target.value as OfferSpendScope, booth_id: null })} className="min-h-10 border border-[var(--line)] bg-[var(--background)] px-2 text-xs outline-none focus:border-[var(--brand)]">
        {(Object.keys(SCOPE_LABEL) as OfferSpendScope[]).map((scope) => <option key={scope} value={scope}>{SCOPE_LABEL[scope]}</option>)}
      </select>
      {leaf.scope === "booth" && <select value={leaf.booth_id ?? 0} onChange={(event) => onChange({ ...leaf, booth_id: Number(event.target.value) || null })} className="min-h-10 border border-[var(--line)] bg-[var(--background)] px-2 text-xs outline-none focus:border-[var(--brand)]">
        <option value={0}>Pilih booth</option>
        {booths.map((booth) => <option key={booth.id} value={booth.id}>{booth.code}</option>)}
      </select>}
    </>}

    {leaf.var !== "participant_type" ? <>
      <select value={leaf.cmp} onChange={(event) => onChange({ ...leaf, cmp: event.target.value as typeof leaf.cmp })} className="min-h-10 border border-[var(--line)] bg-[var(--background)] px-2 text-xs outline-none focus:border-[var(--brand)]">
        {Object.entries(CMP_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <input
        value={leaf.var === "total_spend" ? grouped(leaf.value) : String(leaf.value)}
        onChange={(event) => onChange({ ...leaf, value: Number(digitsOnly(event.target.value)) || 0 })}
        inputMode="numeric"
        className="min-h-10 w-32 border border-[var(--line)] bg-[var(--background)] px-2 text-sm tabular-nums outline-none focus:border-[var(--brand)]"
      />
      <span className="text-xs text-[var(--ink-muted)]">{leaf.var === "total_spend" ? "rupiah" : "booth"}</span>
    </> : <>
      <select value={leaf.cmp} onChange={(event) => onChange({ ...leaf, cmp: event.target.value as "in" | "not_in" })} className="min-h-10 border border-[var(--line)] bg-[var(--background)] px-2 text-xs outline-none focus:border-[var(--brand)]">
        <option value="in">adalah salah satu</option>
        <option value="not_in">bukan salah satu</option>
      </select>
      <div className="flex flex-wrap gap-1">
        {PARTICIPANT_TYPES.map((type) => {
          const chosen = leaf.values.includes(type);
          return <button key={type} type="button" onClick={() => onChange({ ...leaf, values: chosen ? leaf.values.filter((v) => v !== type) : [...leaf.values, type] })} className={`min-h-10 border px-2 text-xs font-semibold ${chosen ? "border-[var(--brand)] bg-[#E8ECFB] text-[var(--brand-strong)]" : "border-[var(--line)]"}`}>{type}</button>;
        })}
      </div>
    </>}

    <button type="button" onClick={onRemove} className="ml-auto flex min-h-10 items-center px-2 text-[var(--danger)] hover:underline" aria-label="Hapus syarat"><Trash size={15} /></button>
  </div>;
}

// Ringkasan satu baris untuk daftar penawaran, supaya admin tidak perlu membuka
// form edit hanya untuk tahu syaratnya apa.
export function describeConditions(node: OfferConditionGroup, booths: BoothOption[]): string {
  if (node.children.length === 0) return "tanpa syarat";

  const parts = node.children.map((child) => {
    if (isGroup(child)) return `(${describeConditions(child, booths)})`;
    if (child.var === "participant_type") {
      return `tipe ${child.cmp === "in" ? "" : "bukan "}${child.values.join("/")}`;
    }
    if (child.var === "booth_count") {
      return `${CMP_LABEL[child.cmp]} ${child.value} booth`;
    }
    const scope = child.scope === "all_booths"
      ? "semua booth"
      : child.scope === "this_booth"
        ? "booth ini"
        : booths.find((booth) => booth.id === child.booth_id)?.code ?? "booth";
    return `belanja ${scope} ${CMP_LABEL[child.cmp]} Rp ${grouped(child.value)}`;
  });

  return parts.join(node.op === "and" ? " dan " : " atau ");
}
