import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, DownloadSimple } from "@phosphor-icons/react/dist/ssr";
import {
  landingBlockHasContent,
  landingBlockLayout,
  type LandingBlock,
  type LandingBlockItem,
  type LandingBlockTone,
} from "@/lib/domain";
import { HEAD, JUDUL, MUTED, PIL, SHELL } from "./styles";

/**
 * Blok dari pustaka blok, tata letak Modern. Rancangan: Figma "Halaman acara
 * FHF (desain dulu)" (susunan dan isi) dan "Pustaka blok (usulan)" (CMS).
 *
 * Tiap blok adalah satu `<section>` selebar layar dengan grid halaman di
 * dalamnya, supaya latar Abu-abu dan Merek gelap bisa membentang penuh.
 * Susunan tiap jenis dikunci di sini; admin hanya mengisi teks dan gambar.
 * Blok tanpa isi tidak dirender (`landingBlockHasContent`).
 *
 * Keseimbangan teks dan gambar dijaga oleh dua hal, bukan oleh pemotongan teks:
 * rasio tiap slot gambar dikunci di sini (gambar dipotong `object-cover`), dan
 * panjang tiap kolom teks dibatasi `landingBlockLimits` di CMS dan server.
 * Judul dan tombol tidak pernah dipotong dengan titik-titik.
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
const TOMBOL_GARIS = `${PIL} border border-[color-mix(in_srgb,currentColor_35%,transparent)] font-semibold`;
const ALIS = "text-title-small font-semibold text-[var(--blok-aksen)]";
/** Paragraf: 17px, tinggi baris 1.6. Lebar kolom pemakainya menjaga 60 sampai 75 karakter per baris. */
const ISI = `text-body-large leading-[1.6] ${MUTED}`;
/** Teks panjang dari admin (tautan, nama berkas) boleh patah di mana saja, bukan menggeser halaman. */
const PATAH = "[overflow-wrap:anywhere]";

/**
 * Bayangan bawah kartu foto bertulisan. Pekat di bagian bawah tempat teks
 * putih berdiri; batas isi menjaga teksnya tidak naik melewati separuh kartu.
 */
const BAYANGAN_KARTU = "linear-gradient(to bottom, rgb(8 12 26 / 0) 10%, rgb(8 12 26 / 0.45) 45%, rgb(8 12 26 / 0.9))";
/** Lapisan rata Pita ajakan berfoto. Dikunci, bukan pilihan admin, supaya teks terbaca di foto apa pun. */
const LAPISAN_AJAKAN = "rgb(8 12 26 / 0.58)";

function Gambar({ src, alt, className }: { src: string; alt: string; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={`object-cover ${className}`} />;
}

/** Paragraf dipisah baris kosong di CMS; enter tunggal tetap jadi pindah baris. */
function Paragraf({ teks, className }: { teks?: string; className: string }) {
  const bagian = (teks ?? "").trim().split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  if (bagian.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      {bagian.map((item, index) => (
        <p key={index} className={`whitespace-pre-line ${className}`}>{item}</p>
      ))}
    </div>
  );
}

/** Tautan luar dibuka di tab baru; jangkar (#agenda) tetap di halaman ini. */
function Taut({ href, className, style, children }: { href: string; className: string; style?: CSSProperties; children: ReactNode }) {
  const luar = /^https?:\/\//.test(href);
  return (
    <a href={href} className={className} style={style} {...(luar ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
      {children}
    </a>
  );
}

function IkonTaut({ href, size = 18 }: { href: string; size?: number }) {
  return /^https?:\/\//.test(href) ? <ArrowUpRight size={size} aria-hidden /> : <ArrowDown size={size} aria-hidden />;
}

function Wadah({ block, children, className = "py-12 sm:py-16 lg:py-[72px]" }: { block: LandingBlock; children: ReactNode; className?: string }) {
  return (
    <section id={block.id} className={`scroll-mt-24 text-[var(--reg-on-surface)] ${className}`} style={NADA[block.tone ?? "light"]}>
      <div className={SHELL}>{children}</div>
    </section>
  );
}

/** Tombol garis di kanan judul blok (mis. "Lihat susunan acara"). */
function TombolKepala({ block }: { block: LandingBlock }) {
  const url = block.link_url?.trim();
  if (!url) return null;
  return (
    <Taut href={url} className={`${TOMBOL_GARIS} shrink-0 self-start lg:self-auto`}>
      {block.link_label?.trim() || "Selengkapnya"}
      <IkonTaut href={url} />
    </Taut>
  );
}

/** Judul blok + pengantar dan tombol di kanan (layar lebar) atau di bawahnya (ponsel). */
function Kepala({ block, aksi }: { block: LandingBlock; aksi?: ReactNode }) {
  const pengantar = block.body?.trim();
  if (!block.heading?.trim() && !block.eyebrow?.trim() && !pengantar && !aksi) return null;
  return (
    <div className="mb-10 flex flex-col gap-5 lg:mb-12 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
      <div className="flex max-w-[720px] flex-col gap-3">
        {block.eyebrow?.trim() ? <p className={ALIS}>{block.eyebrow.trim()}</p> : null}
        {block.heading?.trim() ? <h2 className={JUDUL}>{block.heading.trim()}</h2> : null}
      </div>
      {pengantar ? <p className={`max-w-[440px] ${ISI}`}>{pengantar}</p> : null}
      {aksi}
    </div>
  );
}

/** Judul di kolom kiri, isi di kanan. Dipakai Kartu poin bentuk daftar. */
function KepalaKiri({ block }: { block: LandingBlock }) {
  return (
    <div className="flex flex-col gap-4">
      {block.eyebrow?.trim() ? <p className={ALIS}>{block.eyebrow.trim()}</p> : null}
      {block.heading?.trim() ? <h2 className={JUDUL}>{block.heading.trim()}</h2> : null}
      {block.body?.trim() ? <p className={ISI}>{block.body.trim()}</p> : null}
    </div>
  );
}

// ---- Teks + gambar -----------------------------------------------------------

function TeksGambar({ block }: { block: LandingBlock }) {
  const kiri = block.image_side === "left";
  const url1 = block.link_url?.trim();
  const url2 = block.link2_url?.trim();
  const fakta = block.fact_title?.trim() || block.fact_body?.trim();
  return (
    <Wadah block={block}>
      <div className={`grid items-center gap-10 lg:gap-20 ${block.image_url ? "lg:grid-cols-2" : ""}`}>
        {block.image_url ? (
          // Gambar lebih dulu di DOM: di ponsel foto tampil di atas teks seperti
          // rancangan. Rasio dikunci 14:13 (560×520); dengan batas isi 480
          // karakter, kolom teks di sebelahnya tidak pernah lebih tinggi.
          <div className={`relative aspect-[14/13] overflow-hidden rounded-lg ${kiri ? "" : "lg:order-2"}`}>
            <Gambar src={block.image_url} alt="" className="absolute inset-0 size-full" />
            {fakta ? (
              <div className="absolute left-4 top-4 flex max-w-[calc(100%-2rem)] flex-col gap-1 rounded-lg bg-[rgb(10_14_30/0.72)] px-5 py-4 text-white backdrop-blur-[6px] sm:left-6 sm:top-6 sm:px-6">
                {block.fact_title?.trim() ? (
                  <p className={`${HEAD} text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] tabular-nums sm:text-[36px]`}>{block.fact_title.trim()}</p>
                ) : null}
                {block.fact_body?.trim() ? <p className="text-body-medium text-white/85">{block.fact_body.trim()}</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={`flex max-w-[600px] flex-col gap-5 ${kiri ? "" : "lg:order-1"}`}>
          {block.eyebrow?.trim() ? <p className={ALIS}>{block.eyebrow.trim()}</p> : null}
          {block.heading?.trim() ? <h2 className={JUDUL}>{block.heading.trim()}</h2> : null}
          <Paragraf teks={block.body} className={ISI} />
          {url1 || url2 ? (
            <div className="flex flex-wrap gap-3 pt-3">
              {url1 ? (
                <Taut href={url1} className={TOMBOL}>
                  {block.link_label?.trim() || "Selengkapnya"}
                  <IkonTaut href={url1} />
                </Taut>
              ) : null}
              {url2 ? (
                <Taut href={url2} className={TOMBOL_GARIS}>
                  {block.link2_label?.trim() || "Selengkapnya"}
                  <IkonTaut href={url2} />
                </Taut>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Wadah>
  );
}

// ---- Kartu bergambar -----------------------------------------------------------

/** Pembungkus kartu: tautan bila ada `href`, selain itu `div`. */
function Kartu({ item, className, style, children }: { item: LandingBlockItem; className: string; style?: CSSProperties; children: ReactNode }) {
  const href = item.href?.trim();
  return href ? (
    <Taut href={href} className={`m3-state ${className}`} style={style}>{children}</Taut>
  ) : (
    <div className={className} style={style}>{children}</div>
  );
}

/** Foto bertulisan: judul putih di atas foto berbayang, 2 sampai 4 kartu. */
function KartuFoto({ block, items }: { block: LandingBlock; items: LandingBlockItem[] }) {
  const tiga = items.length === 3;
  return (
    <Wadah block={block}>
      <Kepala block={block} aksi={<TombolKepala block={block} />} />
      <ul className={`grid gap-4 sm:gap-6 md:grid-cols-2 ${tiga ? "lg:grid-cols-3" : ""}`}>
        {items.map((item, index) => (
          <li key={index} className="flex">
            {/* Teks di dalam alur (bukan absolut), jadi kartu memanjang bila
                teksnya lebih tinggi dari rasio, bukan memotongnya. */}
            <Kartu
              item={item}
              className={`relative isolate flex aspect-[5/6] w-full flex-col justify-end gap-3 overflow-hidden rounded-lg p-5 text-white sm:p-8 md:aspect-[4/5] ${
                tiga ? "lg:aspect-square" : "lg:aspect-[3/2]"
              }`}
              style={{ backgroundColor: LATAR_GELAP, "--m3-state-color": "#fff" } as CSSProperties}
            >
              {item.image_url ? <Gambar src={item.image_url} alt="" className="absolute inset-0 -z-10 size-full" /> : null}
              <div aria-hidden className="absolute inset-0 -z-10" style={{ background: BAYANGAN_KARTU }} />
              {item.label?.trim() || item.value?.trim() ? (
                <div className="flex flex-wrap gap-1.5">
                  {[item.label, item.value].map((chip, chipIndex) =>
                    chip?.trim() ? (
                      <span key={chipIndex} className="rounded-full border border-white/25 bg-white/15 px-3 py-1 text-label-large tabular-nums">
                        {chip.trim()}
                      </span>
                    ) : null,
                  )}
                </div>
              ) : null}
              <h3 className={`${HEAD} text-balance text-[24px] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[28px]`}>{item.title?.trim()}</h3>
              {item.body?.trim() ? <p className="max-w-[560px] text-body-medium leading-[1.55] text-white/85 sm:text-body-large">{item.body.trim()}</p> : null}
            </Kartu>
          </li>
        ))}
      </ul>
    </Wadah>
  );
}

/** Tiga kolom setara: foto 3:2 di atas, teks di bawah. */
function KartuKolom({ block, items }: { block: LandingBlock; items: LandingBlockItem[] }) {
  return (
    <Wadah block={block}>
      <Kepala block={block} aksi={<TombolKepala block={block} />} />
      <ul className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => {
          const href = item.href?.trim();
          return (
            <li key={index} className="flex">
              <Kartu item={item} className="flex w-full flex-col gap-3.5 rounded-lg">
                {item.image_url ? <Gambar src={item.image_url} alt="" className="aspect-[3/2] w-full rounded-lg" /> : null}
                {item.label?.trim() ? <p className={`${ALIS} pt-1`}>{item.label.trim()}</p> : null}
                <h3 className={`${HEAD} text-balance text-[22px] font-semibold leading-[1.25] tracking-[-0.01em] sm:text-[24px]`}>{item.title?.trim()}</h3>
                {item.body?.trim() || href ? (
                  <p className={`${ISI} ${PATAH}`}>
                    {item.body?.trim()}
                    {href ? (
                      <span className="ml-1.5 inline-flex translate-y-0.5 text-[var(--blok-aksen)]">
                        <IkonTaut href={href} size={16} />
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </Kartu>
            </li>
          );
        })}
      </ul>
    </Wadah>
  );
}

/** Utama besar: kartu pertama besar, dua kecil di sampingnya, sisanya tiga kolom. */
function KartuUtama({ block, items }: { block: LandingBlock; items: LandingBlockItem[] }) {
  const [utama, ...lain] = items;
  const samping = lain.slice(0, 2);
  const sisa = lain.slice(2);
  return (
    <Wadah block={block}>
      <Kepala block={block} aksi={<TombolKepala block={block} />} />
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
                  {item.body?.trim() ? <p className={`text-body-medium ${MUTED}`}>{item.body.trim()}</p> : null}
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
              {item.image_url ? <Gambar src={item.image_url} alt="" className="aspect-[3/2] w-full rounded-md" /> : null}
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

function KartuBergambar({ block }: { block: LandingBlock }) {
  const items = (block.items ?? []).filter((item) => item.title?.trim());
  const layout = landingBlockLayout(block);
  if (layout === "overlay") return <KartuFoto block={block} items={items} />;
  if (layout === "columns") return <KartuKolom block={block} items={items} />;
  return <KartuUtama block={block} items={items} />;
}

// ---- Kartu poin ----------------------------------------------------------------

/** Kelas literal supaya Tailwind menemukannya; jumlah kolom = jumlah kartu. */
const KOLOM_POIN: Record<number, string> = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" };

function nomor(index: number) {
  return String(index + 1).padStart(2, "0");
}

function KartuPoin({ block }: { block: LandingBlock }) {
  const items = (block.items ?? []).filter((item) => item.title?.trim() || item.body?.trim());
  const layout = landingBlockLayout(block);

  if (layout === "cards") {
    return (
      <Wadah block={block}>
        <Kepala block={block} />
        {/* Satu baris, kartu setinggi yang tertinggi (grid meregangkan butir). */}
        <ol className={`grid gap-4 sm:gap-6 ${KOLOM_POIN[Math.min(items.length, 4)]}`}>
          {items.map((item, index) => (
            <li key={index} className="flex gap-4 rounded-lg bg-[var(--blok-kartu)] p-5 sm:flex-col sm:gap-3 sm:p-7">
              <span aria-hidden className={`${HEAD} text-[26px] font-semibold leading-none tracking-[-0.02em] text-[var(--blok-aksen)] tabular-nums sm:text-[30px]`}>
                {nomor(index)}
              </span>
              <div className="flex min-w-0 flex-col gap-2">
                {item.title?.trim() ? <h3 className="text-title-large font-semibold leading-[1.3]">{item.title.trim()}</h3> : null}
                {item.body?.trim() ? <p className={`text-body-medium leading-[1.55] ${MUTED}`}>{item.body.trim()}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </Wadah>
    );
  }

  return (
    <Wadah block={block}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-20">
        <KepalaKiri block={block} />
        {layout === "numbered" ? (
          <ol className="border-b border-[var(--reg-outline-variant)]">
            {items.map((item, index) => (
              <li key={index} className="flex gap-5 border-t border-[var(--reg-outline-variant)] py-5 sm:gap-8 sm:py-6">
                <span aria-hidden className={`${HEAD} w-8 shrink-0 text-[22px] font-semibold leading-[1.3] text-[var(--blok-aksen)] tabular-nums sm:text-[24px]`}>
                  {nomor(index)}
                </span>
                <div className="flex min-w-0 max-w-[680px] flex-col gap-1.5">
                  {item.title?.trim() ? <h3 className="text-title-large font-semibold">{item.title.trim()}</h3> : null}
                  {item.body?.trim() ? <p className="text-body-large leading-[1.6]">{item.body.trim()}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <ul className="grid border-b border-[var(--reg-outline-variant)] sm:grid-cols-2 sm:gap-x-8">
            {items.map((item, index) => (
              <li key={index} className="flex gap-3.5 border-t border-[var(--reg-outline-variant)] py-4 sm:py-5">
                <span aria-hidden className="mt-2 size-2 shrink-0 rounded-[2px] bg-[var(--blok-aksen)]" />
                <span className="text-body-large leading-[1.55]">{item.title?.trim() || item.body?.trim()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Wadah>
  );
}

// ---- Galeri, angka, kutipan, logo ----------------------------------------------

function Galeri({ block }: { block: LandingBlock }) {
  const foto = (block.items ?? []).filter((item): item is LandingBlockItem & { image_url: string } => Boolean(item.image_url));
  return (
    <Wadah block={block}>
      <Kepala block={block} />
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
          <h2 className={`${HEAD} max-w-[360px] text-balance text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[36px]`}>{block.heading.trim()}</h2>
        ) : null}
        <dl className="grid flex-1 gap-6 sm:grid-cols-2 lg:flex lg:gap-0">
          {items.map((item, index) => (
            // Keterangan (dt) lebih dulu di DOM sesuai aturan <dl>; angkanya
            // tampil di atas lewat flex-col-reverse.
            <div key={index} className="flex flex-col-reverse justify-end gap-2 border-t border-[var(--reg-outline-variant)] pt-4 lg:flex-1 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <dt className={`text-body-medium leading-[1.55] sm:text-body-large ${MUTED}`}>{item.label?.trim()}</dt>
              <dd className={`${HEAD} whitespace-nowrap text-[44px] font-semibold leading-none tracking-[-0.02em] tabular-nums sm:text-[56px]`}>{item.value?.trim()}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className={`mt-10 border-t border-[var(--reg-outline-variant)] pt-5 text-body-small ${MUTED}`}>Sumber: {block.source?.trim()}</p>
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
    <Wadah block={block} className="border-b border-[var(--reg-outline-variant)] py-7 sm:py-9">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-16">
        {block.heading?.trim() ? (
          <h2 className={`shrink-0 text-title-small font-medium lg:w-44 ${MUTED}`}>{block.heading.trim()}</h2>
        ) : null}
        {/* Rata dan sama tinggi (40px): ukuran logo bukan keputusan urutan unggah. */}
        <ul className="flex flex-1 flex-wrap items-center gap-x-10 gap-y-5">
          {logo.map((item, index) => {
            const gambar = (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt={item.label?.trim() ?? ""} loading="lazy" className="max-h-full w-auto max-w-[160px] object-contain" />
            );
            const href = item.href?.trim();
            return (
              <li key={index} className="flex h-10 items-center">
                {href ? <Taut href={href} className="m3-state flex h-full items-center rounded-md">{gambar}</Taut> : gambar}
              </li>
            );
          })}
        </ul>
      </div>
    </Wadah>
  );
}

// ---- Unduhan dan ajakan ----------------------------------------------------------

function Unduhan({ block }: { block: LandingBlock }) {
  const url = block.link_url?.trim() ?? "";
  return (
    <Wadah block={block} className="py-12 sm:py-16">
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-20">
        <div className="flex max-w-[600px] flex-col gap-5">
          {block.eyebrow?.trim() ? <p className={ALIS}>{block.eyebrow.trim()}</p> : null}
          <h2 className={JUDUL}>{block.heading?.trim()}</h2>
          {block.body?.trim() ? <p className={ISI}>{block.body.trim()}</p> : null}
          <Taut href={url} className={`${TOMBOL} mt-3 self-start`}>
            {block.link_label?.trim() || "Unduh materi"}
            <DownloadSimple size={18} aria-hidden />
          </Taut>
        </div>
        {/* Sampul: gambar 3:4 dari admin, atau halaman depan yang disusun dari
            judul blok. Hiasan, jadi disembunyikan dari pembaca layar dan dari
            ponsel tempat ruangnya lebih berguna untuk tombol. */}
        <div aria-hidden className="relative mr-6 hidden w-[220px] sm:block">
          <div className="absolute inset-0 translate-x-6 translate-y-1.5 -rotate-6 rounded-md bg-[var(--reg-outline-variant)]" />
          {block.image_url ? (
            <Gambar src={block.image_url} alt="" className="relative aspect-[3/4] w-full rounded-md shadow-[0_12px_32px_rgb(13_20_51/0.18)]" />
          ) : (
            <div className="relative flex aspect-[3/4] w-full flex-col gap-2.5 rounded-md bg-white p-6 text-[#12161f] shadow-[0_12px_32px_rgb(13_20_51/0.18)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5b6476]">{block.eyebrow?.trim() || "Dokumen"}</p>
              <p className={`${HEAD} text-[20px] font-semibold leading-[1.15] tracking-[-0.01em]`}>{block.heading?.trim()}</p>
              <span className="mt-2 flex flex-col gap-1.5">
                {["w-full", "w-11/12", "w-4/5", "w-full", "w-2/3"].map((lebar, index) => (
                  <span key={index} className={`h-1 rounded-full bg-[#dfe3ea] ${lebar}`} />
                ))}
              </span>
            </div>
          )}
        </div>
      </div>
    </Wadah>
  );
}

function Ajakan({ block, daftarUrl, daftarLabel }: { block: LandingBlock; daftarUrl: string | null; daftarLabel: string }) {
  if (block.image_url) {
    return (
      <section id={block.id} className="scroll-mt-24 py-12 sm:py-16">
        <div className={SHELL}>
          <div className="relative isolate flex min-h-[440px] flex-col items-center justify-center gap-4 overflow-hidden rounded-lg px-6 py-16 text-center text-white sm:px-16 lg:min-h-[420px]">
            <Gambar src={block.image_url} alt="" className="absolute inset-0 -z-10 size-full" />
            <div aria-hidden className="absolute inset-0 -z-10" style={{ background: LAPISAN_AJAKAN }} />
            <h2 className={`${HEAD} max-w-[720px] text-balance text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[48px]`}>{block.heading?.trim()}</h2>
            {block.body?.trim() ? <p className="max-w-[560px] text-body-large leading-[1.6] text-white/90">{block.body.trim()}</p> : null}
            {daftarUrl ? (
              <Link
                href={daftarUrl}
                className={`${PIL} mt-3 bg-white font-semibold text-[var(--reg-primary)]`}
                style={{ "--m3-state-color": "var(--reg-primary)" } as CSSProperties}
              >
                {block.link_label?.trim() || daftarLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

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

/**
 * Tautan jangkar (#agenda) ke bagian yang tidak tampil di halaman adalah tombol
 * mati: tombolnya disembunyikan. `jangkar` = id bagian yang benar-benar dirender.
 */
function tanpaJangkarMati(block: LandingBlock, jangkar: ReadonlySet<string> | undefined): LandingBlock {
  if (!jangkar) return block;
  const mati = (url: string | null | undefined) => Boolean(url?.trim().startsWith("#") && !jangkar.has(url.trim().slice(1)));
  if (!mati(block.link_url) && !mati(block.link2_url)) return block;
  return {
    ...block,
    ...(mati(block.link_url) ? { link_url: undefined } : null),
    ...(mati(block.link2_url) ? { link2_url: undefined } : null),
  };
}

export function LandingBlockView({
  block: asli,
  daftarUrl,
  daftarLabel,
  jangkar,
}: {
  block: LandingBlock;
  daftarUrl: string | null;
  daftarLabel: string;
  jangkar?: ReadonlySet<string>;
}) {
  if (!landingBlockHasContent(asli)) return null;
  const block = tanpaJangkarMati(asli, jangkar);
  switch (block.type) {
    case "text_image": return <TeksGambar block={block} />;
    case "cards": return <KartuBergambar block={block} />;
    case "points": return <KartuPoin block={block} />;
    case "gallery": return <Galeri block={block} />;
    case "stats": return <Angka block={block} />;
    case "quote": return <Kutipan block={block} />;
    case "logos": return <Logo block={block} />;
    case "download": return <Unduhan block={block} />;
    case "cta": return <Ajakan block={block} daftarUrl={daftarUrl} daftarLabel={daftarLabel} />;
  }
}
