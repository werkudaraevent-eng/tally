"use client";

import { Plus, Trash, Warning, X } from "@phosphor-icons/react";
import type { UndianConditionGroup, UndianConditionNode, UndianCmp, UndianTextCmp, UndianTextVar } from "@/lib/undian";
import { TEXT_CMP_LABEL, TEXT_CMP_WITHOUT_VALUE, TEXT_VAR_LABEL, isConditionGroup, isTextLeaf } from "@/lib/undian";

// Rule builder syarat undian.
//
// Dipakai dua arah dengan komponen yang SAMA:
//   * syarat hadiah        — memenuhi berarti BOLEH ikut
//   * aturan pengecualian  — memenuhi berarti DIKECUALIKAN
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
//     "di booth ini". Undian tidak punya konteks booth sama sekali — menyediakan
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
  tone?: "include" | "exclude";
  depth?: number;
};

const VAR_LABEL: Record<string, string> = {
  company: "Perusahaan",
  name: "Nama peserta",
  job_title: "Jabatan",
  participant_type: "Tipe peserta",
  rsvp_status: "Status RSVP",
  checked_in: "Status check-in",
  has_seat: "Kepemilikan kursi",
  seat_label: "Nomor kursi",
  qr_code: "Kode QR / badge",
  total_spend: "Total transaksi",
  booth_count: "Jumlah booth dikunjungi",
  scan_count: "Jumlah scan",
};

// Dikelompokkan supaya daftar dua belas variabel tidak terbaca sebagai satu
// gulungan panjang tanpa struktur.
const VAR_GROUPS: { label: string; vars: string[] }[] = [
  { label: "Identitas", vars: ["company", "name", "job_title", "qr_code"] },
  { label: "Status peserta", vars: ["participant_type", "rsvp_status", "checked_in"] },
  { label: "Kursi", vars: ["has_seat", "seat_label"] },
  { label: "Aktivitas", vars: ["total_spend", "booth_count", "scan_count"] },
];

const CMP_LABEL: Record<UndianCmp, string> = {
  gte: "minimal",
  gt: "lebih dari",
  lte: "maksimal",
  lt: "kurang dari",
  eq: "tepat",
};

const UNIT: Record<string, string> = { total_spend: "rupiah", booth_count: "booth", scan_count: "scan" };

const digitsOnly = (value: string) => value.replace(/\D/g, "");
const grouped = (value: number) => new Intl.NumberFormat("id-ID").format(value);

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
    // diketik sama persis oleh pesertanya — "PT PRIMA", "PT. Prima Indonesia",
    // dan "Prima" adalah satu perusahaan yang sama — sehingga `eq` sebagai bawaan
    // akan menghasilkan nol hasil pada percobaan pertama hampir setiap kali.
    default: return { var: variable as UndianTextVar, cmp: "contains", text: "" };
  }
}

export function UndianConditionBuilder({ value, onChange, participantTypes, rsvpStatuses, companies = [], tone = "include", depth = 0 }: Props) {
  function updateChild(index: number, next: UndianConditionNode) {
    onChange({ ...value, children: value.children.map((child, i) => (i === index ? next : child)) });
  }

  function removeChild(index: number) {
    onChange({ ...value, children: value.children.filter((_, i) => i !== index) });
  }

  return <div className={depth > 0 ? "border-l-2 border-primary/30 pl-4" : ""}>
    {value.children.length > 1 && <div className="mb-3 flex items-center gap-2">
      <span className="text-body-small text-on-surface-variant">Gabungan:</span>
      {(["and", "or"] as const).map((op) => <button key={op} type="button" onClick={() => onChange({ ...value, op })} className={`rounded-sm min-h-9 border px-3 text-body-small font-semibold ${value.op === op ? "border-primary bg-primary-soft text-primary-dim" : "border-outline-variant"}`}>
        {op === "and" ? "SEMUA harus terpenuhi" : "SALAH SATU cukup"}
      </button>)}
    </div>}

    <div className="space-y-2">
      {value.children.map((child, index) => <div key={index} className="rounded-lg border border-outline-variant bg-panel p-3">
        {isConditionGroup(child) ? <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-body-small font-semibold uppercase tracking-[0.1em] text-on-surface-variant">Grup syarat</span>
            <button type="button" onClick={() => removeChild(index)} className="flex min-h-9 items-center px-2 text-error" aria-label="Hapus grup"><X size={15} /></button>
          </div>
          <UndianConditionBuilder value={child} participantTypes={participantTypes} rsvpStatuses={rsvpStatuses} companies={companies} tone={tone} depth={depth + 1} onChange={(next) => updateChild(index, next)} />
        </div> : <LeafEditor
          leaf={child}
          participantTypes={participantTypes}
          rsvpStatuses={rsvpStatuses}
          companies={companies}
          onChange={(next) => updateChild(index, next)}
          onRemove={() => removeChild(index)}
        />}
      </div>)}
    </div>

    <div className="mt-3 flex flex-wrap gap-2">
      <select
        value=""
        onChange={(event) => { if (event.target.value) onChange({ ...value, children: [...value.children, defaultLeaf(event.target.value)] }); }}
        className="rounded-md min-h-11 border border-outline-variant bg-surface px-3 text-body-small font-semibold outline-none focus:border-primary"
      >
        <option value="">+ Tambah syarat</option>
        {VAR_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>
          {group.vars.map((key) => <option key={key} value={key}>{VAR_LABEL[key]}</option>)}
        </optgroup>)}
      </select>
      {/* Kedalaman dibatasi 2 agar aturan tetap terbaca. Lebih dalam dari itu
          hampir selalu tanda aturannya perlu dipecah jadi hadiah terpisah. */}
      {depth < 2 && <button type="button" onClick={() => onChange({ ...value, children: [...value.children, { op: "or", children: [] }] })} className="rounded-md flex min-h-11 items-center gap-1.5 border border-outline-variant px-3 text-body-small font-semibold hover:border-primary hover:text-primary">
        <Plus size={14} /> Grup ATAU
      </button>}
    </div>

    {value.children.length === 0 && depth === 0 && (tone === "exclude"
      // Peringatan, bukan sekadar keterangan: pohon kosong pada aturan pengecualian
      // bernilai benar untuk semua orang, sehingga seluruh ruangan gugur. Database
      // menolaknya lewat CHECK, tapi pesan itu harus terbaca sebelum tombol Simpan
      // ditekan, bukan sesudahnya.
      ? <p className="mt-2 text-body-small font-semibold text-error">Tambahkan minimal satu syarat. Aturan tanpa syarat akan mengecualikan semua peserta.</p>
      : <p className="mt-2 text-body-small text-on-surface-variant">Tanpa syarat — semua peserta aktif ikut diundi.</p>)}
  </div>;
}

function LeafEditor({
  leaf,
  participantTypes,
  rsvpStatuses,
  companies,
  onChange,
  onRemove,
}: {
  leaf: Exclude<UndianConditionNode, UndianConditionGroup>;
  participantTypes: string[];
  rsvpStatuses: string[];
  companies: string[];
  onChange: (next: UndianConditionNode) => void;
  onRemove: () => void;
}) {
  const numeric = leaf.var === "total_spend" || leaf.var === "booth_count" || leaf.var === "scan_count";
  const list = leaf.var === "participant_type" || leaf.var === "rsvp_status";
  // Pilihan diambil dari data peserta yang benar-benar ada, bukan dari daftar
  // tetap di kode. Daftar tetap membuat admin memilih nilai yang tidak dipakai
  // sistem lain, lalu bertanya-tanya kenapa kolamnya kosong.
  const options = leaf.var === "participant_type" ? participantTypes : rsvpStatuses;

  // Syarat yang tidak terbaca. Ditampilkan sebagai peringatan yang bisa dihapus,
  // bukan disembunyikan: ia membuat seluruh aturan tidak pernah terpenuhi, dan
  // satu-satunya jalan keluar adalah membuangnya lalu menyusun ulang.
  if (leaf.var === "__invalid") {
    return <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-body-medium font-semibold text-error">
        <Warning size={15} /> Syarat ini tidak terbaca
      </span>
      <span className="text-body-small text-on-surface-variant">Nilainya belum lengkap atau formatnya berubah. Hapus lalu susun ulang.</span>
      <button type="button" onClick={onRemove} className="ml-auto flex min-h-10 items-center px-2 text-error hover:underline" aria-label="Hapus syarat"><Trash size={15} /></button>
    </div>;
  }

  return <div className="flex flex-wrap items-center gap-2">
    <span className="text-body-medium font-semibold">{VAR_LABEL[leaf.var]}</span>

    {numeric && <>
      <select value={leaf.cmp} onChange={(event) => onChange({ ...leaf, cmp: event.target.value as UndianCmp })} className="rounded-md min-h-10 border border-outline-variant bg-surface px-2 text-body-small outline-none focus:border-primary">
        {Object.entries(CMP_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <input
        value={leaf.var === "total_spend" ? grouped(leaf.value) : String(leaf.value)}
        onChange={(event) => onChange({ ...leaf, value: Number(digitsOnly(event.target.value)) || 0 })}
        inputMode="numeric"
        aria-label={VAR_LABEL[leaf.var]}
        className="rounded-md min-h-10 w-32 border border-outline-variant bg-surface px-2 text-body-medium tabular-nums outline-none focus:border-primary"
      />
      <span className="text-body-small text-on-surface-variant">{UNIT[leaf.var]}</span>
    </>}

    {isTextLeaf(leaf) && <>
      <select
        value={leaf.cmp}
        onChange={(event) => onChange({ ...leaf, cmp: event.target.value as UndianTextCmp })}
        aria-label="Pembanding"
        className="rounded-md min-h-10 border border-outline-variant bg-surface px-2 text-body-small outline-none focus:border-primary"
      >
        {(Object.keys(TEXT_CMP_LABEL) as UndianTextCmp[]).map((key) => <option key={key} value={key}>{TEXT_CMP_LABEL[key]}</option>)}
      </select>
      {/* `kosong` dan `tidak kosong` tidak butuh nilai. Menyembunyikan kolomnya —
          bukan sekadar menonaktifkan — menghilangkan pertanyaan "ini harus diisi
          apa" yang pasti muncul kalau kolomnya tetap terlihat. */}
      {!TEXT_CMP_WITHOUT_VALUE.includes(leaf.cmp) && <>
        <input
          value={leaf.text}
          onChange={(event) => onChange({ ...leaf, text: event.target.value })}
          aria-label={`Nilai ${VAR_LABEL[leaf.var]}`}
          list={leaf.var === "company" ? "undian-company-options" : undefined}
          placeholder={leaf.var === "company" ? "PT PRIMA" : "ketik nilainya"}
          className="rounded-md min-h-10 w-52 border border-outline-variant bg-surface px-2 text-body-medium outline-none focus:border-primary"
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
      <select value={leaf.cmp} onChange={(event) => onChange({ ...leaf, cmp: event.target.value as "in" | "not_in" })} className="rounded-md min-h-10 border border-outline-variant bg-surface px-2 text-body-small outline-none focus:border-primary">
        <option value="in">adalah salah satu</option>
        <option value="not_in">bukan salah satu</option>
      </select>
      <div className="flex flex-wrap gap-1">
        {options.length === 0
          ? <span className="text-body-small text-on-surface-variant">Belum ada nilai di data peserta.</span>
          : options.map((option) => {
            const chosen = leaf.values.includes(option);
            return <button key={option} type="button" onClick={() => onChange({ ...leaf, values: chosen ? leaf.values.filter((item) => item !== option) : [...leaf.values, option] })} className={`rounded-md min-h-10 border px-2 text-body-small font-semibold ${chosen ? "border-primary bg-primary-soft text-primary-dim" : "border-outline-variant"}`}>{option}</button>;
          })}
      </div>
    </>}

    {(leaf.var === "checked_in" || leaf.var === "has_seat") && <div className="flex gap-1">
      {[true, false].map((option) => <button
        key={String(option)}
        type="button"
        onClick={() => onChange({ ...leaf, is: option })}
        className={`rounded-md min-h-10 border px-3 text-body-small font-semibold ${leaf.is === option ? "border-primary bg-primary-soft text-primary-dim" : "border-outline-variant"}`}
      >
        {leaf.var === "checked_in"
          ? (option ? "Sudah check-in" : "Belum check-in")
          : (option ? "Punya kursi" : "Tanpa kursi")}
      </button>)}
    </div>}

    <button type="button" onClick={onRemove} className="ml-auto flex min-h-10 items-center px-2 text-error hover:underline" aria-label="Hapus syarat"><Trash size={15} /></button>
  </div>;
}

export { TEXT_VAR_LABEL };
