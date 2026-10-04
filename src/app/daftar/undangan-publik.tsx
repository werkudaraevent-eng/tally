"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { PUBLIK } from "@/lib/pesan/label";
import type { LandingLang } from "@/lib/landing-i18n";
import { REG_CONTROL, REG_LABEL } from "@/components/registration-field-input";
import { Spinner } from "@/components/search-loading";
import { eventApiPath } from "@/lib/event-url";

/**
 * Halaman tamu undangan tanpa formulir: "Khusus undangan" (dengan formulir
 * Kirim ulang undangan), tautan tidak berlaku, dan tautan yang sudah dipakai.
 * Hanya variabel --reg-*, sama dengan formulir pendaftaran.
 */

const MUTED = "text-[var(--reg-on-surface-variant)]";

export function HalamanUndangan({
  lang,
  judul,
  isi,
  kirimUlang,
  tombol,
  kontak,
}: {
  lang: LandingLang;
  judul: string;
  isi: string;
  /** Tampilkan formulir Kirim ulang undangan. */
  kirimUlang: boolean;
  /** Tombol utama, mis. "Masuk ke Dashboard saya" bila Area peserta nyala. */
  tombol?: { href: string; label: string } | null;
  /** Kalimat kontak panitia. */
  kontak?: string | null;
}) {
  return (
    <div className="max-w-[40rem]">
      <h2 className="text-title-large font-medium">{judul}</h2>
      <p className={`mt-2 text-body-large leading-7 ${MUTED}`}>{isi}</p>
      {tombol ? (
        <a
          href={tombol.href}
          className="m3-state mt-6 inline-flex min-h-12 items-center rounded-md bg-[var(--reg-primary)] px-5 text-label-large font-semibold text-[var(--reg-on-primary)]"
          style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}
        >
          {tombol.label}
        </a>
      ) : null}
      {kontak ? <p className={`mt-6 text-body-medium leading-6 ${MUTED}`}>{kontak}</p> : null}
      {kirimUlang ? <KirimUlang lang={lang} /> : null}
    </div>
  );
}

function KirimUlang({ lang }: { lang: LandingLang }) {
  const t = PUBLIK[lang];
  const [pending, setPending] = useState(false);
  const [selesai, setSelesai] = useState(false);
  const [galat, setGalat] = useState("");

  async function kirim(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    setPending(true);
    setGalat("");
    const jawab = await fetch(eventApiPath("/api/undangan/kirim-ulang"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setPending(false);
    if (jawab?.ok) {
      setSelesai(true);
      return;
    }
    const body = await jawab?.json().catch(() => null);
    setGalat(body?.error?.details?.message ?? body?.error?.message ?? (lang === "en" ? "Something went wrong. Please try again." : "Gagal mengirim. Coba lagi."));
  }

  return (
    <section className="mt-10 border-t border-[var(--reg-outline-variant)] pt-8">
      <h3 className="text-title-medium font-semibold">{t.resendTitle}</h3>
      <p className={`mt-1 text-body-medium leading-6 ${MUTED}`}>{t.resendHint}</p>
      {selesai ? (
        <p role="status" className="mt-6 rounded-lg bg-[var(--reg-primary-container)] p-4 text-body-medium leading-6 text-[var(--reg-on-primary-container)]">
          {t.resendDone}
        </p>
      ) : (
        <form onSubmit={kirim} className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className={`${REG_LABEL} flex-1`}>
            {t.emailLabel}
            <input required type="email" name="email" maxLength={160} autoComplete="email" inputMode="email" className={`${REG_CONTROL} font-normal`} />
          </label>
          <button
            disabled={pending}
            aria-busy={pending || undefined}
            className="m3-state inline-flex min-h-[52px] items-center justify-center gap-2 rounded-md bg-[var(--reg-primary)] px-6 text-label-large font-semibold text-[var(--reg-on-primary)] disabled:opacity-50"
            style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}
          >
            {t.resendButton}
            {pending ? <Spinner size={20} label={t.resendButton} /> : null}
          </button>
        </form>
      )}
      {galat ? <p role="alert" className="mt-3 text-body-medium font-medium text-[var(--reg-error)]">{galat}</p> : null}
    </section>
  );
}
