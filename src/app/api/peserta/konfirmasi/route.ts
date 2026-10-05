import { getPublicRequestEvent } from "@/lib/auth/request-event";
import { getMemberSession, memberConfig } from "@/lib/member/account";
import { confirmEmail, resendConfirmationLink } from "@/lib/member/links";
import { memberError, requireMemberEvent } from "@/lib/member/api";
import { linkOrigin } from "@/lib/domain-klien/asal";
import type { EventLandingConfig } from "@/lib/domain";
import { landingDefaultLang, landingEnAvailable, landingPath, type LandingLang } from "@/lib/landing-i18n";

/**
 * Tautan "Konfirmasi email" dari email pendaftaran. GET karena dibuka dari
 * klien email; hasilnya hanya menandai email terbukti, tidak memberi sesi.
 * Selalu berakhir di area peserta, dengan tanda berhasil atau tidak.
 */
export async function GET(request: Request) {
  const event = await getPublicRequestEvent(request);
  // Origin permintaan, BUKAN linkOrigin: cookie sesi hanya berlaku di host
  // tempat tautan dibuka, jadi pengalihan harus tetap di host yang sama.
  const asal = new URL(request.url).origin;
  if (!event || !memberConfig(event)) return Response.redirect(new URL("/", asal), 303);
  const kueri = new URL(request.url).searchParams;
  const token = kueri.get("token") ?? "";
  const ok = await confirmEmail(event, token);
  // Email English menambah `bahasa=en` (confirmationUrlIn): mendarat di
  // dashboard English bila versi English acara menyala.
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const bahasa = kueri.get("bahasa");
  const lang: LandingLang = (bahasa === "en" || bahasa === "id") && landingEnAvailable(landing) ? bahasa : landingDefaultLang(landing);
  const dashboard = `${landingPath(encodeURIComponent(event.slug), lang, landingDefaultLang(landing))}/peserta`;
  return Response.redirect(new URL(`${dashboard}?konfirmasi=${ok ? "ok" : "gagal"}`, asal), 303);
}

/** "Kirim ulang" dari pita area peserta. Hanya untuk pemilik akun yang sedang masuk. */
export async function POST(request: Request) {
  const resolved = await requireMemberEvent(request);
  if (resolved.response) return resolved.response;
  const sesi = await getMemberSession(resolved.event);
  if (!sesi) return memberError("UNAUTHORIZED", 401, "Masuk dulu ke area peserta.");
  if (sesi.emailVerified) return Response.json({ ok: true });
  const hasil = await resendConfirmationLink(resolved.event, {
    accountId: sesi.accountId,
    email: sesi.email,
    name: sesi.name,
    requestUrl: await linkOrigin(request, resolved.event.id),
  });
  switch (hasil.status) {
    case "sent":
      return Response.json({ ok: true });
    case "rate_limited":
      return memberError("RATE_LIMITED", 429, "Tautan sudah dikirim beberapa kali. Periksa folder spam, atau coba lagi dalam 15 menit.");
    case "not_configured":
      return memberError("EMAIL_NOT_CONFIGURED", 503, "Pengiriman email belum aktif untuk acara ini.");
    default:
      return memberError("EMAIL_FAILED", 502, "Email belum terkirim. Coba lagi sebentar lagi.");
  }
}
