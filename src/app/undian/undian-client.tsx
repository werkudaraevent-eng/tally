"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BrandFooter, BrandLogo } from "@/components/brand-header-footer";
import { LoadingIndicator } from "@/components/m3";
import { DEFAULT_BRANDING, fontStack, normalizeBranding, scaleClamp, type Branding } from "@/lib/branding";
import { expressive } from "@/lib/m3/motion";
import type { UndianState } from "@/lib/undian";
import { CardsAnimation, ConfettiBurst, DartAnimation, DigitsAnimation, SlotAnimation, WheelAnimation, WinnerList } from "./undian-animations";
import { AmbientStage, RevealBurst, ShineText } from "./undian-stage-fx";

/**
 * Pergantian blok di panggung: yang lama menyusut-pudar, yang baru mengembang
 * masuk. `mode="wait"` supaya dua blok tidak pernah berdiri bertumpuk di
 * ruang yang tingginya tetap.
 */
const TUKAR_PANGGUNG = {
  initial: { opacity: 0, scale: 0.94, y: "2vh" },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 1.03, transition: { duration: 0.22 } },
  transition: { ...expressive.spatial.default, opacity: expressive.effects.default },
} as const;

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
  // Kilatan dan cincin saat pemenang tampil. Terpisah dari confetti karena
  // confetti bisa dimatikan dari CMS, sementara ledakan cahaya adalah bagian
  // dari momen pengumuman itu sendiri.
  const [burst, setBurst] = useState(0);

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
    setBurst((value) => value + 1);
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
  // Selama undian berjalan, kartu hadiah MENYUSUT: gambarnya dari 14vh ke 8vh,
  // namanya turun satu tingkat, deskripsinya disembunyikan. Ruang yang
  // dilepasnya diambil roda dan kartu pemenang — di panggung, yang harus paling
  // besar adalah yang sedang bergerak, bukan poster hadiah yang sudah dibaca
  // semua orang selama jeda.
  const running = state.phase !== "idle";

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
    // `relative isolate`: lapisan suasana (`-z-10`) harus jatuh di bawah isi
    // tetapi di atas latar main, dan itu hanya terjamin di konteks tumpukan
    // milik main sendiri.
    className="relative isolate flex h-dvh flex-col overflow-hidden"
    style={{
      background: settings.background_image_url ? `url(${settings.background_image_url}) center/cover no-repeat, ${background}` : background,
      color: text,
    }}
  >
    <AmbientStage accent={accent} text={text} />
    <ConfettiBurst trigger={confettiTrigger} accent={accent} text={text} />
    <RevealBurst trigger={burst} accent={accent} />

    {/* Penanda LATIHAN.
        Gladi bersih hampir selalu dijalankan dengan layar panggung sungguhan
        menyala, di ruangan yang sudah ada kru, vendor, dan kadang tamu awal.
        Tanpa penanda ini nama yang muncul tidak dapat dibedakan dari pemenang
        sungguhan oleh siapa pun yang kebetulan melihat, dan kabar "si anu menang"
        sudah beredar sebelum undian yang sebenarnya dimulai.

        Ditempatkan sebagai pita di paling atas, bukan teks kecil di sudut:
        penanda yang harus dicari tidak menjalankan tugasnya. Warnanya tidak
        mengikuti branding dengan sengaja — justru harus terlihat asing terhadap
        tampilan acara. */}
    <AnimatePresence initial={false}>
      {state.rehearsal && <motion.div
        key="latihan"
        className="shrink-0 overflow-hidden text-center font-bold uppercase"
        style={{
          background: "#b45309",
          color: "#ffffff",
          letterSpacing: "0.22em",
          fontSize: "clamp(10px, 1.6vmin, 22px)",
        }}
        initial={{ height: 0 }}
        animate={{ height: "auto" }}
        exit={{ height: 0 }}
        transition={expressive.spatial.default}
      >
        <div style={{ padding: "0.6vh 0" }}>Mode latihan — hasil tidak dicatat</div>
      </motion.div>}
    </AnimatePresence>

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
      {/* Menunggu adalah bagian dari acara di layar panggung, jadi ia boleh
          terasa hidup: indikator morph ekspresif M3, bukan teks diam yang
          terbaca seperti layar yang gagal memuat. */}
      {state.mode === "off" || !state.prize ? <div className="flex flex-col items-center gap-[2.4vh] text-center">
        <LoadingIndicator size="min(9vh, 96px)" color={accent} label="Menunggu sesi undian" />
        <p aria-hidden style={{ fontFamily: headingFont, fontSize: "clamp(16px, 3vw, 44px)", opacity: 0.35 }}>
          Menunggu sesi undian
        </p>
      </div> : <>
        {/* Kartu hadiah. Berganti hadiah = kartu lama menyusut-pudar, kartu
            baru mengembang masuk; gambar hadiahnya melayang pelan, dan namanya
            disapu kilau emas. Inilah "poster" yang dilihat ruangan sepanjang
            jeda antara dua undian. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={state.prize.id} className="flex shrink-0 flex-col items-center gap-[1vh] text-center" {...TUKAR_PANGGUNG}>
            {state.prize.image_url && (
              // `img` biasa, bukan next/image: URL-nya dari Supabase Storage dan
              // bisa berubah kapan saja lewat CMS, sedangkan next/image butuh host
              // yang didaftarkan lebih dulu di konfigurasi.
              <motion.img
                src={state.prize.image_url}
                alt=""
                aria-hidden="true"
                className="transition-[height] duration-500 ease-emphasized"
                style={{ height: running ? "min(8vh, 96px)" : "min(14vh, 160px)", width: "auto", objectFit: "contain", filter: "drop-shadow(0 1.2vh 2.4vh rgba(0, 0, 0, 0.35))" }}
                animate={{ y: ["0vh", "-1.2vh", "0vh"], rotate: [-1, 1, -1] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
            <p
              className="font-bold uppercase tracking-[-0.02em] transition-[font-size] duration-500 ease-emphasized"
              style={{ fontFamily: headingFont, fontSize: running ? "clamp(16px, 2.6vw, 44px)" : "clamp(20px, 4vw, 68px)", lineHeight: 1.1 }}
            >
              <ShineText color={accent}>{state.prize.name}</ShineText>
            </p>
            {state.prize.sponsor_name && !running && <p style={{ fontFamily: headingFont, fontSize: "clamp(10px, 1.4vw, 20px)", opacity: 0.6, letterSpacing: "0.18em" }}>
              {state.prize.sponsor_name.toUpperCase()}
            </p>}
            {state.prize.description && !running && <p style={{ fontFamily: headingFont, fontSize: "clamp(11px, 1.6vw, 24px)", opacity: 0.7 }}>
              {state.prize.description}
            </p>}
          </motion.div>
        </AnimatePresence>

        {/* Panggung animasi.

            `min-h-0` + `overflow-hidden` WAJIB. Tanpa keduanya, isi yang lebih
            tinggi dari ruang tersisa — sepuluh kartu pemenang, misalnya —
            memperbesar wadahnya sendiri, mendorong header keluar layar, dan
            membuat halaman ikut menggulir. Di proyektor tidak ada yang bisa
            menggulirkannya kembali. */}
        <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
          {/* `key` HANYA berganti antara diam dan berjalan, bukan per fase.
              Komponen animasi harus tetap terpasang dari `spinning` sampai
              `revealed`: roda yang melambat dan kartu yang membalik bekerja
              dari perubahan prop `winners`, dan memasangnya ulang di tengah
              jalan memotong gerakan tepat pada detik yang ditunggu. */}
          <AnimatePresence mode="wait" initial={false}>
            {state.phase === "idle" ? (
              <motion.div key="diam" className="flex flex-col items-center gap-[2vh] text-center" {...TUKAR_PANGGUNG}>
                <LoadingIndicator size="min(7vh, 72px)" color={accent} label="Bersiap mengundi" />
                <p aria-hidden style={{ fontFamily: headingFont, fontSize: "clamp(14px, 2.4vw, 34px)", opacity: 0.4 }}>
                  {state.pool_size > 0 ? `${state.pool_size} peserta siap diundi` : "Bersiap"}
                </p>
              </motion.div>
            ) : (
              <motion.div key={`jalan-${state.prize.id}`} className="flex h-full min-h-0 w-full items-center justify-center" {...TUKAR_PANGGUNG}>
                {state.prize.animation === "wheel" ? <WheelAnimation {...animationProps} />
                  : state.prize.animation === "slot" ? <SlotAnimation {...animationProps} />
                  : state.prize.animation === "cards" ? <CardsAnimation {...animationProps} />
                  : state.prize.animation === "digits" ? <DigitsAnimation {...animationProps} />
                  : state.prize.animation === "dart" ? <DartAnimation {...animationProps} />
                  : spinning
                    ? <p style={{ fontFamily: headingFont, fontSize: "clamp(16px, 3vw, 44px)", opacity: 0.5 }}>Mengundi...</p>
                    : <WinnerList winners={animationProps.winners} accent={accent} text={text} fontFamily={headingFont} />}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Rekap pemenang yang sudah sah, dibatasi supaya tidak mendorong
            panggung utama keluar layar. */}
        {state.confirmed.length > 0 && <motion.div
          key={state.confirmed.length}
          className="w-full shrink-0 border-t pt-[1.2vh] text-center"
          style={{ borderColor: `${text}22` }}
          initial={{ opacity: 0, y: "1.5vh" }}
          animate={{ opacity: 1, y: 0 }}
          transition={expressive.spatial.default}
        >
          <p style={{ fontFamily: headingFont, fontSize: "clamp(8px, 1vw, 13px)", letterSpacing: "0.2em", opacity: 0.45 }}>
            PEMENANG SEBELUMNYA
          </p>
          <p className="mt-[0.4vh] line-clamp-2" style={{ fontFamily: headingFont, fontSize: "clamp(10px, 1.3vw, 18px)", opacity: 0.7 }}>
            {state.confirmed.map((winner) => winner.name).join(" · ")}
          </p>
        </motion.div>}
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
