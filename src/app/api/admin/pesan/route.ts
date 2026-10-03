import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { isEmailConfigured } from "@/lib/email/client";
import { memberConfig } from "@/lib/member/account";
import { pesanBelumAda } from "@/lib/pesan/api";
import { DEFAULT_CONTENT } from "@/lib/pesan/isi";
import { BLAST_COLUMNS } from "@/lib/pesan/mesin";
import { audienceSchema } from "@/lib/pesan/penerima";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Kiriman Pesan peserta (tab Kiriman di menu Pesan peserta).
 *
 * GET daftar kiriman acara beserta ringkasan status. POST membuat draf baru,
 * bisa dengan penerima yang sudah terisi (pintu masuk dari Logistik dan Daftar
 * peserta memakai `audience` jenis `manual`).
 */

const buatSchema = z.object({
  kind: z.enum(["undangan", "info"]).default("undangan"),
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
  const dasar = { email_configured: isEmailConfigured(), member_enabled: Boolean(memberConfig(event)), time_zone: event.time_zone };
  if (pesanBelumAda(error)) return Response.json({ ready: false, items: [], ...dasar });
  if (error) return apiError("INTERNAL_ERROR", 500);

  const items = (data ?? []) as { id: string; status: string }[];
  // Ringkasan per kiriman: jumlah penerima (tanpa yang dilewati) dan yang gagal.
  const ringkasan = await Promise.all(
    items.map(async (item) => {
      if (item.status === "draf") return { recipients: null, failed: 0 };
      const [semua, gagal] = await Promise.all([
        client.from("message_blast_recipients").select("id", { count: "exact", head: true }).eq("blast_id", item.id).neq("status", "dilewati"),
        client.from("message_blast_recipients").select("id", { count: "exact", head: true }).eq("blast_id", item.id).in("status", ["gagal_sementara", "gagal_tetap", "tidak_pasti"]),
      ]);
      return { recipients: semua.count ?? 0, failed: gagal.count ?? 0 };
    }),
  );
  return Response.json({ ready: true, items: items.map((item, i) => ({ ...item, ...ringkasan[i] })), ...dasar });
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = buatSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const awal = DEFAULT_CONTENT[parsed.data.kind];
  const client = getSupabaseServiceClient();

  let isi = {
    kind: parsed.data.kind,
    title: parsed.data.title ?? awal.title,
    audience: parsed.data.audience ?? { jenis: parsed.data.kind === "undangan" ? "belum_masuk" : "semua", perusahaan: [], ids: [] },
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
    isi = { ...a, title: `${a.title} (salinan)`.slice(0, 120) };
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
