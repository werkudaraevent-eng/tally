"use client";

import { ArrowClockwise, ArrowsIn, ArrowsOut, CaretDown, DeviceMobile, MagnifyingGlass, Monitor, UserCircle } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { IconButton, Pane, SegmentedButton } from "@/components/m3";
import { Popover, usePopoverAnchor } from "@/components/m3/popover";
import type { LandingMemberConfig } from "@/lib/domain";
import { eventApiPath } from "@/lib/event-url";
import { cx } from "@/lib/m3/cx";

/**
 * Pratinjau Beranda halaman peserta di Participant area, pola yang sama dengan
 * pratinjau Event page (components/admin/landing-preview.tsx): halaman
 * sungguhan di iframe pada lebar perangkat (390 atau 1280) yang diperkecil,
 * dan setelan yang belum disimpan dikirim lewat postMessage.
 *
 * Yang dimuat `/e/<slug>/peserta/pratinjau?peserta=<id>`: khusus admin, dan
 * dirender sebagai peserta yang dipilih di "Preview as". Kartu Bus, Kamar, dan
 * Teman sekamar berbeda per orang, jadi pilihan ini menentukan apa yang
 * terlihat; bawaannya peserta pertama yang sudah punya kamar dan bus.
 */

type Device = "mobile" | "desktop";
const UKURAN: Record<Device, { width: number; height: number }> = { mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } };

export type PesertaPratinjau = { id: string; name: string; company: string | null };

function PilihPeserta({ peserta, onPilih }: { peserta: PesertaPratinjau | null; onPilih: (peserta: PesertaPratinjau) => void }) {
  const [pemicu, setPemicu] = useState<HTMLButtonElement | null>(null);
  const anchor = usePopoverAnchor(pemicu);
  const id = useId();
  const [cari, setCari] = useState("");
  const [hasil, setHasil] = useState<PesertaPratinjau[] | null>(null);

  useEffect(() => {
    if (!anchor.open) return;
    const pengendali = new AbortController();
    const timer = window.setTimeout(async () => {
      const response = await fetch(`${eventApiPath("/api/admin/area-peserta")}?cari=${encodeURIComponent(cari)}`, { cache: "no-store", signal: pengendali.signal }).catch(() => null);
      const body = response?.ok ? ((await response.json().catch(() => null)) as { peserta?: PesertaPratinjau[] } | null) : null;
      if (!pengendali.signal.aborted) setHasil(body?.peserta ?? []);
    }, 200);
    return () => { window.clearTimeout(timer); pengendali.abort(); };
  }, [anchor.open, cari]);

  return (
    <>
      <button
        ref={setPemicu}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={anchor.open}
        aria-controls={anchor.open ? id : undefined}
        onClick={anchor.toggle}
        disabled={!peserta}
        className="m3-state inline-flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-body-medium text-on-surface disabled:text-on-surface-variant"
      >
        <UserCircle size={18} aria-hidden className="shrink-0 text-on-surface-variant" />
        <span className="min-w-0 truncate">
          <span className="sr-only">Preview as </span>
          <b className="font-semibold">{peserta?.name ?? "No participants yet"}</b>
        </span>
        <CaretDown size={14} aria-hidden className="shrink-0 text-on-surface-variant" />
      </button>
      <Popover anchor={anchor} label="Preview as" role="dialog" id={id} align="start" width={320}>
        <div className="flex flex-col gap-1 p-1">
          <p className="px-2 pt-1 text-body-small text-on-surface-variant">Preview as. Bus, room and roommates differ per participant.</p>
          <label className="flex h-9 items-center gap-2 rounded-md border border-outline px-2 focus-within:border-primary">
            <MagnifyingGlass size={16} aria-hidden className="shrink-0 text-on-surface-variant" />
            <input
              autoFocus
              value={cari}
              onChange={(event) => setCari(event.target.value)}
              placeholder="Search by name"
              aria-label="Search participants by name"
              className="min-w-0 flex-1 bg-transparent text-body-medium outline-none"
            />
          </label>
          <ul role="listbox" aria-label="Participants" className="max-h-72 overflow-y-auto py-0.5">
            {hasil === null ? (
              <li className="px-2 py-2 text-body-medium text-on-surface-variant">Loading…</li>
            ) : hasil.length === 0 ? (
              <li className="px-2 py-2 text-body-medium text-on-surface-variant">No participant with that name.</li>
            ) : (
              hasil.map((orang) => (
                <li key={orang.id} role="option" aria-selected={orang.id === peserta?.id}>
                  <button
                    type="button"
                    onClick={() => { onPilih(orang); anchor.tutup(); anchor.fokus(); }}
                    className={cx("flex min-h-10 w-full flex-col justify-center rounded-md px-2 py-1 text-left hover:bg-primary-soft", orang.id === peserta?.id && "bg-secondary-container")}
                  >
                    <span className="truncate text-body-medium text-on-surface">{orang.name}</span>
                    {orang.company ? <span className="truncate text-body-small text-on-surface-variant">{orang.company}</span> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </Popover>
    </>
  );
}

export function PratinjauPeserta({
  slug,
  peserta,
  onPeserta,
  member,
  sorot,
  reloadKey,
}: {
  slug: string;
  peserta: PesertaPratinjau | null;
  onPeserta: (peserta: PesertaPratinjau) => void;
  /** Setelan Participant area saat ini, termasuk yang belum disimpan. */
  member: LandingMemberConfig;
  /** Baris Participant home yang diklik: pratinjau menggulir ke isinya. `n` naik di setiap klik. */
  sorot: { id: string; n: number } | null;
  reloadKey: number;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [nonce, setNonce] = useState(0);
  const [besar, setBesar] = useState(false);
  const [wadahUkuran, setWadahUkuran] = useState({ lebar: 0, tinggi: 0 });
  const [pesan, setPesan] = useState<string | null>(null);
  const wadah = useRef<HTMLDivElement | null>(null);
  const bingkai = useRef<HTMLIFrameElement | null>(null);
  const terkini = useRef({ member, sorot });
  useEffect(() => { terkini.current = { member, sorot }; });

  useEffect(() => {
    const el = wadah.current;
    if (!el) return;
    const amati = new ResizeObserver(([entri]) => setWadahUkuran({ lebar: entri.contentRect.width, tinggi: entri.contentRect.height }));
    amati.observe(el);
    return () => amati.disconnect();
  }, []);

  const kirim = (pesanBingkai: object) => bingkai.current?.contentWindow?.postMessage(pesanBingkai, window.location.origin);
  // Kartu darurat ada di Menu (tab Profil), bukan di Beranda: sorot "darurat" memindah pratinjau ke sana.
  const tabDari = (id: string | null | undefined) => (id === "darurat" ? "profil" : "beranda");
  const tabTerkirim = useRef("beranda");

  // Pesan dari bingkai: siap (kirim draf terkini), hasil render, hasil gulir.
  useEffect(() => {
    function terima(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== bingkai.current?.contentWindow) return;
      if (event.data?.jenis === "tally-beranda-siap") {
        tabTerkirim.current = tabDari(terkini.current.sorot?.id);
        kirim({ jenis: "tally-beranda-draf", member: terkini.current.member, sorot: terkini.current.sorot?.id ?? null, tab: tabTerkirim.current });
      } else if (event.data?.jenis === "tally-beranda-hasil") {
        setPesan(event.data.ok ? null : String(event.data.pesan ?? "The preview couldn't load."));
      } else if (event.data?.jenis === "tally-beranda-gulir") {
        setPesan(event.data.ada ? null : "Not shown for this participant right now.");
      }
    }
    window.addEventListener("message", terima);
    return () => window.removeEventListener("message", terima);
  }, []);

  const cuplikan = JSON.stringify(member);
  useEffect(() => { kirim({ jenis: "tally-beranda-draf", member: JSON.parse(cuplikan), tab: tabTerkirim.current }); }, [cuplikan]);
  useEffect(() => {
    if (!sorot) return;
    const tab = tabDari(sorot.id);
    if (tab === tabTerkirim.current) { kirim({ jenis: "tally-beranda-sorot", id: sorot.id }); return; }
    tabTerkirim.current = tab;
    kirim({ jenis: "tally-beranda-draf", member: terkini.current.member, sorot: sorot.id, tab });
  }, [sorot]);

  useEffect(() => {
    if (!besar) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setBesar(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [besar]);

  const { width, height } = UKURAN[device];
  const skala = wadahUkuran.lebar ? Math.min(1, wadahUkuran.lebar / width, device === "mobile" && wadahUkuran.tinggi ? wadahUkuran.tinggi / height : 1) : 0.5;
  // Desktop: bingkai setinggi panel, supaya tidak ada pita kosong di bawahnya.
  const tinggi = device === "mobile" ? height : Math.max(height, wadahUkuran.tinggi / skala);

  return (
    <div
      className={besar ? "fixed inset-0 z-50 flex flex-col bg-scrim/40 p-4 *:flex-1" : "flex min-h-0 flex-col *:flex-1"}
      {...(besar ? { role: "dialog", "aria-modal": true, "aria-label": "Enlarged preview" } : null)}
    >
      <Pane aria-label="Participant page preview">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-outline-variant px-4 py-2.5">
          <PilihPeserta peserta={peserta} onPilih={onPeserta} />
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
          <IconButton size="sm" label={besar ? "Exit enlarged preview" : "Enlarge preview"} onClick={() => setBesar((current) => !current)}>
            {besar ? <ArrowsIn size={16} /> : <ArrowsOut size={16} />}
          </IconButton>
          {pesan ? <p role="status" className="basis-full text-body-small text-error">{pesan}</p> : null}
        </div>
        <div ref={wadah} className="min-h-0 flex-1 overflow-hidden bg-surface-container-high p-4">
          {peserta ? (
            <div className="mx-auto overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest" style={{ width: width * skala, height: tinggi * skala }}>
              <iframe
                key={`${peserta.id}-${device}-${nonce}-${reloadKey}`}
                ref={bingkai}
                src={`/e/${encodeURIComponent(slug)}/peserta/pratinjau?peserta=${encodeURIComponent(peserta.id)}`}
                title={`Participant page preview, as ${peserta.name}`}
                sandbox="allow-scripts allow-same-origin"
                style={{ width, height: tinggi, border: 0, transform: `scale(${skala})`, transformOrigin: "top left" }}
              />
            </div>
          ) : (
            <p className="mx-auto max-w-[360px] pt-16 text-center text-body-medium text-on-surface-variant">
              Add participants to the Participant list to preview their page.
            </p>
          )}
        </div>
      </Pane>
    </div>
  );
}
