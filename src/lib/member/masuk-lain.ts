import bcrypt from "bcryptjs";
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { EventRow, LandingMemberConfig, LandingMemberSignIn, RegistrationField, RegistrationFormConfig } from "@/lib/domain";
import { isEmailConfigured } from "@/lib/email/client";
import { sendMemberLink } from "@/lib/email/member-links";
import type { LandingLang } from "@/lib/landing-i18n";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { clearGate, eligible, HASH_ROUNDS, normalizeEmail, startSession, type MemberOutcome } from "./account";
import { kolomMasukPublik, samakanIsian, type JenisIsian, type KolomMasukId } from "./kolom-masuk";
import { cariSasaran, versiBahasa, type Sasaran } from "./links";

/**
 * Cara masuk selain email + kata sandi (Participant area > How participants
 * sign in, `landing_config.member.sign_in`).
 *
 *   email_code  email, lalu kode 6 digit ke email itu. Tanpa kata sandi.
 *               Kodenya baris `participant_account_tokens` berjenis `kode`.
 *   fields      dua kolom data peserta pilihan admin (kolom-masuk.ts). Tidak
 *               ada yang dikirim; yang tahu kedua isian bisa masuk. Paling
 *               lemah, dan layar admin menyebutnya.
 *
 * Keduanya berakhir di akun area peserta biasa (participant_accounts +
 * tally_peserta), jadi halaman peserta tidak tahu cara orang itu masuk.
 * Akun yang dibuat di sini mendapat kata sandi acak yang tidak diketahui
 * siapa pun: bila acaranya kembali ke kata sandi, pesertanya membuat kata
 * sandi lewat "Lupa kata sandi?" seperti peserta impor.
 */

export function caraMasuk(member: Pick<LandingMemberConfig, "sign_in"> | null | undefined): LandingMemberSignIn {
  return member?.sign_in === "email_code" || member?.sign_in === "fields" ? member.sign_in : "password";
}

// ---- Kode dari email ------------------------------------------------------

const MASA_KODE_MS = 10 * 60 * 1000;
/**
 * Batas permintaan kode. Satu IP penyerang tidak boleh bisa menghentikan kode
 * untuk peserta yang memintanya dari IP lain, jadi batas yang terlihat dan
 * batas harian dihitung per email + IP:
 *   per email + IP  3 per 15 menit, peminta yang sama mendapat "tunggu";
 *                   20 kode per 24 jam (dihitung dari kode yang dibuat).
 *   per IP          60 per 10 menit, peminta yang sama mendapat "tunggu".
 *                   Longgar: peserta di lokasi acara berbagi satu wifi.
 *   per email       50 kode per 24 jam dari semua IP, diam. Plafon untuk
 *                   penebak yang berganti-ganti IP: paling banyak 250 tebakan
 *                   kode per email sehari. Butuh 3 IP atau lebih untuk
 *                   mencapainya, jadi satu IP tidak bisa.
 * Permintaan dicatat di participant_link_requests untuk setiap email,
 * terdaftar atau tidak, jadi batas yang terlihat tidak membocorkan siapa yang
 * terdaftar.
 */
const BATAS_PASANGAN = 3;
const JENDELA_PASANGAN = 15 * 60 * 1000;
const BATAS_IP = 60;
const JENDELA_IP = 10 * 60 * 1000;
const BATAS_KODE_HARI_PASANGAN = 20;
const BATAS_KODE_HARI_EMAIL = 50;
const HARI = 24 * 60 * 60 * 1000;
/**
 * Kode yang diuji setiap tebakan: kode terbaru dari IP penebak, lalu kode
 * terbaru dari tiap IP peminta lain, paling banyak lima. Permintaan dari IP
 * lain tidak pernah menggeser kode yang diminta dari IP peserta sendiri.
 * Setiap tebakan salah menambah hitungan semua kode yang diuji; kode hangus
 * di tebakan salah ke-5 (peserta_kode_salah).
 */
const KODE_DIUJI = 5;
/**
 * Tebakan salah per IP, di semua email: 60 per 10 menit (wifi lokasi acara).
 * Yang benar-benar menahan tebakan adalah kode yang hangus di salah ke-5
 * dan plafon 50 kode per email per hari: paling banyak 250 tebakan kode.
 */
const BATAS_SALAH_IP = 60;
const JENDELA_SALAH_IP = 10 * 60 * 1000;
const KUNCI_SALAH_KODE = "kode-salah";

/**
 * Hash kode bersama id barisnya. Kode hanya 6 digit, jadi tanpa id dua email
 * yang kebetulan mendapat kode sama akan bertabrakan di indeks unik
 * token_hash; dengan id, setiap hash unik dan tetap tidak bisa dibalik tanpa
 * menebak kodenya.
 */
function hashKode(id: string, kode: string) {
  return createHash("sha256").update(`${id}:${kode}`).digest("hex");
}

const sejak = (ms: number) => new Date(Date.now() - ms).toISOString();

export type KirimKodeOutcome =
  /** `kirim`: dijalankan route di after(), supaya jawabannya tidak menunggu basis data dan penyedia email. */
  | { status: "sent"; kirim?: () => Promise<void> }
  | { status: "rate_limited"; retryAfterSeconds: number }
  | { status: "not_configured" };

/**
 * Kirim kode masuk. Jawabannya SAMA untuk email terdaftar maupun tidak, dan
 * datang SEBELUM email dicari: mencari peserta, membuat kode, dan mengirim
 * email berjalan di `kirim` (after()), jadi lama jawaban dan kegagalan
 * penyedia email tidak membocorkan siapa yang terdaftar.
 */
export async function kirimKodeMasuk(
  event: EventRow,
  member: LandingMemberConfig,
  input: { email: string; ip: string | null; requestUrl: string; lang?: LandingLang },
): Promise<KirimKodeOutcome> {
  if (!isEmailConfigured()) return { status: "not_configured" };
  const email = normalizeEmail(input.email);
  const client = getSupabaseServiceClient();
  const hitung = () => client.from("participant_link_requests").select("id", { head: true, count: "exact" }).eq("event_id", event.id);

  const pasanganKueri = hitung().eq("email", email).gte("created_at", sejak(JENDELA_PASANGAN));
  const [pasangan, perIp] = await Promise.all([
    input.ip ? pasanganKueri.eq("ip", input.ip) : pasanganKueri.is("ip", null),
    input.ip
      ? hitung().eq("ip", input.ip).neq("email", KUNCI_SALAH_KODE).not("email", "like", "kolom:%").gte("created_at", sejak(JENDELA_IP))
      : Promise.resolve({ count: 0 }),
  ]);
  if ((pasangan.count ?? 0) >= BATAS_PASANGAN) return { status: "rate_limited", retryAfterSeconds: Math.round(JENDELA_PASANGAN / 1000) };
  if ((perIp.count ?? 0) >= BATAS_IP) return { status: "rate_limited", retryAfterSeconds: Math.round(JENDELA_IP / 1000) };
  await client.from("participant_link_requests").insert({ event_id: event.id, email, ip: input.ip } as never);

  const kirim = async () => {
    try {
      const sasaran = await cariSasaran(event, member, email);
      if (!sasaran) return;
      const versi = versiBahasa(event, input.lang, input.requestUrl);

      // Terdaftar, tetapi "Who can sign in" belum membuka aksesnya: dikabari, tanpa kode.
      if (sasaran.tertutup) {
        await sendMemberLink({ eventId: event.id, kind: "tertutup", to: email, name: sasaran.name, eventName: versi.eventName, url: null, lang: versi.lang });
        return;
      }

      const kodeHariIni = () =>
        client
          .from("participant_account_tokens")
          .select("id", { head: true, count: "exact" })
          .eq("event_id", event.id)
          .eq("email", email)
          .eq("purpose", "kode")
          .gte("created_at", sejak(HARI));
      const [dariIpIni, semua] = await Promise.all([input.ip ? kodeHariIni().eq("ip", input.ip) : kodeHariIni().is("ip", null), kodeHariIni()]);
      if ((dariIpIni.count ?? 0) >= BATAS_KODE_HARI_PASANGAN || (semua.count ?? 0) >= BATAS_KODE_HARI_EMAIL) return;

      const id = randomUUID();
      const kode = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const { error } = await client.from("participant_account_tokens").insert({
        id,
        event_id: event.id,
        purpose: "kode",
        token_hash: hashKode(id, kode),
        email,
        ip: input.ip,
        account_id: sasaran.sasaran.accountId ?? null,
        participant_id: sasaran.sasaran.participantId ?? null,
        registration_id: sasaran.sasaran.registrationId ?? null,
        expires_at: new Date(Date.now() + MASA_KODE_MS).toISOString(),
      } as never);
      if (error) {
        console.warn("[peserta] kode masuk gagal disimpan", event.id, error.code);
        return;
      }
      await sendMemberLink({ eventId: event.id, kind: "kode", to: email, name: sasaran.name, eventName: versi.eventName, url: null, kode, lang: versi.lang });
    } catch (galat) {
      console.warn("[peserta] kode masuk gagal dikirim", event.id, galat instanceof Error ? galat.message : galat);
    }
  };
  return { status: "sent", kirim };
}

/** Batas tebakan kode, per email: begin_login_attempt (6 per 10 menit, lalu terkunci bertahap). */
async function gerbang(kunci: string): Promise<MemberOutcome | null> {
  const { data } = await getSupabaseServiceClient().rpc("begin_login_attempt" as never, { p_username: kunci } as never);
  const result = data as { allowed?: boolean; retry_after_seconds?: number } | null;
  if (result?.allowed === false) return { status: "rate_limited", retryAfterSeconds: result.retry_after_seconds ?? 60 };
  return null;
}

type BarisKode = {
  id: string;
  token_hash: string;
  ip: string | null;
  account_id: string | null;
  participant_id: string | null;
  registration_id: string | null;
};

/**
 * Masuk dengan kode. Tiga batas tebakan:
 *   per kode   hangus di tebakan salah ke-5; peserta meminta kode baru
 *   per email  begin_login_attempt (6 per 10 menit, terkunci bertahap)
 *   per IP     60 tebakan salah per 10 menit, di semua email
 */
export async function masukDenganKode(
  event: EventRow,
  member: LandingMemberConfig,
  input: { email: string; kode: string; ip: string | null },
): Promise<MemberOutcome> {
  const email = normalizeEmail(input.email);
  const client = getSupabaseServiceClient();
  if (input.ip) {
    const { count } = await client
      .from("participant_link_requests")
      .select("id", { head: true, count: "exact" })
      .eq("event_id", event.id)
      .eq("email", KUNCI_SALAH_KODE)
      .eq("ip", input.ip)
      .gte("created_at", sejak(JENDELA_SALAH_IP));
    if ((count ?? 0) >= BATAS_SALAH_IP) return { status: "rate_limited", retryAfterSeconds: Math.round(JENDELA_SALAH_IP / 1000) };
  }
  const kunci = `peserta-kode:${event.id}:${email}`;
  const tertahan = await gerbang(kunci);
  if (tertahan) return tertahan;

  const { data } = await client
    .from("participant_account_tokens")
    .select("id,token_hash,ip,account_id,participant_id,registration_id")
    .eq("event_id", event.id)
    .eq("email", email)
    .eq("purpose", "kode")
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(50);
  // Kode terbaru dari tiap IP peminta; yang dari IP penebak selalu ikut.
  const perIp = new Map<string, BarisKode>();
  for (const baris of (data ?? []) as BarisKode[]) {
    const ip = baris.ip ?? "";
    if (!perIp.has(ip)) perIp.set(ip, baris);
  }
  const milikSendiri = perIp.get(input.ip ?? "");
  const diuji = [...(milikSendiri ? [milikSendiri] : []), ...[...perIp.values()].filter((baris) => baris !== milikSendiri)].slice(0, KODE_DIUJI);
  const cocok = /^\d{6}$/.test(input.kode) ? diuji.find((baris) => sama(hashKode(baris.id, input.kode), baris.token_hash)) : undefined;

  if (!cocok) {
    await Promise.all([
      diuji.length ? client.rpc("peserta_kode_salah" as never, { p_ids: diuji.map((baris) => baris.id) } as never) : null,
      client.from("participant_link_requests").insert({ event_id: event.id, email: KUNCI_SALAH_KODE, ip: input.ip } as never),
    ]);
    return { status: "invalid" };
  }

  // Dipakai lebih dulu, baru diproses: dua kiriman serentak, hanya satu lolos.
  const { data: dipakai } = await client
    .from("participant_account_tokens")
    .update({ used_at: new Date().toISOString() } as never)
    .eq("id", cocok.id)
    .is("used_at", null)
    .select("id");
  if (!dipakai || (dipakai as unknown[]).length === 0) return { status: "invalid" };

  const hasil = await masukkanSasaran(event, member, {
    sasaran: { accountId: cocok.account_id ?? undefined, participantId: cocok.participant_id ?? undefined, registrationId: cocok.registration_id ?? undefined },
    email,
    terbukti: true,
    cara: "email_code",
  });
  if (hasil.status === "ok") await client.rpc("clear_login_attempts" as never, { p_username: kunci } as never);
  return hasil;
}

function sama(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---- Dua kolom data peserta -------------------------------------------------

/**
 * Batas salah isi, dicatat di participant_link_requests dengan "email" berupa
 * kunci `kolom:<hmac>` (bukan alamat email; isiannya sendiri tidak disimpan).
 *   per isian: 5 salah per 15 menit untuk tiap isian, jadi menebak NIK
 *              seseorang yang nomor HP-nya diketahui tertahan di 5 kali.
 *   per IP:    60 salah per 10 menit. Longgar dengan sengaja: peserta di
 *              lokasi acara sering berbagi satu jaringan wifi. Hanya kunci
 *              pertama yang membawa IP, jadi satu salah = satu hitungan.
 */
const BATAS_ISIAN = 5;
const JENDELA_ISIAN = 15 * 60 * 1000;
const BATAS_IP_KOLOM = 60;
const JENDELA_IP_KOLOM = 10 * 60 * 1000;

function kunciIsian(eventId: string, id: KolomMasukId, nilai: string) {
  // HMAC dengan rahasia server: NIK atau nomor HP yang salah ketik tidak bisa
  // ditebak balik dari tabel ini oleh siapa pun yang hanya bisa membacanya.
  const rahasia = process.env.SESSION_SECRET;
  if (!rahasia) throw new Error("SESSION_SECRET is missing.");
  return `kolom:${createHmac("sha256", rahasia).update(`${eventId}:${id}:${nilai}`).digest("hex").slice(0, 40)}`;
}

export type KolomTerpilih = { id: KolomMasukId; jenis: JenisIsian };

/** Dua kolom setelan acara ini, atau null bila setelannya kosong atau kolomnya sudah dihapus dari form. */
export function kolomTerpilih(event: Pick<EventRow, "registration_form_config">, member: LandingMemberConfig): [KolomTerpilih, KolomTerpilih] | null {
  const ids = member.sign_in_fields;
  if (!ids || ids.length !== 2 || ids[0] === ids[1]) return null;
  const fields = formFields(event);
  const a = kolomMasukPublik(ids[0], fields, "id");
  const b = kolomMasukPublik(ids[1], fields, "id");
  return a && b ? [{ id: ids[0], jenis: a.jenis }, { id: ids[1], jenis: b.jenis }] : null;
}

export function formFields(event: Pick<EventRow, "registration_form_config">): RegistrationField[] {
  return ((event.registration_form_config as RegistrationFormConfig | null)?.fields ?? []) as RegistrationField[];
}

/** Argumen RPC pencocokan: id kolom dan jenisnya, sama urutannya. */
function argKolom(kolom: [KolomTerpilih, KolomTerpilih]) {
  return { p_kolom: kolom.map((k) => k.id), p_jenis: kolom.map((k) => k.jenis) };
}

/**
 * Masuk dengan dua isian. Cocok hanya bila TEPAT SATU peserta punya keduanya;
 * dua peserta dengan isian yang sama (kombinasi kembar) tidak bisa masuk
 * dengan cara ini, dan layar admin menghitung berapa yang begitu. Pencocokan
 * satu kueri di basis data (peserta_cocok_kolom), bukan membaca seluruh
 * daftar peserta.
 */
export async function masukDenganKolom(
  event: EventRow,
  member: LandingMemberConfig,
  input: { nilai: [string, string]; ip: string | null },
): Promise<MemberOutcome> {
  const kolom = kolomTerpilih(event, member);
  if (!kolom) return { status: "invalid" };
  const isian = kolom.map((k, i) => samakanIsian(k.id, k.jenis, input.nilai[i])) as [string, string];
  if (!isian[0] || !isian[1]) return { status: "invalid" };

  const client = getSupabaseServiceClient();
  const kunci = kolom.map((k, i) => kunciIsian(event.id, k.id, isian[i]));
  const [a, b, ip] = await Promise.all([
    ...kunci.map((k) => client.from("participant_link_requests").select("id", { head: true, count: "exact" }).eq("event_id", event.id).eq("email", k).gte("created_at", sejak(JENDELA_ISIAN))),
    input.ip
      ? client.from("participant_link_requests").select("id", { head: true, count: "exact" }).eq("event_id", event.id).eq("ip", input.ip).like("email", "kolom:%").gte("created_at", sejak(JENDELA_IP_KOLOM))
      : Promise.resolve({ count: 0 }),
  ]);
  if ((a.count ?? 0) >= BATAS_ISIAN || (b.count ?? 0) >= BATAS_ISIAN || (ip.count ?? 0) >= BATAS_IP_KOLOM) {
    return { status: "rate_limited", retryAfterSeconds: Math.round(JENDELA_ISIAN / 1000) };
  }

  const salah = async (): Promise<MemberOutcome> => {
    await client.from("participant_link_requests").insert(kunci.map((k, i) => ({ event_id: event.id, email: k, ip: i === 0 ? input.ip : null })) as never);
    return { status: "invalid" };
  };

  const { data, error } = await client.rpc("peserta_cocok_kolom" as never, { p_event: event.id, ...argKolom(kolom), p_nilai: input.nilai } as never);
  if (error) {
    console.warn("[peserta] pencocokan dua kolom gagal", event.id, error.code);
    return { status: "invalid" };
  }
  const cocok = (data ?? []) as unknown as string[];
  if (cocok.length !== 1) return salah();

  const { data: peserta } = await client.from("participants").select("id,email").eq("id", cocok[0]).eq("event_id", event.id).maybeSingle();
  if (!peserta) return salah();
  const mentah = (peserta as { email: string | null }).email;
  const email = mentah ? normalizeEmail(mentah) : null;
  const hasil = await masukkanSasaran(event, member, {
    sasaran: { participantId: cocok[0] },
    email: email && /^[^\s@]+@[^\s@]+$/.test(email) ? email : null,
    terbukti: false,
    cara: "fields",
  });
  if (hasil.status === "invalid") return salah();
  return hasil;
}

/** Ringkasan untuk layar admin: berapa peserta bisa masuk dengan dua kolom ini. */
export async function ringkasKolom(
  event: Pick<EventRow, "id" | "registration_form_config">,
  ids: [string, string],
): Promise<{ participants: number; filled: number; duplicates: number } | null> {
  const kolom = kolomTerpilih(event, { enabled: true, sign_in_fields: ids });
  if (!kolom) return null;
  const { data, error } = await getSupabaseServiceClient().rpc("peserta_ringkas_kolom" as never, { p_event: event.id, ...argKolom(kolom) } as never);
  if (error) throw new Error("Ringkasan dua kolom gagal dibaca.");
  const baris = ((data ?? []) as unknown as { participants: number; filled: number; duplicates: number }[])[0];
  return { participants: Number(baris?.participants ?? 0), filled: Number(baris?.filled ?? 0), duplicates: Number(baris?.duplicates ?? 0) };
}

// ---- Bersama ---------------------------------------------------------------

/**
 * Sasaran -> akun -> sesi. Akun yang sudah ada dipakai apa adanya (kata
 * sandinya tidak berubah); tanpa akun dibuat akun baru berkata sandi acak.
 *
 * `email` null: peserta tanpa email (cara dua kolom). Email yang sudah
 * dipakai akun lain di acara ini juga tidak ikut disimpan, supaya akun ini
 * tidak bisa menyamar sebagai pemilik email itu.
 *
 * `terbukti`: peserta baru saja membuktikan kotak masuknya (kode dari email).
 */
async function masukkanSasaran(
  event: EventRow,
  member: LandingMemberConfig,
  input: { sasaran: Sasaran; email: string | null; terbukti: boolean; cara: "email_code" | "fields" },
): Promise<MemberOutcome> {
  const client = getSupabaseServiceClient();
  const sekarang = new Date().toISOString();
  let { accountId, participantId } = input.sasaran;
  const { registrationId } = input.sasaran;

  if (!accountId && participantId) {
    const { data } = await client.from("participant_accounts").select("id").eq("participant_id", participantId).maybeSingle();
    accountId = (data as { id: string } | null)?.id;
  }

  if (accountId) {
    const { data } = await client.from("participant_accounts").select("id,participant_id").eq("id", accountId).eq("event_id", event.id).maybeSingle();
    const akun = data as { id: string; participant_id: string | null } | null;
    if (!akun) return { status: "invalid" };
    participantId = akun.participant_id ?? undefined;
  }

  // Diperiksa setiap masuk, sama dengan loginMember: peserta bisa dikeluarkan
  // atau `audience` diubah setelah akunnya dibuat. Pendaftaran yang belum
  // disetujui tetap boleh masuk; halaman peserta hanya menampilkan statusnya.
  if (participantId) {
    const { data: aktif } = await client.from("participants").select("id").eq("id", participantId).eq("event_id", event.id).is("source_removed_at", null).maybeSingle();
    if (!aktif || !(await eligible(event.id, participantId, member))) return { status: "not_eligible" };
  } else if (registrationId && !accountId) {
    const { data: reg } = await client.from("event_registrations").select("participant_id,status").eq("id", registrationId).maybeSingle();
    const r = reg as { participant_id: string | null; status: string } | null;
    if (!r || r.status === "rejected") return { status: "not_eligible" };
    participantId = r.participant_id ?? undefined;
  }

  if (accountId) {
    await client
      .from("participant_accounts")
      .update({ last_login_at: sekarang, ...(input.terbukti ? { email_verified_at: sekarang } : {}) } as never)
      .eq("id", accountId);
    // Akun tanpa email (dua kolom data peserta) yang kini masuk dengan kode:
    // email yang baru terbukti menjadi email akunnya. Email yang sudah
    // dipakai akun lain dibiarkan (23505).
    if (input.terbukti && input.email) {
      await client.from("participant_accounts").update({ email: input.email } as never).eq("id", accountId).is("email", null);
    }
  } else {
    const password_hash = await bcrypt.hash(randomBytes(32).toString("base64url"), HASH_ROUNDS);
    const baru = (email: string | null) =>
      client
        .from("participant_accounts")
        .insert({
          event_id: event.id,
          participant_id: participantId ?? null,
          registration_id: registrationId ?? null,
          email,
          password_hash,
          // Kata sandi acak, bukan buatan peserta: Pesan peserta mengirim
          // tautan buat kata sandi bila acaranya kembali ke kata sandi.
          password_set_at: null,
          email_verified_at: input.terbukti && email ? sekarang : null,
          last_login_at: sekarang,
        } as never)
        .select("id")
        .single();
    let { data, error } = await baru(input.email);
    // Email sudah dipakai akun lain di acara ini (cara dua kolom): akun ini tanpa email.
    if (error?.code === "23505" && input.email && !input.terbukti) ({ data, error } = await baru(null));
    if (error || !data) return error?.code === "23505" ? { status: "conflict" } : { status: "invalid" };
    accountId = (data as { id: string }).id;
  }

  if (input.email) await clearGate(event.id, input.email);
  await startSession(accountId, input.cara);
  return { status: "ok" };
}
