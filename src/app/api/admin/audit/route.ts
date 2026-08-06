import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Kategori aksi. participant_sync dipisah sendiri karena cron menambah ~4 baris
// per jam: kalau dicampur, perubahan konfigurasi yang justru ingin diaudit akan
// tenggelam. Karena itu default-nya TIDAK menyertakan sync.
const CATEGORY_ACTIONS: Record<string, string[]> = {
  settings: [
    "settings_update", "display_settings_update", "display_background_upload",
    // Reveal bertahap. `next`/`prev` sengaja TIDAK dicatat: keduanya bisa ditekan
    // puluhan kali dalam satu ceremony dan akan menenggelamkan riwayat hari itu,
    // sementara tahap akhirnya tetap terlihat dari baris start/reset berikutnya.
    "leaderboard_reveal_config", "leaderboard_reveal_start", "leaderboard_reveal_reset",
    // Pengecualian top spender. Justru aksi yang paling perlu tercatat di
    // kategori ini: ia menentukan siapa TIDAK BERHAK menang, dan pertanyaannya
    // ("kenapa perusahaan kami tidak muncul") baru datang setelah acara selesai.
    "leaderboard_exclusion_create", "leaderboard_exclusion_update", "leaderboard_exclusion_delete",
  ],
  offers: ["special_offer_create", "special_offer_update", "special_offer_delete"],
  booths: ["booth_create", "booth_update"],
  payment_methods: ["payment_method_create", "payment_method_update", "payment_method_delete"],
  // Rundown menulis audit sejak dibuat, tapi aksinya belum terdaftar di sini
  // sehingga tidak pernah muncul di filter mana pun — tercatat di database, tidak
  // terlihat oleh siapa pun.
  rundown: [
    "rundown_header_update",
    "rundown_section_create", "rundown_section_update", "rundown_section_delete",
    "rundown_item_create", "rundown_item_update", "rundown_item_delete",
  ],
  // Undian. `undian_draw` sengaja dicatat meski frekuensinya lumayan: berbeda
  // dengan tombol next/prev reveal yang hanya mengganti tampilan, setiap undi
  // menghasilkan pemenang yang membawa pulang barang. Itu justru catatan yang
  // paling dicari bila kelak ada yang mempersoalkan hasilnya.
  undian: [
    "undian_settings_update",
    "undian_prize_create", "undian_prize_update", "undian_prize_delete",
    "undian_draw", "undian_winner_confirm", "undian_winner_reject",
    "undian_mode_change", "undian_reset",
    // Undi ulang membatalkan beberapa pemenang sekaligus, jadi justru paling
    // perlu tercatat. Mode latihan dicatat karena ia menjawab "kenapa undian
    // hadiah ini muncul enam kali tapi pemenangnya cuma satu rombongan".
    "undian_redraw", "undian_rehearsal_on", "undian_rehearsal_off",
    "undian_entry_import", "undian_entry_group_delete",
    "undian_exclusion_add", "undian_exclusion_remove",
    "undian_rule_create", "undian_rule_update", "undian_rule_delete",
    "undian_session_start", "undian_session_close", "undian_session_delete",
    "undian_session_adopt",
  ],
  users: ["user_create", "user_update"],
  danger: ["admin_reset_records"],
  orders: ["create", "pay", "void", "hand_over", "booth_order_created", "participant_scan", "admin_order_void"],
  sync: ["participant_sync", "participant_qr_archived"],
};

// Semua kategori kecuali sync & orders. Ini yang dimaksud "siapa mengganti
// settingan": perubahan konfigurasi oleh manusia, bukan lalu lintas transaksi.
const CONFIG_ACTIONS = [
  ...CATEGORY_ACTIONS.settings,
  ...CATEGORY_ACTIONS.offers,
  ...CATEGORY_ACTIONS.booths,
  ...CATEGORY_ACTIONS.payment_methods,
  ...CATEGORY_ACTIONS.rundown,
  ...CATEGORY_ACTIONS.undian,
  ...CATEGORY_ACTIONS.users,
  ...CATEGORY_ACTIONS.danger,
];

const querySchema = z.object({
  category: z.enum(["config", "settings", "offers", "booths", "payment_methods", "rundown", "undian", "users", "danger", "orders", "sync", "all"]).default("config"),
  actor: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request) {
  // super_admin saja: log ini merekam tindakan klien. Kalau klien dapat
  // membacanya, catatan itu kehilangan nilainya sebagai bukti netral saat ada
  // perselisihan siapa mengubah apa.
  const auth = await requireUser(["super_admin"]);
  if (auth.response) return auth.response;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  let query = client
    .from("audit_logs")
    .select("id,action,payload,created_at,user_id,order_id", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(parsed.data.offset, parsed.data.offset + parsed.data.limit - 1);

  if (parsed.data.category === "config") query = query.in("action", CONFIG_ACTIONS);
  else if (parsed.data.category !== "all") query = query.in("action", CATEGORY_ACTIONS[parsed.data.category] ?? []);

  if (parsed.data.actor) query = query.eq("user_id", parsed.data.actor);
  if (parsed.data.from) query = query.gte("created_at", parsed.data.from);
  if (parsed.data.to) query = query.lte("created_at", parsed.data.to);

  const [result, users] = await Promise.all([
    query,
    client.from("users").select("id,username,role"),
  ]);
  if (result.error) return apiError("INTERNAL_ERROR", 500);

  // Nama pelaku digabung di aplikasi, bukan lewat join PostgREST: audit_logs.user_id
  // TIDAK punya foreign key ke users, jadi embed relasi tidak tersedia. Jumlah user
  // hanya belasan sehingga map di memori jauh lebih murah daripada query per baris.
  const userMap = new Map((users.data ?? []).map((user) => [(user as { id: string }).id, user as { id: string; username: string; role: string }]));

  return Response.json({
    total: result.count ?? 0,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
    entries: (result.data ?? []).map((row) => {
      const entry = row as { id: number; action: string; payload: unknown; created_at: string; user_id: string | null; order_id: string | null };
      const actor = entry.user_id ? userMap.get(entry.user_id) : null;
      return {
        ...entry,
        // null user_id berarti dijalankan sistem (cron sync, auto-void), bukan
        // pelaku yang tidak diketahui. Dibedakan agar tidak terbaca mencurigakan.
        actor_username: actor?.username ?? (entry.user_id ? "(user terhapus)" : "Sistem"),
        actor_role: actor?.role ?? null,
      };
    }),
    actors: (users.data ?? []).map((user) => user as { id: string; username: string; role: string }),
  });
}
