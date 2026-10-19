"use client";

import { XCircle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button, Dialog, Skeleton } from "@/components/m3";
import { plural } from "@/lib/plural";

/** Sesi yang direset: satu sesi, atau `null` untuk semua sesi peserta ini. */
export type TargetReset = { participant: { id: string; name: string }; session: { id: number; name: string } | null };

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
  const [pratinjau, setPratinjau] = useState<Pratinjau | null>(null);
  const [galat, setGalat] = useState("");
  const [menghapus, setMenghapus] = useState(false);
  const alamat = target ? `/api/admin/participants/${target.participant.id}/check-in${target.session ? `?session=${target.session.id}` : ""}` : null;

  useEffect(() => {
    setPratinjau(null); setGalat("");
    if (!alamat) return;
    let batal = false;
    void fetch(alamat, { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (batal) return;
      if (!response.ok) { setGalat(body.error?.details?.message ?? body.error?.message ?? "Couldn't load this participant's check-ins."); return; }
      setPratinjau(body as Pratinjau);
    }, () => { if (!batal) setGalat("Connection lost. Try again."); });
    return () => { batal = true; };
  }, [alamat]);

  async function reset() {
    if (!alamat || !target) return;
    setMenghapus(true); setGalat("");
    const response = await fetch(alamat, { method: "DELETE" }).catch(() => null);
    setMenghapus(false);
    if (!response) { setGalat("Connection lost. Reload to see whether the check-in was reset."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setGalat(body.error?.details?.message ?? body.error?.message ?? "Couldn't reset the check-in."); return; }
    onDone(target.participant.id, target.session?.id ?? null);
  }

  const namaSesi = (id: number | null) => sessions.find((sesi) => sesi.id === id)?.name ?? "a deleted session";
  const jumlahScan = pratinjau?.scans.reduce((n, baris) => n + baris.count, 0) ?? 0;
  const title = target?.session ? `Reset check-in at ${target.session.name}?` : `Reset all check-ins for ${target?.participant.name ?? "this participant"}?`;

  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      dismissible={!menghapus}
      tone="danger"
      title={title}
      description={target?.session
        ? `${target.participant.name} shows as not checked in here again, so the next scan counts as their first.`
        : `${target?.participant.name ?? "This participant"} shows as not checked in everywhere again, so the next scans count as their first.`}
      actions={
        <>
          <Button type="button" variant="outlined" disabled={menghapus} onClick={onClose}>Cancel</Button>
          <Button simpan variant="danger" loading={menghapus} disabled={!pratinjau || (jumlahScan === 0 && pratinjau.pickups.length === 0)} onClick={() => void reset()}>
            {target?.session ? "Reset check-in" : "Reset all"}
          </Button>
        </>
      }
    >
      {pratinjau ? (
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body-medium text-on-surface">
          {target?.session
            ? <li>Removes {plural(jumlahScan, "scan")}{pratinjau.scans[0] ? ` (first at ${jam(pratinjau.scans[0].first)})` : ""}.</li>
            : pratinjau.scans.map((baris) => <li key={baris.session_id}>{namaSesi(baris.session_id)}: removes {plural(baris.count, "scan")} (first at {jam(baris.first)}).</li>)}
          {pratinjau.pickups.length > 0
            ? <li>Kit items go back to not handed out: {pratinjau.pickups.map((item) => item.size ? `${item.item} (${item.size})` : item.item).join(", ")}.</li>
            : null}
          <li>Checkpoints, points and lucky draw rules that use this check-in update straight away. Lucky draw winners already drawn stay.</li>
          <li>Recorded in the audit trail.</li>
        </ul>
      ) : !galat ? <Skeleton className="h-16 w-full" /> : null}
      {galat ? <p role="alert" className="mt-3 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{galat}</p> : null}
    </Dialog>
  );
}
