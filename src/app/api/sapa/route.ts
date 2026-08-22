import { apiError } from "@/lib/api";
import { getPublicRequestEvent } from "@/lib/auth/request-event";
import { normalizeBranding } from "@/lib/branding";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  DEFAULT_GREETING,
  GREETING_COLUMNS,
  greetingName,
  type Greeting,
  type GreetingConfig,
  type Lane,
  type Pairing,
} from "@/lib/greeting-config";

/**
 * Umpan Layar sapa.
 *
 * GET publik: layar ini menyala di lobi tanpa ada yang login di depannya, sama
 * seperti papan peringkat dan denah LED.
 *
 * ---- Yang dikirim, dan yang TIDAK ------------------------------------------
 *
 * Hanya nama dan instansi orang yang BARU SAJA dipindai di jalur layar ini,
 * sebanyak yang muat di layar. Bukan daftar hadir, bukan jumlah total, bukan
 * kode QR siapa pun. Endpoint yang melayani layar besar harus mengirim persis
 * sebanyak yang akan tergambar — bukan seluruh daftar tamu yang lalu dipotong di
 * browser.
 *
 * `allow_name_display` dihormati di sini, bukan di komponen layar. Kalau
 * penyamarannya dikerjakan di browser, nama aslinya tetap melintas di tab
 * Network siapa pun yang membuka alamat yang sama.
 *
 * ---- Tiga cara layar mengetahui jalurnya -----------------------------------
 *
 * 1. `?jalur=<slug>` — untuk pemutar signage yang memang disetel lewat URL, dan
 *    untuk panitia yang sedang menguji dari laptop.
 * 2. `?jalur=semua` — layar tunggal di pintu utama yang sengaja menyapa semua
 *    meja meski jalur sudah dipakai.
 * 3. `?device=<uuid>` — jalur bawaan. Layar mendaftarkan dirinya, menampilkan
 *    kode enam digit, dan petugas di meja itu mengklaimnya dari /scan.
 *
 * Kode pemasangan hanya muncul kalau jalurnya LEBIH DARI SATU. Ia menjawab
 * pertanyaan "TV ini melayani meja yang mana", dan pertanyaan itu tidak ada
 * ketika mejanya cuma satu — apalagi ketika tidak ada jalur sama sekali. Dua
 * keadaan itu langsung menyapa semua tamu yang masuk.
 */

export const dynamic = "force-dynamic";

type BarisScan = {
  id: number;
  scanned_at: string;
  participants: {
    name: string;
    company: string | null;
    allow_name_display: boolean;
    source_removed_at: string | null;
  } | null;
};

type LayarRow = {
  lane_id: number | null;
  pairing_code: string | null;
  pairing_expires_at: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const event = await getPublicRequestEvent(request);
  // Acara yang tidak bisa ditentukan (mis. dua acara aktif dan alamatnya tidak
  // menyebut slug) dijawab dengan konfigurasi bawaan dan tanpa nama, bukan
  // dengan galat. Layar di lobi tidak punya siapa pun di depannya untuk membaca
  // pesan galat, dan tampilan bawaan yang sepi jauh lebih tidak memalukan
  // daripada layar merah bertuliskan 404.
  if (!event) {
    return Response.json({ config: DEFAULT_GREETING, lane: null, pairing: null, greetings: [] satisfies Greeting[] });
  }

  const client = getSupabaseServiceClient();
  const params = new URL(request.url).searchParams;

  const [setelan, jalurQuery] = await Promise.all([
    client.from("greeting_settings").select(GREETING_COLUMNS).eq("event_id", event.id).maybeSingle(),
    client
      .from("attendance_lanes")
      .select("id,name,slug")
      .eq("event_id", event.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  // Digabung dengan nilai bawaan supaya kolom yang belum terisi tidak membuat
  // layar kehilangan properti lalu gagal render di depan tamu. Branding
  // dinormalisasi terpisah SETELAH penggabungan: kolom skala bertipe `numeric`
  // dan driver Postgres mengirimkannya sebagai string demi menjaga presisi.
  const config: GreetingConfig = {
    ...DEFAULT_GREETING,
    ...((setelan.data ?? {}) as Partial<GreetingConfig>),
    ...normalizeBranding((setelan.data ?? null) as Record<string, unknown> | null),
  };
  const lanes = (jalurQuery.data ?? []) as Lane[];

  // Layar yang dimatikan di CMS tetap menjawab, tetapi tanpa satu pun nama.
  // Mengembalikan 404 akan membuat layar di lobi menampilkan galat, padahal yang
  // terjadi adalah panitia sengaja mematikannya.
  if (!config.is_enabled) {
    return Response.json({ config, lane: null, pairing: null, greetings: [] satisfies Greeting[] });
  }

  const jalurParam = params.get("jalur");
  const device = params.get("device");

  let lane: Lane | null = null;
  let pairing: Pairing | null = null;
  let laneUnknown = false;

  if (jalurParam === "semua") {
    // Sengaja menyapa semua meja. Tidak ada pemasangan, tidak ada kode.
  } else if (jalurParam) {
    lane = lanes.find((baris) => baris.slug === jalurParam) ?? null;
    // Slug yang salah ketik TIDAK mengosongkan layar. Ia jatuh ke "semua jalur"
    // sambil menyalakan penanda, supaya layar tetap berguna sementara panitia
    // membetulkan alamatnya — bukan berhenti bekerja di tengah acara karena satu
    // huruf.
    laneUnknown = lane === null;
  } else if (lanes.length === 1 && device && UUID.test(device)) {
    // Satu jalur = tidak ada yang perlu ditanyakan.
    //
    // Kode pemasangan menjawab pertanyaan "TV ini melayani meja yang mana", dan
    // pertanyaan itu hanya ada kalau mejanya lebih dari satu. Memintanya di acara
    // bermeja tunggal berarti menyuruh panitia mengetik enam angka untuk memilih
    // dari satu pilihan.
    //
    // Layarnya TETAP didaftarkan supaya muncul di daftar "Layar terhubung" di
    // CMS — panitia harus bisa melihat TV mana yang sudah mati, dan itu berlaku
    // baik di acara satu meja maupun lima.
    await client.rpc("touch_greeting_screen" as never, { p_event_id: event.id, p_device: device } as never);
    lane = lanes[0];
  } else if (lanes.length > 1 && device && UUID.test(device)) {
    const { data } = await client.rpc("touch_greeting_screen" as never, {
      p_event_id: event.id,
      p_device: device,
    } as never);
    const layar = (data ?? null) as LayarRow | null;
    lane = lanes.find((baris) => baris.id === layar?.lane_id) ?? null;

    if (lane === null) {
      // Belum terpasang — atau terpasang ke jalur yang sudah dinonaktifkan.
      // Keduanya berakhir sama: layar meminta dipasang ulang, bukan diam-diam
      // menyapa meja yang salah.
      if (layar?.pairing_code && layar.pairing_expires_at) {
        pairing = { code: layar.pairing_code, expires_at: layar.pairing_expires_at };
      }
      return Response.json({ config, lane: null, pairing, greetings: [] satisfies Greeting[], laneUnknown: false });
    }
  }

  let kueri = client
    .from("attendance_scans")
    .select("id,scanned_at,participants(name,company,allow_name_display,source_removed_at)")
    .eq("event_id", event.id)
    .order("scanned_at", { ascending: false })
    // Satu lebih banyak daripada yang dipakai: baris peserta yang sudah
    // dibatalkan dibuang setelah kueri, dan tanpa cadangan deretan "baru saja
    // masuk" bisa tampil kurang satu tanpa sebab yang terlihat.
    .limit(Math.min(24, config.recent_limit + 4));

  if (config.session_id !== null) kueri = kueri.eq("session_id", config.session_id);
  if (lane !== null) kueri = kueri.eq("lane_id", lane.id);
  // Pemindaian ulang disaring di database, bukan di browser. Layar yang menyapa
  // hanya kedatangan pertama tidak boleh menerima daftar berisi pengulangan lalu
  // membuangnya sendiri — pada jam sibuk sebagian besar isinya justru terbuang,
  // dan yang tersisa lebih sedikit daripada yang muat di layar.
  if (!config.greet_duplicates) kueri = kueri.eq("is_duplicate", false);

  const { data, error } = await kueri;
  if (error) return apiError("INTERNAL_ERROR", 500);

  const greetings: Greeting[] = ((data ?? []) as unknown as BarisScan[])
    // Peserta yang pendaftarannya dibatalkan panitia pusat tidak disapa. Namanya
    // sudah dicabut dari daftar tamu, dan memajangnya di layar sambutan adalah
    // satu-satunya tempat pembatalan itu tidak terlihat.
    .filter((baris) => baris.participants !== null && baris.participants.source_removed_at === null)
    .slice(0, config.recent_limit)
    .map((baris) => ({
      id: baris.id,
      name: greetingName(baris.participants!.name, baris.participants!.allow_name_display),
      company: config.show_company ? baris.participants!.company : null,
      scanned_at: baris.scanned_at,
    }));

  return Response.json({ config, lane, pairing: null, greetings, laneUnknown });
}
