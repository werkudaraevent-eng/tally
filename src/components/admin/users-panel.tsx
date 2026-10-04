"use client";

import { Check, Plus, ShieldCheck, X, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { ROLE_LABEL } from "@/lib/domain";
import {
  Button,
  DetailSection,
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
type User = { id: string; username: string; role: Role; booth_id: number | null; is_active: boolean };
type Booth = { id: number; code: string; name: string };
type Draft = { id: string | null; username: string; pin: string; role: Role; booth_id: number | null; is_active: boolean };
type RoleTab = "semua" | "booth" | "cashier" | "scanner" | "admin";

const blank: Draft = { id: null, username: "", pin: "", role: "booth", booth_id: null, is_active: true };
const rolePermissions: Record<Role, string[]> = {
  booth: ["Scan peserta & buat order", "Serahkan barang di booth", "Lihat riwayat booth sendiri"],
  cashier: ["Lihat antrean pembayaran", "Tandai lunas", "Void order"],
  admin: ["Kelola booth & item spesial", "Kelola metode pembayaran", "Semua laporan & settings", "Void order apa pun", "Reset PIN operator booth & kasir"],
  super_admin: ["Semua izin Panitia / Admin", "Kelola user & role", "Kosongkan data pencatatan"],
  // Sengaja sesempit ini. Akun ini dipegang bergantian di pintu masuk, sering di
  // ponsel yang tidak terkunci; apa pun di luar memindai kehadiran adalah
  // kewenangan yang tidak dibutuhkan di sana.
  scanner: ["Buka layar pemindai kehadiran", "Catat kehadiran peserta per sesi"],
};

/** Tab penyaring per peran. "Admin" memuat Panitia / Admin dan Super Admin. */
const ROLE_TABS: Array<{ value: RoleTab; label: string; roles: Role[] | null }> = [
  { value: "semua", label: "Semua", roles: null },
  { value: "booth", label: "Booth", roles: ["booth"] },
  { value: "cashier", label: "Kasir", roles: ["cashier"] },
  { value: "scanner", label: "Petugas scan", roles: ["scanner"] },
  { value: "admin", label: "Admin", roles: ["admin", "super_admin"] },
];

/**
 * Halaman User & role (list-detail): daftar akun di kiri, penyunting akun di
 * kanan saat satu baris dipilih.
 *
 * Klien (`admin`) hanya boleh melihat daftar akun dan mereset PIN operator
 * booth & kasir. Nilai `can_manage` datang dari server, bukan ditebak dari role
 * di klien, dan server tetap menolak apa pun di luar itu.
 */
export function UsersPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [booths, setBooths] = useState<Booth[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [roleTab, setRoleTab] = useState<RoleTab>("semua");
  // null = belum ada yang dipilih; daftar memakai seluruh lebar.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [usersResponse, boothsResponse] = await Promise.all([fetch("/api/admin/users", { cache: "no-store" }), fetch("/api/admin/booths", { cache: "no-store" })]);
      if (usersResponse.ok) {
        const data = await usersResponse.json();
        setUsers(data.users ?? []);
        setCanManage(Boolean(data.can_manage));
      } else setLoadError((await usersResponse.json()).error?.message ?? "User gagal dimuat.");
      if (boothsResponse.ok) setBooths((await boothsResponse.json()).booths ?? []);
    } catch {
      setLoadError("Koneksi terputus. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  // Klien hanya boleh menyentuh PIN operator booth/kasir. Akun admin dan
  // super_admin tidak dapat diedit sama sekali olehnya.
  function canEdit(user: Pick<User, "role">) {
    return canManage || user.role === "booth" || user.role === "cashier";
  }

  function selectUser(user: User) {
    setDraft({ id: user.id, username: user.username, pin: "", role: user.role, booth_id: user.booth_id, is_active: user.is_active });
    setError("");
  }

  function startNew() {
    setDraft(blank);
    setError("");
  }

  function close() {
    setDraft(null);
    setError("");
  }

  async function save() {
    if (!draft) return;
    setSaving(true); setError("");
    const isNew = !draft.id;
    if (isNew && !/^\d{6}$/.test(draft.pin)) { setSaving(false); setError("PIN wajib 6 digit untuk user baru."); toast.error("PIN belum valid", "PIN wajib 6 digit angka untuk user baru."); return; }
    // Tanpa izin kelola user, kirim HANYA pin. Server menolak PATCH yang
    // menyertakan field lain, jadi mengirim username/role/is_active seperti
    // biasa akan membuat reset PIN gagal dengan 403.
    const payload: Record<string, unknown> = canManage
      ? { username: draft.username, role: draft.role, booth_id: draft.role === "booth" ? draft.booth_id : null, is_active: draft.is_active }
      : {};
    if (draft.id) payload.id = draft.id;
    if (draft.pin) payload.pin = draft.pin;
    const response = await fetch("/api/admin/users", { method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      const failure = data.error?.details?.message ?? data.error?.message ?? "User gagal disimpan.";
      setError(failure);
      toast.error("User gagal disimpan", failure);
      return;
    }
    toast.success(`${data.user.username} tersimpan`, isNew ? "User baru dapat langsung login." : canManage ? "Perubahan user diterapkan." : "PIN baru langsung berlaku.");
    // Tetap di akun yang barusan disimpan, dengan kolom PIN dikosongkan lagi.
    const saved = data.user as User;
    setDraft({ id: saved.id, username: saved.username, pin: "", role: saved.role, booth_id: saved.booth_id, is_active: saved.is_active });
    void load();
  }

  const boothLabel = (id: number | null) => {
    if (!id) return null;
    // Kode booth WAJIB dibaca dari data booth, bukan dibentuk dari `B` + booth_id.
    // Kode booth bebas huruf/angka (mis. PH), jadi menyusunnya dari id
    // menampilkan booth PH sebagai "B8" dan membuat admin ragu apakah user
    // tersambung ke booth yang benar.
    const booth = booths.find((item) => item.id === id);
    return booth ? booth.code : `#${id}`;
  };

  const saring = (roles: Role[] | null) => (roles ? users.filter((user) => roles.includes(user.role)) : users);
  const visible = saring(ROLE_TABS.find((tab) => tab.value === roleTab)?.roles ?? null);
  const selectedUser = draft?.id ? users.find((user) => user.id === draft.id) ?? null : null;

  // ---- Panel daftar --------------------------------------------------------
  const list = (
    <Pane aria-label="Daftar akun">
      <PaneBody className="overflow-x-auto">
        {loadError && users.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3 px-4 py-4">
            <p role="alert" className="flex min-w-0 flex-1 items-start gap-2 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{loadError}</p>
            <Button variant="outlined" size="sm" onClick={() => void load()}>Coba lagi</Button>
          </div>
        ) : loading ? (
          <div aria-label="Memuat akun">
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
            title={users.length === 0 ? "Belum ada akun" : "Tidak ada akun dengan peran ini"}
            description={users.length === 0
              ? canManage ? "Tambahkan akun untuk panitia, operator booth, kasir, dan petugas scan." : "Akun hanya dapat ditambahkan super admin."
              : "Pilih tab lain untuk melihat akun berperan lain."}
            action={users.length > 0 ? <Button variant="outlined" size="sm" onClick={() => setRoleTab("semua")}>Tampilkan semua</Button> : undefined}
          />
        ) : (
          <table className="w-full min-w-[520px] border-separate border-spacing-0 text-left text-body-medium">
            <thead className="sticky top-0 z-10 bg-surface-container-lowest text-label-large text-on-surface-variant">
              <tr>
                <th scope="col" className="border-b border-outline-variant px-4 py-2 font-normal">Akun</th>
                <th scope="col" className="border-b border-outline-variant px-3 py-2 font-normal">Peran</th>
                <th scope="col" className="border-b border-outline-variant px-3 py-2 font-normal">Booth</th>
                <th scope="col" className="border-b border-outline-variant px-3 py-2 font-normal">Status</th>
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
                    <td className="border-b border-outline-variant px-3 py-2.5">{boothLabel(user.booth_id) ?? <span className="text-on-surface-variant">Tidak ada</span>}</td>
                    <td className="border-b border-outline-variant px-3 py-2.5">
                      {user.is_active ? <StatusChip dot tone="success">Aktif</StatusChip> : <StatusChip dot tone="neutral">Nonaktif</StatusChip>}
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
          ? "Peran menentukan izin di server."
          : "Anda dapat melihat akun dan mereset PIN operator booth & kasir. Perubahan lain hanya oleh super admin."}
      />
    </Pane>
  );

  // ---- Panel detail --------------------------------------------------------
  let detail = null;
  if (draft) {
    const isNew = !draft.id;
    const editable = isNew ? canManage : canEdit(selectedUser ?? draft);
    const boothTersimpan = selectedUser?.booth_id ? booths.find((item) => item.id === selectedUser.booth_id) : undefined;
    const subjudul = [
      ROLE_LABEL[selectedUser?.role ?? draft.role],
      selectedUser?.booth_id ? (boothTersimpan ? `${boothTersimpan.code} ${boothTersimpan.name}` : `#${selectedUser.booth_id}`) : null,
    ].filter(Boolean).join(" · ");
    const saveDisabled = canManage ? !draft.username : !draft.id || draft.pin.length !== 6;

    detail = (
      <Pane as="aside" aria-label={isNew ? "Akun baru" : `Akun ${draft.username}`}>
        <div className="flex shrink-0 items-start gap-3 border-b border-outline-variant px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 truncate text-title-medium font-semibold leading-6">{isNew ? "Akun baru" : selectedUser?.username ?? draft.username}</h2>
              {selectedUser ? (selectedUser.is_active ? <StatusChip dot tone="success">Aktif</StatusChip> : <StatusChip dot tone="neutral">Nonaktif</StatusChip>) : null}
            </div>
            <p className="text-body-medium text-on-surface-variant">{isNew ? "PIN 6 digit wajib diisi. User baru dapat langsung login." : subjudul}</p>
          </div>
          <IconButton size="sm" label="Tutup detail" onClick={close} disabled={saving}><X size={16} /></IconButton>
        </div>

        <PaneBody>
          <form id="form-akun" onSubmit={(event) => { event.preventDefault(); if (editable && !saveDisabled) void save(); }}>
            {error ? <p role="alert" className="mx-5 mt-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{error}</p> : null}

            {canManage ? (
              <DetailSection>
                <div className="flex flex-col gap-4">
                  <TextField
                    label="Username"
                    value={draft.username}
                    onChange={(event) => setDraft((current) => current && { ...current, username: event.target.value.toLowerCase() })}
                    placeholder="mis. ratna.booth3"
                    autoComplete="off"
                  />
                  <SelectField
                    label="Peran"
                    value={draft.role}
                    onChange={(event) => setDraft((current) => current && { ...current, role: event.target.value as Role })}
                  >
                    <option value="booth">Admin Booth</option>
                    <option value="cashier">Kasir</option>
                    <option value="scanner">Petugas scan</option>
                    <option value="admin">Panitia / Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </SelectField>
                  {draft.role === "booth" ? (
                    <SelectField
                      label="Booth"
                      value={draft.booth_id ?? ""}
                      onChange={(event) => setDraft((current) => current && { ...current, booth_id: event.target.value ? Number(event.target.value) : null })}
                    >
                      <option value="">Pilih booth</option>
                      {booths.map((booth) => <option key={booth.id} value={booth.id}>{booth.code} · {booth.name}</option>)}
                    </SelectField>
                  ) : null}
                  <Switch checked={draft.is_active} onChange={(is_active) => setDraft((current) => current && { ...current, is_active })} label="Akun aktif" description="Akun nonaktif tidak bisa login." />
                </div>
              </DetailSection>
            ) : (
              <DetailSection>
                <dl className="flex flex-col gap-2.5">
                  <KeyValue label="Peran">{ROLE_LABEL[draft.role]}</KeyValue>
                  <KeyValue label="Booth">{boothLabel(draft.booth_id) ?? <span className="text-on-surface-variant">Tidak ada</span>}</KeyValue>
                  <KeyValue label="Status">{draft.is_active ? "Aktif" : "Nonaktif"}</KeyValue>
                </dl>
              </DetailSection>
            )}

            {editable ? (
              <DetailSection>
                <TextField
                  label={canManage ? "PIN 6 digit" : "PIN baru, 6 digit"}
                  hint={isNew ? "Wajib diisi untuk akun baru." : canManage ? "Kosongkan bila tidak diubah." : "Isi PIN baru, lalu tekan Reset PIN."}
                  value={draft.pin}
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={6}
                  onChange={(event) => setDraft((current) => current && { ...current, pin: event.target.value.replace(/\D/g, "").slice(0, 6) })}
                  placeholder="••••••"
                  inputClassName="tabular-nums"
                />
              </DetailSection>
            ) : (
              <DetailSection>
                <p className="text-body-medium text-on-surface-variant">Akun {ROLE_LABEL[draft.role]} hanya dapat diubah super admin, termasuk PIN-nya.</p>
              </DetailSection>
            )}

            <DetailSection title={`Yang bisa dilakukan ${ROLE_LABEL[draft.role]}`}>
              <ul className="flex flex-col gap-1.5 text-body-medium">
                {rolePermissions[draft.role].map((perm) => (
                  <li key={perm} className="flex items-start gap-2"><Check size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />{perm}</li>
                ))}
              </ul>
            </DetailSection>
          </form>
        </PaneBody>

        {editable ? (
          <PaneFooter>
            <Button type="button" variant="outlined" size="sm" disabled={saving} onClick={close}>Batal</Button>
            {/* Mode reset PIN wajib mengisi PIN: PATCH tanpa perubahan apa pun tidak
                ada gunanya dan akan ditolak server sebagai VALIDATION_ERROR. */}
            <Button type="submit" form="form-akun" size="sm" loading={saving} disabled={saveDisabled}>
              {canManage ? (isNew ? "Buat user" : "Simpan perubahan") : "Reset PIN"}
            </Button>
          </PaneFooter>
        ) : null}
      </Pane>
    );
  }

  return (
    <>
      <WorkspaceHeader
        meta={
          <>
            <span className="tabular-nums">{loading ? "Memuat akun" : `${users.length} akun`}</span>
            <MetaSeparator />
            <span>Peran menentukan izin di server</span>
          </>
        }
        actions={canManage ? (
          <Button variant={draft ? "outlined" : "filled"} onClick={startNew} icon={<Plus size={16} weight="bold" />}>Tambah user</Button>
        ) : undefined}
      />

      {loadError && users.length > 0 ? (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{loadError}</p>
      ) : null}

      <Tabs<RoleTab>
        label="Saring akun per peran"
        idPrefix="akun"
        value={roleTab}
        onChange={setRoleTab}
        options={ROLE_TABS.map((tab) => ({ value: tab.value, label: tab.label, badge: loading ? undefined : saring(tab.roles).length }))}
      />

      <div role="tabpanel" id={`akun-panel-${roleTab}`} aria-labelledby={`akun-tab-${roleTab}`} className="flex min-h-0 flex-1 flex-col">
        <ListDetail list={list} detail={detail} detailWidth={420} />
      </div>
    </>
  );
}
