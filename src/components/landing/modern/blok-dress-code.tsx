import { Fragment, type ReactNode } from "react";
import type { HariDressCode } from "@/lib/dress-code-publik";
import { LANDING_UI, type LandingLang } from "@/lib/landing-i18n";
import { PORTAL_UI } from "@/lib/member/portal-i18n";
import type { OutfitEntry } from "@/lib/outfit";
import { kapanOutfit } from "@/lib/outfit";
import { KartuOutfitHorizon } from "@/components/member/portal-horizon";
import { MUTED } from "./styles";
import { TabHariDressCode, type ChipHariDressCode } from "./tab-hari-dress-code";

const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/** "Jum" dan "6 Nov" untuk chip tanggal. */
function bagianTanggal(tanggal: string, lang: LandingLang) {
  const locale = lang === "en" ? "en-GB" : "id-ID";
  const d = new Date(`${tanggal}T00:00:00Z`);
  return {
    hari: d.toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" }).replace(/\.$/, ""),
    tanggal: d.toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" }).replace(/\.$/, ""),
  };
}

/** Hari ini di Jakarta (acara Tally berjam WIB), "YYYY-MM-DD". */
function hariIni(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Blok Dress code: apa yang dipakai tiap hari, dibaca dari Agenda > Dress
 * code (src/lib/dress-code-publik.ts). Chip tanggal di atas, satu hari tampil
 * selebar blok (pola chip tanggal halaman Outfit peserta; keputusan Mas 29 Okt:
 * semua hari bertumpuk terlalu panjang, dan "Hari 02" membingungkan karena
 * menghitung tab Agenda). Hari awal: hari ini atau hari berikutnya, lalu hari
 * pertama. Kartunya kartu halaman Outfit peserta (KartuOutfitHorizon) yang
 * mengukur lebar blok, bukan layar. Baris "Setiap hari" (id 0) tampil di atas
 * setiap hari, seperti di halaman Outfit.
 *
 * `labelOutfit`: label halaman Outfit peserta. Diisi hanya bila halaman itu
 * ada (Horizon dengan area peserta): kaki blok lalu menyebutnya.
 */
export function BlokDressCode({ hari, lang, kepala, labelOutfit }: { hari: HariDressCode[]; lang: LandingLang; kepala: ReactNode; labelOutfit: string | null }) {
  const t = LANDING_UI[lang];
  const to = PORTAL_UI[lang].horizon.outfit;
  const setiapHari = hari.find((isi) => isi.id === 0)?.isian ?? [];
  // Chip urut tanggal (tab tanpa tanggal di akhir); tanggal sama tetap urutan Agenda.
  const daftar = hari
    .filter((isi) => isi.id !== 0)
    .map((isi, urutan) => ({ isi, urutan }))
    .sort((a, b) => (a.isi.tanggal ?? "9999").localeCompare(b.isi.tanggal ?? "9999") || a.urutan - b.urutan)
    .map(({ isi }) => isi);

  const kartu = (isian: OutfitEntry, kunci: string, judulFoto: string) => (
    <KartuOutfitHorizon
      key={kunci}
      kapan={kapanOutfit(isian, to.allDay)}
      apa={isian.what}
      catatan={isian.note ?? null}
      foto={isian.photo_url ?? null}
      pilihan={isian.options}
      tingkat={3}
      wadah
      judulFoto={judulFoto}
      teksFoto={{ buka: to.openPhoto(isian.what), lihat: to.viewPhoto, perbesar: to.enlarge, tutup: to.closePhoto }}
      teksPilihan={{ pilih: to.options(isian.options?.length ?? 0), buka: to.openPhoto, tutup: to.closePhoto, sebelumnya: to.prevPhoto, berikutnya: to.nextPhoto }}
    />
  );
  const setiap = (judulFoto: string) => setiapHari.map((isian, index) => kartu(isian, `setiap-${index}`, judulFoto));
  const kaki = labelOutfit ? <p className={`border-t border-[var(--reg-outline-variant)] pt-6 text-[14px] leading-5 ${MUTED}`}>{t.horizon.dressCodeNote(labelOutfit)}</p> : null;

  // Hanya "Setiap hari", atau satu hari: tanpa chip.
  if (daftar.length <= 1) {
    const satu = daftar[0];
    return (
      <>
        {kepala}
        <div className="@container flex min-w-0 flex-col gap-4">
          {setiap(satu?.judul ?? "Dress code")}
          {satu?.isian.map((isian, index) => kartu(isian, String(index), satu.judul ?? "Dress code"))}
        </div>
        {kaki}
      </>
    );
  }

  // Dua tab Agenda di tanggal yang sama (mis. per batch) atau tab tanpa tanggal: chip memakai nama tab.
  const kembar = (tanggal: string | null) => !tanggal || daftar.filter((isi) => isi.tanggal === tanggal).length > 1;
  const chip: ChipHariDressCode[] = daftar.map((isi) => {
    if (isi.tanggal && TANGGAL.test(isi.tanggal) && !kembar(isi.tanggal)) {
      const bagian = bagianTanggal(isi.tanggal, lang);
      return { atas: bagian.hari, bawah: bagian.tanggal };
    }
    const bagian = isi.tanggal && TANGGAL.test(isi.tanggal) ? bagianTanggal(isi.tanggal, lang) : null;
    // "Jumat, 06 November 2026 (Batch 2)" -> "Batch 2": tanggalnya sudah di baris atas chip.
    const nama = isi.judul?.match(/\(([^()]+)\)\s*$/)?.[1]?.trim() || isi.judul;
    return { atas: bagian ? `${bagian.hari}, ${bagian.tanggal}` : "", bawah: nama ?? (isi.nomor ? t.day(isi.nomor) : null) };
  });
  const sekarang = hariIni();
  const awal = Math.max(0, daftar.findIndex((isi) => isi.tanggal !== null && isi.tanggal >= sekarang));
  const panel = daftar.map((isi) => {
    const judulFoto = isi.judul ?? "Dress code";
    return (
      <Fragment key={isi.id}>
        {setiap(judulFoto)}
        {isi.isian.map((isian, index) => kartu(isian, String(index), judulFoto))}
      </Fragment>
    );
  });

  return (
    <>
      {kepala}
      <TabHariDressCode chip={chip} panel={panel} awal={awal} label={t.horizon.dressCodeDays} />
      {kaki}
    </>
  );
}
