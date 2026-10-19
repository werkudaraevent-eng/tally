import type { ReactNode } from "react";
import { ArrowUpRight, Check, DownloadSimple, FileText } from "@phosphor-icons/react/dist/ssr";
import { landingBlockHasContent, type LandingBlock, type LandingBlockItem } from "@/lib/domain";
import { LANDING_UI, type LandingLang } from "@/lib/landing-i18n";

/**
 * Blok halaman acara sebagai kartu di halaman peserta (Show on: Participant
 * page atau Both).
 *
 * Bukan bagian halaman acara yang dikecilkan: di Beranda peserta blok tampil
 * sebagai kartu yang sama dengan kartu lain di sana (kartu putih 20 px, judul
 * 22 px, isi 16 px), seperti kartu Rute (blok-rute.tsx). Bagian selebar layar
 * dengan judul 48 px dan kisi empat kolom terlalu besar di kolom 760 px dan
 * terlalu padat di ponsel. Isinya sama, susunannya ringkas: daftar baris untuk
 * kartu dan kolom, centang untuk poin, kisi kecil untuk galeri dan angka.
 *
 * Teks sudah dalam bahasa halaman (resolveLanding di dashboard). Tautan jangkar
 * (#agenda) tidak ditampilkan: bagian itu ada di halaman acara, bukan di sini.
 */

// `--kartu-garis`: garis kartu portal Horizon (GARIS_KARTU); dasbor lain tidak menyetelnya, jadi 0 px.
const KARTU = "rounded-[20px] bg-white p-5 text-[#1A2333] shadow-[0_1px_2px_rgb(16_24_40/0.06)] ring-[length:var(--kartu-garis,0px)] ring-[rgb(16_30_56/0.12)] sm:p-6";
const MUTED = "text-[#5F6B7F]";
const GARIS = "border-[#E6E9EE]";
const ALIS = "text-[12px] font-bold uppercase leading-4 tracking-[0.08em] text-[var(--alis,var(--reg-primary))]";
const TOMBOL =
  "m3-state inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--aksi-putih,var(--aksi,var(--reg-primary)))] px-5 text-title-small font-bold text-[var(--on-aksi-putih,var(--on-aksi,var(--reg-on-primary)))]";
const TOMBOL_GARIS = "m3-state inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#D0D5DD] px-5 text-title-small font-bold";
const PATAH = "[overflow-wrap:anywhere]";

/** Tautan yang bisa dibuka dari halaman peserta: http(s) saja, jangkar ke halaman acara dibuang. */
function tautanLuar(href: string | null | undefined): string | null {
  const url = href?.trim();
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function Gambar({ src, alt = "", className }: { src: string; alt?: string; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={`bg-[#E6E9EE] object-cover ${className}`} />;
}

function Paragraf({ teks }: { teks?: string }) {
  const bagian = (teks ?? "").trim().split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  if (bagian.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {bagian.map((item, index) => (
        <p key={index} className={`whitespace-pre-line text-body-large ${MUTED} ${PATAH}`}>{item}</p>
      ))}
    </div>
  );
}

function Kepala({ block, judulId }: { block: LandingBlock; judulId: string }) {
  const alis = block.eyebrow?.trim();
  const judul = block.heading?.trim();
  if (!alis && !judul) return null;
  return (
    <div className="flex flex-col gap-1">
      {alis ? <p className={ALIS}>{alis}</p> : null}
      {judul ? <h2 id={judulId} className={`text-title-large font-bold ${PATAH}`}>{judul}</h2> : null}
    </div>
  );
}

function Tombol({ href, children, garis = false }: { href: string; children: ReactNode; garis?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={`${garis ? TOMBOL_GARIS : TOMBOL} self-start`}>
      {children}
      <ArrowUpRight size={16} weight="bold" aria-hidden />
    </a>
  );
}

function Kartu({ block, children, className = "" }: { block: LandingBlock; children: ReactNode; className?: string }) {
  const judulId = `${block.id}-judul`;
  return (
    <section id={block.id} aria-labelledby={block.heading?.trim() ? judulId : undefined} aria-label={block.heading?.trim() ? undefined : block.eyebrow?.trim() || undefined} className={`${KARTU} flex flex-col gap-4 ${className}`}>
      {children}
    </section>
  );
}

/** Baris bergambar kecil: kartu foto dan kolom. Satu baris = satu tautan bila ada. */
function BarisButir({ item, lang }: { item: LandingBlockItem; lang: LandingLang }) {
  const href = tautanLuar(item.href);
  const isi = (
    <>
      {item.image_url ? <Gambar src={item.image_url} className="size-16 shrink-0 rounded-[12px]" /> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {item.label?.trim() && !href ? <span className={ALIS}>{item.label.trim()}</span> : null}
        {item.title?.trim() ? <span className={`text-body-large font-semibold ${PATAH}`}>{item.title.trim()}</span> : null}
        {item.body?.trim() ? <span className={`line-clamp-3 whitespace-pre-line text-body-medium ${MUTED} ${PATAH}`}>{item.body.trim()}</span> : null}
        {href ? <span className="text-title-small font-bold text-[var(--alis,var(--reg-primary))]">{item.label?.trim() || LANDING_UI[lang].readMore}</span> : null}
      </span>
      {href ? <ArrowUpRight size={18} weight="bold" aria-hidden className="mt-0.5 shrink-0 text-[var(--alis,var(--reg-primary))]" /> : null}
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer noopener" className="m3-state -mx-2 flex items-start gap-3 rounded-[12px] px-2 py-3">
      {isi}
    </a>
  ) : (
    <div className="flex items-start gap-3 py-3">{isi}</div>
  );
}

export function KartuBlok({ block, lang }: { block: LandingBlock; lang: LandingLang }) {
  if (!landingBlockHasContent(block)) return null;
  const t = LANDING_UI[lang];
  const items = block.items ?? [];
  const judulId = `${block.id}-judul`;
  const tautan1 = tautanLuar(block.link_url);
  const tautan2 = tautanLuar(block.link2_url);

  switch (block.type) {
    case "text_image":
      return (
        <Kartu block={block}>
          {block.image_url ? <Gambar src={block.image_url} className="aspect-[2/1] w-full rounded-[14px]" /> : null}
          <Kepala block={block} judulId={judulId} />
          <Paragraf teks={block.body} />
          {tautan1 || tautan2 ? (
            <div className="flex flex-wrap gap-3">
              {tautan1 ? <Tombol href={tautan1}>{block.link_label?.trim() || t.readMore}</Tombol> : null}
              {tautan2 ? <Tombol href={tautan2} garis>{block.link2_label?.trim() || t.readMore}</Tombol> : null}
            </div>
          ) : null}
        </Kartu>
      );

    case "points":
      return (
        <Kartu block={block} className="gap-3">
          <Kepala block={block} judulId={judulId} />
          <Paragraf teks={block.body} />
          <ul>
            {items.filter((item) => item.title?.trim() || item.body?.trim()).map((item, index) => (
              <li key={index} className={`flex gap-3 py-3 ${index > 0 ? `border-t ${GARIS}` : ""}`}>
                <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--chip-aksi,var(--reg-primary-container))] text-[var(--on-chip-aksi,var(--reg-on-primary-container))]">
                  <Check size={14} weight="bold" />
                </span>
                <span className="flex min-w-0 flex-col">
                  {item.title?.trim() ? <span className={`text-body-large font-semibold ${PATAH}`}>{item.title.trim()}</span> : null}
                  {item.body?.trim() ? <span className={`whitespace-pre-line text-body-medium ${MUTED} ${PATAH}`}>{item.body.trim()}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Kartu>
      );

    case "cards":
    case "multicolumn":
      return (
        <Kartu block={block} className="gap-3">
          <Kepala block={block} judulId={judulId} />
          <Paragraf teks={block.body} />
          <ul className="divide-y divide-[#E6E9EE]">
            {items.filter((item) => item.title?.trim() || item.body?.trim() || item.image_url).map((item, index) => (
              <li key={index}>
                <BarisButir item={item} lang={lang} />
              </li>
            ))}
          </ul>
          {block.type === "cards" && tautan1 ? <Tombol href={tautan1} garis>{block.link_label?.trim() || t.readMore}</Tombol> : null}
        </Kartu>
      );

    case "gallery": {
      const foto = items.filter((item): item is LandingBlockItem & { image_url: string } => Boolean(item.image_url));
      return (
        <Kartu block={block}>
          <Kepala block={block} judulId={judulId} />
          <Paragraf teks={block.body} />
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {foto.map((item, index) => (
              <li key={index}>
                <Gambar src={item.image_url} alt={item.label?.trim() ?? ""} className="aspect-square w-full rounded-[12px]" />
              </li>
            ))}
          </ul>
        </Kartu>
      );
    }

    case "stats": {
      const angka = items.filter((item) => item.value?.trim() && item.label?.trim());
      return (
        <Kartu block={block}>
          {block.heading?.trim() ? <h2 id={judulId} className={`text-title-large font-bold ${PATAH}`}>{block.heading.trim()}</h2> : null}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
            {angka.map((item, index) => (
              <div key={index} className="flex flex-col-reverse justify-end gap-1">
                <dt className={`text-body-medium ${MUTED} ${PATAH}`}>{item.label?.trim()}</dt>
                <dd className="text-[28px] font-extrabold leading-tight tabular-nums">{item.value?.trim()}</dd>
              </div>
            ))}
          </dl>
          {block.source?.trim() ? <p className={`border-t ${GARIS} pt-3 text-body-small ${MUTED}`}>{lang === "en" ? "Source" : "Sumber"}: {block.source.trim()}</p> : null}
        </Kartu>
      );
    }

    case "quote": {
      const nama = block.name?.trim() ?? "";
      return (
        <section id={block.id} className={KARTU}>
          <figure className="flex flex-col gap-4">
            <blockquote className={`text-[20px] font-semibold leading-[1.4] ${PATAH}`}>
              <p>“{block.quote?.trim()}”</p>
            </blockquote>
            <figcaption className="flex items-center gap-3">
              {block.image_url ? (
                <Gambar src={block.image_url} className="size-12 shrink-0 rounded-full" />
              ) : (
                <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#F4F6F8] text-title-small font-bold">
                  {nama.split(/\s+/).filter(Boolean).slice(0, 2).map((kata) => kata[0]?.toUpperCase()).join("")}
                </span>
              )}
              <span className="flex min-w-0 flex-col">
                <span className="text-body-large font-semibold">{nama}</span>
                {block.role?.trim() ? <span className={`text-body-medium ${MUTED}`}>{block.role.trim()}</span> : null}
              </span>
            </figcaption>
          </figure>
        </section>
      );
    }

    case "logos": {
      const logo = items.filter((item): item is LandingBlockItem & { image_url: string } => Boolean(item.image_url));
      return (
        <Kartu block={block}>
          {block.heading?.trim() ? <h2 id={judulId} className={`text-title-medium font-bold ${PATAH}`}>{block.heading.trim()}</h2> : null}
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-4">
            {logo.map((item, index) => {
              const href = tautanLuar(item.href);
              // eslint-disable-next-line @next/next/no-img-element
              const gambar = <img src={item.image_url} alt={item.label?.trim() ?? ""} loading="lazy" decoding="async" className="h-10 w-auto max-w-[140px] object-contain" />;
              return (
                <li key={index}>
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer noopener" className="flex min-h-12 items-center">
                      {gambar}
                    </a>
                  ) : (
                    gambar
                  )}
                </li>
              );
            })}
          </ul>
        </Kartu>
      );
    }

    case "download":
      return (
        <Kartu block={block}>
          <div className="flex items-start gap-4">
            {block.image_url ? (
              <Gambar src={block.image_url} className="aspect-[3/4] w-14 shrink-0 rounded-[8px]" />
            ) : (
              <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-[var(--chip-merek,var(--reg-primary-container))] text-[var(--on-chip-merek,var(--reg-on-primary-container))]">
                <FileText size={24} />
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Kepala block={block} judulId={judulId} />
              {block.body?.trim() ? <p className={`whitespace-pre-line text-body-medium ${MUTED} ${PATAH}`}>{block.body.trim()}</p> : null}
            </div>
          </div>
          {tautan1 ? (
            <a href={tautan1} target="_blank" rel="noreferrer noopener" className={`${TOMBOL} self-start`}>
              {block.link_label?.trim() || t.downloadMaterial}
              <DownloadSimple size={18} aria-hidden />
            </a>
          ) : null}
        </Kartu>
      );

    case "cta":
      // Tombolnya menuju pendaftaran; peserta yang sudah masuk tidak perlu itu.
      return (
        <section id={block.id} aria-labelledby={judulId} className="flex flex-col gap-2 rounded-[20px] bg-[var(--reg-brand)] p-5 text-[var(--reg-on-brand)] sm:p-6">
          <h2 id={judulId} className={`text-title-large font-bold ${PATAH}`}>{block.heading?.trim()}</h2>
          {block.body?.trim() ? <p className={`whitespace-pre-line text-body-large opacity-90 ${PATAH}`}>{block.body.trim()}</p> : null}
        </section>
      );

    default:
      // Rute dirender KartuRute; jenis lain yang belum punya kartu tidak tampil.
      return null;
  }
}
