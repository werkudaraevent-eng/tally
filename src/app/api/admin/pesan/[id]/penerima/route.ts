import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { idSchema, pesanBelumAda } from "@/lib/pesan/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Baris penerima untuk tabel laporan, disaring per kelompok chip:
 * semua | bisa_dicoba | gagal_tetap | tidak_pasti | belum_masuk | dilewati.
 */

const KELOMPOK: Record<string, string[] | null> = {
  semua: null,
  bisa_dicoba: ["gagal_sementara"],
  gagal_tetap: ["gagal_tetap"],
  tidak_pasti: ["tidak_pasti"],
  dilewati: ["dilewati"],
  belum_masuk: null,
};

const UKURAN = 50;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = (await context.params).id;
  if (!idSchema.safeParse(id).success) return apiError("VALIDATION_ERROR", 422);
  const url = new URL(request.url);
  const kelompok = url.searchParams.get("kelompok") ?? "semua";
  if (!(kelompok in KELOMPOK)) return apiError("VALIDATION_ERROR", 422);
  const halaman = Math.max(0, Number(url.searchParams.get("halaman") ?? 0) || 0);
  const client = getSupabaseServiceClient();

  const { data: blast, error: galat } = await client
    .from("message_blasts")
    .select("id,sent_at,kind")
    .eq("id", id)
    .eq("event_id", auth.scope.event.id)
    .maybeSingle();
  if (pesanBelumAda(galat)) return apiError("MESSAGES_NOT_READY", 409);
  if (!blast) return apiError("MESSAGE_NOT_FOUND", 404);
  const sentAt = (blast as { sent_at: string | null }).sent_at;
  const tamu = (blast as { kind: string }).kind === "invitation";

  // Akun yang masuk setelah kiriman berangkat, untuk kolom Masuk dan chip
  // "Belum masuk".
  const masuk = new Map<string, string>();
  if (sentAt && tamu) {
    // Untuk Invitation, "masuk" berarti sudah mendaftar setelah kiriman berangkat.
    const { data: daftar } = await client
      .from("event_invitations")
      .select("id,registered_at")
      .eq("event_id", auth.scope.event.id)
      .gte("registered_at", sentAt);
    for (const d of (daftar ?? []) as { id: string; registered_at: string }[]) masuk.set(d.id, d.registered_at);
  } else if (sentAt) {
    const { data: akun } = await client
      .from("participant_accounts")
      .select("participant_id,last_login_at")
      .eq("event_id", auth.scope.event.id)
      .gte("last_login_at", sentAt)
      .not("participant_id", "is", null);
    for (const a of (akun ?? []) as { participant_id: string; last_login_at: string }[]) masuk.set(a.participant_id, a.last_login_at);
  }

  let kueri = client
    .from("message_blast_recipients")
    .select(`id,participant_id,${tamu ? "invitation_id," : ""}channel,address,name,status,reason_code,reason,sent_at,delivered_at,read_at,failed_at`, { count: "exact" })
    .eq("blast_id", id)
    .order("name")
    .order("id");
  const status = KELOMPOK[kelompok];
  if (status) kueri = kueri.in("status", status);
  if (kelompok === "belum_masuk") {
    kueri = kueri.neq("status", "dilewati");
    if (masuk.size) kueri = kueri.not(tamu ? "invitation_id" : "participant_id", "in", `(${[...masuk.keys()].join(",")})`);
  }
  const { data, count, error } = await kueri.range(halaman * UKURAN, halaman * UKURAN + UKURAN - 1);
  if (error) return apiError("INTERNAL_ERROR", 500);

  const rows = ((data ?? []) as { participant_id: string | null; invitation_id: string | null }[]).map((r) => {
    const kunci = tamu ? r.invitation_id : r.participant_id;
    return { ...r, signed_in_at: kunci ? masuk.get(kunci) ?? null : null };
  });
  return Response.json({ rows, total: count ?? 0, page: halaman, page_size: UKURAN, signed_in_total: masuk.size });
}
