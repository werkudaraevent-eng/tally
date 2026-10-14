import { z } from "zod";
import { BONUS_LIST_MAX, BONUS_RULES_MAX, BONUS_TICKETS_MAX } from "@/lib/undian";

/**
 * Skema aturan tiket tambahan, dipakai route simpan hadiah dan pratinjau.
 *
 * Pohon syaratnya diterima dari pemanggil karena tiap route punya skema daun
 * sendiri: route simpan menolak teks kosong, pratinjau tidak (lihat komentar
 * di /api/admin/undian/preview).
 *
 * `requireConditions`: aturan "Peserta yang memenuhi syarat" tanpa satu pun
 * syarat ditolak saat disimpan. Pohon kosong bernilai benar, dan aturan yang
 * memberi semua orang tiket tambahan sama dengan tidak ada aturan, tetapi
 * tampil di layar seolah-olah bekerja.
 */
export function bonusRulesSchema(group: z.ZodType<{ op: "and" | "or"; children: unknown[] }>, requireConditions: boolean) {
  const name = z.string().trim().min(1, "Isi nama aturan.").max(80);
  const tickets = z.number().int().min(1).max(BONUS_TICKETS_MAX);
  return z.array(z.discriminatedUnion("source", [
    z.object({
      name, tickets, source: z.literal("list"),
      participant_ids: z.array(z.string().uuid()).min(requireConditions ? 1 : 0, "Daftar ini belum berisi peserta.").max(BONUS_LIST_MAX),
      file_name: z.string().trim().max(200).nullable(),
      uploaded_at: z.string().max(40).nullable(),
    }),
    z.object({
      name, tickets, source: z.literal("conditions"),
      conditions: requireConditions
        ? group.refine((value) => value.children.length > 0, "Tambahkan minimal satu syarat.")
        : group,
    }),
  ])).max(BONUS_RULES_MAX);
}
