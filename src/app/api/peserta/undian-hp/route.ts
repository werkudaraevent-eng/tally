import { getMemberSession } from "@/lib/member/account";
import { memberError, requireMemberEvent } from "@/lib/member/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { segelHasil, type CahayaPending } from "@/lib/undian-cahaya-server";

// Cahaya HP: hasil undian MILIK PESERTA INI, terkunci per gelombang.
//
// HP memanggilnya sekali per undian, tepat setelah Undi ditekan. Isinya satu
// kotak terkunci (AES-GCM) per gelombang: "stay", "out", "win", atau
// "backup:n", semua dipad sama panjang. Kunci gelombang baru terbit di
// /api/undian/hp setelah waktunya lewat, jadi HP pemenang pun tidak tahu apa-apa
// sebelum gelombang terakhir. Tidak ada nama, rujukan, atau hasil peserta lain.
//
// Pengaruhnya ke database: satu baca sesi, satu baca state, per HP per undian.

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const resolved = await requireMemberEvent(request);
  if (resolved.response) return resolved.response;
  const sesi = await getMemberSession(resolved.event);
  if (!sesi) return memberError("UNAUTHORIZED", 401, "Masuk dulu ke Dashboard saya.");

  const { data, error } = await getSupabaseServiceClient()
    .from("undian_state")
    .select("mode,phase,active_prize_id,draw_round,pending")
    .eq("event_id", resolved.event.id)
    .maybeSingle();
  const now = Date.now();
  if (error) return memberError("INTERNAL_ERROR", 500, "Undian belum bisa dibaca. Coba lagi.");
  const state = data as { mode: string; phase: string; active_prize_id: number | null; draw_round: number; pending: { cahaya?: CahayaPending } | null } | null;
  const cahaya = state && state.mode === "live" && state.phase !== "idle" ? state.pending?.cahaya ?? null : null;
  if (!state || !cahaya) return Response.json({ now, draw: null }, { headers: NO_STORE });

  const draw = `${state.active_prize_id}-${state.draw_round}-${cahaya.jadwal.start}`;
  const participantId = sesi.participant?.id ?? null;
  const kode = participantId ? cahaya.map[participantId] : undefined;
  if (typeof kode !== "number") return Response.json({ now, draw, in_pool: false }, { headers: NO_STORE });
  return Response.json({ now, draw, in_pool: true, sealed: segelHasil(kode, cahaya.keys) }, { headers: NO_STORE });
}
