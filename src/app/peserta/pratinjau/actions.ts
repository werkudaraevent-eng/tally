"use server";

import type { ReactNode } from "react";
import { getEventBySlugPublic, requireEventScope } from "@/lib/auth/event-scope";
import { sectionsDenganBlokPeserta, type EventLandingConfig, type EventRow } from "@/lib/domain";
import { memberSchema } from "@/lib/landing-body-schema";
import { previewMemberSession } from "@/lib/member/account";
import { bantuanPratinjau, type BantuanDarurat } from "@/lib/member/kontak-darurat";
import { bacaOutfitSetiapHari } from "@/lib/outfit-setiap-hari";
import { EVENT_TIME_ZONES, normalizeTimeZone } from "@/lib/timezone";
import { renderBerandaPratinjau } from "./render";

/** Pilihan "Preview on" di Participant area: tanggal dan jam di zona acara. */
export type WaktuPratinjau = { tanggal: string; jam: string } | null;

/** Tanggal dan jam di zona acara menjadi ms epoch; null bila bukan pilihan yang sah. */
function waktuDari(pilihan: unknown, zona: string | null | undefined): number | null {
  if (!pilihan || typeof pilihan !== "object") return null;
  const { tanggal, jam } = pilihan as { tanggal?: unknown; jam?: unknown };
  if (typeof tanggal !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || typeof jam !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(jam)) return null;
  const offset = EVENT_TIME_ZONES.find((item) => item.id === normalizeTimeZone(zona))?.offset ?? "+07:00";
  const ms = Date.parse(`${tanggal}T${jam}:00${offset}`);
  return Number.isNaN(ms) ? null : ms;
}

export type HasilPratinjauPeserta = { ok: true; isi: ReactNode } | { ok: false; pesan: string };

/**
 * Render Beranda peserta dari setelan Participant area yang belum disimpan.
 *
 * Sama dengan pratinjau halaman acara: hanya untuk admin acara itu, draf tidak
 * ditulis ke mana pun, dan diperiksa dengan skema yang sama dengan Simpan.
 * Isi lain (blok, tema) dari salinan tersimpan: disunting di Event page.
 */
export async function renderPratinjauPeserta(slug: string, pesertaId: string, draf: unknown, tab: unknown = "beranda", waktu: unknown = null): Promise<HasilPratinjauPeserta> {
  const auth = await requireEventScope(slug, ["admin"]);
  if (auth.response) return { ok: false, pesan: "Your session has expired. Reload this page." };
  // Tautan umpan balik yang masih diketik tidak menghentikan pratinjau.
  // Kontak darurat yang masih diketik (tanpa nama, peta setengah jadi) dilewati, bukan menghentikan pratinjau.
  // Every day dibaca seperti portal membacanya (bacaOutfitSetiapHari), di luar
  // skema tulis: foto http data uji lokal tidak menghentikan pratinjau, dan
  // Save tetap memeriksa https.
  const setiap = draf && typeof draf === "object" && "outfit_every_day" in draf ? { outfit_every_day: bacaOutfitSetiapHari((draf as { outfit_every_day?: unknown }).outfit_every_day) } : null;
  const drafAwal = setiap ? Object.fromEntries(Object.entries(draf as object).filter(([kunci]) => kunci !== "outfit_every_day")) : draf;
  const drafRapi = drafAwal && typeof drafAwal === "object" && "help" in drafAwal ? { ...drafAwal, help: bantuanPratinjau((drafAwal as { help?: BantuanDarurat | null }).help) } : drafAwal;
  const parsed = [drafRapi, drafRapi && typeof drafRapi === "object" ? { ...drafRapi, feedback_url: null } : drafRapi].map((isi) => memberSchema.safeParse(isi)).find((hasil) => hasil.success) ?? memberSchema.safeParse(drafRapi);
  if (!parsed.success) return { ok: false, pesan: "Some settings aren't valid yet. The preview resumes once they're fixed." };
  const event = (await getEventBySlugPublic(slug)) as EventRow | null;
  if (!event) return { ok: false, pesan: "Event not found." };
  const sesi = await previewMemberSession(event.id, pesertaId);
  if (!sesi) return { ok: false, pesan: "This participant is no longer in the Participant list. Choose another one." };
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  // Mata Participant home yang baru dinyalakan ikut berlaku, sama dengan saat disimpan.
  // Draf sudah memuat blok lama yang mati sebagai tersembunyi (GET Area peserta),
  // jadi blok khusus peserta yang tidak tersembunyi di draf = matanya menyala.
  const tersembunyi: readonly string[] | undefined = parsed.data.home?.hidden;
  const nyala = tersembunyi ? (landing.blocks ?? []).map((block) => block.id as string).filter((id) => !tersembunyi.includes(id)) : [];
  const sections = sectionsDenganBlokPeserta(landing.sections, landing.blocks, nyala);
  const acara = sections === landing.sections ? event : { ...event, landing_config: { ...landing, sections } };
  const isi = await renderBerandaPratinjau(acara, { ...(landing.member ?? { enabled: false }), ...parsed.data, ...setiap }, sesi, tab === "profil" ? "profil" : "beranda", waktuDari(waktu, event.time_zone));
  return isi ? { ok: true, isi } : { ok: false, pesan: "Participant home is only on the Modern and Gathering layouts." };
}
