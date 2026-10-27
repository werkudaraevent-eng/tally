import type { Icon } from "@phosphor-icons/react";
import { Check, CheckCircle, X, XCircle } from "@phosphor-icons/react/dist/ssr";
import type { CSSProperties, ReactNode } from "react";
import { landingBlockLayout, type LandingBlock, type LandingBlockItem, type LandingDoKind } from "@/lib/domain";
import { LANDING_CARD_ICON_POLA } from "@/lib/landing-card-icons";
import { LANDING_UI, type LandingLang } from "@/lib/landing-i18n";
import { GambarIkonKartu } from "./gambar-ikon-kartu";
import { MUAT_IKON } from "./ikon-ssr";
import { LipatDaftar } from "./lipat-daftar";
import { MUTED } from "./styles";

/**
 * Blok Do's and Don'ts: yang perlu dilakukan dan yang perlu dihindari, tiap
 * butir dengan ikon. Tiga tampilan dipilih admin (Layout):
 * - Kisi ikon (`tiles`): ubin per butir, ikon besar dalam lingkaran dengan
 *   lencana centang atau silang. Paling dekat dengan buku panduan cetak.
 * - Dua kartu (`cards`): satu kartu Lakukan dan satu Hindari, berdampingan di
 *   layar lebar.
 * - Daftar ringkas (`list`): ikon dan teks tanpa kartu, gaya fasilitas Airbnb.
 *   Lakukan di atas 6 butir dilipat; Hindari selalu tampil penuh, karena
 *   larangan tidak boleh tersembunyi di balik tombol.
 *
 * Do dan Don't dibedakan dengan kata (judul kelompok), ikon (centang/silang),
 * dan warna, bukan warna saja (WCAG 1.4.1). Butir tanpa ikon memakai
 * centang atau silang sebagai ikonnya.
 */

/** Hijau dan merah tetap untuk semua acara: arti centang/silang tidak ikut warna merek. */
const WARNA: Record<LandingDoKind, { biasa: string; gelap: string }> = {
  do: { biasa: "#1E7B45", gelap: "#7BD6A0" },
  dont: { biasa: "#B42318", gelap: "#FF9C8F" },
};

/** Lakukan di Daftar ringkas yang tampil sebelum dilipat. */
const DAFTAR_TAMPIL = 6;

type Butir = { judul: string; catatan: string | null; Ikon: Icon | null; gambar: string | null };

async function siapkan(item: LandingBlockItem): Promise<Butir> {
  const nama = item.icon?.trim();
  const ambil = nama && LANDING_CARD_ICON_POLA.test(nama) && Object.hasOwn(MUAT_IKON, nama) ? MUAT_IKON[nama] : undefined;
  return {
    judul: item.title?.trim() ?? "",
    catatan: item.body?.trim() || null,
    Ikon: ambil ? await ambil().catch(() => null) : null,
    gambar: item.icon_url?.trim() || null,
  };
}

/** Ikon butir: gambar sendiri, ikon pustaka, atau centang/silang bila kosong. */
function IkonButir({ butir, jenis, ukuran }: { butir: Butir; jenis: LandingDoKind; ukuran: number }) {
  const Cadangan = jenis === "do" ? Check : X;
  const ikon = butir.Ikon ? (
    <butir.Ikon size={ukuran} aria-hidden className="shrink-0" />
  ) : (
    <Cadangan size={ukuran} weight="bold" aria-hidden className="shrink-0 text-[var(--dd-warna)]" />
  );
  return (
    <GambarIkonKartu src={butir.gambar} size={ukuran} className="shrink-0 object-contain">
      {ikon}
    </GambarIkonKartu>
  );
}

function JudulKelompok({ jenis, teks }: { jenis: LandingDoKind; teks: string }) {
  const Tanda = jenis === "do" ? CheckCircle : XCircle;
  return (
    <h3 className="flex items-center gap-2 text-[20px] font-bold leading-7">
      <Tanda size={24} weight="fill" aria-hidden className="shrink-0 text-[var(--dd-warna)]" />
      {teks}
    </h3>
  );
}

function Teks({ butir, tebal }: { butir: Butir; tebal?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col gap-1 [overflow-wrap:anywhere]">
      <span className={tebal ? "text-[16px] font-semibold leading-6" : "text-[16px] leading-6"}>{butir.judul}</span>
      {butir.catatan ? <span className={`text-[14px] leading-5 ${MUTED}`}>{butir.catatan}</span> : null}
    </span>
  );
}

/** Kisi ikon: ubin, ikon 28 dalam lingkaran 56 berwarna lembut, lencana 22 di kanan bawah. */
function Ubin({ butir, jenis }: { butir: Butir; jenis: LandingDoKind }) {
  const Tanda = jenis === "do" ? Check : X;
  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-[var(--blok-kartu)] p-4">
      <span className="relative grid size-14 place-items-center rounded-full bg-[color-mix(in_srgb,var(--dd-warna)_14%,transparent)]">
        <IkonButir butir={butir} jenis={jenis} ukuran={28} />
        <span aria-hidden className="absolute -bottom-0.5 -right-0.5 grid size-[22px] place-items-center rounded-full bg-[var(--dd-lencana)] text-white shadow-[0_0_0_2px_var(--dd-cincin)]">
          <Tanda size={13} weight="bold" />
        </span>
      </span>
      <Teks butir={butir} tebal />
    </li>
  );
}

function Baris({ butir, jenis, ukuran }: { butir: Butir; jenis: LandingDoKind; ukuran: number }) {
  return (
    <li className="flex items-start gap-4">
      {/* Ikon di tengah baris pertama teks (24px), juga ikon 28px. */}
      <span className="flex h-6 shrink-0 items-center"><IkonButir butir={butir} jenis={jenis} ukuran={ukuran} /></span>
      <Teks butir={butir} />
    </li>
  );
}

export async function BlokDosDonts({ block, lang, kepala }: { block: LandingBlock; lang: LandingLang; kepala: ReactNode }) {
  const ui = LANDING_UI[lang];
  const layout = landingBlockLayout(block);
  const semua = (block.items ?? []).filter((item) => item.title?.trim());
  const [lakukan, hindari] = await Promise.all([
    Promise.all(semua.filter((item) => item.kind !== "dont").map(siapkan)),
    Promise.all(semua.filter((item) => item.kind === "dont").map(siapkan)),
  ]);
  const gelap = block.tone === "dark";
  const kelompok = ([["do", lakukan], ["dont", hindari]] as const)
    .filter(([, daftar]) => daftar.length > 0)
    .map(([jenis, daftar]) => ({
      jenis,
      daftar,
      judul: (jenis === "do" ? block.do_label : block.dont_label)?.trim() || (jenis === "do" ? ui.doLabel : ui.dontLabel),
      gaya: {
        "--dd-warna": WARNA[jenis][gelap ? "gelap" : "biasa"],
        "--dd-lencana": WARNA[jenis].biasa,
        "--dd-cincin": gelap ? "transparent" : "var(--blok-kartu)",
      } as CSSProperties,
    }));

  if (layout === "cards") {
    return (
      <>
        {kepala}
        <div className={kelompok.length > 1 ? "grid gap-4 sm:gap-6 lg:grid-cols-2" : "grid max-w-[720px]"}>
          {kelompok.map(({ jenis, daftar, judul, gaya }) => (
            <div key={jenis} style={gaya} className="flex flex-col gap-4 rounded-2xl bg-[var(--blok-kartu)] p-5 sm:p-6">
              <JudulKelompok jenis={jenis} teks={judul} />
              <ul className="flex flex-col gap-4">
                {daftar.map((butir, index) => <Baris key={index} butir={butir} jenis={jenis} ukuran={24} />)}
              </ul>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (layout === "list") {
    const kolom = "grid gap-x-6 gap-y-4 lg:grid-cols-2";
    return (
      <>
        {kepala}
        <div className="flex max-w-[880px] flex-col">
          {kelompok.map(({ jenis, daftar, judul, gaya }) => {
            const lipat = jenis === "do" && daftar.length > DAFTAR_TAMPIL + 1;
            const tampil = lipat ? daftar.slice(0, DAFTAR_TAMPIL) : daftar;
            const sisa = lipat ? daftar.slice(DAFTAR_TAMPIL) : [];
            return (
              <div key={jenis} style={gaya} className="flex flex-col gap-4 border-t border-[var(--reg-outline-variant)] py-6">
                <JudulKelompok jenis={jenis} teks={judul} />
                <ul className={kolom}>{tampil.map((butir, index) => <Baris key={index} butir={butir} jenis={jenis} ukuran={28} />)}</ul>
                {sisa.length > 0 ? (
                  <LipatDaftar className={kolom} tombolBuka={ui.showMoreItems(sisa.length)} tombolTutup={ui.showFewerItems}>
                    {sisa.map((butir, index) => <Baris key={index} butir={butir} jenis={jenis} ukuran={28} />)}
                  </LipatDaftar>
                ) : null}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <>
      {kepala}
      <div className="flex flex-col gap-10">
        {kelompok.map(({ jenis, daftar, judul, gaya }) => (
          <div key={jenis} style={gaya} className="flex flex-col gap-4">
            <JudulKelompok jenis={jenis} teks={judul} />
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
              {daftar.map((butir, index) => <Ubin key={index} butir={butir} jenis={jenis} />)}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
