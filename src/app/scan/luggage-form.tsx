"use client";

import { Camera, CheckSquare, Minus, Plus, Suitcase, Warning, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, IconButton } from "@/components/m3";
import { pesanGalatApi } from "@/lib/api-message";
import { eventApiPath } from "@/lib/event-url";
import { cx } from "@/lib/m3/cx";
import { kecilkanFoto } from "./kecilkan-foto";
import type { CatatanBagasi } from "./types";

/**
 * Jumlah dan foto bagasi di lembar hasil pemindaian (Check-in > Sessions >
 * Record luggage). Pola meja bag drop maskapai dan titip koper hotel: petugas
 * menghitung, memotret semua bagasinya sekali, lalu menyimpan.
 *
 * Urutan kirimnya disengaja. Jumlah (beberapa byte) disimpan lebih dulu; foto
 * (dikecilkan di ponsel ke sekitar 200 KB) menyusul. Scanner tidak punya
 * antrean offline, jadi sinyal venue yang buruk paling-paling menghilangkan
 * fotonya, tidak pernah jumlahnya. Foto yang gagal bisa dicoba lagi atau
 * dilewati.
 *
 * Selama jumlah belum tersimpan atau foto masih menunggu, layar pemindai
 * menahan tamu berikutnya (`onTertunda`), sama seperti centang barang: lembar
 * yang berganti di tengah jalan menghapus hitungan yang sudah dibuat.
 */

const jam = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";

const kantong = (n: number) => `${n} ${n === 1 ? "bag" : "bags"}`;

type Fase = "muat" | "isi" | "simpan" | "foto" | "fotoGagal" | "selesai";

export function LuggageForm({
  sessionId,
  participantId,
  onTertunda,
  onKamera,
  tempatTombol,
}: {
  sessionId: number;
  participantId: string;
  /** 1 selama ada yang belum tersimpan di lembar ini, 0 bila tidak. */
  onTertunda?: (jumlah: number) => void;
  /** Kamera bawaan dibuka (true) dan ditutup (false): layar pemindai melepas dan menyalakan lagi kameranya. */
  onKamera?: (buka: boolean) => void;
  /** Tempat tombol utama di bilah aksi lembar hasil yang menempel di bawah. */
  tempatTombol?: HTMLElement | null;
}) {
  const [fase, setFase] = useState<Fase>("muat");
  const [catatan, setCatatan] = useState<CatatanBagasi | null>(null);
  const [jumlah, setJumlah] = useState(0);
  const [foto, setFoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [galat, setGalat] = useState("");
  const [galatMuat, setGalatMuat] = useState(false);
  // Baru disimpan di lembar ini (bukan catatan lama yang tampil saat scan ulang).
  const [baru, setBaru] = useState(false);
  const idJudul = useId();
  const pilihFoto = useRef<HTMLInputElement>(null);

  const onTertundaRef = useRef(onTertunda);
  useEffect(() => { onTertundaRef.current = onTertunda; });
  const tertunda = fase === "isi" || fase === "simpan" || fase === "foto" || fase === "fotoGagal";
  useEffect(() => { onTertundaRef.current?.(tertunda ? 1 : 0); }, [tertunda]);
  // Lembar ditutup atau berganti tamu: tidak ada lagi yang tertunda.
  useEffect(() => () => onTertundaRef.current?.(0), []);
  // URL pratinjau dilepas saat diganti atau lembar ditutup.
  useEffect(() => () => { if (foto) URL.revokeObjectURL(foto.url); }, [foto]);

  const muat = useCallback(async () => {
    setGalatMuat(false);
    const response = await fetch(
      eventApiPath(`/api/attendance/luggage?session_id=${sessionId}&participant_id=${participantId}`),
      { cache: "no-store" },
    ).catch(() => null);
    if (!response?.ok) { setGalatMuat(true); return; }
    const ada = ((await response.json()).luggage ?? null) as CatatanBagasi | null;
    setCatatan(ada);
    setJumlah(ada?.bag_count ?? 0);
    setFase(ada ? "selesai" : "isi");
  }, [sessionId, participantId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void muat(), 0);
    return () => window.clearTimeout(timer);
  }, [muat]);

  // Kamera ditutup tanpa foto (Chrome, Safari 16.4+): kamera pemindai menyala lagi.
  // Lewat addEventListener karena React belum mengenal `onCancel` pada input.
  const onKameraRef = useRef(onKamera);
  useEffect(() => { onKameraRef.current = onKamera; });
  useEffect(() => {
    const input = pilihFoto.current;
    if (!input) return;
    const batal = () => onKameraRef.current?.(false);
    input.addEventListener("cancel", batal);
    return () => input.removeEventListener("cancel", batal);
  }, [fase]);

  function bukaKamera() {
    onKamera?.(true);
    pilihFoto.current?.click();
  }

  async function ambil(berkas: File | undefined) {
    onKamera?.(false);
    if (!berkas) return;
    setGalat("");
    const kecil = await kecilkanFoto(berkas).catch(() => null);
    if (!kecil) { setGalat("Could not read this photo. Take it again."); return; }
    setFoto({ blob: kecil, url: URL.createObjectURL(kecil) });
  }

  async function kirimFoto(blob: Blob) {
    setFase("foto");
    const form = new FormData();
    form.set("session_id", String(sessionId));
    form.set("participant_id", participantId);
    form.set("file", blob, "luggage.jpg");
    const response = await fetch(eventApiPath("/api/attendance/luggage/photo"), { method: "POST", body: form }).catch(() => null);
    if (!response?.ok) {
      // Yang perlu diketahui petugas: jumlahnya aman, fotonya belum. Sebab
      // dari server (sinyal, ukuran) tidak mengubah langkahnya.
      setGalat("The count is saved, but the photo did not upload. Try again, or skip the photo.");
      setFase("fotoGagal");
      return;
    }
    const body = await response.json().catch(() => ({}));
    setCatatan(body.luggage as CatatanBagasi);
    setFoto(null);
    setGalat("");
    setBaru(true);
    setFase("selesai");
  }

  async function simpan() {
    setFase("simpan");
    setGalat("");
    const response = await fetch(eventApiPath("/api/attendance/luggage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, participant_id: participantId, bag_count: jumlah }),
    }).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      setGalat(response ? pesanGalatApi(body) ?? "Not saved. Try again." : "Not saved: no connection. Try again.");
      setFase("isi");
      return;
    }
    setCatatan(body.luggage as CatatanBagasi);
    if (foto) await kirimFoto(foto.blob);
    else { setBaru(true); setFase("selesai"); }
  }

  function lewatiFoto() {
    setFoto(null);
    setGalat("");
    setBaru(true);
    setFase("selesai");
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

  const ubahJumlah = fase === "isi";
  const fotoTampil = foto?.url ?? catatan?.photo_url ?? null;

  const tombol =
    fase === "isi" || fase === "simpan" ? (
      <Button variant="filled" size="md" className="max-[400px]:w-full" loading={fase === "simpan"} onClick={() => void simpan()}>
        {jumlah === 0 ? "No luggage" : `Save · ${kantong(jumlah)}`}
      </Button>
    ) : fase === "foto" || fase === "fotoGagal" ? (
      <>
        <Button variant="text" size="md" disabled={fase === "foto"} onClick={lewatiFoto}>Skip photo</Button>
        <Button variant="filled" size="md" loading={fase === "foto"} onClick={() => { if (foto) void kirimFoto(foto.blob); }}>
          Try photo again
        </Button>
      </>
    ) : null;

  return (
    <fieldset>
      <legend className="mb-2 flex items-center gap-2 text-title-small font-semibold">
        <Suitcase size={18} aria-hidden />
        Luggage
      </legend>

      {ubahJumlah || fase === "simpan" ? (
        <div className="flex flex-col gap-2">
          <div className="flex min-h-[72px] items-center gap-3 rounded-lg border border-outline bg-surface-container-lowest px-4 py-3">
            <span className="min-w-0 flex-1">
              <span id={idJudul} className="block text-body-large font-medium">How many bags?</span>
              <span className="block text-body-medium text-on-surface-variant">Suitcases, boxes</span>
            </span>
            <IconButton label="One bag fewer" variant="outlined" disabled={jumlah === 0 || fase === "simpan"} onClick={() => setJumlah((n) => Math.max(0, n - 1))}>
              <Minus size={22} weight="bold" />
            </IconButton>
            <output aria-labelledby={idJudul} aria-live="polite" className="min-w-10 text-center text-[1.75rem] font-semibold leading-9 tabular-nums">
              {jumlah}
            </output>
            <IconButton label="One bag more" variant="outlined" disabled={jumlah >= 30 || fase === "simpan"} onClick={() => setJumlah((n) => Math.min(30, n + 1))}>
              <Plus size={22} weight="bold" />
            </IconButton>
          </div>

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
          {fotoTampil ? (
            <div className="flex min-h-[72px] items-center gap-3 rounded-lg border border-outline bg-surface-container-lowest px-4 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: atau signed URL, bukan aset statis */}
              <img src={fotoTampil} alt="Luggage photo" className="h-14 w-[72px] shrink-0 rounded-md object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block text-body-large font-medium">{foto ? "Photo added" : "Photo saved earlier"}</span>
              </span>
              <Button variant="text" size="md" disabled={fase === "simpan"} onClick={bukaKamera}>Retake</Button>
              {foto ? (
                <IconButton label="Remove photo" disabled={fase === "simpan"} onClick={() => setFoto(null)}>
                  <X size={20} />
                </IconButton>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              disabled={fase === "simpan"}
              onClick={bukaKamera}
              className="m3-state flex min-h-[72px] items-center gap-3 rounded-lg border border-dashed border-outline bg-surface-container-lowest px-4 py-3 text-left disabled:opacity-50"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Camera size={24} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body-large font-medium text-primary">Take photo</span>
                <span className="block text-body-medium text-on-surface-variant">All bags in one photo</span>
              </span>
            </button>
          )}
        </div>
      ) : catatan ? (
        <div className="flex min-h-[72px] items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3">
          {catatan.photo_url ? (
            <a href={catatan.photo_url} target="_blank" rel="noreferrer noopener" className="shrink-0" aria-label="Open luggage photo">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URL berumur pendek */}
              <img src={catatan.photo_url} alt="" className="h-[90px] w-[120px] rounded-md object-cover" />
            </a>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block text-title-large font-semibold tabular-nums">{catatan.bag_count === 0 ? "No luggage" : kantong(catatan.bag_count)}</span>
            <span className="block text-body-medium text-on-surface-variant">
              {jam(catatan.updated_at)}{catatan.by ? ` · by ${catatan.by}` : ""}{!catatan.photo_url && catatan.bag_count > 0 ? " · no photo" : ""}
            </span>
          </span>
          {fase === "selesai" ? (
            <Button variant="text" size="md" onClick={() => { setJumlah(catatan.bag_count); setFase("isi"); }}>Edit</Button>
          ) : null}
        </div>
      ) : null}

      {galat ? (
        <p role="alert" className={cx("mt-2 rounded-lg px-3 py-2 text-body-medium", fase === "fotoGagal" ? "bg-warning-soft text-on-warning-soft" : "text-error")}>
          {galat}
        </p>
      ) : fase === "selesai" && catatan && baru ? (
        <p role="status" className="mt-2 flex items-start gap-2 text-body-medium text-on-surface">
          <CheckSquare size={18} className="mt-0.5 shrink-0" aria-hidden />
          Saved. Scan the next participant.
        </p>
      ) : null}

      {tombol ? (tempatTombol ? createPortal(tombol, tempatTombol) : <div className="mt-3 flex flex-wrap justify-end gap-2">{tombol}</div>) : null}
    </fieldset>
  );
}
