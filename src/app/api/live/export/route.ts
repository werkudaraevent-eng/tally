import { requireRequestEvent } from "@/lib/auth/request-event";
import { apiError } from "@/lib/api";
import { KOLOM_KLIEN, kolomJawabanKlien, saringBarisKlien, semuaBarisKlien, waktuBerkas } from "@/lib/live/data";
import { bacaSaringan, kolomSaringanKlien } from "@/lib/saringan-kolom";
import { CONTENT_TYPES, buildCsv, buildXlsx, exportFilename } from "@/lib/participants-io";
import { normalizeTimeZone, timeZoneAbbr } from "@/lib/timezone";

/**
 * Unduhan daftar pendaftar untuk akun Viewer.
 *
 * Daftar kolom tertutup (KOLOM_KLIEN), sama persis dengan tabel di layar.
 * Bukan ekspor admin yang dikurangi beberapa kolom: ekspor admin membawa semua
 * jawaban form tambahan (nomor identitas, kondisi medis) dan kolom internal,
 * dan setiap pertanyaan baru di form akan ikut bocor ke berkas klien tanpa ada
 * yang memutuskannya (QA PR #100, M2). Hadir dihitung dengan definisi yang
 * sama dengan tabel, termasuk pindaian di Tally (M1).
 *
 * Jawaban form tambahan ikut HANYA untuk pertanyaan yang dipilih admin di
 * registration_form_config.client_fields (kolomJawabanKlien), sesudah kolom inti
 * dan dalam urutan form. Pertanyaan baru tetap tertutup sampai admin memilihnya.
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["viewer", "admin"], { readOnly: true });
  if (auth.response) return auth.response;

  const params = new URL(request.url).searchParams;
  const format = params.get("format") === "xlsx" ? "xlsx" : "csv";
  const event = auth.scope.event;
  const zona = normalizeTimeZone(event.time_zone);

  try {
    const jawaban = kolomJawabanKlien(event.registration_form_config);
    const headers = [
      ...KOLOM_KLIEN.map((kolom) => (kolom.key === "registered_at" ? `${kolom.label} (${timeZoneAbbr(zona)})` : kolom.label)),
      ...jawaban.map((kolom) => kolom.label),
    ];
    // Kata cari dan "+ Filter" yang sedang dipakai di layar ikut ke berkas.
    const saringan = bacaSaringan(params.get("f"), kolomSaringanKlien(jawaban));
    if (!saringan) return apiError("VALIDATION_ERROR", 422, { message: "Unknown filter." });
    const q = (params.get("q") ?? "").slice(0, 100);
    const rows = saringBarisKlien(await semuaBarisKlien(event.id, jawaban), q, saringan, zona).map((baris) => [
      ...KOLOM_KLIEN.map(({ key }) => {
        if (key === "registered_at") return waktuBerkas(baris.registered_at, zona);
        if (key === "checked_in") return baris.checked_in ? "Yes" : "No";
        return baris[key] ?? "";
      }),
      ...jawaban.map(({ key }) => baris.answers[key] ?? ""),
    ]);
    // Berkas ini dibuka klien di spreadsheet: sel yang terbaca rumus dinetralkan.
    const body = format === "xlsx" ? await buildXlsx(rows, headers) : buildCsv(rows, headers, { netralkanRumus: true });
    return new Response(body as BodyInit, {
      headers: {
        "Content-Type": CONTENT_TYPES[format],
        "Content-Disposition": `attachment; filename="${exportFilename(format, event.slug)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (galat) {
    console.error("Ekspor viewer gagal:", galat);
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "Export failed." } }, { status: 500 });
  }
}
