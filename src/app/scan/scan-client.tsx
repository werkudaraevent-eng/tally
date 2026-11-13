"use client";

import { ArrowsClockwise, BookOpenText, CameraRotate, CaretDown, Check, CircleNotch, ClockCounterClockwise, DotsThreeVertical, Flashlight, MagnifyingGlass, Printer, QrCode, Scan, SpeakerHigh, SignOut, SpeakerSlash, Television, UserCheck, UserPlus, VideoCameraSlash, WarningCircle } from "@phosphor-icons/react";
import { Button, Card, Dialog, Divider, EmptyState, IconButton, SegmentedButton, Switch, Tabs, TextField } from "@/components/m3";
import { bukaSuara } from "./umpan-balik";
import { TampilQrCheckpoint } from "./tampil-qr";
import { DaftarHadir } from "./daftar-hadir";
import { SearchResultsSkeleton } from "@/components/search-loading";
import { LembarScan, PilihMeja } from "./lembar-meja";
import { DialogGantiStasiun, PanelCetakMeja } from "./cetak-meja";
import { ResultSheet } from "./result-sheet";
import { WalkinDialog } from "./walkin-dialog";
import { BATAS_RIWAYAT, ChipOffline, Mode, UJI_LABEL, inisial, jam } from "./pindai/pindai-bantu";
import { useScanClient0 } from "./pindai/pindai-0";
import { useScanClient1 } from "./pindai/pindai-1";
import { useScanClient2 } from "./pindai/pindai-2";
import { useScanClient3 } from "./pindai/pindai-3";
import { useScanClient4 } from "./pindai/pindai-4";
import { useScanClient5 } from "./pindai/pindai-5";
import { useScanClient6 } from "./pindai/pindai-6";


export default function ScanClient() {
  const h0 = useScanClient0();
  const h1 = useScanClient1({ ...h0 });
  const h2 = useScanClient2({ ...h0, ...h1 });
  const h3 = useScanClient3({ ...h0, ...h1, ...h2 });
  const h4 = useScanClient4({ ...h0, ...h1, ...h3 });
  const h5 = useScanClient5({ ...h0, ...h4, ...h3, ...h2 });
  const h6 = useScanClient6({ ...h2, ...h0, ...h1, ...h4, ...h5, ...h3 });
  const { setLembarMeja, eventName, offline, setMenuTerbuka, pesan, mode, mandiri, sessionId, tampilQr, setScanning, setPilihTampilQr, terdaftar, scanning, videoRef, kameraDepan, membaca, suara, senter, terakhirHadir, bisaGantiKamera, kueri, setKueri, fokusCari, nomorBagasi, statusDaftar, setStatusDaftar, mencatatId, sibuk, allowWalkIn, riwayat, sesiHilang, pindaiDitolak, laneId, sessions, lanes, hadirTerbaru, keluarJalan, menuTerbuka, username, suaraRef, tutupOtomatis, badgeMeja, label, meja, eventSlug, bisaBluetooth, printer, cetak, hasil, lebarKepala, modeCetak, kodeLayar, setKodeLayar, memasang, pesanLayar, kedip, alasanTahan, setHitungBatal, tertahan, bagasiRef, gantiJob, setGantiJob, dialogWalkIn, setDialogWalkIn, formWalkIn, walkinFields, walkinWajib, galatKolomWalkIn, tolakSimpanWalkIn, kandidat, setKandidat, menyimpanWalkIn, galatWalkIn } = h0;
  const { cetakLabel, gantiModeCetak, pasangLayar, muatSesi } = h1;
  const { antrean, kirimAntrean, ditolakAntrean } = h2;
  const { gantiSuara, gantiSenter, gantiKamera, gantiTutupOtomatis, tutupLembar, kirim } = h3;
  const { gantiMode, mintaTutup, onCentang, onBagasi, onKameraFoto, lewatiBarang, pesanKembali, tanyaTutup, setTanyaTutup } = h4;
  const { catatDariDaftar, bukaWalkIn, catatDariCari, lihatBelum, sambungPrinter, gantiFormWalkIn, simpanWalkIn, pakaiKandidat } = h5;
  const { gelap, imersif, penandaAtas, tergulir, judulMeja, stripHadir, pil, pilHadir, sesiAktif, mencari, cukupHuruf, kueriBersih, hadir, sasaranAktif, lainnya, belum, cariSekarang, pitaDitolak, pitaAntrean, daftarRiwayat, angka, pembagi, bilahKemajuan, navBawah, lembarMejaBuka, perluSetup, simpanMeja, keluar, barisMeja, lembarMenutup } = h6;


  return (
    <div lang="en" className={`scan-teks warna-pemindai min-h-dvh bg-surface text-on-surface lg:pb-12 ${gelap ? "gelap-ponsel gelap-ponsel-isi max-lg:bg-black" : ""} ${imersif ? "pb-[calc(5rem+env(safe-area-inset-bottom))]" : "pb-24"}`}>
      <div ref={penandaAtas} aria-hidden className="h-0" />
      {/* -------------------------------------------------------------------
          Bilah atas.

          Judulnya adalah meja ini sendiri ("Registration · Meja 1"), karena
          itulah yang perlu dipastikan petugas sekilas. Mengetuknya membuka
          pemilih sesi dan meja. Semua yang jarang disentuh, termasuk Keluar,
          ada di menu ⋮: tombol Keluar yang menonjol di pojok atas dulu adalah
          tombol paling besar di layar kerja.
          ------------------------------------------------------------------- */}
      {/* Diam = tidak terlihat (DESIGN.md, Top app bar): garis rambut hanya
          muncul saat ada yang tergulir di bawahnya. */}
      <header
        className={`sticky top-0 z-30 border-b bg-surface transition-colors ${tergulir ? "border-outline-variant" : "border-transparent"} ${
          gelap ? "gelap-ponsel max-lg:border-transparent max-lg:bg-black max-lg:text-white" : ""
        }`}
      >
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center gap-2 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setLembarMeja(true)}
            aria-haspopup="dialog"
            className="m3-state -ml-2 flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-left lg:flex-none"
          >
            <span className="min-w-0">
              <span className="block truncate text-title-large font-semibold max-lg:text-title-medium">{judulMeja}</span>
              <span className={`block truncate text-body-small text-on-surface-variant ${gelap ? "max-lg:text-white/75" : ""}`}>{eventName || "Loading…"}</span>
            </span>
            <CaretDown size={20} className={`shrink-0 text-on-surface-variant ${gelap ? "max-lg:text-white/75" : ""}`} aria-hidden />
            <span className="sr-only">Change check-in point or desk</span>
          </button>
          <span className="hidden flex-1 lg:block" />
          {antrean.length > 0 ? (
            <button
              type="button"
              onClick={() => { void kirimAntrean(); gantiMode("riwayat"); }}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-[#ffb300] px-3 text-label-large font-semibold text-black"
            >
              <span aria-hidden className="size-2 rounded-full bg-black/70" />
              {antrean.length} to send
            </button>
          ) : ditolakAntrean.length > 0 ? (
            <button
              type="button"
              onClick={() => gantiMode("riwayat")}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-[#ffb4ab] px-3 text-label-large font-semibold text-[#690005]"
            >
              <span aria-hidden className="size-2 rounded-full bg-[#690005]" />
              {ditolakAntrean.length} not accepted
            </button>
          ) : offline ? <ChipOffline /> : null}
          <IconButton label="Scanner menu" onClick={() => setMenuTerbuka(true)} className={gelap ? "max-lg:!text-white" : undefined}>
            <DotsThreeVertical size={24} weight="bold" />
          </IconButton>
        </div>
      </header>

      <main
        className={`mx-auto w-full max-w-[1280px] px-4 pt-3 sm:px-6 lg:px-8 lg:pt-6 ${
          imersif ? "max-lg:flex max-lg:h-[calc(100dvh-9rem-env(safe-area-inset-bottom))] max-lg:flex-col max-lg:px-0 max-lg:pt-0" : ""
        }`}
      >
        {pesan ? (
          <p role="alert" className={`mb-3 flex items-start gap-2 rounded-lg bg-error-soft p-3 text-body-medium text-on-error-soft ${imersif ? "max-lg:mx-4 max-lg:mt-2" : ""}`}>
            <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0" />
            {pesan}
          </p>
        ) : null}

        {/* `minmax(0,1fr)` juga di ponsel, bukan kolom `auto`: nama tamu yang
            panjang tidak boleh melebarkan seluruh halaman. */}
        <div className={`grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_360px] ${imersif ? "max-lg:min-h-0 max-lg:flex-1 max-lg:grid-rows-[minmax(0,1fr)] max-lg:items-stretch" : ""}`}>
          <div className={`min-w-0 space-y-3 ${imersif ? "max-lg:flex max-lg:min-h-0 max-lg:flex-col max-lg:space-y-0" : ""}`}>
            {mode === "cari" ? stripHadir : null}

            {/* Di layar lebar tab tetap di atas panggung; di ponsel perannya
                diambil navigasi bawah, yang terjangkau jempol. */}
            <div className="hidden lg:block">
              <Tabs<Mode>
                label="How to check in"
                idPrefix="mode"
                size="lg"
                value={mode === "cari" ? "cari" : "qr"}
                onChange={gantiMode}
                options={[
                  { value: "qr", label: "Scan QR", icon: <QrCode size={20} aria-hidden /> },
                  { value: "cari", label: "Find name", icon: <MagnifyingGlass size={20} aria-hidden /> },
                ]}
              />
            </div>

            {mode === "qr" && mandiri === "both" && sessionId !== null ? (
              // Seperti aplikasi kasir QRIS: memindai pembeli, atau menampilkan kode.
              <div className={imersif ? "gelap-ponsel max-lg:px-4 max-lg:pb-3 max-lg:pt-1" : undefined}>
              <SegmentedButton<"pindai" | "tampil">
                label="Checkpoint mode"
                size="lg"
                value={tampilQr ? "tampil" : "pindai"}
                onChange={(nilai) => {
                  // Kembali ke Scan participant menyalakan kamera lagi: ketukan ini
                  // cukup sebagai izin, dan petugas memang akan memindai.
                  if (nilai === "pindai") bukaSuara();
                  setScanning(nilai === "pindai");
                  setPilihTampilQr((lama) => ({ ...lama, [sessionId]: nilai === "tampil" }));
                }}
                options={[
                  { value: "pindai", label: "Scan participant", icon: <Scan size={20} aria-hidden /> },
                  { value: "tampil", label: "Show QR", icon: <QrCode size={20} aria-hidden /> },
                ]}
              />
              </div>
            ) : null}

            {tampilQr && sessionId !== null ? (
              <div role="region" aria-label="Checkpoint QR">
                <TampilQrCheckpoint key={sessionId} sesiId={sessionId} terdaftar={terdaftar} />
              </div>
            ) : mode === "qr" ? (
              <div role="tabpanel" id="mode-panel-qr" aria-label="Scan QR" className="max-lg:min-h-0 max-lg:flex-1">
                {/* Ponsel: memenuhi sisa layar di antara bilah atas dan navigasi
                    bawah, tanpa sudut dan tanpa margin. Layar lebar tetap kartu
                    16:9 di kolom kiri, di samping panel angka. */}
                <div className="relative h-full min-h-72 w-full overflow-hidden bg-black lg:aspect-video lg:h-auto lg:max-h-[70dvh] lg:rounded-3xl">
                  {scanning ? (
                    <>
                      <video
                        ref={videoRef}
                        // Kamera depan dicerminkan seperti aplikasi kamera: peserta
                        // yang menyodorkan QR melihat gerakannya searah. Membaca
                        // QR tidak terpengaruh (pembaca memakai aliran aslinya).
                        className={`h-full w-full object-cover ${kameraDepan ? "-scale-x-100" : ""}`}
                        autoPlay
                        muted
                        playsInline
                        aria-label="Scanner camera preview"
                      />
                      {/* Bingkai bidik. QR yang dipegang di luar tengah bingkai
                          tetap terbaca, tetapi tamu mengarahkan badge-nya ke
                          tempat yang ditunjukkan layar, dan yang di tengah
                          adalah yang paling tajam di hampir semua lensa ponsel.
                          Sudutnya berubah warna saat kode terbaca. */}
                      <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 px-6">
                        <div
                          className={`bidik relative aspect-square h-[min(62%,18rem)] min-h-32 rounded-3xl transition-colors ${
                            membaca ? "bg-white/10 text-primary-fixed-dim" : "text-white"
                          }`}
                        >
                          <i /><i /><i /><i />
                        </div>
                        <p className="relative line-clamp-2 max-w-full text-center text-body-large [overflow-wrap:anywhere] font-semibold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]">
                          {membaca ?? "Hold the badge QR inside the frame"}
                        </p>
                      </div>
                      <p role="status" className="sr-only">{pil.teks}</p>

                      {/* Atas: angka hadir (ponsel; di layar lebar angkanya di
                          panel kanan) dan sakelar suara dan senter. */}
                      <div className="absolute inset-x-4 top-3 flex items-start justify-between gap-2 lg:inset-x-3">
                        {pilHadir}
                        <span className="hidden flex-1 lg:block" />
                        <div className="flex shrink-0 gap-2">
                          <IconButton
                            label="Sound"
                            selected={suara}
                            onClick={gantiSuara}
                            className="!size-12 !rounded-full !bg-black/70 !text-white"
                          >
                            {suara ? <SpeakerHigh size={22} weight="fill" /> : <SpeakerSlash size={22} weight="fill" />}
                          </IconButton>
                          {senter.ada ? (
                            <IconButton
                              label="Torch"
                              selected={senter.nyala}
                              onClick={() => void gantiSenter()}
                              className={senter.nyala ? "!size-12 !rounded-full" : "!size-12 !rounded-full !bg-black/70 !text-white"}
                            >
                              <Flashlight size={22} weight="fill" />
                            </IconButton>
                          ) : null}
                        </div>
                      </div>

                      {/* Bawah: tamu terakhir (ponsel; mengetuknya membuka
                          Riwayat) dan tombol mematikan kamera. */}
                      <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-2 lg:inset-x-3 lg:bottom-3">
                        {terakhirHadir ? (
                          <button
                            type="button"
                            onClick={() => gantiMode("riwayat")}
                            className="m3-state flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl bg-black/70 py-2 pl-3 pr-4 text-left text-white backdrop-blur-md lg:hidden"
                          >
                            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success text-on-success">
                              <Check size={18} weight="bold" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-3 text-label-large [overflow-wrap:anywhere]">{terakhirHadir.nama}</span>
                              <span className="block text-body-small text-white/75">Last check-in · {jam(terakhirHadir.waktu)}</span>
                            </span>
                            <span className="sr-only">Open history</span>
                          </button>
                        ) : (
                          <span className="flex-1" />
                        )}
                        {/* Ganti kamera di baris bawah, bersama tombol mematikan
                            kamera, seperti aplikasi kamera HP. Di baris atas ia
                            menyempitkan pil angka hadir di layar 360 px. */}
                        {bisaGantiKamera ? (
                          <IconButton
                            label={kameraDepan ? "Use back camera" : "Use front camera"}
                            selected={kameraDepan}
                            onClick={gantiKamera}
                            className={kameraDepan ? "!size-14 !rounded-full" : "!size-14 !rounded-full !bg-black/70 !text-white"}
                          >
                            <CameraRotate size={22} weight="fill" />
                          </IconButton>
                        ) : null}
                        <IconButton label="Turn off camera" onClick={() => setScanning(false)} className="!size-14 !rounded-full !bg-black/70 !text-white">
                          <VideoCameraSlash size={22} weight="fill" />
                        </IconButton>
                      </div>
                    </>
                  ) : (
                    // Tombolnya di dalam bingkai kamera: itulah tempat yang
                    // sedang dipandang petugas, dan setelah dinyalakan sekali
                    // kamera tetap menyala untuk tamu-tamu berikutnya. Bingkai
                    // bidik yang sama sudah terlihat, supaya tata letaknya tidak
                    // melompat saat kamera menyala.
                    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-8 text-center">
                      <div className="absolute inset-x-4 top-3 flex lg:hidden">{pilHadir}</div>
                      <div aria-hidden className="bidik relative flex aspect-square h-[min(40%,12rem)] min-h-28 items-center justify-center rounded-3xl text-white/60 [box-shadow:none]">
                        <i /><i /><i /><i />
                        <QrCode size={48} className="text-white/80" />
                      </div>
                      <div>
                        <p className="text-title-large font-semibold text-white">Camera is off</p>
                        <p className="mt-1 text-body-medium text-white/75">Turn it on once. It stays on for the next participants.</p>
                      </div>
                      <Button
                        size="xl"
                        shape="pill"
                        onClick={() => { bukaSuara(); setScanning(true); }}
                        disabled={!sessionId}
                        icon={<QrCode size={24} weight="bold" aria-hidden />}
                      >
                        Turn on camera
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {mode === "cari" ? (
              <div role="tabpanel" id="mode-panel-cari" aria-label="Find name">
                {/* Satu kolom untuk nama, instansi, DAN kode peserta: kolom
                    "ketik kode" terpisah di bawah kamera dulu mengerjakan hal
                    yang sama dengan pencarian ini. */}
                <TextField
                  label="Find participant"
                  type="search"
                  size="lg"
                  value={kueri}
                  onChange={(event) => setKueri(event.target.value)}
                  autoComplete="off"
                  autoFocus={fokusCari}
                  placeholder={nomorBagasi && (sesiAktif?.bagasi || sesiAktif?.ambil_bagasi) ? "Name, REG code or luggage number" : "Name, organisation or REG code"}
                  leading={<MagnifyingGlass size={20} />}
                  hint="Part of a name works, in any order."
                />

                <div className="mt-3" aria-busy={mencari}>
                  {!cukupHuruf ? (
                    kueriBersih === "" ? (
                      <DaftarHadir
                        sessionId={sessionId}
                        status={statusDaftar}
                        onStatus={setStatusDaftar}
                        hadir={hadir === null ? null : hadir + (sasaranAktif ? lainnya : 0)}
                        belum={belum}
                        untuk={sasaranAktif ? sasaranAktif.untuk ?? "this list" : null}
                        onCatat={(baris) => { bukaSuara(); return catatDariDaftar(baris); }}
                        mencatatId={mencatatId}
                        sibuk={sibuk}
                      />
                    ) : null
                  ) : mencari ? (
                    <SearchResultsSkeleton rows={3} />
                  ) : cariSekarang?.gagal ? (
                    <EmptyState
                      icon={<WarningCircle size={40} />}
                      title="Search failed"
                      description="The venue network is not responding. Change one letter of the search to retry, or use Scan for now."
                    />
                  ) : cariSekarang && cariSekarang.hasil.length === 0 ? (
                    /* Satu-satunya tempat tombol walk-in muncul di jalur
                       pencarian, dan itu disengaja. Tombol yang berdiri sendiri
                       akan ditekan lebih dulu daripada kolom pencarian, dan
                       hasilnya satu tamu tercatat sebagai tiga peserta karena
                       namanya dieja berbeda oleh tiga petugas. */
                    <EmptyState
                      icon={<MagnifyingGlass size={40} />}
                      title="No matching participants"
                      description={
                        allowWalkIn
                          ? "Try a shorter part of the name, or search by organisation. If nothing comes up, this person is not registered."
                          : "Try a shorter part of the name, or search by organisation. If nothing comes up, this person is not registered. Send them to the organisers' desk."
                      }
                      action={
                        allowWalkIn ? (
                          <Button
                            size="lg"
                            disabled={!sessionId}
                            onClick={() => bukaWalkIn(kueriBersih)}
                            icon={<UserPlus size={20} weight="bold" aria-hidden />}
                          >
                            Register as walk-in
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <>
                      <ul key={cariSekarang?.kunci} className="rise-in-fast divide-y divide-outline-variant">
                        {(cariSekarang?.hasil ?? []).map((baris) => {
                          const sudahHadir = baris.scan_count > 0;
                          return (
                            <li key={baris.id} className="flex min-h-[72px] items-center gap-3 py-2 sm:gap-4">
                              <span
                                aria-hidden
                                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary-container text-label-large font-semibold text-on-secondary-container"
                              >
                                {inisial(baris.name)}
                              </span>
                              <div className="min-w-0 flex-1">
                                {/* Nama tidak dipotong: ia bahan memastikan orangnya. */}
                                <p className="text-body-large font-semibold leading-tight">{baris.name}</p>
                                {baris.luggage_number && (sesiAktif?.bagasi || sesiAktif?.ambil_bagasi) ? (
                                  <p className="text-label-large font-semibold tabular-nums">Luggage {baris.luggage_number}</p>
                                ) : null}
                                <p className="truncate text-body-small text-on-surface-variant">
                                  {[baris.company, baris.title].filter(Boolean).join(" · ") || "No organisation"}
                                </p>
                                {/* Status dibawa teks, tidak hanya warna. */}
                                {sudahHadir ? (
                                  <p className="mt-0.5 text-label-medium text-warning">
                                    Checked in {jam(baris.first_scan_at)}, {baris.scan_count} {baris.scan_count === 1 ? "time" : "times"}
                                  </p>
                                ) : null}
                              </div>
                              <Button
                                variant={sudahHadir ? "tonal" : "filled"}
                                size="lg"
                                onClick={() => { bukaSuara(); void catatDariCari(baris); }}
                                loading={mencatatId === baris.id}
                                disabled={!sessionId || (sibuk && mencatatId !== baris.id)}
                                icon={sudahHadir ? undefined : <UserCheck size={20} weight="bold" aria-hidden />}
                                aria-label={sudahHadir ? `Check in ${baris.name} again` : `Check in ${baris.name}`}
                                className="shrink-0"
                              >
                                {sudahHadir ? "Again" : "Check in"}
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                      {/* Pemotongan diberitahukan, bukan didiamkan. */}
                      {cariSekarang?.terpotong ? (
                        <p className="mt-3 text-body-small text-on-surface-variant">
                          Showing the top 25. Narrow the search by adding the organisation.
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ) : null}

            {mode === "riwayat" ? (
              <div className="space-y-3 lg:hidden">
                {stripHadir}
                <div>
                  <h2 className="text-title-medium font-semibold">Scans on this phone</h2>
                  <p className="text-body-small text-on-surface-variant">
                    The count above covers all desks at this check-in point and counts people, not repeat scans.
                  </p>
                  {pitaDitolak}
                  {pitaAntrean}
                  {daftarRiwayat(BATAS_RIWAYAT)}
                  {riwayat.length > 0 ? <p className="mt-2 text-body-small text-on-surface-variant">Kept on this phone until the end of the day, also after a reload.</p> : null}
                </div>
              </div>
            ) : null}
          </div>

          {/* Panel kanan di layar lebar: angka hadir dan arus pemindaian.
              Setelan pindah ke menu ⋮, sama dengan di ponsel. */}
          <aside className="hidden lg:sticky lg:top-[88px] lg:block">
            <Card>
              <p className="text-label-large text-on-surface-variant">{sesiAktif?.name ?? "No check-in point yet"} · all desks</p>
              {sasaranAktif?.untuk ? <p className="mt-1 text-label-medium font-semibold">Counting {sasaranAktif.untuk} only</p> : null}
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-display-small tabular-nums">{angka(hadir ?? 0)}</span>
                <span className="text-body-medium text-on-surface-variant">
                  {pembagi !== null ? `checked in of ${angka(pembagi)} ${sasaranAktif ? "expected" : "registered"}` : "people checked in"}
                </span>
              </p>
              {pembagi ? <div className="mt-3">{bilahKemajuan}</div> : null}
              {sasaranAktif && lainnya > 0 ? (
                <p className="mt-2 text-body-small tabular-nums text-on-surface-variant">+{angka(lainnya)} from other groups also checked in here</p>
              ) : null}
              {belum !== null ? (
                <p className="mt-3 flex items-baseline justify-between gap-2 text-body-medium">
                  <span className="text-on-surface-variant">Not checked in yet</span>
                  <span className="flex items-baseline gap-3">
                    <span className="font-semibold tabular-nums">{angka(belum)}</span>
                    {belum > 0 ? (
                      <Button variant="text" size="sm" onClick={lihatBelum}>See who</Button>
                    ) : null}
                  </span>
                </p>
              ) : null}
              <p className="mt-1 text-body-small text-on-surface-variant">Counts people, not repeat scans. Updates every 30 seconds.</p>
              <Divider className="my-4" />
              <h2 className="text-title-small">Recent scans</h2>
              {pitaDitolak}
              {pitaAntrean}
              {daftarRiwayat(8)}
            </Card>
          </aside>
        </div>
      </main>

      <nav
        aria-label="Scanner mode"
        className={`fixed inset-x-0 bottom-0 z-30 flex h-[calc(5rem+env(safe-area-inset-bottom))] bg-surface-container pb-[env(safe-area-inset-bottom)] lg:hidden ${
          gelap ? "gelap-ponsel" : "border-t border-outline-variant"
        }`}
      >
        {navBawah("qr", "Scan", <QrCode size={24} weight={mode === "qr" ? "fill" : "regular"} aria-hidden />)}
        {navBawah("cari", "Find name", <MagnifyingGlass size={24} weight={mode === "cari" ? "bold" : "regular"} aria-hidden />)}
        {navBawah("riwayat", "History", <ClockCounterClockwise size={24} weight={mode === "riwayat" ? "bold" : "regular"} aria-hidden />)}
      </nav>

      {/* Sesi dan meja. Terbuka sendiri, dan tidak bisa ditutup, selama belum
          ada sesi atau meja yang dipilih: tanpa itu tidak ada yang bisa
          dipindai, dan bilah yang terlipat menyembunyikan pertanyaannya. */}
      <LembarScan
        open={lembarMejaBuka}
        onClose={() => setLembarMeja(false)}
        bolehTutup={!perluSetup}
        judul={perluSetup ? "Set up this desk" : "Change check-in point or desk"}
        keterangan={
          sesiHilang
            ? <span className="text-error">The organisers closed the check-in point you chose. Choose another before scanning.</span>
            : pindaiDitolak && perluSetup
              ? <span role="alert" className="text-error">That scan was not saved. Choose a desk first, then scan again.</span>
              : perluSetup
              ? "Set once. This phone remembers it until you change it."
              : "The next scans are saved to the new choice."
        }
      >
        <PilihMeja
          key={`${sessionId}-${laneId}-${lembarMejaBuka}`}
          sessions={sessions}
          lanes={lanes}
          sessionId={sessionId}
          laneId={laneId}
          hadir={(sesi) => hadirTerbaru[sesi.id] ?? sesi.hadir ?? null}
          onSimpan={simpanMeja}
        />
        {perluSetup ? (
          <div className="-mt-4 flex justify-center px-6 pb-4">
            <Button variant="text" size="lg" onClick={() => void keluar()} loading={keluarJalan}>
              Not your account? Sign out
            </Button>
          </div>
        ) : null}
      </LembarScan>

      {/* Menu ⋮: setelan perangkat ini dan Keluar. Dikerjakan sekali di pagi
          hari, jadi tidak berhak atas ruang di layar kerja. */}
      <LembarScan
        open={menuTerbuka}
        onClose={() => setMenuTerbuka(false)}
        judul="Settings for this phone"
        keterangan={username ? <>Signed in as <b className="font-semibold text-on-surface">{username}</b></> : undefined}
      >
        <div className="space-y-4 px-6 pt-4">
          <Switch
            className="!items-center"
            label="Sound on each scan"
            description="On iPhone, there is no sound while the silent switch is on."
            checked={suara}
            onChange={(nyala) => { if (nyala !== suaraRef.current) gantiSuara(); }}
          />
          <Switch
            className="!items-center"
            label="Auto-close green results"
            description="After 3 seconds, at check-in points without kit items. Touch the result to keep it open."
            checked={tutupOtomatis}
            onChange={gantiTutupOtomatis}
          />

          {badgeMeja && !label?.enabled ? (
            <>
              <Divider />
              {badgeMeja.siap ? (
                <div><PanelCetakMeja meja={meja} slug={eventSlug} /></div>
              ) : (
                <p className="text-body-small text-on-surface-variant">
                  Paper badges are selected for this desk, but print stations aren&apos;t active yet. Ask the Tally admin to run the database update.
                </p>
              )}
            </>
          ) : null}

          {label?.enabled ? (
            <>
              <Divider />
              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-title-small">
                    <Printer size={18} aria-hidden />
                    Printer for this desk
                  </h3>
                  {bisaBluetooth ? (
                    <span className={`text-label-medium ${printer ? "text-success" : "text-on-surface-variant"}`}>
                      {printer ? "connected" : "not connected"}
                    </span>
                  ) : null}
                </div>

                {!bisaBluetooth ? (
                  <p className="mt-2 text-body-small text-on-surface-variant">
                    The browser on this device has no Bluetooth, and iPhone, iPad and Firefox never do. The print
                    button still works and saves the label as an image to print from the NIIMBOT app.
                  </p>
                ) : (
                  <>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant={printer ? "outlined" : "filled"} size="lg" onClick={() => void sambungPrinter()}>
                        {printer ? "Reconnect" : "Connect"}
                      </Button>
                      {/* Menghabiskan satu lembar label, dan itu disebutkan. */}
                      <Button variant="text" size="lg" onClick={() => void cetakLabel(UJI_LABEL)}>
                        Test print, 1 label
                      </Button>
                    </div>

                    {printer ? (
                      <p className="mt-2 text-body-small text-on-surface-variant">
                        {printer.label}
                        {printer.modelId != null ? ` · id ${printer.modelId}` : ""}
                      </p>
                    ) : null}

                    {cetak.fase !== "diam" && !hasil ? (
                      <p role="status" className={`mt-2 text-body-small ${cetak.fase === "galat" ? "text-error" : "text-on-surface-variant"}`}>{cetak.teks}</p>
                    ) : null}

                    {/* Angka yang dilaporkan printer, bukan yang kita duga. */}
                    {lebarKepala != null && lebarKepala !== label.head_px ? (
                      <p className="mt-2 rounded-lg bg-warning-soft p-3 text-body-small text-on-warning-soft">
                        The printer reports a print head width of {lebarKepala} px, but the event setting uses {label.head_px}.
                        Ask an admin to fix it in Label &amp; printer.
                      </p>
                    ) : null}

                    <div className="mt-4">
                      <p className="text-label-large text-on-surface-variant">Automatic printing</p>
                      <SegmentedButton
                        className="mt-2"
                        size="lg"
                        label="When labels print automatically"
                        value={modeCetak}
                        onChange={gantiModeCetak}
                        options={[
                          { value: "off" as const, label: "Off" },
                          { value: "walkin" as const, label: "Walk-in" },
                          { value: "semua" as const, label: "All" },
                        ]}
                      />
                      <p className="mt-2 text-body-small text-on-surface-variant">
                        {modeCetak === "off"
                          ? "Labels print only when you tap the button."
                          : modeCetak === "walkin"
                            ? "Only walk-ins registered at this desk. Registered participants already have their code."
                            : "Every participant who has just checked in. Repeat scans are not included."}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : null}

          {/* Pemasangan TV hanya muncul kalau jalurnya LEBIH DARI SATU: kode
              enam angka menjawab "TV ini melayani meja yang mana". */}
          {lanes.length > 1 ? (
            <>
              <Divider />
              <details>
                <summary className="m3-state flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-body-large">
                  <span className="flex items-center gap-4">
                    <Television size={22} className="text-on-surface-variant" aria-hidden />
                    Link Welcome screen
                  </span>
                  <CaretDown size={18} aria-hidden />
                </summary>
                <p className="mt-2 text-body-small text-on-surface-variant">
                  A TV that is not linked yet shows six digits. Type them here.
                </p>
                <form
                  className="mt-3 flex items-end gap-2"
                  onSubmit={(event) => { event.preventDefault(); void pasangLayar(kodeLayar); }}
                >
                  <TextField
                    className="min-w-0 flex-1"
                    label="Screen code"
                    value={kodeLayar}
                    onChange={(event) => setKodeLayar(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    // `inputMode` numerik, bukan `type="number"`: kode ini
                    // bisa diawali nol.
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000000"
                    style={{ letterSpacing: "0.2em" }}
                  />
                  <Button type="submit" variant="tonal" size="lg" loading={memasang} disabled={kodeLayar.length !== 6 || !laneId}>
                    Link
                  </Button>
                </form>
                {pesanLayar ? (
                  <p role="status" className={`mt-3 text-body-small ${pesanLayar.nada === "ok" ? "text-primary" : "text-error"}`}>
                    {pesanLayar.teks}
                  </p>
                ) : null}
              </details>
            </>
          ) : null}

          <Divider />
          <div className="-mx-6">
            {/* Tab baru, bukan pindah halaman: kamera, riwayat ponsel ini, dan
                lembar yang terbuka hanya hidup di layar ini. Halamannya statis
                di public/panduan/, terbuka tanpa login, berisi data contoh. */}
            <a
              href="/panduan/scanner.html"
              target="_blank"
              rel="noopener"
              onClick={() => setMenuTerbuka(false)}
              className="m3-state flex min-h-14 w-full items-center gap-4 px-6 text-left text-body-large"
            >
              <BookOpenText size={22} className="text-on-surface-variant" aria-hidden />
              Scanner guide
            </a>
            <button type="button" onClick={() => { void muatSesi(); setMenuTerbuka(false); }} className="m3-state flex min-h-14 w-full items-center gap-4 px-6 text-left text-body-large">
              <ArrowsClockwise size={22} className="text-on-surface-variant" aria-hidden />
              Reload check-in points
            </button>
            <button type="button" onClick={() => void keluar()} disabled={keluarJalan} className="m3-state flex min-h-14 w-full items-center gap-4 px-6 text-left text-body-large text-error">
              {keluarJalan ? <CircleNotch size={22} className="animate-spin" aria-hidden /> : <SignOut size={22} aria-hidden />}
              {keluarJalan ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </LembarScan>

      {/* Modal hasil dan dialog walk-in adalah dua lapisan yang tidak boleh
          bertumpuk. Lihat `onWalkIn`: yang satu ditutup sebelum yang lain
          dibuka, supaya petugas tidak perlu menutup dua lapis untuk kembali. */}
      <ResultSheet
        hasil={hasil}
        kedip={kedip}
        onTutup={mintaTutup}
        bisaCetak={Boolean(label?.enabled)}
        labelUntukPerangkatIni={bisaBluetooth}
        cetak={cetak}
        onCetak={() => { if (hasil?.participant) void cetakLabel(hasil.participant); }}
        cetakMeja={barisMeja?.status}
        aksiMeja={barisMeja?.aksi}
        bolehWalkIn={allowWalkIn}
        onWalkIn={() => { tutupLembar(); bukaWalkIn(""); }}
        onUlangi={() => {
          // Langsung ke server, melewati tahanan kode-sama: petugas menekannya
          // dengan sengaja.
          if (hasil?.dicoba) { void kirim("", hasil.dicoba); return; }
          const kode = hasil?.qr;
          if (kode) void kirim(kode);
        }}
        barang={sessionId !== null && (sesiAktif?.jumlah_barang ?? 0) > 0 ? { sessionId, laneId } : null}
        onCentang={onCentang}
        bagasi={sessionId !== null && sesiAktif?.bagasi ? { sessionId } : null}
        ambilBagasi={sessionId !== null && sesiAktif?.ambil_bagasi ? { sessionId } : null}
        onBagasi={onBagasi}
        onKameraFoto={onKameraFoto}
        alasanTahan={alasanTahan}
        tutupOtomatis={lembarMenutup}
        onSentuh={() => setHitungBatal(kedip)}
        tertahan={tertahan}
        onLewati={lewatiBarang}
        onCari={() => { tutupLembar(); gantiMode("cari"); }}
      />

      {pesanKembali ? (
        // M3 snackbar: inverse dari kanvas. Ponsel gelap (.gelap-ponsel) maka terang;
        // layar lebar mengikuti tema terang maka gelap. Peran inverse tema tidak
        // cukup kontras di sini (#9d9d9d di #0e0e0e).
        <div role="status" className="pointer-events-none fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-sm rounded-lg bg-[#303030] px-4 py-3.5 text-body-medium text-white shadow-lg max-lg:bg-[#f2f2f2] max-lg:text-[#1a1a1a]">
          Swipe back again to leave the scanner
        </div>
      ) : null}
      <Dialog
        open={tanyaTutup}
        onClose={() => setTanyaTutup(false)}
        title="Luggage not saved"
        description={`${hasil?.participant?.name ?? "This guest"} is checked in, but no bag count is saved. Save the count, or 0 if they have no luggage, so the luggage list stays complete.`}
        actions={
          <>
            <Button type="button" variant="outlined" onClick={() => { setTanyaTutup(false); bagasiRef.current = 0; tutupLembar(); }}>Close without saving</Button>
            <Button type="button" variant="filled" onClick={() => setTanyaTutup(false)}>Back to luggage</Button>
          </>
        }
      />
      <DialogGantiStasiun meja={meja} jobId={gantiJob} nama={hasil?.participant?.name ?? ""} onClose={() => setGantiJob(null)} />

      <WalkinDialog
        open={dialogWalkIn}
        onClose={() => setDialogWalkIn(false)}
        form={formWalkIn}
        onForm={gantiFormWalkIn}
        fields={walkinFields}
        wajib={walkinWajib}
        galatKolom={galatKolomWalkIn}
        tolakSimpan={tolakSimpanWalkIn}
        kandidat={kandidat}
        onLupakanKandidat={() => setKandidat(null)}
        sesiNama={sesiAktif?.name ?? "the chosen check-in point"}
        menyimpan={menyimpanWalkIn}
        galat={galatWalkIn}
        onSimpan={(paksa) => void simpanWalkIn(paksa)}
        onPakaiKandidat={(baris) => void pakaiKandidat(baris)}
        bisaSimpan={sessionId != null}
      />
    </div>
  );
}
