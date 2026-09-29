"use client";

import { FloppyDisk, Funnel, Plus, Prohibit, Trash, Warning, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import Link from "@/components/event-link";
import {
  Button, DetailSection, Dialog, EmptyState, IconButton, ListDetail, PageLoading, Pane, PaneBody, PaneFooter, PaneHeader,
  StatusChip, Switch,
} from "@/components/m3";
import { UndianConditionBuilder } from "@/components/admin/undian-condition-builder";
import { useToast } from "@/components/toast";
import { cx } from "@/lib/m3/cx";
import {
  EMPTY_CONDITIONS, describeConditions, isTrulyEmpty, normalizeExclusionRule,
  type UndianConditionGroup, type UndianExclusionRule,
} from "@/lib/undian";
import { INPUT } from "@/components/admin/compact-form";

// Pengelola aturan pengecualian undian.
//
// Peserta yang MEMENUHI aturan justru DIKECUALIKAN. Arah itu diulang berkali-kali
// di layar (pada judul, pada teks bantuan, dan pada label hasil pratinjau) karena
// ia berlawanan dengan syarat hadiah di tab sebelah, dan kekeliruan membacanya
// baru ketahuan ketika kolamnya sudah salah.
//
// Bagian terpenting komponen ini adalah PRATINJAU, bukan formulirnya. Aturan yang
// salah tulis ("perusahaan sama dengan PRIMA" padahal datanya "PT PRIMA Indonesia")
// tampak sepenuhnya wajar, dan satu-satunya cara mengetahuinya sebelum acara adalah
// melihat daftar nama yang akan tersaring.
//
// Susunannya list-detail: aturan dan pengecualian per orang di kiri, penyunting
// aturan di kanan hanya saat satu aturan dibuka.

type Prize = { id: number; name: string };
type Exclusion = { participant_id: string; name: string; company: string | null; reason: string | null };

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
  prizes, exclusions, onRemoveExclusion, onChanged,
}: {
  prizes: Prize[];
  /** Pengecualian per orang, dimuat oleh halaman induk. */
  exclusions: Exclusion[];
  onRemoveExclusion: (participantId: string) => Promise<void>;
  /** Dipanggil setelah aturan berubah, supaya angka kolam di tab hadiah ikut segar. */
  onChanged: () => void;
}) {
  const [rules, setRules] = useState<UndianExclusionRule[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [totalParticipants, setTotalParticipants] = useState(0);
  // Pilihan untuk rule builder ikut di response yang sama dengan jumlah terkena.
  // Diambil di sini, bukan diteruskan dari halaman induk, supaya nilainya sudah
  // tersedia sebelum ada hadiah yang dibuka untuk diedit: aturan pengecualian
  // sering disusun lebih dulu, saat daftar hadiah masih kosong.
  const [participantTypes, setParticipantTypes] = useState<string[]>([]);
  const [rsvpStatuses, setRsvpStatuses] = useState<string[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UndianExclusionRule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState("");
  const toast = useToast();

  async function load() {
    const response = await fetch("/api/admin/undian/rules?counts=1", { cache: "no-store" }).catch(() => null);
    setLoaded(true);
    if (!response?.ok) { setLoadFailed(true); setError("Aturan pengecualian gagal dimuat."); return; }
    setLoadFailed(false);
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
    setDeleting(true);
    const response = await fetch(`/api/admin/undian/rules/${id}`, { method: "DELETE" });
    setDeleting(false);
    setConfirmDelete(null);
    if (!response.ok) { toast.error("Aturan gagal dihapus"); return; }
    if (editingId === id) setEditingId(null);
    await load();
    onChanged();
    toast.success("Aturan dihapus", "Peserta yang tadinya tersaring kembali ikut undian.");
  }

  async function toggleActive(rule: UndianExclusionRule) {
    setToggling(rule.id);
    const response = await fetch(`/api/admin/undian/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    setToggling(null);
    if (!response.ok) { toast.error("Status aturan gagal diubah"); return; }
    await load();
    onChanged();
  }

  async function restore(participantId: string) {
    setRestoring(participantId);
    await onRemoveExclusion(participantId);
    setRestoring(null);
  }

  const editing = editingId !== null;

  const list = (
    <Pane aria-label="Aturan pengecualian">
      <PaneHeader>
        <h2 className="min-w-0 flex-1 text-body-medium font-semibold">Aturan pengecualian</h2>
        <Button variant="outlined" size="sm" icon={<Plus size={16} />} disabled={editing} onClick={() => openEditor(null)}>Aturan baru</Button>
      </PaneHeader>
      <PaneBody>
        <p className="border-b border-outline-variant px-4 py-3 text-body-medium text-on-surface-variant">
          Peserta yang <span className="font-medium text-on-surface">memenuhi</span> aturan justru dikeluarkan dari undian.
          Aturan dievaluasi ulang setiap kali mengundi, jadi peserta baru hasil sinkronisasi ikut tersaring otomatis.
        </p>

        {error && !editing ? <div className="border-b border-outline-variant p-4"><ErrorLine>{error}</ErrorLine></div> : null}

        {!loaded ? <PageLoading /> : loadFailed ? null : rules.length === 0 ? (
          <div className="border-b border-outline-variant px-4 py-4">
            <p className="text-body-medium text-on-surface-variant">Belum ada aturan. Semua peserta aktif ikut diundi. Mulai dari salah satu pola ini:</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {TEMPLATES.map((template) => (
                <button
                  key={template.label}
                  type="button"
                  disabled={editing}
                  onClick={() => { setEditingId("new"); setDraft(template.draft()); setPreview(null); setError(""); }}
                  className="rounded-md border border-outline-variant bg-surface-container-lowest p-3 text-left text-body-medium hover:bg-primary-soft disabled:opacity-50"
                >
                  <span className="block font-medium">{template.label}</span>
                  <span className="mt-0.5 block text-on-surface-variant">{template.hint}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul>
            {rules.map((rule) => {
              const hit = counts[rule.id] ?? 0;
              const selected = editingId === rule.id;
              return (
                <li key={rule.id} className={cx("flex items-start gap-2 border-b border-outline-variant pr-3", selected ? "bg-secondary-container" : "hover:bg-primary-soft")}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => { if (selected) setEditingId(null); else openEditor(rule); }}
                    className={cx("min-w-0 flex-1 rounded-sm px-4 py-2.5 text-left text-body-medium", !rule.is_active && "text-on-surface-variant")}
                  >
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{rule.name}</span>
                      {!rule.is_active ? <StatusChip>Nonaktif</StatusChip> : null}
                      {rule.prize_id !== null ? <StatusChip tone="primary">{prizes.find((prize) => prize.id === rule.prize_id)?.name ?? "Hadiah tertentu"}</StatusChip> : null}
                    </span>
                    <span className="mt-0.5 block text-on-surface-variant">Kecualikan bila: {describeConditions(rule.conditions)}</span>
                    {rule.note ? <span className="mt-0.5 block text-on-surface-variant">{rule.note}</span> : null}
                    {/* Angka nol ditandai, bukan disembunyikan. Aturan yang tidak
                        mengenai siapa pun hampir selalu salah tulis, dan itu
                        satu-satunya petunjuk yang tersedia sebelum acara. */}
                    <span className={cx("mt-0.5 block tabular-nums", hit === 0 ? "font-medium text-warning" : "text-on-surface")}>
                      {hit === 0 ? "Tidak mengenai satu peserta pun. Periksa lagi ejaan nilainya." : `${hit} dari ${totalParticipants} peserta dikecualikan`}
                    </span>
                  </button>
                  <Button variant="text" size="sm" className="mt-1.5 shrink-0" loading={toggling === rule.id} onClick={() => void toggleActive(rule)}>
                    {rule.is_active ? "Matikan" : "Aktifkan"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <section aria-labelledby="pengecualian-per-orang" className="px-4 py-4">
          <h3 id="pengecualian-per-orang" className="flex items-center gap-2 text-body-medium font-semibold">
            <Prohibit size={16} aria-hidden /> Pengecualian per orang
            <span className="font-normal tabular-nums text-on-surface-variant">{exclusions.length}</span>
          </h3>
          <p className="mt-1 text-body-medium text-on-surface-variant">
            Untuk kasus tanpa pola, mis. satu orang yang kebetulan jadi MC malam ini. Yang punya pola sebaiknya dibuat sebagai aturan di atas, supaya peserta baru hasil sinkronisasi ikut tersaring.
            Tambahkan lewat panel detail di halaman <Link href="/admin/participants" className="rounded-sm font-medium text-primary hover:underline">Daftar peserta</Link>.
          </p>
        </section>
        {exclusions.length === 0 ? (
          <p className="px-4 pb-4 text-body-medium text-on-surface-variant">Belum ada peserta yang dikecualikan satu per satu.</p>
        ) : (
          <ul className="border-t border-outline-variant">
            {exclusions.map((item) => (
              <li key={item.participant_id} className="flex items-center gap-3 border-b border-outline-variant px-4 py-2.5 text-body-medium">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.name}</p>
                  <p className="truncate text-on-surface-variant">{[item.company, item.reason].filter(Boolean).join(" · ") || "Tanpa perusahaan"}</p>
                </div>
                <Button variant="text" size="sm" loading={restoring === item.participant_id} onClick={() => void restore(item.participant_id)}>Ikutkan lagi</Button>
              </li>
            ))}
          </ul>
        )}
      </PaneBody>
    </Pane>
  );

  const existing = typeof editingId === "number" ? rules.find((rule) => rule.id === editingId) ?? null : null;

  const detail = editing ? (
    <Pane as="aside" aria-label={editingId === "new" ? "Aturan baru" : "Ubah aturan"}>
      <PaneHeader className="px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-title-medium font-semibold">{editingId === "new" ? "Aturan baru" : draft.name || "Ubah aturan"}</h2>
          <p className="text-body-medium text-on-surface-variant">Peserta yang memenuhi syarat di bawah dikecualikan.</p>
        </div>
        <IconButton size="sm" label="Tutup penyunting aturan" onClick={() => setEditingId(null)} disabled={saving}><X size={16} /></IconButton>
      </PaneHeader>
      <PaneBody>
        <form id="form-aturan" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          {error ? <div className="px-5 pt-4"><ErrorLine>{error}</ErrorLine></div> : null}
          <DetailSection title="Aturan">
            <Switch checked={draft.is_active} onChange={(checked) => setDraft({ ...draft, is_active: checked })} label="Aktif" description="Aturan nonaktif tidak menyaring siapa pun." />
            <div>
              <label htmlFor="rule-name" className="block text-body-medium font-medium">Nama aturan</label>
              <input id="rule-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={INPUT} placeholder="Panitia dan MC" />
            </div>
            <div>
              <label htmlFor="rule-prize" className="block text-body-medium font-medium">Berlaku untuk</label>
              <select id="rule-prize" value={draft.prize_id ?? 0} onChange={(event) => setDraft({ ...draft, prize_id: Number(event.target.value) || null })} className={INPUT}>
                <option value={0}>Semua hadiah</option>
                {prizes.map((prize) => <option key={prize.id} value={prize.id}>Hanya: {prize.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="rule-note" className="block text-body-medium font-medium">Catatan</label>
              <input id="rule-note" value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} className={INPUT} placeholder="Opsional, alasan aturan ini dibuat" />
            </div>
          </DetailSection>

          <DetailSection title="Kecualikan peserta yang memenuhi">
            <UndianConditionBuilder
              value={draft.conditions}
              participantTypes={participantTypes}
              rsvpStatuses={rsvpStatuses}
              companies={companies}
              tone="exclude"
              onChange={(next) => setDraft({ ...draft, conditions: next })}
            />

            {/* Pratinjau. Daftar nama, bukan sekadar jumlah: angka nol masih bisa
                diabaikan sebagai kebetulan, daftar kosong di sebelah kolom yang
                baru diketik jauh lebih sulit dilewatkan. */}
            {visiblePreview && !visiblePreview.incomplete ? (
              <div className={cx("rounded-md p-3 text-body-medium", visiblePreview.matched === 0 ? "bg-warning-soft" : "bg-surface-container-high")} aria-live="polite">
                {visiblePreview.matched === 0 ? (
                  <p className="flex items-start gap-2 font-medium text-on-surface">
                    <Warning size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                    {visiblePreview.has_invalid
                      // Dua sebab berbeda untuk angka nol yang sama, dan tindakannya
                      // berbeda pula: syarat yang belum lengkap harus dilengkapi,
                      // sedangkan syarat yang lengkap tapi tidak mengenai siapa pun
                      // berarti ejaannya keliru.
                      ? "Ada syarat yang belum lengkap. Selama nilainya masih kosong, aturan ini tidak akan pernah berlaku."
                      : "Tidak ada peserta yang cocok. Periksa ejaan nilainya, atau coba pembanding “mengandung”."}
                  </p>
                ) : (
                  <>
                    <p className="flex items-center gap-2 font-medium tabular-nums">
                      <Funnel size={16} aria-hidden /> {visiblePreview.matched} dari {visiblePreview.total_participants} peserta akan dikecualikan
                    </p>
                    <ul className="mt-1.5 grid gap-0.5 text-on-surface-variant sm:grid-cols-2">
                      {visiblePreview.sample.map((row) => (
                        <li key={row.participant_id} className="truncate">{row.name}{row.company ? `, ${row.company}` : ""}</li>
                      ))}
                    </ul>
                    {visiblePreview.matched > visiblePreview.sample.length ? (
                      <p className="mt-1 text-on-surface-variant">dan {visiblePreview.matched - visiblePreview.sample.length} lainnya</p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </DetailSection>
        </form>
      </PaneBody>
      <PaneFooter note={existing ? <Button variant="text" size="sm" className="-ml-3 text-error" icon={<Trash size={16} />} disabled={saving} onClick={() => setConfirmDelete(existing)}>Hapus aturan</Button> : undefined}>
        <Button type="submit" form="form-aturan" size="sm" loading={saving} icon={<FloppyDisk size={16} />}>Simpan aturan</Button>
      </PaneFooter>
    </Pane>
  ) : null;

  return (
    <>
      {loadFailed ? (
        <EmptyState
          icon={<Warning size={40} />}
          title="Aturan pengecualian gagal dimuat"
          description="Periksa koneksi, lalu coba lagi."
          action={<Button variant="outlined" size="sm" onClick={() => void load()}>Coba lagi</Button>}
        />
      ) : <ListDetail list={list} detail={detail} detailWidth={560} />}
      <Dialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        dismissible={!deleting}
        tone="danger"
        title={`Hapus aturan ${confirmDelete?.name ?? ""}?`}
        description="Peserta yang tadinya tersaring kembali ikut undian berikutnya. Pemenang yang sudah keluar tidak berubah. Penghapusan tercatat di jejak audit."
        actions={
          <>
            <Button variant="outlined" disabled={deleting} onClick={() => setConfirmDelete(null)}>Batal</Button>
            <Button variant="danger" loading={deleting} onClick={() => { if (confirmDelete) void remove(confirmDelete.id); }}>Hapus aturan</Button>
          </>
        }
      />
    </>
  );
}

function ErrorLine({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><Warning size={16} className="mt-0.5 shrink-0" aria-hidden />{children}</p>;
}
