"use client";

import { ArrowCounterClockwise, Cards, Disc, Hash, Lightning, Play, Rows, Stop, Target } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Dialog } from "@/components/m3";
import { ANIMATIONS, type SpinMode, type UndianAnimation } from "@/lib/undian";
import { cx } from "@/lib/m3/cx";
import {
  CardsAnimation, DartAnimation, DigitsAnimation, SlotAnimation, WheelAnimation, WinnerList, type AnimationProps,
} from "@/app/undian/undian-animations";

const ICON: Record<UndianAnimation, ReactNode> = {
  wheel: <Disc size={20} />, slot: <Rows size={20} />, cards: <Cards size={20} />,
  digits: <Hash size={20} />, dart: <Target size={20} />, instant: <Lightning size={20} />,
};

/** Tampilan panggung yang dipakai pratinjau: warna dan huruf dari Stage screen. */
export type StageLook = { background: string; text: string; accent: string; fontFamily: string };

const CONTOH = ["Andi Pratama", "Siti Rahma", "Budi Santoso", "Dewi Lestari", "Rizky Hidayat", "Nur Aisyah", "Agus Wibowo", "Maya Putri", "Fajar Nugroho", "Intan Sari", "Hendra Saputra", "Lina Marlina"];

/**
 * Pilihan animasi sebagai kartu, ditambah pratinjau yang memutar animasi
 * panggung yang SAMA (komponen /undian), dengan warna Stage screen.
 */
export function AnimationPicker({
  value, onChange, spinMode, spinSeconds, winnersPerDraw, sampleNames, stage,
}: {
  value: UndianAnimation; onChange: (value: UndianAnimation) => void;
  spinMode: SpinMode; spinSeconds: number; winnersPerDraw: number;
  sampleNames: string[]; stage: StageLook;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  // Kunci baru setiap kali dibuka: pratinjau dipasang ulang dan langsung berputar
  // dari awal, tanpa efek yang menyetel state saat dialog terbuka.
  const [previewKey, setPreviewKey] = useState(0);
  const pilihan = ANIMATIONS.find((item) => item.value === value);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p id="prize-animation-label" className="text-body-medium font-medium">Animation</p>
        <Button type="button" variant="text" size="sm" icon={<Play size={16} />} onClick={() => { setPreviewKey((current) => current + 1); setPreviewOpen(true); }}>Preview</Button>
      </div>
      <div role="radiogroup" aria-labelledby="prize-animation-label" className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ANIMATIONS.map((item) => {
          const aktif = item.value === value;
          return (
            <button
              key={item.value} type="button" role="radio" aria-checked={aktif}
              onClick={() => onChange(item.value)}
              className={cx(
                "flex min-h-9 items-center gap-2 rounded-md border px-3 py-2 text-left text-body-medium transition-colors",
                aktif ? "border-primary bg-primary-container text-on-primary-container ring-1 ring-primary" : "border-outline-variant hover:bg-surface-container-high",
              )}
            >
              <span aria-hidden className={aktif ? "text-primary" : "text-on-surface-variant"}>{ICON[item.value]}</span>
              <span className="min-w-0 truncate font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-body-medium text-on-surface-variant">{pilihan?.hint}</p>

      <AnimationPreview
        key={previewKey}
        open={previewOpen} onClose={() => setPreviewOpen(false)}
        animation={value} spinMode={spinMode} spinSeconds={spinSeconds} winnersPerDraw={winnersPerDraw}
        names={sampleNames.length >= 3 ? sampleNames : CONTOH} stage={stage}
        onPick={onChange}
      />
    </div>
  );
}

function AnimationPreview({
  open, onClose, animation, spinMode, spinSeconds, winnersPerDraw, names, stage, onPick,
}: {
  open: boolean; onClose: () => void; animation: UndianAnimation; spinMode: SpinMode; spinSeconds: number;
  winnersPerDraw: number; names: string[]; stage: StageLook; onPick: (value: UndianAnimation) => void;
}) {
  const durasi = (value: UndianAnimation) =>
    spinMode === "manual" || value === "instant" ? null : Date.now() + spinSeconds * 1000;
  const [round, setRound] = useState(1);
  const [endsAt, setEndsAt] = useState<number | null>(() => durasi(animation));
  const [stopped, setStopped] = useState(false);
  const manual = spinMode === "manual" && animation !== "instant";
  const jumlah = Math.min(Math.max(winnersPerDraw, 1), 3);

  const roster = useMemo(() => names.map((name, index) => ({ name, seat: `A${index + 1}`, code: String(1000 + index * 37) })), [names]);
  const winners = useMemo<AnimationProps["winners"]>(
    () => Array.from({ length: jumlah }, (_, index) => {
      const row = roster[(round * 5 + index * 3) % roster.length];
      return { name: row.name, company: null, seat: row.seat, is_backup: false, slot_order: index + 1 };
    }),
    [roster, round, jumlah],
  );

  // Instant tidak punya animasi: pemenang langsung tampil.
  const revealed = stopped || animation === "instant";

  function mulai(value: UndianAnimation = animation) {
    setStopped(false);
    setRound((current) => current + 1);
    setEndsAt(durasi(value));
  }

  useEffect(() => {
    if (endsAt === null) return;
    const timer = window.setTimeout(() => setStopped(true), Math.max(0, endsAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [endsAt]);

  const props: AnimationProps = {
    roster, winners: revealed ? winners : [], endsAt, accent: stage.accent, text: stage.text,
    fontFamily: stage.fontFamily, round, pendingCount: jumlah,
  };

  return (
    <Dialog
      open={open} onClose={onClose} size="xl" title="Animation preview"
      description="Sample names on the stage screen colours. Nothing is drawn or saved."
      actions={<>
        {manual && !revealed
          ? <Button type="button" variant="filled" icon={<Stop size={16} />} onClick={() => setStopped(true)}>Stop</Button>
          : <Button type="button" variant="tonal" icon={<ArrowCounterClockwise size={16} />} onClick={() => mulai()}>Replay</Button>}
        <Button type="button" variant="text" onClick={onClose}>Done</Button>
      </>}
    >
      <div role="radiogroup" aria-label="Animation" className="-mx-1 mb-3 mt-1 flex gap-1 overflow-x-auto px-1">
        {ANIMATIONS.map((item) => (
          <button
            key={item.value} type="button" role="radio" aria-checked={item.value === animation} onClick={() => { onPick(item.value); mulai(item.value); }}
            className={cx(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-label-large",
              item.value === animation ? "border-transparent bg-secondary-container text-on-secondary-container" : "border-outline-variant text-on-surface-variant",
            )}
          >
            <span aria-hidden>{ICON[item.value]}</span>{item.label}
          </button>
        ))}
      </div>
      <div
        className="relative mx-auto flex aspect-video max-w-full items-center justify-center overflow-hidden rounded-md"
        // Lebar mengikuti tinggi layar: di 1280x588 panggung 16:9 selebar dialog
        // mendorong Replay dan Done keluar layar.
        style={{ background: stage.background, color: stage.text, width: "min(100%, calc((100dvh - 300px) * 16 / 9))" }}
      >
        <div className="flex h-full w-full items-center justify-center p-[3%]">
          {animation === "wheel" ? <WheelAnimation {...props} />
            : animation === "slot" ? <SlotAnimation {...props} />
            : animation === "cards" ? <CardsAnimation {...props} />
            : animation === "digits" ? <DigitsAnimation {...props} />
            : animation === "dart" ? <DartAnimation {...props} />
            : <WinnerList winners={props.winners} accent={stage.accent} text={stage.text} fontFamily={stage.fontFamily} />}
        </div>
      </div>
    </Dialog>
  );
}
