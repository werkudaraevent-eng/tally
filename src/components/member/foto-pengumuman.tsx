/**
 * Foto pengumuman di area peserta (migrasi 202611060001).
 *
 * Tampil utuh (contain), tidak dipotong: foto tim biasanya lebar, dan
 * memotongnya rata seperti media kartu M3 bisa membuang orang di pinggir,
 * padahal gunanya justru mengenali wajah. Ketuk = buka ukuran penuh di tab
 * baru, tempat peserta bisa memperbesar dengan dua jari.
 *
 * Bingkai mengikuti ukuran foto (w-fit), jadi foto potret rata kiri dan chip
 * Perbesar menempel di sudut foto, bukan di sudut kotak kosong.
 *
 * `ringkas`: untuk lonceng, yang sempit dan memotong isi tiga baris.
 */
export function FotoPengumuman({
  src,
  alt,
  lang,
  ringkas = false,
  className = "",
}: {
  src: string;
  alt: string;
  lang: string;
  ringkas?: boolean;
  className?: string;
}) {
  const perbesar = lang === "en" ? "Enlarge" : "Perbesar";
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer noopener"
      className={`relative block w-fit max-w-full overflow-hidden rounded-[12px] bg-[rgb(16_30_56/0.06)] outline-offset-2 ${className}`}
    >
      {/* Gambar unggahan panitia di bucket publik; next/image butuh domain terdaftar per proyek. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={`block h-auto w-auto max-w-full object-contain ${ringkas ? "max-h-40" : "max-h-[480px]"}`}
      />
      {ringkas ? null : (
        <span
          aria-hidden
          className="absolute right-2 bottom-2 inline-flex min-h-8 items-center rounded-full bg-[rgb(11_24_45/0.72)] px-3 text-[13px] font-semibold leading-none text-white"
        >
          {perbesar}
        </span>
      )}
      <span className="sr-only">{` (${perbesar})`}</span>
    </a>
  );
}
