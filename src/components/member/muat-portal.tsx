"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useLinkStatus } from "next/link";

/**
 * Penanda pindah tab portal Horizon (U-10). Tab portal adalah halaman server
 * dinamis: tanpa penanda, layar diam sekitar dua detik setelah tab diketuk.
 *
 * PenandaTab duduk di dalam tiap tautan tab dan melapor saat tautannya
 * tertunda (useLinkStatus); KerangkaPortal lalu menampilkan garis kemajuan
 * emas di bawah bilah atas, judul tab tujuan, dan kerangka isi. Bilah atas
 * dan bawah tetap di tempatnya.
 */

let tujuan: string | null = null;
const pendengar = new Set<() => void>();

function setel(tab: string | null) {
  if (tujuan === tab) return;
  tujuan = tab;
  pendengar.forEach((fn) => fn());
}

function langganan(fn: () => void) {
  pendengar.add(fn);
  return () => {
    pendengar.delete(fn);
  };
}

/** Di dalam <Link> tab: melapor saat navigasinya tertunda. */
export function PenandaTab({ tab }: { tab: string }) {
  const { pending } = useLinkStatus();
  useEffect(() => {
    if (pending) setel(tab);
    else if (tujuan === tab) setel(null);
  }, [pending, tab]);
  // Bila halaman berganti sebelum efek di atas sempat membersihkan.
  useEffect(() => () => {
    if (tujuan === tab) setel(null);
  }, [tab]);
  return null;
}

/** Tab yang sedang dituju, untuk ikon tab bawah yang langsung tampil aktif. */
export function useTabTujuan() {
  return useSyncExternalStore(langganan, () => tujuan, () => null);
}

export type KepalaTab = { judul: string; judulPonsel: string; catatan: string; jenis: "jadwal" | "kartu" };

export function KerangkaPortal({ kepala, garisLabel }: { kepala: Record<string, KepalaTab>; garisLabel: string }) {
  const tab = useTabTujuan();
  const isi = tab ? kepala[tab] : undefined;
  if (!tab || !isi) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-[15] overflow-hidden bg-[#FAF8F2] lg:top-[102px] lg:short:top-16">
      <div role="progressbar" aria-label={garisLabel} className="relative h-[3px] w-full overflow-hidden">
        <span className="m3-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-[var(--hz-emas)]" />
      </div>
      <div aria-hidden className="mx-auto w-full max-w-[1440px] px-6 pt-6 md:px-16 md:pt-12 lg:short:pt-6">
        <p className="whitespace-pre-line text-balance text-[30px] font-extrabold leading-[1.15] text-[#101E38] md:text-[48px] md:leading-[1.2] lg:short:text-[30px]">
          <span className="lg:hidden">{isi.judulPonsel}</span>
          <span className="hidden lg:inline">{isi.judul}</span>
        </p>
        {isi.catatan ? <p className="mt-1.5 text-[15px] leading-[1.5] text-[#526078] md:mt-[14px] md:text-[17px]">{isi.catatan}</p> : null}
        <div className="mt-8 flex flex-col gap-4">
          {isi.jenis === "jadwal" ? (
            <>
              <div className="flex gap-2">
                {[0, 1, 2, 3].map((n) => (
                  <span key={n} className="h-14 w-[74px] rounded-[16px] bg-[#E9ECF2]" />
                ))}
              </div>
              <span className="h-8 w-56 rounded-full bg-[#E9ECF2]" />
              {[0, 1, 2, 3].map((n) => (
                <div key={n} className="grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                  <span className="mt-4 h-4 w-16 rounded-full bg-[#E9ECF2]" />
                  <span className="h-[76px] rounded-[16px] bg-[#E9ECF2]" />
                </div>
              ))}
            </>
          ) : (
            [0, 1, 2].map((n) => <span key={n} className={`rounded-[20px] bg-[#E9ECF2] ${n === 0 ? "h-40" : "h-24"}`} />)
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Ikon tab bawah: pil emas untuk tab aktif, dan langsung untuk tab yang sedang
 * dituju, supaya ketukan terasa diterima sebelum halaman baru tiba.
 */
export function IkonTabBawah({ tab, aktif, isi, isiAktif }: { tab: string; aktif: boolean; isi: ReactNode; isiAktif: ReactNode }) {
  const dituju = useTabTujuan();
  const nyala = dituju ? dituju === tab : aktif;
  return (
    <span aria-hidden className={`relative flex h-6 w-12 items-center justify-center rounded-full ${nyala ? "bg-[var(--hz-emas)] text-[var(--hz-on-emas)]" : ""}`}>
      {nyala ? isiAktif : isi}
    </span>
  );
}
