"use server";

import type { ReactNode } from "react";
import { getEventBySlugPublic, requireEventScope } from "@/lib/auth/event-scope";
import type { EventLandingConfig, EventRow } from "@/lib/domain";
import { memberSchema } from "@/lib/landing-body-schema";
import { previewMemberSession } from "@/lib/member/account";
import { renderBerandaPratinjau } from "./render";

export type HasilPratinjauPeserta = { ok: true; isi: ReactNode } | { ok: false; pesan: string };

/**
 * Render Beranda peserta dari setelan Participant area yang belum disimpan.
 *
 * Sama dengan pratinjau halaman acara: hanya untuk admin acara itu, draf tidak
 * ditulis ke mana pun, dan diperiksa dengan skema yang sama dengan Simpan.
 * Isi lain (blok, tema) dari salinan tersimpan: disunting di Event page.
 */
export async function renderPratinjauPeserta(slug: string, pesertaId: string, draf: unknown): Promise<HasilPratinjauPeserta> {
  const auth = await requireEventScope(slug, ["admin"]);
  if (auth.response) return { ok: false, pesan: "Your session has expired. Reload this page." };
  // Tautan umpan balik yang masih diketik tidak menghentikan pratinjau.
  const parsed = [draf, draf && typeof draf === "object" ? { ...draf, feedback_url: null } : draf].map((isi) => memberSchema.safeParse(isi)).find((hasil) => hasil.success) ?? memberSchema.safeParse(draf);
  if (!parsed.success) return { ok: false, pesan: "Some settings aren't valid yet. The preview resumes once they're fixed." };
  const event = (await getEventBySlugPublic(slug)) as EventRow | null;
  if (!event) return { ok: false, pesan: "Event not found." };
  const sesi = await previewMemberSession(event.id, pesertaId);
  if (!sesi) return { ok: false, pesan: "This participant is no longer in the Participant list. Choose another one." };
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const isi = await renderBerandaPratinjau(event, { ...(landing.member ?? { enabled: false }), ...parsed.data }, sesi);
  return isi ? { ok: true, isi } : { ok: false, pesan: "Participant home is only on the Modern and Gathering layouts." };
}
