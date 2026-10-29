"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes, type Ref } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";

/**
 * Kolom rahasia masuk peserta (kata sandi, atau kolom kedua cara masuk dua
 * kolom seperti NIK) dengan tombol mata. Jenis password membuat pengelola
 * sandi HP (Google Password Manager, iCloud Keychain) menawarkan simpan dan
 * mengisinya lagi sesudah Keluar; Tally sendiri tidak menyimpan apa pun.
 *
 * Tombolnya di LUAR <label>: tombol di dalam label ikut menjadi nama kolom bagi
 * pembaca layar. Pemanggil menyambungkan labelnya lewat `id`.
 */
export function KolomSandi({
  ref,
  className,
  kelasLuar,
  labelTampil,
  labelSembunyi,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  ref?: Ref<HTMLInputElement>;
  id: string;
  labelTampil: string;
  labelSembunyi: string;
  /** Jarak dari label; kelas inputnya sendiri tanpa margin atas. */
  kelasLuar?: string;
}) {
  const [lihat, setLihat] = useState(false);
  const luarRef = useRef<HTMLDivElement>(null);
  // Saat dikirim, kembali tersembunyi: kolom yang masih type=text membuat
  // sebagian pengelola sandi tidak menawarkan simpan.
  useEffect(() => {
    const form = luarRef.current?.closest("form");
    if (!form) return;
    const sembunyikan = () => setLihat(false);
    form.addEventListener("submit", sembunyikan);
    return () => form.removeEventListener("submit", sembunyikan);
  }, []);
  return (
    <div ref={luarRef} className={`relative ${kelasLuar ?? ""}`}>
      <input
        {...props}
        ref={ref}
        type={lihat ? "text" : "password"}
        // Sandi dan NIK tidak dikoreksi atau dikapitalkan papan ketik ponsel.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`${className ?? ""} pr-14`}
      />
      <button
        type="button"
        aria-controls={props.id}
        aria-label={lihat ? labelSembunyi : labelTampil}
        onClick={() => setLihat((lama) => !lama)}
        className="m3-state absolute! inset-y-0 right-0 flex w-12 items-center justify-center rounded-md text-[var(--reg-on-surface-variant)]"
      >
        {lihat ? <EyeSlash size={22} aria-hidden /> : <Eye size={22} aria-hidden />}
      </button>
    </div>
  );
}
