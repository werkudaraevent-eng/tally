import type { Branding } from "@/lib/branding";
import type { PoolBreakdown } from "@/lib/undian";

// Bentuk data CMS Undian yang dipakai bersama oleh halaman dan panel-panelnya.

export type PoolStat = { eligible: number; candidates: number; tickets: number };
export type EntryGroup = { id: number; name: string; note: string | null; entry_count: number };
export type Exclusion = { participant_id: string; name: string; company: string | null; reason: string | null };
export type Preview = {
  total_participants: number; eligible: number; available: number;
  total_tickets: number; max_tickets: number; top_share: number;
  breakdown: PoolBreakdown;
  sample: { name: string; company: string | null; checked_in: boolean; total_spend: number; tickets: number }[];
  participant_types: string[]; rsvp_statuses: string[]; companies: string[];
};

export type Settings = {
  page_title: string; page_subtitle: string | null;
  name_display: "full" | "follow_event";
  show_company: boolean; show_seat: boolean;
  sound_enabled: boolean; confetti_enabled: boolean;
  reveal_delay_seconds: number;
  background_color: string | null; text_color: string | null; accent_color: string | null;
  background_image_url: string | null;
} & Branding;

// Nilai yang ditampilkan <input type="color"> ketika kolomnya masih null. Bukan
// nilai yang disimpan: kolomnya tetap null sampai admin benar-benar memilih warna.
export const FALLBACK = { background_color: "#0B1020", text_color: "#FFFFFF", accent_color: "#F5C451" } as const;
