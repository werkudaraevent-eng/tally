import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Peserta yang dicetak badgenya: hanya empat kolom yang tergambar.
 *
 * `id` untuk satu peserta (cetak ulang dan walk-in), tanpa `id` untuk semua
 * peserta aktif urut nama, supaya tumpukan badge yang keluar dari printer
 * bisa langsung disusun per abjad di meja registrasi. Peserta yang dihapus
 * panitia pusat tidak ikut. Pendaftar yang belum disetujui memang belum ada di
 * tabel ini, jadi tidak perlu disaring.
 */
const querySchema = z.object({
  id: z.string().uuid().optional(),
  contoh: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"], { readOnly: true });
  if (auth.response) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const kolom = "id,name,company,title,qr_code";

  if (parsed.data.id) {
    const { data } = await client.from("participants").select(kolom).eq("event_id", auth.scope.event.id).eq("id", parsed.data.id).maybeSingle();
    if (!data) return apiError("PARTICIPANT_NOT_FOUND", 404);
    return Response.json({ peserta: [data] });
  }

  // Per 1000 karena PostgREST memotong satu jawaban di 1000 baris.
  const batas = parsed.data.contoh ?? 10000;
  const semua: unknown[] = [];
  for (let dari = 0; dari < batas; dari += 1000) {
    const { data, error } = await client
      .from("participants")
      .select(kolom)
      .eq("event_id", auth.scope.event.id)
      .is("source_removed_at", null)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(dari, Math.min(dari + 999, batas - 1));
    if (error) return apiError("INTERNAL_ERROR", 500);
    semua.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return Response.json({ peserta: semua });
}
