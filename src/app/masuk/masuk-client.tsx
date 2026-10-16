"use client";

import { useState, type FormEvent } from "react";
import type { LandingLang } from "@/lib/landing-i18n";
import { MASUK_UI } from "@/lib/member/masuk-i18n";
import type { CaraMasukPublik } from "@/lib/member/kolom-masuk";

/**
 * Tiga mode masuk area peserta:
 *   masuk   email + kata sandi
 *   tautan  "Kirim tautan ke email": membuat kata sandi pertama kali (peserta
 *           impor panitia) atau mengganti yang lupa
 *   sandi   dibuka dari tautan email: kata sandi baru, lalu langsung masuk
 *
 * Kode peserta tidak lagi dipakai di sini; kodenya untuk QR check-in.
 */
export type MasukMode = "masuk" | "tautan" | "sandi" | "kode" | "verifikasi" | "kolom";

/** Mode pembuka tiap cara masuk acara (landing_config.member.sign_in). */
export function modeDasar(cara: CaraMasukPublik): MasukMode {
  return cara.jenis === "email_code" ? "kode" : cara.jenis === "fields" ? "kolom" : "masuk";
}

/**
 * Mode dari alamat (`?mode=tautan`) dan halaman, untuk cara acara ini. Lupa
 * kata sandi hanya ada di cara email + kata sandi; tautan sandi dari email
 * (`sandi`) tetap berlaku di semua cara.
 */
export function modeAwalUntuk(awal: MasukMode, cara: CaraMasukPublik): MasukMode {
  if (cara.jenis === "password" || awal === "sandi") return awal;
  return modeDasar(cara);
}

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
  isian: { email: string; password: string; token?: string; kode?: string; nilai?: [string, string] },
  lang: LandingLang = "id",
): Promise<{ ok: true } | { ok: false; pesan: string }> {
  const { email, password, token } = isian;
  const body =
    mode === "masuk" ? { email, password }
    : mode === "tautan" || mode === "kode" ? (lang === "en" ? { email, lang } : { email })
    : mode === "verifikasi" ? { email, kode: isian.kode ?? "" }
    : mode === "kolom" ? { nilai: isian.nilai ?? ["", ""] }
    : { token, password };
  const jalur = mode === "verifikasi" ? "kode/masuk" : mode;
  const response = await fetch(`/e/${encodeURIComponent(slug)}/api/peserta/${jalur}`, {
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

// Garis dan placeholder sama dengan dialog masuk (masuk-dialog.tsx, KOLOM):
// campuran tinta 58% (sekitar 4,2:1) menggantikan --reg-outline (2,41:1).
const FIELD =
  "h-[52px] w-full rounded-md border border-[color-mix(in_srgb,var(--reg-on-surface)_58%,var(--reg-field,#ffffff))] bg-[var(--reg-field)] px-4 placeholder:text-[var(--reg-on-surface-variant)] text-body-large text-[var(--reg-on-surface)] outline-none focus-visible:border-[var(--reg-primary)] focus-visible:ring-2 focus-visible:ring-[var(--reg-primary)]";
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
  cara = { jenis: "password" },
}: {
  slug: string;
  modeAwal: MasukMode;
  minPassword: number;
  sandi?: MasukSandi;
  lang?: LandingLang;
  /** Halaman acara dalam bahasa ini; setelah masuk peserta diantar ke `<halamanUrl>/peserta`. */
  halamanUrl?: string;
  /** Cara masuk acara ini (landing_config.member.sign_in). */
  cara?: CaraMasukPublik;
}) {
  const t = MASUK_UI[lang];
  const [mode, setMode] = useState<MasukMode>(modeAwalUntuk(modeAwal, cara));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [kode, setKode] = useState("");
  const [nilai, setNilai] = useState<[string, string]>(["", ""]);
  const [catatan, setCatatan] = useState("");
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
    setCatatan("");
    const hasil = await kirimMasuk(slug, mode, { email, password, token: token?.token, kode, nilai }, lang);
    setSibuk(false);
    if (!hasil.ok) {
      setGalat(hasil.pesan);
      return;
    }
    if (mode === "kode") {
      setKode("");
      setMode("verifikasi");
      return;
    }
    if (mode === "tautan") {
      setTerkirim(pesanTautanTerkirim(email, lang));
      return;
    }
    window.location.assign(`${halamanUrl}/peserta`);
  }

  async function kirimUlang() {
    setGalat("");
    setCatatan("");
    setSibuk(true);
    const hasil = await kirimMasuk(slug, "kode", { email, password: "" }, lang);
    setSibuk(false);
    if (hasil.ok) {
      setKode("");
      setCatatan(t.kodeBaru);
    } else setGalat(hasil.pesan);
  }

  const judul = mode === "masuk" || mode === "kode" || mode === "kolom" ? t.masuk : t.judul[mode];

  return (
    <form onSubmit={kirim} className="flex w-full max-w-[440px] flex-col gap-6">
      <h2 className="text-[32px] font-semibold leading-tight [font-family:var(--landing-heading)] sm:text-[36px]">{judul}</h2>
      {mode === "tautan" ? (
        <p className="-mt-2 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">
          {t.untukPertamaKali}
        </p>
      ) : mode === "sandi" && token ? (
        <p className="-mt-2 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">{t.untuk(token.email)}</p>
      ) : mode === "kode" ? (
        <p className="-mt-2 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">{t.kodeCatatan}</p>
      ) : mode === "verifikasi" ? (
        <p className="-mt-2 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">{t.kodeTerkirim(email)}</p>
      ) : mode === "kolom" ? (
        <p className="-mt-2 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">{t.kolomCatatan}</p>
      ) : null}

      {galat ? (
        <p role="alert" className="rounded-md bg-[var(--reg-error-soft)] px-4 py-3 text-body-large leading-6 text-[var(--reg-on-error-soft)]">
          {galat}
        </p>
      ) : null}

      {terkirim || catatan ? (
        <p role="status" className="rounded-md bg-[var(--reg-primary-container)] px-4 py-3 text-body-large leading-6 text-[var(--reg-on-primary-container)]">
          {terkirim || catatan}
        </p>
      ) : null}

      {mode === "verifikasi" ? (
        <label className={LABEL}>
          {t.kodeLabel}
          <input
            type="text"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            value={kode}
            onChange={(event) => setKode(event.target.value.replace(/[^0-9 ]/g, ""))}
            className={`${FIELD} text-center text-[22px] font-semibold tracking-[0.4em] tabular-nums`}
          />
        </label>
      ) : null}

      {mode === "kolom" && cara.jenis === "fields"
        ? cara.kolom.map((kolom, indeks) => (
          <label key={indeks} className={LABEL}>
            {kolom.label}
            <input
              type={kolom.jenis}
              required
              inputMode={kolom.jenis === "email" ? "email" : kolom.jenis === "tel" ? "tel" : undefined}
              autoComplete={kolom.jenis === "email" ? "email" : kolom.jenis === "tel" ? "tel" : "off"}
              value={nilai[indeks]}
              onChange={(event) => {
                const isi = event.target.value;
                setNilai((lama) => (indeks === 0 ? [isi, lama[1]] : [lama[0], isi]));
              }}
              className={FIELD}
            />
          </label>
        ))
        : null}

      {(mode === "masuk" || mode === "tautan" || mode === "kode") && !terkirim ? (
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

      {mode === "masuk" || mode === "sandi" ? (
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

      {mode === "verifikasi" ? (
        <div className="-mt-2 flex flex-wrap justify-between gap-x-4">
          <button type="button" onClick={() => void kirimUlang()} className={TAUTAN}>{t.kirimUlang}</button>
          <button type="button" onClick={() => { setMode("kode"); setGalat(""); setCatatan(""); }} className={TAUTAN}>{t.gantiEmail}</button>
        </div>
      ) : null}

      {cara.jenis === "password" ? <div className="flex flex-col gap-2 border-t border-[var(--reg-outline-variant)] pt-6 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">
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
      </div> : null}
    </form>
  );
}
