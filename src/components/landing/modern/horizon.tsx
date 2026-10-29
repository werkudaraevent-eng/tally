import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import type { LandingSpeaker } from "@/lib/domain";
import type { AgendaPreview } from "@/lib/landing-agenda";
import { LANDING_UI, type LandingLang } from "@/lib/landing-i18n";
import { kontras } from "@/lib/landing-hitung-mundur";
import { CINCIN_NAVY, CINCIN_TERANG } from "./cincin-horizon";
import { pecahJudul, tanpaBintang } from "@/lib/landing-tagline";
import { Muncul } from "./horizon-gerak";
import { JamHariHorizon } from "./horizon-jadwal";
import { judulMemuatTanggal } from "@/lib/judul-hari";

/**
 * Gathering Horizon: rancangan V5 "Beyond Everyday" Hanung (pen.dev,
 * 2026-10-13, frame h7OmX desktop dan mIqta ponsel). Dibangun ulang setia dari
 * properti node rancangan: Plus Jakarta Sans, navy, krem #FAF8F2, biru pucat
 * #EDF1FB, emas dari Tema. Ukuran ditulis apa adanya (82/800 judul hero,
 * 38/800 pembuka cerita, dst.) dengan tepi 64px di layar lebar, 24px di ponsel.
 *
 * Ponsel punya komposisi sendiri (mIqta), bukan desktop yang dikecilkan: KV
 * menjadi pita 138px di bawah tombol, foto cerita naik tepat di bawahnya, kartu
 * perjalanan tidak tampil, dan tanda tangan acara pindah ke pita penutup.
 *
 * Semua teks dari CMS; teks bawaan (LANDING_UI.horizon) hanya selama kolomnya
 * kosong. Hanya halaman acara dengan `gathering_variant: "horizon"` yang
 * memakai berkas ini.
 */

/** Warna tetap rancangan V5. Navy dan emas dari Tema (`--hz-navy`, `--hz-emas`), sisanya netral. */
const KREM = "#FAF8F2";
const PUCAT = "#EDF1FB";
const TINTA = "#101E38";
const REDUP = "#526078";
const LABEL = "#4D5D77";
const BIRU = "#274FC0";
const GARIS_NAVY = "#405272";
const REDUP_NAVY = "#CDD7EA";

/** Lebar isi paling besar = lebar rancangan; tepi 24px ponsel, 64px layar lebar. */
const BINGKAI = "mx-auto w-full max-w-[1440px] px-6 md:px-16";
/** Tombol pil emas, teks dari --hz-on-emas (diukur terhadap emasnya). Tinggi >= 48px. */
const PIL_EMAS =
  "m3-state inline-flex min-h-12 items-center rounded-full bg-[var(--hz-emas)] font-extrabold leading-[1.26] text-[var(--hz-on-emas)] [--m3-state-color:var(--hz-on-emas)]";
const LABEL_KECIL = "text-[11px] font-bold uppercase leading-[1.26]";

/**
 * Judul besar Horizon dipatah per kalimat, seperti semua judul di rancangan V5
 * ("Tiga hari.\nSatu cerita kita.", "Obrolan kecil.\nKenangan besar."); judul
 * satu kalimat dipatah sesudah koma pertama ("Together,\nwe go further.").
 * Kolom judul di CMS satu baris, jadi patahannya dibuat di sini. Judul yang
 * sudah berisi baris baru tidak diubah.
 */
export function patahJudul(judul: string): string {
  if (judul.includes("\n")) return judul;
  const kalimat = judul.split(/(?<=[.!?])\s+(?=\S)/);
  if (kalimat.length > 1) return kalimat.join("\n");
  const koma = judul.indexOf(", ");
  return koma > 0 && koma < judul.length - 2 ? `${judul.slice(0, koma + 1)}\n${judul.slice(koma + 2)}` : judul;
}

/**
 * Kata yang disorot di CMS (Highlight, tersimpan *berbintang*) tampil emas,
 * sama seperti judul Gathering yang memakai warna aksennya. Sorotan dipecah
 * dulu, baru jeda barisnya dipasang: jeda yang jatuh di dalam sorotan
 * ("*Bersama, kita*") tidak boleh membuat bintangnya tampil apa adanya.
 */
export function judulBersorot(judul: string): ReactNode[] {
  const bagian = pecahJudul(judul);
  const polos = bagian.map((b) => b.teks).join("");
  const patah = patahJudul(polos);
  // patahJudul hanya mengganti deret spasi dengan "\n"; sejajarkan kembali ke tiap bagian.
  let j = 0;
  const hasil = bagian.map((b) => {
    let teks = "";
    for (const huruf of b.teks) {
      if (patah[j] === huruf) {
        teks += huruf;
        j += 1;
      } else if (/\s/.test(huruf) && patah[j] === "\n") {
        teks += "\n";
        j += 1;
      } else if (!/\s/.test(huruf)) {
        teks += huruf;
      }
    }
    return { ...b, teks };
  });
  return hasil.map((b, index) =>
    b.sorot ? (
      <span key={index} className="text-[var(--hz-sorot,var(--hz-emas))]">
        {b.teks}
      </span>
    ) : (
      b.teks
    ),
  );
}

/** Catatan pendek dua kalimat: satu kalimat per baris seperti rancangan. Lebih dari itu dibiarkan mengalir. */
function patahCatatan(catatan: string): string {
  if (catatan.includes("\n")) return catatan;
  const kalimat = catatan.split(/(?<=[.!?])\s+(?=\S)/);
  return kalimat.length === 2 ? kalimat.join("\n") : catatan;
}

/** `sunting`: kolom CMS teks tombol ini (klik-untuk-ubah di pratinjau editor). */
export type HorizonAksi = { href: string; label: string; link?: boolean; sunting?: string };

function Tautan({ aksi, className, children, style }: { aksi: HorizonAksi; className: string; children?: ReactNode; style?: CSSProperties }) {
  const isi = children ?? (aksi.sunting ? <span data-sunting={aksi.sunting}>{aksi.label}</span> : aksi.label);
  return aksi.link ? (
    <Link href={aksi.href} className={className} style={style}>
      {isi}
    </Link>
  ) : (
    <a href={aksi.href} className={className} style={style}>
      {isi}
    </a>
  );
}

/** Variabel warna Horizon untuk <main>. `emas` = warna tombol Tema; `onEmas` dan `sorot` (kata disorot di judul) diukur pemanggil. */
export function gayaHorizon(navy: string, emas: string, onEmas: string, sorot: string = emas): CSSProperties {
  return {
    "--hz-navy": navy,
    "--hz-emas": emas,
    "--hz-on-emas": onEmas,
    "--hz-sorot": sorot,
    "--cincin-fokus": CINCIN_TERANG,
    "--hz-cincin-terang": CINCIN_TERANG,
    "--hz-cincin-navy": kontras(emas, navy) >= 3 ? emas : "#ffffff",
    // Mode gelap perangkat tidak mengubah warna halaman Horizon, jadi kontrol bawaan peramban juga tetap terang.
    colorScheme: "light",
  } as CSSProperties;
}

/**
 * Hero (frame "Official KV • Golden horizon hero"): judul terpusat di atas navy,
 * KV utuh selebar layar menempel di bawah (1440×506 di rancangan, rasio
 * gambarnya sendiri). Tinggi 760px di 1440px, ikut mengecil sebanding di
 * layar yang lebih sempit. Ponsel: teks rata kiri, tombol selebar layar, KV
 * menjadi pita 138px di bawahnya.
 */
export function HeroHorizon({
  alis,
  alisPonsel,
  judul,
  catatan,
  aksi,
  kv,
  indeks,
  tandaTangan,
}: {
  /** Label di atas judul, layar lebar ("YOGYAKARTA / 6–8 NOVEMBER 2026"). */
  alis: string | null;
  /** Label yang sama di ponsel ("6–8 NOV 2026 / YOGYAKARTA"). */
  alisPonsel: string | null;
  judul: string;
  catatan: string | null;
  aksi: HorizonAksi;
  kv: string | null;
  /** Baris kecil kiri bawah hero ("01 / Sebuah awal baru"). */
  indeks: string;
  /** Baris kecil kanan bawah hero ("24 Fly Beyond Limits • 2026"). */
  tandaTangan: string;
}) {
  // Ponsel: judul 56px seperti rancangan, mengecil bila kata terpanjangnya
  // tidak muat selebar kolom teks ("kebersamaan" di 360-412px). Hitungannya
  // 0,64em per huruf (huruf kecil Plus Jakarta 800 sekitar 0,6em); kata yang
  // lebih lebar (huruf besar semua) tetap dipatahkan oleh break-word.
  const kataTerpanjang = Math.max(1, ...tanpaBintang(judul).split(/\s+/).map((kata) => kata.length));
  const ukuranPonsel = `min(56px, max(32px, calc(100cqw / ${(kataTerpanjang * 0.64).toFixed(2)})))`;
  return (
    <header data-bagian="pembuka" data-landing-hero className={`relative isolate -mt-[var(--nav-h)] overflow-hidden bg-[var(--hz-navy)] text-white ${CINCIN_NAVY}`}>
      {kv ? (
        // Gambar hiasan, bukan isi: judul dan huruf dimuat lebih dulu.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          data-sunting="pembuka:hero_bg_url"
          src={kv}
          alt=""
          aria-hidden
          fetchPriority="low"
          decoding="async"
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 hidden aspect-[1440/506] w-full select-none object-cover object-bottom [mask-image:linear-gradient(to_bottom,transparent,black_18%)] md:block"
        />
      ) : null}
      <div
        data-sunting="pembuka"
        className="mx-auto flex w-full max-w-[1440px] flex-col pt-[calc(var(--nav-h)+26px)] md:min-h-[clamp(600px,52.78vw,760px)] md:justify-between md:px-16 md:pb-6 md:pt-[calc(var(--nav-h)-24px)]"
      >
        {/* Penyeimbang: rancangan membagi ruang antara bilah atas, teks, dan baris bawah. */}
        <div aria-hidden className="hidden md:block" />
        <div className="flex flex-col gap-[22px] px-6 pb-6 [container-type:inline-size] md:mx-auto md:w-full md:max-w-[980px] md:items-center md:px-0 md:pb-0 md:text-center">
          {alis || alisPonsel ? (
            <p data-sunting="pembuka:hero_eyebrow" className="whitespace-pre-wrap text-[11px] font-bold uppercase leading-[1.26] tracking-[1.2px] text-[var(--hz-sorot,var(--hz-emas))] md:text-[12px] md:tracking-[1.8px] md:text-[#F3DF9E]">
              <span className="md:hidden">{alisPonsel ?? alis}</span>
              <span className="hidden md:inline">{alis ?? alisPonsel}</span>
            </p>
          ) : null}
          <h1
            data-sunting="pembuka:tagline"
            style={{ "--hz-h1": ukuranPonsel } as CSSProperties}
            className="whitespace-pre-line text-balance text-[length:var(--hz-h1)] font-extrabold leading-[1.04] [overflow-wrap:break-word] md:w-full md:text-[64px] md:leading-[1.03] lg:text-[82px]"
          >
            {judulBersorot(judul)}
          </h1>
          {catatan ? (
            <p data-sunting="pembuka:hero_note" className="whitespace-pre-line text-[17px] leading-[1.5] text-[#E1E6F1] md:max-w-[580px] md:text-[22px] md:leading-[1.55] md:text-[#F2F4FA]">
              {patahCatatan(catatan)}
            </p>
          ) : null}
          <Tautan aksi={aksi} className={`${PIL_EMAS} w-full justify-between gap-4 px-[22px] py-[15px] text-[15px] md:w-auto md:justify-center md:px-[26px] md:py-4 md:text-[16px]`}>
            <span data-sunting={aksi.sunting}>{aksi.label}</span>
            {/* Panah bawah menggulir ke cerita; panah kanan pindah ke dialog masuk atau Dashboard saya. */}
            {aksi.href.startsWith("#") ? (
              <ArrowDown size={20} weight="bold" aria-hidden className="shrink-0" />
            ) : (
              <ArrowRight size={20} weight="bold" aria-hidden className="shrink-0" />
            )}
          </Tautan>
        </div>
        {/* Baris bawah di atas KV: bayangan tipis supaya tetap terbaca di atas ornamen emas. */}
        <div aria-hidden className="hidden items-end justify-between text-[12px] leading-[1.26] text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.85)] md:flex">
          <span data-sunting="pembuka:hero_index" className="uppercase tracking-[1.2px]">{indeks}</span>
          <span className="text-[11px]">{tandaTangan}</span>
        </div>
      </div>
      {kv ? (
        // Ponsel: KV sebagai pita di bawah tombol (frame "Official KV horizon • Mobile").
        // eslint-disable-next-line @next/next/no-img-element
        <img src={kv} alt="" aria-hidden fetchPriority="low" decoding="async" className="block h-[138px] w-full select-none object-cover md:hidden" />
      ) : null}
    </header>
  );
}

/**
 * Bagian Tentang acara (frame "Next chapter teaser" dan "02 • Stories between
 * moments"): pembuka cerita "01–03" di atas krem, lalu foto besar bersudut
 * 8/80/8/8 berpasangan dengan label, judul, dan deskripsi. Ponsel: foto
 * selebar layar naik ke atas dengan baris indeks navy di bawahnya.
 */
export function CeritaHorizon({
  pembuka,
  foto,
  alis,
  judul,
  isi,
  indeks,
}: {
  pembuka: { nomor: string | null; judul: string; tautan: HorizonAksi | null } | null;
  foto: { src: string; alt: string } | null;
  alis: string | null;
  judul: string | null;
  isi: string | null;
  indeks: string;
}) {
  // Tanpa kalimat pembuka, judul di samping foto menjadi judul bagian (h2).
  const JudulCerita = pembuka ? "h3" : "h2";
  return (
    <section id="about" className="scroll-mt-16 md:scroll-mt-[72px] text-[#101E38]" style={{ backgroundColor: KREM, color: TINTA }}>
      {foto ? (
        <div className="md:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto.src} alt={foto.alt} loading="lazy" className="block h-[285px] w-full object-cover" />
          <p aria-hidden className="bg-[var(--hz-navy)] px-6 py-4 text-[10px] uppercase leading-[1.26] tracking-[1px] text-[#F0DFAB]">
            {indeks}
          </p>
        </div>
      ) : null}
      {pembuka ? (
        <Muncul className={`${BINGKAI} flex flex-col gap-[14px] py-8 md:flex-row md:items-center md:gap-20 md:py-12`}>
          {pembuka.nomor ? (
            <p aria-hidden className="hidden shrink-0 text-[16px] font-bold leading-[1.26] tabular-nums md:block" style={{ color: BIRU }}>
              {pembuka.nomor}
            </p>
          ) : null}
          <h2 data-sunting="about:program_heading" className="min-w-0 flex-1 whitespace-pre-line text-balance text-[30px] font-extrabold leading-[1.26] [overflow-wrap:anywhere] md:text-[38px] md:leading-[1.2]">{patahJudul(pembuka.judul)}</h2>
          {pembuka.tautan ? (
            <Tautan
              aksi={pembuka.tautan}
              className="m3-state -mx-2 inline-flex min-h-12 shrink-0 items-center gap-1 self-start rounded-md px-2 text-[14px] font-semibold leading-[1.26] md:self-auto md:text-[11px] md:font-normal md:uppercase md:tracking-[1px]"
              style={{ color: BIRU }}
            >
              {pembuka.tautan.label}
              <span aria-hidden>↓</span>
            </Tautan>
          ) : null}
        </Muncul>
      ) : null}
      {judul || isi || foto ? (
        <Muncul className={`${BINGKAI} flex flex-col gap-4 pb-10 pt-3 md:flex-row md:items-center md:gap-16 md:pb-24 md:pt-9 ${pembuka ? "" : "md:pt-24"}`}>
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={foto.src}
              alt={foto.alt}
              loading="lazy"
              className="hidden aspect-[650/450] w-[650px] min-w-0 max-w-[52%] shrink-0 rounded-[8px_80px_8px_8px] object-cover md:block"
            />
          ) : null}
          {judul || isi ? (
            <div className="flex min-w-0 flex-1 flex-col gap-4 md:gap-6">
              {alis ? (
                <p className={`hidden tracking-[1.2px] md:block ${LABEL_KECIL}`} style={{ color: LABEL }}>
                  {alis}
                </p>
              ) : null}
              {judul ? <JudulCerita className="whitespace-pre-line text-balance text-[30px] font-extrabold leading-[1.15] [overflow-wrap:anywhere] md:text-[48px] md:leading-[1.12]">{patahJudul(judul)}</JudulCerita> : null}
              {isi ? (
                <p className="whitespace-pre-line text-[16px] leading-[1.65] md:text-[18px] md:leading-[1.7]" style={{ color: REDUP }}>
                  {isi}
                </p>
              ) : null}
            </div>
          ) : null}
        </Muncul>
      ) : null}
    </section>
  );
}

/** "2026-11-06" menjadi "Jumat, 6 November" (Indonesia) atau "Friday 6 November" (English). */
export function labelHari(tanggal: string | null, lang: LandingLang): string | null {
  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return null;
  const locale = lang === "en" ? "en-GB" : "id-ID";
  const d = new Date(`${tanggal}T00:00:00Z`);
  return d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/**
 * Susunan acara (frame "03 • Journey chapters"): judul besar di atas navy,
 * lalu satu blok per hari rundown. Layar lebar: kolom kiri (4/12, menempel saat
 * digulir) berisi "Hari 01", judul bagian, tanggal (sekali saja, lihat
 * judulMemuatTanggal) dan cerita singkat (`program_notes`); kolom kanan (8/12)
 * berisi jadwal hari itu sebagai daftar jam selebar kolom, seperti agenda
 * publik Sched dan situs konferensi. Ponsel: keduanya bertumpuk.
 */
export function PerjalananHorizon({
  judul,
  tanggal,
  catatan,
  agenda,
  cerita,
  lang,
  speakers,
}: {
  judul: string;
  /** Rentang tanggal acara di kanan judul ("6–8 November 2026"). */
  tanggal: string | null;
  catatan: string | null;
  agenda: AgendaPreview[];
  cerita: string[];
  lang: LandingLang;
  /** Pembicara yang tertaut ke sesi (sama dengan agenda Modern), tampil saat satu hari dibuka penuh. */
  speakers: LandingSpeaker[];
}) {
  const t = LANDING_UI[lang];
  return (
    <section id="agenda" className={`scroll-mt-16 md:scroll-mt-[72px] bg-[var(--hz-navy)] text-white ${CINCIN_NAVY}`}>
      <div className={`${BINGKAI} flex flex-col gap-7 py-10 md:gap-10 md:py-20`}>
        <Muncul className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-10">
          <h2 className="whitespace-pre-line text-balance text-[30px] font-extrabold leading-[1.26] [overflow-wrap:anywhere] md:max-w-[720px] md:text-[56px] md:leading-[1.1]" style={{ color: KREM }}>
            {patahJudul(judul)}
          </h2>
          {tanggal || catatan ? (
            <p className="hidden shrink-0 text-[13px] leading-[1.7] md:block" style={{ color: REDUP_NAVY }}>
              {tanggal ? <span className="block uppercase tabular-nums">{tanggal}</span> : null}
              {catatan ? <span className="block max-w-[360px]">{catatan}</span> : null}
            </p>
          ) : null}
        </Muncul>
        <ol className="flex flex-col gap-7 md:gap-0">
          {agenda.map((bagian, index) => {
            const nomor = String(index + 1).padStart(2, "0");
            const judulHari = bagian.sectionTitle?.trim() || t.day(index + 1);
            // Tanggal ditulis sekali: dilewati bila judul bagian sudah menyebutnya.
            const tanggalHari = judulMemuatTanggal(judulHari, bagian.tanggal) ? null : labelHari(bagian.tanggal, lang);
            const isiCerita = cerita[index]?.trim();
            return (
              // Indeks, bukan judul: dua bagian rundown boleh berjudul sama.
              <Muncul as="li" key={index} jeda={Math.min(index, 4) * 0.06} className="grid gap-5 border-t pt-6 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-12 md:py-10 lg:gap-16" style={{ borderColor: GARIS_NAVY }}>
                <div className="flex min-w-0 flex-col gap-2 md:sticky md:top-24 md:self-start">
                  <p className="text-[12px] font-bold uppercase leading-4 tracking-[1.2px] tabular-nums text-[var(--hz-sorot,var(--hz-emas))]">
                    {t.day(index + 1).replace(/\d+$/, nomor)}
                  </p>
                  <h3 className="text-balance text-[24px] font-extrabold leading-8 [overflow-wrap:anywhere] md:text-[28px] md:leading-9">{judulHari}</h3>
                  {tanggalHari ? (
                    <p className="text-[14px] leading-5" style={{ color: REDUP_NAVY }}>
                      {tanggalHari}
                    </p>
                  ) : null}
                  {isiCerita ? (
                    <p className="mt-2 hidden whitespace-pre-line text-[15px] leading-6 md:block" style={{ color: REDUP_NAVY }}>
                      {isiCerita}
                    </p>
                  ) : null}
                </div>
                <JamHariHorizon semua={bagian.items} speakers={speakers} lang={lang} pilihan={bagian.pilihan} />
              </Muncul>
            );
          })}
        </ol>
        {catatan ? (
          <p className="text-[11px] leading-[1.26] md:hidden" style={{ color: REDUP_NAVY }}>
            {catatan}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Bagian Portal peserta (frame "04 • Personal invitation"): ajakan masuk di
 * atas biru pucat dan kartu perjalanan navy ber-KV di kanan. Kartu ini contoh
 * tanpa data pribadi; data peserta ada di portal setelah masuk. Ponsel dan
 * tablet: tanpa kartu, tombol selebar layar.
 */
export function UndanganHorizon({
  alis,
  judul,
  catatan,
  aksi,
  kartu,
}: {
  alis: string;
  judul: string;
  catatan: string;
  aksi: HorizonAksi | null;
  kartu: { kv: string | null; label: string; dari: string | null; ke: string | null; tanggal: string | null; info: string };
}) {
  return (
    <section id="portal" className="scroll-mt-16 md:scroll-mt-[72px]" style={{ backgroundColor: PUCAT, color: TINTA }}>
      <div className={`${BINGKAI} flex flex-col gap-5 py-10 lg:flex-row lg:items-center lg:gap-[72px] md:py-[88px]`}>
        <Muncul className="flex min-w-0 flex-1 flex-col gap-5 md:gap-6">
          <p data-sunting="portal:portal_eyebrow" className={`hidden tracking-[1px] md:block ${LABEL_KECIL}`} style={{ color: LABEL }}>
            {alis}
          </p>
          <h2 data-sunting="portal:portal_heading" className="whitespace-pre-line text-balance text-[31px] font-extrabold leading-[1.26] [overflow-wrap:anywhere] md:text-[46px] md:leading-[1.15]">{patahJudul(judul)}</h2>
          <p data-sunting="portal:portal_note" className="text-[16px] leading-[1.6] md:text-[17px] md:leading-[1.7]" style={{ color: REDUP }}>
            {catatan}
          </p>
          {aksi ? (
            <Tautan aksi={aksi} className={`${PIL_EMAS} w-full justify-center px-[18px] py-[15px] text-[14px] font-bold md:w-auto md:self-start md:px-7 md:py-4 md:text-[15px]`} />
          ) : null}
        </Muncul>
        <Muncul jeda={0.1} className="hidden w-[440px] shrink-0 lg:block">
        <div aria-hidden className="flex flex-col gap-6 rounded-[24px] bg-[var(--hz-navy)] p-[30px] text-white">
          {kartu.kv ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={kartu.kv} alt="" loading="lazy" decoding="async" className="block h-[130px] w-full object-cover" />
          ) : null}
          <p className="text-[12px] uppercase leading-[1.26] tracking-[1.4px] text-[var(--hz-sorot,var(--hz-emas))]">{kartu.label}</p>
          {kartu.dari || kartu.ke ? (
            <p className="flex flex-col text-[38px] font-extrabold leading-[1.2] [overflow-wrap:anywhere]">
              {kartu.dari ? (
                <>
                  <span>{kartu.dari}</span>
                  <span>↓</span>
                </>
              ) : null}
              {kartu.ke ? <span>{kartu.ke}</span> : null}
            </p>
          ) : null}
          {kartu.tanggal ? <p className="text-[14px] font-bold uppercase leading-[1.26] tabular-nums text-[var(--hz-sorot,var(--hz-emas))]">{kartu.tanggal}</p> : null}
          <p className="text-[12px] leading-[1.26]" style={{ color: REDUP_NAVY }}>
            {kartu.info}
          </p>
        </div>
        </Muncul>
      </div>
    </section>
  );
}

/**
 * Pita penutup emas (frame "05 • Closing invitation"): judul besar terpusat,
 * tombol navy, dan tautan masuk bagi yang sudah terdaftar. Ponsel: rata kiri,
 * tombol selebar layar, dan tanda tangan acara menggantikan kaki navy.
 */
export function PenutupHorizon({
  judul,
  aksi,
  masuk,
  tandaTangan,
}: {
  judul: string;
  aksi: HorizonAksi;
  masuk: HorizonAksi | null;
  tandaTangan: string;
}) {
  return (
    <section data-sunting="kaki:cta_heading" className="bg-[var(--hz-emas)] text-[var(--hz-on-emas)]">
      <Muncul className={`${BINGKAI} flex flex-col gap-6 py-10 md:items-center md:py-[88px] md:text-center`}>
        <h2 className="max-w-[1000px] whitespace-pre-line text-balance text-[31px] font-extrabold leading-[1.2] [overflow-wrap:anywhere] md:text-[58px] md:leading-[1.1]">{patahJudul(judul)}</h2>
        <Tautan
          aksi={aksi}
          className="m3-state inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--hz-navy)] px-5 py-[15px] text-[15px] font-bold leading-[1.26] text-white [--m3-state-color:#fff] md:w-auto md:px-8 md:py-4 md:text-[16px]"
        />
        {masuk ? (
          <Tautan aksi={masuk} className="m3-state -my-3 hidden min-h-12 items-center rounded-md px-2 text-[14px] leading-[1.26] opacity-90 md:inline-flex" />
        ) : null}
        <p className="text-[11px] leading-[1.26] opacity-90 md:hidden">{tandaTangan}</p>
      </Muncul>
    </section>
  );
}

/**
 * Kaki navy (frame "Footer"): nama acara dan tahun di kiri, catatan kaki CMS di
 * kanan. Di ponsel hanya tampil bila pita penutup tidak ada (tanda tangannya
 * sudah di pita itu).
 */
export function KakiHorizon({ tandaTangan, catatan, ponsel }: { tandaTangan: string; catatan: string | null; ponsel: boolean }) {
  return (
    <footer data-bagian="kaki" className={`bg-[var(--hz-navy)] ${CINCIN_NAVY} ${ponsel ? "" : "hidden md:block"}`}>
      <div className={`${BINGKAI} flex flex-col gap-2 py-[30px] md:flex-row md:items-center md:justify-between md:gap-10`}>
        <p className="text-[13px] font-bold leading-[1.26]" style={{ color: KREM }}>
          {tandaTangan}
        </p>
        {catatan ? (
          <p className="text-[11px] leading-[1.5] md:text-right" style={{ color: REDUP_NAVY }}>
            {catatan}
          </p>
        ) : null}
      </div>
    </footer>
  );
}
