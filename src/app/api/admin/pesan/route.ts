import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { isEmailConfigured } from "@/lib/email/client";
import { memberConfig } from "@/lib/member/account";
import { pesanBelumAda } from "@/lib/pesan/api";
import { DEFAULT_CONTENT, INVITATION_REMINDER } from "@/lib/pesan/isi";
import { BLAST_COLUMNS } from "@/lib/pesan/mesin";
import { audienceSchema } from "@/lib/pesan/penerima";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { invitationSendingReady, undanganBelumAda } from "@/lib/undangan/data";

/**
 * Kiriman Pesan peserta (tab Kiriman di menu Pesan peserta).
 *
 * GET daftar kiriman acara beserta ringkasan status. POST membuat draf baru,
 * bisa dengan penerima yang sudah terisi (pintu masuk dari Logistik dan Daftar
 * peserta memakai `audience` jenis `manual`).
 */

const buatSchema = z.object({
  kind: z.enum(["undangan", "info", "invitation"]).default("undangan"),
  audience: audienceSchema.optional(),
  title: z.string().trim().min(1).max(120).optional(),
  /** Duplikat: salin isi dan penerima kiriman ini. */
  dari: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const client = getSupabaseServiceClient();

  const { data, error } = await client
    .from("message_blasts")
    .select(BLAST_COLUMNS)
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .limit(200);
  const dasar = {
    email_configured: isEmailConfigured(),
    member_enabled: Boolean(memberConfig(event)),
    time_zone: event.time_zone,
    invitation_sending: invitationSendingReady(),
  };
  if (pesanBelumAda(error)) return Response.json({ ready: false, items: [], ...dasar });
  if (error) return apiError("INTERNAL_ERROR", 500);

  const items = (data ?? []) as { id: string; status: string; sent_at: string | null }[];
  const ringkasan = await ringkasAcara(event.id);
  return Response.json({
    ready: true,
    items: items.map((item) => {
      if (item.status === "draf") return { ...item, recipients: null, failed: 0, signed_in: null };
      const r = ringkasan.perKiriman.get(item.id) ?? { penerima: [], gagal: 0 };
      // "Sudah masuk" baru berarti setelah kiriman berangkat.
      const masuk = item.sent_at
        ? r.penerima.filter((pid) => (ringkasan.masuk.get(pid) ?? 0) >= Date.parse(item.sent_at!)).length
        : null;
      return { ...item, recipients: r.penerima.length, failed: r.gagal, signed_in: masuk };
    }),
    ...dasar,
  });
}

/**
 * Ringkasan semua kiriman satu acara dari dua kueri berhalaman, bukan kueri per
 * kiriman: penerima (tanpa yang dilewati) beserta statusnya, dan waktu masuk
 * terakhir setiap akun peserta.
 */
async function ringkasAcara(eventId: string) {
  const client = getSupabaseServiceClient();
  const perKiriman = new Map<string, { penerima: string[]; gagal: number }>();
  const masuk = new Map<string, number>();
  for (let dari = 0; ; dari += 1000) {
    const baca = (kolom: string) =>
      client.from("message_blast_recipients").select(kolom).eq("event_id", eventId).neq("status", "dilewati").order("id").range(dari, dari + 999);
    const pertama = await baca("blast_id,participant_id,invitation_id,status");
    // Sebelum migrasi 202610040007 kolom invitation_id belum ada.
    const { data } = pertama.error && undanganBelumAda(pertama.error) ? await baca("blast_id,participant_id,status") : pertama;
    const rows = (data ?? []) as unknown as { blast_id: string; participant_id: string | null; invitation_id?: string | null; status: string }[];
    for (const r of rows) {
      const k = perKiriman.get(r.blast_id) ?? { penerima: [], gagal: 0 };
      // Tamu undangan dihitung "masuk" saat mendaftar; kuncinya diberi awalan.
      if (r.participant_id) k.penerima.push(r.participant_id);
      else if (r.invitation_id) k.penerima.push(`u:${r.invitation_id}`);
      if (r.status === "gagal_sementara" || r.status === "gagal_tetap" || r.status === "tidak_pasti") k.gagal += 1;
      perKiriman.set(r.blast_id, k);
    }
    if (rows.length < 1000) break;
  }
  for (let dari = 0; ; dari += 1000) {
    const { data } = await client
      .from("participant_accounts")
      .select("participant_id,last_login_at")
      .eq("event_id", eventId)
      .not("participant_id", "is", null)
      .not("last_login_at", "is", null)
      .order("id")
      .range(dari, dari + 999);
    const rows = (data ?? []) as { participant_id: string; last_login_at: string }[];
    for (const r of rows) masuk.set(r.participant_id, Date.parse(r.last_login_at));
    if (rows.length < 1000) break;
  }
  for (let dari = 0; ; dari += 1000) {
    const { data, error } = await client
      .from("event_invitations")
      .select("id,registered_at")
      .eq("event_id", eventId)
      .not("registered_at", "is", null)
      .order("id")
      .range(dari, dari + 999);
    if (error) break; // migrasi tamu undangan belum dijalankan
    const rows = (data ?? []) as { id: string; registered_at: string }[];
    for (const r of rows) masuk.set(`u:${r.id}`, Date.parse(r.registered_at));
    if (rows.length < 1000) break;
  }
  return { perKiriman, masuk };
}

function audienceDefault(kind: "undangan" | "info" | "invitation") {
  return kind === "undangan" ? "belum_masuk" : kind === "invitation" ? "belum_dikirim" : "semua";
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = buatSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const awal =
    parsed.data.kind === "invitation" && parsed.data.audience?.jenis === "belum_daftar" ? INVITATION_REMINDER : DEFAULT_CONTENT[parsed.data.kind];
  const client = getSupabaseServiceClient();

  let isi = {
    kind: parsed.data.kind,
    title: parsed.data.title ?? awal.title,
    audience: parsed.data.audience ?? { jenis: audienceDefault(parsed.data.kind), perusahaan: [], ids: [] },
    email_subject: awal.subject,
    email_body: awal.body,
  };
  if (parsed.data.dari) {
    const { data: asal } = await client
      .from("message_blasts")
      .select("kind,title,audience,email_subject,email_body")
      .eq("id", parsed.data.dari)
      .eq("event_id", auth.scope.event.id)
      .maybeSingle();
    if (!asal) return apiError("MESSAGE_NOT_FOUND", 404);
    const a = asal as unknown as typeof isi;
    isi = { ...a, title: `${a.title} (copy)`.slice(0, 120) };
  }

  const { data, error } = await client
    .from("message_blasts")
    .insert({ event_id: auth.scope.event.id, channel: "email", ...isi, created_by: auth.user.id } as never)
    .select(BLAST_COLUMNS)
    .single();
  if (pesanBelumAda(error)) return apiError("MESSAGES_NOT_READY", 409);
  if (error || !data) return apiError("INTERNAL_ERROR", 500);
  return Response.json(data, { status: 201 });
}
