import type { EventLandingConfig, EventRow } from "@/lib/domain";
import { publicEventName } from "@/lib/domain";
import { formatEventDate, formatEventTime } from "@/lib/event-datetime";
import { buildRegistrationThemeRoles } from "@/lib/registration-theme";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { contrast } from "./kontras";
import type { RenderContext } from "./render";
import { readTemplat, type Templat } from "./templat";

/**
 * Bahan email konfirmasi dari data acara: templat tersimpan (atau bawaan),
 * sakelar email Menunggu, dan semua yang dibaca dari Tema dan data acara.
 * Dipakai pengirim, Kirim tes, dan API editor, supaya ketiganya melihat bahan
 * yang sama.
 */

export const EVENT_COLUMNS =
  "id,slug,name,event_date,end_date,start_time,end_time,time_zone,venue_name,venue_address,venue_map_url,landing_config";

export type KonteksEvent = Pick<
  EventRow,
  "id" | "slug" | "name" | "event_date" | "end_date" | "start_time" | "end_time" | "time_zone" | "venue_name" | "venue_address" | "venue_map_url" | "landing_config"
>;

export type KonteksDasar = Omit<RenderContext, "state" | "values" | "qr" | "codeUrl" | "test">;

export type BahanKonfirmasi = {
  event: KonteksEvent;
  templat: Templat;
  tersimpan: boolean;
  /** Kirim email Menunggu persetujuan. Email ber-QR (Disetujui) selalu terkirim. */
  kirimMenunggu: boolean;
  dasar: KonteksDasar;
  /** KV acara (Tema > gambar utama), sumber gambar kepala Banner KV. */
  kvUrl: string | null;
  memberOn: boolean;
};

const BRAND_BAWAAN = "#1A56C4";

export function seedOf(landing: EventLandingConfig): string {
  const seed = landing.theme?.seed;
  return typeof seed === "string" && /^#[0-9a-fA-F]{6}$/.test(seed) ? seed : BRAND_BAWAAN;
}

/**
 * Warna email: warna merek apa adanya bila teks putih di atasnya (dan warna itu
 * di atas putih) mencapai 4,5:1; selain itu primary MCU dari seed yang sama,
 * yang memang dibangun sebagai pasangan terbaca. readableOn() tidak cukup di
 * sini: ambang luminansnya meloloskan putih di atas oranye (2,6:1).
 */
export function brandEmail(seed: string): { brand: string; onBrand: string } {
  if (contrast(seed, "#FFFFFF") >= 4.5) return { brand: seed, onBrand: "#FFFFFF" };
  const peran = buildRegistrationThemeRoles(seed, false);
  return { brand: peran.primary, onBrand: peran.on_primary };
}

/** Logo mitra dari Halaman acara: daftar sponsor dan blok Logo mitra. */
export function mitraOf(landing: EventLandingConfig): { name: string; url: string }[] {
  const hasil: { name: string; url: string }[] = [];
  for (const sponsor of landing.sponsors ?? []) {
    if (sponsor.logo_url?.startsWith("https://")) hasil.push({ name: sponsor.name ?? "", url: sponsor.logo_url });
  }
  for (const block of landing.blocks ?? []) {
    if (block.type !== "logos") continue;
    for (const item of block.items ?? []) {
      if (item.image_url?.startsWith("https://")) hasil.push({ name: item.label ?? item.title ?? "", url: item.image_url });
    }
  }
  const unik = new Map(hasil.map((logo) => [logo.url, logo]));
  return [...unik.values()];
}

export function konteksDasar(event: KonteksEvent, origin: string, bisaDibalas: boolean): KonteksDasar {
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const memberOn = Boolean(landing.member?.enabled);
  const slug = encodeURIComponent(event.slug);
  return {
    ...brandEmail(seedOf(landing)),
    eventName: publicEventName(event),
    logoUrl: landing.nav?.logo_url?.startsWith("https://") ? landing.nav.logo_url : null,
    logoPutihUrl: landing.forum?.logo_light_url?.startsWith("https://") ? landing.forum.logo_light_url : null,
    headingFont: landing.heading_font ?? null,
    detail: {
      tanggal: formatEventDate(event),
      waktu: formatEventTime(event),
      tempat: event.venue_name?.trim() || null,
      alamat: event.venue_address?.trim() || null,
      petaUrl: event.venue_map_url?.startsWith("https://") ? event.venue_map_url : null,
      kalenderUrl: event.event_date ? new URL(`/kalender.ics?eventSlug=${slug}`, origin).toString() : null,
    },
    dashboardUrl: memberOn ? new URL(`/e/${slug}/peserta`, origin).toString() : null,
    halamanUrl: new URL(`/e/${slug}`, origin).toString(),
    mitra: mitraOf(landing),
    bisaDibalas,
  };
}

export async function bahanKonfirmasi(eventId: string, origin: string): Promise<BahanKonfirmasi | null> {
  const client = getSupabaseServiceClient();
  const [{ data: eventRow }, { data: setelan, error: galatSetelan }] = await Promise.all([
    client.from("events").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle(),
    client.from("event_settings").select("registration_email,registration_email_pending,email_reply_to").eq("event_id", eventId).maybeSingle(),
  ]);
  const event = eventRow as KonteksEvent | null;
  if (!event) return null;
  // Kolom belum ada (migrasi belum dijalankan) = perilaku bawaan, bukan gagal kirim.
  const baris = galatSetelan ? null : (setelan as { registration_email: unknown; registration_email_pending: boolean | null; email_reply_to: string | null } | null);
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const memberOn = Boolean(landing.member?.enabled);
  const kvUrl = typeof landing.banner_url === "string" && landing.banner_url.startsWith("https://") ? landing.banner_url : null;
  const bisaDibalas = Boolean(baris?.email_reply_to || process.env.EMAIL_REPLY_TO?.trim());
  return {
    event,
    templat: readTemplat(baris?.registration_email ?? null, { punyaKv: Boolean(kvUrl), memberOn }),
    tersimpan: Boolean(baris?.registration_email),
    kirimMenunggu: baris?.registration_email_pending ?? true,
    dasar: konteksDasar(event, origin, bisaDibalas),
    kvUrl,
    memberOn,
  };
}
