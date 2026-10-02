"use server";

import type { ReactNode } from "react";
import type { z } from "zod";
import { getEventBySlugPublic, requireEventScope } from "@/lib/auth/event-scope";
import { landingBodySchema } from "@/lib/landing-body-schema";
import { withDerivedRoles } from "@/lib/registration-theme";
import type { EventRow, LandingForumPage } from "@/lib/domain";
import { renderLanding } from "@/components/landing/render-landing";
import type { LandingLang } from "@/lib/landing-i18n";

export type HasilPratinjau = { ok: true; isi: ReactNode; peringatan: string | null } | { ok: false; pesan: string };

type LandingBody = z.infer<typeof landingBodySchema>;

/** Kode galat zod untuk teks terlalu panjang (batas luar dan batas per blok). */
const BATAS_PANJANG = new Set<string>(["too_big", "custom"]);

const NAMA_KOLOM: Record<string, string> = {
  eyebrow: "label kecil", heading: "judul", body: "isi", link_label: "teks tombol", link2_label: "teks tombol kedua",
  fact_title: "judul fakta", fact_body: "isi fakta", source: "sumber", quote: "kutipan", name: "nama", role: "peran",
  label: "label butir", title: "judul butir", value: "angka", nav_label: "label menu atas",
};

/** "Label kecil di "Pilih satu dari tiga diskusi" terlalu panjang. ..." */
function pesanBatas(isi: LandingBody, issue: z.ZodIssue | undefined): string {
  // Aturan `refine` lain (mis. tautan harus https://) juga berkode "custom".
  if (issue?.code === "custom" && !issue.message.startsWith("Maksimal")) {
    return `${issue.message}. Tetap tampil di sini, tapi belum bisa disimpan.`;
  }
  const jalur = issue?.path ?? [];
  const indeksBlok = jalur[0] === "landing" && jalur[1] === "blocks" ? Number(jalur[2]) : NaN;
  const blok = Number.isInteger(indeksBlok) ? isi.landing.blocks?.[indeksBlok] : undefined;
  const kolom = NAMA_KOLOM[String(jalur[jalur.length - 1])] ?? "teks";
  const tempat = blok ? `${kolom} di "${blok.heading?.trim() || "blok tanpa judul"}"` : kolom;
  return `${tempat.charAt(0).toUpperCase()}${tempat.slice(1)} terlalu panjang. Tetap tampil di sini, tapi belum bisa disimpan.`;
}

/**
 * Render halaman acara dari draf CMS yang belum disimpan.
 *
 * Draf tidak pernah ditulis ke mana pun dan hanya dirender untuk admin acara
 * itu sendiri: halaman publik tetap hanya membaca isi tersimpan. Draf diperiksa
 * dengan skema yang sama dengan Simpan, jadi yang tampil di pratinjau adalah
 * yang memang akan diterima saat disimpan.
 *
 * `bahasa` "en" merender versi English draf, juga sebelum versi English
 * dinyalakan di Tema: admin boleh menerjemahkan dulu, baru menyalakannya.
 * `halaman`: halaman tata letak Forum yang sedang dipratinjau.
 */
export async function renderPratinjau(
  slug: string,
  draf: unknown,
  bahasa: LandingLang = "id",
  halaman: LandingForumPage = "beranda",
): Promise<HasilPratinjau> {
  const auth = await requireEventScope(slug, ["admin"]);
  if (auth.response) return { ok: false, pesan: "Sesi login berakhir. Muat ulang halaman ini." };

  // Teks yang melewati batas tetap dirender: justru itu yang ingin dilihat admin
  // sambil mengetik. Yang ditolak hanya bentuk data yang salah. Batasnya tetap
  // disebut, karena Simpan akan menolaknya.
  const parsed = landingBodySchema.safeParse(draf);
  let isiDraf: LandingBody;
  let peringatan: string | null = null;
  if (parsed.success) {
    isiDraf = parsed.data;
  } else {
    const soalBentuk = parsed.error.issues.find((issue) => !BATAS_PANJANG.has(issue.code));
    if (soalBentuk || !draf || typeof draf !== "object") return { ok: false, pesan: "Ada isian yang belum valid. Pratinjau menunggu sampai diperbaiki." };
    isiDraf = draf as LandingBody;
    peringatan = pesanBatas(isiDraf, parsed.error.issues[0]);
  }

  const event = await getEventBySlugPublic(slug);
  if (!event) return { ok: false, pesan: "Acara tidak ditemukan." };

  // Warna formulir pendaftaran tidak tampil di halaman acara, jadi diabaikan.
  const { landing, ...isian } = isiDraf;
  const facts = Object.fromEntries(Object.entries(isian).filter(([kunci]) => kunci !== "form_theme"));
  const draft: EventRow = {
    ...event,
    ...facts,
    landing_config: { ...landing, theme: landing.theme ? withDerivedRoles(landing.theme) : undefined },
  } as EventRow;
  // Bahasa mengikuti mode editor, bukan bahasa utama: mode ID menyunting teks
  // Indonesia, mode EN teks English. Draf yang baru berganti dari Forum ke tata
  // letak lain tidak punya halaman dalam, jadi jatuh ke Beranda.
  const lang = bahasa === "en" ? "en" : "id";
  const isi = renderLanding(draft, lang, { halaman, pratinjau: true }) ?? renderLanding(draft, lang, { pratinjau: true });
  return { ok: true, isi, peringatan };
}
