import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { type EventLandingConfig } from "@/lib/domain";
import { memberSchema } from "@/lib/landing-body-schema";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Setelan area peserta (menu admin "Area peserta").
 *
 * Disimpan di `landing_config.member`, kolom yang sama dengan halaman acara,
 * tetapi PATCH di sini hanya menulis kunci `member` di atas salinan server
 * yang terbaru. Editor Halaman acara tidak lagi menulis `member`, jadi dua
 * layar ini tidak saling menimpa, ke arah mana pun urutan Simpan-nya.
 *
 * GET ikut mengembalikan jumlah peserta per pilihan "Siapa yang bisa masuk",
 * supaya panitia melihat siapa yang tertinggal sebelum memilih.
 */

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();
  const landing = (auth.scope.event.landing_config ?? {}) as EventLandingConfig;

  const [peserta, berEmail, disetujui, akun] = await Promise.all([
    client.from("participants").select("id", { count: "exact", head: true }).eq("event_id", eventId).is("source_removed_at", null),
    client
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .is("source_removed_at", null)
      .not("email", "is", null)
      .neq("email", ""),
    client.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "approved"),
    client.from("participant_accounts").select("id", { count: "exact", head: true }).eq("event_id", eventId),
  ]);

  return Response.json({
    member: landing.member ?? { enabled: false },
    // null bila hitungan gagal: layar menyembunyikan angkanya, bukan menampilkan 0.
    counts: {
      participants: peserta.error ? null : peserta.count ?? 0,
      with_email: berEmail.error ? null : berEmail.count ?? 0,
      approved: disetujui.error ? null : disetujui.count ?? 0,
      accounts: akun.error ? null : akun.count ?? 0,
    },
  });
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = memberSchema.safeParse((await request.json().catch(() => null))?.member);
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  // Dibaca ulang tepat sebelum menulis, dan ditulis hanya kalau updated_at masih
  // sama: editor Halaman acara dan halaman Speakers menulis kolom yang sama.
  // Berubah di antaranya -> baca ulang, coba sekali lagi.
  let landing: EventLandingConfig = {};
  let data: unknown = null;
  for (let percobaan = 0; ; percobaan++) {
    const { data: terkini, error: galatBaca } = await client
      .from("events")
      .select("landing_config,updated_at")
      .eq("id", auth.scope.event.id)
      .single();
    if (galatBaca || !terkini) return apiError("INTERNAL_ERROR", 500);
    const baris = terkini as { landing_config?: EventLandingConfig | null; updated_at: string };
    landing = (baris.landing_config ?? {}) as EventLandingConfig;
    const hasil = await client
      .from("events")
      // Digabung, bukan diganti: kunci yang tidak dikirim layar ini (mis.
      // show_roommates) tetap tersimpan.
      .update({ landing_config: { ...landing, member: { ...(landing.member ?? {}), ...parsed.data } }, updated_at: new Date().toISOString() } as never)
      .eq("id", auth.scope.event.id)
      .eq("updated_at", baris.updated_at)
      .select("landing_config")
      .maybeSingle();
    if (hasil.error) return apiError("INTERNAL_ERROR", 500);
    if (hasil.data) { data = hasil.data; break; }
    if (percobaan >= 1) return apiError("CONFLICT", 409);
  }

  await client.from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "member_area_update",
    payload: { old: landing.member ?? null, new: parsed.data },
  } as never);

  return Response.json({ member: (data as { landing_config?: EventLandingConfig } | null)?.landing_config?.member ?? parsed.data });
}
