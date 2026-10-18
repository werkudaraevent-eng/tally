import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { berlakuSampai, jendela, kodeCheckpoint, PERIODE_DETIK, rahasiaKodeQr } from "@/lib/checkpoint/kode-qr";
import { alamatQrCheckpoint } from "@/lib/checkpoint/qr-alamat";
import { loadDaftarCheckpoint, loadSetelanCheckpoint, scanMandiriPerSesi } from "@/lib/checkpoint/server";
import { linkOrigin } from "@/lib/domain-klien/asal";
import { landingDefaultLang } from "@/lib/landing-i18n";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * QR checkpoint yang ditampilkan panitia (Show QR di /scan dan layar di lokasi).
 *
 * GET ?session_id= : alamat QR jendela 30 detik ini, kapan berganti, judul
 * checkpoint-nya, berapa peserta sudah selesai di sesi itu, dan tiga peserta
 * terakhir yang memindainya sendiri. Ponsel menanyakannya tiap beberapa detik.
 *
 * Hanya akun panitia acara ini (pemindai atau admin): siapa pun yang bisa
 * meminta kode ini bisa menyelesaikan checkpoint dari mana saja. Alamatnya
 * memakai asal halaman peserta (domain klien bila aktif), supaya kamera bawaan
 * ponsel membuka halaman tempat peserta sudah masuk.
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const sesiId = Number(new URL(request.url).searchParams.get("session_id"));
  if (!Number.isSafeInteger(sesiId) || sesiId <= 0) return apiError("VALIDATION_ERROR", 422);

  const [setelan, daftar] = await Promise.all([loadSetelanCheckpoint(event.id), loadDaftarCheckpoint(event.id)]);
  const mode = setelan?.enabled && daftar ? scanMandiriPerSesi(daftar).get(sesiId) ?? null : null;
  if (!mode || !daftar) {
    return apiError("VALIDATION_ERROR", 404, { message: "Participants can't scan this session themselves. Turn it on in Check-in > Checkpoints." });
  }

  const db = getSupabaseServiceClient();
  const [sesi, jumlah, terakhir] = await Promise.all([
    db.from("attendance_sessions").select("id,is_active").eq("event_id", event.id).eq("id", sesiId).maybeSingle(),
    db.from("attendance_scans").select("id", { count: "exact", head: true }).eq("event_id", event.id).eq("session_id", sesiId).eq("is_duplicate", false),
    db
      .from("attendance_scans")
      .select("scanned_at,participants(name)")
      .eq("event_id", event.id)
      .eq("session_id", sesiId)
      .eq("method", "self")
      .order("scanned_at", { ascending: false })
      .limit(3),
  ]);
  const barisSesi = sesi.data as { id: number; is_active: boolean } | null;
  if (sesi.error || !barisSesi) return apiError("VALIDATION_ERROR", 404, { message: "Check-in point not found in this event." });

  const sekarang = Date.now();
  const kode = kodeCheckpoint(rahasiaKodeQr(), event.id, sesiId, jendela(sekarang));
  const checkpoint = daftar.filter((cp) => cp.session_id === sesiId);
  return Response.json({
    event: { name: event.name, lang: landingDefaultLang(event.landing_config) },
    url: alamatQrCheckpoint(await linkOrigin(request, event.id), event.slug, sesiId, kode),
    mode,
    open: barisSesi.is_active,
    period: PERIODE_DETIK,
    now: sekarang,
    changes_at: berlakuSampai(sekarang),
    checkpoints: checkpoint.map((cp) => ({ id: cp.id, title: cp.title, title_en: cp.title_en, position: daftar.indexOf(cp) + 1 })),
    total_checkpoints: daftar.length,
    done: jumlah.error ? null : jumlah.count ?? 0,
    // Sebelum migrasi 202610180001 kolom `method` belum ada: daftarnya kosong.
    recent: terakhir.error
      ? []
      : ((terakhir.data ?? []) as { scanned_at: string; participants: { name: string } | null }[]).map((baris) => ({
          name: baris.participants?.name ?? "",
          at: baris.scanned_at,
        })),
  });
}
