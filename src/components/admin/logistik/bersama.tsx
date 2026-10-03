"use client";

import { MagnifyingGlass, X, XCircle } from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";
import { Button, Dialog, IconButton, StatusChip, TextField, type ChipTone } from "@/components/m3";
import { cx } from "@/lib/m3/cx";
import type { LogistikData, LogistikPeserta } from "@/lib/logistik/types";
import { timeZoneOffset, type EventTimeZone } from "@/lib/timezone";

/**
 * Potongan yang dipakai keempat tab Logistik.
 *
 * `Kirim` adalah satu-satunya jalan tab menulis ke server: ia menampilkan toast
 * galat dengan kalimat dari server, memuat ulang data bila berhasil, dan
 * mengembalikan null bila gagal. Tab cukup menutup dialognya saat hasilnya
 * bukan null.
 */
export type Kirim = (path: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown) => Promise<unknown | null>;

export type TabProps = {
  data: LogistikData;
  kirim: Kirim;
  busy: boolean;
  /** Dialog "baru" yang dibuka dari tombol di kepala halaman. */
  baru: boolean;
  tutupBaru: () => void;
};

/* ------------------------------------------------------------ Daftar */

export function KepalaKolom({ kolom }: { kolom: Array<[string, string]> }) {
  return (
    <div className="sticky top-0 z-[1] flex h-9 shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 text-body-medium font-normal text-on-surface-variant">
      {kolom.map(([label, lebar]) => <span key={label} className={cx("shrink-0", lebar)}>{label}</span>)}
    </div>
  );
}

/** Baris kelompok di dalam daftar, mis. nama hotel di atas kamar-kamarnya. */
export function BarisKelompok({ children, selected, onSelect, label }: { children: ReactNode; selected?: boolean; onSelect?: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onSelect}
      className={cx(
        "flex h-9 w-full items-center gap-3 border-b border-outline-variant px-4 text-left text-body-medium",
        selected ? "bg-accent-soft" : "bg-surface hover:bg-primary-soft",
      )}
    >
      {children}
    </button>
  );
}

/** Kolom cari di kepala panel daftar, sama dengan Daftar peserta. */
export function KolomCari({ label, placeholder, value, onChange, className }: { label: string; placeholder: string; value: string; onChange: (nilai: string) => void; className?: string }) {
  return (
    <label className={cx("relative min-w-[200px] flex-1", className)}>
      <span className="sr-only">{label}</span>
      <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-outline bg-surface-container-lowest pl-9 pr-3 text-body-medium outline-none placeholder:text-on-surface-variant focus:border-primary"
      />
    </label>
  );
}

export function Galat({ pesan }: { pesan: string }) {
  return (
    <p role="alert" className="m-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error">
      <XCircle size={18} className="mt-0.5 shrink-0" aria-hidden />{pesan}
    </p>
  );
}

export function Kerangka() {
  return (
    <div role="status" aria-label="Memuat data logistik" className="flex flex-col">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 border-b border-outline-variant px-4 py-3.5">
          <div className="h-3 w-44 animate-pulse rounded bg-surface-container-high" />
          <div className="h-3 w-28 animate-pulse rounded bg-surface-container-high" />
        </div>
      ))}
    </div>
  );
}

/**
 * Kepala panel detail: nama, chip keadaan, tombol tutup, lalu satu baris
 * keterangan yang memuat angka isinya ("Mulia · Twin · 1 dari 2 terisi").
 *
 * Angkanya dulu tampil 32px di bawah judul. Di layar yang diperbesar 150%
 * angka itu menjadi hal paling besar di halaman, padahal ia hanya pelengkap
 * judul; daftar penghuni di bawahnya sudah menunjukkan hal yang sama.
 */
export function KepalaDetail({ nama, chip, sub, angka, keterangan, onClose }: {
  nama: string;
  chip?: { tone: ChipTone; teks: string } | null;
  sub?: ReactNode;
  angka?: ReactNode;
  keterangan?: string;
  onClose: () => void;
}) {
  const bagian = [sub, angka !== undefined ? <span key="angka" className="tabular-nums">{angka}{keterangan ? ` ${keterangan}` : ""}</span> : null].filter(Boolean);
  return (
    <div className="flex shrink-0 items-start gap-3 border-b border-outline-variant px-5 py-4">
      <div className="min-w-0 flex-1">
        <h2 className="flex flex-wrap items-center gap-2 text-title-large text-on-surface">
          <span className="min-w-0 break-words">{nama}</span>
          {chip ? <StatusChip dot tone={chip.tone}>{chip.teks}</StatusChip> : null}
        </h2>
        {bagian.length > 0 ? (
          <p className="mt-0.5 text-body-medium text-on-surface-variant">
            {bagian.map((isi, i) => <span key={i}>{i > 0 ? " · " : ""}{isi}</span>)}
          </p>
        ) : null}
      </div>
      <IconButton size="sm" label="Tutup detail" onClick={onClose}><X size={16} /></IconButton>
    </div>
  );
}

/** Satu orang di daftar panel detail, dengan aksi opsional di ujungnya. */
export function BarisOrang({ orang, keterangan, aksi }: { orang: LogistikPeserta; keterangan?: ReactNode; aksi?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1 text-body-medium">
        <p className="truncate text-on-surface">{orang.name}</p>
        <p className="truncate text-on-surface-variant">
          {[orang.company, keterangan].filter(Boolean).map((bagian, i) => (
            <span key={i}>{i > 0 ? " · " : ""}{bagian}</span>
          ))}
        </p>
      </div>
      {aksi}
    </li>
  );
}

/* ------------------------------------------------------- Pilih peserta */

/**
 * Dialog memilih banyak peserta, dipakai kamar, bus bawaan, dan pengganti.
 *
 * Bawaannya hanya menampilkan yang BELUM ditempatkan (`utama`), karena itu
 * yang dicari panitia sembilan dari sepuluh kali. Kotak "tampilkan semua"
 * membuka sisanya untuk memindahkan orang; keterangan tiap baris menyebut
 * tempatnya sekarang, supaya pemindahan tidak terjadi tanpa sadar.
 *
 * `alasanTolak` mematikan baris yang pasti ditolak server (jenis kelamin
 * berbeda) dengan menyebut sebabnya, daripada membiarkan panitia memilih lalu
 * menerima toast galat.
 */
export function PilihPeserta({ open, onClose, title, description, peserta, utama, labelUtama, keterangan, alasanTolak, batas, tombol, busy, onSubmit, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  peserta: LogistikPeserta[];
  utama: (orang: LogistikPeserta) => boolean;
  labelUtama: string;
  keterangan?: (orang: LogistikPeserta) => string | null;
  alasanTolak?: (orang: LogistikPeserta) => string | null;
  /** Paling banyak yang boleh dipilih. Tanpa batas bila kosong. */
  batas?: number;
  tombol: string;
  busy: boolean;
  onSubmit: (ids: string[]) => Promise<boolean>;
  /** Kolom tambahan di atas daftar, mis. bus tujuan. */
  children?: ReactNode;
}) {
  const [cari, setCari] = useState("");
  const [semua, setSemua] = useState(false);
  const [pilih, setPilih] = useState<Set<string>>(new Set());

  function tutup() {
    setCari(""); setSemua(false); setPilih(new Set());
    onClose();
  }

  const tampil = useMemo(() => {
    const kata = cari.trim().toLowerCase();
    return peserta.filter((orang) =>
      (semua || utama(orang) || pilih.has(orang.id)) &&
      (!kata || orang.name.toLowerCase().includes(kata) || (orang.company ?? "").toLowerCase().includes(kata) || orang.qr_code.toLowerCase() === kata));
  }, [peserta, semua, utama, pilih, cari]);

  // Daftar dirender paling banyak 200 baris. Acara 2.000 peserta tetap
  // terbuka seketika, dan pencarian menemukan sisanya.
  const BATAS_RENDER = 200;
  const penuh = batas !== undefined && pilih.size >= batas;

  function ubah(id: string, centang: boolean) {
    setPilih((lama) => {
      const baru = new Set(lama);
      if (centang) baru.add(id); else baru.delete(id);
      return baru;
    });
  }

  async function simpan() {
    if (await onSubmit([...pilih])) tutup();
  }

  return (
    <Dialog
      open={open}
      onClose={tutup}
      dismissible={!busy}
      size="lg"
      title={title}
      description={description}
      actions={
        <>
          <span className="mr-auto text-body-medium tabular-nums text-on-surface-variant" aria-live="polite">
            {pilih.size} dipilih{batas !== undefined ? ` dari ${batas} tempat tersisa` : ""}
          </span>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Batal</Button>
          <Button simpan loading={busy} disabled={pilih.size === 0} onClick={() => void simpan()}>{tombol}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {children}
        <TextField
          label="Cari peserta"
          placeholder="Nama, perusahaan, atau kode QR"
          value={cari}
          autoFocus
          leading={<MagnifyingGlass size={16} />}
          onChange={(event) => setCari(event.target.value)}
        />
        <label className="flex items-center gap-2 text-body-medium text-on-surface">
          <input type="checkbox" checked={semua} onChange={(event) => setSemua(event.target.checked)} className="size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
          Tampilkan juga yang sudah ditempatkan
        </label>
        <p className="text-body-small text-on-surface-variant">{semua ? "Semua peserta aktif." : labelUtama}</p>
        <ul className="flex max-h-[44dvh] flex-col overflow-y-auto rounded-md border border-outline-variant" aria-label="Peserta">
          {tampil.length === 0 ? (
            <li className="px-4 py-6 text-center text-body-medium text-on-surface-variant">
              {cari.trim() ? "Tidak ada peserta dengan nama itu." : "Semua peserta sudah ditempatkan. Centang kotak di atas untuk memindahkan seseorang."}
            </li>
          ) : tampil.slice(0, BATAS_RENDER).map((orang) => {
            const tolak = alasanTolak?.(orang) ?? null;
            const dipilih = pilih.has(orang.id);
            const mati = Boolean(tolak) || (!dipilih && penuh);
            // Alasan tolak menggantikan keterangan: "Jenis kelamin kosong · Jenis
            // kelamin belum diisi" menyebut hal yang sama dua kali.
            const ket = [orang.company, tolak ?? keterangan?.(orang)].filter(Boolean).join(" · ");
            return (
              <li key={orang.id} className="border-b border-outline-variant last:border-b-0">
                <label className={cx("flex min-h-12 items-center gap-3 px-4 py-2 text-body-medium", mati ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-primary-soft")}>
                  <input
                    type="checkbox"
                    checked={dipilih}
                    disabled={mati}
                    onChange={(event) => ubah(orang.id, event.target.checked)}
                    className="size-4 shrink-0 accent-[var(--md-sys-color-primary)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-on-surface">{orang.name}</span>
                    {ket ? <span className="block truncate text-on-surface-variant">{ket}</span> : null}
                  </span>
                </label>
              </li>
            );
          })}
          {tampil.length > BATAS_RENDER ? (
            <li className="px-4 py-3 text-body-small text-on-surface-variant">
              {tampil.length - BATAS_RENDER} peserta lain tidak ditampilkan. Ketik namanya untuk menemukannya.
            </li>
          ) : null}
        </ul>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------ Waktu */

/** ISO ke nilai `<input type="datetime-local">` di zona acara. */
export function keInputWaktu(iso: string | null, zone: EventTimeZone): string {
  if (!iso) return "";
  const bagian = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  return `${bagian.year}-${bagian.month}-${bagian.day}T${bagian.hour}:${bagian.minute}`;
}

/** Nilai `datetime-local` (jam dinding zona acara) ke ISO. Kosong menjadi null. */
export function dariInputWaktu(nilai: string, zone: EventTimeZone): string | null {
  return nilai ? `${nilai}:00${timeZoneOffset(zone)}` : null;
}

/** Angka dari kolom isian; kosong atau bukan angka menjadi null. */
export function angkaAtauNull(nilai: string): number | null {
  const n = Number(nilai);
  return nilai.trim() && Number.isInteger(n) ? n : null;
}
