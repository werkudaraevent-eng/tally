"use client";

import { useEffect, useState } from "react";
import { RegistrationFieldInput } from "@/components/registration-field-input";
import type { RegistrationFormConfig } from "@/lib/domain";
import { DEFAULT_REGISTRATION_SEED, type RegistrationThemeRoles } from "@/lib/registration-theme";
import { eventApiPath } from "@/lib/event-url";

/**
 * Pratinjau form pendaftaran di dalam CMS.
 *
 * Memakai `RegistrationFieldInput` yang SAMA dengan halaman publik, bukan tiruan.
 * Pratinjau yang digambar ulang dengan markup sendiri akan menyimpang pada
 * perubahan pertama, dan pratinjau yang menyimpang lebih berbahaya daripada
 * tidak ada pratinjau sama sekali — admin menyimpan sesuatu yang ia kira sudah
 * dilihatnya.
 *
 * Warnanya diminta ke server, bukan dihitung di sini. Perhitungannya harus
 * identik dengan yang dipakai saat menyimpan; dua implementasi yang berbeda
 * hasilnya membuat pratinjau berhenti menjadi pratinjau.
 */
export function RegistrationFormPreview({ config, eventName }: { config: RegistrationFormConfig; eventName: string }) {
  const seed = config.theme?.seed ?? DEFAULT_REGISTRATION_SEED;
  const [roles, setRoles] = useState<RegistrationThemeRoles | null>(config.theme?.roles ?? null);

  useEffect(() => {
    // Ditunda 250ms. Pemilih warna mengirim perubahan pada setiap gerakan
    // penggeser, dan tanpa jeda satu tarikan mouse menghasilkan puluhan
    // permintaan yang hasilnya langsung ditimpa permintaan berikutnya.
    let batal = false;
    const timer = window.setTimeout(() => {
      void fetch(eventApiPath(`/api/admin/registrasi/theme?seed=${encodeURIComponent(seed)}`), { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok || batal) return;
          const body = await response.json();
          if (!batal) setRoles(body.roles as RegistrationThemeRoles);
        })
        .catch(() => {
          // Diam-diam gagal: pratinjau memakai warna terakhir yang berhasil
          // diambil. Menampilkan galat di sini menarik perhatian ke masalah
          // jaringan sementara, sementara yang sedang dikerjakan admin adalah
          // menyusun pertanyaan.
        });
    }, 250);
    return () => { batal = true; window.clearTimeout(timer); };
  }, [seed]);

  const requireEmail = config.require_email !== false;
  const requirePhone = config.require_phone !== false;

  const style = roles
    ? {
        "--reg-surface": roles.surface,
        "--reg-field": roles.surface_container,
        "--reg-on-surface": roles.on_surface,
        "--reg-on-surface-variant": roles.on_surface_variant,
        "--reg-outline": roles.outline,
        "--reg-outline-variant": roles.outline_variant,
        "--reg-primary": roles.primary,
        "--reg-on-primary": roles.on_primary,
        "--reg-error-soft": roles.error_soft,
        "--reg-on-error-soft": roles.on_error_soft,
        backgroundColor: roles.surface,
        color: roles.on_surface,
      }
    : undefined;

  const label = "mt-5 block text-body-medium font-semibold";
  const input =
    "mt-2 h-12 w-full rounded-md border border-[var(--reg-outline)] bg-[var(--reg-field)] px-4 text-body-large " +
    "font-normal text-[var(--reg-on-surface)]";

  return (
    <div className="overflow-hidden rounded-lg border border-outline-variant">
      <p className="border-b border-outline-variant bg-panel-high px-4 py-2 text-label-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
        Pratinjau · seperti yang dilihat pendaftar
      </p>
      {/* `pointer-events-none` dan `inert`: ini gambar, bukan formulir.
          Tanpa keduanya, admin dapat mengetik ke dalam pratinjau lalu mengira
          isiannya tersimpan, dan pembaca layar akan menemukan dua formulir
          pendaftaran di satu halaman. */}
      <div className="max-h-[32rem] overflow-y-auto p-5" style={style as React.CSSProperties} inert>
        <div className="pointer-events-none mx-auto w-full max-w-lg select-none">
          {config.theme?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={config.theme.logo_url} alt="" className="mb-5 h-10 w-auto object-contain" />
          ) : null}
          <p className="text-body-small font-semibold uppercase tracking-[0.18em] text-[var(--reg-primary)]">Pendaftaran peserta</p>
          <h3 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{eventName}</h3>

          {config.welcome_text ? (
            <p className="mt-6 rounded-lg border border-[var(--reg-outline-variant)] p-4 text-body-medium leading-6">{config.welcome_text}</p>
          ) : null}

          <div>
            <label className={label}>Nama lengkap<input readOnly className={input} /></label>
            <label className={label}>
              Email {!requireEmail && <span className="font-normal text-[var(--reg-on-surface-variant)]">(opsional)</span>}
              <input readOnly className={input} />
            </label>
            <label className={label}>
              Nomor telepon {!requirePhone && <span className="font-normal text-[var(--reg-on-surface-variant)]">(opsional)</span>}
              <input readOnly className={input} />
            </label>
            <label className={label}>
              Perusahaan {!config.require_company && <span className="font-normal text-[var(--reg-on-surface-variant)]">(opsional)</span>}
              <input readOnly className={input} />
            </label>
            <label className={label}>
              Jabatan {!config.require_job_title && <span className="font-normal text-[var(--reg-on-surface-variant)]">(opsional)</span>}
              <input readOnly className={input} />
            </label>

            {(config.fields ?? []).map((field) => (
              <RegistrationFieldInput key={field.key} field={field} />
            ))}

            <div className="mt-7 flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--reg-primary)] px-5 font-semibold text-[var(--reg-on-primary)]">
              Daftar sekarang
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
