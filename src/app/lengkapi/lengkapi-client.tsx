"use client";

import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useRef, useState, type CSSProperties, type FormEvent } from "react";
import { RegistrationFieldInput } from "@/components/registration-field-input";
import type { RegistrationField } from "@/lib/domain";
import { eventApiPath } from "@/lib/event-url";
import type { LandingLang } from "@/lib/landing-i18n";
import { LENGKAPI_UI } from "@/lib/member/lengkapi-i18n";

const MUTED = "text-[var(--reg-on-surface-variant)]";
const HEAD = "[font-family:var(--landing-heading)]";
const TOMBOL_UTAMA =
  "m3-state inline-flex min-h-[52px] w-full items-center justify-center rounded-md bg-[var(--reg-primary)] px-6 text-title-small font-semibold text-[var(--reg-on-primary)] disabled:opacity-60 sm:w-auto sm:min-w-48";
const TOMBOL_GARIS =
  "m3-state inline-flex min-h-12 items-center justify-center rounded-md border border-[var(--reg-outline)] px-5 text-label-large font-semibold";

/**
 * Formulir Lengkapi data: hanya pertanyaan "Participants can update this",
 * terisi jawaban yang sudah tersimpan. Kolomnya komponen yang sama dengan
 * formulir pendaftaran (RegistrationFieldInput), jadi bentuknya sama persis.
 */
export function LengkapiClient({
  lang,
  token,
  nama,
  email,
  fields,
  nilaiAwal,
  berlakuSampai,
  areaUrl,
  halamanUrl,
}: {
  lang: LandingLang;
  /** Tautan pribadi; null bila peserta datang dari dashboard (sesi). */
  token: string | null;
  nama: string;
  /** Email tersamar, hanya untuk tautan pribadi. */
  email: string | null;
  fields: RegistrationField[];
  nilaiAwal: Record<string, string>;
  /** Tanggal kedaluwarsa tautan, sudah diformat. */
  berlakuSampai: string | null;
  areaUrl: string | null;
  halamanUrl: string | null;
}) {
  const t = LENGKAPI_UI[lang];
  const [nilai, setNilai] = useState(nilaiAwal);
  const [tersimpan, setTersimpan] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState<{ pesan: string; kolom: Record<string, string> } | null>(null);
  const judulSelesai = useRef<HTMLHeadingElement>(null);

  async function simpan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const extra: Record<string, string> = {};
    for (const field of fields) extra[field.key] = String(data.get(`extra.${field.key}`) ?? "");
    setMenyimpan(true);
    setGalat(null);
    const response = await fetch(eventApiPath("/api/peserta/lengkapi"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: token ?? undefined, lang, extra }),
    }).catch(() => null);
    setMenyimpan(false);
    if (!response) {
      setGalat({ pesan: t.lost, kolom: {} });
      return;
    }
    const isi = await response.json().catch(() => null);
    if (!response.ok) {
      setGalat({ pesan: isi?.error?.message ?? t.lost, kolom: (isi?.error?.details as Record<string, string> | undefined) ?? {} });
      return;
    }
    setNilai(Object.fromEntries(Object.entries(extra).map(([kunci, isiKolom]) => [kunci, isiKolom.trim()])));
    setTersimpan(true);
    requestAnimationFrame(() => judulSelesai.current?.focus());
  }

  if (tersimpan) {
    return (
      <div className="max-w-[640px]">
        <CheckCircle size={48} weight="fill" className="text-[var(--reg-primary)]" aria-hidden />
        <h2 ref={judulSelesai} tabIndex={-1} className={`mt-4 text-balance text-[26px] font-semibold leading-tight tracking-[-0.02em] outline-none sm:text-[32px] ${HEAD}`}>
          {t.savedTitle}
        </h2>
        <dl className="mt-6 grid gap-4">
          {fields.map((field) => {
            const isi = nilai[field.key];
            const tampil = field.type === "checkbox" ? (isi === "true" ? (lang === "en" ? "Yes" : "Ya") : "") : isi;
            return (
              <div key={field.key} className="min-w-0">
                <dt className={`text-body-medium ${MUTED}`}>{field.label}</dt>
                <dd className={`mt-1 whitespace-pre-line text-body-large [overflow-wrap:anywhere] ${tampil ? "" : MUTED}`}>{tampil || t.empty}</dd>
              </div>
            );
          })}
        </dl>
        {token && berlakuSampai ? <p className={`mt-6 text-body-medium ${MUTED}`}>{t.editAgainUntil(berlakuSampai)}</p> : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {areaUrl ? (
            <Link href={areaUrl} className={TOMBOL_UTAMA} style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}>
              {t.openArea}
            </Link>
          ) : null}
          <button type="button" onClick={() => setTersimpan(false)} className={TOMBOL_GARIS}>
            {t.editAgain}
          </button>
          {halamanUrl && !areaUrl ? (
            <Link href={halamanUrl} className={TOMBOL_GARIS}>
              {t.backToEvent}
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[640px]">
      <h2 className={`text-balance text-[26px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px] ${HEAD}`}>{t.title}</h2>
      <p className={`mt-3 text-body-large leading-7 ${MUTED}`}>
        {t.forPerson(nama, email)}
        {token ? ` ${t.notYou}` : null}
      </p>
      <form onSubmit={simpan} className="mt-2">
        {fields.map((field) => (
          <div key={field.key} className="min-w-0">
            <RegistrationFieldInput field={field} lang={lang} nilai={nilai[field.key]} />
            {galat?.kolom[field.key] ? (
              <p className="mt-2 text-body-medium text-[var(--reg-error)]">{galat.kolom[field.key]}</p>
            ) : null}
          </div>
        ))}
        {galat ? (
          <p role="alert" className="mt-6 flex items-start gap-2 rounded-md bg-[var(--reg-error-soft)] p-3 text-body-medium text-[var(--reg-on-error-soft)]">
            <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
            {galat.pesan}
          </p>
        ) : null}
        <div className="mt-8 border-t border-[var(--reg-outline-variant)] pt-7">
          <button type="submit" disabled={menyimpan} className={TOMBOL_UTAMA} style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}>
            {menyimpan ? t.saving : t.save}
          </button>
        </div>
      </form>
    </div>
  );
}
