import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { loadLabelSettings } from "@/lib/label/load";
import { labelSettingsSchema } from "@/lib/label/schema";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * CMS setelan label peserta.
 *
 * Seluruh parameter printer ada di sini, termasuk yang biasanya dianggap detail
 * teknis yang tidak pantas dilihat panitia — perintah "b1" atau "v4", lebar
 * dalam piksel, kerapatan panas. Itu disengaja: protokol NIIMBOT tidak resmi,
 * dan model persis yang dipegang panitia mungkin belum pernah diuji siapa pun.
 * Angka yang hanya bisa dibetulkan lewat rilis berarti printer yang tidak bisa
 * dipakai sampai ada yang menulis kode — pada hari acara, itu sama dengan tidak
 * punya printer.
 */

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"], { readOnly: true });
  if (auth.response) return auth.response;
  return Response.json({ settings: await loadLabelSettings(auth.scope.event.id) });
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = labelSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  // Awalan kosong dibuang, bukan disimpan: satu string kosong di daftar
  // penyaring membuat dialog Bluetooth peramban menawarkan SELURUH perangkat di
  // ballroom, dan petugas memilih televisi orang lain.
  const prefixes = parsed.data.name_prefixes.map((value) => value.trim()).filter(Boolean);

  const { error } = await getSupabaseServiceClient()
    .from("label_settings")
    .upsert(
      {
        ...parsed.data,
        name_prefixes: prefixes,
        event_id: auth.scope.event.id,
        updated_at: new Date().toISOString(),
        updated_by: auth.user.id,
      } as never,
      { onConflict: "event_id" },
    );

  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ settings: await loadLabelSettings(auth.scope.event.id) });
}
