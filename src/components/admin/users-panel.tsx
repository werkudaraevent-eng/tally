"use client";

import { MagnifyingGlass, Plus, ShieldCheck, X, XCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { EVENT_STATUS_LABEL, ROLE_LABEL } from "@/lib/domain";
import {
  Button,
  DetailSection,
  Dialog,
  EmptyState,
  IconButton,
  KeyValue,
  ListDetail,
  MetaSeparator,
  Pane,
  PaneBody,
  PaneFooter,
  SelectField,
  StatusChip,
  Switch,
  Tabs,
  TextField,
  WorkspaceHeader,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import { cx } from "@/lib/m3/cx";

type Role = "booth" | "cashier" | "admin" | "super_admin" | "scanner";
type EventRole = Exclude<Role, "super_admin">;
type UserEvent = { id: string; slug: string; name: string; role: EventRole; booth_id?: number | null; booth_code?: string | null };
type User = { id: string; username: string; role: Role; booth_id: number | null; is_active: boolean; events?: UserEvent[] };
type Booth = { id: number; code: string; name: string };
type EventOption = { id: string; slug: string; name: string; status: string; archived_at?: string | null };
/** Acara yang dicentang, per id acara. `role` hanya terisi bila peran di acara itu berbeda dari peran akun. */
type Picked = Record<string, { booth_id: number | null; role?: EventRole }>;
type Draft = { id: string | null; username: string; pin: string; role: Role; is_active: boolean; events: Picked };
type RoleTab = "semua" | "booth" | "cashier" | "scanner" | "admin";

const blank: Draft = { id: null, username: "", pin: "", role: "booth", is_active: true, events: {} };

/**
 * Peran dipilih SEKALI per akun, dan berlaku di setiap acara yang dicentang.
 * Pola yang sama dengan Eventbrite (peran + "semua acara / acara tertentu") dan
 * Vercel (peran tim + proyek yang ditugaskan). Satu kalimat per peran, bukan
 * daftar izin: kalimatnya ada di sebelah pilihan, tepat saat orang memilih.
 */
const ROLE_OPTIONS: Array<{ value: Role; description: string }> = [
  { value: "admin", description: "Runs the events you tick." },
  { value: "booth", description: "Serves one booth per event." },
  { value: "cashier", description: "Takes payments, voids orders." },
  // Sengaja sesempit ini. Akun ini dipegang bergantian di pintu masuk, sering di
  // ponsel yang tidak terkunci.
  { value: "scanner", description: "Checks people in at the door." },
  { value: "super_admin", description: "Every event, plus users and roles." },
];

const BATAS_ACARA = 2;

/**
 * Akses per acara (user_event_access) di samping peran global. Booth ikut ditulis
 * di sebelah acaranya, karena booth adalah milik acara, bukan milik akun.
 */
function AksesAcara({ user, canManage }: { user: User; canManage: boolean }) {
  if (user.role === "super_admin") return <span className="text-on-surface-variant">All events</span>;
  const daftar = user.events ?? [];
  if (daftar.length === 0) return <span className="text-on-surface-variant">No events yet</span>;
  const tampil = daftar.slice(0, BATAS_ACARA);
  const sisa = daftar.length - tampil.length;
  return (
    <ul className="min-w-0 space-y-0.5">
      {tampil.map((event) => {
        const ekstra = [event.role !== user.role ? ROLE_LABEL[event.role] : null, event.booth_code ? `Booth ${event.booth_code}` : null].filter(Boolean).join(" · ");
        return (
          <li key={event.id} className="flex min-w-0 items-baseline gap-1.5">
            {canManage ? (
              <Link
                href={`/events/${event.id}/access`}
                onClick={(klik) => klik.stopPropagation()}
                className="min-w-0 truncate rounded-sm text-primary hover:underline"
              >
                {event.name}
              </Link>
            ) : (
              <span className="min-w-0 truncate">{event.name}</span>
            )}
            {ekstra ? <span className="shrink-0 text-body-small text-on-surface-variant">{ekstra}</span> : null}
          </li>
        );
      })}
      {sisa > 0 ? <li className="text-body-small text-on-surface-variant">+{sisa} more</li> : null}
    </ul>
  );
}

function PilihanPeran({ checked, onSelect, role, description, disabled }: { checked: boolean; onSelect: () => void; role: Role; description: string; disabled?: boolean }) {
  return (
    <label className={cx("flex min-h-9 cursor-pointer items-center gap-3 rounded-lg border px-3", checked ? "border-primary bg-primary-soft" : "border-outline-variant hover:bg-primary-soft", disabled && "cursor-not-allowed opacity-60")}>
      <input type="radio" name="peran-akun" checked={checked} disabled={disabled} onChange={onSelect} className="size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
      <span className="w-28 shrink-0 text-body-medium font-medium text-on-surface">{ROLE_LABEL[role]}</span>
      <span className="min-w-0 flex-1 truncate text-body-small text-on-surface-variant max-sm:hidden">{description}</span>
    </label>
  );
}

function pinAcak() {
  const angka = new Uint32Array(1);
  crypto.getRandomValues(angka);
  return String(angka[0] % 1_000_000).padStart(6, "0");
}

/** Tab penyaring per peran. "Admin" memuat Admin dan Super admin. */
const ROLE_TABS: Array<{ value: RoleTab; label: string; roles: Role[] | null }> = [
  { value: "semua", label: "All", roles: null },
  { value: "booth", label: ROLE_LABEL.booth, roles: ["booth"] },
  { value: "cashier", label: ROLE_LABEL.cashier, roles: ["cashier"] },
  { value: "scanner", label: ROLE_LABEL.scanner, roles: ["scanner"] },
  { value: "admin", label: "Admin", roles: ["admin", "super_admin"] },
];

/** Daftar centang acara mulai menampilkan kolom cari di atas jumlah ini. */
const CARI_ACARA_MULAI = 7;

function dariUser(user: User): Draft {
  const events: Picked = {};
  for (const event of user.events ?? []) {
    events[event.id] = { booth_id: event.booth_id ?? null, ...(event.role !== user.role ? { role: event.role } : {}) };
  }
  return { id: user.id, username: user.username, pin: "", role: user.role, is_active: user.is_active, events };
}

/**
 * Halaman Users & roles (list-detail): daftar akun di kiri, penyunting akun di
 * kanan saat satu baris dipilih.
 *
 * Akun dibuat dalam SATU langkah: masuk (username + PIN), peran, lalu acara yang
 * boleh dibuka. Sebelumnya acara diberikan terpisah di halaman akses tiap acara,
 * sehingga akun baru bisa masuk tetapi tidak melihat satu acara pun sampai
 * pemiliknya ingat membuka halaman lain.
 *
 * Klien (`admin`) hanya boleh melihat akun yang berbagi acara dengannya dan
 * mereset PIN operator booth & kasir. Nilai `can_manage` datang dari server.
 */
export function UsersPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  // Booth per acara, dimuat saat dibutuhkan (peran Booth staff + acara dicentang).
  const [booths, setBooths] = useState<Record<string, Booth[] | "loading" | "error">>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [roleTab, setRoleTab] = useState<RoleTab>("semua");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cariAcara, setCariAcara] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [usersResponse, eventsResponse] = await Promise.all([fetch("/api/admin/users", { cache: "no-store" }), fetch("/api/events", { cache: "no-store" })]);
      if (usersResponse.ok) {
        const data = await usersResponse.json();
        setUsers(data.users ?? []);
        setCanManage(Boolean(data.can_manage));
      } else setLoadError((await usersResponse.json()).error?.message ?? "Accounts could not be loaded.");
      if (eventsResponse.ok) {
        const data = await eventsResponse.json();
        setEvents(((data.events ?? []) as EventOption[]).filter((event) => !event.archived_at));
      }
    } catch {
      setLoadError("Connection lost. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const muatBooth = useCallback(async (event: EventOption) => {
    setBooths((current) => (current[event.id] ? current : { ...current, [event.id]: "loading" }));
    try {
      const response = await fetch(`/api/admin/booths?eventSlug=${encodeURIComponent(event.slug)}`, { cache: "no-store" });
      const data = response.ok ? await response.json() : null;
      setBooths((current) => ({ ...current, [event.id]: data ? (data.booths ?? []) : "error" }));
    } catch {
      setBooths((current) => ({ ...current, [event.id]: "error" }));
    }
  }, []);

  // Booth staff memilih booth per acara, jadi daftar booth setiap acara yang
  // dicentang dimuat begitu acara dicentang atau peran berganti ke Booth staff.
  function pastikanBooth(ids: string[]) {
    for (const id of ids) {
      const event = events.find((item) => item.id === id);
      if (event && !booths[id]) void muatBooth(event);
    }
  }

  function canEdit(user: Pick<User, "role">) {
    return canManage || user.role === "booth" || user.role === "cashier";
  }

  function selectUser(user: User) {
    const next = dariUser(user);
    if (next.role === "booth") pastikanBooth(Object.keys(next.events));
    setDraft(next);
    setCariAcara("");
    setError("");
  }

  function startNew() {
    setDraft(blank);
    setCariAcara("");
    setError("");
  }

  function close() {
    setDraft(null);
    setError("");
  }

  function toggleEvent(id: string, on: boolean) {
    if (on && draft?.role === "booth") pastikanBooth([id]);
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current.events };
      if (on) next[id] = { booth_id: null };
      else delete next[id];
      return { ...current, events: next };
    });
  }

  function setBooth(id: string, booth_id: number | null) {
    setDraft((current) => current && { ...current, events: { ...current.events, [id]: { ...current.events[id], booth_id } } });
  }

  const dipilih = draft ? Object.keys(draft.events).filter((id) => events.some((event) => event.id === id)) : [];
  const perluAcara = Boolean(draft && draft.role !== "super_admin");
  const boothKurang = Boolean(draft && draft.role === "booth" && dipilih.some((id) => !draft.events[id]?.booth_id));

  async function save() {
    if (!draft) return;
    setSaving(true); setError("");
    const isNew = !draft.id;
    if (isNew && !/^\d{6}$/.test(draft.pin)) { setSaving(false); setError("Enter a 6-digit PIN for the new account."); return; }
    // Tanpa izin kelola user, kirim HANYA pin. Server menolak PATCH yang
    // menyertakan field lain.
    const payload: Record<string, unknown> = canManage
      ? {
          username: draft.username,
          role: draft.role,
          is_active: draft.is_active,
          events: draft.role === "super_admin" ? [] : dipilih.map((id) => ({
            event_id: id,
            booth_id: draft.role === "booth" ? draft.events[id]?.booth_id ?? null : null,
            role: draft.events[id]?.role ?? draft.role,
          })),
        }
      : {};
    if (draft.id) payload.id = draft.id;
    if (draft.pin) payload.pin = draft.pin;
    const response = await fetch("/api/admin/users", { method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      const failure = data.error?.details?.message ?? data.error?.message ?? "The account could not be saved.";
      setError(failure);
      toast.error("Account not saved", failure);
      return;
    }
    toast.success(`${data.user.username} saved`, isNew ? "They can sign in now." : canManage ? "Changes applied." : "The new PIN works now.");
    const saved = data.user as User;
    setDraft(dariUser(saved));
    void load();
  }

  const saring = (roles: Role[] | null) => (roles ? users.filter((user) => roles.includes(user.role)) : users);
  const visible = saring(ROLE_TABS.find((tab) => tab.value === roleTab)?.roles ?? null);
  const selectedUser = draft?.id ? users.find((user) => user.id === draft.id) ?? null : null;

  // ---- Panel daftar --------------------------------------------------------
  const list = (
    <Pane aria-label="Accounts">
      <PaneBody className="overflow-x-auto">
        {loadError && users.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3 px-4 py-4">
            <p role="alert" className="flex min-w-0 flex-1 items-start gap-2 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{loadError}</p>
            <Button variant="outlined" size="sm" onClick={() => void load()}>Try again</Button>
          </div>
        ) : loading ? (
          <div aria-label="Loading accounts">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-outline-variant px-4 py-4">
                <div className="h-3 w-40 animate-pulse rounded bg-surface-container-high" />
                <div className="h-3 w-24 animate-pulse rounded bg-surface-container-high" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            plain
            icon={<ShieldCheck size={40} />}
            title={users.length === 0 ? "No accounts yet" : "No accounts with this role"}
            description={users.length === 0
              ? canManage ? "Add accounts for your team, booth staff, cashiers and scanner staff." : "Only a super admin can add accounts."
              : "Choose another tab to see accounts with other roles."}
            action={users.length > 0 ? <Button variant="outlined" size="sm" onClick={() => setRoleTab("semua")}>Show all</Button> : undefined}
          />
        ) : (
          <table className="w-full min-w-[520px] border-separate border-spacing-0 text-left text-body-medium">
            <thead className="sticky top-0 z-10 bg-surface-container-high text-body-medium font-medium text-on-surface-variant">
              <tr>
                <th scope="col" className="border-b border-outline-variant px-4 py-2.5 font-medium">Account</th>
                <th scope="col" className="border-b border-outline-variant px-3 py-2.5 font-medium">Role</th>
                <th scope="col" className="border-b border-outline-variant px-3 py-2.5 font-medium">Event access</th>
                <th scope="col" className="border-b border-outline-variant px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((user) => {
                const aktif = draft?.id === user.id;
                return (
                  <tr
                    key={user.id}
                    onClick={() => selectUser(user)}
                    className={cx("cursor-pointer", aktif ? "bg-secondary-container" : "bg-surface-container-lowest hover:bg-primary-soft")}
                  >
                    <td className="border-b border-outline-variant px-4 py-2.5">
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); selectUser(user); }}
                        aria-pressed={aktif}
                        className="block w-full min-w-0 truncate rounded-sm text-left font-medium text-on-surface"
                      >
                        {user.username}
                      </button>
                    </td>
                    <td className="border-b border-outline-variant px-3 py-2.5">{ROLE_LABEL[user.role]}</td>
                    <td className="max-w-[360px] border-b border-outline-variant px-3 py-2.5">
                      <AksesAcara user={user} canManage={canManage} />
                    </td>
                    <td className="border-b border-outline-variant px-3 py-2.5">
                      {user.is_active ? <StatusChip dot tone="success">Active</StatusChip> : <StatusChip dot tone="neutral">Inactive</StatusChip>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </PaneBody>
      <PaneFooter
        className="bg-surface-container-lowest py-2"
        note={canManage
          ? "A role sets what someone can do. Event access sets where."
          : "You see accounts on your events and can reset PINs for booth staff and cashiers."}
      />
    </Pane>
  );

  // ---- Panel detail --------------------------------------------------------
  let detail = null;
  let dialogBaru = null;
  if (draft) {
    const isNew = !draft.id;
    const editable = isNew ? canManage : canEdit(selectedUser ?? draft);
    const saveDisabled = canManage
      ? draft.username.length < 3 || (isNew && draft.pin.length !== 6) || (perluAcara && dipilih.length === 0) || boothKurang
      : !draft.id || draft.pin.length !== 6;
    const kataKunci = cariAcara.trim().toLowerCase();
    const acaraTampil = kataKunci ? events.filter((event) => event.name.toLowerCase().includes(kataKunci)) : events;

    const daftarAcara = (
      <div className="flex flex-col gap-1">
        {events.length >= CARI_ACARA_MULAI ? (
          <TextField
            label="Search events"
            className="mb-1"
            value={cariAcara}
            onChange={(event) => setCariAcara(event.target.value)}
            leading={<MagnifyingGlass size={16} />}
            placeholder="Event name"
          />
        ) : null}
        {events.length === 0 ? (
          <p className="text-body-medium text-on-surface-variant">No events yet. Create an event first, then give access here.</p>
        ) : acaraTampil.map((event) => {
          const pilih = draft.events[event.id];
          const daftarBooth = booths[event.id];
          return (
            <div key={event.id} className={cx("rounded-lg border px-3 py-2", pilih ? "border-primary" : "border-outline-variant")}>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={Boolean(pilih)}
                  onChange={(change) => toggleEvent(event.id, change.target.checked)}
                  className="size-4 shrink-0 accent-[var(--md-sys-color-primary)]"
                />
                <span className="min-w-0 flex-1 truncate text-body-medium text-on-surface">{event.name}</span>
                {pilih?.role ? <span className="shrink-0 text-body-small text-on-surface-variant">{ROLE_LABEL[pilih.role]} here</span> : null}
                <span className="shrink-0 text-body-small text-on-surface-variant">{EVENT_STATUS_LABEL[event.status as keyof typeof EVENT_STATUS_LABEL] ?? event.status}</span>
              </label>
              {pilih && draft.role === "booth" && !pilih.role ? (
                <div className="mt-2 pl-7">
                  {daftarBooth === "loading" || daftarBooth === undefined ? (
                    <p className="text-body-small text-on-surface-variant">Loading booths…</p>
                  ) : daftarBooth === "error" ? (
                    <p className="text-body-small text-error">Booths could not be loaded.</p>
                  ) : daftarBooth.length === 0 ? (
                    <p className="text-body-small text-error">This event has no booths yet. Add one in Booths & items first.</p>
                  ) : (
                    <SelectField
                      label="Booth"
                      value={pilih.booth_id ?? ""}
                      onChange={(change) => setBooth(event.id, change.target.value ? Number(change.target.value) : null)}
                    >
                      <option value="">Choose a booth</option>
                      {daftarBooth.map((booth) => <option key={booth.id} value={booth.id}>{booth.code} · {booth.name}</option>)}
                    </SelectField>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );

    const ringkasanAcara = (selectedUser?.events ?? []).map((event) => event.name).join(", ");
    const catatanSimpan = canManage && perluAcara && dipilih.length === 0 ? "Tick at least one event." : boothKurang ? "Choose a booth for each event." : undefined;

    const bagianMasuk = (
      <DetailSection title="Sign-in">
        <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Username"
          value={draft.username}
          onChange={(event) => setDraft((current) => current && { ...current, username: event.target.value.toLowerCase() })}
          placeholder="e.g. ratna.booth3"
          autoComplete="off"
        />
        <TextField
          label={isNew ? "PIN" : "New PIN"}
          value={draft.pin}
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          onChange={(event) => setDraft((current) => current && { ...current, pin: event.target.value.replace(/\D/g, "").slice(0, 6) })}
          placeholder="6 digits"
          inputClassName="tabular-nums"
          trailing={<Button type="button" variant="text" size="sm" onClick={() => setDraft((current) => current && { ...current, pin: pinAcak() })}>Generate</Button>}
        />
        </div>
        <p className="-mt-1 text-body-small text-on-surface-variant">{isNew ? "Give the PIN to them in person." : "Leave the PIN empty to keep the current one."}</p>
      </DetailSection>
    );

    const bagianPeran = (
      <DetailSection title="Role">
        <div role="radiogroup" aria-label="Role" className="flex flex-col gap-1">
          {ROLE_OPTIONS.map((option) => (
            <PilihanPeran
              key={option.value}
              role={option.value}
              description={option.description}
              checked={draft.role === option.value}
              onSelect={() => {
                if (option.value === "booth") pastikanBooth(Object.keys(draft.events));
                setDraft((current) => current && { ...current, role: option.value });
              }}
            />
          ))}
        </div>
      </DetailSection>
    );

    const bagianAcara = (
      <DetailSection
        title="Events"
        action={perluAcara && dipilih.length > 0 ? <span className="text-body-small text-on-surface-variant tabular-nums">{dipilih.length} selected</span> : undefined}
      >
        {perluAcara ? (
          <>
            <p className="-mt-1 text-body-small text-on-surface-variant">They can open only the events you tick.</p>
            {daftarAcara}
          </>
        ) : (
          <p className="text-body-medium text-on-surface-variant">Super admins open every event, including ones created later.</p>
        )}
      </DetailSection>
    );

    const tombolSimpan = (
      <Button type="submit" form="form-akun" size="sm" loading={saving} disabled={saveDisabled}>
        {canManage ? (isNew ? "Create user" : "Save changes") : "Reset PIN"}
      </Button>
    );
    const pesanGalat = error ? <p role="alert" className="mx-5 mt-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{error}</p> : null;
    const kirim = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (editable && !saveDisabled) void save(); };

    if (isNew) {
      // Akun baru dibuat di dialog, seperti "Add new user" di Google Workspace
      // dan "Invite member" di Vercel/GitHub: satu langkah yang selesai atau
      // dibatalkan. Kepala dan baris tombol DIKUNCI; hanya isinya yang
      // bergulir, supaya judul dan tombol Create tidak hilang saat menggulir di
      // layar setinggi 588px. Dua kolom: siapa dan perannya di kiri, acaranya
      // di kanan, sehingga ketiganya terlihat sekaligus.
      dialogBaru = (
        <Dialog open bare size="xl" title="New user" onClose={close} dismissible={!saving} className="sm:max-w-[880px]">
          <form id="form-akun" onSubmit={kirim} className="flex max-h-[90dvh] flex-col">
            <div className="flex shrink-0 items-start gap-3 border-b border-outline-variant px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-title-large font-semibold">New user</h2>
                <p className="text-body-medium text-on-surface-variant">Pick a role and the events they can open. They can sign in right away.</p>
              </div>
              <IconButton size="sm" label="Close" onClick={close} disabled={saving}><X size={16} /></IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {pesanGalat}
              <div className="grid md:grid-cols-2 md:divide-x md:divide-outline-variant">
                <div className="min-w-0">{bagianMasuk}{bagianPeran}</div>
                <div className="min-w-0">{bagianAcara}</div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-outline-variant px-5 py-3">
              <p className="min-w-40 flex-1 text-body-medium text-on-surface-variant">{catatanSimpan}</p>
              <Button type="button" variant="outlined" size="sm" disabled={saving} onClick={close}>Cancel</Button>
              {tombolSimpan}
            </div>
          </form>
        </Dialog>
      );
    } else detail = (
      <Pane as="aside" aria-label={`Account ${draft.username}`}>
        <div className="flex shrink-0 items-start gap-3 border-b border-outline-variant px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 truncate text-title-medium font-semibold leading-6">{selectedUser?.username ?? draft.username}</h2>
              {selectedUser ? (selectedUser.is_active ? <StatusChip dot tone="success">Active</StatusChip> : <StatusChip dot tone="neutral">Inactive</StatusChip>) : null}
            </div>
            <p className="text-body-medium text-on-surface-variant">{ROLE_LABEL[selectedUser?.role ?? draft.role]}</p>
          </div>
          <IconButton size="sm" label="Close" onClick={close} disabled={saving}><X size={16} /></IconButton>
        </div>

        <PaneBody>
          <form id="form-akun" onSubmit={kirim}>
            {pesanGalat}
            {canManage ? (
              <>
                {bagianAcara}
                {bagianPeran}
                {bagianMasuk}
                <DetailSection>
                  <Switch checked={draft.is_active} onChange={(is_active) => setDraft((current) => current && { ...current, is_active })} label="Active" description="Inactive accounts cannot sign in." />
                </DetailSection>
              </>
            ) : (
              <>
                <DetailSection>
                  <dl className="flex flex-col gap-2.5">
                    <KeyValue label="Role">{ROLE_LABEL[draft.role]}</KeyValue>
                    <KeyValue label="Events">{ringkasanAcara || <span className="text-on-surface-variant">No events yet</span>}</KeyValue>
                    <KeyValue label="Status">{draft.is_active ? "Active" : "Inactive"}</KeyValue>
                  </dl>
                </DetailSection>
                {editable ? (
                  <DetailSection>
                    <TextField
                      label="New PIN, 6 digits"
                      hint="Enter a new PIN, then press Reset PIN."
                      value={draft.pin}
                      inputMode="numeric"
                      autoComplete="new-password"
                      maxLength={6}
                      onChange={(event) => setDraft((current) => current && { ...current, pin: event.target.value.replace(/\D/g, "").slice(0, 6) })}
                      placeholder="6 digits"
                      inputClassName="tabular-nums"
                    />
                  </DetailSection>
                ) : (
                  <DetailSection>
                    <p className="text-body-medium text-on-surface-variant">Only a super admin can change {ROLE_LABEL[draft.role]} accounts, including their PIN.</p>
                  </DetailSection>
                )}
              </>
            )}
          </form>
        </PaneBody>

        {editable ? (
          <PaneFooter note={catatanSimpan}>
            <Button type="button" variant="outlined" size="sm" disabled={saving} onClick={close}>Cancel</Button>
            {tombolSimpan}
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
            <span className="tabular-nums">{loading ? "Loading accounts" : `${users.length} ${users.length === 1 ? "account" : "accounts"}`}</span>
            <MetaSeparator />
            <span>Role sets what they can do, events set where</span>
          </>
        }
        actions={canManage ? (
          <Button variant={draft?.id ? "outlined" : "filled"} onClick={startNew} icon={<Plus size={16} weight="bold" />}>Add user</Button>
        ) : undefined}
      />

      {loadError && users.length > 0 ? (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{loadError}</p>
      ) : null}

      <Tabs<RoleTab>
        label="Filter accounts by role"
        idPrefix="akun"
        value={roleTab}
        onChange={setRoleTab}
        options={ROLE_TABS.map((tab) => ({ value: tab.value, label: tab.label, badge: loading ? undefined : saring(tab.roles).length }))}
      />

      <div role="tabpanel" id={`akun-panel-${roleTab}`} aria-labelledby={`akun-tab-${roleTab}`} className="flex min-h-0 flex-1 flex-col">
        <ListDetail list={list} detail={detail} detailWidth={420} />
      </div>
      {dialogBaru}
    </>
  );
}
