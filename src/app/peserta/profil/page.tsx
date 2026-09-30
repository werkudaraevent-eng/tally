import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Avatar, MemberShell } from "@/components/member/member-shell";
import { getPublicPageEvent } from "@/lib/auth/request-event";
import { getMemberSession, memberConfig } from "@/lib/member/account";
import { loadMemberLogistics } from "@/lib/member/logistics";
import { memberPageStyle } from "@/lib/member/page-theme";
import { formatJam, formatMoment } from "@/lib/member/schedule";
import { normalizeTimeZone } from "@/lib/timezone";

/**
 * Area peserta, Profil: `/e/<slug>/peserta/profil`. Desain Figma 21:2 dan
 * 22:126.
 *
 * Semuanya hanya baca. Data diri berasal dari formulir pendaftaran dan
 * logistik diatur panitia; peserta yang ingin mengubahnya menghubungi panitia.
 * Ukuran baju juga hanya baca: ukurannya bagian dari data peserta (kolom
 * formulir), dan belum ada jalur yang aman bagi peserta untuk menyuntingnya
 * setelah panitia memesan ke vendor.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Profil peserta", robots: { index: false, follow: false } };

const MUTED = "text-[var(--reg-on-surface-variant)]";
const HEAD = "[font-family:var(--landing-heading)]";

export default async function ProfilPesertaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const event = await getPublicPageEvent(searchParams);
  if (!event || event.status === "archived") notFound();
  const member = memberConfig(event);
  if (!member) notFound();
  const sesi = await getMemberSession(event);
  if (!sesi) redirect(`/e/${event.slug}/masuk`);

  const peserta = sesi.participant;
  const zona = normalizeTimeZone(event.time_zone);
  const { lodging, transport, items } = await loadMemberLogistics(event.id, peserta.id);
  const kursi = member.show_seat !== false ? (peserta.seats ?? []).filter((seat) => seat.label?.trim()) : [];

  const baris: { label: string; isi: ReactNode }[] = [];
  if (lodging) {
    if (lodging.hotel.name) baris.push({ label: "Hotel", isi: lodging.hotel.name });
    const kamar = [lodging.room_number, lodging.floor ? `lantai ${lodging.floor}` : null, lodging.room_type]
      .filter(Boolean)
      .join(" · ");
    if (kamar) baris.push({ label: "Kamar", isi: kamar });
    if (lodging.roommates && lodging.roommates.length > 0) {
      baris.push({
        label: "Teman sekamar",
        isi: (
          <ul className="flex flex-col gap-3">
            {lodging.roommates.map((orang) => (
              <li key={`${orang.name}-${orang.company}`} className="flex items-center gap-3">
                <Avatar name={orang.name} size="sm" />
                <span className="min-w-0">
                  <span className="block font-medium">{orang.name}</span>
                  {orang.company ? <span className={`block text-body-small ${MUTED}`}>{orang.company}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ),
      });
    }
    const masuk = formatMoment(lodging.check_in_at, zona, true);
    const keluar = formatMoment(lodging.check_out_at, zona, true);
    if (masuk || keluar) baris.push({ label: "Check-in / out", isi: [masuk, keluar].filter(Boolean).join(" · ") });
  }
  if (transport) {
    if (transport.default_bus) baris.push({ label: "Bus", isi: transport.default_bus });
    for (const trip of transport.trips) {
      const jam = formatJam(trip.depart_at, zona);
      const dari = trip.meeting_point || trip.origin;
      baris.push({
        label: trip.name,
        isi: [trip.bus, jam ? `berangkat ${jam}` : null, dari ? `dari ${dari}` : null].filter(Boolean).join(" · "),
      });
    }
  }
  for (const seat of kursi) {
    baris.push({ label: seat.subEventName?.trim() || "Tempat duduk", isi: seat.label });
  }

  const dataDiri = [
    { label: "Nama lengkap", isi: peserta.name },
    { label: "Email", isi: peserta.email },
    { label: "Telepon", isi: peserta.phone },
    { label: "Perusahaan", isi: peserta.company },
    { label: "Jabatan", isi: peserta.title },
  ].filter((row) => row.isi?.trim());

  const jabatan = [peserta.title, peserta.company].filter(Boolean) as string[];

  return (
    <main className="min-h-dvh bg-[var(--reg-surface)] text-[var(--reg-on-surface)]" style={memberPageStyle(event)}>
      <MemberShell
        slug={event.slug}
        eventName={event.name}
        personName={peserta.name}
        active="profil"
        showVote={member.show_vote !== false}
      >
        <div className="mx-auto grid w-full max-w-[1440px] gap-4 px-5 py-6 sm:px-8 lg:grid-cols-12 lg:gap-6 lg:px-20 lg:py-12">
          <section
            aria-label="Profil"
            className="flex flex-col items-center rounded-2xl bg-[var(--reg-panel)] p-7 text-center lg:sticky lg:top-28 lg:col-span-4 lg:self-start lg:p-10"
          >
            <Avatar name={peserta.name} size="lg" />
            <h1 className={`mt-5 text-balance text-[26px] font-semibold leading-tight sm:text-[32px] ${HEAD}`}>
              {peserta.name}
            </h1>
            {jabatan.map((line) => (
              <p key={line} className={`mt-1 text-body-medium ${MUTED}`}>
                {line}
              </p>
            ))}
            {peserta.rsvp_status === "confirmed" || peserta.participant_type?.trim() ? (
              <ul className="mt-4 flex flex-wrap justify-center gap-2">
                {peserta.rsvp_status === "confirmed" ? (
                  <li className="inline-flex items-center gap-2 rounded-full bg-[var(--reg-primary-container)] px-3 py-1 text-label-medium font-semibold text-[var(--reg-on-primary-container)]">
                    <span aria-hidden className="size-1.5 rounded-full bg-current" />
                    Konfirmasi hadir
                  </li>
                ) : null}
                {peserta.participant_type?.trim() ? (
                  <li className="rounded-full border border-[var(--reg-outline)] px-3 py-1 text-label-medium font-semibold">
                    {peserta.participant_type}
                  </li>
                ) : null}
              </ul>
            ) : null}
            {member.show_code !== false ? (
              <div className="mt-6 w-full border-t border-[var(--reg-outline-variant)] pt-5">
                <p className={`text-body-small ${MUTED}`}>Kode peserta</p>
                <p className="mt-1 select-all font-mono text-title-large font-semibold tracking-[0.08em]">{peserta.qr_code}</p>
              </div>
            ) : null}
          </section>

          <div className="flex flex-col gap-4 lg:col-span-8 lg:gap-6">
            <Bagian judul="Data diri" catatan="Dari formulir pendaftaran. Untuk mengubahnya, hubungi panitia.">
              <DaftarBaris baris={dataDiri} />
            </Bagian>

            {baris.length > 0 ? (
              <Bagian
                judul="Akomodasi & transportasi"
                catatan="Diatur panitia. Hubungi panitia bila ada yang perlu diubah."
              >
                <DaftarBaris baris={baris} />
              </Bagian>
            ) : null}

            {items.length > 0 ? (
              <Bagian judul="Barang acara" catatan="Diambil di meja registrasi dengan menunjukkan kode QR.">
                <DaftarBaris
                  baris={items.map((item) => {
                    const diambil = formatMoment(item.picked_up_at, zona);
                    return {
                      label: item.name,
                      isi: [item.size ? `Ukuran ${item.size}` : null, diambil ? `sudah diambil ${diambil}` : "belum diambil"]
                        .filter(Boolean)
                        .join(" · "),
                    };
                  })}
                />
              </Bagian>
            ) : null}

            <Bagian judul="Akun" catatan={`Masuk dengan ${sesi.email}`}>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={`/e/${event.slug}/masuk?mode=aktifkan&ganti=1`}
                  className="m3-state inline-flex min-h-11 items-center rounded-full border border-[var(--reg-on-surface)] px-5 text-label-large font-semibold"
                >
                  Ganti kata sandi
                </Link>
                <form method="post" action={`/e/${event.slug}/api/peserta/keluar`}>
                  <button
                    type="submit"
                    className="m3-state inline-flex min-h-11 items-center rounded-full border border-[var(--reg-error)] px-5 text-label-large font-semibold text-[var(--reg-error)]"
                  >
                    Keluar
                  </button>
                </form>
              </div>
            </Bagian>
          </div>
        </div>
      </MemberShell>
    </main>
  );
}

function Bagian({ judul, catatan, children }: { judul: string; catatan: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--reg-outline-variant)] p-6 sm:p-8">
      <h2 className="text-title-large font-semibold">{judul}</h2>
      <p className={`mt-1 text-body-medium ${MUTED}`}>{catatan}</p>
      {children}
    </section>
  );
}

function DaftarBaris({ baris }: { baris: { label: string; isi: ReactNode }[] }) {
  return (
    <dl className="mt-5 divide-y divide-[var(--reg-outline-variant)] border-t border-[var(--reg-outline-variant)]">
      {baris.map((row, index) => (
        <div key={`${row.label}-${index}`} className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
          <dt className={`text-body-medium ${MUTED}`}>{row.label}</dt>
          <dd className="min-w-0 break-words text-body-large font-medium">{row.isi}</dd>
        </div>
      ))}
    </dl>
  );
}
