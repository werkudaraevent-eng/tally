"use client";

import Link from "next/link";
import { EnvelopeSimple, Megaphone, Plus, PushPin, Trash, Warning, X, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import {
  Banner,
  Button,
  DetailSection,
  Dialog,
  EmptyState,
  IconButton,
  ListDetail,
  MetaSeparator,
  Pane,
  PaneBody,
  PaneFooter,
  SelectField,
  StatusChip,
  Switch,
  TextArea,
  TextField,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import { cx } from "@/lib/m3/cx";

/**
 * Pengumuman panitia untuk peserta.
 *
 * Yang ditulis di sini tampil di lonceng bilah atas halaman acara dan di
 * Dashboard saya, bagi peserta yang sudah masuk ke area peserta. Pola daftar +
 * detail yang sama dengan User & role: daftar di kiri, penyunting di kanan.
 *
 * Salinan email SENGAJA terpisah dari Simpan dan selalu lewat dialog yang
 * menyebut jumlah penerimanya: menyimpan bisa dibatalkan dengan menyunting
 * lagi, email yang sudah terkirim tidak bisa ditarik.
 */

type Audience = "semua" | "disetujui";
type Ringkasan = { terkirim: number; gagal: number; galat?: string | null; waktu: string };
type Item = {
  id: string;
  title: string;
  body: string;
  link_url: string | null;
  link_label: string | null;
  audience: Audience;
  pinned: boolean;
  published_at: string;
  email_summary: Ringkasan | null;
  created_at: string;
  updated_at: string;
};
type Muat = {
  ready: boolean;
  items: Item[];
  recipients: Record<Audience, number>;
  email_configured: boolean;
  member_enabled?: boolean;
  time_zone?: string;
};
type Draft = { id: string | null; title: string; body: string; link_url: string; link_label: string; audience: Audience; pinned: boolean };

const KOSONG: Draft = { id: null, title: "", body: "", link_url: "", link_label: "", audience: "semua", pinned: false };

const PENERIMA: Record<Audience, string> = {
  semua: "Semua akun peserta",
  disetujui: "Hanya yang sudah disetujui",
};

/** Jam di zona waktu acara, sama dengan yang dilihat peserta, bukan zona peramban admin. */
function waktu(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
}

function keDraft(item: Item): Draft {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    link_url: item.link_url ?? "",
    link_label: item.link_label ?? "",
    audience: item.audience,
    pinned: item.pinned,
  };
}

export default function PengumumanPage() {
  const toast = useToast();
  const [data, setData] = useState<Muat | null>(null);
  const [galatMuat, setGalatMuat] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [simpan, setSimpan] = useState(false);
  const [galat, setGalat] = useState("");
  const [konfirmasiHapus, setKonfirmasiHapus] = useState(false);
  const [konfirmasiEmail, setKonfirmasiEmail] = useState(false);
  const [kirim, setKirim] = useState(false);

  const muat = useCallback(async () => {
    setGalatMuat("");
    const response = await fetch("/api/admin/pengumuman", { cache: "no-store" }).catch(() => null);
    const body = await response?.json().catch(() => null);
    if (!response?.ok || !body) {
      setGalatMuat(body?.error?.message ?? "Daftar pengumuman gagal dimuat.");
      return;
    }
    setData(body as Muat);
  }, []);

  useEffect(() => {
    // Muat awal dari server, sekali saat halaman dibuka.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void muat();
  }, [muat]);

  const items = data?.items ?? [];
  const terpilih = draft?.id ? items.find((item) => item.id === draft.id) ?? null : null;
  const berubah = draft
    ? terpilih
      ? JSON.stringify(keDraft(terpilih)) !== JSON.stringify(draft)
      : Boolean(draft.title.trim() || draft.body.trim())
    : false;

  function tutup() {
    setDraft(null);
    setGalat("");
  }

  async function simpanDraft() {
    if (!draft) return;
    setSimpan(true);
    setGalat("");
    const isi = {
      title: draft.title,
      body: draft.body,
      link_url: draft.link_url,
      link_label: draft.link_label,
      audience: draft.audience,
      pinned: draft.pinned,
    };
    const response = await fetch("/api/admin/pengumuman", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft.id ? { id: draft.id, ...isi } : isi),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setSimpan(false);
    if (!response?.ok) {
      const pesan =
        body?.error?.code === "VALIDATION_ERROR"
          ? Object.values((body.error.details?.fieldErrors ?? {}) as Record<string, string[]>).flat()[0] ?? body.error.message
          : body?.error?.message ?? "Pengumuman gagal disimpan.";
      setGalat(pesan);
      toast.error("Pengumuman gagal disimpan", pesan);
      return;
    }
    const baru = !draft.id;
    toast.success(
      baru ? "Pengumuman terbit" : "Perubahan tersimpan",
      baru ? "Peserta melihatnya di lonceng dan Dashboard saya." : "Peserta melihat versi terbaru.",
    );
    setDraft(keDraft(body as Item));
    void muat();
  }

  async function hapus() {
    if (!draft?.id) return;
    setSimpan(true);
    const response = await fetch(`/api/admin/pengumuman?id=${draft.id}`, { method: "DELETE" }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setSimpan(false);
    setKonfirmasiHapus(false);
    if (!response?.ok) {
      toast.error("Pengumuman gagal dihapus", body?.error?.message ?? "Coba lagi.");
      return;
    }
    toast.success("Pengumuman dihapus", "Tidak lagi tampil bagi peserta.");
    tutup();
    void muat();
  }

  async function kirimEmail() {
    if (!draft?.id) return;
    setKirim(true);
    const response = await fetch("/api/admin/pengumuman/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: draft.id }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setKirim(false);
    setKonfirmasiEmail(false);
    if (!response?.ok) {
      toast.error("Email belum terkirim", body?.error?.message ?? "Coba lagi sebentar lagi.");
      void muat();
      return;
    }
    const hasil = body as Ringkasan;
    toast.success(
      `Email terkirim ke ${hasil.terkirim} akun`,
      hasil.gagal > 0 ? `${hasil.gagal} gagal terkirim.` : "Salinan yang sama ada di Dashboard saya peserta.",
    );
    void muat();
  }

  const jumlahPenerima = draft ? data?.recipients[draft.audience] ?? 0 : 0;

  // ---- Daftar --------------------------------------------------------------
  const list = (
    <Pane aria-label="Daftar pengumuman">
      <PaneBody className="overflow-x-auto">
        {galatMuat && !data ? (
          <div className="flex flex-wrap items-center gap-3 px-4 py-4">
            <p role="alert" className="flex min-w-0 flex-1 items-start gap-2 text-body-medium text-error">
              <XCircle size={16} className="mt-0.5 shrink-0" />
              {galatMuat}
            </p>
            <Button variant="outlined" size="sm" onClick={() => void muat()}>
              Coba lagi
            </Button>
          </div>
        ) : !data ? (
          <div aria-label="Memuat pengumuman">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-outline-variant px-4 py-4">
                <div className="h-3 w-56 animate-pulse rounded bg-surface-container-high" />
                <div className="h-3 w-24 animate-pulse rounded bg-surface-container-high" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            plain
            icon={<Megaphone size={40} />}
            title="Belum ada pengumuman"
            description="Tulis kabar untuk peserta: perubahan ruang, jadwal, atau barang yang perlu dibawa. Peserta melihatnya di lonceng halaman acara dan di Dashboard saya."
            action={
              data.ready ? (
                <Button size="sm" icon={<Plus size={16} weight="bold" />} onClick={() => setDraft({ ...KOSONG })}>
                  Tulis pengumuman
                </Button>
              ) : undefined
            }
          />
        ) : (
          <table className="w-full min-w-[560px] border-separate border-spacing-0 text-left text-body-medium">
            <thead className="sticky top-0 z-10 bg-surface-container-high text-body-medium font-medium text-on-surface-variant">
              <tr>
                <th scope="col" className="border-b border-outline-variant px-4 py-2.5 font-medium">Pengumuman</th>
                <th scope="col" className="border-b border-outline-variant px-3 py-2.5 font-medium">Penerima</th>
                <th scope="col" className="border-b border-outline-variant px-3 py-2.5 font-medium">Terbit</th>
                <th scope="col" className="border-b border-outline-variant px-3 py-2.5 font-medium">Email</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const aktif = draft?.id === item.id;
                const disunting = new Date(item.updated_at).getTime() - new Date(item.created_at).getTime() > 60_000;
                return (
                  <tr
                    key={item.id}
                    onClick={() => setDraft(keDraft(item))}
                    className={cx("cursor-pointer", aktif ? "bg-secondary-container" : "bg-surface-container-lowest hover:bg-primary-soft")}
                  >
                    <td className="max-w-[360px] border-b border-outline-variant px-4 py-2.5">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDraft(keDraft(item));
                        }}
                        aria-pressed={aktif}
                        className="flex w-full min-w-0 items-center gap-1.5 rounded-sm text-left font-medium text-on-surface"
                      >
                        {item.pinned ? <PushPin size={14} weight="fill" className="shrink-0 text-primary" aria-label="Disematkan" /> : null}
                        <span className="truncate">{item.title}</span>
                      </button>
                      {disunting ? <span className="text-body-small text-on-surface-variant">Disunting {waktu(item.updated_at, data?.time_zone)}</span> : null}
                    </td>
                    <td className="whitespace-nowrap border-b border-outline-variant px-3 py-2.5">{item.audience === "semua" ? "Semua akun" : "Disetujui"}</td>
                    <td className="whitespace-nowrap border-b border-outline-variant px-3 py-2.5 tabular-nums">{waktu(item.published_at, data?.time_zone)}</td>
                    <td className="border-b border-outline-variant px-3 py-2.5">
                      {item.email_summary ? (
                        <StatusChip dot tone={item.email_summary.gagal > 0 ? "warning" : "success"}>
                          {item.email_summary.terkirim} terkirim
                        </StatusChip>
                      ) : (
                        <span className="text-on-surface-variant">Belum</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </PaneBody>
      <PaneFooter className="bg-surface-container-lowest py-2" note="Disematkan tampil paling atas. Lainnya urut dari yang terbaru." />
    </Pane>
  );

  // ---- Detail --------------------------------------------------------------
  let detail = null;
  if (draft) {
    const baru = !draft.id;
    detail = (
      <Pane as="aside" aria-label={baru ? "Pengumuman baru" : `Pengumuman ${draft.title}`}>
        <div className="flex shrink-0 items-start gap-3 border-b border-outline-variant px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="min-w-0 truncate text-title-medium font-semibold leading-6">{baru ? "Pengumuman baru" : terpilih?.title ?? draft.title}</h2>
            <p className="text-body-medium text-on-surface-variant">
              {baru ? "Terbit begitu disimpan." : `Terbit ${terpilih ? waktu(terpilih.published_at, data?.time_zone) : ""}`}
            </p>
          </div>
          <IconButton size="sm" label="Tutup detail" onClick={tutup} disabled={simpan}>
            <X size={16} />
          </IconButton>
        </div>

        <PaneBody>
          <form
            id="form-pengumuman"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.title.trim()) void simpanDraft();
            }}
          >
            {galat ? (
              <p role="alert" className="mx-5 mt-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error">
                <XCircle size={16} className="mt-0.5 shrink-0" />
                {galat}
              </p>
            ) : null}
            <DetailSection>
              <div className="flex flex-col gap-4">
                <TextField
                  label="Judul"
                  value={draft.title}
                  maxLength={120}
                  counter
                  onChange={(event) => setDraft((kini) => kini && { ...kini, title: event.target.value })}
                  placeholder="mis. Ruang breakout sudah ditentukan"
                />
                <TextArea
                  label="Isi"
                  optional
                  rows={5}
                  maxLength={2000}
                  counter
                  value={draft.body}
                  onChange={(event) => setDraft((kini) => kini && { ...kini, body: event.target.value })}
                  hint="Enter untuk baris baru. Di lonceng hanya tiga baris pertama yang tampil."
                />
                <TextField
                  label="Tautan"
                  optional
                  type="url"
                  inputMode="url"
                  value={draft.link_url}
                  onChange={(event) => setDraft((kini) => kini && { ...kini, link_url: event.target.value })}
                  placeholder="https://"
                />
                {draft.link_url.trim() ? (
                  <TextField
                    label="Teks tautan"
                    optional
                    maxLength={60}
                    value={draft.link_label}
                    onChange={(event) => setDraft((kini) => kini && { ...kini, link_label: event.target.value })}
                    placeholder="mis. Unduh materi"
                    hint="Kosong: alamat tautannya yang tampil."
                  />
                ) : null}
                <SelectField
                  label="Penerima"
                  value={draft.audience}
                  onChange={(event) => setDraft((kini) => kini && { ...kini, audience: event.target.value as Audience })}
                  hint={
                    draft.audience === "semua"
                      ? `${data?.recipients.semua ?? 0} akun, termasuk yang pendaftarannya belum disetujui.`
                      : `${data?.recipients.disetujui ?? 0} akun yang sudah menjadi peserta.`
                  }
                >
                  <option value="semua">{PENERIMA.semua}</option>
                  <option value="disetujui">{PENERIMA.disetujui}</option>
                </SelectField>
                <Switch
                  checked={draft.pinned}
                  onChange={(pinned) => setDraft((kini) => kini && { ...kini, pinned })}
                  label="Sematkan"
                  description="Tampil paling atas sampai sematannya dilepas."
                />
              </div>
            </DetailSection>

            {!baru ? (
              <DetailSection title="Salinan email">
                <div className="flex flex-col items-start gap-3">
                  <p className="text-body-medium text-on-surface-variant">
                    {terpilih?.email_summary
                      ? `Terkirim ke ${terpilih.email_summary.terkirim} akun, ${waktu(terpilih.email_summary.waktu, data?.time_zone)}.${
                          terpilih.email_summary.gagal > 0 ? ` ${terpilih.email_summary.gagal} gagal.` : ""
                        }`
                      : "Belum dikirim lewat email. Peserta tetap melihatnya di lonceng dan Dashboard saya."}
                  </p>
                  {data?.email_configured ? (
                    <Button
                      type="button"
                      variant="outlined"
                      size="sm"
                      icon={<EnvelopeSimple size={16} />}
                      disabled={berubah || jumlahPenerima === 0}
                      onClick={() => setKonfirmasiEmail(true)}
                    >
                      {terpilih?.email_summary ? "Kirim ulang lewat email" : "Kirim lewat email"}
                    </Button>
                  ) : (
                    <p className="text-body-medium text-on-surface-variant">Pengiriman email belum diaktifkan untuk sistem ini.</p>
                  )}
                  {berubah ? <p className="text-body-small text-on-surface-variant">Simpan perubahan dulu sebelum mengirim email.</p> : null}
                </div>
              </DetailSection>
            ) : null}
          </form>
        </PaneBody>

        <PaneFooter>
          {!baru ? (
            <Button type="button" variant="text" size="sm" icon={<Trash size={16} />} disabled={simpan} onClick={() => setKonfirmasiHapus(true)} className="mr-auto">
              Hapus
            </Button>
          ) : null}
          <Button type="button" variant="outlined" size="sm" disabled={simpan} onClick={tutup}>
            Batal
          </Button>
          <Button type="submit" form="form-pengumuman" size="sm" loading={simpan} disabled={!draft.title.trim() || (!baru && !berubah)}>
            {baru ? "Terbitkan" : "Simpan perubahan"}
          </Button>
        </PaneFooter>
      </Pane>
    );
  }

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        meta={
          data ? (
            <>
              <span className="tabular-nums">{items.length} pengumuman</span>
              <MetaSeparator />
              <span className="tabular-nums">{data.recipients.semua} akun peserta</span>
            </>
          ) : null
        }
        actions={
          data?.ready ? (
            <Button variant={draft ? "outlined" : "filled"} onClick={() => setDraft({ ...KOSONG })} icon={<Plus size={16} weight="bold" />}>
              Tulis pengumuman
            </Button>
          ) : undefined
        }
      />

      {data && !data.ready ? (
        <Banner tone="warning" icon={<Warning size={18} />}>
          Fitur pengumuman belum aktif: migrasi database 202610030002 belum dijalankan di Supabase.
        </Banner>
      ) : data && data.member_enabled === false ? (
        <Banner
          tone="info"
          icon={<Megaphone size={18} />}
          actions={
            <Link href="/admin/landing?bagian=peserta" className="text-label-large font-semibold text-primary underline-offset-4 hover:underline">
              Buka setelan area peserta
            </Link>
          }
        >
          Area peserta acara ini belum dinyalakan, jadi peserta belum bisa masuk dan melihat pengumuman.
        </Banner>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        <ListDetail list={list} detail={detail} detailWidth={440} />
      </div>

      <Dialog
        open={konfirmasiEmail}
        onClose={() => setKonfirmasiEmail(false)}
        dismissible={!kirim}
        icon={<EnvelopeSimple size={22} />}
        title={`Kirim ke ${jumlahPenerima} akun?`}
        description="Email yang sudah terkirim tidak bisa ditarik kembali. Isinya sama dengan yang tampil di Dashboard saya."
        actions={
          <>
            <Button variant="outlined" size="sm" disabled={kirim} onClick={() => setKonfirmasiEmail(false)}>
              Batal
            </Button>
            <Button size="sm" loading={kirim} onClick={() => void kirimEmail()}>
              Kirim email
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="rounded-md border border-outline-variant bg-surface-container-lowest p-4">
            <p className="text-body-small text-on-surface-variant">{PENERIMA[draft.audience]}</p>
            <p className="mt-1 text-title-small font-semibold">{draft.title}</p>
            {draft.body ? <p className="mt-1 line-clamp-4 whitespace-pre-line text-body-medium text-on-surface-variant">{draft.body}</p> : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={konfirmasiHapus}
        onClose={() => setKonfirmasiHapus(false)}
        dismissible={!simpan}
        tone="danger"
        icon={<Trash size={22} />}
        title="Hapus pengumuman ini?"
        description="Pengumuman hilang dari lonceng dan Dashboard saya semua peserta. Email yang sudah terkirim tidak ikut terhapus."
        actions={
          <>
            <Button variant="outlined" size="sm" disabled={simpan} onClick={() => setKonfirmasiHapus(false)}>
              Batal
            </Button>
            <Button variant="danger" size="sm" loading={simpan} onClick={() => void hapus()}>
              Hapus
            </Button>
          </>
        }
      />
    </WorkspacePage>
  );
}
