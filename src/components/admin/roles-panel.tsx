"use client";

import { LockSimple, Plus, ShieldCheck, Trash, X, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Button,
  DetailSection,
  EmptyState,
  IconButton,
  ListDetail,
  ListRow,
  MetaSeparator,
  Pane,
  PaneBody,
  PaneFooter,
  SegmentedButton,
  Switch,
  TextField,
  WorkspaceHeader,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import { MODUL, rapikanIzin, type IzinPeran, type KunciModul, type Tingkat } from "@/lib/auth/izin-modul";

type Peran = { id: string; name: string; permissions: IzinPeran; accounts: number };
type Draft = { id: string | null; name: string; izin: IzinPeran };

const LABEL_TINGKAT: Record<Tingkat, string> = { none: "No access", view: "View", manage: "Manage" };

/** Halaman yang tidak pernah dibuka peran kustom: mengubah seluruh acara atau akses orang lain. */
const MILIK_PEMILIK = "Event settings, Users & roles, the audit trail, automated emails, reset data and the custom domain.";

const KOSONG: IzinPeran = { modules: {}, participants_download: false, messages_send_email: false };

const TERSEDIA = MODUL.filter((modul) => modul.levels.length > 0);
const BELUM = MODUL.filter((modul) => modul.levels.length === 0);

function ringkas(izin: IzinPeran) {
  const terbuka = TERSEDIA.filter((modul) => (izin.modules[modul.key] ?? "none") !== "none");
  return terbuka.length === 0 ? "No pages yet" : terbuka.map((modul) => modul.label).join(", ");
}

/**
 * Users & roles > Roles: peran kustom, izin No access / View / Manage per modul.
 *
 * Peran, bukan izin per akun: satu klien biasanya beberapa akun (HR, GA,
 * atasan), dan izin yang diatur per akun pelan-pelan berbeda tanpa ada yang
 * sadar. Pola yang sama dengan Eventbrite, Atlassian, dan Google Workspace:
 * peran dibuat sekali, lalu dipasang ke akun.
 *
 * Modul yang belum punya mode View yang teruji tidak bisa dipilih (ditulis di
 * bawah daftar, bukan disembunyikan), supaya klien tidak pernah melihat tombol
 * Simpan yang berakhir dengan galat.
 */
export function RolesPanel({ pengalih }: { pengalih?: ReactNode }) {
  const [roles, setRoles] = useState<Peran[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [galatNama, setGalatNama] = useState("");
  const toast = useToast();

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [peran, saya] = await Promise.all([
        fetch("/api/admin/access-roles", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);
      if (peran.ok) setRoles(((await peran.json()).roles ?? []) as Peran[]);
      else setLoadError((await peran.json().catch(() => null))?.error?.message ?? "Roles could not be loaded.");
      if (saya.ok) setCanManage((await saya.json()).user?.role === "super_admin");
    } catch {
      setLoadError("Connection lost. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const terpilih = draft?.id ? roles.find((peran) => peran.id === draft.id) ?? null : null;

  function pilih(peran: Peran) {
    setDraft({ id: peran.id, name: peran.name, izin: peran.permissions });
    setError(""); setGalatNama("");
  }

  function baru() {
    setDraft({ id: null, name: "", izin: KOSONG });
    setError(""); setGalatNama("");
  }

  function setTingkat(key: KunciModul, tingkat: Tingkat) {
    setDraft((current) => current && { ...current, izin: rapikanIzin({ ...current.izin, modules: { ...current.izin.modules, [key]: tingkat } }) });
  }

  async function simpan() {
    if (!draft) return;
    setSaving(true); setError(""); setGalatNama("");
    const isNew = !draft.id;
    const response = await fetch("/api/admin/access-roles", {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(draft.id ? { id: draft.id } : {}), name: draft.name, permissions: draft.izin }),
    }).catch(() => null);
    setSaving(false);
    if (!response) { setError("Connection lost. Try again."); return; }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const pesan = data?.error?.details?.message ?? data?.error?.message ?? "The role could not be saved.";
      if (data?.error?.details?.name) setGalatNama(data.error.details.name);
      else setError(pesan);
      return;
    }
    const tersimpan = data.role as Peran;
    toast.success(`${tersimpan.name} saved`, tersimpan.accounts > 0 ? `Applies to ${tersimpan.accounts} ${tersimpan.accounts === 1 ? "account" : "accounts"} on their next page load.` : "Give it to an account in Accounts.");
    setDraft({ id: tersimpan.id, name: tersimpan.name, izin: tersimpan.permissions });
    void load();
  }

  async function hapus() {
    if (!draft?.id) return;
    setSaving(true); setError("");
    const response = await fetch(`/api/admin/access-roles?id=${encodeURIComponent(draft.id)}`, { method: "DELETE" }).catch(() => null);
    setSaving(false);
    if (!response) { setError("Connection lost. Try again."); return; }
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error?.details?.message ?? data?.error?.message ?? "The role could not be deleted.");
      return;
    }
    toast.success(`${draft.name} deleted`);
    setDraft(null);
    void load();
  }

  const list = (
    <Pane aria-label="Custom roles">
      <PaneBody>
        {loadError && roles.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3 px-4 py-4">
            <p role="alert" className="flex min-w-0 flex-1 items-start gap-2 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{loadError}</p>
            <Button variant="outlined" size="sm" onClick={() => void load()}>Try again</Button>
          </div>
        ) : loading ? (
          <div aria-label="Loading roles">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-outline-variant px-4 py-4">
                <div className="h-3 w-40 animate-pulse rounded bg-surface-container-high" />
              </div>
            ))}
          </div>
        ) : roles.length === 0 ? (
          <EmptyState
            plain
            icon={<ShieldCheck size={40} />}
            title="No custom roles yet"
            description="A custom role lets a client open only the pages you choose, for example the participant list and check-ins."
            action={canManage ? <Button variant="outlined" size="sm" icon={<Plus size={16} weight="bold" />} onClick={baru}>New role</Button> : undefined}
          />
        ) : (
          roles.map((peran) => (
            <ListRow key={peran.id} selected={draft?.id === peran.id} onSelect={() => pilih(peran)}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-on-surface">{peran.name}</span>
                <span className="block truncate text-body-small text-on-surface-variant">{ringkas(peran.permissions)}</span>
              </span>
              <span className="shrink-0 text-body-small tabular-nums text-on-surface-variant">{peran.accounts} {peran.accounts === 1 ? "account" : "accounts"}</span>
            </ListRow>
          ))
        )}
      </PaneBody>
      <PaneFooter
        className="bg-surface-container-lowest py-2"
        note="Built-in roles (Admin, Booth staff, Cashier, Scanner staff, Viewer) stay as they are. Give an account a custom role in Accounts."
      />
    </Pane>
  );

  let detail = null;
  if (draft) {
    const isNew = !draft.id;
    const dipakai = terpilih?.accounts ?? 0;
    const kirim = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (canManage && draft.name.trim()) void simpan(); };
    detail = (
      <Pane as="aside" aria-label={isNew ? "New role" : `Role ${draft.name}`}>
        <div className="flex shrink-0 items-start gap-3 border-b border-outline-variant px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="min-w-0 truncate text-title-medium font-semibold leading-6">{isNew ? "New role" : terpilih?.name ?? draft.name}</h2>
            <p className="text-body-medium text-on-surface-variant">{isNew ? "Choose what it can open." : `${dipakai} ${dipakai === 1 ? "account" : "accounts"}`}</p>
          </div>
          <IconButton size="sm" label="Close" onClick={() => setDraft(null)} disabled={saving}><X size={16} /></IconButton>
        </div>
        <PaneBody>
          <form id="form-peran" onSubmit={kirim}>
            {error ? <p role="alert" className="mx-5 mt-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{error}</p> : null}
            <DetailSection>
              <TextField
                label="Role name"
                value={draft.name}
                maxLength={60}
                placeholder="e.g. Client: participant data"
                readOnly={!canManage}
                error={galatNama || undefined}
                onChange={(event) => { setGalatNama(""); setDraft((current) => current && { ...current, name: event.target.value }); }}
              />
            </DetailSection>
            <DetailSection title="What this role can open">
              <p className="text-body-small text-on-surface-variant">View opens the page without saving anything. Manage can add, change and delete. Every change is kept in the Audit trail with the account name.</p>
            </DetailSection>
            <div className="border-b border-outline-variant">
              {TERSEDIA.map((modul) => {
                const tingkat = draft.izin.modules[modul.key] ?? "none";
                return (
                  <div key={modul.key} className="border-b border-outline-variant last:border-b-0">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                      <div className="min-w-0 flex-1 basis-[200px]">
                        <p className="text-body-medium font-medium text-on-surface">{modul.label}</p>
                        <p className="text-body-small text-on-surface-variant">{modul.description}</p>
                      </div>
                      {canManage ? (
                        <SegmentedButton<Tingkat>
                          label={`${modul.label} access`}
                          padat
                          value={tingkat}
                          onChange={(nilai) => setTingkat(modul.key, nilai)}
                          options={(["none", "view", "manage"] as Tingkat[]).map((nilai) => ({ value: nilai, label: LABEL_TINGKAT[nilai], disabled: !modul.levels.includes(nilai) }))}
                        />
                      ) : (
                        <span className="text-body-medium text-on-surface">{LABEL_TINGKAT[tingkat]}</span>
                      )}
                    </div>
                    {modul.key === "participants" && tingkat !== "none" ? (
                      <div className="bg-surface-container-low px-5 py-3">
                        <Switch
                          checked={draft.izin.participants_download}
                          disabled={!canManage}
                          onChange={(nilai) => setDraft((current) => current && { ...current, izin: { ...current.izin, participants_download: nilai } })}
                          label="Can download the list"
                          description="CSV or Excel with the columns this role sees, without QR codes. Personal data leaves Tally."
                        />
                      </div>
                    ) : null}
                    {modul.key === "messages" && tingkat === "manage" ? (
                      <div className="bg-surface-container-low px-5 py-3">
                        <Switch
                          checked={draft.izin.messages_send_email}
                          disabled={!canManage}
                          onChange={(nilai) => setDraft((current) => current && { ...current, izin: { ...current.izin, messages_send_email: nilai } })}
                          label="Can send emails"
                          description="Off: they write announcements and email drafts, and you send them. A sent email can't be taken back."
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <DetailSection title="Not available for custom roles yet">
              <p className="text-body-small text-on-surface-variant">{BELUM.map((modul) => modul.label).join(", ")}. Each one is added once its View mode is built and tested.</p>
            </DetailSection>
            <DetailSection title="Owner only">
              <p className="flex items-start gap-2 text-body-small text-on-surface-variant"><LockSimple size={14} className="mt-0.5 shrink-0" aria-hidden />{MILIK_PEMILIK}</p>
            </DetailSection>
          </form>
        </PaneBody>
        {canManage ? (
          <PaneFooter note={!isNew && dipakai > 0 ? "Changes apply to its accounts on their next page load." : undefined}>
            {!isNew ? (
              <Button
                type="button"
                variant="text"
                size="sm"
                icon={<Trash size={16} />}
                disabled={saving || dipakai > 0}
                title={dipakai > 0 ? "Give its accounts another role first." : undefined}
                onClick={() => void hapus()}
              >
                Delete
              </Button>
            ) : null}
            <Button type="submit" form="form-peran" size="sm" loading={saving} disabled={!draft.name.trim()}>{isNew ? "Create role" : "Save changes"}</Button>
          </PaneFooter>
        ) : null}
      </Pane>
    );
  }

  return (
    <>
      <WorkspaceHeader
        title="Users & roles"
        meta={
          <>
            <span className="tabular-nums">{loading ? "Loading roles" : `${roles.length} custom ${roles.length === 1 ? "role" : "roles"}`}</span>
            <MetaSeparator />
            <span>Role sets what they can do, events set where</span>
          </>
        }
        actions={canManage ? <Button variant={draft?.id ? "outlined" : "filled"} onClick={baru} icon={<Plus size={16} weight="bold" />}>New role</Button> : undefined}
      />
      {pengalih}
      <div className="flex min-h-0 flex-1 flex-col">
        <ListDetail list={list} detail={detail} detailWidth={520} />
      </div>
    </>
  );
}
