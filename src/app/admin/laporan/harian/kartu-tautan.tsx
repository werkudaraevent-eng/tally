"use client";

import { ArrowSquareOut, Copy, LinkSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/m3";

export type Tautan = { token: string; dibuat: string } | null;

/**
 * Link highlight: satu link per acara yang memutar semua hari yang di-Lock
 * sebagai cerita, tanpa login. Seperti link formulir: panitia membuat,
 * menyalin, dan bisa mematikannya. Membuat ulang = link lama mati.
 */
export function KartuTautan({ tautan, slug, jumlahKunci, semuaKunci = false, terkunci, sibuk, onAksi }: {
  tautan: Tautan;
  slug: string;
  jumlahKunci: number;
  /** Story Seluruh acara sudah dikunci. */
  semuaKunci?: boolean;
  terkunci: boolean;
  sibuk: boolean;
  onAksi: (aksi: "buat" | "matikan") => void;
}) {
  const [tersalin, setTersalin] = useState(false);
  const jalur = tautan ? `/e/${encodeURIComponent(slug)}/highlight/${tautan.token}` : "";
  const link = typeof window === "undefined" ? jalur : `${window.location.origin}${jalur}`;
  const salin = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setTersalin(true);
      setTimeout(() => setTersalin(false), 2000);
    } catch {
      setTersalin(false);
    }
  };
  const hari = `${jumlahKunci === 1 ? "1 locked day" : `${jumlahKunci} locked days`}${semuaKunci ? " and the Whole event recap" : ""}`;
  return (
    <section aria-labelledby="kt-judul" className="flex flex-col gap-3 rounded-lg border border-outline-variant p-4">
      <div className="flex items-start gap-3">
        <LinkSimple size={20} aria-hidden className="mt-0.5 shrink-0 text-on-surface-variant" />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="kt-judul" className="m-0 text-title-small text-on-surface">Highlight link</h2>
          <p className="m-0 text-body-small text-on-surface-variant">
            {tautan
              ? `Anyone with the link can play the ${hari} as stories, no sign-in. New locked days join it automatically.`
              : "One link that plays every locked day as stories, no sign-in. Send it to the client yourself: Tally sends nothing."}
          </p>
        </div>
      </div>
      {tautan ? (
        <>
          <div className="flex items-center gap-2">
            <input readOnly value={link} aria-label="Highlight link" onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-md border border-outline-variant bg-surface-container-low px-3 text-body-medium text-on-surface" />
            <Button variant="outlined" icon={<Copy size={18} aria-hidden />} onClick={() => void salin()}>{tersalin ? "Copied" : "Copy link"}</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2" aria-live="polite">
            <ButtonLink variant="text" native icon={<ArrowSquareOut size={18} aria-hidden />} href={jalur} target="_blank" rel="noopener">Preview</ButtonLink>
            <Button variant="text" disabled={terkunci || sibuk} loading={sibuk} onClick={() => onAksi("matikan")}>Turn off link</Button>
          </div>
        </>
      ) : (
        <Button variant="outlined" className="self-start" icon={<LinkSimple size={18} aria-hidden />} disabled={terkunci || sibuk} loading={sibuk} onClick={() => onAksi("buat")}>Create link</Button>
      )}
    </section>
  );
}
