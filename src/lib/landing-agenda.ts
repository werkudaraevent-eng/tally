import { getSupabaseServiceClient } from "./supabase/service";
import { formatClock } from "./rundown";
import type { KelompokBaris } from "./agenda-kelompok";
import { barisPublikBersyarat } from "./agenda-publik-server";
import { bacaSyaratBaris, barisUntukPeserta, type SyaratBaris } from "./sasaran-baris";
import { muatDataSasaran } from "./sasaran-blok-server";

/** Jam halaman publik, sama dengan baris jam di hero: "08.00" (Indonesia) atau "08:00" (English). */
function jamTitik(jam: string, bahasa: "id" | "en"): string {
  return bahasa === "en" ? jam : jam.replace(":", ".");
}

/**
 * Ringkasan susunan acara untuk landing page.
 *
 * Membaca tabel rundown yang SUDAH ADA, bukan CMS agenda kedua. Dua tempat
 * menyunting jadwal yang sama adalah cara paling pasti membuat landing page dan
 * layar rundown menampilkan jam yang berbeda di hari-H — dan yang dipercaya tamu
 * adalah yang ia baca lebih dulu.
 *
 * Yang diambil jam, judul, dan keterangan (pembicara) tiap sesi. Rincian lain
 * tetap di `/rundown`, tempat panitia memang mengelolanya.
 *
 * Hanya bagian dan baris yang diterbitkan, sama dengan layar `/rundown`
 * (api/rundown): yang disembunyikan panitia di Rundown tidak boleh bocor lewat
 * halaman acara. Pratinjau admin memakai fungsi ini juga, jadi ikut sama.
 */
/**
 * `id` adalah id baris `rundown_items`, kunci tetap yang dipegang pembicara
 * (`speaker.session_refs`). `key` adalah judul Indonesia baris itu, juga di
 * halaman English: sesi teks lama pembicara ("Sesi 1") dan jeda dicocokkan
 * lewat kunci ini, karena judul barisnya mungkin sudah diterjemahkan.
 * `jeda` menandai baris jeda rundown (makan siang, rehat): pembicara yang
 * memilih baris itu lewat `session_refs` tidak ditampilkan di sana.
 */
export type AgendaItem = {
  id: number;
  time: string;
  end: string | null;
  title: string;
  subtitle: string | null;
  key: string;
  jeda: boolean;
  /**
   * Halaman acara sebelum masuk saja: label kelompok baris bersyarat ("Batch 1"),
   * dari labelAgendaPublik. Kosong untuk baris tanpa syarat dan untuk portal.
   */
  untuk?: string | null;
  /** Halaman acara sebelum masuk saja: jawaban baris berlabel per kelompok (agenda-kelompok.ts). */
  kelompok?: KelompokBaris[] | null;
};

export type AgendaPreview = {
  /** Id baris `rundown_sections` (outfit per hari di portal Horizon). */
  id?: number;
  sectionTitle: string | null;
  /** Hari pendek bagian dalam bahasa halaman, mis. "Kam 15" atau "Thu 15". */
  hari: string | null;
  /** Tanggal bagian "YYYY-MM-DD" apa adanya, untuk label panjang (kartu hari gathering). */
  tanggal: string | null;
  items: AgendaItem[];
  /**
   * Halaman acara sebelum masuk saja: jawaban per kelompok yang bisa dipilih
   * tamu ("Batch 1", "Batch 2"), sama di setiap bagian. Kosong = tanpa pilihan.
   */
  pilihan?: string[][];
};

/**
 * Siapa yang membaca agenda. Tanpa penonton (halaman acara publik, pratinjau
 * admin, badge) baris bersyarat selalu disembunyikan. Peserta yang masuk
 * melihat baris yang syaratnya cocok dengan datanya; `participantId` null
 * (akun tanpa peserta, pratinjau tanpa pilihan) berarti tidak ada yang cocok.
 */
export type PenontonAgenda = {
  acara: { id: string; registration_form_config: unknown };
  participantId: string | null;
  /** Participant area > show_logistics: hotel peserta hanya dibaca bila kamar ditampilkan. */
  tampilKamar: boolean;
};

/**
 * Jumlah hari acara menurut tanggal bagian, bukan jumlah tab: dua bagian di
 * tanggal yang sama (Batch 1 dan Batch 2) tetap satu hari. Bagian tanpa tanggal
 * dihitung satu hari masing-masing.
 */
export function jumlahHariAgenda(agenda: Array<Pick<AgendaPreview, "tanggal">>): number {
  const tanggal = new Set(agenda.map((bagian) => bagian.tanggal).filter(Boolean));
  return tanggal.size + agenda.filter((bagian) => !bagian.tanggal).length;
}

/** "2026-10-15" menjadi "Kam 15" (Indonesia) atau "Thu 15" (English). */
function hariPendek(tanggal: string | null, bahasa: "id" | "en"): string | null {
  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return null;
  const teks = new Date(`${tanggal}T00:00:00Z`).toLocaleDateString(bahasa === "en" ? "en-GB" : "id-ID", { weekday: "short", day: "numeric", timeZone: "UTC" });
  return teks.replace(",", "");
}

/**
 * Batas per bagian. Halaman acara menampilkan susunan lengkap satu bagian
 * sekaligus (lewat tab), jadi batasnya hanya pengaman terhadap rundown yang
 * tidak wajar panjangnya, bukan ringkasan.
 */
const MAX_ITEMS = 40;

/** Kolom yang belum ada karena migrasinya belum dijalankan (42703 / PGRST204). */
function kolomBelumAda(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

export async function loadAgendaPreview(eventId: string, bahasa: "id" | "en" = "id", penonton?: PenontonAgenda): Promise<AgendaPreview[]> {
  const client = getSupabaseServiceClient();

  const bacaSeksi = (kolom: string) =>
    client
      .from("rundown_sections")
      .select(kolom)
      .eq("event_id", eventId)
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
  const KOLOM_SEKSI = "id,name,title,event_date,sort_order";
  const seksiPertama = await bacaSeksi(`${KOLOM_SEKSI},show_before_sign_in`);
  // Sebelum migrasi 202610260001 kolom `show_before_sign_in` belum ada: semua
  // bagian masih tampil sebelum masuk, jadi dibaca ulang tanpa kolom itu.
  const sections = kolomBelumAda(seksiPertama.error) ? (await bacaSeksi(KOLOM_SEKSI)).data : seksiPertama.data;

  // Tanpa penonton = pengunjung yang belum masuk (halaman acara): hari yang
  // Show before sign-in-nya dimatikan hanya untuk portal peserta.
  const daftarSeksi = ((sections ?? []) as unknown as Array<{ id: number; name: string | null; title: string | null; event_date: string | null; show_before_sign_in?: boolean | null }>)
    .filter((section) => penonton || section.show_before_sign_in !== false);
  if (daftarSeksi.length === 0) return [];

  const bacaBaris = (kolom: string) =>
    client
      .from("rundown_items")
      .select(kolom)
      .in("section_id", daftarSeksi.map((section) => section.id))
      .eq("is_published", true)
      // Urutan yang sama dengan CMS rundown: jam mulai, lalu sort_order untuk
      // butir berjam sama (sesi paralel), lalu id sebagai pemutus terakhir.
      .order("start_time", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
  const KOLOM = "id,section_id,title,subtitle,title_en,subtitle_en,start_time,end_time,is_break,sort_order";
  const pertama = await bacaBaris(`${KOLOM},audience`);
  // Sebelum migrasi 202610210001 kolom `audience` belum ada (42703): belum ada
  // baris bersyarat, jadi dibaca ulang tanpa kolom itu.
  const items = kolomBelumAda(pertama.error) ? (await bacaBaris(KOLOM)).data : pertama.data;

  const daftarItem = (items ?? []) as unknown as Array<{
    id: number;
    section_id: number;
    title: string | null;
    subtitle: string | null;
    title_en: string | null;
    subtitle_en: string | null;
    start_time: string | null;
    end_time: string | null;
    is_break: boolean | null;
    audience?: unknown;
  }>;

  // Who sees it per baris. Data peserta hanya dibaca bila ada baris bersyarat,
  // jadi acara yang tidak memakainya berubah 0 px dan tidak membaca apa pun.
  const syarat = new Map<number, SyaratBaris>();
  for (const item of daftarItem) {
    const isi = bacaSyaratBaris(item.audience);
    if (isi) syarat.set(item.id, isi);
  }
  const dataPeserta = syarat.size > 0 && penonton?.participantId
    ? await muatDataSasaran(penonton.acara, penonton.participantId, [...syarat.values()].flat(), penonton.tampilKamar)
    : null;
  // Tanggal baris = tanggal bagiannya: Hotel cocok dengan stay yang berlaku
  // hari itu (peserta yang pindah hotel).
  const tanggalSeksi = new Map(daftarSeksi.map((section) => [section.id, section.event_date && /^\d{4}-\d{2}-\d{2}$/.test(section.event_date) ? section.event_date : null]));
  const tanggalItem = new Map(daftarItem.map((item) => [item.id, tanggalSeksi.get(item.section_id) ?? null]));
  // Tanpa penonton = halaman acara sebelum masuk: Who sees it hanya berlaku
  // sesudah masuk (keputusan Hanung 2026-10-26, pola agenda publik Whova/Sched),
  // jadi hari yang tampil sebelum masuk menampilkan semua barisnya. Penonton
  // tanpa peserta (akun pendaftar) tetap gagal tertutup.
  const tersembunyi = !penonton
    ? new Set<number>()
    : new Set([...syarat].filter(([id, isi]) => !barisUntukPeserta(isi, dataPeserta, tanggalItem.get(id) ?? null)).map(([id]) => id));
  // Sebelum masuk: label kelompok, dan baris yang tidak cocok dengan siapa pun tetap tersembunyi.
  const publik = !penonton ? await barisPublikBersyarat(eventId, syarat) : null;
  for (const id of publik?.tersembunyi ?? []) tersembunyi.add(id);
  const label = publik?.label ?? new Map<number, string>();
  const kelompok = publik?.kelompok ?? new Map<number, KelompokBaris[]>();
  const pilihan = publik?.pilihan ?? [];

  return daftarSeksi
    .map((section) => ({
      id: section.id,
      // Label tab yang disunting di CMS Rundown. Kolom `title` tidak lagi punya
      // isian di CMS (hanya terisi saat bagian dibuat), jadi ia hanya cadangan.
      sectionTitle: section.name?.trim() || section.title?.trim() || null,
      hari: hariPendek(section.event_date, bahasa),
      tanggal: section.event_date && /^\d{4}-\d{2}-\d{2}$/.test(section.event_date) ? section.event_date : null,
      ...(pilihan.length > 0 ? { pilihan } : {}),
      items: daftarItem
        .filter((item) => item.section_id === section.id && !tersembunyi.has(item.id))
        .slice(0, MAX_ITEMS)
        .map((item) => ({
          id: item.id,
          time: jamTitik(formatClock(item.start_time), bahasa),
          end: item.end_time ? jamTitik(formatClock(item.end_time), bahasa) : null,
          // English jatuh ke teks Indonesia per kolom, sama dengan isi halaman lainnya.
          title: (bahasa === "en" && item.title_en?.trim()) || item.title || "",
          // Keterangan English hanya tampil bila baris Indonesianya punya
          // keterangan: terjemahan yang tertinggal tidak bisa dilihat di editor.
          subtitle: item.subtitle?.trim() ? (bahasa === "en" && item.subtitle_en?.trim()) || item.subtitle.trim() : null,
          key: item.title ?? "",
          jeda: Boolean(item.is_break),
          untuk: label.get(item.id) ?? null,
          kelompok: kelompok.get(item.id) ?? null,
        }))
        // Baris tanpa judul adalah pemisah visual di layar rundown. Di ringkasan
        // ia hanya menjadi baris kosong yang terbaca sebagai data yang hilang.
        .filter((item) => item.title.trim().length > 0),
    }))
    .filter((section) => section.items.length > 0);
}
