import { ArrowUpRight, Check, FileArrowDown } from "@phosphor-icons/react/dist/ssr";
import type { LandingBlock } from "@/lib/domain";
import type { LandingLang } from "@/lib/landing-i18n";

// PROTO PR 2 (mockup): blok halaman acara sebagai kartu di halaman peserta.
// Bentuk ringkas yang sama dengan kartu Dashboard lain (judul 22px, isi 16px),
// bukan bagian selebar layar dengan judul besar.

const KARTU = "rounded-[20px] bg-white p-5 shadow-[0_1px_2px_rgb(16_24_40/0.06)] sm:p-6";
const MUTED = "text-[var(--teks-redup,#5F6B7F)]";
const ALIS = "text-[12px] font-bold uppercase leading-4 tracking-[0.08em] text-[var(--alis,var(--reg-primary))]";
const TOMBOL = "m3-state inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--aksi-putih,var(--aksi,var(--reg-primary)))] px-5 font-bold text-[var(--on-aksi-putih,var(--on-aksi,var(--reg-on-primary)))]";

function Kepala({ block }: { block: LandingBlock }) {
  return (
    <div className="flex flex-col gap-1">
      {block.eyebrow?.trim() ? <p className={ALIS}>{block.eyebrow.trim()}</p> : null}
      {block.heading?.trim() ? <h2 className="text-title-large font-bold [overflow-wrap:anywhere]">{block.heading.trim()}</h2> : null}
    </div>
  );
}

function Isi({ teks }: { teks?: string }) {
  return teks?.trim() ? <p className={`whitespace-pre-line text-body-large ${MUTED}`}>{teks.trim()}</p> : null;
}

function Tautan({ href, label }: { href?: string; label?: string }) {
  if (!href?.trim() || !label?.trim()) return null;
  return (
    <a href={href} className={`${TOMBOL} self-start text-title-small`}>
      {label.trim()}
      <ArrowUpRight size={16} weight="bold" aria-hidden />
    </a>
  );
}

export function KartuBlok({ block }: { block: LandingBlock; lang: LandingLang }) {
  const items = block.items ?? [];
  switch (block.type) {
    case "text_image":
      return (
        <section className={`${KARTU} flex flex-col gap-4`}>
          {block.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={block.image_url} alt="" loading="lazy" decoding="async" className="-mx-1 aspect-[2/1] w-[calc(100%+0.5rem)] rounded-[14px] bg-[#E6E9EE] object-cover" />
          ) : null}
          <Kepala block={block} />
          <Isi teks={block.body} />
          <Tautan href={block.link_url} label={block.link_label} />
        </section>
      );
    case "points":
      return (
        <section className={KARTU}>
          <Kepala block={block} />
          {block.body?.trim() ? <div className="mt-2"><Isi teks={block.body} /></div> : null}
          <ul className="mt-3">
            {items.filter((item) => item.title?.trim() || item.body?.trim()).map((item, index) => (
              <li key={index} className={`flex gap-3 py-3 ${index > 0 ? "border-t border-[#E6E9EE]" : ""}`}>
                <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--chip-aksi,var(--reg-primary-container))] text-[var(--on-chip-aksi,var(--reg-on-primary-container))]">
                  <Check size={14} weight="bold" />
                </span>
                <span className="min-w-0">
                  {item.title?.trim() ? <span className="block text-body-large font-semibold">{item.title.trim()}</span> : null}
                  {item.body?.trim() ? <span className={`block text-body-medium ${MUTED}`}>{item.body.trim()}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      );
    case "download":
      return (
        <section className={`${KARTU} flex items-center gap-4`}>
          <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-[var(--chip-merek,var(--reg-primary-container))] text-[var(--on-chip-merek,var(--reg-on-primary-container))]">
            <FileArrowDown size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <Kepala block={block} />
          </div>
          <Tautan href={block.link_url} label={block.link_label || "Unduh"} />
        </section>
      );
    default:
      return (
        <section className={`${KARTU} flex flex-col gap-3`}>
          <Kepala block={block} />
          <Isi teks={block.body} />
        </section>
      );
  }
}
