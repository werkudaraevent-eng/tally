"use client";

import { CheckSquare, Suitcase, Warning } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/m3";
import { pesanGalatApi } from "@/lib/api-message";
import { eventApiPath } from "@/lib/event-url";
import type { TitipanBagasi } from "./types";

/**
 * Meja ambil bagasi di lembar hasil pemindaian (Check-in > Sessions > Luggage:
 * Pick-up). Pola tiket titip koper hotel dan baggage claim maskapai: QR
 * peserta adalah tiket klaimnya, foto dari meja titip adalah alat cocok.
 * Petugas mencocokkan koper di rak dengan foto, lalu menyerahkan semuanya
 * sekaligus.
 *
 * Titipan dibaca dari meja titip MANA PUN di acara ini (penyambungnya
 * pesertanya). Selama masih ada titipan yang belum diserahkan, layar pemindai
 * menahan tamu berikutnya (`onTertunda`), sama seperti meja titip: lembar yang
 * berganti di tengah jalan membuat petugas ragu koper ini sudah dicatat atau
 * belum.
 */

const jam = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
const hari = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const kantong = (n: number) => `${n} ${n === 1 ? "bag" : "bags"}`;

type Fase = "muat" | "siap" | "serah" | "batal" | "tenang";

export function LuggageHandover({
  sessionId,
  participantId,
  onTertunda,
  tempatTombol,
}: {
  sessionId: number;
  participantId: string;
  /** 1 selama ada titipan yang belum diserahkan di lembar ini, 0 bila tidak. */
  onTertunda?: (jumlah: number) => void;
  /** Tempat tombol utama di bilah aksi lembar hasil yang menempel di bawah. */
  tempatTombol?: HTMLElement | null;
}) {
  const [fase, setFase] = useState<Fase>("muat");
  const [titipan, setTitipan] = useState<TitipanBagasi[]>([]);
  const [galat, setGalat] = useState("");
  const [galatMuat, setGalatMuat] = useState(false);
  // Sudah diserahkan sebelum lembar ini dibuka (pemindaian ulang), bukan oleh tombol di lembar ini.
  const [lama, setLama] = useState(false);
  const [baru, setBaru] = useState(false);

  const menunggu = titipan.filter((item) => item.bag_count > 0 && !item.handed_over_at);
  const jumlahMenunggu = menunggu.reduce((total, item) => total + item.bag_count, 0);
  const diserahkan = titipan.filter((item) => item.handed_over_at);

  const onTertundaRef = useRef(onTertunda);
  useEffect(() => { onTertundaRef.current = onTertunda; });
  const tertunda = fase === "siap" || fase === "serah";
  useEffect(() => { onTertundaRef.current?.(tertunda ? 1 : 0); }, [tertunda]);
  useEffect(() => () => onTertundaRef.current?.(0), []);

  const terima = useCallback((daftar: TitipanBagasi[]) => {
    setTitipan(daftar);
    setFase(daftar.some((item) => item.bag_count > 0 && !item.handed_over_at) ? "siap" : "tenang");
  }, []);

  const muat = useCallback(async () => {
    setGalatMuat(false);
    const response = await fetch(
      eventApiPath(`/api/attendance/luggage/handover?session_id=${sessionId}&participant_id=${participantId}`),
      { cache: "no-store" },
    ).catch(() => null);
    if (!response?.ok) { setGalatMuat(true); return; }
    const daftar = ((await response.json()).drops ?? []) as TitipanBagasi[];
    setLama(daftar.some((item) => item.handed_over_at));
    terima(daftar);
  }, [sessionId, participantId, terima]);

  useEffect(() => {
    const timer = window.setTimeout(() => void muat(), 0);
    return () => window.clearTimeout(timer);
  }, [muat]);

  async function kirim(method: "POST" | "DELETE") {
    setFase(method === "POST" ? "serah" : "batal");
    setGalat("");
    const alamat = "/api/attendance/luggage/handover";
    const response = await fetch(
      method === "POST" ? eventApiPath(alamat) : eventApiPath(`${alamat}?session_id=${sessionId}&participant_id=${participantId}`),
      method === "POST"
        ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sessionId, participant_id: participantId }) }
        : { method },
    ).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      const sebab = response ? pesanGalatApi(body) ?? "Try again." : "No connection. Try again.";
      setGalat(method === "POST" ? `Not handed over. ${sebab}` : `Not undone. ${sebab}`);
      setFase(method === "POST" ? "siap" : "tenang");
      return;
    }
    const daftar = (body.drops ?? []) as TitipanBagasi[];
    setLama(false);
    setBaru(method === "POST");
    terima(daftar);
  }

  if (galatMuat) {
    return (
      <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 text-body-medium text-error">
        <Warning size={18} aria-hidden />
        <span className="min-w-0 flex-1">Could not load the luggage record.</span>
        <Button variant="outlined" size="sm" onClick={() => void muat()}>Try again</Button>
      </div>
    );
  }
  if (fase === "muat") {
    return <p role="status" className="mb-3 text-body-medium text-on-surface-variant">Loading luggage…</p>;
  }

  const adaKoper = titipan.some((item) => item.bag_count > 0);
  // Satu Undo untuk semua penyerahan petugas ini, di kartu pertamanya.
  const idBatal = diserahkan.find((item) => item.mine)?.id ?? null;
  const pertama = diserahkan[0] ?? null;

  const tombol =
    fase === "siap" || fase === "serah" ? (
      <Button variant="filled" size="md" className="max-[400px]:w-full" loading={fase === "serah"} onClick={() => void kirim("POST")}>
        Hand over {kantong(jumlahMenunggu)}
      </Button>
    ) : null;

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 flex items-center gap-2 text-title-small font-semibold">
        <Suitcase size={18} aria-hidden />
        Luggage to hand over
      </legend>

      {lama && pertama && fase === "tenang" ? (
        <p role="alert" className="mb-2 rounded-lg bg-warning-soft px-3 py-2 text-body-medium text-on-warning-soft">
          Already handed over at {jam(pertama.handed_over_at)}{pertama.handed_over_by ? ` by ${pertama.handed_over_by}` : ""}. Do not hand over again; check with the team lead if they say a bag is missing.
        </p>
      ) : null}

      {!adaKoper ? (
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3">
          <span className="block text-body-large font-medium">{titipan.length > 0 ? "Dropped no luggage" : "No luggage recorded"}</span>
          <span className="block text-body-medium text-on-surface-variant">
            {titipan.length > 0
              ? `Recorded at ${titipan[0].session_name || "the drop-off desk"} as no luggage.`
              : "Nobody scanned this person at a luggage drop-off desk. Ask where they left their bags."}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {titipan.filter((item) => item.bag_count > 0).map((item) => {
            const sudah = Boolean(item.handed_over_at);
            return (
              <div key={item.id} className="flex flex-col gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
                {item.photo_url ? (
                  <a href={item.photo_url} target="_blank" rel="noreferrer noopener" aria-label="Open luggage photo">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed URL berumur pendek */}
                    <img src={item.photo_url} alt={`Luggage photo, ${kantong(item.bag_count)}`} className="aspect-[4/3] w-full rounded-md object-cover" />
                  </a>
                ) : null}
                <div className="flex items-center gap-3 px-1">
                  <span className="min-w-0 flex-1">
                    <span className="block text-title-large font-semibold tabular-nums">{sudah && baru ? "Handed over" : kantong(item.bag_count)}</span>
                    <span className="block text-body-medium text-on-surface-variant">
                      {sudah && baru
                        ? `${kantong(item.bag_count)} · ${jam(item.handed_over_at)}${item.handed_over_by ? ` · by ${item.handed_over_by}` : ""}`
                        : `Dropped ${hari(item.recorded_at)} ${jam(item.recorded_at)}${item.session_name ? ` · ${item.session_name}` : ""}${item.by ? ` · by ${item.by}` : ""}${item.photo_url ? "" : " · no photo"}`}
                    </span>
                    {sudah && !baru ? (
                      <span className="block text-body-medium text-on-surface-variant">
                        Handed over {jam(item.handed_over_at)}{item.handed_over_by ? ` by ${item.handed_over_by}` : ""}
                      </span>
                    ) : null}
                  </span>
                  {item.id === idBatal && fase === "tenang" ? (
                    <Button variant="text" size="md" onClick={() => void kirim("DELETE")}>Undo</Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {galat ? (
        <p role="alert" className="mt-2 text-body-medium text-error">{galat}</p>
      ) : fase === "siap" || fase === "serah" ? (
        <p className="mt-2 text-body-medium text-on-surface-variant">Match the bags to the photo, then hand them over.</p>
      ) : baru && fase === "tenang" ? (
        <p role="status" className="mt-2 flex items-start gap-2 text-body-medium text-on-surface">
          <CheckSquare size={18} className="mt-0.5 shrink-0" aria-hidden />
          Saved. Scan the next participant.
        </p>
      ) : fase === "batal" ? (
        <p role="status" className="mt-2 text-body-medium text-on-surface-variant">Undoing…</p>
      ) : null}

      {tombol ? (tempatTombol ? createPortal(tombol, tempatTombol) : <div className="mt-3 flex flex-wrap justify-end gap-2">{tombol}</div>) : null}
    </fieldset>
  );
}
