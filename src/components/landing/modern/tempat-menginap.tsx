import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import type { LandingSpeaker } from "@/lib/domain";
import { type AgendaPreview } from "@/lib/landing-agenda";
import { pembicaraSesi } from "@/lib/landing-speaker-tabs";
import { LANDING_UI, labelTautanPeta, type LandingLang } from "@/lib/landing-i18n";
import { type EventTimeZone } from "@/lib/timezone";
import { type LandingHotel } from "@/lib/landing-hotel";
import { HEAD, JUDUL, MUTED, PIL_GARIS } from "./styles";
import { waktuInap } from "../event-landing-modern";
import { ALIS } from "./bagian-modern";

/**
 * Bagian "Tempat menginap" gaya gathering: hotel dari Logistik, dengan jam
 * check-in/out. Satu hotel: peta tersemat di kanan, sama
 * dengan Lokasi. Dua hotel atau lebih: tiap hotel jadi kartu dengan petanya
 * sendiri, supaya tamu tidak menebak peta itu milik hotel yang mana.
 * Nomor kamar dan teman sekamar TIDAK di sini; itu milik Dashboard saya.
 */
export function TempatMenginap({ hotels, zona, lang }: { hotels: LandingHotel[]; zona: EventTimeZone; lang: LandingLang }) {
  const t = LANDING_UI[lang];
  const judul = (
    <div className="flex flex-col gap-3">
      <p className={ALIS}>{t.hotelEyebrow}</p>
      <h2 className={JUDUL}>{t.hotelHeading}</h2>
    </div>
  );
  if (hotels.length > 1) {
    return (
      <div className="flex flex-col gap-8 sm:gap-10">
        {judul}
        <ul className={`grid gap-6 lg:grid-cols-2 lg:gap-8 ${hotels.length === 3 ? "xl:grid-cols-3" : ""}`}>
          {hotels.map((hotel) => (
            <li key={hotel.id} className="flex flex-col overflow-hidden rounded-lg bg-[var(--reg-panel)] [box-shadow:inset_0_0_0_1px_var(--garis-kartu,transparent)]">
              <PetaHotel hotel={hotel} lang={lang} className="h-48 sm:h-56" />
              <div className="flex flex-1 flex-col items-start gap-5 p-5 sm:p-7">
                <InfoHotel hotel={hotel} zona={zona} lang={lang} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const utama = hotels[0];
  return (
    <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-20">
      <div className="flex max-w-[572px] flex-col gap-8 sm:gap-10">
        {judul}
        <div className="flex flex-col items-start gap-5">
          <InfoHotel hotel={utama} zona={zona} lang={lang} />
        </div>
      </div>
      <PetaHotel hotel={utama} lang={lang} className="rounded-lg [aspect-ratio:4/3] sm:[aspect-ratio:625/460]" />
    </div>
  );
}

function InfoHotel({ hotel, zona, lang }: { hotel: LandingHotel; zona: EventTimeZone; lang: LandingLang }) {
  const t = LANDING_UI[lang];
  const masuk = waktuInap(hotel.check_in_at, zona, lang);
  const keluar = waktuInap(hotel.check_out_at, zona, lang);
  const petaUrl = hotel.map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([hotel.name, hotel.address].filter(Boolean).join(", "))}`;
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h3 className={`${HEAD} text-[24px] font-semibold leading-tight [overflow-wrap:anywhere]`}>{hotel.name}</h3>
        {hotel.address ? <p className={`whitespace-pre-line text-isi [overflow-wrap:anywhere] ${MUTED}`}>{hotel.address}</p> : null}
      </div>
      {masuk || keluar ? (
        <dl className="grid w-full grid-cols-[120px_minmax(0,1fr)] gap-y-2.5 text-isi">
          {masuk ? (
            <>
              <dt className={MUTED}>{t.checkIn}</dt>
              <dd className="font-medium tabular-nums">{masuk}</dd>
            </>
          ) : null}
          {keluar ? (
            <>
              <dt className={MUTED}>{t.checkOut}</dt>
              <dd className="font-medium tabular-nums">{keluar}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
      <a href={petaUrl} target="_blank" rel="noreferrer noopener" className={`${PIL_GARIS} mt-auto`}>
        {labelTautanPeta(petaUrl, lang)}
        <ArrowUpRight size={16} weight="bold" aria-hidden />
      </a>
    </>
  );
}

/** Peta tersemat dari nama dan alamat hotel (tanpa kunci API), dimuat malas. */
function PetaHotel({ hotel, lang, className }: { hotel: LandingHotel; lang: LandingLang; className: string }) {
  const kueri = [hotel.name, hotel.address].filter(Boolean).join(", ");
  return (
    <div className={`overflow-hidden bg-[var(--reg-panel)] ${className}`}>
      <iframe
        title={LANDING_UI[lang].mapOf(hotel.name)}
        src={`https://www.google.com/maps?q=${encodeURIComponent(kueri)}&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="size-full border-0"
      />
    </div>
  );
}

/**
 * Pembicara untuk daftar di bawah judul sesi: hanya yang dipasangkan ke baris
 * agenda publik bukan jeda, dengan kolom yang dipakai daftar itu saja. Tautan
 * sesinya pun dibatasi ke baris yang tampil, supaya label sesi draf tidak bocor.
 */
export function pembicaraDiAgenda(speakers: LandingSpeaker[], agenda: AgendaPreview[]): LandingSpeaker[] {
  const baris = agenda.flatMap((bagian) => bagian.items).filter((item) => !item.jeda);
  const tampil = new Set(baris.flatMap((item) => pembicaraSesiAsli(speakers, item)));
  const ids = new Set(baris.map((item) => item.id));
  return speakers
    .filter((speaker) => tampil.has(speaker))
    .map((speaker) => {
      const ringkas: LandingSpeaker = { name: speaker.name };
      if (speaker.title) ringkas.title = speaker.title;
      if (speaker.company) ringkas.company = speaker.company;
      if (speaker.role) ringkas.role = speaker.role;
      if (speaker.role_id) ringkas.role_id = speaker.role_id;
      if (speaker.photo_url) ringkas.photo_url = speaker.photo_url;
      if (speaker.session_refs) {
        ringkas.session_refs = speaker.session_refs
          .filter((ref) => ids.has(ref.id))
          .map(({ id, label, role, role_id, pos }) => ({ id, label, ...(role ? { role } : {}), ...(role_id ? { role_id } : {}), ...(pos !== undefined ? { pos } : {}) }));
      } else if (speaker.session) {
        ringkas.session = speaker.session;
      }
      return ringkas;
    });
}

/** Pembicara asli (bukan salinan berperan) yang tampil di satu baris. */
function pembicaraSesiAsli(speakers: LandingSpeaker[], item: AgendaPreview["items"][number]): LandingSpeaker[] {
  return speakers.filter((speaker) => pembicaraSesi([speaker], item).length > 0);
}
