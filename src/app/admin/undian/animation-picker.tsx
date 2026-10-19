"use client";

import { Play } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/m3";
import { ANIMATIONS, type SpinMode, type UndianAnimation } from "@/lib/undian";
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
  value, onChange, spinMode, spinSeconds, winnersPerDraw, sampleNames, stage,
}: {
  value: UndianAnimation; onChange: (value: UndianAnimation) => void;
  spinMode: SpinMode; spinSeconds: number; winnersPerDraw: number;
  sampleNames: string[]; stage: StageLook;
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
              <span className="min-w-0 truncate font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-body-medium text-on-surface-variant">{pilihan?.hint}</p>

      {/* Ke document.body: panel hadiah berada di dalam <form> dan pane yang
          memotong `fixed`, jadi lapisan gelapnya tidak menutup bilah atas. */}
      {previewKey > 0 ? createPortal(
        <AnimationPreview
          key={previewKey}
          open={previewOpen} onClose={() => setPreviewOpen(false)}
          animation={value} spinMode={spinMode} spinSeconds={spinSeconds} winnersPerDraw={winnersPerDraw}
          names={sampleNames} stage={stage}
          onPick={onChange}
        />,
        document.body,
      ) : null}
    </div>
  );
}
