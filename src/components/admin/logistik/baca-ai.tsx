"use client";

import { DownloadSimple, Sparkle, Warning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Banner, Button, StatusDot } from "@/components/m3";
import { pesanGalatApi } from "@/lib/api-message";
import { LABEL_STATUS, type HasilTemuan, type StatusTemuan } from "@/lib/ai/logistik-kamar-hasil";
import { eventApiPath } from "@/lib/event-url";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";

/**
 * Logistics > Import > "Read with AI": berkas hotel apa saja menjadi nomor
 * kamar di stay yang sudah ada. Komponen ini hanya membaca: hasilnya berkas
 * impor yang diteruskan ke dialog impor (`onBerkas`), lalu pratinjau dan Save
 * berjalan seperti impor Excel biasa.
 *
 * Tombolnya hanya tampil bila AI siap di acara ini (GET route AI). Bila belum
 * dipasang, tidak ada yang tampil (0 px); bila batas bulanan habis, satu
 * kalimat alasan tampil sebagai gantinya.
 */

export type JawabanAi = {
  run_id: number | null;
  model: string;
  biaya_usd: number;
  hasil: HasilTemuan[];
  catatan: string[];
  berkas: string | null;
};

const TERIMA = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.xlsx,.xlsm,.csv,.tsv,.txt";
const DIPAKAI: StatusTemuan[] = ["diisi", "berubah"];
const NADA: Record<StatusTemuan, "success" | "warning" | "neutral" | "error"> = {
  diisi: "success", berubah: "warning", sama: "neutral", tidak_ditemukan: "error", ganda: "error", bukan_hotel: "error", bentrok: "error", tanpa_nomor: "neutral",
};

export function BacaAi({ open, disabled, onMulai, onBerkas }: {
  open: boolean;
  disabled: boolean;
  /** Dipanggil saat AI mulai membaca: dialog mengosongkan pratinjau lama. */
  onMulai: () => void;
  /** Berkas impor hasil AI (null bila tidak ada yang perlu diimpor), dan jawaban lengkapnya. */
  onBerkas: (file: File | null, jawaban: JawabanAi) => void;
}) {
  const [siap, setSiap] = useState<{ siap: boolean; alasan?: string; pesan?: string; model?: string } | null>(null);
  const [proses, setProses] = useState<number | null>(null);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!open) return;
    let batal = false;
    void fetch(eventApiPath("/api/admin/logistik/impor/ai"), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((json) => { if (!batal) setSiap(json ?? { siap: false }); });
    return () => { batal = true; };
  }, [open]);

  if (!siap) return null;
  if (!siap.siap) {
    // Belum dipasang (tanpa migrasi, tanpa kunci, fitur mati): tidak tampil sama
    // sekali, supaya dialog acara lama tetap 0 px. Hanya batas bulanan yang
    // disebut, karena admin sudah biasa melihat tombolnya.
    return siap.alasan === "batas" && siap.pesan ? (
      <p className="flex items-start gap-2 text-body-small text-on-surface-variant">
        <Sparkle size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>Read with AI (hotel PDFs, photos, chat screenshots): {siap.pesan}</span>
      </p>
    ) : null;
  }

  const baca = async (files: File[]) => {
    if (files.length === 0) return;
    setGalat("");
    setProses(files.length);
    onMulai();
    const form = new FormData();
    for (const f of files) form.append("file", f);
    const response = await fetch(eventApiPath("/api/admin/logistik/impor/ai"), { method: "POST", body: form }).catch(() => null);
    const json = response ? await response.json().catch(() => null) : null;
    setProses(null);
    if (!response?.ok || !json) { setGalat(pesanGalatApi(json) ?? "The AI could not read these files. Try again."); return; }
    const jawaban = json as JawabanAi;
    onBerkas(jawaban.berkas ? new File([jawaban.berkas], "Room numbers read by AI.tsv", { type: "text/tab-separated-values" }) : null, jawaban);
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-outline-variant bg-surface-container-lowest px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Sparkle size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="text-body-medium font-medium text-on-surface">File does not match the template?</p>
            <p className="text-body-small text-on-surface-variant">
              Choose the hotel&apos;s rooming list, PDF, photos of room keys or chat screenshots, up to 10 at once. AI fills only the room numbers of people already in Stays, so nobody moves rooms. You see the preview before anything is saved.
            </p>
          </div>
        </div>
        <label className={cx(
          "inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-label-large text-on-primary focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2",
          (disabled || proses !== null) && "pointer-events-none opacity-60",
        )}>
          <Sparkle size={16} aria-hidden />
          Read with AI
          <input
            type="file"
            multiple
            accept={TERIMA}
            className="sr-only"
            disabled={disabled || proses !== null}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = "";
              void baca(files);
            }}
          />
        </label>
      </div>
      {proses !== null ? (
        <p className="text-body-medium text-on-surface-variant" role="status">Reading {plural(proses, "file")} with AI ({siap.model}). This can take up to 2 minutes…</p>
      ) : null}
      {galat ? <Banner tone="warning" icon={<Warning size={18} />}>{galat}</Banner> : null}
    </div>
  );
}

/** Ringkasan bacaan AI di atas pratinjau impor: berapa yang dipakai, dan siapa yang tidak, beserta alasannya. */
export function RingkasanAi({ jawaban }: { jawaban: JawabanAi }) {
  const [buka, setBuka] = useState(false);
  const total = jawaban.hasil.length;
  const hitung = (s: StatusTemuan) => jawaban.hasil.filter((h) => h.status === s).length;
  const urutan: StatusTemuan[] = ["diisi", "berubah", "sama", "tidak_ditemukan", "ganda", "bukan_hotel", "bentrok", "tanpa_nomor"];
  const lewat = jawaban.hasil.filter((h) => !DIPAKAI.includes(h.status) && h.status !== "sama");

  const unduh = () => {
    const baris = [["Name in file", "Name in Tally", "Hotel", "Room number", "Saved now", "Result"], ...jawaban.hasil.map((h) => [h.namaBerkas, h.namaTally ?? "", h.hotel, h.nomor, h.lama ?? "", LABEL_STATUS[h.status]])];
    const csv = "﻿" + baris.map((b) => b.map((isi) => `"${isi.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "ai-room-numbers.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-outline-variant px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-medium font-medium text-on-surface">AI read {plural(total, "guest")} ({jawaban.model}, ${jawaban.biaya_usd.toFixed(2)})</p>
        <Button variant="text" size="sm" icon={<DownloadSimple size={16} />} onClick={unduh}>Download what AI read</Button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-body-medium text-on-surface-variant">
        {urutan.map((s) => hitung(s) > 0 ? (
          <span key={s} className="inline-flex items-center gap-1.5 tabular-nums">
            <StatusDot tone={NADA[s]} />
            {LABEL_STATUS[s]}: <span className="text-on-surface">{hitung(s)} of {total}</span>
          </span>
        ) : null)}
      </div>
      {jawaban.catatan.length > 0 ? (
        <ul className="list-disc pl-5 text-body-small text-on-surface-variant">
          {jawaban.catatan.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      ) : null}
      {lewat.length > 0 ? (
        <div className="flex flex-col gap-1">
          <Button variant="text" size="sm" className="self-start" onClick={() => setBuka(!buka)} aria-expanded={buka}>
            {buka ? "Hide" : "Show"} {plural(lewat.length, "guest")} not imported
          </Button>
          {buka ? (
            <ul className="flex max-h-[30dvh] flex-col overflow-y-auto rounded-md border border-outline-variant">
              {lewat.map((h, i) => (
                <li key={i} className="flex flex-col gap-0.5 border-b border-outline-variant px-3 py-2 text-body-medium last:border-b-0 sm:flex-row sm:gap-3">
                  <span className="text-on-surface sm:w-56 sm:shrink-0">{h.namaBerkas}{h.nomor ? ` · ${h.nomor}` : ""}</span>
                  <span className="text-on-surface-variant">{LABEL_STATUS[h.status]}{h.namaTally && h.namaTally !== h.namaBerkas ? ` (${h.namaTally})` : ""}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-body-small text-on-surface-variant">To import them: fix the name in the Participant list, or download what AI read, correct it, and fill the numbers into Download current stays.</p>
        </div>
      ) : null}
      {!jawaban.berkas ? (
        <p className="text-body-medium text-on-surface">Nothing to import: {hitung("sama") > 0 ? "every room number AI found is already saved in Tally." : "no guest in these files matched someone in Stays."}</p>
      ) : null}
    </div>
  );
}
