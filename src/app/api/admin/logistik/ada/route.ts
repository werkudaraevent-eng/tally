import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { klien } from "@/lib/logistik/server";

/**
 * Apakah acara ini memakai logistik, untuk menampilkan menu Logistik di
 * sidebar. Ya bila aturan kamar pernah disimpan, atau ada satu saja hotel, bus,
 * agenda, atau barang. Sengaja terpisah dari GET /api/admin/logistik: route itu
 * memuat seluruh peserta dan penempatannya, terlalu berat untuk dipanggil di
 * setiap perpindahan halaman.
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;
  const db = klien();

  const hasil = await Promise.all(
    ["lodging_settings", "lodging_hotels", "transport_vehicles", "transport_trips", "pickup_items"].map((tabel) =>
      db.from(tabel as "lodging_hotels").select("event_id", { count: "exact", head: true }).eq("event_id", eventId)),
  );
  if (hasil.some((baris) => baris.error)) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ ada: hasil.some((baris) => (baris.count ?? 0) > 0) });
}
