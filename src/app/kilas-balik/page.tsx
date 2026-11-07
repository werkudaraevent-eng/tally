import "./kilas.css";
import type { CSSProperties } from "react";
import { notFound, redirect } from "next/navigation";
import { getPublicPageEvent } from "@/lib/auth/request-event";
import { requireEventScope } from "@/lib/auth/event-scope";
import { publicEventName, type EventLandingConfig } from "@/lib/domain";
import { landingDefaultLang, landingEnAvailable, landingPath, withQuery, type LandingLang } from "@/lib/landing-i18n";
import { landingFontStyle, landingTokens } from "@/lib/landing-tokens";
import { getMemberSession, memberConfig, previewMemberSession } from "@/lib/member/account";
import { alamatKilasBalik } from "@/lib/kilas-balik/alamat";
import { susunAlur } from "@/lib/kilas-balik/alur";
import { judulAgendaMilik, muatJawaban, muatKenangan, muatSetelan, pesertaContoh, pilihanPeserta, semuaJudulAgenda } from "@/lib/kilas-balik/server";
import { TAMPILAN, statusBuka, temaSchema, type Pertanyaan, type Tampilan, type TemaKilas } from "@/lib/kilas-balik/setelan";
import { warnaKilas } from "@/lib/kilas-balik/warna";
import { KILAS_UI } from "@/lib/kilas-balik/i18n";
import { KilasClient, type LayarKlien } from "./kilas-client";

/**
 * Kilas balik: `/e/<slug>/kilas-balik` (versi bahasa lain `/e/<slug>/en/kilas-balik`).
 *
 * Kuesioner akhir acara yang dibuka dari Pengumuman. Peserta melihat ulang
 * perjalanannya (kartu kenangan dari data yang sudah tampil di area peserta),
 * dan di sela kartu itu satu pertanyaan per layar. Warnanya dari tema acara.
 *
 * Belum masuk: ke Masuk dengan `?lanjut=` kembali ke sini. Modul mati, tabel
 * belum ada, atau area peserta mati: 404, seperti halaman yang tidak ada.
 *
 * Pratinjau admin (`?pratinjau=<id peserta>` atau `=1` untuk peserta contoh):
 * hanya untuk admin acara ini, tetap jalan saat Feedback mati atau belum dibuka,
 * dirender sebagai peserta itu, dan tidak menyimpan atau mengirim apa pun.
 * `tampilan` dan `tema` (JSON) di alamat menimpa setelan tersimpan, supaya
 * pilihan yang belum disimpan bisa dicoba tanpa terlihat peserta.
 */

export const dynamic = "force-dynamic";

type Kueri = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Kueri }) {
  const kueri = await searchParams;
  return { title: KILAS_UI[kueri.bahasa === "en" ? "en" : "id"].metaTitle, robots: { index: false, follow: false } };
}

export async function generateViewport({ searchParams }: { searchParams: Kueri }) {
  const event = await getPublicPageEvent(searchParams);
  if (!event) return {};
  const muat = await muatSetelan(event.id).catch(() => null);
  return { themeColor: warnaKilas(event.landing_config as EventLandingConfig | null, muat?.siap ? muat.setelan.theme : null).latar };
}

export default async function KilasBalikPage({ searchParams }: { searchParams: Kueri }) {
  const kueri = await searchParams;
  const event = await getPublicPageEvent(Promise.resolve(kueri));
  if (!event || event.status === "archived") notFound();
  const member = memberConfig(event);
  if (!member) notFound();
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const utama = landingDefaultLang(landing);
  const minta: LandingLang | null = kueri.bahasa === "en" || kueri.bahasa === "id" ? kueri.bahasa : null;
  if (minta && (minta === utama || !landingEnAvailable(landing))) {
    const sisa = Object.fromEntries(Object.entries(kueri).filter(([kunci]) => kunci !== "eventSlug" && kunci !== "bahasa"));
    redirect(withQuery(alamatKilasBalik(event.slug), sisa));
  }
  const lang = minta ?? utama;
  const dasar = landingPath(event.slug, lang, utama);

  const muat = await muatSetelan(event.id).catch(() => null);
  if (!muat?.siap) notFound();
  const { setelan } = muat;

  const mintaPratinjau = typeof kueri.pratinjau === "string" ? kueri.pratinjau : null;
  let pratinjau = false;
  if (mintaPratinjau) {
    const admin = await requireEventScope(event.slug, ["admin"]);
    if (admin.response) notFound();
    pratinjau = true;
  }
  const status = pratinjau ? "open" : statusBuka(setelan, new Date());
  if (status === "off") notFound();

  let sesi;
  if (pratinjau) {
    const id = mintaPratinjau === "1" ? (await pesertaContoh(event.id))?.id : mintaPratinjau;
    sesi = id ? await previewMemberSession(event.id, id) : null;
    if (!sesi) notFound();
  } else {
    sesi = await getMemberSession(event);
    if (!sesi) redirect(withQuery(`${dasar}/masuk`, { lanjut: alamatKilasBalik(event.slug, lang === utama ? null : lang) }));
  }
  const peserta = sesi.participant;

  const tampilan: Tampilan = pratinjau && (TAMPILAN as readonly string[]).includes(kueri.tampilan as string) ? (kueri.tampilan as Tampilan) : setelan.display;
  let tema: TemaKilas = setelan.theme;
  if (pratinjau && typeof kueri.tema === "string") {
    try {
      const coba = temaSchema.safeParse(JSON.parse(kueri.tema));
      if (coba.success) tema = coba.data;
    } catch {
      /* tema pratinjau rusak: pakai yang tersimpan */
    }
  }

  const t = KILAS_UI[lang];
  const warna = warnaKilas(landing, tema);
  const tokens = landingTokens(landing);
  const gaya = {
    ...landingFontStyle(tokens),
    "--kb-latar": warna.latar,
    "--kb-latar-2": warna.latar2,
    "--kb-aksen": warna.aksen,
    "--kb-aksen-teks": warna.aksenTeks,
    "--kb-kertas": warna.kertas,
    "--kb-tinta": warna.tinta,
  } as CSSProperties;
  const portalUrl = `${dasar}/peserta`;
  const namaAcara = publicEventName(event) || event.name;

  // Akun tanpa baris peserta (pendaftaran belum disetujui): tidak ada yang bisa dicatat.
  if (!peserta || status !== "open") {
    const pesan = !peserta ? t.notParticipant : status === "closed" ? t.closedBody : t.notYetBody;
    const judul = !peserta ? t.notParticipantTitle : status === "closed" ? t.closedTitle : t.notYetTitle;
    return (
      <main className="kb-akar flex min-h-dvh items-center justify-center px-5 py-10" style={gaya}>
        <div className="kb-kartu kb-kartu-gelap w-full max-w-[420px]">
          <p className="text-label-large font-semibold text-[var(--kb-aksen)]">{namaAcara}</p>
          <h1 className="kb-judul mt-3">{judul}</h1>
          <p className="mt-3 text-body-large opacity-85">{pesan}</p>
          <a href={portalUrl} className="kb-tombol mt-8">{t.backToPortal}</a>
        </div>
      </main>
    );
  }

  const [kenangan, jawaban, semua, milik] = await Promise.all([
    muatKenangan(event, member, peserta.id, sesi.name, lang),
    pratinjau ? null : muatJawaban(event.id, peserta.id),
    semuaJudulAgenda(event.id),
    judulAgendaMilik(event, peserta.id),
  ]);
  const semuaSet = new Set(semua);
  const judulDi = (q: Pertanyaan) => (lang !== utama && q.title_alt?.trim() ? q.title_alt.trim() : q.title);
  const layar: LayarKlien[] = susunAlur(setelan.questions, setelan.cards, kenangan).map((l) =>
    l.jenis === "tanya"
      ? { jenis: "tanya", q: { key: l.q.key, type: l.q.type, title: judulDi(l.q), required: l.q.required, max: l.q.max ?? 1, options: l.q.type === "choice" ? pilihanPeserta(l.q, semuaSet, milik) : [] } }
      : l,
  );

  return (
    <KilasClient
      gaya={gaya}
      lang={lang}
      slug={event.slug}
      kunciSimpan={pratinjau ? null : `tally:kilas:${event.id}:${peserta.id}`}
      tampilan={tampilan}
      pratinjau={pratinjau ? sesi.name || peserta.name : null}
      namaAcara={namaAcara}
      judul={setelan.title}
      intro={setelan.intro}
      penutup={setelan.closing}
      penanda={setelan.signed_by}
      kenangan={kenangan}
      layar={layar}
      jawabanAwal={jawaban?.answers ?? null}
      portalUrl={portalUrl}
      tutupPada={setelan.closes_at}
      zona={event.time_zone || "Asia/Jakarta"}
    />
  );
}
