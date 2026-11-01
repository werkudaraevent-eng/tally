"use client";

import { MagnifyingGlass, Warning } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, FilterChip, TextField } from "@/components/m3";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";

// Panel Seats: orang dulu, lalu kursi.
//
// Pola Social Tables / Cvent: daftar tamu yang belum duduk di samping denah,
// pilih orangnya lalu klik kursinya. Sebelumnya admin membuka kursi kosong satu
// per satu lalu mencari nama di dialog, tanpa pernah melihat siapa saja yang
// belum duduk. Daftar ini juga jalur papan ketik: kursi di denah adalah SVG.

export type Orang = { id: string; name: string; company: string | null; email: string | null; seat: string | null };
export type DaftarKursi = "unseated" | "seated";

export function SeatsPanel({
  sessionId,
  tanpaKursi,
  terisi,
  dipilih,
  onPilih,
  kursiBerikut,
  onDudukkan,
  menyimpan,
  diLuarDenah,
  segar,
}: {
  sessionId: number;
  /** Jumlah peserta aktif tanpa kursi di sesi ini (dari laporan pencocokan). */
  tanpaKursi: number;
  /** Jumlah kursi terisi di sesi ini. */
  terisi: number;
  dipilih: Orang | null;
  onPilih: (orang: Orang | null) => void;
  /** Kursi kosong pertama dari panggung, untuk jalur papan ketik. */
  kursiBerikut: string | null;
  onDudukkan: (label: string) => void;
  menyimpan: boolean;
  /** Orang yang kursinya tidak ada di denah. */
  diLuarDenah: Array<{ name: string; label: string }>;
  /** Berubah setiap kali kursi berubah, supaya daftar dimuat ulang. */
  segar: number;
}) {
  const [daftar, setDaftar] = useState<DaftarKursi>("unseated");
  const [q, setQ] = useState("");
  const [hasil, setHasil] = useState<Orang[] | null>(null);
  const [lebih, setLebih] = useState(false);
  const [galat, setGalat] = useState("");
  const minta = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      minta.current?.abort();
      const controller = new AbortController();
      minta.current = controller;
      const alamat = `/api/admin/seat-map/assign?session_id=${sessionId}&list=${daftar}&q=${encodeURIComponent(q.trim())}`;
      void fetch(alamat, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          const data = await response.json().catch(() => null);
          if (!response.ok) { setHasil([]); setGalat(data?.error?.message ?? "The list could not be loaded."); return; }
          setGalat("");
          setHasil(data?.results ?? []);
          setLebih(Boolean(data?.more));
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setHasil([]);
          setGalat("The list could not be loaded. Check the connection and try again.");
        });
    }, q ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [sessionId, daftar, q, segar]);

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Find a participant"
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="Name, organisation or email"
        leading={<MagnifyingGlass size={16} />}
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
        <FilterChip selected={daftar === "unseated"} onClick={() => setDaftar("unseated")}>Without a seat · {tanpaKursi.toLocaleString("en-GB")}</FilterChip>
        <FilterChip selected={daftar === "seated"} onClick={() => setDaftar("seated")}>Seated · {terisi.toLocaleString("en-GB")}</FilterChip>
      </div>

      <ul aria-label={daftar === "unseated" ? "Participants without a seat" : "Seated participants"} className="flex flex-col overflow-hidden rounded-md border border-outline-variant">
        {hasil === null ? <li className="px-3 py-2.5 text-body-medium text-on-surface-variant">Loading…</li> : null}
        {galat ? <li className="px-3 py-2.5 text-body-medium text-error">{galat}</li> : null}
        {hasil?.length === 0 && !galat ? (
          <li className="px-3 py-2.5 text-body-medium text-on-surface-variant">
            {q.trim() ? "No participants match." : daftar === "unseated" ? "Everyone has a seat in this session." : "Nobody has a seat in this session yet."}
          </li>
        ) : null}
        {hasil?.map((orang) => {
          const aktif = dipilih?.id === orang.id;
          const kedua = [orang.seat ? `Seat ${orang.seat}` : null, orang.company].filter(Boolean).join(" · ");
          return (
            <li key={orang.id} className="border-t border-outline-variant first:border-t-0">
              <button
                type="button"
                aria-pressed={aktif}
                onClick={() => onPilih(aktif ? null : orang)}
                className={cx("flex w-full items-center gap-3 px-3 py-2 text-left", aktif ? "bg-secondary-container" : "hover:bg-primary-soft")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-medium font-medium text-on-surface">{orang.name}</span>
                  {kedua ? <span className="block truncate text-body-small text-on-surface-variant">{kedua}</span> : null}
                </span>
                {aktif ? <span className="shrink-0 text-body-small font-medium text-primary">Pick a seat</span> : null}
              </button>
              {aktif ? (
                <div className="flex flex-wrap items-center gap-2 bg-secondary-container px-3 pb-2.5">
                  <span className="min-w-0 flex-1 text-body-small text-on-surface-variant">Click an empty seat on the map{orang.seat ? ` to move from ${orang.seat}` : ""}, or</span>
                  <Button size="sm" variant="outlined" disabled={!kursiBerikut || menyimpan} loading={menyimpan} onClick={() => kursiBerikut && onDudukkan(kursiBerikut)}>
                    {kursiBerikut ? `Seat in ${kursiBerikut}` : "No empty seat"}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
        {lebih ? <li className="border-t border-outline-variant px-3 py-2.5 text-body-small text-on-surface-variant">Showing the first 200. Search to find others.</li> : null}
      </ul>

      {diLuarDenah.length > 0 ? (
        <div role="note" className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
          <Warning size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">{plural(diLuarDenah.length, "person has", "people have")} a seat that isn&apos;t on the plan</p>
            <ul className="mt-1 text-on-surface-variant">
              {diLuarDenah.slice(0, 5).map((item) => <li key={`${item.label}-${item.name}`}>{item.name} · {item.label}</li>)}
              {diLuarDenah.length > 5 ? <li>and {diLuarDenah.length - 5} more</li> : null}
            </ul>
            <p className="mt-1 text-on-surface-variant">Seat them again, or add the table in Room layout.</p>
          </div>
        </div>
      ) : null}

      <p className="text-body-small text-on-surface-variant">
        To seat many people at once, import a spreadsheet with a seat column in the <Link href="/admin/participants" className="font-medium text-primary hover:underline">Participant list</Link>.
      </p>
    </div>
  );
}
