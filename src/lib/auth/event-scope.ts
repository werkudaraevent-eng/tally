import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth/guards";
import type { CurrentUser, UserRole } from "@/lib/auth/roles";
import type { EventRow } from "@/lib/domain";

/**
 * Resolusi event untuk route handler.
 *
 * Event SELALU diturunkan dari slug di URL lalu diverifikasi terhadap hak akses
 * user di server. Sengaja TIDAK diambil dari body permintaan, header, cookie,
 * atau storage browser: siapa pun bisa mengirim event_id mana pun, dan operator
 * booth event A akan bisa menulis order ke event B tanpa satu pun galat. Order
 * itu tetap tersimpan, ikut terhitung di leaderboard event yang salah, dan tidak
 * ada tanda apa pun bahwa terjadi kekeliruan.
 *
 * Aturan akses:
 * - super_admin  -> semua event, tanpa perlu baris di user_event_access.
 * - peran lain    -> wajib punya baris di user_event_access untuk event tersebut.
 *
 * Peran yang dipakai untuk pemeriksaan izin adalah peran DI EVENT INI
 * (user_event_access.role), bukan users.role, karena satu orang bisa admin di
 * satu event dan kasir di event lain.
 */

export type EventScope = {
  event: EventRow;
  /** Peran efektif user di event ini. */
  role: UserRole;
  /** Booth yang dipegang user di event ini, null untuk peran non-booth. */
  boothId: number | null;
};

type ResolveOk = { scope: EventScope; user: CurrentUser; response: null };
type ResolveErr = { scope: null; user: null; response: Response };

const EVENT_COLUMNS =
  "id,slug,name,description,event_date,status,participant_source,scanner_api_event_slug,registration_enabled,registration_form_config,time_zone,created_at,updated_at,archived_at";

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * Ambil event dari slug tanpa memeriksa siapa pun. Untuk halaman publik
 * (/display, /denah, /rundown, /undian) yang memang tidak butuh login.
 */
export async function getEventBySlugPublic(slug: string): Promise<EventRow | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  // Kegagalan baca dilaporkan sebagai "tidak ada", bukan dilempar: halaman
  // publik yang error 500 di tengah acara lebih buruk daripada yang menampilkan
  // pesan "event tidak ditemukan" dan bisa dimuat ulang.
  if (error) {
    console.error("getEventBySlugPublic gagal:", error);
    return null;
  }
  return (data as EventRow | null) ?? null;
}

/**
 * Daftar event aktif. Dipakai jalur publik TANPA slug untuk memutuskan apakah
 * link lama masih boleh dilayani (tepat satu event aktif) atau pengguna harus
 * memilih dulu (lebih dari satu).
 */
export async function listActiveEvents(): Promise<EventRow[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("listActiveEvents gagal:", error);
    return [];
  }
  return (data as EventRow[] | null) ?? [];
}

/**
 * Resolusi + otorisasi event untuk route handler yang butuh login.
 *
 * @param slug  slug event dari URL.
 * @param roles peran yang diizinkan. Dicek terhadap peran user DI EVENT INI.
 */
export async function requireEventScope(
  slug: string | undefined,
  roles?: UserRole[],
): Promise<ResolveOk | ResolveErr> {
  const auth = await requireUser();
  if (auth.response) return { scope: null, user: null, response: auth.response };
  const user = auth.user;

  if (!slug) {
    return {
      scope: null,
      user: null,
      response: errorResponse("EVENT_REQUIRED", "Event belum dipilih.", 400),
    };
  }

  const supabase = getSupabaseServiceClient();
  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (eventError) {
    console.error("requireEventScope gagal membaca event:", eventError);
    return {
      scope: null,
      user: null,
      response: errorResponse("INTERNAL_ERROR", "Gagal memuat event.", 500),
    };
  }

  if (!eventRow) {
    return {
      scope: null,
      user: null,
      response: errorResponse("EVENT_NOT_FOUND", "Event tidak ditemukan.", 404),
    };
  }

  const event = eventRow as EventRow;

  // super_admin melewati tabel akses. Kalau ia harus didaftarkan manual, event
  // yang baru dibuat tidak bisa dibuka oleh pembuatnya sendiri.
  let effectiveRole: UserRole = user.role;
  let boothId: number | null = user.booth_id ?? null;

  if (user.role !== "super_admin") {
    const { data: access, error: accessError } = await supabase
      .from("user_event_access")
      .select("role,booth_id")
      .eq("user_id", user.id)
      .eq("event_id", event.id)
      .maybeSingle();

    if (accessError) {
      console.error("requireEventScope gagal membaca hak akses:", accessError);
      // Gagal baca hak akses TIDAK boleh fail-open. Berbeda dari pembatas login
      // (yang fail-open agar panitia tidak terkunci), di sini fail-open berarti
      // memberi akses ke event yang bukan miliknya.
      return {
        scope: null,
        user: null,
        response: errorResponse("INTERNAL_ERROR", "Gagal memeriksa hak akses.", 500),
      };
    }

    if (!access) {
      // Pesan sama dengan "tidak berhak", bukan "event tidak ada": membedakan
      // keduanya memberi tahu orang luar event mana yang ada di sistem.
      return {
        scope: null,
        user: null,
        response: errorResponse("FORBIDDEN", "Anda tidak punya akses ke event ini.", 403),
      };
    }

    const row = access as { role: UserRole; booth_id: number | null };
    effectiveRole = row.role;
    boothId = row.booth_id;
  }

  if (roles) {
    const satisfied =
      roles.includes(effectiveRole) ||
      (effectiveRole === "super_admin" && roles.includes("admin"));
    if (!satisfied) {
      return {
        scope: null,
        user: null,
        response: errorResponse("FORBIDDEN", "Anda tidak punya izin untuk aksi ini.", 403),
      };
    }
  }

  // Event arsip hanya boleh dibaca. Menulis ke event yang sudah diarsipkan
  // mengubah laporan yang sudah diserahkan ke klien.
  return { scope: { event, role: effectiveRole, boothId }, user, response: null };
}

/**
 * Penjaga terpisah untuk aksi yang MENULIS. Event yang sudah selesai atau
 * diarsipkan tetap boleh dibuka dan diekspor, tetapi tidak boleh menerima
 * transaksi baru -- laporannya sudah diserahkan.
 */
export function ensureEventWritable(event: EventRow): Response | null {
  if (event.status === "archived" || event.status === "completed") {
    return errorResponse(
      "EVENT_NOT_WRITABLE",
      `Event ini berstatus ${event.status === "archived" ? "arsip" : "selesai"} dan tidak menerima perubahan data.`,
      409,
    );
  }
  return null;
}
