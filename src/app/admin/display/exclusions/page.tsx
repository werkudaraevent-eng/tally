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
    if (!response) { setError("Koneksi terputus. Daftar pengecualian tidak bisa dimuat."); return; }
    if (!response.ok) { setError("Daftar pengecualian gagal dimuat."); return; }
    const data = await response.json().catch(() => null);
    if (!data) { setError("Daftar pengecualian gagal dibaca."); return; }
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
      const failure = data?.error?.details?.company_keyword?.[0] ?? data?.error?.message ?? (response ? `Gagal menambah pengecualian (${response.status}).` : "Koneksi terputus. Coba lagi.");
      setError(failure);
      toast.error("Gagal menambah pengecualian", failure);
      return;
    }
    setCompany(""); setParticipantId(""); setReason("");
    toast.success("Pengecualian ditambahkan", "Papan top spender langsung menyesuaikan.");
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
    if (!response?.ok) { setError("Gagal mengubah status aturan."); return; }
    await load();
  }

  async function remove(id: number) {
    setBusy(true); setError("");
    const response = await fetch(`/api/admin/leaderboard/exclusions/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    setConfirmId(null);
    if (!response?.ok) { setError("Gagal menghapus aturan."); return; }
    toast.info("Pengecualian dicabut", "Peserta terkait kembali dihitung di top spender.");
    await load();
  }

  const participantName = (id: string | null) => {
    if (!id) return null;
    const found = participants.find((item) => item.id === id);
    return found ? `${found.name}${found.company ? ` · ${found.company}` : ""}` : "Peserta tidak ditemukan";
  };

  const namaAturan = (rule: Rule) => rule.company_keyword ?? participantName(rule.participant_id) ?? "aturan ini";

  // Papan lebih pendek daripada yang disetel. Bukan galat, tapi wajib terlihat:
  // di proyektor gejalanya hanya baris yang lebih sedikit, dan tidak ada yang
  // menghubungkannya dengan aturan yang baru saja ditambahkan sendiri.
  const tooFew = summary !== null && summary.remaining_spenders < limit;
  const empty = summary !== null && summary.remaining_spenders === 0;
  const aturanAktif = rules?.filter((rule) => rule.is_active).length ?? 0;
  const dikonfirmasi = rules?.find((rule) => rule.id === confirmId) ?? null;

  // ---- Panel utama: ringkasan dan daftar -----------------------------------------
  const daftar = (
    <Pane aria-label="Daftar pengecualian">
      {summary ? (
        <dl className="grid shrink-0 grid-cols-3 divide-x divide-outline-variant border-b border-outline-variant">
          {[
            { label: "Peserta berbelanja", value: summary.total_spenders },
            { label: "Dikecualikan", value: summary.excluded_spenders },
            { label: "Masuk papan", value: summary.remaining_spenders },
          ].map((item) => (
            <div key={item.label} className="min-w-0 px-4 py-3">
              <dt className="truncate text-body-medium text-on-surface-variant">{item.label}</dt>
              <dd className="mt-0.5 text-title-large font-semibold tabular-nums text-on-surface">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <PaneHeader>
        <h2 className="min-w-0 flex-1 text-body-medium font-semibold text-on-surface">Daftar pengecualian</h2>
        {rules ? <span className="text-body-medium tabular-nums text-on-surface-variant">{rules.length} aturan</span> : null}
      </PaneHeader>
      <PaneBody>
        {rules === null ? (
          error ? (
            <p className="px-4 py-6 text-body-medium text-on-surface-variant">Daftar tidak bisa ditampilkan. Muat ulang halaman.</p>
          ) : (
            <div role="status" aria-label="Memuat" className="flex h-60 items-center justify-center"><span aria-hidden className="m3-spinner" /></div>
          )
        ) : rules.length === 0 ? (
          <EmptyState
            plain
            icon={<Prohibit size={32} />}
            title="Belum ada pengecualian"
            description="Seluruh peserta berhak masuk top spender. Tambahkan perusahaan atau peserta lewat panel Tambah pengecualian."
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
                    {!rule.is_active ? <StatusChip>Nonaktif</StatusChip> : null}
                  </p>
                  {rule.reason ? <p className="mt-0.5 text-on-surface-variant">{rule.reason}</p> : null}
                  {/* Nol cocok DITANDAI, bukan disembunyikan. Nol hampir selalu
                      berarti salah pilih, dan ini satu-satunya peringatan yang
                      tersedia sebelum acara dimulai. */}
                  <p className={rule.matched_participants === 0 ? "mt-1 flex items-center gap-1.5 font-medium text-error" : "mt-1 tabular-nums text-on-surface-variant"}>
                    {rule.matched_participants === 0
                      ? <><WarningCircle size={16} aria-hidden />Tidak cocok dengan siapa pun. Periksa lagi pilihannya.</>
                      : <>Cocok {rule.matched_participants} peserta, {rule.matched_spenders} di antaranya punya transaksi lunas.</>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="outlined" size="sm" disabled={busy} onClick={() => void toggle(rule)}>
                    {rule.is_active ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                  <IconButton size="sm" label={`Hapus aturan ${namaAturan(rule)}`} disabled={busy} onClick={() => setConfirmId(rule.id)}>
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
    <Pane as="aside" aria-label="Tambah pengecualian">
      <PaneHeader>
        <h2 className="min-w-0 flex-1 text-body-medium font-semibold text-on-surface">Tambah pengecualian</h2>
      </PaneHeader>
      <PaneBody className="px-5 py-4">
        <form id="form-pengecualian" className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void add(); }}>
          <SegmentedButton<Sasaran>
            label="Jenis pengecualian"
            value={mode}
            onChange={setMode}
            className="w-full"
            options={[
              { value: "company", label: "Satu perusahaan", icon: <Buildings size={16} aria-hidden /> },
              { value: "participant", label: "Satu peserta", icon: <User size={16} aria-hidden /> },
            ]}
          />
          {mode === "company" ? (
            // <select>, bukan input bebas: salah satu huruf menghasilkan aturan
            // yang tersimpan rapi, berefek nol, dan panitia menunggu perubahan
            // yang tidak akan pernah muncul.
            <SelectField
              label="Perusahaan"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              hint="Dicocokkan sebagian tanpa membedakan huruf besar-kecil, jadi “PT Rintis Sejahtera” dan “PT. Rintis Sejahtera” ikut tersaring sekaligus."
            >
              <option value="">Pilih perusahaan...</option>
              {companies.map((item) => <option key={item.label} value={item.label}>{item.label} ({item.count} peserta)</option>)}
            </SelectField>
          ) : (
            <SelectField label="Peserta" value={participantId} onChange={(event) => setParticipantId(event.target.value)}>
              <option value="">Pilih peserta...</option>
              {participants.map((item) => <option key={item.id} value={item.id}>{item.name}{item.company ? ` · ${item.company}` : ""}</option>)}
            </SelectField>
          )}
          <TextField label="Alasan" optional value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="mis. internal klien" />
        </form>
      </PaneBody>
      <PaneFooter note="Berlaku seketika">
        <Button type="submit" form="form-pengecualian" size="sm" icon={<Prohibit size={16} />} loading={menambah} disabled={busy || !siapTambah}>Kecualikan</Button>
      </PaneFooter>
    </Pane>
  );

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        title="Papan peringkat"
        meta={rules ? (
          <>
            <span className="tabular-nums">{aturanAktif} aturan aktif</span>
            {summary ? <><MetaSeparator /><span className="tabular-nums">{summary.remaining_spenders} peserta masuk papan</span></> : null}
            <MetaSeparator />
            <span>Transaksi yang dikecualikan tetap tercatat penuh di Laporan</span>
          </>
        ) : null}
        actions={<ButtonLink href="/display" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Buka papan peringkat</ButtonLink>}
      />
      <DisplayTabs revealMode={revealMode} />

      {error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : null}

      {/* Reveal beku memakai snapshot yang diambil saat "Mulai reveal". Diperingatkan,
          BUKAN dikunci: mengunci halaman ini di tengah acara menghapus satu-satunya
          jalan keluar kalau ternyata ada yang keliru. */}
      {frozen ? (
        <Banner tone="info" icon={<Snowflake size={18} />}>
          Reveal bertahap sedang beku. Papan di proyektor memakai angka yang dibekukan saat reveal dimulai, jadi perubahan di
          sini belum terlihat sampai reveal dikosongkan atau dimulai ulang dari{" "}
          <Link href="/admin/display/reveal" className="font-medium text-primary underline">Reveal bertahap</Link>.
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
        title={`Cabut pengecualian ${dikonfirmasi ? namaAturan(dikonfirmasi) : ""}?`}
        description={`Aturan ini dihapus dan peserta yang cocok langsung kembali dihitung di top spender${frozen ? " (di proyektor baru terlihat setelah reveal yang beku dikosongkan atau dimulai ulang)" : ""}. Isi aturannya tetap tercatat di jejak audit. Kalau hanya ingin menahan sementara, pakai Nonaktifkan.`}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setConfirmId(null)}>Batal</Button>
            <Button variant="danger" loading={busy} onClick={() => { if (confirmId !== null) void remove(confirmId); }}>Cabut pengecualian</Button>
          </>
        }
      />
    </WorkspacePage>
  );
}
