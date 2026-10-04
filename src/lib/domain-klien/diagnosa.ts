import { dnsRecordName, isApex, relativeName } from "./normalisasi.ts";
import type { VercelDomainConfig, VercelProjectDomain } from "./vercel.ts";

/**
 * Menerjemahkan jawaban Vercel menjadi record DNS dan satu masalah yang bisa
 * dipahami admin. Fungsi murni (diagnosa.check.ts).
 */

export type RecordDns = { purpose: "arah" | "kepemilikan"; type: "CNAME" | "A" | "TXT"; name: string; value: string };

/**
 * Masalah DNS, satu saja, yang paling perlu dikerjakan lebih dulu.
 * - belum_ada      record belum terlihat sama sekali (normal di awal)
 * - kepemilikan    domain pernah dipakai di akun Vercel lain, butuh TXT
 * - mengarah_lain  record ada tetapi menunjuk ke tempat lain
 * - cloudflare     lewat proxy (awan oranye), Vercel tidak bisa menerbitkan HTTPS
 * - caa            record CAA tidak mengizinkan Let's Encrypt
 * - https          DNS benar, sertifikat HTTPS sedang dibuat
 * - tidak_terbuka  DNS dan HTTPS benar tetapi Tally belum melihat acara ini di sana
 */
export type MasalahDns = "belum_ada" | "kepemilikan" | "mengarah_lain" | "cloudflare" | "caa" | "https" | "tidak_terbuka";

const BAWAAN_CNAME = "cname.vercel-dns.com";
const BAWAAN_A = "76.76.21.21";

export function recordsFor(domain: string, config: VercelDomainConfig | null, project: VercelProjectDomain | null): RecordDns[] {
  const records: RecordDns[] = [];
  if (isApex(domain)) {
    const ip = config?.recommendedIPv4?.slice().sort((a, b) => a.rank - b.rank)[0]?.value?.[0] ?? BAWAAN_A;
    records.push({ purpose: "arah", type: "A", name: "@", value: ip });
  } else {
    const cname = config?.recommendedCNAME?.slice().sort((a, b) => a.rank - b.rank)[0]?.value ?? BAWAAN_CNAME;
    records.push({ purpose: "arah", type: "CNAME", name: dnsRecordName(domain), value: cname.replace(/\.+$/, "") });
  }
  if (project && !project.verified) {
    for (const v of project.verification ?? []) {
      if (v.type.toUpperCase() !== "TXT") continue;
      records.push({ purpose: "kepemilikan", type: "TXT", name: relativeName(v.domain, domain), value: v.value });
    }
  }
  return records;
}

/** Null = DNS sudah benar menurut Vercel. */
export function dnsProblem(config: VercelDomainConfig | null, project: VercelProjectDomain | null): { masalah: MasalahDns | null; tujuanLain: string | null } {
  if (project && !project.verified) return { masalah: "kepemilikan", tujuanLain: null };
  if (!config) return { masalah: "belum_ada", tujuanLain: null };
  if (config.conflicts?.some((c) => c.type.toUpperCase() === "CAA")) return { masalah: "caa", tujuanLain: null };
  if (config.configuredBy === "http") return { masalah: "cloudflare", tujuanLain: null };
  if (!config.misconfigured) return { masalah: null, tujuanLain: null };
  const tujuan = config.cnames?.[0] ?? config.aValues?.[0] ?? null;
  if (tujuan) return { masalah: "mengarah_lain", tujuanLain: tujuan.replace(/\.+$/, "") };
  return { masalah: "belum_ada", tujuanLain: null };
}
