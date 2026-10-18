import type { ReactNode } from "react";

/**
 * Layar QR kehadiran Horizon (frame eY05h): navy, kartu putih 340 px,
 * petunjuk di bawah. Dipakai halaman `?tab=qr` (server) dan lapisan QR di
 * portal (klien, lapisan-qr.tsx), jadi komponen ini tanpa hook.
 *
 * Di bawah judul: nama acara dan tanggalnya, sama dengan gambar yang diunduh
 * (U-28). Di bawah nama: bus peserta, supaya kru bisa mencocokkan sekilas (E-10).
 */

const TINTA = "#101E38";
const REDUP = "#526078";
const REDUP_NAVY = "#CDD7EA";

export function QrHorizon({
  judul,
  judulId,
  judulTag: Judul = "h1",
  baris,
  tutup,
  luring,
  nama,
  sub,
  pil,
  kartuKode,
  petunjuk,
  petunjukCatatan,
  status,
  kecerahan,
}: {
  judul: string;
  judulId?: string;
  judulTag?: "h1" | "h2";
  /** "24 Fly Beyond Limit · 6–8 Nov 2026". */
  baris: string | null;
  /** Tombol atau tautan tutup (48 px), dari pemanggil. */
  tutup: ReactNode;
  /** Pesan luring untuk tamu, bila sedang tanpa sinyal. */
  luring?: ReactNode;
  nama: string;
  sub: string | null;
  /** Mis. "Bus 3". */
  pil?: string | null;
  kartuKode: ReactNode;
  petunjuk: string;
  petunjukCatatan: string;
  /** Baris status di bawah petunjuk: tersimpan di ponsel, layar menyala. */
  status?: ReactNode;
  kecerahan: string;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-6 pb-10">
      <div className="flex items-start justify-between gap-3 pb-4 pt-7">
        <div className="min-w-0 pt-1">
          <Judul id={judulId} className="text-[20px] font-extrabold leading-7">
            {judul}
          </Judul>
          {baris ? (
            <p className="mt-0.5 text-[14px] leading-5 [overflow-wrap:anywhere]" style={{ color: REDUP_NAVY }}>
              {baris}
            </p>
          ) : null}
        </div>
        {tutup}
      </div>
      {luring}
      <div className="mx-auto mt-6 flex w-full max-w-[340px] flex-col items-center gap-4 rounded-[24px] bg-white p-[30px]" style={{ color: TINTA }}>
        <div className="flex w-full flex-col items-center gap-2">
          <p className="text-center text-[20px] font-extrabold [overflow-wrap:anywhere]">{nama}</p>
          {sub ? (
            <p className="-mt-1 text-center text-[13px]" style={{ color: REDUP }}>
              {sub}
            </p>
          ) : null}
          {pil ? <p className="inline-flex min-h-8 items-center rounded-full bg-[var(--chip-aksen)] px-3.5 text-[13px] font-bold text-[var(--on-chip-aksen)]">{pil}</p> : null}
        </div>
        <div className="w-full">{kartuKode}</div>
      </div>
      <div className="mx-auto mt-10 flex w-full max-w-[340px] flex-col items-center gap-2 text-center">
        <p className="text-[15px] font-bold">{petunjuk}</p>
        <p className="text-[13px] text-[#C6D2E8]">{petunjukCatatan}</p>
        {status ? <div className="mt-4 flex flex-col items-center gap-1.5 text-[13px] leading-5 text-[#C6D2E8] empty:hidden">{status}</div> : null}
        <p className="mt-4 text-[13px] leading-[1.6]" style={{ color: REDUP_NAVY }}>
          {kecerahan}
        </p>
      </div>
    </div>
  );
}
