import { z } from "zod";
import { apiErrorPeserta } from "@/lib/api";
import { getPublicRequestEvent } from "@/lib/auth/request-event";
import { normalizeSeatLabel } from "@/lib/seat-map";
import { loadAssignmentsForSession, loadSeatMapConfig, loadSessions, resolveSession } from "@/lib/seat-map-data";
import { searchConfirmationLabel, type NameDisplayMode } from "@/lib/seat-map-privacy";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

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
// Cari per organisasi mendaftar seluruh anggotanya (nama disamarkan) dan
// menyorot semua kursinya. Batas ini menjaga kata kunci yang terlalu umum tetap
// diminta lebih lengkap.
const MAX_ORGANISATION_MATCHES = 100;

const querySchema = z.object({
  q: z.string().trim().min(MIN_QUERY_LENGTH, `Ketik minimal ${MIN_QUERY_LENGTH} huruf.`).max(80),
  sesi: z.string().trim().max(40).optional(),
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiErrorPeserta("VALIDATION_ERROR", 422, parsed.error.flatten());

  const event = await getPublicRequestEvent(request);
  if (!event) return apiErrorPeserta("INTERNAL_ERROR", 404);
  const eventId = event.id;

  try {
    // Pemilihan agenda harus mengikuti aturan yang sama dengan /api/seat-map.
    // Kalau berbeda, tamu bisa mencari nama di agenda yang tidak sedang tampil
    // dan mendapat nomor kursi milik sesi lain.
    const [config, sessions] = await Promise.all([
      loadSeatMapConfig(eventId),
      loadSessions(eventId, { publishedOnly: true }),
    ]);
    if (sessions.length === 0) return apiErrorPeserta("SEAT_MAP_SESSION_UNPUBLISHED", 404);

    const session = resolveSession(sessions, {
      requestedSlug: parsed.data.sesi,
      defaultSessionId: config.default_session_id,
    });
    if (!session) return apiErrorPeserta("SEAT_MAP_SESSION_NOT_FOUND", 404);

    const needle = parsed.data.q.toLowerCase();
    // Cari per Organisation hanya bila admin menyalakannya untuk acara ini.
    // Bila mati, organisasi tidak dicocokkan dan tidak pernah dikirim.
    const cariPerusahaan = config.layout_params.search_company === true;
    // Cocok lewat organisasi saja tidak boleh membuka orang yang namanya
    // disembunyikan: penanya tidak tahu namanya, jadi aturan tampilan nama denah
    // berlaku penuh. Acara dengan nama tersembunyi tidak dicari per organisasi
    // sama sekali; peserta yang menolak namanya tampil tidak ikut hasil
    // organisasi. Keduanya tetap bisa menemukan dirinya lewat nama sendiri.
    let organisasiBoleh = cariPerusahaan;
    let modeNama: NameDisplayMode = "initials";
    if (cariPerusahaan) {
      const { data: setelan } = await getSupabaseServiceClient().from("event_settings").select("name_display_mode").eq("event_id", eventId).maybeSingle();
      modeNama = ((setelan as { name_display_mode?: NameDisplayMode } | null)?.name_display_mode ?? "initials") as NameDisplayMode;
      if (modeNama === "hidden") organisasiBoleh = false;
    }
    const { assignments } = await loadAssignmentsForSession(eventId, session.sub_event_id);

    // Satu orang bisa memegang lebih dari satu kursi; dikelompokkan per orang
    // supaya tamu melihat satu hasil dengan daftar kursinya, bukan hasil ganda.
    const grouped = new Map<string, { name: string; company: string; seatLabels: string[]; tableNumbers: Set<string> }>();
    // Peserta yang cocok lewat organisasinya, untuk menyorot seluruh rombongan.
    const perOrganisasi = new Map<string, string[]>();
    const cocokLewatNama = new Set<string>();

    for (const assignment of assignments) {
      const company = (assignment.company ?? "").trim();
      const cocokNama = assignment.name.toLowerCase().includes(needle);
      const cocokOrganisasi = organisasiBoleh && assignment.allowNameDisplay && company.toLowerCase().includes(needle);
      const cocok = cocokNama || cocokOrganisasi;
      if (!cocok) continue;
      if (cocokNama) cocokLewatNama.add(assignment.participantId);
      if (cocokOrganisasi) perOrganisasi.set(assignment.participantId, [...(perOrganisasi.get(assignment.participantId) ?? []), assignment.seatLabel]);
      const entry = grouped.get(assignment.participantId) ?? {
        name: assignment.name,
        // Organisasi hanya ikut tampil bila boleh dicari: tidak untuk peserta yang menolak namanya tampil.
        company: organisasiBoleh && assignment.allowNameDisplay ? company : "",
        seatLabels: [],
        tableNumbers: new Set<string>(),
      };
      entry.seatLabels.push(assignment.seatLabel);
      grouped.set(assignment.participantId, entry);
    }

    const total = grouped.size;
    const totalOrganisasi = perOrganisasi.size;
    const kursiOrganisasi = [...perOrganisasi.values()].flat();
    const organisasi = totalOrganisasi > 0 && totalOrganisasi <= MAX_ORGANISATION_MATCHES
      ? { total: totalOrganisasi, seat_labels: kursiOrganisasi, normalized_labels: kursiOrganisasi.map(normalizeSeatLabel) }
      : null;

    // Mode "Perusahaan saja": denah publik hanya menampilkan organisasi, jadi
    // peserta yang cocok lewat organisasi saja tidak diberi inisial di daftar.
    const keHasil = (id: string, entry: { name: string; company: string; seatLabels: string[] }) => ({
      name: modeNama === "company_only" && !cocokLewatNama.has(id) ? "Peserta" : searchConfirmationLabel(entry.name, parsed.data.q),
      ...(cariPerusahaan && entry.company ? { company: entry.company } : {}),
      seat_labels: entry.seatLabels,
      normalized_labels: entry.seatLabels.map(normalizeSeatLabel),
    });

    // Cocok lewat organisasi: seluruh anggotanya dikirim sebagai daftar (nama
    // tetap disamarkan) dan semua kursinya disorot. Peserta yang hanya cocok
    // lewat nama ikut didaftar bila jumlahnya masih dalam batas biasa.
    if (organisasi) {
      const hanyaNama = [...grouped.keys()].filter((id) => !perOrganisasi.has(id)).length;
      const daftar = [...grouped.entries()]
        .filter(([id]) => perOrganisasi.has(id) || hanyaNama <= MAX_RESULTS)
        .map(([id, entry]) => keHasil(id, entry))
        .sort((a, b) => a.seat_labels[0].localeCompare(b.seat_labels[0], undefined, { numeric: true }));
      return Response.json({
        session: session.slug,
        total,
        truncated: false,
        results: daftar,
        organisasi,
        message: hanyaNama > MAX_RESULTS
          ? `Kursi ${organisasi.total} peserta dari organisasi ini disorot. Bila nama Anda tidak ada di daftar, ketik nama lebih lengkap.`
          : daftar.length > 1
          ? `Kursi ${daftar.length} peserta disorot. Ketuk nama untuk melihat satu kursi.`
          : undefined,
      });
    }

    // Kata kunci yang terlalu umum tidak dilayani dengan daftar. Tamu asli
    // cukup mengetik lebih lengkap; penyapu data tidak mendapat nama.
    if (total > MAX_RESULTS) {
      return Response.json({
        session: session.slug,
        total,
        truncated: true,
        results: [],
        organisasi: null,
        message: cariPerusahaan
          ? `Ada ${total} peserta yang cocok. Ketik nama Anda lebih lengkap.`
          : `Ada ${total} nama yang cocok. Ketik nama lebih lengkap.`,
      });
    }

    const results = [...grouped.entries()].map(([id, entry]) => keHasil(id, entry));

    return Response.json({ session: session.slug, total, truncated: false, results, organisasi: null });
  } catch {
    return apiErrorPeserta("INTERNAL_ERROR", 500);
  }
}
