import type { KesiapanDomain } from "./situs";

/**
 * Klien kecil REST API Vercel, KHUSUS domain proyek ini.
 *
 * Token tim Vercel berkuasa besar, jadi berkas ini sengaja hanya mengenal lima
 * panggilan: tambah, baca, verifikasi, dan hapus domain DI PROYEK INI, plus
 * konfigurasi DNS satu domain. Tidak ada jalan untuk memanggil endpoint lain,
 * dan galat mentah Vercel tidak pernah diteruskan ke browser: pemanggil hanya
 * menerima kode yang sudah diterjemahkan.
 */

type Siap = Extract<KesiapanDomain, { ready: true }>;

export type VercelVerification = { type: string; domain: string; value: string; reason?: string };
export type VercelProjectDomain = { name: string; verified: boolean; verification?: VercelVerification[] };
export type VercelDomainConfig = {
  configuredBy: "A" | "CNAME" | "dns-01" | "http" | null;
  misconfigured: boolean;
  recommendedCNAME?: { rank: number; value: string }[];
  recommendedIPv4?: { rank: number; value: string[] }[];
  cnames?: string[];
  aValues?: string[];
  conflicts?: { name: string; type: string; value: string }[];
};

export type VercelGagal = { ok: false; code: "taken" | "not_found" | "forbidden" | "invalid" | "unavailable"; status: number };
export type VercelHasil<T> = { ok: true; data: T } | VercelGagal;

async function panggil<T>(siap: Siap, method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<VercelHasil<T>> {
  const url = new URL(`${siap.apiBase}${path}`);
  url.searchParams.set("teamId", siap.teamId);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${siap.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, code: "unavailable", status: 0 };
  }
  const data = await response.json().catch(() => null) as (T & { error?: { code?: string } }) | null;
  if (response.ok) return { ok: true, data: data as T };
  const kode = data?.error?.code ?? "";
  // Galat Vercel dicatat di log server (tanpa token), tidak dikirim ke klien.
  console.error("Vercel domain API", method, path.replace(siap.projectId, "<project>"), response.status, kode);
  if (response.status === 409 || /already|in_use|conflict|taken/i.test(kode)) return { ok: false, code: "taken", status: response.status };
  if (response.status === 404) return { ok: false, code: "not_found", status: 404 };
  if (response.status === 401 || response.status === 403) return { ok: false, code: "forbidden", status: response.status };
  if (response.status === 400) return { ok: false, code: "invalid", status: 400 };
  return { ok: false, code: "unavailable", status: response.status };
}

const proyek = (siap: Siap, domain?: string) => `/projects/${encodeURIComponent(siap.projectId)}/domains${domain ? `/${encodeURIComponent(domain)}` : ""}`;

export const vercelDomains = {
  add: (siap: Siap, domain: string) => panggil<VercelProjectDomain>(siap, "POST", `/v10${proyek(siap)}`, { name: domain }),
  get: (siap: Siap, domain: string) => panggil<VercelProjectDomain>(siap, "GET", `/v9${proyek(siap, domain)}`),
  verify: (siap: Siap, domain: string) => panggil<VercelProjectDomain>(siap, "POST", `/v9${proyek(siap, domain)}/verify`),
  remove: (siap: Siap, domain: string) => panggil<unknown>(siap, "DELETE", `/v9${proyek(siap, domain)}`),
  config: (siap: Siap, domain: string) => panggil<VercelDomainConfig>(siap, "GET", `/v6/domains/${encodeURIComponent(domain)}/config?projectIdOrName=${encodeURIComponent(siap.projectId)}`),
};
