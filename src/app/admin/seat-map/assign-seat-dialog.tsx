"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Button, Dialog } from "@/components/m3";
import { INPUT } from "@/components/admin/compact-form";
import { cx } from "@/lib/m3/cx";

// Satu kursi di denah admin (Seating plan › Assign seats): siapa yang duduk,
// ganti orangnya, kosongkan, atau dudukkan orang baru di kursi kosong.
// Tulisannya lewat /api/admin/seat-map/assign, jalur yang sama dengan field
// Seat di modal peserta.

export type KursiDipilih = {
  sessionId: number;
  sessionName: string;
  label: string;
  /** Pemegang kursi saat dibuka; null bila kosong. */
  holder: { participantId: string; name: string } | null;
};

type Kandidat = { id: string; name: string; company: string | null; email: string | null; seat: string | null };

export function AssignSeatDialog({ kursi, onClose, onSaved }: { kursi: KursiDipilih | null; onClose: () => void; onSaved: (pesan: string) => void }) {
  const [mencari, setMencari] = useState(false);
  const [q, setQ] = useState("");
  const [hasil, setHasil] = useState<Kandidat[] | null>(null);
  const [pilihan, setPilihan] = useState<Kandidat | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState("");
  const minta = useRef<AbortController | null>(null);

  // Setiap kursi baru dimulai bersih: kursi kosong langsung ke pencarian.
  const [kursiTerakhir, setKursiTerakhir] = useState<KursiDipilih | null>(null);
  if (kursi !== kursiTerakhir) {
    setKursiTerakhir(kursi);
    setMencari(kursi !== null && kursi.holder === null);
    setQ("");
    setHasil(null);
    setPilihan(null);
    setGalat("");
  }

  useEffect(() => {
    if (!kursi || !mencari) return;
    const timer = window.setTimeout(() => {
      minta.current?.abort();
      const controller = new AbortController();
      minta.current = controller;
      void fetch(`/api/admin/seat-map/assign?session_id=${kursi.sessionId}&q=${encodeURIComponent(q.trim())}`, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          const data = await response.json().catch(() => null);
          if (!response.ok) { setHasil([]); setGalat(data?.error?.message ?? "Search failed."); return; }
          setGalat("");
          setHasil((data?.results ?? []).filter((row: Kandidat) => row.id !== kursi.holder?.participantId));
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setHasil([]);
          setGalat("Search failed. Try again.");
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [kursi, mencari, q]);

  async function simpan(participantId: string | null) {
    if (!kursi) return;
    setMenyimpan(true);
    setGalat("");
    const response = await fetch("/api/admin/seat-map/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: kursi.sessionId, label: kursi.label, participant_id: participantId, current_participant_id: kursi.holder?.participantId ?? null }),
    }).catch(() => null);
    setMenyimpan(false);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) {
      // Kursi berubah di tempat lain: denah disegarkan dan dialog ditutup.
      if (response?.status === 409) { onSaved(""); return; }
      setGalat(data?.error?.details?.seat ?? data?.error?.message ?? "The seat wasn't saved. Try again.");
      return;
    }
    onSaved(participantId ? `${pilihan?.name ?? "Participant"} is now in seat ${kursi.label}.` : `Seat ${kursi.label} is now empty.`);
  }

  const terbuka = kursi !== null;
  const judul = kursi ? `Seat ${kursi.label}` : "Seat";
  const keterangan = kursi ? (kursi.holder ? kursi.sessionName : `Empty · ${kursi.sessionName}`) : undefined;

  const aksi = !kursi ? null : mencari ? (
    <>
      <Button variant="outlined" size="sm" onClick={kursi.holder ? () => { setMencari(false); setPilihan(null); } : onClose} disabled={menyimpan}>
        {kursi.holder ? "Back" : "Cancel"}
      </Button>
      <Button size="sm" onClick={() => void simpan(pilihan!.id)} disabled={!pilihan} loading={menyimpan}>
        {!pilihan ? "Choose a participant" : pilihan.seat ? `Move ${pilihan.name} from ${pilihan.seat} to ${kursi.label}` : `Seat ${pilihan.name} in ${kursi.label}`}
      </Button>
    </>
  ) : (
    <>
      <Button variant="danger" size="sm" onClick={() => void simpan(null)} loading={menyimpan}>Remove from seat</Button>
      <Button variant="outlined" size="sm" onClick={() => setMencari(true)} disabled={menyimpan}>Change person</Button>
      <Button size="sm" onClick={onClose} disabled={menyimpan}>Done</Button>
    </>
  );

  return (
    <Dialog open={terbuka} onClose={onClose} title={judul} description={keterangan} actions={aksi} dismissible={!menyimpan} size="md">
      {kursi && !mencari && kursi.holder ? (
        <div className="rounded-lg border border-outline-variant px-3.5 py-3">
          <p className="text-body-large font-medium text-on-surface">{kursi.holder.name}</p>
        </div>
      ) : null}
      {kursi && mencari ? (
        <div className="flex flex-col gap-2">
          <label className="relative block">
            <span className="sr-only">Find a participant</span>
            <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              autoFocus
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Name, organisation or email"
              className={cx(INPUT, "w-full pl-9")}
            />
          </label>
          <p className="text-body-small text-on-surface-variant">{q.trim() ? "Up to 20 matches, people without a seat first." : "People without a seat in this session."}</p>
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto" aria-label="Participants">
            {hasil === null ? <li className="px-3 py-2 text-body-medium text-on-surface-variant">Searching…</li> : null}
            {hasil?.length === 0 && !galat ? <li className="px-3 py-2 text-body-medium text-on-surface-variant">No participants found.</li> : null}
            {hasil?.map((row) => {
              const dipilih = pilihan?.id === row.id;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    aria-pressed={dipilih}
                    onClick={() => setPilihan(row)}
                    className={cx("flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left", dipilih ? "bg-secondary-container" : "hover:bg-primary-soft")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-medium font-medium text-on-surface">{row.name}</span>
                      <span className="block truncate text-body-small text-on-surface-variant">{[row.company, row.email].filter(Boolean).join(" · ") || "—"}</span>
                    </span>
                    <span className={cx("shrink-0 text-body-small", row.seat ? "text-warning" : "text-on-surface-variant")}>
                      {row.seat ? `Seat ${row.seat} · will move` : "No seat"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {galat ? <p role="alert" className="mt-2 text-body-medium text-error">{galat}</p> : null}
    </Dialog>
  );
}
