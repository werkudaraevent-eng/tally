import type { ReactNode } from "react";
import type { HariDressCode } from "@/lib/dress-code-publik";
import { judulMemuatTanggal } from "@/lib/judul-hari";
import { LANDING_UI, type LandingLang } from "@/lib/landing-i18n";
import { PORTAL_UI } from "@/lib/member/portal-i18n";
import { kapanOutfit } from "@/lib/outfit";
import { KartuOutfitHorizon } from "@/components/member/portal-horizon";
import { labelHari } from "./horizon";
import { HEAD, MUTED } from "./styles";

/**
 * Blok Dress code: apa yang dipakai tiap hari, dibaca dari Agenda > Dress
 * code (src/lib/dress-code-publik.ts). Susunannya sama dengan Susunan acara
 * Horizon: kolom hari 4/12 di kiri ("Hari 01", nama tab, tanggal sekali),
 * kartu di 8/12. Kartunya kartu halaman Outfit peserta (KartuOutfitHorizon),
 * jadi foto, pilihan gaya, dan penampil layar penuh sama persis di kedua
 * tempat. Ponsel: hari dan kartu bertumpuk, pilihan gaya digeser ke samping.
 *
 * `labelOutfit`: label halaman Outfit peserta. Diisi hanya bila halaman itu
 * ada (Horizon dengan area peserta): kaki blok lalu menyebutnya.
 */
export function BlokDressCode({ hari, lang, kepala, labelOutfit }: { hari: HariDressCode[]; lang: LandingLang; kepala: ReactNode; labelOutfit: string | null }) {
  const t = LANDING_UI[lang];
  const to = PORTAL_UI[lang].horizon.outfit;
  return (
    <>
      {kepala}
      <ol className="flex flex-col">
        {hari.map((isi) => {
          const judul = isi.judul || (isi.nomor ? t.day(isi.nomor) : null);
          const tanggal = judulMemuatTanggal(judul, isi.tanggal) ? null : labelHari(isi.tanggal, lang);
          return (
            <li key={isi.id} className="grid gap-4 border-t border-[var(--reg-outline-variant)] py-6 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-12 md:py-10 lg:gap-16">
              <div className="flex min-w-0 flex-col gap-2">
                {isi.nomor ? (
                  <p className="text-[12px] font-bold uppercase leading-4 tracking-[1.2px] tabular-nums text-[var(--blok-aksen)]">
                    {t.day(isi.nomor).replace(/\d+$/, String(isi.nomor).padStart(2, "0"))}
                  </p>
                ) : null}
                {judul ? <h3 className={`${HEAD} text-balance text-[22px] font-extrabold leading-[30px] [overflow-wrap:anywhere] md:text-[28px] md:leading-9`}>{judul}</h3> : null}
                {tanggal ? <p className={`text-[14px] leading-5 ${MUTED}`}>{tanggal}</p> : null}
              </div>
              {/* Kolom 8/12 bisa sempit di layar lebar (pratinjau admin, 768-1279): kartu foto
                  mengukur lebar kolom ini, bukan layar, supaya teks tidak terjepit di samping foto. */}
              <div className="@container flex min-w-0 flex-col gap-4">
                {isi.isian.map((isian, index) => (
                  <KartuOutfitHorizon
                    key={index}
                    kapan={kapanOutfit(isian, to.allDay)}
                    apa={isian.what}
                    catatan={isian.note ?? null}
                    foto={isian.photo_url ?? null}
                    pilihan={isian.options}
                    tingkat={judul ? 4 : 3}
                    wadah
                    judulFoto={judul ?? "Dress code"}
                    teksFoto={{ buka: to.openPhoto(isian.what), lihat: to.viewPhoto, perbesar: to.enlarge, tutup: to.closePhoto }}
                    teksPilihan={{ pilih: to.options(isian.options?.length ?? 0), buka: to.openPhoto, tutup: to.closePhoto, sebelumnya: to.prevPhoto, berikutnya: to.nextPhoto }}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ol>
      {labelOutfit ? <p className={`border-t border-[var(--reg-outline-variant)] pt-6 text-[14px] leading-5 ${MUTED}`}>{t.horizon.dressCodeNote(labelOutfit)}</p> : null}
    </>
  );
}
