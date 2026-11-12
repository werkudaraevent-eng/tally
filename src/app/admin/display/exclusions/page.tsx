"use client";

// Pengecualian peserta/perusahaan dari top spender.
//
// Kenapa terpisah dari setelan papan peringkat: ini aturan KELAYAKAN ("tidak
// berhak ikut"), bukan setelan tampilan. Kalau digabung ke form setelan, daftar
// diskualifikasi ikut terkirim setiap kali ada yang mengubah warna latar, dan
// sebaliknya menambah satu perusahaan menerbitkan perubahan tampilan yang belum
// selesai.
//
// Setiap aksi di sini BERLAKU SEKETIKA, tanpa tombol Simpan global: aturan
// setengah jadi yang lupa disimpan berarti nama yang seharusnya gugur tetap naik
// ke proyektor.

import { ArrowSquareOut, Buildings, Info, Prohibit, Snowflake, Trash, User, Warning, WarningCircle } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import {
  Banner, Button, ButtonLink, Dialog, EmptyState, IconButton, MetaSeparator, Pane, PaneBody, PaneFooter, PaneHeader,
  SegmentedButton, SelectField, StatusChip, SupportingPane, TextField, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";
import { DisplayTabs } from "../display-tabs";

type Rule = {
  id: number;
  company_keyword: string | null;
  participant_id: string | null;
  reason: string | null;
  is_active: boolean;
  matched_participants: number;
  matched_spenders: number;
};

type Participant = { id: string; name: string; company: string | null };
type Company = { label: string; count: number };
type Summary = { total_spenders: number; excluded_spenders: number; remaining_spenders: number };
type Sasaran = "company" | "participant";

export default function LeaderboardExclusionsPage() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [limit, setLimit] = useState(10);
  const [mode, setMode] = useState<Sasaran>("company");
  const [company, setCompany] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [menambah, setMenambah] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [revealMode, setRevealMode] = useState<"off" | "staged" | null>(null);
  const [error, setError] = useState("");
  const toast = useToast();

  const load = useCallback(async () => {
    const [response, displayResponse, revealResponse] = await Promise.all([
      fetch("/api/admin/leaderboard/exclusions", { cache: "no-store" }).catch(() => null),
      fetch("/api/display/settings", { cache: "no-store" }).catch(() => null),
      fetch("/api/display/reveal", { cache: "no-store" }).catch(() => null),
    ]);
    if (displayResponse?.ok) {
      const data = await displayResponse.json().catch(() => null);
      if (data?.leaderboard_limit) setLimit(Number(data.leaderboard_limit));
    }
    // Papan yang sudah dibekukan TIDAK ikut berubah oleh aturan baru. Tanpa
    // peringatan, panitia menambah pengecualian di tengah ceremony, melihat
    // layar tidak berubah, lalu menambah aturan lagi dan lagi.
    if (revealResponse?.ok) {
      const data = await revealResponse.json().catch(() => null);
      setFrozen(Boolean(data?.frozen));
      if (data) setRevealMode(data.mode === "staged" ? "staged" : "off");
    }
    if (!response) { setError("Connection lost. The exclusion list could not be loaded."); return; }
    if (!response.ok) { setError("Could not load the exclusion list."); return; }
    const data = await response.json().catch(() => null);
    if (!data) { setError("Could not read the exclusion list."); return; }
    setRules(data.rules ?? []);
    setSummary(data.summary ?? null);
    setParticipants(data.participants ?? []);
    setCompanies(data.companies ?? []);
    setError("");
  }, []);

  // React Compiler melarang setState di badan effect, jadi pemuatan awal
  // ditunda satu tick. Pola yang sama dipakai halaman admin lain.
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function add() {
    const target = mode === "company" ? company.trim() : participantId;
    if (!target) return;
    setBusy(true); setMenambah(true); setError("");
    const response = await fetch("/api/admin/leaderboard/exclusions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_keyword: mode === "company" ? target : null,
        participant_id: mode === "participant" ? target : null,
        reason: reason.trim() || null,
      }),
    }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    setBusy(false); setMenambah(false);
    if (!response?.ok) {
      const failure = data?.error?.details?.company_keyword?.[0] ?? data?.error?.message ?? (response ? `Could not add the exclusion (${response.status}).` : "Connection lost. Try again.");
      setError(failure);
      toast.error("Could not add the exclusion", failure);
      return;
    }
    setCompany(""); setParticipantId(""); setReason("");
    toast.success("Exclusion added", "The top spender board updates right away.");
    await load();
  }

  async function toggle(rule: Rule) {
    setBusy(true); setError("");
    const response = await fetch(`/api/admin/leaderboard/exclusions/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !rule.is_active }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) { setError("Could not change the rule status."); return; }
    await load();
  }

  async function remove(id: number) {
    setBusy(true); setError("");
    const response = await fetch(`/api/admin/leaderboard/exclusions/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    setConfirmId(null);
    if (!response?.ok) { setError("Could not delete the rule."); return; }
    toast.info("Exclusion removed", "Matching participants count towards top spender again.");
    await load();
  }

  const participantName = (id: string | null) => {
    if (!id) return null;
    const found = participants.find((item) => item.id === id);
    return found ? `${found.name}${found.company ? ` · ${found.company}` : ""}` : "Participant not found";
  };

  const namaAturan = (rule: Rule) => rule.company_keyword ?? participantName(rule.participant_id) ?? "this rule";

  // Papan lebih pendek daripada yang disetel. Bukan galat, tapi wajib terlihat:
  // di proyektor gejalanya hanya baris yang lebih sedikit, dan tidak ada yang
  // menghubungkannya dengan aturan yang baru saja ditambahkan sendiri.
  const tooFew = summary !== null && summary.remaining_spenders < limit;
  const empty = summary !== null && summary.remaining_spenders === 0;
  const aturanAktif = rules?.filter((rule) => rule.is_active).length ?? 0;
  const dikonfirmasi = rules?.find((rule) => rule.id === confirmId) ?? null;

  // ---- Panel utama: ringkasan dan daftar -----------------------------------------
  const daftar = (
    <Pane aria-label="Exclusion list">
      {summary ? (
        <dl className="grid shrink-0 grid-cols-3 divide-x divide-outline-variant border-b border-outline-variant">
          {[
            { label: "Participants who bought", value: summary.total_spenders },
            { label: "Excluded", value: summary.excluded_spenders },
            { label: "On the board", value: summary.remaining_spenders },
          ].map((item) => (
            <div key={item.label} className="min-w-0 px-4 py-3">
              <dt className="truncate text-body-medium text-on-surface-variant">{item.label}</dt>
              <dd className="mt-0.5 text-title-large font-semibold tabular-nums text-on-surface">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <PaneHeader>
        <h2 className="min-w-0 flex-1 text-body-medium font-semibold text-on-surface">Exclusion list</h2>
        {rules ? <span className="text-body-medium tabular-nums text-on-surface-variant">{rules.length} aturan</span> : null}
      </PaneHeader>
      <PaneBody>
        {rules === null ? (
          error ? (
            <p className="px-4 py-6 text-body-medium text-on-surface-variant">The list cannot be shown. Reload the page.</p>
          ) : (
            <div role="status" aria-label="Loading" className="flex h-60 items-center justify-center"><span aria-hidden className="m3-spinner" /></div>
          )
        ) : rules.length === 0 ? (
          <EmptyState
            plain
            icon={<Prohibit size={32} />}
            title="No exclusions yet"
            description="Every participant is eligible for top spender. Add a company or participant in the Add exclusion panel."
          />
        ) : (
          <ul>
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-start gap-3 border-b border-outline-variant px-4 py-3 text-body-medium">
                <span className="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden>
                  {rule.company_keyword ? <Buildings size={18} /> : <User size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-on-surface">{namaAturan(rule)}</span>
                    {!rule.is_active ? <StatusChip>Off</StatusChip> : null}
                  </p>
                  {rule.reason ? <p className="mt-0.5 text-on-surface-variant">{rule.reason}</p> : null}
                  {/* Nol cocok DITANDAI, bukan disembunyikan. Nol hampir selalu
                      berarti salah pilih, dan ini satu-satunya peringatan yang
                      tersedia sebelum acara dimulai. */}
                  <p className={rule.matched_participants === 0 ? "mt-1 flex items-center gap-1.5 font-medium text-error" : "mt-1 tabular-nums text-on-surface-variant"}>
                    {rule.matched_participants === 0
                      ? <><WarningCircle size={16} aria-hidden />Matches nobody. Check the selection again.</>
                      : <>Cocok {rule.matched_participants} peserta, {rule.matched_spenders} di antaranya punya transaksi lunas.</>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="outlined" size="sm" disabled={busy} onClick={() => void toggle(rule)}>
                    {rule.is_active ? "Turn off" : "Turn on"}
                  </Button>
                  <IconButton simpan size="sm" label={`Delete rule ${namaAturan(rule)}`} disabled={busy} onClick={() => setConfirmId(rule.id)}>
                    <Trash size={18} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PaneBody>
    </Pane>
  );

  // ---- Panel pendukung: tambah aturan --------------------------------------------
  const siapTambah = mode === "company" ? Boolean(company) : Boolean(participantId);
  const formulir = (
    <Pane as="aside" aria-label="Add exclusion">
      <PaneHeader>
        <h2 className="min-w-0 flex-1 text-body-medium font-semibold text-on-surface">Add exclusion</h2>
      </PaneHeader>
      <PaneBody className="px-5 py-4">
        <form id="form-pengecualian" className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void add(); }}>
          <SegmentedButton<Sasaran>
            label="Exclusion type"
            value={mode}
            onChange={setMode}
            className="w-full"
            options={[
              { value: "company", label: "One company", icon: <Buildings size={16} aria-hidden /> },
              { value: "participant", label: "One participant", icon: <User size={16} aria-hidden /> },
            ]}
          />
          {mode === "company" ? (
            // <select>, bukan input bebas: salah satu huruf menghasilkan aturan
            // yang tersimpan rapi, berefek nol, dan panitia menunggu perubahan
            // yang tidak akan pernah muncul.
            <SelectField
              label="Company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              hint="Matched partially and case-insensitive, so “PT Rintis Sejahtera” and “PT. Rintis Sejahtera” are both caught."
            >
              <option value="">Pick a company…</option>
              {companies.map((item) => <option key={item.label} value={item.label}>{item.label} ({item.count} peserta)</option>)}
            </SelectField>
          ) : (
            <SelectField label="Participant" value={participantId} onChange={(event) => setParticipantId(event.target.value)}>
              <option value="">Pick a participant…</option>
              {participants.map((item) => <option key={item.id} value={item.id}>{item.name}{item.company ? ` · ${item.company}` : ""}</option>)}
            </SelectField>
          )}
          <TextField label="Reason" optional value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="e.g. client's own staff" />
        </form>
      </PaneBody>
      <PaneFooter note="Applies instantly">
        <Button simpan type="submit" form="form-pengecualian" size="sm" icon={<Prohibit size={16} />} loading={menambah} disabled={busy || !siapTambah}>Exclude</Button>
      </PaneFooter>
    </Pane>
  );

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        title="Leaderboard"
        meta={rules ? (
          <>
            <span className="tabular-nums">{aturanAktif} aturan aktif</span>
            {summary ? <><MetaSeparator /><span className="tabular-nums">{summary.remaining_spenders} peserta masuk papan</span></> : null}
            <MetaSeparator />
            <span>Excluded transactions are still recorded in full in Reports</span>
          </>
        ) : null}
        actions={<ButtonLink href="/display" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Open leaderboard</ButtonLink>}
      />
      <DisplayTabs revealMode={revealMode} />

      {error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : null}

      {/* Reveal beku memakai snapshot yang diambil saat "Start reveal". Diperingatkan,
          BUKAN dikunci: mengunci halaman ini di tengah acara menghapus satu-satunya
          jalan keluar kalau ternyata ada yang keliru. */}
      {frozen ? (
        <Banner tone="info" icon={<Snowflake size={18} />}>
          The staged reveal is frozen. The projector board uses the figures frozen when the reveal started, so changes
          here do not show until the reveal is cleared or restarted from{" "}
          <Link href="/admin/display/reveal" className="font-medium text-primary underline">Staged reveal</Link>.
        </Banner>
      ) : null}

      {empty ? (
        <Banner tone="error" icon={<WarningCircle size={18} />}>
          Tidak ada peserta tersisa. Papan peringkat akan menampilkan &quot;Belum ada transaksi lunas.&quot;, dan di proyektor itu terbaca seperti sistem rusak.
        </Banner>
      ) : tooFew ? (
        <Banner tone="warning" icon={<Info size={18} />}>
          Papan disetel {limit} baris, tapi hanya {summary?.remaining_spenders} peserta yang memenuhi syarat. Layar akan menampilkan lebih sedikit dari itu.
        </Banner>
      ) : null}

      <SupportingPane main={daftar} pane={formulir} paneWidth={380} />

      <Dialog
        open={dikonfirmasi !== null}
        onClose={() => setConfirmId(null)}
        dismissible={!busy}
        tone="danger"
        title={`Remove exclusion ${dikonfirmasi ? namaAturan(dikonfirmasi) : ""}?`}
        description={`This rule is deleted and matching participants count towards top spender again right away${frozen ? " (on the projector this shows once the frozen reveal is cleared or restarted)" : ""}. The rule's content stays in the audit trail. To pause it for now, use Turn off.`}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setConfirmId(null)}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={() => { if (confirmId !== null) void remove(confirmId); }}>Remove exclusion</Button>
          </>
        }
      />
    </WorkspacePage>
  );
}
