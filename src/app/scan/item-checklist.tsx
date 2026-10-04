"use client";

import { CheckSquare, Package, Warning } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/m3";
import { pesanGalatApi } from "@/lib/api-message";
import { eventApiPath } from "@/lib/event-url";
import { cx } from "@/lib/m3/cx";
import type { BarisBarang } from "./types";

/**
 * Daftar centang barang di lembar hasil pemindaian.
 *
 * Muncul hanya di sesi yang diberi barang oleh admin (Kehadiran, detail sesi).
 * Petugas mencentang barang yang benar-benar diserahkan, lalu menekan
 * Serahkan. Tidak ada yang tercentang sendiri: satu ketukan yang mencatat
 * semua barang akan ikut mencatat kaos yang stoknya habis di meja.
 *
 * Barang yang sudah pernah diambil (di sesi mana pun) tampil terkunci dengan
 * jam dan ukurannya. Itu yang ditahan di meja: kaos kedua untuk orang yang
 * sama. Petugas tidak bisa membatalkan penyerahan; hanya admin.
 */

const jam = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";

export function ItemChecklist({
  sessionId,
  laneId,
  participantId,
  onCentang,
  tempatTombol,
}: {
  sessionId: number;
  laneId: number | null;
  participantId: string;
  /**
   * Jumlah centang yang belum diserahkan, dilaporkan ke layar pemindai. Selama
   * masih ada, tamu berikutnya yang terpindai tidak boleh mengganti lembar ini:
   * centangnya akan hilang dan kaos yang sudah di tangan tamu tidak tercatat.
   */
  onCentang?: (jumlah: number) => void;
  /**
   * Tempat tombol Serahkan, di bilah aksi lembar hasil yang menempel di bawah.
   * Daftar barang yang panjang bergulir, dan aksi utamanya tidak boleh ikut
   * hilang dari layar. Tanpa tempat, tombolnya tetap di bawah daftar.
   */
  tempatTombol?: HTMLElement | null;
}) {
  const [items, setItems] = useState<BarisBarang[] | null>(null);
  const [galat, setGalat] = useState("");
  const [pilih, setPilih] = useState<Set<number>>(new Set());
  const [menyimpan, setMenyimpan] = useState(false);
  const [catatan, setCatatan] = useState<{ nada: "ok" | "peringatan"; teks: string } | null>(null);

  const onCentangRef = useRef(onCentang);
  useEffect(() => { onCentangRef.current = onCentang; });
  useEffect(() => { onCentangRef.current?.(pilih.size); }, [pilih]);
  // Lembar ditutup atau berganti tamu: tidak ada lagi yang tertunda.
  useEffect(() => () => onCentangRef.current?.(0), []);

  const muat = useCallback(async () => {
    setGalat("");
    const response = await fetch(
      eventApiPath(`/api/attendance/pickup?session_id=${sessionId}&participant_id=${participantId}`),
      { cache: "no-store" },
    ).catch(() => null);
    if (!response?.ok) {
      setGalat("Daftar barang gagal dimuat.");
      return;
    }
    setItems(((await response.json()).items ?? []) as BarisBarang[]);
  }, [sessionId, participantId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void muat(), 0);
    return () => window.clearTimeout(timer);
  }, [muat]);

  async function serahkan() {
    setMenyimpan(true);
    const response = await fetch(eventApiPath("/api/attendance/pickup"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, participant_id: participantId, item_ids: [...pilih], lane_id: laneId }),
    }).catch(() => null);
    setMenyimpan(false);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      setCatatan({ nada: "peringatan", teks: pesanGalatApi(body) ?? "Penyerahan gagal dicatat. Coba lagi." });
      return;
    }
    const baru = (body.items ?? []) as BarisBarang[];
    const nama = (ids: number[]) => ids.map((id) => baru.find((item) => item.item_id === id)?.name).filter(Boolean).join(", ");
    const sudah = (body.already ?? []) as number[];
    setItems(baru);
    setPilih(new Set());
    setCatatan(sudah.length > 0
      // Petugas lain mencatatnya di antara layar ini dimuat dan tombol ditekan.
      ? { nada: "peringatan", teks: `${nama(sudah)} ternyata sudah diambil sebelumnya, jadi tidak dicatat ulang.` }
      : { nada: "ok", teks: `Tercatat diserahkan: ${nama((body.recorded ?? []) as number[])}.` });
  }

  if (galat) {
    return (
      <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 text-body-medium text-error">
        <Warning size={18} aria-hidden />
        <span className="min-w-0 flex-1">{galat}</span>
        <Button variant="outlined" size="sm" onClick={() => void muat()}>Coba lagi</Button>
      </div>
    );
  }

  if (!items) {
    return <p role="status" className="mb-3 text-body-medium text-on-surface-variant">Memuat daftar barang</p>;
  }
  if (items.length === 0) return null;

  const belum = items.filter((item) => !item.picked_up_at).length;
  const tombol = (
    <Button
      variant="filled"
      size="md"
      // Di ponsel sempit tombol ini mengambil satu baris penuh di bawah Tutup.
      className="max-[400px]:w-full"
      loading={menyimpan}
      disabled={pilih.size === 0}
      onClick={() => void serahkan()}
    >
      {pilih.size === 0 ? "Serahkan barang" : `Serahkan ${pilih.size} barang`}
    </Button>
  );

  return (
    <fieldset>
      <legend className="mb-2 flex items-center gap-2 text-title-small font-semibold">
        <Package size={18} aria-hidden />
        Barang yang diserahkan
      </legend>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const diambil = Boolean(item.picked_up_at);
          const dipilih = pilih.has(item.item_id);
          return (
            <li key={item.item_id}>
              <label
                className={cx(
                  "flex min-h-14 items-center gap-3 rounded-lg border px-4 py-2",
                  diambil ? "border-outline-variant bg-surface-container text-on-surface-variant" : "cursor-pointer border-outline bg-surface-container-lowest",
                  dipilih && "border-primary bg-primary-soft",
                )}
              >
                <input
                  type="checkbox"
                  checked={diambil || dipilih}
                  disabled={diambil || menyimpan}
                  onChange={(event) => setPilih((lama) => {
                    const baru = new Set(lama);
                    if (event.target.checked) baru.add(item.item_id); else baru.delete(item.item_id);
                    return baru;
                  })}
                  className="size-6 shrink-0 accent-[var(--md-sys-color-primary)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-body-large font-medium">{item.name}</span>
                  {diambil ? (
                    <span className="block text-body-medium">
                      Sudah diambil pukul {jam(item.picked_up_at)}{item.picked_up_size ? `, ukuran ${item.picked_up_size}` : ""}
                    </span>
                  ) : item.has_size && !item.size ? (
                    <span className="block text-body-medium text-error">Ukuran belum diisi. Tanyakan, lalu minta admin mengisinya.</span>
                  ) : null}
                </span>
                {/* Ukuran dibuat sebesar ini karena itulah yang dicari petugas
                    di tumpukan kaos, bukan nama barangnya. */}
                {!diambil && item.size ? (
                  <span className="shrink-0 rounded-md bg-inverse-surface px-3 py-1 text-title-large font-semibold text-inverse-on-surface">{item.size}</span>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>
      {catatan ? (
        <p role="status" className={cx("mt-2 flex items-start gap-2 text-body-medium", catatan.nada === "ok" ? "text-on-surface" : "text-error")}>
          {catatan.nada === "ok" ? <CheckSquare size={18} className="mt-0.5 shrink-0" aria-hidden /> : <Warning size={18} className="mt-0.5 shrink-0" aria-hidden />}
          {catatan.teks}
        </p>
      ) : null}
      {belum === 0 ? (
        <p className="mt-2 text-body-medium text-on-surface-variant">Semua barang di sesi ini sudah diambil.</p>
      ) : null}
      {belum > 0 ? (tempatTombol ? createPortal(tombol, tempatTombol) : <div className="mt-3">{tombol}</div>) : null}
    </fieldset>
  );
}
