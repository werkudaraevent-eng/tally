import type { Deck } from "@/lib/laporan/jenis";
import { GayaLaporan, Panggung } from "./panggung";
import { SlideLaporan } from "./slide";

/**
 * Semua slide berurutan, untuk tab Report di tampilan klien dan halaman cetak.
 * `catatan`: satu baris di atas slide (mis. kapan angka dikunci).
 */
export function DeckBerurutan({ deck, catatan, aksi }: { deck: Deck; catatan?: React.ReactNode; aksi?: React.ReactNode }) {
  return (
    <div className="lp-deck mx-auto flex w-full max-w-[1080px] flex-col gap-6">
      <GayaLaporan />
      {catatan || aksi ? (
        <div className="lp-alat flex flex-wrap items-center justify-between gap-3 text-body-medium text-on-surface-variant">
          <span>{catatan}</span>
          {aksi}
        </div>
      ) : null}
      {deck.slide.map((s, i) => (
        <Panggung key={s.kunci}>
          <SlideLaporan slide={s} deck={deck} nomor={i + 1} total={deck.slide.length} />
        </Panggung>
      ))}
    </div>
  );
}
