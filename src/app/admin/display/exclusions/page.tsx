"use client";

// Pengecualian peserta/perusahaan dari top spender.
//
// Kenapa halaman TERPISAH dari /admin/display:
//
// Ini aturan KELAYAKAN ("tidak berhak ikut"), bukan setelan tampilan. Kalau
// digabung ke form panjang /admin/display, daftar diskualifikasi ikut terkirim
// setiap kali ada yang mengubah warna latar, dan sebaliknya menambah satu
// perusahaan akan menerbitkan perubahan tampilan yang belum selesai. Alasan yang
// sama memisahkan kontrol reveal ke halamannya sendiri.
//
// Setiap aksi di sini juga BERLAKU SEKETIKA, tanpa tombol Simpan global —
// menyimpan aturan setengah jadi lalu lupa menekan Simpan berarti nama yang
// seharusnya gugur tetap naik ke proyektor.

import { ArrowLeft, Buildings, CheckCircle, Info, Prohibit, Snowflake, Trash, User, WarningCircle, XCircle } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast";

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

export default function LeaderboardExclusionsPage() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [limit, setLimit] = useState(10);
  const [mode, setMode] = useState<"company" | "participant">("company");
  const [company, setCompany] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  const load = useCallback(async () => {
    const [response, displayResponse, revealResponse] = await Promise.all([
      fetch("/api/admin/leaderboard/exclusions", { cache: "no-store" }),
      fetch("/api/display/settings", { cache: "no-store" }),
      fetch("/api/display/reveal", { cache: "no-store" }),
    ]);
    if (displayResponse.ok) {
      const data = await displayResponse.json().catch(() => null);
      if (data?.leaderboard_limit) setLimit(Number(data.leaderboard_limit));
    }
    // Papan yang sudah dibekukan TIDAK ikut berubah oleh aturan baru.
    // Tanpa peringatan ini, panitia menambah pengecualian di tengah ceremony,
    // melihat layar tidak berubah, lalu menambah aturan lagi dan lagi — yang
    // semuanya baru berlaku sekaligus setelah reveal direset.
    if (revealResponse.ok) {
      const data = await revealResponse.json().catch(() => null);
      setFrozen(Boolean(data?.frozen));
    }
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
    setBusy(true); setError("");
    const response = await fetch("/api/admin/leaderboard/exclusions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_keyword: mode === "company" ? target : null,
        participant_id: mode === "participant" ? target : null,
        reason: reason.trim() || null,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      const failure = data.error?.details?.company_keyword?.[0] ?? data.error?.message ?? `Gagal menambah pengecualian (${response.status}).`;
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
    });
    setBusy(false);
    if (!response.ok) { setError("Gagal mengubah status aturan."); return; }
    await load();
  }

  async function remove(id: number) {
    setBusy(true); setError("");
    const response = await fetch(`/api/admin/leaderboard/exclusions/${id}`, { method: "DELETE" });
    setBusy(false);
    setConfirmId(null);
    if (!response.ok) { setError("Gagal menghapus aturan."); return; }
    toast.info("Pengecualian dicabut", "Peserta terkait kembali dihitung di top spender.");
    await load();
  }

  const participantName = (id: string | null) => {
    if (!id) return null;
    const found = participants.find((item) => item.id === id);
    return found ? `${found.name}${found.company ? ` — ${found.company}` : ""}` : "Peserta tidak ditemukan";
  };

  // Papan lebih pendek daripada yang disetel. Bukan galat, tapi wajib terlihat:
  // di proyektor gejalanya hanya baris yang lebih sedikit, dan tidak ada yang
  // menghubungkannya dengan aturan yang baru saja ditambahkan sendiri.
  const tooFew = summary !== null && summary.remaining_spenders < limit;
  const empty = summary !== null && summary.remaining_spenders === 0;

  return <main className="bg-surface px-5 pb-8 pt-6 text-on-surface sm:px-8 lg:pb-10">
    <div className="mx-auto max-w-[1440px] [&>*]:max-w-[900px]">
      <Link href="/admin/display" className="inline-flex min-h-11 items-center gap-2 text-body-medium font-semibold text-primary"><ArrowLeft size={18} /> Kembali ke Papan peringkat</Link>

      <div>
        <h2 className="text-headline-small font-semibold tracking-tight">Pengecualian peserta</h2>
        <p className="mt-3 max-w-2xl text-body-medium leading-6 text-on-surface-variant">
          Peserta dan perusahaan di daftar ini <span className="font-semibold text-on-surface">tidak berhak</span> masuk top spender.
          Transaksinya tetap tercatat penuh di Reports — yang gugur hanya lombanya.
        </p>
      </div>

      {error && <div role="alert" className="rounded-lg mt-6 flex items-center gap-2 border border-error-soft-outline bg-error-soft p-4 text-body-medium text-error"><XCircle size={20} />{error}</div>}

      {/* Reveal beku memakai snapshot yang diambil saat "Mulai reveal", jadi
          aturan yang ditambahkan sesudahnya tidak mengubah apa pun di layar.
          Diperingatkan, BUKAN dikunci: mengunci halaman ini di tengah acara
          menghapus satu-satunya jalan keluar kalau ternyata ada yang keliru. */}
      {frozen && <div role="status" className="rounded-lg mt-6 flex items-start gap-2 border border-outline-variant bg-panel-high p-4 text-body-medium"><Snowflake size={20} className="mt-0.5 shrink-0 text-primary" /><span>Reveal bertahap sedang <span className="font-semibold">beku</span>. Papan di proyektor memakai snapshot yang diambil saat reveal dimulai, jadi perubahan di halaman ini belum terlihat sampai reveal direset dari <Link href="/admin/display/reveal" className="font-semibold text-primary underline">kontrol reveal</Link>.</span></div>}

      {summary && <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Peserta berbelanja", value: summary.total_spenders },
          { label: "Dikecualikan", value: summary.excluded_spenders },
          { label: "Masuk papan", value: summary.remaining_spenders },
        ].map((item) => <div key={item.label} className="rounded-lg bg-panel p-4">
          <p className="text-body-small uppercase tracking-[0.14em] text-on-surface-variant">{item.label}</p>
          <p className="mt-1 text-headline-medium font-semibold tabular-nums">{item.value}</p>
        </div>)}
      </div>}

      {empty
        ? <div className="rounded-lg mt-4 flex items-start gap-2 border border-error-soft-outline bg-error-soft p-4 text-body-medium text-error"><WarningCircle size={20} className="mt-0.5 shrink-0" /><span>Tidak ada peserta tersisa. Papan peringkat akan menampilkan &quot;Belum ada transaksi lunas.&quot; — di proyektor itu terbaca seperti sistem rusak.</span></div>
        : tooFew && <div className="rounded-lg mt-4 flex items-start gap-2 border border-outline-variant bg-panel-high p-4 text-body-medium text-on-surface-variant"><Info size={20} className="mt-0.5 shrink-0 text-warning" /><span>Papan disetel {limit} baris, tapi hanya {summary?.remaining_spenders} peserta yang memenuhi syarat. Layar akan menampilkan lebih sedikit dari itu.</span></div>}

      <section className="rounded-lg mt-8 border border-outline-variant bg-panel p-6">
        <h2 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Tambah pengecualian</h2>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {([["company", "Satu perusahaan", Buildings], ["participant", "Satu peserta", User]] as const).map(([value, label, Icon]) => <label key={value} className={`rounded-lg flex cursor-pointer items-center gap-3 border p-3 text-body-medium font-semibold ${mode === value ? "border-primary bg-primary-soft" : "border-outline-variant"}`}>
            <input type="radio" name="exclusion-mode" checked={mode === value} onChange={() => setMode(value)} className="size-4 accent-primary" />
            <Icon size={18} /> {label}
          </label>)}
        </div>

        {mode === "company"
          ? <div className="mt-4">
              <label htmlFor="company" className="text-body-medium font-semibold">Perusahaan</label>
              {/* <select>, bukan input bebas: salah satu huruf menghasilkan aturan
                  yang tersimpan rapi, berefek nol, dan panitia menunggu perubahan
                  yang tidak akan pernah muncul. */}
              <select id="company" value={company} onChange={(event) => setCompany(event.target.value)} className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-3 text-body-medium outline-none focus:border-primary">
                <option value="">Pilih perusahaan...</option>
                {companies.map((item) => <option key={item.label} value={item.label}>{item.label} ({item.count} peserta)</option>)}
              </select>
              <p className="mt-2 flex items-start gap-2 text-body-small leading-5 text-on-surface-variant"><Info size={15} className="mt-0.5 shrink-0 text-primary" /> Dicocokkan sebagian dan tanpa membedakan huruf besar-kecil, jadi &quot;PT Rintis Sejahtera&quot; dan &quot;PT. Rintis Sejahtera&quot; ikut tersaring sekaligus.</p>
            </div>
          : <div className="mt-4">
              <label htmlFor="participant" className="text-body-medium font-semibold">Peserta</label>
              <select id="participant" value={participantId} onChange={(event) => setParticipantId(event.target.value)} className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-3 text-body-medium outline-none focus:border-primary">
                <option value="">Pilih peserta...</option>
                {participants.map((item) => <option key={item.id} value={item.id}>{item.name}{item.company ? ` — ${item.company}` : ""}</option>)}
              </select>
            </div>}

        <div className="mt-4">
          <label htmlFor="reason" className="text-body-medium font-semibold">Alasan <span className="font-normal text-on-surface-variant">(opsional)</span></label>
          <input id="reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="mis. internal klien" className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-3 text-body-medium outline-none focus:border-primary" />
        </div>

        <button type="button" onClick={() => void add()} disabled={busy || (mode === "company" ? !company : !participantId)} className="rounded-md mt-5 flex min-h-12 w-full items-center justify-center gap-2 bg-primary px-5 text-body-medium font-semibold text-on-primary disabled:opacity-40 sm:w-auto">
          <Prohibit size={18} /> {busy ? "Menyimpan..." : "Kecualikan"}
        </button>
      </section>

      <section className="mt-8">
        <h2 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Daftar pengecualian</h2>
        {rules === null ? <p className="mt-4 text-body-medium text-on-surface-variant">Memuat...</p>
          : rules.length === 0 ? <p className="rounded-lg mt-4 border border-outline-variant bg-panel p-6 text-body-medium text-on-surface-variant">Belum ada pengecualian. Seluruh peserta berhak masuk top spender.</p>
          : <div className="mt-4 space-y-2">
            {rules.map((rule) => <div key={rule.id} className="rounded-lg bg-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-body-medium font-semibold">
                    {rule.company_keyword ? <><Buildings size={18} className="shrink-0 text-primary" /> {rule.company_keyword}</> : <><User size={18} className="shrink-0 text-primary" /> {participantName(rule.participant_id)}</>}
                    {!rule.is_active && <span className="rounded-sm border border-outline-variant px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-on-surface-variant">Nonaktif</span>}
                  </p>
                  {rule.reason && <p className="mt-1 text-body-small text-on-surface-variant">{rule.reason}</p>}

                  {/* Nol cocok DITANDAI, bukan disembunyikan. Nol hampir selalu
                      berarti salah pilih, dan ini satu-satunya peringatan yang
                      tersedia sebelum acara dimulai. */}
                  <p className={`mt-2 text-body-small ${rule.matched_participants === 0 ? "font-semibold text-error" : "text-on-surface-variant"}`}>
                    {rule.matched_participants === 0
                      ? "Tidak cocok dengan siapa pun — periksa lagi pilihannya."
                      : <>Cocok {rule.matched_participants} peserta, {rule.matched_spenders} di antaranya punya transaksi lunas.</>}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => void toggle(rule)} disabled={busy} className="rounded-md flex min-h-11 items-center gap-2 border border-outline-variant px-3 text-body-small font-semibold disabled:opacity-40">
                    {rule.is_active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                  <button type="button" onClick={() => setConfirmId(rule.id)} disabled={busy} className="rounded-md flex size-11 items-center justify-center border border-outline-variant text-error disabled:opacity-40" aria-label="Hapus aturan"><Trash size={18} /></button>
                </div>
              </div>

              {/* Konfirmasi inline di dalam kartu, bukan window.confirm. */}
              {confirmId === rule.id && <div className="rounded-lg mt-3 border border-error-soft-outline bg-error-soft p-3">
                <p className="text-body-small text-error">Cabut pengecualian ini? Peserta terkait langsung kembali dihitung di top spender.</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => void remove(rule.id)} disabled={busy} className="rounded-md flex min-h-11 items-center gap-2 bg-error px-4 text-body-small font-semibold text-on-error disabled:opacity-40"><CheckCircle size={16} /> Ya, cabut</button>
                  <button type="button" onClick={() => setConfirmId(null)} className="flex min-h-11 items-center px-4 text-body-small font-semibold">Batal</button>
                </div>
              </div>}
            </div>)}
          </div>}
      </section>
    </div>
  </main>;
}
