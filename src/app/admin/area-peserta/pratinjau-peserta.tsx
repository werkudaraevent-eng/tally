"use client";

import { ArrowClockwise, ArrowsOut, CaretDown, DeviceMobile, Monitor, UserCircle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { IconButton, Pane, SegmentedButton } from "@/components/m3";

// PROTO PR 2 (mockup): pratinjau halaman peserta, pola yang sama dengan LandingPreview.
// Versi jadi memuat /e/<slug>/peserta/pratinjau (khusus admin, draf lewat postMessage,
// dirender sebagai peserta yang dipilih di "Preview as").
type Device = "mobile" | "desktop";
const UKURAN: Record<Device, { width: number; height: number }> = { mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } };

export function PratinjauPeserta({ slug, sebagai }: { slug: string; sebagai: string }) {
  const [device, setDevice] = useState<Device>("desktop");
  const [nonce, setNonce] = useState(0);
  const [wadahUkuran, setWadahUkuran] = useState({ lebar: 0, tinggi: 0 });
  const wadah = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = wadah.current;
    if (!el) return;
    const amati = new ResizeObserver(([entri]) => setWadahUkuran({ lebar: entri.contentRect.width, tinggi: entri.contentRect.height }));
    amati.observe(el);
    return () => amati.disconnect();
  }, []);
  const { width, height } = UKURAN[device];
  const skala = wadahUkuran.lebar ? Math.min(1, wadahUkuran.lebar / width, device === "mobile" ? wadahUkuran.tinggi / height : 1) : 0.5;
  const tinggiTampil = device === "mobile" ? height : Math.max(height, wadahUkuran.tinggi / skala);
  return (
    <Pane aria-label="Participant page preview">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-outline-variant px-4 py-2.5">
        <button type="button" className="m3-state inline-flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-body-medium text-on-surface">
          <UserCircle size={18} aria-hidden className="shrink-0 text-on-surface-variant" />
          <span className="truncate"><b className="font-semibold">{sebagai}</b></span>
          <CaretDown size={14} aria-hidden className="shrink-0 text-on-surface-variant" />
        </button>
        <SegmentedButton<Device>
          label="Preview screen size"
          value={device}
          onChange={setDevice}
          options={[
            { value: "desktop", label: "Desktop", icon: <Monitor size={16} /> },
            { value: "mobile", label: "Phone", icon: <DeviceMobile size={16} /> },
          ]}
        />
        <IconButton size="sm" label="Reload preview" onClick={() => setNonce((current) => current + 1)}>
          <ArrowClockwise size={16} />
        </IconButton>
        <IconButton size="sm" label="Enlarge preview">
          <ArrowsOut size={16} />
        </IconButton>
      </div>
      <div ref={wadah} className="min-h-0 flex-1 overflow-hidden bg-surface-container-high p-4">
        <div className="mx-auto overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest" style={{ width: width * skala, height: tinggiTampil * skala }}>
          {slug ? <iframe
            key={`${device}-${nonce}`}
            src={`/e/${slug}/peserta`}
            title="Participant page preview"
            sandbox="allow-scripts allow-same-origin allow-popups"
            style={{ width, height: tinggiTampil, border: 0, transform: `scale(${skala})`, transformOrigin: "top left" }}
          /> : null}
        </div>
      </div>
    </Pane>
  );
}
