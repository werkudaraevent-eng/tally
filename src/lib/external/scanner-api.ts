import { z } from "zod";

const participantSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().min(1).max(200),
  uniqueCode: z.string().min(1).max(100),
  affiliation: z.string().max(300).nullable(),
  jobTitle: z.string().max(300).nullable(),
  participantType: z.string().max(50),
  rsvpStatus: z.enum(["invited", "confirmed"]),
  seats: z.array(z.object({ subEventId: z.string(), subEventName: z.string(), label: z.string() })).default([]),
  checkedIn: z.boolean(),
  totalScans: z.number().int().nonnegative(),
  firstScanAt: z.string().datetime().nullable(),
});

const pageSchema = z.object({
  data: z.object({
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    participants: z.array(participantSchema),
  }),
});

export type ExternalParticipant = z.infer<typeof participantSchema>;

/** Kolom Scanner API pada baris `events`. Ketiganya boleh kosong. */
export type ScannerOverrides = {
  scanner_api_base_url?: string | null;
  scanner_api_key?: string | null;
  scanner_api_event_slug?: string | null;
};

export type ScannerConfig = { baseUrl: string; slug: string; key: string };

/**
 * Setelan event menang atas env; env tinggal sebagai cadangan.
 *
 * Ketiganya dulu milik "integrasinya", bukan milik satu event -- benar selama
 * satu deploy melayani satu klien. Sejak tidak lagi begitu, base URL dan kunci
 * ikut pindah ke baris event: dua klien bisa memakai penyedia scanner berbeda,
 * dan satu env var tidak bisa menunjuk dua endpoint.
 *
 * Env dipertahankan supaya event yang sudah berjalan tidak perlu diisi ulang
 * satu per satu sebelum sinkronisasi berikutnya berhasil.
 */
export function resolveScannerConfig(overrides?: ScannerOverrides): ScannerConfig | null {
  const baseUrl = (overrides?.scanner_api_base_url?.trim() || process.env.SCANNER_API_BASE_URL)?.replace(/\/$/, "");
  const slug = overrides?.scanner_api_event_slug?.trim() || process.env.SCANNER_API_EVENT_SLUG;
  const key = overrides?.scanner_api_key?.trim() || process.env.SCANNER_API_KEY;
  if (!baseUrl || !slug || !key) return null;
  return { baseUrl, slug, key };
}

/**
 * Dilempar saat ketiga nilai belum lengkap. Kelas sendiri, bukan `Error` biasa:
 * pemanggil harus membedakan "belum disetel" (yang dijawab dengan menyuruh
 * mengisi CMS) dari "API-nya menolak" (yang dijawab dengan coba lagi).
 */
export class ScannerNotConfiguredError extends Error {
  constructor() { super("SCANNER_NOT_CONFIGURED"); this.name = "ScannerNotConfiguredError"; }
}

export async function fetchExternalParticipants(overrides?: ScannerOverrides) {
  const config = resolveScannerConfig(overrides);
  if (!config) throw new ScannerNotConfiguredError();
  const { baseUrl, slug, key } = config;
  const participants: ExternalParticipant[] = [];
  const limit = 200;
  let offset = 0;
  let total = 0;
  do {
    const url = `${baseUrl}/events/${encodeURIComponent(slug)}/participants?limit=${limit}&offset=${offset}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`External scanner API returned HTTP ${response.status}.`);
    const parsed = pageSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("External scanner API returned an invalid participant response.");
    participants.push(...parsed.data.data.participants);
    total = parsed.data.data.total;
    offset += parsed.data.data.participants.length;
    if (parsed.data.data.participants.length === 0) break;
  } while (participants.length < total);
  return { total, participants };
}
