import type { CSSProperties } from "react";
import type { EventLandingConfig, EventRow, LandingForumConfig, LandingForumPage, LandingForumPart } from "@/lib/domain";
import { LANDING_HEADING_FONTS, publicEventName } from "@/lib/domain";
import { forumThemeStyle } from "@/lib/registration-theme-css";
import { formatEventDate } from "@/lib/event-datetime";
import { loadAgendaPreview } from "@/lib/landing-agenda";
import { getMemberSession, memberConfig } from "@/lib/member/account";
import { timeZoneAbbr } from "@/lib/timezone";
import { FORUM_ICONS } from "./icons";
import { FORUM_LABELS } from "./labels";
import { BagianPembicara, Foto, KartuFoto, PanelSusunan, Paragraf, PitaTanggal } from "./forum-parts";
import { buatTautan, ForumFooter, ForumHeader, ForumMain, Remah, type TombolAtas } from "./forum-shell";
import { H_BAGIAN, H_HERO, H_PANEL, JARAK, TEKS_BESAR, TEKS_MENU, TOMBOL, WADAH } from "./styles";

/**
 * Halaman acara tata letak Forum (`landing_config.layout = "forum"`).
 *
 * Diterjemahkan dari Figma "IFC Website" (VP08ev7nB80JGumJEngYQU), yang
 * Hanung pilih sebagai acuan pada 2026-10-01: halaman sederhana berisi info
 * penting saja. Tiga halaman dengan susunan tetap:
 *
 * - Beranda (/e/<slug>): hero KV, pita tempat dan tanggal, Tentang (ringkas),
 *   Susunan acara (tertutup), Pembicara, Sorotan, ubin Informasi praktis.
 * - Program acara (/e/<slug>/program): banner, Tentang (lengkap), Susunan
 *   acara (terbuka), Pembicara, Lokasi, Galeri tempat, Dress code.
 * - Informasi praktis (/e/<slug>/info): pita, kelompok info yang bisa dilipat.
 *
 * Pembicara tidak ada di Figma; bentuknya meminjam kartu Dress code.
 *
 * Aturan yang sama dengan tata letak lain: bagian tanpa isi tidak dirender,
 * dan teks contoh Figma ("Lorem ipsum", foto stok) tidak pernah tampil.
 */

type Props = { event: EventRow; halaman: LandingForumPage; pratinjau?: boolean };

/** Paragraf awal deskripsi untuk kartu Tentang di Beranda, sekitar 600 karakter. */
function ringkas(teks: string): string {
  const paragraf = teks.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const hasil: string[] = [];
  for (const item of paragraf) {
    if (hasil.length > 0 && hasil.join(" ").length + item.length > 600) break;
    hasil.push(item);
  }
  return hasil.join("\n\n");
}

export async function EventLandingForum({ event, halaman, pratinjau = false }: Props) {
  const config = (event.landing_config ?? {}) as EventLandingConfig;
  const forum: LandingForumConfig = config.forum ?? {};
  const label = FORUM_LABELS[forum.language ?? "id"];
  const tautan = buatTautan(event.slug, pratinjau);
  const nama = publicEventName(event);
  const zona = timeZoneAbbr(event.time_zone);
  const agenda = await loadAgendaPreview(event.id);
  const speakers = (config.speakers ?? []).filter((item) => item.name?.trim());
  const hidden = new Set<LandingForumPart>(forum.hidden ?? []);

  const member = memberConfig(event);
  const tombol: TombolAtas = member
    ? (await getMemberSession(event))
      ? { href: `/e/${event.slug}/peserta`, label: label.areaPeserta }
      : { href: `/e/${event.slug}/masuk`, label: label.masuk }
    : event.registration_enabled
      ? { href: `/e/${event.slug}/daftar`, label: config.cta_label?.trim() || label.daftar }
      : null;

  const deskripsi = event.description?.trim() ?? "";
  const venue = event.venue_name?.trim() || null;
  const tanggal = formatEventDate(event);
  const teksPita = forum.date_banner_text?.trim() || [venue, tanggal].filter(Boolean).join(", ");
  const sorotan = (forum.highlights ?? []).filter((item) => item.title?.trim());
  const info = (forum.info ?? []).filter((item) => item.title?.trim());
  const galeri = (forum.gallery ?? []).filter(Boolean);
  const dresscode = (forum.dresscode ?? []).filter((item) => item.title?.trim());

  const isi: Record<LandingForumPart, boolean> = {
    tanggal: Boolean(teksPita),
    about: Boolean(deskripsi),
    program: agenda.length > 0 || Boolean(config.program_intro?.trim()),
    speakers: speakers.length > 0,
    sorotan: sorotan.length > 0,
    info: info.length > 0,
    venue: Boolean(venue || event.venue_address?.trim() || forum.venue_note?.trim()),
    galeri: galeri.length > 0,
    dresscode: dresscode.length > 0,
  };
  const tampil = (part: LandingForumPart) => isi[part] && !hidden.has(part);

  const font = LANDING_HEADING_FONTS[config.heading_font ?? "ubuntu"] ?? LANDING_HEADING_FONTS.ubuntu;
  const style = {
    ...forumThemeStyle(config.theme?.seed, forum.accent, forum.secondary),
    "--landing-heading": font.cssVar,
  } as CSSProperties;

  const kv = config.banner_url ?? null;
  const daftarUrl = event.registration_enabled ? `/e/${event.slug}/daftar` : null;

  const header = (diAtasKv: boolean) => (
    <ForumHeader halaman={halaman} diAtasKv={diAtasKv} config={forum} nama={nama} label={label} tautan={tautan} tombol={tombol} sekunder={Boolean(member && daftarUrl)} />
  );
  const footer = <ForumFooter config={forum} nama={nama} catatan={config.footer_note?.trim() || null} />;

  const susunan = (terbuka: boolean) =>
    agenda.length > 0 ? <PanelSusunan agenda={agenda} zona={zona} label={label} terbuka={terbuka} /> : null;

  const pembicara = tampil("speakers") ? (
    <div className={JARAK}>
      <BagianPembicara speakers={[...speakers.filter((s) => s.featured), ...speakers.filter((s) => !s.featured)]} label={label} />
    </div>
  ) : null;

  // ---- Beranda ---------------------------------------------------------------
  if (halaman === "beranda") {
    const badge = forum.hero_badge?.trim();
    return (
      <ForumMain style={style}>
        <div className="relative" data-bagian="pembuka">
          {header(true)}
          <section
            className={`relative isolate flex min-h-[max(560px,min(100svh,56.25vw))] items-center overflow-hidden ${kv ? "bg-black" : "bg-[var(--f-primary)]"}`}
          >
            {kv ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={kv} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
                {/* Figma: hitam dari kiri sampai 62% lebar. Di ponsel teks
                    menutupi hampir seluruh foto, jadi bayangannya merata. */}
                <div aria-hidden className="absolute inset-0 -z-10 bg-black/45 md:bg-transparent md:bg-[linear-gradient(to_right,rgb(0_0_0/0.62),rgb(0_0_0/0.35)_35%,rgb(0_0_0/0)_62%)]" />
              </>
            ) : null}
            <div
              className={`flex w-full max-w-[calc(clamp(320px,40vw,780px)+2*clamp(16px,7.03vw,135px))] flex-col items-start gap-[clamp(14px,1.04vw,20px)] px-[clamp(16px,7.03vw,135px)] pb-16 pt-[clamp(110px,10vw,180px)] ${
                kv ? "text-white" : "text-[var(--f-on-primary)]"
              }`}
            >
              {badge ? (
                // Label, bukan tombol: garis aksen di kiri, tanpa blok kuning,
                // supaya tidak terbaca sebagai tombol kedua di samping Daftar.
                <p className={`border-l-4 border-[var(--f-accent)] pl-3 ${TEKS_MENU}`}>{badge}</p>
              ) : null}
              <h1 className={`${H_HERO} w-full text-balance`}>{nama}</h1>
              {event.tagline?.trim() ? (
                <p className="text-[clamp(17px,1.25vw,24px)] leading-[1.3] tracking-[-0.02em]">{event.tagline.trim()}</p>
              ) : null}
              {daftarUrl ? (
                <a
                  href={daftarUrl}
                  // Kuning aksen, bukan primer: di Figma tombol navy berdiri di
                  // atas foto terang, tetapi di atas KV gelap (seperti KV ILO)
                  // tombol navy hampir hilang, padahal ini aksi utama halaman.
                  className={`${TOMBOL} mt-1 h-[clamp(48px,3.13vw,60px)] bg-[var(--f-accent)] px-[clamp(24px,1.77vw,34px)] ${TEKS_MENU} text-[var(--f-on-accent)] outline-[var(--f-accent)]`}
                >
                  {config.cta_label?.trim() || label.daftar}
                </a>
              ) : null}
            </div>
          </section>
        </div>

        {tampil("tanggal") ? (
          <div className="mt-[clamp(40px,6.4vw,123px)]">
            <PitaTanggal gambar={forum.date_banner_url ?? null} teks={teksPita} />
          </div>
        ) : null}

        {/* ---- Tentang (ringkas) ---------------------------------------------- */}
        {tampil("about") ? (
          <section id="tentang" data-bagian="about" className={`${WADAH} ${JARAK} relative scroll-mt-28`}>
            <div className={forum.about_image_url ? "lg:min-h-[clamp(400px,40.5vw,777px)]" : ""}>
              {forum.about_image_url ? (
                <div className="relative aspect-[1048/777] w-full overflow-hidden rounded-[2px] shadow-[0_20px_24px_-4px_rgba(17,24,39,0.1),0_8px_8px_-4px_rgba(17,24,39,0.04)] lg:w-[69%]">
                  <Foto src={forum.about_image_url} />
                </div>
              ) : null}
              <div
                className={`flex flex-col items-start gap-[clamp(20px,2.08vw,40px)] bg-[var(--f-primary)] p-[clamp(24px,2.08vw,40px)] text-[var(--f-on-primary)] ${
                  forum.about_image_url ? "lg:absolute lg:right-0 lg:top-[19.7%] lg:w-[44.7%]" : "mx-auto max-w-[900px]"
                }`}
              >
                <h2 className={`${H_BAGIAN} leading-[1.5]`}>{config.about_heading?.trim() || label.tentangSingkat}</h2>
                <Paragraf teks={ringkas(deskripsi)} className="text-[16px] leading-normal tracking-[-0.02em]" />
                <a
                  href={tautan("program", "tentang")}
                  data-halaman="program"
                  className={`${TOMBOL} bg-[var(--f-accent)] px-5 py-4 text-[18px] font-medium text-[var(--f-on-accent)]`}
                >
                  {label.selengkapnya}
                </a>
              </div>
            </div>
          </section>
        ) : null}

        {/* ---- Program dan susunan acara ------------------------------------------ */}
        {tampil("program") ? (
          <section id="program" data-bagian="program" className={`${WADAH} ${JARAK} scroll-mt-28`}>
            <div className="flex flex-col items-center gap-5">
              <h2 className={`${H_BAGIAN} text-center text-[var(--f-ink)]`}>{label.program}</h2>
              {config.program_intro?.trim() ? (
                <Paragraf teks={config.program_intro.trim()} className={`w-full ${TEKS_MENU} text-black`} />
              ) : null}
            </div>
            {agenda.length > 0 ? <div className="mt-[clamp(24px,2.6vw,50px)] lg:-mx-[4.2%]">{susunan(false)}</div> : null}
          </section>
        ) : null}

        {pembicara}

        {/* ---- Sorotan: teks dan gambar bergantian ---------------------------------- */}
        {tampil("sorotan") ? (
          <div data-bagian="sorotan" className={`${WADAH} ${JARAK} flex flex-col gap-[clamp(56px,5.2vw,100px)]`}>
            {sorotan.map((item, index) => {
              const href =
                item.link === "program" ? tautan("program") :
                item.link === "info" ? tautan("info") :
                item.link === "daftar" ? daftarUrl :
                item.link === "url" ? item.link_url?.trim() || null : null;
              const gambarKanan = index % 2 === 0;
              return (
                <section key={index} className={`grid items-center gap-[clamp(28px,4.2vw,80px)] ${item.image_url ? "lg:grid-cols-2" : ""}`}>
                  <div className={`flex flex-col items-start gap-[clamp(20px,2.08vw,40px)] ${gambarKanan ? "" : "lg:order-2"}`}>
                    <h2 className={`${H_BAGIAN} leading-[1.5]`}>{item.title}</h2>
                    {item.body?.trim() ? <Paragraf teks={item.body.trim()} className="text-[16px] leading-normal tracking-[-0.02em]" /> : null}
                    {href ? (
                      <a
                        href={href}
                        data-halaman={item.link === "program" || item.link === "info" ? item.link : undefined}
                        className="text-[clamp(22px,2.08vw,40px)] font-medium tracking-[-0.02em] underline decoration-from-font underline-offset-4 hover:opacity-75"
                      >
                        {item.link_label?.trim() || label.lihatSelengkapnya}
                      </a>
                    ) : null}
                  </div>
                  {item.image_url ? (
                    <div className={`relative aspect-[760/802] overflow-hidden shadow-[0_20px_24px_-4px_rgba(17,24,39,0.1),0_8px_8px_-4px_rgba(17,24,39,0.04)] ${gambarKanan ? "" : "lg:order-1"}`}>
                      <Foto src={item.image_url} />
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : null}

        {/* ---- Ubin Informasi praktis ------------------------------------------------ */}
        {tampil("info") ? (
          <section id="info" data-bagian="info" className={`${WADAH} ${JARAK} scroll-mt-28`}>
            <div className="flex flex-col items-center gap-5 text-center">
              <h2 className={`${H_BAGIAN} text-[var(--f-ink)]`}>{forum.info_title?.trim() || label.info}</h2>
              {forum.info_intro?.trim() ? <p className={`${TEKS_MENU} max-w-[1100px] text-black`}>{forum.info_intro.trim()}</p> : null}
            </div>
            <ul className="mt-[clamp(28px,1.82vw,35px)] grid gap-x-[clamp(20px,7.65vw,147px)] gap-y-[clamp(20px,3.75vw,72px)] [filter:drop-shadow(0_12px_10px_rgba(0,0,0,0.25))] sm:grid-cols-2 lg:grid-cols-3">
              {info.map((item) => {
                const Ikon = FORUM_ICONS[item.icon ?? "info"] ?? FORUM_ICONS.info;
                return (
                  <li key={item.id}>
                    <a
                      href={tautan("info", item.id)}
                      data-halaman="info"
                      className="group relative isolate flex aspect-[409/273] flex-col items-center justify-center gap-2 overflow-hidden bg-[var(--f-primary)] text-white"
                    >
                      {item.image_url ? (
                        <>
                          <Foto src={item.image_url} className="-z-10 transition-transform duration-500 group-hover:scale-105" />
                          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(closest-side,rgb(0_0_0/0.45),rgb(0_0_0/0.12))]" />
                        </>
                      ) : null}
                      <Ikon aria-hidden weight="fill" className="size-[clamp(48px,4.17vw,80px)]" />
                      <span className="px-4 text-center text-[clamp(20px,1.67vw,32px)] font-medium leading-tight">{item.title}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {footer}
      </ForumMain>
    );
  }

  // ---- Program acara -------------------------------------------------------------
  if (halaman === "program") {
    return (
      <ForumMain style={style}>
        {header(false)}
        <Remah label={label} tautan={tautan} saatIni={label.program} />

        <section className={`${WADAH} mt-[clamp(20px,1.93vw,37px)] grid lg:grid-cols-[43.5%_1fr]`}>
          <div className="relative aspect-[664/456] overflow-hidden bg-[var(--f-primary)] lg:aspect-auto lg:min-h-[clamp(280px,23.75vw,456px)]">
            {forum.program_banner_url || kv ? (
              <>
                <Foto src={forum.program_banner_url || kv!} className="object-bottom" />
                <div aria-hidden className="absolute inset-0 bg-black/40" />
              </>
            ) : null}
          </div>
          <div className="flex flex-col justify-center gap-[clamp(16px,2.08vw,40px)] bg-[var(--f-primary)] px-[clamp(24px,4.53vw,87px)] py-[clamp(32px,3.6vw,69px)] text-[var(--f-on-primary)]">
            <h1 className="text-[clamp(34px,3.75vw,72px)] font-medium leading-[1.2] tracking-[-0.02em]">{label.program}</h1>
            <p className="text-[clamp(16px,1.25vw,24px)] tracking-[-0.02em]">{forum.program_subtitle?.trim() || label.subjudulProgram}</p>
          </div>
        </section>

        {tampil("about") ? (
          <section id="tentang" data-bagian="about" className={`${WADAH} mt-[clamp(40px,4.06vw,78px)] flex scroll-mt-28 flex-col gap-[clamp(20px,1.88vw,36px)]`}>
            <h2 className={`${H_PANEL} text-center text-[var(--f-title)]`}>{config.about_heading?.trim() || label.tentang}</h2>
            <div className={`${TEKS_BESAR} flex flex-col gap-[1.5em] text-justify text-[var(--f-title)] hyphens-auto`}>
              <Paragraf teks={deskripsi} />
            </div>
          </section>
        ) : null}

        {tampil("program") ? (
          <section id="program" data-bagian="program" className={`${WADAH} mt-[clamp(32px,2.66vw,51px)] scroll-mt-28`}>
            {agenda.length > 0 ? susunan(true) : null}
            {config.program_intro?.trim() ? (
              <div className="mt-[clamp(20px,1.41vw,27px)] flex flex-col items-center gap-5">
                <h2 className={`${H_BAGIAN} text-center text-[var(--f-ink)]`}>{label.program}</h2>
                <Paragraf teks={config.program_intro.trim()} className={`w-full ${TEKS_MENU} text-black`} />
              </div>
            ) : null}
          </section>
        ) : null}

        {pembicara}

        {/* ---- Lokasi --------------------------------------------------------------- */}
        {tampil("venue") ? (
          <section id="lokasi" data-bagian="venue" className={`${WADAH} ${JARAK} grid scroll-mt-28 items-center gap-[clamp(28px,4.2vw,80px)] ${forum.venue_image_url ? "lg:grid-cols-[minmax(0,705fr)_minmax(0,760fr)]" : ""}`}>
            <div className="flex flex-col gap-[clamp(20px,2.08vw,40px)]">
              <h2 className={H_BAGIAN}>{label.lokasi}</h2>
              <div className={`${TEKS_BESAR} flex flex-col gap-[1.5em] text-justify hyphens-auto`}>
                {forum.venue_note?.trim() ? <Paragraf teks={forum.venue_note.trim()} /> : null}
                {venue || event.venue_address?.trim() ? (
                  <p className="whitespace-pre-line text-left">
                    {venue ? <strong className="font-medium">{venue}</strong> : null}
                    {venue && event.venue_address?.trim() ? "\n" : null}
                    {event.venue_address?.trim()}
                  </p>
                ) : null}
                {event.venue_map_url ? (
                  <p className="text-left">
                    {label.tautanTempat}{" "}
                    <a href={event.venue_map_url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                      {venue ?? label.buatPeta}
                    </a>
                  </p>
                ) : null}
              </div>
            </div>
            {forum.venue_image_url ? (
              <div className="relative aspect-[760/567] overflow-hidden">
                <Foto src={forum.venue_image_url} />
              </div>
            ) : null}
          </section>
        ) : null}

        {/* ---- Galeri tempat ----------------------------------------------------------- */}
        {tampil("galeri") ? (
          <section data-bagian="galeri" className={`${JARAK} mx-auto flex w-[min(1700px,calc(100%-2*clamp(16px,5.73vw,110px)))] flex-col items-center gap-[clamp(20px,1.46vw,28px)]`}>
            <h2 className={`${H_BAGIAN} text-center text-[var(--f-ink)]`}>{label.galeri}</h2>
            <ul className="grid w-full gap-[clamp(16px,2.08vw,40px)] sm:grid-cols-2 lg:grid-cols-3">
              {galeri.map((src, index) => (
                <li key={`${src}-${index}`} className="relative aspect-[540/328] overflow-hidden bg-[#ccc]">
                  <Foto src={src} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ---- Dress code ----------------------------------------------------------------- */}
        {tampil("dresscode") ? (
          <section id="dresscode" data-bagian="dresscode" className={`${WADAH} ${JARAK} scroll-mt-28`}>
            <div className="flex flex-col items-center gap-[clamp(16px,1.04vw,20px)] text-center">
              <h2 className={`${H_BAGIAN} text-[var(--f-ink)]`}>{label.dresscode}</h2>
              {forum.dresscode_intro?.trim() ? <p className={`${TEKS_MENU} max-w-[1480px] text-black`}>{forum.dresscode_intro.trim()}</p> : null}
            </div>
            <ul className="mt-[clamp(28px,3.13vw,60px)] grid gap-x-[clamp(20px,2.08vw,40px)] gap-y-[clamp(40px,3.13vw,60px)] sm:grid-cols-2 lg:grid-cols-3">
              {dresscode.map((item, index) => (
                <KartuFoto key={index} gambar={item.image_url ?? null} judul={item.title} teks={item.body?.trim() || null} />
              ))}
            </ul>
          </section>
        ) : null}

        {footer}
      </ForumMain>
    );
  }

  // ---- Informasi praktis ------------------------------------------------------------
  return (
    <ForumMain style={style}>
      {header(false)}
      <Remah label={label} tautan={tautan} saatIni={forum.info_title?.trim() || label.info} />
      <h1 className="sr-only">{forum.info_title?.trim() || label.info}</h1>
      {teksPita ? (
        <div className="mt-[clamp(20px,1.93vw,37px)]">
          <PitaTanggal gambar={forum.date_banner_url ?? null} teks={teksPita} />
        </div>
      ) : null}
      {forum.info_intro?.trim() ? (
        <p className={`${WADAH} mt-[clamp(32px,4.17vw,80px)] ${TEKS_BESAR}`}>{forum.info_intro.trim()}</p>
      ) : null}
      <div data-bagian="info" className={`${WADAH} mt-[clamp(32px,4.17vw,80px)] flex flex-col gap-[clamp(32px,4.17vw,80px)]`}>
        {info.map((kelompok) => (
          <details key={kelompok.id} id={kelompok.id} open className="group scroll-mt-28">
            <summary className="relative flex min-h-[clamp(60px,4.64vw,89px)] cursor-pointer list-none items-center rounded-[10px] bg-[#f4f4f4] py-4 pl-[clamp(16px,1.51vw,29px)] pr-[clamp(56px,4.5vw,86px)] [&::-webkit-details-marker]:hidden">
              <h2 className={`${H_PANEL} text-[var(--f-primary-text)]`}>{kelompok.title}</h2>
              <svg aria-hidden viewBox="0 0 30 18" className="absolute right-[clamp(16px,1.77vw,34px)] top-1/2 h-[clamp(12px,0.94vw,18px)] w-[clamp(20px,1.56vw,30px)] -translate-y-1/2 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3l12 12L27 3" />
              </svg>
            </summary>
            <div className={`mt-[clamp(20px,1.51vw,29px)] flex flex-col gap-[1.5em] px-[clamp(16px,1.51vw,29px)] ${TEKS_BESAR} text-justify text-[var(--f-title)] hyphens-auto`}>
              {kelompok.items.filter((butir) => butir.body?.trim() || butir.heading?.trim()).map((butir, index) => (
                <div key={index}>
                  {butir.heading?.trim() ? <h3 className="text-left text-[clamp(18px,1.46vw,28px)] font-bold leading-[1.3]">{butir.heading.trim()}</h3> : null}
                  {butir.body?.trim() ? <Paragraf teks={butir.body.trim()} /> : null}
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
      {footer}
    </ForumMain>
  );
}
