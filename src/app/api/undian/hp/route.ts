import { getPublicRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { gelombangTerbit, jadwalPublik, type CahayaJadwal } from "@/lib/undian-cahaya";

// Cahaya HP: keadaan undian untuk HP peserta. PUBLIK dan sengaja dapat di-cache.
//
// Sampai 500 HP di wifi venue membaca ini bersamaan. Klien memanggilnya dengan
// `?b=<ember>&w=<lebar ms>` yang dihitung dari JAM SERVER, jadi semua HP pada
// ember yang sama meminta URL yang sama dan CDN menjawab dari satu respons.
// Respons yang dihitung SEBELUM embernya mulai tidak boleh di-cache (no-store):
// isinya bisa belum memuat kunci gelombang yang terbit di awal ember itu.
//
// Isinya tidak menyebut siapa pun: hadiah, fase, jadwal gelombang (waktu dan
// jumlah sisa), dan kunci gelombang yang WAKTUNYA SUDAH LEWAT. Hasil tiap
// peserta yang terkunci diambil sendiri-sendiri lewat /api/peserta/undian-hp.
// `?jam=1` hanya mengembalikan jam server, tanpa cache, untuk menyetel selisih
// jam HP.

export const dynamic = "force-dynamic";

type Pending = { cahaya?: { jadwal: CahayaJadwal; keys: string[] } } | null;

function json(body: unknown, cacheable: boolean) {
  return Response.json(body, {
    headers: cacheable
      ? { "Cache-Control": "public, max-age=0, s-maxage=60", "CDN-Cache-Control": "public, s-maxage=60" }
      : { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("jam") === "1") return json({ now: Date.now() }, false);

  const width = Number(url.searchParams.get("w"));
  const bucket = Number(url.searchParams.get("b"));
  const bucketed = Number.isSafeInteger(bucket) && [500, 2000, 10000].includes(width);

  const event = await getPublicRequestEvent(request);
  if (!event) return json({ now: Date.now(), live: false }, false);
  const client = getSupabaseServiceClient();
  const [stateResult, settingsResult] = await Promise.all([
    client.from("undian_state").select("mode,rehearsal,active_prize_id,phase,draw_round,spin_started_at,reveal_at,pending").eq("event_id", event.id).maybeSingle(),
    client.from("undian_settings").select("show_pool_size,accent_color").eq("event_id", event.id).maybeSingle(),
  ]);
  const now = Date.now();
  const cacheable = bucketed && now >= bucket * width;
  const state = stateResult.data as {
    mode: string; rehearsal: boolean; active_prize_id: number | null; phase: string; draw_round: number;
    spin_started_at: string | null; reveal_at: string | null; pending: Pending;
  } | null;
  if (stateResult.error) return json({ now, live: false }, false);
  if (!state || state.mode !== "live") return json({ now, live: false }, cacheable);
  // Panggung sudah Live: HP berpindah ke ember 2 detik walau hadiah Cahaya belum dipilih.
  if (!state.active_prize_id) return json({ now, live: false, armed: true }, cacheable);

  const { data: prizeRow } = await client
    .from("undian_prizes")
    .select("id,name,image_url,sponsor_name,animation")
    .eq("event_id", event.id)
    .eq("id", state.active_prize_id)
    .maybeSingle();
  const prize = prizeRow as { id: number; name: string; image_url: string | null; sponsor_name: string | null; animation: string } | null;
  if (!prize || prize.animation !== "cahaya") return json({ now, live: false, armed: true }, cacheable);

  const settings = (settingsResult.data ?? {}) as { show_pool_size?: boolean; accent_color?: string | null };
  const revealAt = state.reveal_at ? new Date(state.reveal_at).getTime() : null;
  const phase = state.phase === "spinning" && revealAt !== null && revealAt <= now ? "revealed" : state.phase;
  const cahaya = state.phase !== "idle" ? state.pending?.cahaya ?? null : null;
  const released = cahaya ? gelombangTerbit(cahaya.jadwal.waves, now, revealAt) : 0;

  return json({
    now,
    live: true,
    rehearsal: state.rehearsal,
    phase,
    // Penanda undian ini: HP mengambil hasilnya yang terkunci sekali per undian.
    draw: cahaya ? `${prize.id}-${state.draw_round}-${cahaya.jadwal.start}` : null,
    prize: { name: prize.name, image_url: prize.image_url, sponsor_name: prize.sponsor_name },
    accent: settings.accent_color ?? null,
    started_at: state.spin_started_at,
    reveal_at: state.reveal_at,
    jadwal: cahaya ? jadwalPublik(cahaya.jadwal, settings.show_pool_size !== false) : null,
    show_count: settings.show_pool_size !== false,
    keys: cahaya ? cahaya.keys.slice(0, released) : [],
  }, cacheable);
}
