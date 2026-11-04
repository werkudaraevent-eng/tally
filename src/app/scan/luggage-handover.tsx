"use client";

import { Camera, CheckSquare, Suitcase, Warning, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, IconButton } from "@/components/m3";
import { pesanGalatApi } from "@/lib/api-message";
import { eventApiPath } from "@/lib/event-url";
import { cx } from "@/lib/m3/cx";
import { kecilkanFoto } from "./kecilkan-foto";
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
 *
 * Photo at hand-over (`foto`, per sesi, bawaan mati): petugas boleh memotret
 * koper yang diserahkan. Urutannya sama dengan meja titip: penyerahan disimpan
 * dulu, fotonya menyusul. Foto yang gagal terkirim tidak membatalkan
 * penyerahan; petugas mencoba lagi atau melewatinya. Lupa memotret sebelum
 * menekan Hand over: foto masih bisa ditambahkan sesudahnya, selama lembar ini
 * terbuka.
 */

const jam = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
const hari = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const kantong = (n: number) => `${n} ${n === 1 ? "bag" : "bags"}`;

/** Unggahan foto serah terima yang lebih lama dari ini dianggap gagal: Try photo again atau Skip photo. */
const BATAS_UNGGAH_MS = 15_000;

type Fase = "muat" | "siap" | "serah" | "batal" | "tenang" | "foto" | "fotoGagal";

export function LuggageHandover({
  sessionId,
  participantId,
  foto: fotoAktif = false,
  onTertunda,
  onKamera,
  tempatTombol,
}: {
  sessionId: number;
  participantId: string;
  /** Luggage: Pick-up > Photo at hand-over menyala di sesi ini. */
  foto?: boolean;
  /** Kamera bawaan dibuka (true) atau ditutup (false); kamera pemindai berhenti selama itu. */
  onKamera?: (buka: boolean) => void;
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
  const [foto, setFoto] = useState<{ blob: Blob; url: string } | null>(null);
  const pilihFoto = useRef<HTMLInputElement>(null);
  // Unggahan foto yang sedang berjalan: Skip photo dan batas waktu menghentikannya,
  // supaya sinyal lemah tidak menahan antrean di meja ambil.
  const unggahRef = useRef<AbortController | null>(null);

  const menunggu = titipan.filter((item) => item.bag_count > 0 && !item.handed_over_at);
  const jumlahMenunggu = menunggu.reduce((total, item) => total + item.bag_count, 0);
  const diserahkan = titipan.filter((item) => item.handed_over_at);

  const onTertundaRef = useRef(onTertunda);
  useEffect(() => { onTertundaRef.current = onTertunda; });
  const tertunda = fase === "siap" || fase === "serah" || fase === "foto" || fase === "fotoGagal";
  useEffect(() => { onTertundaRef.current?.(tertunda ? 1 : 0); }, [tertunda]);
  useEffect(() => () => onTertundaRef.current?.(0), []);
  // URL pratinjau dilepas saat diganti atau lembar ditutup.
  useEffect(() => () => { if (foto) URL.revokeObjectURL(foto.url); }, [foto]);

  // Kamera ditutup tanpa foto (Chrome, Safari 16.4+): kamera pemindai menyala lagi.
  const onKameraRef = useRef(onKamera);
  useEffect(() => { onKameraRef.current = onKamera; });
  useEffect(() => {
    const input = pilihFoto.current;
    if (!input) return;
    const batal = () => onKameraRef.current?.(false);
    input.addEventListener("cancel", batal);
    return () => input.removeEventListener("cancel", batal);
  }, [fase]);

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

  function bukaKamera() {
    onKamera?.(true);
    pilihFoto.current?.click();
  }

  async function kirimFoto(blob: Blob) {
    setFase("foto");
    setGalat("");
    const form = new FormData();
    form.set("session_id", String(sessionId));
    form.set("participant_id", participantId);
    form.set("file", blob, "handover.jpg");
    const kendali = new AbortController();
    unggahRef.current = kendali;
    const batas = window.setTimeout(() => kendali.abort(), BATAS_UNGGAH_MS);
    const response = await fetch(eventApiPath("/api/attendance/luggage/handover/photo"), { method: "POST", body: form, signal: kendali.signal }).catch(() => null);
    window.clearTimeout(batas);
    if (unggahRef.current === kendali) unggahRef.current = null;
    // Dilewati petugas selama mengunggah: lembar sudah tenang, jangan diubah lagi.
    if (kendali.signal.aborted && kendali.signal.reason === "lewati") return;
    if (!response?.ok) {
      // Yang perlu diketahui petugas: kopernya sudah tercatat diserahkan, fotonya belum.
      setGalat("The bags are handed over, but the photo did not upload. Try again, or skip the photo.");
      setFase("fotoGagal");
      return;
    }
    const body = await response.json().catch(() => ({}));
    setFoto(null);
    setBaru(true);
    terima((body.drops ?? []) as TitipanBagasi[]);
  }

  async function ambil(berkas: File | undefined) {
    onKamera?.(false);
    if (!berkas) return;
    setGalat("");
    const kecil = await kecilkanFoto(berkas).catch(() => null);
    if (!kecil) { setGalat("Could not read this photo. Take it again."); return; }
    const baruFoto = { blob: kecil, url: URL.createObjectURL(kecil) };
    setFoto(baruFoto);
    // Sudah diserahkan (lupa memotret sebelum Hand over): langsung dikirim.
    if (fase === "tenang") await kirimFoto(baruFoto.blob);
  }

  function lewatiFoto() {
    unggahRef.current?.abort("lewati");
    unggahRef.current = null;
    setFoto(null);
    setGalat("");
    setFase("tenang");
  }

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
    setTitipan(daftar);
    if (method === "POST" && foto) { await kirimFoto(foto.blob); return; }
    if (method === "DELETE") setFoto(null);
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

  // Foto serah terima yang sudah tersimpan untuk penyerahan petugas ini.
  const fotoSerah = diserahkan.find((item) => item.mine && item.handover_photo_url)?.handover_photo_url ?? null;
  // Baris foto: sebelum Hand over, selama foto dikirim atau gagal, dan sesudah
  // penyerahan petugas ini yang belum berfoto (lupa memotret).
  const barisFoto = fotoAktif && adaKoper && (
    fase === "siap" || fase === "serah" || fase === "foto" || fase === "fotoGagal"
    || (fase === "tenang" && idBatal !== null && !fotoSerah)
  );
  const fotoTerkunci = fase === "serah" || fase === "foto" || fase === "batal";

  const tombol =
    fase === "siap" || fase === "serah" ? (
      <Button variant="filled" size="md" className="max-[400px]:w-full" loading={fase === "serah"} onClick={() => void kirim("POST")}>
        Hand over {kantong(jumlahMenunggu)}
      </Button>
    ) : fase === "foto" || fase === "fotoGagal" ? (
      <>
        <Button variant="text" size="md" onClick={lewatiFoto}>Skip photo</Button>
        <Button variant="filled" size="md" loading={fase === "foto"} onClick={() => { if (foto) void kirimFoto(foto.blob); }}>
          Try photo again
        </Button>
      </>
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
                  <a href={item.photo_url} target="_blank" rel="noreferrer noopener" aria-label="Open drop-off photo" className="relative block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed URL berumur pendek */}
                    <img src={item.photo_url} alt={`Drop-off photo, ${kantong(item.bag_count)}`} className="aspect-[4/3] w-full rounded-md object-cover" />
                    {/* Dua foto di satu kartu (Photo at hand-over): yang besar selalu foto dari meja titip. */}
                    {fotoAktif || item.handover_photo_url ? (
                      <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-label-medium font-medium text-white">
                        Drop-off photo · {jam(item.recorded_at)}
                      </span>
                    ) : null}
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
                {sudah && item.handover_photo_url ? (
                  <a href={item.handover_photo_url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-3 px-1" aria-label="Open hand-over photo">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed URL berumur pendek */}
                    <img src={item.handover_photo_url} alt="" className="h-14 w-[72px] shrink-0 rounded-md object-cover" />
                    <span className="text-body-medium text-on-surface-variant">Hand-over photo · {jam(item.handed_over_at)}</span>
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {barisFoto ? (
        <div className="mt-2">
          <input
            ref={pilihFoto}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => { void ambil(event.target.files?.[0]); event.target.value = ""; }}
          />
          {foto ? (
            <div className="flex min-h-[72px] items-center gap-3 rounded-lg border border-outline bg-surface-container-lowest px-4 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: pratinjau, bukan aset statis */}
              <img src={foto.url} alt="Hand-over photo" className="h-12 w-16 shrink-0 rounded-md object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block text-body-large font-medium">Hand-over photo</span>
                <span className="block text-body-medium text-on-surface-variant">{fase === "foto" ? "Uploading…" : fase === "fotoGagal" ? "Not uploaded" : "Saved with the handover"}</span>
              </span>
              {fase === "siap" || fase === "serah" ? (
                <>
                  <IconButton label="Retake photo" disabled={fotoTerkunci} onClick={bukaKamera}>
                    <Camera size={20} />
                  </IconButton>
                  <IconButton label="Remove photo" disabled={fotoTerkunci} onClick={() => setFoto(null)}>
                    <X size={20} />
                  </IconButton>
                </>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              disabled={fotoTerkunci}
              onClick={bukaKamera}
              className="m3-state flex min-h-[72px] w-full items-center gap-3 rounded-lg border border-dashed border-outline bg-surface-container-lowest px-4 py-3 text-left disabled:opacity-50"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Camera size={24} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body-large font-medium text-primary">{fase === "tenang" ? "Add hand-over photo" : "Take hand-over photo"}</span>
                <span className="block text-body-medium text-on-surface-variant">Optional · the bags being handed over</span>
              </span>
            </button>
          )}
        </div>
      ) : null}

      {galat ? (
        <p role="alert" className={cx("mt-2 rounded-lg px-3 py-2 text-body-medium", fase === "fotoGagal" ? "bg-warning-soft text-on-warning-soft" : "text-error")}>{galat}</p>
      ) : fase === "siap" || fase === "serah" ? (
        <p className="mt-2 text-body-medium text-on-surface-variant">Match the bags to the photo, then hand them over.</p>
      ) : fase === "foto" ? (
        <p role="status" className="mt-2 text-body-medium text-on-surface-variant">Handed over. Uploading the photo…</p>
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
