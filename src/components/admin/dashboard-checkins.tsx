"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EMPTY_VALUE, LinearProgress, SegmentedButton, StatusChip, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, type ChipTone } from "@/components/m3";
import Link from "@/components/event-link";
import { eventApiPath } from "@/lib/event-url";
import { cx } from "@/lib/m3/cx";
import type { BarisPantau } from "@/lib/pantau-checkin";
import { normalizeTimeZone } from "@/lib/timezone";

/**
 * Kartu "Check-ins by checkpoint" di Dashboard: tiap titik, berapa yang sudah
 * dari berapa yang diharapkan dan persentasenya. Pola Cvent OnArrival dan
 * Eventbrite Organizer (hadir dari total per sesi), dengan "diharapkan" dari
 * Who sees it baris Agenda yang ditautkan checkpoint.
 *
 * Diperbarui tiap 30 detik selama tab terlihat, langsung saat tab kembali
 * terlihat. Tidak tampil bila acara belum punya sesi Check-in atau checkpoint.
 */

type Data = { rows: BarisPantau[]; time_zone: string; updated_at: string };

const SELANG_MS = 30_000;
const SEMUA = "all";

function status(baris: BarisPantau): { tone: ChipTone; teks: string } {
  if (!baris.aktif) return { tone: "neutral", teks: "Closed" };
  if (baris.diharapkan > 0 && baris.sudah >= baris.diharapkan) return { tone: "success", teks: "Complete" };
  if (baris.baru_15 > 0) return { tone: "primary", teks: "Scanning" };
  if (baris.sudah === 0) return { tone: "neutral", teks: "Not started" };
  // Ada yang sudah masuk, tetapi tidak ada yang baru dalam 15 menit.
  return { tone: "neutral", teks: "Open" };
}

const persen = (baris: BarisPantau) => (baris.diharapkan > 0 ? Math.min(100, Math.round((baris.sudah / baris.diharapkan) * 100)) : 0);
const angka = (nilai: number) => new Intl.NumberFormat("en-GB").format(nilai);

export function DashboardCheckins({ className }: { className?: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [gagal, setGagal] = useState(false);
  const [hari, setHari] = useState<string | null>(null);

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

  const zona = normalizeTimeZone(data?.time_zone);
  const jam = useMemo(() => new Intl.DateTimeFormat("en-GB", { timeZone: zona, hour: "2-digit", minute: "2-digit" }), [zona]);
  const tanggalZona = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: zona }), [zona]);

  // Hari dari tanggal baris Agenda yang ditautkan. Titik tanpa tautan berlaku
  // sepanjang acara, jadi tampil di setiap hari.
  const daftarHari = useMemo(() => [...new Set((data?.rows ?? []).map((baris) => baris.tanggal).filter((t): t is string => Boolean(t)))].sort(), [data]);
  const hariIni = data ? tanggalZona.format(new Date(data.updated_at)) : null;
  const pilihan = hari ?? (hariIni && daftarHari.includes(hariIni) ? hariIni : SEMUA);
  const baris = (data?.rows ?? []).filter((isi) => pilihan === SEMUA || !isi.tanggal || isi.tanggal === pilihan);

  if (!data || data.rows.length === 0) {
    // Tanpa sesi dan checkpoint kartunya tidak ada; gagal sebelum pernah dimuat juga tidak.
    return null;
  }

  const labelHari = (tanggal: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${tanggal}T00:00:00Z`));

  return (
    <section aria-label="Check-ins by checkpoint" className={cx("flex flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-outline-variant px-5 py-3.5">
        <h2 className="min-w-0 flex-1 text-body-medium font-semibold">Check-ins by checkpoint</h2>
        <span className="text-body-medium text-on-surface-variant" aria-live="polite">
          {gagal ? "Couldn't refresh, retrying" : `Updated ${jam.format(new Date(data.updated_at))}`}
        </span>
      </div>
      {daftarHari.length > 1 ? (
        <div className="overflow-x-auto border-b border-outline-variant px-5 py-3">
          <SegmentedButton
            label="Day"
            value={pilihan}
            onChange={setHari}
            padat
            options={[{ value: SEMUA, label: "All days" }, ...daftarHari.map((t) => ({ value: t, label: labelHari(t) }))]}
          />
        </div>
      ) : null}

      {/* Ponsel: satu kartu per titik, angka besar di depan. */}
      <ul className="divide-y divide-outline-variant md:hidden">
        {baris.map((isi) => {
          const s = status(isi);
          return (
            <li key={isi.key} className="flex flex-col gap-2 px-5 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-body-medium font-medium [overflow-wrap:anywhere]">{isi.nama}</p>
                  <p className="text-body-medium text-on-surface-variant">
                    {[isi.jam ? isi.jam.slice(0, 5) : null, isi.tempat].filter(Boolean).join(" · ") || "All day"}
                  </p>
                </div>
                <StatusChip dot tone={s.tone}>{s.teks}</StatusChip>
              </div>
              <p className="flex items-baseline gap-2 tabular-nums">
                <span className="text-title-large font-semibold">{angka(isi.sudah)}</span>
                <span className="text-body-medium text-on-surface-variant">of {angka(isi.diharapkan)}</span>
                <span className="ms-auto text-title-medium font-semibold">{persen(isi)}%</span>
              </p>
              <LinearProgress value={persen(isi)} label={`${isi.nama} checked in`} />
              <p className="text-body-medium text-on-surface-variant tabular-nums">
                {[
                  isi.baru_15 > 0 ? `+${angka(isi.baru_15)} in last 15 min` : null,
                  isi.terakhir ? `last ${jam.format(new Date(isi.terakhir))}` : "No scans yet",
                  isi.lainnya > 0 ? `+${angka(isi.lainnya)} outside expected` : null,
                ].filter(Boolean).join(" · ")}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="hidden md:block">
        <Table density="compact" minWidth="880px">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Time</TableHeaderCell>
              <TableHeaderCell className="min-w-[240px]">Checkpoint</TableHeaderCell>
              <TableHeaderCell align="end">Checked in</TableHeaderCell>
              <TableHeaderCell className="w-[18%] min-w-[120px]"><span className="sr-only">Progress</span></TableHeaderCell>
              <TableHeaderCell align="end">%</TableHeaderCell>
              <TableHeaderCell align="end">Last 15 min</TableHeaderCell>
              <TableHeaderCell align="end">Last scan</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {baris.map((isi) => {
              const s = status(isi);
              return (
                <TableRow key={isi.key}>
                  <TableCell numeric className="whitespace-nowrap text-on-surface-variant">
                    {isi.jam ? isi.jam.slice(0, 5) : "All day"}
                    {pilihan === SEMUA && isi.tanggal ? <span className="block">{labelHari(isi.tanggal)}</span> : null}
                  </TableCell>
                  <TableCell>
                    <span className="block font-medium [overflow-wrap:anywhere]">{isi.nama}</span>
                    {isi.tempat ? <span className="block text-on-surface-variant [overflow-wrap:anywhere]">{isi.tempat}</span> : null}
                  </TableCell>
                  <TableCell align="end" numeric className="whitespace-nowrap">
                    <span className="font-semibold">{angka(isi.sudah)}</span>
                    <span className="text-on-surface-variant"> / {angka(isi.diharapkan)}</span>
                    {isi.lainnya > 0 ? <span className="block text-on-surface-variant" title="Checked in here but not in the group that sees the linked Agenda row">+{angka(isi.lainnya)} outside expected</span> : null}
                  </TableCell>
                  <TableCell><LinearProgress value={persen(isi)} label={`${isi.nama} checked in`} /></TableCell>
                  <TableCell align="end" numeric className="font-semibold">{persen(isi)}%</TableCell>
                  <TableCell align="end" numeric className="text-on-surface-variant">{isi.baru_15 > 0 ? `+${angka(isi.baru_15)}` : EMPTY_VALUE}</TableCell>
                  <TableCell align="end" numeric className="whitespace-nowrap text-on-surface-variant">{isi.terakhir ? jam.format(new Date(isi.terakhir)) : EMPTY_VALUE}</TableCell>
                  <TableCell><StatusChip dot tone={s.tone}>{s.teks}</StatusChip></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="border-t border-outline-variant px-5 py-3 text-body-medium text-on-surface-variant">
        Counts people, not scans. Expected is everyone who sees the checkpoint&apos;s linked Agenda row (Who sees it), or all active participants when it has no link. Refreshes every 30 seconds.{" "}
        <Link href="/admin/attendance" className="rounded-sm font-medium text-primary hover:underline">Check-in</Link>
      </p>
    </section>
  );
}
