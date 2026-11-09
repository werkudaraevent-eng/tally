"use client";

import { Sparkle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Button, LinearProgress } from "@/components/m3";
import { pesanGalatApi } from "@/lib/api-message";
import { potongTebal, type HalamanTanya, type JawabanTanya } from "@/lib/ai/tanya";

/**
 * Ask AI di Quick search (Ctrl K): hook untuk bertanya, dan tampilan jawabannya.
 *
 * Baris Ask AI hanya muncul bila server bilang siap (kunci terpasang, fitur
 * Ask AI menyala, batas bulanan belum tercapai). Selain itu Quick search sama
 * persis seperti sebelumnya.
 */

type Jawaban =
  | { status: "muat"; pertanyaan: string }
  | { status: "ok"; pertanyaan: string; data: JawabanTanya }
  | { status: "galat"; pertanyaan: string; pesan: string };

/** Halaman yang boleh dibuka penanya; `global` = alamat tanpa awalan acara. */
export type HalamanAi = HalamanTanya & { global: boolean };

export function useTanyaAi(eventPrefix: string, halaman: HalamanAi[]) {
  const [siap, setSiap] = useState(false);
  const [jawaban, setJawaban] = useState<Jawaban | null>(null);
  const urutan = useRef(0);

  useEffect(() => {
    // Ask AI terikat pada acara yang sedang dibuka; di /events tidak ada.
    if (!eventPrefix) return;
    let batal = false;
    void fetch(`${eventPrefix}/api/admin/ai/tanya`).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((json: { siap?: boolean } | null) => {
      if (!batal) setSiap(json?.siap === true);
    });
    return () => { batal = true; };
  }, [eventPrefix]);

  const tanya = async (pertanyaan: string) => {
    const nomor = (urutan.current += 1);
    setJawaban({ status: "muat", pertanyaan });
    const r = await fetch(`${eventPrefix}/api/admin/ai/tanya`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pertanyaan, halaman: halaman.map(({ href, label, konteks, uraian }) => ({ href, label, konteks, uraian })) }) }).catch(() => null);
    const json = r ? await r.json().catch(() => ({})) : null;
    // Jawaban lama yang datang sesudah pertanyaan baru (atau sesudah kembali ke pencarian) dibuang.
    if (nomor !== urutan.current) return;
    if (!r) setJawaban({ status: "galat", pertanyaan, pesan: "Connection failed. Ask again." });
    else if (!r.ok) setJawaban({ status: "galat", pertanyaan, pesan: pesanGalatApi(json) ?? "The AI could not answer. Ask again." });
    else setJawaban({ status: "ok", pertanyaan, data: json.jawaban as JawabanTanya });
  };

  const tutup = () => { urutan.current += 1; setJawaban(null); };

  /** Tautan jawaban dengan alamat lengkapnya; hanya halaman yang dikirim (yang boleh dibuka). */
  const tautan: Array<{ href: string; label: string }> = jawaban?.status === "ok"
    ? jawaban.data.tautan.flatMap((t) => {
      const h = halaman.find((x) => x.href === t.href);
      return h ? [{ href: h.global ? h.href : `${eventPrefix}${h.href}`, label: t.label }] : [];
    })
    : [];

  return { siap, jawaban, tanya, tutup, tautan };
}

export function JawabanAi({ jawaban, tautan, onBuka, onKembali }: {
  jawaban: Jawaban;
  tautan: Array<{ href: string; label: string }>;
  onBuka: (href: string) => void;
  onKembali: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 px-2 py-2" aria-live="polite">
      <p className="flex items-center gap-2 text-label-medium text-on-surface-variant">
        <Sparkle size={16} weight="fill" className="shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 truncate">Ask AI · {jawaban.pertanyaan}</span>
      </p>
      {jawaban.status === "muat" ? (
        <div className="flex flex-col gap-2 py-2">
          <LinearProgress label="Asking AI" />
          <p className="text-body-medium text-on-surface-variant">Reading Tally&apos;s feature guide…</p>
        </div>
      ) : jawaban.status === "galat" ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-body-medium text-error">{jawaban.pesan}</p>
          <Button variant="outlined" onClick={onKembali}>Back to search</Button>
        </div>
      ) : (
        <>
          <p className="text-body-medium text-on-surface">
            {potongTebal(jawaban.data.jawaban).map((p, i) => (p.tebal ? <strong key={i} className="font-semibold">{p.teks}</strong> : <span key={i}>{p.teks}</span>))}
          </p>
          {jawaban.data.langkah.length > 0 ? (
            <ol className="flex flex-col gap-2 text-body-medium text-on-surface">
              {jawaban.data.langkah.map((langkah, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-label-small text-on-primary-soft tabular-nums" aria-hidden>{i + 1}</span>
                  <span className="min-w-0">{potongTebal(langkah).map((p, j) => (p.tebal ? <strong key={j} className="font-semibold">{p.teks}</strong> : <span key={j}>{p.teks}</span>))}</span>
                </li>
              ))}
            </ol>
          ) : null}
          {tautan.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {tautan.map((t, i) => (
                <Button key={t.href} variant={i === 0 ? "filled" : "outlined"} onClick={() => onBuka(t.href)}>{t.label}</Button>
              ))}
            </div>
          ) : null}
          <p className="border-t border-outline-variant pt-2 text-body-small text-on-surface-variant">
            Answered from Tally&apos;s feature guide. AI does not see participant data and does not change anything.
          </p>
        </>
      )}
    </div>
  );
}
