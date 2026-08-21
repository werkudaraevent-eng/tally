import { getPublicPageEvent } from "@/lib/auth/request-event";
import type { EventLandingConfig } from "@/lib/domain";
import { formatEventSchedule } from "@/lib/event-datetime";
import { registrationThemeStyle, resolveFormTheme } from "@/lib/registration-theme-css";
import DaftarClient from "./daftar-client";

// Sama alasannya dengan /display: tanpa ini Next.js mem-prerender halaman saat
// build, dan nama acara membeku pada event yang kebetulan aktif saat itu.
export const dynamic = "force-dynamic";

export default async function DaftarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const event = await getPublicPageEvent(searchParams);

  // Tiga keadaan yang harus DIBEDAKAN, karena tindak lanjutnya berbeda:
  // tidak ada event (tautannya salah), pendaftaran ditutup (tautannya benar,
  // waktunya lewat), dan siap menerima. Digabung jadi satu pesan, orang yang
  // mengetik alamat dengan benar akan mengira dirinya salah alamat.
  if (!event) {
    return <Pesan judul="Acara tidak ditemukan" isi="Tautan pendaftaran ini tidak menunjuk ke acara mana pun. Periksa kembali alamat yang Anda terima dari panitia." />;
  }
  if (!event.registration_enabled) {
    return <Pesan judul="Pendaftaran ditutup" isi={`Pendaftaran untuk "${event.name}" sedang tidak dibuka. Hubungi panitia bila Anda merasa ini keliru.`} />;
  }

  const config = event.registration_form_config ?? {};
  const landing = (event.landing_config ?? {}) as EventLandingConfig;

  return <DaftarClient
    theme={registrationThemeStyle(resolveFormTheme(config.theme, landing.theme))}
    eventName={event.name}
    eventSlug={event.slug}
    schedule={formatEventSchedule(event)}
    fields={config.fields ?? []}
    welcomeText={config.welcome_text ?? null}
    successText={config.success_text ?? null}
    requireEmail={config.require_email !== false}
    requirePhone={config.require_phone !== false}
    requireCompany={config.require_company ?? false}
    requireJobTitle={config.require_job_title ?? false}
  />;
}

function Pesan({ judul, isi }: { judul: string; isi: string }) {
  return <main className="grid min-h-dvh place-items-center bg-surface px-5 text-on-surface">
    <div className="rounded-lg w-full max-w-md border border-outline-variant bg-panel p-8 text-center">
      <h1 className="text-headline-small font-semibold tracking-[-0.03em]">{judul}</h1>
      <p className="mt-3 text-body-medium leading-6 text-on-surface-variant">{isi}</p>
    </div>
  </main>;
}
