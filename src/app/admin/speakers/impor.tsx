"use client";

import { DownloadSimple, UploadSimple } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { Banner, Button, Dialog, TextArea } from "@/components/m3";
import { parseCsv } from "@/lib/csv";
import type { LandingSpeaker } from "@/lib/domain";
import { labelSesi } from "@/lib/landing-speaker-tabs";
import { plural } from "@/lib/plural";
import { imporPembicara, type HasilImporPembicara } from "@/lib/speakers-impor";

/**
 * Speakers > Import: satu dialog (standar #277). Pilih CSV atau tempel sel dari
 * Excel/Sheets, lihat ringkasan, lalu simpan seluruh daftar lewat PATCH yang
 * sama dengan Save speaker (jadi 409 dan log audit tetap berlaku).
 */

const TEMPLAT = [
  ["Name", "Job title", "Organisation", "Role", "Session", "Highlights", "Photo", "Bio", "Profile link"],
  ["Andini Putri", "Direktur Utama", "PT Contoh Sejahtera", "Speaker", "Sesi 1", "yes", "https://example.com/andini.jpg", "Two or three sentences about the speaker.", "https://www.linkedin.com/in/contoh"],
];

function unduhTemplat() {
  const sel = (teks: string) => (/[",\n]/.test(teks) ? `"${teks.replace(/"/g, '""')}"` : teks);
  const isi = TEMPLAT.map((baris) => baris.map(sel).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿", isi], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "speakers-template.csv";
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const BATAS_CATATAN = 8;

export function DialogImpor({ open, onClose, daftar, agenda, maks, sorotanMaks, menyimpan, terkunci, onSimpan }: {
  open: boolean;
  onClose: () => void;
  daftar: LandingSpeaker[];
  agenda: { id: number; title: string }[];
  maks: number;
  sorotanMaks: number;
  menyimpan: boolean;
  /** Ada suntingan pembicara yang belum disimpan: impor ditahan. */
  terkunci: boolean;
  onSimpan: (next: LandingSpeaker[], ringkas: string) => Promise<boolean>;
}) {
  const berkas = useRef<HTMLInputElement | null>(null);
  const [tempel, setTempel] = useState("");
  const [namaBerkas, setNamaBerkas] = useState("");
  // Teks sumber yang disimpan, bukan hasilnya: pratinjau dihitung ulang dari
  // daftar terbaru setiap render. Sesudah 409 daftar berganti, jadi Import
  // berikutnya menyimpan di atas suntingan orang lain, bukan menimpanya.
  const [sumber, setSumber] = useState<string | null>(null);
  const [galatBerkas, setGalatBerkas] = useState("");

  function baca(teks: string, nama: string) {
    setNamaBerkas(nama);
    setGalatBerkas("");
    setSumber(teks);
  }

  const r = sumber === null ? null : imporPembicara(parseCsv(sumber), daftar, agenda, { maks, sorotanMaks, labelSesi });
  const hasil: HasilImporPembicara | null = r && !("galat" in r) ? r : null;
  const galat = galatBerkas || (r && "galat" in r ? r.galat : "");

  function tutup() {
    if (menyimpan) return;
    setTempel("");
    setNamaBerkas("");
    setSumber(null);
    setGalatBerkas("");
    onClose();
  }

  const jumlah = hasil ? hasil.baru + hasil.diperbarui : 0;
  const ringkas = hasil ? [hasil.baru ? `${plural(hasil.baru, "new speaker")}` : null, hasil.diperbarui ? `${hasil.diperbarui} updated` : null].filter(Boolean).join(", ") : "";
  const catatan = hasil ? [...hasil.dilewati.map((item) => ({ ...item, jenis: "Skipped" })), ...hasil.peringatan.map((item) => ({ ...item, jenis: "Not used" }))].sort((a, b) => a.baris - b.baris) : [];

  return (
    <Dialog
      open={open}
      onClose={tutup}
      dismissible={!menyimpan}
      size="md"
      scrollBody
      title="Import speakers"
      description="A CSV file or cells pasted from Excel or Google Sheets, with column names in the first row. Speakers with the same name are updated; empty cells change nothing."
      actions={
        <>
          <Button variant="outlined" disabled={menyimpan} onClick={tutup}>Cancel</Button>
          <Button
            simpan
            loading={menyimpan}
            disabled={!hasil || jumlah === 0 || terkunci}
            onClick={async () => {
              if (!hasil) return;
              if (await onSimpan(hasil.hasil, ringkas)) tutup();
            }}
          >
            {jumlah ? `Import ${plural(jumlah, "speaker")}` : "Import"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {terkunci ? <Banner tone="warning">Save or discard the open speaker first.</Banner> : null}
        <p className="text-body-medium text-on-surface-variant">
          Columns: <span className="text-on-surface">Name</span>{" "}(required), Job title, Organisation, Role, Session, Highlights (yes), Photo (link), Bio, Profile link (https://). Session matches an Agenda item by its short name (&ldquo;Sesi 1&rdquo;) or title; separate several with |.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outlined" size="sm" icon={<UploadSimple size={16} />} disabled={menyimpan} onClick={() => berkas.current?.click()}>Choose CSV file</Button>
          <Button variant="text" size="sm" icon={<DownloadSimple size={16} />} onClick={unduhTemplat}>Download template</Button>
          {namaBerkas ? <span className="min-w-0 truncate text-body-small text-on-surface-variant">{namaBerkas}</span> : null}
          <input
            ref={berkas}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.size > 2_000_000) {
                setSumber(null);
                setGalatBerkas("The file is larger than 2 MB.");
                return;
              }
              baca(await file.text(), file.name);
            }}
          />
        </div>
        <TextArea
          label="Or paste cells"
          optional
          rows={4}
          placeholder={"Name\tJob title\tOrganisation\nAndini Putri\tDirektur Utama\tPT Contoh Sejahtera"}
          value={tempel}
          onChange={(event) => {
            setTempel(event.target.value);
            if (event.target.value.trim()) baca(event.target.value, "");
            else { setSumber(null); setGalatBerkas(""); }
          }}
        />
        {galat ? <Banner tone="error">{galat}</Banner> : null}
        {hasil ? (
          <div className="flex flex-col gap-2 rounded-lg border border-outline-variant p-3">
            <p className="text-body-medium font-medium text-on-surface">
              {jumlah ? ringkas.charAt(0).toUpperCase() + ringkas.slice(1) : "Nothing to change"}
              {hasil.dilewati.length ? <span className="font-normal text-on-surface-variant"> · {hasil.dilewati.length} skipped</span> : null}
            </p>
            {hasil.takDikenal.length ? (
              <p className="text-body-small text-on-surface-variant">Columns not read: {hasil.takDikenal.join(", ")}</p>
            ) : null}
            {catatan.length ? (
              <ul className="flex flex-col gap-1 text-body-small text-on-surface-variant">
                {catatan.slice(0, BATAS_CATATAN).map((item, index) => (
                  <li key={index}><span className="font-medium text-on-surface">Row {item.baris}</span> · {item.jenis}: {item.teks}</li>
                ))}
                {catatan.length > BATAS_CATATAN ? <li>and {catatan.length - BATAS_CATATAN} more</li> : null}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
