"use server";

import type { ReactNode } from "react";
import { z } from "zod";
import { getEventBySlugPublic, requireEventScope } from "@/lib/auth/event-scope";
import { landingBodySchema } from "@/lib/landing-body-schema";
import { DEFAULT_REGISTRATION_SEED, withDerivedRoles } from "@/lib/registration-theme";
import type { EventLandingConfig, EventRow, RegistrationField, RegistrationFormConfig } from "@/lib/domain";
import { landingDefaultLang } from "@/lib/landing-i18n";
import { isiDaftar } from "../isi-daftar";

export type HasilPratinjauFormulir = { ok: true; isi: ReactNode } | { ok: false; pesan: string };

/**
 * Bentuk draf susunan formulir dari Atur formulir. Sengaja lebih longgar dari
 * skema Simpan (PATCH /api/admin/registrasi): field yang labelnya baru separuh
 * diketik tetap ingin dilihat admin di pratinjau. Yang ditolak hanya bentuk
 * data yang salah. Simpan tetap memeriksa aturannya sendiri.
 */
const formDrafSchema = z.object({
  fields: z.array(z.object({
    key: z.string().max(64),
    label: z.string().max(400),
    type: z.enum(["text", "email", "tel", "textarea", "select", "radio", "checkbox", "date", "number", "file"]),
    required: z.boolean(),
    options: z.array(z.string().max(400)).max(100).optional(),
    placeholder: z.string().max(400).optional(),
    help_text: z.string().max(1000).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }).passthrough()).max(100).optional(),
  welcome_text: z.string().max(4000).optional(),
  success_text: z.string().max(4000).optional(),
  require_email: z.boolean().optional(),
  require_phone: z.boolean().optional(),
  require_company: z.boolean().optional(),
  require_job_title: z.boolean().optional(),
});

/**
 * Render formulir pendaftaran dari draf yang belum disimpan.
 *
 * Dua sumber draf: susunan formulir (Atur formulir di Pendaftaran publik) dan
 * isi CMS Halaman acara (Tema: logo, gambar utama, warna, huruf, Yang tayang).
 * Keduanya tidak pernah ditulis ke mana pun dan hanya dirender untuk admin
 * acara itu sendiri, dengan komponen yang sama dengan formulir publik.
 */
export async function renderPratinjauFormulir(slug: string, draf: { form?: unknown; landing?: unknown }): Promise<HasilPratinjauFormulir> {
  const auth = await requireEventScope(slug, ["admin"]);
  if (auth.response) return { ok: false, pesan: "Sesi login berakhir. Muat ulang halaman ini." };
  const event = await getEventBySlugPublic(slug);
  if (!event) return { ok: false, pesan: "Acara tidak ditemukan." };

  let baris: EventRow = event;
  const formTersimpan = (event.registration_form_config ?? {}) as RegistrationFormConfig;

  if (draf.landing !== undefined) {
    const parsed = landingBodySchema.safeParse(draf.landing);
    // Teks yang terlalu panjang tidak mengubah tampilan formulir; yang perlu
    // hanya bentuk Tema-nya. Draf yang tidak valid menunggu diperbaiki, sama
    // dengan pratinjau halaman acara.
    if (!parsed.success) return { ok: false, pesan: "Ada isian yang belum valid. Pratinjau menunggu sampai diperbaiki." };
    const { landing, form_theme: formTheme, ...facts } = parsed.data;
    baris = {
      ...baris,
      ...facts,
      landing_config: { ...landing, theme: landing.theme ? withDerivedRoles(landing.theme) : undefined },
      // Sama dengan PATCH /api/admin/landing: warna formulir disimpan di
      // registration_form_config.theme, dan warna sendiri tidak dihapus saat
      // saklar "ikut halaman acara" dinyalakan.
      registration_form_config: formTheme
        ? {
            ...formTersimpan,
            theme: formTheme.inherit
              ? { ...(formTersimpan.theme ?? { seed: DEFAULT_REGISTRATION_SEED }), inherit: true }
              : withDerivedRoles({ ...(formTersimpan.theme ?? {}), seed: formTheme.seed ?? formTersimpan.theme?.seed ?? DEFAULT_REGISTRATION_SEED, inherit: false }),
          }
        : formTersimpan,
    } as EventRow;
  }

  if (draf.form !== undefined) {
    const parsed = formDrafSchema.safeParse(draf.form);
    if (!parsed.success) return { ok: false, pesan: "Ada isian yang belum valid. Pratinjau menunggu sampai diperbaiki." };
    baris = {
      ...baris,
      registration_form_config: {
        ...(baris.registration_form_config ?? {}),
        ...parsed.data,
        fields: (parsed.data.fields ?? []) as RegistrationField[],
        // Tema tidak disunting di Atur formulir.
        theme: (baris.registration_form_config as RegistrationFormConfig | null)?.theme,
      },
    } as EventRow;
  }

  const isi = await isiDaftar(baris, landingDefaultLang(baris.landing_config as EventLandingConfig), { pratinjau: true });
  return { ok: true, isi };
}
