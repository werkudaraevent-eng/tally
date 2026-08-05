"use client";

import { ImageBroken } from "@phosphor-icons/react";
import { useState } from "react";

// Pratinjau gambar yang sudah diunggah.
//
// Ada karena tanpa pratinjau, satu-satunya tanda bahwa unggahan berhasil adalah
// tombol yang berubah dari "Unggah" menjadi "Ganti". Itu memberi tahu bahwa ADA
// gambar, bukan gambar YANG MANA — dan panitia yang salah pilih berkas baru
// menyadarinya ketika gambar itu sudah tampil di proyektor.
//
// Menangani gambar yang gagal dimuat secara eksplisit. URL tersimpan di database
// sementara berkasnya bisa hilang dari storage; tanpa penanganan ini yang tampil
// hanya kotak kosong, yang terbaca sama persis dengan "belum ada gambar" padahal
// artinya sangat berbeda dan tindakannya juga berbeda.

type Props = {
  url: string;
  alt: string;
  /** `contain` untuk logo dan gambar hadiah, `cover` untuk latar layar. */
  fit?: "contain" | "cover";
  className?: string;
  /** Tampilkan URL-nya di samping. Berguna saat memeriksa berkas mana yang terpakai. */
  showUrl?: boolean;
};

export function ImagePreview({ url, alt, fit = "contain", className = "h-16 w-24", showUrl = false }: Props) {
  const [failed, setFailed] = useState(false);
  // Kegagalan dilacak per URL. Tanpa ini, mengunggah gambar baru setelah satu
  // gambar gagal akan tetap menampilkan pesan galat, karena state-nya tidak
  // pernah kembali normal.
  const [seenUrl, setSeenUrl] = useState(url);
  if (seenUrl !== url) {
    setSeenUrl(url);
    setFailed(false);
  }

  if (failed) {
    return <div className={`flex ${className} shrink-0 flex-col items-center justify-center gap-1 border border-dashed border-[var(--danger)] bg-[#FDECEC] px-2 text-center`}>
      <ImageBroken size={18} className="text-[var(--danger)]" />
      <span className="text-[10px] font-semibold leading-tight text-[var(--danger)]">Gambar tidak dapat dimuat</span>
    </div>;
  }

  return <div className="flex items-center gap-3">
    {/* Latar kotak-kotak, bukan putih atau abu polos.
        PNG transparan di atas latar putih terlihat seperti gambar berlatar putih,
        jadi panitia tidak bisa tahu apakah berkasnya sudah benar sampai melihatnya
        di layar acara. Pola yang sama dipakai <BrandingEditor>. */}
    <span
      className={`flex ${className} shrink-0 items-center justify-center overflow-hidden border border-[var(--line)]`}
      style={{
        backgroundImage:
          "linear-gradient(45deg, #e6e6e6 25%, transparent 25%, transparent 75%, #e6e6e6 75%), linear-gradient(45deg, #e6e6e6 25%, transparent 25%, transparent 75%, #e6e6e6 75%)",
        backgroundSize: "12px 12px",
        backgroundPosition: "0 0, 6px 6px",
      }}
    >
      {/* `img` biasa, bukan next/image. URL-nya datang dari Supabase Storage dan
          bisa berubah kapan saja lewat CMS, sedangkan optimasi next/image butuh
          host yang didaftarkan lebih dulu di konfigurasi. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        onError={() => setFailed(true)}
        className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
      />
    </span>
    {showUrl && <span className="min-w-0 break-all text-[11px] leading-4 text-[var(--ink-muted)]">{url}</span>}
  </div>;
}
