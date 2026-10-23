"use client";

import {
  Armchair,
  CheckCircle,
  Clock,
  CloudSlash,
  DownloadSimple,
  Flag,
  Prohibit,
  Printer,
  SignIn,
  UserPlus,
  X,
  XCircle,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Dialog } from "@/components/m3";
import { standard } from "@/lib/m3/motion";
import { ItemChecklist } from "./item-checklist";
import { LuggageForm } from "./luggage-form";
import { bukaSuara } from "./umpan-balik";
import type { CatatanCheckpoint, Hasil, StatusCetak, StatusHasil } from "./types";

/**
 * Lembar hasil pemindaian.
 *
 * ---- Kenapa lembar, dan kenapa TIDAK modal --------------------------------
 *
 * Alur meja registrasi di perangkat lunak acara besar (Cvent OnArrival,
 * Swapcard, Eventleaf, Accelevents) selalu berbentuk sama: pindai, layar
 * memastikan siapa yang barusan masuk, lalu SATU ketukan mencetak badge-nya.
 * Langkah tengah itu memang butuh permukaannya sendiri, karena di situlah
 * petugas memutuskan sesuatu.
 *
 * ---- Modal penuh, dan kenapa biayanya lebih kecil daripada dugaan ---------
 *
 * Dua versi sebelumnya sengaja TIDAK memblokir: panel di dalam kolom kerja,
 * dengan alasan setiap ketukan tutup dikalikan jumlah tamu. Keduanya ditolak
 * pemakainya dengan alasan yang sama dan benar: panel yang mengisi sela-sela
 * halaman tidak terbaca sebagai jawaban atas pemindaian yang barusan terjadi.
 *
 * Yang membuat modal penuh tetap murah di sini: jalur cepatnya TIDAK memakai
 * tangan. QR dibaca kamera, bukan diklik, jadi tamu berikutnya tetap terpindai
 * dengan modal terbuka dan isinya berganti sendiri. Lembar hijau di sesi tanpa
 * barang bahkan menutup sendiri (lihat `tutupOtomatis`).
 *
 * ---- Satu aksi yang menonjol ------------------------------------------------
 *
 * Kehadiran SUDAH tersimpan saat lembar hijau muncul. Versi sebelumnya memberi
 * tombol label warna penuh, dan itu terbaca sebagai langkah wajib ("tetap harus
 * pencet simpan?"). Sekarang tombol berisi warna hanya untuk aksi yang memang
 * harus dikerjakan: Serahkan barang, Ulangi, Login lagi, Daftarkan walk-in, atau
 * Cetak lagi setelah printer gagal. Label biasa cukup tombol teks.
 *
 * Lapisan gelap, kunci fokus, Escape, dan pengembalian fokus datang dari
 * `Dialog`, bukan ditulis ulang di sini. Yang khas layar ini hanya isinya.
 */

/** Lama lembar hijau terbuka sebelum menutup sendiri. Dipakai pewaktu dan bilahnya. */
export const TUTUP_OTOMATIS_MS = 3000;

/**
 * Warna status, dipakai sebagai LATAR seluruh bagian atas lembar.
 *
 * Blok statusnya memakai peran `*-container` beserta pasangannya
 * `on-*-container`, yang dibangkitkan generator tema dengan jarak kontras yang
 * dijamin. Ikonnya memakai warna induk yang lebih pekat supaya ada satu titik
 * paling terang untuk dilirik.
 *
 * Walk-in ikut HIJAU, bukan biru: ia sama-sama keberhasilan. Merah dipakai dua
 * keadaan (kode tidak dikenal, belum tercatat); keduanya dibedakan ikon, judul,
 * dan aksinya, tidak hanya warna.
 */
const TAMPILAN: Record<StatusHasil, { judul: string; blok: string; ikon: string; Icon: typeof CheckCircle }> = {
  recorded: {
    judul: "Checked in",
    blok: "bg-success-container text-on-success-container",
    ikon: "bg-success text-on-success",
    Icon: CheckCircle,
  },
  created: {
    judul: "Walk-in registered",
    blok: "bg-success-container text-on-success-container",
    ikon: "bg-success text-on-success",
    Icon: UserPlus,
  },
  duplicate: {
    judul: "Already scanned",
    blok: "bg-warning-container text-on-warning-container",
    ikon: "bg-warning text-on-warning",
    Icon: Clock,
  },
  not_found: {
    judul: "Unknown code",
    blok: "bg-error-container text-on-error-container",
    ikon: "bg-error text-on-error",
    Icon: XCircle,
  },
  gagal: {
    judul: "Not saved",
    blok: "bg-error-container text-on-error-container",
    ikon: "bg-error text-on-error",
    Icon: CloudSlash,
  },
  login: {
    judul: "Signed out",
    blok: "bg-warning-container text-on-warning-container",
    ikon: "bg-warning text-on-warning",
    Icon: SignIn,
  },
  ditolak: {
    judul: "Not checked in",
    blok: "bg-error-container text-on-error-container",
    ikon: "bg-error text-on-error",
    Icon: Prohibit,
  },
};

/** Kenapa email Sign-in link walk-in tidak dikirim (prepareWalkinLink). */
const ALASAN_TAUTAN: Record<string, string> = {
  no_email: "no email address",
  email_not_configured: "email sending is not set up",
  not_eligible: "Who can sign in does not include walk-ins",
  has_account: "this email already has an account",
  email_taken: "email already belongs to another participant",
  already_sent: "a link was already sent",
};

const jam = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";

type Props = {
  hasil: Hasil | null;
  /** Naik satu setiap jawaban baru. Memaksa lembar berkedip walau isinya serupa. */
  kedip: number;
  onTutup: () => void;
  /** False berarti acara ini tidak memakai printer label sama sekali. */
  bisaCetak: boolean;
  labelUntukPerangkatIni: boolean;
  cetak: StatusCetak;
  onCetak: () => void;
  /** Badge kertas di stasiun cetak (cetak-meja.tsx): baris status dan tombolnya. */
  cetakMeja?: ReactNode;
  aksiMeja?: ReactNode;
  bolehWalkIn: boolean;
  onWalkIn: () => void;
  onUlangi: () => void;
  /** Sesi yang memeriksa barang. Null = sesi ini tidak membagikan apa pun. */
  barang: { sessionId: number; laneId: number | null } | null;
  /** Jumlah barang yang dicentang tetapi belum diserahkan, dilaporkan ke atas. */
  onCentang: (jumlah: number) => void;
  /** Sesi yang mencatat bagasi (Record luggage). Null = tanpa isian bagasi. */
  bagasi?: { sessionId: number } | null;
  /** 1 selama jumlah atau foto bagasi tamu ini belum tersimpan. */
  onBagasi?: (jumlah: number) => void;
  /** Kamera bawaan dibuka (true) atau ditutup (false) untuk foto bagasi. */
  onKameraFoto?: (buka: boolean) => void;
  /** Lembar ini sedang menghitung mundur untuk menutup sendiri. */
  tutupOtomatis: boolean;
  /** Ketukan apa pun di lembar: hentikan hitung mundur. */
  onSentuh: () => void;
  /**
   * Tamu berikutnya yang sudah terpindai selagi barang tamu ini masih
   * dicentang. Kehadirannya sudah tersimpan; lembarnya menunggu di sini.
   */
  tertahan: Hasil | null;
  onLewati: () => void;
  /** Yang belum selesai untuk tamu ini: menentukan kalimat tamu tertahan. */
  alasanTahan?: "barang" | "bagasi";
};

export function ResultSheet({
  hasil,
  kedip,
  onTutup,
  bisaCetak,
  labelUntukPerangkatIni,
  cetak,
  onCetak,
  cetakMeja,
  aksiMeja,
  bolehWalkIn,
  onWalkIn,
  onUlangi,
  barang,
  onCentang,
  bagasi,
  onBagasi,
  onKameraFoto,
  tutupOtomatis,
  onSentuh,
  tertahan,
  onLewati,
  alasanTahan = "barang",
}: Props) {
  const status = hasil?.status;
  const tampilan = status ? (hasil?.tersimpanSebelumnya ? TAMPILAN.recorded : TAMPILAN[status]) : null;
  const peserta = hasil?.participant;
  const hadir = status === "recorded" || status === "created" || status === "duplicate";
  const adaOrang = Boolean(peserta) && hadir;
  const adaBarang = Boolean(barang && peserta && hadir);
  const adaBagasi = Boolean(bagasi && peserta && hadir);

  /**
   * Fokus mendarat di lembar itu sendiri, bukan di sebuah tombol.
   *
   * Versi sebelumnya memberi `autoFocus` pada tombol label. Dengan pemindai
   * genggam yang "mengetik" kodenya, Enter milik tamu BERIKUTNYA menekan tombol
   * itu: label tercetak untuk orang yang salah dan kodenya sendiri hilang. Tanpa
   * tombol label, Dialog memfokuskan kotak centang pertama, dan Enter mencentang
   * kaos. Wadah yang fokus tidak melakukan apa pun saat Enter ditekan.
   */
  const wadah = useRef<HTMLDivElement>(null);
  // Tempat tombol Serahkan barang di bilah aksi; diisi ItemChecklist lewat portal.
  const [tempatSerahkan, setTempatSerahkan] = useState<HTMLDivElement | null>(null);
  // Tempat tombol Simpan bagasi; diisi LuggageForm lewat portal.
  const [tempatBagasi, setTempatBagasi] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (hasil) wadah.current?.focus({ preventScroll: true });
  }, [hasil, kedip]);

  const teksLabel =
    cetak.fase === "galat"
      ? "Print again"
      : cetak.fase === "selesai"
        ? labelUntukPerangkatIni ? "Reprint" : "Download again"
        : labelUntukPerangkatIni ? "Print label" : "Download label";
  // Satu-satunya keadaan tombol label pantas berwarna penuh: printer baru saja
  // gagal dan tamunya masih berdiri di depan meja. Di sesi berbarang tetap teks,
  // karena Serahkan barang sudah menjadi aksi utamanya.
  const labelUtama = cetak.fase === "galat" && !adaBarang;

  return (
    <Dialog
      open={Boolean(hasil && tampilan)}
      onClose={onTutup}
      bare
      size="xl"
      title={tampilan?.judul ?? "Scan result"}
    >
      {hasil && tampilan ? (
        // `aria-live` menempel di wadah yang TIDAK ikut dipasang ulang. Memasang
        // ulang wadah live region membuat sebagian pembaca layar melewatkan
        // pengumumannya; yang boleh dipasang ulang hanya isinya.
        <div
          ref={wadah}
          tabIndex={-1}
          aria-live="assertive"
          aria-atomic="true"
          className="outline-none"
          // Ketukan pertama di lembar juga membuka suara di iPhone, dan menghentikan
          // hitung mundur: petugas yang menyentuh lembar sedang mengerjakan sesuatu.
          onPointerDown={() => { bukaSuara(); onSentuh(); }}
        >
          {/* Dipasang ulang pada setiap jawaban baru lewat `key`. Dua tamu
              berturut-turut yang sama-sama tercatat hadir menghasilkan isi yang
              nyaris identik, dan tanpa kedipan itu petugas tidak punya cara tahu
              apakah pemindaian keduanya benar-benar terbaca. */}
          <motion.section
            key={kedip}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...standard.spatial.default, opacity: standard.effects.default }}
            className="w-full rounded-2xl"
          >
            {/* Blok status. Seluruhnya berwarna, karena inilah yang harus
                terbaca dari sudut mata sebelum satu huruf pun sempat dibaca. */}
            <div className={`relative overflow-hidden rounded-t-2xl p-4 sm:p-5 ${tampilan.blok}`}>
              {/* Kisi, bukan baris flex. Di ponsel sempit (di bawah 400 px,
                  termasuk 360 px yang paling umum di Android) nama turun ke
                  baris sendiri selebar lembar, di bawah ikon. Nama adalah bahan
                  memastikan orangnya benar, jadi tidak pernah dipotong menjadi
                  "Siti Rahmawati...": tiga baris masih muat, dan ukurannya turun
                  satu langkah sebelum lebarnya habis. */}
              <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_3rem] items-start gap-x-4 max-[400px]:grid-cols-[2.5rem_minmax(0,1fr)_3rem] max-[400px]:gap-x-3 [@media(max-height:700px)]:grid-cols-[2.5rem_minmax(0,1fr)_3rem]">
                <span className={`row-span-3 flex size-14 shrink-0 items-center justify-center rounded-full max-[400px]:row-span-1 max-[400px]:size-10 [@media(max-height:700px)]:size-10 ${tampilan.ikon}`}>
                  <tampilan.Icon size={30} weight="fill" aria-hidden className="max-[400px]:size-6" />
                </span>

                {/* `opacity`, bukan peran warna kedua: di atas permukaan
                    berwarna tidak ada peran "on-container-variant". */}
                <p className="col-start-2 row-start-1 text-label-large opacity-80 max-[400px]:self-center">{tampilan.judul}</p>

                <button
                  type="button"
                  onClick={onTutup}
                  aria-label="Close result"
                  className="m3-state col-start-3 row-span-2 row-start-1 -mr-1 -mt-1 flex size-12 max-[400px]:row-span-1 shrink-0 items-center justify-center rounded-full text-current opacity-80 max-[400px]:-my-1"
                >
                  <X size={20} />
                </button>

                <p className="col-start-2 row-start-2 line-clamp-3 text-headline-small font-semibold [overflow-wrap:anywhere] max-[400px]:col-span-3 max-[400px]:col-start-1 max-[400px]:mt-2 max-[400px]:text-title-large">
                  {peserta ? peserta.name : hasil.dicoba ? hasil.dicoba.nama : hasil.qr ? `Code ${hasil.qr}` : "Code ?"}
                </p>
                {peserta ? (
                  <p className="col-start-2 row-start-3 line-clamp-2 text-body-medium opacity-80 max-[400px]:col-span-3 max-[400px]:col-start-1">
                    {[peserta.company, peserta.title].filter(Boolean).join(" · ") || "No organisation"}
                  </p>
                ) : null}
              </div>

              {/* Kode REG tidak ditampilkan: petugas tidak memakainya, dan tempat
                  ini dipakai kursi. Kursinya ditulis lengkap, bukan "A8": petugas
                  membacakannya kepada tamu, dan "Row A · Seat 8" tidak bisa salah
                  dengar. Acara tanpa kursi tidak mendapat baris ini sama sekali. */}
              {hasil.kursi && hasil.kursi.length > 0 && hadir ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {hasil.kursi.map((seat, index) => (
                    <p
                      key={`${index}-${seat.tulisan}`}
                      className="inline-flex min-w-0 items-center gap-2 rounded-lg bg-black/15 px-3 py-1.5 text-title-large font-semibold [overflow-wrap:anywhere]"
                    >
                      <Armchair size={22} weight="fill" aria-hidden className="shrink-0" />
                      <span>
                        <span className="sr-only">Seat: </span>
                        {seat.sesi && hasil.kursi!.length > 1 ? <span className="font-normal opacity-80">{seat.sesi} · </span> : null}
                        {seat.tulisan}
                      </span>
                    </p>
                  ))}
                </div>
              ) : null}

              {hasil.checkpoint && hadir ? <CatatanCheckpointHasil catatan={hasil.checkpoint} baru={status === "recorded" || Boolean(hasil.tersimpanSebelumnya)} /> : null}

              {hasil.tersimpanSebelumnya ? (
                <p className="mt-3 text-body-medium opacity-90">
                  Saved on the previous attempt, at {jam(hasil.first_scan_at)}. The reply did not reach this phone.
                </p>
              ) : null}

              {status === "created" && hasil.signin_link ? (
                <p className="mt-3 text-body-medium opacity-90 [overflow-wrap:anywhere]">
                  {hasil.signin_link.state === "queued"
                    ? `A sign-in link will be emailed to ${hasil.signin_link.email}.`
                    : `Sign-in link not sent: ${hasil.signin_link.state === "skipped" ? ALASAN_TAUTAN[hasil.signin_link.reason] ?? "it could not be prepared" : "it could not be prepared"}. They can use "Forgot password?" on the Sign in page.`}
                </p>
              ) : null}

              {status === "duplicate" && !hasil.tersimpanSebelumnya ? (
                <p className="mt-3 text-body-medium opacity-90">
                  First scanned at {jam(hasil.first_scan_at)}. This is scan number {hasil.scan_count}. They can still go in.
                  The check-in count does not change.
                </p>
              ) : null}

              {status === "not_found" ? (
                <p className="mt-2 text-body-medium opacity-90">
                  This code is not a participant of this event, or their registration was cancelled.{" "}
                  {bolehWalkIn
                    ? "Search for the name first. If it is not there, register them as a walk-in."
                    : "Search for the name in Find name before sending them to the organisers' desk."}
                </p>
              ) : null}

              {status === "gagal" || status === "login" || status === "ditolak" ? (
                <p className="mt-2 text-body-medium opacity-90">{hasil.pesan}</p>
              ) : null}

              {/* Kalimat tetap, bukan "menutup dalam 2 detik": isi wadah ini
                  dibacakan ulang pembaca layar setiap kali berubah, dan angka yang
                  berdetak akan dibacakan setiap detik. Bilahnya hiasan semata. */}
              {tutupOtomatis ? (
                <>
                  <p className="mt-3 text-body-medium opacity-80">Scan the next participant. This closes automatically.</p>
                  <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-black/10">
                    <div className="scan-hitung h-full bg-current opacity-60" style={{ animationDuration: `${TUTUP_OTOMATIS_MS}ms` }} />
                  </div>
                </>
              ) : null}
            </div>

            {/* Bagian aksi di permukaan NETRAL, bukan di atas blok berwarna.
                Tombol M3 membawa warnanya sendiri, dan warna itu tidak punya
                jaminan kontras terhadap latar hijau atau oranye. */}
            <div className="rounded-b-2xl bg-surface-container-high text-on-surface">
              {adaBarang && barang && peserta ? (
                <div className="px-4 pt-4 sm:px-5 sm:pt-5">
                  {/* Dipasang ulang per tamu lewat `key` supaya centang tamu
                      sebelumnya tidak terbawa ke tamu berikutnya. */}
                  <ItemChecklist
                    key={`${kedip}-${peserta.id}`}
                    sessionId={barang.sessionId}
                    laneId={barang.laneId}
                    participantId={peserta.id}
                    onCentang={onCentang}
                    tempatTombol={tempatSerahkan}
                  />
                </div>
              ) : null}

              {adaBagasi && bagasi && peserta ? (
                <div className="px-4 pt-4 sm:px-5 sm:pt-5">
                  {/* Dipasang ulang per tamu, sama seperti daftar barang. */}
                  <LuggageForm
                    key={`${kedip}-${peserta.id}`}
                    sessionId={bagasi.sessionId}
                    participantId={peserta.id}
                    onTertunda={onBagasi}
                    onKamera={onKameraFoto}
                    tempatTombol={tempatBagasi}
                  />
                </div>
              ) : null}

              {/* Bilah aksi menempel di bawah panel. Di ponsel pendek, atau saat
                  daftar barang panjang, panelnya bergulir dan tombolnya tetap
                  terlihat. */}
              <div className="sticky bottom-0 rounded-b-2xl bg-surface-container-high px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
                {tertahan ? (
                  <div role="status" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-body-medium text-on-warning-soft">
                    <span className="min-w-0 flex-1">
                      {tertahan.participant?.name ?? `Code ${tertahan.qr ?? "?"}`} is scanned and waiting. {alasanTahan === "bagasi" ? "Save the luggage of" : "Hand out items to"}{" "}
                      {peserta?.name ?? "this participant"} first.
                    </span>
                    <Button variant="text" size="md" onClick={onLewati}>Skip</Button>
                  </div>
                ) : null}

                {/* Kegagalan printer muncul DI SINI, bukan di panel sebelah. Label
                    yang tidak keluar adalah kabar tentang tamu yang sedang berdiri
                    di depan petugas. */}
                {adaOrang && cetak.fase !== "diam" ? (
                  <p
                    role="status"
                    className={`mb-2 flex items-center gap-2 text-body-medium ${cetak.fase === "galat" ? "text-error" : "text-on-surface-variant"}`}
                  >
                    <Printer size={18} weight={cetak.fase === "selesai" ? "fill" : "regular"} aria-hidden />
                    {cetak.teks}
                  </p>
                ) : null}

                {adaOrang ? cetakMeja : null}

                {/* Rata kanan, aksi utama paling kanan: pola baris aksi dialog M3. Semua
                    tombol di baris ini setinggi 48 px, supaya barisnya rata. */}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {adaOrang && bisaCetak ? (
                    <Button
                      variant={labelUtama ? "filled" : "text"}
                      size="md"
                      loading={cetak.fase === "jalan"}
                      onClick={onCetak}
                      icon={labelUntukPerangkatIni ? <Printer size={20} aria-hidden /> : <DownloadSimple size={20} aria-hidden />}
                    >
                      {teksLabel}
                    </Button>
                  ) : null}

                  {adaOrang ? aksiMeja : null}

                  <Button variant="text" size="md" onClick={onTutup}>
                    Close
                  </Button>

                  {status === "not_found" && bolehWalkIn ? (
                    <Button variant="filled" size="md" onClick={onWalkIn} icon={<UserPlus size={20} weight="bold" aria-hidden />}>
                      Register walk-in
                    </Button>
                  ) : null}

                  {status === "gagal" ? (
                    <Button variant="filled" size="md" onClick={onUlangi}>
                      Retry
                    </Button>
                  ) : null}

                  {status === "login" ? (
                    // Halaman penuh, bukan klien: sesi baru harus membawa kuki baru.
                    <Button variant="filled" size="md" onClick={() => window.location.assign("/login")} icon={<SignIn size={20} aria-hidden />}>
                      Sign in again
                    </Button>
                  ) : null}

                  {/* Serahkan barang masuk ke sini dari daftar barang, paling
                      kanan sebagai aksi utama. `contents` supaya tombolnya ikut
                      menjadi anggota baris ini. */}
                  {adaBarang ? <div ref={setTempatSerahkan} className="contents" /> : null}
                  {adaBagasi ? <div ref={setTempatBagasi} className="contents" /> : null}
                </div>
              </div>
            </div>
          </motion.section>
        </div>
      ) : null}
    </Dialog>
  );
}

/**
 * Checkpoint di lembar hijau: posisinya, poin bila acara memakai poin, dan
 * langkah sebelumnya yang belum dikerjakan. Yang terakhir hanya arahan untuk
 * petugas, bukan penolakan: urutan checkpoint tidak pernah menahan orang.
 */
function CatatanCheckpointHasil({ catatan, baru }: { catatan: CatatanCheckpoint; baru: boolean }) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      {catatan.selesai.map((cp) => (
        <p key={cp.posisi} className="inline-flex min-w-0 items-center gap-2 self-start rounded-lg bg-black/15 px-3 py-1.5 text-title-medium font-semibold [overflow-wrap:anywhere]">
          <Flag size={20} weight="fill" aria-hidden className="shrink-0" />
          <span>
            Checkpoint {cp.posisi} of {catatan.total}
            <span className="font-normal"> · {cp.judul}</span>
            {!baru ? <span className="font-normal opacity-80"> · done earlier</span> : cp.poin ? <span> · +{cp.poin} pts</span> : null}
          </span>
        </p>
      ))}
      {catatan.terbuka_sebelum.length > 0 ? (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-body-medium text-on-warning-soft [overflow-wrap:anywhere]">
          Still open: {catatan.terbuka_sebelum.map((cp) => `${cp.posisi}. ${cp.judul}`).join(", ")}. They can carry on; point them there afterwards.
        </p>
      ) : null}
    </div>
  );
}
