import { z } from "zod";
import { getMemberSession } from "@/lib/member/account";
import { memberError, requireMemberEvent } from "@/lib/member/api";
import { loadCheckpointPeserta, loadDaftarCheckpoint, scanMandiriPerSesi } from "@/lib/checkpoint/server";
import { kodeSah, rahasiaKodeQr } from "@/lib/checkpoint/kode-qr";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Peserta memindai QR checkpoint (scan mandiri, migrasi 202610180001).
 *
 * `{ s, k, lang }`: sesi dan kode dari QR yang ditampilkan panitia. Kodenya
 * diperiksa di sini (berganti tiap 30 detik, lihat lib/checkpoint/kode-qr.ts),
 * semua aturan datanya di RPC `record_checkpoint_self_scan`.
 *
 * Jawaban `recorded` atau `already` membawa langkah yang selesai dan kemajuan
 * peserta, dalam bahasa halamannya, supaya ponsel bisa langsung menulis
 * "Foto bersama selesai · +5 poin · 3 dari 4".
 */

const bodySchema = z.object({
  s: z.number().int().positive(),
  k: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/),
  lang: z.enum(["id", "en"]).optional(),
});

const PESAN = {
  id: {
    masuk: "Masuk dulu ke halaman pesertamu, lalu pindai lagi QR-nya.",
    bukanPeserta: "Akunmu belum terhubung ke data peserta. Tunjukkan QR-mu ke panitia.",
    kedaluwarsa: "QR ini sudah berganti. Pindai langsung dari layar panitia, bukan dari foto.",
    mati: "Checkpoint ini dipindai oleh panitia. Tunjukkan QR-mu ke panitia.",
    tutup: "Checkpoint ini sedang ditutup. Tanyakan ke panitia.",
    tidakAda: "QR ini bukan untuk acara ini.",
    selesai: "Acara ini sudah selesai, jadi checkpoint tidak bisa dicatat lagi.",
    gagal: "Belum tercatat. Coba pindai lagi.",
  },
  en: {
    masuk: "Sign in to your participant page first, then scan the QR again.",
    bukanPeserta: "Your account is not linked to a participant yet. Show your QR to the organisers.",
    kedaluwarsa: "This QR has already changed. Scan it straight from the organisers' screen, not from a photo.",
    mati: "The organisers scan this checkpoint. Show your QR to them.",
    tutup: "This checkpoint is closed right now. Ask the organisers.",
    tidakAda: "This QR is not for this event.",
    selesai: "This event has ended, so checkpoints can no longer be recorded.",
    gagal: "Not recorded yet. Try scanning again.",
  },
} as const;

/**
 * Hanya halaman acara ini sendiri yang boleh mengirim scan. SameSite=Lax tetap
 * mengirim cookie dari subdomain lain di domain yang sama; peramban modern
 * memberi Sec-Fetch-Site, peramban lama dicocokkan lewat Origin.
 */
function dariHalamanSendiri(request: Request) {
  const situs = request.headers.get("sec-fetch-site");
  if (situs) return situs === "same-origin";
  const asal = request.headers.get("origin");
  if (!asal) return true;
  try {
    return new URL(asal).host === (request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!dariHalamanSendiri(request)) return memberError("FORBIDDEN", 403, PESAN.id.tidakAda);
  const resolved = await requireMemberEvent(request);
  if (resolved.response) return resolved.response;
  const event = resolved.event;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  const lang = (body as { lang?: unknown } | null)?.lang === "en" ? "en" : "id";
  const t = PESAN[lang];
  if (!parsed.success) return memberError("NOT_A_CHECKPOINT", 422, t.tidakAda);
  // Sama dengan scan panitia (isWriteBlocked): acara yang sudah selesai tidak
  // menerima catatan baru. Acara draft tetap boleh, untuk uji coba.
  if (event.status === "completed") return memberError("EVENT_NOT_WRITABLE", 409, t.selesai);

  const sesi = await getMemberSession(event);
  if (!sesi) return memberError("UNAUTHORIZED", 401, t.masuk);
  if (!sesi.participant) return memberError("NOT_A_PARTICIPANT", 403, t.bukanPeserta);

  if (!kodeSah(rahasiaKodeQr(), event.id, parsed.data.s, parsed.data.k, Date.now())) {
    return memberError("CODE_EXPIRED", 410, t.kedaluwarsa);
  }

  // Satu checkpoint Staff di sesi ini membuat sesinya dipindai panitia saja
  // (lihat scanMandiriPerSesi); RPC hanya memeriksa ada checkpoint mandiri.
  const daftar = await loadDaftarCheckpoint(event.id);
  if (daftar && !scanMandiriPerSesi(daftar).has(parsed.data.s)) return memberError("SELF_SCAN_OFF", 403, t.mati);

  const { data, error } = await getSupabaseServiceClient().rpc("record_checkpoint_self_scan" as never, {
    p_event_id: event.id,
    p_session_id: parsed.data.s,
    p_participant_id: sesi.participant.id,
  } as never);
  if (error) {
    const pesan = String(error.message ?? "");
    if (pesan.includes("SESSION_CLOSED")) return memberError("SESSION_CLOSED", 422, t.tutup);
    if (pesan.includes("SELF_SCAN_OFF")) return memberError("SELF_SCAN_OFF", 403, t.mati);
    if (pesan.includes("SESSION_NOT_FOUND")) return memberError("NOT_A_CHECKPOINT", 404, t.tidakAda);
    if (pesan.includes("PARTICIPANT_NOT_FOUND")) return memberError("NOT_A_PARTICIPANT", 403, t.bukanPeserta);
    return memberError("INTERNAL_ERROR", 500, t.gagal);
  }

  const hasil = data as { status: "recorded" | "already"; first_scan_at: string };
  // Kemajuan sesudah catatan ini. Gagal dibaca: catatannya tetap tersimpan,
  // ponsel cukup menyegarkan kartunya.
  const kartu = await loadCheckpointPeserta(event.id, sesi.participant.id, lang).catch(() => null);
  const langkah = kartu?.steps.filter((step) => step.session_id === parsed.data.s) ?? [];
  return Response.json({
    status: hasil.status,
    done_at: hasil.first_scan_at,
    steps: langkah.map((step) => ({ id: step.id, title: step.title, points: step.points })),
    done: kartu?.done ?? null,
    total: kartu?.steps.length ?? null,
    points: kartu?.points ? { earned: kartu.earned, total: kartu.total_points } : null,
  });
}
