"use client";

import { useState, type FormEvent } from "react";
import type { LandingLang } from "@/lib/landing-i18n";
import { MASUK_UI } from "@/lib/member/masuk-i18n";

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

export const TAUTAN_TIDAK_BERLAKU = MASUK_UI.id.tautanTidakBerlaku;

/**
 * Kirim formulir. Dipakai halaman ini dan dialog masuk di halaman acara Modern
 * (components/member/masuk-dialog.tsx). English: pesan galat dari kode galatnya
 * (MASUK_UI.en.galat), karena pesan server berbahasa Indonesia.
 */
export async function kirimMasuk(
  slug: string,
  mode: MasukMode,
  isian: { email: string; password: string; token?: string },
  lang: LandingLang = "id",
): Promise<{ ok: true } | { ok: false; pesan: string }> {
  const { email, password, token } = isian;
  const body = mode === "masuk" ? { email, password } : mode === "tautan" ? { email } : { token, password };
  const response = await fetch(`/e/${encodeURIComponent(slug)}/api/peserta/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  const t = MASUK_UI[lang];
  if (!response) return { ok: false, pesan: t.koneksi };
  if (response.ok) return { ok: true };
  const data = await response.json().catch(() => null);
  if (t.galat) {
    const detik = Number(data?.error?.details?.retry_after_seconds);
    return { ok: false, pesan: t.galat(String(data?.error?.code ?? ""), mode, Number.isFinite(detik) ? Math.ceil(detik / 60) : null) };
  }
  return { ok: false, pesan: data?.error?.message ?? t.gagalUmum };
}

/** Kalimat setelah tautan dikirim. Sama untuk email terdaftar maupun tidak. */
export function pesanTautanTerkirim(email: string, lang: LandingLang = "id") {
  return MASUK_UI[lang].tautanTerkirim(email);
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
  lang = "id",
  halamanUrl = `/e/${slug}`,
}: {
  slug: string;
  modeAwal: MasukMode;
  minPassword: number;
  sandi?: MasukSandi;
  lang?: LandingLang;
  /** Halaman acara dalam bahasa ini; setelah masuk peserta diantar ke `<halamanUrl>/peserta`. */
  halamanUrl?: string;
}) {
  const t = MASUK_UI[lang];
  const [mode, setMode] = useState<MasukMode>(modeAwal);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [galat, setGalat] = useState(sandi === "invalid" ? t.tautanTidakBerlaku : "");
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
    const hasil = await kirimMasuk(slug, mode, { email, password, token: token?.token }, lang);
    setSibuk(false);
    if (!hasil.ok) {
      setGalat(hasil.pesan);
      return;
    }
    if (mode === "tautan") {
      setTerkirim(pesanTautanTerkirim(email, lang));
      return;
    }
    window.location.assign(`${halamanUrl}/peserta`);
  }

  const judul = mode === "masuk" ? t.masuk : t.judul[mode];

  return (
    <form onSubmit={kirim} className="flex w-full max-w-[440px] flex-col gap-6">
      <h2 className="text-[32px] font-semibold leading-tight [font-family:var(--landing-heading)] sm:text-[36px]">{judul}</h2>
      {mode === "tautan" ? (
        <p className="-mt-2 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">
          {t.untukPertamaKali}
        </p>
      ) : mode === "sandi" && token ? (
        <p className="-mt-2 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">{t.untuk(token.email)}</p>
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
          {t.emailLabel}
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder={t.emailPlaceholder}
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
              {mode === "masuk" ? t.sandiLabel : t.sandiBaruLabel}
            </label>
            {mode === "masuk" ? (
              <button type="button" onClick={() => ganti("tautan")} className="min-h-11 text-body-medium font-semibold text-[var(--reg-primary)] underline-offset-4 hover:underline">
                {t.lupa}
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
              {t.minimal(minPassword)}
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
          {sibuk ? t.memproses : t.tombol[mode]}
        </button>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-[var(--reg-outline-variant)] pt-6 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">
        {mode === "masuk" ? (
          <>
            <span>{t.belumPunya}</span>
            <button type="button" onClick={() => ganti("tautan")} className={TAUTAN}>
              {t.kirimTautan}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => ganti("masuk")} className={TAUTAN}>
            {t.sudahPunya} {t.masuk}
          </button>
        )}
      </div>
    </form>
  );
}
