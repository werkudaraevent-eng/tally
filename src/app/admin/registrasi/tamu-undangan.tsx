"use client";

import { ArrowsClockwise, CheckCircle, Copy, DownloadSimple, EnvelopeSimple, PencilSimple, Trash, Tray, UploadSimple, WarningCircle, X, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Banner, Button, Dialog, EmptyState, FilterChip, IconButton, PageLoading, SegmentedButton, StatusChip, Table, TableBody, TableCell, TableHead, TableHeaderCell,
  TableRow, TextField,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import { cx } from "@/lib/m3/cx";
import { MenuBlok } from "@/app/admin/landing/menu-blok";
import { eventApiPath } from "@/lib/event-url";
import { withEventPrefix } from "@/lib/event-path";
import { plural } from "@/lib/plural";
import {
  IMPOR, INVITE_FILTER_LABEL, INVITE_STATUS_LABEL, INVITE_STATUS_TONE, TAMU,
  type InviteFilter, type InviteStatus,
} from "@/lib/pesan/label";

/**
 * Tab Tamu undangan di Pendaftaran: daftar orang yang diundang tapi belum
 * mendaftar. Tabel penuh, bukan daftar dengan panel detail, karena kerjanya
 * massal (saring, centang, kirim). Rincian per tamu ada di menu baris.
 */

export type Tamu = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  title: string | null;
  phone: string | null;
  status: InviteStatus;
  failed_reason: string | null;
  opted_out: boolean;
  email_invalid: boolean;
  registration_id: string | null;
  registration_status: "pending" | "approved" | "rejected" | null;
  is_test: boolean;
};

type Jawaban = {
  ready: boolean;
  items: Tamu[];
  counts: Record<InviteFilter, number> | null;
  link_ready: boolean;
  sending: { ready: boolean; missing: string[] };
};

const FILTER: InviteFilter[] = ["semua", "belum_dikirim", "belum_daftar", "sudah_daftar", "gagal"];

function cocok(filter: InviteFilter, t: Tamu) {
  if (filter === "semua") return true;
  if (filter === "belum_daftar") return t.status === "terkirim" || t.status === "membuka";
  if (filter === "gagal") return t.status === "gagal";
  return t.status === filter;
}

export function TamuUndangan({
  reloadKey,
  onCount,
  onLihatPendaftaran,
}: {
  reloadKey: number;
  onCount: (jumlah: number) => void;
  onLihatPendaftaran: (status: "pending" | "approved" | "rejected", registrationId: string) => void;
}) {
  const [data, setData] = useState<Jawaban | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<InviteFilter>("semua");
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [ubah, setUbah] = useState<Tamu | null>(null);
  const [hapus, setHapus] = useState<Tamu | null>(null);
  const [tautanBaru, setTautanBaru] = useState<Tamu | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();

  const load = useCallback(async () => {
    const jawab = await fetch(eventApiPath("/api/admin/undangan"), { cache: "no-store" }).catch(() => null);
    const body = await jawab?.json().catch(() => null);
    if (!jawab?.ok || !body) {
      setError(body?.error?.message ?? "Couldn't load the invited guest list.");
      return;
    }
    setError("");
    setData(body as Jawaban);
    onCount((body as Jawaban).items.length);
  }, [onCount]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, reloadKey]);

  const items = useMemo(() => (data?.items ?? []).filter((t) => cocok(filter, t)), [data, filter]);
  const terpilih = [...pilih].filter((id) => items.some((t) => t.id === id));

  async function salinTautan(t: Tamu, baru = false) {
    setBusy(true);
    const jawab = await fetch(eventApiPath(`/api/admin/undangan/${t.id}/tautan`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baru }),
    }).catch(() => null);
    setBusy(false);
    const body = await jawab?.json().catch(() => null);
    if (!jawab?.ok || !body?.url) {
      toast.error("Couldn't create the link", body?.error?.details?.message ?? body?.error?.message ?? "Try again.");
      return;
    }
    await navigator.clipboard.writeText(body.url).catch(() => undefined);
    toast.success(baru ? "New link copied" : TAMU.linkCopied, baru ? "The old link no longer works." : "Send it by WhatsApp or from your own email.");
    if (baru) void load();
  }

  async function simpanUbah(form: FormData) {
    if (!ubah) return;
    setBusy(true);
    const jawab = await fetch(eventApiPath(`/api/admin/undangan/${ubah.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? "") || null,
        company: String(form.get("company") ?? "") || null,
        title: String(form.get("title") ?? "") || null,
        phone: String(form.get("phone") ?? "") || null,
      }),
    }).catch(() => null);
    setBusy(false);
    const body = await jawab?.json().catch(() => null);
    if (!jawab?.ok) {
      const d = body?.error?.details;
      toast.error("Couldn't save changes", d?.email ?? d?.message ?? body?.error?.message ?? "Try again.");
      return;
    }
    setUbah(null);
    toast.success("Changes saved", ubah.name);
    void load();
  }

  async function jalankanHapus() {
    if (!hapus) return;
    setBusy(true);
    const jawab = await fetch(eventApiPath(`/api/admin/undangan/${hapus.id}`), { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!jawab?.ok) {
      toast.error("Couldn't delete", "Try again.");
      return;
    }
    toast.success("Removed", hapus.name);
    setHapus(null);
    void load();
  }

  /** Buka penyusun Pesan peserta dengan penerima tamu sudah terisi. */
  async function bukaPenyusun(jenis: "belum_dikirim" | "belum_daftar" | "manual") {
    setBusy(true);
    const jawab = await fetch(eventApiPath("/api/admin/pesan"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "invitation",
        audience: { jenis, perusahaan: [], ids: jenis === "manual" ? terpilih : [], ...(jenis === "manual" ? { label: `${plural(terpilih.length, "invited guest")} selected` } : {}) },
      }),
    }).catch(() => null);
    setBusy(false);
    const body = await jawab?.json().catch(() => null);
    if (!jawab?.ok || !body?.id) {
      toast.error("Couldn't create the blast", body?.error?.message ?? "Try again.");
      return;
    }
    router.push(withEventPrefix(`/admin/pengumuman/kiriman/${body.id}`, window.location.pathname));
  }

  if (error) return <Banner tone="error" icon={<XCircle size={18} />}>{error}</Banner>;
  if (!data) return <PageLoading />;
  if (!data.ready) return <Banner tone="warning">Invited guests are not available yet: the database migration has not been run.</Banner>;

  const semuaDicentang = items.length > 0 && items.every((t) => pilih.has(t.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!data.sending.ready ? (
        <Banner tone="info" icon={<EnvelopeSimple size={18} />}>
          Sending invitations by email is locked until a separate invitation sender is set up ({data.sending.missing.join(", ")}). Until then, use Copy private link.
        </Banner>
      ) : null}
      <div className="flex shrink-0 flex-wrap items-center gap-2 py-3">
        {FILTER.map((f) => (
          <FilterChip key={f} selected={filter === f} onClick={() => setFilter(f)}>
            {INVITE_FILTER_LABEL[f]} <span className="tabular-nums">{data.counts?.[f] ?? 0}</span>
          </FilterChip>
        ))}
        <span className="flex-1" />
        <Button variant="outlined" disabled={busy || !data.sending.ready} onClick={() => void bukaPenyusun("belum_daftar")}>{TAMU.remind}</Button>
        <Button disabled={busy || !data.sending.ready} onClick={() => void bukaPenyusun(terpilih.length ? "manual" : "belum_dikirim")}>
          {terpilih.length ? TAMU.sendInviteSelected(terpilih.length) : TAMU.sendInvite}
        </Button>
      </div>

      {data.items.length === 0 ? (
        <EmptyState plain icon={<Tray size={40} />} title={TAMU.empty} description={TAMU.emptyHint} />
      ) : (
        // relative: teks sr-only di sel terakhir ikut terpotong wadah gulir, tidak melebarkan halaman di HP.
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <Table minWidth="880px">
            <TableHead>
              <tr>
                <TableHeaderCell className="w-12">
                  <input
                    type="checkbox"
                    aria-label="Select all shown"
                    checked={semuaDicentang}
                    onChange={(e) => setPilih(e.target.checked ? new Set(items.map((t) => t.id)) : new Set())}
                    className="size-4 accent-[var(--color-primary)]"
                  />
                </TableHeaderCell>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Details</TableHeaderCell>
                <TableHeaderCell className="w-14"><span className="sr-only">Menu</span></TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {items.map((t) => {
                const sub = [t.company, t.title].filter(Boolean).join(" · ");
                return (
                  <TableRow key={t.id} interactive muted={t.status === "ditolak"}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${t.name}`}
                        checked={pilih.has(t.id)}
                        onChange={(e) => setPilih((lama) => {
                          const baru = new Set(lama);
                          if (e.target.checked) baru.add(t.id);
                          else baru.delete(t.id);
                          return baru;
                        })}
                        className="size-4 accent-[var(--color-primary)]"
                      />
                    </TableCell>
                    <TableCell>
                      <span className="block font-medium text-on-surface">{t.name}{t.is_test ? <span className="ml-2 text-label-medium text-on-surface-variant">test</span> : null}</span>
                      {sub ? <span className="block text-on-surface-variant">{sub}</span> : null}
                    </TableCell>
                    <TableCell className="break-all">
                      {t.email ?? (
                        <button type="button" disabled={busy} onClick={() => void salinTautan(t)} className="inline-flex items-center gap-1.5 rounded-sm font-medium text-primary hover:underline">
                          <Copy size={14} aria-hidden />{TAMU.copyLink}
                        </button>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusChip tone={INVITE_STATUS_TONE[t.status]}>{INVITE_STATUS_LABEL[t.status]}</StatusChip>
                    </TableCell>
                    <TableCell className="text-on-surface-variant">
                      <Keterangan t={t} onLihat={onLihatPendaftaran} />
                    </TableCell>
                    <TableCell align="end">
                      <MenuBlok
                        label={`Menu ${t.name}`}
                        items={[
                          { label: TAMU.edit, icon: <PencilSimple size={18} />, onSelect: () => setUbah(t), disabled: Boolean(t.registration_id && t.status !== "ditolak") },
                          { label: TAMU.copyLink, icon: <Copy size={18} />, onSelect: () => void salinTautan(t), disabled: t.status === "sudah_daftar" || t.status === "ditolak" || !data.link_ready },
                          { label: TAMU.newLink, icon: <ArrowsClockwise size={18} />, onSelect: () => setTautanBaru(t), disabled: t.status === "sudah_daftar" || !data.link_ready },
                          { label: TAMU.remove, icon: <Trash size={18} />, onSelect: () => setHapus(t), bahaya: true },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={ubah !== null}
        onClose={() => setUbah(null)}
        dismissible={!busy}
        title={`${TAMU.edit}: ${ubah?.name ?? ""}`}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setUbah(null)}>Cancel</Button>
            <Button simpan type="submit" form="form-ubah-tamu" loading={busy}>Save changes</Button>
          </>
        }
      >
        {ubah ? (
          <form id="form-ubah-tamu" className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void simpanUbah(new FormData(e.currentTarget)); }}>
            <TextField name="name" label="Name" required maxLength={120} defaultValue={ubah.name} />
            <TextField name="email" label="Email" optional type="email" maxLength={160} defaultValue={ubah.email ?? ""} hint="Changing the email clears the unsubscribe or bounce flag of the old address." />
            <TextField name="company" label="Organisation" optional maxLength={160} defaultValue={ubah.company ?? ""} />
            <TextField name="title" label="Job title" optional maxLength={160} defaultValue={ubah.title ?? ""} />
            <TextField name="phone" label="Mobile number" optional maxLength={30} defaultValue={ubah.phone ?? ""} />
          </form>
        ) : null}
      </Dialog>

      <Dialog
        open={tautanBaru !== null}
        onClose={() => setTautanBaru(null)}
        dismissible={!busy}
        title={`${TAMU.newLink} for ${tautanBaru?.name ?? ""}?`}
        description={tautanBaru?.status === "ditolak" ? "This invited guest's registration was rejected. A new link reopens it so they can register again." : TAMU.newLinkConfirm}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setTautanBaru(null)}>Cancel</Button>
            <Button loading={busy} onClick={() => { const t = tautanBaru; setTautanBaru(null); if (t) void salinTautan(t, true); }}>Create and copy</Button>
          </>
        }
      />

      <Dialog
        open={hapus !== null}
        onClose={() => setHapus(null)}
        dismissible={!busy}
        tone="danger"
        title={hapus ? TAMU.removeConfirm(hapus.name) : ""}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setHapus(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={busy} onClick={() => void jalankanHapus()}>{TAMU.remove}</Button>
          </>
        }
      />
    </div>
  );
}

function Keterangan({ t, onLihat }: { t: Tamu; onLihat: (status: "pending" | "approved" | "rejected", id: string) => void }) {
  if ((t.status === "sudah_daftar" || t.status === "ditolak") && t.registration_id && t.registration_status) {
    return (
      <button type="button" onClick={() => onLihat(t.registration_status!, t.registration_id!)} className="rounded-sm font-medium text-primary hover:underline">
        {TAMU.viewRegistration}
      </button>
    );
  }
  if (t.status === "gagal") return <>{t.failed_reason ?? "Failed to send"}</>;
  if (t.opted_out) return <>Unsubscribed from emails</>;
  if (t.email_invalid) return <>Email bounced before</>;
  if (!t.email) return <>{TAMU.noEmail}</>;
  if (t.status === "membuka") return <>{TAMU.approx}</>;
  return null;
}

type Pratinjau = {
  rows: number;
  inserted: number;
  with_email: number;
  merged: number;
  already_participant: number;
  without_email: number;
  suppressed: number;
  possible_duplicates: number;
  rejected: number;
  rejected_rows: { row: number; name: string; email: string; reason: string }[];
  recognized_columns: string[];
  file_name: string;
  test: boolean;
};

/** Dialog Tambah tamu: ketik satu per satu, atau impor dari Excel. Layar penuh di HP. */
export function TambahTamu({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [cara, setCara] = useState<"ketik" | "impor">("ketik");
  const [sibuk, setSibuk] = useState(false);
  const [berubah, setBerubah] = useState(false);

  function tutup() {
    if (sibuk) return;
    if (berubah) onDone();
    setBerubah(false);
    setCara("ketik");
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={tutup}
      dismissible={!sibuk}
      bare
      size="lg"
      title={TAMU.addTitle}
      // M3: formulir di layar sempit memakai dialog layar penuh.
      className="flex flex-col max-sm:fixed max-sm:inset-0 max-sm:max-h-none max-sm:max-w-none max-sm:rounded-none"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-outline-variant px-2 py-2 sm:px-4">
        <IconButton label="Close" onClick={tutup} disabled={sibuk}><X size={20} /></IconButton>
        <h2 className="min-w-0 flex-1 truncate text-title-large font-semibold">{TAMU.addTitle}</h2>
      </div>
      <div className="shrink-0 px-6 pt-4">
        <SegmentedButton<"ketik" | "impor">
          label="How to add"
          value={cara}
          className="w-full [&>*]:flex-1"
          options={[
            { value: "ketik", label: TAMU.addManual, disabled: sibuk },
            { value: "impor", label: TAMU.addImport, disabled: sibuk },
          ]}
          onChange={setCara}
        />
      </div>
      {/* Keduanya tetap terpasang: berpindah cara tidak menghapus yang sudah diketik. */}
      <KetikTamu
        hidden={cara !== "ketik"}
        sibuk={sibuk}
        setSibuk={setSibuk}
        onCancel={tutup}
        onSaved={(lanjut) => {
          if (lanjut) setBerubah(true);
          else { setBerubah(false); setCara("ketik"); onDone(); onClose(); }
        }}
      />
      <ImporBerkas
        hidden={cara !== "impor"}
        sibuk={sibuk}
        setSibuk={setSibuk}
        onCancel={tutup}
        onDone={() => { setBerubah(false); setCara("ketik"); onDone(); onClose(); }}
      />
    </Dialog>
  );
}

const KOSONG = { name: "", email: "", company: "", title: "", phone: "" };

type Galat = { name?: string; email?: string; phone?: string; attest?: string; umum?: string };

function KetikTamu({ hidden, sibuk, setSibuk, onSaved, onCancel }: {
  hidden: boolean;
  sibuk: boolean;
  setSibuk: (v: boolean) => void;
  onSaved: (lanjut: boolean) => void;
  onCancel: () => void;
}) {
  const [isi, setIsi] = useState(KOSONG);
  const [setuju, setSetuju] = useState(false);
  const [galat, setGalat] = useState<Galat>({});
  // Kabar hasil simpan di DALAM dialog (role=status): snackbar global menutupi
  // tombol di HP dan berada di luar dialog modal, jadi tidak selalu dibacakan.
  const [kabar, setKabar] = useState<{ tone: "success" | "warning"; text: string } | null>(null);
  // Kolom yang difokuskan begitu form aktif lagi (selama menyimpan, kolom nonaktif).
  const fokus = useRef<"name" | "email" | "phone" | null>(null);
  // TextField tidak meneruskan ref; kolom dicari lewat pembungkusnya.
  const wadah = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (!fokus.current || sibuk || hidden) return;
    wadah.current?.querySelector<HTMLInputElement>(`input[data-kolom="${fokus.current}"]`)?.focus();
    fokus.current = null;
  });
  function setFokus(kolom: "name" | "email" | "phone") {
    fokus.current = kolom;
    if (!sibuk) wadah.current?.querySelector<HTMLInputElement>(`input[data-kolom="${kolom}"]`)?.focus();
  }

  const ubah = (k: keyof typeof KOSONG) => (e: React.ChangeEvent<HTMLInputElement>) => setIsi((v) => ({ ...v, [k]: e.target.value }));

  async function simpan(lanjut: boolean) {
    setKabar(null);
    if (!isi.name.trim()) {
      setGalat({ name: "Name is required." });
      setFokus("name");
      return;
    }
    if (!setuju) {
      setGalat({ attest: "Tick this statement first." });
      return;
    }
    setSibuk(true);
    setGalat({});
    const jawab = await fetch(eventApiPath("/api/admin/undangan/tambah"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...isi, attested: true }),
    }).catch(() => null);
    setSibuk(false);
    const body = await jawab?.json().catch(() => null);
    if (!jawab?.ok || !body) {
      const pesan = body?.error?.details?.message ?? body?.error?.message ?? "The invited guest was not saved. Try again.";
      const kolom = body?.error?.details?.field;
      if (kolom === "email" || kolom === "phone") {
        setGalat({ [kolom]: pesan });
        setFokus(kolom);
      } else setGalat({ umum: pesan });
      return;
    }
    const n = isi.name.trim();
    if (body.status === "sudah_peserta") {
      setGalat({ email: `${n} is already a participant or is registering for this event, so there is no need to invite them.` });
      setFokus("email");
      return;
    }
    const teks =
      body.status === "digabung"
        ? `${n} is already on the invited guest list. Empty fields were filled in.`
        : body.possible_duplicate
          ? `${n} was added, but an invited guest with the same name and no email already exists. Check the Invited guests tab and delete one of them.`
          : body.suppressed
            ? `${n} was added. This address unsubscribed or bounced before, so it will not receive emails.`
            : `${n} was added. No email has been sent yet.`;
    const peringatan = body.status === "digabung" || body.possible_duplicate || body.suppressed;
    setIsi(KOSONG);
    // Peringatan harus terbaca: dialog tetap terbuka walau yang ditekan Simpan.
    if (lanjut || peringatan) {
      setKabar({ tone: peringatan ? "warning" : "success", text: teks });
      setFokus("name");
      onSaved(true);
      return;
    }
    toast.success(`${n} added`, "No email has been sent yet.");
    onSaved(false);
  }

  return (
    <form
      hidden={hidden}
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => { e.preventDefault(); void simpan(false); }}
      noValidate
    >
      <div ref={wadah} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6 pt-4 text-body-medium">
        <p role="status" className={cx("empty:hidden", kabar && "flex items-start gap-2 rounded-md p-3", kabar?.tone === "warning" ? "bg-warning-soft text-on-surface" : kabar ? "bg-success-soft text-on-surface" : "")}>
          {kabar ? <>{kabar.tone === "warning" ? <WarningCircle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden /> : <CheckCircle size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />}{kabar.text}</> : null}
        </p>
        <TextField data-kolom="name" autoFocus label="Name" required autoComplete="off" maxLength={120} value={isi.name} onChange={ubah("name")} error={galat.name} disabled={sibuk} />
        <TextField data-kolom="email" label="Email" optional type="email" inputMode="email" autoComplete="off" maxLength={254} value={isi.email} onChange={ubah("email")} error={galat.email} hint="Without an email, you can only invite them with Copy private link." disabled={sibuk} />
        <TextField label="Organisation" optional maxLength={160} value={isi.company} onChange={ubah("company")} disabled={sibuk} />
        <TextField label="Job title" optional maxLength={160} value={isi.title} onChange={ubah("title")} disabled={sibuk} />
        <TextField data-kolom="phone" label="Mobile number" optional type="tel" inputMode="tel" autoComplete="off" maxLength={30} value={isi.phone} onChange={ubah("phone")} error={galat.phone} disabled={sibuk} />
        <div>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={setuju}
              onChange={(e) => { setSetuju(e.target.checked); setGalat((g) => ({ ...g, attest: undefined })); }}
              aria-invalid={galat.attest ? true : undefined}
              aria-describedby={galat.attest ? "tambah-tamu-attest" : undefined}
              className="mt-1 size-4 shrink-0 accent-[var(--color-primary)]"
            />
            <span>{TAMU.addAttest}</span>
          </label>
          {galat.attest ? <p id="tambah-tamu-attest" className="ms-7 mt-1 text-body-small text-error">{galat.attest}</p> : null}
        </div>
        {galat.umum ? <p role="alert" className="flex items-start gap-2 rounded-md bg-error-soft p-3 text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{galat.umum}</p> : null}
        <p className="text-on-surface-variant">{TAMU.addNoSend}</p>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-outline-variant px-6 py-4">
        <Button type="button" variant="text" className="me-auto max-sm:hidden" disabled={sibuk} onClick={onCancel}>Cancel</Button>
        <Button type="button" variant="outlined" disabled={sibuk} onClick={() => void simpan(true)}>{TAMU.addAnother}</Button>
        <Button type="submit" simpan loading={sibuk}>Save</Button>
      </div>
    </form>
  );
}

function ImporBerkas({ hidden, sibuk: jalan, setSibuk: setJalan, onDone, onCancel }: {
  hidden: boolean;
  sibuk: boolean;
  setSibuk: (v: boolean) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [berkas, setBerkas] = useState<File | null>(null);
  const [pratinjau, setPratinjau] = useState<Pratinjau | null>(null);
  const [setuju, setSetuju] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();


  async function jalankan(coba: boolean) {
    if (!berkas) return;
    setJalan(true);
    setError("");
    const form = new FormData();
    form.append("file", berkas);
    form.append("dry_run", coba ? "true" : "false");
    form.append("attested", setuju ? "true" : "false");
    const jawab = await fetch(eventApiPath("/api/admin/undangan/impor"), { method: "POST", body: form, signal: AbortSignal.timeout(120000) }).catch(() => null);
    setJalan(false);
    const body = await jawab?.json().catch(() => null);
    if (!jawab?.ok || !body) {
      setError(body?.error?.details?.message ?? body?.error?.message ?? "Import failed.");
      return;
    }
    if (coba) {
      setPratinjau(body as Pratinjau);
      return;
    }
    toast.success("Invited guests added", `${plural(body.inserted, "new invited guest")}, ${body.merged.toLocaleString("en-GB")} merged. No email has been sent yet.`);
    onDone();
  }

  function unduhDitolak() {
    if (!pratinjau) return;
    const sel = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [["Row", "Name", "Email", "Reason"], ...pratinjau.rejected_rows.map((r) => [r.row, r.name, r.email, r.reason])]
      .map((baris) => baris.map(sel).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "rejected-invited-guests.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const p = pratinjau;
  return (
    <div hidden={hidden} className="min-h-0 flex-1 flex-col [&:not([hidden])]:flex">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6 pt-4 text-body-medium">
        <div className="rounded-lg bg-surface-container-highest p-4">
          <p className="font-medium">1. Download the template</p>
          <p className="mt-1 text-on-surface-variant">Columns: Name (required), Email, Organisation, Job title, Mobile number. It has 2 sample rows to overwrite.</p>
          <Button
            variant="text"
            size="sm"
            className="-ms-3 mt-2"
            icon={<DownloadSimple size={16} />}
            onClick={() => { window.location.href = eventApiPath("/api/admin/undangan/templat"); }}
          >
            Download .xlsx template
          </Button>
        </div>
        <div>
          <p className="font-medium">2. Choose a file</p>
          <label
            className={cx(
              "m3-state mt-2 flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-outline px-4 text-center focus-within:ring-2 focus-within:ring-primary",
              jalan && "pointer-events-none opacity-60",
            )}
          >
            <span className="flex max-w-full items-center gap-2 font-medium">
              <UploadSimple size={16} className="shrink-0" aria-hidden />
              <span className="truncate">{berkas ? berkas.name : "Choose an .xlsx or .csv file"}</span>
            </span>
            <span className="text-body-small text-on-surface-variant">Up to 5,000 rows</span>
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={jalan}
              onChange={(e) => {
                setBerkas(e.target.files?.[0] ?? null);
                setPratinjau(null);
                // Dikosongkan supaya memilih berkas yang sama lagi tetap terbaca.
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {error ? <p role="alert" className="flex items-start gap-2 rounded-md bg-error-soft p-3 text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{error}</p> : null}
        {p ? (
          <div className="rounded-lg border border-outline-variant p-4">
            <p className="font-medium">{p.file_name}, {plural(p.rows, "row")} read{p.test ? " (test site: marked as test)" : ""}</p>
            <ul className="mt-2 space-y-0.5">
              <li><span className="font-medium tabular-nums">{p.with_email}</span> {IMPOR.willAdd}</li>
              <li><span className="font-medium tabular-nums">{p.without_email}</span> {IMPOR.withoutEmail}</li>
              <li><span className="font-medium tabular-nums">{p.merged}</span> {IMPOR.merged}</li>
              <li><span className="font-medium tabular-nums">{p.already_participant}</span> {IMPOR.alreadyParticipant}</li>
              {p.suppressed ? <li><span className="font-medium tabular-nums">{p.suppressed}</span> {IMPOR.suppressed}</li> : null}
              {p.possible_duplicates ? <li className="text-warning"><span className="font-medium tabular-nums">{p.possible_duplicates}</span> {IMPOR.possibleDuplicates}</li> : null}
              <li>
                <span className="font-medium tabular-nums text-error">{p.rejected}</span> {IMPOR.rejected}
                {p.rejected ? (
                  <button type="button" onClick={unduhDitolak} className="ml-2 inline-flex items-center gap-1 rounded-sm font-medium text-primary hover:underline">
                    <DownloadSimple size={14} aria-hidden />{IMPOR.downloadRejected}
                  </button>
                ) : null}
              </li>
            </ul>
          </div>
        ) : null}
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={setuju} onChange={(e) => setSetuju(e.target.checked)} className="mt-1 size-4 shrink-0 accent-[var(--color-primary)]" />
          <span>{IMPOR.attest}</span>
        </label>
        <p className="text-on-surface-variant">{IMPOR.noSend} {IMPOR.retention}</p>
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-outline-variant px-6 py-4">
        <Button variant="text" className="me-auto max-sm:hidden" disabled={jalan} onClick={onCancel}>Cancel</Button>
        {p ? (
          <Button simpan loading={jalan} disabled={!setuju || p.inserted + p.merged === 0} onClick={() => void jalankan(false)}>
            {IMPOR.commit} {plural(p.inserted, "invited guest")}
          </Button>
        ) : (
          <Button loading={jalan} disabled={!berkas} onClick={() => void jalankan(true)}>Check file</Button>
        )}
      </div>
    </div>
  );
}
