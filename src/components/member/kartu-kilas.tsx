import Link from "next/link";
import type { CSSProperties } from "react";
import { HEAD } from "@/components/landing/modern/styles";

/**
 * Kartu Kilas balik di Beranda portal Gathering (Horizon, Trip).
 * Tampil hanya selama Feedback dibuka, untuk peserta yang boleh membukanya
 * (semua, atau panitia saja saat Testing) dan belum mengirim jawaban, jadi
 * acara tanpa Feedback tidak berubah sama sekali. Teksnya diatur di
 * Feedback > Send > Card on participant Home; kosong = teks bawaan.
 */
/** `tumpuk`: selalu bersusun, untuk pratinjau sempit di admin (breakpoint mengikuti layar admin, bukan bingkai ponsel). */
export function KartuKilas({ kartu, tumpuk = false }: { kartu: { href: string; title: string; body: string; button: string } | null; tumpuk?: boolean }) {
  if (!kartu) return null;
  return (
    <section aria-labelledby="kilas-judul" className={`flex min-w-0 flex-col items-start gap-4 rounded-[16px] bg-white p-5 shadow-[0_1px_2px_rgb(16_24_40/0.06)] ${tumpuk ? "" : "sm:flex-row sm:items-center sm:justify-between sm:gap-6"}`}>
      <div className="min-w-0">
        <h2 id="kilas-judul" className={`${HEAD} text-[20px] font-semibold leading-tight ${tumpuk ? "" : "sm:text-[22px]"} [overflow-wrap:anywhere]`}>
          {kartu.title}
        </h2>
        <p className="mt-2 text-body-large leading-7 text-[#5F6B7F] [overflow-wrap:anywhere]">{kartu.body}</p>
      </div>
      <Link
        href={kartu.href}
        className={`m3-state inline-flex min-h-12 w-full shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-[var(--aksi)] px-6 text-title-small font-bold text-[var(--on-aksi)] ${tumpuk ? "" : "sm:w-auto"}`}
        style={{ "--m3-state-color": "var(--on-aksi)" } as CSSProperties}
      >
        {kartu.button}
      </Link>
    </section>
  );
}
