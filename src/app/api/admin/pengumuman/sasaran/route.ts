import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { bagianTampil } from "@/lib/logistik/bagian-tampil";
import { semuaBaris } from "@/lib/logistik/server";
import { memberConfig } from "@/lib/member/account";
import { akunPenerima, penerimaSchema, penerimaSiap, periksaPenerima, pesertaCocok } from "@/lib/pengumuman-penerima-server";
import { kolomSasaran } from "@/lib/sasaran-bagian";
import { muatHotel } from "@/lib/sasaran-baris-server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Messages > Announcements > Send to: pilihan syarat dan hitungan penerima.
//
//   GET   kolom pilihan peserta, hotel Logistics, dan organisasi peserta untuk
//         "Participants who match". `available` false: migrasi 202610300004
//         belum dijalankan. Akun peran kustom tidak mendapat hotel.
//   POST  {audience, audience_rules?, audience_ids?}: berapa peserta yang
//         cocok dan berapa akun yang melihatnya sekarang, dengan aturan yang
//         sama dengan portal. Untuk `pilih` juga nama peserta terpilih, untuk
//         chip di penyunting.

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const kustom = auth.scope.role === "custom";
  const db = getSupabaseServiceClient();

  const [siap, hotels, perusahaan] = await Promise.all([
    penerimaSiap(),
    kustom ? Promise.resolve([]) : muatHotel(event.id),
    semuaBaris<{ company: string | null }>(() => db.from("participants").select("company").eq("event_id", event.id).is("source_removed_at", null).order("id")),
  ]);
  const hitung = new Map<string, { company: string; count: number }>();
  for (const baris of perusahaan ?? []) {
    const nama = baris.company?.trim() ?? "";
    if (!nama) continue;
    // Satu entri per nama tanpa beda huruf besar, sama dengan cara portal mencocokkan.
    const kunci = nama.toLocaleLowerCase("id");
    const ada = hitung.get(kunci);
    hitung.set(kunci, { company: ada?.company ?? nama, count: (ada?.count ?? 0) + 1 });
  }
  return Response.json({
    available: siap,
    fields: kolomSasaran(event.registration_form_config),
    hotels: hotels ?? [],
    hotels_failed: hotels === null,
    hotels_hidden: kustom,
    rooms_shown: bagianTampil(memberConfig(event), "rooms"),
    companies: [...hitung.values()].sort((a, b) => a.company.localeCompare(b.company, "id")),
    companies_failed: perusahaan === null,
  });
}

export async function POST(request: Request) {
  // Hanya membaca: hitungan tetap jalan di acara Completed atau Archived.
  const auth = await requireRequestEvent(request, ["admin"], { readOnly: true });
  if (auth.response) return auth.response;
  const event = auth.scope.event;

  const parsed = penerimaSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const sah = await periksaPenerima(parsed.data, event, auth.scope.role === "custom");
  if ("galat" in sah) return sah.galat ? apiError("VALIDATION_ERROR", 422, { message: sah.galat }) : apiError("INTERNAL_ERROR", 500);

  const [peserta, akun] = await Promise.all([pesertaCocok(event, sah.penerima), akunPenerima(event, sah.penerima)]);
  if (!peserta || !akun) return apiError("INTERNAL_ERROR", 500);
  return Response.json({
    matches: peserta.cocok.length,
    total: peserta.total,
    accounts: akun.length,
    // Hanya nama dan organisasi, tidak pernah QR atau kolom lain.
    people: sah.penerima.audience === "pilih" ? peserta.cocok.map((orang) => ({ id: orang.id, name: orang.name, company: orang.company })) : undefined,
  });
}
