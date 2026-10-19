"use client";

import { XCircle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button, Dialog, Skeleton } from "@/components/m3";
import { plural } from "@/lib/plural";

/** Sesi yang direset: satu sesi, atau `null` untuk semua sesi peserta ini. */
export type TargetReset = {
  /** `scannerCheckedIn`: check-in salinan Scanner API, yang tidak ikut direset. */
  participant: { id: string; name: string; scannerCheckedIn?: boolean };
  session: { id: number; name: string } | null;
};

type Pratinjau = {
  scans: Array<{ session_id: number; count: number; first: string }>;
  pickups: Array<{ item: string; size: string | null; session_id: number | null }>;
};

/**
 * Konfirmasi reset check-in. Isinya dibaca dari server saat dibuka, supaya
 * yang disebut (jumlah scan, barang kit) persis yang akan terhapus, termasuk
 * barang yang diserahkan di meja dan tidak terlihat di panel ini.
 */
export function ResetCheckInDialog({ target, sessions, jam, onClose, onDone }: {
  target: TargetReset | null;
  sessions: Array<{ id: number; name: string }>;
  jam: (iso: string) => string;
  onClose: () => void;
  onDone: (participantId: string, sessionId: number | null) => void;
}) {
  // Hasil baca disimpan bersama alamatnya: dialog yang dibuka untuk sesi lain
  // tidak pernah menampilkan pratinjau sesi sebelumnya.
  const [muatan, setMuatan] = useState<{ alamat: string; data?: Pratinjau; galat?: string } | null>(null);
  const [galatHapus, setGalatHapus] = useState("");
  const [menghapus, setMenghapus] = useState(false);
  const alamat = target ? `/api/admin/participants/${target.participant.id}/check-in${target.session ? `?session=${target.session.id}` : ""}` : null;
  const pratinjau = muatan?.alamat === alamat ? muatan.data ?? null : null;
  const galat = galatHapus || (muatan?.alamat === alamat ? muatan.galat ?? "" : "");

  useEffect(() => {
    if (!alamat) return;
    let batal = false;
    void fetch(alamat, { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (batal) return;
      if (!response.ok) { setMuatan({ alamat, galat: body.error?.details?.message ?? body.error?.message ?? "Couldn't load this participant's check-ins." }); return; }
      setMuatan({ alamat, data: body as Pratinjau });
    }, () => { if (!batal) setMuatan({ alamat, galat: "Connection lost. Try again." }); });
    return () => { batal = true; };
  }, [alamat]);

  async function reset() {
    if (!alamat || !target) return;
    setMenghapus(true); setGalatHapus("");
    const response = await fetch(alamat, { method: "DELETE" }).catch(() => null);
    setMenghapus(false);
    if (!response) { setGalatHapus("Connection lost. Reload to see whether the check-in was reset."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setGalatHapus(body.error?.details?.message ?? body.error?.message ?? "Couldn't reset the check-in."); return; }
    setGalatHapus(""); setMuatan(null);
    onDone(target.participant.id, target.session?.id ?? null);
  }

  function tutup() { setGalatHapus(""); setMuatan(null); onClose(); }

  const namaSesi = (id: number | null) => sessions.find((sesi) => sesi.id === id)?.name ?? "a deleted session";
  const jumlahScan = pratinjau?.scans.reduce((n, baris) => n + baris.count, 0) ?? 0;
  const kosong = pratinjau !== null && jumlahScan === 0 && pratinjau.pickups.length === 0;
  const title = target?.session ? `Reset check-in at ${target.session.name}?` : `Reset all check-ins for ${target?.participant.name ?? "this participant"}?`;

  return (
    <Dialog
      open={target !== null}
      onClose={tutup}
      dismissible={!menghapus}
      tone="danger"
      title={title}
      description={target?.session
        ? `${target.participant.name} shows as not checked in at ${target.session.name} again, so the next scan there counts as their first.`
        : `${target?.participant.name ?? "This participant"} shows as not checked in everywhere again, so the next scans count as their first.`}
      actions={
        <>
          <Button type="button" variant="outlined" disabled={menghapus} onClick={tutup}>Cancel</Button>
          <Button simpan variant="danger" loading={menghapus} disabled={!pratinjau || kosong} onClick={() => void reset()}>
            {target?.session ? "Reset check-in" : "Reset all"}
          </Button>
        </>
      }
    >
      {pratinjau ? (
        <ul className="mt-1 flex list-disc flex-col gap-1.5 pl-5 text-body-medium text-on-surface">
          {target?.session
            ? jumlahScan > 0 && <li>Removes {plural(jumlahScan, "scan")}{pratinjau.scans[0] ? ` (first at ${jam(pratinjau.scans[0].first)})` : ""}.</li>
            : pratinjau.scans.map((baris) => <li key={baris.session_id}>{namaSesi(baris.session_id)}: removes {plural(baris.count, "scan")} (first at {jam(baris.first)}).</li>)}
          {pratinjau.pickups.length > 0
            ? <li>Kit items count as not handed out again: {pratinjau.pickups.map((item) => item.size ? `${item.item} (${item.size})` : item.item).join(", ")}.</li>
            : null}
          {kosong ? <li>Nothing to reset: no scans or kit hand-outs are recorded{target?.session ? " here" : ""}.</li> : null}
          <li>Checkpoints, points and lucky draw rules that use this check-in update straight away. Lucky draw winners already drawn stay.</li>
          {target?.participant.scannerCheckedIn
            ? <li>The check-in from Scanner API stays: the lucky draw and Client view still count it until it changes in Scanner API.</li>
            : null}
          <li>A copy is kept in the audit trail, but this can&apos;t be undone.</li>
        </ul>
      ) : !galat ? <Skeleton className="h-16 w-full" /> : null}
      {galat ? <p role="alert" className="mt-3 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{galat}</p> : null}
    </Dialog>
  );
}
