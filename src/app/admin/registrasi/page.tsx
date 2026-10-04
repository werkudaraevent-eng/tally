"use client";

import { pesanGalatApi } from "@/lib/api-message";
import { ArrowLeft, Check, EnvelopeSimple, Hourglass, PaperPlaneTilt, PencilSimple, Plus, Tray, WarningCircle, X, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { withEventPrefix } from "@/lib/event-path";
import { useToast } from "@/components/toast";
import {
  Banner, Button, DetailSection, Dialog, EmptyState, IconButton, KeyValue, ListDetail, ListRow, MetaSeparator, PageLoading,
  Pane, PaneBody, PaneFooter, SegmentedButton, StatusChip, StatusDot, SupportingPane, Switch, Tabs, TextField, WorkspaceHeader, WorkspacePage,
  type ChipTone,
} from "@/components/m3";
import { RegistrationFormBuilder } from "@/components/admin/registration-form-builder";
import { AKSES, TAMU } from "@/lib/pesan/label";
import { TambahTamu, TamuUndangan } from "./tamu-undangan";
import { FormPreview } from "@/components/admin/form-preview";
import Link from "@/components/event-link";
import { CHOICE_FIELD_TYPES, type RegistrationFormConfig } from "@/lib/domain";
import { validateFieldDefinitions } from "@/lib/registration-fields";
import { plural } from "@/lib/plural";
import { eventApiPath } from "@/lib/event-url";
import type { EventTimeZone } from "@/lib/timezone";
import { useEventTimeZone } from "@/lib/use-event-timezone";

type Row = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string | null;
  job_title: string | null;
  extra: Record<string, string>;
  status: "pending" | "approved" | "rejected";
  reject_reason: string | null;
  created_at: string;
  participant_id: string | null;
  qr_code: string | null;
  email_sent_at: string | null;
  email_error: string | null;
  email_attempts: number;
};

type EventConfig = {
  registration_enabled: boolean;
  registration_auto_approve: boolean;
  participant_source: string;
  slug: string;
  name?: string;
  registration_form_config: RegistrationFormConfig;
  /** Warna halaman pendaftaran, sudah memperhitungkan saklar di CMS halaman acara. */
  form_theme_seed: string;
  /** Ringkasan Tema halaman acara yang dipakai formulir. */
  tampilan?: { v2: boolean; logo: boolean; kv: string | null; huruf: string | null; area_peserta: boolean };
  /** Email konfirmasi (Pesan peserta > Email otomatis). Preset null = templat bawaan dari Tema. */
  email_konfirmasi?: { preset: string | null; kirim_ditolak: boolean };
  /** Tamu undangan. Null = migrasi 202610040007 belum dijalankan. */
  undangan?: { access: "terbuka" | "undangan"; auto_approve: boolean; count: number } | null;
};

type Status = Row["status"];

const STATUS: Record<Status, { label: string; tone: ChipTone; kosong: string }> = {
  pending: { label: "Pending approval", tone: "warning", kosong: "No registrants pending approval" },
  approved: { label: "Approved", tone: "success", kosong: "No approved registrants yet" },
  rejected: { label: "Rejected", tone: "error", kosong: "No rejected registrants yet" },
};

/**
 * Tanggal dan jam untuk panitia, en-GB 24 jam di zona acara. Lokal di sini:
 * formatEventDateTime di lib/datetime.ts masih id-ID dan dipakai halaman publik.
 */
function formatWaktu(value: string | null | undefined, zone: EventTimeZone): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", { timeZone: zone, dateStyle: "medium", timeStyle: "short", hourCycle: "h23" });
}

/** Tab: tamu undangan, atau salah satu status pendaftaran. */
type Tab = Status | "tamu";

/** Moderasi pendaftar, atau penyunting susunan formulir. */
type Tampilan = "moderasi" | "formulir";

export default function RegistrasiAdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [config, setConfig] = useState<EventConfig | null>(null);
  const [pending, setPending] = useState(0);
  const [tab, setTab] = useState<Tab>("pending");
  const [imporOpen, setImporOpen] = useState(false);
  const [muatTamu, setMuatTamu] = useState(0);
  const [jumlahTamu, setJumlahTamu] = useState<number | null>(null);
  const [konfirmasiAkses, setKonfirmasiAkses] = useState(false);
  const [tampilan, setTampilan] = useState<Tampilan>("moderasi");
  const [pilihId, setPilihId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menolak, setMenolak] = useState<Row | null>(null);
  const [setelanOpen, setSetelanOpen] = useState(false);
  // Terpisah dari `busy`: `busy` global ikut mematikan tombol setujui/tolak dan
  // sakelar pendaftaran, padahal mengirim ulang email tidak menyentuh keduanya.
  const [mengirim, setMengirim] = useState<string | null>(null);
  const [emailAktif, setEmailAktif] = useState(false);
  // Susunan form disunting di state lokal, bukan disimpan pada setiap ketukan.
  // Menyimpan per karakter berarti satu PATCH per huruf, dan yang lebih buruk:
  // form setengah jadi ikut tayang di halaman publik saat itu juga.
  const [draftForm, setDraftForm] = useState<RegistrationFormConfig | null>(null);
  const [simpanForm, setSimpanForm] = useState(false);
  // Tujuan tautan "Ubah di Tema" / "Atur di Peserta" yang menunggu keputusan
  // atas susunan formulir yang belum disimpan.
  const [tujuanTertunda, setTujuanTertunda] = useState<string | null>(null);
  const router = useRouter();
  const { zone, abbr } = useEventTimeZone();
  const toast = useToast();

  const load = useCallback(async () => {
    // eventApiPath WAJIB di ketiga pemanggilan. `/api/...` absolut hanya membawa
    // slug lewat Referer, dan parameter yang ditambahkan proxy saat rewrite tidak
    // pernah sampai ke route handler -- permintaannya jatuh ke "event aktif
    // tunggal", yaitu event PRODUKSI, bukan event yang sedang dibuka.
    const response = await fetch(eventApiPath(`/api/admin/registrasi?status=${tab === "tamu" ? "pending" : tab}`), { cache: "no-store" }).catch(() => null);
    if (!response) { setError("Connection failed. Reload the page."); setLoading(false); return; }
    if (response.status === 401) { window.location.href = "/login"; return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error?.details?.message ?? body.error?.message ?? "Couldn't load registrations.");
    else { setRows(body.registrations ?? []); setTotal(body.total ?? 0); setConfig(body.event); setPending(body.pending ?? 0); setEmailAktif(body.email_configured === true); setError(""); }
    setLoading(false);
  }, [tab]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  // Susunan yang belum disimpan hanya hidup di state: menutup tab atau memuat
  // ulang tanpa peringatan membuangnya.
  useEffect(() => {
    if (!draftForm) return;
    const tahan = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", tahan);
    return () => window.removeEventListener("beforeunload", tahan);
  }, [draftForm]);

  function buka(href: string) {
    router.push(withEventPrefix(href, window.location.pathname));
  }

  function gantiTab(next: Tab) {
    setTab(next);
    if (next !== "tamu") setLoading(true);
    setPilihId(null);
  }

  /** Setelan tamu undangan (Terbuka untuk, Tamu undangan langsung disetujui). */
  async function simpanUndangan(next: { registration_access?: "terbuka" | "undangan"; invitation_auto_approve?: boolean }) {
    if (!config?.undangan) return;
    setBusy(true);
    const response = await fetch(eventApiPath("/api/admin/registrasi"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => null);
    setBusy(false);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      toast.error("Couldn't save", body?.error?.details?.message ?? body?.error?.message ?? "Try again.");
      return;
    }
    setConfig({
      ...config,
      undangan: {
        ...config.undangan,
        ...(next.registration_access ? { access: next.registration_access } : {}),
        ...(next.invitation_auto_approve !== undefined ? { auto_approve: next.invitation_auto_approve } : {}),
      },
    });
    toast.success("Saved", next.registration_access
      ? next.registration_access === "undangan" ? "Registration is limited to invited guests." : "Registration is open to anyone with the link."
      : next.invitation_auto_approve ? "Invited guests are approved automatically." : "Invited guests wait for review.");
  }

  async function simpanKonfigurasi(next: Partial<EventConfig>) {
    if (!config) return;
    setBusy(true);
    const response = await fetch(eventApiPath("/api/admin/registrasi"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // HANYA sakelar yang benar-benar diubah. Mengirim yang satunya lagi
      // "supaya lengkap" berarti mengirim nilai yang dibaca layar ini saat
      // dibuka, dan itu bisa sudah berumur satu jam.
      body: JSON.stringify(next.registration_enabled !== undefined
        ? { registration_enabled: next.registration_enabled }
        : { registration_auto_approve: next.registration_auto_approve }),
    }).catch(() => null);
    setBusy(false);
    if (!response) { toast.error("Connection failed", "Reload to see the current status."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Couldn't save", body.error?.details?.message ?? body.error?.message ?? "Try again.");
      return;
    }
    setConfig({ ...config, ...body });
    // Pesannya mengikuti sakelar yang DITEKAN, bukan keadaan pendaftaran. Sejak
    // PATCH ini hanya mengirim satu sakelar, mengabarkan "Pendaftaran ditutup"
    // setelah seseorang mengubah mode persetujuan adalah kabar tentang hal yang
    // tidak ia sentuh.
    toast.success(
      "Saved",
      next.registration_enabled !== undefined
        ? body.registration_enabled ? "Registration opened." : "Registration closed."
        : body.registration_auto_approve ? "New registrants are approved automatically." : "New registrants wait for review.",
    );
  }

  /**
   * Menyimpan susunan form.
   *
   * Warnanya TIDAK ikut dikirim: warna acara diatur di CMS halaman acara, satu
   * tempat untuk keduanya. Server mempertahankan tema yang sudah tersimpan
   * ketika permintaan ini tidak menyebutnya.
   */
  async function kirimForm(next: RegistrationFormConfig): Promise<boolean> {
    if (!config) return false;
    // Masalah yang sama dengan penanda "Perlu diperbaiki" di penyunting,
    // ditolak di sini supaya tidak ada yang terbuang diam-diam di jalan.
    const masalah = validateFieldDefinitions(next.fields ?? []);
    if (masalah.length) {
      toast.error("Can't save the form yet", masalah[0].message);
      return false;
    }
    setSimpanForm(true);
    const response = await fetch(eventApiPath("/api/admin/registrasi"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // Sakelar pendaftaran TIDAK ikut dikirim. Menyimpan susunan form bukan
      // pernyataan apa pun tentang pendaftaran dibuka atau tidak, dan nilai yang
      // dipegang layar ini bisa sudah didahului panitia lain.
      body: JSON.stringify({
        form: {
          // Penyunting menyimpan pilihan di semua jenis supaya berpindah
          // jenis bolak-balik tidak menghapusnya; baru di sini dibuang untuk
          // jenis yang tidak memakainya. Baris pilihan yang judul dan
          // keterangannya kosong dibuang bersama (indeksnya sejajar), supaya
          // baris yang baru ditambah lalu dibiarkan kosong tidak menggagalkan
          // Simpan.
          fields: (next.fields ?? []).map((field) => {
            if (!CHOICE_FIELD_TYPES.includes(field.type)) return { ...field, options: undefined, option_descriptions: undefined };
            if (!field.options) return field;
            const baris = field.options
              .map((option, i) => ({ option: option.trim(), keterangan: field.option_descriptions?.[i]?.trim() ?? "" }))
              .filter((b) => b.option);
            const keterangan = baris.map((b) => b.keterangan);
            return { ...field, options: baris.map((b) => b.option), option_descriptions: keterangan.some(Boolean) ? keterangan : undefined };
          }),
          welcome_text: next.welcome_text,
          success_text: next.success_text,
          // Email dan telepon IKUT dikirim. Sebelumnya hanya perusahaan dan
          // jabatan, sehingga saklar "Email wajib" dan "Nomor telepon wajib"
          // tampak berubah di layar tetapi tidak pernah tersimpan.
          require_email: next.require_email,
          require_phone: next.require_phone,
          require_company: next.require_company,
          require_job_title: next.require_job_title,
        },
      }),
    }).catch(() => null);
    setSimpanForm(false);
    if (!response) { toast.error("Connection failed", "Reload to see the current status."); return false; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Couldn't save the form", pesanGalatApi(body) ?? "Try again.");
      return false;
    }
    setConfig({ ...config, ...body });
    setDraftForm(null);
    toast.success("Form saved", "The public registration page now uses the new form.");
    return true;
  }

  /**
   * Membuka berkas unggahan pendaftar.
   *
   * Tautannya diminta saat ditekan, bukan disiapkan lebih dulu untuk seluruh
   * daftar: signed URL berumur lima menit, dan membuat puluhan sekaligus saat
   * halaman dimuat berarti hampir semuanya mati sebelum sempat dipakai.
   */
  async function bukaBerkas(uploadId: string) {
    const response = await fetch(eventApiPath(`/api/admin/registrasi/upload?id=${encodeURIComponent(uploadId)}`), { cache: "no-store" }).catch(() => null);
    const body = await response?.json().catch(() => null);
    if (!response?.ok || !body?.url) {
      toast.error("Couldn't open the file", body?.error?.details?.message ?? "Reload the page and try again.");
      return;
    }
    window.open(body.url, "_blank", "noopener,noreferrer");
  }

  async function review(row: Row, approve: boolean, reason?: string) {
    setBusy(true);
    const response = await fetch(eventApiPath("/api/admin/registrasi"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, approve, reason: reason ?? null }),
    }).catch(() => null);
    setBusy(false);
    if (!response) { toast.error("Connection failed", "Reload to see the current status."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Couldn't update the registration", body.error?.details?.message ?? body.error?.message ?? "Try again.");
      // Muat ulang: "sudah diproses admin lain" berarti daftar di layar sudah
      // basi, dan membiarkannya membuat admin menekan tombol yang sama lagi.
      void load();
      return;
    }
    setMenolak(null);
    setRows((current) => current.filter((entry) => entry.id !== row.id));
    setTotal((count) => Math.max(0, count - 1));
    setPending((count) => Math.max(0, count - 1));
    // Kode peserta tetap disebut lebih dulu, apa pun nasib emailnya. Panitia
    // sering membacakannya langsung ke orang yang berdiri di depan meja, dan
    // status pengiriman adalah keterangan kedua, bukan penggantinya.
    const email = (body.email ?? {}) as { state?: string; error?: string };
    toast.success(
      approve ? `${row.name} approved` : `${row.name} rejected`,
      approve
        ? `Participant code: ${body.qr_code}.${
            email.state === "sent" ? ` Email sent to ${row.email}.`
            : email.state === "failed" ? " The email was not sent. Read the code out, then try Resend code on the Approved tab."
            : ""
          }`
        : `No participant code was issued.${
            email.state === "sent" ? ` Rejection email sent to ${row.email}.`
            : email.state === "failed" ? " The rejection email was not sent."
            : ""
          }`,
    );
  }

  async function kirimUlang(row: Row) {
    setMengirim(row.id);
    const response = await fetch(eventApiPath("/api/admin/registrasi/resend"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id }),
    }).catch(() => null);
    setMengirim(null);
    if (!response) { toast.error("Connection failed", "Reload to see the current status."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Couldn't send the email", body.error?.details?.message ?? body.error?.message ?? "Try again.");
      // Baris di layar sekarang basi: email_error dan email_attempts sudah
      // berubah di database, dan membiarkannya membuat panitia membaca sebab
      // kegagalan yang lama.
      void load();
      return;
    }
    setRows((current) => current.map((entry) => (
      entry.id === row.id ? { ...entry, email_sent_at: new Date().toISOString(), email_error: null, email_attempts: entry.email_attempts + 1 } : entry
    )));
    toast.success("Email sent", `Participant code sent again to ${row.email}.`);
  }

  const tautan = config ? `/e/${config.slug}/daftar` : "";
  // Draf diturunkan, bukan disalin lewat useEffect. Menyalin state ke state lain
  // di dalam effect menambah satu render setiap kali data dimuat ulang, dan
  // pemuatan berkala akan menimpa suntingan yang sedang berjalan.
  const formDraft = draftForm ?? config?.registration_form_config ?? {};

  function salinTautan() {
    void navigator.clipboard.writeText(new URL(tautan, window.location.origin).toString());
    toast.success("Link copied", "Share it with prospective participants.");
  }

  // ---- Tampilan penyunting formulir ----------------------------------------
  if (tampilan === "formulir") {
    return (
      <div lang="en" className="contents">
      <WorkspacePage fill>
        <WorkspaceHeader
          title="Edit form"
          back={
            <button type="button" onClick={() => setTampilan("moderasi")} className="inline-flex items-center gap-1.5 rounded-sm text-body-medium font-medium text-primary hover:underline">
              <ArrowLeft size={14} aria-hidden />Registration
            </button>
          }
          meta={<span>What registrants are asked. The look follows the event page Theme.</span>}
        />
        {!config ? (
          error ? <Banner tone="error" icon={<XCircle size={18} />}>{error}</Banner> : <PageLoading />
        ) : (
          // Penyunting dan pratinjau bersebelahan: yang membuat pratinjau berguna
          // adalah melihat akibat suntingan tanpa memalingkan mata.
          <SupportingPane
            paneWidth={440}
            main={
              <Pane aria-label="Form editor">
                <PaneBody className="px-5 py-5">
                  <KartuTampilan
                    tampilan={config.tampilan}
                    seed={config.form_theme_seed}
                    // Ada draf: tanya dulu, jangan buang diam-diam.
                    onBuka={(href, event) => { if (draftForm) { event.preventDefault(); setTujuanTertunda(href); } }}
                  />
                  <RegistrationFormBuilder config={formDraft} onChange={setDraftForm} disabled={simpanForm} areaPeserta={config.tampilan?.area_peserta ?? false} />
                </PaneBody>
                <PaneFooter note={draftForm ? "Unsaved changes" : "Matches the live registration page"}>
                  <Button simpan size="sm" onClick={() => void kirimForm(formDraft)} loading={simpanForm} disabled={busy} icon={<Check size={16} weight="bold" />}>
                    Save form
                  </Button>
                </PaneFooter>
              </Pane>
            }
            pane={
              <Pane as="aside" aria-label="Form preview">
                <FormPreview slug={config.slug} form={formDraft} />
              </Pane>
            }
          />
        )}
        <Dialog
          open={tujuanTertunda !== null}
          onClose={() => setTujuanTertunda(null)}
          dismissible={!simpanForm}
          title="Save form changes first?"
          description="The form has unsaved changes. If you discard them, the public form keeps the saved version."
          actions={
            <>
              <Button variant="outlined" disabled={simpanForm} onClick={() => setTujuanTertunda(null)}>Cancel</Button>
              <Button
                variant="outlined"
                disabled={simpanForm}
                onClick={() => { const tujuan = tujuanTertunda; setDraftForm(null); setTujuanTertunda(null); if (tujuan) buka(tujuan); }}
              >
                Discard changes
              </Button>
              <Button
                simpan
                loading={simpanForm}
                onClick={async () => {
                  const tujuan = tujuanTertunda;
                  if (await kirimForm(formDraft)) { setTujuanTertunda(null); if (tujuan) buka(tujuan); }
                }}
              >
                Save and open
              </Button>
            </>
          }
        />
      </WorkspacePage>
      </div>
    );
  }

  // ---- Tampilan moderasi -----------------------------------------------------
  const jumlahTamuTampil = jumlahTamu ?? config?.undangan?.count ?? 0;
  const tamuTampil = Boolean(config?.undangan) && (jumlahTamuTampil > 0 || config?.undangan?.access === "undangan" || tab === "tamu");
  const terpilih = rows.find((row) => row.id === pilihId) ?? null;

  const list = (
    <Pane aria-label="Registrant list">
      <div className="flex shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container-high px-4 py-2.5 text-body-medium font-medium text-on-surface-variant">
        <span className="min-w-0 flex-1">Registrant</span>
        <span className="shrink-0">Received</span>
      </div>
      <PaneBody>
        {error ? (
          <p role="alert" className="m-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={18} className="mt-0.5 shrink-0" />{error}</p>
        ) : loading ? (
          <div role="status" aria-label="Loading registrants" className="flex flex-col">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2 border-b border-outline-variant px-4 py-3.5">
                <div className="h-3 w-44 animate-pulse rounded bg-surface-container-high" />
                <div className="h-3 w-64 animate-pulse rounded bg-surface-container-high" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            plain
            icon={<Tray size={40} />}
            title={STATUS[tab === "tamu" ? "pending" : tab].kosong}
            description={tab !== "pending" ? undefined
              : !config?.registration_enabled ? "Registration is closed. The registration page rejects all submissions."
              : config.registration_auto_approve ? "Auto-approve is on, so new registrants go straight to the Approved tab."
              : "New registrants appear here until they are approved or rejected."}
          />
        ) : (
          rows.map((row) => {
            const sub = [row.job_title, row.company].filter(Boolean).join(" · ");
            return (
              <ListRow key={row.id} selected={row.id === pilihId} onSelect={() => setPilihId(row.id)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-on-surface">{row.name}</span>
                  <span className="block truncate text-on-surface-variant">{sub || row.email}</span>
                </span>
                {row.status === "approved" && row.email_error ? <StatusChip dot tone="error">Email failed</StatusChip> : null}
                <span className="shrink-0 tabular-nums text-on-surface-variant">{formatWaktu(row.created_at, zone)}</span>
              </ListRow>
            );
          })
        )}
      </PaneBody>
      {!loading && !error && rows.length > 0 ? (
        <PaneFooter
          className="bg-surface-container-lowest py-2"
          note={<span className="tabular-nums">{total > rows.length ? `Showing ${rows.length.toLocaleString("en-GB")} of ${plural(total, "registrant")}, oldest first` : `${plural(rows.length, "registrant")}, oldest first`}</span>}
        />
      ) : null}
    </Pane>
  );

  const detail = terpilih ? (() => {
    const row = terpilih;
    const sub = [row.job_title, row.company].filter(Boolean).join(" · ");
    const jawaban = Object.entries(row.extra ?? {});
    return (
      <Pane as="aside" aria-label={`Details for ${row.name}`}>
        <div className="flex shrink-0 flex-col gap-2 border-b border-outline-variant px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-title-medium font-semibold leading-6">{row.name}</h2>
              {sub ? <p className="text-body-medium text-on-surface-variant">{sub}</p> : null}
            </div>
            <IconButton size="sm" label="Close details" onClick={() => setPilihId(null)}><X size={16} /></IconButton>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-body-medium text-on-surface-variant">
            <StatusChip dot tone={STATUS[row.status].tone}>{STATUS[row.status].label}</StatusChip>
            <span>Registered {formatWaktu(row.created_at, zone)} {abbr}</span>
          </p>
        </div>
        <PaneBody>
          <DetailSection title="Contact">
            <dl className="flex flex-col gap-2">
              <KeyValue label="Email">{row.email}</KeyValue>
              <KeyValue label="Phone">{row.phone}</KeyValue>
            </dl>
          </DetailSection>
          {row.qr_code ? (
            // Kode tetap ditampilkan meski email sudah aktif: email bisa masuk
            // spam atau ditolak server penerima, dan panitia harus bisa
            // membacakannya lewat telepon tanpa membuka database.
            <DetailSection title="Participant code">
              <p className="select-all text-title-medium font-semibold tabular-nums">{row.qr_code}</p>
              {row.status === "approved" ? <StatusEmail row={row} emailAktif={emailAktif} zone={zone} abbr={abbr} /> : null}
            </DetailSection>
          ) : null}
          {jawaban.length > 0 ? (
            <DetailSection title="Form answers">
              <dl className="flex flex-col gap-2">
                {jawaban.map(([key, value]) => {
                  // Label pertanyaan, bukan kunci datanya. Kuncinya dibuat
                  // otomatis dari label dan tidak dimaksudkan untuk dibaca
                  // panitia yang sedang memeriksa pendaftar.
                  const field = (formDraft.fields ?? []).find((entry) => entry.key === key);
                  return (
                    <KeyValue key={key} label={field?.label ?? key}>
                      {field?.type === "file"
                        // Berkasnya di bucket privat: tautannya diminta ke server
                        // saat ditekan dan berlaku lima menit.
                        ? <button type="button" onClick={() => void bukaBerkas(value)} className="rounded-sm font-medium text-primary hover:underline">Open file</button>
                        : field?.type === "checkbox" ? (value === "true" ? "Yes" : "No")
                        : value}
                    </KeyValue>
                  );
                })}
              </dl>
            </DetailSection>
          ) : null}
          {row.reject_reason ? (
            <DetailSection title="Rejection reason">
              <p className="text-body-medium text-on-surface">{row.reject_reason}</p>
            </DetailSection>
          ) : null}
        </PaneBody>
        {row.status === "pending" ? (
          <PaneFooter note="The participant code is issued on approval">
            <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setMenolak(row)}>Reject</Button>
            <Button simpan size="sm" disabled={busy} icon={<Check size={16} weight="bold" />} onClick={() => void review(row, true)}>Approve</Button>
          </PaneFooter>
        ) : row.status === "approved" && row.qr_code && emailAktif ? (
          // Tombol disembunyikan, bukan diredupkan, saat email belum diaktifkan
          // di server: tombol mati tanpa keterangan terbaca sebagai kerusakan.
          // Sebabnya ditulis di StatusEmail.
          <PaneFooter>
            <Button
              size="sm"
              variant={row.email_sent_at ? "outlined" : "filled"}
              loading={mengirim === row.id}
              icon={<PaperPlaneTilt size={16} />}
              onClick={() => void kirimUlang(row)}
            >
              {row.email_sent_at ? "Resend code" : "Send code"}
            </Button>
          </PaneFooter>
        ) : null}
      </Pane>
    );
  })() : null;

  return (
    <div lang="en" className="contents">
    <WorkspacePage fill>
      <WorkspaceHeader
        meta={config ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <StatusDot tone={config.registration_enabled ? "success" : "neutral"} />
              {config.registration_enabled ? "Open" : "Closed"}
            </span>
            {config.registration_enabled ? (
              <>
                {config.undangan ? (
                  <>
                    <MetaSeparator />
                    <span>{AKSES.openTo}: <span className="font-medium text-on-surface">{config.undangan.access === "undangan" ? AKSES.inviteOnly : AKSES.anyone}</span></span>
                  </>
                ) : null}
                <MetaSeparator />
                <span>Auto-approve: {config.registration_auto_approve ? "on" : "off"}</span>
                <button type="button" onClick={() => setSetelanOpen(true)} className="rounded-sm font-medium text-primary hover:underline">{config.undangan ? AKSES.change : "Edit"}</button>
                <MetaSeparator />
                {config.undangan?.access === "undangan" ? (
                  // Khusus undangan: tautan umum hanya membuka halaman Khusus undangan.
                  <span className="min-w-0 break-all">{AKSES.publicLinkInviteOnly}: {tautan}</span>
                ) : (
                  <>
                    <span className="min-w-0 break-all">{tautan}</span>
                    <button type="button" onClick={salinTautan} className="rounded-sm font-medium text-primary hover:underline">Copy link</button>
                  </>
                )}
              </>
            ) : null}
            {config.email_konfirmasi ? (
              <>
                <MetaSeparator />
                <span>
                  Registration confirmation: {emailAktif ? config.email_konfirmasi.preset ?? "default from Theme" : "email not enabled on the server"}
                </span>
                <Link href="/admin/pengumuman/otomatis" className="rounded-sm font-medium text-primary hover:underline">Edit email</Link>
              </>
            ) : null}
          </>
        ) : null}
        actions={
          <>
            {config?.undangan ? (
              <Button icon={<Plus size={16} weight="bold" />} onClick={() => setImporOpen(true)}>{TAMU.addButton}</Button>
            ) : null}
            <Button variant="outlined" disabled={!config} icon={<PencilSimple size={16} />} onClick={() => setTampilan("formulir")}>Edit form</Button>
            {config ? (
              <Button
                variant="outlined"
                className={config.registration_enabled ? "text-error" : undefined}
                disabled={busy}
                onClick={() => void simpanKonfigurasi({ registration_enabled: !config.registration_enabled })}
              >
                {config.registration_enabled ? "Close registration" : "Open registration"}
              </Button>
            ) : null}
          </>
        }
      />

      <Tabs<Tab>
        label="Registration status"
        idPrefix="registrasi"
        value={tab}
        onChange={gantiTab}
        options={[
          // Tamu undangan: daftar yang berbeda jenis, jadi dipisah garis dan
          // angkanya netral. Hanya muncul bila ada tamu atau mode khusus undangan.
          ...(tamuTampil
            ? [{ value: "tamu" as const, label: TAMU.tab, badge: jumlahTamuTampil, badgeOutlined: true, divider: true }]
            : []),
          { value: "pending", label: "Pending approval", badge: pending > 0 ? pending : undefined },
          { value: "approved", label: "Approved" },
          { value: "rejected", label: "Rejected" },
        ]}
      />

      <div role="tabpanel" id={`registrasi-panel-${tab}`} aria-labelledby={`registrasi-tab-${tab}`} className="flex min-h-0 flex-1 flex-col">
        {tab === "tamu" ? (
          <TamuUndangan
            reloadKey={muatTamu}
            onCount={setJumlahTamu}
            onLihatPendaftaran={(status, id) => { gantiTab(status); setPilihId(id); }}
          />
        ) : (
          <ListDetail list={list} detail={detail} />
        )}
      </div>

      <TambahTamu
        open={imporOpen}
        onClose={() => setImporOpen(false)}
        onDone={() => { setMuatTamu((n) => n + 1); setJumlahTamu(null); void load(); gantiTab("tamu"); }}
      />

      <Dialog
        open={konfirmasiAkses}
        onClose={() => setKonfirmasiAkses(false)}
        dismissible={!busy}
        title={`${AKSES.openTo}: ${AKSES.inviteOnly}?`}
        description={AKSES.confirmInviteOnly(jumlahTamuTampil ?? 0)}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setKonfirmasiAkses(false)}>Cancel</Button>
            <Button simpan loading={busy} onClick={async () => { await simpanUndangan({ registration_access: "undangan" }); setKonfirmasiAkses(false); }}>Limit to invited guests</Button>
          </>
        }
      />

      <Dialog
        open={setelanOpen}
        onClose={() => setSetelanOpen(false)}
        title={config?.undangan ? AKSES.title : "Approval mode"}
        actions={<Button variant="outlined" onClick={() => setSetelanOpen(false)}>Close</Button>}
      >
        {config?.undangan ? (
          <div className="mb-5 flex flex-col gap-5 border-b border-outline-variant pb-5">
            <div>
              <p id="setelan-akses" className="mb-2 text-label-large font-semibold">{AKSES.openTo}</p>
              <SegmentedButton<"terbuka" | "undangan">
                label={AKSES.openTo}
                labelledBy="setelan-akses"
                value={config.undangan.access}
                options={[
                  { value: "terbuka", label: AKSES.anyone },
                  { value: "undangan", label: AKSES.inviteOnly },
                ]}
                onChange={(next) => {
                  if (busy || next === config.undangan?.access) return;
                  if (next === "undangan") setKonfirmasiAkses(true);
                  else void simpanUndangan({ registration_access: "terbuka" });
                }}
              />
            </div>
            <Switch simpan
              checked={config.undangan.auto_approve}
              disabled={busy}
              onChange={(value) => void simpanUndangan({ invitation_auto_approve: value })}
              label={AKSES.inviteAutoApprove}
              description={AKSES.inviteAutoApproveHint}
            />
          </div>
        ) : null}
        {config ? (
          <Switch simpan
            checked={config.registration_auto_approve}
            disabled={busy}
            onChange={(value) => void simpanKonfigurasi({ registration_auto_approve: value })}
            label={config.undangan ? AKSES.generalAutoApprove : "Auto-approve"}
            // Akibatnya ditulis, bukan sekadar nama setelannya. Dicentang tanpa
            // membaca, panitia baru sadar ada 40 peserta asing di leaderboard
            // saat acara sudah berjalan.
            description="Registrants become participants and get their code straight away, without anyone checking them. Without this, each registration waits on the Pending approval tab."
          />
        ) : null}
      </Dialog>

      <Dialog
        open={menolak !== null}
        onClose={() => setMenolak(null)}
        dismissible={!busy}
        tone="danger"
        title={`Reject registration from ${menolak?.name ?? ""}?`}
        description={`No participant code is issued. The record is kept, and this person can register again with the same email.${
          config?.email_konfirmasi?.kirim_ditolak && emailAktif && menolak?.email ? " The rejection email is sent too, without the reason below." : ""
        }`}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setMenolak(null)}>Cancel</Button>
            <Button simpan variant="danger" type="submit" form="form-tolak" loading={busy}>Reject</Button>
          </>
        }
      >
        <form
          id="form-tolak"
          onSubmit={(event) => {
            event.preventDefault();
            if (menolak) void review(menolak, false, String(new FormData(event.currentTarget).get("reason") ?? ""));
          }}
        >
          <p className="mb-4 text-body-medium text-on-surface-variant">{menolak?.email}</p>
          <TextField name="reason" label="Reason" optional maxLength={300} hint="For staff records only." />
        </form>
      </Dialog>
    </WorkspacePage>
    </div>
  );
}

/**
 * Nasib email kode peserta untuk satu baris.
 *
 * Empat keadaan, dan masing-masing menuntut tindakan berbeda dari panitia,
 * itulah sebabnya keempatnya dibedakan alih-alih diringkas jadi "terkirim /
 * tidak":
 *
 *   belum aktif  -> tidak ada yang bisa dilakukan panitia; hubungi pemilik sistem.
 *   belum dicoba -> tekan "Kirim kode".
 *   gagal        -> baca sebabnya; salah ketik alamat tidak akan sembuh dengan
 *                   menekan ulang, sedangkan penyedia yang sedang bermasalah akan.
 *   terkirim     -> tidak ada tindakan, dan waktunya disebut supaya "sudah lama
 *                   tapi belum sampai" bisa dibedakan dari "baru sedetik lalu".
 */
function StatusEmail({ row, emailAktif, zone, abbr }: {
  row: Row;
  emailAktif: boolean;
  zone: EventTimeZone;
  abbr: string;
}) {
  if (!emailAktif) {
    return <p className="flex items-start gap-2 text-body-medium text-on-surface-variant">
      <EnvelopeSimple size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>Email sending is not enabled on the server. Read the code above out to the registrant.</span>
    </p>;
  }
  if (row.email_error) {
    return <p className="flex items-start gap-2 text-body-medium text-error">
      <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
      <span>Email failed after {plural(row.email_attempts, "attempt")}: {row.email_error}</span>
    </p>;
  }
  if (row.email_sent_at) {
    return <p className="flex items-start gap-2 text-body-medium text-on-success-container">
      <Check size={16} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
      <span>Email sent {formatWaktu(row.email_sent_at, zone)} {abbr}</span>
    </p>;
  }
  return <p className="flex items-start gap-2 text-body-medium text-warning">
    <Hourglass size={16} className="mt-0.5 shrink-0" aria-hidden />
    <span>The code has not been emailed yet.</span>
  </p>;
}

/**
 * Dari mana tampilan formulir datang, dan apa yang membuat formulir meminta
 * kata sandi. Keduanya diatur di CMS Halaman acara, bukan di sini; kartu ini
 * hanya menunjukkan keadaannya dan jalan ke sana, supaya admin tidak mencari
 * pilihan warna di layar yang tidak punya.
 */
function KartuTampilan({
  tampilan,
  seed,
  onBuka,
}: {
  tampilan: EventConfig["tampilan"];
  seed: string;
  /** Dipanggil saat tautan diklik; `preventDefault` menahan perpindahan halaman. */
  onBuka: (href: string, event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  if (!tampilan) return null;
  // Hanya yang benar-benar dipakai formulir. Tata letak Editorial memakai
  // formulir lama, yang hanya mengambil warnanya.
  const ringkasan = tampilan.v2
    ? [tampilan.logo ? "Logo" : "No logo", tampilan.kv ? "hero image" : "no hero image", seed.toUpperCase(), tampilan.huruf].filter(Boolean).join(" · ")
    : `Colour ${seed.toUpperCase()}. The logo and hero image only show on forms with the Modern or Forum layout.`;
  // text-body-medium, bukan text-label-large: aturan `.press .text-label-large`
  // yang tidak berlapis menurunkan tebalnya ke 400 di dalam panel.
  const TAUTAN = "inline-flex min-h-10 shrink-0 items-center rounded-sm text-body-medium font-semibold text-primary hover:underline";
  return (
    <div className="mb-4 divide-y divide-outline-variant rounded-lg bg-panel-high px-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-4">
        {tampilan.kv ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tampilan.kv} alt="" className="hidden h-10 w-16 shrink-0 rounded-sm object-cover sm:block" />
        ) : (
          <span aria-hidden className="hidden h-10 w-16 shrink-0 rounded-sm sm:block" style={{ backgroundColor: seed }} />
        )}
        {/* Teks paling sedikit 14rem: di ponsel tautannya turun ke bawah, bukan memeras teks. */}
        <div className="min-w-[14rem] flex-1">
          <p className="text-title-medium font-semibold">
            Look follows the event page Theme
          </p>
          <p className="mt-0.5 text-body-medium text-on-surface-variant">{ringkasan}</p>
        </div>
        <Link href="/admin/landing?bagian=tema" onClick={(event) => onBuka("/admin/landing?bagian=tema", event)} className={TAUTAN}>Edit in Theme</Link>
      </div>
      {tampilan.area_peserta ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-4">
          <div className="min-w-[14rem] flex-1">
            <p className="text-title-medium font-semibold">Participant area is on</p>
            <p className="mt-0.5 text-body-medium text-on-surface-variant">The form asks for a password, so email is always required.</p>
          </div>
          <Link href="/admin/area-peserta" onClick={(event) => onBuka("/admin/area-peserta", event)} className={TAUTAN}>Set up in Participant area</Link>
        </div>
      ) : null}
    </div>
  );
}
