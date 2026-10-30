import { z } from "zod";
import { apiError } from "@/lib/api";
import { messagingAllowlist } from "@/lib/pesan/alamat";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { isEmailConfigured } from "@/lib/email/client";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { tabelBelumAda } from "@/lib/member/pengumuman";
import { penerimaSchema, penerimaSiap, periksaPenerima, type Penerima } from "@/lib/pengumuman-penerima-server";

/**
 * Pengumuman panitia untuk area peserta (menu admin "Pengumuman").
 *
 * GET daftar semua pengumuman acara + jumlah akun per penerima (untuk kalimat
 * "Kirim ke N akun" sebelum salinan email dikirim). POST membuat, PATCH
 * menyunting, DELETE menghapus. Salinan email dikirim terpisah lewat
 * /api/admin/pengumuman/email, setelah panitia mengonfirmasi.
 *
 * Send to per syarat atau per peserta (audience syarat/pilih) butuh migrasi
 * 202610300004. Sebelum itu daftar dibaca tanpa kolomnya, dan hanya semua dan
 * disetujui yang bisa disimpan (`targeting_ready` false).
 */

const KOLOM = "id,title,body,link_url,link_label,audience,pinned,published_at,email_summary,created_at,updated_at";
const KOLOM_PENERIMA = `${KOLOM},audience_rules,audience_ids`;

const tautanSchema = z
  .string()
  .trim()
  .max(500)
  .refine((nilai) => nilai === "" || /^https?:\/\//i.test(nilai), "Links must start with http:// or https://")
  .transform((nilai) => nilai || null);

const isiSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  body: z.string().trim().max(2000).default(""),
  link_url: tautanSchema.nullable().optional(),
  link_label: z
    .string()
    .trim()
    .max(60)
    .transform((nilai) => nilai || null)
    .nullable()
    .optional(),
  pinned: z.boolean().default(false),
});

const buatSchema = isiSchema.merge(penerimaSchema.partial({ audience: true }));
const ubahSchema = isiSchema.partial().merge(penerimaSchema.partial()).extend({ id: z.string().uuid() });

/**
 * Kolom penerima yang ditulis. Sebelum migrasi hanya `audience`, dan hanya
 * semua atau disetujui; null = penerima itu belum bisa disimpan.
 */
function kolomTulis(penerima: Penerima, siap: boolean): Record<string, unknown> | null {
  if (siap) return { ...penerima };
  return penerima.audience === "semua" || penerima.audience === "disetujui" ? { audience: penerima.audience } : null;
}

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();

  const siap = await penerimaSiap();
  const [daftar, semua, disetujui] = await Promise.all([
    client
      .from("event_announcements")
      .select(siap ? KOLOM_PENERIMA : KOLOM)
      .eq("event_id", eventId)
      .order("pinned", { ascending: false })
      .order("published_at", { ascending: false }),
    client.from("participant_accounts").select("id", { count: "exact", head: true }).eq("event_id", eventId),
    client
      .from("participant_accounts")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .not("participant_id", "is", null),
  ]);
  if (tabelBelumAda(daftar.error)) return Response.json({ ready: false, items: [], recipients: { semua: 0, disetujui: 0 }, email_configured: isEmailConfigured() });
  if (daftar.error) return apiError("INTERNAL_ERROR", 500);

  const landing = (auth.scope.event.landing_config ?? {}) as { member?: { enabled?: boolean } };
  return Response.json({
    ready: true,
    items: daftar.data ?? [],
    recipients: { semua: semua.count ?? 0, disetujui: disetujui.count ?? 0 },
    email_configured: isEmailConfigured(),
    test_mode: messagingAllowlist().mode,
    member_enabled: Boolean(landing.member?.enabled),
    time_zone: auth.scope.event.time_zone,
    targeting_ready: siap,
  });
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = buatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { audience = "semua", audience_rules, audience_ids, ...isi } = parsed.data;
  const sah = await periksaPenerima({ audience, audience_rules, audience_ids }, auth.scope.event, auth.scope.role === "custom");
  if ("galat" in sah) return sah.galat ? apiError("VALIDATION_ERROR", 422, { message: sah.galat }) : apiError("INTERNAL_ERROR", 500);
  const siap = await penerimaSiap();
  const penerima = kolomTulis(sah.penerima, siap);
  if (!penerima) return apiError("ANNOUNCEMENT_AUDIENCE_NOT_READY", 409);

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("event_announcements")
    .insert({ ...isi, ...penerima, event_id: auth.scope.event.id, created_by: auth.user.id } as never)
    .select(siap ? KOLOM_PENERIMA : KOLOM)
    .single();
  if (tabelBelumAda(error)) return apiError("ANNOUNCEMENTS_NOT_READY", 409);
  if (error || !data) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "announcement_create",
    payload: { new: data },
  } as never);
  return Response.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = ubahSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { id, audience, audience_rules, audience_ids, ...isi } = parsed.data;
  const siap = await penerimaSiap();
  let ubah: Record<string, unknown> = isi;
  // Penerima selalu dikirim utuh: audience bersama syarat atau pesertanya.
  if (audience) {
    const sah = await periksaPenerima({ audience, audience_rules, audience_ids }, auth.scope.event, auth.scope.role === "custom");
    if ("galat" in sah) return sah.galat ? apiError("VALIDATION_ERROR", 422, { message: sah.galat }) : apiError("INTERNAL_ERROR", 500);
    const penerima = kolomTulis(sah.penerima, siap);
    if (!penerima) return apiError("ANNOUNCEMENT_AUDIENCE_NOT_READY", 409);
    ubah = { ...isi, ...penerima };
  } else if (audience_rules || audience_ids) {
    return apiError("VALIDATION_ERROR", 422, { message: "Send to is missing. Reload the page." });
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("event_announcements")
    .update({ ...ubah, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("event_id", auth.scope.event.id)
    .select(siap ? KOLOM_PENERIMA : KOLOM)
    .maybeSingle();
  if (tabelBelumAda(error)) return apiError("ANNOUNCEMENTS_NOT_READY", 409);
  if (error) return apiError("INTERNAL_ERROR", 500);
  if (!data) return apiError("ANNOUNCEMENT_NOT_FOUND", 404);

  await client.from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "announcement_update",
    payload: { id, changes: ubah },
  } as never);
  return Response.json(data);
}

export async function DELETE(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!z.string().uuid().safeParse(id).success) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("event_announcements")
    .delete()
    .eq("id", id)
    .eq("event_id", auth.scope.event.id)
    .select("id,title")
    .maybeSingle();
  if (tabelBelumAda(error)) return apiError("ANNOUNCEMENTS_NOT_READY", 409);
  if (error) return apiError("INTERNAL_ERROR", 500);
  if (!data) return apiError("ANNOUNCEMENT_NOT_FOUND", 404);

  await client.from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "announcement_delete",
    payload: { old: data },
  } as never);
  return Response.json({ ok: true });
}
