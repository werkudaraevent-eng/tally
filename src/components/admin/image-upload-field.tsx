"use client";

import { Trash, UploadSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { ImagePreview } from "@/components/admin/image-preview";
import { useToast } from "@/components/toast";
import { cx } from "@/lib/m3/cx";

/**
 * Kolom unggah gambar untuk CMS.
 *
 * Dulu tiap layar CMS menulis sendiri logika unggahnya: pilih berkas, POST,
 * baca URL, tampilkan pratinjau, tangani gagal. Enam salinan berarti enam
 * perilaku yang bisa berbeda, dan yang paling sering berbeda adalah penanganan
 * kegagalannya: sebagian menampilkan toast, sebagian diam.
 *
 * Memakai endpoint `/api/display/background` yang sudah ada. Bucketnya
 * public-read, dan untuk gambar SEPERTI INI itu memang benar: banner acara,
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
      toast.error("Upload failed", "The connection dropped. Try again.");
      return;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error("Upload failed", data?.error?.details?.file ?? data?.error?.message ?? "Try another file.");
      return;
    }
    onChange(data.url as string);
    // "Terunggah", bukan "tersimpan". Berkasnya memang sudah naik, tetapi
    // halamannya belum berubah sampai admin menekan Simpan, dan admin yang
    // mengira sudah selesai akan menutup tab tanpa menyimpannya.
    toast.info("Image uploaded", "Click Save to apply it to the public page.");
  }

  const mati = disabled || uploading;

  return (
    <div lang="en">
      <p className="flex items-baseline gap-2 text-body-medium font-medium text-on-surface">
        {label}
        <span className="font-normal text-on-surface-variant">optional</span>
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {value ? <ImagePreview url={value} alt="" fit={fit} className={previewClassName} /> : null}

        {/* <label>, bukan <button> yang memanggil input tersembunyi lewat ref.
            Label yang membungkus input berkas sudah dapat difokuskan dan
            diaktifkan dengan papan ketik tanpa kode tambahan. */}
        <label
          className={cx(
            "inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-medium font-medium text-on-surface hover:bg-primary-soft focus-within:ring-2 focus-within:ring-primary",
            mati && "pointer-events-none opacity-50",
          )}
        >
          <UploadSimple size={16} aria-hidden />
          {uploading ? "Uploading…" : value ? "Replace image" : "Upload image"}
          <input
            type="file"
            className="sr-only"
            accept="image/png,image/jpeg,image/webp"
            disabled={mati}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Nilai input dikosongkan supaya memilih berkas YANG SAMA lagi
              // tetap memicu perubahan: jalan keluar satu-satunya setelah
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
            disabled={mati}
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-body-medium font-medium text-error hover:bg-error-soft disabled:opacity-50"
          >
            <Trash size={16} aria-hidden />
            Remove
          </button>
        ) : null}
      </div>

      {hint ? <p className="mt-1.5 text-body-medium text-on-surface-variant">{hint}</p> : null}
    </div>
  );
}
