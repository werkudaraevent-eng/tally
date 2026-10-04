"use client";

import { ArrowSquareOut, CaretDown, Check, MagnifyingGlass, WarningCircle, X } from "@phosphor-icons/react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { IconButton, Popover, usePopoverAnchor } from "@/components/m3";
import type { EventLandingConfig, LandingSessionRef, LandingSpeaker } from "@/lib/domain";
import { cocokSesi, labelSesi, sesiDariRundown } from "@/lib/landing-speaker-tabs";
import { gabungEntriSesi, kunciPeran, saranPeran, ubahPeranEntri, type SaranPeran } from "@/lib/landing-peran-sesi";
import { plural } from "@/lib/plural";
import { formatClock, type RundownItem, type RundownSection } from "@/lib/rundown";
import { cx } from "@/lib/m3/cx";

/**
 * Satu baris rundown yang bisa dipilih sebagai sesi pembicara. Barisnya sama
 * dengan yang dibaca halaman acara (loadAgendaPreview): hanya bagian dan baris
 * yang diterbitkan, urut bagian lalu urutan baris, paling banyak 40 per bagian,
 * tanpa baris tak berjudul. Baris jeda
 * (`is_break`) tidak ditawarkan; penutupan atau registrasi tetap bisa dipilih.
 */
export type BarisSesi = { id: number; jam: string; title: string; title_en: string; bagian: string | null };

/** Sama dengan MAX_ITEMS di landing-agenda.ts: baris sesudahnya tidak tampil di halaman acara. */
const BARIS_MAKS_PER_BAGIAN = 40;
/** Daftar lebih panjang dari ini mendapat kolom cari. */
const CARI_MULAI = 10;

export function barisSesiDariAdmin(isi: { sections?: RundownSection[]; items?: RundownItem[] }): BarisSesi[] {
  // Hanya yang tampil di halaman acara: bagian dan baris yang diterbitkan.
  const bagian = [...(isi.sections ?? [])].filter((seksi) => seksi.is_published).sort((a, b) => a.sort_order - b.sort_order);
  return bagian.flatMap((seksi) =>
    (isi.items ?? [])
      .filter((item) => item.section_id === seksi.id && item.is_published)
      .sort(urutRundown)
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

/**
 * Urutan CMS rundown dan halaman acara: jam mulai (tanpa jam di akhir, seperti
 * ORDER BY Postgres), lalu `sort_order` untuk sesi berjam sama, lalu id.
 */
export function urutRundown(a: Pick<RundownItem, "start_time" | "sort_order" | "id">, b: Pick<RundownItem, "start_time" | "sort_order" | "id">): number {
  if (a.start_time !== b.start_time) {
    if (!a.start_time) return 1;
    if (!b.start_time) return -1;
    return a.start_time < b.start_time ? -1 : 1;
  }
  return a.sort_order - b.sort_order || a.id - b.id;
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
 * Kolom Sesi pembicara: pilihan ganda dari baris rundown, lalu satu baris per
 * sesi terpilih dengan perannya di sesi itu.
 *
 * Combobox mengikuti pola APG dengan listbox pilihan ganda. Fokus tetap di
 * combobox, `aria-activedescendant` yang bergerak; Spasi atau Enter mencentang
 * tanpa menutup menu, Esc menutup. Combobox hanya untuk menambah: sesi yang
 * dipilih tampil di bawahnya sebagai daftar dua baris (jam, judul, tombol
 * lepas; lalu kolom peran selebar panel), karena panel editor hanya 400-440px
 * dan judul sesi harus terbaca utuh.
 *
 * `baris` null berarti rundown gagal dimuat: pilihan yang tersimpan dibiarkan
 * apa adanya, tetap bisa diberi peran, dan tidak dianggap hilang.
 */
export function PilihSesi({ speaker, speakers, baris, memuat, onChange, onMuatUlang }: {
  speaker: LandingSpeaker;
  /** Semua pembicara di editor (termasuk yang belum disimpan), sumber saran peran. */
  speakers: LandingSpeaker[];
  baris: BarisSesi[] | null;
  /** Rundown sedang dimuat (`baris` masih null, belum gagal). */
  memuat?: boolean;
  onChange: (next: LandingSpeaker) => void;
  onMuatUlang: () => void;
}) {
  const [pemicu, setPemicu] = useState<HTMLButtonElement | null>(null);
  const kerangka = useRef<HTMLDivElement | null>(null);
  const daftarRef = useRef<HTMLUListElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const [cari, setCari] = useState("");
  const [sorot, setSorot] = useState(0);
  const [lebar, setLebar] = useState<number | undefined>(undefined);
  const [kabar, setKabar] = useState("");
  const [diubah, setDiubah] = useState(false);
  const id = useId();
  const nama = speaker.name?.trim() || "this speaker";

  const refs = speaker.session_refs ?? [];
  const ids = refs.map((item) => item.id);
  const dikenal = baris ?? [];
  const hilang = sesiHilang(speaker, baris);
  // Sesi teks lama yang belum terhubung (petakanSesiLama sudah menghubungkan
  // yang cocok dengan tepat satu baris).
  const lama = !sesiDariRundown(speaker) ? speaker.session?.trim() : undefined;

  // Yang hilang dari rundown lebih dulu, dengan label terakhirnya; sisanya urut
  // rundown. Selama rundown gagal dimuat, urut tersimpan.
  const terpilih: Array<{ ref: LandingSessionRef; item: BarisSesi | null; hilang: boolean }> = baris
    ? [
        ...hilang.map((item) => ({ ref: item, item: null, hilang: true })),
        ...dikenal.filter((item) => ids.includes(item.id)).map((item) => ({ ref: refs.find((r) => r.id === item.id)!, item, hilang: false })),
      ]
    : refs.map((item) => ({ ref: item, item: null, hilang: false }));

  const kunci = cari.trim().toLowerCase();
  const pilihan = kunci ? dikenal.filter((item) => `${item.jam} ${item.title}`.toLowerCase().includes(kunci)) : dikenal;
  const beberapaBagian = new Set(dikenal.map((item) => item.bagian)).size > 1;
  const pakaiCari = dikenal.length > CARI_MULAI;

  const simpan = (next: LandingSessionRef[]) => onChange({ ...speaker, session_refs: next });
  // Urut rundown, bukan urut klik; label diperbarui dari judul sekarang. Peran
  // dan versi English-nya ikut dari entri yang sudah ada.
  const ganti = (item: BarisSesi) => {
    const pilih = ids.includes(item.id) ? ids.filter((x) => x !== item.id) : [...ids, item.id];
    setDiubah(true);
    simpan([
      ...gabungEntriSesi(dikenal.filter((b) => pilih.includes(b.id)).map(ref), refs),
      ...hilang.filter((h) => pilih.includes(h.id)),
    ]);
  };
  const ubahPeran = (target: number, role: string, en?: string) => {
    simpan(refs.map((item) => (item.id === target ? ubahPeranEntri(item, role, en) : item)));
  };
  const lepas = (target: LandingSessionRef, label: string, posisi: number) => {
    setDiubah(true);
    simpan(refs.filter((item) => item.id !== target.id));
    setKabar(`${label} removed`);
    // Fokus ke tombol lepas berikutnya, atau ke combobox bila tidak ada lagi.
    window.requestAnimationFrame(() => {
      const tombol = daftarRef.current?.querySelectorAll<HTMLButtonElement>("[data-lepas]");
      (tombol?.[Math.min(posisi, (tombol?.length ?? 1) - 1)] ?? pemicu)?.focus();
    });
  };
  const lepasLama = () => {
    setDiubah(true);
    simpan([]);
    setKabar(`Old session "${lama}" removed`);
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

  const ringkasan = terpilih.length
    ? `${terpilih.length} selected. Add session`
    : lama ? `Old session "${lama}", not linked to the agenda` : baris === null ? (memuat ? "Loading agenda" : "Agenda failed to load") : dikenal.length === 0 ? "No published sessions yet" : "Add session";
  const aktif = menu.open && pilihan.length ? pilihan[Math.min(sorot, pilihan.length - 1)] : undefined;
  const galat = hilang.length ? `${hilang.length === 1 ? "1 session is" : `${hilang.length} sessions are`} no longer shown in the agenda: deleted, unpublished, or turned into a break. Pick again or remove.` : null;
  // Teks lama hanya peringatan, dan hanya bila rundown sudah dimuat dan ada
  // sesi yang bisa dipilih: tanpa sesi terbit, tidak ada yang bisa dicocokkan.
  const peringatan = !galat && lama && baris && dikenal.length > 0 ? "This old session doesn't match one agenda row. Pick its row so the photo and time show." : null;
  const pesan = galat ?? peringatan;
  const utama = speaker.role?.trim();

  return (
    <div>
      <label htmlFor={`${id}-cb`} className="m3-field-label flex items-baseline gap-2 text-label-large font-semibold text-on-surface">
        Sessions
        <span className="text-body-small font-normal text-on-surface-variant">optional</span>
      </label>
      <div
        ref={kerangka}
        className={cx(
          "relative mt-2 flex h-9 min-w-0 items-center overflow-hidden rounded-lg border bg-surface-container-lowest transition-[border-color,box-shadow] duration-150 ease-standard",
          "focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--md-sys-color-primary)_15%,transparent)]",
          menu.open ? "border-primary" : galat ? "border-error focus-within:border-error" : peringatan ? "border-warning focus-within:border-warning" : "border-outline focus-within:border-primary",
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
          aria-activedescendant={aktif && !pakaiCari ? `${id}-${aktif.id}` : undefined}
          aria-describedby={`${id}-pesan`}
          onClick={() => (menu.open ? menu.tutup() : buka())}
          onKeyDown={onKeyDown}
          className="flex h-full min-w-0 flex-1 items-center gap-2 pl-3 pr-2.5 text-left text-body-medium outline-none!"
        >
          <span aria-hidden className="min-w-0 flex-1 truncate text-on-surface-variant">
            {baris === null ? (memuat ? "Loading agenda…" : "Agenda failed to load") : dikenal.length === 0 && !terpilih.length ? "No published sessions yet" : "Add session"}
          </span>
          <span className="sr-only">{ringkasan}</span>
          <CaretDown size={14} className={cx("ml-auto shrink-0 text-on-surface-variant transition-transform", menu.open && "rotate-180")} aria-hidden />
        </button>
      </div>

      {terpilih.length || lama ? (
        <ul ref={daftarRef} aria-label={`Sessions of ${nama}`} className="mt-2 overflow-hidden rounded-lg border border-outline-variant">
          {lama ? (
            <li className="flex items-start gap-3 py-1.5 pl-3 pr-1">
              <WarningCircle size={16} weight="fill" className={cx("mt-2.5 shrink-0", baris ? "text-warning" : "text-on-surface-variant")} aria-hidden />
              <div className="min-w-0 flex-1 py-2">
                <p className="break-words text-body-medium text-on-surface">{lama}</p>
                <p className={cx("text-body-small", baris ? "font-medium text-warning" : "text-on-surface-variant")}>{baris ? "Old session, not linked to the agenda" : "Old session"}</p>
              </div>
              <IconButton size="sm" data-lepas label={`Remove old session "${lama}" from ${nama}`} onClick={lepasLama}>
                <X size={16} />
              </IconButton>
            </li>
          ) : null}
          {terpilih.map(({ ref: entri, item, hilang: tak }, posisi) => {
            const judul = item?.title ?? entri.label;
            return (
              <li key={entri.id} className={cx("flex flex-col gap-2 pb-3 pl-3 pr-1 pt-2", (posisi > 0 || lama) && "border-t border-outline-variant", tak && "bg-error-soft/40")}>
                <div className="flex items-start gap-3">
                  {/* Kolom jam selalu 40px, juga tanpa jam, supaya judul semua baris sejajar. */}
                  <span className="mt-2 flex w-10 shrink-0 text-body-medium tabular-nums text-on-surface-variant">
                    {item ? item.jam : tak ? <WarningCircle size={16} weight="fill" className="mt-0.5 text-error" aria-hidden /> : null}
                  </span>
                  <div className="min-w-0 flex-1 py-2">
                    <p className="line-clamp-2 break-words text-body-medium text-on-surface" title={judul}>{judul}</p>
                    {tak ? <p className="text-body-small font-medium text-error">No longer shown in the agenda</p> : null}
                  </div>
                  <IconButton size="sm" data-lepas label={`Remove ${judul}${item ? ` (${item.jam})` : ""} from ${nama}`} onClick={() => lepas(entri, judul, posisi)}>
                    <X size={16} />
                  </IconButton>
                </div>
                <KolomPeran
                  label={`Role in ${judul}`}
                  value={entri.role ?? ""}
                  utama={utama}
                  speakers={speakers}
                  onChange={(role, en) => ubahPeran(entri.id, role, en)}
                />
              </li>
            );
          })}
        </ul>
      ) : null}

      <p
        id={`${id}-pesan`}
        // Diumumkan hanya bila muncul karena suntingan, bukan saat halaman dibuka.
        role={galat && diubah ? "alert" : undefined}
        className={cx("mt-2 flex items-start gap-1.5 text-body-small", galat ? "font-medium text-error" : peringatan ? "font-medium text-warning" : "text-on-surface-variant")}
      >
        {pesan ? <WarningCircle size={16} weight="fill" className="mt-px shrink-0" aria-hidden /> : null}
        {pesan ??
          (baris === null
            ? memuat ? "Loading agenda…" : "Agenda failed to load. Sessions already picked stay saved."
            : terpilih.length ? "Leave a role empty to use the main role. Removing a session also removes its role." : "The speaker shows in the tab and agenda row of each session picked.")}
      </p>
      <span className="sr-only" aria-live="polite">{kabar}</span>

      <Popover anchor={menu} id={`${id}-menu`} label="Pick sessions" role="dialog" align="end" width={lebar} className="flex max-h-[min(24rem,60vh)] flex-col p-1">
        {pakaiCari ? (
          <div className="relative shrink-0 px-1 pb-1 pt-0.5">
            <MagnifyingGlass size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden />
            <input
              type="search"
              autoFocus
              value={cari}
              onChange={(peristiwa) => { setCari(peristiwa.target.value); setSorot(0); }}
              onKeyDown={onKeyDown}
              placeholder="Search time or title"
              aria-label="Search sessions"
              aria-controls={pilihan.length ? `${id}-daftar` : undefined}
              aria-activedescendant={aktif ? `${id}-${aktif.id}` : undefined}
              className="h-8 w-full rounded-md border border-outline bg-surface-container-lowest pl-8 pr-2 text-body-medium text-on-surface outline-none focus:border-primary"
            />
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
          {baris === null && memuat ? (
            <p className="px-3 py-2 text-body-medium text-on-surface-variant">Loading agenda…</p>
          ) : baris === null ? (
            <div className="px-3 py-2 text-body-medium text-on-surface-variant">
              Agenda failed to load.{" "}
              <button type="button" onClick={() => { onMuatUlang(); pemicu?.focus(); }} className="font-medium text-primary underline">Reload</button>
            </div>
          ) : dikenal.length === 0 ? (
            <p className="px-3 py-2 text-body-medium text-on-surface-variant">No published sessions in the agenda yet.</p>
          ) : pilihan.length === 0 ? (
            <p className="px-3 py-2 text-body-medium text-on-surface-variant">No sessions match.</p>
          ) : (
            <ul id={`${id}-daftar`} role="listbox" aria-multiselectable="true" aria-label="Agenda sessions">
              {beberapaBagian
                ? kelompok(pilihan).map(({ bagian, isi }, urutan) => (
                    // APG listbox berkelompok: tiap hari satu group berlabel judul bagiannya.
                    <li key={`${bagian}-${urutan}`} role="none">
                      <ul role="group" aria-labelledby={`${id}-g${urutan}`}>
                        <li id={`${id}-g${urutan}`} role="presentation" className="px-3 pb-1 pt-2 text-label-medium font-semibold text-on-surface-variant">
                          {bagian ?? "Untitled"}
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
          <span className="text-on-surface-variant">{ids.length ? `${ids.length} selected` : ""}</span>
          <a href={rundownHref()} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-sm font-medium text-primary hover:underline">
            Edit agenda
            <ArrowSquareOut size={14} aria-hidden />
            <span className="sr-only">(new tab)</span>
          </a>
        </div>
      </Popover>
    </div>
  );
}

/** Saran yang tampil sekaligus; sisanya muncul saat mengetik. */
const SARAN_MAKS = 8;

/**
 * Kolom peran di satu sesi: teks bebas dengan saran dari peran yang sudah
 * dipakai di acara ini (saranPeran). Pola APG combobox dengan autocomplete
 * daftar: saran muncul saat mengetik atau Panah bawah, bukan saat fokus.
 * Tidak ada saran yang tersorot sebelum Panah bawah, jadi Enter atau
 * keluar kolom menyimpan persis yang diketik; Esc menutup saran dan teksnya
 * tetap. Kosong berarti peran utama, yang disebut di placeholder.
 */
function KolomPeran({ label, value, utama, speakers, onChange }: {
  label: string;
  value: string;
  utama: string | undefined;
  speakers: LandingSpeaker[];
  onChange: (role: string, en?: string) => void;
}) {
  const [input, setInput] = useState<HTMLInputElement | null>(null);
  const saranMenu = usePopoverAnchor(input);
  const [sorot, setSorot] = useState(-1);
  const id = useId();

  const ketik = kunciPeran(value);
  // Yang diawali ketikan lebih dulu: "M" menyarankan Moderator, bukan Pembicara.
  const cocok = saranPeran(speakers, value).filter((item) => !ketik || item.kunci.includes(ketik));
  const saran = [...cocok.filter((item) => item.kunci.startsWith(ketik)), ...cocok.filter((item) => !item.kunci.startsWith(ketik))].slice(0, SARAN_MAKS);
  const terbuka = saranMenu.open && saran.length > 0;
  const aktif = terbuka && sorot >= 0 ? saran[Math.min(sorot, saran.length - 1)] : undefined;

  function pilih(item: SaranPeran) {
    onChange(item.teks, item.en);
    setSorot(-1);
    saranMenu.tutup();
  }

  function onKeyDown(peristiwa: KeyboardEvent<HTMLInputElement>) {
    const n = saran.length;
    if (peristiwa.key === "ArrowDown" || peristiwa.key === "ArrowUp") {
      if (n === 0) return;
      peristiwa.preventDefault();
      if (!saranMenu.open) saranMenu.buka();
      const arah = peristiwa.key === "ArrowDown" ? 1 : -1;
      setSorot((indeks) => (indeks < 0 ? (arah > 0 ? 0 : n - 1) : (Math.min(indeks, n - 1) + arah + n) % n));
      return;
    }
    if (peristiwa.key === "Escape" && saranMenu.open) {
      peristiwa.preventDefault();
      peristiwa.stopPropagation();
      setSorot(-1);
      saranMenu.tutup();
      return;
    }
    if (peristiwa.key === "Enter" && terbuka) {
      peristiwa.preventDefault();
      if (aktif) pilih(aktif);
      else saranMenu.tutup();
    }
    if (peristiwa.key === "Tab") saranMenu.tutup();
  }

  return (
    <div className="pr-2">
      <input
        ref={setInput}
        type="text"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={terbuka}
        aria-controls={terbuka ? `${id}-saran` : undefined}
        aria-activedescendant={aktif ? `${id}-s${saran.indexOf(aktif)}` : undefined}
        autoComplete="off"
        maxLength={60}
        value={value}
        placeholder={utama ? `${utama} (main role)` : "No role"}
        onChange={(peristiwa) => {
          onChange(peristiwa.target.value);
          setSorot(-1);
          if (!saranMenu.open) saranMenu.buka();
        }}
        onBlur={() => { setSorot(-1); saranMenu.tutup(); }}
        onKeyDown={onKeyDown}
        className="m3-field h-14 w-full rounded-lg border border-outline bg-surface-container-lowest px-3 text-body-large text-on-surface outline-none transition-[border-color,box-shadow] duration-150 ease-standard placeholder:text-on-surface-variant/70 focus:border-primary"
      />
      <span className="sr-only" aria-live="polite">
        {terbuka ? (saran.length === 1 ? "1 suggestion" : `${saran.length} suggestions`) : ""}
      </span>
      {terbuka ? (
        <Popover anchor={saranMenu} id={`${id}-saran`} label="Roles used in this event" role="listbox" align="start" className="max-h-[min(20rem,50vh)]">
          <p aria-hidden className="px-3 pb-1 pt-1.5 text-label-medium font-semibold text-on-surface-variant">Used in this event</p>
          {saran.map((item, indeks) => (
            <div
              key={item.kunci}
              id={`${id}-s${indeks}`}
              role="option"
              aria-selected={aktif?.kunci === item.kunci}
              onPointerDown={(peristiwa) => peristiwa.preventDefault()}
              onClick={() => pilih(item)}
              onPointerMove={() => setSorot(indeks)}
              className={cx(
                "flex min-h-9 cursor-pointer flex-col justify-center rounded-md px-3 py-1 text-body-medium text-on-surface",
                aktif?.kunci === item.kunci ? "bg-primary-soft" : "",
              )}
            >
              <span className="truncate">{item.teks}</span>
              <span className="truncate text-body-small text-on-surface-variant">{item.nama ?? plural(item.pembicara, "speaker")}</span>
            </div>
          ))}
        </Popover>
      ) : null}
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
