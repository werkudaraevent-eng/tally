import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarBlank,
  CalendarPlus,
  CaretDown,
  EnvelopeSimple,
  Headset,
  MapPin,
  Moon,
  Phone,
  WhatsappLogo,
} from "@phosphor-icons/react/dist/ssr";
import type { LandingSpeaker } from "@/lib/domain";
import { TeksKaya } from "@/components/landing/teks-kaya";
import { judulBersorot } from "./horizon";

/**
 * Halaman acara tema Gathering Trip (keputusan Mas 28 Okt 2026, mockup
 * acara.html): pola listing Airbnb. Hero KV, kotak fakta, satu kolom isi yang
 * ringkas, dan kartu Masuk yang menempel di kanan desktop (di ponsel bilah
 * bawah). Isi tetap dari CMS; yang tidak dipakai di sini hanya pilihan
 * tampilan per blok (layout FAQ, latar bagian), karena satu gaya itulah yang
 * membuat halaman pendek. Horizon klasik tidak memakai berkas ini.
 */

const TINTA = "#101E38";
const REDUP = "#526078";
const GARIS = "rgb(16 30 56 / 0.12)";
const KARTU = "rounded-[16px] bg-white shadow-[inset_0_0_0_1px_rgb(16_30_56/0.12)]";
const TOMBOL_EMAS =
  "m3-state inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--hz-emas)] px-5 text-[14px] font-bold text-[var(--hz-on-emas)] [--m3-state-color:var(--hz-on-emas)]";
const TOMBOL_GARIS = "m3-state inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-[14px] font-semibold shadow-[inset_0_0_0_1px_rgb(16_30_56/0.24)]";
const TOMBOL_NAVY = "m3-state inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--hz-navy)] px-5 text-[14px] font-semibold text-white [--m3-state-color:#fff]";
const TAUTAN =
  "-my-3.5 inline-flex min-h-12 items-center gap-1 self-start text-[14px] font-semibold leading-5 underline decoration-[var(--hz-emas)] decoration-2 underline-offset-[5px]";

export type FaktaTrip = { jenis: "tanggal" | "tempat" | "lama"; teks: string };
const IKON_FAKTA = { tanggal: CalendarBlank, tempat: MapPin, lama: Moon } as const;

function Ubin({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-[12px]" style={{ background: "#EEF1F6", color: TINTA }}>
      {children}
    </span>
  );
}

/** Hero: KV dari CMS di belakang judul, navy di bawahnya; kotak fakta di ponsel. */
export function HeroTrip({ alis, judul, catatan, kv, fakta }: { alis: string | null; judul: string; catatan: string | null; kv: string | null; fakta: FaktaTrip[] }) {
  return (
    <>
      <header data-bagian="pembuka" data-landing-hero className="relative isolate -mt-[var(--nav-h)] flex min-h-[calc(125vw)] flex-col justify-end overflow-hidden bg-[var(--hz-navy)] text-white sm:min-h-[560px] lg:min-h-[480px]">
        {kv ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img data-sunting="pembuka:hero_bg_url" src={kv} alt="" aria-hidden decoding="async" className="pointer-events-none absolute inset-0 -z-20 size-full select-none object-cover" />
        ) : null}
        <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(16_30_56/0)_30%,rgb(16_30_56/0.88)_100%)]" />
        <div data-sunting="pembuka" className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-4 pb-[72px] pt-[calc(var(--nav-h)+24px)] sm:px-8 lg:pb-14">
          {alis ? (
            <p data-sunting="pembuka:hero_eyebrow" className="text-[14px] font-semibold leading-5 text-[var(--hz-sorot,var(--hz-emas))]">
              {alis}
            </p>
          ) : null}
          <h1 data-sunting="pembuka:tagline" className="max-w-[16ch] whitespace-pre-line text-balance text-[40px] font-extrabold leading-[48px] tracking-[-0.02em] [overflow-wrap:anywhere] lg:max-w-[20ch] lg:text-[57px] lg:leading-[64px]">
            {judulBersorot(judul)}
          </h1>
          {catatan ? (
            <p data-sunting="pembuka:hero_note" className="max-w-[520px] whitespace-pre-line text-[16px] leading-6 text-white/85">
              {catatan}
            </p>
          ) : null}
        </div>
      </header>
      {fakta.length > 0 ? (
        <div className="relative z-[1] -mt-12 px-4 sm:px-8 lg:hidden">
          <ul className={`${KARTU} grid`} style={{ gridTemplateColumns: `repeat(${fakta.length}, minmax(0, 1fr))`, color: TINTA }}>
            {fakta.map((item, index) => {
              const Ikon = IKON_FAKTA[item.jenis];
              return (
                <li key={item.jenis} className="flex min-w-0 flex-col items-start gap-1 p-3" style={index > 0 ? { borderLeft: `1px solid ${GARIS}` } : undefined}>
                  <Ikon size={18} aria-hidden style={{ color: REDUP }} />
                  <span className="text-[14px] font-semibold leading-5 [overflow-wrap:anywhere]">{item.teks}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </>
  );
}

/**
 * Kerangka isi: satu kolom di ponsel; desktop 7/4 dengan kartu Masuk yang
 * menempel dan naik menumpang tepi bawah hero.
 */
export function TataTrip({ isi, samping }: { isi: ReactNode; samping: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 sm:px-8 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:items-start lg:gap-12">
      <div data-trip-kolom className="min-w-0" style={{ color: TINTA }}>
        {isi}
      </div>
      {samping ? <div className="sticky top-24 -mt-24 hidden lg:block">{samping}</div> : null}
    </div>
  );
}

/** Satu bagian: judul 24/32 dan jarak 40 px dari bagian sebelumnya. */
export function BagianTrip({ id, judul, children, sunting }: { id: string; judul: string | null; children: ReactNode; sunting?: string }) {
  return (
    <section id={id} className="scroll-mt-[96px] pt-10">
      {judul ? (
        <h2 data-sunting={sunting} className="mb-4 whitespace-pre-line text-[24px] font-bold leading-8 tracking-[-0.01em]">
          {judul}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

export function TentangTrip({ judul, isi, foto }: { judul: string; isi: string | null; foto: { src: string; alt: string } | null }) {
  return (
    <BagianTrip id="about" judul={judul}>
      <div className="flex flex-col gap-4">
        {isi ? <TeksKaya teks={isi} className="max-w-[65ch] whitespace-pre-line text-[16px] leading-6" warna={TINTA} /> : null}
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto.src} alt={foto.alt} loading="lazy" className="aspect-[16/9] w-full rounded-[16px] object-cover" />
        ) : null}
      </div>
    </BagianTrip>
  );
}

export function PembicaraTrip({ judul, orang }: { judul: string; orang: LandingSpeaker[] }) {
  return (
    <BagianTrip id="speakers" judul={judul}>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
        {orang.map((item, index) => {
          const ket = [item.title, item.company].filter(Boolean).join(" · ");
          return (
            <li key={`${item.name}-${index}`} className="flex w-40 shrink-0 snap-start flex-col gap-2 lg:w-auto">
              {item.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.photo_url} alt="" loading="lazy" className="aspect-[4/5] w-full rounded-[12px] object-cover" style={{ background: "#EEF1F6" }} />
              ) : (
                <span aria-hidden className="flex aspect-[4/5] w-full items-end rounded-[12px] bg-[linear-gradient(160deg,#E8C968,#C98F3A)] p-3 text-[24px] font-bold text-[#101E38]">
                  {item.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((kata) => kata[0])
                    .join("")
                    .toUpperCase()}
                </span>
              )}
              <div className="flex flex-col">
                <span className="text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]">{item.name}</span>
                {ket ? (
                  <span className="text-[14px] leading-5 [overflow-wrap:anywhere]" style={{ color: REDUP }}>
                    {ket}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </BagianTrip>
  );
}

export function LokasiTrip({
  judul,
  nama,
  alamat,
  petaKueri,
  petaJudul,
  peta,
  kalender,
  kursi,
}: {
  judul: string;
  nama: string | null;
  alamat: string | null;
  petaKueri: string;
  petaJudul: string;
  peta: { href: string; label: string } | null;
  kalender: { href: string; label: string } | null;
  kursi: { href: string; label: string };
}) {
  return (
    <BagianTrip id="venue" judul={judul}>
      <div className="flex flex-col gap-4">
        {petaKueri ? (
          <div className="h-[180px] overflow-hidden rounded-[12px] lg:h-[240px]" style={{ background: "#EEF1F6" }}>
            <iframe title={petaJudul} src={`https://www.google.com/maps?q=${encodeURIComponent(petaKueri)}&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="size-full border-0" />
          </div>
        ) : null}
        {nama || alamat ? (
          <div className="flex flex-col gap-1">
            {nama ? <p className="text-[16px] font-semibold leading-6">{nama}</p> : null}
            {alamat ? (
              <p className="whitespace-pre-line text-[14px] leading-5" style={{ color: REDUP }}>
                {alamat}
              </p>
            ) : null}
          </div>
        ) : null}
        {peta || kalender ? (
          <div className="flex flex-wrap gap-2">
            {peta ? (
              <a href={peta.href} target="_blank" rel="noreferrer noopener" className={TOMBOL_NAVY}>
                {peta.label}
                <ArrowUpRight size={16} weight="bold" aria-hidden />
              </a>
            ) : null}
            {kalender ? (
              <a href={kalender.href} className={TOMBOL_GARIS}>
                <CalendarPlus size={18} aria-hidden />
                {kalender.label}
              </a>
            ) : null}
          </div>
        ) : null}
        <Link href={kursi.href} className={TAUTAN}>
          {kursi.label}
          <ArrowRight size={16} weight="bold" aria-hidden />
        </Link>
      </div>
    </BagianTrip>
  );
}

export function FaqTrip({ judul, pengantar, butir }: { judul: string; pengantar: ReactNode; butir: { q: string; a: string }[] }) {
  return (
    <BagianTrip id="faq" judul={judul}>
      {pengantar ? (
        <p className="mb-4 text-[14px] leading-5" style={{ color: REDUP }}>
          {pengantar}
        </p>
      ) : null}
      <div className={`${KARTU} px-4`}>
        {butir.map((item, index) => (
          <details key={`${item.q}-${index}`} className="group" style={index > 0 ? { borderTop: `1px solid ${GARIS}` } : undefined}>
            <summary className="m3-state -mx-4 flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-[16px] font-semibold leading-6 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 [overflow-wrap:anywhere]">{item.q}</span>
              <CaretDown size={20} aria-hidden className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" style={{ color: REDUP }} />
            </summary>
            <p className="max-w-[65ch] whitespace-pre-line pb-4 text-[14px] leading-5" style={{ color: REDUP }}>
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </BagianTrip>
  );
}

export type KontakTrip = { nama: string | null; peran: string | null; nomor: string | null; email: string | null; tel: string | null; wa: string | null };

export function KontakPanitiaTrip({ judul, pengantar, kontak, label }: { judul: string; pengantar: string; kontak: KontakTrip[]; label: { wa: string; tel: string; email: string } }) {
  return (
    <BagianTrip id="contact" judul={judul}>
      <p className="mb-4 text-[14px] leading-5" style={{ color: REDUP }}>
        {pengantar}
      </p>
      <ul className={`${KARTU} px-4`}>
        {kontak.map((item, index) => {
          const siapa = item.nama ?? item.nomor ?? item.email ?? "";
          return (
            <li key={index} className="flex items-center gap-3 py-3" style={index > 0 ? { borderTop: `1px solid ${GARIS}` } : undefined}>
              <Ubin>
                <Headset size={20} />
              </Ubin>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]">{item.nama ?? item.nomor ?? item.email}</span>
                {item.peran || (item.nama && item.nomor) ? (
                  <span className="text-[14px] leading-5 [overflow-wrap:anywhere]" style={{ color: REDUP }}>
                    {[item.peran, item.nama ? item.nomor : null].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </div>
              <div className="-mr-1 flex shrink-0">
                {item.tel ? (
                  <a href={`tel:${item.tel}`} aria-label={`${label.tel} ${siapa}`.trim()} className="m3-state flex size-12 items-center justify-center rounded-full">
                    <Phone size={20} aria-hidden />
                  </a>
                ) : null}
                {item.wa ? (
                  <a href={item.wa} target="_blank" rel="noreferrer noopener" aria-label={`${label.wa} ${siapa}`.trim()} className="m3-state flex size-12 items-center justify-center rounded-full" style={{ color: "#1E7B45" }}>
                    <WhatsappLogo size={22} aria-hidden />
                  </a>
                ) : null}
                {item.email ? (
                  <a href={`mailto:${item.email}`} aria-label={`${label.email} ${siapa}`.trim()} className="m3-state flex size-12 items-center justify-center rounded-full">
                    <EnvelopeSimple size={20} aria-hidden />
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </BagianTrip>
  );
}

/** Bagian portal (Dashboard) versi ringkas: hanya di ponsel, desktop memakai kartu samping. */
export function PortalTrip({ judul, catatan, aksi }: { judul: string; catatan: string | null; aksi: { href: string; label: string } | null }) {
  return (
    <section data-bagian="portal" className="pt-10 lg:hidden">
      <div className={`${KARTU} flex flex-col gap-3 p-4`}>
        <h2 className="whitespace-pre-line text-[22px] font-bold leading-7">{judul}</h2>
        {catatan ? (
          <p className="text-[14px] leading-5" style={{ color: REDUP }}>
            {catatan}
          </p>
        ) : null}
        {aksi ? (
          <Link href={aksi.href} className={`${TOMBOL_EMAS} mt-1 w-full`}>
            {aksi.label}
            <ArrowRight size={16} weight="bold" aria-hidden />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/** Kartu Masuk yang menempel di kanan desktop (pola kartu "Reserve" Airbnb). */
export function KartuMasukTrip({
  judul,
  hitung,
  tanggal,
  tanggalSub,
  tempat,
  aksi,
  kalender,
  catatan,
}: {
  judul: string;
  hitung: string | null;
  tanggal: string | null;
  tanggalSub: string | null;
  tempat: string | null;
  aksi: { href: string; label: string } | null;
  kalender: { href: string; label: string } | null;
  catatan: string | null;
}) {
  return (
    <aside className={`${KARTU} flex flex-col gap-4 p-6 shadow-[inset_0_0_0_1px_rgb(16_30_56/0.12),0_8px_24px_rgb(16_30_56/0.08)]`} style={{ color: TINTA }}>
      <div className="flex flex-col gap-2">
        {hitung ? (
          <span className="inline-flex min-h-6 items-center self-start rounded-full px-2 text-[12px] font-semibold leading-4" style={{ background: "#FBF3D9", color: "#6B4F00" }}>
            {hitung}
          </span>
        ) : null}
        <p className="text-[22px] font-bold leading-7 [overflow-wrap:anywhere]">{judul}</p>
      </div>
      {tanggal ? (
        <div className="flex items-center gap-3">
          <Ubin>
            <CalendarBlank size={20} />
          </Ubin>
          <div className="flex min-w-0 flex-col">
            <span className="text-[14px] font-semibold leading-5">{tanggal}</span>
            {tanggalSub ? (
              <span className="text-[12px] leading-4" style={{ color: REDUP }}>
                {tanggalSub}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {tempat ? (
        <div className="flex items-center gap-3">
          <Ubin>
            <MapPin size={20} />
          </Ubin>
          <span className="min-w-0 text-[14px] font-semibold leading-5 [overflow-wrap:anywhere]">{tempat}</span>
        </div>
      ) : null}
      {aksi ? (
        <Link href={aksi.href} className={`${TOMBOL_EMAS} w-full`}>
          {aksi.label}
          <ArrowRight size={16} weight="bold" aria-hidden />
        </Link>
      ) : null}
      {kalender ? (
        <a href={kalender.href} className={`${TOMBOL_GARIS} w-full`}>
          <CalendarPlus size={18} aria-hidden />
          {kalender.label}
        </a>
      ) : null}
      {catatan ? (
        <p className="text-center text-[12px] leading-4" style={{ color: REDUP }}>
          {catatan}
        </p>
      ) : null}
    </aside>
  );
}

/** Kaki halaman Trip: nama acara dan catatan kaki CMS, tanpa pita navy. */
export function KakiTrip({ nama, catatan }: { nama: string; catatan: string | null }) {
  return (
    <footer data-bagian="kaki" className="mx-auto flex w-full max-w-[1200px] flex-col gap-1 px-4 py-8 sm:px-8" style={{ borderTop: `1px solid ${GARIS}`, color: REDUP }}>
      <p className="text-[14px] font-semibold leading-5" style={{ color: TINTA }}>
        {nama}
      </p>
      {catatan ? <p className="whitespace-pre-line text-[12px] leading-4">{catatan}</p> : null}
    </footer>
  );
}
