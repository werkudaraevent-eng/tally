"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BrandFooter, BrandLogo } from "@/components/brand-header-footer";
import { DEFAULT_BRANDING, fontStack, normalizeBranding, scaleClamp, type Branding } from "@/lib/branding";
import type { UndianState } from "@/lib/undian";
import { CardsAnimation, ConfettiBurst, DigitsAnimation, SlotAnimation, WheelAnimation, WinnerList } from "./undian-animations";

// Layar panggung undian.
//
// Dua timer POLLING TERPISAH, sengaja:
//   * state  2 detik — kecepatan upacara. Payloadnya kecil.
//   * (tidak ada timer kedua di sini karena setelan ikut di response yang sama;
//     bila kelak dipisah, jangan satukan timernya. Satu timer bersama memaksa
//     kompromi yang merugikan salah satu: entah reveal terlambat, entah setelan
//     ditanyakan puluhan kali per menit tanpa alasan.)
//
// Nama pemenang TIDAK PERNAH ada di komponen ini sebelum server mengirimkannya.
// Lihat komentar di /api/undian/state.

const POLL_MS = 2000;

type Props = { initial: UndianState & { branding: Branding } };

export default function UndianClient({ initial }: Props) {
  const [state, setState] = useState(initial);
  const [confettiTrigger, setConfettiTrigger] = useState(0);

  const load = useCallback(async () => {
    const response = await fetch("/api/undian/state", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as UndianState & { branding: Record<string, unknown> };
    // Branding dinormalisasi ulang di klien: kolom skala bertipe `numeric` dan
    // datang dari driver sebagai string.
    setState({ ...data, branding: normalizeBranding(data.branding) });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    const interval = window.setInterval(() => { void load(); }, POLL_MS);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [load]);

  // Confetti dipicu sekali per undian, bukan setiap kali data disegarkan.
  //
  // Tanpa penanda ini, polling 2 detik menembakkan confetti berulang selama
  // pemenang masih tampil di layar — dan tidak ada yang bisa menghentikannya
  // selain menutup halaman.
  //
  // Perbandingan dilakukan SAAT RENDER, bukan di dalam effect: React Compiler
  // menolak setState sinkron di badan effect. Suara tetap di effect karena ia
  // efek samping ke sistem luar (Web Audio), bukan pembaruan state.
  const revealKey = state.phase === "revealed" && state.winners.length > 0
    ? `${state.prize?.id ?? 0}-${state.draw_round}`
    : "";
  const [seenReveal, setSeenReveal] = useState("");
  if (revealKey !== "" && seenReveal !== revealKey) {
    setSeenReveal(revealKey);
    if (state.settings.confetti_enabled) setConfettiTrigger((value) => value + 1);
  }

  useEffect(() => {
    if (revealKey === "" || !state.settings.sound_enabled) return;
    playFanfare();
  }, [revealKey, state.settings.sound_enabled]);

  // Fullscreen dibaca di inisialisasi state, bukan di effect, supaya render
  // pertama sudah benar. Permintaan fullscreen sendiri butuh gestur pengguna,
  // jadi ia dipasang pada klik pertama.
  const [wantsFullscreen] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("fullscreen") === "1",
  );
  useEffect(() => {
    if (!wantsFullscreen) return;
    const enter = () => {
      void document.documentElement.requestFullscreen?.().catch(() => {});
      window.removeEventListener("click", enter);
    };
    window.addEventListener("click", enter);
    return () => window.removeEventListener("click", enter);
  }, [wantsFullscreen]);

  const settings = state.settings;
  const background = settings.background_color ?? "#0B1020";
  const text = settings.text_color ?? "#FFFFFF";
  const accent = settings.accent_color ?? "#F5C451";
  const branding = state.branding ?? DEFAULT_BRANDING;
  const headingFont = fontStack(branding.heading_font);

  const endsAt = useMemo(() => (state.reveal_at ? new Date(state.reveal_at).getTime() : null), [state.reveal_at]);
  const spinning = state.phase === "spinning";
  const revealed = state.phase === "revealed" && state.winners.length > 0;

  const animationProps = {
    roster: state.roster,
    // Pemenang yang dibatalkan operator dijatuhkan dari layar: nama itu sudah
    // bukan pemenang, dan membiarkannya tampil membuat dua orang terlihat
    // memenangkan hadiah yang sama.
    winners: revealed ? state.winners.filter((winner) => winner.status !== "rejected").map((winner) => ({
      name: winner.name, company: winner.company, seat: winner.seat,
      is_backup: winner.is_backup, slot_order: winner.slot_order,
    })) : [],
    endsAt,
    accent,
    text,
    fontFamily: headingFont,
    round: state.draw_round,
    // Jumlah nama yang akan keluar, diketahui dari konfigurasi hadiah sebelum
    // pemenangnya diketahui. Varian kartu memakainya untuk menggambar jumlah
    // kartu yang tepat sejak awal, sehingga grid tidak melompat saat pemenang
    // muncul. Tidak membocorkan apa pun tentang siapa yang menang.
    pendingCount: state.prize?.winners_per_draw,
  };

  return <main
    className="flex h-dvh flex-col overflow-hidden"
    style={{
      background: settings.background_image_url ? `url(${settings.background_image_url}) center/cover no-repeat, ${background}` : background,
      color: text,
    }}
  >
    <ConfettiBurst trigger={confettiTrigger} accent={accent} text={text} />

    {/* Header: shrink-0 supaya tidak ikut menyusut ketika isi tengah membesar. */}
    <header className="shrink-0 px-[4vw] pt-[3vh] text-center">
      <BrandLogo branding={branding} variant="led" />
      <h1
        className="text-balance font-bold uppercase"
        style={{
          fontFamily: headingFont,
          fontSize: scaleClamp("clamp(18px, 3.2vmin, 52px)", branding.title_scale),
          letterSpacing: "0.08em",
          color: branding.title_color ?? text,
        }}
      >
        {settings.page_title}
      </h1>
      {settings.page_subtitle && <p
        style={{
          fontFamily: headingFont,
          fontSize: scaleClamp("clamp(11px, 1.8vmin, 26px)", branding.subtitle_scale),
          color: branding.subtitle_color ?? text,
          opacity: branding.subtitle_color ? 1 : 0.7,
          marginTop: "0.6vh",
        }}
      >
        {settings.page_subtitle}
      </p>}
    </header>

    {/* min-h-0 WAJIB. Tanpa itu anak flex menolak menyusut di bawah tinggi
        isinya, wadahnya melampaui viewport, dan halaman ikut menggulir sehingga
        header terangkat keluar layar. */}
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[2vh] px-[4vw]">
      {state.mode === "off" || !state.prize ? <div className="text-center">
        <p style={{ fontFamily: headingFont, fontSize: "clamp(16px, 3vw, 44px)", opacity: 0.35 }}>
          Menunggu sesi undian
        </p>
      </div> : <>
        {/* Kartu hadiah */}
        <div className="flex shrink-0 flex-col items-center gap-[1vh] text-center">
          {state.prize.image_url && (
            // `img` biasa, bukan next/image: URL-nya dari Supabase Storage dan
            // bisa berubah kapan saja lewat CMS, sedangkan next/image butuh host
            // yang didaftarkan lebih dulu di konfigurasi.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={state.prize.image_url}
              alt=""
              aria-hidden="true"
              style={{ height: "min(14vh, 160px)", width: "auto", objectFit: "contain" }}
            />
          )}
          <p
            className="font-bold uppercase tracking-[-0.02em]"
            style={{ fontFamily: headingFont, fontSize: "clamp(20px, 4vw, 68px)", color: accent }}
          >
            {state.prize.name}
          </p>
          {state.prize.sponsor_name && <p style={{ fontFamily: headingFont, fontSize: "clamp(10px, 1.4vw, 20px)", opacity: 0.6, letterSpacing: "0.18em" }}>
            {state.prize.sponsor_name.toUpperCase()}
          </p>}
          {state.prize.description && !revealed && <p style={{ fontFamily: headingFont, fontSize: "clamp(11px, 1.6vw, 24px)", opacity: 0.7 }}>
            {state.prize.description}
          </p>}
        </div>

        {/* Panggung animasi.

            `min-h-0` + `overflow-hidden` WAJIB. Tanpa keduanya, isi yang lebih
            tinggi dari ruang tersisa — sepuluh kartu pemenang, misalnya —
            memperbesar wadahnya sendiri, mendorong header keluar layar, dan
            membuat halaman ikut menggulir. Di proyektor tidak ada yang bisa
            menggulirkannya kembali. */}
        <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
          {state.phase === "idle" ? <div className="text-center">
            <p style={{ fontFamily: headingFont, fontSize: "clamp(14px, 2.4vw, 34px)", opacity: 0.4 }}>
              {state.pool_size > 0 ? `${state.pool_size} peserta siap diundi` : "Bersiap"}
            </p>
          </div> : state.prize.animation === "wheel" ? <WheelAnimation {...animationProps} />
            : state.prize.animation === "slot" ? <SlotAnimation {...animationProps} />
            : state.prize.animation === "cards" ? <CardsAnimation {...animationProps} />
            : state.prize.animation === "digits" ? <DigitsAnimation {...animationProps} />
            : spinning
              ? <p style={{ fontFamily: headingFont, fontSize: "clamp(16px, 3vw, 44px)", opacity: 0.5 }}>Mengundi...</p>
              : <WinnerList winners={animationProps.winners} accent={accent} text={text} fontFamily={headingFont} />}
        </div>

        {/* Rekap pemenang yang sudah sah, dibatasi supaya tidak mendorong
            panggung utama keluar layar. */}
        {state.confirmed.length > 0 && <div className="w-full shrink-0 border-t pt-[1.2vh] text-center" style={{ borderColor: `${text}22` }}>
          <p style={{ fontFamily: headingFont, fontSize: "clamp(8px, 1vw, 13px)", letterSpacing: "0.2em", opacity: 0.45 }}>
            PEMENANG SEBELUMNYA
          </p>
          <p className="mt-[0.4vh] line-clamp-2" style={{ fontFamily: headingFont, fontSize: "clamp(10px, 1.3vw, 18px)", opacity: 0.7 }}>
            {state.confirmed.map((winner) => winner.name).join(" · ")}
          </p>
        </div>}
      </>}
    </div>

    <footer className="shrink-0 px-[4vw] pb-[2.5vh] pt-[1vh]">
      <BrandFooter branding={branding} textColor={text} variant="led" />
    </footer>
  </main>;
}

/**
 * Fanfare pendek lewat Web Audio API.
 *
 * Tanpa berkas audio. Berkas audio harus di-hosting, diunduh, dan bisa gagal
 * dimuat justru pada malam acara di jaringan venue yang buruk — dan yang tersisa
 * adalah kesunyian pada saat yang seharusnya paling ramai. Tiga nada arpeggio
 * dari osilator selalu berhasil dan tidak memuat apa pun.
 *
 * Browser memblokir audio sebelum ada interaksi pengguna. Kegagalan itu ditelan
 * diam-diam: undian tetap berjalan tanpa suara, dan itu jauh lebih baik daripada
 * pesan galat yang muncul di layar proyektor.
 */
function playFanfare() {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const now = context.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      const start = now + index * 0.12;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.6);
    });
    window.setTimeout(() => void context.close(), 1500);
  } catch {
    // Diam. Undian tetap jalan tanpa suara.
  }
}
