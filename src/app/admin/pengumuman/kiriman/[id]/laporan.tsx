"use client";

import { useRouter } from "next/navigation";
import { ArrowClockwise, ArrowLeft, Copy, Warning, XCircle } from "@phosphor-icons/react";
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
import { BLAST_STATUS_LABEL, BLAST_STATUS_TONE, audienceLabel, waktu, type BlastStatus } from "../../pesan-shared";

/**
 * Laporan satu kiriman (gambar 4-log). Angka utama "Sudah masuk ke acara",
 * bukan "dibuka": buka email tidak bisa dipercaya karena Apple Mail memuat
 * gambar pelacak sendiri, sedangkan masuk berarti tautannya benar-benar dipakai.
 */

type Status = "antre" | "mengirim" | "terkirim" | "diterima" | "dibaca" | "tidak_pasti" | "gagal_sementara" | "gagal_tetap" | "dilewati";

const LABEL: Record<Status, string> = {
  antre: "Antre",
  mengirim: "Sedang dikirim",
  terkirim: "Terkirim",
  diterima: "Diterima",
  dibaca: "Dibaca",
  tidak_pasti: "Tidak pasti",
  gagal_sementara: "Gagal, bisa dicoba",
  gagal_tetap: "Gagal tetap",
  dilewati: "Dilewati",
};

const NADA: Record<Status, "neutral" | "primary" | "success" | "warning" | "error"> = {
  antre: "neutral",
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
    kind: "undangan" | "info";
    channel: "email" | "whatsapp" | "keduanya";
    audience: { jenis?: string; label?: string; perusahaan?: string[]; ids?: string[] } | null;
    status: Exclude<BlastStatus, "draf">;
    scheduled_at: string | null;
    sent_at: string | null;
    finished_at: string | null;
  };
  counts: Record<Status, number>;
  signed_in: number;
  time_zone?: string;
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
  const [dialog, setDialog] = useState<null | "ulang" | "batal">(null);
  const [sibuk, setSibuk] = useState(false);

  const total = Object.entries(counts).reduce((a, [s, n]) => (s === "dilewati" ? a : a + n), 0);
  const diterima = counts.diterima + counts.dibaca;
  const gagal = counts.gagal_sementara + counts.gagal_tetap;
  const berjalan = counts.antre + counts.mengirim;
  const persen = total > 0 ? Math.round((detail.signed_in / total) * 100) : 0;

  const muatBaris = useCallback(async () => {
    const response = await fetch(`/api/admin/pesan/${blast.id}/penerima?kelompok=${kelompok}&halaman=${halaman}`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      toast.error("Daftar penerima gagal dimuat", "Muat ulang halaman.");
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

  async function aksi(jalur: "ulang" | "batal") {
    setSibuk(true);
    const response = await fetch(`/api/admin/pesan/${blast.id}/${jalur}`, { method: "POST" }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setSibuk(false);
    setDialog(null);
    if (!response?.ok) {
      toast.error(jalur === "ulang" ? "Kirim ulang gagal" : "Jadwal tidak dibatalkan", body?.error?.message ?? "Coba lagi.");
      return;
    }
    toast.success(jalur === "ulang" ? `${body?.requeued ?? 0} email masuk antrean lagi` : "Jadwal dibatalkan");
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
      toast.error("Duplikat gagal", body?.error?.message ?? "Coba lagi.");
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
    blast.status === "terjadwal" && blast.scheduled_at
      ? `Dijadwalkan ${waktu(blast.scheduled_at, detail.time_zone)}`
      : blast.status === "selesai" && blast.finished_at
        ? `Selesai ${waktu(blast.finished_at, detail.time_zone)}`
        : blast.sent_at
          ? `Berangkat ${waktu(blast.sent_at, detail.time_zone)}`
          : BLAST_STATUS_LABEL[blast.status];

  const chips: { value: Kelompok; label: string; count: number | null }[] = [
    { value: "semua", label: "Semua", count: total + counts.dilewati },
    { value: "bisa_dicoba", label: "Bisa dicoba", count: counts.gagal_sementara },
    { value: "gagal_tetap", label: "Gagal tetap", count: counts.gagal_tetap },
    { value: "tidak_pasti", label: "Tidak pasti", count: counts.tidak_pasti },
    { value: "belum_masuk", label: "Belum masuk", count: Math.max(0, total - detail.signed_in) },
    { value: "dilewati", label: "Dilewati", count: counts.dilewati },
  ];

  return (
    <WorkspacePage>
      <WorkspaceHeader
        title={blast.title}
        back={
          <Link href="/admin/pengumuman" className="inline-flex items-center gap-1.5 rounded-sm text-body-medium font-medium text-primary hover:underline">
            <ArrowLeft size={14} aria-hidden />
            Pesan peserta
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
              Duplikat
            </Button>
            {blast.status === "terjadwal" ? (
              <Button variant="outlined" onClick={() => setDialog("batal")} icon={<XCircle size={16} />}>
                Batalkan jadwal
              </Button>
            ) : counts.gagal_sementara > 0 ? (
              <Button onClick={() => setDialog("ulang")} icon={<ArrowClockwise size={16} />}>
                Kirim ulang yang bisa dicoba ({counts.gagal_sementara})…
              </Button>
            ) : null}
          </>
        }
      />

      {counts.tidak_pasti > 0 ? (
        <Banner tone="warning" icon={<Warning size={18} />}>
          {counts.tidak_pasti} email berstatus Tidak pasti: penyedia tidak memberi kabar apakah sudah terkirim. Tidak dikirim ulang otomatis supaya peserta tidak menerima dua kali.
        </Banner>
      ) : null}

      <section aria-label="Ringkasan" className="grid overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest sm:grid-cols-2">
        <div className="flex flex-col gap-1 border-b border-outline-variant px-5 py-4 sm:border-b-0 sm:border-e">
          <h2 className="text-label-medium font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
            {blast.kind === "undangan" ? "Sudah masuk ke acara" : "Masuk setelah kiriman"}
          </h2>
          <p className="text-body-large text-on-surface-variant">
            <span className="me-2 text-headline-small font-semibold text-on-surface tabular-nums">{detail.signed_in}</span>
            dari <span className="tabular-nums">{total}</span> ({persen}%)
          </p>
        </div>
        <div className="flex flex-col gap-1 px-5 py-4">
          <h2 className="text-label-medium font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
            Email · <span className="tabular-nums">{total}</span>
          </h2>
          <p className="text-body-large tabular-nums">
            {diterima} diterima
            {berjalan > 0 ? <> · {berjalan} dalam antrean</> : null}
            {counts.terkirim > 0 ? <> · {counts.terkirim} terkirim</> : null}
            {gagal > 0 ? <span className="text-error"> · {gagal} gagal</span> : null}
          </p>
        </div>
      </section>

      <div role="group" aria-label="Saring penerima" className="flex flex-wrap gap-2">
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
        <EmptyState title="Tidak ada penerima di kelompok ini" description="Pilih chip lain untuk melihat penerima lainnya." />
      ) : (
        <>
          <TableCard>
            <Table minWidth="720px">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Peserta</TableHeaderCell>
                  <TableHeaderCell>Email</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Masuk</TableHeaderCell>
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
                        {r.reason ? <span className="text-body-small text-on-surface-variant">{r.reason}</span> : null}
                        {/* Hanya yang bisa diperbaiki di data peserta. Berhenti langganan dan
                            jadwal yang dibatalkan bukan untuk "diperbaiki". */}
                        {r.status === "gagal_tetap" || (r.status === "dilewati" && (r.reason_code === "tanpa_email" || r.reason_code === "email_memantul")) ? (
                          <Link href="/admin/participants" className="text-body-small font-medium text-primary hover:underline">
                            Perbaiki
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
        title={`Kirim ulang ke ${counts.gagal_sementara} peserta?`}
        description="Hanya email yang gagal sementara (penyedia sibuk atau batas sesaat). Gagal tetap dan Tidak pasti tidak ikut, supaya tidak ada yang menerima dua kali."
        actions={
          <>
            <Button variant="text" onClick={() => setDialog(null)} disabled={sibuk}>
              Batal
            </Button>
            <Button onClick={() => void aksi("ulang")} loading={sibuk}>
              Kirim ulang
            </Button>
          </>
        }
      />
      <Dialog
        open={dialog === "batal"}
        onClose={() => setDialog(null)}
        dismissible={!sibuk}
        tone="danger"
        title="Batalkan jadwal ini?"
        description="Tidak ada email yang berangkat. Untuk mengirimnya lagi, buat duplikat lalu jadwalkan ulang."
        actions={
          <>
            <Button variant="text" onClick={() => setDialog(null)} disabled={sibuk}>
              Kembali
            </Button>
            <Button variant="danger" onClick={() => void aksi("batal")} loading={sibuk}>
              Batalkan jadwal
            </Button>
          </>
        }
      />
    </WorkspacePage>
  );
}
