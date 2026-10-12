import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { landingBlockHasContent, landingBlockShownOn, normalizeLandingSections, type EventLandingConfig } from "@/lib/domain";
import { memberSchema } from "@/lib/landing-body-schema";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Setelan area peserta (menu admin "Area peserta").
 *
 * Disimpan di `landing_config.member`, kolom yang sama dengan halaman acara,
 * tetapi PATCH di sini hanya menulis kunci `member` di atas salinan server
 * yang terbaru. Editor Halaman acara tidak lagi menulis `member`, jadi dua
 * layar ini tidak saling menimpa, ke arah mana pun urutan Simpan-nya.
 *
 * GET ikut mengembalikan jumlah peserta per pilihan "Siapa yang bisa masuk",
 * supaya panitia melihat siapa yang tertinggal sebelum memilih, blok yang
 * tampil di halaman peserta (daftar Participant home), dan peserta bawaan
 * untuk pratinjau. `?cari=` hanya mencari peserta untuk pilihan "Preview as".
 */

/** Peserta pratinjau, untuk pilihan "Preview as". */
type PesertaPratinjau = { id: string; name: string; company: string | null };

/** `%` dan `_` dari ketikan admin dicari apa adanya, bukan sebagai wildcard. */
function polaCari(teks: string) {
  return `%${teks.replace(/[\\%_]/g, (huruf) => `\\${huruf}`)}%`;
}

/**
 * Peserta pertama yang punya kamar dan bus: kartu Bus dan Kamar di Beranda
 * hanya muncul untuk peserta yang sudah dialokasikan, jadi pratinjau dengan
 * peserta lain menyembunyikan justru kartu yang sedang diatur. Tanpa alokasi:
 * peserta pertama menurut nama.
 */
async function pesertaBawaan(eventId: string): Promise<PesertaPratinjau | null> {
  const client = getSupabaseServiceClient();
  const [kamar, bus] = await Promise.all([
    client.from("lodging_assignments").select("participant_id").eq("event_id", eventId).limit(1000),
    client.from("transport_assignments").select("participant_id").eq("event_id", eventId).not("vehicle_id", "is", null).limit(1000),
  ]);
  const punyaKamar = new Set(((kamar.data ?? []) as { participant_id: string }[]).map((baris) => baris.participant_id));
  const punyaBus = new Set(((bus.data ?? []) as { participant_id: string }[]).map((baris) => baris.participant_id));
  const keduanya = [...punyaKamar].filter((id) => punyaBus.has(id));
  const salahSatu = [...new Set([...punyaKamar, ...punyaBus])];
  // Pertama menurut nama, berturut-turut: kamar dan bus, salah satunya, siapa saja.
  for (const calon of [keduanya, salahSatu, null]) {
    if (calon && !calon.length) continue;
    let kueri = client.from("participants").select("id,name,company").eq("event_id", eventId).is("source_removed_at", null).order("name").limit(1);
    if (calon) kueri = kueri.in("id", calon.slice(0, 200));
    const { data } = await kueri;
    const pilihan = ((data ?? []) as PesertaPratinjau[])[0];
    if (pilihan) return pilihan;
  }
  return null;
}

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();
  const landing = (auth.scope.event.landing_config ?? {}) as EventLandingConfig;

  const cari = new URL(request.url).searchParams.get("cari");
  if (cari !== null) {
    const teks = cari.trim().slice(0, 80);
    let kueri = client.from("participants").select("id,name,company").eq("event_id", eventId).is("source_removed_at", null).order("name").limit(20);
    if (teks) kueri = kueri.ilike("name", polaCari(teks));
    const { data, error } = await kueri;
    if (error) return apiError("INTERNAL_ERROR", 500);
    return Response.json({ peserta: (data ?? []) as PesertaPratinjau[] });
  }

  const [peserta, berEmail, disetujui, akun] = await Promise.all([
    client.from("participants").select("id", { count: "exact", head: true }).eq("event_id", eventId).is("source_removed_at", null),
    client
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .is("source_removed_at", null)
      .not("email", "is", null)
      .neq("email", ""),
    client.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "approved"),
    client.from("participant_accounts").select("id", { count: "exact", head: true }).eq("event_id", eventId),
  ]);
  const layout = landing.layout === "modern" ? (landing.gathering === true ? "gathering" : "modern") : null;
  const diSusunan = new Map(normalizeLandingSections(landing.sections, landing.blocks).map((section) => [section.id as string, section.enabled]));

  return Response.json({
    member: landing.member ?? { enabled: false },
    /** Tata letak dashboard peserta: Participant home hanya ada di Modern dan Gathering. */
    layout,
    // Blok yang tampil di halaman peserta, dalam urutan Page sections. `aktif`
    // false = tidak tampil walau dipilih (disembunyikan di Page sections, atau
    // belum ada isinya): daftarnya menyebut alasannya.
    blocks: (landing.blocks ?? [])
      .filter((block) => landingBlockShownOn(block, "member") && diSusunan.has(block.id))
      .map((block) => ({
        id: block.id,
        type: block.type,
        heading: block.heading?.trim() || null,
        show_on: block.show_on,
        hidden_on_page: diSusunan.get(block.id) === false,
        empty: !landingBlockHasContent(block),
      })),
    preview: layout ? await pesertaBawaan(eventId) : null,
    // null bila hitungan gagal: layar menyembunyikan angkanya, bukan menampilkan 0.
    counts: {
      participants: peserta.error ? null : peserta.count ?? 0,
      with_email: berEmail.error ? null : berEmail.count ?? 0,
      approved: disetujui.error ? null : disetujui.count ?? 0,
      accounts: akun.error ? null : akun.count ?? 0,
    },
  });
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = memberSchema.safeParse((await request.json().catch(() => null))?.member);
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  // Dibaca ulang tepat sebelum menulis, dan ditulis hanya kalau updated_at masih
  // sama: editor Halaman acara dan halaman Speakers menulis kolom yang sama.
  // Berubah di antaranya -> baca ulang, coba sekali lagi.
  let landing: EventLandingConfig = {};
  let data: unknown = null;
  for (let percobaan = 0; ; percobaan++) {
    const { data: terkini, error: galatBaca } = await client
      .from("events")
      .select("landing_config,updated_at")
      .eq("id", auth.scope.event.id)
      .single();
    if (galatBaca || !terkini) return apiError("INTERNAL_ERROR", 500);
    const baris = terkini as { landing_config?: EventLandingConfig | null; updated_at: string };
    landing = (baris.landing_config ?? {}) as EventLandingConfig;
    const hasil = await client
      .from("events")
      // Digabung, bukan diganti: kunci yang tidak dikirim layar ini (mis.
      // show_roommates) tetap tersimpan.
      .update({ landing_config: { ...landing, member: { ...(landing.member ?? {}), ...parsed.data } }, updated_at: new Date().toISOString() } as never)
      .eq("id", auth.scope.event.id)
      .eq("updated_at", baris.updated_at)
      .select("landing_config")
      .maybeSingle();
    if (hasil.error) return apiError("INTERNAL_ERROR", 500);
    if (hasil.data) { data = hasil.data; break; }
    if (percobaan >= 1) return apiError("CONFLICT", 409);
  }

  await client.from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "member_area_update",
    payload: { old: landing.member ?? null, new: parsed.data },
  } as never);

  return Response.json({ member: (data as { landing_config?: EventLandingConfig } | null)?.landing_config?.member ?? parsed.data });
}
