"use client";

import { Check, Plus } from "@phosphor-icons/react";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { TextField } from "@/components/m3";
import { saringKamar, kunciKamar } from "@/lib/logistik/cari-kamar";
import { judulKamar } from "@/lib/logistik/nama-kamar";
import type { Kamar } from "@/lib/logistik/types";
import { cx } from "@/lib/m3/cx";
import { KELAS_OPSI } from "./pilih-baris-agenda";

/** Pilihan kamar di dialog Stays: kamar yang ada, kamar baru dari nomor yang diketik, atau lepas kamar. */
export type PilihanKamar = { jenis: "ada"; id: number } | { jenis: "baru"; nomor: string } | { jenis: "menyusul" } | null;

export type OpsiKamar = { kamar: Kamar; keterangan: string; mati: boolean };

/**
 * Kolom Room di dialog Stays: ketik nomor kamar, pilih yang cocok, atau buat
 * kamar baru dengan nomor itu. Panitia tidak perlu membuat daftar kamar di tab
 * Rooms dulu: nomor dari hotel bisa langsung diisi per orang.
 *
 * Pola APG combobox dengan listbox sebaris (bukan popover): fokus tetap di
 * kolom ketik, `aria-activedescendant` yang bergerak, Enter memilih. Daftarnya
 * di dalam kartu stay, jadi tidak ada portal yang lolos dari perangkap fokus
 * dialog. Kamar penuh tetap tampil, tapi tidak bisa dipilih.
 */
export function PilihKamar({ opsi, pilihan, onPilih, onSimpan, bisaMenyusul }: {
  opsi: OpsiKamar[];
  pilihan: PilihanKamar;
  onPilih: (pilihan: PilihanKamar) => void;
  /** Enter pada opsi yang sudah terpilih: simpan, supaya "ketik, Enter, Enter" cukup. */
  onSimpan: () => void;
  /** Stay ini sudah punya kamar: tampilkan "Room to follow" untuk melepasnya. */
  bisaMenyusul: boolean;
}) {
  const id = useId();
  const [cari, setCari] = useState("");
  const [sorot, setSorot] = useState(0);
  const { cocok, buat } = saringKamar(opsi, cari);
  const kosong = !kunciKamar(cari);

  type Baris = { kunci: string; nilai: PilihanKamar; mati: boolean };
  const baris: Baris[] = [
    ...(kosong && bisaMenyusul ? [{ kunci: "menyusul", nilai: { jenis: "menyusul" } as const, mati: false }] : []),
    ...cocok.map(({ kamar, mati }) => ({ kunci: `k${kamar.id}`, nilai: { jenis: "ada", id: kamar.id } as const, mati })),
    ...(buat ? [{ kunci: "baru", nilai: { jenis: "baru", nomor: buat } as const, mati: false }] : []),
  ];
  const hidup = baris.filter((b) => !b.mati);
  const aktif = hidup.length ? hidup[Math.min(sorot, hidup.length - 1)] : null;
  const idOpsi = (kunci: string) => `${id}-o-${kunci}`;
  const terpilih = (b: Baris) => {
    if (!pilihan || !b.nilai) return false;
    if (pilihan.jenis === "ada") return b.nilai.jenis === "ada" && b.nilai.id === pilihan.id;
    if (pilihan.jenis === "baru") return b.nilai.jenis === "baru" && b.nilai.nomor === pilihan.nomor;
    return b.nilai.jenis === "menyusul";
  };

  useEffect(() => {
    if (aktif) document.getElementById(idOpsi(aktif.kunci))?.scrollIntoView({ block: "nearest" });
    // idOpsi berasal dari useId yang tetap; cukup kunci yang disorot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktif?.kunci]);

  function ketik(nilai: string) {
    setCari(nilai);
    setSorot(0);
    // Pilihan lama yang tidak lagi cocok dengan kata baru dilepas, supaya Save
    // tidak menyimpan kamar yang sudah tidak terlihat.
    if (pilihan) onPilih(null);
  }

  function onKeyDown(peristiwa: KeyboardEvent<HTMLInputElement>) {
    const n = hidup.length;
    if (n === 0) return;
    if (peristiwa.key === "ArrowDown" || peristiwa.key === "ArrowUp") {
      peristiwa.preventDefault();
      const arah = peristiwa.key === "ArrowDown" ? 1 : -1;
      setSorot((indeks) => (Math.min(indeks, n - 1) + arah + n) % n);
    } else if (peristiwa.key === "Enter") {
      peristiwa.preventDefault();
      if (aktif && terpilih(aktif)) onSimpan();
      else if (aktif) onPilih(aktif.nilai);
    }
  }

  function isiBaris(b: Baris) {
    const on = terpilih(b);
    const kamar = b.nilai?.jenis === "ada" ? opsi.find((o) => o.kamar.id === (b.nilai as { id: number }).id) : undefined;
    return (
      <li
        key={b.kunci}
        id={idOpsi(b.kunci)}
        role="option"
        aria-selected={on}
        aria-disabled={b.mati || undefined}
        onPointerDown={(peristiwa) => peristiwa.preventDefault()}
        onClick={() => { if (!b.mati) onPilih(b.nilai); }}
        onPointerMove={() => { if (!b.mati) setSorot(hidup.indexOf(b)); }}
        className={cx(
          KELAS_OPSI,
          "items-center",
          b.mati ? "cursor-not-allowed text-on-surface-variant" : aktif?.kunci === b.kunci && "bg-primary-soft",
        )}
      >
        {b.nilai?.jenis === "baru" ? (
          <Plus size={16} aria-hidden className="shrink-0 text-primary" />
        ) : (
          <Check size={16} aria-hidden className={cx("shrink-0", on ? "text-primary" : "invisible")} />
        )}
        {b.nilai?.jenis === "baru" ? (
          <span className="min-w-0 flex-1 truncate font-medium text-primary">Create room {b.nilai.nomor}</span>
        ) : b.nilai?.jenis === "menyusul" ? (
          <span className="min-w-0 flex-1">Room to follow (keep the hotel)</span>
        ) : kamar ? (
          <>
            {/* Dibungkus, bukan dipotong: di layar 390 nama kamar dan sisa tempat turun ke dua baris. */}
            <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3">
              <span className="min-w-0 break-words tabular-nums">{[judulKamar(kamar.kamar), kamar.kamar.room_type].filter(Boolean).join(" · ")}</span>
              <span className="ml-auto text-body-small text-on-surface-variant">{kamar.keterangan}</span>
            </span>
          </>
        ) : null}
      </li>
    );
  }

  const petunjuk = opsi.length === 0
    ? "This hotel has no rooms yet. Type the room number from the hotel to create it. Enter picks, Enter again saves."
    : "Type to find a room, or type a new number to create it. Enter picks, Enter again saves.";

  return (
    <div className="flex flex-col gap-2">
      <TextField
        label="Room number"
        value={cari}
        onChange={(peristiwa) => ketik(peristiwa.target.value)}
        onKeyDown={onKeyDown}
        autoFocus
        autoComplete="off"
        inputMode="text"
        maxLength={40}
        placeholder="e.g. 1208"
        hint={petunjuk}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={baris.length > 0}
        aria-controls={baris.length > 0 ? `${id}-daftar` : undefined}
        aria-activedescendant={aktif ? idOpsi(aktif.kunci) : undefined}
      />
      {baris.length > 0 ? (
        <ul id={`${id}-daftar`} role="listbox" aria-label="Rooms" className="max-h-60 overflow-y-auto rounded-md border border-outline-variant p-1">
          {baris.map(isiBaris)}
        </ul>
      ) : !kosong ? (
        <p className="text-body-small text-on-surface-variant">No room matches, and a number can be at most 40 characters.</p>
      ) : null}
    </div>
  );
}
