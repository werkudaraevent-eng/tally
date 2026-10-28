import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";

/**
 * Bilah masuk tema Gathering Trip di halaman acara (pola bilah "Reserve"
 * Airbnb dan "Pilih kamar" Traveloka): tanggal dan kota, sisa hari, dan satu
 * tombol emas ke Dashboard. Selalu menempel di bawah layar ponsel dan tablet,
 * karena hero Trip tidak membawa tombol; di desktop kartu Masuk di kolom kanan
 * yang mengambil perannya.
 */
export function BilahMasukTrip({ judul, fakta, hitung, aksi }: { judul: string; fakta: string | null; hitung: string | null; aksi: { href: string; label: string } }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E6E8EC] bg-white text-[#101E38] shadow-[0_-4px_16px_rgb(16_30_56/0.08)] print:hidden lg:hidden">
      <div className="mx-auto flex w-full max-w-[1200px] items-center gap-4 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:px-8">
        <div className="flex min-w-0 flex-col sm:flex-1">
          <p className="hidden truncate text-[16px] font-semibold leading-6 md:block">{judul}</p>
          <p className="flex min-w-0 items-center gap-2 text-[14px] leading-5">
            {fakta ? <span className="hidden truncate font-semibold sm:inline md:font-normal md:text-[#526078]">{fakta}</span> : null}
            {hitung ? <span className="inline-flex min-h-6 shrink-0 items-center rounded-full bg-[#FBF3D9] px-2 text-[12px] font-semibold leading-4 text-[#6B4F00]">{hitung}</span> : null}
          </p>
        </div>
        <Link
          href={aksi.href}
          className="m3-state inline-flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--hz-emas)] px-5 text-[14px] font-bold text-[var(--hz-on-emas)] [--m3-state-color:var(--hz-on-emas)] sm:flex-none"
        >
          <span className="truncate">{aksi.label}</span>
          <ArrowRight size={16} weight="bold" aria-hidden className="shrink-0" />
        </Link>
      </div>
    </div>
  );
}
