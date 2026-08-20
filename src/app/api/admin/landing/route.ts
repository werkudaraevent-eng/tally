import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { withDerivedRoles } from "@/lib/registration-theme";

/**
 * Konten landing page publik.
 *
 * Dua jenis data disimpan sekaligus lewat satu permintaan, dan pemisahannya
 * dijaga di sini:
 *
 *   * FAKTA ACARA (jam, venue, tagline) menjadi kolom. Email konfirmasi,
 *     rundown, dan berkas kalender membacanya juga — kalau ditanam di dalam
 *     jsonb, ketiganya tidak punya cara membacanya.
 *   * KONTEN HALAMAN (banner, urutan bagian, FAQ) menjadi satu jsonb. Hanya
 *     landing page yang peduli.
 *
 * Satu permintaan, bukan dua, karena admin menyuntingnya di satu layar dan
 * menekan satu tombol Simpan. Dua permintaan berarti separuh perubahan bisa
 * tersimpan saat jaringan putus di tengah.
 */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const bodySchema = z.object({
  // ---- Fakta acara --------------------------------------------------------
  // 5000, bukan 500 seperti di form pembuatan acara. Batas di sana untuk
  // ringkasan sebaris saat mendaftarkan acara; bagian "Tentang acara" di
  // halaman publik adalah beberapa paragraf, dan 500 karakter memotongnya di
  // tengah kalimat.
  description: z.string().trim().max(5000).nullable(),
  tagline: z.string().trim().max(200).nullable(),
  start_time: z.string().regex(HHMM).nullable(),
  end_time: z.string().regex(HHMM).nullable(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  venue_name: z.string().trim().max(200).nullable(),
  venue_address: z.string().trim().max(600).nullable(),
  venue_map_url: z.string().url().max(600).nullable(),

  // ---- Konten halaman -----------------------------------------------------
  landing: z.object({
    banner_url: z.string().url().max(600).nullable().optional(),
    banner_style: z.enum(["theme", "photo"]).optional(),
    hero_height: z.enum(["compact", "standard", "tall"]).optional(),
    cta_label: z.string().trim().max(60).optional(),
    sections: z
      .array(z.object({
        id: z.enum(["about", "highlights", "agenda", "venue", "faq", "sponsors", "contact"]),
        enabled: z.boolean(),
      }))
      .max(10),
    highlights: z.array(z.object({
      label: z.string().trim().min(1).max(60),
      value: z.string().trim().min(1).max(30),
    })).max(8).optional(),
    faq: z.array(z.object({
      q: z.string().trim().min(1).max(200),
      a: z.string().trim().min(1).max(2000),
    })).max(20).optional(),
    contact_name: z.string().trim().max(120).optional(),
    contact_phone: z.string().trim().max(40).optional(),
    contact_email: z.string().trim().max(160).optional(),
    sponsors: z.array(z.object({
      name: z.string().trim().max(120).optional(),
      logo_url: z.string().url().max(600),
    })).max(40).optional(),
    theme: z.object({ seed: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).optional(),
  }),
});

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { landing, ...facts } = parsed.data;

  // Jam selesai sebelum jam mulai pada acara SEHARI. Untuk acara lebih dari
  // satu hari perbandingan ini tidak berlaku — acara yang mulai 20.00 dan
  // selesai 02.00 keesokan harinya sah, dan `end_date` yang menyatakannya.
  if (!facts.end_date && facts.start_time && facts.end_time && facts.end_time <= facts.start_time) {
    return apiError("VALIDATION_ERROR", 422, {
      end_time: "Jam selesai harus setelah jam mulai. Untuk acara yang melewati tengah malam, isi tanggal selesai.",
    });
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("events")
    .update({
      ...facts,
      landing_config: {
        ...landing,
        // Peran warna diturunkan di server, sama seperti tema form pendaftaran.
        // Halaman publiknya menerima hex jadi dan tidak memuat pustaka warna.
        theme: landing.theme ? withDerivedRoles(landing.theme) : undefined,
      },
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", auth.scope.event.id)
    .select("description,tagline,start_time,end_time,end_date,venue_name,venue_address,venue_map_url,landing_config")
    .single();

  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "landing_page_update",
    payload: { new: data },
  } as never);

  return Response.json(data);
}
