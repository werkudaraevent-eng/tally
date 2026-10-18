"use client";

import { usePakaiQrCheckpoint } from "@/components/checkpoint/pakai-qr-checkpoint";

/**
 * Layar besar QR checkpoint. Teksnya dalam bahasa utama acara, seperti layar
 * panggung lain: yang membacanya peserta, bukan panitia. Warna tetap navy dan
 * QR di atas putih, supaya kamera ponsel membacanya di ruangan terang atau gelap.
 */

const TEKS = {
  id: {
    ke: (n: number, total: number) => `Checkpoint ${n} dari ${total}`,
    caraAwal: "Buka halaman pesertamu, ketuk ",
    tombol: "Pindai QR checkpoint",
    caraAkhir: ", lalu arahkan ke kode ini.",
    lain: "Scan the code from your participant page.",
    ganti: (detik: number) => `Kode baru dalam ${detik} detik`,
    selesai: (n: number) => `${n.toLocaleString("id-ID")} peserta sudah selesai`,
    tutup: "Checkpoint ini sedang ditutup panitia.",
  },
  en: {
    ke: (n: number, total: number) => `Checkpoint ${n} of ${total}`,
    caraAwal: "Open your participant page, tap ",
    tombol: "Scan checkpoint QR",
    caraAkhir: ", then point it at this code.",
    lain: "Pindai kode ini dari halaman pesertamu.",
    ganti: (detik: number) => `New code in ${detik} s`,
    selesai: (n: number) => `${n.toLocaleString("en-GB")} participants done`,
    tutup: "The organisers have closed this checkpoint for now.",
  },
} as const;

export default function LayarQrCheckpoint({ sesiId }: { sesiId: number | null }) {
  const { data, gambar, galat, sisaDetik, sisaPersen } = usePakaiQrCheckpoint(sesiId);
  const lang = data?.event.lang ?? "id";
  const t = TEKS[lang];
  const pertama = data?.checkpoints[0] ?? null;
  const judul = data?.checkpoints.map((cp) => (lang === "en" && cp.title_en?.trim()) || cp.title).join(" · ") ?? "";

  return (
    <main className="flex min-h-dvh flex-col bg-[#0B182D] text-white lg:flex-row lg:items-center">
      <section className="flex flex-1 flex-col justify-center gap-5 px-8 py-10 lg:px-16">
        {sesiId === null ? (
          <p className="text-title-large">Open this screen from Check-in &gt; Checkpoints or the scanner app (Show QR).</p>
        ) : galat && !data ? (
          <p role="alert" className="text-title-large text-[#FFB4AB]">{galat}</p>
        ) : (
          <>
            {pertama && data ? (
              <p className="text-[16px] font-semibold uppercase tracking-[0.8px] text-[#E8C968]">{t.ke(pertama.position, data.total_checkpoints)}</p>
            ) : null}
            <h1 className="text-balance text-[clamp(36px,5vw,64px)] font-bold leading-[1.1] [overflow-wrap:anywhere]">{judul || " "}</h1>
            <p className="max-w-[34ch] text-[clamp(20px,2vw,26px)] leading-[1.4] text-white/85">
              {t.caraAwal}
              <span className="font-semibold text-[#E8C968]">{t.tombol}</span>
              {t.caraAkhir}
            </p>
            {data ? <p lang={lang === "en" ? "id" : "en"} className="text-[18px] text-white/60">{t.lain}</p> : null}
          </>
        )}
      </section>
      <section className="flex flex-col items-center justify-center gap-4 px-8 pb-12 lg:w-[46%] lg:pb-0">
        {data && !data.open ? <p role="alert" className="text-[18px] font-semibold text-[#FFB4AB]">{t.tutup}</p> : null}
        <div className="rounded-[28px] bg-white p-5">
          {gambar ? (
            // eslint-disable-next-line @next/next/no-img-element -- QR dari data URL
            <img src={gambar} alt="Checkpoint QR" className="block aspect-square w-[min(70vw,58dvh,440px)] [image-rendering:pixelated]" />
          ) : (
            <div aria-hidden className="aspect-square w-[min(70vw,58dvh,440px)] animate-pulse rounded-lg bg-[#eceef3] motion-reduce:animate-none" />
          )}
        </div>
        <div aria-hidden className="h-1.5 w-[min(70vw,58dvh,440px)] overflow-hidden rounded-full bg-white/20">
          <i className="block h-full rounded-full bg-[#E8C968]" style={{ width: `${sisaPersen}%` }} />
        </div>
        {data ? (
          <p className="text-center text-[18px] text-white/75">
            {t.ganti(sisaDetik)}
            {data.done != null ? ` · ${t.selesai(data.done)}` : ""}
          </p>
        ) : null}
      </section>
    </main>
  );
}
