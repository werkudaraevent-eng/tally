"use client";

import { ArrowSquareOut, CaretDown, Check, CoatHanger, DeviceMobile, Info, MagnifyingGlass, Plus, Trash, Warning } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { FotoDresscode } from "@/components/admin/foto-dresscode";
import { KELAS_OPSI } from "@/components/admin/logistik/pilih-baris-agenda";
import Link from "@/components/event-link";
import { Banner, Button, ListRow, Popover, Skeleton, StatusChip, TextField, usePopoverAnchor, type PopoverAnchor } from "@/components/m3";
import { cocokCari, daftarNama, hariPendek } from "@/lib/logistik/trip-agenda";
import { cx } from "@/lib/m3/cx";
import { labelPembeda } from "@/lib/member/hari-agenda";
import { OUTFIT_BATAS, OUTFIT_MAX, bagianOutfitTanggal, jenisOutfit, teksWaktuOutfit, type JenisOutfit, type OutfitEntry } from "@/lib/outfit";
import { SETIAP_HARI_ADMIN, barisDenganSetiapHari, keteranganSetiapHari, kosongDresscode, petunjukSeharian, type OutfitSetiapHari } from "@/lib/outfit-setiap-hari";
import { plural } from "@/lib/plural";
import { formatClock, type RundownItem, type RundownSection } from "@/lib/rundown";
import { bandingkanBagian } from "@/lib/rundown-urutan";
import { SEPARATOR, gabungMeta } from "@/lib/typography";

// Agenda > Dress code: baris yang disematkan di atas jadwal tab, penyunting di
// segmen Dress code, dan catatan di Edit item. Berkas sendiri supaya page.tsx
// tidak bertambah ratusan baris; state, simpan dan penjaga suntingan tetap di
// page.tsx bersama formulir lain (satu formulir bersuntingan pada satu waktu).
//
// Tiap isian untuk sesuatu yang DIPILIH, bukan diketik: seharian, satu baris
// agenda tab ini, atau sebagian hari bernama. Kolom When lama membuat panitia
// mengarang format sendiri, dan jam yang diketik ulang basi saat barisnya
// digeser. Baris "Participants see" di kartu memakai format strip peserta
// (StripOutfitHorizon), jadi yang dibaca admin sama dengan yang dibaca peserta.

const TAUTAN = "inline-flex items-center gap-1 rounded-sm font-medium text-primary hover:underline";

/** Satu isian yang disunting. `kunci` hanya kunci React, bukan data. */
export type DrafDresscode = {
  kunci: string;
  jenis: JenisOutfit;
  item_id: number | null;
  /** `waktu`: Name. `baris`: teks tersimpan, dibaca bila barisnya tidak ditemukan. */
  when: string;
  what: string;
  note: string;
  photo_url: string | null;
};

/** Baris agenda seperti tersimpan: peserta membaca yang tersimpan, bukan suntingan Edit item. */
export type BarisDc = Pick<RundownItem, "id" | "section_id" | "start_time" | "end_time" | "title" | "is_published">;

let nomorKartu = 0;

/** Kartu baru. Dipanggil dari aksi, tidak pernah saat render. */
export function kartuBaru(jenis: JenisOutfit, itemId: number | null = null): DrafDresscode {
  nomorKartu += 1;
  return { kunci: `b${nomorKartu}`, jenis, item_id: jenis === "baris" ? itemId : null, when: "", what: "", note: "", photo_url: null };
}

/** Isian tersimpan menjadi kartu. Kuncinya tetap selama isian tersimpannya sama. */
export function keDraf(daftar: readonly OutfitEntry[]): DrafDresscode[] {
  return daftar.map((isian, indeks) => ({
    kunci: `s${indeks}`,
    jenis: jenisOutfit(isian),
    item_id: isian.item_id ?? null,
    when: isian.when ?? "",
    what: isian.what,
    note: isian.note ?? "",
    photo_url: isian.photo_url ?? null,
  }));
}

/** Urutan kartu, kecuali Whole day yang selalu di depan (sama dengan urutOutfit di server). */
export function urutDraf<T extends Pick<DrafDresscode, "jenis">>(daftar: readonly T[]): T[] {
  return [...daftar.filter((isi) => isi.jenis === "seharian"), ...daftar.filter((isi) => isi.jenis !== "seharian")];
}

/** Badan PATCH. `when` baris ditulis server dari barisnya. */
export function keKiriman(daftar: readonly DrafDresscode[]) {
  return urutDraf(daftar).map((isi) => ({
    item_id: isi.jenis === "baris" ? isi.item_id : null,
    when: isi.jenis === "waktu" ? isi.when.trim() || null : null,
    what: isi.what.trim(),
    note: isi.note.trim() || null,
    photo_url: isi.photo_url,
  }));
}

/** Sama dengan yang tersimpan. Teks waktu baris milik server, jadi tidak dihitung. */
export function samaDraf(a: readonly DrafDresscode[], b: readonly DrafDresscode[]): boolean {
  return a.length === b.length && a.every((isi, indeks) => {
    const lain = b[indeks];
    return isi.jenis === lain.jenis && isi.item_id === lain.item_id && (isi.jenis !== "waktu" || isi.when === lain.when)
      && isi.what === lain.what && isi.note === lain.note && isi.photo_url === lain.photo_url;
  });
}

/** Isian yang belum lengkap: Part of the day tanpa Name, atau tanpa What to wear. */
export function drafKurang(isi: DrafDresscode): "nama" | "apa" | null {
  if (isi.jenis === "waktu" && !isi.when.trim()) return "nama";
  return isi.what.trim() ? null : "apa";
}

/** Satu baris di baris Dress code: untuk apa, lalu pakaiannya. */
export type RingkasDc = { untuk: string; apa: string };

/** Isian tersimpan, urut seperti dibaca peserta. Jam admin bertitik dua, jam mulai saja. */
export function ringkasDresscode(daftar: readonly OutfitEntry[], cariBaris: (id: number) => BarisDc | null): RingkasDc[] {
  return daftar.map((isian) => {
    const jenis = jenisOutfit(isian);
    if (jenis === "seharian") return { untuk: "Whole day", apa: isian.what };
    if (jenis === "waktu") return { untuk: isian.when ?? "", apa: isian.what };
    const item = isian.item_id ? cariBaris(isian.item_id) : null;
    return { untuk: item ? `${formatClock(item.start_time)} ${item.title.trim()}` : isian.when || "Item not found", apa: isian.what };
  });
}

export type BannerDc = { jenis: "draf" } | { jenis: "tanpaButir" } | { jenis: "bersama"; tanggal: string; jumlah: number; tab: string };
type TabDc = Pick<RundownSection, "id" | "name" | "title" | "event_date" | "is_published" | "sort_order">;

/**
 * Satu peringatan yang berlaku, atau null: tab draf, tab tanpa butir yang
 * terlihat peserta (portal hanya membuka hari yang punya butir publik
 * berjudul), atau beberapa tab terlihat di tanggal yang sama tanpa Who it's
 * for. Yang terakhir mengikuti bagianOutfitTanggal: peserta mendapat tab
 * pertama di tanggal itu yang punya dress code. `jumlahIsian` tab ini memakai
 * kartu di editor, jadi kalimatnya benar sesudah disimpan. `bersasaran` null:
 * Who it's for belum termuat, jadi tidak ada yang bisa dikatakan.
 */
export function bannerDresscode({ tab, tabs, terlihat, bersasaran, jumlahIsian }: {
  tab: TabDc;
  tabs: readonly TabDc[];
  terlihat: (id: number) => boolean;
  bersasaran: ((id: number) => boolean) | null;
  jumlahIsian: (id: number) => number;
}): BannerDc | null {
  if (!tab.is_published) return { jenis: "draf" };
  if (!terlihat(tab.id)) return { jenis: "tanpaButir" };
  if (!bersasaran) return null;
  const sama = [...tabs].sort(bandingkanBagian).filter((isi) => isi.event_date === tab.event_date && isi.is_published && terlihat(isi.id));
  if (sama.length < 2 || sama.some((isi) => bersasaran(isi.id))) return null;
  const hari = sama.map((isi) => ({ tanggal: isi.event_date, outfit: Array.from({ length: jumlahIsian(isi.id) }, () => ({ what: "" })) }));
  const indeks = bagianOutfitTanggal(hari, tab.event_date);
  // Belum ada yang berisi: tab ini yang akan dibaca, begitu diisi dan disimpan.
  const pemenang = indeks >= 0 && hari[indeks].outfit.length > 0 ? indeks : sama.findIndex((isi) => isi.id === tab.id);
  const label = labelPembeda(sama.map((isi) => isi.name?.trim() || isi.title?.trim() || null))[pemenang] ?? sama[pemenang].name.trim();
  return { jenis: "bersama", tanggal: hariPendek(tab.event_date), jumlah: sama.length, tab: label };
}

/**
 * Keterangan toast sesudah disimpan, dari keadaan tab yang tersimpan.
 * `setiapHari`: acara punya Every day, jadi tab tanpa baris tetap punya pakaian.
 */
export function keteranganTersimpan({ jumlah, terbit, terlihat, siapa, tanggal, setiapHari = false }: { jumlah: number; terbit: boolean; terlihat: boolean; siapa: string[]; tanggal: string; setiapHari?: boolean }): string {
  if (jumlah === 0) return setiapHari ? "This tab now shows only the every-day dress code." : "This tab has no dress code now.";
  if (!terbit) return "Participants see it once Show on public page is on for this tab.";
  if (!terlihat) return "Participants see it once this tab has an item on the public page.";
  return siapa.length ? `${daftarNama(siapa)} participants see it on ${hariPendek(tanggal)}.` : `Participants see it on ${hariPendek(tanggal)}.`;
}

/**
 * Baris Dress code di antara kepala panel Schedule dan daftarnya, jadi tidak
 * ikut tergulir. Selalu menampilkan yang tersimpan (yang dibaca peserta);
 * suntingan yang belum disimpan hanya ditandai. Seluruh barisnya satu tombol.
 * `baris`: baris tab sendiri. `setiap`: pakaian Every day bila tampil di tab
 * ini (setiapHariDiTab), baris pertama yang hanya dibaca; Add dan Edit tetap
 * mengikuti baris tab sendiri.
 */
export function BarisDresscode({ keadaan, baris, setiap, labelTab, dipilih, belum, onBuka, onCobaLagi }: {
  keadaan: "memuat" | "gagal" | "siap";
  baris: RingkasDc[];
  setiap: string | null;
  labelTab: string;
  dipilih: boolean;
  belum: boolean;
  onBuka: () => void;
  onCobaLagi: () => void;
}) {
  const judul = (
    <span className="flex w-28 shrink-0 items-center gap-2 font-medium text-on-surface">
      <CoatHanger size={16} className="shrink-0 text-on-surface-variant" aria-hidden />
      Dress code
    </span>
  );
  if (keadaan !== "siap") {
    return (
      <div className="flex shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container-high px-4 py-2 text-body-medium">
        {judul}
        {keadaan === "memuat" ? (
          <span className="min-w-0 flex-1 py-1" aria-busy="true">
            {/* Warna bawaan Skeleton sama dengan bidang baris ini (plate-2): tanpa
                warna lain baloknya tidak tergambar, apalagi bila gerak dikurangi. */}
            <Skeleton className="h-4 w-48 max-w-full bg-outline-variant!" />
            <span className="sr-only">Loading the dress code</span>
          </span>
        ) : (
          <>
            <span className="min-w-0 flex-1 text-on-surface-variant">Dress code did not load</span>
            <Button variant="text" size="sm" className="-mr-3" onClick={onCobaLagi}>Try again</Button>
          </>
        )}
      </div>
    );
  }
  const tampil = barisDenganSetiapHari(baris, setiap);
  const aksi = baris.length > 0 || belum ? "Edit" : "Add";
  const ringkas = tampil.map((isi) => `${isi.untuk}, ${isi.apa}`).join("; ");
  const nama = tampil.length > 0
    ? `Dress code for ${labelTab}: ${ringkas}.${belum ? " Unsaved changes." : ""} ${aksi}`
    : belum ? `Dress code for ${labelTab}: none saved yet. Unsaved changes. Edit` : `Add a dress code for ${labelTab}`;
  const tandaBelum = (kelas: string) => (belum ? <StatusChip tone="warning" className={kelas}>Unsaved changes</StatusChip> : null);
  return (
    <div className="shrink-0">
      {/* @container: lebar baris, bukan layar, yang menentukan tempat tanda. Panel
          jadwal di ponsel dan di 1024px dengan rel tersemat terlalu sempit untuk
          tanda di kolom sendiri: kolom barisnya tinggal beberapa piksel. */}
      <ListRow selected={dipilih} onSelect={onBuka} label={nama} className={cx("@container items-start py-3", !dipilih && "bg-surface-container-high")}>
        {judul}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          {tampil.length > 0 ? (
            tampil.map((isi, indeks) => (
              // Mulai 640px dipotong satu baris; di ponsel dibiarkan membungkus.
              <span key={indeks} className="block min-w-0 sm:truncate">
                <span className="text-on-surface-variant">{isi.untuk}</span>
                <span className="text-on-surface-variant">{` ${SEPARATOR} `}</span>
                <span className="font-medium text-on-surface">{isi.apa}</span>
              </span>
            ))
          ) : (
            <span className="block text-on-surface-variant">None for this tab yet</span>
          )}
          {/* Paling lebar selebar kolomnya: di kolom yang sangat sempit tanda
              terpotong dengan elipsis dan `title`, tidak menimpa Edit. */}
          {tandaBelum("self-start max-w-full! @lg:hidden")}
        </span>
        {tandaBelum("@max-lg:hidden")}
        <span className="shrink-0 font-medium text-primary">{aksi}</span>
      </ListRow>
    </div>
  );
}

/**
 * Catatan di Edit item di bawah Title, bergaya catatan bus. Dibaca dari yang
 * tersimpan. Baris tersembunyi tidak bisa dipilih untuk dress code baru, jadi
 * tautannya tidak ditawarkan untuknya.
 */
export function CatatanDresscodeBaris({ apa, penuh, tersembunyi, onBuka, onTambah }: {
  /** Pakaian yang menaut ke baris ini, atau null. */
  apa: string | null;
  penuh: boolean;
  tersembunyi: boolean;
  onBuka: () => void;
  onTambah: () => void;
}) {
  const isi = apa !== null
    ? { teks: <>Dress code for this item: <span className="font-medium text-on-surface">{apa}</span></>, aksi: "Edit dress code", onKlik: onBuka }
    : penuh
      ? { teks: <>This tab already has {OUTFIT_MAX} dress codes.</>, aksi: "Open dress code", onKlik: onBuka }
      : tersembunyi
        ? { teks: <>No dress code for this item yet. Hidden items can’t be picked.</>, aksi: "Open dress code", onKlik: onBuka }
        : { teks: <>No dress code for this item yet.</>, aksi: "Add a dress code for this item", onKlik: onTambah };
  return (
    <div className="flex items-start gap-2 rounded-md bg-surface-container-high p-3 text-body-medium text-on-surface-variant">
      <CoatHanger size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p>{isi.teks}</p>
        <button type="button" onClick={isi.onKlik} className={cx("mt-1", TAUTAN)}>{isi.aksi}</button>
      </div>
    </div>
  );
}

type PilihanUntuk = { jenis: "seharian" } | { jenis: "baris"; item_id: number } | { jenis: "waktu" };

const samaPilihan = (a: PilihanUntuk | null, b: PilihanUntuk) =>
  Boolean(a && a.jenis === b.jenis && (a.jenis !== "baris" || (b.jenis === "baris" && a.item_id === b.item_id)));

/**
 * Menu "Add for an agenda item", juga dipakai For ▾ di kartu untuk mengganti
 * jenis. Dimodelkan dari pemilih baris Agenda di Logistics (pola APG
 * combobox: fokus di kolom cari, sorotan lewat aria-activedescendant), tetapi
 * hanya baris tab ini, tanpa kepala kelompok. Baris yang tidak bisa dipilih
 * tetap tampil dengan alasannya. Dipasang hanya selama terbuka, jadi kolom cari
 * dan sorotannya mulai dari awal tiap kali dibuka.
 */
function MenuUntuk({ anchor, id, label, baris, dipakai, tawarSeharian, terpilih, onPilih, onTutup }: {
  anchor: PopoverAnchor;
  id: string;
  label: string;
  /** Baris berjudul tab ini, urut jam mulai. */
  baris: readonly BarisDc[];
  /** Baris yang sudah punya dress code di kartu lain. */
  dipakai: ReadonlySet<number>;
  tawarSeharian: boolean;
  /** Pilihan kartu yang sedang diganti; null untuk kartu baru. */
  terpilih: PilihanUntuk | null;
  onPilih: (pilihan: PilihanUntuk) => void;
  onTutup: () => void;
}) {
  const [cari, setCari] = useState("");
  const kata = cari.trim();
  const cocok = kata ? baris.filter((item) => cocokCari(kata, item.start_time, item.title)) : baris;
  const opsi: Array<{ kunci: string; pilihan: PilihanUntuk; item: BarisDc | null; mati: boolean }> = [
    ...(tawarSeharian && !kata ? [{ kunci: "seharian", pilihan: { jenis: "seharian" } as const, item: null, mati: false }] : []),
    ...cocok.map((item) => {
      const pilihan = { jenis: "baris", item_id: item.id } as const;
      // Baris kartu ini sendiri tetap bisa dipilih, juga bila kini tersembunyi.
      return { kunci: `b${item.id}`, pilihan, item, mati: !samaPilihan(terpilih, pilihan) && (dipakai.has(item.id) || !item.is_published) };
    }),
    { kunci: "waktu", pilihan: { jenis: "waktu" }, item: null, mati: false },
  ];
  const awal = () => {
    const ini = opsi.findIndex((isi) => samaPilihan(terpilih, isi.pilihan));
    return ini >= 0 ? ini : Math.max(0, opsi.findIndex((isi) => !isi.mati));
  };
  const [sorot, setSorot] = useState(awal);
  const aktif = Math.min(sorot, opsi.length - 1);
  const idOpsi = (kunci: string) => `${id}-o-${kunci}`;
  const idAktif = idOpsi(opsi[aktif].kunci);
  const adaTersembunyi = baris.some((item) => !item.is_published);

  // Sorotan yang digeser papan ketik melewati tepi daftar ikut terlihat.
  useEffect(() => {
    document.getElementById(idAktif)?.scrollIntoView({ block: "nearest" });
  }, [idAktif]);

  function pilih(indeks: number) {
    const isi = opsi[indeks];
    if (isi && !isi.mati) onPilih(isi.pilihan);
  }

  function onKeyDownCari(peristiwa: KeyboardEvent<HTMLInputElement>) {
    const n = opsi.length;
    if (peristiwa.key === "ArrowDown" || peristiwa.key === "ArrowUp") {
      peristiwa.preventDefault();
      const arah = peristiwa.key === "ArrowDown" ? 1 : -1;
      setSorot((indeks) => (Math.min(indeks, n - 1) + arah + n) % n);
    } else if (peristiwa.key === "Home" || peristiwa.key === "End") {
      peristiwa.preventDefault();
      setSorot(peristiwa.key === "Home" ? 0 : n - 1);
    } else if (peristiwa.key === "Enter") {
      peristiwa.preventDefault();
      pilih(aktif);
    }
  }

  // Esc dan Tab menutup menu saja dan kembali ke pemicunya. Pendengar Esc
  // Popover di document dihentikan: ia memfokuskan jangkarnya, yang untuk
  // tombol Add berupa pembungkus yang tidak bisa difokus.
  function onKeyDownPanel(peristiwa: KeyboardEvent) {
    if (peristiwa.key !== "Escape" && peristiwa.key !== "Tab") return;
    peristiwa.preventDefault();
    peristiwa.nativeEvent.stopImmediatePropagation();
    onTutup();
  }

  function opsiItem(indeks: number) {
    const isi = opsi[indeks];
    const dipilih = samaPilihan(terpilih, isi.pilihan);
    const isian = isi.item ? (
      <>
        <span className="w-10 shrink-0 tabular-nums text-on-surface-variant">{formatClock(isi.item.start_time)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-start gap-2">
            <span className="line-clamp-2 min-w-0 flex-1">{isi.item.title.trim()}</span>
            {!isi.item.is_published ? <StatusChip tone="warning" title="Not shown on the public page">Hidden</StatusChip> : null}
          </span>
          {!dipilih && dipakai.has(isi.item.id) ? <span className="block truncate text-body-small text-on-surface-variant">Has a dress code</span> : null}
        </span>
      </>
    ) : isi.pilihan.jenis === "seharian" ? (
      <>
        <span className="w-10 shrink-0" />
        <span className="min-w-0 flex-1 font-medium">Whole day</span>
      </>
    ) : (
      <>
        <span className="w-10 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Part of the day…</span>
          <span className="block text-body-small text-on-surface-variant">For a stretch with no single item, such as “Malam hari”</span>
        </span>
      </>
    );
    return (
      <li key={isi.kunci} role="none">
        <div
          id={idOpsi(isi.kunci)}
          role="option"
          aria-selected={dipilih}
          aria-disabled={isi.mati || undefined}
          onPointerDown={(peristiwa) => peristiwa.preventDefault()}
          onClick={() => pilih(indeks)}
          onPointerMove={() => setSorot(indeks)}
          className={cx(KELAS_OPSI, indeks === aktif && "bg-primary-soft", isi.mati && "cursor-default opacity-60")}
        >
          {isian}
          {dipilih ? <Check size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden /> : null}
        </div>
      </li>
    );
  }

  const indeksBaris = opsi.flatMap((isi, indeks) => (isi.item ? [indeks] : []));
  return (
    <Popover anchor={anchor} id={id} label={label} role="dialog" align="start" width={372} onKeyDown={onKeyDownPanel} className="flex max-h-[min(30rem,70vh)] flex-col p-1">
      <div className="relative shrink-0 px-1 pb-1 pt-0.5">
        <MagnifyingGlass size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden />
        <input
          type="search"
          autoFocus
          value={cari}
          onChange={(peristiwa) => {
            setCari(peristiwa.target.value);
            setSorot(0);
          }}
          onKeyDown={onKeyDownCari}
          placeholder="Search time or title"
          aria-label="Search this tab’s items"
          aria-controls={`${id}-daftar`}
          aria-activedescendant={idAktif}
          className="h-8 w-full rounded-md border border-outline bg-surface-container-lowest pl-8 pr-2 text-body-medium text-on-surface outline-none focus:border-primary"
        />
      </div>
      <ul id={`${id}-daftar`} role="listbox" aria-label={label} className="min-h-0 flex-1 overflow-y-auto py-0.5">
        {opsi[0].pilihan.jenis === "seharian" ? opsiItem(0) : null}
        {indeksBaris.map(opsiItem)}
        {kata && cocok.length === 0 && baris.length > 0 ? <li role="none" className="px-3 py-2 text-body-medium text-on-surface-variant">No items match.</li> : null}
        {/* Hiasan saja, di luar pohon aksesibilitas: listbox hanya boleh berisi opsi. */}
        <li aria-hidden className="flex items-center gap-3 px-3 py-1.5 text-body-small text-on-surface-variant">
          <span className="h-px flex-1 bg-outline-variant" />
          or
          <span className="h-px flex-1 bg-outline-variant" />
        </li>
        {opsiItem(opsi.length - 1)}
      </ul>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-outline-variant px-3 pb-1 pt-2 text-body-medium">
        <span className="text-on-surface-variant">{baris.length > 0 ? `${plural(baris.length, "item")} on this tab` : "This tab has no items yet."}</span>
        {adaTersembunyi ? <span className="text-body-small text-on-surface-variant">Hidden items can’t be picked</span> : null}
      </div>
    </Popover>
  );
}

/** Fokus satu kolom di satu kartu sesudah kartunya dirender. */
function fokusKartu(kunci: string, kolom: "apa" | "nama" | "catatan") {
  window.setTimeout(() => document.querySelector<HTMLElement>(`[data-dresscode-kartu="${kunci}"] [data-dresscode-${kolom}]`)?.focus(), 0);
}

function KartuDresscode({ draf, labelHalaman, labelBatch, setiapHari, baris, dipakai, seharianBebas, seharianGanda, tautanTersimpan, coba, unggah, adaUnggah, menyimpan, onUbah, onHapus, onUnggah }: {
  draf: DrafDresscode;
  labelHalaman: string;
  labelBatch: string | null;
  /** Every day acara ini: petunjuk Whole day menyebut bahwa baris ini menggantikannya. */
  setiapHari: OutfitSetiapHari | null;
  /** Baris berjudul tab ini, urut jam mulai. */
  baris: readonly BarisDc[];
  dipakai: ReadonlySet<number>;
  seharianBebas: boolean;
  /** Whole day kedua dan seterusnya: isian lama tanpa When terbaca begini, dan server menolaknya. */
  seharianGanda: boolean;
  /** Baris kartu ini sudah tertaut di yang tersimpan, jadi server tidak memeriksanya ulang. */
  tautanTersimpan: boolean;
  coba: boolean;
  /** Foto kartu ini yang sedang diunggah. */
  unggah: boolean;
  /** Ada unggahan berjalan di tab ini: satu per satu, lihat uploadFotoDresscode. */
  adaUnggah: boolean;
  menyimpan: boolean;
  onUbah: (perubahan: Partial<DrafDresscode>) => void;
  onHapus: () => void;
  onUnggah: (file: File) => void;
}) {
  const [pemicu, setPemicu] = useState<HTMLButtonElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const [catatanBuka, setCatatanBuka] = useState(false);
  const berkas = useRef<HTMLInputElement | null>(null);
  const id = useId();

  const item = draf.jenis === "baris" && draf.item_id !== null ? baris.find((isi) => isi.id === draf.item_id) ?? null : null;
  const untuk = draf.jenis === "seharian"
    ? "Whole day"
    : draf.jenis === "waktu"
      ? "Part of the day"
      : item
        ? `${formatClock(item.start_time)}${item.end_time ? `–${formatClock(item.end_time)}` : ""} ${item.title.trim()}`
        : draf.when || "Item not found";
  // Tautan baru ke baris yang hilang atau tersembunyi ditolak server; tautan
  // tersimpan tidak diperiksa ulang dan peserta tetap membacanya.
  const ditolak = draf.jenis === "baris" && !tautanTersimpan && (!item || !item.is_published);
  const peringatan = seharianGanda
    ? "Only one Whole day line per tab. Pick something else from For, or remove this line."
    : draf.jenis !== "baris"
      ? null
      : !item
        ? tautanTersimpan
          ? "Item not found, so participants see the saved text. Pick the item again from For, or remove this line."
          : "That item is not on this tab any more. Pick another from For, or remove this line."
        : !item.is_published
          ? tautanTersimpan
            ? `${item.title.trim()} is hidden on the public page, but participants still see this dress code.`
            : `${item.title.trim()} is hidden, so it cannot be picked. Pick another from For, or remove this line.`
          : null;
  // Format strip peserta: "kapan · apa", atau apa saja untuk seharian. Baris
  // yang tidak akan tersimpan tidak punya pratinjau.
  const kapan = draf.jenis === "seharian" ? null : draf.jenis === "waktu" ? draf.when.trim() : item ? teksWaktuOutfit(item.start_time, item.title, labelBatch) : draf.when.trim();
  const lihat = !ditolak && !seharianGanda && draf.what.trim() && (draf.jenis !== "waktu" || draf.when.trim()) ? gabungMeta([kapan, draf.what.trim()]) : null;
  const catatanTampil = catatanBuka || draf.note !== "";
  const terpilih: PilihanUntuk = draf.jenis === "baris" ? { jenis: "baris", item_id: draf.item_id ?? 0 } : { jenis: draf.jenis };

  function ganti(pilihan: PilihanUntuk) {
    menu.tutup();
    pemicu?.focus();
    if (samaPilihan(terpilih, pilihan)) return;
    if (pilihan.jenis === "baris") onUbah({ jenis: "baris", item_id: pilihan.item_id, when: "" });
    else onUbah({ jenis: pilihan.jenis, item_id: null, when: "" });
    if (pilihan.jenis === "waktu") fokusKartu(draf.kunci, "nama");
  }

  return (
    <fieldset data-dresscode-kartu={draf.kunci} data-dresscode-baris={draf.jenis === "baris" ? draf.item_id ?? undefined : undefined} className="flex min-w-0 flex-col gap-3 rounded-lg border border-outline-variant p-3">
      <legend className="sr-only">Dress code for {untuk}</legend>
      <div className="flex items-center gap-2">
        <button
          ref={setPemicu}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={menu.open}
          aria-controls={menu.open ? `${id}-menu` : undefined}
          title={untuk}
          data-dresscode-untuk=""
          onClick={menu.toggle}
          onKeyDown={(peristiwa) => {
            if (menu.open || peristiwa.key !== "ArrowDown") return;
            peristiwa.preventDefault();
            menu.buka();
          }}
          className="inline-flex min-h-9 min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left text-body-medium"
        >
          <span className="shrink-0 text-on-surface-variant">For</span>
          <span className="min-w-0 truncate font-medium text-on-surface">{untuk}</span>
          <CaretDown size={14} className="shrink-0 text-on-surface-variant" aria-hidden />
        </button>
        <Button variant="text" size="sm" className="-mr-2 text-error" icon={<Trash size={16} />} aria-label={`Remove the ${untuk} line`} onClick={onHapus}>
          Remove
        </Button>
      </div>
      {menu.open ? (
        <MenuUntuk
          anchor={menu}
          id={`${id}-menu`}
          label="What this line is for"
          baris={baris}
          dipakai={dipakai}
          tawarSeharian={seharianBebas || draf.jenis === "seharian"}
          terpilih={terpilih}
          onPilih={ganti}
          onTutup={() => {
            menu.tutup();
            pemicu?.focus();
          }}
        />
      ) : null}
      {draf.jenis === "seharian" ? <p className="-mt-2 text-body-small text-on-surface-variant">{petunjukSeharian(setiapHari)}</p> : null}
      {peringatan ? (
        <p className="flex items-start gap-1.5 text-body-small font-medium text-warning">
          <Warning size={16} className="mt-px shrink-0" aria-hidden />
          <span>{peringatan}</span>
        </p>
      ) : null}
      {draf.jenis === "waktu" ? (
        <TextField
          label="Name"
          maxLength={OUTFIT_BATAS.when}
          counter
          hint="Participants see it before the outfit, such as “Malam hari”"
          error={coba && !draf.when.trim() ? "Enter a name, such as “Malam hari”" : undefined}
          value={draf.when}
          onChange={(peristiwa) => onUbah({ when: peristiwa.target.value })}
          data-dresscode-nama=""
        />
      ) : null}
      <TextField
        label="What to wear"
        maxLength={OUTFIT_BATAS.what}
        counter
        hint="Shown in the day’s schedule, such as “Batik”"
        error={coba && !draf.what.trim() ? "Enter what to wear" : undefined}
        value={draf.what}
        onChange={(peristiwa) => onUbah({ what: peristiwa.target.value })}
        data-dresscode-apa=""
      />
      {catatanTampil ? (
        <TextField
          label="Note"
          optional
          maxLength={OUTFIT_BATAS.note}
          counter
          hint={`Shown only on the ${labelHalaman} page`}
          value={draf.note}
          onChange={(peristiwa) => onUbah({ note: peristiwa.target.value })}
          data-dresscode-catatan=""
        />
      ) : null}
      {/* Unggahan lewat endpoint yang sama dengan latar header; fotonya masuk draf sampai Save dress code. */}
      <input
        ref={berkas}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        disabled={adaUnggah || menyimpan}
        onChange={(peristiwa) => {
          const file = peristiwa.target.files?.[0];
          if (file) onUnggah(file);
          // Direset supaya memilih berkas yang sama dua kali tetap memicu onChange.
          peristiwa.target.value = "";
        }}
      />
      {draf.photo_url ? (
        <FotoDresscode url={draf.photo_url} unggah={unggah} mati={adaUnggah || menyimpan} onGanti={() => berkas.current?.click()} onHapus={() => onUbah({ photo_url: null })} />
      ) : null}
      {!catatanTampil || !draf.photo_url ? (
        <div className="-my-1 -ml-3 flex flex-wrap items-center gap-1">
          {!catatanTampil ? (
            <Button
              variant="text"
              size="sm"
              icon={<Plus size={16} />}
              onClick={() => {
                setCatatanBuka(true);
                fokusKartu(draf.kunci, "catatan");
              }}
            >
              Add note
            </Button>
          ) : null}
          {!draf.photo_url ? (
            <Button variant="text" size="sm" icon={<Plus size={16} />} loading={unggah} disabled={adaUnggah || menyimpan} onClick={() => berkas.current?.click()}>
              Add photo
            </Button>
          ) : null}
        </div>
      ) : null}
      {lihat ? (
        <p className="flex items-start gap-2 rounded-md bg-surface-container-high px-3 py-2 text-body-small text-on-surface-variant">
          <DeviceMobile size={16} className="mt-px shrink-0" aria-hidden />
          <span className="min-w-0">Participants see <span className="font-medium text-on-surface">{lihat}</span></span>
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * Isi segmen Dress code. `daftar` urutan simpan kartunya; yang tampil
 * menaruh Whole day di depan. Tiap kartu hanya mengubah dirinya lewat `kunci`,
 * jadi hasil unggahan yang tiba belakangan mendarat di kartu yang benar.
 */
export function EditorDresscode({
  idJudul, tab, labelHalaman, labelBatch, setiapHari, daftar, onUbah, baris, tautanTersimpan, banner, tabLain, coba, unggah, menyimpan, onUnggah, onBukaBagian, onBukaTab,
}: {
  idJudul: string;
  tab: { id: number; name: string };
  labelHalaman: string;
  labelBatch: string | null;
  /** Every day acara ini (Participant area), atau null. Hanya dibaca di sini. */
  setiapHari: OutfitSetiapHari | null;
  daftar: DrafDresscode[];
  onUbah: (daftar: DrafDresscode[]) => void;
  /** Baris tab ini seperti tersimpan, urut jam mulai. */
  baris: readonly BarisDc[];
  /** item_id yang tertaut di dress code tersimpan tab ini. */
  tautanTersimpan: ReadonlySet<number>;
  banner: BannerDc | null;
  /** Tab lain di tanggal yang sama yang belum punya dress code. */
  tabLain: Array<{ id: number; name: string }>;
  coba: boolean;
  /** Kunci kartu yang fotonya sedang diunggah. */
  unggah: string | null;
  menyimpan: boolean;
  onUnggah: (kunci: string, file: File) => void;
  onBukaBagian: () => void;
  onBukaTab: (id: number) => void;
}) {
  const [pemicuTambah, setPemicuTambah] = useState<HTMLSpanElement | null>(null);
  const menuTambah = usePopoverAnchor(pemicuTambah);
  const idMenu = useId();
  const tampil = urutDraf(daftar);
  const berjudul = baris.filter((item) => item.title.trim());
  const adaSeharian = daftar.some((isi) => isi.jenis === "seharian");
  const penuh = daftar.length >= OUTFIT_MAX;
  const kosong = kosongDresscode(setiapHari);
  const tertaut = (kecuali?: string) => new Set(daftar.flatMap((isi) => (isi.kunci !== kecuali && isi.jenis === "baris" && isi.item_id !== null ? [isi.item_id] : [])));

  function ubahKartu(kunci: string, perubahan: Partial<DrafDresscode>) {
    onUbah(daftar.map((isi) => (isi.kunci === kunci ? { ...isi, ...perubahan } : isi)));
  }

  function tambah(pilihan: PilihanUntuk) {
    const kartu = kartuBaru(pilihan.jenis, pilihan.jenis === "baris" ? pilihan.item_id : null);
    onUbah([...daftar, kartu]);
    fokusKartu(kartu.kunci, pilihan.jenis === "waktu" ? "nama" : "apa");
  }

  function tutupMenuTambah() {
    menuTambah.tutup();
    pemicuTambah?.querySelector("button")?.focus();
  }

  /**
   * Remove melepas tombolnya sendiri dari halaman, jadi fokus dipindah ke For
   * kartu sesudahnya, sebelumnya, atau tombol tambah, bukan jatuh ke <body>.
   */
  function hapusKartu(kunci: string) {
    const posisi = tampil.findIndex((isi) => isi.kunci === kunci);
    const tujuan = [tampil[posisi + 1], tampil[posisi - 1]].flatMap((isi) => (isi ? [`[data-dresscode-kartu="${isi.kunci}"] [data-dresscode-untuk]`] : []));
    onUbah(daftar.filter((isi) => isi.kunci !== kunci));
    window.setTimeout(() => {
      const el = [...tujuan, "[data-dresscode-tambah] button"].map((pilih) => document.querySelector<HTMLElement>(pilih)).find(Boolean);
      (el ?? document.getElementById(idJudul))?.focus();
    }, 0);
  }

  const banners = banner ? (
    <Banner tone="warning" icon={<Warning size={18} />}>
      <p>
        {banner.jenis === "draf"
          ? "Participants can’t see this tab yet. Turn on Show on public page in Section."
          : banner.jenis === "tanpaButir"
            ? "Participants can’t see this tab yet. Show at least one of its items on the public page."
            : `${banner.jumlah === 2 ? "Both" : `All ${banner.jumlah}`} ${banner.tanggal} tabs are set to Everyone, so every participant sees ${banner.tab}’s dress code. Set Who it’s for on each tab.`}
      </p>
      {banner.jenis !== "tanpaButir" ? <button type="button" onClick={onBukaBagian} className={cx("mt-1", TAUTAN)}>Open Section</button> : null}
    </Banner>
  ) : null;

  const tombolTambah = penuh ? (
    <p className="text-body-small text-on-surface-variant">{OUTFIT_MAX} is the most per tab, so the phone strip stays short.</p>
  ) : (
    <div data-dresscode-tambah="" className="flex flex-wrap items-center gap-2">
      {!adaSeharian ? (
        <Button variant="outlined" size="sm" icon={<Plus size={16} />} onClick={() => tambah({ jenis: "seharian" })}>Add for the whole day</Button>
      ) : null}
      <span ref={setPemicuTambah} className="inline-flex">
        <Button
          variant="outlined"
          size="sm"
          icon={<Plus size={16} />}
          trailingIcon={<CaretDown size={14} className="-mr-0.5" aria-hidden />}
          aria-haspopup="dialog"
          aria-expanded={menuTambah.open}
          aria-controls={menuTambah.open ? idMenu : undefined}
          onClick={menuTambah.toggle}
          onKeyDown={(peristiwa) => {
            if (menuTambah.open || peristiwa.key !== "ArrowDown") return;
            peristiwa.preventDefault();
            menuTambah.buka();
          }}
        >
          Add for an agenda item
        </Button>
      </span>
      {menuTambah.open ? (
        <MenuUntuk
          anchor={menuTambah}
          id={idMenu}
          label="Add for an agenda item"
          baris={berjudul}
          dipakai={tertaut()}
          tawarSeharian={false}
          terpilih={null}
          onPilih={(pilihan) => {
            menuTambah.tutup();
            tambah(pilihan);
          }}
          onTutup={tutupMenuTambah}
        />
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 id={idJudul} tabIndex={-1} className="text-body-medium font-semibold text-on-surface">Dress code</h3>
        <p className="mt-1 text-body-medium text-on-surface-variant">{tab.name.trim()} only. Other tabs have their own.</p>
        {/* Nama halaman berlaku untuk seluruh acara, jadi disunting di Participant area, bukan per tab.
            ?fokus=: Participant area membawa kolomnya ke layar, jauh di bawah halaman itu. */}
        <p className="mt-2 text-body-small text-on-surface-variant">
          Participants see the page as <span className="font-medium text-on-surface">{labelHalaman}</span>.{" "}
          <Link href="/admin/area-peserta?fokus=nama-halaman" className={TAUTAN}>
            Rename in Participant area
            <ArrowSquareOut size={14} aria-hidden />
          </Link>
        </p>
      </div>
      {banners}
      {setiapHari ? (
        // Satu baris untuk seluruh acara punya satu tempat sunting (Participant
        // area); di sini hanya dibaca, dengan apakah tab ini menampilkannya.
        <div className="flex items-start gap-2 rounded-md bg-surface-container-high p-3 text-body-medium text-on-surface-variant">
          <CoatHanger size={16} className="mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p>
              <span className="font-medium text-on-surface">{SETIAP_HARI_ADMIN}:</span> <span className="text-on-surface">{setiapHari.what}</span>
            </p>
            <p className="mt-0.5 text-body-small">{keteranganSetiapHari(adaSeharian)}</p>
            <Link href="/admin/area-peserta?fokus=setiap-hari" className={cx("mt-1", TAUTAN)}>
              Edit in Participant area
              <ArrowSquareOut size={14} aria-hidden />
            </Link>
          </div>
        </div>
      ) : null}
      {tampil.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-outline-variant p-4">
          <div>
            <p className="text-body-medium font-semibold text-on-surface">{kosong.judul}</p>
            <p className="mt-1 text-body-medium text-on-surface-variant">{kosong.teks}</p>
          </div>
          {tombolTambah}
        </div>
      ) : (
        <>
          {tampil.map((isi, indeks) => (
            <KartuDresscode
              key={isi.kunci}
              draf={isi}
              labelHalaman={labelHalaman}
              labelBatch={labelBatch}
              setiapHari={setiapHari}
              baris={berjudul}
              dipakai={tertaut(isi.kunci)}
              seharianBebas={!adaSeharian}
              // Whole day selalu di depan, jadi Whole day sesudah kartu pertama adalah yang kedua.
              seharianGanda={isi.jenis === "seharian" && indeks > 0}
              tautanTersimpan={isi.item_id !== null && tautanTersimpan.has(isi.item_id)}
              coba={coba}
              unggah={unggah === isi.kunci}
              adaUnggah={unggah !== null}
              menyimpan={menyimpan}
              onUbah={(perubahan) => ubahKartu(isi.kunci, perubahan)}
              onHapus={() => hapusKartu(isi.kunci)}
              onUnggah={(file) => onUnggah(isi.kunci, file)}
            />
          ))}
          {tombolTambah}
        </>
      )}
      {tabLain.map((lain) => (
        <div key={lain.id} className="flex items-start gap-2 rounded-md bg-surface-container-high p-3 text-body-medium text-on-surface-variant">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p><span className="font-medium text-on-surface">{lain.name.trim()}</span> has no dress code yet. Each batch tab needs its own.</p>
            <button type="button" onClick={() => onBukaTab(lain.id)} className={cx("mt-1", TAUTAN)}>Open that tab</button>
          </div>
        </div>
      ))}
    </div>
  );
}
