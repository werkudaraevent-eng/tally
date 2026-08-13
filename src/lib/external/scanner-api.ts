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

/**
 * `slugOverride` berasal dari `events.scanner_api_event_slug`.
 *
 * Env var `SCANNER_API_EVENT_SLUG` dipertahankan HANYA sebagai cadangan untuk
 * event pertama: satu deploy kini melayani banyak event, dan satu env var tidak
 * bisa menunjuk lebih dari satu slug. Base URL dan kunci API tetap dari env
 * karena keduanya milik integrasinya, bukan milik salah satu event.
 */
function getConfig(slugOverride?: string | null) {
  const baseUrl = process.env.SCANNER_API_BASE_URL?.replace(/\/$/, "");
  const slug = slugOverride?.trim() || process.env.SCANNER_API_EVENT_SLUG;
  const key = process.env.SCANNER_API_KEY;
  if (!baseUrl || !slug || !key) throw new Error("External scanner API environment variables are missing.");
  return { baseUrl, slug, key };
}

export async function fetchExternalParticipants(slugOverride?: string | null) {
  const { baseUrl, slug, key } = getConfig(slugOverride);
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
