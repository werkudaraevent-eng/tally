"use client";

import { ArrowSquareOut, CaretDown, Check, MagnifyingGlass, WarningCircle, X } from "@phosphor-icons/react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Popover, usePopoverAnchor } from "@/components/m3";
import type { EventLandingConfig, LandingSessionRef, LandingSpeaker } from "@/lib/domain";
import { cocokSesi, labelSesi, sesiDariRundown } from "@/lib/landing-speaker-tabs";
import { formatClock, type RundownItem, type RundownSection } from "@/lib/rundown";
import { cx } from "@/lib/m3/cx";

/**
 * Satu baris rundown yang bisa dipilih sebagai sesi pembicara. Barisnya sama
 * dengan yang dibaca halaman acara (loadAgendaPreview): urut bagian lalu urutan
 * baris, paling banyak 40 per bagian, tanpa baris tak berjudul. Baris jeda
 * (`is_break`) tidak ditawarkan; penutupan atau registrasi tetap bisa dipilih.
 */
export type BarisSesi = { id: number; jam: string; title: string; title_en: string; bagian: string | null };

/** Sama dengan MAX_ITEMS di landing-agenda.ts: baris sesudahnya tidak tampil di halaman acara. */
const BARIS_MAKS_PER_BAGIAN = 40;
/** Daftar lebih panjang dari ini mendapat kolom cari. */
const CARI_MULAI = 10;
/** Chip yang tampil di kolom; sisanya diringkas "+N" supaya kolom tetap 36px. */
const CHIP_MAKS = 2;

export function barisSesiDariAdmin(isi: { sections?: RundownSection[]; items?: RundownItem[] }): BarisSesi[] {
  const bagian = [...(isi.sections ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return bagian.flatMap((seksi) =>
    (isi.items ?? [])
      .filter((item) => item.section_id === seksi.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      // Potong dulu, baru buang yang tak berjudul: urutannya sama dengan
      // loadAgendaPreview, jadi tidak ada pilihan yang tak pernah tampil.
      .slice(0, BARIS_MAKS_PER_BAGIAN)
      .filter((item) => item.title?.trim())
      .filter((item) => !item.is_break)
      .map((item) => ({
        id: item.id,
        jam: formatClock(item.start_time).replace(":", "."),
        title: item.title.trim(),
        title_en: item.title_en?.trim() ?? "",
        bagian: seksi.title?.trim() || null,
      })),
  );
}

/** Label tersimpan satu baris: "Sesi 1", dipakai chip saat barisnya sudah tidak ada. */
function ref(item: BarisSesi): LandingSessionRef {
  return { id: item.id, label: labelSesi(item.title) };
}

export type HasilPetakan = { terhubung: number; perluDipilih: number };

/**
 * Sesi teks lama ("Sesi 1") dihubungkan ke baris rundown bila TEPAT SATU baris
 * cocok dengan awal judul Indonesianya. Tidak cocok, atau cocok dengan beberapa
 * baris (sesi bernama sama di dua hari), dibiarkan sebagai teks lama: halaman
 * acara tetap menampilkannya seperti sekarang sampai seseorang memilih barisnya.
 * Teks lama dan `en.session` tidak dihapus, untuk jaga-jaga.
 */
export function petakanSesiLama(landing: EventLandingConfig, baris: BarisSesi[]): { landing: EventLandingConfig; hasil: HasilPetakan } {
  const hasil: HasilPetakan = { terhubung: 0, perluDipilih: 0 };
  const speakers = landing.speakers?.map((speaker) => {
    const label = speaker.session?.trim();
    if (sesiDariRundown(speaker) || !label || !speaker.name?.trim()) return speaker;
    const cocok = baris.filter((item) => cocokSesi(label, item.title));
    if (cocok.length !== 1) {
      hasil.perluDipilih += 1;
      return speaker;
    }
    hasil.terhubung += 1;
    return { ...speaker, session_refs: [ref(cocok[0])] };
  });
  return { landing: hasil.terhubung ? { ...landing, speakers } : landing, hasil };
}

/** Sesi pembicara yang barisnya sudah tidak ada di rundown. Kosong bila rundown belum diketahui. */
export function sesiHilang(speaker: LandingSpeaker, baris: BarisSesi[] | null): LandingSessionRef[] {
  if (!baris || !speaker.session_refs) return [];
  return speaker.session_refs.filter((item) => !baris.some((b) => b.id === item.id));
}

/**
 * Kolom Sesi pembicara: pilihan ganda dari baris rundown.
 *
 * Pola APG combobox dengan listbox pilihan ganda. Fokus tetap di combobox,
 * `aria-activedescendant` yang bergerak; Spasi atau Enter mencentang tanpa
 * menutup menu, Esc menutup. Chip dan tombol lepasnya berdiri di LUAR tombol
 * combobox (tombol di dalam tombol tidak sah).
 *
 * Tinggi kolom tetap 36px seperti kolom lain di panel: paling banyak dua chip,
 * sisanya "+N". Kolom yang tumbuh saat mencentang akan bergeser ke bawah menu,
 * karena Popover hanya mengukur pemicunya saat dibuka. Semua pilihan tetap
 * terbaca sebagai baris tercentang di menu.
 *
 * `baris` null berarti rundown gagal dimuat: pilihan yang tersimpan dibiarkan
 * apa adanya dan tidak dianggap hilang.
 */
export function PilihSesi({ speaker, baris, memuat, onChange, onMuatUlang }: {
  speaker: LandingSpeaker;
  baris: BarisSesi[] | null;
  /** Rundown sedang dimuat (`baris` masih null, belum gagal). */
  memuat?: boolean;
  onChange: (next: LandingSpeaker) => void;
  onMuatUlang: () => void;
}) {
  const [pemicu, setPemicu] = useState<HTMLButtonElement | null>(null);
  const kerangka = useRef<HTMLDivElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const [cari, setCari] = useState("");
  const [sorot, setSorot] = useState(0);
  const [lebar, setLebar] = useState<number | undefined>(undefined);
  const [kabar, setKabar] = useState("");
  const [diubah, setDiubah] = useState(false);
  const id = useId();
  const nama = speaker.name?.trim() || "pembicara ini";

  const refs = speaker.session_refs ?? [];
  const ids = refs.map((item) => item.id);
  const dikenal = baris ?? [];
  const hilang = sesiHilang(speaker, baris);
  // Sesi teks lama yang belum terhubung (petakanSesiLama sudah menghubungkan
  // yang cocok dengan tepat satu baris).
  const lama = !sesiDariRundown(speaker) ? speaker.session?.trim() : undefined;

  // Yang hilang dari rundown lebih dulu, dengan label terakhirnya, supaya tidak
  // pernah tersembunyi di "+N"; sisanya urut rundown.
  const chip: Array<{ ref: LandingSessionRef; jam: string | null; hilang: boolean }> = [
    ...(baris ? hilang : refs).map((item) => ({ ref: item, jam: null, hilang: !!baris })),
    ...dikenal.filter((item) => ids.includes(item.id)).map((item) => ({ ref: ref(item), jam: item.jam, hilang: false })),
  ];
  const tampilChip = chip.slice(0, CHIP_MAKS);
  const sisaChip = chip.length - tampilChip.length;

  const kunci = cari.trim().toLowerCase();
  const pilihan = kunci ? dikenal.filter((item) => `${item.jam} ${item.title}`.toLowerCase().includes(kunci)) : dikenal;
  const beberapaBagian = new Set(dikenal.map((item) => item.bagian)).size > 1;
  const pakaiCari = dikenal.length > CARI_MULAI;

  const simpan = (next: LandingSessionRef[]) => onChange({ ...speaker, session_refs: next });
  // Urut rundown, bukan urut klik; label diperbarui dari judul sekarang.
  const ganti = (item: BarisSesi) => {
    const pilih = ids.includes(item.id) ? ids.filter((x) => x !== item.id) : [...ids, item.id];
    setDiubah(true);
    simpan([...dikenal.filter((b) => pilih.includes(b.id)).map(ref), ...hilang.filter((h) => pilih.includes(h.id))]);
  };
  const lepas = (target: LandingSessionRef, posisi: number) => {
    setDiubah(true);
    simpan(refs.filter((item) => item.id !== target.id));
    setKabar(`${target.label} dilepas`);
    // Fokus ke tombol lepas berikutnya, atau ke combobox bila tidak ada lagi.
    window.requestAnimationFrame(() => {
      const tombol = kerangka.current?.querySelectorAll<HTMLButtonElement>("[data-lepas]");
      (tombol?.[Math.min(posisi, (tombol?.length ?? 1) - 1)] ?? pemicu)?.focus();
    });
  };
  const lepasLama = () => {
    setDiubah(true);
    simpan([]);
    setKabar(`Sesi lama "${lama}" dilepas`);
    window.requestAnimationFrame(() => pemicu?.focus());
  };

  function buka() {
    setCari("");
    setLebar(kerangka.current?.getBoundingClientRect().width);
    const pertama = dikenal.findIndex((item) => ids.includes(item.id));
    setSorot(Math.max(0, pertama));
    menu.buka();
  }
  function tutup() {
    menu.tutup();
    pemicu?.focus();
  }

  function onKeyDown(peristiwa: KeyboardEvent) {
    if (!menu.open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(peristiwa.key)) {
        peristiwa.preventDefault();
        buka();
      }
      return;
    }
    const n = pilihan.length;
    if (peristiwa.key === "Escape") { peristiwa.preventDefault(); peristiwa.stopPropagation(); tutup(); return; }
    if (peristiwa.key === "Tab") { menu.tutup(); return; }
    if (n === 0) return;
    if (peristiwa.key === "ArrowDown" || peristiwa.key === "ArrowUp") {
      peristiwa.preventDefault();
      const arah = peristiwa.key === "ArrowDown" ? 1 : -1;
      setSorot((indeks) => (Math.min(indeks, n - 1) + arah + n) % n);
      return;
    }
    if (peristiwa.key === "Home") { peristiwa.preventDefault(); setSorot(0); return; }
    // Tanpa kolom cari: satu huruf melompat ke baris berikut yang jam atau
    // judulnya diawali huruf itu (APG listbox, type-ahead).
    if (!pakaiCari && peristiwa.key.length === 1 && peristiwa.key !== " " && !peristiwa.ctrlKey && !peristiwa.metaKey && !peristiwa.altKey) {
      const huruf = peristiwa.key.toLowerCase();
      const mulai = Math.min(sorot, n - 1);
      for (let langkah = 1; langkah <= n; langkah += 1) {
        const indeks = (mulai + langkah) % n;
        const item = pilihan[indeks];
        if (item.title.toLowerCase().startsWith(huruf) || item.jam.startsWith(huruf)) {
          peristiwa.preventDefault();
          setSorot(indeks);
          break;
        }
      }
      return;
    }
    if (peristiwa.key === "End") { peristiwa.preventDefault(); setSorot(n - 1); return; }
    // Di kolom cari, Spasi adalah huruf; Enter yang mencentang.
    if (peristiwa.key === "Enter" || (peristiwa.key === " " && peristiwa.currentTarget === pemicu)) {
      peristiwa.preventDefault();
      const item = pilihan[Math.min(sorot, n - 1)];
      if (item) ganti(item);
    }
  }

  function opsi(item: BarisSesi) {
    const indeks = pilihan.indexOf(item);
    const on = ids.includes(item.id);
    return (
      <li key={item.id} role="none">
        <div
          id={`${id}-${item.id}`}
          role="option"
          aria-selected={on}
          title={item.title}
          onPointerDown={(peristiwa) => peristiwa.preventDefault()}
          onClick={() => { setSorot(indeks); ganti(item); }}
          onPointerMove={() => setSorot(indeks)}
          className={cx(
            "flex min-h-[34px] cursor-pointer items-start gap-2.5 rounded-md px-3 py-[7px] text-body-medium text-on-surface",
            aktif?.id === item.id ? "bg-primary-soft" : "",
          )}
        >
          <span aria-hidden className={cx("mt-0.5 grid size-4 shrink-0 place-items-center rounded border", on ? "border-primary bg-primary text-on-primary" : "border-on-surface-variant")}>
            {on ? <Check size={12} weight="bold" /> : null}
          </span>
          <span className="w-10 shrink-0 tabular-nums text-on-surface-variant">{item.jam}</span>
          <span className="line-clamp-2 min-w-0 flex-1">{item.title}</span>
        </div>
      </li>
    );
  }

  const ringkasan = chip.length
    ? `${chip.length} dipilih: ${chip.map((c) => (c.jam ? `${c.ref.label} ${c.jam}` : `${c.ref.label}${c.hilang ? ", dihapus dari rundown" : ""}`)).join(", ")}`
    : lama ? `Sesi lama "${lama}", belum terhubung ke rundown` : baris === null ? (memuat ? "Memuat rundown" : "Rundown gagal dimuat") : dikenal.length === 0 ? "Rundown belum punya sesi" : "Pilih sesi";
  const aktif = menu.open && pilihan.length ? pilihan[Math.min(sorot, pilihan.length - 1)] : undefined;
  const galat = hilang.length ? `${hilang.length} sesi tidak ada lagi di rundown. Pilih ulang atau lepas.` : null;
  // Teks lama hanya peringatan, dan hanya bila rundown sudah dimuat: selama
  // rundown gagal dimuat, cocok tidaknya belum diketahui.
  const peringatan = !galat && lama && baris ? "Sesi lama ini tidak cocok dengan satu baris rundown. Pilih barisnya supaya foto dan jamnya tampil." : null;
  const pesan = galat ?? peringatan;

  return (
    <div>
      <label htmlFor={`${id}-cb`} className="m3-field-label flex items-baseline gap-2 text-label-large font-semibold text-on-surface">
        Sesi
        <span className="text-body-small font-normal text-on-surface-variant">opsional</span>
      </label>
      {/* Klik di mana pun di kolom (ruang kosong, chip, "+N") membuka menu,
          kecuali tombol lepas chip. */}
      <div
        ref={kerangka}
        onClick={(peristiwa) => {
          const target = peristiwa.target as HTMLElement;
          if (menu.open || target.closest("[data-lepas]") || pemicu?.contains(target)) return;
          buka();
          pemicu?.focus();
        }}
        className={cx(
          "relative mt-2 flex h-9 min-w-0 cursor-pointer items-center gap-1 overflow-hidden rounded-lg border bg-surface-container-lowest pl-1.5 transition-[border-color,box-shadow] duration-150 ease-standard",
          "focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--md-sys-color-primary)_15%,transparent)]",
          menu.open ? "border-primary" : galat ? "border-error focus-within:border-error" : peringatan ? "border-warning focus-within:border-warning" : "border-outline focus-within:border-primary",
        )}
      >
        {tampilChip.map((c, posisi) => (
          <span
            key={c.ref.id}
            title={c.hilang ? `${c.ref.label} sudah dihapus dari rundown` : dikenal.find((b) => b.id === c.ref.id)?.title}
            className={cx(
              "inline-flex h-6 max-w-[8.25rem] shrink-0 items-center rounded-md pl-1.5 text-[13px] font-medium leading-4",
              c.hilang ? "bg-error-soft text-error" : "bg-accent-soft text-primary",
            )}
          >
            {c.hilang ? <WarningCircle size={14} weight="fill" className="mr-1 shrink-0" aria-hidden /> : null}
            <span className="min-w-0 truncate">
              {c.jam ? <span className="font-semibold tabular-nums">{c.jam} </span> : null}
              {c.ref.label}
            </span>
            <button
              type="button"
              data-lepas
              aria-label={`Lepas ${c.ref.label}${c.jam ? ` (${c.jam})` : ""} dari ${nama}`}
              onClick={() => lepas(c.ref, posisi)}
              className="grid size-6 shrink-0 place-items-center rounded-md hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)]"
            >
              <X size={14} weight="bold" aria-hidden />
            </button>
          </span>
        ))}
        {sisaChip > 0 ? (
          <span aria-hidden className="inline-flex h-6 shrink-0 items-center rounded-md bg-surface-container-high px-1.5 text-[13px] font-medium tabular-nums text-on-surface-variant">
            +{sisaChip}
          </span>
        ) : null}
        {lama ? (
          <span
            title={baris ? `"${lama}" belum terhubung ke rundown` : lama}
            className={cx(
              "inline-flex h-6 max-w-[15rem] shrink-0 items-center rounded-md pl-1.5 text-[13px] font-medium leading-4",
              // Selama rundown gagal dimuat, cocok tidaknya belum diketahui: netral.
              baris ? "bg-warning-soft text-warning" : "bg-surface-container-high text-on-surface",
            )}
          >
            {baris ? <WarningCircle size={14} weight="fill" className="mr-1 shrink-0" aria-hidden /> : null}
            <span className="min-w-0 truncate">{baris ? `${lama} · belum terhubung` : lama}</span>
            <button
              type="button"
              data-lepas
              aria-label={`Lepas sesi lama "${lama}" dari ${nama}`}
              onClick={lepasLama}
              className="grid size-6 shrink-0 place-items-center rounded-md hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)]"
            >
              <X size={14} weight="bold" aria-hidden />
            </button>
          </span>
        ) : null}
        <button
          ref={setPemicu}
          id={`${id}-cb`}
          type="button"
          role="combobox"
          aria-haspopup="dialog"
          aria-expanded={menu.open}
          aria-controls={menu.open ? `${id}-menu` : undefined}
          aria-activedescendant={aktif && !pakaiCari ? `${id}-${aktif.id}` : undefined}
          aria-describedby={`${id}-pesan`}
          onClick={() => (menu.open ? menu.tutup() : buka())}
          onKeyDown={onKeyDown}
          className="flex h-full min-w-8 flex-1 items-center gap-2 pr-2.5 text-left text-body-medium outline-none!"
        >
          <span className={cx("min-w-0 flex-1 truncate", chip.length || lama ? "sr-only" : "text-on-surface-variant/70")}>{ringkasan}</span>
          <CaretDown size={14} className={cx("ml-auto shrink-0 text-on-surface-variant transition-transform", menu.open && "rotate-180")} aria-hidden />
        </button>
      </div>
      <p
        id={`${id}-pesan`}
        // Diumumkan hanya bila muncul karena suntingan, bukan saat halaman dibuka.
        role={galat && diubah ? "alert" : undefined}
        className={cx("mt-2 flex items-start gap-1.5 text-body-small", galat ? "font-medium text-error" : peringatan ? "font-medium text-warning" : "text-on-surface-variant")}
      >
        {pesan ? <WarningCircle size={16} weight="fill" className="mt-px shrink-0" aria-hidden /> : null}
        {pesan ?? (baris === null ? (memuat ? "Memuat rundown…" : "Rundown gagal dimuat. Sesi yang sudah dipilih tetap tersimpan.") : "Pembicara tampil di tab dan baris rundown setiap sesi yang dipilih.")}
      </p>
      <span className="sr-only" aria-live="polite">{kabar}</span>

      <Popover anchor={menu} id={`${id}-menu`} label="Pilih sesi" role="dialog" align="end" width={lebar} className="flex max-h-[min(24rem,60vh)] flex-col p-1">
        {pakaiCari ? (
          <div className="relative shrink-0 px-1 pb-1 pt-0.5">
            <MagnifyingGlass size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden />
            <input
              type="search"
              autoFocus
              value={cari}
              onChange={(peristiwa) => { setCari(peristiwa.target.value); setSorot(0); }}
              onKeyDown={onKeyDown}
              placeholder="Cari jam atau judul"
              aria-label="Cari sesi"
              aria-controls={pilihan.length ? `${id}-daftar` : undefined}
              aria-activedescendant={aktif ? `${id}-${aktif.id}` : undefined}
              className="h-8 w-full rounded-md border border-outline bg-surface-container-lowest pl-8 pr-2 text-body-medium text-on-surface outline-none focus:border-primary"
            />
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
          {baris === null && memuat ? (
            <p className="px-3 py-2 text-body-medium text-on-surface-variant">Memuat rundown…</p>
          ) : baris === null ? (
            <div className="px-3 py-2 text-body-medium text-on-surface-variant">
              Rundown gagal dimuat.{" "}
              <button type="button" onClick={() => { onMuatUlang(); pemicu?.focus(); }} className="font-medium text-primary underline">Muat ulang</button>
            </div>
          ) : dikenal.length === 0 ? (
            <p className="px-3 py-2 text-body-medium text-on-surface-variant">Rundown acara belum punya sesi. Tambahkan di Rundown.</p>
          ) : pilihan.length === 0 ? (
            <p className="px-3 py-2 text-body-medium text-on-surface-variant">Tidak ada yang cocok.</p>
          ) : (
            <ul id={`${id}-daftar`} role="listbox" aria-multiselectable="true" aria-label="Sesi dari rundown">
              {beberapaBagian
                ? kelompok(pilihan).map(({ bagian, isi }, urutan) => (
                    // APG listbox berkelompok: tiap hari satu group berlabel judul bagiannya.
                    <li key={`${bagian}-${urutan}`} role="none">
                      <ul role="group" aria-labelledby={`${id}-g${urutan}`}>
                        <li id={`${id}-g${urutan}`} role="presentation" className="px-3 pb-1 pt-2 text-label-medium font-semibold text-on-surface-variant">
                          {bagian ?? "Tanpa judul"}
                        </li>
                        {isi.map(opsi)}
                      </ul>
                    </li>
                  ))
                : pilihan.map(opsi)}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-outline-variant px-3 pb-1 pt-2 text-body-medium">
          <span className="text-on-surface-variant">{ids.length ? `${ids.length} dipilih` : ""}</span>
          <a href={rundownHref()} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-sm font-medium text-primary hover:underline">
            Atur rundown
            <ArrowSquareOut size={14} aria-hidden />
            <span className="sr-only">(tab baru)</span>
          </a>
        </div>
      </Popover>
    </div>
  );
}

/** Baris berurutan dikelompokkan per bagian (hari), urutan tetap. */
function kelompok(baris: BarisSesi[]): Array<{ bagian: string | null; isi: BarisSesi[] }> {
  const hasil: Array<{ bagian: string | null; isi: BarisSesi[] }> = [];
  for (const item of baris) {
    const akhir = hasil[hasil.length - 1];
    if (akhir && akhir.bagian === item.bagian) akhir.isi.push(item);
    else hasil.push({ bagian: item.bagian, isi: [item] });
  }
  return hasil;
}

/** Rundown acara ini, dibuka di tab baru supaya suntingan halaman yang belum disimpan tidak hilang. */
function rundownHref(): string {
  if (typeof window === "undefined") return "/admin/rundown";
  const slug = window.location.pathname.match(/^\/e\/([^/]+)/)?.[1];
  return slug ? `/e/${slug}/admin/rundown` : "/admin/rundown";
}
