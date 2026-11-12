import { z } from "zod";
import { apiError } from "@/lib/api";
import { jawabGagal } from "@/lib/auth/jawab";
import { bacaPending, bersihkanPercobaan, gerbangPercobaan, kunciPercobaan, masukkan } from "@/lib/auth/login";
import { bukaRahasia, hashKodeCadangan } from "@/lib/auth/kredensial";
import { cocokkanKode } from "@/lib/auth/totp";
import { ipKlien } from "@/lib/ip-klien";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Langkah kedua masuk admin: kode 6 digit dari authenticator, atau satu kode
 * cadangan. Hanya berlaku dengan cookie `tally_pending` tahap "totp" dari
 * langkah pertama (10 menit).
 */
const schema = z.union([
  z.object({ code: z.string().trim().max(12) }),
  z.object({ recovery_code: z.string().trim().max(20) }),
]);

type Baris = { id: string; username: string; is_active: boolean; totp_secret: string | null; totp_enabled_at: string | null; totp_last_step: number | null };

export async function POST(request: Request) {
  const pending = await bacaPending();
  if (!pending || pending.t !== "totp") {
    return Response.json({ error: { code: "SIGN_IN_EXPIRED", message: "This sign-in timed out. Start again with your username and password." } }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data: user } = await client.from("users").select("*").eq("id", pending.u).eq("is_active", true).maybeSingle() as { data: Baris | null };
  if (!user || !user.totp_enabled_at) return apiError("UNAUTHENTICATED", 401);

  // Penghitung sendiri untuk kode (awalan "2fa:"), per akun + IP: kata sandi
  // yang benar tidak membuka tebakan kode tanpa batas.
  const kunci = kunciPercobaan(user.username, ipKlien(request.headers), "2fa:");
  const tertahan = await gerbangPercobaan(kunci);
  if (tertahan?.status === "rate_limited") return jawabGagal(tertahan, "");

  if ("code" in parsed.data) {
    const rahasia = bukaRahasia(user.totp_secret);
    const langkah = rahasia ? cocokkanKode(rahasia, parsed.data.code, { langkahTerakhir: user.totp_last_step }) : null;
    if (langkah === null) return jawabGagal({ status: "invalid" }, "That code didn't work. Enter the current 6-digit code from your authenticator app.");
    // Kode yang sudah dipakai tidak boleh dipakai lagi (ASVS 2.8.4). Atomik di
    // database: dua permintaan paralel dengan kode yang sama, hanya satu lolos.
    const { data: menang, error } = await client.rpc("staff_pakai_langkah_totp" as never, { p_user: user.id, p_langkah: langkah } as never);
    if (error) return apiError("INTERNAL_ERROR", 500);
    if (menang !== true) return jawabGagal({ status: "invalid" }, "That code was already used. Wait for the next code.");
  } else {
    // Atomik di database: kode yang sama dipakai bersamaan, hanya satu lolos.
    const { data: sisa, error } = await client.rpc("staff_pakai_kode_cadangan" as never, { p_user: user.id, p_hash: hashKodeCadangan(parsed.data.recovery_code) } as never);
    if (error) return apiError("INTERNAL_ERROR", 500);
    if (typeof sisa !== "number") return jawabGagal({ status: "invalid" }, "That recovery code didn't work, or it was already used.");
    await client.from("audit_logs").insert({ user_id: user.id, action: "staff_recovery_code_used", payload: { left: sisa } } as never);
  }

  await bersihkanPercobaan(kunci);
  await masukkan(user.id, pending.ingat);
  return Response.json({ ok: true });
}
