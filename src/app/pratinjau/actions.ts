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
  eyebrow: "small label", heading: "heading", body: "body text", link_label: "button text", link2_label: "second button text",
  fact_title: "fact title", fact_body: "fact text", source: "source", quote: "quote", name: "name", role: "role",
  label: "item label", title: "item title", value: "figure", nav_label: "top menu label",
};

/** "Small label in "Pilih satu dari tiga diskusi" is too long. ..." */
function pesanBatas(isi: LandingBody, issue: z.ZodIssue | undefined): string {
  // Aturan `refine` lain (mis. tautan harus https://) juga berkode "custom".
  if (issue?.code === "custom" && !issue.message.startsWith("Maximum")) {
    return `${issue.message}. It still shows here, but it can't be saved yet.`;
  }
  const jalur = issue?.path ?? [];
  const indeksBlok = jalur[0] === "landing" && jalur[1] === "blocks" ? Number(jalur[2]) : NaN;
  const blok = Number.isInteger(indeksBlok) ? isi.landing.blocks?.[indeksBlok] : undefined;
  const kolom = NAMA_KOLOM[String(jalur[jalur.length - 1])] ?? "text";
  const tempat = blok ? `${kolom} in "${blok.heading?.trim() || "untitled section"}"` : kolom;
  return `${tempat.charAt(0).toUpperCase()}${tempat.slice(1)} is too long. It still shows here, but it can't be saved yet.`;
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
  if (auth.response) return { ok: false, pesan: "Your session has expired. Reload this page." };

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
    if (soalBentuk || !draf || typeof draf !== "object") return { ok: false, pesan: "Some fields aren't valid yet. The preview resumes once they're fixed." };
    isiDraf = draf as LandingBody;
    peringatan = pesanBatas(isiDraf, parsed.error.issues[0]);
  }

  const event = await getEventBySlugPublic(slug);
  if (!event) return { ok: false, pesan: "Event not found." };

  // Warna formulir pendaftaran tidak tampil di halaman acara, jadi diabaikan.
  const { landing, ...isian } = isiDraf;
  const facts = Object.fromEntries(Object.entries(isian).filter(([kunci]) => kunci !== "form_theme"));
  const draft: EventRow = {
    ...event,
    ...facts,
    // Pembicara selalu dari salinan tersimpan: disunting dan disimpan di
    // halaman Speakers, bukan di draf editor ini.
    landing_config: { ...landing, speakers: event.landing_config?.speakers, theme: landing.theme ? withDerivedRoles(landing.theme) : undefined },
  } as EventRow;
  // Bahasa mengikuti mode editor, bukan bahasa utama: mode ID menyunting teks
  // Indonesia, mode EN teks English. Draf yang baru berganti dari Forum ke tata
  // letak lain tidak punya halaman dalam, jadi jatuh ke Beranda.
  const lang = bahasa === "en" ? "en" : "id";
  const isi = renderLanding(draft, lang, { halaman, pratinjau: true }) ?? renderLanding(draft, lang, { pratinjau: true });
  return { ok: true, isi, peringatan };
}
