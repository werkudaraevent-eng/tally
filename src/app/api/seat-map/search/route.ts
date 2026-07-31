import { z } from "zod";
import { apiError } from "@/lib/api";
import { normalizeSeatLabel } from "@/lib/seat-map";
import { loadAssignmentsForSession, loadSeatMapConfig, loadSessions, resolveSession } from "@/lib/seat-map-data";
import { searchConfirmationLabel } from "@/lib/seat-map-privacy";

// Pencarian kursi untuk tamu. Publik, tanpa login.
//
// Ini endpoint paling rawan di fitur denah: kalau dibuat longgar, ia berubah
// menjadi alat memanen daftar tamu. Tiga pembatas dipasang sekaligus:
//
//   1. Kata kunci minimal 3 huruf, sehingga tidak bisa disapu dengan "a", "b",
//      "c" untuk menarik seluruh daftar.
//   2. Hasil dibatasi 5 orang, dan bila kata kunci terlalu umum yang dikirim
//      hanya jumlahnya, bukan orangnya. Tamu yang benar mencari dirinya akan
//      mengetik lebih lengkap; pemanen data tidak mendapat apa pun.
//   3. Nama tetap disamarkan. Hanya bagian yang diketik penanya yang tampil
//      utuh, jadi tamu bisa mengenali dirinya tanpa nama utuh orang lain bocor.
//
// Pencocokan sengaja dilakukan di memori, bukan lewat query `ilike` ke database.
// Selain menghindari sentuhan apa pun ke tabel `participants`, cara ini membuat
// pola pencarian tamu tidak pernah menjadi bagian dari kueri SQL.

const MIN_QUERY_LENGTH = 3;
const MAX_RESULTS = 5;

const querySchema = z.object({
  q: z.string().trim().min(MIN_QUERY_LENGTH, `Ketik minimal ${MIN_QUERY_LENGTH} huruf.`).max(80),
  sesi: z.string().trim().max(40).optional(),
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  try {
    // Pemilihan agenda harus mengikuti aturan yang sama dengan /api/seat-map.
    // Kalau berbeda, tamu bisa mencari nama di agenda yang tidak sedang tampil
    // dan mendapat nomor kursi milik sesi lain.
    const [config, sessions] = await Promise.all([
      loadSeatMapConfig(),
      loadSessions({ publishedOnly: true }),
    ]);
    if (sessions.length === 0) return apiError("SEAT_MAP_SESSION_UNPUBLISHED", 404);

    const session = resolveSession(sessions, {
      requestedSlug: parsed.data.sesi,
      defaultSessionId: config.default_session_id,
    });
    if (!session) return apiError("SEAT_MAP_SESSION_NOT_FOUND", 404);

    const needle = parsed.data.q.toLowerCase();
    const { assignments } = await loadAssignmentsForSession(session.sub_event_id);

    // Satu orang bisa memegang lebih dari satu kursi; dikelompokkan per orang
    // supaya tamu melihat satu hasil dengan daftar kursinya, bukan hasil ganda.
    const grouped = new Map<string, { name: string; seatLabels: string[]; tableNumbers: Set<string> }>();

    for (const assignment of assignments) {
      if (!assignment.name.toLowerCase().includes(needle)) continue;
      const entry = grouped.get(assignment.participantId) ?? {
        name: assignment.name,
        seatLabels: [],
        tableNumbers: new Set<string>(),
      };
      entry.seatLabels.push(assignment.seatLabel);
      grouped.set(assignment.participantId, entry);
    }

    const total = grouped.size;

    // Kata kunci yang terlalu umum tidak dilayani dengan daftar. Tamu asli
    // cukup mengetik lebih lengkap; penyapu data tidak mendapat nama.
    if (total > MAX_RESULTS) {
      return Response.json({
        session: session.slug,
        total,
        truncated: true,
        results: [],
        message: `Ada ${total} nama yang cocok. Ketik nama lebih lengkap.`,
      });
    }

    const results = [...grouped.values()].map((entry) => ({
      name: searchConfirmationLabel(entry.name, parsed.data.q),
      seat_labels: entry.seatLabels,
      normalized_labels: entry.seatLabels.map(normalizeSeatLabel),
    }));

    return Response.json({ session: session.slug, total, truncated: false, results });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
