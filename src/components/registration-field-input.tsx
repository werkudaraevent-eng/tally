"use client";

import { CheckCircle, Paperclip, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";
import type { RegistrationField } from "@/lib/domain";
import { eventApiPath } from "@/lib/event-url";

/**
 * Satu kolom isian di form pendaftaran publik.
 *
 * Dipisah dari halamannya karena dua jenis di antaranya menyimpan keadaan
 * sendiri: kotak centang dan unggahan berkas. Yang terakhir bahkan memanggil
 * jaringan sebelum formulirnya dikirim.
 *
 * Kelas warnanya sengaja memakai `currentColor` dan variabel CSS, bukan peran
 * M3 aplikasi. Halaman ini memakai warna yang diturunkan dari warna merek
 * pilihan admin, dan warnanya disuntikkan sebagai variabel oleh halaman
 * pembungkusnya.
 */

const CONTROL =
  "mt-2 w-full rounded-md border px-4 py-3 text-body-large outline-none transition-colors " +
  "border-[var(--reg-outline)] bg-[var(--reg-field)] text-[var(--reg-on-surface)] " +
  "focus:border-[var(--reg-primary)]";

type UploadState = { id: string; name: string } | null;

export function RegistrationFieldInput({ field }: { field: RegistrationField }) {
  const [upload, setUpload] = useState<UploadState>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function kirimBerkas(file: File) {
    setUploading(true);
    setUploadError("");
    const body = new FormData();
    body.append("file", file);
    body.append("field_key", field.key);
    const response = await fetch(eventApiPath("/api/registrasi/upload"), { method: "POST", body }).catch(() => null);
    setUploading(false);
    if (!response) {
      setUploadError("Koneksi terputus saat mengunggah. Coba lagi.");
      return;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setUploadError(data?.error?.details?.file ?? data?.error?.details?.message ?? "Berkas ditolak. Coba berkas lain.");
      return;
    }
    setUpload({ id: data.id, name: data.name });
  }

  // Kotak centang: labelnya di KANAN kotak, tidak di atas seperti kolom lain.
  // Label di atas kotak centang membuat kotaknya melayang tanpa keterangan di
  // sebelahnya, dan pada layar sempit ia terbaca sebagai kotak tanpa arti.
  if (field.type === "checkbox") {
    return (
      <label className="mt-5 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          required={field.required}
          name={`extra.${field.key}`}
          value="true"
          className="mt-1 size-5 shrink-0 accent-[var(--reg-primary)]"
        />
        <span>
          <span className="block text-body-large font-semibold">{field.label}</span>
          {field.help_text ? (
            <span className="mt-1 block text-body-medium text-[var(--reg-on-surface-variant)]">{field.help_text}</span>
          ) : null}
        </span>
      </label>
    );
  }

  const optional = !field.required ? (
    <span className="font-normal text-[var(--reg-on-surface-variant)]">(opsional)</span>
  ) : null;

  if (field.type === "radio") {
    return (
      <fieldset className="mt-5">
        <legend className="text-body-medium font-semibold">{field.label} {optional}</legend>
        <div className="mt-2 space-y-2">
          {(field.options ?? []).map((option) => (
            <label key={option} className="flex cursor-pointer items-center gap-3 rounded-md border border-[var(--reg-outline)] px-4 py-3">
              <input
                type="radio"
                required={field.required}
                name={`extra.${field.key}`}
                value={option}
                className="size-5 shrink-0 accent-[var(--reg-primary)]"
              />
              <span className="text-body-large">{option}</span>
            </label>
          ))}
        </div>
        {field.help_text ? (
          <p className="mt-2 text-body-medium text-[var(--reg-on-surface-variant)]">{field.help_text}</p>
        ) : null}
      </fieldset>
    );
  }

  if (field.type === "file") {
    return (
      <div className="mt-5">
        <p className="text-body-medium font-semibold">{field.label} {optional}</p>
        {/* Nilai yang dikirim adalah id baris unggahan, bukan berkasnya.
            Berkasnya sudah naik lebih dulu lewat endpoint tersendiri, jadi
            formulir ini tetap satu permintaan JSON kecil — penting di jaringan
            venue yang sering putus di tengah pengiriman besar. */}
        <input type="hidden" name={`extra.${field.key}`} value={upload?.id ?? ""} />
        <label className="mt-2 flex min-h-12 w-full cursor-pointer items-center gap-2 rounded-md border border-dashed border-[var(--reg-outline)] px-4 py-3 text-body-medium">
          <Paperclip size={18} className="shrink-0" />
          {uploading ? "Mengunggah…" : upload ? "Ganti berkas" : "Pilih berkas"}
          <input
            type="file"
            className="sr-only"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void kirimBerkas(file);
            }}
          />
        </label>

        {upload ? (
          <p className="mt-2 flex items-center gap-2 text-body-medium">
            <CheckCircle size={18} weight="fill" className="shrink-0 text-[var(--reg-primary)]" />
            <span className="min-w-0 truncate">{upload.name}</span>
          </p>
        ) : null}

        {uploadError ? (
          <p role="alert" className="mt-2 flex items-start gap-2 rounded-md bg-[var(--reg-error-soft)] p-3 text-body-medium text-[var(--reg-on-error-soft)]">
            <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
            {uploadError}
          </p>
        ) : null}

        <p className="mt-2 text-body-medium text-[var(--reg-on-surface-variant)]">
          {field.help_text ? `${field.help_text} ` : ""}PNG, JPG, WebP, atau PDF. Maksimal 5 MB.
        </p>
      </div>
    );
  }

  return (
    <label className="mt-5 block text-body-medium font-semibold">
      {field.label} {optional}
      {field.type === "textarea" ? (
        <textarea
          required={field.required}
          maxLength={2000}
          rows={3}
          name={`extra.${field.key}`}
          placeholder={field.placeholder}
          className={`${CONTROL} resize-y font-normal leading-6`}
        />
      ) : field.type === "select" ? (
        <select required={field.required} name={`extra.${field.key}`} defaultValue="" className={`${CONTROL} font-normal`}>
          <option value="" disabled>Pilih…</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input
          required={field.required}
          type={field.type}
          maxLength={field.type === "number" || field.type === "date" ? undefined : 2000}
          min={field.type === "number" ? field.min : undefined}
          max={field.type === "number" ? field.max : undefined}
          name={`extra.${field.key}`}
          placeholder={field.placeholder}
          className={`${CONTROL} font-normal`}
        />
      )}
      {field.help_text ? (
        <span className="mt-2 block text-body-medium font-normal text-[var(--reg-on-surface-variant)]">{field.help_text}</span>
      ) : null}
    </label>
  );
}
