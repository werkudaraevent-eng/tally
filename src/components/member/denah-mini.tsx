"use client";

import { SeatMapView } from "@/components/seat-map-view";
import type { SeatColors, SeatMapConfig } from "@/lib/seat-map";

// Denah mini di kartu tiket: seluruh ruangan dengan panggung, kursi peserta
// disorot. Hanya baca: tidak ada data kursi orang lain (seatStates kosong),
// jadi yang tampil murni tata ruang ditambah satu kursi miliknya sendiri.
export function DenahMini({
  config,
  label,
  warna,
  ariaLabel,
}: {
  config: SeatMapConfig;
  label: string;
  warna: { background: string; text: string; accent: string } & Partial<SeatColors>;
  ariaLabel: string;
}) {
  return (
    <div className="overflow-hidden rounded-md" style={{ background: warna.background }} aria-label={ariaLabel} role="img">
      <SeatMapView
        config={config}
        highlightedSeatLabels={[label]}
        backgroundColor={warna.background}
        textColor={warna.text}
        accentColor={warna.accent}
        seatColors={warna}
        maxHeight="200px"
      />
    </div>
  );
}
