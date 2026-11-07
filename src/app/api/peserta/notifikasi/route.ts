import { z } from "zod";
import { getMemberSession } from "@/lib/member/account";
import { memberError, requireMemberEvent } from "@/lib/member/api";
import { kunciPush } from "@/lib/push/kirim";
import { platformDari } from "@/lib/push/pesan";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Notifikasi HP peserta (Participant area > Phone notifications).
 *
 * GET    -> kunci publik VAPID + apakah perangkat ini (endpoint di kueri) sudah terdaftar.
 * POST   -> simpan langganan perangkat ini untuk akun yang sedang masuk.
 * DELETE -> hapus langganan perangkat ini (peserta mematikan notifikasi).
 *
 * Hanya peserta yang masuk, hanya bila panitia menyalakan saklarnya.
 */

const langgananSchema = z.object({
  endpoint: z.string().url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(40).max(200), auth: z.string().min(10).max(100) }),
});

async function siapkan(request: Request) {
  const resolved = await requireMemberEvent(request);
  if (resolved.response) return { response: resolved.response } as const;
  if (resolved.member.push?.enabled !== true) return { response: memberError("PUSH_OFF", 404, "Notifikasi belum dibuka untuk acara ini.") } as const;
  const sesi = await getMemberSession(resolved.event);
  if (!sesi) return { response: memberError("UNAUTHORIZED", 401, "Masuk dulu ke Dashboard saya.") } as const;
  return { response: null, event: resolved.event, sesi } as const;
}

export async function GET(request: Request) {
  const siap = await siapkan(request);
  if (siap.response) return siap.response;
  const kunci = await kunciPush();
  if (!kunci) return memberError("PUSH_NOT_READY", 409, "Notifikasi belum tersedia.");
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  let terdaftar = false;
  if (endpoint) {
    const { data } = await getSupabaseServiceClient()
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", endpoint)
      .eq("account_id", siap.sesi.accountId)
      .maybeSingle();
    terdaftar = Boolean(data);
  }
  return Response.json({ publicKey: kunci.publicKey, terdaftar }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const siap = await siapkan(request);
  if (siap.response) return siap.response;
  const isi = langgananSchema.safeParse(await request.json().catch(() => null));
  if (!isi.success) return memberError("INVALID", 400, "Data notifikasi tidak lengkap.");
  const client = getSupabaseServiceClient();
  // Satu akun paling banyak 10 perangkat: cukup untuk HP, tablet, dan laptop.
  const { count } = await client.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("account_id", siap.sesi.accountId);
  if ((count ?? 0) >= 10) {
    const { data: tertua } = await client.from("push_subscriptions").select("id").eq("account_id", siap.sesi.accountId).order("updated_at", { ascending: true }).limit(1);
    const id = (tertua as { id: string }[] | null)?.[0]?.id;
    if (id) await client.from("push_subscriptions").delete().eq("id", id);
  }
  // Endpoint unik: perangkat yang sama (juga bila pindah akun) menimpa barisnya.
  const { error } = await client.from("push_subscriptions").upsert(
    {
      event_id: siap.event.id,
      account_id: siap.sesi.accountId,
      endpoint: isi.data.endpoint,
      p256dh: isi.data.keys.p256dh,
      auth: isi.data.keys.auth,
      platform: platformDari(request.headers.get("user-agent")),
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "endpoint" },
  );
  if (error) return memberError("PUSH_SAVE_FAILED", 500, "Notifikasi belum tersimpan. Coba lagi.");
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const resolved = await requireMemberEvent(request);
  if (resolved.response) return resolved.response;
  const sesi = await getMemberSession(resolved.event);
  if (!sesi) return memberError("UNAUTHORIZED", 401, "Masuk dulu ke Dashboard saya.");
  const isi = z.object({ endpoint: z.string().max(1000) }).safeParse(await request.json().catch(() => null));
  if (!isi.success) return memberError("INVALID", 400, "Data notifikasi tidak lengkap.");
  await getSupabaseServiceClient().from("push_subscriptions").delete().eq("endpoint", isi.data.endpoint).eq("account_id", sesi.accountId);
  return Response.json({ ok: true });
}
