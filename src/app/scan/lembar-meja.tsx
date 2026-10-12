"use client";

import { Check, X } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { Button, Dialog } from "@/components/m3";
import type { Jalur, Sesi } from "./types";

/**
 * Lembar bawah layar pemindai: menu ⋮ dan pemilih sesi/meja.
 *
 * `Dialog` polos, bukan panel buatan sendiri: lapisan gelap, kunci fokus,
 * Escape, dan pengembalian fokus sudah ada di sana. Yang ditambahkan di sini
 * hanya kepala lembar (judul + tutup) dan isi yang bergulir.
 */
export function LembarScan({
  open,
  onClose,
  judul,
  keterangan,
  bolehTutup = true,
  children,
  kaki,
}: {
  open: boolean;
  onClose: () => void;
  judul: string;
  keterangan?: ReactNode;
  /** Mati selama meja belum disiapkan: tanpa sesi tidak ada yang bisa dipindai. */
  bolehTutup?: boolean;
  children: ReactNode;
  kaki?: ReactNode;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={judul} bare dismissible={bolehTutup} size="md" className="!rounded-[28px] bg-surface-container-low">
      <div className="flex items-center justify-between gap-2 px-6 pb-1 pt-5">
        <h2 className="text-title-large font-semibold">{judul}</h2>
        {bolehTutup ? (
          <button type="button" onClick={onClose} aria-label="Close" className="m3-state -mr-3 flex size-12 shrink-0 items-center justify-center rounded-full">
            <X size={22} aria-hidden />
          </button>
        ) : null}
      </div>
      {keterangan ? <p className="px-6 text-body-medium text-on-surface-variant">{keterangan}</p> : null}
      <div className="pb-2">{children}</div>
      {kaki ? <div className="px-6 pb-6 pt-2">{kaki}</div> : null}
    </Dialog>
  );
}

/** Satu pilihan berbentuk baris 56 px. Radio sungguhan, supaya pembaca layar dan papan ketik bekerja. */
function BarisPilihan({ nama, value, label, sub, dipilih, onPilih }: {
  nama: string;
  value: number;
  label: string;
  sub?: string;
  dipilih: boolean;
  onPilih: (id: number) => void;
}) {
  return (
    <label
      className={`m3-state flex min-h-14 cursor-pointer items-center gap-4 rounded-2xl px-4 ${
        dipilih ? "bg-secondary-container text-on-secondary-container" : ""
      }`}
    >
      <input type="radio" name={nama} value={value} checked={dipilih} onChange={() => onPilih(value)} className="peer sr-only" />
      <span
        aria-hidden
        className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary ${
          dipilih ? "border-primary bg-primary text-on-primary" : "border-outline"
        }`}
      >
        {dipilih ? <Check size={14} weight="bold" /> : null}
      </span>
      <span className="min-w-0 flex-1 text-body-large">{label}</span>
      {sub ? <span className="shrink-0 text-body-small tabular-nums opacity-75">{sub}</span> : null}
    </label>
  );
}

/**
 * Isi lembar "Siapkan meja ini".
 *
 * Pilihan ditampung di sini dan baru berlaku saat Simpan ditekan: mengganti
 * sesi di tengah antrean adalah koreksi yang disengaja, bukan efek samping dari
 * mengetuk baris yang salah. Pasang ulang komponen ini (lewat `key`) setiap kali
 * lembarnya dibuka, supaya rancangannya mulai dari pilihan yang sedang berlaku.
 */
export function PilihMeja({
  sessions,
  lanes,
  sessionId,
  laneId,
  hadir,
  onSimpan,
}: {
  sessions: Sesi[];
  lanes: Jalur[];
  sessionId: number | null;
  laneId: number | null;
  hadir: (sesi: Sesi) => number | null;
  onSimpan: (sesi: number, jalur: number | null) => void;
}) {
  const [sesi, setSesi] = useState<number | null>(sessionId);
  const [jalur, setJalur] = useState<number | null>(laneId);
  const perluJalur = lanes.length > 0;
  const siap = sesi !== null && (!perluJalur || jalur !== null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (siap && sesi !== null) onSimpan(sesi, perluJalur ? jalur : null);
      }}
    >
      <fieldset className="mt-4">
        <legend className="px-6 text-title-small text-on-surface-variant">Check-in point</legend>
        <div className="mt-1 space-y-1 px-2">
          {sessions.map((baris) => {
            const angka = hadir(baris);
            return (
              <BarisPilihan
                key={baris.id}
                nama="sesi-meja"
                value={baris.id}
                label={baris.name}
                sub={angka === null ? undefined : `${angka.toLocaleString("en-GB")} checked in`}
                dipilih={sesi === baris.id}
                onPilih={setSesi}
              />
            );
          })}
        </div>
      </fieldset>

      {/* Hanya untuk acara yang memang punya meja. Acara satu meja tidak perlu
          memahami konsep yang tidak dipakainya. */}
      {perluJalur ? (
        <fieldset className="mt-4">
          <legend className="px-6 text-title-small text-on-surface-variant">Desk</legend>
          <div className="mt-1 space-y-1 px-2">
            {lanes.map((baris) => (
              <BarisPilihan key={baris.id} nama="jalur-meja" value={baris.id} label={baris.name} dipilih={jalur === baris.id} onPilih={setJalur} />
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="px-6 pb-6 pt-6">
        <Button type="submit" size="xl" shape="pill" block disabled={!siap}>
          {sesi === null ? "Choose a check-in point first" : !siap ? "Choose a desk first" : "Start scanning"}
        </Button>
      </div>
    </form>
  );
}
