import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import type { InviteFilter, InviteStatus } from "@/lib/pesan/label";
import { allInvitations, invitationSendingReady, invitationSettings, invitationStatus, sendStates, undanganBelumAda } from "@/lib/undangan/data";
import { inviteSecretReady } from "@/lib/undangan/tanda";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Daftar tamu undangan untuk tab Tamu undangan di Pendaftaran.
 *
 * Seluruh daftar dikirim sekaligus (batas impor 5.000 per berkas): saringan,
 * centang, dan hitungan per saringan dikerjakan di layar tanpa bolak-balik.
 * Tautan pribadi TIDAK ikut di sini; hanya dibuat saat panitia menekan Salin.
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const setelan = await invitationSettings(event.id);
  const kirim = invitationSendingReady();
  const dasar = {
    settings: { access: setelan.access, auto_approve: setelan.autoApprove },
    link_ready: inviteSecretReady(),
    sending: kirim.ok ? { ready: true, missing: [] } : { ready: false, missing: kirim.missing },
  };
  if (!setelan.ready) return Response.json({ ready: false, items: [], counts: null, ...dasar });

  let undangan, keadaan;
  try {
    [undangan, keadaan] = await Promise.all([allInvitations(event.id), sendStates(event.id)]);
  } catch (error) {
    if (undanganBelumAda(error as { code?: string; message?: string })) return Response.json({ ready: false, items: [], counts: null, ...dasar });
    return apiError("INTERNAL_ERROR", 500);
  }

  // Status pendaftaran untuk "Lihat pendaftaran →": tab mana yang dibuka.
  const statusDaftar = new Map<string, string>();
  const idsDaftar = undangan.map((u) => u.registration_id).filter((id): id is string => Boolean(id));
  for (let i = 0; i < idsDaftar.length; i += 300) {
    const { data } = await getSupabaseServiceClient().from("event_registrations").select("id,status").in("id", idsDaftar.slice(i, i + 300));
    for (const r of (data ?? []) as { id: string; status: string }[]) statusDaftar.set(r.id, r.status);
  }

  const items = undangan.map((inv) => {
    const status: InviteStatus = invitationStatus(inv, keadaan.get(inv.id));
    return {
      id: inv.id,
      name: inv.name,
      email: inv.email,
      company: inv.company,
      title: inv.title,
      phone: inv.phone,
      status,
      failed_reason: status === "gagal" ? keadaan.get(inv.id)?.lastFailed?.reason ?? null : null,
      opted_out: Boolean(inv.opted_out_at),
      email_invalid: Boolean(inv.email_invalid_at),
      registration_id: inv.registration_id,
      registration_status: inv.registration_id ? statusDaftar.get(inv.registration_id) ?? null : null,
      is_test: inv.is_test,
      created_at: inv.created_at,
    };
  });
  const counts: Record<InviteFilter, number> = {
    semua: items.length,
    belum_dikirim: items.filter((i) => i.status === "belum_dikirim").length,
    belum_daftar: items.filter((i) => i.status === "terkirim" || i.status === "membuka").length,
    sudah_daftar: items.filter((i) => i.status === "sudah_daftar").length,
    gagal: items.filter((i) => i.status === "gagal").length,
  };
  return Response.json({ ready: true, items, counts, ...dasar });
}
