import { z } from "zod";
import { apiErrorPeserta } from "@/lib/api";
import { getPublicRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { barisPublikBersyarat } from "@/lib/agenda-publik-server";
import { bacaSyaratBaris, type SyaratBaris } from "@/lib/sasaran-baris";
import { DEFAULT_HEADER, HEADER_COLUMNS, ITEM_COLUMNS, SECTION_COLUMNS, type RundownHeader, type RundownItem, type RundownSection } from "@/lib/rundown";
import { normalizeTimeZone } from "@/lib/timezone";

// Rundown publik. Tanpa login, dibuka tamu dari ponsel di lokasi.
//
// Mengikuti pola /api/seat-map: pakai service client di route handler, bukan anon
// client dari browser, sehingga aturan apa yang boleh keluar diputuskan di satu
// tempat di server.
//
// Tidak ada data peserta di sini sama sekali. Rundown adalah informasi yang justru
// ingin diketahui semua orang, jadi tidak ada penyaringan privasi seperti di denah
// — yang tetap dijaga hanya batas publish, agar draf tidak bocor, dan baris yang
// dibatasi Who sees it, yang hanya untuk peserta tertentu.

const querySchema = z.object({ sesi: z.string().trim().max(40).optional() });

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiErrorPeserta("VALIDATION_ERROR", 422, parsed.error.flatten());

  const event = await getPublicRequestEvent(request);
  if (!event) return apiErrorPeserta("INTERNAL_ERROR", 404);
  const eventId = event.id;
  const client = getSupabaseServiceClient();

  // Zona acara ikut dikirim karena penanda "sedang berlangsung" dihitung di
  // browser tamu. Halaman ini publik, jadi ia tidak bisa membaca /api/settings
  // yang butuh login; polanya mengikuti /api/seat-map yang sudah membaca
  // event_settings dengan cara sama.
  // Hanya bagian yang Show before sign-in-nya menyala: layar ini publik.
  // Sebelum migrasi 202610260001 kolomnya belum ada, jadi semua bagian terbit
  // dibaca seperti dulu.
  const bacaBagian = (sebelumMasuk: boolean) => {
    const kueri = client.from("rundown_sections").select(SECTION_COLUMNS).eq("event_id", eventId).eq("is_published", true);
    return (sebelumMasuk ? kueri.eq("show_before_sign_in", true) : kueri).order("sort_order", { ascending: true }).order("id", { ascending: true });
  };
  const [sectionAwal, settingsResult, headerResult] = await Promise.all([
    bacaBagian(true),
    client.from("event_settings").select("time_zone").eq("event_id", eventId).maybeSingle(),
    // Header dibaca sekali dan berlaku untuk seluruh tab, jadi ia tidak ikut
    // berubah saat tamu berpindah agenda.
    client.from("rundown_settings").select(HEADER_COLUMNS).eq("event_id", eventId).maybeSingle(),
  ]);
  const kolomBelumAda = (kode?: string) => kode === "42703" || kode === "PGRST204";
  const sectionResult = kolomBelumAda(sectionAwal.error?.code) ? await bacaBagian(false) : sectionAwal;
  const { data: sectionRows, error: sectionError } = sectionResult;
  if (sectionError) return apiErrorPeserta("INTERNAL_ERROR", 500);

  // Setelan yang gagal dibaca tidak menggagalkan rundown: normalizeTimeZone
  // menjatuhkannya ke WIB, dan jadwalnya tetap tampil.
  // events.time_zone adalah satu-satunya sumber zona waktu; kolom event_settings
  // hanya cadangan untuk baris lama yang belum punya nilai.
  const timeZone = normalizeTimeZone(event.time_zone ?? (settingsResult.data as { time_zone?: string } | null)?.time_zone);
  // Header yang gagal dibaca jatuh ke nilai bawaan, bukan menggagalkan halaman:
  // jadwal tetap jauh lebih berguna bagi tamu daripada layar error.
  const header = (headerResult.data as unknown as RundownHeader | null) ?? DEFAULT_HEADER;

  const sections = (sectionRows ?? []) as unknown as RundownSection[];
  if (sections.length === 0) {
    // Bukan error: sebelum hari H memang belum ada yang dipublikasikan. Halaman
    // publik menampilkan pesan tunggu, bukan layar rusak.
    return Response.json({ published: false, sections: [], section: null, items: [], time_zone: timeZone, header });
  }

  // Slug yang tidak dikenal jatuh ke section pertama, tidak menghasilkan 404.
  // Alasannya: tautan rundown dibagikan lewat QR dan pesan grup, dan salah satu
  // slug yang kedaluwarsa (mis. admin mengganti slug setelah QR dicetak) tidak
  // boleh membuat tamu melihat halaman error. Section pertama selalu jawaban yang
  // masuk akal, dan tab tetap tersedia untuk berpindah.
  const requested = parsed.data.sesi;
  const section = (requested ? sections.find((row) => row.slug === requested) : null) ?? sections[0];

  // Semua baris terbit hari ini, termasuk yang punya Who sees it: syarat itu
  // hanya berlaku sesudah masuk (keputusan Hanung 2026-10-26). Hari yang tidak
  // boleh terbaca publik dimatikan lewat Show before sign-in di atas. Baris
  // bersyarat mendapat label kelompoknya, dan yang tidak cocok dengan siapa pun
  // tetap tersembunyi (barisPublikBersyarat). Kolom `audience` sendiri tidak
  // pernah ikut dikirim.
  const bacaBaris = (kolom: string) =>
    client
      .from("rundown_items")
      .select(kolom)
      .eq("event_id", eventId)
      .eq("section_id", section.id)
      .eq("is_published", true)
      // Jam mulai dulu, sama dengan CMS rundown; sort_order hanya memisahkan
      // butir berjam sama.
      .order("start_time", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
  const itemAwal = await bacaBaris(`${ITEM_COLUMNS},audience`);
  // Sebelum migrasi 202610210001 kolom `audience` belum ada: belum ada baris bersyarat.
  const { data: itemRows, error: itemError } = kolomBelumAda(itemAwal.error?.code) ? await bacaBaris(ITEM_COLUMNS) : itemAwal;
  if (itemError) return apiErrorPeserta("INTERNAL_ERROR", 500);
  const baris = (itemRows ?? []) as unknown as Array<RundownItem & { audience?: unknown }>;
  const syarat = new Map<number, SyaratBaris>();
  for (const item of baris) {
    const isi = bacaSyaratBaris(item.audience);
    if (isi) syarat.set(item.id, isi);
  }
  const { tersembunyi, label } = await barisPublikBersyarat(eventId, syarat);
  const items: RundownItem[] = baris
    .filter((item) => !tersembunyi.has(item.id))
    .map(({ audience: _audience, ...item }) => {
      void _audience;
      return label.has(item.id) ? { ...item, untuk: label.get(item.id) } : item;
    });

  return Response.json({
    published: true,
    // Hanya slug dan nama: tab tidak perlu tahu isi section lain, dan mengirim
    // seluruh barisnya membuat muatan tumbuh sia-sia setiap kali tab ditambah.
    sections: sections.map((row) => ({ slug: row.slug, name: row.name })),
    section,
    items,
    time_zone: timeZone,
    header,
  });
}
