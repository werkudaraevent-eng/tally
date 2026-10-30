import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { CurrentUser } from "./roles";
import { rapikanIzin, type IzinPeran } from "./izin-modul";

export type PeranKustom = { id: string; name: string; izin: IzinPeran };

/**
 * Peran kustom milik akun ini, atau null. Gagal baca = null, dan pemanggil
 * memperlakukannya sebagai tanpa izin: akses yang tidak bisa diperiksa tidak
 * boleh terbuka (sama dengan requireEventScope).
 */
export async function muatPeranKustom(user: CurrentUser): Promise<PeranKustom | null> {
  if (user.role !== "custom" || !user.access_role_id) return null;
  const { data, error } = await getSupabaseServiceClient()
    .from("access_roles" as never)
    .select("id,name,permissions")
    .eq("id", user.access_role_id)
    .maybeSingle();
  if (error) {
    console.error("muatPeranKustom gagal:", error);
    return null;
  }
  const baris = data as { id: string; name: string; permissions: unknown } | null;
  return baris ? { id: baris.id, name: baris.name, izin: rapikanIzin(baris.permissions) } : null;
}
