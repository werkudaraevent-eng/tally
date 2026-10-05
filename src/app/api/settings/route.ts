import { z } from "zod";
import { apiError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { TIME_ZONE_IDS } from "@/lib/timezone";
import { emailConfig, forgetEventSender, senderAddress } from "@/lib/email/client";

/** Kosong berarti "pakai bawaan" dan disimpan sebagai null. */
const kosongJadiNull = (nilai: unknown) => (typeof nilai === "string" && nilai.trim() === "" ? null : nilai);

const patchSchema = z.object({
  pickup_mode: z.enum(["after_payment", "immediate"]).optional(),
  name_display_mode: z.enum(["full", "initials", "company_only", "hidden"]).optional(),
  leaderboard_enabled: z.boolean().optional(),
  pending_auto_void_minutes: z.number().int().min(5).max(1440).optional(),
  cashier_confirmation_required: z.boolean().optional(),
  // Daftar zona diambil dari satu sumber yang sama dengan CHECK constraint di
  // database, jadi keduanya tidak bisa menyimpang.
  time_zone: z.enum(TIME_ZONE_IDS as unknown as [string, ...string[]]).optional(),
  // Nama pengirim email acara ini. Tanpa < > " dan baris baru: nilainya
  // disusun menjadi header From `Nama <alamat>`.
  email_sender_name: z.preprocess(kosongJadiNull, z.string().trim().max(80).regex(/^[^<>"\r\n]+$/, "Nama pengirim tidak boleh memuat < > atau tanda petik.").nullable()).optional(),
  email_reply_to: z.preprocess(kosongJadiNull, z.string().trim().toLowerCase().max(254).email("Alamat balasan bukan email yang sah.").nullable()).optional(),
});

const SELECT = "pickup_mode,name_display_mode,leaderboard_enabled,pending_auto_void_minutes,cashier_confirmation_required,time_zone,email_sender_name,email_reply_to,updated_at";

/**
 * Pengirim bawaan dari env, untuk contoh "Peserta melihat" di Pengaturan:
 * alamatnya tidak bisa diubah per acara, jadi panitia perlu melihatnya.
 */
function pengirimBawaan() {
  const config = emailConfig();
  if (!config) return null;
  const nama = /^(.*?)\s*<[^>]+>\s*$/.exec(config.from)?.[1]?.replace(/^"|"$/g, "").trim() || null;
  return { name: nama, address: senderAddress(config.from), reply_to: config.replyTo };
}

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["booth", "cashier", "admin"]);
  if (auth.response) return auth.response;
  const { data, error } = await getSupabaseServiceClient().from("event_settings").select(SELECT).eq("event_id", auth.scope.event.id).single();
  if (error) return apiError("INTERNAL_ERROR", 500);
  // Zona waktu dari kolom acara, sumber tunggalnya (lihat PATCH di bawah).
  return Response.json({ ...(data as object), time_zone: auth.scope.event.time_zone ?? (data as { time_zone?: string }).time_zone, email_default: pengirimBawaan() });
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) return apiError("VALIDATION_ERROR", 422, parsed.success ? undefined : parsed.error.flatten());
  const client = getSupabaseServiceClient();
  const { data: current, error: currentError } = await client.from("event_settings").select("*").eq("event_id", auth.scope.event.id).single() as { data: { cashier_confirmation_required: boolean } | null; error: unknown };
  if (currentError || !current) return apiError("INTERNAL_ERROR", 500);
  const { data, error } = await client.from("event_settings").update({ ...parsed.data, updated_at: new Date().toISOString(), updated_by: auth.user.id } as never).eq("event_id", auth.scope.event.id).select(SELECT).single();
  if (error) return apiError("INTERNAL_ERROR", 500);

  // Zona waktu juga kolom acara, dan halaman publik, email, serta daftar acara
  // membacanya dari sana. Tanpa ini, mengganti zona di Settings mengubah jam
  // di layar staf saja sementara halaman acara tetap di zona lama.
  if (parsed.data.time_zone) {
    await client.from("events").update({ time_zone: parsed.data.time_zone, updated_at: new Date().toISOString() } as never).eq("id", auth.scope.event.id);
  }

  // Order yang sudah menggantung di antrean kasir tidak ada lagi yang melayani
  // setelah toggle dimatikan, dan akan kena auto-void dalam 45 menit. Lunasi
  // sekaligus supaya tidak hilang diam-diam.
  let autoSettled = 0;
  if (parsed.data.cashier_confirmation_required === false && current.cashier_confirmation_required) {
    const { data: settleResult } = await client.rpc("settle_pending_orders_without_cashier" as never, { p_event_id: auth.scope.event.id, p_user_id: auth.user.id } as never);
    autoSettled = (settleResult as { settled?: number } | null)?.settled ?? 0;
  }

  await client.from("audit_logs").insert({ event_id: auth.scope.event.id, user_id: auth.user.id, action: "settings_update", payload: { old: current, new: data, auto_settled_orders: autoSettled } } as never);
  forgetEventSender(auth.scope.event.id);
  return Response.json({ ...(data as object), time_zone: parsed.data.time_zone ?? auth.scope.event.time_zone, email_default: pengirimBawaan(), auto_settled_orders: autoSettled });
}
