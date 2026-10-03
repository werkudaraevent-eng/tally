import { getMemberSession } from "@/lib/member/account";
import { memberError, requireMemberEvent } from "@/lib/member/api";
import { markAnnouncementsSeen } from "@/lib/member/pengumuman";

/**
 * Lonceng dibuka: semua pengumuman sampai saat ini dianggap sudah dibaca, jadi
 * angka di lonceng hilang. Titik "baru" di panel yang sedang terbuka tetap,
 * karena panel itu dirender dengan batas lama.
 */
export async function POST(request: Request) {
  const resolved = await requireMemberEvent(request);
  if (resolved.response) return resolved.response;
  const sesi = await getMemberSession(resolved.event);
  if (!sesi) return memberError("UNAUTHORIZED", 401, "Masuk dulu ke area peserta.");
  await markAnnouncementsSeen(sesi.accountId);
  return Response.json({ ok: true });
}
