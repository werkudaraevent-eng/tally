import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { hasInvalidLeaf, isTrulyEmpty, matchesConditions, normalizeConditions, type ParticipantPoolRow } from "@/lib/undian";
import { groupSchema } from "../route";

// Pratinjau aturan pengecualian: siapa saja yang akan tersaring.
//
// Ini bagian terpenting dari fitur aturan. Aturan yang salah tulis — "perusahaan
// sama dengan PRIMA" padahal datanya "PT PRIMA Indonesia" — tampak sepenuhnya
// wajar di layar dan baru terbukti keliru ketika nama yang seharusnya tersingkir
// keluar sebagai pemenang di atas panggung. Pada saat itu tidak ada yang bisa
// dilakukan.
//
// Karena itu daftar namanya ditampilkan, bukan hanya jumlahnya. Angka "0 peserta
// terkena" masih bisa diabaikan sebagai kebetulan; daftar kosong di sebelah kolom
// yang baru saja diketik jauh lebih sulit dilewatkan.
//
// Memakai POST meski ini pembacaan, sama seperti /api/admin/undian/preview:
// pohon syarat adalah struktur bersarang yang tidak nyaman disandikan ke query
// string, dan handler ini TIDAK MENULIS APA PUN — tidak ke tabel, tidak ke
// audit_logs. Larangan "jangan membaca lewat POST" di repo ini ada karena efek
// sampingnya, bukan karena metodenya.

const bodySchema = z.object({
  conditions: groupSchema,
  /** Batas nama yang dikembalikan. Jumlahnya tetap dihitung penuh. */
  limit: z.number().int().min(1).max(200).default(50),
});

export async function POST(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { data, error } = await getSupabaseServiceClient().rpc("undian_participant_pool" as never);
  if (error) return apiError("INTERNAL_ERROR", 500);

  const rows = (data ?? []) as ParticipantPoolRow[];
  const conditions = normalizeConditions(parsed.data.conditions);

  // Pohon yang benar-benar kosong dilaporkan sebagai nol, BUKAN sebagai semua
  // orang: pohon kosong bernilai benar, dan pada aturan pengecualian benar berarti
  // tersingkir. Menampilkan 249 di sini akan membuat panitia mengira aturannya
  // bekerja sangat luas, padahal artinya aturannya belum jadi.
  //
  // Syarat yang RUSAK ditangani berbeda: normalizeConditions menggantinya dengan
  // penanda yang selalu salah, jadi ia terhitung sebagai nol cocok secara alami
  // dan tetap dilaporkan lewat `has_invalid` supaya layar dapat menjelaskan
  // mengapa hasilnya nol.
  if (isTrulyEmpty(conditions)) {
    return Response.json({ total_participants: rows.length, matched: 0, incomplete: true, has_invalid: false, sample: [] });
  }

  const matched = rows.filter((row) => matchesConditions(row, conditions));

  return Response.json({
    total_participants: rows.length,
    matched: matched.length,
    incomplete: false,
    has_invalid: hasInvalidLeaf(conditions),
    sample: matched.slice(0, parsed.data.limit).map((row) => ({
      participant_id: row.participant_id,
      name: row.name,
      company: row.company,
      title: row.title,
      participant_type: row.participant_type,
      seat_label: row.seat_label,
    })),
  });
}
