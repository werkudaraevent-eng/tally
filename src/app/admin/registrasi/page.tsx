"use client";

import { pesanGalatApi } from "@/lib/api-message";
import { ArrowLeft, Check, EnvelopeSimple, Hourglass, PaperPlaneTilt, PencilSimple, Tray, WarningCircle, X, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { withEventPrefix } from "@/lib/event-path";
import { useToast } from "@/components/toast";
import {
  Banner, Button, DetailSection, Dialog, EmptyState, IconButton, KeyValue, ListDetail, ListRow, MetaSeparator, PageLoading,
  Pane, PaneBody, PaneFooter, StatusChip, StatusDot, SupportingPane, Switch, Tabs, TextField, WorkspaceHeader, WorkspacePage,
  type ChipTone,
} from "@/components/m3";
import { RegistrationFormBuilder } from "@/components/admin/registration-form-builder";
import { FormPreview } from "@/components/admin/form-preview";
import Link from "@/components/event-link";
import type { RegistrationFormConfig } from "@/lib/domain";
import { formatEventDateTime } from "@/lib/datetime";
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
};

type Status = Row["status"];

const STATUS: Record<Status, { label: string; tone: ChipTone; kosong: string }> = {
  pending: { label: "Menunggu", tone: "warning", kosong: "Tidak ada pendaftar yang menunggu" },
  approved: { label: "Disetujui", tone: "success", kosong: "Belum ada pendaftar yang disetujui" },
  rejected: { label: "Ditolak", tone: "error", kosong: "Belum ada pendaftar yang ditolak" },
};

/** Moderasi pendaftar, atau penyunting susunan formulir. */
type Tampilan = "moderasi" | "formulir";

export default function RegistrasiAdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [config, setConfig] = useState<EventConfig | null>(null);
  const [pending, setPending] = useState(0);
  const [tab, setTab] = useState<Status>("pending");
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
    const response = await fetch(eventApiPath(`/api/admin/registrasi?status=${tab}`), { cache: "no-store" }).catch(() => null);
    if (!response) { setError("Koneksi gagal. Muat ulang halaman."); setLoading(false); return; }
    if (response.status === 401) { window.location.href = "/login"; return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error?.details?.message ?? body.error?.message ?? "Daftar pendaftaran gagal dimuat.");
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

  function gantiTab(next: Status) {
    setTab(next);
    setLoading(true);
    setPilihId(null);
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
    if (!response) { toast.error("Koneksi gagal", "Muat ulang untuk melihat status sebenarnya."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Gagal disimpan", body.error?.details?.message ?? body.error?.message ?? "Coba lagi.");
      return;
    }
    setConfig({ ...config, ...body });
    // Pesannya mengikuti sakelar yang DITEKAN, bukan keadaan pendaftaran. Sejak
    // PATCH ini hanya mengirim satu sakelar, mengabarkan "Pendaftaran ditutup"
    // setelah seseorang mengubah mode persetujuan adalah kabar tentang hal yang
    // tidak ia sentuh.
    toast.success(
      "Tersimpan",
      next.registration_enabled !== undefined
        ? body.registration_enabled ? "Pendaftaran dibuka." : "Pendaftaran ditutup."
        : body.registration_auto_approve ? "Pendaftar baru langsung disetujui." : "Pendaftar baru menunggu ditinjau.",
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
    setSimpanForm(true);
    const response = await fetch(eventApiPath("/api/admin/registrasi"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // Sakelar pendaftaran TIDAK ikut dikirim. Menyimpan susunan form bukan
      // pernyataan apa pun tentang pendaftaran dibuka atau tidak, dan nilai yang
      // dipegang layar ini bisa sudah didahului panitia lain.
      body: JSON.stringify({
        form: {
          // Pilihan berjudul kosong dibuang bersama keterangannya (indeksnya
          // sejajar), supaya baris yang baru ditambah lalu dibiarkan kosong
          // tidak menggagalkan Simpan.
          fields: (next.fields ?? []).map((field) => {
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
    if (!response) { toast.error("Koneksi gagal", "Muat ulang untuk melihat status sebenarnya."); return false; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Form gagal disimpan", pesanGalatApi(body) ?? "Coba lagi.");
      return false;
    }
    setConfig({ ...config, ...body });
    setDraftForm(null);
    toast.success("Form tersimpan", "Halaman pendaftaran publik langsung memakai susunan baru.");
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
      toast.error("Berkas tidak bisa dibuka", body?.error?.details?.message ?? "Coba muat ulang halaman.");
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
    if (!response) { toast.error("Koneksi gagal", "Muat ulang untuk melihat status sebenarnya."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Gagal diproses", body.error?.details?.message ?? body.error?.message ?? "Coba lagi.");
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
      approve ? `${row.name} disetujui` : `${row.name} ditolak`,
      approve
        ? `Kode peserta: ${body.qr_code}.${
            email.state === "sent" ? ` Email terkirim ke ${row.email}.`
            : email.state === "failed" ? " Email gagal terkirim. Bacakan kodenya, lalu coba Kirim ulang di tab Disetujui."
            : ""
          }`
        : "Pendaftar tidak dibuatkan kode peserta.",
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
    if (!response) { toast.error("Koneksi gagal", "Muat ulang untuk melihat status sebenarnya."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Email gagal dikirim", body.error?.details?.message ?? body.error?.message ?? "Coba lagi.");
      // Baris di layar sekarang basi: email_error dan email_attempts sudah
      // berubah di database, dan membiarkannya membuat panitia membaca sebab
      // kegagalan yang lama.
      void load();
      return;
    }
    setRows((current) => current.map((entry) => (
      entry.id === row.id ? { ...entry, email_sent_at: new Date().toISOString(), email_error: null, email_attempts: entry.email_attempts + 1 } : entry
    )));
    toast.success("Email terkirim", `Kode peserta dikirim ulang ke ${row.email}.`);
  }

  const tautan = config ? `/e/${config.slug}/daftar` : "";
  // Draf diturunkan, bukan disalin lewat useEffect. Menyalin state ke state lain
  // di dalam effect menambah satu render setiap kali data dimuat ulang, dan
  // pemuatan berkala akan menimpa suntingan yang sedang berjalan.
  const formDraft = draftForm ?? config?.registration_form_config ?? {};

  function salinTautan() {
    void navigator.clipboard.writeText(new URL(tautan, window.location.origin).toString());
    toast.success("Tautan disalin", "Sebarkan ke calon peserta.");
  }

  // ---- Tampilan penyunting formulir ----------------------------------------
  if (tampilan === "formulir") {
    return (
      <WorkspacePage fill>
        <WorkspaceHeader
          title="Atur formulir"
          back={
            <button type="button" onClick={() => setTampilan("moderasi")} className="inline-flex items-center gap-1.5 rounded-sm text-body-medium font-medium text-primary hover:underline">
              <ArrowLeft size={14} aria-hidden />Pendaftaran publik
            </button>
          }
          meta={<span>Apa yang ditanyakan ke pendaftar. Tampilannya mengikuti Tema halaman acara.</span>}
        />
        {!config ? (
          error ? <Banner tone="error" icon={<XCircle size={18} />}>{error}</Banner> : <PageLoading />
        ) : (
          // Penyunting dan pratinjau bersebelahan: yang membuat pratinjau berguna
          // adalah melihat akibat suntingan tanpa memalingkan mata.
          <SupportingPane
            paneWidth={440}
            main={
              <Pane aria-label="Penyunting formulir">
                <PaneBody className="px-5 py-5">
                  <KartuTampilan
                    tampilan={config.tampilan}
                    seed={config.form_theme_seed}
                    // Ada draf: tanya dulu, jangan buang diam-diam.
                    onBuka={(href, event) => { if (draftForm) { event.preventDefault(); setTujuanTertunda(href); } }}
                  />
                  <RegistrationFormBuilder config={formDraft} onChange={setDraftForm} disabled={simpanForm} areaPeserta={config.tampilan?.area_peserta ?? false} />
                </PaneBody>
                <PaneFooter note={draftForm ? "Ada perubahan yang belum disimpan" : "Sama dengan yang tayang di halaman pendaftaran"}>
                  <Button simpan size="sm" onClick={() => void kirimForm(formDraft)} loading={simpanForm} disabled={busy} icon={<Check size={16} weight="bold" />}>
                    Simpan formulir
                  </Button>
                </PaneFooter>
              </Pane>
            }
            pane={
              <Pane as="aside" aria-label="Pratinjau formulir">
                <FormPreview slug={config.slug} form={formDraft} />
              </Pane>
            }
          />
        )}
        <Dialog
          open={tujuanTertunda !== null}
          onClose={() => setTujuanTertunda(null)}
          dismissible={!simpanForm}
          title="Simpan perubahan formulir dulu?"
          description="Ada perubahan susunan formulir yang belum disimpan. Kalau dibuang, formulir publik tetap memakai susunan yang tersimpan."
          actions={
            <>
              <Button variant="outlined" disabled={simpanForm} onClick={() => setTujuanTertunda(null)}>Batal</Button>
              <Button
                variant="outlined"
                disabled={simpanForm}
                onClick={() => { const tujuan = tujuanTertunda; setDraftForm(null); setTujuanTertunda(null); if (tujuan) buka(tujuan); }}
              >
                Buang
              </Button>
              <Button
                simpan
                loading={simpanForm}
                onClick={async () => {
                  const tujuan = tujuanTertunda;
                  if (await kirimForm(formDraft)) { setTujuanTertunda(null); if (tujuan) buka(tujuan); }
                }}
              >
                Simpan lalu buka
              </Button>
            </>
          }
        />
      </WorkspacePage>
    );
  }

  // ---- Tampilan moderasi -----------------------------------------------------
  const terpilih = rows.find((row) => row.id === pilihId) ?? null;

  const list = (
    <Pane aria-label="Daftar pendaftar">
      <div className="flex shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container-high px-4 py-2.5 text-body-medium font-medium text-on-surface-variant">
        <span className="min-w-0 flex-1">Pendaftar</span>
        <span className="shrink-0">Masuk</span>
      </div>
      <PaneBody>
        {error ? (
          <p role="alert" className="m-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={18} className="mt-0.5 shrink-0" />{error}</p>
        ) : loading ? (
          <div role="status" aria-label="Memuat pendaftar" className="flex flex-col">
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
            title={STATUS[tab].kosong}
            description={tab !== "pending" ? undefined
              : !config?.registration_enabled ? "Pendaftaran sedang ditutup. Halaman pendaftaran menolak semua pengiriman."
              : config.registration_auto_approve ? "Setujui otomatis menyala, jadi pendaftar baru langsung masuk ke tab Disetujui."
              : "Pendaftar baru muncul di sini sampai disetujui atau ditolak."}
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
                {row.status === "approved" && row.email_error ? <StatusChip dot tone="error">Email gagal</StatusChip> : null}
                <span className="shrink-0 tabular-nums text-on-surface-variant">{formatEventDateTime(row.created_at, zone)}</span>
              </ListRow>
            );
          })
        )}
      </PaneBody>
      {!loading && !error && rows.length > 0 ? (
        <PaneFooter
          className="bg-surface-container-lowest py-2"
          note={<span className="tabular-nums">{total > rows.length ? `${rows.length} dari ${total} ditampilkan, terlama di atas` : `${rows.length} pendaftar, terlama di atas`}</span>}
        />
      ) : null}
    </Pane>
  );

  const detail = terpilih ? (() => {
    const row = terpilih;
    const sub = [row.job_title, row.company].filter(Boolean).join(" · ");
    const jawaban = Object.entries(row.extra ?? {});
    return (
      <Pane as="aside" aria-label={`Detail ${row.name}`}>
        <div className="flex shrink-0 flex-col gap-2 border-b border-outline-variant px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-title-medium font-semibold leading-6">{row.name}</h2>
              {sub ? <p className="text-body-medium text-on-surface-variant">{sub}</p> : null}
            </div>
            <IconButton size="sm" label="Tutup detail" onClick={() => setPilihId(null)}><X size={16} /></IconButton>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-body-medium text-on-surface-variant">
            <StatusChip dot tone={STATUS[row.status].tone}>{STATUS[row.status].label}</StatusChip>
            <span>Didaftarkan {formatEventDateTime(row.created_at, zone)} {abbr}</span>
          </p>
        </div>
        <PaneBody>
          <DetailSection title="Kontak">
            <dl className="flex flex-col gap-2">
              <KeyValue label="Email">{row.email}</KeyValue>
              <KeyValue label="Telepon">{row.phone}</KeyValue>
            </dl>
          </DetailSection>
          {row.qr_code ? (
            // Kode tetap ditampilkan meski email sudah aktif: email bisa masuk
            // spam atau ditolak server penerima, dan panitia harus bisa
            // membacakannya lewat telepon tanpa membuka database.
            <DetailSection title="Kode peserta">
              <p className="select-all text-title-medium font-semibold tabular-nums">{row.qr_code}</p>
              {row.status === "approved" ? <StatusEmail row={row} emailAktif={emailAktif} zone={zone} abbr={abbr} /> : null}
            </DetailSection>
          ) : null}
          {jawaban.length > 0 ? (
            <DetailSection title="Jawaban formulir">
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
                        ? <button type="button" onClick={() => void bukaBerkas(value)} className="rounded-sm font-medium text-primary hover:underline">Buka berkas</button>
                        : field?.type === "checkbox" ? (value === "true" ? "Ya" : "Tidak")
                        : value}
                    </KeyValue>
                  );
                })}
              </dl>
            </DetailSection>
          ) : null}
          {row.reject_reason ? (
            <DetailSection title="Alasan penolakan">
              <p className="text-body-medium text-on-surface">{row.reject_reason}</p>
            </DetailSection>
          ) : null}
        </PaneBody>
        {row.status === "pending" ? (
          <PaneFooter note="Kode peserta terbit saat disetujui">
            <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setMenolak(row)}>Tolak</Button>
            <Button simpan size="sm" disabled={busy} icon={<Check size={16} weight="bold" />} onClick={() => void review(row, true)}>Setujui</Button>
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
              {row.email_sent_at ? "Kirim ulang" : "Kirim kode"}
            </Button>
          </PaneFooter>
        ) : null}
      </Pane>
    );
  })() : null;

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        meta={config ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <StatusDot tone={config.registration_enabled ? "success" : "neutral"} />
              {config.registration_enabled ? "Dibuka" : "Ditutup"}
            </span>
            {config.registration_enabled ? (
              <>
                <MetaSeparator />
                <span>Setujui otomatis: {config.registration_auto_approve ? "nyala" : "mati"}</span>
                <button type="button" onClick={() => setSetelanOpen(true)} className="rounded-sm font-medium text-primary hover:underline">Ubah</button>
                <MetaSeparator />
                <span className="min-w-0 break-all">{tautan}</span>
                <button type="button" onClick={salinTautan} className="rounded-sm font-medium text-primary hover:underline">Salin tautan</button>
              </>
            ) : null}
          </>
        ) : null}
        actions={
          <>
            <Button variant="outlined" disabled={!config} icon={<PencilSimple size={16} />} onClick={() => setTampilan("formulir")}>Atur formulir</Button>
            {config ? (
              <Button
                variant="outlined"
                className={config.registration_enabled ? "text-error" : undefined}
                disabled={busy}
                onClick={() => void simpanKonfigurasi({ registration_enabled: !config.registration_enabled })}
              >
                {config.registration_enabled ? "Tutup pendaftaran" : "Buka pendaftaran"}
              </Button>
            ) : null}
          </>
        }
      />

      <Tabs<Status>
        label="Status pendaftaran"
        idPrefix="registrasi"
        value={tab}
        onChange={gantiTab}
        options={[
          { value: "pending", label: "Menunggu", badge: pending > 0 ? pending : undefined },
          { value: "approved", label: "Disetujui" },
          { value: "rejected", label: "Ditolak" },
        ]}
      />

      <div role="tabpanel" id={`registrasi-panel-${tab}`} aria-labelledby={`registrasi-tab-${tab}`} className="flex min-h-0 flex-1 flex-col">
        <ListDetail list={list} detail={detail} />
      </div>

      <Dialog
        open={setelanOpen}
        onClose={() => setSetelanOpen(false)}
        title="Mode persetujuan"
        actions={<Button variant="outlined" onClick={() => setSetelanOpen(false)}>Tutup</Button>}
      >
        {config ? (
          <Switch simpan
            checked={config.registration_auto_approve}
            disabled={busy}
            onChange={(value) => void simpanKonfigurasi({ registration_auto_approve: value })}
            label="Setujui otomatis"
            // Akibatnya ditulis, bukan sekadar nama setelannya. Dicentang tanpa
            // membaca, panitia baru sadar ada 40 peserta asing di leaderboard
            // saat acara sudah berjalan.
            description="Pendaftar langsung jadi peserta dan kode terbit seketika, tanpa diperiksa siapa pun. Tanpa ini, setiap pendaftaran menunggu persetujuan di tab Menunggu."
          />
        ) : null}
      </Dialog>

      <Dialog
        open={menolak !== null}
        onClose={() => setMenolak(null)}
        dismissible={!busy}
        tone="danger"
        title={`Tolak pendaftaran ${menolak?.name ?? ""}?`}
        description="Pendaftar tidak dibuatkan kode peserta. Catatannya tetap tersimpan, dan orang ini boleh mendaftar ulang dengan email yang sama."
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setMenolak(null)}>Batal</Button>
            <Button simpan variant="danger" type="submit" form="form-tolak" loading={busy}>Tolak</Button>
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
          <TextField name="reason" label="Alasan" optional maxLength={300} hint="Untuk catatan panitia." />
        </form>
      </Dialog>
    </WorkspacePage>
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
      <span>Pengiriman email belum diaktifkan di server. Bacakan kode di atas ke pendaftar.</span>
    </p>;
  }
  if (row.email_error) {
    return <p className="flex items-start gap-2 text-body-medium text-error">
      <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
      <span>Email gagal terkirim setelah {row.email_attempts}× percobaan: {row.email_error}</span>
    </p>;
  }
  if (row.email_sent_at) {
    return <p className="flex items-start gap-2 text-body-medium text-on-success-container">
      <Check size={16} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
      <span>Email terkirim {formatEventDateTime(row.email_sent_at, zone)} {abbr}</span>
    </p>;
  }
  return <p className="flex items-start gap-2 text-body-medium text-warning">
    <Hourglass size={16} className="mt-0.5 shrink-0" aria-hidden />
    <span>Kode belum pernah dikirim lewat email.</span>
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
    ? [tampilan.logo ? "Logo" : "Tanpa logo", tampilan.kv ? "gambar utama" : "tanpa gambar utama", seed.toUpperCase(), tampilan.huruf].filter(Boolean).join(" · ")
    : `Warna ${seed.toUpperCase()}. Logo dan gambar utama hanya tampil di formulir bertata letak Modern atau Forum.`;
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
            Tampilan mengikuti Tema halaman acara
          </p>
          <p className="mt-0.5 text-body-medium text-on-surface-variant">{ringkasan}</p>
        </div>
        <Link href="/admin/landing?bagian=tema" onClick={(event) => onBuka("/admin/landing?bagian=tema", event)} className={TAUTAN}>Ubah di Tema</Link>
      </div>
      {tampilan.area_peserta ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-4">
          <div className="min-w-[14rem] flex-1">
            <p className="text-title-medium font-semibold">Area peserta aktif</p>
            <p className="mt-0.5 text-body-medium text-on-surface-variant">Formulir meminta kata sandi; email otomatis wajib.</p>
          </div>
          <Link href="/admin/landing?bagian=peserta" onClick={(event) => onBuka("/admin/landing?bagian=peserta", event)} className={TAUTAN}>Atur di Peserta</Link>
        </div>
      ) : null}
    </div>
  );
}
