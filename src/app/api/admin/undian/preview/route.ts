import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  matchesConditions,
  normalizeConditions,
  ticketsFor,
  type ParticipantPoolRow,
  type WeightConfig,
} from "@/lib/undian";
import { activeRulesFor } from "@/lib/undian-pool";

// Pratinjau kolam: berapa peserta yang lolos syarat, dan bagaimana tiket terbagi.
//
// Dipakai halaman CMS sambil syarat diedit, sehingga panitia tahu kolamnya berisi
// 41 orang SEBELUM acara, bukan menemukannya saat tombol undi ditolak di depan
// penonton.
//
// Memakai POST meski ini pembacaan, dan itu perkecualian yang disengaja:
//
//   * Pohon syarat adalah struktur bersarang. Menyandikannya ke query string
//     berarti membuat format serialisasi kedua yang harus dijaga tetap sepadan
//     dengan yang dipakai di tempat lain.
//   * Handler ini TIDAK MENULIS APA PUN — tidak ke tabel, tidak ke audit_logs.
//     Larangan "jangan membaca lewat POST" di repo ini ada karena satu handler
//     dulu menulis updated_at dan satu baris audit pada setiap pemanggilan, lalu
//     menenggelamkan riwayat hari acara. Tanpa efek samping, alasan itu tidak
//     berlaku.

const TEXT_VARS = ["name", "company", "job_title", "qr_code", "seat_label"] as const;
const TEXT_CMPS = ["eq", "neq", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty"] as const;

const leafSchema = z.union([
  z.object({
    var: z.enum(["total_spend", "booth_count", "scan_count"]),
    cmp: z.enum(["gte", "gt", "lte", "lt", "eq"]),
    value: z.number().min(0).max(1_000_000_000),
  }),
  z.object({
    var: z.enum(["participant_type", "rsvp_status"]),
    cmp: z.enum(["in", "not_in"]),
    values: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
  }),
  z.object({ var: z.enum(["checked_in", "has_seat"]), is: z.boolean() }),
  // Di sini teks kosong TIDAK ditolak, berbeda dengan endpoint penyimpanan.
  // Pratinjau dipanggil pada setiap ketikan, termasuk saat kolomnya masih kosong
  // karena baru saja ditambahkan; menolaknya membuat angka pratinjau berkedip
  // menjadi galat di tengah pengetikan. normalizeConditions() yang menjatuhkan
  // daun setengah jadi itu, sehingga hasilnya tetap benar.
  z.object({ var: z.enum(TEXT_VARS), cmp: z.enum(TEXT_CMPS), text: z.string().trim().max(200) }),
]);

type ConditionInput = z.infer<typeof leafSchema> | { op: "and" | "or"; children: ConditionInput[] };

const nodeSchema: z.ZodType<ConditionInput> = z.lazy(() =>
  z.union([leafSchema, z.object({ op: z.enum(["and", "or"]), children: z.array(nodeSchema).max(20) })]),
);

const bodySchema = z.object({
  conditions: z.object({ op: z.enum(["and", "or"]), children: z.array(nodeSchema).max(20) }),
  weight_mode: z.enum(["equal", "formula"]).default("equal"),
  weight_var: z.enum(["total_spend", "booth_count", "scan_count"]).default("total_spend"),
  weight_divisor: z.number().min(1).max(1_000_000_000).default(500000),
  weight_base: z.number().int().min(0).max(100).default(1),
  weight_max: z.number().int().min(1).max(1000).default(10),
});

const bodySchemaWithPrize = bodySchema.extend({
  /** Hadiah yang sedang diedit, untuk memilih aturan pengecualian yang berlaku. */
  prize_id: z.number().int().positive().nullable().optional(),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = bodySchemaWithPrize.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const eventId = auth.scope.event.id;
  const [poolResult, rules] = await Promise.all([
    getSupabaseServiceClient().rpc("undian_participant_pool" as never, { p_event_id: eventId } as never),
    activeRulesFor(eventId, parsed.data.prize_id ?? null),
  ]);
  if (poolResult.error) return apiError("INTERNAL_ERROR", 500);

  const rows = (poolResult.data ?? []) as ParticipantPoolRow[];
  const conditions = normalizeConditions(parsed.data.conditions);
  const weight: WeightConfig = parsed.data;

  const eligible = rows.filter((row) => matchesConditions(row, conditions));

  // Urutan penyaringnya IDENTIK dengan buildPool(): aturan, lalu manual, lalu
  // sudah menang. Kalau berbeda, angka pratinjau dan kolam yang benar-benar diundi
  // akan menyimpang — tepat kesalahan yang ingin dicegah dengan menempatkan
  // evaluator di TypeScript alih-alih di dalam SQL.
  const byRules: ParticipantPoolRow[] = [];
  const byManual: ParticipantPoolRow[] = [];
  const byWins: ParticipantPoolRow[] = [];
  const available: ParticipantPoolRow[] = [];
  const ruleHits = new Map<number, number>();

  for (const row of eligible) {
    const hit = rules.find((rule) => matchesConditions(row, rule.conditions));
    if (hit) { byRules.push(row); ruleHits.set(hit.id, (ruleHits.get(hit.id) ?? 0) + 1); continue; }
    if (row.manually_excluded) { byManual.push(row); continue; }
    if (row.already_won > 0) { byWins.push(row); continue; }
    available.push(row);
  }

  // Tiket dihitung dari yang BENAR-BENAR akan diundi, bukan dari semua yang
  // memenuhi syarat. Menghitung dari `eligible` akan melaporkan peluang yang lebih
  // kecil daripada kenyataannya, karena sebagian tiketnya milik orang yang sudah
  // tersingkir dan tidak pernah ikut diundi.
  const tickets = available.map((row) => ticketsFor(row, weight));
  const totalTickets = tickets.reduce((sum, value) => sum + value, 0);

  // Peluang menang tertinggi dilaporkan sebagai persen. Ini angka yang paling
  // berguna saat menyetel bobot: "maksimal 10 tiket" terdengar wajar sampai
  // terlihat bahwa artinya satu orang memegang 34% peluang.
  const topShare = totalTickets > 0 ? Math.max(...tickets, 0) / totalTickets : 0;

  return Response.json({
    total_participants: rows.length,
    eligible: eligible.length,
    available: available.length,
    total_tickets: totalTickets,
    max_tickets: tickets.length > 0 ? Math.max(...tickets) : 0,
    top_share: topShare,
    // Rincian penyusutan kolam. Satu angka akhir tidak dapat diperiksa siapa pun;
    // selisih yang terurai bisa.
    breakdown: {
      total: rows.length,
      failed_conditions: rows.length - eligible.length,
      by_rules: byRules.length,
      by_manual: byManual.length,
      by_previous_wins: byWins.length,
      rule_hits: rules
        .filter((rule) => (ruleHits.get(rule.id) ?? 0) > 0)
        .map((rule) => ({ rule_id: rule.id, rule_name: rule.name, count: ruleHits.get(rule.id) ?? 0 })),
    },
    // Contoh nama, supaya panitia dapat memeriksa bahwa syaratnya menyaring orang
    // yang mereka maksud. Sepuluh baris cukup untuk itu dan tidak membocorkan
    // seluruh daftar peserta ke jaringan pada setiap ketikan.
    sample: available.slice(0, 10).map((row) => ({
      name: row.name,
      company: row.company,
      checked_in: row.checked_in,
      total_spend: row.total_spend,
      tickets: ticketsFor(row, weight),
    })),
    // Nilai yang benar-benar ada di data, untuk mengisi pilihan di rule builder.
    participant_types: distinct(rows.map((row) => row.participant_type)),
    rsvp_statuses: distinct(rows.map((row) => row.rsvp_status)),
    companies: distinct(rows.map((row) => row.company)),
  });
}

function distinct(values: (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))].sort();
}
