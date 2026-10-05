import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarBlank, CheckCircle, Hourglass, XCircle } from "@phosphor-icons/react/dist/ssr";
import { RegistrationCodeCard } from "@/components/registration-code-card";
import { publicEventName, type EventLandingConfig, type EventRow } from "@/lib/domain";
import { formatEventSchedule } from "@/lib/event-datetime";
import { landingDefaultLang, landingEnAvailable, resolveLanding, type LandingLang } from "@/lib/landing-i18n";
import { PESERTA_UI } from "@/lib/member/peserta-i18n";
import { registrationThemeStyle, resolveFormTheme } from "@/lib/registration-theme-css";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Halaman kode peserta yang bisa dibuka kapan saja.
 *
 * Alamatnya `/e/<slug>/kode/<token>`; proxy menulis ulangnya ke rute ini. Token
 * itu 64 karakter heksadesimal yang dibuat database saat pendaftaran masuk —
 * lihat 202608210001_registration_access_token.sql untuk alasan bentuknya.
 *
 * Pencarian dilakukan LEWAT TOKEN SAJA, slug di alamat diabaikan. Token sudah
 * unik di seluruh tabel, dan mencocokkannya dengan slug hanya menambah satu cara
 * halaman ini gagal (tautan yang slug-nya salah ketik, acara yang slug-nya
 * diganti panitia) tanpa menambah satu pun perlindungan.
 *
 * Yang ditampilkan: nama acara, jadwal, nama pendaftar, dan kodenya. Nama
 * pendaftar ikut atas keputusan sadar — pemilik tautan harus bisa memastikan
 * kode itu miliknya, dan panitia yang dibacakan lewat telepon perlu mencocokkan
 * nama. Konsekuensinya nama ikut terbawa bila tautannya diteruskan, dan karena
 * itu tidak ada apa pun selain nama di sini: tidak ada email, telepon, maupun
 * jawaban isian tambahan.
 *
 * Bahasa: `/e/<slug>/en/kode/<token>` (proxy mengisi `?bahasa=en`), atau
 * bahasa formulir yang dipakai pendaftar (event_registrations.language) bila
 * alamatnya tanpa akhiran bahasa. English hanya bila versi English acara
 * menyala; selain itu bahasa utama acara.
 */

export const dynamic = "force-dynamic";

// Halaman ini tidak boleh masuk indeks mesin pencari. Tautannya rahasia hanya
// selama ia tidak dipublikasikan, dan satu tautan yang bocor ke indeks berarti
// setiap kode peserta acara itu dapat ditemukan lewat pencarian.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { bahasa } = await searchParams;
  return {
    title: PESERTA_UI[bahasa === "en" ? "en" : "id"].kode.title,
    robots: { index: false, follow: false },
  };
}

type Registrasi = {
  event_id: string;
  name: string;
  status: "pending" | "approved" | "rejected";
  participant_id: string | null;
};

export default async function KodePesertaPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const { bahasa } = await searchParams;

  // Bentuk token diperiksa SEBELUM menyentuh database. Tanpa ini, setiap alamat
  // ngawur — termasuk yang dipindai bot — menjadi satu kueri.
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();

  const client = getSupabaseServiceClient();
  const { data } = await client
    .from("event_registrations")
    .select("event_id,name,status,participant_id")
    .eq("access_token", token)
    .maybeSingle();

  const registrasi = data as Registrasi | null;
  if (!registrasi) notFound();

  const [acara, peserta, bahasaDaftar] = await Promise.all([
    client.from("events").select("*").eq("id", registrasi.event_id).single(),
    registrasi.participant_id
      ? client.from("participants").select("qr_code").eq("id", registrasi.participant_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // Kolom `language` dari migrasi 202610050001; belum ada atau gagal = tidak diketahui.
    client.from("event_registrations").select("language").eq("access_token", token).maybeSingle().then(
      ({ data: baris, error }) => (error ? null : ((baris as { language?: string | null } | null)?.language ?? null)),
      () => null,
    ),
  ]);

  const asli = acara.data as EventRow | null;
  if (!asli || asli.status === "archived") notFound();

  const kode = (peserta.data as { qr_code: string } | null)?.qr_code ?? null;
  const landingAsli = (asli.landing_config ?? {}) as EventLandingConfig;
  const utama = landingDefaultLang(landingAsli);
  const diminta = bahasa === "en" || bahasa === "id" ? bahasa : bahasaDaftar === "en" || bahasaDaftar === "id" ? bahasaDaftar : null;
  const lang: LandingLang = diminta && landingEnAvailable(landingAsli) ? diminta : utama;
  const { event, config: landing } = resolveLanding(asli, lang);
  const p = PESERTA_UI[lang].kode;
  const theme = registrationThemeStyle(resolveFormTheme(event.registration_form_config?.theme, landing.theme));
  const schedule = formatEventSchedule(event, lang);
  const halamanAcara = lang === utama ? `/e/${event.slug}` : `/e/${event.slug}/${lang}`;

  return (
    <main
      lang={lang}
      className="min-h-dvh"
      style={{
        ...theme,
        backgroundImage:
          "radial-gradient(120% 100% at 82% -10%, color-mix(in srgb, var(--reg-primary) 22%, transparent), transparent 60%), radial-gradient(90% 80% at 0% 0%, color-mix(in srgb, var(--reg-primary) 10%, transparent), transparent 55%)",
      }}
    >
      <div className="mx-auto w-full max-w-[560px] px-5 py-12 sm:py-16">
        <Link
          href={halamanAcara}
          className="m3-state -ml-3 inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-label-large font-semibold text-[var(--reg-on-surface-variant)]"
        >
          <ArrowLeft size={18} weight="bold" />
          {p.eventPage}
        </Link>

        <h1 className="mt-6 text-balance text-headline-large font-semibold tracking-[-0.02em]">{publicEventName(event)}</h1>

        {schedule ? (
          <p className="mt-4 inline-flex items-start gap-2 rounded-3xl bg-[var(--reg-primary-container)] px-4 py-2 text-label-large font-semibold text-[var(--reg-on-primary-container)]">
            <CalendarBlank size={18} weight="fill" className="mt-0.5 shrink-0" />
            {schedule}
          </p>
        ) : null}

        <div className="mt-7 rounded-[28px] border border-[var(--reg-outline-variant)] bg-[var(--reg-panel)] p-6 text-center sm:p-8">
          {registrasi.status === "approved" && kode ? (
            <>
              <CheckCircle size={48} weight="fill" className="mx-auto text-[var(--reg-primary)]" />
              <h2 className="mt-4 text-title-large font-semibold">{registrasi.name}</h2>
              <p className="mt-1 text-body-medium text-[var(--reg-on-surface-variant)]">{p.registered}</p>
              <RegistrationCodeCard
                code={kode}
                eventName={publicEventName(event)}
                personName={registrasi.name}
                schedule={schedule}
                lang={lang}
              />
              <p className="mt-5 text-body-medium leading-6 text-[var(--reg-on-surface-variant)]">
                {p.keepLink}
              </p>
            </>
          ) : registrasi.status === "rejected" ? (
            <>
              <XCircle size={48} weight="fill" className="mx-auto text-[var(--reg-error)]" />
              <h2 className="mt-4 text-title-large font-semibold">{p.rejectedTitle}</h2>
              {/* Alasan penolakan TIDAK ditampilkan di sini. Ia ditulis panitia
                  untuk catatan internal, sering berupa kalimat pendek yang tidak
                  dimaksudkan dibaca pendaftarnya sendiri. */}
              <p className="mt-3 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">
                {p.rejectedBody}
              </p>
            </>
          ) : (
            <>
              <Hourglass size={48} className="mx-auto text-[var(--reg-on-surface-variant)]" />
              <h2 className="mt-4 text-title-large font-semibold">{p.pendingTitle}</h2>
              <p className="mt-3 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">
                {p.pendingBody.sebelum}
                <span className="font-semibold">{registrasi.name}</span>
                {p.pendingBody.sesudah}
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
