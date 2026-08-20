"use client";

import { Trash, UploadSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { ImagePreview } from "@/components/admin/image-preview";
import { useToast } from "@/components/toast";

/**
 * Kolom unggah gambar untuk CMS.
 *
 * Dulu tiap layar CMS menulis sendiri logika unggahnya — pilih berkas, POST,
 * baca URL, tampilkan pratinjau, tangani gagal. Enam salinan berarti enam
 * perilaku yang bisa berbeda, dan yang paling sering berbeda adalah penanganan
 * kegagalannya: sebagian menampilkan toast, sebagian diam.
 *
 * Memakai endpoint `/api/display/background` yang sudah ada. Bucketnya
 * public-read, dan untuk gambar SEPERTI INI itu memang benar — banner acara,
 * logo, dan latar layar memang untuk dilihat siapa saja. Berkas unggahan
 * PENDAFTAR punya endpoint sendiri dengan bucket privat; keduanya jangan
 * ditukar.
 */
export function ImageUploadField({
  label,
  hint,
  value,
  onChange,
  kind,
  disabled,
  previewClassName = "h-24 w-40",
  fit = "cover",
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (url: string | null) => void;
  /** Folder tujuan di bucket. Harus terdaftar di FOLDERS pada route unggahnya. */
  kind: string;
  disabled?: boolean;
  previewClassName?: string;
  fit?: "contain" | "cover";
}) {
  const [uploading, setUploading] = useState(false);
  const toast = useToast();

  async function upload(file: File) {
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    body.append("kind", kind);
    const response = await fetch("/api/display/background", { method: "POST", body }).catch(() => null);
    setUploading(false);
    if (!response) {
      toast.error("Unggah gagal", "Koneksi terputus. Coba lagi.");
      return;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error("Unggah gagal", data?.error?.details?.file ?? data?.error?.message ?? "Coba berkas lain.");
      return;
    }
    onChange(data.url as string);
    // "Terunggah", bukan "tersimpan". Berkasnya memang sudah naik, tetapi
    // halamannya belum berubah sampai admin menekan Simpan — dan admin yang
    // mengira sudah selesai akan menutup tab tanpa menyimpannya.
    toast.info("Gambar terunggah", "Tekan Simpan untuk menerapkannya ke halaman publik.");
  }

  return (
    <div>
      <p className="flex items-baseline gap-2 text-label-large font-semibold text-on-surface">
        {label}
        <span className="text-body-small font-normal text-on-surface-variant">opsional</span>
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {value ? <ImagePreview url={value} alt="" fit={fit} className={previewClassName} /> : null}

        {/* <label>, bukan <button> yang memanggil input tersembunyi lewat ref.
            Label yang membungkus input berkas sudah dapat difokuskan dan
            diaktifkan dengan papan ketik tanpa kode tambahan. */}
        <label
          className={`m3-state inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-md border border-outline px-4 text-label-large font-semibold ${
            disabled || uploading ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <UploadSimple size={18} weight="bold" />
          {uploading ? "Mengunggah…" : value ? "Ganti gambar" : "Unggah gambar"}
          <input
            type="file"
            className="sr-only"
            accept="image/png,image/jpeg,image/webp"
            disabled={disabled || uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Nilai input dikosongkan supaya memilih berkas YANG SAMA lagi
              // tetap memicu perubahan — jalan keluar satu-satunya setelah
              // unggahan pertama gagal.
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>

        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled || uploading}
            className="m3-state inline-flex min-h-12 items-center gap-2 rounded-md px-3 text-label-large font-semibold text-error disabled:opacity-50"
          >
            <Trash size={18} />
            Hapus
          </button>
        ) : null}
      </div>

      {hint ? <p className="mt-2 text-body-small leading-5 text-on-surface-variant">{hint}</p> : null}
    </div>
  );
}
