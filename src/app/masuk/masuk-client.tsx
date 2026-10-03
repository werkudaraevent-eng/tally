"use client";

import { useState, type FormEvent } from "react";

/**
 * Tiga mode masuk area peserta:
 *   masuk   email + kata sandi
 *   tautan  "Kirim tautan ke email": membuat kata sandi pertama kali (peserta
 *           impor panitia) atau mengganti yang lupa
 *   sandi   dibuka dari tautan email: kata sandi baru, lalu langsung masuk
 *
 * Kode peserta tidak lagi dipakai di sini; kodenya untuk QR check-in.
 */
export type MasukMode = "masuk" | "tautan" | "sandi";

/** Tautan sandi dari email: masih berlaku (dengan emailnya), atau sudah tidak. */
export type MasukSandi = { token: string; email: string } | "invalid" | null;

export const TAUTAN_TIDAK_BERLAKU = "Tautan itu sudah dipakai atau kedaluwarsa. Minta tautan baru di bawah.";

/**
 * Kirim formulir. Dipakai halaman ini dan dialog masuk di halaman acara Modern
 * (components/member/masuk-dialog.tsx).
 */
export async function kirimMasuk(
  slug: string,
  mode: MasukMode,
  isian: { email: string; password: string; token?: string },
): Promise<{ ok: true } | { ok: false; pesan: string }> {
  const { email, password, token } = isian;
  const body = mode === "masuk" ? { email, password } : mode === "tautan" ? { email } : { token, password };
  const response = await fetch(`/e/${encodeURIComponent(slug)}/api/peserta/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!response) return { ok: false, pesan: "Koneksi terputus. Periksa jaringan Anda, lalu coba lagi." };
  if (response.ok) return { ok: true };
  const data = await response.json().catch(() => null);
  return { ok: false, pesan: data?.error?.message ?? "Belum berhasil. Coba lagi." };
}

/** Kalimat setelah tautan dikirim. Sama untuk email terdaftar maupun tidak. */
export function pesanTautanTerkirim(email: string) {
  // Netral untuk ketiga kemungkinan: tautan kata sandi, kabar "akses belum
  // dibuka" (peserta impor yang belum boleh masuk), atau tidak ada apa-apa.
  return `Bila ${email} terdaftar di acara ini, kami sudah mengirim email berisi langkah berikutnya. Periksa juga folder spam.`;
}

const FIELD =
  "h-[52px] w-full rounded-md border border-[var(--reg-outline)] bg-[var(--reg-field)] px-4 text-body-large text-[var(--reg-on-surface)] outline-none focus-visible:border-[var(--reg-primary)] focus-visible:ring-2 focus-visible:ring-[var(--reg-primary)]";
const LABEL = "flex flex-col gap-2 text-body-large font-medium";
const TAUTAN = "min-h-11 self-start font-semibold text-[var(--reg-primary)] underline-offset-4 hover:underline";

/**
 * Halaman masuk untuk tata letak selain Modern (Modern memakai dialog). Satu
 * komponen, tiga mode, supaya email yang sudah diketik tidak hilang saat
 * berpindah mode.
 */
export function MasukClient({
  slug,
  modeAwal,
  minPassword,
  sandi = null,
}: {
  slug: string;
  modeAwal: MasukMode;
  minPassword: number;
  sandi?: MasukSandi;
}) {
  const [mode, setMode] = useState<MasukMode>(modeAwal);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [galat, setGalat] = useState(sandi === "invalid" ? TAUTAN_TIDAK_BERLAKU : "");
  const [terkirim, setTerkirim] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const token = sandi && sandi !== "invalid" ? sandi : null;

  function ganti(next: MasukMode) {
    setMode(next);
    setGalat("");
    setTerkirim("");
    setPassword("");
  }

  async function kirim(event: FormEvent) {
    event.preventDefault();
    setGalat("");
    setSibuk(true);
    const hasil = await kirimMasuk(slug, mode, { email, password, token: token?.token });
    setSibuk(false);
    if (!hasil.ok) {
      setGalat(hasil.pesan);
      return;
    }
    if (mode === "tautan") {
      setTerkirim(pesanTautanTerkirim(email));
      return;
    }
    window.location.assign(`/e/${slug}/peserta`);
  }

  const judul = mode === "masuk" ? "Masuk" : mode === "tautan" ? "Kirim tautan ke email" : "Buat kata sandi";

  return (
    <form onSubmit={kirim} className="flex w-full max-w-[440px] flex-col gap-6">
      <h2 className="text-[32px] font-semibold leading-tight [font-family:var(--landing-heading)] sm:text-[36px]">{judul}</h2>
      {mode === "tautan" ? (
        <p className="-mt-2 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">
          Untuk membuat kata sandi pertama kali, atau bila Anda lupa kata sandi.
        </p>
      ) : mode === "sandi" && token ? (
        <p className="-mt-2 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">Untuk {token.email}.</p>
      ) : null}

      {galat ? (
        <p role="alert" className="rounded-md bg-[var(--reg-error-soft)] px-4 py-3 text-body-large leading-6 text-[var(--reg-on-error-soft)]">
          {galat}
        </p>
      ) : null}

      {terkirim ? (
        <p role="status" className="rounded-md bg-[var(--reg-primary-container)] px-4 py-3 text-body-large leading-6 text-[var(--reg-on-primary-container)]">
          {terkirim}
        </p>
      ) : null}

      {mode !== "sandi" && !terkirim ? (
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
      ) : null}

      {mode !== "tautan" ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="kata-sandi" className="text-body-large font-medium">
              {mode === "masuk" ? "Kata sandi" : "Kata sandi baru"}
            </label>
            {mode === "masuk" ? (
              <button type="button" onClick={() => ganti("tautan")} className="min-h-11 text-body-medium font-semibold text-[var(--reg-primary)] underline-offset-4 hover:underline">
                Lupa kata sandi?
              </button>
            ) : null}
          </div>
          <input
            id="kata-sandi"
            type="password"
            required
            minLength={mode === "sandi" ? minPassword : undefined}
            autoComplete={mode === "masuk" ? "current-password" : "new-password"}
            aria-describedby={mode === "sandi" ? "kata-sandi-catatan" : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={FIELD}
          />
          {mode === "sandi" ? (
            <span id="kata-sandi-catatan" className="text-body-medium text-[var(--reg-on-surface-variant)]">
              Minimal {minPassword} karakter.
            </span>
          ) : null}
        </div>
      ) : null}

      {!terkirim ? (
        <button
          type="submit"
          disabled={sibuk}
          className="m3-state h-[52px] rounded-md bg-[var(--reg-primary)] text-title-medium font-semibold text-[var(--reg-on-primary)] disabled:opacity-60"
        >
          {sibuk ? "Memproses..." : mode === "masuk" ? "Masuk" : mode === "tautan" ? "Kirim tautan" : "Simpan kata sandi dan masuk"}
        </button>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-[var(--reg-outline-variant)] pt-6 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">
        {mode === "masuk" ? (
          <>
            <span>Belum punya kata sandi?</span>
            <button type="button" onClick={() => ganti("tautan")} className={TAUTAN}>
              Kirim tautan ke email
            </button>
          </>
        ) : (
          <button type="button" onClick={() => ganti("masuk")} className={TAUTAN}>
            Sudah punya kata sandi? Masuk
          </button>
        )}
      </div>
    </form>
  );
}
