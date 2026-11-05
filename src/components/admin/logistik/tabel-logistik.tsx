"use client";

import { DownloadSimple, MagnifyingGlass } from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";
import { Button, ColumnMenu, EmptyState, Pagination, Pane, PaneBody, PaneFooter, PaneHeader, useColumnPrefs, EMPTY_VALUE } from "@/components/m3";
import { KepalaKolomUrut, type JenisUrutKolom } from "@/components/admin/kepala-kolom";
import { SaringanKolom } from "@/components/admin/saringan-kolom";
import { cocokCari, cocokSel, hitungSel, keCsv, urutBaris } from "@/lib/logistik/tabel";
import { cx } from "@/lib/m3/cx";
import type { KolomSaringan, Saringan } from "@/lib/saringan-kolom";

/**
 * Tabel Logistics dengan perilaku Daftar peserta: cari di semua kolom, chip
 * cepat dari tab, "+ Filter" per kolom, urut dari judul kolom, Columns, Export
 * CSV dari yang tampil, dan halaman bila barisnya banyak.
 *
 * Baris tetap benda milik tab (kamar, tiket), bukan peserta: tabel per
 * peserta sudah ada di Assignments dan Daftar peserta.
 *
 * Sel bisa berisi beberapa nilai (penghuni kamar), satu per baris setinggi
 * 28 px, supaya kolom yang sejajar (Organisation) tetap satu fakta per kolom.
 */

export type KolomTabel<T> = {
  key: string;
  label: string;
  /** Lebar kolom dalam px. */
  lebar: number;
  rata?: "kanan";
  /** Teks sel untuk cari, urut, saring, dan Export. [] = kosong. */
  nilai: (b: T) => string[];
  /** Tampilan sel; bawaannya nilai satu per baris. */
  sel?: (b: T) => ReactNode;
  /** Kolom pertama yang menempel saat digeser dan tidak bisa disembunyikan. */
  kunci?: boolean;
  /** Tersembunyi sampai dipilih di Columns. */
  tersembunyi?: boolean;
  /** Bentuk saringan di "+ Filter": centang nilai (bawaan) atau teks memuat. */
  saring?: "pilihan" | "teks";
  urut?: JenisUrutKolom;
  /** Kunci urut sendiri bila teks selnya tidak urut dengan benar (tanggal). */
  kunciUrut?: (b: T) => string;
};

/** Baris tambahan di awal satu grup, mis. "To follow" (tamu hotel tanpa kamar). */
export type BarisTambahan = { key: string; sel: Record<string, ReactNode>; dipilih?: boolean; onPilih?: () => void; label: string };

export type GrupTabel = {
  key: string;
  kepala: ReactNode;
  /** Baris di awal grup; null bila tidak cocok dengan pencarian. */
  sebelum?: (cari: string, menyaring: boolean) => BarisTambahan | null;
  /** Isi grup tanpa baris sama sekali (tanpa saringan), mis. tombol Add room. */
  kosong?: ReactNode;
};

const PER_HALAMAN = 100;

export function TabelLogistik<T>({
  label, tabel, baris, kunciBaris, kolom, cariLabel, cariPlaceholder, awal, chip, ujung, menyaringLuar = false, hapusSaringanLuar,
  grup, grupBaris, dipilih, onPilih, labelBaris, kaki, namaFile, kosong,
}: {
  label: string;
  /** Kunci simpan pilihan kolom (per akun per acara). */
  tabel: string;
  baris: T[];
  kunciBaris: (b: T) => string;
  kolom: KolomTabel<T>[];
  cariLabel: string;
  cariPlaceholder: string;
  /** Sebelum kolom cari, mis. pilihan Rooms / By date. */
  awal?: ReactNode;
  /** Chip cepat milik tab (Hotel, Status). Barisnya sudah disaring oleh tab. */
  chip?: ReactNode;
  /** Di kaki panel sebelah kanan, mis. tombol aturan kamar: disetel sekali, cukup terlihat. */
  ujung?: ReactNode;
  menyaringLuar?: boolean;
  hapusSaringanLuar?: () => void;
  /** Kelompok berurutan (hotel). Urut berlaku di dalam tiap kelompok. */
  grup?: GrupTabel[];
  grupBaris?: (b: T) => string;
  dipilih?: string | null;
  onPilih?: (b: T) => void;
  labelBaris: (b: T) => string;
  kaki?: (tampil: T[]) => ReactNode;
  namaFile: string;
  /** Tampil bila tab belum punya baris sama sekali. */
  kosong?: ReactNode;
}) {
  const [cari, setCari] = useState("");
  const [saringan, setSaringan] = useState<Saringan[]>([]);
  const [mintaSaring, setMintaSaring] = useState<{ key: string; n: number } | null>(null);
  const [urut, setUrut] = useState<{ key: string; dir: "asc" | "desc" }>({ key: kolom[0].key, dir: "asc" });
  const [halaman, setHalaman] = useState(1);

  // Kolom yang kosong di semua baris tidak tampil sampai dipilih (acara tanpa
  // Label atau Bed tidak berubah); pilihan panitia disimpan seperti Daftar peserta.
  const bawaan = useMemo(
    () => kolom.filter((k) => k.kunci || (!k.tersembunyi && baris.some((b) => k.nilai(b).some((v) => v.trim())))).map((k) => k.key),
    [kolom, baris],
  );
  const { visible, setVisible, isDefault } = useColumnPrefs(`logistik-${tabel}`, bawaan);
  const tampilKolom = kolom.filter((k) => k.kunci || visible.includes(k.key));
  const perKunci = useMemo(() => new Map(kolom.map((k) => [k.key, k])), [kolom]);

  const kolomSaringan: KolomSaringan[] = kolom.map((k) => ({ key: k.key, label: k.label, jenis: k.saring ?? "pilihan", grup: "kolom" }));
  const saringanBerlaku = saringan.filter((s) => perKunci.has(s.k));
  const menyaring = Boolean(cari.trim()) || saringanBerlaku.length > 0 || menyaringLuar;

  const hasil = useMemo(() => {
    const cocok = baris.filter((b) =>
      cocokCari(kolom.flatMap((k) => k.nilai(b)), cari) &&
      saringanBerlaku.every((s) => cocokSel(perKunci.get(s.k)!.nilai(b), s)));
    const k = perKunci.get(urut.key) ?? kolom[0];
    return urutBaris(cocok, (b) => (k.kunciUrut ? k.kunciUrut(b) : k.nilai(b)[0] ?? ""), urut.dir);
  }, [baris, kolom, cari, saringanBerlaku, perKunci, urut]);

  const pakaiHalaman = !grup && hasil.length > PER_HALAMAN;
  const jumlahHalaman = Math.max(1, Math.ceil(hasil.length / PER_HALAMAN));
  const hal = Math.min(halaman, jumlahHalaman);
  const barisHalaman = pakaiHalaman ? hasil.slice((hal - 1) * PER_HALAMAN, hal * PER_HALAMAN) : hasil;

  function unduh() {
    const csv = keCsv(tampilKolom.map((k) => k.label), hasil.map((b) => tampilKolom.map((k) => k.nilai(b))));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${namaFile}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const th = "border-b border-outline-variant px-3 py-2.5 text-left font-medium";
  const td = "border-b border-outline-variant px-3 py-1.5 align-top";
  const lengket = "sticky left-0 border-r bg-inherit pl-4";

  const selBawaan = (k: KolomTabel<T>, b: T) => {
    const isi = k.nilai(b);
    if (isi.length === 0 || isi.every((v) => !v.trim())) return <span className="block h-7 leading-7 text-on-surface-variant">{EMPTY_VALUE}</span>;
    return isi.map((v, i) => <span key={i} title={v} className="block h-7 truncate leading-7 text-on-surface">{v || EMPTY_VALUE}</span>);
  };

  const barisTabel = (b: T) => {
    const kunci = kunciBaris(b);
    const aktif = dipilih === kunci;
    return (
      <tr
        key={kunci}
        onClick={onPilih ? () => onPilih(b) : undefined}
        className={cx(onPilih && "cursor-pointer", aktif ? "bg-secondary-container" : "bg-surface-container-lowest hover:bg-primary-soft")}
      >
        {tampilKolom.map((k, i) => (
          <td key={k.key} className={cx(td, k.kunci && lengket, k.kunci && "z-[1]", k.rata === "kanan" && "text-right tabular-nums")}>
            {i === 0 && onPilih ? (
              <button type="button" aria-pressed={aktif} aria-label={labelBaris(b)} onClick={(e) => { e.stopPropagation(); onPilih(b); }} className="block w-full min-w-0 rounded-sm text-left">
                {k.sel ? k.sel(b) : selBawaan(k, b)}
              </button>
            ) : k.sel ? k.sel(b) : selBawaan(k, b)}
          </td>
        ))}
      </tr>
    );
  };

  const isiGrup = grup
    ? grup.flatMap((g) => {
      const isi = barisHalaman.filter((b) => grupBaris!(b) === g.key);
      const tambahan = g.sebelum?.(cari.trim(), saringanBerlaku.length > 0 || menyaringLuar) ?? null;
      if (menyaring && isi.length === 0 && !tambahan) return [];
      return [
        <tr key={`g-${g.key}`}><td colSpan={tampilKolom.length} className="border-b border-outline-variant bg-surface p-0">{g.kepala}</td></tr>,
        ...(tambahan ? [(
          <tr key={`t-${tambahan.key}`} onClick={tambahan.onPilih} className={cx("cursor-pointer", tambahan.dipilih ? "bg-secondary-container" : "bg-surface-container-lowest hover:bg-primary-soft")}>
            {tampilKolom.map((k, i) => (
              <td key={k.key} className={cx(td, k.kunci && lengket, k.kunci && "z-[1]", k.rata === "kanan" && "text-right tabular-nums")}>
                {i === 0 ? (
                  <button type="button" aria-pressed={tambahan.dipilih} aria-label={tambahan.label} onClick={(e) => { e.stopPropagation(); tambahan.onPilih?.(); }} className="block w-full min-w-0 rounded-sm text-left">
                    {tambahan.sel[k.key] ?? <span className="block h-7" />}
                  </button>
                ) : tambahan.sel[k.key] ?? null}
              </td>
            ))}
          </tr>
        )] : []),
        ...(isi.length === 0 && !menyaring && !tambahan && g.kosong
          ? [<tr key={`k-${g.key}`}><td colSpan={tampilKolom.length} className="border-b border-outline-variant bg-surface-container-lowest px-4 py-3">{g.kosong}</td></tr>]
          : []),
        ...isi.map(barisTabel),
      ];
    })
    : barisHalaman.map(barisTabel);

  return (
    <Pane aria-label={label}>
      <PaneHeader className="relative flex-wrap gap-2 px-3 py-3">
        {awal}
        <label className="relative min-w-[180px] flex-1">
          <span className="sr-only">{cariLabel}</span>
          <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={cari}
            onChange={(event) => { setCari(event.target.value); setHalaman(1); }}
            placeholder={cariPlaceholder}
            className="h-8 w-full rounded-md border border-outline bg-surface-container-lowest pl-9 pr-3 text-body-medium outline-none placeholder:text-on-surface-variant focus:border-primary"
          />
        </label>
        {chip}
        <SaringanKolom
          kolom={kolomSaringan}
          nilai={saringan}
          onChange={(next) => { setSaringan(next); setHalaman(1); }}
          muatNilai={async (key) => { const k = perKunci.get(key); return k ? hitungSel(baris, k.nilai) : []; }}
          buka={mintaSaring}
          kelasChip="order-last flex w-full flex-wrap gap-2"
        />
        <ColumnMenu
          columns={kolom.map((k) => ({ key: k.key, label: k.label, locked: k.kunci }))}
          visible={tampilKolom.map((k) => k.key)}
          onChange={setVisible}
          onReset={() => setVisible(null)}
          isDefault={isDefault}
        />
        <Button variant="outlined" size="sm" icon={<DownloadSimple size={16} />} disabled={hasil.length === 0} onClick={unduh}>Export</Button>
      </PaneHeader>
      <PaneBody>
        {baris.length === 0 && !menyaringLuar && kosong ? kosong : hasil.length === 0 && !(grup && isiGrup.length > 0) ? (
          <EmptyState
            plain
            icon={<MagnifyingGlass size={40} />}
            title="Nothing matches"
            description="Change your search or clear the filters."
            action={<Button variant="outlined" onClick={() => { setCari(""); setSaringan([]); hapusSaringanLuar?.(); }}>Clear filters</Button>}
          />
        ) : (
          <table className="w-full min-w-max border-separate border-spacing-0 text-body-medium">
            <colgroup>{tampilKolom.map((k) => <col key={k.key} style={{ width: k.lebar, minWidth: k.lebar }} />)}</colgroup>
            <thead className="sticky top-0 z-10 bg-surface-container-high text-body-medium font-medium text-on-surface-variant">
              <tr>
                {tampilKolom.map((k) => (
                  <th
                    key={k.key}
                    scope="col"
                    aria-sort={urut.key === k.key ? (urut.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cx(th, k.kunci && "sticky left-0 z-10 border-r bg-surface-container-high pl-4", k.rata === "kanan" && "text-right")}
                  >
                    <KepalaKolomUrut
                      label={k.label}
                      aktif={urut.key === k.key}
                      dir={urut.dir}
                      jenis={k.urut ?? "teks"}
                      align={k.rata === "kanan" ? "right" : undefined}
                      onUrut={(dir) => { setUrut({ key: k.key, dir }); setHalaman(1); }}
                      onSaring={() => setMintaSaring((lama) => ({ key: k.key, n: (lama?.n ?? 0) + 1 }))}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{isiGrup}</tbody>
          </table>
        )}
      </PaneBody>
      {kaki || pakaiHalaman || ujung ? (
        <PaneFooter note={kaki?.(hasil)}>
          {ujung}
          {pakaiHalaman ? <Pagination page={hal} pageCount={jumlahHalaman} total={hasil.length} pageSize={PER_HALAMAN} onChange={setHalaman} /> : null}
        </PaneFooter>
      ) : null}
    </Pane>
  );
}
