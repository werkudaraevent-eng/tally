"use client";

import { useRouter } from "next/navigation";
import { ArrowClockwise, ArrowLeft, Copy, Hourglass, PauseCircle, Play, Warning, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import Link from "@/components/event-link";
import {
  Banner,
  Button,
  Dialog,
  EmptyState,
  FilterChip,
  MetaSeparator,
  Pagination,
  StatusChip,
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableSkeleton,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import { withEventPrefix } from "@/lib/event-path";
import { plural } from "@/lib/plural";
import { labelAlasan, labelAlasanJeda } from "@/lib/pesan/alasan";
import { BLAST_STATUS_LABEL, BLAST_STATUS_TONE, audienceLabel, waktu, type BlastStatus } from "../../pesan-shared";

/**
 * Laporan satu kiriman (gambar 4-log). Angka utama "Sudah masuk ke acara",
 * bukan "dibuka": buka email tidak bisa dipercaya karena Apple Mail memuat
 * gambar pelacak sendiri, sedangkan masuk berarti tautannya benar-benar dipakai.
 */

type Status = "antre" | "ditahan" | "mengirim" | "terkirim" | "diterima" | "dibaca" | "tidak_pasti" | "gagal_sementara" | "gagal_tetap" | "dilewati";

const LABEL: Record<Status, string> = {
  antre: "Queued",
  ditahan: "Held",
  mengirim: "Sending",
  terkirim: "Sent",
  diterima: "Delivered",
  dibaca: "Read",
  tidak_pasti: "Unconfirmed",
  gagal_sementara: "Retrying",
  gagal_tetap: "Failed",
  dilewati: "Skipped",
};

const NADA: Record<Status, "neutral" | "primary" | "success" | "warning" | "error"> = {
  antre: "neutral",
  ditahan: "neutral",
  mengirim: "neutral",
  terkirim: "primary",
  diterima: "success",
  dibaca: "success",
  tidak_pasti: "warning",
  gagal_sementara: "error",
  gagal_tetap: "error",
  dilewati: "neutral",
};

type Kelompok = "semua" | "bisa_dicoba" | "gagal_tetap" | "tidak_pasti" | "belum_masuk" | "dilewati";

export type DetailTerkirim = {
  blast: {
    id: string;
    title: string;
    kind: "undangan" | "info" | "invitation";
    channel: "email" | "whatsapp" | "keduanya";
    audience: { jenis?: string; label?: string; perusahaan?: string[]; ids?: string[] } | null;
    status: Exclude<BlastStatus, "draf">;
    scheduled_at: string | null;
    sent_at: string | null;
    finished_at: string | null;
    hold_until?: string | null;
    paused_reason?: string | null;
  };
  counts: Record<Status, number>;
  signed_in: number;
  time_zone?: string;
  invitation_sending?: { ok: true } | { ok: false; missing: string[] };
};

type Baris = {
  id: number;
  participant_id: string | null;
  address: string;
  name: string;
  status: Status;
  reason: string | null;
  reason_code: string | null;
  signed_in_at: string | null;
};

type Halaman = { rows: Baris[]; total: number; page: number; page_size: number };

export function Laporan({ detail, onReload }: { detail: DetailTerkirim; onReload: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const { blast, counts } = detail;
  const [kelompok, setKelompok] = useState<Kelompok>("semua");
  const [halaman, setHalaman] = useState(0);
  const [data, setData] = useState<Halaman | null>(null);
  const [dialog, setDialog] = useState<null | "ulang" | "batal" | "lanjutkan">(null);
  const [sibuk, setSibuk] = useState(false);

  const total = Object.entries(counts).reduce((a, [s, n]) => (s === "dilewati" ? a : a + n), 0);
  const diterima = counts.diterima + counts.dibaca;
  const gagal = counts.gagal_sementara + counts.gagal_tetap;
  const berjalan = counts.antre + counts.mengirim;
  const tamu = blast.kind === "invitation";
  const dijeda = blast.status === "dijeda";
  const orang = (n: number) => plural(n, tamu ? "invited guest" : "participant");
  const undangan = (n: number) => plural(n, "invitation");
  const persen = total > 0 ? Math.round((detail.signed_in / total) * 100) : 0;

  const muatBaris = useCallback(async () => {
    const response = await fetch(`/api/admin/pesan/${blast.id}/penerima?kelompok=${kelompok}&halaman=${halaman}`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      toast.error("Couldn't load recipients", "Reload the page.");
      return;
    }
    setData((await response.json()) as Halaman);
  }, [blast.id, kelompok, halaman, toast]);

  useEffect(() => {
    // Muat dari server saat halaman dibuka atau saringan berubah.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void muatBaris();
  }, [muatBaris]);

  // Selama masih mengirim, ringkasan dan tabel disegarkan tiap 5 detik.
  useEffect(() => {
    if (blast.status !== "mengirim") return;
    const t = setInterval(() => {
      onReload();
      void muatBaris();
    }, 5000);
    return () => clearInterval(t);
  }, [blast.status, onReload, muatBaris]);

  async function aksi(jalur: "ulang" | "batal" | "lanjutkan") {
    setSibuk(true);
    const response = await fetch(`/api/admin/pesan/${blast.id}/${jalur}`, { method: "POST" }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setSibuk(false);
    setDialog(null);
    if (!response?.ok) {
      toast.error(
        jalur === "ulang" ? "Retry failed" : jalur === "lanjutkan" ? "Blast not resumed" : dijeda ? "Blast not cancelled" : "Schedule not cancelled",
        body?.error?.message ?? "Try again.",
      );
      return;
    }
    toast.success(
      jalur === "ulang"
        ? `${plural(body?.requeued ?? 0, "email")} queued again`
        : jalur === "lanjutkan"
          ? `${undangan(body?.released ?? 0)} resumed`
          : dijeda
            ? "Rest of the blast cancelled"
            : "Schedule cancelled",
    );
    onReload();
    void muatBaris();
  }

  async function duplikat() {
    setSibuk(true);
    const response = await fetch("/api/admin/pesan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: blast.kind, dari: blast.id }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setSibuk(false);
    if (!response?.ok) {
      toast.error("Couldn't duplicate the blast", body?.error?.message ?? "Try again.");
      return;
    }
    router.push(withEventPrefix(`/admin/pengumuman/kiriman/${body.id}`, window.location.pathname));
  }

  function pilih(k: Kelompok) {
    setKelompok(k);
    setHalaman(0);
    setData(null);
  }

  const kapan =
    dijeda
      ? `${undangan(counts.ditahan ?? 0)} held`
      : blast.status === "terjadwal" && blast.scheduled_at
      ? `Scheduled for ${waktu(blast.scheduled_at, detail.time_zone)}`
      : blast.status === "selesai" && blast.finished_at
        ? `Finished ${waktu(blast.finished_at, detail.time_zone)}`
        : blast.sent_at
          ? `Started ${waktu(blast.sent_at, detail.time_zone)}`
          : BLAST_STATUS_LABEL[blast.status];

  const chips: { value: Kelompok; label: string; count: number | null }[] = [
    { value: "semua", label: "All", count: total + counts.dilewati },
    { value: "bisa_dicoba", label: "Retrying", count: counts.gagal_sementara },
    { value: "gagal_tetap", label: "Failed", count: counts.gagal_tetap },
    { value: "tidak_pasti", label: "Unconfirmed", count: counts.tidak_pasti },
    { value: "belum_masuk", label: tamu ? "Not registered yet" : "Not signed in yet", count: Math.max(0, total - detail.signed_in) },
    { value: "dilewati", label: "Skipped", count: counts.dilewati },
  ];

  return (
    <div lang="en" className="contents">
    <WorkspacePage>
      <WorkspaceHeader
        title={blast.title}
        back={
          <Link href="/admin/pengumuman" className="inline-flex items-center gap-1.5 rounded-sm text-body-medium font-medium text-primary hover:underline">
            <ArrowLeft size={14} aria-hidden />
            Messages
          </Link>
        }
        meta={
          <>
            <StatusChip tone={BLAST_STATUS_TONE[blast.status]}>{BLAST_STATUS_LABEL[blast.status]}</StatusChip>
            <span>{kapan}</span>
            <MetaSeparator />
            <span>Email</span>
            <MetaSeparator />
            <span>{audienceLabel(blast.audience)}</span>
          </>
        }
        actions={
          <>
            <Button variant="outlined" onClick={() => void duplikat()} disabled={sibuk} icon={<Copy size={16} />}>
              Duplicate
            </Button>
            {dijeda ? (
              <>
                <Button variant="outlined" onClick={() => setDialog("batal")} icon={<XCircle size={16} />}>
                  Cancel the rest
                </Button>
                <Button onClick={() => setDialog("lanjutkan")} icon={<Play size={16} />}>
                  Resume blast…
                </Button>
              </>
            ) : blast.status === "terjadwal" ? (
              <Button variant="outlined" onClick={() => setDialog("batal")} icon={<XCircle size={16} />}>
                Cancel schedule
              </Button>
            ) : counts.gagal_sementara > 0 ? (
              <Button onClick={() => setDialog("ulang")} icon={<ArrowClockwise size={16} />}>
                Retry ({counts.gagal_sementara})…
              </Button>
            ) : null}
          </>
        }
      />

      {dijeda ? (
        <Banner tone="warning" icon={<PauseCircle size={18} />}>
          Blast paused automatically. {labelAlasanJeda(blast.paused_reason) ?? "Check the report before resuming."} {undangan(counts.ditahan ?? 0)} not sent yet, waiting for your decision.
        </Banner>
      ) : tamu && blast.status === "mengirim" && detail.invitation_sending?.ok === false && detail.invitation_sending.missing.includes("EMAIL_FROM_UNDANGAN") && berjalan > 0 ? (
        <Banner tone="warning" icon={<PauseCircle size={18} />}>
          Blast on hold: the system owner hasn&apos;t set up the invitation sender (EMAIL_FROM_UNDANGAN) yet. {undangan(berjalan)} waiting. They go out automatically once it&apos;s set up.
        </Banner>
      ) : tamu && blast.hold_until && blast.status === "mengirim" ? (
        <Banner tone="info" icon={<Hourglass size={18} />}>
          The first wave has gone out. The rest are sent after {waktu(blast.hold_until, detail.time_zone)} if few bounce and nobody reports spam.
        </Banner>
      ) : null}

      {counts.tidak_pasti > 0 ? (
        <Banner tone="warning" icon={<Warning size={18} />}>
          {plural(counts.tidak_pasti, "email")} Unconfirmed: the provider didn&apos;t confirm whether they were sent. They aren&apos;t retried automatically, so nobody gets them twice.
        </Banner>
      ) : null}

      <section aria-label="Summary" className="grid overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest sm:grid-cols-2">
        <div className="flex flex-col gap-1 border-b border-outline-variant px-5 py-4 sm:border-b-0 sm:border-e">
          <h2 className="text-label-medium font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
            {blast.kind === "undangan" ? "Signed in" : tamu ? "Registered" : "Signed in after the blast"}
          </h2>
          <p className="text-body-large text-on-surface-variant">
            <span className="me-2 text-headline-small font-semibold text-on-surface tabular-nums">{detail.signed_in}</span>
            of <span className="tabular-nums">{total}</span> ({persen}%)
          </p>
        </div>
        <div className="flex flex-col gap-1 px-5 py-4">
          <h2 className="text-label-medium font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
            Email · <span className="tabular-nums">{total}</span>
          </h2>
          <p className="text-body-large tabular-nums">
            {diterima} delivered
            {berjalan > 0 ? <> · {berjalan} queued</> : null}
            {(counts.ditahan ?? 0) > 0 ? <> · {counts.ditahan} held</> : null}
            {counts.terkirim > 0 ? <> · {counts.terkirim} sent</> : null}
            {gagal > 0 ? <span className="text-error"> · {gagal} failed</span> : null}
          </p>
        </div>
      </section>

      <div role="group" aria-label="Filter recipients" className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <FilterChip key={c.value} selected={kelompok === c.value} onClick={() => pilih(c.value)}>
            {c.label} <span className="tabular-nums">{c.count}</span>
          </FilterChip>
        ))}
      </div>

      {!data ? (
        <TableCard>
          <TableSkeleton rows={6} cols={4} />
        </TableCard>
      ) : data.rows.length === 0 ? (
        <EmptyState title="No recipients in this group" description="Choose another chip to see other recipients." />
      ) : (
        <>
          <TableCard>
            <Table minWidth="720px">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{tamu ? "Invited guest" : "Participant"}</TableHeaderCell>
                  <TableHeaderCell>Email</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>{tamu ? "Registered" : "Signed in"}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell strong>{r.name}</TableCell>
                    <TableCell className="text-on-surface-variant">{r.address || "–"}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <StatusChip tone={NADA[r.status]}>{LABEL[r.status]}</StatusChip>
                        {r.reason || r.reason_code ? <span className="text-body-small text-on-surface-variant">{labelAlasan(r.reason_code, r.reason, tamu ? "tamu" : "peserta")}</span> : null}
                        {/* Hanya yang bisa diperbaiki di data peserta. Berhenti langganan dan
                            jadwal yang dibatalkan bukan untuk "diperbaiki". */}
                        {r.status === "gagal_tetap" || (r.status === "dilewati" && (r.reason_code === "tanpa_email" || r.reason_code === "email_memantul")) ? (
                          <Link href={tamu ? "/admin/registrasi" : "/admin/participants"} className="text-body-small font-medium text-primary hover:underline">
                            Fix
                          </Link>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell numeric>{r.signed_in_at ? waktu(r.signed_in_at, detail.time_zone) : "–"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
          {data.total > data.page_size ? (
            <Pagination page={data.page + 1} pageCount={Math.ceil(data.total / data.page_size)} total={data.total} pageSize={data.page_size} onChange={(p) => setHalaman(p - 1)} />
          ) : null}
        </>
      )}

      <Dialog
        open={dialog === "ulang"}
        onClose={() => setDialog(null)}
        dismissible={!sibuk}
        title={`Retry sending to ${orang(counts.gagal_sementara)}?`}
        description="Only emails that are Retrying (provider busy or a short-term limit). Failed and Unconfirmed are left out, so nobody gets the email twice."
        actions={
          <>
            <Button variant="text" onClick={() => setDialog(null)} disabled={sibuk}>
              Cancel
            </Button>
            <Button onClick={() => void aksi("ulang")} loading={sibuk}>
              Retry
            </Button>
          </>
        }
      />
      <Dialog
        open={dialog === "batal"}
        onClose={() => setDialog(null)}
        dismissible={!sibuk}
        tone="danger"
        title={dijeda ? "Cancel the rest of this blast?" : "Cancel this schedule?"}
        description={
          dijeda
            ? `${undangan(counts.ditahan ?? 0)} on hold won't be sent. Emails already sent aren't affected.`
            : "No emails go out. To send it later, duplicate it and schedule it again."
        }
        actions={
          <>
            <Button variant="text" onClick={() => setDialog(null)} disabled={sibuk}>
              Back
            </Button>
            <Button variant="danger" onClick={() => void aksi("batal")} loading={sibuk}>
              {dijeda ? "Cancel the rest" : "Cancel schedule"}
            </Button>
          </>
        }
      />
      <Dialog
        open={dialog === "lanjutkan"}
        onClose={() => setDialog(null)}
        dismissible={!sibuk}
        title={`Resume ${undangan(counts.ditahan ?? 0)}?`}
        description="The remaining invitations are sent right away and won't be paused automatically again. Only resume if you're sure this list comes from staff or the client and the addresses are still active."
        actions={
          <>
            <Button variant="text" onClick={() => setDialog(null)} disabled={sibuk}>
              Back
            </Button>
            <Button onClick={() => void aksi("lanjutkan")} loading={sibuk}>
              Resume blast
            </Button>
          </>
        }
      />
    </WorkspacePage>
    </div>
  );
}
