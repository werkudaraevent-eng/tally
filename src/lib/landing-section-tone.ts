import type { LandingBlockTone, LandingSectionId } from "@/lib/domain";

// Latar bagian bawaan gaya gathering (landing_config.section_tone): pilihan
// yang sama dengan latar blok (Light, Grey, Dark brand).

/** Bagian yang latarnya bisa dipilih. */
export const LANDING_SECTION_TONE_IDS = ["about", "agenda", "speakers", "venue", "faq"] as const satisfies readonly LandingSectionId[];

/** Latar bawaan bila admin belum memilih: sama dengan sebelum ada pilihan. */
export const LATAR_BAGIAN_BAWAAN: Partial<Record<LandingSectionId, LandingBlockTone>> = {
  agenda: "panel",
  speakers: "panel",
};

export function latarBagian(id: LandingSectionId, pilihan: Partial<Record<string, LandingBlockTone>> | undefined): LandingBlockTone {
  return pilihan?.[id] ?? LATAR_BAGIAN_BAWAAN[id] ?? "light";
}
