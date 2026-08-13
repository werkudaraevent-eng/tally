import { getPublicPageEvent } from "@/lib/auth/request-event";
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
  return <DaftarClient
    eventSlug={event.slug}
    eventName={event.name}
    eventDate={event.event_date}
    timeZone={event.time_zone}
    fields={config.fields ?? []}
    welcomeText={config.welcome_text ?? null}
    successText={config.success_text ?? null}
    requireCompany={config.require_company ?? false}
    requireJobTitle={config.require_job_title ?? false}
  />;
}

function Pesan({ judul, isi }: { judul: string; isi: string }) {
  return <main className="grid min-h-dvh place-items-center bg-[var(--background)] px-5 text-[var(--ink)]">
    <div className="w-full max-w-md border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-[-0.03em]">{judul}</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">{isi}</p>
    </div>
  </main>;
}
