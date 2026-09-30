import { getPublicRequestEvent } from "@/lib/auth/request-event";
import { logoutMember } from "@/lib/member/account";

/**
 * Keluar dari area peserta. Dipanggil dari <form method="post">, jadi tetap
 * bekerja tanpa JavaScript, dan membalas dengan pengalihan ke halaman acara.
 */
export async function POST(request: Request) {
  await logoutMember();
  const event = await getPublicRequestEvent(request);
  const tujuan = event ? `/e/${event.slug}` : "/";
  return Response.redirect(new URL(tujuan, request.url), 303);
}
