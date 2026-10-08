import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Bed, Bus, Heart, Lightning, MapPin, Megaphone, Ticket, Users } from "@phosphor-icons/react/dist/ssr";
import type { AgendaPreview } from "@/lib/landing-agenda";
import { LANDING_UI, type LandingLang } from "@/lib/landing-i18n";
import { HEAD, LABEL_BAGIAN, SHELL } from "./styles";

/**
 * Gaya gathering bergaya aplikasi (rancangan pen.dev Hanung, 2026-10-07):
 * hero navy terbelah dengan pratinjau portal di kanan, bagian Portal peserta,
 * dan pita penutup selebar layar. Warna tombol dari Tema (`button_color`),
 * kata berbintang di tagline memakai warna aksen.
 *
 * Hanya halaman acara gaya gathering yang memakai berkas ini; acara lain tidak
 * menyentuhnya.
 */

/** Tombol utama gaya gathering: warna tombol dari Tema, 14/700, 49px seperti rancangan (min. 48). */
export const TOMBOL_AKSI =
  "m3-state inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--aksi)] px-8 py-4 text-[14px] font-bold leading-[1.2] text-[var(--on-aksi)]";
const TOMBOL_GARIS =
  "m3-state inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--ink)_35%,transparent)] px-[30px] py-[15px] text-[14px] font-bold leading-[1.2] text-[var(--ink)]";

/**
 * Latar hero dan pita penutup: `--latar-gathering` dari latarGathering()
 * (gradasi rancangan untuk merek gelap). Cadangannya gradasi lama.
 */
const LATAR_HERO =
  "var(--latar-gathering, linear-gradient(160deg, color-mix(in srgb, var(--reg-brand) 62%, black) 0%, color-mix(in srgb, var(--reg-brand) 85%, black) 60%, var(--reg-brand) 100%))";
/** Teks redup di atas navy (#C6D2E8 di rancangan). */
const REDUP = "text-[var(--hero-redup,color-mix(in_srgb,var(--ink)_80%,transparent))]";

/** "Liburan bareng, *tumbuh* bareng." menjadi teks dengan kata berbintang berwarna aksen. */
export function judulBerbintang(teks: string): ReactNode[] {
  return teks.split(/(\*[^*\n]+\*)/g).filter(Boolean).map((bagian, index) =>
    /^\*[^*]+\*$/.test(bagian) ? (
      <span key={index} className="text-[var(--hero-angka)]">
        {bagian.slice(1, -1)}
      </span>
    ) : (
      bagian
    ),
  );
}

export { tanpaBintang } from "@/lib/landing-tagline";

type Aksi = { href: string; label: string; link?: boolean };

export function HeroGathering({
  alis,
  judul,
  catatan,
  fakta,
  aksi,
  aksiKedua,
  pratinjau,
  gaya,
}: {
  alis: string | null;
  judul: string;
  catatan: string | null;
  /** Fakta di bawah tombol; yang pertama (tanggal) berwarna aksen. */
  fakta: string[];
  aksi: Aksi | null;
  aksiKedua: Aksi | null;
  pratinjau: ReactNode;
  gaya: CSSProperties;
}) {
  return (
    <header
      data-bagian="pembuka"
      data-landing-hero
      // Ditarik ke bawah bilah atas seperti hero Modern, supaya bilah yang
      // dibuat tembus pandang di CMS tetap berdiri di atas gradasi.
      className="relative isolate -mt-[var(--nav-h)] text-[var(--ink)]"
      style={{ ...gaya, background: LATAR_HERO }}
    >
      <div className={`${SHELL} grid items-center gap-10 pb-14 pt-[calc(var(--nav-h)+56px)] lg:grid-cols-[minmax(0,1fr)_270px] lg:pb-[90px] lg:pt-[calc(var(--nav-h)+90px)]`}>
        <div className="flex min-w-0 flex-col items-start gap-6">
          {alis ? (
            <p className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--ink)_10%,transparent)] px-[18px] py-2 text-[12px] font-semibold uppercase leading-[1.2] tracking-[2px] text-[var(--hero-lencana,var(--hero-alis))]">
              {alis}
            </p>
          ) : null}
          <h1 className={`${HEAD} max-w-[760px] text-balance [overflow-wrap:anywhere] text-[40px] font-extrabold leading-[1.08] sm:text-[52px] lg:text-[62px] lg:leading-[1.05]`}>
            {judulBerbintang(judul)}
          </h1>
          {catatan ? <p className={`max-w-[1000px] whitespace-pre-line text-[16px] leading-[1.6] ${REDUP}`}>{catatan}</p> : null}
          {aksi || aksiKedua ? (
            <div className="flex w-full flex-col gap-3.5 sm:w-auto sm:flex-row sm:flex-wrap">
              {aksi ? <TautanAksi {...aksi} className={TOMBOL_AKSI} /> : null}
              {aksiKedua ? <TautanAksi {...aksiKedua} className={TOMBOL_GARIS} /> : null}
            </div>
          ) : null}
          {fakta.length > 0 ? (
            // Pemisah di kiri setiap butir; yang jatuh di awal baris (ponsel)
            // tersembunyi di luar tepi kiri yang dipotong.
            <div className="overflow-hidden">
              <ul className="-ml-[41px] flex flex-wrap items-center gap-y-2 text-[14px] leading-[1.2] tabular-nums">
                {fakta.map((teks, index) => (
                  <li
                    key={teks}
                    className={`flex items-center whitespace-nowrap before:mx-5 before:h-4 before:w-px before:bg-[color-mix(in_srgb,var(--ink)_20%,transparent)] before:content-[''] ${
                      index === 0 ? "font-extrabold text-[var(--hero-angka)]" : REDUP
                    }`}
                  >
                    {teks}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {pratinjau ? <div className="hidden lg:block">{pratinjau}</div> : null}
      </div>
    </header>
  );
}

function TautanAksi({ href, label, link, className }: Aksi & { className: string }) {
  return link ? (
    <Link href={href} className={className}>
      {label}
    </Link>
  ) : (
    <a href={href} className={className}>
      {label}
    </a>
  );
}

/**
 * Pratinjau portal di hero (layar lebar saja): gambaran isi area peserta,
 * tanpa data pribadi siapa pun. Agenda selanjutnya dari rundown; kamar dan
 * bus hanya disebut "setelah masuk". Ukuran dan teks mengikuti rancangan
 * (ponsel 270px); teks terkecil 12px.
 */
export function PratinjauPortal({
  agenda,
  logistik,
  lang,
}: {
  agenda: { judul: string; keterangan: string | null } | null;
  logistik: boolean;
  lang: LandingLang;
}) {
  const t = LANDING_UI[lang];
  const ubin = logistik ? [t.miniBus, t.miniRoom] : [t.portalTicket, t.portalNews];
  return (
    <div aria-hidden className="w-[270px] rounded-[36px] bg-[var(--reg-brand)] p-2.5 shadow-[0_30px_60px_rgb(0_0_0/0.35)]">
      <div className="overflow-hidden rounded-[28px] bg-[#F4F6F8] text-[#1A2333]">
        <div className="flex flex-col gap-1 px-3.5 pb-[26px] pt-[22px] text-white" style={{ background: "var(--latar-gathering-kartu, var(--reg-brand))" }}>
          <p className="text-[12px] leading-[1.2] text-[var(--hero-redup,rgb(255_255_255/0.8))]">{t.portalEyebrow}</p>
          <p className="truncate text-[16px] font-extrabold leading-[1.2]">{t.miniTitle}</p>
        </div>
        <div className="flex flex-col gap-2 px-2.5 pb-3.5 pt-2.5">
          {agenda ? (
            <div className="flex flex-col gap-1 rounded-xl bg-white p-3">
              <p className="text-[12px] font-extrabold uppercase leading-[1.2] tracking-[1px] text-[#5F6B7F]">{t.portalFirstUp}</p>
              <p className="truncate text-[14px] font-extrabold leading-[1.2]">{agenda.judul}</p>
              {agenda.keterangan ? <p className="truncate text-[12px] leading-[1.2] text-[#5A6A85]">{agenda.keterangan}</p> : null}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            {ubin.map((label) => (
              <div key={label} className="flex flex-col gap-0.5 rounded-xl bg-white px-2.5 py-3">
                <p className="truncate text-[12px] leading-[1.2] text-[#5F6B7F]">{label}</p>
                <p className="truncate text-[11px] font-extrabold leading-[1.2]">{t.portalAfterSignIn}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Agenda selanjutnya untuk pratinjau: butir pertama yang belum lewat (jam
 * acara), atau butir pertama hari pertama sebelum acara dan setelah acara.
 * Hari ini: "14.00 WIB · Lobby Utama"; hari lain: "Jum, 6 Nov · 09.00 WIB".
 * `hariIni` "YYYY-MM-DD" dan `jamSekarang` "HH:MM" di zona acara.
 */
export function agendaSelanjutnya(
  agenda: AgendaPreview[],
  lang: LandingLang,
  zona: string,
  hariIni: string,
  jamSekarang: string,
): { judul: string; keterangan: string | null } | null {
  const butir = agenda.flatMap((bagian) => bagian.items.filter((item) => !item.jeda).map((item) => ({ bagian, item })));
  if (butir.length === 0) return null;
  const berikut =
    butir.find(({ bagian, item }) => bagian.tanggal && (bagian.tanggal > hariIni || (bagian.tanggal === hariIni && item.time.replace(".", ":") >= jamSekarang))) ??
    butir[0];
  const { bagian, item } = berikut;
  const jam = item.time ? `${item.time} ${zona}`.trim() : null;
  if (bagian.tanggal === hariIni) {
    return { judul: item.title, keterangan: [jam, item.subtitle?.trim() || null].filter(Boolean).join(" · ") || null };
  }
  const hari = bagian.tanggal
    ? new Date(`${bagian.tanggal}T00:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    : null;
  return { judul: item.title, keterangan: [hari, jam].filter(Boolean).join(" · ") || null };
}

/**
 * Bagian Tentang acara gaya gathering (rancangan pen.dev): label, judul besar,
 * deskripsi bila diisi, lalu kartu berikon (Halaman acara > Tentang acara >
 * Cards). Ikon dan warnanya mengikuti urutan kartu: hijau, navy, emas.
 */
export function TentangGathering({
  alis,
  judul,
  deskripsi,
  kartu,
  gambar,
}: {
  alis: string | null;
  judul: string;
  deskripsi: string | null;
  kartu: { title: string; body: string }[];
  gambar: ReactNode;
}) {
  const IKON = [Users, MapPin, Lightning, Heart] as const;
  const NADA = [
    { latar: "var(--chip-aksi)", teks: "var(--on-chip-aksi)" },
    { latar: "var(--chip-merek)", teks: "var(--on-chip-merek)" },
    { latar: "var(--chip-aksen)", teks: "var(--on-chip-aksen)" },
  ];
  const isi = kartu.filter((item) => item.title?.trim());
  return (
    <section id="about" className="scroll-mt-[var(--nav-h)] py-14 lg:py-[90px]">
      <div className={`grid items-center gap-10 ${gambar ? "lg:grid-cols-2 lg:gap-20" : ""}`}>
        {gambar}
        <div className="flex flex-col gap-3.5">
          {alis ? <p className={`${LABEL_BAGIAN} text-[var(--alis)]`}>{alis}</p> : null}
          <h2 className={`${HEAD} max-w-[640px] text-balance text-[30px] font-extrabold leading-[1.15] sm:text-[38px]`}>{judul}</h2>
          {deskripsi ? <p className="mt-2 max-w-[640px] whitespace-pre-line text-[16px] leading-[1.6] text-[var(--reg-on-surface-variant)]">{deskripsi}</p> : null}
        </div>
      </div>
      {isi.length > 0 ? (
        <ul className={`mt-11 grid gap-5 ${isi.length === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : isi.length === 3 ? "md:grid-cols-3" : isi.length === 2 ? "sm:grid-cols-2" : ""}`}>
          {isi.map((item, index) => {
            const Ikon = IKON[index % IKON.length];
            const nada = NADA[index % NADA.length];
            return (
              <li key={index} className="flex flex-col gap-4 rounded-[20px] bg-[var(--reg-panel)] p-[30px]">
                <span aria-hidden className="inline-flex size-[52px] items-center justify-center rounded-[14px]" style={{ background: nada.latar, color: nada.teks }}>
                  <Ikon size={26} />
                </span>
                <h3 className="text-[20px] font-extrabold leading-[1.2]">{item.title.trim()}</h3>
                {item.body?.trim() ? <p className="text-[14px] leading-[1.6] text-[var(--reg-on-surface-variant)]">{item.body.trim()}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Bagian Portal peserta: apa saja yang menunggu tamu setelah masuk. Ubinnya
 * mengikuti saklar Area peserta, jadi tidak pernah menjanjikan yang tidak ada.
 */
export function PortalGathering({
  alis,
  judul,
  catatan,
  aksi,
  ubin,
}: {
  alis: string;
  judul: string;
  catatan: string;
  aksi: Aksi | null;
  ubin: { ikon: "tiket" | "kamar" | "bus" | "pengumuman"; judul: string; teks: string }[];
}) {
  const IKON = { tiket: Ticket, kamar: Bed, bus: Bus, pengumuman: Megaphone } as const;
  // Warna ikon seperti rancangan: hijau, navy, emas tua, merah.
  const WARNA = { tiket: "var(--alis)", kamar: "var(--primer-teks)", bus: "var(--aksen-teks)", pengumuman: "#C8323F" } as const;
  return (
    <section
      id="portal"
      className="scroll-mt-[var(--nav-h)] py-14 lg:py-[90px]"
      // Di atas putih: tombol versi yang terlihat di putih (QA #103 M3).
      style={{ "--aksi": "var(--aksi-putih)", "--on-aksi": "var(--on-aksi-putih)" } as CSSProperties}
    >
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-[60px]">
        <div className="flex flex-col items-start gap-5">
          <p className={`${LABEL_BAGIAN} text-[var(--alis)]`}>{alis}</p>
          <h2 className={`${HEAD} text-pretty text-[28px] font-extrabold leading-[1.15] sm:text-[36px]`}>{judul}</h2>
          <p className="text-[15px] leading-[1.65] text-[var(--reg-on-surface-variant)]">{catatan}</p>
          {aksi ? <TautanAksi {...aksi} className={TOMBOL_AKSI} /> : null}
        </div>
        <ul className="grid grid-cols-2 gap-3.5">
          {ubin.map(({ ikon, judul: judulUbin, teks }) => {
            const Ikon = IKON[ikon];
            return (
              <li key={judulUbin} className="flex flex-col gap-2.5 rounded-2xl bg-[var(--reg-panel)] p-4 sm:p-[22px]">
                <Ikon size={24} aria-hidden style={{ color: WARNA[ikon] }} />
                <p className="text-[15px] font-extrabold leading-[1.2]">{judulUbin}</p>
                <p className="text-[12px] leading-[1.3] text-[#5F6B7F]">{teks}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** Pita penutup selebar layar: judul, kalimat, satu tombol, di atas gradasi yang sama dengan hero. */
export function PitaPenutupGathering({ judul, catatan, aksi, gaya }: { judul: string; catatan: string | null; aksi: Aksi; gaya: CSSProperties }) {
  return (
    <section className="text-[var(--ink)]" style={{ ...gaya, background: LATAR_HERO }}>
      <div className={`${SHELL} flex flex-col items-center gap-[22px] py-16 text-center lg:py-[90px]`}>
        <h2 className={`${HEAD} max-w-[800px] text-balance [overflow-wrap:anywhere] text-[32px] font-extrabold leading-[1.2] sm:text-[44px]`}>{judul}</h2>
        {catatan ? <p className={`max-w-[640px] text-[15px] leading-[1.5] ${REDUP}`}>{catatan}</p> : null}
        <TautanAksi {...aksi} className={TOMBOL_AKSI} />
      </div>
    </section>
  );
}

/** Kaki tipis gaya gathering: hak cipta di kiri, tagline emas tua di kanan. */
export function KakiGathering({ hakCipta, tagline }: { hakCipta: string; tagline: string | null }) {
  return (
    <footer data-bagian="kaki" className="bg-white">
      <div className={`${SHELL} flex flex-col gap-2 py-7 text-[12px] leading-[1.2] sm:flex-row sm:items-center sm:justify-between`}>
        <p className="text-[#5F6B7F]">{hakCipta}</p>
        {tagline ? <p className="font-bold text-[var(--aksen-teks)]">{tagline}</p> : null}
      </div>
    </footer>
  );
}

/**
 * Tanda nama di bilah atas tanpa logo: dua huruf. Kata pertama yang diawali
 * angka ("2Fly") memakai dua karakter pertamanya ("2F"); selain itu huruf awal
 * dua kata pertama ("Annual Summit" = "AS").
 */
export function inisialNama(nama: string): string {
  const kata = nama.trim().split(/\s+/).filter(Boolean);
  if (kata.length === 0) return "";
  if (/^\d/.test(kata[0]) || kata.length === 1) return kata[0].replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase();
  return (kata[0][0] + kata[1][0]).toUpperCase();
}
