import { z } from "zod";
import type { EventLandingConfig } from "@/lib/domain";
import { publicEventName } from "@/lib/domain";
import { landingDefaultLang } from "@/lib/landing-i18n";
import { linkOrigin } from "@/lib/domain-klien/asal";
import { getMemberSession } from "@/lib/member/account";
import { pushMasihBerlaku } from "@/lib/member/nav";
import { memberError, requireMemberEvent } from "@/lib/member/api";
import { kirimPush } from "@/lib/push/kirim";
import { buatPesan } from "@/lib/push/pesan";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Notifikasi uji ke perangkat peserta sendiri, dikirim tepat setelah peserta
 * mengaktifkan notifikasi: bukti langsung bahwa notifikasinya sampai (pola
 * Slack dan Google Calendar). Juga dari tombol "Kirim notifikasi uji".
 * Paling sering sekali per 20 detik per akun.
 */
export async function POST(request: Request) {
  const resolved = await requireMemberEvent(request);
  if (resolved.response) return resolved.response;
  if (resolved.member.push?.enabled !== true || !pushMasihBerlaku(resolved.event)) return memberError("PUSH_OFF", 404, "Notifikasi belum dibuka untuk acara ini.");
  const sesi = await getMemberSession(resolved.event);
  if (!sesi) return memberError("UNAUTHORIZED", 401, "Masuk dulu ke Dashboard saya.");
  const isi = z.object({ endpoint: z.string().max(1000), portal: z.string().max(300), lang: z.enum(["id", "en"]).optional() }).safeParse(await request.json().catch(() => null));
  if (!isi.success) return memberError("INVALID", 400, "Data notifikasi tidak lengkap.");

  // Alamat yang dibuka saat notifikasi diketuk: hanya portal acara ini.
  const slug = encodeURIComponent(resolved.event.slug);
  const pola = new RegExp(`^/e/${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/en|/id)?/peserta(\\?[^#]*)?$`);
  if (!pola.test(isi.data.portal)) return memberError("INVALID", 400, "Alamat portal tidak dikenal.");
  // Service worker membuka path ini di origin-nya sendiri bila berbeda (domain klien).
  const asal = await linkOrigin(request, resolved.event.id);

  const client = getSupabaseServiceClient();
  const { data } = await client
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth,last_sent_at")
    .eq("account_id", sesi.accountId)
    .eq("endpoint", isi.data.endpoint)
    .maybeSingle();
  const baris = data as { id: string; endpoint: string; p256dh: string; auth: string; last_sent_at: string | null } | null;
  if (!baris) return memberError("PUSH_NOT_FOUND", 404, "Notifikasi di perangkat ini belum aktif.");
  if (baris.last_sent_at && Date.now() - new Date(baris.last_sent_at).getTime() < 20_000) {
    return memberError("RATE_LIMITED", 429, "Tunggu sebentar sebelum mengirim lagi.");
  }

  const landing = (resolved.event.landing_config ?? {}) as EventLandingConfig;
  const lang = isi.data.lang ?? landingDefaultLang(landing);
  const nama = publicEventName(resolved.event);
  const pesan = buatPesan({
    judul: lang === "en" ? "Notifications are on" : "Notifikasi sudah aktif",
    isi: lang === "en" ? `You'll get updates from the ${nama} organisers here.` : `Kabar dari panitia ${nama} akan muncul seperti ini.`,
    buka: `${asal}${isi.data.portal}`,
    lang,
    tag: "uji",
  });
  const hasil = await kirimPush([baris], pesan, { ttlDetik: 10 * 60 });
  if (!hasil.terkirim) return memberError("PUSH_SEND_FAILED", 502, "Notifikasi uji belum terkirim. Coba lagi.");
  return Response.json({ ok: true });
}
