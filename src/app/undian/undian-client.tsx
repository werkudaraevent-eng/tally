"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandFooter, BrandLogo } from "@/components/brand-header-footer";
import { LoadingIndicator } from "@/components/m3";
import { DEFAULT_BRANDING, fontStack, normalizeBranding, scaleClamp, type Branding } from "@/lib/branding";
import { expressive } from "@/lib/m3/motion";
import { MUSIC_OFF, type UndianState } from "@/lib/undian";
import { CardsAnimation, ConfettiBurst, DigitsAnimation, SlotAnimation, WheelAnimation, WinnerList, revealFxDelayMs, revealSettleMs } from "./undian-animations";
import { AmbientStage, GREEN_SCREEN_COLOR, GreenScreenContext, RevealBurst, ShineText, useStageDim } from "./undian-stage-fx";
import { WallAnimation } from "./undian-wall";
import { TunnelAnimation } from "./undian-tunnel";
import { DrumAnimation, preloadDrum } from "./undian-drum";
import { DartAnimation3D, preloadDart } from "./undian-dart";
import { ArenaAnimation, preloadArena } from "./undian-arena";
import { MusicClickHint, useStageMusic } from "./undian-musik";

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

type Props = { initial: UndianState & { branding: Branding }; greenScreen?: boolean };

export default function UndianClient({ initial, greenScreen = false }: Props) {
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
  // Spotlight wall, Terowongan nama, dan Tabung bola butuh beberapa detik
  // sebelum nama pertama tampil; confetti, ledakan, dan fanfare menunggu nama
  // itu, bukan mendahuluinya.
  const fxDelay = revealFxDelayMs(state.prize?.animation ?? "");
  const delayedReveal = fxDelay > 0;
  const confettiOn = state.settings.confetti_enabled;
  // Dibaca lewat ref supaya mengubah Confetti tidak memutar ulang fanfare
  // atau mengulang timer kartu dinding.
  const confettiRef = useRef(confettiOn);
  useEffect(() => {
    confettiRef.current = confettiOn;
  }, [confettiOn]);
  // Nama pemenang sudah tampil (setelah animasi dan jeda): saat chime berbunyi
  // dan lagu "saat mengundi" berganti ke lagu pemenang. Untuk animasi tanpa
  // jeda, tampil seketika bersama revealKey.
  const [shownKey, setShownKey] = useState("");
  const namesShown = revealKey !== "" && (!delayedReveal || shownKey === revealKey);
  // Green screen untuk vMix: tanpa musik. Biasanya dibuka bersama layar
  // panggung biasa, dan dua pemutar membuat lagunya berbunyi dua kali.
  const music = greenScreen ? MUSIC_OFF : state.settings.music;
  const { needsClick } = useStageMusic(music, state.phase, namesShown);
  // Lagu pemenang menggantikan chime: dua bunyi bersamaan terdengar seperti galat.
  const chimeOn = state.settings.sound_enabled && !(music.enabled && music.winner);
  const [seenReveal, setSeenReveal] = useState("");
  if (revealKey !== "" && seenReveal !== revealKey) {
    setSeenReveal(revealKey);
    if (!delayedReveal) {
      if (confettiOn) setConfettiTrigger((value) => value + 1);
      setBurst((value) => value + 1);
    }
  }

  useEffect(() => {
    if (revealKey === "") return;
    if (!delayedReveal) {
      if (chimeOn) playFanfare();
      return;
    }
    const timer = window.setTimeout(() => {
      if (confettiRef.current) setConfettiTrigger((value) => value + 1);
      setBurst((value) => value + 1);
      setShownKey(revealKey);
      if (chimeOn) playFanfare();
    }, fxDelay);
    return () => window.clearTimeout(timer);
  }, [revealKey, chimeOn, delayedReveal, fxDelay]);

  // Tabung bola memakai three.js (~150 KB gz). Dimuat begitu hadiah dengan
  // tabung dipilih, saat layar masih menunggu, supaya tidak ada jeda unduhan
  // ketika operator menekan Undi di jaringan venue.
  const drumNext = state.prize?.animation === "drum";
  useEffect(() => {
    if (drumNext) preloadDrum();
  }, [drumNext]);
  const dartNext = state.prize?.animation === "dart";
  useEffect(() => {
    if (dartNext) preloadDart();
  }, [dartNext]);
  const arenaNext = state.prize?.animation === "arena";
  useEffect(() => {
    if (arenaNext) preloadArena();
  }, [arenaNext]);

  // Fullscreen dibaca di inisialisasi state, bukan di effect, supaya render
  // pertama sudah benar. Permintaan fullscreen sendiri butuh gestur pengguna,
  // jadi ia dipasang pada klik pertama.
  const [wantsFullscreen] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("fullscreen") === "1",
  );
  useEffect(() => {
    if (!wantsFullscreen) return;
    const enter = () => {
      // Di layar besar panggung ada di dalam iframe (StageScaler): yang dibuat
      // layar penuh adalah halaman induknya, bukan iframe, supaya skalanya
      // tetap. Aktivasi pengguna di iframe ikut berlaku untuk induknya.
      const root = window.parent !== window ? window.parent.document : document;
      void root.documentElement.requestFullscreen?.().catch(() => {});
      window.removeEventListener("click", enter);
    };
    window.addEventListener("click", enter);
    return () => window.removeEventListener("click", enter);
  }, [wantsFullscreen]);

  const settings = state.settings;
  const background = greenScreen ? GREEN_SCREEN_COLOR : settings.background_color ?? "#0B1020";
  const dim = (opacity: number) => (greenScreen ? 1 : opacity);
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

  // "Pemenang sebelumnya" berarti undian SEBELUMNYA. Nama rombongan yang sedang
  // tampil di tengah layar tidak ikut di sini: dulu setiap Mark present
  // menambah satu nama ke pita ini, pita tumbuh dan beranimasi ulang 20 kali,
  // dan panggung utama terdorong naik selama operator mengesahkan. Rombongan
  // ini baru masuk pita setelah layar beralih ke undian berikutnya.
  const tampilSekarang = new Set(revealed ? state.winners.map((winner) => winner.id).filter((id) => id !== undefined) : []);
  const pemenangSebelumnya = state.confirmed.filter((winner) => winner.id === undefined || !tampilSekarang.has(winner.id));

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
    poolSize: state.pool_size,
    wallTiles: state.prize?.wall_tiles,
    speed: state.prize?.anim_speed,
  };

  return <main
    // `relative isolate`: lapisan suasana (`-z-10`) harus jatuh di bawah isi
    // tetapi di atas latar main, dan itu hanya terjamin di konteks tumpukan
    // milik main sendiri.
    className={`relative isolate flex h-dvh flex-col overflow-hidden${greenScreen ? " undian-gs" : ""}`}
    style={{
      background: settings.background_image_url && !greenScreen ? `url(${settings.background_image_url}) center/cover no-repeat, ${background}` : background,
      color: text,
    }}
  >
    <GreenScreenContext.Provider value={greenScreen}>
    {!greenScreen && <AmbientStage accent={accent} text={text} />}
    <ConfettiBurst trigger={confettiTrigger} accent={accent} text={text} />
    {!greenScreen && <RevealBurst trigger={burst} accent={accent} />}

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
          opacity: branding.subtitle_color ? 1 : dim(0.7),
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
      {state.mode === "live" && !state.prize && state.lineup.length > 0 ? (
        <LineupBoard lineup={state.lineup} currentId={null} accent={accent} text={text} fontFamily={headingFont} />
      ) : state.mode === "off" || !state.prize ? <div className="flex flex-col items-center gap-[2.4vh] text-center">
        <LoadingIndicator size="min(9vh, 96px)" color={accent} label="Menunggu sesi undian" />
        <p aria-hidden style={{ fontFamily: headingFont, fontSize: "clamp(16px, 3vw, 44px)", opacity: dim(0.35) }}>
          Menunggu sesi undian
        </p>
      </div> : <>
        {/* Kartu hadiah. Berganti hadiah = kartu lama menyusut-pudar, kartu
            baru mengembang masuk; gambar hadiahnya melayang pelan, dan namanya
            disapu kilau emas. Inilah "poster" yang dilihat ruangan sepanjang
            jeda antara dua undian. */}
        <AnimatePresence mode="wait" initial={false}>
          {/* Saat mengundi, gambar dan nama hadiah menjadi satu baris: tumpukan
              judul, gambar, dan nama memakan seperlima layar yang dibutuhkan
              kartu pemenang, dan jaraknya tampak tidak rata. */}
          <motion.div key={state.prize.id} className={running ? "flex max-w-full shrink-0 flex-row items-center justify-center gap-[1.4vw] pt-[1vh] text-left" : "flex shrink-0 flex-col items-center gap-[1vh] pt-[4vh] text-center"} {...TUKAR_PANGGUNG}>
            {state.prize.image_url && (
              // `img` biasa, bukan next/image: URL-nya dari Supabase Storage dan
              // bisa berubah kapan saja lewat CMS, sedangkan next/image butuh host
              // yang didaftarkan lebih dulu di konfigurasi.
              <motion.img
                src={state.prize.image_url}
                alt=""
                aria-hidden="true"
                className="transition-[height] duration-500 ease-emphasized"
                // Saat diam, gambar diberi ruang di bawahnya: ia melayang naik-turun
                // 1,2vh, dan tanpa jarak ini ujungnya menempel ke nama hadiah.
                // Dengan lineup di bawahnya, gambar lebih kecil: gambar besar +
                // nama tiga baris + lineup tidak muat di 1280x720.
                style={{ height: running ? "min(7vh, 80px)" : state.lineup.length > 0 ? "min(14vh, 160px)" : "min(22vh, 240px)", marginBottom: running ? 0 : "2.4vh", width: "auto", objectFit: "contain", filter: "drop-shadow(0 1.2vh 2.4vh rgba(0, 0, 0, 0.35))" }}
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
            {state.prize.sponsor_name && !running && <p style={{ fontFamily: headingFont, fontSize: "clamp(10px, 1.4vw, 20px)", opacity: dim(0.6), letterSpacing: "0.18em" }}>
              {state.prize.sponsor_name.toUpperCase()}
            </p>}
            {state.prize.description && !running && <p style={{ fontFamily: headingFont, fontSize: "clamp(11px, 1.6vw, 24px)", opacity: dim(0.7) }}>
              {state.prize.description}
            </p>}
          </motion.div>
        </AnimatePresence>

        {/* Tulisan setelah menang (Prizes & rules > prize > After the winner is
            revealed): "maju ke panggung" untuk hadiah besar, "ambil di meja
            panitia" untuk hadiah kecil.

            Letaknya di ANTARA nama hadiah dan nama pemenang, bukan di bawah
            panggung: di bawah, ia jatuh tepat di bawah baris "Cadangan" dan
            terbaca seperti ditujukan ke cadangan.

            Tempatnya sudah dipesan sejak undian berjalan (opacity 0), jadi
            kemunculannya tidak menggeser kartu yang sedang membalik. Ia baru
            terlihat sesudah nama terakhir diungkap animasi. */}
        {running && state.prize.message ? (
          <motion.p
            key={`pesan-${state.prize.id}-${state.draw_round}`}
            aria-hidden={!revealed}
            className="max-w-[80vw] shrink-0 rounded-full px-[2.4vw] py-[0.8vh] text-center font-semibold"
            style={{ fontFamily: headingFont, fontSize: "clamp(14px, 2.2vw, 36px)", lineHeight: 1.2, color: text, border: `2px solid ${accent}`, background: greenScreen ? `color-mix(in srgb, ${accent} 13%, ${settings.background_color ?? "#0B1020"})` : `${accent}22` }}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={revealed
              ? { opacity: 1, scale: 1, transition: { ...expressive.spatial.default, delay: revealSettleMs(state.prize.animation, animationProps.winners) / 1000 + 0.4 } }
              : { opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
          >
            {state.prize.message}
          </motion.p>
        ) : null}

        {/* Panggung animasi.

            `min-h-0` + `overflow-hidden` WAJIB. Tanpa keduanya, isi yang lebih
            tinggi dari ruang tersisa — sepuluh kartu pemenang, misalnya —
            memperbesar wadahnya sendiri, mendorong header keluar layar, dan
            membuat halaman ikut menggulir. Di proyektor tidak ada yang bisa
            menggulirkannya kembali. */}
        <div className={`flex min-h-0 w-full items-center justify-center overflow-hidden ${running ? "flex-1" : "flex-none pb-[2vh] pt-[4vh]"}`}>
          {/* `key` HANYA berganti antara diam dan berjalan, bukan per fase.
              Komponen animasi harus tetap terpasang dari `spinning` sampai
              `revealed`: roda yang melambat dan kartu yang membalik bekerja
              dari perubahan prop `winners`, dan memasangnya ulang di tengah
              jalan memotong gerakan tepat pada detik yang ditunggu. */}
          <AnimatePresence mode="wait" initial={false}>
            {state.phase === "idle" ? (
              <motion.div key="diam" className="flex flex-col items-center gap-[2vh] text-center" {...TUKAR_PANGGUNG}>
                {state.lineup.length > 0
                  ? <LineupBoard lineup={state.lineup} currentId={state.prize.id} accent={accent} text={text} fontFamily={headingFont} compact />
                  : <LoadingIndicator size="min(7vh, 72px)" color={accent} label="Bersiap mengundi" />}
                <p aria-hidden style={{ fontFamily: headingFont, fontSize: "clamp(14px, 2.4vw, 34px)", opacity: dim(0.4) }}>
                  {state.pool_size > 0 ? `${state.pool_size} peserta siap diundi` : "Bersiap"}
                </p>
              </motion.div>
            ) : (
              <motion.div key={`jalan-${state.prize.id}`} className="flex h-full min-h-0 w-full items-center justify-center" {...TUKAR_PANGGUNG}>
                {state.prize.animation === "wheel" ? <WheelAnimation {...animationProps} />
                  : state.prize.animation === "slot" ? <SlotAnimation {...animationProps} />
                  : state.prize.animation === "cards" ? <CardsAnimation {...animationProps} />
                  : state.prize.animation === "digits" ? <DigitsAnimation {...animationProps} />
                  : state.prize.animation === "dart" ? <DartAnimation3D {...animationProps} />
                  : state.prize.animation === "wall" ? <WallAnimation {...animationProps} />
                  : state.prize.animation === "tunnel" ? <TunnelAnimation {...animationProps} />
                  : state.prize.animation === "drum" ? <DrumAnimation {...animationProps} />
                  : state.prize.animation === "arena" ? <ArenaAnimation {...animationProps} />
                  : spinning
                    ? <p style={{ fontFamily: headingFont, fontSize: "clamp(16px, 3vw, 44px)", opacity: dim(0.5) }}>Mengundi...</p>
                    : <WinnerList winners={animationProps.winners} accent={accent} text={text} fontFamily={headingFont} />}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Rekap pemenang yang sudah sah, dibatasi supaya tidak mendorong
            panggung utama keluar layar. */}
        {pemenangSebelumnya.length > 0 && <motion.div
          key={pemenangSebelumnya.length}
          className="w-full shrink-0 border-t pt-[1.2vh] text-center"
          style={{ borderColor: `${text}22` }}
          initial={{ opacity: 0, y: "1.5vh" }}
          animate={{ opacity: 1, y: 0 }}
          transition={expressive.spatial.default}
        >
          <p style={{ fontFamily: headingFont, fontSize: "clamp(8px, 1vw, 13px)", letterSpacing: "0.2em", opacity: dim(0.45) }}>
            PEMENANG SEBELUMNYA
          </p>
          <p className="mt-[0.4vh] line-clamp-2" style={{ fontFamily: headingFont, fontSize: "clamp(10px, 1.3vw, 18px)", opacity: dim(0.7) }}>
            {pemenangSebelumnya.map((winner) => winner.name).join(" · ")}
          </p>
        </motion.div>}
      </>}
    </div>

    <footer className="shrink-0 px-[4vw] pb-[2.5vh] pt-[1vh]">
      <BrandFooter branding={branding} textColor={text} variant="led" />
    </footer>
    {needsClick ? <MusicClickHint /> : null}
    </GreenScreenContext.Provider>
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

/**
 * Daftar hadiah di layar tunggu (Stage display > Show the prize lineup).
 *
 * Seperti susunan acara: ruangan melihat apa saja yang akan diundi, mana yang
 * sudah, dan mana yang sedang. Tanpa hadiah terpilih ia mengisi layar; dengan
 * hadiah terpilih ia menjadi deretan ringkas di bawah kartu hadiah.
 *
 * Mati secara bawaan: sebagian klien ingin hadiahnya tetap kejutan.
 */
function LineupBoard({ lineup, currentId, accent, text, fontFamily, compact = false }: {
  lineup: UndianState["lineup"];
  currentId: number | null;
  accent: string;
  text: string;
  fontFamily: string;
  compact?: boolean;
}) {
  const dim = useStageDim();
  return (
    <div className="flex w-full max-w-[88vw] flex-col items-center gap-[1.6vh] text-center">
      <p style={{ fontFamily, fontSize: compact ? "clamp(9px, 1.1vw, 15px)" : "clamp(11px, 1.5vw, 22px)", letterSpacing: "0.22em", opacity: dim(0.55) }}>
        DAFTAR HADIAH
      </p>
      <ol className={`flex flex-wrap justify-center ${compact ? "gap-[0.8vw]" : "gap-[1.2vw]"}`}>
        {lineup.map((item, index) => {
          const current = item.id === currentId;
          return (
            <motion.li
              key={item.id}
              className="flex items-center gap-[0.8vw] rounded-full"
              style={{
                padding: compact ? "0.7vh 1.3vw" : "1.2vh 1.8vw",
                border: `2px solid ${current ? accent : `${text}33`}`,
                background: current ? `${accent}26` : "transparent",
                opacity: item.done && !current ? dim(0.45) : 1,
              }}
              initial={{ opacity: 0, y: "1vh" }}
              animate={{ opacity: item.done && !current ? dim(0.45) : 1, y: 0 }}
              transition={{ ...expressive.spatial.default, delay: Math.min(index * 0.06, 0.6) }}
            >
              {!compact && item.image_url ? (
                // `img` biasa: URL Storage dari CMS, sama dengan kartu hadiah.
                <motion.img src={item.image_url} alt="" aria-hidden="true" style={{ height: "min(5vh, 56px)", width: "auto", objectFit: "contain" }} />
              ) : null}
              <span
                className="font-semibold"
                style={{ fontFamily, fontSize: compact ? "clamp(11px, 1.4vw, 20px)" : "clamp(13px, 2vw, 30px)", color: current ? accent : text, textDecoration: item.done && !current ? "line-through" : "none" }}
              >
                {item.done && !current ? "✓ " : ""}{item.name}
              </span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
