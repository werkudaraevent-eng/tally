import type { CSSProperties, ReactNode } from "react";
import { CaretRight, FacebookLogo, InstagramLogo, LinkedinLogo, List, WhatsappLogo, XLogo, YoutubeLogo } from "@phosphor-icons/react/dist/ssr";
import type { LandingForumConfig, LandingForumPage } from "@/lib/domain";
import type { ForumLabels } from "./labels";
import { CINCIN_TERANG, TEKS_MENU, TOMBOL, WADAH } from "./styles";

/**
 * Alamat antarhalaman Forum. Di pratinjau CMS tautannya menuju halaman
 * pratinjau (yang merender draf), bukan halaman publik, dan diberi
 * `data-halaman` supaya bingkai pratinjau bisa memberi tahu CMS halaman mana
 * yang sedang dibuka.
 */
export type ForumTautan = (halaman: LandingForumPage, jangkar?: string) => string;

export function buatTautan(slug: string, pratinjau: boolean): ForumTautan {
  return (halaman, jangkar) => {
    const hash = jangkar ? `#${jangkar}` : "";
    if (pratinjau) return `/e/${slug}/pratinjau${halaman === "beranda" ? "" : `?halaman=${halaman}`}${hash}`;
    return `/e/${slug}${halaman === "beranda" ? "" : `/${halaman}`}${hash}`;
  };
}

export type TombolAtas = { href: string; label: string } | null;

function Logo({ src, nama, terang }: { src: string | null; nama: string; terang: boolean }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={nama} className="h-[clamp(36px,2.72vw,52px)] w-auto max-w-[clamp(160px,15.7vw,301px)] object-contain object-left" />;
  }
  return (
    <span className={`line-clamp-2 max-w-[clamp(160px,15.7vw,301px)] text-[clamp(17px,1.25vw,24px)] font-bold leading-tight ${terang ? "text-white" : "text-[var(--f-primary-text)]"}`}>
      {nama}
    </span>
  );
}

/**
 * Bilah atas. Di Beranda menumpang di atas KV (teks putih), di halaman lain
 * bilah putih dengan bayangan seperti Figma. Teks menu Beranda di Figma abu
 * gelap di atas foto terang; di sini putih, karena KV acara bisa gelap (KV ILO
 * navy) dan teks gelap di atasnya hilang.
 */
export function ForumHeader({
  logoAcara,
  halaman,
  diAtasKv,
  config,
  nama,
  label,
  tautan,
  tombol,
  sekunder = false,
}: {
  /** Logo acara dari CMS (Pembuka, sama dengan logo bilah atas Modern). */
  logoAcara: string | null;
  halaman: LandingForumPage;
  diAtasKv: boolean;
  config: LandingForumConfig;
  nama: string;
  label: ForumLabels;
  tautan: ForumTautan;
  tombol: TombolAtas;
  /**
   * Pendaftaran masih dibuka: tombol Daftar di hero yang utama, jadi Masuk
   * tampil bergaris supaya tidak bersaing dengannya.
   */
  sekunder?: boolean;
}) {
  const menu: { halaman: LandingForumPage; label: string }[] = [
    { halaman: "beranda", label: label.beranda },
    { halaman: "program", label: label.program },
    ...((config.info ?? []).length > 0 && !(config.hidden ?? []).includes("info") ? [{ halaman: "info" as const, label: label.info }] : []),
  ];
  const logo = diAtasKv ? (config.logo_light_url || logoAcara) : logoAcara;
  const warnaMenu = (aktif: boolean) =>
    diAtasKv ? (aktif ? "text-white" : "text-white/75 hover:text-white") : aktif ? "text-black/[0.63]" : "text-[#9a9a9a] hover:text-black/[0.63]";

  // Laci ponsel berlatar putih, jadi tombolnya selalu memakai warna di luar KV.
  const tombolMasuk = (atasKv: boolean) => tombol ? (
    <a
      href={tombol.href}
      className={`${TOMBOL} h-[clamp(44px,3.13vw,60px)] min-w-[clamp(120px,8.85vw,170px)] px-[clamp(20px,1.77vw,34px)] text-[clamp(15px,0.84vw,16px)] ${
        sekunder
          ? `border-2 ${atasKv ? "border-white text-white" : "border-[var(--f-primary-text)] text-[var(--f-primary-text)]"}`
          : "bg-[var(--f-secondary)] text-[var(--f-on-secondary)]"
      }`}
    >
      {tombol.label}
    </a>
  ) : null;

  return (
    <header
      data-bagian={diAtasKv ? undefined : "pembuka"}
      className={
        diAtasKv
          ? "absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/45 to-transparent"
          : "relative z-20 bg-white shadow-[0_8px_40px_rgba(0,0,0,0.25)]"
      }
    >
      {/* Figma: bilah selebar 1612 dari 1920, sedikit lebih lebar dari isi halaman. */}
      <div className="mx-auto flex h-[clamp(72px,8.33vw,160px)] w-[min(1612px,calc(100%-2*clamp(16px,8vw,154px)))] items-center justify-between gap-6">
        <a href={tautan("beranda")} data-halaman="beranda" className="shrink-0">
          <Logo src={logo} nama={nama} terang={diAtasKv} />
        </a>
        <nav aria-label={label.menu} className={`hidden items-center gap-[clamp(28px,4.27vw,82px)] lg:flex ${TEKS_MENU}`}>
          {menu.map((item) => (
            <a
              key={item.halaman}
              href={tautan(item.halaman)}
              data-halaman={item.halaman}
              aria-current={item.halaman === halaman ? "page" : undefined}
              className={`whitespace-nowrap ${warnaMenu(item.halaman === halaman)}`}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="hidden lg:block">{tombolMasuk(diAtasKv)}</div>

        {/* Ponsel: menu di laci <details>, tanpa skrip. */}
        <details className="group relative lg:hidden">
          <summary
            className={`flex size-11 cursor-pointer list-none items-center justify-center [&::-webkit-details-marker]:hidden ${diAtasKv ? "text-white" : "text-[var(--f-ink)]"}`}
            aria-label={label.menu}
          >
            <List size={28} aria-hidden />
          </summary>
          {/* Cincin fokus kembali gelap: wadah hero di atasnya memasang cincin putih. */}
          <div className="absolute right-0 top-full mt-2 flex w-64 [--md-sys-color-primary:var(--f-primary-text)] flex-col gap-1 bg-white p-3 text-[16px] font-medium text-[var(--f-ink)] shadow-[0_8px_40px_rgba(0,0,0,0.25)]">
            {menu.map((item) => (
              <a
                key={item.halaman}
                href={tautan(item.halaman)}
                data-halaman={item.halaman}
                aria-current={item.halaman === halaman ? "page" : undefined}
                className="flex min-h-11 items-center px-2 aria-[current=page]:text-[var(--f-primary-text)]"
              >
                {item.label}
              </a>
            ))}
            {tombol ? <div className="mt-2 [&>a]:w-full">{tombolMasuk(false)}</div> : null}
          </div>
        </details>
      </div>
    </header>
  );
}

/** "Beranda > Program acara". */
export function Remah({ label, tautan, saatIni }: { label: ForumLabels; tautan: ForumTautan; saatIni: string }) {
  return (
    <nav aria-label={label.remah} className={`${WADAH} pt-[clamp(24px,3.07vw,59px)]`}>
      <ol className={`flex items-center gap-[clamp(8px,0.52vw,10px)] ${TEKS_MENU}`}>
        <li>
          <a href={tautan("beranda")} data-halaman="beranda" className="text-[#9a9a9a] hover:text-black/[0.63]">
            {label.beranda}
          </a>
        </li>
        <li aria-hidden className="text-black">
          <CaretRight size={14} weight="bold" />
        </li>
        <li aria-current="page" className="text-black">
          {saatIni}
        </li>
      </ol>
    </nav>
  );
}

const SOSMED = [
  { key: "facebook", label: "Facebook", Ikon: FacebookLogo },
  { key: "x", label: "X", Ikon: XLogo },
  { key: "linkedin", label: "LinkedIn", Ikon: LinkedinLogo },
  { key: "instagram", label: "Instagram", Ikon: InstagramLogo },
  { key: "youtube", label: "YouTube", Ikon: YoutubeLogo },
  { key: "whatsapp", label: "WhatsApp", Ikon: WhatsappLogo },
] as const;

/** Kaki halaman: logo dan media sosial di atas garis, tautan di bawahnya. */
export function ForumFooter({ config, nama, catatan }: { config: LandingForumConfig; nama: string; catatan: string | null }) {
  const sosmed = SOSMED.filter((item) => config.socials?.[item.key]?.trim());
  const tautan = (config.footer_links ?? []).filter((item) => item.label.trim() && item.url.trim());
  return (
    <footer data-bagian="kaki" className={`mt-[clamp(64px,10.9vw,210px)] bg-[var(--f-primary)] text-[var(--f-on-primary)] ${CINCIN_TERANG}`}>
      <div className="mx-auto w-[calc(100%-2*clamp(16px,3.7vw,71px))]">
        <div className="flex flex-col gap-8 px-[clamp(0px,2.66vw,51px)] pb-[clamp(32px,5.94vw,114px)] pt-[clamp(40px,3.6vw,69px)] md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-3">
            {config.footer_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.footer_logo_url} alt={nama} className="h-[clamp(48px,4.53vw,87px)] w-auto max-w-full object-contain object-left" />
            ) : (
              <p className="text-[clamp(22px,1.67vw,32px)] font-bold">{nama}</p>
            )}
            {catatan ? <p className="max-w-[60ch] text-[16px] leading-normal opacity-85">{catatan}</p> : null}
          </div>
          {sosmed.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-[clamp(16px,1.67vw,32px)]">
              {sosmed.map(({ key, label, Ikon }) => (
                <li key={key}>
                  <a
                    href={config.socials![key]!.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="flex size-11 items-center justify-center hover:opacity-80"
                  >
                    <Ikon size={36} weight="fill" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="border-t border-current" />
        <ul className={`flex min-h-[clamp(72px,6.67vw,126px)] flex-wrap items-center gap-x-[clamp(24px,2.85vw,55px)] gap-y-2 px-[clamp(0px,2.66vw,51px)] py-6 ${TEKS_MENU}`}>
          {tautan.map((item) => (
            <li key={`${item.label}-${item.url}`}>
              <a href={item.url} className="hover:underline" target={/^https?:/.test(item.url) ? "_blank" : undefined} rel="noopener noreferrer">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}

/** Pembungkus halaman Forum: huruf isi dan huruf judul dari token (bawaan keduanya Ubuntu). */
export function ForumMain({ style, lang, children }: { style: CSSProperties; lang: "id" | "en"; children: ReactNode }) {
  return (
    // `lang` di <main>: <html> milik layout bersama tetap "id", dan Forum
    // berbahasa Inggris (forum.language) harus dibaca pembaca layar sebagai Inggris.
    <main
      lang={lang}
      data-halaman-publik
      className="min-h-dvh overflow-x-clip bg-white text-black [font-family:var(--landing-body)] [&_:is(h1,h2,h3)]:[font-family:var(--landing-heading)]"
      style={style}
    >
      {children}
    </main>
  );
}
