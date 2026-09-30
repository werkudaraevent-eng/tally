"use client";

import { useState, type FormEvent } from "react";

type Mode = "masuk" | "aktifkan";

const FIELD =
  "h-[52px] w-full rounded-md border border-[var(--reg-outline)] bg-[var(--reg-field)] px-4 text-body-large text-[var(--reg-on-surface)] outline-none focus-visible:border-[var(--reg-primary)] focus-visible:ring-2 focus-visible:ring-[var(--reg-primary)]";
const LABEL = "flex flex-col gap-2 text-body-large font-medium";

/**
 * Formulir masuk dan formulir membuat kata sandi. Satu komponen, dua mode,
 * karena peserta yang gagal masuk hampir selalu butuh mode kedua, dan
 * berpindah halaman di titik itu membuat email yang sudah diketik hilang.
 */
export function MasukClient({ slug, modeAwal, minPassword }: { slug: string; modeAwal: Mode; minPassword: number }) {
  const [mode, setMode] = useState<Mode>(modeAwal);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [galat, setGalat] = useState("");
  const [sibuk, setSibuk] = useState(false);

  function ganti(next: Mode) {
    setMode(next);
    setGalat("");
    setPassword("");
  }

  async function kirim(event: FormEvent) {
    event.preventDefault();
    setGalat("");
    setSibuk(true);
    const response = await fetch(`/e/${encodeURIComponent(slug)}/api/peserta/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "masuk" ? { email, password } : { email, code, password }),
    }).catch(() => null);
    if (!response) {
      setSibuk(false);
      setGalat("Koneksi terputus. Periksa jaringan Anda, lalu coba lagi.");
      return;
    }
    if (response.ok) {
      window.location.assign(`/e/${slug}/peserta`);
      return;
    }
    const body = await response.json().catch(() => null);
    setSibuk(false);
    setGalat(body?.error?.message ?? "Belum berhasil. Coba lagi.");
  }

  return (
    <form onSubmit={kirim} className="flex w-full max-w-[440px] flex-col gap-6">
      <h2 className="text-[32px] font-semibold leading-tight [font-family:var(--landing-heading)] sm:text-[36px]">
        {mode === "masuk" ? "Masuk" : "Buat kata sandi"}
      </h2>
      {mode === "aktifkan" ? (
        <p className="-mt-2 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">
          Pakai email yang Anda isi saat mendaftar dan kode peserta dari email konfirmasi atau undangan. Cara ini juga
          dipakai bila Anda lupa kata sandi.
        </p>
      ) : null}

      {galat ? (
        <p role="alert" className="rounded-md bg-[var(--reg-error-soft)] px-4 py-3 text-body-large leading-6 text-[var(--reg-on-error-soft)]">
          {galat}
        </p>
      ) : null}

      <label className={LABEL}>
        Email pendaftaran
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="nama@perusahaan.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={FIELD}
        />
      </label>

      {mode === "aktifkan" ? (
        <label className={LABEL}>
          Kode peserta
          <input
            required
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="mis. REG123456"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className={`${FIELD} uppercase tracking-[0.06em] placeholder:normal-case placeholder:tracking-normal`}
          />
        </label>
      ) : null}

      {/* Tombol "Lupa kata sandi?" di LUAR label: tombol di dalam <label>
          ikut menjadi nama kolom bagi pembaca layar. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="kata-sandi" className="text-body-large font-medium">
            {mode === "masuk" ? "Kata sandi" : "Kata sandi baru"}
          </label>
          {mode === "masuk" ? (
            <button
              type="button"
              onClick={() => ganti("aktifkan")}
              className="min-h-11 text-body-medium font-semibold text-[var(--reg-primary)] underline-offset-4 hover:underline"
            >
              Lupa kata sandi?
            </button>
          ) : null}
        </div>
        <input
          id="kata-sandi"
          type="password"
          required
          minLength={mode === "aktifkan" ? minPassword : undefined}
          autoComplete={mode === "masuk" ? "current-password" : "new-password"}
          aria-describedby={mode === "aktifkan" ? "kata-sandi-catatan" : undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={FIELD}
        />
        {mode === "aktifkan" ? (
          <span id="kata-sandi-catatan" className="text-body-medium text-[var(--reg-on-surface-variant)]">
            Minimal {minPassword} karakter.
          </span>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={sibuk}
        className="m3-state h-[52px] rounded-md bg-[var(--reg-primary)] text-title-medium font-semibold text-[var(--reg-on-primary)] disabled:opacity-60"
      >
        {sibuk ? "Memproses..." : mode === "masuk" ? "Masuk" : "Simpan kata sandi dan masuk"}
      </button>

      <div className="flex flex-col gap-2 border-t border-[var(--reg-outline-variant)] pt-6 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">
        {mode === "masuk" ? (
          <>
            <span className="font-semibold text-[var(--reg-on-surface)]">Pertama kali masuk?</span>
            <span>Buat kata sandi dengan email pendaftaran dan kode peserta dari undangan Anda.</span>
            <button
              type="button"
              onClick={() => ganti("aktifkan")}
              className="min-h-11 self-start font-semibold text-[var(--reg-primary)] underline-offset-4 hover:underline"
            >
              Buat kata sandi dengan kode peserta
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => ganti("masuk")}
            className="min-h-11 self-start font-semibold text-[var(--reg-primary)] underline-offset-4 hover:underline"
          >
            Sudah punya kata sandi? Masuk
          </button>
        )}
      </div>
    </form>
  );
}
