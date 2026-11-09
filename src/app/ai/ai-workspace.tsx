"use client";

import { Key, Sparkle, Storefront, Warning } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Banner, Button, CONTAINER_PADDING, SegmentedButton, SelectField, StatusChip, Switch, Table, TableBody, TableCard, TableCell, TableHead, TableHeaderCell, TableRow, TextField } from "@/components/m3";
import { cx } from "@/lib/m3/cx";
import { cakupanAkses, UserMenu } from "@/components/admin/user-menu";
import { WorkspaceTabs } from "@/components/admin/workspace-tabs";
import { useToast } from "@/components/toast";
import { pesanGalatApi } from "@/lib/api-message";
import type { FiturAi, ModelAi, SetelanAi } from "@/lib/ai/model";

type Ringkas = {
  mulai: string; runs: number; usd: number; token_masuk: number; token_keluar: number;
  hasil: { saved: number; closed: number; failed: number; preview: number };
  /** Pemakaian yang punya pratinjau (tanpa Ask AI); dasar bilah Results. */
  hasil_runs?: number;
  per_acara: Array<{ event_id: string | null; usd: number }>;
  per_fitur: Record<string, { runs: number; usd: number }>;
};
type Run = { id: number; waktu: string; acara: string | null; oleh: string | null; fitur: string; model: string; berkas: string[]; token_masuk: number; token_keluar: number; usd: number; status: string; detail: Record<string, unknown> };
type Data = { belum_migrasi?: boolean; setelan: SetelanAi; model: ModelAi[]; fitur: FiturAi[]; bulan_ini: Ringkas; bulan_lalu: Ringkas; nama_acara: Record<string, string>; terakhir: Run[] };

const usd = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
const angka = (n: number) => n.toLocaleString("en-GB");
const token = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} M` : n >= 1000 ? `${Math.round(n / 1000)} k` : String(n));
const persen = (bagian: number, semua: number) => (semua > 0 ? Math.round((bagian / semua) * 100) : 0);
const waktu = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const bulan = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso));

const STATUS_RUN: Record<string, { label: string; tone: "success" | "neutral" | "warning" | "error" | "primary" }> = {
  saved: { label: "Saved", tone: "success" },
  closed: { label: "Closed without saving", tone: "neutral" },
  failed: { label: "Failed", tone: "error" },
  preview: { label: "In preview", tone: "primary" },
  left: { label: "Left without saving", tone: "neutral" },
  answered: { label: "Answered", tone: "success" },
};

/** Halaman AI: bilah atas yang sama dengan /events dan /users. */
export function AiWorkspace({ username, role }: { username: string | null; role: string | null }) {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [galat, setGalat] = useState("");
  const [keluar, setKeluar] = useState(false);
  const [kunciBaru, setKunciBaru] = useState("");
  const [gantiKunci, setGantiKunci] = useState(false);
  const [galatKunci, setGalatKunci] = useState("");
  const [batas, setBatas] = useState("");
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [periode, setPeriode] = useState<"ini" | "lalu">("ini");

  const muat = useCallback(async () => {
    const response = await fetch("/api/admin/ai", { cache: "no-store" }).catch(() => null);
    const json = response ? await response.json().catch(() => null) : null;
    if (!response?.ok || !json) { setGalat(pesanGalatApi(json) ?? "AI settings could not be loaded. Reload the page."); return; }
    setGalat("");
    setData(json as Data);
    if (!json.belum_migrasi) setBatas(String((json as Data).setelan.batasBulanan));
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void muat(); }, 0); return () => window.clearTimeout(timer); }, [muat]);

  /** `onGalat`: galat ditaruh di bawah isian (lewat `onGalat`), bukan toast yang hilang. */
  const kirim = async (method: "PATCH" | "POST" | "DELETE", body: unknown, kunci: string, berhasil: string, onGalat?: (pesan: string) => void) => {
    setSibuk(kunci);
    const response = await fetch("/api/admin/ai", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null);
    const json = response ? await response.json().catch(() => null) : null;
    setSibuk(null);
    if (!response?.ok) {
      const pesan = pesanGalatApi(json) ?? (response ? "Not saved. Try again." : "No connection to Tally. Check the internet, then try again.");
      if (onGalat) onGalat(pesan); else toast.error(pesan);
      return false;
    }
    toast.success(berhasil);
    await muat();
    return true;
  };

  async function logout() {
    setKeluar(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  const setelan = data && !data.belum_migrasi ? data.setelan : null;
  const ini = data?.bulan_ini;
  const ringkas = periode === "ini" ? data?.bulan_ini : data?.bulan_lalu;
  const hasilRuns = ringkas ? ringkas.hasil_runs ?? ringkas.runs : 0;
  const labelModel = (id: string) => data?.model.find((m) => m.id === id)?.label ?? id;
  const terpakai = ini?.usd ?? 0;
  const batasAngka = setelan?.batasBulanan ?? 0;
  const habis = setelan ? batasAngka <= 0 || terpakai >= batasAngka : false;

  type Fitur = Data["fitur"][number];
  const pilihModel = (f: Fitur) => f.siap ? (
    <select
      aria-label={`Model for ${f.label}`}
      className="h-9 rounded-md border border-outline-variant bg-surface px-2 text-body-medium"
      value={setelan?.modelFitur[f.key] ?? ""}
      disabled={sibuk !== null}
      onChange={(event) => {
        const modelFitur = { ...setelan?.modelFitur };
        if (event.target.value) modelFitur[f.key] = event.target.value; else delete modelFitur[f.key];
        void kirim("PATCH", { feature_models: modelFitur }, "model", "Model saved");
      }}
    >
      <option value="">{`Default (${labelModel(setelan?.modelBawaan ?? "")})`}</option>
      {data?.model.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
    </select>
  ) : <span className="text-on-surface-variant">—</span>;
  const saklar = (f: Fitur) => f.siap ? (
    <Switch
      label={`${f.label} on`}
      labelHidden
      checked={!setelan?.fiturMati.includes(f.key)}
      disabled={sibuk !== null}
      onChange={(nyala) => {
        const mati = new Set(setelan?.fiturMati);
        if (nyala) mati.delete(f.key); else mati.add(f.key);
        void kirim("PATCH", { features_off: [...mati] }, "fitur", nyala ? `${f.label} is on` : `${f.label} is off`);
      }}
    />
  ) : <StatusChip tone="neutral">Coming soon</StatusChip>;

  return (
    <div lang="en" className="press flex min-h-dvh flex-col bg-surface text-on-surface">
      <header className={`sticky top-0 z-topbar border-b border-outline-variant bg-surface ${CONTAINER_PADDING}`}>
        <div className="m3-topbar-row mx-auto flex min-h-14 w-full max-w-[1280px] items-center gap-2">
          <Storefront size={18} className="shrink-0 text-on-surface-variant" />
          <span className="text-body-medium font-medium">Tally</span>
          <WorkspaceTabs current="ai" owner />
          <div className="ml-auto flex items-center gap-1">
            <UserMenu username={username} role={role} scope={cakupanAkses(role, null)} onLogout={() => void logout()} loggingOut={keluar} />
          </div>
        </div>
      </header>

      <main className={`mx-auto flex w-full max-w-[1280px] flex-col gap-6 py-6 ${CONTAINER_PADDING}`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-headline-small font-medium">AI</h1>
            <p className="max-w-[70ch] text-body-medium text-on-surface-variant">
              The AI behind the &ldquo;Read with AI&rdquo; buttons in every event. AI only prepares a preview; nothing is saved until someone presses Save. Files are not kept.
            </p>
          </div>
          <StatusChip tone="neutral">Owner only</StatusChip>
        </div>

        {galat ? <Banner tone="error" icon={<Warning size={18} />}>{galat}</Banner> : null}
        {data?.belum_migrasi ? (
          <Banner tone="warning" icon={<Warning size={18} />}>AI needs a database update first: run the AI settings migration (202611080070), then reload this page.</Banner>
        ) : null}

        {setelan && ini ? (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <section className="flex min-w-0 flex-col gap-4 rounded-[10px] border border-outline-variant bg-surface-container-lowest px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-title-medium font-medium">Connection</h2>
                  {setelan.adaKunci ? <StatusChip tone="success" dot>Connected</StatusChip> : <StatusChip tone="warning" dot>No key</StatusChip>}
                </div>
                <p className="text-body-medium text-on-surface-variant">Provider: Anthropic (Claude)</p>
                {setelan.adaKunci && !gantiKunci ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-body-small text-on-surface-variant">API key</span>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-body-medium tabular-nums">sk-ant-…••••{setelan.kunciAkhir}</span>
                      <div className="flex gap-1">
                        <Button variant="text" size="sm" onClick={() => setGantiKunci(true)}>Replace</Button>
                        <Button variant="text" size="sm" loading={sibuk === "hapus"} onClick={() => void kirim("DELETE", undefined, "hapus", "API key removed. AI buttons are off.")}>Remove</Button>
                      </div>
                    </div>
                    {setelan.kunciDicek ? <span className="text-body-small text-on-surface-variant">Checked {waktu(setelan.kunciDicek)}</span> : null}
                  </div>
                ) : (
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setGalatKunci("");
                      void kirim("POST", { api_key: kunciBaru }, "kunci", "API key checked and saved", setGalatKunci).then((ok) => { if (ok) { setKunciBaru(""); setGantiKunci(false); } });
                    }}
                  >
                    <TextField
                      label="API key"
                      type="password"
                      autoComplete="off"
                      value={kunciBaru}
                      onChange={(event) => { setKunciBaru(event.target.value); setGalatKunci(""); }}
                      error={galatKunci || undefined}
                      placeholder="sk-ant-…"
                      leading={<Key size={16} />}
                      hint="From console.anthropic.com > API keys. It is checked, then stored encrypted. Only the last 4 characters are shown again."
                    />
                    <div className="flex gap-2">
                      <Button type="submit" loading={sibuk === "kunci"} disabled={kunciBaru.trim().length < 20}>Check and save</Button>
                      {gantiKunci ? <Button variant="text" onClick={() => { setGantiKunci(false); setKunciBaru(""); setGalatKunci(""); }}>Cancel</Button> : null}
                    </div>
                  </form>
                )}
                <SelectField
                  label="Default model"
                  value={setelan.modelBawaan}
                  disabled={sibuk !== null}
                  onChange={(event) => void kirim("PATCH", { default_model: event.target.value }, "model", "Default model saved")}
                  hint="Used by every feature unless a feature below picks another."
                >
                  {data.model.map((m) => <option key={m.id} value={m.id}>{`${m.label} · $${m.masuk} / $${m.keluar} per M tokens`}</option>)}
                </SelectField>
              </section>

              <section className="flex min-w-0 flex-col gap-3 rounded-[10px] border border-outline-variant bg-surface-container-lowest px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-title-medium font-medium">This month</h2>
                  <span className="text-body-small text-on-surface-variant">{bulan(ini.mulai)}</span>
                </div>
                <p className="text-headline-small font-medium tabular-nums">{usd(terpakai)} <span className="text-body-medium font-normal text-on-surface-variant">of {usd(batasAngka)}</span></p>
                <div className="h-2 overflow-hidden rounded-full bg-surface-container-high" role="img" aria-label={`${persen(terpakai, batasAngka)}% of the monthly limit`}>
                  <div className={habis ? "h-full rounded-full bg-error" : "h-full rounded-full bg-primary"} style={{ width: `${Math.min(100, persen(terpakai, batasAngka))}%` }} />
                </div>
                <p className="text-body-medium text-on-surface-variant tabular-nums">{persen(terpakai, batasAngka)}% of the monthly limit used</p>
                <p className="text-body-small text-on-surface-variant tabular-nums">{angka(ini.runs)} runs · {token(ini.token_masuk)} tokens in · {token(ini.token_keluar)} tokens out</p>
                {habis ? <Banner tone="warning">The limit is reached: AI buttons are off until the 1st or until you raise the limit.</Banner> : null}
              </section>

              <section className="flex min-w-0 flex-col gap-3 rounded-[10px] border border-outline-variant bg-surface-container-lowest px-5 py-4">
                <h2 className="text-title-medium font-medium">Monthly limit</h2>
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const nilai = Number(batas.replace(",", "."));
                    if (!Number.isFinite(nilai) || nilai < 0) { toast.error("Enter an amount in US dollars, for example 20."); return; }
                    void kirim("PATCH", { monthly_limit_usd: nilai }, "batas", "Monthly limit saved");
                  }}
                >
                  <TextField
                    label="Stop AI buttons after (USD per month)"
                    inputMode="decimal"
                    value={batas}
                    onChange={(event) => setBatas(event.target.value)}
                    leading={<span className="text-body-medium">$</span>}
                    hint="Resets on the 1st (UTC). When it is reached, AI buttons say so and the normal import still works. 0 turns AI off."
                  />
                  <Button type="submit" className="self-start" loading={sibuk === "batas"} disabled={batas === String(batasAngka)}>Save limit</Button>
                </form>
              </section>
            </div>

            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-title-medium font-medium">Features</h2>
                <span className="text-body-small text-on-surface-variant">Each feature can be turned off without touching the others.</span>
              </div>
              <ul className="flex flex-col divide-y divide-outline-variant rounded-[10px] border border-outline-variant bg-surface-container-lowest md:hidden">
                {data.fitur.map((f) => {
                  const pakai = ini.per_fitur[f.key];
                  return (
                    <li key={f.key} className={cx("flex flex-col gap-2 px-4 py-3", !f.siap && "text-on-surface-variant")}>
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex min-w-0 flex-col">
                          <span className={cx("text-body-large", f.siap && "text-on-surface")}>{f.label}</span>
                          <span className="text-body-small text-on-surface-variant">{f.tempat}{f.siap ? ` · ${angka(pakai?.runs ?? 0)} runs · ${usd(pakai?.usd ?? 0)} this month` : ""}</span>
                        </span>
                        <span className="shrink-0">{saklar(f)}</span>
                      </div>
                      {f.siap ? pilihModel(f) : null}
                    </li>
                  );
                })}
              </ul>
              <TableCard className="hidden md:block">
                <Table minWidth="820px">
                  <TableHead>
                    <tr><TableHeaderCell>Feature</TableHeaderCell><TableHeaderCell>Where</TableHeaderCell><TableHeaderCell>Model</TableHeaderCell><TableHeaderCell align="end">Runs this month</TableHeaderCell><TableHeaderCell align="end">Cost this month</TableHeaderCell><TableHeaderCell>On</TableHeaderCell></tr>
                  </TableHead>
                  <TableBody>
                    {data.fitur.map((f) => {
                      const pakai = ini.per_fitur[f.key];
                      return (
                        <TableRow key={f.key} muted={!f.siap}>
                          <TableCell strong><span className="flex flex-col"><span>{f.label}</span><span className="text-body-small font-normal text-on-surface-variant">{f.uraian}</span></span></TableCell>
                          <TableCell>{f.tempat}</TableCell>
                          <TableCell>
                            {pilihModel(f)}
                          </TableCell>
                          <TableCell numeric align="end">{f.siap ? angka(pakai?.runs ?? 0) : "—"}</TableCell>
                          <TableCell numeric align="end">{f.siap ? usd(pakai?.usd ?? 0) : "—"}</TableCell>
                          <TableCell>
                            {saklar(f)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableCard>
              <p className="text-body-small text-on-surface-variant">
                {data.model.map((m) => `${m.label}: ${m.catatan}`).join(" ")} Prices are per million tokens in / out; costs here are counted from the tokens the AI reports for each run.
              </p>
            </section>

            {ringkas ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="flex min-w-0 flex-col gap-3 rounded-[10px] border border-outline-variant bg-surface-container-lowest px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-title-medium font-medium">Cost by event</h2>
                    <SegmentedButton<"ini" | "lalu"> label="Period" value={periode} onChange={setPeriode} options={[{ value: "ini", label: "This month" }, { value: "lalu", label: "Last month" }]} />
                  </div>
                  {ringkas.per_acara.length === 0 ? <p className="text-body-medium text-on-surface-variant">No AI runs in {bulan(ringkas.mulai)}.</p> : ringkas.per_acara.map((a) => (
                    <Batang key={a.event_id ?? "-"} label={a.event_id ? data.nama_acara[a.event_id] ?? "Deleted event" : "Deleted event"} nilai={a.usd} total={ringkas.usd} teks={`${usd(a.usd)} · ${persen(a.usd, ringkas.usd)}%`} />
                  ))}
                  {ringkas.runs > 0 ? <span className="text-body-small text-on-surface-variant">Share of {usd(ringkas.usd)} in {bulan(ringkas.mulai)}.</span> : null}
                </section>
                <section className="flex min-w-0 flex-col gap-3 rounded-[10px] border border-outline-variant bg-surface-container-lowest px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-title-medium font-medium">Results</h2>
                    <span className="text-body-small text-on-surface-variant">{bulan(ringkas.mulai)}</span>
                  </div>
                  {hasilRuns === 0 ? <p className="text-body-medium text-on-surface-variant">No imports with AI yet.</p> : (
                    <>
                      <Batang label="Saved after preview" nilai={ringkas.hasil.saved} total={hasilRuns} teks={`${ringkas.hasil.saved} of ${hasilRuns}`} warna="bg-success" />
                      <Batang label="Closed without saving" nilai={ringkas.hasil.closed} total={hasilRuns} teks={`${ringkas.hasil.closed} of ${hasilRuns}`} warna="bg-outline" />
                      {ringkas.hasil.preview > 0 ? <Batang label="In preview now" nilai={ringkas.hasil.preview} total={hasilRuns} teks={`${ringkas.hasil.preview} of ${hasilRuns}`} warna="bg-primary" /> : null}
                      <Batang label="Failed" nilai={ringkas.hasil.failed} total={hasilRuns} teks={`${ringkas.hasil.failed} of ${hasilRuns}`} warna="bg-error" />
                      <span className="text-body-small text-on-surface-variant">Many closed or failed runs for one kind of file mean the AI reads it badly: try another model for that feature.</span>
                    </>
                  )}
                </section>
              </div>
            ) : null}

            <section className="flex flex-col gap-3">
              <h2 className="text-title-medium font-medium">Recent runs</h2>
              {data.terakhir.length === 0 ? (
                <p className="rounded-[10px] border border-outline-variant px-5 py-6 text-center text-body-medium text-on-surface-variant">
                  <Sparkle size={16} className="mr-1 inline" aria-hidden />No AI runs yet. They appear here after someone uses &ldquo;Read with AI&rdquo; in an event.
                </p>
              ) : (
                <>
                <ul className="flex flex-col divide-y divide-outline-variant rounded-[10px] border border-outline-variant bg-surface-container-lowest md:hidden">
                  {data.terakhir.map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-body-medium text-on-surface">{waktu(r.waktu)} · {r.acara ?? "—"}</span>
                        <span className="truncate text-body-small text-on-surface-variant" title={r.berkas.join(", ")}>{r.berkas.length > 1 ? `${r.berkas[0]} +${r.berkas.length - 1}` : r.berkas[0] ?? "—"} · {r.model} · {r.oleh ?? "—"}</span>
                        <span className="text-body-small text-on-surface-variant tabular-nums">{angka(r.token_masuk)} in / {angka(r.token_keluar)} out</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-body-medium tabular-nums text-on-surface">{usd(r.usd)}</span>
                        <StatusChip tone={STATUS_RUN[r.status]?.tone ?? "neutral"}>{STATUS_RUN[r.status]?.label ?? r.status}</StatusChip>
                      </span>
                    </li>
                  ))}
                </ul>
                <TableCard className="hidden md:block">
                  <Table minWidth="980px" density="compact">
                    <TableHead>
                      <tr><TableHeaderCell>When</TableHeaderCell><TableHeaderCell>Who</TableHeaderCell><TableHeaderCell>Event</TableHeaderCell><TableHeaderCell>Feature</TableHeaderCell><TableHeaderCell>Files</TableHeaderCell><TableHeaderCell align="end">Tokens in / out</TableHeaderCell><TableHeaderCell align="end">Cost</TableHeaderCell><TableHeaderCell>Result</TableHeaderCell></tr>
                    </TableHead>
                    <TableBody>
                      {data.terakhir.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap">{waktu(r.waktu)}</TableCell>
                          <TableCell>{r.oleh ?? "—"}</TableCell>
                          <TableCell>{r.acara ?? "—"}</TableCell>
                          <TableCell>{data.fitur.find((f) => f.key === r.fitur)?.label ?? r.fitur}<span className="block text-body-small text-on-surface-variant">{r.model}</span></TableCell>
                          <TableCell className="max-w-[240px] truncate" title={r.berkas.join(", ")}>{r.berkas.length > 1 ? `${r.berkas[0]} +${r.berkas.length - 1}` : r.berkas[0] ?? "—"}</TableCell>
                          <TableCell numeric align="end">{angka(r.token_masuk)} / {angka(r.token_keluar)}</TableCell>
                          <TableCell numeric align="end">{usd(r.usd)}</TableCell>
                          <TableCell><StatusChip tone={STATUS_RUN[r.status]?.tone ?? "neutral"}>{STATUS_RUN[r.status]?.label ?? r.status}</StatusChip></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableCard>
                </>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

function Batang({ label, nilai, total, teks, warna = "bg-primary" }: { label: string; nilai: number; total: number; teks: string; warna?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-body-medium tabular-nums sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
      <span className="col-span-2 truncate sm:col-span-1" title={label}>{label}</span>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-container-high"><div className={`h-full rounded-full ${warna}`} style={{ width: `${persen(nilai, total)}%` }} /></div>
      <span className="text-on-surface-variant">{teks}</span>
    </div>
  );
}
