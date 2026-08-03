import { z } from "zod";
import { apiError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
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
// — yang tetap dijaga hanya batas publish, agar draf tidak bocor.

const querySchema = z.object({ sesi: z.string().trim().max(40).optional() });

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();

  // Zona acara ikut dikirim karena penanda "sedang berlangsung" dihitung di
  // browser tamu. Halaman ini publik, jadi ia tidak bisa membaca /api/settings
  // yang butuh login; polanya mengikuti /api/seat-map yang sudah membaca
  // event_settings dengan cara sama.
  const [sectionResult, settingsResult, headerResult] = await Promise.all([
    client
      .from("rundown_sections")
      .select(SECTION_COLUMNS)
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    client.from("event_settings").select("time_zone").eq("id", 1).maybeSingle(),
    // Header dibaca sekali dan berlaku untuk seluruh tab, jadi ia tidak ikut
    // berubah saat tamu berpindah agenda.
    client.from("rundown_settings").select(HEADER_COLUMNS).eq("id", 1).maybeSingle(),
  ]);
  const { data: sectionRows, error: sectionError } = sectionResult;
  if (sectionError) return apiError("INTERNAL_ERROR", 500);

  // Setelan yang gagal dibaca tidak menggagalkan rundown: normalizeTimeZone
  // menjatuhkannya ke WIB, dan jadwalnya tetap tampil.
  const timeZone = normalizeTimeZone((settingsResult.data as { time_zone?: string } | null)?.time_zone);
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

  const { data: itemRows, error: itemError } = await client
    .from("rundown_items")
    .select(ITEM_COLUMNS)
    .eq("section_id", section.id)
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .order("start_time", { ascending: true })
    .order("id", { ascending: true });
  if (itemError) return apiError("INTERNAL_ERROR", 500);

  return Response.json({
    published: true,
    // Hanya slug dan nama: tab tidak perlu tahu isi section lain, dan mengirim
    // seluruh barisnya membuat muatan tumbuh sia-sia setiap kali tab ditambah.
    sections: sections.map((row) => ({ slug: row.slug, name: row.name })),
    section,
    items: (itemRows ?? []) as unknown as RundownItem[],
    time_zone: timeZone,
    header,
  });
}
