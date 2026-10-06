"use client";

import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { IconButton, SelectMenu } from "@/components/m3";
import type { LandingSpeaker, LandingSpeakerFrame } from "@/lib/domain";
import type { AgendaPreview } from "@/lib/landing-agenda";
import { aturUrutanSesi } from "@/lib/landing-peran-sesi";
import { speakerTabs } from "@/lib/landing-speaker-tabs";
import { cx } from "@/lib/m3/cx";
import type { BarisSesi } from "./pilih-sesi";

/**
 * Urutan foto kiri ke kanan per tab bagian Pembicara, seperti tab di halaman
 * acara (Sorotan, satu tab per sesi, Pembicara lain).
 *
 * Kisi kecil ini meniru kisi di halaman: geser kartu untuk memindah, atau
 * tombol kiri/kanan di bawahnya untuk papan ketik dan layar sentuh tanpa seret.
 *
 * - Tab sesi rundown: urutannya disimpan sebagai `pos` di entri sesi tiap
 *   pembicara, jadi seseorang bisa paling kiri di Sesi 1 dan ketiga di
 *   breakout. Begitu diatur, aturan moderator lebih dulu tidak berlaku lagi.
 * - Sorotan, Pembicara lain, dan sesi teks lama: urutan daftar pembicara itu
 *   sendiri. Pembicara tab itu bertukar tempat di antara posisi mereka di
 *   daftar; pembicara lain tidak bergeser.
 */

type Bertanda = LandingSpeaker & { _i: number };

const BINGKAI_KECIL: Record<LandingSpeakerFrame, string> = {
  portrait: "aspect-[4/5] rounded-sm",
  circle: "aspect-square rounded-full",
  arch: "aspect-[4/5] rounded-t-full",
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
export function agendaDariBaris(baris: BarisSesi[] | null): AgendaPreview[] {
  const bagian = new Map<string, AgendaPreview>();
  for (const item of baris ?? []) {
    const kunci = item.bagian ?? "";
    if (!bagian.has(kunci)) bagian.set(kunci, { sectionTitle: item.bagian, hari: null, tanggal: null, items: [] });
    bagian.get(kunci)!.items.push({ id: item.id, time: item.jam, end: null, title: item.title, subtitle: null, key: item.title, jeda: false });
  }
  return [...bagian.values()];
}

export function UrutanPembicara({
  speakers,
  baris,
  bingkai,
  onChange,
}: {
  speakers: LandingSpeaker[];
  baris: BarisSesi[] | null;
  bingkai: LandingSpeakerFrame;
  onChange: (next: LandingSpeaker[]) => void;
}) {
  const bertanda: Bertanda[] = speakers.map((speaker, index) => ({ ...speaker, _i: index }));
  const tabs = speakerTabs(bertanda, agendaDariBaris(baris), { highlights: "Highlights", others: "Other speakers" });
  const [kunci, setKunci] = useState<string>("sorotan");
  const [kabar, setKabar] = useState("");
  const [seret, setSeret] = useState<number | null>(null);
  const kisi = useRef<HTMLUListElement>(null);
  const tab = tabs.find((item) => item.key === kunci) ?? tabs[0];
  if (!tab || tab.speakers.length < 2) {
    return tabs.some((item) => item.speakers.length > 1) && tab ? (
      <Pemilih tabs={tabs} kunci={tab.key} onPilih={setKunci} />
    ) : null;
  }
  const orang = tab.speakers as Bertanda[];

  function terapkan(urutan: Bertanda[]) {
    const id = tab!.key.startsWith("sesi-") ? Number(tab!.key.slice(5)) : NaN;
    if (Number.isInteger(id) && urutan.every((item) => speakers[item._i]?.session_refs?.some((ref) => ref.id === id))) {
      onChange(aturUrutanSesi(speakers, id, urutan.map((item) => speakers[item._i]!)));
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

  function pindah(dari: number, ke: number, umumkan = true) {
    if (ke < 0 || ke >= orang.length || dari === ke) return;
    const urutan = [...orang];
    const [item] = urutan.splice(dari, 1);
    urutan.splice(ke, 0, item!);
    terapkan(urutan);
    if (umumkan) {
      setKabar(`${item!.name} moved to position ${ke + 1} of ${orang.length}.`);
      // Di ujung, tombol arah yang ditekan mati: fokus pindah ke tombol sebelahnya.
      window.requestAnimationFrame(() => {
        const tombol = kisi.current?.querySelectorAll<HTMLButtonElement>(`[data-urutan="${ke}"] button`);
        const arah = ke < dari ? 0 : 1;
        const tuju = tombol?.[arah]?.disabled ? tombol?.[1 - arah] : tombol?.[arah];
        tuju?.focus();
      });
    }
  }

  // Seret dengan pointer (tetikus dan sentuh): kartu di bawah jari menjadi tujuan.
  function mulai(event: ReactPointerEvent<HTMLLIElement>, index: number) {
    if ((event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSeret(index);
  }
  function gerak(event: ReactPointerEvent<HTMLLIElement>) {
    if (seret === null) return;
    const bawah = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-urutan]");
    const tujuan = bawah && kisi.current?.contains(bawah) ? Number(bawah.dataset.urutan) : null;
    if (tujuan !== null && tujuan !== seret) {
      pindah(seret, tujuan, false);
      setSeret(tujuan);
    }
  }
  function selesai() {
    if (seret !== null) setKabar(`${orang[seret]?.name} is at position ${seret + 1} of ${orang.length}.`);
    setSeret(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <Pemilih tabs={tabs} kunci={tab.key} onPilih={setKunci} />
      <ul ref={kisi} aria-label={`Order in ${tab.label}, left to right`} className="grid grid-cols-4 gap-x-2 gap-y-3">
        {orang.map((speaker, index) => (
          <li
            key={speaker._i}
            data-urutan={index}
            onPointerDown={(event) => mulai(event, index)}
            onPointerMove={gerak}
            onPointerUp={selesai}
            onPointerCancel={selesai}
            className={cx("flex min-w-0 touch-none cursor-grab flex-col gap-1 select-none", seret === index && "cursor-grabbing opacity-60")}
          >
            <div className={cx("relative overflow-hidden bg-surface-container-high", BINGKAI_KECIL[bingkai] ?? BINGKAI_KECIL.portrait)}>
              {speaker.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={speaker.photo_url} alt="" draggable={false} className="absolute inset-0 size-full object-cover object-[50%_20%]" />
              ) : (
                <span aria-hidden className="absolute inset-0 flex items-center justify-center text-title-medium font-semibold text-primary">{inisial(speaker.name)}</span>
              )}
              <span aria-hidden className="absolute left-1 top-1 flex size-5 items-center justify-center rounded-full bg-inverse-surface text-label-small font-semibold text-inverse-on-surface">
                {index + 1}
              </span>
            </div>
            <p className="line-clamp-2 text-body-small text-on-surface">{speaker.name}</p>
            <div className="flex justify-center gap-1">
              <IconButton size="sm" label={`Move ${speaker.name} left`} disabled={index === 0} onClick={() => pindah(index, index - 1)}>
                <ArrowLeft size={16} />
              </IconButton>
              <IconButton size="sm" label={`Move ${speaker.name} right`} disabled={index === orang.length - 1} onClick={() => pindah(index, index + 1)}>
                <ArrowRight size={16} />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-body-small text-on-surface-variant">
        {tab.key.startsWith("sesi-") ? "Drag a photo, or use the arrows. This order is for this session only." : "Drag a photo, or use the arrows. This also changes the order of the speaker list below."}
      </p>
      <p role="status" className="sr-only">{kabar}</p>
    </div>
  );
}

function Pemilih({ tabs, kunci, onPilih }: { tabs: ReturnType<typeof speakerTabs>; kunci: string; onPilih: (kunci: string) => void }) {
  return (
    <SelectMenu<string>
      label="Tab"
      width="100%"
      value={kunci}
      onChange={onPilih}
      options={tabs.map((item) => ({ value: item.key, label: `${item.label} · ${item.speakers.length}` }))}
    />
  );
}
