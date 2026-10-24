"use client";

import {
  Armchair,
  CheckCircle,
  Clock,
  CloudSlash,
  DownloadSimple,
  Flag,
  MagnifyingGlass,
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
import { LuggageHandover } from "./luggage-handover";
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
 * harus dikerjakan: Serahkan barang, Ulangi, Login lagi, Find name, Daftarkan
 * walk-in, atau Cetak lagi setelah printer gagal. Label biasa cukup tombol
 * bergaris. Bila tidak ada yang harus dikerjakan, tombol utamanya "Scan next":
 * kata kerja langkah berikutnya, bukan "Simpan", jadi tidak terbaca sebagai
 * kewajiban, dan hitung mundur tutup otomatis terlihat menyusut di dalamnya.
 *
 * Lapisan gelap, kunci fokus, Escape, dan pengembalian fokus datang dari
 * `Dialog`, bukan ditulis ulang di sini. Yang khas layar ini hanya isinya.
 */

/** Lama lembar hijau terbuka sebelum menutup sendiri. Dipakai pewaktu dan bilahnya. */
export const TUTUP_OTOMATIS_MS = 3000;

/**
 * Warna status, dipakai sebagai LATAR SELURUH lembar, pekat.
 *
 * Versi sebelumnya memakai `*-container` (hijau, oranye, merah muda pastel)
 * dengan bilah aksi abu di bawahnya. Dari satu meter yang terbaca hanya "ada
 * kotak hijau muda", dan dua nada atas-bawah itu pola dialog Material 2. Pemindai
 * kelas global (Eventbrite Organizer, Cvent OnArrival, gerbang boarding maskapai)
 * mengubah seluruh layar menjadi satu warna pekat: petugas tahu hasilnya sebelum
 * membaca satu huruf. Peran induk `success`/`warning`/`error` dengan pasangan
 * `on-*` mencapai 6,4:1 sampai 6,8:1 di tema terang.
 *
 * Walk-in ikut HIJAU, bukan biru: ia sama-sama keberhasilan. Merah dipakai dua
 * keadaan (kode tidak dikenal, belum tercatat); keduanya dibedakan ikon, judul,
 * dan aksinya, tidak hanya warna.
 */
type Nada = "success" | "warning" | "error";
const LEMBAR: Record<Nada, string> = {
  success: "!bg-success !text-on-success",
  warning: "!bg-warning !text-on-warning",
  error: "!bg-error !text-on-error",
};
const TAMPILAN: Record<StatusHasil, { judul: string; nada: Nada; Icon: typeof CheckCircle }> = {
  recorded: { judul: "Checked in", nada: "success", Icon: CheckCircle },
  created: { judul: "Walk-in registered", nada: "success", Icon: UserPlus },
  duplicate: { judul: "Already scanned", nada: "warning", Icon: Clock },
  not_found: { judul: "Unknown code", nada: "error", Icon: XCircle },
  gagal: { judul: "Not saved", nada: "error", Icon: CloudSlash },
  login: { judul: "Signed out", nada: "warning", Icon: SignIn },
  ditolak: { judul: "Not checked in", nada: "error", Icon: Prohibit },
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
  /** Sesi tempat bagasi diserahkan kembali (Luggage: Pick-up). Null = bukan meja ambil. */
  ambilBagasi?: { sessionId: number } | null;
  /** 1 selama jumlah atau foto bagasi tamu ini belum tersimpan, atau titipannya belum diserahkan. */
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
  /** Kode tidak dikenal: pindah ke Find name. Tanpa ini tombolnya tidak ada. */
  onCari?: () => void;
  /** Yang belum selesai untuk tamu ini: menentukan kalimat tamu tertahan. */
  alasanTahan?: "barang" | "bagasi" | "ambil";
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
  ambilBagasi,
  onBagasi,
  onKameraFoto,
  tutupOtomatis,
  onSentuh,
  tertahan,
  onLewati,
  onCari,
  alasanTahan = "barang",
}: Props) {
  const status = hasil?.status;
  const tampilan = status ? (hasil?.tersimpanSebelumnya ? TAMPILAN.recorded : TAMPILAN[status]) : null;
  const peserta = hasil?.participant;
  const hadir = status === "recorded" || status === "created" || status === "duplicate";
  const adaOrang = Boolean(peserta) && hadir;
  const adaBarang = Boolean(barang && peserta && hadir);
  const adaBagasi = Boolean(bagasi && peserta && hadir);
  const adaAmbil = Boolean(ambilBagasi && peserta && hadir);

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

  // Aksi lain yang lebih penting daripada menutup. Tanpa itu, menutup adalah
  // satu-satunya langkah, dan ia tampil sebagai tombol utama "Scan next".
  const cariNama = status === "not_found" && Boolean(onCari);
  const adaAksiLain =
    cariNama || (status === "not_found" && bolehWalkIn) || status === "gagal" || status === "login" || adaBarang || adaBagasi || adaAmbil || labelUtama;
  // Kartu terang di dalam lembar: semua yang punya warnanya sendiri (daftar
  // barang, isian bagasi, kabar printer, tamu tertahan) duduk di permukaan
  // netral, karena warnanya tidak dijamin terbaca di atas latar status.
  const adaKartu = Boolean(tertahan) || (adaOrang && (cetak.fase !== "diam" || Boolean(cetakMeja))) || adaBarang || adaBagasi || adaAmbil;

  return (
    <Dialog
      open={Boolean(hasil && tampilan)}
      onClose={onTutup}
      bare
      size="xl"
      title={tampilan?.judul ?? "Scan result"}
      // Di ponsel lembar menempel di tepi bawah selebar layar, seperti bottom
      // sheet M3, bukan kartu yang melayang 16 px dari tepi. Di layar lebar ia
      // tetap di tengah: dua versi panel tanpa modal sudah ditolak pemakainya
      // (lihat catatan di atas).
      className={`${tampilan ? LEMBAR[tampilan.nada] : ""} max-sm:-mx-4 max-sm:-mb-4 max-sm:w-[calc(100%+2rem)] max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-[28px] sm:rounded-[28px]`}
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
            className="w-full"
          >
            {/* Blok status: ikon dan kata status lebih dulu (itu yang dilirik),
                lalu nama besar (itu yang dibaca untuk memastikan orangnya). */}
            <div data-nada={tampilan.nada} className="hasil-nada px-4 pb-2 pt-5 sm:px-6 sm:pt-6">
              <div className="flex items-center gap-3">
                <span className="hasil-ikon flex size-14 shrink-0 items-center justify-center rounded-full [@media(max-height:700px)]:size-10">
                  <tampilan.Icon size={32} weight="bold" aria-hidden className="[@media(max-height:700px)]:size-6" />
                </span>
                <p className="min-w-0 flex-1 text-title-large font-semibold">{tampilan.judul}</p>
                <button
                  type="button"
                  onClick={onTutup}
                  aria-label="Close result"
                  className="m3-state -mr-2 flex size-12 shrink-0 items-center justify-center self-start rounded-full text-current opacity-90"
                >
                  <X size={22} />
                </button>
              </div>

              {/* Nama tidak pernah dipotong menjadi "Siti Rahmawati...": ia
                  bahan memastikan orangnya benar. Tiga baris masih muat, dan
                  ukurannya turun satu langkah di ponsel sempit. */}
              <p className="mt-4 line-clamp-3 text-headline-medium font-semibold [overflow-wrap:anywhere] max-[400px]:text-headline-small [@media(max-height:700px)]:mt-3 [@media(max-height:700px)]:text-headline-small">
                {peserta ? peserta.name : hasil.dicoba ? hasil.dicoba.nama : hasil.qr ? `Code ${hasil.qr}` : "Code ?"}
              </p>
              {peserta ? (
                <p className="mt-1 line-clamp-2 text-body-large opacity-90">
                  {[peserta.company, peserta.title].filter(Boolean).join(" · ") || "No organisation"}
                </p>
              ) : null}

              {/* Kode REG tidak ditampilkan: petugas tidak memakainya, dan tempat
                  ini dipakai kursi. Kursinya ditulis lengkap, bukan "A8": petugas
                  membacakannya kepada tamu, dan "Row A · Seat 8" tidak bisa salah
                  dengar. Acara tanpa kursi tidak mendapat baris ini sama sekali. */}
              {hasil.kursi && hasil.kursi.length > 0 && hadir ? (
                <div className="mt-4 flex flex-wrap gap-2">
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
                <p className="mt-3 text-body-medium opacity-90">
                  This code is not a participant of this event, or their registration was cancelled.{" "}
                  {bolehWalkIn
                    ? "Search for the name first. If it is not there, register them as a walk-in."
                    : "Search for the name in Find name before sending them to the organisers' desk."}
                </p>
              ) : null}

              {status === "gagal" || status === "login" || status === "ditolak" ? (
                <p className="mt-3 text-body-medium opacity-90">{hasil.pesan}</p>
              ) : null}

              {/* Kalimat tetap, bukan "menutup dalam 2 detik": isi wadah ini
                  dibacakan ulang pembaca layar setiap kali berubah, dan angka yang
                  berdetak akan dibacakan setiap detik. Hitung mundurnya terlihat
                  sebagai isian yang menyusut di tombol Scan next. */}
              {tutupOtomatis ? (
                <p className="mt-3 text-body-medium opacity-90">Scan the next participant. This closes automatically.</p>
              ) : null}
            </div>

            {adaKartu ? (
              <div className="mx-4 mt-3 space-y-4 rounded-2xl bg-panel p-4 text-on-surface sm:mx-6">
                {tertahan ? (
                  <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-body-medium text-on-warning-soft">
                    <span className="min-w-0 flex-1">
                      {tertahan.participant?.name ?? `Code ${tertahan.qr ?? "?"}`} is scanned and waiting. {alasanTahan === "bagasi" ? "Save the luggage of" : alasanTahan === "ambil" ? "Hand over the luggage of" : "Hand out items to"}{" "}
                      {peserta?.name ?? "this participant"} first.
                    </span>
                    <Button variant="text" size="md" onClick={onLewati}>Skip</Button>
                  </div>
                ) : null}

                {/* Kegagalan printer muncul DI SINI, bukan di panel sebelah. Label
                    yang tidak keluar adalah kabar tentang tamu yang sedang berdiri
                    di depan petugas. */}
                {adaOrang && (cetak.fase !== "diam" || cetakMeja) ? (
                  <div className="[&>p:last-child]:mb-0">
                    {cetak.fase !== "diam" ? (
                      <p
                        role="status"
                        className={`mb-2 flex items-center gap-2 text-body-medium ${cetak.fase === "galat" ? "text-error" : "text-on-surface-variant"}`}
                      >
                        <Printer size={18} weight={cetak.fase === "selesai" ? "fill" : "regular"} aria-hidden />
                        {cetak.teks}
                      </p>
                    ) : null}
                    {cetakMeja}
                  </div>
                ) : null}

                {/* Dipasang ulang per tamu lewat `key` supaya centang dan isian
                    tamu sebelumnya tidak terbawa ke tamu berikutnya. */}
                {adaBarang && barang && peserta ? (
                  <ItemChecklist
                    key={`${kedip}-${peserta.id}`}
                    sessionId={barang.sessionId}
                    laneId={barang.laneId}
                    participantId={peserta.id}
                    onCentang={onCentang}
                    tempatTombol={tempatSerahkan}
                  />
                ) : null}

                {adaBagasi && bagasi && peserta ? (
                  <LuggageForm
                    key={`${kedip}-${peserta.id}`}
                    sessionId={bagasi.sessionId}
                    participantId={peserta.id}
                    onTertunda={onBagasi}
                    onKamera={onKameraFoto}
                    tempatTombol={tempatBagasi}
                  />
                ) : null}

                {adaAmbil && ambilBagasi && peserta ? (
                  <LuggageHandover
                    key={`${kedip}-${peserta.id}`}
                    sessionId={ambilBagasi.sessionId}
                    participantId={peserta.id}
                    onTertunda={onBagasi}
                    tempatTombol={tempatBagasi}
                  />
                ) : null}
              </div>
            ) : null}

            {/* Bilah aksi menempel di bawah lembar, di atas latar status yang
                sama. `hasil-nada` menukar peran primary menjadi on-status, jadi
                tombol M3 biasa (termasuk yang masuk lewat portal dari daftar
                barang dan bagasi) menjadi tombol terang di atas warna status
                tanpa ditulis ulang. Di ponsel tombolnya selebar lembar dan aksi
                utama paling atas; di layar lebar rata kanan, utama paling kanan. */}
            <div
              data-nada={tampilan.nada}
              className="hasil-nada sticky bottom-0 flex flex-col-reverse gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:px-6 sm:pb-6 max-sm:[&_button]:w-full"
            >
              {adaOrang && bisaCetak ? (
                <Button
                  variant={labelUtama ? "filled" : "outlined"}
                  size="lg"
                  shape="pill"
                  loading={cetak.fase === "jalan"}
                  onClick={onCetak}
                  icon={labelUntukPerangkatIni ? <Printer size={20} aria-hidden /> : <DownloadSimple size={20} aria-hidden />}
                >
                  {teksLabel}
                </Button>
              ) : null}

              {adaOrang ? aksiMeja : null}

              {adaAksiLain ? (
                <Button variant="outlined" size="lg" shape="pill" onClick={onTutup}>
                  Close
                </Button>
              ) : (
                <Button variant="filled" size="lg" shape="pill" onClick={onTutup} className="relative overflow-hidden sm:min-w-48">
                  {tutupOtomatis ? (
                    <span aria-hidden className="scan-hitung pointer-events-none absolute inset-0 bg-current opacity-15" style={{ animationDuration: `${TUTUP_OTOMATIS_MS}ms` }} />
                  ) : null}
                  <span className="relative">Scan next</span>
                </Button>
              )}

              {status === "not_found" && bolehWalkIn ? (
                <Button variant={cariNama ? "outlined" : "filled"} size="lg" shape="pill" onClick={onWalkIn} icon={<UserPlus size={20} weight="bold" aria-hidden />}>
                  Register walk-in
                </Button>
              ) : null}

              {cariNama ? (
                <Button variant="filled" size="lg" shape="pill" onClick={onCari} icon={<MagnifyingGlass size={20} weight="bold" aria-hidden />}>
                  Find name
                </Button>
              ) : null}

              {status === "gagal" ? (
                <Button variant="filled" size="lg" shape="pill" onClick={onUlangi}>
                  Retry
                </Button>
              ) : null}

              {status === "login" ? (
                // Halaman penuh, bukan klien: sesi baru harus membawa kuki baru.
                <Button variant="filled" size="lg" shape="pill" onClick={() => window.location.assign("/login")} icon={<SignIn size={20} aria-hidden />}>
                  Sign in again
                </Button>
              ) : null}

              {/* Serahkan barang dan tombol bagasi masuk ke sini lewat portal,
                  paling kanan (atau paling atas di ponsel) sebagai aksi utama.
                  `contents` supaya tombolnya ikut menjadi anggota baris ini. */}
              {adaBarang ? <div ref={setTempatSerahkan} className="contents" /> : null}
              {adaBagasi || adaAmbil ? <div ref={setTempatBagasi} className="contents" /> : null}
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
