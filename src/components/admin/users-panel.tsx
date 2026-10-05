"use client";

import { CheckCircle, Copy, Plus, ShieldCheck, X, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ROLE_LABEL } from "@/lib/domain";
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
import { AksesAcaraEditor, type AksesBaris, type DaftarBooth, type EventRole } from "./akses-acara-editor";

type Role = "booth" | "cashier" | "admin" | "super_admin" | "scanner";
type UserEvent = { id: string; slug: string; name: string; role: EventRole; booth_id?: number | null; booth_code?: string | null; archived?: boolean };
type User = { id: string; username: string; role: Role; booth_id: number | null; is_active: boolean; events?: UserEvent[] };
type EventOption = { id: string; slug: string; name: string; status: string; archived_at?: string | null };
type Draft = { id: string | null; username: string; pin: string; role: Role; is_active: boolean; rows: AksesBaris[]; arsip: { id: string; name: string }[] };
type RoleTab = "semua" | "booth" | "cashier" | "scanner" | "admin";

const blank: Draft = { id: null, username: "", pin: "", role: "booth", is_active: true, rows: [], arsip: [] };

/**
 * Satu peran per akun, berlaku di setiap acaranya. Satu kalimat per peran,
 * ditampilkan tepat di bawah pilihan.
 */
const ROLE_HELP: Record<Role, string> = {
  admin: "Runs the events below: setup, participants, messages and reports.",
  booth: "Scans participants and hands out items at one booth per event.",
  cashier: "Takes payments and voids orders.",
  scanner: "Checks participants in at the entrance and sessions.",
  super_admin: "Opens every event, including new ones, and manages users and roles.",
};
const ROLE_ORDER: Role[] = ["admin", "booth", "cashier", "scanner", "super_admin"];

const BATAS_ACARA = 2;

/**
 * Akses per acara (user_event_access) di samping peran global. Booth ikut ditulis
 * di sebelah acaranya, karena booth adalah milik acara, bukan milik akun.
 */
function AksesAcara({ user }: { user: User }) {
  if (user.role === "super_admin") return <span className="text-on-surface-variant">All events</span>;
  const daftar = [...(user.events ?? [])].sort((a, b) => Number(Boolean(a.archived)) - Number(Boolean(b.archived)));
  if (daftar.length === 0) return <span className="text-on-surface-variant">No events yet</span>;
  const tampil = daftar.slice(0, BATAS_ACARA);
  const sisa = daftar.length - tampil.length;
  return (
    <ul className="flex min-w-0 flex-wrap gap-1">
      {tampil.map((event) => (
        <li key={event.id} className={cx("inline-flex h-6 min-w-0 max-w-full items-center gap-1 rounded-md border border-outline-variant px-2 text-body-small", event.archived ? "text-on-surface-variant" : "bg-surface text-on-surface")}>
          <span className="min-w-0 truncate">{event.name}</span>
          {event.booth_code ? <span className="shrink-0 text-on-surface-variant">· {event.booth_code}</span> : null}
          {event.archived ? <span className="shrink-0 text-on-surface-variant">· Archived</span> : null}
        </li>
      ))}
      {sisa > 0 ? <li className="inline-flex h-6 items-center px-1 text-body-small text-on-surface-variant">+{sisa}</li> : null}
    </ul>
  );
}

function pinAcak() {
  const angka = new Uint32Array(1);
  crypto.getRandomValues(angka);
  return String(angka[0] % 1_000_000).padStart(6, "0");
}

/**
 * Layar sesudah akun dibuat: username dan PIN ditampilkan SEKALI, dengan tombol
 * salin. PIN tidak disimpan dalam bentuk terbaca, jadi setelah dialog ini
 * ditutup satu-satunya jalan adalah membuat PIN baru.
 */
function AkunDibuat({ username, pin, onDone }: { username: string; pin: string; onDone: () => void }) {
  const [tersalin, setTersalin] = useState(false);
  async function salin() {
    try {
      await navigator.clipboard.writeText(`Username: ${username}\nPIN: ${pin}`);
      setTersalin(true);
    } catch {
      setTersalin(false);
    }
  }
  return (
    <div className="flex flex-col max-sm:h-dvh">
      <div className="flex-1 px-5 py-5">
        <h2 className="flex items-center gap-2 text-title-large font-semibold"><CheckCircle size={22} weight="fill" className="text-success" />{username} is added</h2>
        <p className="mt-1 text-body-medium text-on-surface-variant">Give them these sign-in details in person. The PIN is shown only once.</p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border border-outline-variant px-4 py-3">
          <dt className="text-body-medium text-on-surface-variant">Username</dt>
          <dd className="text-body-large font-medium">{username}</dd>
          <dt className="text-body-medium text-on-surface-variant">PIN</dt>
          <dd className="text-body-large font-semibold tabular-nums tracking-widest">{pin}</dd>
        </dl>
        <p role="status" className="mt-2 min-h-5 text-body-small text-on-surface-variant">{tersalin ? "Copied." : ""}</p>
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-outline-variant px-5 py-3">
        <Button type="button" variant="outlined" size="sm" icon={<Copy size={16} />} onClick={() => void salin()}>Copy details</Button>
        <Button type="button" size="sm" onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

/** Tab penyaring per peran. "Admin" memuat Admin dan Super admin. */
const ROLE_TABS: Array<{ value: RoleTab; label: string; roles: Role[] | null }> = [
  { value: "semua", label: "All", roles: null },
  { value: "booth", label: ROLE_LABEL.booth, roles: ["booth"] },
  { value: "cashier", label: ROLE_LABEL.cashier, roles: ["cashier"] },
  { value: "scanner", label: ROLE_LABEL.scanner, roles: ["scanner"] },
  { value: "admin", label: "Admin", roles: ["admin", "super_admin"] },
];

function dariUser(user: User): Draft {
  return {
    id: user.id,
    username: user.username,
    pin: "",
    role: user.role,
    is_active: user.is_active,
    rows: (user.events ?? []).filter((event) => !event.archived).map((event) => ({ event_id: event.id, booth_id: event.booth_id ?? null })),
    // Acara terarsip tetap tersimpan di server (tidak ikut diganti saat simpan);
    // di layar tampil sebagai chip terkunci.
    arsip: (user.events ?? []).filter((event) => event.archived).map((event) => ({ id: event.id, name: event.name })),
  };
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
  const [booths, setBooths] = useState<DaftarBooth>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [roleTab, setRoleTab] = useState<RoleTab>("semua");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  // Galat yang milik satu kolom (username dipakai) ditulis di bawah kolomnya.
  const [galatUsername, setGalatUsername] = useState("");
  // Akun yang baru dibuat: PIN-nya ditampilkan SEKALI, lalu tidak pernah lagi.
  const [dibuat, setDibuat] = useState<{ username: string; pin: string } | null>(null);
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

  const pastikanBooth = useCallback((event: EventOption) => {
    if (!booths[event.id]) void muatBooth(event);
  }, [booths, muatBooth]);

  function canEdit(user: Pick<User, "role">) {
    return canManage || user.role === "booth" || user.role === "cashier";
  }

  function selectUser(user: User) {
    const next = dariUser(user);
    if (next.role === "booth") muatBoothBaris(next.rows);
    setDraft(next);
    setError("");
  }

  function startNew() {
    setDraft(blank);
    setDibuat(null);
    setGalatUsername("");
    setError("");
  }

  function close() {
    setDraft(null);
    setDibuat(null);
    setGalatUsername("");
    setError("");
  }

  function muatBoothBaris(rows: AksesBaris[]) {
    for (const row of rows) {
      const event = events.find((item) => item.id === row.event_id);
      if (event) pastikanBooth(event);
    }
  }

  const perluAcara = Boolean(draft && draft.role !== "super_admin");
  const boothKurang = Boolean(draft && draft.role === "booth" && draft.rows.some((row) => !row.booth_id));

  async function save() {
    if (!draft) return;
    setSaving(true); setError("");
    const isNew = !draft.id;
    if (isNew && !/^\d{6}$/.test(draft.pin)) { setSaving(false); setError("Enter a 6-digit PIN for the new account."); return; }
    // Tanpa izin kelola user, kirim HANYA pin. Server menolak PATCH yang
    // menyertakan field lain.
    const events = draft.role === "super_admin" ? [] : draft.rows.map((row) => ({ event_id: row.event_id, booth_id: draft.role === "booth" ? row.booth_id : null }));
    // Daftar acara hanya dikirim bila berubah. Simpan yang sekadar mengganti PIN
    // atau status Active tidak menyentuh akses acaranya sama sekali.
    const asal = draft.id ? users.find((user) => user.id === draft.id) : undefined;
    const kunci = (daftar: { event_id: string; booth_id: number | null }[]) => JSON.stringify([...daftar].sort((a, b) => a.event_id.localeCompare(b.event_id)));
    const tetap = asal !== undefined && asal.role === draft.role && kunci(events) === kunci(dariUser(asal).rows.map((row) => ({ event_id: row.event_id, booth_id: draft.role === "booth" ? row.booth_id : null })));
    const payload: Record<string, unknown> = canManage
      ? {
          username: draft.username,
          role: draft.role,
          is_active: draft.is_active,
          ...(tetap ? {} : { events }),
        }
      : {};
    if (draft.id) payload.id = draft.id;
    if (draft.pin) payload.pin = draft.pin;
    const response = await fetch("/api/admin/users", { method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      const failure = data.error?.details?.message ?? data.error?.message ?? "The account could not be saved.";
      if (data.error?.details?.field === "username") { setGalatUsername(failure); return; }
      setError(failure);
      return;
    }
    const saved = data.user as User;
    void load();
    if (isNew) {
      setDibuat({ username: saved.username, pin: draft.pin });
      return;
    }
    toast.success(`${saved.username} saved`, canManage ? "Changes applied." : "The new PIN works now.");
    // Respons PATCH hanya membawa akun, tanpa acara. Draft yang baru disimpan
    // sudah sama dengan isi server, jadi cukup disamakan field akunnya.
    setDraft((current) => current && { ...current, username: saved.username, role: saved.role, is_active: saved.is_active, pin: "" });
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
                      <AksesAcara user={user} />
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
      ? draft.username.length < 3 || (isNew && draft.pin.length !== 6) || (perluAcara && draft.rows.length + draft.arsip.length === 0) || boothKurang
      : !draft.id || draft.pin.length !== 6;

    const ringkasanAcara = (selectedUser?.events ?? []).map((event) => event.name).join(", ");
    const catatanSimpan = canManage && perluAcara && draft.rows.length + draft.arsip.length === 0 ? "Add at least one event." : boothKurang ? "Choose a booth for each event." : undefined;

    const bagianMasuk = (
      <DetailSection title="Sign-in">
        <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Username"
          value={draft.username}
          onChange={(event) => { setGalatUsername(""); setDraft((current) => current && { ...current, username: event.target.value.toLowerCase() }); }}
          error={galatUsername || undefined}
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

    const isiAkses = (
      <div className="mt-2">
        {perluAcara ? (
          <AksesAcaraEditor
            rows={draft.rows}
            role={draft.role as EventRole}
            onChange={(rows) => setDraft((current) => current && { ...current, rows })}
            events={events}
            booths={booths}
            onNeedBooths={pastikanBooth}
            archived={draft.arsip}
          />
        ) : (
          <div>
            <p className="m3-field-label text-label-large font-semibold text-on-surface">Event access</p>
            <p className="mt-1.5 text-body-medium text-on-surface">All events, including ones created later.</p>
          </div>
        )}
      </div>
    );
    const bagianPeran = (
      <DetailSection>
        <SelectField
          label="Role"
          value={draft.role}
          hint={ROLE_HELP[draft.role]}
          onChange={(change) => {
            const role = change.target.value as Role;
            if (role === "booth") muatBoothBaris(draft.rows);
            setDraft((current) => current && { ...current, role });
          }}
        >
          {ROLE_ORDER.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
        </SelectField>
        {isiAkses}
      </DetailSection>
    );


    const tombolSimpan = (
      <Button type="submit" form="form-akun" size="sm" loading={saving} disabled={saveDisabled}>
        {canManage ? (isNew ? "Add user" : "Save changes") : "Reset PIN"}
      </Button>
    );
    const pesanGalat = error ? <p role="alert" className="mx-5 mt-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{error}</p> : null;
    const kirim = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (editable && !saveDisabled) void save(); };

    if (isNew) {
      // Akun baru dibuat di dialog, seperti "Add new user" di Google Workspace
      // dan "Invite member" di Vercel/GitHub: satu langkah yang selesai atau
      // dibatalkan. Kepala dan baris tombol DIKUNCI; hanya isinya yang
      // bergulir, supaya judul dan tombol Create tidak hilang saat menggulir di
      // layar setinggi 588px. Satu kolom: siapa, sebagai apa, lalu di acara
      // mana.
      dialogBaru = (
        <Dialog open bare size="lg" title="Add user" onClose={close} dismissible={!saving} fullScreenOnMobile>
          {dibuat ? (
            <AkunDibuat username={dibuat.username} pin={dibuat.pin} onDone={close} />
          ) : (
          <form id="form-akun" onSubmit={kirim} className="flex max-h-[90dvh] flex-col max-sm:h-dvh max-sm:max-h-none">
            <div className="flex shrink-0 items-start gap-3 border-b border-outline-variant px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-title-large font-semibold">Add user</h2>
                <p className="text-body-medium text-on-surface-variant">They can sign in as soon as you add them.</p>
              </div>
              <IconButton size="sm" label="Close" onClick={close} disabled={saving}><X size={16} /></IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {pesanGalat}
              {bagianMasuk}
              {bagianPeran}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-outline-variant px-5 py-3">
              <p className="min-w-0 flex-1 text-body-medium text-on-surface-variant max-sm:basis-full">{catatanSimpan}</p>
              <div className="ml-auto flex shrink-0 gap-2">
                <Button type="button" variant="outlined" size="sm" disabled={saving} onClick={close}>Cancel</Button>
                {tombolSimpan}
              </div>
            </div>
          </form>
          )}
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
