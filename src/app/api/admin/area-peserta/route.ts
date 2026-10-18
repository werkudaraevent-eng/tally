import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { gatheringHorizon, landingBlockHasContent, landingBlockMemberOnly, landingBlockShownOn, normalizeLandingSections, sectionsDenganBlokPeserta, type EventLandingConfig, type LandingMemberConfig } from "@/lib/domain";
import { memberSchema } from "@/lib/landing-body-schema";
import { loadSetelanCheckpoint } from "@/lib/checkpoint/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { isEmailConfigured } from "@/lib/email/client";
import { jenisBlokDarurat } from "@/lib/member/blok-darurat";
import { KOLOM_MASUK_POLA, pilihanKolomMasuk } from "@/lib/member/kolom-masuk";
import { formFields, kolomTerpilih, ringkasKolom } from "@/lib/member/masuk-lain";

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

  // Cara masuk dua kolom: berapa peserta punya kedua isian, dan berapa kembar.
  const kolom = new URL(request.url).searchParams.get("kolom");
  if (kolom !== null) {
    const ids = kolom.split(",");
    if (ids.length !== 2 || !ids.every((id) => KOLOM_MASUK_POLA.test(id))) return apiError("VALIDATION_ERROR", 422);
    try {
      const ringkas = await ringkasKolom(auth.scope.event, [ids[0], ids[1]]);
      return ringkas ? Response.json(ringkas) : apiError("VALIDATION_ERROR", 422);
    } catch {
      return apiError("INTERNAL_ERROR", 500);
    }
  }

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

  // Blok khusus peserta yang dulu dimatikan di Page sections: kini diatur di
  // Participant home, jadi tampil di sana sebagai tersembunyi (matanya mati),
  // persis seperti di halaman peserta sekarang.
  const member: LandingMemberConfig = landing.member ?? { enabled: false };
  const matiLama = (landing.blocks ?? [])
    .filter((block) => landingBlockMemberOnly(block) && diSusunan.get(block.id) === false && !(member.home?.hidden ?? []).includes(block.id))
    .map((block) => block.id as string);

  return Response.json({
    member: matiLama.length ? { ...member, home: { ...member.home, hidden: [...(member.home?.hidden ?? []), ...matiLama] } } : member,
    /** Semua blok acara: tombol Add block berhenti di batas jumlah blok. */
    blocks_count: (landing.blocks ?? []).length,
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
        // Blok khusus peserta tidak diatur di Page sections: lihat matiLama.
        hidden_on_page: !landingBlockMemberOnly(block) && diSusunan.get(block.id) === false,
        empty: !landingBlockHasContent(block),
        // Isi blok Columns khusus peserta, untuk "Copy into contacts" di Emergency and help.
        ...(landingBlockMemberOnly(block) && jenisBlokDarurat(block.type)
          ? { body: block.body?.trim() || null, items: (block.items ?? []).map((item) => ({ title: item.title ?? null, body: item.body ?? null, href: item.href ?? null })) }
          : {}),
      })),
    preview: layout ? await pesertaBawaan(eventId) : null,
    // Baris Checkpoints di Participant home menyebut bila fiturnya mati di Check-in.
    checkpoints_on: layout ? (await loadSetelanCheckpoint(eventId))?.enabled === true : false,
    // Gathering Horizon tidak menampilkan "Today's agenda": barisnya disembunyikan di CMS.
    horizon: gatheringHorizon(landing),
    // Cara masuk: kolom yang boleh dipilih untuk "Participant fields", dan
    // apakah email bisa terkirim (Email code membutuhkannya).
    sign_in_options: pilihanKolomMasuk(formFields(auth.scope.event)),
    email_ready: isEmailConfigured(),
    // null bila hitungan gagal: layar menyembunyikan angkanya, bukan menampilkan 0.
    counts: {
      participants: peserta.error ? null : peserta.count ?? 0,
      with_email: berEmail.error ? null : berEmail.count ?? 0,
      approved: disetujui.error ? null : disetujui.count ?? 0,
      accounts: akun.error ? null : akun.count ?? 0,
    },
  });
}

/**
 * Setelan baru di atas salinan server. Mata Participant home yang dinyalakan
 * admin (`nyalakan`) untuk blok khusus peserta ikut menyalakannya di Page
 * sections, satu-satunya tempat lama yang bisa mematikannya. Hanya mata yang
 * dinyalakan, bukan semua yang tidak tersembunyi: salinan basi tidak
 * menyalakan blok yang baru dimatikan di layar lain.
 */
function gabung(landing: EventLandingConfig, patch: Partial<LandingMemberConfig>, nyalakan: string[]): EventLandingConfig {
  const member = { ...(landing.member ?? {}), ...patch } as LandingMemberConfig;
  const tersembunyi = patch.home?.hidden ?? landing.member?.home?.hidden ?? [];
  const sections = sectionsDenganBlokPeserta(landing.sections, landing.blocks, nyalakan.filter((id) => !tersembunyi.includes(id)));
  return { ...landing, member, ...(sections !== landing.sections ? { sections } : {}) };
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  // `enabled` boleh tidak dikirim: Agenda > Section > Outfit hanya mengirim
  // `outfit_label`, dan gabungan di bawah mempertahankan kunci lainnya.
  const body = await request.json().catch(() => null);
  const parsed = memberSchema.partial({ enabled: true }).safeParse(body?.member);
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const nyalakan = z.array(z.string().max(40)).max(60).safeParse(body?.blok_nyala ?? []);
  if (!nyalakan.success) return apiError("VALIDATION_ERROR", 422, nyalakan.error.flatten());

  // Dua kolom wajib dipilih, dan keduanya masih ada di form, sebelum cara
  // dua kolom bisa disimpan. Tanpanya tidak ada peserta yang bisa masuk.
  // Hanya bila cara masuk ikut dikirim: simpanan Buses / Outfit tidak boleh
  // gagal karena pertanyaan form yang dipakai kemudian dihapus.
  const akhir = { ...((auth.scope.event.landing_config ?? {}) as EventLandingConfig).member, ...parsed.data };
  const ubahCaraMasuk = parsed.data.sign_in !== undefined || parsed.data.sign_in_fields !== undefined;
  if (ubahCaraMasuk && akhir.sign_in === "fields" && !kolomTerpilih(auth.scope.event, { enabled: true, ...akhir })) {
    return apiError("VALIDATION_ERROR", 422, { formErrors: ["Choose two different participant fields to sign in with."], fieldErrors: {} });
  }
  // Pindah ke Email code tanpa pengiriman email: tidak ada yang bisa masuk.
  const sebelumnya = ((auth.scope.event.landing_config ?? {}) as EventLandingConfig).member?.sign_in;
  if (parsed.data.sign_in === "email_code" && sebelumnya !== "email_code" && !isEmailConfigured()) {
    return apiError("VALIDATION_ERROR", 422, { formErrors: ["Email sending isn't set up, so participants can't get a code. Choose another sign-in method."], fieldErrors: {} });
  }

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
    // Masuk ke cara dua kolom (lagi): sesi dua kolom dari masa sebelumnya
    // tidak hidup kembali (getMemberSession membandingkan dengan waktu ini).
    const mulaiKolom = parsed.data.sign_in === "fields" && landing.member?.sign_in !== "fields" ? { sign_in_since: new Date().toISOString() } : {};
    const hasil = await client
      .from("events")
      // Digabung, bukan diganti: kunci yang tidak dikirim layar ini (mis.
      // show_roommates) tetap tersimpan.
      .update({ landing_config: gabung(landing, { ...parsed.data, ...mulaiKolom }, nyalakan.data), updated_at: new Date().toISOString() } as never)
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
