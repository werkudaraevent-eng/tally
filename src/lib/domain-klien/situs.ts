/**
 * Alamat utama situs Tally dan syarat fitur domain klien. Fungsi murni atas
 * `env`, supaya bisa diuji tanpa server (situs.check.ts).
 *
 * KENAPA ADA TALLY_SITE_URL. Sebelumnya asal produksi dibaca dari
 * VERCEL_PROJECT_PRODUCTION_URL, yang diisi Vercel dengan domain produksi
 * TERPENDEK proyek. Domain klien yang lebih pendek dari event.sofish.tech akan
 * diam-diam menjadi asal semua kiriman: blast yang sudah terjadwal tidak
 * diambil lagi (drain memfilter site_origin) dan email acara A berisi tautan ke
 * domain klien B. TALLY_SITE_URL membakukan asal itu; fitur domain klien
 * menolak bekerja selama ia belum diisi.
 */

type Env = Record<string, string | undefined>;

function bersihkan(nilai: string) {
  const tanpaSkema = nilai.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return tanpaSkema ? `https://${tanpaSkema}` : null;
}

/** Asal situs yang dibakukan di env (https://...), atau null bila belum diisi. */
export function fixedSiteOrigin(env: Env = process.env): string | null {
  const nilai = env.TALLY_SITE_URL;
  return nilai ? bersihkan(nilai) : null;
}

/**
 * Asal produksi: TALLY_SITE_URL bila ada, lalu VERCEL_PROJECT_PRODUCTION_URL
 * (perilaku lama, aman selama belum ada domain klien), lalu null.
 */
export function productionSiteOrigin(env: Env = process.env): string | null {
  return fixedSiteOrigin(env) ?? (env.VERCEL_PROJECT_PRODUCTION_URL ? bersihkan(env.VERCEL_PROJECT_PRODUCTION_URL) : null);
}

/** Host situs Tally (tanpa skema), untuk menolak domain klien yang sama. */
export function tallyHosts(env: Env = process.env): string[] {
  return [fixedSiteOrigin(env), env.VERCEL_PROJECT_PRODUCTION_URL ? bersihkan(env.VERCEL_PROJECT_PRODUCTION_URL) : null]
    .filter((nilai): nilai is string => Boolean(nilai))
    .map((asal) => new URL(asal).host);
}

export type KesiapanDomain =
  | { ready: true; token: string; teamId: string; projectId: string; apiBase: string }
  | { ready: false; reason: "not_production" | "site_url_missing" | "vercel_missing" };

/**
 * Fitur domain klien hanya berjalan di produksi Vercel. Preview memakai
 * database produksi, jadi domain yang ditambahkan dari preview akan masuk ke
 * proyek produksi tanpa jejak yang jelas. `DOMAIN_KLIEN_UJI=1` membukanya untuk
 * uji lokal (di luar Vercel saja), dengan VERCEL_API_BASE menunjuk ke tiruan.
 */
export function domainReadiness(env: Env = process.env): KesiapanDomain {
  const produksi = env.VERCEL_ENV === "production" || (!env.VERCEL_ENV && env.DOMAIN_KLIEN_UJI === "1");
  if (!produksi) return { ready: false, reason: "not_production" };
  if (!fixedSiteOrigin(env)) return { ready: false, reason: "site_url_missing" };
  const token = env.VERCEL_API_TOKEN?.trim();
  const teamId = env.VERCEL_TEAM_ID?.trim();
  const projectId = env.VERCEL_PROJECT_ID?.trim();
  if (!token || !teamId || !projectId) return { ready: false, reason: "vercel_missing" };
  return { ready: true, token, teamId, projectId, apiBase: (env.VERCEL_API_BASE?.trim() || "https://api.vercel.com").replace(/\/+$/, "") };
}
