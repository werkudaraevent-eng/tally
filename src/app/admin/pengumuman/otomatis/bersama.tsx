"use client";

import { useEffect, useRef } from "react";
import { TextArea } from "@/components/m3";
import { type EmailLang } from "@/lib/email/konfirmasi/bahasa";
import type { KonteksDasar } from "@/lib/email/konfirmasi/konteks";
import { type RenderState } from "@/lib/email/konfirmasi/render";
import { type Templat } from "@/lib/email/konfirmasi/templat";
import { cx } from "@/lib/m3/cx";

type Contoh = { id: string; name: string; company: string | null; status: string; language?: string | null };

export type Data = {
  templat: Templat;
  bawaan: Templat;
  tersimpan: boolean;
  kirim_menunggu: boolean;
  dasar: KonteksDasar;
  /** Konteks yang sama dalam English: nama, tanggal, tempat, dan tautan halaman /en. */
  dasar_en: KonteksDasar;
  bahasa_utama: EmailLang;
  en_tersedia: boolean;
  kv_url: string | null;
  member_on: boolean;
  contoh: Contoh[];
  belum_terima: number;
  /** Yang benar-benar dikirimi "Kirim ke mereka…": di luar produksi hanya alamat di daftar uji. */
  belum_terima_dikirim: number;
  daftar_uji: "off" | "list" | "blocked";
  email_aktif: boolean;
};

/** Pengirim email acara, dari /api/settings. Sama dengan Pengaturan; disimpan terpisah dari templat. */
export type Pengirim = {
  email_sender_name: string | null;
  email_reply_to: string | null;
  email_default: { name: string | null; address: string; reply_to: string | null } | null;
};

export const NAMA_BAHASA: Record<EmailLang, string> = { id: "Indonesian", en: "English" };
export const PILIHAN_BAHASA_EDIT = [
  { value: "id" as const, label: "ID" },
  { value: "en" as const, label: "EN" },
];

export const KUNCI_EMAIL_TES = "tally:pesan:email-tes";
export const KODE_CONTOH = "CONTOH-0000";

export type KolomTeks = { blockId: string | "subjek"; kunci: string; el: HTMLInputElement | HTMLTextAreaElement | null };

/** TextArea yang tingginya mengikuti isi: tidak ada kalimat yang tersembunyi di balik gulir. */
export function TeksTumbuh(props: React.ComponentProps<typeof TextArea>) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current?.querySelector("textarea");
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return (
    <div ref={ref}>
      <TextArea {...props} rows={props.rows ?? 3} className={cx("[&_textarea]:resize-none [&_textarea]:overflow-hidden", props.className)} />
    </div>
  );
}

/** Kolom salinan per versi email. Bagian lain sama untuk semua versi. */
export const VERSI: Record<RenderState, { label: string; panjang: string; subjek: "subjek" | "subjek_menunggu" | "subjek_ditolak"; judul: "judul" | "judul_menunggu" | "judul_ditolak"; isi: "isi" | "isi_menunggu" | "isi_ditolak" }> = {
  approved: { label: "Approved", panjang: "Approved", subjek: "subjek", judul: "judul", isi: "isi" },
  pending: { label: "Pending", panjang: "Pending approval", subjek: "subjek_menunggu", judul: "judul_menunggu", isi: "isi_menunggu" },
  rejected: { label: "Rejected", panjang: "Rejected", subjek: "subjek_ditolak", judul: "judul_ditolak", isi: "isi_ditolak" },
};
export const PILIHAN_VERSI = (Object.keys(VERSI) as RenderState[]).map((value) => ({ value, label: VERSI[value].label }));
