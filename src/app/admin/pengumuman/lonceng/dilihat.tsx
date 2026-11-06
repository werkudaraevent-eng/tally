"use client";

import { ArrowClockwise, DownloadSimple, EnvelopeSimple, MagnifyingGlass, PaperPlaneTilt, UsersThree } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  DetailSection,
  Dialog,
  EmptyState,
  FilterChip,
  StatusChip,
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextField,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import { withEventPrefix } from "@/lib/event-path";
import { keCsv } from "@/lib/logistik/tabel";
import { persenDilihat, type RingkasDilihat, type StatusDilihat } from "@/lib/pengumuman-dilihat";
import { plural } from "@/lib/plural";

/**
 * "Seen by participants" untuk satu pengumuman, dan dialog siapa yang belum
 * melihatnya. Definisinya di lib/pengumuman-dilihat.ts: membuka lonceng atau
 * tab Pengumuman setelah pengumuman ini terbit. Email dibuka dan pop-up yang
 * ditutup tidak dihitung.
 *
 * Rujukan: WhatsApp "Message info" (Read by / Delivered to), Microsoft Teams
 * "Seen by". Labelnya "Seen", bukan "Read", karena hanya itu yang terbukti.
 */

type Orang = { participant_id: string; name: string; company: string | null; status: StatusDilihat; last_opened: string | null };
type Laporan = { id: string; published_at: string; summary: RingkasDilihat; people: Orang[] };

const LABEL: Record<StatusDilihat, string> = { dilihat: "Seen", belum: "Not seen yet", belum_masuk: "Never signed in" };
const NADA: Record<StatusDilihat, "success" | "warning" | "neutral"> = { dilihat: "success", belum: "warning", belum_masuk: "neutral" };
const URUTAN: StatusDilihat[] = ["belum", "belum_masuk", "dilihat"];

/** Ringkasan semua pengumuman untuk kolom Seen di daftar. `kunci` berganti = muat ulang. */
export function useRingkasDilihat(kunci: string): Map<string, RingkasDilihat> | null {
  const [hasil, setHasil] = useState<Map<string, RingkasDilihat> | null>(null);
  useEffect(() => {
    if (!kunci) return;
    let batal = false;
    void fetch("/api/admin/pengumuman/dilihat", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("dilihat"))))
      .then((body: { items: Record<string, RingkasDilihat> }) => {
        if (!batal) setHasil(new Map(Object.entries(body.items ?? {})));
      })
      .catch(() => null);
    return () => {
      batal = true;
    };
  }, [kunci]);
  return hasil;
}

/** Isi sel kolom Seen di daftar: "312 / 446". */
export function SelDilihat({ ringkas }: { ringkas: RingkasDilihat | undefined }) {
  if (!ringkas) return <span className="text-on-surface-variant">–</span>;
  return (
    <span className="tabular-nums" title={`${ringkas.dilihat} of ${ringkas.total} seen`}>
      {ringkas.dilihat}
      <span className="text-on-surface-variant"> / {ringkas.total}</span>
    </span>
  );
}

export function BagianDilihat({
  id,
  publishedAt,
  sentAgain,
  timeZone,
  waktu,
  bolehPesan,
}: {
  id: string;
  publishedAt: string;
  /** Notify again dipakai: hitungannya sejak kiriman ulang. */
  sentAgain: boolean;
  timeZone?: string;
  waktu: (iso: string, timeZone?: string) => string;
  /** Boleh membuat kiriman Messages (bukan peran View saja). */
  bolehPesan: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [data, setData] = useState<Laporan | null>(null);
  const [galat, setGalat] = useState(false);
  const [muatUlang, setMuatUlang] = useState(0);
  const [memuat, setMemuat] = useState(false);
  const [buka, setBuka] = useState(false);
  const [kelompok, setKelompok] = useState<StatusDilihat>("belum");
  const [cari, setCari] = useState("");
  const [membuatPesan, setMembuatPesan] = useState(false);

  const muat = useCallback(async () => {
    setMemuat(true);
    setGalat(false);
    const response = await fetch(`/api/admin/pengumuman/dilihat?id=${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setMemuat(false);
    if (!response?.ok || !body?.summary) {
      setGalat(true);
      return;
    }
    setData(body as Laporan);
  }, [id]);

  useEffect(() => {
    // Muat dari server saat pengumuman dipilih, dikirim ulang, atau Refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void muat();
  }, [muat, publishedAt, muatUlang]);

  // Pengumuman lain dipilih: mulai dari ringkasan kosong, bukan angka pengumuman sebelumnya.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData((lama) => (lama && lama.id === id ? lama : null));
  }, [id]);

  const ringkas = data?.id === id ? data.summary : null;
  const persen = ringkas ? persenDilihat(ringkas) : 0;
  const baris = useMemo(() => {
    if (!data) return [];
    const kata = cari.trim().toLowerCase();
    return data.people
      .filter((orang) => orang.status === kelompok)
      .filter((orang) => !kata || orang.name.toLowerCase().includes(kata))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, kelompok, cari]);

  function bukaDialog() {
    const awal = ringkas && ringkas.belum === 0 && ringkas.belum_masuk > 0 ? "belum_masuk" : "belum";
    setKelompok(awal);
    setCari("");
    setBuka(true);
  }

  function unduh() {
    if (!data) return;
    const urut = [...data.people].sort((a, b) => URUTAN.indexOf(a.status) - URUTAN.indexOf(b.status) || a.name.localeCompare(b.name));
    const csv = keCsv(
      ["Name", "Company", "Status", "Last opened portal"],
      urut.map((orang) => [[orang.name], [orang.company ?? ""], [LABEL[orang.status]], [orang.last_opened ? waktu(orang.last_opened, timeZone) : ""]]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "announcement-seen.csv";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Buka penyusun Messages dengan orang di chip ini sebagai penerimanya. */
  async function kirimPesan() {
    const semua = data?.people.filter((orang) => orang.status === kelompok) ?? [];
    if (!semua.length) return;
    setMembuatPesan(true);
    const response = await fetch("/api/admin/pesan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Belum pernah masuk: tautan masuk. Sudah masuk tapi belum melihat: pesan biasa.
        kind: kelompok === "belum_masuk" ? "undangan" : "info",
        audience: {
          jenis: "manual",
          perusahaan: [],
          ids: semua.map((orang) => orang.participant_id),
          label: kelompok === "belum_masuk" ? "Never signed in" : "Haven't seen an announcement",
        },
      }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setMembuatPesan(false);
    if (!response?.ok || !body?.id) {
      toast.error("Couldn't start the message", body?.error?.message ?? "Try again.");
      return;
    }
    router.push(withEventPrefix(`/admin/pengumuman/kiriman/${body.id}`, window.location.pathname));
  }

  const jumlahKelompok = ringkas ? ringkas[kelompok] : 0;

  return (
    <DetailSection title="Seen by participants">
      <div className="flex flex-col gap-3">
        {!ringkas ? (
          galat ? (
            <p className="text-body-medium text-on-surface-variant">Couldn&apos;t load who has seen it. Try Refresh.</p>
          ) : (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
              <div className="h-8 w-40 animate-pulse rounded-sm bg-surface-container-high" />
              <div className="h-2.5 w-full animate-pulse rounded-full bg-surface-container-high" />
            </div>
          )
        ) : ringkas.total === 0 ? (
          <p className="text-body-medium text-on-surface-variant">Nobody matches Send to right now, so there&apos;s no one to count.</p>
        ) : (
          <>
            <p className="text-body-large text-on-surface-variant">
              <span className="me-2 text-headline-small font-semibold text-on-surface tabular-nums">{ringkas.dilihat}</span>
              of <span className="tabular-nums">{ringkas.total}</span> seen <span className="tabular-nums">({persen}%)</span>
            </p>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-container-high" aria-hidden="true">
              <span className="bg-success" style={{ width: `${(ringkas.dilihat / ringkas.total) * 100}%` }} />
              <span className="bg-warning" style={{ width: `${(ringkas.belum / ringkas.total) * 100}%` }} />
            </div>
            <dl className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
              {(["dilihat", "belum", "belum_masuk"] as const).map((kunci) => (
                <div key={kunci} className="flex flex-col gap-0.5 rounded-md border border-outline-variant px-3 py-2">
                  <dt className="flex items-center gap-1.5 text-body-small text-on-surface-variant">
                    <span
                      aria-hidden="true"
                      className={kunci === "dilihat" ? "size-2.5 shrink-0 rounded-[3px] bg-success" : kunci === "belum" ? "size-2.5 shrink-0 rounded-[3px] bg-warning" : "size-2.5 shrink-0 rounded-[3px] bg-outline"}
                    />
                    {kunci === "belum" ? "Signed in, not seen yet" : LABEL[kunci]}
                  </dt>
                  <dd className="text-title-medium font-semibold tabular-nums">{ringkas[kunci]}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        <p className="text-body-small text-on-surface-variant">
          Counted since it was {sentAgain ? "sent again" : "posted"} {waktu(publishedAt, timeZone)}. Seen means the person opened the bell or the Announcements tab after that, including from the email button. Email opens and closing a pop-up aren&apos;t counted.
        </p>
        <div className="flex flex-wrap gap-2">
          {ringkas && ringkas.total > 0 ? (
            <Button type="button" size="sm" icon={<UsersThree size={16} />} disabled={ringkas.belum + ringkas.belum_masuk === 0 && ringkas.dilihat === 0} onClick={bukaDialog}>
              {ringkas.belum + ringkas.belum_masuk > 0 ? "See who hasn't seen it" : "See who has seen it"}
            </Button>
          ) : null}
          <Button type="button" variant="outlined" size="sm" icon={<ArrowClockwise size={16} />} loading={memuat} onClick={() => setMuatUlang((n) => n + 1)}>
            Refresh
          </Button>
        </div>
      </div>

      <Dialog
        open={buka}
        onClose={() => setBuka(false)}
        dismissible={!membuatPesan}
        size="xl"
        fullScreenOnMobile
        scrollBody
        icon={<UsersThree size={22} />}
        title="Seen by participants"
        description={ringkas ? `${plural(ringkas.total, "person", "people")} this announcement is for. Counted since ${waktu(publishedAt, timeZone)}.` : undefined}
        actions={
          <>
            <Button variant="outlined" size="sm" icon={<DownloadSimple size={16} />} disabled={!data || membuatPesan} onClick={unduh}>
              Export CSV
            </Button>
            {bolehPesan && kelompok !== "dilihat" ? (
              <Button
                size="sm"
                icon={kelompok === "belum_masuk" ? <PaperPlaneTilt size={16} /> : <EnvelopeSimple size={16} />}
                loading={membuatPesan}
                disabled={jumlahKelompok === 0}
                onClick={() => void kirimPesan()}
              >
                {kelompok === "belum_masuk" ? `Send sign-in link to ${jumlahKelompok}` : `Message these ${plural(jumlahKelompok, "person", "people")}`}
              </Button>
            ) : (
              <Button variant="outlined" size="sm" disabled={membuatPesan} onClick={() => setBuka(false)}>
                Close
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div role="group" aria-label="Filter people" className="flex flex-wrap gap-2">
            {URUTAN.map((kunci) => (
              <FilterChip key={kunci} selected={kelompok === kunci} onClick={() => setKelompok(kunci)}>
                {LABEL[kunci]} <span className="tabular-nums">{ringkas ? ringkas[kunci] : 0}</span>
              </FilterChip>
            ))}
          </div>
          <TextField
            label="Search name"
            value={cari}
            onChange={(event) => setCari(event.target.value)}
            leading={<MagnifyingGlass size={16} />}
          />
          {baris.length === 0 ? (
            <EmptyState
              plain
              title={cari.trim() ? "No names match" : `Nobody is in ${LABEL[kelompok]}`}
              description={cari.trim() ? "Check the spelling or choose another chip." : "Choose another chip to see other people."}
            />
          ) : (
            <TableCard>
              <Table minWidth="520px" density="compact">
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Participant</TableHeaderCell>
                    <TableHeaderCell>Company</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Last opened portal</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {baris.map((orang) => (
                    <TableRow key={orang.participant_id}>
                      <TableCell strong>{orang.name}</TableCell>
                      <TableCell className="text-on-surface-variant">{orang.company || "–"}</TableCell>
                      <TableCell>
                        <StatusChip tone={NADA[orang.status]}>{LABEL[orang.status]}</StatusChip>
                      </TableCell>
                      <TableCell numeric>{orang.last_opened ? waktu(orang.last_opened, timeZone) : "–"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          )}
        </div>
      </Dialog>
    </DetailSection>
  );
}
