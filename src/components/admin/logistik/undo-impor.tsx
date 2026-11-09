"use client";

import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/m3";
import { useToast } from "@/components/toast";
import { pesanGalatApi } from "@/lib/api-message";
import { eventApiPath } from "@/lib/event-url";
import { plural } from "@/lib/plural";

/**
 * "Undo this import" di dialog impor, tab Hotel stays.
 *
 * Baris "Last import" hanya muncul bila ada impor Hotel stays yang masih bisa
 * di-undo (yang terakhir, belum dibatalkan, paling lama 7 hari). Sebelum
 * migrasi 202611090010 server menjawab `null`, jadi dialognya tidak berubah.
 * Menekan Undo import mengganti isi dialog dengan pratinjau: berapa orang dan
 * kamar yang kembali, dan siapa yang dibiarkan karena berubah sesudah impor.
 */

type Impor = { id: number; file_name: string | null; created_at: string; user_name: string | null; ai: boolean };
type HasilBatal = { orang: number; kamar: number; dihapus: number; hotelDihapus: number; dilewati: Array<{ nama: string; alasan: string }> };

const API = "/api/admin/logistik/impor/batal";

const waktu = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function useUndoImpor({ open, aktif, onSelesai, onTutup }: {
  open: boolean;
  /** Tab Hotel stays sedang dipilih dan tidak ada pratinjau atau hasil lain. */
  aktif: boolean;
  onSelesai: () => Promise<void>;
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
    void fetch(eventApiPath(API)).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((json: { impor?: Impor | null } | null) => {
      if (!batal) setImpor(json?.impor ?? null);
    });
    return () => { batal = true; };
  }, [open, muat]);

  const kirim = async (terapkan: boolean) => {
    if (!impor) return null;
    const r = await fetch(eventApiPath(API), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: impor.id, terapkan }) }).catch(() => null);
    if (!r) return { galat: "Connection failed. Try again." };
    const json = await r.json().catch(() => ({}));
    if (!r.ok) return { galat: pesanGalatApi(json) ?? "The import could not be undone." };
    return (json as { hasil: HasilBatal }).hasil;
  };

  const mulai = async () => {
    setProses(true);
    setGalat("");
    const jawaban = await kirim(false);
    setProses(false);
    if (!jawaban) return;
    if ("galat" in jawaban) { setGalat(jawaban.galat); return; }
    setHasil(jawaban);
    setTahap("pratinjau");
  };

  const terapkan = async () => {
    setProses(true);
    setGalat("");
    const jawaban = await kirim(true);
    if (!jawaban || "galat" in jawaban) {
      setProses(false);
      setGalat(jawaban?.galat ?? "");
      setMuat((n) => n + 1);
      return;
    }
    await onSelesai();
    setProses(false);
    setImpor(null);
    setMuat((n) => n + 1);
    if (jawaban.dilewati.length === 0) {
      const isiToast = ringkasan(jawaban);
      toast.success("Import undone", isiToast ? `${isiToast.charAt(0).toUpperCase()}${isiToast.slice(1)} put back.` : undefined);
      selesai();
      onTutup();
      return;
    }
    setHasil(jawaban);
    setTahap("hasil");
  };

  const selesai = () => { setTahap(null); setHasil(null); setGalat(""); };

  const baris = aktif && impor && !tahap ? (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-outline-variant px-3 py-1.5">
      <ArrowCounterClockwise size={16} className="shrink-0 text-on-surface-variant" aria-hidden />
      <p className="min-w-0 flex-1 text-body-small text-on-surface-variant">
        Last import: <span className="text-on-surface">{impor.file_name ?? "File"}</span>
        {" · "}{waktu(impor.created_at)}{impor.user_name ? ` · ${impor.user_name}` : ""}
      </p>
      <Button variant="text" size="sm" loading={proses} disabled={proses} onClick={() => void mulai()}>Undo import</Button>
      {galat ? <p role="alert" className="w-full text-body-small text-error">{galat}</p> : null}
    </div>
  ) : null;

  const isi = tahap && hasil ? (
    <div className="flex flex-col gap-3">
      <p className="text-body-medium text-on-surface">
        {tahap === "pratinjau"
          ? hasil.orang + hasil.kamar === 0
            ? "Nothing from this import can be put back: everything it touched has changed since."
            : `This puts ${ringkasan(hasil)} back as they were before ${impor ? waktu(impor.created_at) : "the import"}.${dibuatImpor(hasil)}`
          : `Undone: ${ringkasan(hasil) || "nothing"} put back. These were left as they are:`}
      </p>
      {tahap === "pratinjau" && hasil.dilewati.length > 0 ? (
        <p className="text-body-medium text-on-surface-variant">Left as they are, because they changed after the import:</p>
      ) : null}
      {hasil.dilewati.length > 0 ? (
        <ul className="flex max-h-[44dvh] flex-col overflow-y-auto rounded-md border border-outline-variant">
          {hasil.dilewati.map((d, i) => (
            <li key={i} className="flex flex-col gap-0.5 border-b border-outline-variant px-4 py-2 last:border-b-0 sm:flex-row sm:gap-3">
              <span className="text-body-medium text-on-surface sm:w-56 sm:shrink-0">{d.nama}</span>
              <span className="text-body-medium text-on-surface-variant">{d.alasan}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {galat ? <p role="alert" className="text-body-small text-error">{galat}</p> : null}
    </div>
  ) : null;

  const aksi = tahap === "pratinjau" ? (
    <>
      <Button variant="outlined" disabled={proses} onClick={selesai}>Cancel</Button>
      <Button loading={proses} disabled={proses || hasil?.orang === 0 && hasil?.kamar === 0} onClick={() => void terapkan()}>Undo import</Button>
    </>
  ) : tahap === "hasil" ? (
    <Button onClick={() => { selesai(); onTutup(); }}>Done</Button>
  ) : null;

  return { baris, isi, aksi, sibuk: proses, judul: tahap ? "Undo the last import" : null, segarkan: () => setMuat((n) => n + 1) };
}

/** Kamar dan hotel yang dibuat impor ini dihapus lagi bila kosong. */
function dibuatImpor(h: HasilBatal) {
  const bagian = [h.dihapus > 0 ? plural(h.dihapus, "room") : "", h.hotelDihapus > 0 ? plural(h.hotelDihapus, "hotel") : ""].filter(Boolean).join(" and ");
  return bagian ? ` The ${bagian} this import created ${h.dihapus + h.hotelDihapus === 1 ? "is" : "are"} removed if no one is left in ${h.dihapus + h.hotelDihapus === 1 ? "it" : "them"}.` : "";
}

/** "the stays of 42 people and 12 rooms", kosong bila tidak ada. */
function ringkasan(h: HasilBatal) {
  return [
    h.orang > 0 ? `the stays of ${plural(h.orang, "person", "people")}` : "",
    h.kamar > 0 ? plural(h.kamar, "room") : "",
  ].filter(Boolean).join(" and ");
}
