/**
 * Kalimat yang layak ditampilkan dari badan galat `apiError`, atau undefined.
 *
 * `details` datang dalam tiga bentuk: pesan langsung per kolom
 * (`{ end_time: "..." }`), hasil `zod.flatten()` (`{ formErrors, fieldErrors }`),
 * atau `{ message }`. Mengambil `Object.values(details)[0]` begitu saja memberi
 * array kosong untuk bentuk kedua, dan toast tampil tanpa keterangan. Bila
 * rinciannya kosong, pesan umum server (mis. "acara sudah selesai") dipakai.
 */
export function pesanGalatApi(body: unknown): string | undefined {
  const error = (body as { error?: { message?: unknown; details?: unknown } } | null)?.error;
  const details = error?.details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const rincian = details as { formErrors?: unknown; fieldErrors?: unknown } & Record<string, unknown>;
    const langsung = Object.values(rincian).find((nilai): nilai is string => typeof nilai === "string" && nilai.trim() !== "");
    if (langsung) return langsung;
    const kolom = rincian.fieldErrors && typeof rincian.fieldErrors === "object"
      ? Object.values(rincian.fieldErrors as Record<string, unknown>).flat().find((nilai): nilai is string => typeof nilai === "string")
      : undefined;
    if (kolom) return kolom;
    const form = Array.isArray(rincian.formErrors) ? rincian.formErrors.find((nilai): nilai is string => typeof nilai === "string") : undefined;
    if (form) return form;
  }
  return typeof error?.message === "string" && error.message.trim() ? error.message : undefined;
}
