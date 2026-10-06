"use client";

import { ArrowDown, ArrowUp, DotsSixVertical } from "@phosphor-icons/react";
import { useId, useState, type DragEvent } from "react";
import { Button, IconButton, SelectMenu } from "@/components/m3";
import type { LandingSpeaker, LandingSpeakerFrame } from "@/lib/domain";
import type { AgendaPreview } from "@/lib/landing-agenda";
import { aturUrutanSesi, hapusUrutanSesi, posisiDiSesi } from "@/lib/landing-peran-sesi";
import { speakerTabs, type SpeakerTab } from "@/lib/landing-speaker-tabs";
import { cx } from "@/lib/m3/cx";
import type { BarisSesi } from "./pilih-sesi";

/**
 * Urutan foto kiri ke kanan per tab bagian Pembicara, dengan tab yang sama
 * seperti di halaman acara (Sorotan, satu tab per sesi, Pembicara lain).
 *
 * Daftar tegak, satu baris per pembicara, nomor 1 = paling kiri di halaman:
 * pola urutan Rundown (#71), bukan deret foto yang terlipat (panah "kiri" di
 * awal baris kedua memindah ke ujung baris pertama, dan tidak ada yang
 * menduganya). Satu pegangan per baris: seret dengan tetikus, atau panah
 * atas/bawah dengan papan ketik. Di layar sentuh pegangan diganti dua tombol
 * 48 px, karena menyeret di ponsel berebut dengan gulir halaman.
 *
 * - Tab sesi rundown: otomatis (moderator lebih dulu, urutan daftar) sampai
 *   admin memindah seseorang; sejak itu urutannya `pos` di entri sesi tiap
 *   pembicara, untuk tab itu saja, dan bisa dikembalikan ke otomatis.
 * - Sorotan, Pembicara lain, dan sesi teks lama: urutan daftar pembicara itu
 *   sendiri. Pembicara tab itu bertukar tempat di antara posisi mereka di daftar.
 */

type Bertanda = LandingSpeaker & { _i: number };

/** Bingkai foto kecil, sama bentuknya dengan kartu di halaman acara. */
const BINGKAI_KECIL: Record<LandingSpeakerFrame, string> = {
  portrait: "aspect-[4/5] rounded-sm",
  circle: "aspect-square rounded-full",
  arch: "aspect-[4/5] rounded-b-sm [border-top-left-radius:50%_40%] [border-top-right-radius:50%_40%]",
};

function inisial(nama: string): string {
  return nama
    .split(/\s+/)
    .filter((kata) => /^\p{L}/u.test(kata))
    .slice(0, 2)
    .map((kata) => kata[0]!.toUpperCase())
    .join("");
}

/** Baris rundown di editor sebagai susunan acara, supaya tab di sini sama dengan tab di halaman. */
function agendaDariBaris(baris: BarisSesi[] | null): AgendaPreview[] {
  const bagian = new Map<string, AgendaPreview>();
  for (const item of baris ?? []) {
    const kunci = item.bagian ?? "";
    if (!bagian.has(kunci)) bagian.set(kunci, { sectionTitle: item.bagian, hari: null, tanggal: null, items: [] });
    bagian.get(kunci)!.items.push({ id: item.id, time: item.jam, end: null, title: item.title, subtitle: null, key: item.title, jeda: false });
  }
  return [...bagian.values()];
}

/** Id baris rundown di balik tab sesi (`sesi-<id>`), atau null untuk Sorotan, Pembicara lain, dan sesi teks lama. */
function idSesi(tab: SpeakerTab): number | null {
  const id = tab.key.startsWith("sesi-") ? Number(tab.key.slice(5)) : NaN;
  return Number.isInteger(id) ? id : null;
}

export function UrutanPembicara({
  speakers,
  baris,
  bingkai,
  onChange,
  onTab,
}: {
  speakers: LandingSpeaker[];
  baris: BarisSesi[] | null;
  bingkai: LandingSpeakerFrame;
  onChange: (next: LandingSpeaker[]) => void;
  /** Tab yang sedang diatur, supaya pratinjau membuka tab yang sama. */
  onTab?: (kunci: string) => void;
}) {
  const bertanda: Bertanda[] = speakers.map((speaker, index) => ({ ...speaker, _i: index }));
  const tabs = speakerTabs(bertanda, agendaDariBaris(baris), { highlights: "Highlights", others: "Other speakers" }).filter((tab) => tab.speakers.length > 1);
  const [kunci, setKunci] = useState<string | null>(null);
  const [kabar, setKabar] = useState("");
  const [seret, setSeret] = useState<number | null>(null);
  const dasar = useId();
  const tab = tabs.find((item) => item.key === kunci) ?? tabs[0];
  if (!tab) return <p className="text-body-small text-on-surface-variant">Ordering appears once a tab has two or more speakers.</p>;
  const orang = tab.speakers as Bertanda[];
  const id = idSesi(tab);
  const sesiRundown = id !== null && orang.every((item) => speakers[item._i]?.session_refs?.some((ref) => ref.id === id));
  const khusus = sesiRundown && orang.some((item) => posisiDiSesi(speakers[item._i]!, id!) !== undefined);

  function pilihTab(baru: string) {
    setKunci(baru);
    onTab?.(baru);
  }

  function terapkan(urutan: Bertanda[]) {
    if (sesiRundown) {
      onChange(aturUrutanSesi(speakers, id!, urutan.map((item) => speakers[item._i]!)));
      return;
    }
    // Tukar tempat di antara posisi daftar yang dipakai tab ini.
    const slot = urutan.map((item) => item._i).sort((a, b) => a - b);
    const next = [...speakers];
    slot.forEach((posisi, k) => {
      next[posisi] = speakers[urutan[k]!._i]!;
    });
    onChange(next);
  }

  function pindah(dari: number, ke: number, fokus: "pegangan" | "atas" | "bawah" | null = "pegangan") {
    if (ke < 0 || ke >= orang.length || dari === ke) return;
    const urutan = [...orang];
    const [item] = urutan.splice(dari, 1);
    urutan.splice(ke, 0, item!);
    terapkan(urutan);
    setKabar(`${item!.name} moved to position ${ke + 1} of ${orang.length}.`);
    if (!fokus) return;
    // Fokus ikut orangnya. Di tab daftar (Sorotan) indeks daftarnya ikut
    // bertukar, jadi barisnya dicari dari nama di posisi barunya.
    window.requestAnimationFrame(() => {
      const baris = document.querySelectorAll<HTMLElement>(`[data-urutan="${dasar}"] > li`)[ke];
      baris?.querySelector<HTMLElement>(`[data-fokus="${fokus}"]`)?.focus();
    });
  }

  function reset() {
    onChange(hapusUrutanSesi(speakers, id!));
    setKabar(`The ${tab!.label} tab is back to the automatic order.`);
  }

  function lepas(event: DragEvent<HTMLLIElement>) {
    event.preventDefault();
    setSeret(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <SelectMenu<string>
        label="Tab"
        width="100%"
        value={tab.key}
        onChange={pilihTab}
        options={tabs.map((item) => ({ value: item.key, label: `${item.label} · ${item.speakers.length}` }))}
      />
      <div className="flex min-h-[30px] flex-wrap items-center gap-x-1 text-body-small text-on-surface-variant">
        {sesiRundown ? (
          khusus ? (
            <>
              <span>Order: custom ·</span>
              <Button variant="text" size="sm" className="!min-h-[30px] !px-2" onClick={reset}>Reset to automatic</Button>
            </>
          ) : (
            <span>Order: automatic (moderator first)</span>
          )
        ) : (
          <span>Order: same as the speaker list below</span>
        )}
      </div>
      <ol data-urutan={dasar} aria-label={`Order in the ${tab.label} tab, first is leftmost`} className="flex flex-col">
        {orang.map((speaker, index) => {
          const pertama = index === 0;
          const terakhir = index === orang.length - 1;
          const peran = speaker.role?.trim();
          return (
            <li
              key={speaker._i}
              onDragOver={(event) => {
                if (seret === null) return;
                event.preventDefault();
                if (seret !== index) {
                  pindah(seret, index, null);
                  setSeret(index);
                }
              }}
              onDrop={lepas}
              className={cx("flex min-h-12 items-center gap-2 border-b border-outline-variant py-1 last:border-b-0", seret === index && "opacity-60")}
            >
              <button
                type="button"
                data-fokus="pegangan"
                draggable
                aria-label={`Reorder ${speaker.name}, position ${index + 1} of ${orang.length}`}
                aria-describedby={`${dasar}-petunjuk`}
                title="Drag to reorder, or use the arrow keys"
                onKeyDown={(event) => {
                  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                  event.preventDefault();
                  pindah(index, index + (event.key === "ArrowUp" ? -1 : 1));
                }}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", String(speaker._i));
                  const baris = event.currentTarget.closest("li");
                  if (baris) event.dataTransfer.setDragImage(baris, 24, 20);
                  setSeret(index);
                }}
                onDragEnd={() => setSeret(null)}
                className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-on-surface-variant hover:bg-primary-soft hover:text-on-surface active:cursor-grabbing pointer-coarse:hidden"
              >
                <DotsSixVertical size={18} weight="bold" aria-hidden />
              </button>
              <span aria-hidden className="w-5 shrink-0 text-center text-label-large tabular-nums text-on-surface-variant">{index + 1}</span>
              <span aria-hidden className={cx("relative w-8 shrink-0 overflow-hidden bg-surface-container-high", BINGKAI_KECIL[bingkai] ?? BINGKAI_KECIL.portrait)}>
                {speaker.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={speaker.photo_url} alt="" draggable={false} className={cx("absolute inset-0 size-full object-cover", bingkai === "circle" ? "object-top" : "object-[50%_20%]")} />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-label-small font-semibold text-primary">{inisial(speaker.name)}</span>
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-medium text-on-surface">{speaker.name}</span>
                {peran ? <span className="truncate text-body-small text-on-surface-variant">{peran}</span> : null}
              </span>
              <span className="hidden shrink-0 gap-1 pointer-coarse:flex">
                <IconButton
                  size="sm"
                  data-fokus="atas"
                  label={`Move ${speaker.name} up`}
                  aria-disabled={pertama || undefined}
                  className="!size-12 aria-disabled:cursor-default aria-disabled:opacity-40"
                  onClick={() => (pertama ? undefined : pindah(index, index - 1, index - 1 === 0 ? "bawah" : "atas"))}
                >
                  <ArrowUp size={18} />
                </IconButton>
                <IconButton
                  size="sm"
                  data-fokus="bawah"
                  label={`Move ${speaker.name} down`}
                  aria-disabled={terakhir || undefined}
                  className="!size-12 aria-disabled:cursor-default aria-disabled:opacity-40"
                  onClick={() => (terakhir ? undefined : pindah(index, index + 1, index + 1 === orang.length - 1 ? "atas" : "bawah"))}
                >
                  <ArrowDown size={18} />
                </IconButton>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-body-small text-on-surface-variant">
        1 is leftmost on the page.{" "}
        {sesiRundown
          ? khusus
            ? `This order applies to the ${tab.label} tab only. New speakers in this tab are added at the end.`
            : `Moving someone makes a custom order for the ${tab.label} tab only.`
          : "Changing this order also changes the speaker list below."}
      </p>
      <span id={`${dasar}-petunjuk`} hidden>Use the up and down arrow keys to move this speaker. Position 1 is leftmost on the event page.</span>
      <p role="status" className="sr-only">{kabar}</p>
    </div>
  );
}

/** Gambar kecil bentuk bingkai di pilihan Photo frame: bentuk lebih cepat dibaca sebagai gambar. */
export function BentukBingkai({ bentuk }: { bentuk: LandingSpeakerFrame }) {
  const d =
    bentuk === "circle" ? "M8 2a6 6 0 1 1 0 12A6 6 0 0 1 8 2Z"
      : bentuk === "arch" ? "M3.5 15V7a4.5 4.5 0 0 1 9 0v8Z"
        : "M5 1.5h6A1.5 1.5 0 0 1 12.5 3v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 13V3A1.5 1.5 0 0 1 5 1.5Z";
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d={d} />
    </svg>
  );
}
