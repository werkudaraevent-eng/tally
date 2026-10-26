"use client";

import { ArrowSquareOut, CaretDown, Check, MagnifyingGlass } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "@/components/event-link";
import { Popover, StatusChip, usePopoverAnchor } from "@/components/m3";
import { eventApiPath } from "@/lib/event-url";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import {
  cocokCari, hariPendek, hrefBarisAgenda, jamPendek, petaAgenda, tanggalGanda, teksBaris, type BagianAgenda, type BarisAgenda, type PetaAgenda,
} from "@/lib/logistik/trip-agenda";

/**
 * Baris Agenda acara untuk Logistics > Trips: pemilih di dialog trip, chip
 * Agenda di daftar, dan bagian Agenda row di panel detail.
 *
 * Dimuat dari CMS Agenda, terpisah dari muatan Logistik, dan dimuat ulang saat
 * tab ini kembali difokus: "Edit in Agenda" membuka tab baru, dan baris yang
 * ditambah atau digeser di sana harus langsung terlihat di sini. Gagal memuat
 * ulang tidak menghapus daftar yang sudah ada, dan hanya jawaban yang terakhir
 * dimulai yang dipakai.
 *
 * Sebelum migrasi 202610170002 (`siap` false) tidak ada yang dimuat: trip
 * belum bisa ditautkan, jadi baris Agenda tidak dipakai di mana pun.
 */
export type AgendaTrip = {
  /** Null: belum dimuat, atau gagal sebelum pernah berhasil (`memuat` membedakannya). */
  agenda: { bagian: BagianAgenda[]; peta: PetaAgenda } | null;
  memuat: boolean;
  muatUlang: () => void;
};

export function useAgendaTrip(siap: boolean): AgendaTrip {
  const [agenda, setAgenda] = useState<AgendaTrip["agenda"]>(null);
  const [memuat, setMemuat] = useState(true);
  const muatTerakhir = useRef(0);

  const muat = useCallback(async () => {
    const urutan = ++muatTerakhir.current;
    const respon = await fetch(eventApiPath("/api/admin/rundown/sections"), { cache: "no-store" }).catch(() => null);
    const isi = respon?.ok ? ((await respon.json().catch(() => null)) as { sections?: BagianAgenda[]; items?: BarisAgenda[] } | null) : null;
    // Muat ulang karena fokus bisa tumpang tindih; jawaban lama tidak menimpa yang baru.
    if (urutan !== muatTerakhir.current) return;
    if (isi) {
      const bagian = isi.sections ?? [];
      setAgenda({ bagian, peta: petaAgenda(bagian, isi.items ?? []) });
    }
    setMemuat(false);
  }, []);

  // setState langsung di badan effect ditolak React Compiler, jadi pemuatan
  // awal ditunda satu tick, sama dengan halaman admin lainnya.
  useEffect(() => {
    if (!siap) return;
    const timer = window.setTimeout(() => void muat(), 0);
    return () => window.clearTimeout(timer);
  }, [muat, siap]);

  useEffect(() => {
    if (!siap) return;
    let timer: number | undefined;
    const onFocus = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void muat(), 300);
    };
    window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("focus", onFocus); window.clearTimeout(timer); };
  }, [muat, siap]);

  const muatUlang = useCallback(() => {
    setMemuat(true);
    void muat();
  }, [muat]);

  return { agenda, memuat: siap && memuat, muatUlang };
}

/** Satu opsi daftar baris Agenda; dipakai juga menu Agenda > Dress code. */
export const KELAS_OPSI = "flex min-h-[34px] cursor-pointer items-start gap-2.5 rounded-md px-3 py-[7px] text-body-medium text-on-surface";

/**
 * Kolom "Agenda row" di dialog New trip / Edit trip: pilihan tunggal dari baris
 * Agenda, berbentuk sama dengan pemilih Sesi di Speakers (combobox 36 px, kolom
 * cari, kelompok per tab Agenda), dengan centang seperti ChipMenu.
 *
 * "Not linked" di paling atas adalah cara melepas tautan; selama mencari ia
 * disembunyikan. Penandanya dipinjam dari Agenda: "Draft" seperti di strip tab,
 * "Hidden" seperti di daftar jadwal. Baris yang sudah dipakai trip lain diberi
 * "Used by", karena satu baris boleh dipakai beberapa trip (berangkat dan
 * pulang), asal tidak terjadi tanpa sadar.
 *
 * Papan ketik mengikuti pola APG combobox: fokus di kolom cari,
 * `aria-activedescendant` yang bergerak, Enter memilih, Esc menutup pemilih
 * saja (bukan dialog di sekelilingnya). Tab berpindah di dalam panel dan keluar
 * kembali ke pemicu, supaya fokus tidak lepas dari dialog.
 */
export function PilihBarisAgenda({ value, onChange, agendaTrip, dipakai, teks }: {
  /** `rundown_items.id`, atau null (Not linked). */
  value: number | null;
  onChange: (id: number | null) => void;
  agendaTrip: AgendaTrip;
  /** Nama trip lain per id baris, untuk "Used by". */
  dipakai: ReadonlyMap<number, string[]>;
  /** Label dan petunjuk untuk pemakai selain trip bus (mis. blok Rute). */
  teks?: { label: string; kosong: string; terpilih: string };
}) {
  const [pemicu, setPemicu] = useState<HTMLButtonElement | null>(null);
  const kerangka = useRef<HTMLDivElement | null>(null);
  const kolomCari = useRef<HTMLInputElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const [cari, setCari] = useState("");
  const [sorot, setSorot] = useState(0);
  const [lebar, setLebar] = useState<number | undefined>(undefined);
  const id = useId();

  const { agenda, memuat, muatUlang } = agendaTrip;
  const peta = agenda?.peta ?? null;
  const lokasi = value !== null ? peta?.baris.get(value) ?? null : null;
  const kunci = cari.trim();
  const kelompok = (peta?.kelompok ?? [])
    .map((isi) => ({ ...isi, baris: kunci ? isi.baris.filter((item) => cocokCari(kunci, item.start_time, item.title)) : isi.baris }))
    .filter((isi) => isi.baris.length > 0);
  const jumlahCocok = kelompok.reduce((jumlah, isi) => jumlah + isi.baris.length, 0);
  // Urutan sorotan papan ketik, sama dengan urutan tampil.
  const pilihan: Array<number | null> = peta && peta.jumlah > 0
    ? [...(kunci ? [] : [null]), ...kelompok.flatMap((isi) => isi.baris.map((item) => item.id))]
    : [];
  const indeksAktif = menu.open && pilihan.length ? Math.min(sorot, pilihan.length - 1) : -1;
  const idOpsi = (nilai: number | null) => `${id}-o-${nilai ?? "kosong"}`;
  const idAktif = indeksAktif >= 0 ? idOpsi(pilihan[indeksAktif]) : undefined;

  // Sorotan yang digeser papan ketik melewati tepi daftar ikut terlihat.
  useEffect(() => {
    if (idAktif) document.getElementById(idAktif)?.scrollIntoView({ block: "nearest" });
  }, [idAktif]);

  function buka() {
    setCari("");
    setLebar(kerangka.current?.getBoundingClientRect().width);
    const semua = peta ? peta.kelompok.flatMap((isi) => isi.baris.map((item) => item.id)) : [];
    setSorot(value === null ? 0 : Math.max(0, semua.indexOf(value) + 1));
    menu.buka();
  }
  function tutup() {
    menu.tutup();
    pemicu?.focus();
  }
  function pilih(nilai: number | null) {
    onChange(nilai);
    tutup();
  }

  /**
   * Menutup pemilih tanpa dialog trip ikut bereaksi. Dialog mendengar Esc dan
   * Tab di document, tempat React juga memasang pendengarnya (akar App
   * Router), jadi pendengar lain di simpul yang sama harus dihentikan juga:
   * Esc pertama hanya menutup pemilih, bukan dialognya.
   */
  function tutupTanpaDialog(peristiwa: KeyboardEvent) {
    peristiwa.preventDefault();
    peristiwa.nativeEvent.stopImmediatePropagation();
    tutup();
  }

  function onKeyDownPemicu(peristiwa: KeyboardEvent<HTMLButtonElement>) {
    if (menu.open) {
      if (peristiwa.key === "Escape") tutupTanpaDialog(peristiwa);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(peristiwa.key)) return;
    peristiwa.preventDefault();
    buka();
  }

  function onKeyDownCari(peristiwa: KeyboardEvent<HTMLInputElement>) {
    const n = pilihan.length;
    if (n === 0) return;
    if (peristiwa.key === "ArrowDown" || peristiwa.key === "ArrowUp") {
      peristiwa.preventDefault();
      const arah = peristiwa.key === "ArrowDown" ? 1 : -1;
      setSorot((indeks) => (Math.min(indeks, n - 1) + arah + n) % n);
    } else if (peristiwa.key === "Home" || peristiwa.key === "End") {
      peristiwa.preventDefault();
      setSorot(peristiwa.key === "Home" ? 0 : n - 1);
    } else if (peristiwa.key === "Enter") {
      peristiwa.preventDefault();
      pilih(pilihan[Math.min(sorot, n - 1)]);
    }
  }

  function onKeyDownPanel(peristiwa: KeyboardEvent) {
    if (peristiwa.key === "Escape") {
      tutupTanpaDialog(peristiwa);
      return;
    }
    if (peristiwa.key !== "Tab") return;
    // Panel dirender di luar dialog (portal), jadi perangkap fokus dialog tidak
    // menjangkaunya: Tab dari ujung panel menutupnya dan kembali ke pemicu.
    // Tanpa dihentikan, perangkap itu membaca pemicu sebagai kolom pertamanya
    // dan melempar Shift+Tab ke tombol terakhir dialog.
    const daftar = Array.from(peristiwa.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled])"));
    const ujung = peristiwa.shiftKey ? daftar[0] : daftar[daftar.length - 1];
    if (document.activeElement !== ujung) return;
    tutupTanpaDialog(peristiwa);
  }

  const teksPemicu = value === null
    ? "Not linked"
    : lokasi
      ? teksBaris(lokasi.bagian.event_date, lokasi.baris.start_time, lokasi.baris.title)
      : memuat ? "Loading agenda…" : agenda ? "Row no longer in the agenda" : "Agenda failed to load";

  // Nama tab hanya bila tanggal baris punya lebih dari satu tab (Batch 1 dan
  // Batch 2 di hari yang sama): tanpa itu dua baris bisa berbunyi sama. Selama
  // memuat, "Loading agenda…" cukup di pemicu; di bawahnya petunjuk biasa.
  const pesan: ReactNode = teks && (value === null || lokasi) ? (value === null ? teks.kosong : teks.terpilih) : value === null
    ? "Pick the row this vehicle is for. Participants then see a link to their vehicle on it in their schedule."
    : lokasi ? (
      <>
        {agenda && tanggalGanda(agenda.bagian, lokasi.bagian.event_date) ? <>In the <span className="font-medium text-on-surface">{lokasi.bagian.name.trim()}</span> tab. </> : null}
        {lokasi.baris.is_published && lokasi.bagian.is_published
          ? "Participants see a link to their vehicle on this row in their schedule."
          : "Participants see the link once this row and its Agenda tab are published."}
      </>
    ) : memuat ? "Participants see a link to their vehicle on this row in their schedule." : agenda ? "Pick another row, or Not linked." : "The saved link is kept.";

  function opsiBaris(item: BarisAgenda) {
    const indeks = pilihan.indexOf(item.id);
    const on = value === item.id;
    const pemakai = dipakai.get(item.id) ?? [];
    return (
      <li key={item.id} role="none">
        <div
          id={idOpsi(item.id)}
          role="option"
          aria-selected={on}
          title={item.title.trim()}
          onPointerDown={(peristiwa) => peristiwa.preventDefault()}
          onClick={() => pilih(item.id)}
          onPointerMove={() => setSorot(indeks)}
          className={cx(KELAS_OPSI, indeks === indeksAktif && "bg-primary-soft")}
        >
          <Check size={16} aria-hidden className={cx("mt-0.5 shrink-0", on ? "text-primary" : "invisible")} />
          <span className="w-10 shrink-0 tabular-nums text-on-surface-variant">{jamPendek(item.start_time)}</span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-start gap-2">
              <span className="line-clamp-2 min-w-0 flex-1">{item.title.trim()}</span>
              {!item.is_published ? <StatusChip tone="warning" title="Not published: hidden everywhere">Hidden</StatusChip> : null}
            </span>
            {/* Baris kedua, bukan "· used by" sebaris: judul dan nama trip tidak muat satu baris di panel 400 px. */}
            {pemakai.length ? <span className="block truncate text-body-small text-on-surface-variant">Used by {pemakai.join(", ")}</span> : null}
          </span>
        </div>
      </li>
    );
  }

  return (
    <div className="col-span-2">
      <label htmlFor={`${id}-cb`} className="m3-field-label flex items-baseline gap-2 text-label-large font-semibold text-on-surface">
        {teks?.label ?? "Agenda row"}
        <span className="text-body-small font-normal text-on-surface-variant">optional</span>
      </label>
      <div
        ref={kerangka}
        className={cx(
          "relative mt-2 flex h-9 min-w-0 items-center overflow-hidden rounded-lg border bg-surface-container-lowest transition-[border-color,box-shadow] duration-150 ease-standard",
          "focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--md-sys-color-primary)_15%,transparent)]",
          menu.open ? "border-primary" : "border-outline focus-within:border-primary",
        )}
      >
        <button
          ref={setPemicu}
          id={`${id}-cb`}
          type="button"
          role="combobox"
          aria-haspopup="dialog"
          aria-expanded={menu.open}
          aria-controls={menu.open ? `${id}-menu` : undefined}
          aria-describedby={`${id}-pesan`}
          onClick={() => (menu.open ? menu.tutup() : buka())}
          onKeyDown={onKeyDownPemicu}
          className="flex h-full min-w-0 flex-1 items-center gap-2 pl-3 pr-2.5 text-left text-body-medium outline-none!"
        >
          <span className={cx("min-w-0 flex-1 truncate", lokasi ? "text-on-surface" : "text-on-surface-variant")}>{teksPemicu}</span>
          <CaretDown size={14} className={cx("ml-auto shrink-0 text-on-surface-variant transition-transform", menu.open && "rotate-180")} aria-hidden />
        </button>
      </div>
      <p id={`${id}-pesan`} className="mt-2 text-body-small text-on-surface-variant">{pesan}</p>

      <Popover anchor={menu} id={`${id}-menu`} label="Pick agenda row" role="dialog" align="end" width={lebar} onKeyDown={onKeyDownPanel} className="flex max-h-[min(24rem,60vh)] flex-col p-1">
        <div className="relative shrink-0 px-1 pb-1 pt-0.5">
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden />
          <input
            ref={kolomCari}
            type="search"
            autoFocus
            value={cari}
            onChange={(peristiwa) => { setCari(peristiwa.target.value); setSorot(0); }}
            onKeyDown={onKeyDownCari}
            placeholder="Search time or title"
            aria-label="Search agenda rows"
            aria-controls={pilihan.length ? `${id}-daftar` : undefined}
            aria-activedescendant={idAktif}
            className="h-8 w-full rounded-md border border-outline bg-surface-container-lowest pl-8 pr-2 text-body-medium text-on-surface outline-none focus:border-primary"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
          {!agenda && memuat ? (
            <p className="px-3 py-2 text-body-medium text-on-surface-variant">Loading agenda…</p>
          ) : !agenda ? (
            <div className="px-3 py-2 text-body-medium text-on-surface-variant">
              Agenda failed to load.{" "}
              <button type="button" onClick={() => { muatUlang(); kolomCari.current?.focus(); }} className="font-medium text-primary underline">Reload</button>
            </div>
          ) : agenda.peta.jumlah === 0 ? (
            <p className="px-3 py-2 text-body-medium text-on-surface-variant">No agenda rows yet. Add them in Agenda.</p>
          ) : pilihan.length === 0 ? (
            <p className="px-3 py-2 text-body-medium text-on-surface-variant">No rows match.</p>
          ) : (
            <ul id={`${id}-daftar`} role="listbox" aria-label="Agenda rows">
              {!kunci ? (
                <li role="none">
                  <div
                    id={idOpsi(null)}
                    role="option"
                    aria-selected={value === null}
                    onPointerDown={(peristiwa) => peristiwa.preventDefault()}
                    onClick={() => pilih(null)}
                    onPointerMove={() => setSorot(0)}
                    className={cx(KELAS_OPSI, indeksAktif === 0 && "bg-primary-soft")}
                  >
                    <Check size={16} aria-hidden className={cx("mt-0.5 shrink-0", value === null ? "text-primary" : "invisible")} />
                    <span className="min-w-0 flex-1">Not linked</span>
                  </div>
                </li>
              ) : null}
              {kelompok.map(({ bagian, baris }, urutan) => (
                // APG listbox berkelompok: tiap tab Agenda satu group berlabel nama tabnya.
                <li key={bagian.id} role="none">
                  <ul role="group" aria-labelledby={`${id}-g${urutan}`}>
                    <li id={`${id}-g${urutan}`} role="presentation" className="flex items-center gap-2 px-3 pb-1 pt-2 text-label-medium font-semibold text-on-surface-variant">
                      <span className="min-w-0 truncate">{bagian.name.trim()}</span>
                      {/* Sama dengan badge tab draf di strip tab Agenda. */}
                      {!bagian.is_published ? <span className="rounded-full bg-surface-container-high px-1.5 text-label-medium font-medium text-on-surface-variant">Draft</span> : null}
                      <span className="ml-auto shrink-0 font-normal">{hariPendek(bagian.event_date)}</span>
                    </li>
                    {baris.map(opsiBaris)}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-outline-variant px-3 pb-1 pt-2 text-body-medium">
          {/* Jumlah juga tanpa kata cari: daftar terpotong rapi di batas baris dan
              tidak selalu ada batang gulir, jadi angka ini yang bilang masih ada lanjutannya. */}
          <span className="text-on-surface-variant">
            {agenda && agenda.peta.jumlah > 0 ? (kunci ? `${jumlahCocok.toLocaleString("en-GB")} of ${plural(agenda.peta.jumlah, "row")}` : plural(agenda.peta.jumlah, "row")) : ""}
          </span>
          <Link href={hrefBarisAgenda(lokasi)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-sm font-medium text-primary hover:underline">
            Edit in Agenda
            <ArrowSquareOut size={14} aria-hidden />
            <span className="sr-only">(new tab)</span>
          </Link>
        </div>
      </Popover>
    </div>
  );
}
