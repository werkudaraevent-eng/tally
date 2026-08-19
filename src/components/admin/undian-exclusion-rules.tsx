"use client";

import { CheckCircle, FloppyDisk, Funnel, Plus, Prohibit, Trash, Warning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { UndianConditionBuilder } from "@/components/admin/undian-condition-builder";
import { useToast } from "@/components/toast";
import {
  EMPTY_CONDITIONS, describeConditions, isTrulyEmpty, normalizeExclusionRule,
  type UndianConditionGroup, type UndianExclusionRule,
} from "@/lib/undian";

// Pengelola aturan pengecualian undian.
//
// Peserta yang MEMENUHI aturan justru DIKECUALIKAN. Arah itu diulang berkali-kali
// di layar — pada judul, pada teks bantuan, dan pada label hasil pratinjau — karena
// ia berlawanan dengan syarat hadiah yang ada di tab sebelah, dan kekeliruan
// membacanya baru ketahuan ketika kolamnya sudah salah.
//
// Bagian terpenting komponen ini adalah PRATINJAU, bukan formulirnya. Aturan yang
// salah tulis ("perusahaan sama dengan PRIMA" padahal datanya "PT PRIMA Indonesia")
// tampak sepenuhnya wajar, dan satu-satunya cara mengetahuinya sebelum acara adalah
// melihat daftar nama yang akan tersaring.

type Prize = { id: number; name: string };

type Preview = {
  total_participants: number;
  matched: number;
  incomplete: boolean;
  /** Ada syarat yang tidak terbaca; aturannya tidak akan pernah terpenuhi. */
  has_invalid: boolean;
  sample: { participant_id: string; name: string; company: string | null; title: string | null; participant_type: string | null; seat_label: string | null }[];
};

type Draft = { name: string; note: string; conditions: UndianConditionGroup; prize_id: number | null; is_active: boolean };

const EMPTY_DRAFT: Draft = { name: "", note: "", conditions: EMPTY_CONDITIONS, prize_id: null, is_active: true };

/** Titik awal yang paling sering dibutuhkan, supaya aturan pertama tidak dimulai dari layar kosong. */
const TEMPLATES: { label: string; hint: string; draft: () => Draft }[] = [
  {
    label: "Panitia berdasarkan perusahaan",
    hint: "Semua orang dari satu perusahaan penyelenggara.",
    draft: () => ({ ...EMPTY_DRAFT, name: "Panitia penyelenggara", conditions: { op: "and", children: [{ var: "company", cmp: "contains", text: "" }] } }),
  },
  {
    label: "Tipe peserta tertentu",
    hint: "Mis. Committee, Media, atau Speaker.",
    draft: () => ({ ...EMPTY_DRAFT, name: "Non-delegate", conditions: { op: "and", children: [{ var: "participant_type", cmp: "in", values: [] }] } }),
  },
  {
    label: "Belum check-in",
    hint: "Yang tidak hadir tidak bisa naik panggung mengambil hadiah.",
    draft: () => ({ ...EMPTY_DRAFT, name: "Belum hadir", conditions: { op: "and", children: [{ var: "checked_in", is: false }] } }),
  },
  {
    label: "Jabatan direksi",
    hint: "Cocokkan kata pada kolom jabatan.",
    draft: () => ({ ...EMPTY_DRAFT, name: "Direksi", conditions: { op: "or", children: [{ var: "job_title", cmp: "contains", text: "Director" }, { var: "job_title", cmp: "contains", text: "Direktur" }] } }),
  },
];

export function ExclusionRuleManager({
  prizes, onChanged,
}: {
  prizes: Prize[];
  /** Dipanggil setelah aturan berubah, supaya angka kolam di tab hadiah ikut segar. */
  onChanged: () => void;
}) {
  const [rules, setRules] = useState<UndianExclusionRule[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [totalParticipants, setTotalParticipants] = useState(0);
  // Pilihan untuk rule builder ikut di response yang sama dengan jumlah terkena.
  // Diambil di sini, bukan diteruskan dari halaman induk, supaya nilainya sudah
  // tersedia sebelum ada hadiah yang dibuka untuk diedit — aturan pengecualian
  // sering disusun lebih dulu, saat daftar hadiah masih kosong.
  const [participantTypes, setParticipantTypes] = useState<string[]>([]);
  const [rsvpStatuses, setRsvpStatuses] = useState<string[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [error, setError] = useState("");
  const toast = useToast();

  async function load() {
    const response = await fetch("/api/admin/undian/rules?counts=1", { cache: "no-store" });
    if (!response.ok) { setError("Aturan pengecualian gagal dimuat."); return; }
    const data = await response.json();
    setRules((data.rules as Record<string, unknown>[]).map(normalizeExclusionRule));
    setCounts(data.counts ?? {});
    setTotalParticipants(data.total_participants ?? 0);
    setParticipantTypes(data.participant_types ?? []);
    setRsvpStatuses(data.rsvp_statuses ?? []);
    setCompanies(data.companies ?? []);
  }

  // setState langsung di badan effect ditolak React Compiler, jadi pemuatan awal
  // ditunda satu tick. Pola yang sama dipakai di seluruh halaman admin.
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Pratinjau dihitung ulang dengan jeda. Tanpa jeda, setiap ketikan di kolom
  // perusahaan memicu satu pemanggilan RPC agregat: mengetik "PT PRIMA" berarti
  // delapan permintaan yang tujuh di antaranya sudah tidak relevan saat tiba.
  useEffect(() => {
    if (editingId === null || isTrulyEmpty(draft.conditions)) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        const response = await fetch("/api/admin/undian/rules/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conditions: draft.conditions }),
        });
        if (response.ok) setPreview((await response.json()) as Preview);
      })();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [editingId, draft.conditions]);

  // Pratinjau lama disembunyikan saat syaratnya dikosongkan, dengan menghitungnya
  // saat render alih-alih memanggil setState di dalam effect. Kalau dibiarkan
  // tampil, angka dari syarat sebelumnya terbaca seolah masih berlaku untuk form
  // yang sekarang kosong.
  const visiblePreview = isTrulyEmpty(draft.conditions) ? null : preview;

  function openEditor(rule: UndianExclusionRule | null) {
    setEditingId(rule ? rule.id : "new");
    setDraft(rule
      ? { name: rule.name, note: rule.note ?? "", conditions: rule.conditions, prize_id: rule.prize_id, is_active: rule.is_active }
      : EMPTY_DRAFT);
    setPreview(null);
    setError("");
  }

  function failureMessage(data: { error?: { message?: string; details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> } } }, fallback: string) {
    const field = data.error?.details?.fieldErrors;
    const first = field ? Object.values(field).flat()[0] : undefined;
    return first ?? data.error?.details?.formErrors?.[0] ?? data.error?.message ?? fallback;
  }

  async function save() {
    if (!draft.name.trim()) { setError("Nama aturan wajib diisi."); return; }
    if (isTrulyEmpty(draft.conditions)) { setError("Tambahkan minimal satu syarat. Aturan tanpa syarat akan mengecualikan semua peserta."); return; }

    setSaving(true); setError("");
    const isNew = editingId === "new";
    const response = await fetch(isNew ? "/api/admin/undian/rules" : `/api/admin/undian/rules/${editingId}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, note: draft.note.trim() || null }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      const failure = failureMessage(data, "Aturan gagal disimpan.");
      setError(failure); toast.error("Aturan gagal disimpan", failure); return;
    }
    setEditingId(null);
    await load();
    onChanged();
    toast.success("Aturan tersimpan", `${visiblePreview?.matched ?? 0} peserta akan dikecualikan.`);
  }

  async function remove(id: number) {
    const response = await fetch(`/api/admin/undian/rules/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    if (!response.ok) { toast.error("Aturan gagal dihapus"); return; }
    await load();
    onChanged();
    toast.success("Aturan dihapus", "Peserta yang tadinya tersaring kembali ikut undian.");
  }

  async function toggleActive(rule: UndianExclusionRule) {
    const response = await fetch(`/api/admin/undian/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    if (!response.ok) { toast.error("Status aturan gagal diubah"); return; }
    await load();
    onChanged();
  }

  const inputClass = "h-11 w-full border border-outline-variant bg-surface px-3 text-body-medium outline-none focus:border-primary";
  const labelClass = "text-body-small font-semibold uppercase tracking-[0.1em] text-on-surface-variant";

  return <div className="space-y-2">
    <div className="rounded-lg bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-body-medium font-semibold uppercase tracking-[0.15em] text-on-surface-variant">
            <Funnel size={16} /> Aturan pengecualian
          </h2>
          <p className="mt-2 max-w-lg text-body-small leading-relaxed text-on-surface-variant">
            Peserta yang <span className="font-semibold text-on-surface">memenuhi</span> aturan justru dikeluarkan dari undian.
            Aturan dievaluasi ulang setiap kali mengundi, jadi peserta baru hasil sinkronisasi ikut tersaring otomatis.
          </p>
        </div>
        {editingId === null && <button type="button" onClick={() => openEditor(null)} className="rounded-md flex min-h-11 items-center gap-1.5 border border-outline-variant px-3 text-body-small font-semibold hover:border-primary hover:text-primary">
          <Plus size={15} /> Buat aturan
        </button>}
      </div>

      {error && <p className="rounded-lg mt-4 flex items-start gap-2 border border-error bg-error-soft p-3 text-body-small text-error">
        <Warning size={15} className="mt-0.5 shrink-0" /> {error}
      </p>}

      {rules.length === 0 && editingId === null ? <div className="mt-4">
        <p className="rounded-lg border border-dashed border-outline-variant p-6 text-center text-body-medium text-on-surface-variant">
          Belum ada aturan. Semua peserta aktif ikut diundi.
        </p>
        <p className="mt-4 mb-2 text-body-small font-semibold uppercase tracking-[0.1em] text-on-surface-variant">Mulai cepat</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {TEMPLATES.map((template) => <button
            key={template.label}
            type="button"
            onClick={() => { setEditingId("new"); setDraft(template.draft()); setPreview(null); setError(""); }}
            className="rounded-lg border border-outline-variant p-3 text-left hover:border-primary"
          >
            <span className="block text-body-medium font-semibold">{template.label}</span>
            <span className="mt-1 block text-[11px] leading-snug text-on-surface-variant">{template.hint}</span>
          </button>)}
        </div>
      </div> : rules.length > 0 && <ul className="mt-4 space-y-2">
        {rules.map((rule) => {
          const hit = counts[rule.id] ?? 0;
          return <li key={rule.id} className={`rounded-lg border p-3 ${rule.is_active ? "border-outline-variant" : "border-outline-variant opacity-55"} ${editingId === rule.id ? "ring-2 ring-inset ring-primary" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{rule.name}</span>
                  {!rule.is_active && <span className="rounded-sm border border-outline-variant px-1.5 py-0.5 text-[10px] font-semibold uppercase text-on-surface-variant">Nonaktif</span>}
                  {rule.prize_id !== null && <span className="rounded-sm border border-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                    {prizes.find((prize) => prize.id === rule.prize_id)?.name ?? "hadiah tertentu"}
                  </span>}
                </div>
                <p className="mt-1 text-body-small text-on-surface-variant">Kecualikan bila: {describeConditions(rule.conditions)}</p>
                {rule.note && <p className="mt-1 text-body-small italic text-on-surface-variant">{rule.note}</p>}
                {/* Angka nol ditandai, bukan disembunyikan. Aturan yang tidak
                    mengenai siapa pun hampir selalu salah tulis, dan itu satu-satunya
                    petunjuk yang tersedia sebelum acara. */}
                <p className={`mt-1.5 text-body-small font-semibold tabular-nums ${hit === 0 ? "text-warning" : "text-primary"}`}>
                  {hit === 0
                    ? "Tidak mengenai satu peserta pun — periksa lagi ejaan nilainya."
                    : `${hit} dari ${totalParticipants} peserta dikecualikan`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" onClick={() => openEditor(rule)} className="rounded-md min-h-10 border border-outline-variant px-3 text-body-small font-semibold hover:border-primary hover:text-primary">Ubah</button>
                <button type="button" onClick={() => void toggleActive(rule)} className="rounded-md min-h-10 border border-outline-variant px-3 text-body-small font-semibold hover:border-primary hover:text-primary">
                  {rule.is_active ? "Matikan" : "Aktifkan"}
                </button>
                {confirmDelete === rule.id
                  ? <>
                    <button type="button" onClick={() => void remove(rule.id)} className="rounded-md min-h-10 border border-error bg-error px-3 text-body-small font-semibold text-on-error">Ya, hapus</button>
                    <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-md min-h-10 border border-outline-variant px-3 text-body-small font-semibold">Batal</button>
                  </>
                  : <button type="button" onClick={() => setConfirmDelete(rule.id)} className="rounded-md flex min-h-10 items-center gap-1.5 border border-outline-variant px-3 text-body-small font-semibold text-error hover:border-error"><Trash size={14} /></button>}
              </div>
            </div>
          </li>;
        })}
      </ul>}
    </div>

    {editingId !== null && <div className="rounded-lg bg-panel p-5">
      <h3 className="text-body-medium font-semibold uppercase tracking-[0.15em] text-on-surface-variant">
        {editingId === "new" ? "Aturan baru" : "Ubah aturan"}
      </h3>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="rule-name" className={labelClass}>Nama aturan</label>
          <input id="rule-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="Panitia & MC" />
        </div>
        <div>
          <label htmlFor="rule-prize" className={labelClass}>Berlaku untuk</label>
          <select id="rule-prize" value={draft.prize_id ?? 0} onChange={(event) => setDraft({ ...draft, prize_id: Number(event.target.value) || null })} className={`${inputClass} mt-1.5`}>
            <option value={0}>Semua hadiah</option>
            {prizes.map((prize) => <option key={prize.id} value={prize.id}>Hanya: {prize.name}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor="rule-note" className={labelClass}>Catatan</label>
        <input id="rule-note" value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="Opsional — alasan aturan ini dibuat" />
      </div>

      <div className="mt-4">
        <p className={labelClass}>Kecualikan peserta yang memenuhi</p>
        <div className="mt-2">
          <UndianConditionBuilder
            value={draft.conditions}
            participantTypes={participantTypes}
            rsvpStatuses={rsvpStatuses}
            companies={companies}
            tone="exclude"
            onChange={(next) => setDraft({ ...draft, conditions: next })}
          />
        </div>
      </div>

      {/* Pratinjau. Daftar nama, bukan sekadar jumlah: angka nol masih bisa
          diabaikan sebagai kebetulan, daftar kosong di sebelah kolom yang baru
          diketik jauh lebih sulit dilewatkan. */}
      {visiblePreview && !visiblePreview.incomplete && <div className={`rounded-lg mt-4 border p-3 ${visiblePreview.matched === 0 ? "border-warning-soft-outline bg-warning-soft" : "border-primary/40 bg-primary-soft"}`}>
        {visiblePreview.matched === 0 ? <p className="flex items-start gap-2 text-body-medium font-semibold text-warning">
          <Warning size={16} className="mt-0.5 shrink-0" />
          {visiblePreview.has_invalid
            // Dua sebab berbeda untuk angka nol yang sama, dan tindakannya berbeda
            // pula: syarat yang belum lengkap harus dilengkapi, sedangkan syarat
            // yang lengkap tapi tidak mengenai siapa pun berarti ejaannya keliru.
            ? "Ada syarat yang belum lengkap. Lengkapi nilainya — selama masih kosong, aturan ini tidak akan pernah berlaku."
            : "Tidak ada peserta yang cocok. Periksa ejaan nilainya, atau coba pembanding “mengandung”."}
        </p> : <>
          <p className="flex items-center gap-2 text-body-medium font-semibold text-primary-dim">
            <Prohibit size={16} /> {visiblePreview.matched} dari {visiblePreview.total_participants} peserta akan dikecualikan
          </p>
          <ul className="mt-2 grid gap-0.5 text-body-small text-primary-dim/85 sm:grid-cols-2">
            {visiblePreview.sample.map((row) => <li key={row.participant_id} className="truncate">
              {row.name}{row.company ? ` — ${row.company}` : ""}
            </li>)}
          </ul>
          {visiblePreview.matched > visiblePreview.sample.length && <p className="mt-1.5 text-body-small text-primary-dim/70">
            dan {visiblePreview.matched - visiblePreview.sample.length} lainnya
          </p>}
        </>}
      </div>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void save()} disabled={saving} className="rounded-md flex min-h-12 items-center gap-2 border border-primary bg-primary px-5 text-body-medium font-semibold text-on-primary disabled:opacity-60">
          <FloppyDisk size={18} /> {saving ? "Menyimpan..." : "Simpan aturan"}
        </button>
        <button type="button" onClick={() => setEditingId(null)} className="rounded-md min-h-12 border border-outline-variant px-5 text-body-medium font-semibold">Batal</button>
        <label className="rounded-md flex min-h-12 cursor-pointer items-center gap-2 border border-outline-variant px-4 text-body-medium">
          <input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })} className="h-4 w-4 accent-primary" />
          <CheckCircle size={16} /> Aktif
        </label>
      </div>
    </div>}
  </div>;
}
