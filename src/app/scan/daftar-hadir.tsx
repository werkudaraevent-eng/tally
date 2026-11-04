"use client";

import { ArrowClockwise, UserCheck, Users, WarningCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, EmptyState, SegmentedButton } from "@/components/m3";
import { SearchResultsSkeleton } from "@/components/search-loading";
import { eventApiPath } from "@/lib/event-url";
import type { BarisCari, Hasil } from "./types";

export type StatusDaftar = "belum" | "hadir";

type Muatan = {
  /** sesi|status: hasil milik pilihan yang mana. */
  kunci: string;
  rows: BarisCari[];
  next: string | null;
  gagal: boolean;
  /** Halaman berikutnya sedang dimuat. */
  lanjut: boolean;
  /** Refresh sedang berjalan; daftar lama tetap terlihat. */
  segar: boolean;
  /** Saat halaman pertama selesai dimuat, untuk "Updated 12:16". */
  waktu: number;
};

const jam = (iso: string | number | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";

// Hanya huruf dan angka: nama seperti Ana "Nana" tidak menjadi A".
const inisial = (nama: string) =>
  nama
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((kata) => kata.charAt(0).toUpperCase())
    .join("") || "?";

/**
 * Daftar "Not yet / Checked in" di tab Find name, sebelum petugas mengetik.
 *
 * Untuk koordinator di lapangan yang perlu tahu SIAPA yang belum datang tanpa
 * membuka laptop (Hanung, 2 Nov 2026). Hanung memilih semua petugas scan, bukan
 * peran "lead" terpisah: nama dan instansi memang sudah bisa dicari setiap
 * petugas lewat kolom yang sama, dan daftar ini tidak membawa email, telepon
 * atau kode QR.
 *
 * Satu check-in point, seluruh meja, urut nama. Daftar tidak memuat ulang
 * sendiri: daftar yang bergeser di bawah jari petugas yang sedang menggulir
 * lebih buruk daripada angka yang tertinggal satu menit. Yang dicatat dari
 * daftar ini ditandai di tempat; "Refresh" mengambil keadaan terbaru.
 */
export function DaftarHadir({
  sessionId,
  status,
  onStatus,
  hadir,
  belum,
  onCatat,
  mencatatId,
  sibuk,
  untuk = null,
}: {
  sessionId: number | null;
  status: StatusDaftar;
  onStatus: (status: StatusDaftar) => void;
  hadir: number | null;
  belum: number | null;
  onCatat: (baris: BarisCari) => Promise<Hasil | null>;
  mencatatId: string | null;
  sibuk: boolean;
  /**
   * Sesi dengan yang diharapkan (Who sees it baris Agenda checkpoint): label
   * kelompoknya, mis. "Batch 1". Not yet hanya kelompok itu; di Checked in,
   * orang di luar kelompok ditandai. Null: semua peserta aktif.
   */
  untuk?: string | null;
}) {
  const [muatan, setMuatan] = useState<Muatan | null>(null);
  const kunci = `${sessionId ?? 0}|${status}`;
  const kunciRef = useRef(kunci);
  useEffect(() => { kunciRef.current = kunci; }, [kunci]);

  const muat = useCallback(async (after: string | null) => {
    if (!sessionId) return;
    const milik = `${sessionId}|${status}`;
    setMuatan((lama) => (lama && lama.kunci === milik ? { ...lama, ...(after ? { lanjut: true } : { segar: true }), gagal: false } : lama));

    // Satu permintaan memeriksa paling banyak 2.000 nama. Bila semuanya ada di
    // sisi lain (2.000 nama pertama A–Z sudah hadir), halamannya kosong tetapi
    // masih ada lanjutan: diambil sendiri, bukan "Everyone is checked in".
    let kursor = after;
    let baru: BarisCari[] = [];
    let next: string | null = null;
    let gagal = false;
    for (let putaran = 0; putaran < 20; putaran++) {
      const alamat = eventApiPath(
        `/api/attendance/daftar?session_id=${sessionId}&status=${status}${kursor ? `&after=${encodeURIComponent(kursor)}` : ""}`,
      );
      const response = await fetch(alamat, { cache: "no-store" }).catch(() => null);
      // Jawaban untuk pilihan yang sudah ditinggalkan dibuang.
      if (kunciRef.current !== milik) return;
      const body = response?.ok ? ((await response.json().catch(() => null)) as { rows?: BarisCari[]; next?: unknown } | null) : null;
      if (!body) { gagal = true; break; }
      baru = [...baru, ...(body.rows ?? [])];
      next = typeof body.next === "string" ? body.next : null;
      if (baru.length > 0 || !next) break;
      kursor = next;
    }

    setMuatan((lama) => {
      const sama = lama?.kunci === milik ? lama : null;
      if (gagal) {
        // Gagal memuat tidak menghapus daftar yang sudah terlihat.
        return sama ? { ...sama, lanjut: false, segar: false, gagal: true } : { kunci: milik, rows: [], next: null, gagal: true, lanjut: false, segar: false, waktu: Date.now() };
      }
      const dasar = after ? sama : null;
      // Halaman berikutnya bisa membawa orang yang sudah ada (namanya berubah
      // di antara dua halaman); id yang sama tidak ditampilkan dua kali.
      const ada = new Set(dasar?.rows.map((row) => row.id));
      return {
        kunci: milik,
        rows: [...(dasar?.rows ?? []), ...baru.filter((row) => !ada.has(row.id))],
        next,
        gagal: false,
        lanjut: false,
        segar: false,
        waktu: dasar?.waktu ?? Date.now(),
      };
    });
  }, [sessionId, status]);

  useEffect(() => {
    // Mulai dari halaman pertama setiap kali check-in point atau pilihan berganti.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- muat() menulis state sesudah fetch, bukan seketika
    void muat(null);
  }, [muat]);

  const sekarang = muatan?.kunci === kunci ? muatan : null;

  async function catat(baris: BarisCari) {
    const data = await onCatat(baris);
    if (!data) return;
    // Ditandai di tempat, tidak dihapus: baris yang hilang dari bawah jari
    // membuat petugas mengetuk orang berikutnya tanpa sengaja.
    setMuatan((lama) =>
      lama && lama.kunci === kunciRef.current
        ? {
            ...lama,
            rows: lama.rows.map((row) =>
              row.id === baris.id
                ? { ...row, scan_count: data.scan_count ?? row.scan_count + 1, first_scan_at: data.first_scan_at ?? row.first_scan_at ?? new Date().toISOString() }
                : row,
            ),
          }
        : lama,
    );
  }

  if (!sessionId) return null;

  return (
    <section aria-label="Guest list" className="mt-4">
      <SegmentedButton<StatusDaftar>
        label="Show"
        size="lg"
        value={status}
        onChange={onStatus}
        options={[
          { value: "belum", label: "Not yet", badge: belum !== null ? belum.toLocaleString("en-GB") : undefined },
          { value: "hadir", label: "Checked in", badge: hadir !== null ? hadir.toLocaleString("en-GB") : undefined },
        ]}
        className="w-full"
      />
      <div className="mt-2 flex min-h-12 items-center justify-between gap-2">
        <p className="min-w-0 text-body-small text-on-surface-variant">
          All desks · A–Z{sekarang && !sekarang.gagal ? ` · updated ${jam(sekarang.waktu)}` : ""}
        </p>
        <Button
          variant="text"
          size="lg"
          icon={<ArrowClockwise size={20} aria-hidden />}
          onClick={() => void muat(null)}
          loading={sekarang === null || sekarang.segar}
        >
          Refresh
        </Button>
      </div>

      {/* Sinyal venue lemah: daftar terakhir tetap terlihat, dengan jalan
          mencoba lagi tepat di bawah Refresh yang baru ditekan. Warnanya sama
          dengan pita "not accepted" di layar pemindai, terbaca di tema gelap. */}
      {sekarang?.gagal && sekarang.rows.length > 0 ? (
        <div role="alert" className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-[#ffdad6] px-3 py-2.5 text-body-medium text-[#410002]">
          <span className="min-w-0 flex-1">The list didn&apos;t update. These are the names from {jam(sekarang.waktu)}.</span>
          <button type="button" onClick={() => void muat(null)} className="min-h-12 shrink-0 px-2 font-semibold underline underline-offset-2">
            Try again
          </button>
        </div>
      ) : null}

      <div aria-busy={sekarang === null}>
        {sekarang === null ? (
          <SearchResultsSkeleton rows={4} />
        ) : sekarang.gagal && sekarang.rows.length === 0 ? (
          <EmptyState
            icon={<WarningCircle size={40} />}
            title="The list didn't load"
            description="The venue network is not responding. Tap Refresh to try again."
          />
        ) : sekarang.rows.length === 0 ? (
          <EmptyState
            icon={<Users size={40} />}
            title={status === "belum" ? "Everyone is checked in" : "No one checked in yet"}
            description={status === "belum" ? (untuk ? `Everyone in ${untuk} has a scan at this check-in point.` : "Every participant has at least one scan at this check-in point.") : "Names appear here after their first scan at this check-in point."}
          />
        ) : (
          <>
            <ul className="divide-y divide-outline-variant">
              {sekarang.rows.map((baris) => {
                const sudahHadir = baris.scan_count > 0;
                return (
                  <li key={baris.id} className="flex min-h-[72px] items-center gap-3 py-2 sm:gap-4">
                    <span
                      aria-hidden
                      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary-container text-label-large font-semibold text-on-secondary-container"
                    >
                      {inisial(baris.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-body-large font-semibold leading-tight">{baris.name}</p>
                      <p className="truncate text-body-small text-on-surface-variant">
                        {[baris.company, baris.title].filter(Boolean).join(" · ") || "No organisation"}
                      </p>
                      {sudahHadir ? (
                        <p className="mt-0.5 text-label-medium text-success">
                          Checked in {jam(baris.first_scan_at)}
                          {baris.luar ? <span className="text-on-surface-variant"> · Other group</span> : null}
                        </p>
                      ) : null}
                    </div>
                    {/* Di daftar Checked in tidak ada tombol: mencatat ulang dari
                        sini hampir selalu salah ketuk. Pindai ulang tetap lewat
                        Scan atau pencarian. */}
                    {status === "belum" ? (
                      <Button
                        variant={sudahHadir ? "tonal" : "filled"}
                        size="lg"
                        onClick={() => void catat(baris)}
                        loading={mencatatId === baris.id}
                        disabled={sudahHadir || (sibuk && mencatatId !== baris.id)}
                        icon={sudahHadir ? undefined : <UserCheck size={20} weight="bold" aria-hidden />}
                        aria-label={sudahHadir ? `${baris.name} is checked in` : `Check in ${baris.name}`}
                        className="shrink-0"
                      >
                        {sudahHadir ? "Done" : "Check in"}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {sekarang.next ? (
              <>
                <Button variant="tonal" size="lg" className="mt-3 w-full" loading={sekarang.lanjut} onClick={() => void muat(sekarang.next)}>
                  Show more
                </Button>
                {sekarang.gagal ? <p className="mt-2 text-body-small text-error">The next names didn&apos;t load. Tap Show more to try again.</p> : null}
              </>
            ) : (
              <p className="mt-3 text-body-small text-on-surface-variant">
                {sekarang.rows.length === 1 ? "1 name." : `${sekarang.rows.length.toLocaleString("en-GB")} names.`} End of the list.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
