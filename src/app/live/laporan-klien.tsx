"use client";

import { DownloadSimple } from "@phosphor-icons/react";
import { DeckBerurutan } from "@/components/laporan/deck-klien";
import { ButtonLink } from "@/components/m3";
import type { Deck } from "@/lib/laporan/jenis";
import { normalizeTimeZone, timeZoneAbbr } from "@/lib/timezone";

/** Tab Report di tampilan klien: salinan Event report yang dibagikan panitia. */
export function LaporanKlien({ slug, deck, dibagikan, zona }: { slug: string; deck: Deck; dibagikan: string; zona: unknown }) {
  const tz = normalizeTimeZone(zona);
  const kapan = `${new Date(dibagikan).toLocaleString("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz })} ${timeZoneAbbr(tz)}`;
  return (
    <DeckBerurutan
      deck={deck}
      catatan={`Shared by the committee on ${kapan}. Figures are as of that moment.`}
      aksi={
        <ButtonLink native variant="outlined" href={`/e/${encodeURIComponent(slug)}/cetak-laporan?salinan=1`} target="_blank" rel="noopener" icon={<DownloadSimple size={18} aria-hidden />}>
          Save as PDF
        </ButtonLink>
      }
    />
  );
}
