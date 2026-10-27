import type { ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";
import { kelompokFaq, type FaqButir } from "@/lib/landing-faq";
import { FaqTopik } from "./faq-topik";
import { HEAD, MUTED } from "./styles";

/**
 * FAQ tampilan Daftar (DESIGN.md "FAQ tampilan Daftar"): baris bergaris seperti
 * Apple Support dan GOV.UK, semua tertutup. Bila panitia mengisi Kelompok,
 * pertanyaan dikelompokkan di bawah judul topik yang lebih besar dan tebal
 * daripada pertanyaannya; di layar lebar kolom kiri menempel dan berisi
 * daftar topik untuk melompat.
 */
export function FaqDaftar({ items, kepala, labelTopik, hitung }: {
  items: readonly FaqButir[];
  /** Judul bagian dan pengantar. */
  kepala: ReactNode;
  labelTopik: string;
  hitung: (n: number) => string;
}) {
  const kelompok = kelompokFaq(items).map((k, index) => ({ ...k, id: `faq-topik-${index + 1}` }));
  const berjudul = kelompok.filter((k) => k.judul);
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start lg:gap-20">
      <div className="flex flex-col gap-8 lg:sticky lg:top-[calc(var(--nav-h)+32px)]">
        <div className="flex flex-col gap-5">{kepala}</div>
        {berjudul.length >= 2 ? (
          <FaqTopik label={labelTopik} topik={berjudul.map((k) => ({ id: k.id, judul: k.judul ?? "", jumlah: k.butir.length }))} />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-12 lg:gap-14">
        {kelompok.map((k) => (
          <div key={k.id} id={k.judul ? k.id : undefined} className="scroll-mt-[calc(var(--nav-h)+24px)]">
            {k.judul ? (
              <div className="mb-2 flex flex-col gap-3">
                <span aria-hidden className="h-[3px] w-8 rounded-full bg-[var(--alis,var(--reg-primary))]" />
                <h3 className={`${HEAD} flex flex-wrap items-baseline gap-x-2 text-[20px] font-bold leading-7 tracking-[-0.01em] lg:text-[22px]`}>
                  {k.judul}
                  <span className={`text-[14px] font-medium leading-5 tracking-normal ${MUTED}`}>{hitung(k.butir.length)}</span>
                </h3>
              </div>
            ) : null}
            <div>
              {k.butir.map((item, index) => (
                <details key={`${index}-${item.q}`} className="faq group border-b border-[var(--reg-outline-variant)]">
                  {/* Lapisan hover 12px melewati teks di kiri-kanan, supaya tepinya tidak menempel. */}
                  <summary className="m3-state -mx-3 flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-sm px-3 py-4 text-title-medium font-medium sm:text-[17px] sm:leading-6 [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <CaretDown size={20} aria-hidden className={`shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none ${MUTED}`} />
                  </summary>
                  <p className={`max-w-[38.5rem] whitespace-pre-line pb-5 pr-9 text-isi ${MUTED}`}>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
