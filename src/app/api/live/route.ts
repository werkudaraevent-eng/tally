import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { halamanKlien, hitunganKlien, kolomJawabanKlien, nilaiKolomKlien } from "@/lib/live/data";
import { bacaSaringan, kolomSaringanKlien } from "@/lib/saringan-kolom";
import { normalizeTimeZone } from "@/lib/timezone";

/**
 * Data pendaftaran untuk akun Viewer (klien), dibaca ulang tiap 30 detik.
 *
 * Endpoint sendiri, bukan /api/admin/participants yang dibuka untuk viewer:
 * route admin itu juga melayani POST, impor, dan detail baris lengkap (extra,
 * berkas unggahan, logistik). Membuka satu jalur admin untuk peran baca-saja
 * berarti setiap perubahan di jalur itu harus ingat peran ini. Di sini hanya
 * ada satu GET, dengan kolom yang memang boleh dilihat klien (lib/live/data).
 *
 * Admin ikut diizinkan supaya panitia bisa melihat persis apa yang dilihat klien.
 */
const querySchema = z.object({
  q: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(["registered_at", "name", "company"]).default("registered_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  /** Saringan "+ Filter", JSON. Hanya kolom klien dan jawaban yang dibagikan. */
  f: z.string().max(8000).optional(),
  /** Nilai yang ada di satu kolom pilihan, untuk daftar centang. */
  facet: z.string().max(200).optional(),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["viewer", "admin"], { readOnly: true });
  if (auth.response) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const event = auth.scope.event;
  try {
    const kolom = kolomJawabanKlien(event.registration_form_config);
    const zona = normalizeTimeZone(event.time_zone);
    // Kunci saringan hanya dari daftar kolom klien: saringan pada jawaban yang
    // tidak dibagikan akan membuka isinya lewat jumlah yang cocok.
    const kolomSaringan = kolomSaringanKlien(kolom);
    if (parsed.data.facet !== undefined) {
      const pilihan = kolomSaringan.find((item) => item.key === parsed.data.facet && item.jenis === "pilihan");
      if (!pilihan) return apiError("VALIDATION_ERROR", 422, { message: "This column has no value list." });
      return Response.json({ key: pilihan.key, values: await nilaiKolomKlien(event.id, pilihan.key, kolom, zona) }, { headers: { "Cache-Control": "no-store" } });
    }
    const saringan = bacaSaringan(parsed.data.f, kolomSaringan);
    if (!saringan) return apiError("VALIDATION_ERROR", 422, { message: "Unknown filter." });
    const [halaman, counts] = await Promise.all([halamanKlien(event.id, parsed.data, kolom, { daftar: saringan, zona }), hitunganKlien(event.id, event.time_zone)]);
    return Response.json(
      {
        event: { name: event.name, slug: event.slug, status: event.status, time_zone: normalizeTimeZone(event.time_zone) },
        counts,
        answer_columns: kolom.map(({ key, label }) => ({ key, label })),
        filter_columns: kolomSaringan,
        rows: halaman.rows,
        total: halaman.total,
        fetched_at: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (galat) {
    console.error("Data viewer gagal:", galat);
    return apiError("INTERNAL_ERROR", 500);
  }
}
