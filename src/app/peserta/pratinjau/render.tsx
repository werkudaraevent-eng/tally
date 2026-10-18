import { DashboardGathering } from "@/components/member/dashboard-gathering";
import { DashboardModern } from "@/components/member/dashboard-modern";
import type { EventLandingConfig, EventRow, LandingMemberConfig } from "@/lib/domain";
import { landingDefaultLang } from "@/lib/landing-i18n";
import type { MemberSession } from "@/lib/member/account";
import { loadMemberAnnouncements } from "@/lib/member/pengumuman";

/**
 * Beranda halaman peserta untuk pratinjau Participant area, dengan setelan
 * `member` yang diberikan (tersimpan atau draf). Hanya Modern dan Gathering
 * yang punya Participant home; tata letak lain mengembalikan null.
 *
 * Pengumuman dibaca saja: pratinjau tidak menandai apa pun terbaca.
 * `tab` "profil" (Gathering saja): Menu, tempat kartu darurat (E-03).
 */
export async function renderBerandaPratinjau(event: EventRow, member: LandingMemberConfig, sesi: MemberSession, tab: "beranda" | "profil" = "beranda") {
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  if (landing.layout !== "modern") return null;
  const lang = landingDefaultLang(landing);
  // Area peserta yang masih tertutup tetap bisa dipratinjau sebelum dibuka.
  const setelan = { ...member, enabled: true };
  const pengumuman = await loadMemberAnnouncements(event.id, sesi);
  return landing.gathering === true ? (
    <DashboardGathering event={event} lang={lang} member={setelan} sesi={sesi} pengumuman={pengumuman} konfirmasi={null} tab={tab} hari={null} pratinjau />
  ) : (
    <DashboardModern event={event} lang={lang} member={setelan} sesi={sesi} pengumuman={pengumuman} konfirmasi={null} pratinjau />
  );
}
