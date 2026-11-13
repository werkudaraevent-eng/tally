"use client";

import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/m3";
import { useToast } from "@/components/toast";
import { pesanGalatApi } from "@/lib/api-message";
import { eventApiPath } from "@/lib/event-url";
import { plural } from "@/lib/plural";

/**
 * "Undo import" di dialog Import peserta.
 *
 * Baris "Last import" hanya muncul bila ada impor peserta yang masih bisa
 * di-undo (yang terakhir, belum dibatalkan, paling lama 7 hari). Sebelum
 * migrasi 202611130030 server menjawab `null`, jadi dialognya tidak berubah.
 * Undo import mengganti isi dialog dengan pratinjau: siapa yang dihapus lagi,
 * siapa yang dikembalikan, dan siapa yang dibiarkan beserta alasannya.
 */

type Impor = { id: number; file_name: string | null; created_at: string; user_name: string | null; ai: boolean; inserted: number; updated: number };
type Alasan = "removed" | "changed" | "has_records";
type HasilBatal = { removed: number; restored: number; kept: number; kept_list: Array<{ name: string | null; reason: Alasan }>; kept_truncated: boolean };

const API = "/api/admin/participants/import/batal";

const ALASAN: Record<Alasan, string> = {
  removed: "Deleted since the import",
  changed: "Edited since the import",
  has_records: "Added by the import and already has check-ins, seats or other records",
};

const waktu = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Pratinjau: "removes the 12 participants this import added and puts 3 participants back as they were" */
function ringkasan(h: HasilBatal) {
  return [
    h.removed > 0 ? `removes the ${plural(h.removed, "participant")} this import added` : "",
    h.restored > 0 ? `puts ${plural(h.restored, "participant")} back as they were` : "",
  ].filter(Boolean).join(" and ");
}

/** Hasil: "12 participants removed, 3 put back" */
function ringkasanHasil(h: HasilBatal) {
  return [
    h.removed > 0 ? `${plural(h.removed, "participant")} removed` : "",
    h.restored > 0 ? `${plural(h.restored, "participant")} put back` : "",
  ].filter(Boolean).join(", ");
}

export function useUndoImporPeserta({ open, aktif, onSelesai, onTutup }: {
  open: boolean;
  /** Belum ada berkas, pratinjau atau bacaan AI di dialog. */
  aktif: boolean;
  onSelesai: () => void;
  onTutup: () => void;
}) {
  const toast = useToast();
  const [impor, setImpor] = useState<Impor | null>(null);
  const [muat, setMuat] = useState(0);
  const [tahap, setTahap] = useState<"pratinjau" | "hasil" | null>(null);
  const [hasil, setHasil] = useState<HasilBatal | null>(null);
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!open) return;
    let batal = false;
    void fetch(eventApiPath(API), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((json: { impor?: Impor | null } | null) => {
      if (!batal) setImpor(json?.impor ?? null);
    });
    return () => { batal = true; };
  }, [open, muat]);

  const kirim = async (terapkan: boolean): Promise<HasilBatal | { galat: string } | null> => {
    if (!impor) return null;
    const r = await fetch(eventApiPath(API), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: impor.id, terapkan }) }).catch(() => null);
    if (!r) return { galat: "Connection failed. Try again." };
    const json = await r.json().catch(() => ({}));
    if (!r.ok) return { galat: pesanGalatApi(json) ?? "The import could not be undone." };
    return (json as { hasil: HasilBatal }).hasil;
  };

  const selesai = () => { setTahap(null); setHasil(null); setGalat(""); };
  // Ditutup (Esc, X) di tengah pratinjau atau hasil: dibuka lagi mulai dari formulir.
  if (!open && (tahap !== null || hasil !== null || galat)) selesai();

  const mulai = async () => {
    setProses(true);
    setGalat("");
    const jawaban = await kirim(false);
    setProses(false);
    if (!jawaban) return;
    if ("galat" in jawaban) { setGalat(jawaban.galat); setMuat((n) => n + 1); return; }
    setHasil(jawaban);
    setTahap("pratinjau");
  };

  const terapkan = async () => {
    setProses(true);
    setGalat("");
    const jawaban = await kirim(true);
    setProses(false);
    if (!jawaban || "galat" in jawaban) {
      setGalat(jawaban?.galat ?? "");
      setMuat((n) => n + 1);
      return;
    }
    onSelesai();
    setImpor(null);
    setMuat((n) => n + 1);
    if (jawaban.kept === 0) {
      const isi = ringkasanHasil(jawaban);
      toast.success("Import undone", isi ? `${isi.charAt(0).toUpperCase()}${isi.slice(1)}.` : undefined);
      selesai();
      onTutup();
      return;
    }
    setHasil(jawaban);
    setTahap("hasil");
  };

  const baris = aktif && impor && !tahap ? (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-outline-variant px-3 py-1.5">
      <ArrowCounterClockwise size={16} className="shrink-0 text-on-surface-variant" aria-hidden />
      <p className="min-w-0 flex-1 text-body-small text-on-surface-variant">
        Last import: <span className="text-on-surface">{impor.ai ? "Read with AI" : impor.file_name ?? "File"}</span>
        {" · "}{plural(impor.inserted, "added", "added")}, {impor.updated} updated{" · "}{waktu(impor.created_at)}{impor.user_name ? ` · ${impor.user_name}` : ""}
      </p>
      <Button variant="text" loading={proses} disabled={proses} onClick={() => void mulai()}>Undo import</Button>
      {galat ? <p role="alert" className="w-full text-body-small text-error">{galat}</p> : null}
    </div>
  ) : null;

  const daftarTetap = hasil && hasil.kept_list.length > 0 ? (
    <ul className="flex max-h-[44dvh] flex-col overflow-y-auto rounded-md border border-outline-variant">
      {hasil.kept_list.map((d, i) => (
        <li key={i} className="flex flex-col gap-0.5 border-b border-outline-variant px-4 py-2 last:border-b-0 sm:flex-row sm:gap-3">
          <span className="text-body-medium text-on-surface sm:w-56 sm:shrink-0">{d.name || "Unnamed"}</span>
          <span className="text-body-medium text-on-surface-variant">{ALASAN[d.reason] ?? d.reason}</span>
        </li>
      ))}
      {hasil.kept_truncated ? <li className="px-4 py-2 text-body-small italic text-on-surface-variant">List cut off at the first 50 people.</li> : null}
    </ul>
  ) : null;

  const isi = tahap && hasil ? (
    <div className="flex flex-col gap-3 text-body-medium">
      <p className="text-on-surface">
        {tahap === "pratinjau"
          ? hasil.removed + hasil.restored === 0
            ? "Nothing from this import can be undone: everyone it touched has changed since."
            : `This ${ringkasan(hasil)} before ${impor ? waktu(impor.created_at) : "the import"}.`
          : `Undone: ${ringkasanHasil(hasil) || "nothing changed"}.`}
      </p>
      {tahap === "pratinjau" && hasil.removed + hasil.restored > 0 ? (
        <p className="text-on-surface-variant">Seats the import set stay as they are. Undo works once, for the last import only.</p>
      ) : null}
      {hasil.kept > 0 ? (
        <p className="text-on-surface-variant">{plural(hasil.kept, "participant")} {tahap === "pratinjau" ? "will be" : "were"} left as they are:</p>
      ) : null}
      {daftarTetap}
      {galat ? <p role="alert" className="text-body-small text-error">{galat}</p> : null}
    </div>
  ) : null;

  const aksi = tahap === "pratinjau" ? (
    <>
      <Button variant="outlined" disabled={proses} onClick={selesai}>Cancel</Button>
      <Button loading={proses} disabled={proses || (hasil?.removed === 0 && hasil?.restored === 0)} onClick={() => void terapkan()}>Undo import</Button>
    </>
  ) : tahap === "hasil" ? (
    <Button onClick={() => { selesai(); onTutup(); }}>Done</Button>
  ) : null;

  return { baris, isi, aksi, sibuk: proses, judul: tahap ? "Undo the last import" : null, segarkan: () => setMuat((n) => n + 1) };
}
