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
/** Sama dengan "Kirim tautan ke email" (links.ts): per email dan per IP. */
const BATAS_EMAIL = 3;
const JENDELA_EMAIL = 15 * 60 * 1000;
const BATAS_IP = 20;
const JENDELA_IP = 10 * 60 * 1000;

/**
 * Hash kode bersama id barisnya. Kode hanya 6 digit, jadi tanpa id dua email
 * yang kebetulan mendapat kode sama akan bertabrakan di indeks unik
 * token_hash; dengan id, setiap hash unik dan tetap tidak bisa dibalik tanpa
 * menebak kodenya.
 */
function hashKode(id: string, kode: string) {
  return createHash("sha256").update(`${id}:${kode}`).digest("hex");
}

export type KirimKodeOutcome = { status: "sent" } | { status: "not_configured" } | { status: "failed" };

/**
 * Kirim kode masuk. Jawabannya SAMA untuk email terdaftar maupun tidak
 * (`sent`), juga saat kena batas, supaya formulir ini tidak bisa dipakai
 * menebak siapa yang terdaftar (alasan yang sama dengan requestPasswordLink).
 */
export async function kirimKodeMasuk(
  event: EventRow,
  member: LandingMemberConfig,
  input: { email: string; ip: string | null; requestUrl: string; lang?: LandingLang },
): Promise<KirimKodeOutcome> {
  if (!isEmailConfigured()) return { status: "not_configured" };
  const email = normalizeEmail(input.email);
  const client = getSupabaseServiceClient();

  const [perEmail, perIp] = await Promise.all([
    client
      .from("participant_link_requests")
      .select("id", { head: true, count: "exact" })
      .eq("event_id", event.id)
      .eq("email", email)
      .gte("created_at", new Date(Date.now() - JENDELA_EMAIL).toISOString()),
    input.ip
      ? client
        .from("participant_link_requests")
        .select("id", { head: true, count: "exact" })
        .eq("event_id", event.id)
        .eq("ip", input.ip)
        .gte("created_at", new Date(Date.now() - JENDELA_IP).toISOString())
      : Promise.resolve({ count: 0 }),
  ]);
  await client.from("participant_link_requests").insert({ event_id: event.id, email, ip: input.ip } as never);
  if ((perEmail.count ?? 0) >= BATAS_EMAIL || (perIp.count ?? 0) >= BATAS_IP) return { status: "sent" };

  const sasaran = await cariSasaran(event, member, email);
  if (!sasaran) return { status: "sent" };
  const versi = versiBahasa(event, input.lang, input.requestUrl);

  // Terdaftar, tetapi "Who can sign in" belum membuka aksesnya: dikabari, tanpa kode.
  if (sasaran.tertutup) {
    const hasil = await sendMemberLink({ eventId: event.id, kind: "tertutup", to: email, name: sasaran.name, eventName: versi.eventName, url: null, lang: versi.lang });
    return hasil.state === "sent" ? { status: "sent" } : { status: "failed" };
  }

  const id = randomUUID();
  const kode = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error } = await client.from("participant_account_tokens").insert({
    id,
    event_id: event.id,
    purpose: "kode",
    token_hash: hashKode(id, kode),
    email,
    account_id: sasaran.sasaran.accountId ?? null,
    participant_id: sasaran.sasaran.participantId ?? null,
    registration_id: sasaran.sasaran.registrationId ?? null,
    expires_at: new Date(Date.now() + MASA_KODE_MS).toISOString(),
  } as never);
  if (error) return { status: "failed" };

  const hasil = await sendMemberLink({ eventId: event.id, kind: "kode", to: email, name: sasaran.name, eventName: versi.eventName, url: null, kode, lang: versi.lang });
  return hasil.state === "sent" ? { status: "sent" } : { status: "failed" };
}

/** Batas tebakan kode, per email: begin_login_attempt (6 per 10 menit, lalu terkunci bertahap). */
async function gerbang(kunci: string): Promise<MemberOutcome | null> {
  const { data } = await getSupabaseServiceClient().rpc("begin_login_attempt" as never, { p_username: kunci } as never);
  const result = data as { allowed?: boolean; retry_after_seconds?: number } | null;
  if (result?.allowed === false) return { status: "rate_limited", retryAfterSeconds: result.retry_after_seconds ?? 60 };
  return null;
}

/**
 * Masuk dengan kode. Hanya kode TERBARU email ini yang berlaku: meminta kode
 * baru membatalkan yang lama, jadi tebakan tidak bisa menyebar ke beberapa
 * kode yang masih hidup sekaligus.
 */
export async function masukDenganKode(
  event: EventRow,
  member: LandingMemberConfig,
  input: { email: string; kode: string },
): Promise<MemberOutcome> {
  const email = normalizeEmail(input.email);
  const kunci = `peserta-kode:${event.id}:${email}`;
  const tertahan = await gerbang(kunci);
  if (tertahan) return tertahan;

  const client = getSupabaseServiceClient();
  const { data } = await client
    .from("participant_account_tokens")
    .select("id,token_hash,account_id,participant_id,registration_id,expires_at,used_at")
    .eq("event_id", event.id)
    .eq("email", email)
    .eq("purpose", "kode")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const baris = data as {
    id: string;
    token_hash: string;
    account_id: string | null;
    participant_id: string | null;
    registration_id: string | null;
    expires_at: string;
    used_at: string | null;
  } | null;
  if (!baris || baris.used_at || new Date(baris.expires_at).getTime() < Date.now()) return { status: "invalid" };
  if (!/^\d{6}$/.test(input.kode) || !sama(hashKode(baris.id, input.kode), baris.token_hash)) return { status: "invalid" };

  // Dipakai lebih dulu, baru diproses: dua kiriman serentak, hanya satu lolos.
  const { data: dipakai } = await client
    .from("participant_account_tokens")
    .update({ used_at: new Date().toISOString() } as never)
    .eq("id", baris.id)
    .is("used_at", null)
    .select("id");
  if (!dipakai || (dipakai as unknown[]).length === 0) return { status: "invalid" };

  const hasil = await masukkanSasaran(event, member, {
    sasaran: { accountId: baris.account_id ?? undefined, participantId: baris.participant_id ?? undefined, registrationId: baris.registration_id ?? undefined },
    email,
    terbukti: true,
  });
  if (hasil.status === "ok") await getSupabaseServiceClient().rpc("clear_login_attempts" as never, { p_username: kunci } as never);
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
 * kunci `kolom:<hash>` (bukan alamat email; isiannya sendiri tidak disimpan).
 *   per isian: 5 salah per 15 menit untuk tiap isian, jadi menebak NIK
 *              seseorang yang nomor HP-nya diketahui tertahan di 5 kali.
 *   per IP:    60 salah per 10 menit. Longgar dengan sengaja: peserta di
 *              lokasi acara sering berbagi satu jaringan wifi.
 */
const BATAS_ISIAN = 5;
const JENDELA_ISIAN = 15 * 60 * 1000;
const BATAS_IP_KOLOM = 60;
const JENDELA_IP_KOLOM = 10 * 60 * 1000;

function kunciIsian(eventId: string, id: KolomMasukId, nilai: string) {
  // HMAC dengan rahasia server: NIK atau nomor HP yang salah ketik tidak bisa
  // ditebak balik dari tabel ini oleh siapa pun yang hanya bisa membacanya.
  const rahasia = process.env.SESSION_SECRET ?? "";
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

type BarisPeserta = { id: string; name: string | null; email: string | null; phone: string | null; extra: Record<string, unknown> | null };

function nilaiKolom(baris: BarisPeserta, id: KolomMasukId): unknown {
  if (id === "email") return baris.email;
  if (id === "phone") return baris.phone;
  if (id === "name") return baris.name;
  return baris.extra?.[id.slice(2)];
}

/** `%` dan `_` dicari apa adanya, bukan sebagai wildcard ilike. */
function polaPersis(teks: string) {
  return teks.replace(/[\\%_]/g, (huruf) => `\\${huruf}`);
}

/**
 * Peserta aktif acara ini, per halaman 1.000 baris (batas baca PostgREST),
 * diurutkan id supaya halamannya stabil. `email` mempersempit ke satu email
 * bila salah satu kolomnya email.
 */
async function* semuaPeserta(eventId: string, email?: string): AsyncGenerator<BarisPeserta[]> {
  const client = getSupabaseServiceClient();
  let setelah: string | null = null;
  for (let halaman = 0; halaman < 50; halaman++) {
    let kueri = client
      .from("participants")
      .select("id,name,email,phone,extra")
      .eq("event_id", eventId)
      .is("source_removed_at", null)
      .order("id")
      .limit(1000);
    if (email) kueri = kueri.ilike("email", polaPersis(email));
    if (setelah) kueri = kueri.gt("id", setelah);
    const { data, error } = await kueri;
    if (error) throw new Error("Peserta gagal dibaca.");
    const baris = (data ?? []) as BarisPeserta[];
    if (baris.length) yield baris;
    if (baris.length < 1000) return;
    setelah = baris[baris.length - 1].id;
  }
}

/**
 * Masuk dengan dua isian. Cocok hanya bila TEPAT SATU peserta punya keduanya;
 * dua peserta dengan isian yang sama (kombinasi kembar) tidak bisa masuk
 * dengan cara ini, dan layar admin menghitung berapa yang begitu.
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
  const sejak = (ms: number) => new Date(Date.now() - ms).toISOString();
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
    await client.from("participant_link_requests").insert(kunci.map((k) => ({ event_id: event.id, email: k, ip: input.ip })) as never);
    return { status: "invalid" };
  };

  const indeksEmail = kolom.findIndex((k) => k.id === "email");
  const cocok: BarisPeserta[] = [];
  try {
    for await (const halaman of semuaPeserta(event.id, indeksEmail >= 0 ? isian[indeksEmail] : undefined)) {
      for (const baris of halaman) {
        if (kolom.every((k, i) => samakanIsian(k.id, k.jenis, nilaiKolom(baris, k.id)) === isian[i])) cocok.push(baris);
      }
      if (cocok.length > 1) break;
    }
  } catch {
    return { status: "invalid" };
  }
  if (cocok.length !== 1) return salah();

  const peserta = cocok[0];
  const email = peserta.email ? normalizeEmail(peserta.email) : null;
  const hasil = await masukkanSasaran(event, member, { sasaran: { participantId: peserta.id }, email: email && /^[^\s@]+@[^\s@]+$/.test(email) ? email : null, terbukti: false });
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
  let participants = 0;
  const kombinasi = new Map<string, number>();
  for await (const halaman of semuaPeserta(event.id)) {
    participants += halaman.length;
    for (const baris of halaman) {
      const [x, y] = kolom.map((k) => samakanIsian(k.id, k.jenis, nilaiKolom(baris, k.id)));
      if (!x || !y) continue;
      const kunci = JSON.stringify([x, y]);
      kombinasi.set(kunci, (kombinasi.get(kunci) ?? 0) + 1);
    }
  }
  let filled = 0;
  let duplicates = 0;
  for (const jumlah of kombinasi.values()) {
    filled += jumlah;
    if (jumlah > 1) duplicates += jumlah;
  }
  return { participants, filled, duplicates };
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
  input: { sasaran: Sasaran; email: string | null; terbukti: boolean },
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
  await startSession(accountId);
  return { status: "ok" };
}
