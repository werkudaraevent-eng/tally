import { getPublicPageEvent } from "@/lib/auth/request-event";
import { publicEventName, type EventLandingConfig } from "@/lib/domain";
import { redirect } from "next/navigation";
import { DAFTAR_UI } from "@/lib/daftar-i18n";
import { landingDefaultLang, landingEnAvailable, withQuery, type LandingLang } from "@/lib/landing-i18n";
import type { Metadata } from "next";
import { isiDaftar, Pesan } from "./isi-daftar";

// Sama alasannya dengan /display: tanpa ini Next.js mem-prerender halaman saat
// build, dan nama acara membeku pada event yang kebetulan aktif saat itu.
export const dynamic = "force-dynamic";

type Kueri = Promise<Record<string, string | string[] | undefined>>;

/** `bahasa` diisi src/proxy.ts dari `/e/<slug>/en/daftar` atau `/id/daftar`. */
function bahasaDiminta(kueri: Record<string, string | string[] | undefined>): LandingLang | null {
  return kueri.bahasa === "en" || kueri.bahasa === "id" ? kueri.bahasa : null;
}

export async function generateMetadata({ searchParams }: { searchParams: Kueri }): Promise<Metadata> {
  const kueri = await searchParams;
  const event = await getPublicPageEvent(searchParams);
  const minta = bahasaDiminta(kueri);
  if (!event) return { title: DAFTAR_UI[minta ?? "id"].notFoundTitle, robots: { index: false } };
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const utama = landingDefaultLang(landing);
  // Sama dengan halaman di bawah: alamat bahasa lain yang tidak berlaku dialihkan.
  const lang = minta && minta !== utama && landingEnAvailable(landing) ? minta : utama;
  const judul = `${DAFTAR_UI[lang].registration} · ${publicEventName(event)}`;
  const deskripsi = lang === "en" ? `Register for ${publicEventName(event)}.` : `Pendaftaran peserta ${publicEventName(event)}.`;
  return {
    title: judul,
    description: deskripsi,
    openGraph: { title: judul, description: deskripsi, locale: lang === "en" ? "en_GB" : "id_ID" },
  };
}

export default async function DaftarPage({
  searchParams,
}: {
  searchParams: Kueri;
}) {
  const kueri = await searchParams;
  const event = await getPublicPageEvent(searchParams);
  const minta = bahasaDiminta(kueri);

  // Tiga keadaan yang harus DIBEDAKAN, karena tindak lanjutnya berbeda:
  // tidak ada event (tautannya salah), pendaftaran ditutup (tautannya benar,
  // waktunya lewat), dan siap menerima. Digabung jadi satu pesan, orang yang
  // mengetik alamat dengan benar akan mengira dirinya salah alamat.
  if (!event) {
    const t = DAFTAR_UI[minta ?? "id"];
    return <Pesan lang={minta ?? "id"} judul={t.notFoundTitle} isi={t.notFoundBody} />;
  }

  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  // Bahasa mengikuti halaman acara: bahasa utama di `/e/<slug>/daftar`, bahasa
  // lain di `/en/daftar` atau `/id/daftar`. Alamat bahasa lain yang tidak
  // berlaku (English mati, atau ia bahasa utama) dialihkan ke alamat utama,
  // dengan kueri asalnya, sama dengan /e/<slug>/en.
  const utama = landingDefaultLang(landing);
  if (minta && (minta === utama || !landingEnAvailable(landing))) {
    const sisa = Object.fromEntries(Object.entries(kueri).filter(([kunci]) => kunci !== "eventSlug" && kunci !== "bahasa"));
    redirect(withQuery(`/e/${event.slug}/daftar`, sisa));
  }
  return isiDaftar(event, minta ?? utama);
}
