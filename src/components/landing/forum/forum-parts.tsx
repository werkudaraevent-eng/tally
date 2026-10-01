import { CaretDown, Plus } from "@phosphor-icons/react/dist/ssr";
import type { AgendaPreview } from "@/lib/landing-agenda";
import type { LandingSpeaker } from "@/lib/domain";
import type { ForumLabels } from "./labels";
import { BAYANGAN_KARTU, H_BAGIAN, H_KARTU, H_PANEL, TEKS_BESAR, TEKS_MENU, WADAH } from "./styles";

/** Gambar penuh bidang. Semua gambar Forum dari CMS, jadi tidak ada ukuran pasti. */
export function Foto({ src, className = "", alt = "" }: { src: string; className?: string; alt?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={`absolute inset-0 size-full object-cover ${className}`} />;
}

/**
 * Pita gambar dengan satu kalimat besar di tengah: tempat dan tanggal di
 * Beranda dan Informasi praktis. Tanpa gambar, pita memakai warna primer.
 */
export function PitaTanggal({ gambar, teks }: { gambar: string | null; teks: string }) {
  return (
    <section data-bagian="tanggal" className={`${WADAH} relative isolate flex min-h-[clamp(160px,19.3vw,371px)] items-center justify-center overflow-hidden bg-[var(--f-primary)] px-6 py-10`}>
      {gambar ? (
        <>
          <Foto src={gambar} className="-z-10" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-black/40" />
        </>
      ) : null}
      <p
        className={`max-w-[1333px] text-balance text-center text-[clamp(26px,3.85vw,74px)] font-bold leading-[1.2] tracking-[-0.02em] ${
          gambar ? "text-white" : "text-[var(--f-on-primary)]"
        }`}
      >
        {teks}
      </p>
    </section>
  );
}

function jamSesi(item: AgendaPreview["items"][number], zona: string) {
  if (!item.time) return "";
  return item.end && item.end !== item.time ? `${item.time} – ${item.end} ${zona}` : `${item.time} ${zona}`;
}

/**
 * Susunan acara per bagian Rundown (di Figma: per hari). Beranda: semua bagian
 * tertutup dengan tanda +, Program acara: terbuka dengan panah. Pakai
 * <details> supaya bisa dibuka tanpa skrip.
 */
export function PanelSusunan({
  agenda,
  zona,
  label,
  terbuka,
}: {
  agenda: AgendaPreview[];
  zona: string;
  label: ForumLabels;
  terbuka: boolean;
}) {
  return (
    <div
      className={`bg-[var(--f-panel)] px-[clamp(16px,3.33vw,64px)] pb-[clamp(32px,3.7vw,71px)] pt-[clamp(32px,4.43vw,85px)] ${
        terbuka ? "rounded-[20px]" : "rounded-[30px]"
      }`}
    >
      <h3 className={`${H_PANEL} text-center text-[var(--f-title)]`}>{label.susunan}</h3>
      <div className="mt-[clamp(24px,2.71vw,52px)] border-t border-[#2e2e2e]/60">
        {agenda.map((bagian, index) => (
          <details key={`${bagian.sectionTitle}-${index}`} open={terbuka} className="group border-b border-[#2e2e2e]/60">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-[clamp(16px,1.41vw,27px)] [&::-webkit-details-marker]:hidden">
              <span className="text-[clamp(17px,1.25vw,24px)] font-bold leading-[1.35] text-[var(--f-title)]">
                {bagian.sectionTitle || `${label.susunan} ${index + 1}`}
              </span>
              {terbuka ? (
                <CaretDown size={18} weight="bold" aria-hidden className="shrink-0 text-[var(--f-title)] transition-transform group-open:rotate-180" />
              ) : (
                <Plus size={22} weight="bold" aria-hidden className="shrink-0 text-[var(--f-primary-text)] transition-transform group-open:rotate-45" />
              )}
            </summary>
            <div className="pb-[clamp(16px,1.41vw,27px)]">
              <table className={`w-full border-collapse bg-white text-left ${TEKS_MENU}`}>
                <thead>
                  <tr className="bg-[var(--f-primary)] text-[var(--f-on-primary)]">
                    <th scope="col" className="w-[29%] py-[clamp(10px,0.94vw,18px)] pl-[clamp(12px,2.29vw,44px)] pr-3 font-medium">{label.waktu}</th>
                    <th scope="col" className="py-[clamp(10px,0.94vw,18px)] pr-[clamp(12px,2.29vw,44px)] font-medium">{label.sesi}</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--f-title)]">
                  {bagian.items.map((item, nomor) => (
                    <tr key={nomor} className={nomor % 2 === 0 ? "bg-[#f3f3f3]" : "bg-[#fafafa]"}>
                      <td className="py-[clamp(10px,0.94vw,18px)] pl-[clamp(12px,2.29vw,44px)] pr-3 align-top tabular-nums">{jamSesi(item, zona)}</td>
                      <td className="py-[clamp(10px,0.94vw,18px)] pr-[clamp(12px,2.29vw,44px)] align-top">
                        {item.title}
                        {item.subtitle ? <span className="block text-[0.85em] font-normal opacity-75">{item.subtitle}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function inisial(nama: string) {
  return nama
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((kata) => kata[0]?.toUpperCase())
    .join("");
}

/** Kartu foto dengan judul dan teks di bawahnya, gaya kartu Dress code Figma. */
export function KartuFoto({ gambar, judul, teks, sisaInisial }: { gambar: string | null; judul: string; teks?: string | null; sisaInisial?: boolean }) {
  return (
    <li className="flex flex-col gap-[clamp(16px,1.04vw,20px)]">
      <div className={`relative aspect-[480/425] overflow-hidden bg-[#ccc] ${BAYANGAN_KARTU}`}>
        {gambar ? (
          <Foto src={gambar} className="object-top" />
        ) : sisaInisial ? (
          <div aria-hidden className="absolute inset-0 flex items-center justify-center bg-[var(--f-primary)] text-[clamp(40px,4.17vw,80px)] font-bold text-[var(--f-on-primary)]">
            {inisial(judul)}
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-[clamp(8px,1.04vw,20px)] pt-[clamp(8px,1.6vw,30px)]">
        <h3 className={H_KARTU}>{judul}</h3>
        {teks ? <p className={`${TEKS_BESAR} whitespace-pre-line text-justify hyphens-auto`}>{teks}</p> : null}
      </div>
    </li>
  );
}

export function BagianPembicara({ speakers, label }: { speakers: LandingSpeaker[]; label: ForumLabels }) {
  return (
    <section id="pembicara" data-bagian="speakers" className={`${WADAH} scroll-mt-28`}>
      <h2 className={`${H_BAGIAN} text-center text-[var(--f-ink)]`}>{label.pembicara}</h2>
      <ul className="mt-[clamp(28px,2.6vw,50px)] grid gap-x-[clamp(20px,2.08vw,40px)] gap-y-[clamp(40px,3.13vw,60px)] sm:grid-cols-2 lg:grid-cols-3">
        {speakers.map((speaker, index) => (
          <KartuFoto
            key={`${speaker.name}-${index}`}
            gambar={speaker.photo_url ?? null}
            judul={speaker.name}
            teks={[speaker.role, speaker.title, speaker.company].filter((item) => item?.trim()).join("\n") || null}
            sisaInisial
          />
        ))}
      </ul>
    </section>
  );
}

/** Paragraf dari teks CMS: baris kosong memisahkan paragraf, baris "- " jadi butir. */
export function Paragraf({ teks, className = "" }: { teks: string; className?: string }) {
  const blok = teks.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  return (
    <>
      {blok.map((isi, index) => {
        const baris = isi.split("\n");
        if (baris.every((item) => /^\s*[-•]\s+/.test(item))) {
          return (
            <ul key={index} className={`list-disc pl-[1.4em] ${className}`}>
              {baris.map((item, nomor) => (
                <li key={nomor}>{item.replace(/^\s*[-•]\s+/, "")}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className={`whitespace-pre-line ${className}`}>
            {isi}
          </p>
        );
      })}
    </>
  );
}
