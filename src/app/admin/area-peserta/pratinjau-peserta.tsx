"use client";

import { ArrowClockwise, ArrowsIn, ArrowsOut, CalendarBlank, CaretDown, DeviceMobile, HandGrabbing, MagnifyingGlass, Monitor, UserCircle } from "@phosphor-icons/react";
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
 *
 * Gathering Horizon: kartu Participant home bisa diseret langsung di pratinjau
 * ponsel dan diklik untuk menemukan barisnya (keputusan Mas 20 Okt, arah 1),
 * dan "Preview on" menampilkan Beranda pada tanggal acara mana pun, karena
 * isinya berganti sebelum, saat, dan sesudah acara.
 */

type Device = "mobile" | "desktop";
const UKURAN: Record<Device, { width: number; height: number }> = { mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } };

export type PesertaPratinjau = { id: string; name: string; company: string | null };

/** "Preview on": tanggal dan jam di zona acara; null = saat ini. */
type Waktu = { tanggal: string; jam: string } | null;

/** Jam yang dipakai "Preview on": pagi hari acara, saat ada yang berjalan atau berikutnya. */
const JAM_PRATINJAU = "09:00";

function geserHari(tanggal: string, hari: number): string {
  const waktu = new Date(`${tanggal}T00:00:00Z`);
  waktu.setUTCDate(waktu.getUTCDate() + hari);
  return waktu.toISOString().slice(0, 10);
}

const labelTanggal = (tanggal: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${tanggal}T00:00:00Z`));

/**
 * Pilihan "Preview on": saat ini, sehari sebelum acara, tiap hari acara
 * (14 hari pertama), dan sehari sesudah hari terakhir. Hari pertama dimulai
 * pada jam mulai acara bila itu sesudah 09.00, supaya isi "saat acara" terlihat.
 */
function pilihanWaktu(mulai: string, selesai: string, jamMulai: string | null): { nilai: Waktu; label: string; sub: string }[] {
  const akhir = selesai >= mulai ? selesai : mulai;
  const hari: string[] = [];
  for (let tanggal = mulai; tanggal <= akhir && hari.length < 14; tanggal = geserHari(tanggal, 1)) hari.push(tanggal);
  const jamPertama = jamMulai && /^\d{2}:\d{2}/.test(jamMulai) && jamMulai.slice(0, 5) > JAM_PRATINJAU ? jamMulai.slice(0, 5) : JAM_PRATINJAU;
  const sesudah = geserHari(akhir, 1);
  return [
    { nilai: null, label: "Now", sub: "The page as participants see it today" },
    { nilai: { tanggal: geserHari(mulai, -1), jam: JAM_PRATINJAU }, label: labelTanggal(geserHari(mulai, -1)), sub: "Day before the event" },
    ...hari.map((tanggal, index) => ({ nilai: { tanggal, jam: index === 0 ? jamPertama : JAM_PRATINJAU }, label: labelTanggal(tanggal), sub: index === 0 && jamPertama !== JAM_PRATINJAU ? `Day 1, from ${jamPertama}` : `Day ${index + 1}` })),
    { nilai: { tanggal: sesudah, jam: JAM_PRATINJAU }, label: labelTanggal(sesudah), sub: "After the event" },
  ];
}

function PilihWaktu({ mulai, selesai, jamMulai, waktu, onPilih }: { mulai: string; selesai: string; jamMulai: string | null; waktu: Waktu; onPilih: (waktu: Waktu) => void }) {
  const [pemicu, setPemicu] = useState<HTMLButtonElement | null>(null);
  const anchor = usePopoverAnchor(pemicu);
  const id = useId();
  const pilihan = pilihanWaktu(mulai, selesai, jamMulai);
  const sekarang = pilihan.find((item) => item.nilai?.tanggal === waktu?.tanggal) ?? pilihan[0];
  return (
    <>
      <button
        ref={setPemicu}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={anchor.open}
        aria-controls={anchor.open ? id : undefined}
        onClick={anchor.toggle}
        className="m3-state inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-2 text-body-medium text-on-surface"
      >
        <CalendarBlank size={18} aria-hidden className="shrink-0 text-on-surface-variant" />
        <span>
          <span className="sr-only">Preview on </span>
          {sekarang.label}
        </span>
        <CaretDown size={14} aria-hidden className="shrink-0 text-on-surface-variant" />
      </button>
      <Popover anchor={anchor} label="Preview on" role="dialog" id={id} align="start" width={280}>
        <div className="flex flex-col gap-1 p-1">
          <p className="px-2 pt-1 text-body-small text-on-surface-variant">Preview on. Participant home changes before, during and after the event; days show it at 09:00 event time. Announcements and checkpoint progress stay as they are now.</p>
          <ul role="listbox" aria-label="Preview on" className="max-h-72 overflow-y-auto py-0.5">
            {pilihan.map((item) => {
              const terpilih = item.label === sekarang.label;
              return (
                <li key={item.label} role="option" aria-selected={terpilih}>
                  <button
                    type="button"
                    onClick={() => { onPilih(item.nilai); anchor.tutup(); anchor.fokus(); }}
                    className={cx("flex min-h-10 w-full flex-col justify-center rounded-md px-2 py-1 text-left hover:bg-primary-soft", terpilih && "bg-secondary-container")}
                  >
                    <span className="text-body-medium text-on-surface">{item.label}</span>
                    <span className="text-body-small text-on-surface-variant">{item.sub}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Popover>
    </>
  );
}

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
          <p className="px-2 pt-1 text-body-small text-on-surface-variant">Preview as. Vehicle, room and roommates differ per participant.</p>
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
  tanggal = null,
  seret = null,
  onPindah,
  onPilihKartu,
}: {
  slug: string;
  peserta: PesertaPratinjau | null;
  onPeserta: (peserta: PesertaPratinjau) => void;
  /** Setelan Participant area saat ini, termasuk yang belum disimpan. */
  member: LandingMemberConfig;
  /** Baris Participant home yang diklik: pratinjau menggulir ke isinya. `n` naik di setiap klik. */
  sorot: { id: string; n: number } | null;
  reloadKey: number;
  /** Gathering Horizon: tanggal acara (YYYY-MM-DD) dan jam mulainya untuk "Preview on". */
  tanggal?: { start: string | null; end: string | null; start_time?: string | null } | null;
  /** Gathering Horizon: kartu yang bisa diseret, semua kartu, urutan lengkap, dan judul barisnya. */
  seret?: { gerak: string[]; kartu: string[]; urutan: string[]; label: Record<string, string> } | null;
  /** Kartu diseret di pratinjau: diletakkan sebelum `sebelum` (null = paling bawah). */
  onPindah?: (id: string, sebelum: string | null) => void;
  /** Kartu diklik di pratinjau: barisnya disorot di daftar. */
  onPilihKartu?: (id: string) => void;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [nonce, setNonce] = useState(0);
  const [besar, setBesar] = useState(false);
  const [wadahUkuran, setWadahUkuran] = useState({ lebar: 0, tinggi: 0 });
  const [pesan, setPesan] = useState<string | null>(null);
  const [waktu, setWaktu] = useState<Waktu>(null);
  // Layar sentuh: kartu di pratinjau hanya bisa diketuk; urutannya diatur di daftar.
  const [sentuh] = useState(() => typeof window !== "undefined" && window.matchMedia("(hover: none) and (pointer: coarse)").matches);
  const wadah = useRef<HTMLDivElement | null>(null);
  const bingkai = useRef<HTMLIFrameElement | null>(null);
  const terkini = useRef({ member, sorot, waktu, setelanSeret: null as object | null, onPindah, onPilihKartu });

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
        kirim({ jenis: "tally-beranda-seret", setelan: terkini.current.setelanSeret });
        kirim({ jenis: "tally-beranda-draf", member: terkini.current.member, sorot: terkini.current.sorot?.id ?? null, tab: tabTerkirim.current, waktu: terkini.current.waktu });
      } else if (event.data?.jenis === "tally-beranda-pindah" && typeof event.data.id === "string") {
        terkini.current.onPindah?.(event.data.id, typeof event.data.sebelum === "string" ? event.data.sebelum : null);
      } else if (event.data?.jenis === "tally-beranda-pilih" && typeof event.data.id === "string") {
        terkini.current.onPilihKartu?.(event.data.id);
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
  const cuplikanWaktu = JSON.stringify(waktu);
  useEffect(() => { kirim({ jenis: "tally-beranda-draf", member: JSON.parse(cuplikan), tab: tabTerkirim.current, waktu: JSON.parse(cuplikanWaktu) }); }, [cuplikan, cuplikanWaktu]);
  useEffect(() => {
    if (!sorot) return;
    const tab = tabDari(sorot.id);
    if (tab === tabTerkirim.current) { kirim({ jenis: "tally-beranda-sorot", id: sorot.id }); return; }
    tabTerkirim.current = tab;
    kirim({ jenis: "tally-beranda-draf", member: terkini.current.member, sorot: sorot.id, tab, waktu: terkini.current.waktu });
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

  // Seret di pratinjau: hanya tampilan ponsel (satu kolom, urutan yang sama
  // dengan daftar); di desktop kartu tetap bisa diklik untuk menemukan barisnya.
  const setelanSeret = seret ? { aktif: device === "mobile", gerak: seret.gerak, kartu: seret.kartu, urutan: seret.urutan, label: seret.label, skala } : null;
  const cuplikanSeret = JSON.stringify(setelanSeret);
  useEffect(() => { terkini.current = { member, sorot, waktu, setelanSeret: JSON.parse(cuplikanSeret), onPindah, onPilihKartu }; });
  useEffect(() => { kirim({ jenis: "tally-beranda-seret", setelan: JSON.parse(cuplikanSeret) }); }, [cuplikanSeret]);

  return (
    <div
      className={besar ? "fixed inset-0 z-50 flex flex-col bg-scrim/40 p-4 *:flex-1" : "flex min-h-0 flex-col *:flex-1"}
      {...(besar ? { role: "dialog", "aria-modal": true, "aria-label": "Enlarged preview" } : null)}
    >
      <Pane aria-label="Participant page preview">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-outline-variant px-4 py-2.5">
          <PilihPeserta peserta={peserta} onPilih={onPeserta} />
          {tanggal?.start ? <PilihWaktu mulai={tanggal.start} selesai={tanggal.end ?? tanggal.start} jamMulai={tanggal.start_time ?? null} waktu={waktu} onPilih={setWaktu} /> : null}
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
        {seret && peserta ? (
          <p className="flex shrink-0 items-center gap-2 border-b border-outline-variant bg-primary-soft px-4 py-2 text-body-small text-on-primary-soft">
            <HandGrabbing size={16} aria-hidden className="shrink-0" />
            {sentuh
              ? "Tap a card to find its row · Reorder in the list"
              : device === "mobile"
                ? "Drag a card to reorder Participant home · Click a card to find its row"
                : "Click a card to find its row · Switch to Phone to drag cards"}
          </p>
        ) : null}
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
