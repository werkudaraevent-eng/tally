import QRCode from "qrcode";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { sendEmail } from "@/lib/email/client";
import { bahanKonfirmasi } from "@/lib/email/konfirmasi/konteks";
import { renderKonfirmasi } from "@/lib/email/konfirmasi/render";
import { templatSchema } from "@/lib/email/konfirmasi/templat";
import { nilaiKolom } from "@/lib/email/registration-code";
import { allowedByList, normalizeAddress } from "@/lib/pesan/alamat";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { linkOrigin } from "@/lib/domain-klien/asal";

/**
 * "Kirim tes…" email konfirmasi: satu email ke alamat yang DIKETIK panitia,
 * memakai templat di layar (boleh belum disimpan). Subjek berawalan [TES], QR
 * dan tautannya contoh. Tidak ada baris pendaftaran yang disentuh. Di luar
 * produksi alamatnya harus ada di MESSAGING_ALLOWLIST, seperti Kiriman.
 */

const schema = z.object({
  email: z.string().trim().email().max(200),
  state: z.enum(["approved", "pending", "rejected"]),
  templat: templatSchema,
  sebagai: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const alamat = normalizeAddress(parsed.data.email);
  if (!alamat) return apiError("VALIDATION_ERROR", 422);
  if (!allowedByList(alamat)) return apiError("MESSAGE_TEST_NOT_ALLOWED", 403);

  const event = auth.scope.event;
  const origin = await linkOrigin(request, event.id);
  const bahan = await bahanKonfirmasi(event.id, origin);
  if (!bahan) return apiError("FORBIDDEN", 403);

  let contoh = { name: "Budi Santoso", company: null as string | null };
  if (parsed.data.sebagai) {
    const { data } = await getSupabaseServiceClient()
      .from("event_registrations")
      .select("name,company")
      .eq("id", parsed.data.sebagai)
      .eq("event_id", event.id)
      .maybeSingle();
    if (data) contoh = data as typeof contoh;
  }

  const kode = "CONTOH-0000";
  const qr = (await QRCode.toBuffer(kode, { errorCorrectionLevel: "H", margin: 4, width: 480 })).toString("base64");
  const email = renderKonfirmasi(parsed.data.templat, {
    ...bahan.dasar,
    state: parsed.data.state,
    values: nilaiKolom(bahan.dasar.eventName, bahan.dasar.detail.tanggal, contoh.name, contoh.company),
    qr: parsed.data.state === "approved" ? { code: kode, src: "cid:kode-peserta-qr" } : null,
    codeUrl: parsed.data.state === "approved" ? `${origin}/e/${encodeURIComponent(event.slug)}` : null,
    akunUrl: bahan.memberOn ? `${origin}/e/${encodeURIComponent(event.slug)}` : null,
    test: true,
  });
  const hasil = await sendEmail({
    eventId: event.id,
    to: alamat,
    ...email,
    attachments: parsed.data.state === "approved" ? [{ filename: `kode-peserta-${kode}.png`, content: qr, content_id: "kode-peserta-qr" }] : [],
  });
  if (!hasil.ok) return hasil.error === "EMAIL_NOT_CONFIGURED" ? apiError("EMAIL_NOT_CONFIGURED", 503) : apiError("EMAIL_SEND_FAILED", 502, { error: hasil.error });
  // Ukuran HTML ikut dilaporkan: Gmail memotong email di atas 102 KB.
  return Response.json({ ok: true, to: alamat, html_kb: Math.round(new TextEncoder().encode(email.html).length / 102.4) / 10 });
}
