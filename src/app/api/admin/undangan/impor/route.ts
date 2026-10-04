import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { parseCsv, parseXlsx } from "@/lib/participants-io";
import { messagingAllowlist } from "@/lib/pesan/alamat";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { undanganBelumAda } from "@/lib/undangan/data";
import { normalizeInviteEmail } from "@/lib/undangan/email";
import { emailHash, inviteSecretReady } from "@/lib/undangan/tanda";
import { isContohTemplat } from "@/lib/undangan/templat";

/**
 * Impor tamu undangan dari CSV atau XLSX. Tidak pernah mengirim apa pun.
 *
 * Polanya sama dengan impor Daftar peserta: `dry_run` menjalankan fungsi
 * database yang sama dengan penyimpanan lalu membatalkan tulisannya, jadi
 * ringkasan sebelum "Tambahkan" adalah hitungan yang akan terjadi.
 *
 * Yang diperiksa DI SINI: nama ada, email sah atau kosong (penormal yang sama
 * dengan pencocokan pendaftaran dan pemeriksaan saat kirim). Yang diperiksa di
 * database: sudah peserta, sudah diundang, ganda di berkas, penekanan.
 */

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_ROWS = 5000;

const KOLOM: Record<string, "name" | "email" | "company" | "title" | "phone"> = {
  name: "name", nama: "name", nama_lengkap: "name", full_name: "name", fullname: "name", guest_name: "name", participant_name: "name", invitee_name: "name",
  email: "email", surel: "email", alamat_email: "email", e_mail: "email", email_address: "email",
  company: "company", perusahaan: "company", instansi: "company", organisasi: "company", organization: "company", organisation: "company", affiliation: "company",
  title: "title", jabatan: "title", job_title: "title", jobtitle: "title", posisi: "title", position: "title",
  phone: "phone", telepon: "phone", telp: "phone", hp: "phone", no_hp: "phone", whatsapp: "phone", no_telepon: "phone",
  phone_number: "phone", mobile: "phone", mobile_number: "phone", mobile_phone: "phone",
};

function header(raw: string) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const ALASAN = { tanpa_nama: "Name is empty", dua_alamat: "Two email addresses in one cell", tidak_sah: "Email address is not valid", contoh: "Template sample row: delete or overwrite it first" } as const;

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  if (!inviteSecretReady()) return apiError("VALIDATION_ERROR", 503, { message: "INVITE_LINK_SECRET is not set on the server." });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError("VALIDATION_ERROR", 422, { message: "No file selected." });
  if (file.size === 0) return apiError("IMPORT_EMPTY", 422);
  if (file.size > MAX_BYTES) return apiError("IMPORT_TOO_LARGE", 422);
  const dryRun = String(form?.get("dry_run") ?? "") !== "false";
  const attested = String(form?.get("attested") ?? "") === "true";
  if (!dryRun && !attested) return apiError("VALIDATION_ERROR", 422, { message: "Tick the statement about where the list came from first." });

  // Situs uji memakai database produksi. Impor dari sana hanya ke acara draf,
  // dan barisnya ditandai uji.
  const situsUji = messagingAllowlist().mode !== "off";
  if (situsUji && auth.scope.event.status !== "draft") {
    return apiError("FORBIDDEN", 403, { message: "Importing from the test site is only allowed for draft events, because the test site uses the production database." });
  }

  const isXlsx = /\.xlsx$/i.test(file.name) || file.type.includes("spreadsheetml");
  let matrix: string[][];
  try {
    matrix = isXlsx ? await parseXlsx(await file.arrayBuffer()) : parseCsv(await file.text());
  } catch {
    return apiError("IMPORT_UNREADABLE", 422);
  }

  const [kepala, ...badan] = matrix;
  const kolom = (kepala ?? []).map((sel) => KOLOM[header(sel ?? "")] ?? null);
  const dikenali = [...new Set(kolom.filter(Boolean))] as string[];
  if (!dikenali.includes("name")) {
    return apiError("VALIDATION_ERROR", 422, {
      message: "Column Name not found in the first row of the file. Recognised columns: Name, Email, Organisation, Job title, Mobile number.",
    });
  }

  type Baris = { row: number; name: string; email: string | null; company: string | null; title: string | null; phone: string | null; email_hash: string | null };
  const baris: Baris[] = [];
  const ditolak: { row: number; name: string; email: string; reason: string }[] = [];
  let nomor = 0;
  for (const sel of badan) {
    const isi: Record<string, string> = {};
    kolom.forEach((k, i) => {
      if (k && !isi[k]) isi[k] = (sel[i] ?? "").trim();
    });
    if (!Object.values(isi).some(Boolean)) continue;
    nomor += 1;
    const nama = (isi.name ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    const email = normalizeInviteEmail(isi.email);
    if (!nama) {
      ditolak.push({ row: nomor, name: "", email: isi.email ?? "", reason: ALASAN.tanpa_nama });
      continue;
    }
    if (!email.ok) {
      ditolak.push({ row: nomor, name: nama, email: isi.email ?? "", reason: ALASAN[email.reason] });
      continue;
    }
    if (isContohTemplat({ name: nama, email: email.email, company: isi.company, title: isi.title, phone: isi.phone })) {
      ditolak.push({ row: nomor, name: nama, email: isi.email ?? "", reason: ALASAN.contoh });
      continue;
    }
    baris.push({
      row: nomor,
      name: nama,
      email: email.email,
      company: (isi.company ?? "").slice(0, 160) || null,
      title: (isi.title ?? "").slice(0, 160) || null,
      phone: (isi.phone ?? "").slice(0, 30) || null,
      email_hash: email.email ? emailHash(email.email) : null,
    });
  }
  if (nomor === 0) return apiError("IMPORT_EMPTY", 422);
  if (nomor > MAX_ROWS) return apiError("VALIDATION_ERROR", 422, { message: `Up to ${MAX_ROWS.toLocaleString("en-GB")} rows per import. Split the file.` });

  const kosong = {
    rows: 0, inserted: 0, with_email: 0, merged: 0, already_participant: 0, without_email: 0,
    suppressed: 0, possible_duplicates: 0, participant_samples: [], duplicate_samples: [],
  };
  let hasil: typeof kosong = kosong;
  if (baris.length) {
    const { data, error } = await getSupabaseServiceClient().rpc("import_event_invitations" as never, {
      p_event_id: auth.scope.event.id,
      p_rows: baris,
      p_dry_run: dryRun,
      p_actor: auth.user.id,
      p_test: situsUji,
    } as never);
    if (undanganBelumAda(error)) return apiError("INVITATIONS_NOT_READY", 409);
    if (error) {
      const code = mapDatabaseError(error);
      return apiError(code, code === "INTERNAL_ERROR" ? 500 : 422);
    }
    hasil = data as typeof kosong;
  }

  return Response.json({
    ...hasil,
    dry_run: dryRun,
    rows: nomor,
    rejected: ditolak.length,
    rejected_rows: ditolak,
    recognized_columns: dikenali,
    file_name: file.name,
    test: situsUji,
  });
}
