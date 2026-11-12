import QRCode from "qrcode";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { jawabGagal } from "@/lib/auth/jawab";
import { bacaPending, bersihkanPercobaan, gerbangPercobaan, kunciPercobaan, masukkan, pasangPending, revokeUserSessions } from "@/lib/auth/login";
import { buatKodeCadangan, bukaRahasia, hashKodeCadangan, hashSandi, periksaSandi, SANDI_MAX, sandikanRahasia } from "@/lib/auth/kredensial";
import { alamatOtpauth, buatRahasia, cocokkanKode } from "@/lib/auth/totp";
import { ipKlien } from "@/lib/ip-klien";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Setup wajib untuk admin/super admin yang belum punya kata sandi +
 * authenticator. Hanya dengan cookie `tally_pending` tahap "setup".
 *
 * GET  : rahasia authenticator baru (QR + teks untuk diketik). Rahasianya
 *        disimpan tersandi di cookie pending, BUKAN di database, sampai kodenya
 *        terbukti cocok.
 * POST : { password, code } -> simpan kata sandi, authenticator, 10 kode
 *        cadangan; balas kode cadangan sekali ini saja; buat sesi.
 */

const AKHIR = { error: { code: "SIGN_IN_EXPIRED", message: "This set-up timed out. Sign in again with your username and PIN." } };

async function akunSetup() {
  const pending = await bacaPending();
  if (!pending || pending.t !== "setup") return null;
  const { data } = await getSupabaseServiceClient().from("users").select("id,username,role,is_active").eq("id", pending.u).eq("is_active", true).maybeSingle();
  return data ? { pending, user: data as { id: string; username: string; role: string } } : null;
}

export async function GET() {
  const akun = await akunSetup();
  if (!akun) return Response.json(AKHIR, { status: 401 });
  // Rahasia yang sama dipakai ulang selama cookie masih hidup: muat ulang
  // halaman tidak boleh membuat QR yang sudah dipindai jadi basi.
  let rahasia = bukaRahasia(akun.pending.s);
  if (!rahasia) {
    rahasia = buatRahasia();
    await pasangPending({ u: akun.pending.u, t: "setup", ingat: akun.pending.ingat, s: sandikanRahasia(rahasia) });
  }
  const url = alamatOtpauth(rahasia, akun.user.username);
  const qr = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 192 });
  return Response.json(
    { username: akun.user.username, secret: rahasia.replace(/(.{4})/g, "$1 ").trim(), qr_svg: qr },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const schema = z.object({ password: z.string().max(SANDI_MAX), code: z.string().trim().max(12) });

export async function POST(request: Request) {
  const akun = await akunSetup();
  if (!akun) return Response.json(AKHIR, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422);

  const galatSandi = periksaSandi(parsed.data.password, akun.user.username);
  if (galatSandi) return Response.json({ error: { code: "VALIDATION_ERROR", message: galatSandi, details: { password: galatSandi } } }, { status: 422 });

  const kunci = kunciPercobaan(akun.user.username, ipKlien(request.headers), "2fa:");
  const tertahan = await gerbangPercobaan(kunci);
  if (tertahan?.status === "rate_limited") return jawabGagal(tertahan, "");

  const rahasia = bukaRahasia(akun.pending.s);
  const langkah = rahasia ? cocokkanKode(rahasia, parsed.data.code) : null;
  if (!rahasia || langkah === null) {
    return Response.json({ error: { code: "VALIDATION_ERROR", message: "That code didn't match. Check the app shows Tally for this account and enter the current code.", details: { code: "That code didn't match." } } }, { status: 422 });
  }

  const kodeCadangan = buatKodeCadangan();
  const { error } = await getSupabaseServiceClient().from("users").update({
    password_hash: await hashSandi(parsed.data.password),
    totp_secret: sandikanRahasia(rahasia),
    totp_enabled_at: new Date().toISOString(),
    totp_last_step: langkah,
    recovery_codes: kodeCadangan.map(hashKodeCadangan),
  } as never).eq("id", akun.user.id);
  if (error) return apiError("INTERNAL_ERROR", 500);

  await getSupabaseServiceClient().from("audit_logs").insert({ user_id: akun.user.id, action: "staff_two_step_enabled", payload: {} } as never);
  await bersihkanPercobaan(kunci);
  // Kredensial berganti: sesi lama akun ini (bila ada) ikut berakhir.
  await revokeUserSessions(akun.user.id);
  await masukkan(akun.user.id, akun.pending.ingat);
  return Response.json({ recovery_codes: kodeCadangan });
}
