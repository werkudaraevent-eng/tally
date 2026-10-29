"use client";

import { useState } from "react";
import { ArrowsOut } from "@phosphor-icons/react";
import { DialogGambar, usePenampilGambar } from "@/components/landing/modern/penampil-gambar";
import type { OutfitPilihan } from "@/lib/outfit";
import { gabungMeta } from "@/lib/typography";

/** Kolom grid layar lebar per jumlah pilihan: empat sebaris, lima dan enam jadi 3 + 3. */
const KOLOM_LG: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-3", 6: "lg:grid-cols-3" };
/** Sama, diukur dari lebar wadah `@container` (896 px), bukan layar: blok Dress code halaman acara. */
const KOLOM_WADAH: Record<number, string> = { 1: "@4xl:grid-cols-1", 2: "@4xl:grid-cols-2", 3: "@4xl:grid-cols-3", 4: "@4xl:grid-cols-4", 5: "@4xl:grid-cols-3", 6: "@4xl:grid-cols-3" };

/**
 * Pilihan gaya satu outfit (mis. empat gaya Gala Dinner): peserta memakai
 * salah satunya. Tiap pilihan kartu foto + nama + deskripsi, pola "Where
 * you'll sleep" Airbnb dan panduan attire The Knot/Zola. Ponsel: digeser ke
 * samping dengan kartu berikutnya mengintip (M3 Carousel) dan titik penanda;
 * mulai 768 px grid. Ketuk foto untuk layar penuh, lalu geser antar-pilihan.
 */
export function PilihanOutfit({ pilihan, kapan, apa, judul, warna, labelBuka, teks, wadah = false }: {
  pilihan: OutfitPilihan[];
  kapan: string | null;
  apa: string;
  /** Judul bilah atas penampil: label halaman per acara (bawaan "Outfit"). */
  judul: string;
  warna: { tinta: string; redup: string; label: string };
  /** Label tombol foto tiap pilihan ("Buka foto Priyayi Jawa layar penuh"): string, karena komponen server tidak bisa mengirim fungsi. */
  labelBuka: string[];
  teks: { pilih: string; tutup: string; sebelumnya: string; berikutnya: string };
  /** Grid mengikuti lebar wadah `@container` (576 px dua kolom, 896 px sebaris), bukan layar. */
  wadah?: boolean;
}) {
  const penampil = usePenampilGambar();
  const [aktif, setAktif] = useState(0);
  const [terlihat, setTerlihat] = useState(0);
  // Penampil hanya berisi pilihan yang punya foto; pilihan tanpa foto tetap kartu teks.
  const berfoto = pilihan.flatMap((isi, indeks) => (isi.photo_url ? [indeks] : []));
  const sekarang = pilihan[berfoto[aktif] ?? 0];

  return (
    <div className="flex flex-col gap-3">
      <p className="border-t border-[#E6E8EC] pt-4 text-[12px] font-semibold uppercase leading-4 tracking-[0.06em]" style={{ color: warna.label }}>
        {teks.pilih}
      </p>
      <ul
        onScroll={(event) => {
          // Titik penanda mengikuti kartu yang paling kiri terlihat.
          const el = event.currentTarget;
          const lebar = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? el.clientWidth;
          setTerlihat(Math.round(el.scrollLeft / (lebar + 12)));
        }}
        className={`-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 [scrollbar-width:none] ${wadah ? `@xl:mx-0 @xl:grid @xl:snap-none @xl:grid-cols-2 @xl:gap-4 @xl:overflow-visible @xl:px-0 ${KOLOM_WADAH[Math.min(pilihan.length, 6)] ?? "@4xl:grid-cols-3"}` : `md:mx-0 md:grid md:snap-none md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 ${KOLOM_LG[Math.min(pilihan.length, 6)] ?? "lg:grid-cols-3"}`} [&::-webkit-scrollbar]:hidden`}
      >
        {pilihan.map((isi, indeks) => (
          <li key={indeks} className={`flex min-w-0 snap-start flex-col gap-3 ${wadah ? "@xl:w-auto" : "md:w-auto"} ${pilihan.length > 1 ? "w-[calc(100%-40px)] shrink-0" : "w-full"}`}>
            {isi.photo_url ? (
              <button
                type="button"
                onClick={(event) => {
                  setAktif(berfoto.indexOf(indeks));
                  penampil.buka(event);
                }}
                aria-label={labelBuka[indeks]}
                aria-haspopup="dialog"
                className="m3-state relative block aspect-[4/5] w-full cursor-zoom-in overflow-hidden rounded-[16px] bg-[#EEF1F6]"
              >
                {/* Papan gaya dari panitia: utuh di ponsel (sering penuh teks), dipotong 4:5 di grid. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={isi.photo_url} alt="" loading="lazy" decoding="async" className={`size-full object-contain ${wadah ? "@xl:object-cover" : "md:object-cover"}`} />
                <span aria-hidden className="pointer-events-none absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-full bg-white/90 text-[#1A2333] shadow-[0_1px_3px_rgb(16_24_40/0.18)]">
                  <ArrowsOut size={16} />
                </span>
              </button>
            ) : null}
            <div className="flex flex-col gap-1">
              <h4 className="text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]" style={{ color: warna.tinta }}>
                {isi.name}
              </h4>
              {isi.description ? (
                <p className="text-[14px] leading-5 [overflow-wrap:anywhere]" style={{ color: warna.redup }}>
                  {isi.description}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {pilihan.length > 1 ? (
        <div aria-hidden className={`flex justify-center gap-1.5 ${wadah ? "@xl:hidden" : "md:hidden"}`}>
          {pilihan.map((_, indeks) => (
            <span key={indeks} className={`h-1.5 rounded-full ${indeks === Math.min(terlihat, pilihan.length - 1) ? "w-4 bg-[#101E38]" : "w-1.5 bg-[#C9CED8]"}`} />
          ))}
        </div>
      ) : null}
      {sekarang?.photo_url ? (
        <DialogGambar
          penampil={penampil}
          src={sekarang.photo_url}
          alt={sekarang.name}
          judul={judul}
          tutupLabel={teks.tutup}
          galeri={{ indeks: aktif, jumlah: berfoto.length, ke: setAktif, label: { sebelumnya: teks.sebelumnya, berikutnya: teks.berikutnya } }}
          keterangan={
            <>
              <p className="text-[13px] font-semibold leading-5 text-[#E8C968] [overflow-wrap:anywhere]">{gabungMeta([kapan, apa])}</p>
              <p className="mt-0.5 text-[17px] font-semibold leading-6 [overflow-wrap:anywhere]">{sekarang.name}</p>
              {sekarang.description ? <p className="mt-1 text-[14px] leading-5 text-[#C9CED8] [overflow-wrap:anywhere]">{sekarang.description}</p> : null}
            </>
          }
        />
      ) : null}
    </div>
  );
}
