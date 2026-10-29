import { z } from "zod";
import { getMemberSession } from "@/lib/member/account";
import { memberError, requireMemberEvent } from "@/lib/member/api";
import { loadCheckpointPeserta, loadDaftarCheckpoint, scanMandiriPerSesi } from "@/lib/checkpoint/server";
import { kodeSah, rahasiaKodeQr } from "@/lib/checkpoint/kode-qr";
import { kalimatTujuan } from "@/lib/checkpoint/tujuan";
import { tanggalDiZona, teksSelesai, teksWaktu } from "@/lib/checkpoint/waktu";
import { normalizeTimeZone } from "@/lib/timezone";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Peserta memindai QR checkpoint (scan mandiri, migrasi 202610180001).
 *
 * `{ s, k, lang }`: sesi dan kode dari QR yang ditampilkan panitia. Kodenya
 * diperiksa di sini (berganti tiap 30 detik, lihat lib/checkpoint/kode-qr.ts),
 * semua aturan datanya di RPC `record_checkpoint_self_scan`.
 *
 * Jawaban `recorded` atau `already` membawa langkah yang selesai dan kemajuan
 * peserta, dalam bahasa halamannya, supaya layar hasil di ponsel bisa langsung
 * menulis "Foto bersama · +5 poin · 3 dari 4", jam tercatatnya, langkah
 * berikutnya, pesan panitia untuk checkpoint ini (Message after scan), dan
 * kalimat tujuan poin bila scan inilah yang membuat poinnya cukup.
 */

const bodySchema = z.object({
  s: z.number().int().positive(),
  k: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/),
  lang: z.enum(["id", "en"]).optional(),
});

const PESAN = {
  id: {
    masuk: "Masuk dulu ke Dashboard saya, lalu pindai lagi QR-nya.",
    bukanPeserta: "Akunmu belum terhubung ke data peserta. Tunjukkan QR-mu ke panitia.",
    kedaluwarsa: "QR ini sudah berganti. Pindai langsung dari layar panitia, bukan dari foto.",
    mati: "Checkpoint ini dipindai oleh panitia. Tunjukkan QR-mu ke panitia.",
    tutup: "Checkpoint ini sedang ditutup. Tanyakan ke panitia.",
    tidakAda: "QR ini bukan untuk acara ini.",
    selesai: "Acara ini sudah selesai, jadi checkpoint tidak bisa dicatat lagi.",
    gagal: "Belum tercatat. Coba pindai lagi.",
  },
  en: {
    masuk: "Sign in to My dashboard first, then scan the QR again.",
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
  const member = resolved.member;
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
  // Daftar gagal dibaca: jangan mencatat tanpa pemeriksaan itu.
  const daftar = await loadDaftarCheckpoint(event.id);
  if (!daftar) return memberError("INTERNAL_ERROR", 503, t.gagal);
  if (!scanMandiriPerSesi(daftar).has(parsed.data.s)) return memberError("SELF_SCAN_OFF", 403, t.mati);

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
  // ponsel cukup menyegarkan kartunya. Penontonnya sama dengan Beranda, jadi
  // tanggal langkah berikutnya hanya dari baris Agenda yang boleh ia lihat.
  const penonton = { acara: event, participantId: sesi.participant.id, tampilKamar: member.show_logistics === true };
  const kartu = await loadCheckpointPeserta(event.id, sesi.participant.id, lang, penonton).catch(() => null);
  const langkah = kartu?.steps.filter((step) => step.session_id === parsed.data.s) ?? [];
  const zona = normalizeTimeZone(event.time_zone);
  const hariIni = tanggalDiZona(new Date(), zona);
  const berikut = kartu?.steps.find((step) => !step.done_at) ?? null;
  // Tujuan poin yang baru tercapai karena scan ini, bukan yang sudah tercapai sebelumnya.
  const ditambah = langkah.reduce((jumlah, step) => jumlah + (step.points ?? 0), 0);
  const tercapai =
    hasil.status === "recorded" && kartu?.goal && kartu.goal.sisa <= 0 && kartu.goal_target !== null && kartu.earned - ditambah < kartu.goal_target
      ? kalimatTujuan(kartu.goal)
      : null;
  const pesan = [
    ...new Set(
      daftar
        .filter((cp) => cp.session_id === parsed.data.s && cp.completion !== "staff")
        .map((cp) => (lang === "en" ? cp.scan_message_en ?? cp.scan_message : cp.scan_message))
        .filter((teks): teks is string => Boolean(teks)),
    ),
  ];
  return Response.json({
    status: hasil.status,
    done_at: hasil.first_scan_at,
    done_at_text: waktuTercatat(hasil.first_scan_at, zona, hariIni, lang),
    steps: langkah.map((step) => ({ id: step.id, title: step.title, points: step.points })),
    done: kartu?.done ?? null,
    total: kartu?.steps.length ?? null,
    points: kartu?.points ? { earned: kartu.earned, total: kartu.total_points } : null,
    next: berikut
      ? { title: berikut.title, place: berikut.place, when: berikut.when ? teksWaktu(berikut.when, hariIni, lang, true).teks : null }
      : null,
    goal_reached: tercapai,
    message: pesan.length > 0 ? pesan.join("\n") : null,
  });
}

/** "Hari ini · 16.09", atau "Kam, 29 Okt · 16.09" untuk hari lain, di zona acara. */
function waktuTercatat(iso: string, zona: ReturnType<typeof normalizeTimeZone>, hariIni: string, lang: "id" | "en") {
  const teks = teksSelesai(iso, zona, hariIni, lang);
  return tanggalDiZona(new Date(iso), zona) === hariIni ? `${lang === "en" ? "Today" : "Hari ini"} · ${teks}` : teks;
}
