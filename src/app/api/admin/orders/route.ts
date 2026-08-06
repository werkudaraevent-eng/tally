import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const querySchema = z.object({
  status: z.enum(["pending", "paid", "void", "handed_over"]).optional(),
  booth_id: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

type OrderRow = {
  id: string;
  code: string;
  booth_id: number;
  has_discount_item: boolean;
  regular_amount: number;
  total_amount: number;
  status: string;
  pickup_mode: string;
  payment_method: string | null;
  approval_code: string | null;
  created_at: string;
  paid_at: string | null;
  handed_over_at: string | null;
  void_reason: string | null;
  participants: { name: string; company: string | null; qr_code: string } | null;
  // Rincian item yang benar-benar diserahkan. Tanpa ini, status "Diserahkan"
  // tidak menjelaskan APA yang diserahkan, padahal tiap booth punya item berbeda.
  // `price_at_claim` dipakai, bukan harga penawaran saat ini, supaya laporan tetap
  // mencerminkan nilai pada saat klaim walau harganya diubah admin setelahnya.
  order_special_items: Array<{ price_at_claim: number; special_offers: { code: string; name: string } | null }>;
};

export async function GET(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();

  /**
   * Filter yang SAMA dipasang dua kali: sekali untuk daftar berpaginasi, sekali
   * untuk RPC ringkasan.
   *
   * Ditulis sebagai fungsi supaya mustahil keduanya berbeda. Kalau syaratnya
   * disalin, satu filter yang lupa ditambahkan di salah satu sisi menghasilkan
   * ringkasan yang tidak cocok dengan barisnya — dan tidak ada galat apa pun,
   * hanya angka yang salah.
   */
  const applyFilters = <T extends { eq: (col: string, value: never) => T; ilike: (col: string, value: string) => T }>(builder: T): T => {
    let q = builder;
    if (parsed.data.status) q = q.eq("status", parsed.data.status as never);
    if (parsed.data.booth_id) q = q.eq("booth_id", parsed.data.booth_id as never);
    if (parsed.data.q) q = q.ilike("code", `%${parsed.data.q.replace(/[%_,]/g, " ")}%`);
    return q;
  };

  const query = applyFilters(
    client
      .from("orders")
      .select("id,code,booth_id,has_discount_item,regular_amount,total_amount,status,pickup_mode,payment_method,approval_code,created_at,paid_at,handed_over_at,void_reason,participants(name,company,qr_code),order_special_items(price_at_claim,special_offers(code,name))", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(parsed.data.offset, parsed.data.offset + parsed.data.limit - 1),
  );

  /**
   * Ringkasan dihitung di SERVER atas SELURUH hasil filter, bukan dari baris
   * yang sedang tampil.
   *
   * Halaman ini mengambil 100 baris sekaligus, sementara ordernya sudah 195.
   * DIUKUR: menjumlahkan 100 baris teratas memberi Rp 34.248.755, padahal
   * totalnya Rp 61.072.097 — Rp 26,8 juta menghilang tanpa satu pun tanda bahwa
   * angkanya salah. Ringkasan yang salah lebih buruk daripada tidak ada
   * ringkasan, karena ia dipercaya dan dipakai untuk rekonsiliasi uang.
   *
   * Kolom yang dijumlahkan hanya diambil sebanyak yang diperlukan (bukan seluruh
   * relasi peserta dan item), sehingga permintaan kedua ini tetap murah.
   */
  const summaryQuery = applyFilters(
    client.from("orders").select("status,total_amount,regular_amount,has_discount_item"),
  );

  const [{ data, error, count }, { data: summaryRows, error: summaryError }] = await Promise.all([query, summaryQuery]);
  if (error) return apiError("INTERNAL_ERROR", 500);

  type SummaryRow = { status: string; total_amount: number; regular_amount: number; has_discount_item: boolean };
  const rows = (summaryRows ?? []) as SummaryRow[];

  // Order VOID dipisah, tidak dicampur ke total.
  //
  // Menjumlahkan semuanya membuat angka di layar tidak cocok dengan Reports dan
  // dengan leaderboard, yang dua-duanya hanya menghitung paid/handed_over. Pada
  // saat rekonsiliasi uang, satu angka yang tidak bisa dijelaskan asalnya akan
  // menghentikan seluruh proses.
  const dihitung = rows.filter((row) => row.status !== "void");
  const void_ = rows.filter((row) => row.status === "void");
  const jumlahkan = (list: SummaryRow[], pilih: (row: SummaryRow) => number) => list.reduce((sum, row) => sum + (Number(pilih(row)) || 0), 0);

  return Response.json({
    total: count ?? 0,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
    orders: (data ?? []) as unknown as OrderRow[],
    // null bila gagal dihitung. Angka 0 akan terbaca sebagai "tidak ada
    // transaksi", padahal artinya "tidak diketahui" — layar harus menyebutkan
    // kegagalannya, bukan memajang nol yang tampak sah.
    summary: summaryError ? null : {
      // Cakupan ringkasan = SELURUH hasil filter. Dikirim supaya layar dapat
      // menyatakan bahwa angkanya bukan hanya dari baris yang tampil.
      order_count: dihitung.length,
      total_amount: jumlahkan(dihitung, (row) => row.total_amount),
      regular_amount: jumlahkan(dihitung, (row) => row.regular_amount),
      // Selisihnya adalah nilai item spesial (harga saat klaim). Dihitung dari
      // pengurangan, bukan dari relasi order_special_items, supaya definisinya
      // tidak pernah berbeda dari kolom total_amount yang dipakai baris tabel.
      special_amount: jumlahkan(dihitung, (row) => row.total_amount) - jumlahkan(dihitung, (row) => row.regular_amount),
      discount_item_count: dihitung.filter((row) => row.has_discount_item).length,
      void_count: void_.length,
      void_amount: jumlahkan(void_, (row) => row.total_amount),
    },
  });
}
