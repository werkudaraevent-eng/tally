import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { dnsProblem, recordsFor, type MasalahDns, type RecordDns } from "./diagnosa";
import type { KesiapanDomain } from "./situs";
import { vercelDomains } from "./vercel";

/**
 * Baris event_domains dan pemeriksaannya. Hanya dipakai di server.
 */

export type StatusDomain = "menunggu" | "aktif" | "bermasalah" | "dilepas";

export type DomainRow = {
  event_id: string;
  domain: string;
  status: StatusDomain;
  records: RecordDns[];
  problem: string | null;
  fail_count: number;
  created_by: string | null;
  created_at: string;
  status_since: string;
  last_checked_at: string | null;
  activated_at: string | null;
  released_at: string | null;
};

const KOLOM = "event_id,domain,status,records,problem,fail_count,created_by,created_at,status_since,last_checked_at,activated_at,released_at";

/** Penanda yang dilayani proxy di host klien; dipakai untuk membuktikan "Aktif". */
export const PENANDA_PATH = "/.well-known/tally-domain";

export async function readDomain(eventId: string): Promise<{ row: DomainRow | null; missing: boolean }> {
  const { data, error } = await getSupabaseServiceClient().from("event_domains").select(KOLOM).eq("event_id", eventId).maybeSingle();
  if (error) {
    // 42P01 = tabel belum ada (migrasi belum dijalankan).
    if ((error as { code?: string }).code === "42P01" || /event_domains/.test(error.message ?? "")) return { row: null, missing: true };
    throw new Error(error.message);
  }
  return { row: (data as DomainRow | null) ?? null, missing: false };
}

// ---------------------------------------------------------------------------
// Peta host <-> acara, untuk proxy dan pembuat tautan. Disimpan sebentar di
// memori: proxy berjalan di setiap permintaan, dan satu query per permintaan
// untuk tabel yang hampir tidak pernah berubah adalah pemborosan.

export type PetaDomain = {
  byHost: Map<string, { eventId: string; slug: string; status: StatusDomain }>;
  bySlug: Map<string, { domain: string; status: StatusDomain }>;
  byEvent: Map<string, { domain: string; status: StatusDomain }>;
};

const UMUR_PETA_MS = 30_000;
let peta: { nilai: PetaDomain; sampai: number } | null = null;
let memuat: Promise<PetaDomain> | null = null;

async function muatPeta(): Promise<PetaDomain> {
  const kosong: PetaDomain = { byHost: new Map(), bySlug: new Map(), byEvent: new Map() };
  const { data, error } = await getSupabaseServiceClient().from("event_domains").select("domain,status,event_id,events(slug)");
  // Gagal baca (termasuk tabel belum ada) = tidak ada domain klien. Aman: semua
  // tautan kembali ke alamat Tally, host klien tidak dikenali.
  if (error || !data) return kosong;
  for (const baris of data as unknown as { domain: string; status: StatusDomain; event_id: string; events: { slug: string } | null }[]) {
    const slug = baris.events?.slug;
    if (!slug) continue;
    kosong.byHost.set(baris.domain, { eventId: baris.event_id, slug, status: baris.status });
    kosong.bySlug.set(slug, { domain: baris.domain, status: baris.status });
    kosong.byEvent.set(baris.event_id, { domain: baris.domain, status: baris.status });
  }
  return kosong;
}

export async function domainMap(): Promise<PetaDomain> {
  if (peta && peta.sampai > Date.now()) return peta.nilai;
  memuat ??= muatPeta().then((nilai) => {
    peta = { nilai, sampai: Date.now() + UMUR_PETA_MS };
    return nilai;
  }).finally(() => { memuat = null; });
  return memuat;
}

/** Dipanggil setelah status berubah, supaya instans ini langsung memakai yang baru. */
export function forgetDomainMap() {
  peta = null;
}

// ---------------------------------------------------------------------------
// Pemeriksaan

type Siap = Extract<KesiapanDomain, { ready: true }>;

/** Buka https://<domain>/.well-known/tally-domain dan cocokkan id acaranya. */
async function cekPenanda(domain: string, eventId: string): Promise<"ok" | "https" | "tidak_terbuka"> {
  try {
    const response = await fetch(`https://${domain}${PENANDA_PATH}`, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return "tidak_terbuka";
    const data = await response.json().catch(() => null) as { event_id?: string } | null;
    return data?.event_id === eventId ? "ok" : "tidak_terbuka";
  } catch (error) {
    // Sertifikat belum terbit muncul sebagai galat TLS dari fetch.
    const pesan = String((error as { cause?: { code?: string } })?.cause?.code ?? error);
    return /CERT|TLS|SSL|ALTNAME|SELF_SIGNED/i.test(pesan) ? "https" : "tidak_terbuka";
  }
}

export type HasilPeriksa = { records: RecordDns[]; problem: MasalahDns | null; target: string | null; ok: boolean };

/** Tanya Vercel, lalu (bila DNS benar) buka domainnya sendiri. Tidak menulis apa pun. */
export async function inspectDomain(siap: Siap, domain: string, eventId: string): Promise<HasilPeriksa> {
  let proyek = await vercelDomains.get(siap, domain);
  if (proyek.ok && !proyek.data.verified) {
    const verifikasi = await vercelDomains.verify(siap, domain);
    if (verifikasi.ok) proyek = verifikasi;
  }
  const config = await vercelDomains.config(siap, domain);
  const dataProyek = proyek.ok ? proyek.data : null;
  const dataConfig = config.ok ? config.data : null;
  const records = recordsFor(domain, dataConfig, dataProyek);
  const { masalah, tujuanLain } = dnsProblem(dataConfig, dataProyek);
  if (masalah) return { records, problem: masalah, target: tujuanLain, ok: false };
  const penanda = await cekPenanda(domain, eventId);
  return { records, problem: penanda === "ok" ? null : penanda, target: null, ok: penanda === "ok" };
}

/**
 * Periksa satu domain dan simpan hasilnya, termasuk perpindahan status:
 * menunggu -> aktif saat terbukti; aktif -> bermasalah setelah 2 kegagalan
 * berturut-turut (temuan QA N1: satu kegagalan jaringan tidak boleh memindah
 * tautan semua email); bermasalah -> aktif saat pulih.
 */
export async function checkAndStore(siap: Siap, row: DomainRow, actorId: string | null): Promise<DomainRow> {
  if (row.status === "dilepas") return row;
  const hasil = await inspectDomain(siap, row.domain, row.event_id);
  const sekarang = new Date().toISOString();
  let status = row.status;
  let failCount = row.fail_count;
  if (hasil.ok) {
    failCount = 0;
    status = "aktif";
  } else if (row.status === "aktif" || row.status === "bermasalah") {
    failCount = row.fail_count + 1;
    if (failCount >= 2) status = "bermasalah";
  }
  const berubah = status !== row.status;
  const patch = {
    records: hasil.records,
    problem: hasil.problem ? (hasil.target ? `${hasil.problem}:${hasil.target}` : hasil.problem) : null,
    fail_count: failCount,
    last_checked_at: sekarang,
    status,
    ...(berubah ? { status_since: sekarang } : {}),
    ...(berubah && status === "aktif" && !row.activated_at ? { activated_at: sekarang } : {}),
  };
  const client = getSupabaseServiceClient();
  const { data } = await client.from("event_domains").update(patch as never).eq("event_id", row.event_id).eq("domain", row.domain).select(KOLOM).maybeSingle();
  if (berubah) {
    forgetDomainMap();
    await client.from("audit_logs").insert({ event_id: row.event_id, user_id: actorId, action: "domain_status", payload: { domain: row.domain, from: row.status, to: status, problem: patch.problem } } as never);
  }
  return (data as DomainRow | null) ?? { ...row, ...patch } as DomainRow;
}
