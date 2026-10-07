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
 * - Waktu terdaftar = sama dengan kolom "Registered" di daftar peserta admin
 *   (#92): yang paling awal dari `participants.created_at` dan form pertama
 *   (`event_registrations.created_at`). Di acara dengan persetujuan ini saat
 *   form dikirim, bukan saat disetujui. Yang belum disetujui dihitung terpisah
 *   sebagai "Awaiting approval" dan tidak ada di daftar.
 *   Dihitung di sini, bukan lewat RPC `list_event_participants`, karena RPC itu
 *   mencari di qr_code (lihat di atas). "Today" dan tanda "New" memakai waktu
 *   yang sama dengan yang tampil.
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

function keBaris(baris: BarisDb, formPertama: Map<string, string>): BarisKlien {
  return {
    id: baris.id,
    name: baris.name,
    company: baris.company,
    title: baris.title,
    email: baris.email,
    phone: baris.phone,
    participant_type: baris.participant_type,
    registered_at: waktuTerdaftar(baris.id, baris.created_at, formPertama),
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

/** `least(participants.created_at, form pertama)`, persis seperti RPC daftar admin. */
function waktuTerdaftar(id: string, dibuat: string, formPertama: Map<string, string>) {
  const form = formPertama.get(id);
  return form !== undefined && Date.parse(form) < Date.parse(dibuat) ? form : dibuat;
}

function tambahForm(peta: Map<string, string>, baris: Array<{ participant_id: string | null; created_at: string }>) {
  for (const { participant_id: id, created_at: waktu } of baris) {
    if (!id) continue;
    const lama = peta.get(id);
    if (lama === undefined || Date.parse(waktu) < Date.parse(lama)) peta.set(id, waktu);
  }
}

function formAcara(eventId: string) {
  return getSupabaseServiceClient()
    .from("event_registrations")
    .select("id,participant_id,created_at", { count: "exact" })
    .eq("event_id", eventId)
    .not("participant_id", "is", null);
}

/** Form pertama untuk peserta tertentu (satu halaman tabel: paling banyak 100 id). */
async function formUntuk(eventId: string, ids: string[]) {
  const peta = new Map<string, string>();
  if (!ids.length) return peta;
  const { data, error } = await formAcara(eventId).in("participant_id", ids).limit(1000);
  if (error) throw new Error(error.message);
  tambahForm(peta, data ?? []);
  return peta;
}

/**
 * Baca semua halaman sebuah kueri untuk layar live, 1000 per permintaan (batas
 * PostgREST). Halaman pertama memberi jumlah; sisanya diminta bersamaan.
 *
 * Sengaja longgar: saat pendaftaran ramai, baris bisa bertambah atau bergeser di
 * antara permintaan, jadi jumlahnya tidak dicocokkan (dulu jadi 500, QA R3-M1).
 * Baris yang terbaca dua kali dibuang; baris yang terlewat muncul di muatan
 * berikutnya, 30 detik lagi. Unduhan memakai `bacaBerurut` yang tidak bisa
 * melewatkan baris.
 */
async function bacaSemua<T>(buat: () => KueriBerhalaman<T>, kunci: (baris: T) => string): Promise<T[]> {
  const pertama = await buat().range(0, 999);
  if (pertama.error) throw new Error(pertama.error.message);
  const total = pertama.count ?? 0;
  const sisa = [];
  for (let dari = 1000; dari < total; dari += 1000) sisa.push(buat().range(dari, dari + 999));
  const hasil = await Promise.all(sisa);
  const galat = hasil.find((h) => h.error)?.error;
  if (galat) throw new Error(galat.message);
  const unik = new Map<string, T>();
  for (const baris of [...(pertama.data ?? []), ...hasil.flatMap((h) => h.data ?? [])]) unik.set(kunci(baris), baris);
  return [...unik.values()];
}

type KueriBerhalaman<T> = {
  range(dari: number, sampai: number): PromiseLike<{ data: T[] | null; error: { message: string } | null; count: number | null }>;
};

/**
 * Baca semua baris untuk unduhan: per 1000, berurutan menurut `id` (keyset,
 * `id > terakhir`). Baris yang ada sejak awal tidak bisa terlewat atau terbaca
 * dua kali walau peserta baru masuk di tengah pembacaan, jadi berkasnya utuh
 * tanpa perlu membandingkan jumlah.
 */
async function bacaBerurut<T extends { id: string | number }>(buat: () => KueriKeyset<T>): Promise<T[]> {
  const semua: T[] = [];
  let terakhir: string | number | null = null;
  for (;;) {
    let kueri = buat();
    if (terakhir !== null) kueri = kueri.gt("id", terakhir);
    const { data, error } = await kueri.order("id", { ascending: true }).limit(1000);
    if (error) throw new Error(error.message);
    const baris = data ?? [];
    semua.push(...baris);
    if (baris.length < 1000) return semua;
    terakhir = baris[baris.length - 1].id;
  }
}

type KueriKeyset<T> = {
  gt(kolom: string, nilai: string | number): KueriKeyset<T>;
  order(kolom: string, opsi: { ascending: boolean }): KueriKeyset<T>;
  limit(jumlah: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

type BarisForm = { id: number; participant_id: string | null; created_at: string };

/** Form pertama semua peserta acara. `lengkap` untuk unduhan (lihat `bacaBerurut`). */
async function semuaFormPertama(eventId: string, lengkap = false) {
  const buat = () => formAcara(eventId);
  const baris = lengkap
    ? await bacaBerurut<BarisForm>(() => buat() as unknown as KueriKeyset<BarisForm>)
    : await bacaSemua<BarisForm>(() => buat().order("id", { ascending: true }) as unknown as KueriBerhalaman<BarisForm>, (b) => String(b.id));
  const peta = new Map<string, string>();
  tambahForm(peta, baris);
  return peta;
}

/** Satu halaman tabel. */
export async function halamanKlien(eventId: string, opsi: { q: string; sort: UrutKlien; dir: "asc" | "desc"; limit: number; offset: number }) {
  const cari = filterCari(opsi.q);
  return opsi.sort === "registered_at" ? halamanMenurutWaktu(eventId, cari, opsi) : halamanMenurutKolom(eventId, cari, opsi);
}

/** Urut nama/organisasi: urutan dan halaman langsung dari database. */
async function halamanMenurutKolom(eventId: string, cari: string | null, opsi: { sort: UrutKlien; dir: "asc" | "desc"; limit: number; offset: number }) {
  let kueri = pesertaAktif(eventId);
  if (cari) kueri = kueri.or(cari);
  const { data, error, count } = await kueri
    .order(KOLOM_URUT[opsi.sort], { ascending: opsi.dir === "asc", nullsFirst: false })
    .order("id", { ascending: true })
    .range(opsi.offset, opsi.offset + opsi.limit - 1);
  // Halaman lewat akhir daftar (mis. peserta dihapus saat klien di halaman
  // terakhir): PostgREST menjawab 416. Itu halaman kosong, bukan galat (QA R2-L1).
  if (error && (error as { code?: string }).code === "PGRST103") return { rows: [], total: await jumlahAktif(eventId, cari) };
  if (error) throw new Error(error.message);
  const baris = (data ?? []) as unknown as BarisDb[];
  const form = await formUntuk(eventId, baris.map((b) => b.id));
  return { rows: baris.map((b) => keBaris(b, form)), total: count ?? 0 };
}

/**
 * Urut waktu terdaftar. Waktunya gabungan dua tabel, jadi database tidak bisa
 * mengurutkannya tanpa RPC: baca id + waktu semua peserta yang cocok (dua
 * kolom, bersamaan per 1000), urutkan di sini, lalu ambil isi satu halaman.
 */
async function halamanMenurutWaktu(eventId: string, cari: string | null, opsi: { dir: "asc" | "desc"; limit: number; offset: number }) {
  const client = getSupabaseServiceClient();
  const [indeks, form] = await Promise.all([
    bacaSemua<{ id: string; created_at: string }>(() => {
      let kueri = client.from("participants").select("id,created_at", { count: "exact" }).eq("event_id", eventId).is("source_removed_at", null);
      if (cari) kueri = kueri.or(cari);
      return kueri.order("id", { ascending: true });
    }, (b) => b.id),
    semuaFormPertama(eventId),
  ]);
  const arah = opsi.dir === "asc" ? 1 : -1;
  const urut = indeks
    .map((b) => ({ id: b.id, waktu: Date.parse(waktuTerdaftar(b.id, b.created_at, form)) }))
    .sort((a, b) => (a.waktu - b.waktu) * arah || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ids = urut.slice(opsi.offset, opsi.offset + opsi.limit).map((b) => b.id);
  if (!ids.length) return { rows: [], total: indeks.length };
  const { data, error } = await getSupabaseServiceClient()
    .from("participants")
    .select(PILIH)
    .in("id", ids)
    .limit(1, { referencedTable: "attendance_scans" });
  if (error) throw new Error(error.message);
  const perId = new Map(((data ?? []) as unknown as BarisDb[]).map((b) => [b.id, b]));
  const rows = ids.flatMap((id) => {
    const b = perId.get(id);
    return b ? [keBaris(b, form)] : [];
  });
  return { rows, total: indeks.length };
}

async function jumlahAktif(eventId: string, cari: string | null) {
  let kueri = getSupabaseServiceClient().from("participants").select("id", { count: "exact", head: true }).eq("event_id", eventId).is("source_removed_at", null);
  if (cari) kueri = kueri.or(cari);
  const { count, error } = await kueri;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Semua baris untuk unduhan, urut waktu terdaftar. */
export async function semuaBarisKlien(eventId: string): Promise<BarisKlien[]> {
  const [baris, form] = await Promise.all([
    bacaBerurut<BarisDb>(() => pesertaAktif(eventId) as unknown as KueriKeyset<BarisDb>),
    semuaFormPertama(eventId, true),
  ]);
  return baris
    .map((b) => keBaris(b, form))
    .sort((a, b) => Date.parse(a.registered_at) - Date.parse(b.registered_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Awal hari ini di zona acara. "Hari ini" klien adalah hari di lokasi acara. */
function awalHariIni(zona: EventTimeZone) {
  const tanggal = new Date().toLocaleDateString("en-CA", { timeZone: zona });
  return new Date(`${tanggal}T00:00:00${timeZoneOffset(zona)}`).toISOString();
}

/**
 * Angka kartu. Semuanya hitungan `head`: tidak ada baris yang ditarik.
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

  const tengahMalam = awalHariIni(zona);
  // "Today" memakai waktu yang tampil: least(created_at, form pertama) >= tengah
  // malam. Itu baris yang dibuat hari ini dikurangi yang formnya sudah masuk
  // sebelum tengah malam (mis. form kemarin, disetujui hari ini).
  //
  // Yang dikurangi dihitung dari sisi event_registrations, disaring per acara
  // (pakai indeks event_id): kebalikannya jadi subkueri per peserta tanpa indeks
  // participant_id, 2,8 detik di 50 ribu form (QA R3-H1).
  const [terdaftar, dibuatHariIni, formKemarin, menunggu, dipindai, hadirSumber] = await Promise.all([
    aktif(),
    aktif().gte("created_at", tengahMalam),
    bacaSemua<{ id: number; participant_id: string }>(
      () =>
        client
          .from("event_registrations")
          .select("id,participant_id,participants!inner(id)", { count: "exact" })
          .eq("event_id", eventId)
          .lt("created_at", tengahMalam)
          .gte("participants.created_at", tengahMalam)
          .is("participants.source_removed_at", null)
          .order("id", { ascending: true }) as unknown as KueriBerhalaman<{ id: number; participant_id: string }>,
      (b) => b.participant_id,
    ),
    client.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "pending"),
    aktif("id,attendance_scans!inner(id)"),
    aktif("id,attendance_scans(id)").eq("source_checked_in", true).is("attendance_scans", null),
  ]);
  const galat = [terdaftar, dibuatHariIni, menunggu, dipindai, hadirSumber].find((hasil) => hasil.error)?.error;
  if (galat) throw new Error(galat.message);
  return {
    registered: terdaftar.count ?? 0,
    today: Math.max(0, (dibuatHariIni.count ?? 0) - formKemarin.length),
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
