import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { normalizeTimeZone, timeZoneOffset, type EventTimeZone } from "@/lib/timezone";

/**
 * Data layar Viewer (klien): satu definisi untuk kartu angka, tabel, dan unduhan.
 *
 * Sengaja TIDAK memakai `list_event_participants`. Pencarian RPC itu ikut
 * mencocokkan `qr_code`, dan QR code adalah tiket masuk tamu: dengan menebak
 * per digit, klien bisa memulihkan kode siapa pun dalam beberapa puluh
 * permintaan (QA PR #100, H1). Di sini pencarian hanya menyentuh nama,
 * organisasi, dan email, dan kolom yang keluar dibatasi daftar di bawah.
 *
 * Definisinya, dipakai sama di semua tempat:
 * - Terdaftar = baris `participants` acara ini yang tidak dihapus di sumber.
 * - Waktu terdaftar = `participants.created_at`: saat orangnya masuk ke daftar.
 *   Di acara dengan persetujuan itu saat disetujui; yang belum disetujui
 *   dihitung terpisah sebagai "Awaiting approval".
 * - Hadir = pernah dipindai di Tally (`attendance_scans`) ATAU ditandai hadir
 *   oleh Scanner API (`source_checked_in`).
 */

/** Kolom yang boleh dilihat klien, berurutan seperti di tabel dan berkas. */
export const KOLOM_KLIEN = [
  { key: "name", label: "Name" },
  { key: "company", label: "Organisation" },
  { key: "title", label: "Job title" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "participant_type", label: "Type" },
  { key: "registered_at", label: "Registered" },
  { key: "checked_in", label: "Checked in" },
] as const;

export type BarisKlien = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  participant_type: string | null;
  registered_at: string;
  checked_in: boolean;
};

export type UrutKlien = "registered_at" | "name" | "company";

const KOLOM_URUT: Record<UrutKlien, string> = { registered_at: "created_at", name: "name", company: "company" };

type BarisDb = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  participant_type: string | null;
  created_at: string;
  source_checked_in: boolean | null;
  attendance_scans: Array<{ id: number }> | null;
};

// `attendance_scans(id)` dibatasi satu baris per peserta di bawah: yang
// ditanyakan hanya "pernah dipindai", bukan berapa kali.
const PILIH = "id,name,company,title,email,phone,participant_type,created_at,source_checked_in,attendance_scans(id)";

/**
 * Filter `or` PostgREST untuk kata cari klien.
 *
 * Nilai dibungkus kutip ganda supaya koma dan kurung di nama ("PT A, Tbk",
 * "Budi (BCA)") tidak memecah filter. Di dalam kutip, `\` dan `"` di-escape.
 * `%` dan `_` di-escape menjadi literal untuk ILIKE; `*` adalah wildcard
 * PostgREST dan tidak bisa di-escape, jadi dibuang.
 */
export function filterCari(kata: string): string | null {
  const bersih = kata.replace(/\*/g, " ").trim();
  if (!bersih) return null;
  const pola = bersih
    .replace(/\\/g, "\\\\\\\\")
    .replace(/%/g, "\\\\%")
    .replace(/_/g, "\\\\_")
    .replace(/"/g, '\\"');
  return ["name", "company", "email"].map((kolom) => `${kolom}.ilike."*${pola}*"`).join(",");
}

function keBaris(baris: BarisDb): BarisKlien {
  return {
    id: baris.id,
    name: baris.name,
    company: baris.company,
    title: baris.title,
    email: baris.email,
    phone: baris.phone,
    participant_type: baris.participant_type,
    registered_at: baris.created_at,
    checked_in: (baris.attendance_scans?.length ?? 0) > 0 || Boolean(baris.source_checked_in),
  };
}

function pesertaAktif(eventId: string) {
  return getSupabaseServiceClient()
    .from("participants")
    .select(PILIH, { count: "exact" })
    .eq("event_id", eventId)
    .is("source_removed_at", null)
    .limit(1, { referencedTable: "attendance_scans" });
}

/** Satu halaman tabel. */
export async function halamanKlien(eventId: string, opsi: { q: string; sort: UrutKlien; dir: "asc" | "desc"; limit: number; offset: number }) {
  let kueri = pesertaAktif(eventId);
  const cari = filterCari(opsi.q);
  if (cari) kueri = kueri.or(cari);
  const { data, error, count } = await kueri
    .order(KOLOM_URUT[opsi.sort], { ascending: opsi.dir === "asc", nullsFirst: false })
    .order("id", { ascending: true })
    .range(opsi.offset, opsi.offset + opsi.limit - 1);
  if (error) throw new Error(error.message);
  return { rows: ((data ?? []) as unknown as BarisDb[]).map(keBaris), total: count ?? 0 };
}

/** Semua baris untuk unduhan, dibaca per 1000 karena PostgREST memotong di 1000. */
export async function semuaBarisKlien(eventId: string): Promise<BarisKlien[]> {
  const semua: BarisKlien[] = [];
  let total: number | null = null;
  for (let dari = 0; ; dari += 1000) {
    const { data, error, count } = await pesertaAktif(eventId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(dari, dari + 999);
    if (error) throw new Error(error.message);
    if (dari === 0) total = count ?? null;
    const baris = (data ?? []) as unknown as BarisDb[];
    semua.push(...baris.map(keBaris));
    if (baris.length < 1000) break;
  }
  if (total !== null && semua.length !== total) throw new Error(`Viewer export read ${semua.length} of ${total} participants.`);
  return semua;
}

/** Awal hari ini di zona acara. "Hari ini" klien adalah hari di lokasi acara. */
function awalHariIni(zona: EventTimeZone) {
  const tanggal = new Date().toLocaleDateString("en-CA", { timeZone: zona });
  return new Date(`${tanggal}T00:00:00${timeZoneOffset(zona)}`).toISOString();
}

/**
 * Empat angka kartu. Semuanya hitungan `head`: tidak ada baris yang ditarik.
 *
 * Hadir dihitung sebagai dua himpunan yang tidak beririsan, keduanya semi/anti
 * join di database: peserta yang punya pindaian, ditambah peserta bertanda
 * hadir dari Scanner API yang TIDAK punya pindaian. Versi sebelumnya membaca
 * seluruh `attendance_scans` acara setiap 30 detik (QA PR #100, M3).
 */
export async function hitunganKlien(eventId: string, zonaMentah: unknown) {
  const client = getSupabaseServiceClient();
  const zona = normalizeTimeZone(zonaMentah);
  const aktif = (pilih = "id") =>
    client.from("participants").select(pilih, { count: "exact", head: true }).eq("event_id", eventId).is("source_removed_at", null);

  const [terdaftar, hariIni, menunggu, dipindai, hadirSumber] = await Promise.all([
    aktif(),
    aktif().gte("created_at", awalHariIni(zona)),
    client.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "pending"),
    aktif("id,attendance_scans!inner(id)"),
    aktif("id,attendance_scans(id)").eq("source_checked_in", true).is("attendance_scans", null),
  ]);
  const galat = [terdaftar, hariIni, menunggu, dipindai, hadirSumber].find((hasil) => hasil.error)?.error;
  if (galat) throw new Error(galat.message);
  return {
    registered: terdaftar.count ?? 0,
    today: hariIni.count ?? 0,
    pending: menunggu.count ?? 0,
    checked_in: (dipindai.count ?? 0) + (hadirSumber.count ?? 0),
  };
}

/** "2026-10-07 14:52" di zona acara: terbaca di Excel tanpa diubah jadi angka seri. */
export function waktuBerkas(iso: string, zona: EventTimeZone) {
  const bagian = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${bagian.year}-${bagian.month}-${bagian.day} ${bagian.hour}:${bagian.minute}`;
}
