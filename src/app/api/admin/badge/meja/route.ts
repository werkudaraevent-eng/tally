import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { DEFAULT_BADGE_LAYOUT } from "@/lib/badge/layout";
import { tabelBadgeBelumAda } from "@/lib/badge/load";
import { loadLabelSettings } from "@/lib/label/load";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * "Yang dicetak di meja registrasi": badge kertas, label stiker, atau tidak ada.
 *
 * Menggantikan sakelar "Pakai printer label". Tiga pilihan itu saling
 * meniadakan, jadi disimpan lewat satu pintu ini, bukan lewat Simpan masing-
 * masing penyunting: dua tombol Simpan yang masing-masing menulis setengah
 * pilihan akan saling menimpa.
 *
 * Label stiker tetap dibaca layar scan dari `label_settings.enabled`, sama
 * seperti sebelumnya. Badge kertas disimpan di `badge_settings.di_meja`.
 */
type Meja = "badge" | "label" | "tidak";

async function bacaMeja(eventId: string): Promise<{ meja: Meja; migrasi: boolean }> {
  const label = await loadLabelSettings(eventId);
  const { data, error, status } = await getSupabaseServiceClient()
    .from("badge_settings")
    .select("di_meja")
    .eq("event_id", eventId)
    .maybeSingle();
  const migrasi = !error || !(tabelBadgeBelumAda(error, status) || /di_meja/.test(error.message ?? ""));
  if (label.enabled) return { meja: "label", migrasi };
  return { meja: (data as { di_meja?: boolean } | null)?.di_meja ? "badge" : "tidak", migrasi };
}

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"], { readOnly: true });
  if (auth.response) return auth.response;
  return Response.json(await bacaMeja(auth.scope.event.id));
}

const bodySchema = z.object({ meja: z.enum(["badge", "label", "tidak"]) });

export async function PUT(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { meja } = parsed.data;
  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();
  const sekarang = await bacaMeja(eventId);
  if (meja === "badge" && !sekarang.migrasi) return apiError("BADGE_NOT_READY", 409);

  // Badge kertas dulu: bila gagal, label belum tersentuh dan pilihan lama utuh.
  if (sekarang.migrasi) {
    const { data: ada } = await client.from("badge_settings").select("event_id").eq("event_id", eventId).maybeSingle();
    const { error } = ada
      ? await client.from("badge_settings").update({ di_meja: meja === "badge" } as never).eq("event_id", eventId)
      : meja === "badge"
        ? await client.from("badge_settings").insert({ event_id: eventId, layout: DEFAULT_BADGE_LAYOUT, di_meja: true, updated_by: auth.user.id } as never)
        : { error: null };
    if (error) return apiError("INTERNAL_ERROR", 500);
  }

  const label = await loadLabelSettings(eventId);
  if (label.enabled !== (meja === "label")) {
    const { data: ada } = await client.from("label_settings").select("event_id").eq("event_id", eventId).maybeSingle();
    const { error } = ada
      ? await client.from("label_settings").update({ enabled: meja === "label", updated_at: new Date().toISOString(), updated_by: auth.user.id } as never).eq("event_id", eventId)
      : await client.from("label_settings").insert({ ...label, enabled: true, event_id: eventId, updated_by: auth.user.id } as never);
    if (error) return apiError("INTERNAL_ERROR", 500);
  }

  return Response.json(await bacaMeja(eventId));
}
