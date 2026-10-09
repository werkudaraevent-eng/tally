import { Fragment, type ReactNode } from "react";
import { adaFormat, pecahTeks, type Blok, type Potongan } from "@/lib/landing-teks-kaya";

/**
 * Details agenda berformat (tebal, miring, warna tema, daftar) untuk halaman
 * publik. Teks tanpa format dirender persis seperti sebelumnya: satu <p>
 * dengan kelas pemanggil apa adanya, jadi acara lama tetap 0 px. Dengan
 * format, baris paragraf selalu dipisah (pre-line).
 *
 * Semua isi menjadi node teks React; tidak ada HTML dari data yang disisipkan.
 */
function Isi({ isi, warna }: { isi: Potongan[]; warna: string }) {
  return (
    <>
      {isi.map((p, index) => {
        let node: ReactNode = p.teks;
        if (p.miring) node = <em>{node}</em>;
        if (p.tebal) node = <strong className="font-semibold">{node}</strong>;
        if (p.warna) node = <span style={{ color: warna }}>{node}</span>;
        return <Fragment key={index}>{node}</Fragment>;
      })}
    </>
  );
}

type Kelompok = { jenis: Blok["jenis"]; baris: Blok[] };

function kelompokkan(blok: Blok[]): Kelompok[] {
  const hasil: Kelompok[] = [];
  for (const b of blok) {
    const akhir = hasil[hasil.length - 1];
    if (akhir && akhir.jenis === b.jenis) akhir.baris.push(b);
    else hasil.push({ jenis: b.jenis, baris: [b] });
  }
  return hasil;
}

export function TeksKaya({
  teks,
  className,
  warna = "var(--reg-primary)",
  as: Tag = "p",
}: {
  teks: string;
  /** Kelas paragraf lama (ukuran, warna, margin atas). Daftar memakai ukuran yang sama. */
  className: string;
  /** Warna tanda ==warna==: warna utama tema halaman. */
  warna?: string;
  /** Elemen teks lama tanpa format (Forum memakai <span className="block">). */
  as?: "p" | "span";
}) {
  if (!adaFormat(teks)) return <Tag className={className}>{teks}</Tag>;
  const kelompok = kelompokkan(pecahTeks(teks));
  return (
    <div className={className}>
      {kelompok.map((k, index) =>
        k.jenis === "p" ? (
          <p key={index} className="whitespace-pre-line">
            {k.baris.map((b, i) => (
              <Fragment key={i}>
                {i > 0 ? "\n" : null}
                <Isi isi={b.isi} warna={warna} />
              </Fragment>
            ))}
          </p>
        ) : (
          (() => {
            const Daftar = k.jenis === "ul" ? "ul" : "ol";
            return (
              <Daftar key={index} className={`${k.jenis === "ul" ? "list-disc" : "list-decimal"} pl-5 marker:text-[var(--reg-on-surface-variant)]`}>
                {k.baris.map((b, i) => (
                  <li key={i}>
                    <Isi isi={b.isi} warna={warna} />
                  </li>
                ))}
              </Daftar>
            );
          })()
        ),
      )}
    </div>
  );
}
