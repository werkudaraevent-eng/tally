import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { buildRegistrationThemeRoles, isHexColor } from "@/lib/registration-theme";

/**
 * Peran warna untuk pratinjau di CMS.
 *
 * Ada supaya pratinjau memakai perhitungan yang PERSIS SAMA dengan yang dipakai
 * saat menyimpan. Menghitungnya ulang di peramban akan menarik pustaka warna
 * (~40 KB) ke bundel admin, dan yang lebih buruk: dua implementasi yang bisa
 * berbeda hasilnya, sehingga pratinjau berhenti menjadi pratinjau.
 *
 * Dipanggil hanya saat admin menggeser pemilih warna, dan hasilnya tidak
 * disimpan ke mana pun.
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const seed = new URL(request.url).searchParams.get("seed");
  if (!isHexColor(seed)) {
    return apiError("VALIDATION_ERROR", 422, { seed: "Warna harus berupa heksadesimal enam digit." });
  }

  return Response.json({
    roles: buildRegistrationThemeRoles(seed, false),
    roles_dark: buildRegistrationThemeRoles(seed, true),
  });
}
