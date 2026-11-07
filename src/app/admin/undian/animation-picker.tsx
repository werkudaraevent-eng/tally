"use client";

import { CheckCircle, Info, Play, Warning } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/m3";
import { ANIMATIONS, ANIMATION_BEST_WINNERS, bestWinnersLabel, maxWinnersPerDraw, winnerFit, WINNERS_PER_DRAW_MAX, type AnimSpeed, type SpinMode, type UndianAnimation, type WallNames, type WallTiles } from "@/lib/undian";
import { cx } from "@/lib/m3/cx";
import { ANIMATION_ICON, onAnimationArrow, type StageLook } from "./animation-choice";

export type { StageLook } from "./animation-choice";

// Kode animasi panggung (~45 KB gz) baru dimuat saat Preview ditekan, bukan
// bersama halaman Prizes & rules.
const AnimationPreview = dynamic(() => import("./animation-preview").then((mod) => mod.AnimationPreview), { ssr: false });

/**
 * Pilihan animasi sebagai kartu, ditambah pratinjau yang memutar animasi
 * panggung yang SAMA (komponen /undian), dengan warna Stage screen.
 */
export function AnimationPicker({
  value, onChange, spinMode, spinSeconds, winnersPerDraw, sampleNames, stage, wallNames, wallTiles, speed,
}: {
  value: UndianAnimation; onChange: (value: UndianAnimation) => void;
  spinMode: SpinMode; spinSeconds: number; winnersPerDraw: number;
  sampleNames: string[]; stage: StageLook; wallNames?: WallNames; wallTiles?: WallTiles; speed?: AnimSpeed;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  // Kunci baru setiap kali dibuka: pratinjau dipasang ulang dan langsung berputar
  // dari awal, tanpa efek yang menyetel state saat dialog terbuka. Nol berarti
  // belum pernah dibuka, jadi tidak ada portal saat render pertama.
  const [previewKey, setPreviewKey] = useState(0);
  const pilihan = ANIMATIONS.find((item) => item.value === value);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p id="prize-animation-label" className="text-body-medium font-medium">Animation</p>
        <Button type="button" variant="text" size="sm" icon={<Play size={16} />} onClick={() => { setPreviewKey((current) => current + 1); setPreviewOpen(true); }}>Preview</Button>
      </div>
      <div
        role="radiogroup" aria-labelledby="prize-animation-label"
        onKeyDown={(event) => onAnimationArrow(event, value, onChange)}
        className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {ANIMATIONS.map((item) => {
          const aktif = item.value === value;
          return (
            <button
              key={item.value} type="button" role="radio" aria-checked={aktif} data-value={item.value}
              tabIndex={aktif ? 0 : -1}
              onClick={() => onChange(item.value)}
              className={cx(
                "flex min-h-9 items-center gap-2 rounded-md border px-3 py-2 text-left text-body-medium transition-colors",
                aktif ? "border-primary bg-primary-container text-on-primary-container ring-1 ring-primary" : "border-outline-variant hover:bg-surface-container-high",
              )}
            >
              <span aria-hidden className={aktif ? "text-primary" : "text-on-surface-variant"}>{ANIMATION_ICON[item.value]}</span>
              <span className="min-w-0">
                <span className="block font-medium [overflow-wrap:anywhere]">{item.label}</span>
                <WinnerRange animation={item.value} perDraw={winnersPerDraw} />
              </span>
            </button>
          );
        })}
      </div>
      <WinnerFitNote animation={value} perDraw={winnersPerDraw} label={pilihan?.label ?? "This animation"} />
      <p className="mt-1 text-body-medium text-on-surface-variant">{pilihan?.hint}</p>

      {/* Ke document.body: panel hadiah berada di dalam <form> dan pane yang
          memotong `fixed`, jadi lapisan gelapnya tidak menutup bilah atas. */}
      {previewKey > 0 ? createPortal(
        <AnimationPreview
          key={previewKey}
          open={previewOpen} onClose={() => setPreviewOpen(false)}
          animation={value} spinMode={spinMode} spinSeconds={spinSeconds} winnersPerDraw={winnersPerDraw}
          names={sampleNames} stage={stage} wallNames={wallNames} wallTiles={wallTiles} speed={speed}
          onPick={onChange}
        />,
        document.body,
      ) : null}
    </div>
  );
}

/**
 * Baris kecil di tiap kartu animasi: jumlah pemenang terbaik per undian, plus
 * batasnya bila animasi itu punya batas. Bila "Per draw" saat ini melebihi
 * batas, batasnya diwarnai peringatan: memilih kartu ini menurunkan Per draw.
 */
function WinnerRange({ animation, perDraw }: { animation: UndianAnimation; perDraw: number }) {
  const max = maxWinnersPerDraw(animation);
  const over = winnerFit(animation, perDraw) === "over";
  return (
    <span className="block text-label-medium font-normal tabular-nums text-on-surface-variant">
      Best {bestWinnersLabel(animation)}{" "}
      {max < WINNERS_PER_DRAW_MAX ? <span className={cx("whitespace-nowrap", over && "font-medium text-warning")}>· max {max}</span> : null}
    </span>
  );
}

/** Seberapa cocok "Per draw" sekarang dengan animasi yang dipilih. */
function WinnerFitNote({ animation, perDraw, label }: { animation: UndianAnimation; perDraw: number; label: string }) {
  const fit = winnerFit(animation, perDraw);
  const range = bestWinnersLabel(animation);
  const winners = (n: number) => `${n} ${n === 1 ? "winner" : "winners"}`;
  const best = ANIMATION_BEST_WINNERS[animation];
  const bestText = best.min === best.max ? winners(best.min) : `${range} winners`;
  if (fit === "best") {
    return (
      <p className="mt-2 flex items-start gap-2 text-body-medium text-on-surface">
        <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-success" aria-hidden />
        <span>{winners(perDraw)} per draw suits {label} well (best with {bestText}).</span>
      </p>
    );
  }
  if (fit === "few") {
    return (
      <p className="mt-2 flex items-start gap-2 text-body-medium text-on-surface">
        <Info size={16} className="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden />
        <span>{label} looks best with {bestText} per draw. {winners(perDraw)} works, but the reveal is short.</span>
      </p>
    );
  }
  return (
    <p className="mt-2 flex items-start gap-2 rounded-md bg-warning-soft p-2 text-body-medium text-on-surface">
      <Warning size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <span>
        {label} looks best with {bestText} per draw. {winners(perDraw)} still works, but the reveal takes longer.
        {" "}To give more winners, raise Total quota and draw again.
      </span>
    </p>
  );
}
