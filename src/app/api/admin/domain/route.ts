import { z } from "zod";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { emailConfig, senderAddress } from "@/lib/email/client";
import { normalizeDomain } from "@/lib/domain-klien/normalisasi";
import { checkAndStore, forgetDomainMap, readDomain, type DomainRow } from "@/lib/domain-klien/simpan";
import { domainReadiness, productionSiteOrigin, tallyHosts } from "@/lib/domain-klien/situs";
import { vercelDomains } from "@/lib/domain-klien/vercel";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Domain klien satu acara (Pengaturan > Acara > Alamat halaman acara).
 *
 * Semua aksi berjalan LANGSUNG, tidak lewat "Simpan perubahan": yang terlibat
 * adalah DNS milik pihak luar, jadi statusnya harus terlihat seketika.
 *
 * Hanya admin acara (dan pemilik sistem). Token Vercel tidak pernah keluar dari
 * server, galat mentah Vercel tidak diteruskan, dan setiap perubahan tercatat
 * di audit_logs.
 */

const DUA_HARI_MS = 48 * 60 * 60 * 1000;

function gagal(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

const PESAN_BELUM_SIAP = "Domain klien belum bisa dipakai di server ini. Hubungi pengelola Tally.";

/** Tampilan untuk layar: status, record, dan fase yang langsung dipetakan ke kartu. */
function tampilan(row: DomainRow) {
  const [problem, target] = (row.problem ?? "").split(":");
  const lama = row.status === "menunggu" && Date.now() - new Date(row.created_at).getTime() > DUA_HARI_MS;
  return {
    domain: row.domain,
    status: row.status,
    records: row.records ?? [],
    problem: problem || null,
    target: target || null,
    stale: lama,
    created_at: row.created_at,
    status_since: row.status_since,
    last_checked_at: row.last_checked_at,
  };
}

async function dasar(event: { slug: string; time_zone: string }) {
  const asal = productionSiteOrigin();
  const email = emailConfig();
  return {
    tally_url: asal ? `${asal}/e/${encodeURIComponent(event.slug)}` : `/e/${encodeURIComponent(event.slug)}`,
    sender: email ? senderAddress(email.from) : null,
    time_zone: event.time_zone,
  };
}

async function catat(eventId: string, userId: string, action: string, payload: Record<string, unknown>) {
  await getSupabaseServiceClient().from("audit_logs").insert({ event_id: eventId, user_id: userId, action, payload } as never);
}

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const kesiapan = domainReadiness();
  const { row, missing } = await readDomain(event.id);
  return Response.json({
    ready: kesiapan.ready && !missing,
    domain: row ? tampilan(row) : null,
    ...(await dasar(event)),
  });
}

const tambahSchema = z.object({ domain: z.string().max(300) });

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  // Kunci keras (temuan QA M2): tanpa TALLY_SITE_URL, domain klien bisa
  // menggeser asal semua kiriman. Diperiksa di server, bukan hanya di tombol.
  const kesiapan = domainReadiness();
  if (!kesiapan.ready) return gagal("DOMAIN_NOT_READY", PESAN_BELUM_SIAP, 409);
  const parsed = tambahSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return gagal("DOMAIN_INVALID", "Tulis domainnya saja, misalnya event.namaklien.com.", 422);
  const hasil = normalizeDomain(parsed.data.domain, tallyHosts());
  if (!hasil.ok) return gagal(hasil.code, hasil.message, 422);

  const { row: ada, missing } = await readDomain(event.id);
  if (missing) return gagal("DOMAIN_NOT_READY", PESAN_BELUM_SIAP, 409);
  if (ada) return gagal("DOMAIN_EXISTS", "Acara ini sudah punya domain. Batalkan atau hapus dulu domain yang lama.", 409);

  const client = getSupabaseServiceClient();
  const { data: dipakai } = await client.from("event_domains").select("event_id").eq("domain", hasil.domain).maybeSingle();
  if (dipakai) return gagal("DOMAIN_TAKEN", "Domain ini sudah dipakai acara lain di Tally. Pakai subdomain lain.", 409);

  const tambah = await vercelDomains.add(kesiapan, hasil.domain);
  if (!tambah.ok) {
    if (tambah.code === "taken") return gagal("DOMAIN_TAKEN_ELSEWHERE", "Domain ini sedang dipakai situs lain di Vercel. Minta pemiliknya melepasnya, atau pakai subdomain lain.", 409);
    if (tambah.code === "invalid") return gagal("DOMAIN_INVALID", "Vercel menolak nama domain ini. Periksa ejaannya.", 422);
    return gagal("DOMAIN_SERVICE_ERROR", "Domain belum bisa didaftarkan sekarang. Coba lagi beberapa saat lagi.", 502);
  }

  const { data: baru, error } = await client
    .from("event_domains")
    .insert({ event_id: event.id, domain: hasil.domain, status: "menunggu", created_by: auth.user.id } as never)
    .select("*")
    .single();
  if (error || !baru) {
    // Barisnya gagal, jadi domain di Vercel jangan sampai yatim.
    await vercelDomains.remove(kesiapan, hasil.domain);
    return gagal(error?.code === "23505" ? "DOMAIN_TAKEN" : "INTERNAL_ERROR", error?.code === "23505" ? "Domain ini sudah dipakai acara lain di Tally." : "Domain gagal disimpan. Coba lagi.", error?.code === "23505" ? 409 : 500);
  }
  await catat(event.id, auth.user.id, "domain_add", { domain: hasil.domain, apex: hasil.apex });
  forgetDomainMap();
  const diperiksa = await checkAndStore(kesiapan, baru as DomainRow, auth.user.id);
  return Response.json({ ready: true, domain: tampilan(diperiksa), ...(await dasar(event)) }, { status: 201 });
}

const aksiSchema = z.object({ aksi: z.enum(["periksa", "lepas", "hubungkan_lagi"]) });

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const kesiapan = domainReadiness();
  if (!kesiapan.ready) return gagal("DOMAIN_NOT_READY", PESAN_BELUM_SIAP, 409);
  const parsed = aksiSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return gagal("VALIDATION_ERROR", "Aksi tidak dikenali.", 422);
  const { row } = await readDomain(event.id);
  if (!row) return gagal("DOMAIN_NOT_FOUND", "Acara ini belum punya domain.", 404);
  const client = getSupabaseServiceClient();
  let hasil = row;

  if (parsed.data.aksi === "periksa") {
    if (row.status === "dilepas") return gagal("DOMAIN_RELEASED", "Domain ini sudah dilepas. Hubungkan lagi dulu.", 409);
    // Tombol yang ditekan berulang tidak memanggil Vercel berulang.
    const baru = row.last_checked_at && Date.now() - new Date(row.last_checked_at).getTime() < 10_000;
    hasil = baru ? row : await checkAndStore(kesiapan, row, auth.user.id);
  } else if (parsed.data.aksi === "lepas") {
    if (row.status !== "aktif" && row.status !== "bermasalah") return gagal("DOMAIN_NOT_ACTIVE", "Hanya domain aktif yang bisa dilepas.", 409);
    const sekarang = new Date().toISOString();
    const { data } = await client.from("event_domains").update({ status: "dilepas", released_at: sekarang, status_since: sekarang, fail_count: 0 } as never).eq("event_id", event.id).select("*").single();
    hasil = data as unknown as DomainRow;
    await catat(event.id, auth.user.id, "domain_release", { domain: row.domain, from: row.status });
    forgetDomainMap();
  } else {
    if (row.status !== "dilepas") return gagal("DOMAIN_NOT_RELEASED", "Domain ini masih terhubung.", 409);
    const sekarang = new Date().toISOString();
    const { data } = await client.from("event_domains").update({ status: "menunggu", released_at: null, status_since: sekarang, fail_count: 0, created_at: sekarang } as never).eq("event_id", event.id).select("*").single();
    await catat(event.id, auth.user.id, "domain_reconnect", { domain: row.domain });
    forgetDomainMap();
    hasil = await checkAndStore(kesiapan, data as unknown as DomainRow, auth.user.id);
  }
  return Response.json({ ready: true, domain: tampilan(hasil), ...(await dasar(event)) });
}

export async function DELETE(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const kesiapan = domainReadiness();
  if (!kesiapan.ready) return gagal("DOMAIN_NOT_READY", PESAN_BELUM_SIAP, 409);
  const { row } = await readDomain(event.id);
  if (!row) return gagal("DOMAIN_NOT_FOUND", "Acara ini belum punya domain.", 404);
  // Domain aktif harus dilepas dulu: melepas menjaga tautan lama tetap
  // diarahkan, menghapus langsung mematikannya.
  if (row.status === "aktif" || row.status === "bermasalah") return gagal("DOMAIN_ACTIVE", "Lepas domain ini dulu sebelum menghapusnya.", 409);

  const client = getSupabaseServiceClient();
  // Temuan QA N2: kiriman yang masih antre dengan tautan ke domain ini akan
  // berisi tautan mati bila domainnya dihapus sekarang.
  const { count } = await client
    .from("message_blasts")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id)
    .eq("link_origin", `https://${row.domain}`)
    .in("status", ["terjadwal", "mengirim"]);
  if ((count ?? 0) > 0) return gagal("DOMAIN_IN_USE", "Masih ada Pesan peserta yang sedang dikirim atau terjadwal dengan tautan ke domain ini. Tunggu selesai atau batalkan kirimannya dulu.", 409);

  const hapus = await vercelDomains.remove(kesiapan, row.domain);
  if (!hapus.ok && hapus.code !== "not_found") return gagal("DOMAIN_SERVICE_ERROR", "Domain belum bisa dihapus sekarang. Coba lagi beberapa saat lagi.", 502);
  await client.from("event_domains").delete().eq("event_id", event.id).eq("domain", row.domain);
  await catat(event.id, auth.user.id, row.status === "dilepas" ? "domain_delete" : "domain_cancel", { domain: row.domain });
  forgetDomainMap();
  return Response.json({ ready: true, domain: null, ...(await dasar(event)) });
}
