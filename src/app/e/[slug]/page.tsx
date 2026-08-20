import { notFound } from "next/navigation";
import { getEventBySlugPublic } from "@/lib/auth/event-scope";
import { DEFAULT_LANDING_SECTIONS, type EventLandingConfig, type LandingSection } from "@/lib/domain";
import { registrationThemeStyle } from "@/lib/registration-theme-css";
import { formatEventSchedule } from "@/lib/event-datetime";
import { EventLanding } from "@/components/landing/event-landing";

/**
 * Landing page publik satu acara.
 *
 * Alamat ini — `/e/<slug>` — adalah alamat yang dicetak di undangan dan QR.
 * Sebelumnya ia berisi pemilih layar panitia, yang berarti tamu yang memotong
 * bagian belakang alamat mana pun (`/daftar`, `/rundown`) mendarat di layar
 * login. Sekarang setiap pemotongan berakhir di halaman ini, dan tidak ada
 * satu pun jalan dari sini ke layar internal.
 *
 * `force-dynamic` dengan alasan yang sama seperti /display dan /daftar: tanpa
 * itu Next.js merender halaman saat build dan isinya membeku pada acara yang
 * kebetulan aktif saat itu.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlugPublic(slug);
  if (!event) return { title: "Acara tidak ditemukan" };

  const jadwal = formatEventSchedule(event);
  const banner = (event.landing_config as EventLandingConfig)?.banner_url ?? undefined;

  // Metadata ditulis lengkap, bukan hanya judul. Alamat ini disebar lewat
  // WhatsApp dan LinkedIn, dan tautan tanpa kartu pratinjau terbaca seperti
  // tautan yang tidak jelas asalnya — persis yang membuat orang tidak menekannya.
  return {
    title: `${event.name}${event.tagline ? ` — ${event.tagline}` : ""}`,
    description: event.description ?? jadwal ?? undefined,
    openGraph: {
      title: event.name,
      description: event.tagline ?? event.description ?? undefined,
      images: banner ? [banner] : undefined,
      type: "website",
    },
  };
}

export default async function EventLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlugPublic(slug);

  // Acara yang diarsipkan tidak punya halaman publik. Ia tidak "tidak
  // ditemukan" bagi panitia, tetapi bagi tamu yang membuka tautan lama, 404
  // lebih jujur daripada halaman acara yang sudah tidak berlaku.
  if (!event || event.status === "archived") notFound();

  const config = (event.landing_config ?? {}) as EventLandingConfig;
  const sections: LandingSection[] = config.sections?.length ? config.sections : DEFAULT_LANDING_SECTIONS;

  return (
    <EventLanding
      event={event}
      config={config}
      sections={sections}
      theme={registrationThemeStyle(config.theme)}
      schedule={formatEventSchedule(event)}
    />
  );
}
