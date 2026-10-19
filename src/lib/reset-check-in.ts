/**
 * Ringkasan dialog Reset check-in (route /api/admin/participants/[id]/check-in).
 * Murni, supaya bisa diuji lewat `npm run check` tanpa database.
 */

export type ScanReset = { session_id: number; scanned_at: string };
export type PickupReset = { item_id: number; session_id: number | null; size: string | null };

/** Jumlah scan dan scan pertama per sesi, urut seperti barisnya masuk; barang kit dengan namanya. */
export function ringkasReset(scans: ScanReset[], pickups: PickupReset[], namaBarang: Map<number, string>) {
  const perSesi = new Map<number, { session_id: number; count: number; first: string }>();
  for (const scan of scans) {
    const ada = perSesi.get(scan.session_id);
    if (!ada) perSesi.set(scan.session_id, { session_id: scan.session_id, count: 1, first: scan.scanned_at });
    else {
      ada.count += 1;
      if (scan.scanned_at < ada.first) ada.first = scan.scanned_at;
    }
  }
  return {
    scans: [...perSesi.values()],
    pickups: pickups.map((row) => ({ item: namaBarang.get(row.item_id) ?? "Kit item", size: row.size, session_id: row.session_id })),
  };
}
