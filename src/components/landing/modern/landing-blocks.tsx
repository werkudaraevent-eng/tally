import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, FilePdf } from "@phosphor-icons/react/dist/ssr";
import { landingBlockHasContent, type LandingBlock, type LandingBlockItem, type LandingBlockTone } from "@/lib/domain";
import { HEAD, JUDUL, MUTED, PIL, SHELL } from "./styles";

/**
 * Blok dari pustaka blok, tata letak Modern. Rancangan: Figma "Pustaka blok
 * (usulan)".
 *
 * Tiap blok adalah satu `<section>` selebar layar dengan grid halaman di
 * dalamnya, supaya latar Abu-abu dan Merek gelap bisa membentang penuh.
 * Susunan tiap jenis dikunci di sini; admin hanya mengisi teks dan gambar.
 * Blok tanpa isi tidak dirender (`landingBlockHasContent`).
 */

/** Latar merek gelap: warna merek dicampur hitam, jadi teks putih selalu terbaca. */
const LATAR_GELAP = "color-mix(in srgb, var(--reg-primary) 45%, black)";

/**
 * Variabel per latar. Isi blok menulis warna lewat variabel ini saja, jadi satu
 * blok bisa dipasang di latar mana pun tanpa kelas bersyarat di tiap elemen.
 */
const NADA: Record<LandingBlockTone, CSSProperties> = {
  light: {
    "--blok-aksen": "var(--reg-primary)",
    "--blok-tombol": "var(--reg-primary)",
    "--blok-tombol-ink": "var(--reg-on-primary)",
    "--blok-kartu": "var(--reg-panel)",
  } as CSSProperties,
  panel: {
    backgroundColor: "var(--reg-panel)",
    "--blok-aksen": "var(--reg-primary)",
    "--blok-tombol": "var(--reg-primary)",
    "--blok-tombol-ink": "var(--reg-on-primary)",
    "--blok-kartu": "var(--reg-surface)",
  } as CSSProperties,
  dark: {
    backgroundColor: LATAR_GELAP,
    color: "#ffffff",
    "--reg-on-surface": "#ffffff",
    "--reg-on-surface-variant": "rgb(255 255 255 / 0.8)",
    "--reg-outline-variant": "rgb(255 255 255 / 0.2)",
    "--blok-aksen": "rgb(255 255 255 / 0.8)",
    "--blok-tombol": "#ffffff",
    "--blok-tombol-ink": "var(--reg-primary)",
    "--blok-kartu": "rgb(255 255 255 / 0.08)",
    "--m3-state-color": "#ffffff",
  } as CSSProperties,
};

const TOMBOL = `${PIL} bg-[var(--blok-tombol)] font-semibold text-[var(--blok-tombol-ink)]`;
const ALIS = "text-title-small font-semibold text-[var(--blok-aksen)]";
const ISI = `whitespace-pre-line text-body-large leading-7 ${MUTED}`;

function Gambar({ src, alt, className }: { src: string; alt: string; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={`object-cover ${className}`} />;
}

function Wadah({ block, children, className = "py-16 sm:py-24" }: { block: LandingBlock; children: ReactNode; className?: string }) {
  return (
    <section id={block.id} className={`scroll-mt-24 text-[var(--reg-on-surface)] ${className}`} style={NADA[block.tone ?? "light"]}>
      <div className={SHELL}>{children}</div>
    </section>
  );
}

/** Judul blok + pengantar di kanan (layar lebar) atau di bawahnya (ponsel). */
function Kepala({ block, pengantar }: { block: LandingBlock; pengantar?: string }) {
  if (!block.heading?.trim() && !block.eyebrow?.trim() && !pengantar) return null;
  return (
    <div className="mb-10 flex flex-col gap-4 lg:mb-12 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
      <div className="flex max-w-[720px] flex-col gap-3">
        {block.eyebrow?.trim() ? <p className={ALIS}>{block.eyebrow.trim()}</p> : null}
        {block.heading?.trim() ? <h2 className={JUDUL}>{block.heading.trim()}</h2> : null}
      </div>
      {pengantar ? <p className={`max-w-[460px] ${ISI}`}>{pengantar}</p> : null}
    </div>
  );
}

function Tautan({ block }: { block: LandingBlock }) {
  const url = block.link_url?.trim();
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className={`${TOMBOL} self-start`}>
      {block.link_label?.trim() || "Selengkapnya"}
      <ArrowUpRight size={18} aria-hidden />
    </a>
  );
}

function TeksGambar({ block }: { block: LandingBlock }) {
  const kiri = block.image_side === "left";
  return (
    <Wadah block={block}>
      <div className={`grid items-center gap-10 lg:gap-20 ${block.image_url ? "lg:grid-cols-2" : ""}`}>
        <div className={`flex max-w-[640px] flex-col gap-5 ${kiri ? "lg:order-2" : ""}`}>
          {block.eyebrow?.trim() ? <p className={ALIS}>{block.eyebrow.trim()}</p> : null}
          {block.heading?.trim() ? <h2 className={JUDUL}>{block.heading.trim()}</h2> : null}
          {block.body?.trim() ? <p className={ISI}>{block.body.trim()}</p> : null}
          <Tautan block={block} />
        </div>
        {block.image_url ? (
          <Gambar src={block.image_url} alt={block.heading?.trim() ?? ""} className={`aspect-[4/3] w-full rounded-lg ${kiri ? "lg:order-1" : ""}`} />
        ) : null}
      </div>
    </Wadah>
  );
}

/** Pembungkus kartu: tautan bila ada `href`, selain itu `div`. */
function Kartu({ item, className, children }: { item: LandingBlockItem; className: string; children: ReactNode }) {
  const href = item.href?.trim();
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={`m3-state ${className}`}>{children}</a>
  ) : (
    <div className={className}>{children}</div>
  );
}

function Kartu2({ block }: { block: LandingBlock }) {
  const items = (block.items ?? []).filter((item) => item.title?.trim());
  const [utama, ...lain] = items;
  const samping = lain.slice(0, 2);
  const sisa = lain.slice(2);
  return (
    <Wadah block={block}>
      <Kepala block={block} pengantar={block.body?.trim()} />
      <div className={`grid gap-6 ${samping.length ? "lg:grid-cols-12" : ""}`}>
        <Kartu item={utama} className={`flex flex-col gap-4 rounded-lg ${samping.length ? "lg:col-span-7" : ""}`}>
          {utama.image_url ? <Gambar src={utama.image_url} alt="" className="aspect-[16/9] w-full rounded-lg" /> : null}
          {utama.label?.trim() ? <p className={ALIS}>{utama.label.trim()}</p> : null}
          <h3 className={`${HEAD} text-balance text-[24px] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[32px]`}>{utama.title?.trim()}</h3>
          {utama.body?.trim() ? <p className={ISI}>{utama.body.trim()}</p> : null}
        </Kartu>
        {samping.length ? (
          <div className="flex flex-col gap-6 lg:col-span-5">
            {samping.map((item, index) => (
              <Kartu key={index} item={item} className="flex items-center gap-5 rounded-lg bg-[var(--blok-kartu)] p-4">
                {item.image_url ? <Gambar src={item.image_url} alt="" className="size-24 shrink-0 rounded-md sm:size-40" /> : null}
                <div className="flex min-w-0 flex-col gap-2">
                  {item.label?.trim() ? <p className={ALIS}>{item.label.trim()}</p> : null}
                  <h3 className={`${HEAD} text-balance text-[19px] font-semibold leading-[1.25] tracking-[-0.01em] sm:text-[24px]`}>{item.title?.trim()}</h3>
                  {item.body?.trim() ? <p className={`line-clamp-3 text-body-medium ${MUTED}`}>{item.body.trim()}</p> : null}
                </div>
              </Kartu>
            ))}
          </div>
        ) : null}
      </div>
      {sisa.length ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sisa.map((item, index) => (
            <Kartu key={index} item={item} className="flex flex-col gap-3 rounded-lg bg-[var(--blok-kartu)] p-4">
              {item.image_url ? <Gambar src={item.image_url} alt="" className="aspect-[4/3] w-full rounded-md" /> : null}
              {item.label?.trim() ? <p className={ALIS}>{item.label.trim()}</p> : null}
              <h3 className={`${HEAD} text-balance text-[22px] font-semibold leading-[1.25] tracking-[-0.01em]`}>{item.title?.trim()}</h3>
              {item.body?.trim() ? <p className={`text-body-medium ${MUTED}`}>{item.body.trim()}</p> : null}
            </Kartu>
          ))}
        </div>
      ) : null}
    </Wadah>
  );
}

function Galeri({ block }: { block: LandingBlock }) {
  const foto = (block.items ?? []).filter((item): item is LandingBlockItem & { image_url: string } => Boolean(item.image_url));
  return (
    <Wadah block={block}>
      <Kepala block={block} pengantar={block.body?.trim()} />
      {/* Ponsel: satu baris geser samping. Layar lebar: foto pertama besar,
          sisanya kisi empat kolom. */}
      <ul className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:px-8 lg:hidden">
        {foto.map((item, index) => (
          <li key={index} className="w-[80%] shrink-0 snap-start sm:w-[45%]">
            <Gambar src={item.image_url} alt={item.label?.trim() ?? ""} className="aspect-[4/3] w-full rounded-lg" />
          </li>
        ))}
      </ul>
      <ul className="hidden gap-4 lg:grid lg:grid-cols-4">
        {foto.map((item, index) => (
          <li key={index} className={index === 0 && foto.length >= 3 ? "col-span-2 row-span-2" : ""}>
            <Gambar src={item.image_url} alt={item.label?.trim() ?? ""} className={`w-full rounded-lg ${index === 0 && foto.length >= 3 ? "h-full min-h-[440px]" : "aspect-[4/3]"}`} />
          </li>
        ))}
      </ul>
    </Wadah>
  );
}

function Angka({ block }: { block: LandingBlock }) {
  const items = (block.items ?? []).filter((item) => item.value?.trim() && item.label?.trim());
  return (
    <Wadah block={block} className="py-16 sm:py-20">
      <div className="flex flex-col gap-10 lg:flex-row lg:gap-16">
        {block.heading?.trim() ? (
          <h2 className={`${HEAD} max-w-[340px] text-balance text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[40px]`}>{block.heading.trim()}</h2>
        ) : null}
        <dl className="grid flex-1 gap-6 sm:grid-cols-2 lg:flex lg:gap-0">
          {items.map((item, index) => (
            // Keterangan (dt) lebih dulu di DOM sesuai aturan <dl>; angkanya
            // tampil di atas lewat flex-col-reverse.
            <div key={index} className="flex flex-col-reverse justify-end gap-2 border-t border-[var(--reg-outline-variant)] pt-4 lg:flex-1 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <dt className={`text-body-large ${MUTED}`}>{item.label?.trim()}</dt>
              <dd className={`${HEAD} text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums sm:text-[56px]`}>{item.value?.trim()}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Wadah>
  );
}

function inisial(nama: string) {
  return nama.split(/\s+/).filter(Boolean).slice(0, 2).map((kata) => kata[0]?.toUpperCase()).join("");
}

function Kutipan({ block }: { block: LandingBlock }) {
  const nama = block.name?.trim() ?? "";
  return (
    <Wadah block={block} className="py-20 sm:py-28">
      <figure className="flex max-w-[1000px] flex-col gap-8">
        <blockquote className={`${HEAD} text-balance text-[26px] font-semibold leading-[1.3] tracking-[-0.02em] sm:text-[40px] sm:leading-[1.25]`}>
          <p>“{block.quote?.trim()}”</p>
        </blockquote>
        <figcaption className="flex items-center gap-4">
          {block.image_url ? (
            <Gambar src={block.image_url} alt="" className="size-14 shrink-0 rounded-full" />
          ) : (
            <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[var(--blok-kartu)] text-title-medium font-semibold">
              {inisial(nama)}
            </span>
          )}
          <span className="flex flex-col">
            <span className="text-title-medium font-semibold">{nama}</span>
            {block.role?.trim() ? <span className={`text-body-large ${MUTED}`}>{block.role.trim()}</span> : null}
          </span>
        </figcaption>
      </figure>
    </Wadah>
  );
}

function Logo({ block }: { block: LandingBlock }) {
  const logo = (block.items ?? []).filter((item): item is LandingBlockItem & { image_url: string } => Boolean(item.image_url));
  return (
    <Wadah block={block} className="py-12 sm:py-16">
      <div className="flex flex-col gap-6 border-t border-[var(--reg-outline-variant)] pt-10 lg:flex-row lg:items-center lg:gap-16">
        {block.heading?.trim() ? (
          <h2 className={`shrink-0 text-title-medium font-semibold lg:w-48 ${MUTED}`}>{block.heading.trim()}</h2>
        ) : null}
        {/* Rata dan sama tinggi: ukuran logo bukan keputusan urutan unggah. */}
        <ul className="flex flex-1 flex-wrap items-center gap-x-10 gap-y-6">
          {logo.map((item, index) => (
            <li key={index} className="flex h-12 items-center sm:h-14">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image_url} alt={item.label?.trim() ?? ""} loading="lazy" className="max-h-full w-auto max-w-[180px] object-contain" />
            </li>
          ))}
        </ul>
      </div>
    </Wadah>
  );
}

function Unduhan({ block }: { block: LandingBlock }) {
  return (
    <Wadah block={block} className="py-12 sm:py-16">
      <div className="flex flex-col gap-8 rounded-lg bg-[var(--blok-kartu)] p-6 sm:flex-row sm:items-center sm:gap-12 sm:p-12">
        <span aria-hidden className="flex size-20 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--blok-aksen)_10%,transparent)] text-[var(--blok-aksen)] sm:size-28">
          <FilePdf size={44} weight="light" />
        </span>
        <div className="flex flex-col gap-4">
          <h2 className={`${HEAD} text-balance text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[36px]`}>{block.heading?.trim()}</h2>
          {block.body?.trim() ? <p className={`max-w-[620px] ${ISI}`}>{block.body.trim()}</p> : null}
          <a href={block.link_url?.trim()} target="_blank" rel="noreferrer" className={`${TOMBOL} self-start`}>
            {block.link_label?.trim() || "Unduh materi"}
            <ArrowUpRight size={18} aria-hidden />
          </a>
        </div>
      </div>
    </Wadah>
  );
}

function Ajakan({ block, daftarUrl, daftarLabel }: { block: LandingBlock; daftarUrl: string | null; daftarLabel: string }) {
  return (
    <section id={block.id} className="scroll-mt-24 py-12 sm:py-16">
      <div className={SHELL}>
        <div
          className="flex flex-col gap-8 rounded-lg bg-[var(--reg-brand)] px-6 py-12 text-[var(--reg-on-brand)] sm:px-16 sm:py-16 lg:flex-row lg:items-center lg:justify-between"
          style={{ "--m3-state-color": "var(--reg-brand)" } as CSSProperties}
        >
          <div className="flex max-w-[720px] flex-col gap-3">
            <h2 className={`${HEAD} text-balance text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[44px]`}>{block.heading?.trim()}</h2>
            {block.body?.trim() ? <p className="text-body-large opacity-90">{block.body.trim()}</p> : null}
          </div>
          {daftarUrl ? (
            <Link href={daftarUrl} className={`${PIL} shrink-0 self-start bg-[var(--reg-on-brand)] font-semibold text-[var(--reg-brand)] lg:self-auto`}>
              {block.link_label?.trim() || daftarLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function LandingBlockView({ block, daftarUrl, daftarLabel }: { block: LandingBlock; daftarUrl: string | null; daftarLabel: string }) {
  if (!landingBlockHasContent(block)) return null;
  switch (block.type) {
    case "text_image": return <TeksGambar block={block} />;
    case "cards": return <Kartu2 block={block} />;
    case "gallery": return <Galeri block={block} />;
    case "stats": return <Angka block={block} />;
    case "quote": return <Kutipan block={block} />;
    case "logos": return <Logo block={block} />;
    case "download": return <Unduhan block={block} />;
    case "cta": return <Ajakan block={block} daftarUrl={daftarUrl} daftarLabel={daftarLabel} />;
  }
}
