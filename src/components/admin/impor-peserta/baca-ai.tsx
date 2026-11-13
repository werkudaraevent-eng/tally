"use client";

import { Sparkle, UploadSimple, Warning } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Banner } from "@/components/m3";
import { siapkanBerkas } from "@/components/admin/logistik/kecilkan-berkas";
import { pesanGalatApi } from "@/lib/api-message";
import { eventApiPath } from "@/lib/event-url";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";

/**
 * Participant list > Import > "Read with AI": daftar peserta dari panitia
 * dalam bentuk apa pun menjadi berkas impor peserta. Komponen ini hanya
 * membaca; berkas hasilnya diteruskan ke dialog (`onBerkas`), lalu pratinjau
 * dan Apply berjalan seperti impor biasa.
 *
 * Tampil hanya bila AI siap di acara ini. Belum dipasang: tidak ada apa-apa
 * (0 px). Batas bulanan habis: satu kalimat alasan.
 */

export type JawabanAiPeserta = {
  run_id: number | null;
  model: string;
  biaya_usd: number;
  orang: number;
  tanpa_nama: number;
  dikosongkan: Array<{ label: string; jumlah: number; contoh: string }>;
  catatan: string[];
  berkas: string;
};

const API = "/api/admin/participants/import/ai";
const TERIMA = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.xlsx,.xlsm,.csv,.tsv,.txt";

export function BacaAiPeserta({ open, disabled, onMulai, onBerkas }: {
  open: boolean;
  disabled: boolean;
  onMulai: () => void;
  onBerkas: (file: File, jawaban: JawabanAiPeserta) => void;
}) {
  const [siap, setSiap] = useState<{ siap: boolean; alasan?: string; pesan?: string; model?: string } | null>(null);
  const [proses, setProses] = useState<number | null>(null);
  const [galat, setGalat] = useState("");
  // Tiap bacaan punya nomor. Dialog ditutup atau bacaan baru dimulai menaikkan
  // nomornya, jadi jawaban yang datang sesudahnya dibuang dan run-nya ditutup.
  const generasi = useRef(0);
  useEffect(() => {
    if (!open) generasi.current += 1;
  }, [open]);
  const [bukaLalu, setBukaLalu] = useState(open);
  if (bukaLalu !== open) {
    setBukaLalu(open);
    if (!open) { setProses(null); setGalat(""); }
  }
  useEffect(() => () => { generasi.current += 1; }, []);

  useEffect(() => {
    if (!open) return;
    let batal = false;
    void fetch(eventApiPath(API), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((json) => { if (!batal) setSiap(json ?? { siap: false }); });
    return () => { batal = true; };
  }, [open]);

  if (!siap) return null;
  if (!siap.siap) {
    return siap.alasan === "batas" && siap.pesan ? (
      <p className="flex items-start gap-2 text-body-small text-on-surface-variant">
        <Sparkle size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>Read with AI (lists in any layout, PDFs, photos): {siap.pesan}</span>
      </p>
    ) : null;
  }

  const baca = async (files: File[]) => {
    if (files.length === 0) return;
    const nomor = ++generasi.current;
    const basi = () => generasi.current !== nomor;
    setGalat("");
    setProses(files.length);
    onMulai();
    const siapKirim = await siapkanBerkas(files);
    if (basi()) return;
    if ("galat" in siapKirim) { setProses(null); setGalat(siapKirim.galat); return; }
    const form = new FormData();
    for (const f of siapKirim.files) form.append("file", f);
    const response = await fetch(eventApiPath(API), { method: "POST", body: form }).catch(() => null);
    const json = response ? await response.json().catch(() => null) : null;
    if (basi()) {
      // Dialog sudah ditutup: hasilnya tidak dipakai, run dicatat "closed".
      const run = (json as { run_id?: number } | null)?.run_id;
      if (response?.ok && run) void fetch(eventApiPath(API), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ run_id: run, status: "closed" }) }).catch(() => null);
      return;
    }
    setProses(null);
    if (response?.status === 413) { setGalat("These files are too large to send at once. Choose fewer files, or send a screenshot of the page instead of the whole PDF."); return; }
    if (!response?.ok || !json) { setGalat(pesanGalatApi(json) ?? (response ? "The AI could not read these files. Try again." : "No connection to Tally. Check the internet, then try again.")); return; }
    const jawaban = json as JawabanAiPeserta;
    const dasar = files[0].name.replace(/\.[^.]+$/, "").slice(0, 120) || "Participants";
    onBerkas(new File([jawaban.berkas], `${dasar}${files.length > 1 ? ` and ${plural(files.length - 1, "more file")}` : ""} (read by AI).csv`, { type: "text/csv" }), jawaban);
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-outline-variant bg-surface-container-lowest px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-[16rem] flex-1 items-start gap-2">
          <Sparkle size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="text-body-medium font-medium text-on-surface">List does not match the template?</p>
            <p className="text-body-medium text-on-surface-variant">
              Choose the committee&apos;s list as it is: Excel with its own columns, PDF, photos of a printed list or chat screenshots, up to 10 at once (4 MB together). AI copies it into the template columns; you see the preview before anything is saved.
            </p>
          </div>
        </div>
        <label className={cx(
          "inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-outline px-4 text-label-large text-primary hover:bg-primary/[0.08] focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2",
          (disabled || proses !== null) && "pointer-events-none opacity-60",
        )}>
          <UploadSimple size={16} aria-hidden />
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

/** Ringkasan bacaan AI di atas pratinjau impor. */
export function RingkasanAiPeserta({ jawaban }: { jawaban: JawabanAiPeserta }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-outline-variant px-4 py-3">
      <p className="text-body-medium font-medium text-on-surface">
        AI read {plural(jawaban.orang, "person", "people")} ({jawaban.model}, ${jawaban.biaya_usd.toFixed(2)})
      </p>
      {jawaban.tanpa_nama > 0 ? (
        <p className="text-body-medium text-on-surface-variant">{plural(jawaban.tanpa_nama, "row")} without a name left out.</p>
      ) : null}
      {jawaban.dikosongkan.length > 0 ? (
        <div className="flex items-start gap-2 text-body-medium text-on-surface-variant">
          <Warning size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <p>
            Left empty because they match no option or format on your form:{" "}
            {jawaban.dikosongkan.map((d, i) => (
              <span key={d.label}>{i > 0 ? "; " : ""}<span className="text-on-surface">{d.label}</span> {d.jumlah}{d.contoh ? ` (e.g. “${d.contoh}”)` : ""}</span>
            ))}
            . Fill them in later in the Participant list.
          </p>
        </div>
      ) : null}
      {jawaban.catatan.length > 0 ? (
        <ul className="list-disc pl-5 text-body-medium text-on-surface-variant">
          {jawaban.catatan.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
