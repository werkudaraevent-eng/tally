"use client";

import { ArrowCounterClockwise, SuitcaseRolling, XCircle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button, DetailSection, Dialog, IconButton, Skeleton, StatusChip } from "@/components/m3";
import { plural } from "@/lib/plural";

/** Satu catatan titip seperti dikirim GET /api/admin/participants/[id]/luggage. */
type Titipan = {
  id: number;
  session_id: number;
  session_name: string;
  bag_count: number;
  photo_url: string | null;
  recorded_at: string;
  by: string | null;
  handed_over_at: string | null;
  handed_over_by: string | null;
};

/**
 * Bagian Luggage di panel detail peserta: jumlah koper, foto dan status per
 * meja titip, dengan reset per catatan untuk uji coba yang diulang atau salah
 * pindai. Dibaca dari server saat panelnya dibuka: fotonya signed URL lima
 * menit, sama dengan layar pemindai, jadi tidak ikut di daftar peserta.
 *
 * `versi` naik setelah reset check-in, yang juga menghapus bagasi sesi itu.
 */
export function BagasiPeserta({ participant, versi, waktu, onReset }: {
  participant: { id: string; name: string };
  versi: number;
  waktu: (iso: string) => string;
  onReset: (participantId: string) => void;
}) {
  const alamat = `/api/admin/participants/${participant.id}/luggage`;
  const kunci = `${alamat}#${versi}`;
  // Hasil disimpan bersama kuncinya: panel peserta lain tidak pernah
  // menampilkan bagasi peserta sebelumnya.
  const [muatan, setMuatan] = useState<{ kunci: string; data?: Titipan[]; galat?: string } | null>(null);
  const [ulang, setUlang] = useState(0);
  const [target, setTarget] = useState<Titipan | null>(null);
  const [menghapus, setMenghapus] = useState(false);
  const [galatHapus, setGalatHapus] = useState("");
  const [fotoGagal, setFotoGagal] = useState<Set<number>>(new Set());

  useEffect(() => {
    let batal = false;
    void fetch(alamat, { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (batal) return;
      if (!response.ok) { setMuatan({ kunci, galat: body.error?.details?.message ?? body.error?.message ?? "Couldn't load this participant's luggage." }); return; }
      setFotoGagal(new Set());
      setMuatan({ kunci, data: (body.drops ?? []) as Titipan[] });
    }, () => { if (!batal) setMuatan({ kunci, galat: "Connection lost. Try again." }); });
    return () => { batal = true; };
  }, [alamat, kunci, ulang]);

  const data = muatan?.kunci === kunci ? muatan.data ?? null : null;
  const galat = muatan?.kunci === kunci ? muatan.galat ?? "" : "";

  async function hapus() {
    if (!target) return;
    setMenghapus(true); setGalatHapus("");
    const response = await fetch(`${alamat}?drop=${target.id}`, { method: "DELETE" }).catch(() => null);
    setMenghapus(false);
    if (!response) { setGalatHapus("Connection lost. Reload to see whether the luggage record was removed."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setGalatHapus(body.error?.details?.message ?? body.error?.message ?? "Couldn't remove the luggage record."); return; }
    setTarget(null);
    setUlang((n) => n + 1);
    onReset(participant.id);
  }

  return (
    <DetailSection title="Luggage">
      {data === null && !galat ? <Skeleton className="h-[72px] w-full" /> : null}
      {galat ? (
        <p role="alert" className="flex items-start gap-2 text-body-medium text-error">
          <XCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{galat}</span>
          <Button variant="text" size="sm" className="-my-1.5" onClick={() => setUlang((n) => n + 1)}>Try again</Button>
        </p>
      ) : null}
      {data && data.length === 0 ? <p className="text-body-medium text-on-surface-variant">No luggage recorded.</p> : null}
      {data?.map((item) => (
        <div key={item.id} className="flex items-start gap-3">
          {item.photo_url && !fotoGagal.has(item.id) ? (
            <a href={item.photo_url} target="_blank" rel="noreferrer" className="m3-state block size-[72px] shrink-0 overflow-hidden rounded-md border border-outline-variant" aria-label={`Open luggage photo from ${item.session_name}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URL privat, bukan aset yang dioptimalkan */}
              <img src={item.photo_url} alt="" className="size-full object-cover" onError={() => setFotoGagal((lama) => new Set(lama).add(item.id))} />
            </a>
          ) : (
            <span className="grid size-[72px] shrink-0 place-items-center rounded-md border border-outline-variant bg-surface-container text-on-surface-variant" aria-hidden>
              <SuitcaseRolling size={24} />
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-body-large font-semibold tabular-nums">{item.bag_count === 0 ? "No luggage" : plural(item.bag_count, "bag")}</span>
            {item.bag_count > 0 ? (
              item.handed_over_at
                ? <span><StatusChip dot tone="success" className="tabular-nums" title={item.handed_over_by ? `By ${item.handed_over_by}` : undefined}>Handed back {waktu(item.handed_over_at)}</StatusChip></span>
                : <span><StatusChip dot>At the desk</StatusChip></span>
            ) : null}
            <span className="text-body-small text-on-surface-variant">
              {item.session_name || "Check-in point"} · {waktu(item.recorded_at)}{item.by ? ` · by ${item.by}` : ""}
            </span>
            {item.photo_url && fotoGagal.has(item.id)
              ? <span><Button variant="text" size="sm" className="-mx-2" onClick={() => setUlang((n) => n + 1)}>Load photo again</Button></span>
              : !item.photo_url && item.bag_count > 0 ? <span className="text-body-small text-on-surface-variant">No photo</span> : null}
          </div>
          <IconButton simpan size="sm" label={`Reset luggage at ${item.session_name || "this check-in point"}`} onClick={() => { setGalatHapus(""); setTarget(item); }}>
            <ArrowCounterClockwise size={16} />
          </IconButton>
        </div>
      ))}
      <Dialog
        open={target !== null}
        onClose={() => { if (!menghapus) setTarget(null); }}
        dismissible={!menghapus}
        tone="danger"
        title="Reset luggage?"
        description={target ? `${participant.name} shows as not having dropped off luggage at ${target.session_name || "this check-in point"}, so the next scan there records it again.` : undefined}
        actions={
          <>
            <Button type="button" variant="outlined" disabled={menghapus} onClick={() => setTarget(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={menghapus} onClick={() => void hapus()}>Reset luggage</Button>
          </>
        }
      >
        {target ? (
          <ul className="mt-1 flex list-disc flex-col gap-1.5 pl-5 text-body-medium text-on-surface">
            <li>Removes {target.bag_count === 0 ? "the “No luggage” record" : plural(target.bag_count, "bag")}{target.photo_url ? " and the photo" : ""}.</li>
            {target.handed_over_at ? <li>The hand-back at {waktu(target.handed_over_at)} is removed too.</li> : null}
            <li>The check-in stays. A copy is kept in the audit trail, but this can&apos;t be undone.</li>
          </ul>
        ) : null}
        {galatHapus ? <p role="alert" className="mt-3 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{galatHapus}</p> : null}
      </Dialog>
    </DetailSection>
  );
}
