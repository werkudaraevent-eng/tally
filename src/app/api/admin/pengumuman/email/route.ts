import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { publicEventName } from "@/lib/domain";
import { sendEmailBatch } from "@/lib/email/client";
import { emailPengumuman } from "@/lib/email/pengumuman";
import { tabelBelumAda } from "@/lib/member/pengumuman";
import { allowedByList, messagingAllowlist } from "@/lib/pesan/alamat";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Kirim salinan email satu pengumuman ke akun area peserta sesuai penerimanya.
 *
 * Terpisah dari simpan, dan hanya dipanggil setelah panitia mengonfirmasi
 * jumlah penerimanya: email yang sudah terkirim tidak bisa ditarik. Hasilnya
 * disimpan di `email_summary` supaya daftar admin memperlihatkan bahwa
 * pengumuman itu sudah pernah dikirim, dan kepada berapa orang.
 */

export const maxDuration = 60;

const schema = z.object({ id: z.string().uuid() });

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const event = auth.scope.event;
  const client = getSupabaseServiceClient();
  const { data: baris, error } = await client
    .from("event_announcements")
    .select("id,title,body,link_url,link_label,audience")
    .eq("id", parsed.data.id)
    .eq("event_id", event.id)
    .maybeSingle();
  if (tabelBelumAda(error)) return apiError("ANNOUNCEMENTS_NOT_READY", 409);
  if (error) return apiError("INTERNAL_ERROR", 500);
  if (!baris) return apiError("ANNOUNCEMENT_NOT_FOUND", 404);
  const item = baris as { id: string; title: string; body: string; link_url: string | null; link_label: string | null; audience: string };

  let kueri = client.from("participant_accounts").select("email").eq("event_id", event.id);
  if (item.audience === "disetujui") kueri = kueri.not("participant_id", "is", null);
  const { data: akun, error: galatAkun } = await kueri;
  if (galatAkun) return apiError("INTERNAL_ERROR", 500);
  // Daftar uji yang sama dengan Kiriman: di luar produksi hanya alamat di
  // MESSAGING_ALLOWLIST yang menerima, dan tanpa daftar itu tidak ada yang
  // dikirim. Preview memakai database produksi.
  const daftarUji = messagingAllowlist();
  if (daftarUji.mode === "blocked") return apiError("MESSAGING_BLOCKED", 403);
  const penerima = [
    ...new Set(((akun ?? []) as { email: string }[]).map((baris) => baris.email?.trim().toLowerCase()).filter((email): email is string => Boolean(email) && allowedByList(email, daftarUji))),
  ];

  const origin = new URL(request.url).origin;
  const isi = emailPengumuman({
    eventName: publicEventName(event),
    title: item.title,
    body: item.body,
    linkUrl: item.link_url,
    linkLabel: item.link_label,
    dashboardUrl: `${origin}/e/${encodeURIComponent(event.slug)}/peserta`,
  });
  const hasil = await sendEmailBatch(penerima.map((to) => ({ to, ...isi })));
  if ("notConfigured" in hasil) return apiError("EMAIL_NOT_CONFIGURED", 503);

  const ringkasan = { terkirim: hasil.sent, gagal: hasil.failed, galat: hasil.error, waktu: new Date().toISOString() };
  await client.from("event_announcements").update({ email_summary: ringkasan } as never).eq("id", item.id);
  await client.from("audit_logs").insert({
    event_id: event.id,
    user_id: auth.user.id,
    action: "announcement_email",
    payload: { id: item.id, ...ringkasan },
  } as never);

  if (hasil.sent === 0 && hasil.failed > 0) return apiError("EMAIL_SEND_FAILED", 502, ringkasan);
  return Response.json(ringkasan);
}
