import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * CMS kredensial Scanner API untuk event yang sedang dibuka.
 *
 * Kuncinya TIDAK PERNAH dikirim utuh ke browser, termasuk kepada admin yang
 * baru saja mengetiknya. Yang dikirim adalah bentuk tersamar plus penanda
 * "sudah terisi", dan itu cukup untuk satu-satunya pertanyaan yang perlu
 * dijawab layar ini: apakah kuncinya ada, dan apakah yang ada itu yang benar.
 * Nilai penuh yang bolak-balik lewat jaringan hanya menambah tempat ia bisa
 * bocor -- log proxy, riwayat DevTools, tangkapan layar rapat.
 */
const bodySchema = z.object({
  base_url: z.string().trim().url().max(500).nullable(),
  event_slug: z.string().trim().max(200).nullable(),
  // `undefined` = jangan sentuh kuncinya, `null` = kosongkan, string = ganti.
  // Tiga keadaan, karena form yang mengirim kolom kunci kosong berarti "saya
  // tidak mengubahnya", bukan "hapus kunci saya" -- dan menyamakan keduanya
  // membuat setiap penyimpanan slug mematikan sinkronisasi.
  api_key: z.string().trim().min(8).max(500).nullable().optional(),
});

/** `sk_live_9f3ab21c` -> `••••••••b21c`. Empat huruf terakhir cukup untuk
 *  mencocokkan dengan kunci di dashboard penyedia tanpa mengungkap apa pun. */
function mask(key: string | null) {
  if (!key) return null;
  return `${"•".repeat(8)}${key.slice(-4)}`;
}

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"], { readOnly: true });
  if (auth.response) return auth.response;

  const { data, error } = await getSupabaseServiceClient()
    .from("events")
    .select("scanner_api_base_url,scanner_api_key,scanner_api_event_slug,participant_source")
    .eq("id", auth.scope.event.id)
    .maybeSingle();
  if (error || !data) return apiError("INTERNAL_ERROR", 500);

  const row = data as {
    scanner_api_base_url: string | null;
    scanner_api_key: string | null;
    scanner_api_event_slug: string | null;
    participant_source: string;
  };

  return Response.json({
    base_url: row.scanner_api_base_url,
    event_slug: row.scanner_api_event_slug,
    key_masked: mask(row.scanner_api_key),
    key_set: row.scanner_api_key !== null,
    participant_source: row.participant_source,
    // Env ditampilkan sebagai CADANGAN, bukan sebagai nilai. Tanpa penanda ini
    // panitia melihat kolom kosong pada event yang sinkronisasinya jalan dan
    // menyimpulkan setelannya hilang.
    env_fallback: {
      base_url: Boolean(process.env.SCANNER_API_BASE_URL),
      key: Boolean(process.env.SCANNER_API_KEY),
      event_slug: Boolean(process.env.SCANNER_API_EVENT_SLUG),
    },
  });
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION_ERROR", 422, body.error.flatten());

  const update: Record<string, string | null> = {
    // Garis miring di akhir dibuang di sini, bukan hanya saat menyusun URL:
    // nilai yang tersimpan adalah nilai yang dibaca panitia kembali, dan
    // "https://api.x.com/" yang berubah diam-diam jadi tanpa miring saat dipakai
    // membuat dua orang membandingkan dua string berbeda.
    scanner_api_base_url: body.data.base_url?.replace(/\/$/, "") || null,
    scanner_api_event_slug: body.data.event_slug || null,
  };
  if (body.data.api_key !== undefined) update.scanner_api_key = body.data.api_key;

  const { error } = await getSupabaseServiceClient()
    .from("events")
    .update(update as never)
    .eq("id", auth.scope.event.id);

  if (error) {
    // events_scanner_slug_required: event bersumber scanner_api/hybrid tidak
    // boleh kehilangan slug-nya. Dijawab dengan jalan keluarnya, bukan dengan
    // nama constraint.
    if ((error.message ?? "").includes("events_scanner_slug_required")) {
      return apiError("VALIDATION_ERROR", 422, {
        message: "Event ini bersumber Scanner API, jadi slug event tidak boleh dikosongkan. Ubah sumber peserta event lebih dulu bila memang ingin berhenti memakainya.",
      });
    }
    if ((error.message ?? "").includes("events_scanner_base_url_format")) {
      return apiError("VALIDATION_ERROR", 422, { message: "Base URL harus diawali http:// atau https://." });
    }
    return apiError("INTERNAL_ERROR", 500);
  }

  await getSupabaseServiceClient().from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "scanner_config_updated",
    // Kuncinya TIDAK ikut masuk log. Yang dicatat hanya apakah ia diganti --
    // audit_logs dibaca lebih banyak orang daripada tabel events.
    payload: {
      base_url: update.scanner_api_base_url,
      event_slug: update.scanner_api_event_slug,
      key_changed: body.data.api_key !== undefined,
      key_cleared: body.data.api_key === null,
    },
  } as never);

  return Response.json({ ok: true });
}
