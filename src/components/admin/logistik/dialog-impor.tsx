"use client";

import { ArrowRight, DownloadSimple, FileXls, UploadSimple, Warning } from "@phosphor-icons/react";
import { useState } from "react";
import { Banner, Button, Dialog, SegmentedButton, StatusDot } from "@/components/m3";
import { useToast } from "@/components/toast";
import { pesanGalatApi } from "@/lib/api-message";
import { eventApiPath } from "@/lib/event-url";
import type { BarisRencana, JenisImpor, KamarUbah, Rencana, StatusBaris } from "@/lib/logistik/impor";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";

/**
 * Impor Excel untuk Logistik: rooming list dari hotel, daftar bus, atau
 * tiket kereta.
 *
 * Dua langkah dengan berkas yang sama. Memilih berkas langsung meminta
 * pratinjau (tidak ada yang ditulis), lalu Simpan mengirim berkas itu lagi dan
 * server menyusun rencananya ulang dari keadaan terbaru sebelum menulis.
 * Berkas dikirim ulang, bukan rencananya, supaya klien tidak bisa menyuruh
 * server menempatkan orang yang tidak ada di berkas.
 */

type Hasil = { masuk: number; dibuat: string[]; diubah?: number; gagal: Array<{ nama: string; alasan: string }> };

const URAIAN: Record<JenisImpor, string> = {
  kamar: "One row per person, the same columns as the participant export. Fill Hotel 2 only for people who move hotels, with Check-in and Check-out for each hotel. Leave Room empty if the number comes later, and leave the dates empty to use the hotel's dates. Hotels and rooms that do not exist yet are created. A rooming list with its own room label (such as Kamar 01) can be imported as it is: roommates are paired now, and importing it again with room numbers filled in gives those rooms their numbers.",
  bus: "One row per person: Vehicle, then QR code or Name. Vehicles that do not exist yet are created with no capacity limit. A \"Trip: …\" column sets a different vehicle for that Trip only.",
  kereta: "One row per person per direction: QR code or Name, Direction (Outbound or Return), Train, then Class, From, To, Date, Departs, Arrives, Carriage, Seat and Booking code. A person's existing ticket in the same direction is updated.",
};

const JUDUL: Record<JenisImpor, string> = { kamar: "Import hotel stays from Excel", bus: "Import vehicles from Excel", kereta: "Import train tickets from Excel" };

const STATUS: Record<StatusBaris, { label: string; tone: "success" | "warning" | "neutral" | "error" }> = {
  masuk: { label: "Added", tone: "success" },
  pindah: { label: "Moved", tone: "warning" },
  tetap: { label: "Unchanged", tone: "neutral" },
  tolak: { label: "Rejected", tone: "error" },
};

/** Tiket kereta tidak "pindah": tiket yang sudah ada diperbarui. */
const labelStatus = (status: StatusBaris, jenis: JenisImpor) => (jenis === "kereta" && status === "pindah" ? "Updated" : STATUS[status].label);

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
    const dibuat = [
      selesai.dibuat.length > 0 ? `Created ${selesai.dibuat.join(" and ")}.` : "",
      selesai.diubah ? `Updated ${plural(selesai.diubah, "room")}.` : "",
    ].filter(Boolean).join(" ");
    if (selesai.gagal.length === 0) {
      toast.success(
        jenis === "kereta" ? `${plural(selesai.masuk, "ticket")} saved`
          : selesai.masuk === 0 && selesai.diubah ? `${plural(selesai.diubah, "room")} updated`
          : `${plural(selesai.masuk, "person", "people")} assigned`,
        dibuat || undefined,
      );
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
        rencana.busBaru.length > 0 ? plural(rencana.busBaru.length, "vehicle") : null,
      ].filter(Boolean)
    : [];
  const kamarDiubah = rencana?.kamarUbah?.length ?? 0;
  const tampil = (rencana?.baris ?? []).filter((b) => !hanyaTolak || b.status === "tolak");
  const sibuk = proses !== null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!sibuk}
      size="xl"
      icon={<FileXls size={20} />}
      title={JUDUL[jenis]}
      description={hasil ? undefined : URAIAN[jenis]}
      actions={hasil ? (
        <Button onClick={onClose}>Done</Button>
      ) : (
        <>
          <Button variant="outlined" disabled={sibuk} onClick={onClose}>Cancel</Button>
          <Button
            simpan
            loading={proses === "simpan"}
            disabled={!rencana || proses === "baca" || (akanDitulis === 0 && dibuatNanti.length === 0 && kamarDiubah === 0)}
            onClick={() => void simpan()}
          >
            {akanDitulis > 0 ? `Save ${plural(akanDitulis, jenis === "kereta" ? "ticket" : "assignment")}` : kamarDiubah > 0 ? `Update ${plural(kamarDiubah, "room")}` : "Save"}
          </Button>
        </>
      )}
    >
      {hasil ? (
        <div className="flex flex-col gap-3">
          <p className="text-body-medium text-on-surface">
            {jenis === "kereta"
              ? `${plural(hasil.masuk, "ticket")} saved. ${plural(hasil.gagal.length, "ticket")} could not be saved because things changed since the preview:`
              : <>{plural(hasil.masuk, "person", "people")} assigned{hasil.dibuat.length > 0 ? `, and created ${hasil.dibuat.join(" and ")}` : ""}. {plural(hasil.gagal.length, "person", "people")} could not be assigned because things changed since the preview:</>}
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
            options={[{ value: "kamar", label: "Hotel stays" }, { value: "bus", label: "Vehicles" }, { value: "kereta", label: "Train tickets" }]}
            className="self-start"
          />

          {jenis === "kamar" && !rencana ? <ContohStay /> : null}
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
            {jenis === "kamar" ? (
              <Button
                variant="text"
                size="sm"
                icon={<DownloadSimple size={16} />}
                onClick={() => { window.location.href = eventApiPath("/api/admin/logistik/impor?jenis=kamar&isi=sekarang"); }}
              >
                Download current stays
              </Button>
            ) : (
              <Button
                variant="text"
                size="sm"
                icon={<DownloadSimple size={16} />}
                onClick={() => { window.location.href = eventApiPath(`/api/admin/logistik/impor?jenis=${jenis}&isi=peserta`); }}
              >
                Download participant list
              </Button>
            )}
          </div>
          {jenis === "kamar" ? (
            <p className="-mt-2 text-body-small text-on-surface-variant">
              To change many people at once: Download current stays, edit it in Excel, then choose the file here. You see every change before anything is saved.
            </p>
          ) : (
            <p className="-mt-2 text-body-small text-on-surface-variant">
              {jenis === "kereta"
                ? "Download participant list gives every participant two rows, Outbound and Return, with tickets already saved. Fill the train columns, leave the rest empty, then choose the file here."
                : "Download participant list gives every participant one row, with vehicles already saved, and one column per Trip. Fill Vehicle; fill a Trip column only when the person rides a different vehicle on that Trip (\"No vehicle\" if they do not ride, \"Default\" to go back to the main vehicle). Empty cells change nothing."}
              {" "}Columns marked (info) are only for filtering in Excel. The file contains QR codes, so keep it inside the team.
            </p>
          )}

          {proses === "baca" ? <p className="text-body-medium text-on-surface-variant">Reading file…</p> : null}
          {galat ? <Banner tone="warning" icon={<Warning size={18} />}>{galat}</Banner> : null}

          {rencana ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-medium text-on-surface-variant">
                {(["masuk", "pindah", "tetap", "tolak"] as const).map((status) => hitung(status) > 0 ? (
                  <span key={status} className="inline-flex items-center gap-1.5">
                    <StatusDot tone={STATUS[status].tone} />
                    <span className="tabular-nums text-on-surface">{hitung(status)}</span> {labelStatus(status, jenis).toLowerCase()}
                  </span>
                ) : null)}
                {rencana.dilewati > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot tone="neutral" />
                    <span className="tabular-nums text-on-surface">{rencana.dilewati}</span> left empty, not changed
                  </span>
                ) : null}
                {dibuatNanti.length > 0 ? <span>Will be created: {dibuatNanti.join(", ")}</span> : null}
                {kamarDiubah > 0 ? <span>Will be updated: {plural(kamarDiubah, "room")}</span> : null}
              </div>
              {rencana.kolomDibaca && rencana.kolomDibaca.length > 0 ? <KolomDibaca kolom={rencana.kolomDibaca} /> : null}
              {kamarDiubah > 0 ? <KamarDiubah kamar={rencana.kamarUbah!} /> : null}

              {rencana.baris.length === 0 ? (
                <p className="rounded-md border border-outline-variant px-4 py-6 text-center text-body-medium text-on-surface-variant">
                  {rencana.dilewati > 0 ? `Nothing to import yet: all ${rencana.dilewati} rows are left empty. Fill in ${jenis === "kereta" ? "the train columns" : "Vehicle"} first.` : "This file has no rows with a name or QR code."}
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

/** Contoh berkas satu baris per orang, sama dengan templat. Nilai kosong ditampilkan "–". */
const CONTOH_STAY = {
  judul: ["QR code", "Name", "Hotel 1", "Room 1", "Check-in 1", "Check-out 1", "Hotel 2", "Room 2", "Check-in 2", "Check-out 2"],
  baris: [
    ["", "Rina Hapsari", "Sample Hotel", "1210", "05/11/2026", "06/11/2026", "Second Hotel", "", "06/11/2026", "08/11/2026"],
    ["", "Dewi Lestari", "Sample Hotel", "", "", "", "", "", "", ""],
  ],
};

function ContohStay() {
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-md border border-outline-variant bg-surface-container-lowest">
        <table className="w-full border-collapse text-left text-body-medium">
          <caption className="sr-only">Example file</caption>
          <thead className="text-on-surface-variant">
            <tr className="h-9 border-b border-outline-variant">
              {CONTOH_STAY.judul.map((j) => <th key={j} scope="col" className="whitespace-nowrap px-3 font-normal">{j}</th>)}
            </tr>
          </thead>
          <tbody>
            {CONTOH_STAY.baris.map((baris) => (
              <tr key={baris[1]} className="h-9 border-b border-outline-variant last:border-b-0">
                {baris.map((isi, i) => <td key={i} className={cx("whitespace-nowrap px-3", isi ? "text-on-surface" : "text-on-surface-variant")}>{isi || "–"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-body-small text-on-surface-variant">
        Each person in the file gets exactly the hotels in their row. People who are not in the file are not changed, so you can import one batch at a time.
      </p>
    </div>
  );
}

/** Kolom berkas dan isian yang dibacanya, supaya judul yang berbeda dari templat terlihat sebelum disimpan. */
function KolomDibaca({ kolom }: { kolom: NonNullable<Rencana["kolomDibaca"]> }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-body-small text-on-surface-variant">Columns read from your file</p>
      <ul className="flex flex-wrap gap-2">
        {kolom.map((k) => (
          <li key={k.jadi} className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-outline-variant px-2 text-body-medium">
            <span className="text-on-surface">{k.judul}</span>
            <ArrowRight size={14} className="text-on-surface-variant" aria-label="read as" />
            <span className="text-on-surface-variant">{k.jadi}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ISIAN_KAMAR: Array<[keyof KamarUbah, string]> = [["room_number", "Room number"], ["label", "Label"], ["bed_type", "Bed"], ["room_type", "Room type"]];

/** Kamar yang sudah ada dan isiannya diubah berkas, satu isian per kolom. */
function KamarDiubah({ kamar }: { kamar: KamarUbah[] }) {
  const kolom = ISIAN_KAMAR.filter(([isian]) => kamar.some((k) => k[isian] !== undefined));
  return (
    <div className="max-h-[24dvh] overflow-auto rounded-md border border-outline-variant bg-surface-container-lowest">
      <table className="w-full border-collapse text-left text-body-medium">
        <caption className="sr-only">Rooms that will be updated</caption>
        <thead className="sticky top-0 bg-surface-container-lowest text-on-surface-variant">
          <tr className="h-9 border-b border-outline-variant">
            <th scope="col" className="px-4 font-normal">Room</th>
            {kolom.map(([isian, label]) => <th key={isian} scope="col" className="px-4 font-normal">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {kamar.slice(0, BATAS_TAMPIL).map((k) => (
            <tr key={k.id} className="h-9 border-b border-outline-variant last:border-b-0">
              <td className="px-4 text-on-surface">{k.nama}</td>
              {kolom.map(([isian]) => <td key={isian} className={cx("px-4", k[isian] !== undefined ? "text-on-surface" : "text-on-surface-variant")}>{k[isian] !== undefined ? String(k[isian]) : "Unchanged"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
            <th scope="col" className="hidden px-4 font-normal sm:table-cell">{jenis === "kamar" ? "Hotel or room" : jenis === "bus" ? "Vehicle" : "Ticket"}</th>
            <th scope="col" className="px-4 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {/* Satu baris Excel bisa menjadi dua (Hotel 1 dan Hotel 2), jadi kuncinya urutan, bukan nomor baris. */}
          {baris.slice(0, BATAS_TAMPIL).map((b, i) => (
            <tr key={`${b.baris}-${i}`} className="border-b border-outline-variant align-top last:border-b-0">
              <td className="hidden px-4 py-2 tabular-nums text-on-surface-variant sm:table-cell">{b.baris}</td>
              <td className="px-4 py-2 text-on-surface sm:whitespace-nowrap">
                {b.nama || <span className="text-on-surface-variant">{b.kode}</span>}
                {/* Di layar sempit kolom tujuan digabung ke sini, supaya Keterangan tetap terlihat tanpa menggeser tabel. */}
                <span className="block text-on-surface-variant sm:hidden">{b.tujuan || (jenis === "kereta" ? "No ticket" : "No room or vehicle")}</span>
              </td>
              <td className="hidden whitespace-nowrap px-4 py-2 text-on-surface sm:table-cell">
                {/* Kendaraan: utama dan tiap trip satu baris, supaya kolom Status tidak terdorong keluar. */}
                {!b.tujuan ? <span className="text-on-surface-variant">Empty</span> : jenis === "bus" ? b.tujuan.split(" · ").map((bagian, j) => <span key={j} className="block">{bagian}</span>) : b.tujuan}
              </td>
              <td className="px-4 py-2 sm:min-w-48">
                <span className="flex items-start gap-1.5">
                  <span className="mt-[7px] flex"><StatusDot tone={STATUS[b.status].tone} /></span>
                  <span className={b.status === "tolak" ? "text-on-surface" : "text-on-surface-variant"}>
                    {b.alasan && b.status !== "tetap" ? b.alasan : labelStatus(b.status, jenis)}
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
