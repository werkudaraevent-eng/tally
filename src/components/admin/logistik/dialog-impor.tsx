"use client";

import { DownloadSimple, FileXls, UploadSimple, Warning } from "@phosphor-icons/react";
import { useState } from "react";
import { Banner, Button, Dialog, SegmentedButton, StatusDot } from "@/components/m3";
import { useToast } from "@/components/toast";
import { pesanGalatApi } from "@/lib/api-message";
import { eventApiPath } from "@/lib/event-url";
import type { BarisRencana, JenisImpor, Rencana, StatusBaris } from "@/lib/logistik/impor";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";

/**
 * Impor Excel untuk Logistik: rooming list dari hotel, atau daftar bus.
 *
 * Dua langkah dengan berkas yang sama. Memilih berkas langsung meminta
 * pratinjau (tidak ada yang ditulis), lalu Simpan mengirim berkas itu lagi dan
 * server menyusun rencananya ulang dari keadaan terbaru sebelum menulis.
 * Berkas dikirim ulang, bukan rencananya, supaya klien tidak bisa menyuruh
 * server menempatkan orang yang tidak ada di berkas.
 */

type Hasil = { masuk: number; dibuat: string[]; gagal: Array<{ nama: string; alasan: string }> };

const URAIAN: Record<JenisImpor, string> = {
  kamar: "One row per person: Hotel, Room, then QR code or Name. Hotels and rooms that do not exist yet are created; fill in Type and Capacity for new rooms.",
  bus: "One row per person: Bus, then QR code or Name. Buses that do not exist yet are created with no capacity limit.",
};

const STATUS: Record<StatusBaris, { label: string; tone: "success" | "warning" | "neutral" | "error" }> = {
  masuk: { label: "Added", tone: "success" },
  pindah: { label: "Moved", tone: "warning" },
  tetap: { label: "Unchanged", tone: "neutral" },
  tolak: { label: "Rejected", tone: "error" },
};

// Pratinjau ribuan baris tetap cepat; ringkasan di atas tabel menghitung semuanya.
const BATAS_TAMPIL = 500;

export function DialogImpor({ open, jenisAwal, onClose, onSelesai }: {
  open: boolean;
  jenisAwal: JenisImpor;
  onClose: () => void;
  /** Dipanggil setelah penyimpanan, untuk memuat ulang data halaman. */
  onSelesai: () => Promise<void>;
}) {
  const toast = useToast();
  const [jenis, setJenis] = useState<JenisImpor>(jenisAwal);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [rencana, setRencana] = useState<Rencana | null>(null);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [galat, setGalat] = useState("");
  const [proses, setProses] = useState<"baca" | "simpan" | null>(null);
  const [hanyaTolak, setHanyaTolak] = useState(false);
  const [bukaUntuk, setBukaUntuk] = useState<JenisImpor | null>(null);

  // Keadaan dikosongkan setiap kali dialog dibuka, dengan jenis dari tab yang
  // sedang tampil. Disetel saat render, bukan di efek, supaya tidak ada satu
  // bingkai yang masih menampilkan pratinjau impor sebelumnya.
  if (open && bukaUntuk === null) {
    setBukaUntuk(jenisAwal);
    setJenis(jenisAwal);
    setBerkas(null);
    setRencana(null);
    setHasil(null);
    setGalat("");
    setHanyaTolak(false);
  }
  if (!open && bukaUntuk !== null) setBukaUntuk(null);

  const kirim = async (file: File, jenisBerkas: JenisImpor, simpan: boolean) => {
    const form = new FormData();
    form.set("file", file);
    form.set("jenis", jenisBerkas);
    if (simpan) form.set("simpan", "1");
    const response = await fetch(eventApiPath("/api/admin/logistik/impor"), { method: "POST", body: form }).catch(() => null);
    if (!response) return { galat: "Connection failed. Try again." };
    const json = await response.json().catch(() => ({}));
    if (!response.ok) return { galat: pesanGalatApi(json) ?? "The file could not be read." };
    return json as { rencana: Rencana; hasil?: Hasil };
  };

  const baca = async (file: File | null, jenisBerkas: JenisImpor) => {
    setBerkas(file);
    setRencana(null);
    setHasil(null);
    setGalat("");
    setHanyaTolak(false);
    if (!file) return;
    setProses("baca");
    const jawaban = await kirim(file, jenisBerkas, false);
    setProses(null);
    if ("galat" in jawaban) setGalat(jawaban.galat);
    else setRencana(jawaban.rencana);
  };

  const simpan = async () => {
    if (!berkas) return;
    setProses("simpan");
    const jawaban = await kirim(berkas, jenis, true);
    if ("galat" in jawaban) {
      setProses(null);
      setGalat(jawaban.galat);
      return;
    }
    await onSelesai();
    setProses(null);
    const selesai = jawaban.hasil!;
    const dibuat = selesai.dibuat.length > 0 ? `Created ${selesai.dibuat.join(" and ")}.` : "";
    if (selesai.gagal.length === 0) {
      toast.success(`${plural(selesai.masuk, "person", "people")} assigned`, dibuat || undefined);
      onClose();
      return;
    }
    // Sebagian gagal: dialog tetap terbuka dan menyebut siapa saja, supaya
    // panitia bisa membetulkan orang itu tanpa mencocokkan ulang seluruh berkas.
    setRencana(null);
    setHasil(selesai);
  };

  const hitung = (status: StatusBaris) => rencana?.baris.filter((b) => b.status === status).length ?? 0;
  const akanDitulis = hitung("masuk") + hitung("pindah");
  const dibuatNanti = rencana
    ? [
        rencana.hotelBaru.length > 0 ? plural(rencana.hotelBaru.length, "hotel") : null,
        rencana.kamarBaru.length > 0 ? plural(rencana.kamarBaru.length, "room") : null,
        rencana.busBaru.length > 0 ? plural(rencana.busBaru.length, "bus", "buses") : null,
      ].filter(Boolean)
    : [];
  const tampil = (rencana?.baris ?? []).filter((b) => !hanyaTolak || b.status === "tolak");
  const sibuk = proses !== null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!sibuk}
      size="xl"
      icon={<FileXls size={20} />}
      title={jenis === "kamar" ? "Import rooms from Excel" : "Import buses from Excel"}
      description={hasil ? undefined : URAIAN[jenis]}
      actions={hasil ? (
        <Button onClick={onClose}>Done</Button>
      ) : (
        <>
          <Button variant="outlined" disabled={sibuk} onClick={onClose}>Cancel</Button>
          <Button
            simpan
            loading={proses === "simpan"}
            disabled={!rencana || proses === "baca" || (akanDitulis === 0 && dibuatNanti.length === 0)}
            onClick={() => void simpan()}
          >
            {akanDitulis > 0 ? `Save ${plural(akanDitulis, "assignment")}` : "Save"}
          </Button>
        </>
      )}
    >
      {hasil ? (
        <div className="flex flex-col gap-3">
          <p className="text-body-medium text-on-surface">
            {plural(hasil.masuk, "person", "people")} assigned{hasil.dibuat.length > 0 ? `, and created ${hasil.dibuat.join(" and ")}` : ""}. {plural(hasil.gagal.length, "person", "people")} could not be assigned because things changed since the preview:
          </p>
          <ul className="flex max-h-[44dvh] flex-col overflow-y-auto rounded-md border border-outline-variant">
            {hasil.gagal.map((g, i) => (
              <li key={i} className="flex flex-col gap-0.5 border-b border-outline-variant px-4 py-2 last:border-b-0 sm:flex-row sm:gap-3">
                <span className="text-body-medium text-on-surface sm:w-56 sm:shrink-0">{g.nama}</span>
                <span className="text-body-medium text-on-surface-variant">{g.alasan}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <SegmentedButton<JenisImpor>
            label="File contents"
            value={jenis}
            onChange={(nilai) => { setJenis(nilai); if (berkas) void baca(berkas, nilai); }}
            options={[{ value: "kamar", label: "Hotel rooms" }, { value: "bus", label: "Buses" }]}
            className="self-start"
          />

          <div className="flex flex-wrap items-center gap-2">
            <label className={cx(
              "inline-flex h-9 min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-md border border-dashed border-outline px-3 text-body-medium hover:bg-primary-soft focus-within:ring-2 focus-within:ring-primary",
              sibuk && "pointer-events-none opacity-60",
            )}>
              <UploadSimple size={16} className="shrink-0" aria-hidden />
              <span className="truncate">{berkas ? berkas.name : "Choose an .xlsx or .csv file"}</span>
              <input
                type="file"
                accept=".xlsx,.xlsm,.csv,.txt,.tsv"
                className="sr-only"
                disabled={sibuk}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  // Dikosongkan supaya memilih berkas yang sama lagi (setelah
                  // dibetulkan di Excel) tetap memicu pratinjau baru.
                  event.target.value = "";
                  void baca(file, jenis);
                }}
              />
            </label>
            <Button
              variant="text"
              size="sm"
              icon={<DownloadSimple size={16} />}
              onClick={() => { window.location.href = eventApiPath(`/api/admin/logistik/impor?jenis=${jenis}`); }}
            >
              Download template
            </Button>
          </div>

          {proses === "baca" ? <p className="text-body-medium text-on-surface-variant">Reading file…</p> : null}
          {galat ? <Banner tone="warning" icon={<Warning size={18} />}>{galat}</Banner> : null}

          {rencana ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-medium text-on-surface-variant">
                {(["masuk", "pindah", "tetap", "tolak"] as const).map((status) => hitung(status) > 0 ? (
                  <span key={status} className="inline-flex items-center gap-1.5">
                    <StatusDot tone={STATUS[status].tone} />
                    <span className="tabular-nums text-on-surface">{hitung(status)}</span> {STATUS[status].label.toLowerCase()}
                  </span>
                ) : null)}
                {dibuatNanti.length > 0 ? <span>Will be created: {dibuatNanti.join(", ")}</span> : null}
              </div>

              {rencana.baris.length === 0 ? (
                <p className="rounded-md border border-outline-variant px-4 py-6 text-center text-body-medium text-on-surface-variant">
                  This file has no rows with a name or QR code.
                </p>
              ) : (
                <>
                  {hitung("tolak") > 0 ? (
                    <SegmentedButton<"semua" | "tolak">
                      label="Show rows"
                      value={hanyaTolak ? "tolak" : "semua"}
                      onChange={(nilai) => setHanyaTolak(nilai === "tolak")}
                      options={[{ value: "semua", label: "All", badge: rencana.baris.length }, { value: "tolak", label: "Rejected", badge: hitung("tolak") }]}
                      className="self-start"
                    />
                  ) : null}
                  <TabelRencana baris={tampil} jenis={jenis} />
                </>
              )}
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

function TabelRencana({ baris, jenis }: { baris: BarisRencana[]; jenis: JenisImpor }) {
  return (
    <div className="max-h-[44dvh] overflow-auto rounded-md border border-outline-variant bg-surface-container-lowest">
      <table className="w-full border-collapse text-left text-body-medium">
        <thead className="sticky top-0 bg-surface-container-lowest text-on-surface-variant">
          <tr className="h-9 border-b border-outline-variant">
            <th scope="col" className="hidden w-16 px-4 font-normal sm:table-cell">Row</th>
            <th scope="col" className="px-4 font-normal">Name</th>
            <th scope="col" className="hidden px-4 font-normal sm:table-cell">{jenis === "kamar" ? "Room" : "Bus"}</th>
            <th scope="col" className="px-4 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {baris.slice(0, BATAS_TAMPIL).map((b) => (
            <tr key={b.baris} className="border-b border-outline-variant align-top last:border-b-0">
              <td className="hidden px-4 py-2 tabular-nums text-on-surface-variant sm:table-cell">{b.baris}</td>
              <td className="px-4 py-2 text-on-surface sm:whitespace-nowrap">
                {b.nama || <span className="text-on-surface-variant">{b.kode}</span>}
                {/* Di layar sempit kolom tujuan digabung ke sini, supaya Keterangan tetap terlihat tanpa menggeser tabel. */}
                <span className="block text-on-surface-variant sm:hidden">{b.tujuan || "No room or bus"}</span>
              </td>
              <td className="hidden whitespace-nowrap px-4 py-2 text-on-surface sm:table-cell">{b.tujuan || <span className="text-on-surface-variant">Empty</span>}</td>
              <td className="px-4 py-2 sm:min-w-48">
                <span className="flex items-start gap-1.5">
                  <span className="mt-[7px] flex"><StatusDot tone={STATUS[b.status].tone} /></span>
                  <span className={b.status === "tolak" ? "text-on-surface" : "text-on-surface-variant"}>
                    {b.alasan && b.status !== "tetap" ? b.alasan : STATUS[b.status].label}
                  </span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {baris.length > BATAS_TAMPIL ? (
        <p className="border-t border-outline-variant px-4 py-2 text-body-medium text-on-surface-variant">
          {plural(baris.length - BATAS_TAMPIL, "more row")} not shown. The counts above the table include every row.
        </p>
      ) : null}
    </div>
  );
}
