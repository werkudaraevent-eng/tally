"use client";

import { Check, X } from "@phosphor-icons/react";
import { useEffect, useState, type ReactNode } from "react";
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
    <Dialog open={open} onClose={onClose} title={judul} bare dismissible={bolehTutup} size="md" className="scroll-pb-[120px] !rounded-[28px] bg-surface-container-low">
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

/**
 * Satu pilihan berbentuk baris, minimal 56 px. Radio sungguhan, supaya pembaca
 * layar dan papan ketik bekerja.
 *
 * Dua baris (daftar M3 "two-line list item"): nama di atas memakai seluruh
 * lebar, angka hadir di bawahnya. Dulu angka itu berdiri di kanan dan memakan
 * sepertiga lebar ponsel, jadi nama checkpoint yang panjang patah menjadi tiga
 * baris dan daftarnya mendorong tombol mulai keluar layar.
 */
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
      className={`m3-state flex min-h-14 cursor-pointer items-center gap-4 rounded-2xl px-4 py-2 ${
        dipilih ? "bg-secondary-container text-on-secondary-container" : ""
      }`}
    >
      <input type="radio" name={nama} value={value} checked={dipilih} onChange={() => onPilih(value)} className="peer sr-only" />
      <TandaPilih dipilih={dipilih} />
      <span className="min-w-0 flex-1">
        <span className="block text-body-large">{label}</span>
        {sub ? <span className="block text-body-medium tabular-nums opacity-75">{sub}</span> : null}
      </span>
    </label>
  );
}

function TandaPilih({ dipilih, kecil = false }: { dipilih: boolean; kecil?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full border-2 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary ${
        kecil ? "size-5" : "size-6"
      } ${dipilih ? "border-primary bg-primary text-on-primary" : "border-outline"}`}
    >
      {dipilih ? <Check size={kecil ? 12 : 14} weight="bold" /> : null}
    </span>
  );
}

/**
 * Satu meja sebagai chip pilihan tunggal.
 *
 * Meja dipilih sekali per ponsel dan jarang diganti, jadi ia tidak berhak atas
 * empat baris 56 px di bawah checkpoint. Chip yang membungkus ke baris berikut
 * muat untuk berapa pun jumlah meja dan sepanjang apa pun namanya. Bentuk dan
 * warnanya sama dengan `FilterChip`, tetapi isinya radio, bukan tombol
 * `aria-pressed`: memilih satu meja melepaskan yang lain, dan pembaca layar
 * perlu mendengar itu sebagai satu kelompok. Tinggi 48 px, bukan 40: ini layar
 * yang dipakai sambil berdiri (DESIGN.md, Booth, kasir, pemindai).
 */
function ChipMeja({ value, label, dipilih, onPilih }: {
  value: number;
  label: string;
  dipilih: boolean;
  onPilih: (id: number) => void;
}) {
  return (
    <label
      className={`m3-state relative inline-flex min-h-12 cursor-pointer items-center gap-2 px-4 text-label-large font-semibold transition-[border-radius,background-color,color,border-color] duration-200 ease-emphasized ${
        dipilih ? "rounded-lg bg-secondary-container text-on-secondary-container" : "rounded-full border border-outline text-on-surface-variant"
      }`}
    >
      <input type="radio" name="jalur-meja" value={value} checked={dipilih} onChange={() => onPilih(value)} className="peer sr-only" />
      {dipilih ? <Check size={18} weight="bold" aria-hidden /> : null}
      <span className="rounded-sm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-primary">{label}</span>
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
  const [ujung, setUjung] = useState<HTMLDivElement | null>(null);
  const [tertutup, setTertutup] = useState(false);

  // Penanda ujung daftar tertutup kaki lengket = masih ada pilihan di bawah.
  // rootMargin bawah dikurangi tinggi kaki kira-kira, supaya garisnya hilang
  // tepat saat pilihan terakhir sudah tampak di atas tombol.
  useEffect(() => {
    if (!ujung || typeof IntersectionObserver === "undefined") return;
    const pengamat = new IntersectionObserver(([masuk]) => setTertutup(!masuk.isIntersecting), {
      rootMargin: "0px 0px -96px 0px",
    });
    pengamat.observe(ujung);
    return () => pengamat.disconnect();
  }, [ujung]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (siap && sesi !== null) onSimpan(sesi, perluJalur ? jalur : null);
      }}
    >
      {/* Hanya untuk acara yang memang punya meja. Acara satu meja tidak perlu
          memahami konsep yang tidak dipakainya. Meja DI ATAS checkpoint: chipnya
          pendek dan jarang berubah, jadi selalu terlihat tanpa digulir. Yang boleh
          bergulir hanya daftar checkpoint, yang panjangnya tergantung acara. */}
      {perluJalur ? (
        <fieldset className="mt-4">
          <legend className="px-6 text-title-small text-on-surface-variant">Desk</legend>
          <div className="mt-2 flex flex-wrap gap-2 px-6">
            {lanes.map((baris) => (
              <ChipMeja key={baris.id} value={baris.id} label={baris.name} dipilih={jalur === baris.id} onPilih={setJalur} />
            ))}
          </div>
        </fieldset>
      ) : null}

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

      {/* Penanda ujung daftar: selama ia belum terlihat, ada pilihan di bawah kaki. */}
      <div ref={setUjung} aria-hidden className="h-px" />

      {/* Kaki lengket: tombol mulai selalu terlihat, seberapa pun panjang daftarnya.
          Sebelumnya ia ikut bergulir di dasar lembar, dan di ponsel dengan enam
          checkpoint dan empat meja petugas tidak tahu ada tombol yang harus
          ditekan (M3: aksi dialog tetap di tempat, hanya isinya yang bergulir).
          Garis atas hanya muncul saat ada pilihan yang tertutup kaki ini. */}
      <div
        className={`sticky bottom-0 z-10 bg-surface-container-low px-6 pb-6 pt-4 ${
          tertutup ? "border-t border-outline-variant" : ""
        }`}
      >
        <Button type="submit" size="xl" shape="pill" block disabled={!siap}>
          {sesi === null ? "Choose a check-in point first" : !siap ? "Choose a desk first" : "Start scanning"}
        </Button>
      </div>
    </form>
  );
}
