import { z } from "zod";
import { altFotoPengumuman } from "@/lib/pengumuman-foto";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { publicEventName } from "@/lib/domain";
import { sendEmailBatch } from "@/lib/email/client";
import { emailPengumuman } from "@/lib/email/pengumuman";
import { tabelBelumAda } from "@/lib/member/pengumuman";
import { allowedByList, messagingAllowlist } from "@/lib/pesan/alamat";
import { akunPenerima } from "@/lib/pengumuman-penerima-server";
import { bacaSyaratPengumuman } from "@/lib/sasaran-pengumuman";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { linkOrigin } from "@/lib/domain-klien/asal";

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
  const baca = (kolom: string) => client.from("event_announcements").select(kolom).eq("id", parsed.data.id).eq("event_id", event.id).maybeSingle();
  // Sebelum migrasi 202611040001 audience_any belum ada, sebelum 202610300004
  // semua kolom penerima: baca ulang tanpa kolom itu.
  const belumAda = (galat: { code?: string } | null) => galat?.code === "42703" || galat?.code === "PGRST204";
  // Foto (202611060001) dibaca terpisah: sebelum migrasinya cukup tanpa foto.
  let { data: baris, error } = await baca("id,title,body,link_url,link_label,audience,audience_rules,audience_ids,audience_any,image_url,image_alt");
  if (belumAda(error)) ({ data: baris, error } = await baca("id,title,body,link_url,link_label,audience,audience_rules,audience_ids,audience_any"));
  if (belumAda(error)) ({ data: baris, error } = await baca("id,title,body,link_url,link_label,audience,audience_rules,audience_ids"));
  if (belumAda(error)) ({ data: baris, error } = await baca("id,title,body,link_url,link_label,audience"));
  if (tabelBelumAda(error)) return apiError("ANNOUNCEMENTS_NOT_READY", 409);
  if (error) return apiError("INTERNAL_ERROR", 500);
  if (!baris) return apiError("ANNOUNCEMENT_NOT_FOUND", 404);
  const item = baris as unknown as {
    id: string; title: string; body: string; link_url: string | null; link_label: string | null; audience: string; audience_rules?: unknown; audience_ids?: unknown; audience_any?: unknown;
    image_url?: string | null; image_alt?: string | null;
  };

  // Tersembunyi (migrasi 202611060002) tidak dikirim: peserta tidak bisa
  // membukanya di Dashboard saya. Sebelum migrasinya kolom ini belum ada.
  const { data: sembunyi } = await client.from("event_announcements").select("hidden_at").eq("id", item.id).maybeSingle();
  if ((sembunyi as { hidden_at?: string | null } | null)?.hidden_at) return apiError("ANNOUNCEMENT_HIDDEN", 409);

  // Penerima yang sama dengan portal, saat ini: syarat dicek terhadap data
  // peserta sekarang. Penerima yang tidak dikenal tidak dikirimi siapa pun.
  const audience = item.audience;
  if (audience !== "semua" && audience !== "disetujui" && audience !== "syarat" && audience !== "pilih") return apiError("INTERNAL_ERROR", 500);
  const akun = await akunPenerima(event, {
    audience,
    audience_rules: audience === "syarat" ? bacaSyaratPengumuman(item.audience_rules) : null,
    audience_ids: audience === "pilih" && Array.isArray(item.audience_ids) ? (item.audience_ids as string[]) : null,
    audience_any: audience === "syarat" && item.audience_any === true,
  });
  if (!akun) return apiError("INTERNAL_ERROR", 500);
  // Daftar uji yang sama dengan Kiriman: di luar produksi hanya alamat di
  // MESSAGING_ALLOWLIST yang menerima, dan tanpa daftar itu tidak ada yang
  // dikirim. Preview memakai database produksi.
  const daftarUji = messagingAllowlist();
  if (daftarUji.mode === "blocked") return apiError("MESSAGING_BLOCKED", 403);
  const penerima = [
    ...new Set(akun.map((baris) => baris.email?.trim().toLowerCase() ?? "").filter((email): email is string => Boolean(email) && allowedByList(email, daftarUji))),
  ];

  const origin = await linkOrigin(request, event.id);
  const isi = emailPengumuman({
    eventName: publicEventName(event),
    title: item.title,
    body: item.body,
    linkUrl: item.link_url,
    linkLabel: item.link_label,
    foto: item.image_url ? { src: item.image_url, alt: altFotoPengumuman(item) } : null,
    dashboardUrl: `${origin}/e/${encodeURIComponent(event.slug)}/peserta`,
  });
  const hasil = await sendEmailBatch(penerima.map((to) => ({ to, ...isi })), event.id);
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
