"use client";

import { ArrowCounterClockwise, Check, Stop } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, Dialog } from "@/components/m3";
import { ANIMATIONS, type SpinMode, type UndianAnimation } from "@/lib/undian";
import { cx } from "@/lib/m3/cx";
import {
  CardsAnimation, DartAnimation, DigitsAnimation, SlotAnimation, WheelAnimation, WinnerList, type AnimationProps,
} from "@/app/undian/undian-animations";
import { ANIMATION_ICON, onAnimationArrow, type StageLook } from "./animation-choice";

const CONTOH = ["Andi Pratama", "Siti Rahma", "Budi Santoso", "Dewi Lestari", "Rizky Hidayat", "Nur Aisyah", "Agus Wibowo", "Maya Putri", "Fajar Nugroho", "Intan Sari", "Hendra Saputra", "Lina Marlina"];

/** Ukuran panggung maya. Animasi diukur dengan vw/vh, jadi ia butuh layar sendiri. */
const PANGGUNG = { width: 1280, height: 720 };

/**
 * Pratinjau animasi undian: komponen panggung yang sama dengan /undian, diputar
 * dengan nama contoh. Tidak ada yang diundi atau disimpan.
 */
export function AnimationPreview({
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
  // Panggung asli bisa menampilkan sampai 50 nama; pratinjau cukup tiga untuk
  // memperlihatkan tata letak banyak pemenang.
  const jumlah = Math.min(Math.max(winnersPerDraw, 1), 3);

  const roster = useMemo(
    () => (names.length >= 3 ? names : CONTOH).map((name, index) => ({ name, seat: `A${index + 1}`, code: String(1000 + index * 37) })),
    [names],
  );
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

  function pilih(value: UndianAnimation) {
    onPick(value);
    mulai(value);
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
      description={`Sample names on the stage screen colours${winnersPerDraw > 3 ? ", up to 3 winners" : ""}, without backups. Nothing is drawn or saved.`}
      actions={<>
        {manual && !revealed
          ? <Button type="button" variant="filled" icon={<Stop size={16} />} onClick={() => setStopped(true)}>Stop</Button>
          : <Button type="button" variant="tonal" icon={<ArrowCounterClockwise size={16} />} onClick={() => mulai()}>Replay</Button>}
        <Button type="button" variant="text" onClick={onClose}>Done</Button>
      </>}
    >
      <div role="radiogroup" aria-label="Animation" onKeyDown={(event) => onAnimationArrow(event, animation, pilih)} className="mb-3 mt-1 flex flex-wrap gap-1.5">
        {ANIMATIONS.map((item) => {
          const aktif = item.value === animation;
          return (
            <button
              key={item.value} type="button" role="radio" aria-checked={aktif} data-value={item.value}
              tabIndex={aktif ? 0 : -1} onClick={() => pilih(item.value)}
              className={cx(
                "flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-label-large",
                aktif ? "border-transparent bg-secondary-container text-on-secondary-container" : "border-outline-variant text-on-surface-variant hover:bg-surface-container-high",
              )}
            >
              {/* Chip filter M3: tanda centang menggantikan ikon pada yang terpilih,
                  jadi pilihan tidak hanya dibedakan oleh warna. */}
              <span aria-hidden>{aktif ? <Check size={18} weight="bold" /> : ANIMATION_ICON[item.value]}</span>{item.label}
            </button>
          );
        })}
      </div>
      <StageFrame background={stage.background} text={stage.text}>
        <div className="flex h-full w-full items-center justify-center p-[3%]">
          {animation === "wheel" ? <WheelAnimation {...props} />
            : animation === "slot" ? <SlotAnimation {...props} />
            : animation === "cards" ? <CardsAnimation {...props} />
            : animation === "digits" ? <DigitsAnimation {...props} />
            : animation === "dart" ? <DartAnimation {...props} />
            : <WinnerList winners={props.winners} accent={stage.accent} text={stage.text} fontFamily={stage.fontFamily} />}
        </div>
      </StageFrame>
    </Dialog>
  );
}

/**
 * Layar panggung maya 1280x720 di dalam iframe, diperkecil agar muat.
 *
 * Animasi panggung mengukur dirinya dengan vw/vh. Dirender langsung di dialog,
 * ukuran itu mengikuti jendela admin, bukan kotak pratinjau: di 1280x588 roda
 * terpotong dan di ponsel hanya porosnya yang terlihat. Di dalam iframe, vw/vh
 * merujuk ke iframe, jadi tata letaknya sama dengan layar panggung 1280x720.
 */
function StageFrame({ background, text, children }: { background: string; text: string; children: ReactNode }) {
  const kotak = useRef<HTMLDivElement>(null);
  const [skala, setSkala] = useState(0);
  const [body, setBody] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = kotak.current;
    if (!el) return;
    const pengamat = new ResizeObserver(([entry]) => setSkala(entry.contentRect.width / PANGGUNG.width));
    pengamat.observe(el);
    return () => pengamat.disconnect();
  }, []);

  function siapkan(frame: HTMLIFrameElement) {
    const doc = frame.contentDocument;
    if (!doc) return;
    // Gaya halaman (Tailwind, font) disalin supaya kelas di komponen animasi berlaku.
    for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) doc.head.appendChild(node.cloneNode(true));
    doc.documentElement.className = document.documentElement.className;
    doc.body.style.margin = "0";
    doc.body.style.overflow = "hidden";
    setBody(doc.body);
  }

  return (
    <div
      ref={kotak}
      className="relative mx-auto aspect-video max-w-full overflow-hidden rounded-md"
      // Lebar mengikuti tinggi layar, supaya Replay dan Done tetap terlihat di 1280x588.
      style={{ background, width: "min(100%, calc((100dvh - 340px) * 16 / 9))" }}
    >
      <iframe
        title="Stage preview" aria-hidden tabIndex={-1}
        srcDoc="<!doctype html><html><head></head><body></body></html>"
        onLoad={(event) => siapkan(event.currentTarget)}
        className="absolute left-0 top-0 origin-top-left border-0"
        style={{ width: PANGGUNG.width, height: PANGGUNG.height, transform: `scale(${skala})`, visibility: skala ? "visible" : "hidden" }}
      />
      {body ? createPortal(
        <div style={{ width: "100vw", height: "100vh", background, color: text }}>{children}</div>,
        body,
      ) : null}
    </div>
  );
}
