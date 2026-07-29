import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Pencarian peserta untuk kasir: nama atau perusahaan. Endpoint booth tidak
// dapat dipakai karena terikat pada booth_id milik operator booth.
// Hanya mengembalikan peserta yang punya order pending agar kasir langsung
// melihat siapa yang memang perlu dilayani.
const querySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export async function GET(request: Request) {
  const auth = await requireUser(["cashier", "admin"]);
  if (auth.response) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  // Escape wildcard agar input pengguna tidak mengubah pola pencarian.
  const pattern = `%${parsed.data.q.replace(/[%_,]/g, " ")}%`;
  const { data, error } = await client
    .from("participants")
    .select("id,qr_code,name,company,title")
    .is("source_removed_at", null)
    .or(`name.ilike.${pattern},company.ilike.${pattern},qr_code.ilike.${pattern}`)
    .order("name", { ascending: true })
    .limit(parsed.data.limit);
  if (error) return apiError("INTERNAL_ERROR", 500);

  const participants = (data ?? []) as Array<{ id: string; qr_code: string; name: string; company: string | null; title: string | null }>;
  if (participants.length === 0) return Response.json({ participants: [] });

  // Lampirkan jumlah & total order pending supaya kasir tahu mana yang relevan.
  const { data: pendingRows } = await client
    .from("orders")
    .select("participant_id,total_amount")
    .in("participant_id", participants.map((participant) => participant.id))
    .eq("status", "pending") as { data: Array<{ participant_id: string; total_amount: number }> | null };

  const pending = pendingRows ?? [];
  return Response.json({
    participants: participants.map((participant) => {
      const own = pending.filter((order) => order.participant_id === participant.id);
      return {
        ...participant,
        pending_count: own.length,
        pending_total: own.reduce((sum, order) => sum + order.total_amount, 0),
      };
    }),
  });
}
