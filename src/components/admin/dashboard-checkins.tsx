"use client";

import { CaretDown, CaretRight, Info } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { EMPTY_VALUE, LinearProgress, StatusChip, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, type ChipTone } from "@/components/m3";
import Link from "@/components/event-link";
import { useBolehHalaman } from "@/components/admin/page-context";
import { eventApiPath } from "@/lib/event-url";
import { cx } from "@/lib/m3/cx";
import type { BarisPantau, RingkasAcara } from "@/lib/pantau-checkin";
import { normalizeTimeZone } from "@/lib/timezone";

/**
 * Bagian Dashboard yang hidup: ringkasan check-in (titik, kedatangan hari ini,
 * kelompok Who sees it), dibaca tiap 30 detik selama tab terlihat dan langsung
 * saat tab kembali terlihat. Pola Cvent OnArrival dan Eventbrite Organizer
 * (hadir dari total per sesi), dengan "diharapkan" dari Who sees it baris
 * Agenda yang ditautkan checkpoint.
 *
 * Tipografi mengikuti DESIGN.md "Dashboard": data bertinta gelap, abu-abu
 * hanya untuk label dan keterangan, dua bobot di isi.
 */

export type DataCheckin = { rows: BarisPantau[]; ringkas: RingkasAcara; time_zone: string; updated_at: string };

const SELANG_MS = 30_000;

export function useDataCheckin() {
  const [data, setData] = useState<DataCheckin | null>(null);
  const [gagal, setGagal] = useState(false);

  const muat = useCallback(async () => {
    const response = await fetch(eventApiPath("/api/admin/overview/checkins"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setGagal(true);
      return;
    }
    setData(await response.json());
    setGagal(false);
  }, []);

  useEffect(() => {
    const awal = window.setTimeout(() => { void muat(); }, 0);
    const selang = window.setInterval(() => { if (document.visibilityState === "visible") void muat(); }, SELANG_MS);
    const terlihat = () => { if (document.visibilityState === "visible") void muat(); };
    document.addEventListener("visibilitychange", terlihat);
    return () => { window.clearTimeout(awal); window.clearInterval(selang); document.removeEventListener("visibilitychange", terlihat); };
  }, [muat]);

  return { data, gagal };
}

export const angka = (nilai: number) => new Intl.NumberFormat("en-GB").format(nilai);

/** Persen bulat; di atas nol tapi di bawah 1% ditulis "<1%" supaya aktivitas yang ada tidak terbaca nol. */
export function persenTeks(sudah: number, dari: number): { nilai: number; teks: string } {
  if (dari <= 0) return { nilai: 0, teks: "0%" };
  const nilai = Math.min(100, (sudah / dari) * 100);
  return { nilai, teks: sudah > 0 && nilai < 1 ? "<1%" : `${Math.round(nilai)}%` };
}

/** Jam di zona acara, "05:15". */
export function useFormatJam(timeZone: string | undefined) {
  const zona = normalizeTimeZone(timeZone);
  return useMemo(() => new Intl.DateTimeFormat("en-GB", { timeZone: zona, hour: "2-digit", minute: "2-digit" }), [zona]);
}

export const labelHari = (tanggal: string, opsi: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opsi }).format(new Date(`${tanggal}T00:00:00Z`));

/** Waktu titik relatif ke sekarang, dari tanggal dan jam Agenda di zona acara. */
function sudahLewat(baris: BarisPantau, hariIni: string, jamKini: string): boolean {
  if (!baris.tanggal) return true;
  if (baris.tanggal !== hariIni) return baris.tanggal < hariIni;
  return !baris.jam || baris.jam.slice(0, 5) <= jamKini;
}

function status(baris: BarisPantau, hariIni: string, jamKini: string): { tone: ChipTone; teks: string; nanti: boolean } {
  // Belum waktunya dan belum ada yang tercatat: "N expected" tanpa bar kosong.
  const belumWaktunya = baris.sudah === 0 && !sudahLewat(baris, hariIni, jamKini);
  if (!baris.aktif) return { tone: "neutral", teks: "Closed", nanti: belumWaktunya };
  if (baris.diharapkan > 0 && baris.sudah >= baris.diharapkan) return { tone: "success", teks: "Complete", nanti: false };
  if (baris.baru_15 > 0) return { tone: "primary", teks: "Scanning", nanti: false };
  if (baris.sudah > 0) return { tone: "primary", teks: "Open", nanti: false };
  if (!sudahLewat(baris, hariIni, jamKini)) return { tone: "neutral", teks: "Upcoming", nanti: true };
  return { tone: "neutral", teks: "No scans yet", nanti: false };
}

/** Panel Dashboard: garis tipis, judul 16 px tanpa garis pemisah di bawahnya. */
export function Panel({ label, title, sub, trailing, className, children }: { label?: string; title: string; sub?: ReactNode; trailing?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section aria-label={label ?? title} className={cx("flex min-w-0 flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest", className)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-2 pt-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-title-large">{title}</h2>
          {sub ? <p className="text-body-medium text-on-surface-variant">{sub}</p> : null}
        </div>
        {trailing}
      </div>
      {children}
    </section>
  );
}

type Hari = { tanggal: string | null; baris: BarisPantau[] };

export function DashboardCheckpoints({ data, gagal, eventDate, endDate, client, className }: {
  data: DataCheckin;
  gagal: boolean;
  eventDate: string | null;
  endDate: string | null;
  /** Akun klien (peran kustom): tanpa catatan cara hitung dan tautan Check-in. */
  client: boolean;
  className?: string;
}) {
  const bolehHalaman = useBolehHalaman();
  const jam = useFormatJam(data.time_zone);
  const hariIni = data.ringkas.hari_ini;
  const jamKini = jam.format(new Date(data.updated_at));
  const [buka, setBuka] = useState<Record<string, boolean>>({});

  const hari = useMemo(() => {
    const peta = new Map<string | null, BarisPantau[]>();
    for (const baris of data.rows) peta.set(baris.tanggal, [...(peta.get(baris.tanggal) ?? []), baris]);
    const daftar: Hari[] = [...peta].map(([tanggal, baris]) => ({ tanggal, baris }));
    // Bertanggal urut hari; titik tanpa tautan Agenda berlaku sepanjang acara, di belakang.
    return daftar.sort((a, b) => (a.tanggal ?? "￿").localeCompare(b.tanggal ?? "￿"));
  }, [data.rows]);

  if (data.rows.length === 0) return null;

  // Hari yang sudah lewat dilipat selama masih ada hari ini atau hari mendatang.
  const adaKini = hari.some((isi) => isi.tanggal && isi.tanggal >= hariIni);
  const terbuka = (tanggal: string | null) => buka[tanggal ?? ""] ?? !(adaKini && tanggal !== null && tanggal < hariIni);
  const ubah = (tanggal: string | null) => setBuka((lama) => ({ ...lama, [tanggal ?? ""]: !terbuka(tanggal) }));

  const judulHari = (tanggal: string | null) => {
    if (!tanggal) return { judul: "Any day", catatan: "No Agenda row linked" };
    const judul = tanggal === hariIni ? `Today, ${labelHari(tanggal)}` : labelHari(tanggal);
    if (eventDate && tanggal < eventDate) return { judul, catatan: "Before the event" };
    const akhir = endDate ?? eventDate;
    if (akhir && tanggal > akhir) return { judul, catatan: "After the event" };
    if (eventDate) {
      const ke = Math.round((Date.parse(`${tanggal}T00:00:00Z`) - Date.parse(`${eventDate}T00:00:00Z`)) / 86_400_000) + 1;
      return { judul, catatan: `Day ${ke}` };
    }
    return { judul, catatan: "" };
  };

  const ringkasHari = (baris: BarisPantau[]) => {
    const sudah = baris.reduce((jumlah, isi) => jumlah + isi.sudah, 0);
    const dari = baris.reduce((jumlah, isi) => jumlah + isi.diharapkan, 0);
    return `${baris.length === 1 ? "1 checkpoint" : `${baris.length} checkpoints`} · ${angka(sudah)} of ${angka(dari)} checked in`;
  };

  const keterangan = (isi: BarisPantau) => [
    isi.baru_15 > 0 ? `+${angka(isi.baru_15)} in 15 min` : null,
    isi.terakhir ? `last ${jam.format(new Date(isi.terakhir))}` : null,
    isi.lainnya > 0 ? `+${angka(isi.lainnya)} outside expected` : null,
  ].filter(Boolean).join(" · ");

  const kepalaHari = (isi: Hari, colSpan?: number) => {
    const { judul, catatan } = judulHari(isi.tanggal);
    const isiKepala = (
      <button
        type="button"
        aria-expanded={terbuka(isi.tanggal)}
        onClick={() => ubah(isi.tanggal)}
        className="flex w-full flex-wrap items-center gap-x-2 text-start text-body-medium"
      >
        {terbuka(isi.tanggal) ? <CaretDown size={14} aria-hidden className="shrink-0" /> : <CaretRight size={14} aria-hidden className="shrink-0" />}
        <span className="font-medium">{judul}</span>
        <span className="text-on-surface-variant">{terbuka(isi.tanggal) ? catatan : ringkasHari(isi.baris)}</span>
      </button>
    );
    return colSpan
      ? <TableRow><TableCell colSpan={colSpan} className="bg-surface-container-high">{isiKepala}</TableCell></TableRow>
      : <div className="bg-surface-container-high px-5 py-2.5">{isiKepala}</div>;
  };

  return (
    <Panel
      title="Checkpoints"
      sub="People checked in at each checkpoint, out of the people expected there"
      className={className}
      trailing={<span className="text-body-medium text-on-surface-variant" aria-live="polite">{gagal ? "Couldn't refresh, retrying" : `Updated ${jamKini}`}</span>}
    >
      {/* Ponsel: satu blok per titik. */}
      <div className="md:hidden">
        {hari.map((isi) => (
          <div key={isi.tanggal ?? "semua"} className="border-t border-outline-variant">
            {kepalaHari(isi)}
            {terbuka(isi.tanggal) ? isi.baris.map((baris) => {
              const s = status(baris, hariIni, jamKini);
              const p = persenTeks(baris.sudah, baris.diharapkan);
              return (
                <div key={baris.key} className="flex flex-col gap-3 border-t border-outline-variant px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="text-body-medium font-medium [overflow-wrap:anywhere]">{baris.nama}</p>
                      <p className="text-body-medium text-on-surface-variant">
                        {[baris.jam ? baris.jam.slice(0, 5) : null, baris.untuk ?? "All participants"].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <StatusChip dot tone={s.tone}>{s.teks}</StatusChip>
                  </div>
                  {s.nanti ? (
                    <p className="text-body-medium tabular-nums">{angka(baris.diharapkan)} expected</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <p className="flex items-baseline gap-1 text-body-medium tabular-nums">
                        <span className="text-title-large">{angka(baris.sudah)}</span>
                        <span>/ {angka(baris.diharapkan)}</span>
                        <span className="ms-auto">{p.teks}</span>
                      </p>
                      <LinearProgress value={p.nilai} label={`${baris.nama} checked in`} />
                      {keterangan(baris) ? <p className="text-body-medium text-on-surface-variant tabular-nums">{keterangan(baris)}</p> : null}
                    </div>
                  )}
                </div>
              );
            }) : null}
          </div>
        ))}
      </div>

      <div className="hidden md:block">
        <Table minWidth="920px">
          <TableHead>
            <TableRow>
              <TableHeaderCell className="w-[72px]">Time</TableHeaderCell>
              <TableHeaderCell className="w-[30%]">Checkpoint</TableHeaderCell>
              <TableHeaderCell className="min-w-[168px]">For</TableHeaderCell>
              <TableHeaderCell align="end" className="w-[340px] min-w-[340px]">Checked in</TableHeaderCell>
              <TableHeaderCell className="w-[140px] min-w-[140px]">Status</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {hari.map((isi) => (
              <HariBaris key={isi.tanggal ?? "semua"}>
                {kepalaHari(isi, 5)}
                {terbuka(isi.tanggal) ? isi.baris.map((baris) => {
                  const s = status(baris, hariIni, jamKini);
                  const p = persenTeks(baris.sudah, baris.diharapkan);
                  return (
                    <TableRow key={baris.key}>
                      <TableCell numeric className="align-top">{baris.jam ? baris.jam.slice(0, 5) : EMPTY_VALUE}</TableCell>
                      <TableCell className="align-top">
                        <span className="block font-medium [overflow-wrap:anywhere]">{baris.nama}</span>
                        {baris.tempat ? <span className="mt-0.5 block text-on-surface-variant [overflow-wrap:anywhere]">{baris.tempat}</span> : null}
                      </TableCell>
                      <TableCell className="align-top">{baris.untuk ?? "All participants"}</TableCell>
                      <TableCell align="end" className="align-top">
                        {s.nanti ? (
                          <span className="tabular-nums">{angka(baris.diharapkan)} expected</span>
                        ) : (
                          <div className="flex flex-col items-end gap-0.5">
                            <div className="flex items-center gap-3 tabular-nums">
                              <span className="whitespace-nowrap"><span className="font-medium">{angka(baris.sudah)}</span> / {angka(baris.diharapkan)}</span>
                              <span className="w-[120px] shrink-0"><LinearProgress value={p.nilai} label={`${baris.nama} checked in`} /></span>
                              <span className="w-10 text-end">{p.teks}</span>
                            </div>
                            {keterangan(baris) ? <span className="text-on-surface-variant tabular-nums">{keterangan(baris)}</span> : null}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="align-top"><StatusChip dot tone={s.tone}>{s.teks}</StatusChip></TableCell>
                    </TableRow>
                  );
                }) : null}
              </HariBaris>
            ))}
          </TableBody>
        </Table>
      </div>

      {client ? null : (
        <p className="flex items-start gap-2 border-t border-outline-variant px-5 py-3 text-body-medium text-on-surface-variant">
          <Info size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            Counts people, not scans. Expected comes from Who sees it on the checkpoint&apos;s Agenda row, or all active participants without one.{" "}
            {bolehHalaman("/admin/attendance") ? <Link href="/admin/attendance" className="rounded-sm font-medium text-primary hover:underline">Check-in</Link> : null}
          </span>
        </p>
      )}
    </Panel>
  );
}

function HariBaris({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/**
 * Kedatangan per 15 menit hari ini: pindaian pertama hari itu per orang. Satu
 * seri, satu warna; kelompok yang sedang berjalan lebih muda dan diberi label
 * "so far", karena angkanya masih bertambah.
 */
export function ArrivalsChart({ data, className }: { data: DataCheckin; className?: string }) {
  const titik = data.ringkas.kedatangan;
  const W = 640, H = 220, kiri = 32, kanan = 40, bawah = 24, atas = 20;
  const maks = Math.max(4, ...titik.map((isi) => isi.jumlah));
  const langkah = maks <= 8 ? 2 : maks <= 20 ? 5 : maks <= 40 ? 10 : maks <= 100 ? 20 : Math.ceil(maks / 5 / 50) * 50;
  const puncak = Math.ceil(maks / langkah) * langkah;
  const garis = Array.from({ length: puncak / langkah + 1 }, (_, i) => i * langkah);
  const lebar = titik.length ? (W - kiri - kanan) / titik.length : 0;
  const y = (v: number) => atas + (H - bawah - atas) * (1 - v / puncak);
  const tertinggi = titik.reduce((a, b, i) => (b.jumlah > (titik[a]?.jumlah ?? -1) ? i : a), 0);
  const labelTiap = Math.max(1, Math.ceil(titik.length / 8));

  return (
    <Panel title="Arrivals per 15 minutes" sub="First check-in of the day per person, any checkpoint. The light bar is still filling." className={className}>
      {titik.length === 0 ? (
        <p className="px-5 pb-5 pt-2 text-body-medium text-on-surface-variant">No check-ins yet today. The chart starts with the first scan.</p>
      ) : (
        <div className="px-5 pb-4 pt-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Arrivals per 15 minutes today, highest ${titik[tertinggi].jumlah} at ${titik[tertinggi].mulai}`}>
            {garis.map((g) => (
              <g key={g}>
                <line x1={kiri} x2={W - kanan} y1={y(g)} y2={y(g)} className="stroke-outline-variant" strokeWidth={g === 0 ? 1 : 0.5} />
                <text x={kiri - 8} y={y(g) + 4} textAnchor="end" className="fill-on-surface-variant text-[11px]">{g}</text>
              </g>
            ))}
            {titik.map((isi, i) => {
              const terakhir = i === titik.length - 1;
              const w = Math.max(2, lebar * 0.6);
              const x = kiri + i * lebar + (lebar - w) / 2;
              const yy = y(isi.jumlah);
              const r = Math.min(4, w / 2, y(0) - yy);
              return (
                <g key={isi.mulai}>
                  <title>{`${isi.mulai}: ${isi.jumlah} ${isi.jumlah === 1 ? "person" : "people"}${terakhir ? " so far" : ""}`}</title>
                  <rect x={kiri + i * lebar} y={atas} width={lebar} height={H - bawah - atas} fill="transparent" />
                  {isi.jumlah > 0 ? (
                    <path d={`M${x},${y(0)} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + w - r} Q${x + w},${yy} ${x + w},${yy + r} V${y(0)} Z`} className={terakhir ? "fill-primary/40" : "fill-primary"} />
                  ) : null}
                  {(i === tertinggi || terakhir) && isi.jumlah > 0 ? (
                    <text x={x + w / 2} y={yy - 6} textAnchor="middle" className="fill-on-surface text-[11px] font-medium">{isi.jumlah}</text>
                  ) : null}
                  {i % labelTiap === 0 ? <text x={x + w / 2} y={H - 6} textAnchor="middle" className="fill-on-surface-variant text-[11px]">{isi.mulai}</text> : null}
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </Panel>
  );
}

/** Satu baris per jawaban kolom kelompok (mis. Batch): sudah dari total, dengan bar. */
export function GroupPanel({ title, baris, kolom, className, lebar }: {
  title: string;
  kolom: string;
  baris: Array<{ nilai: string | null; sudah: number; total: number }>;
  className?: string;
  /** Selebar halaman: baris berjajar sampai tiga kolom. */
  lebar?: boolean;
}) {
  return (
    <Panel title={title} sub={`By ${kolom}, the answer used in Who sees it`} className={className}>
      <ul className={cx("grid gap-x-8 gap-y-4 px-5 pb-5 pt-2", lebar && "sm:grid-cols-2 lg:grid-cols-3")}>
        {baris.map((isi) => {
          const p = persenTeks(isi.sudah, isi.total);
          return (
            <li key={isi.nilai ?? "kosong"} className="flex min-w-0 flex-col gap-2">
              <div className="flex items-baseline gap-2 text-body-medium tabular-nums">
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{isi.nilai ?? `No ${kolom} answer`}</span>
                <span className="whitespace-nowrap"><span className="font-medium">{angka(isi.sudah)}</span> / {angka(isi.total)}</span>
                <span className="w-10 text-end">{p.teks}</span>
              </div>
              <LinearProgress value={p.nilai} label={isi.nilai ?? `No ${kolom} answer`} />
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
