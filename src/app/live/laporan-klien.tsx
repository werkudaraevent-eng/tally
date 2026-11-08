"use client";

import { DownloadSimple } from "@phosphor-icons/react";
import { DeckBerurutan } from "@/components/laporan/deck-klien";
import { CeritaHarian } from "@/components/laporan/harian/cerita";
import { ButtonLink } from "@/components/m3";
import type { HariHighlight } from "@/lib/laporan/harian/jenis";
import type { Deck } from "@/lib/laporan/jenis";
import { normalizeTimeZone, timeZoneAbbr } from "@/lib/timezone";

/**
 * Tab Report di tampilan klien: highlight harian yang dikunci (diputar sebagai
 * stories) di atas, lalu salinan Event report yang dibagikan panitia.
 */
export function LaporanKlien({ slug, deck, dibagikan, harian, zona }: { slug: string; deck: Deck | null; dibagikan: string | null; harian: HariHighlight[]; zona: unknown }) {
  const tz = normalizeTimeZone(zona);
  const kapan = dibagikan ? `${new Date(dibagikan).toLocaleString("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz })} ${timeZoneAbbr(tz)}` : "";
  return (
    <div className="flex flex-col gap-8">
      <CeritaHarian hari={harian} />
      {deck ? (
        <DeckBerurutan
          deck={deck}
          catatan={`Shared by the committee on ${kapan}. Figures are as of that moment.`}
          aksi={
            <ButtonLink native variant="outlined" href={`/e/${encodeURIComponent(slug)}/cetak-laporan?salinan=1`} target="_blank" rel="noopener" icon={<DownloadSimple size={18} aria-hidden />}>
              Save as PDF
            </ButtonLink>
          }
        />
      ) : null}
    </div>
  );
}
