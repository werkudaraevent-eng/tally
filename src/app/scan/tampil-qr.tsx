"use client";

import { ArrowSquareOut, WarningCircle } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { usePakaiQrCheckpoint } from "@/components/checkpoint/pakai-qr-checkpoint";

/**
 * Show QR di layar pemindai (scan mandiri): seperti kasir QRIS, panitia
 * menampilkan kode dan peserta memindainya dari halaman pesertanya. Kodenya
 * berganti tiap 30 detik. Di atasnya: berapa yang sudah selesai di sesi ini
 * dan siapa yang barusan memindai sendiri.
 */

const jamRelatif = (iso: string, kini: number) => {
  const detik = Math.max(0, Math.round((kini - new Date(iso).getTime()) / 1000));
  if (detik < 10) return "just now";
  if (detik < 60) return `${detik} s ago`;
  return `${Math.floor(detik / 60)} min ago`;
};

export function TampilQrCheckpoint({ sesiId, terdaftar }: { sesiId: number; terdaftar: number | null }) {
  const { data, gambar, galat, sisaDetik, sisaPersen, kini } = usePakaiQrCheckpoint(sesiId);
  const judul = data?.checkpoints.map((cp) => cp.title).join(" · ") ?? "";

  return (
    <div className="space-y-3">
      <div className="rounded-3xl bg-surface-container-high px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-label-large text-on-surface-variant">Done here</p>
          <p className="text-label-large tabular-nums text-on-surface-variant">
            {data?.done != null ? `${data.done.toLocaleString("en-GB")}${terdaftar != null ? ` of ${terdaftar.toLocaleString("en-GB")}` : ""}` : ""}
          </p>
        </div>
        {data && data.recent.length > 0 ? (
          <ul className="mt-1.5 space-y-0.5 text-body-medium">
            {data.recent.map((baris) => (
              <li key={`${baris.name}-${baris.at}`} className="[overflow-wrap:anywhere]">
                <span className="font-semibold text-on-surface">{baris.name}</span>
                <span className="text-on-surface-variant">{` scanned it · ${jamRelatif(baris.at, kini)}`}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-body-medium text-on-surface-variant">Names show here as participants scan the code.</p>
        )}
      </div>

      <div className="flex flex-col items-center gap-3 rounded-3xl border border-outline-variant bg-white px-5 py-6 text-center text-[#1b1b1f]">
        {galat ? (
          <p role="alert" className="flex items-start gap-2 text-left text-body-medium text-error">
            <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
            {galat}
          </p>
        ) : null}
        {data && !data.open ? (
          <p role="alert" className="flex items-start gap-2 text-left text-body-medium font-medium text-error">
            <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
            This session is closed, so scans are refused. Open it in Check-in &gt; Sessions.
          </p>
        ) : null}
        <p className="text-title-medium font-semibold [overflow-wrap:anywhere]">
          Participants scan this to finish{judul ? <><br />{judul}</> : null}
        </p>
        {gambar ? (
          // eslint-disable-next-line @next/next/no-img-element -- QR dari data URL
          <img src={gambar} alt="Checkpoint QR" className="aspect-square w-full max-w-[min(300px,62dvh)] [image-rendering:pixelated]" />
        ) : (
          <div aria-hidden className="aspect-square w-full max-w-[300px] animate-pulse rounded-lg bg-[#eceef3] motion-reduce:animate-none" />
        )}
        <div aria-hidden className="h-1 w-full max-w-[300px] overflow-hidden rounded-full bg-[#e2e5ec]">
          <i className="block h-full bg-primary" style={{ width: `${sisaPersen}%` }} />
        </div>
        <p className="text-body-medium text-[#5a5f6b]" aria-live="off">
          {data ? `New code in ${sisaDetik} s · keep the screen on` : "Loading the code…"}
        </p>
        <Link
          href={`/checkpoint-qr?s=${sesiId}`}
          target="_blank"
          className="inline-flex min-h-12 items-center gap-1.5 rounded-full px-4 text-label-large font-semibold text-primary hover:bg-primary-soft"
        >
          Open on a big screen
          <ArrowSquareOut size={18} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
