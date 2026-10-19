"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { Cards, Disc, Hash, Lightning, Rows, Target } from "@phosphor-icons/react";
import { ANIMATIONS, type UndianAnimation } from "@/lib/undian";

export const ANIMATION_ICON: Record<UndianAnimation, ReactNode> = {
  wheel: <Disc size={20} />, slot: <Rows size={20} />, cards: <Cards size={20} />,
  digits: <Hash size={20} />, dart: <Target size={20} />, instant: <Lightning size={20} />,
};

/** Tampilan panggung yang dipakai pratinjau: warna dan huruf dari Stage screen. */
export type StageLook = { background: string; text: string; accent: string; fontFamily: string };

/**
 * Panah di dalam radiogroup animasi, seperti radio bawaan: memindahkan pilihan
 * DAN fokus. Hanya pilihan aktif yang bisa dicapai dengan Tab (roving
 * tabindex), jadi grup ini satu perhentian Tab, bukan enam.
 */
export function onAnimationArrow(event: KeyboardEvent<HTMLElement>, current: UndianAnimation, select: (value: UndianAnimation) => void) {
  const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
  if (!step) return;
  event.preventDefault();
  const index = ANIMATIONS.findIndex((item) => item.value === current);
  const next = ANIMATIONS[(index + step + ANIMATIONS.length) % ANIMATIONS.length].value;
  select(next);
  event.currentTarget.querySelector<HTMLElement>(`[data-value="${next}"]`)?.focus();
}
