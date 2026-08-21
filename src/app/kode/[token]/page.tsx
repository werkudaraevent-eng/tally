import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarBlank, CheckCircle, Hourglass, XCircle } from "@phosphor-icons/react/dist/ssr";
import { RegistrationCodeCard } from "@/components/registration-code-card";
import type { EventLandingConfig, EventRow } from "@/lib/domain";
import { formatEventSchedule } from "@/lib/event-datetime";
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
 */

export const dynamic = "force-dynamic";

// Halaman ini tidak boleh masuk indeks mesin pencari. Tautannya rahasia hanya
// selama ia tidak dipublikasikan, dan satu tautan yang bocor ke indeks berarti
// setiap kode peserta acara itu dapat ditemukan lewat pencarian.
export const metadata = {
  title: "Kode peserta",
  robots: { index: false, follow: false },
};

type Registrasi = {
  event_id: string;
  name: string;
  status: "pending" | "approved" | "rejected";
  participant_id: string | null;
};

export default async function KodePesertaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

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

  const [acara, peserta] = await Promise.all([
    client.from("events").select("*").eq("id", registrasi.event_id).single(),
    registrasi.participant_id
      ? client.from("participants").select("qr_code").eq("id", registrasi.participant_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const event = acara.data as EventRow | null;
  if (!event || event.status === "archived") notFound();

  const kode = (peserta.data as { qr_code: string } | null)?.qr_code ?? null;
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const theme = registrationThemeStyle(resolveFormTheme(event.registration_form_config?.theme, landing.theme));
  const schedule = formatEventSchedule(event);

  return (
    <main
      className="min-h-dvh"
      style={{
        ...theme,
        backgroundImage:
          "radial-gradient(120% 100% at 82% -10%, color-mix(in srgb, var(--reg-primary) 22%, transparent), transparent 60%), radial-gradient(90% 80% at 0% 0%, color-mix(in srgb, var(--reg-primary) 10%, transparent), transparent 55%)",
      }}
    >
      <div className="mx-auto w-full max-w-[560px] px-5 py-12 sm:py-16">
        <Link
          href={`/e/${event.slug}`}
          className="m3-state -ml-3 inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-label-large font-semibold text-[var(--reg-on-surface-variant)]"
        >
          <ArrowLeft size={18} weight="bold" />
          Halaman acara
        </Link>

        <h1 className="mt-6 text-balance text-headline-large font-semibold tracking-[-0.02em]">{event.name}</h1>

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
              <p className="mt-1 text-body-medium text-[var(--reg-on-surface-variant)]">Terdaftar</p>
              <RegistrationCodeCard
                code={kode}
                eventName={event.name}
                personName={registrasi.name}
                schedule={schedule}
              />
              <p className="mt-5 text-body-medium leading-6 text-[var(--reg-on-surface-variant)]">
                Simpan alamat halaman ini. Ia bisa dibuka kapan saja sampai acara selesai.
              </p>
            </>
          ) : registrasi.status === "rejected" ? (
            <>
              <XCircle size={48} weight="fill" className="mx-auto text-[var(--reg-error)]" />
              <h2 className="mt-4 text-title-large font-semibold">Pendaftaran tidak disetujui</h2>
              {/* Alasan penolakan TIDAK ditampilkan di sini. Ia ditulis panitia
                  untuk catatan internal, sering berupa kalimat pendek yang tidak
                  dimaksudkan dibaca pendaftarnya sendiri. */}
              <p className="mt-3 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">
                Hubungi panitia bila Anda merasa ini keliru.
              </p>
            </>
          ) : (
            <>
              <Hourglass size={48} className="mx-auto text-[var(--reg-on-surface-variant)]" />
              <h2 className="mt-4 text-title-large font-semibold">Menunggu persetujuan</h2>
              <p className="mt-3 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">
                Pendaftaran atas nama <span className="font-semibold">{registrasi.name}</span> sudah masuk dan
                sedang diperiksa panitia. Buka halaman ini lagi nanti — kode peserta muncul di sini begitu
                pendaftarannya disetujui.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
