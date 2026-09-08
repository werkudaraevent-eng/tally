"use client";

import { CheckCircle, Clock, Printer, UserPlus, X, XCircle } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { Button, Dialog } from "@/components/m3";
import { standard } from "@/lib/m3/motion";
import type { Hasil, StatusCetak, StatusHasil } from "./types";

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
 * dengan modal terbuka dan isinya berganti sendiri. Yang benar-benar membayar
 * satu ketukan tambahan hanya jalur pencarian nama, dan itu memang jalur yang
 * sudah lambat sejak awal.
 *
 * Lapisan gelap, kunci fokus, Escape, dan pengembalian fokus datang dari
 * `Dialog`, bukan ditulis ulang di sini. Yang khas layar ini hanya isinya.
 */

/**
 * Warna status, dipakai sebagai LATAR seluruh bagian atas lembar.
 *
 * Versi sebelumnya memberi lembar ini permukaan netral bertingkat
 * (`surface-container-high`) dengan pita status setipis 4px. Di tema gelap
 * permukaan itu nyaris sewarna latar halaman, dan hasilnya persis seperti yang
 * dilaporkan: lembarnya tidak terlihat sebagai lembar sama sekali. Pita 4px
 * tidak cukup untuk menebusnya.
 *
 * Sekarang blok statusnya memakai peran `*-container` beserta pasangannya
 * `on-*-container`. Pasangan itu memang dibangkitkan bersama oleh generator tema
 * dengan jarak kontras yang dijamin, jadi mewarnai seluruh bloknya tidak
 * mengorbankan keterbacaan satu huruf pun. Ikonnya memakai warna induk yang
 * lebih pekat supaya ada satu titik paling terang untuk dilirik.
 *
 * Walk-in ikut HIJAU, bukan biru. Ia sama-sama keberhasilan, dan biru di sini
 * adalah warna merek yang juga dipakai latar halaman, yaitu kesalahan yang baru
 * saja diperbaiki. Yang membedakannya dari check-in biasa adalah ikon dan
 * judulnya, bukan warnanya.
 */
const TAMPILAN: Record<StatusHasil, { judul: string; blok: string; ikon: string; Icon: typeof CheckCircle }> = {
  recorded: {
    judul: "Tercatat hadir",
    blok: "bg-success-container text-on-success-container",
    ikon: "bg-success text-on-success",
    Icon: CheckCircle,
  },
  created: {
    judul: "Tamu walk-in didaftarkan",
    blok: "bg-success-container text-on-success-container",
    ikon: "bg-success text-on-success",
    Icon: UserPlus,
  },
  duplicate: {
    judul: "Sudah pernah dipindai",
    blok: "bg-warning-container text-on-warning-container",
    ikon: "bg-warning text-on-warning",
    Icon: Clock,
  },
  not_found: {
    judul: "Kode tidak dikenal",
    blok: "bg-error-container text-on-error-container",
    ikon: "bg-error text-on-error",
    Icon: XCircle,
  },
};

const jam = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";

type Props = {
  hasil: Hasil | null;
  /** Naik satu setiap jawaban baru. Memaksa lembar berkedip walau isinya serupa. */
  kedip: number;
  onTutup: () => void;
  /** Null berarti acara ini tidak memakai printer label sama sekali. */
  bisaCetak: boolean;
  labelUntukPerangkatIni: boolean;
  cetak: StatusCetak;
  onCetak: () => void;
  bolehWalkIn: boolean;
  onWalkIn: () => void;
};

export function ResultSheet({
  hasil,
  kedip,
  onTutup,
  bisaCetak,
  labelUntukPerangkatIni,
  cetak,
  onCetak,
  bolehWalkIn,
  onWalkIn,
}: Props) {
  const tampilan = hasil ? TAMPILAN[hasil.status] : null;
  const peserta = hasil?.participant;
  const adaOrang = Boolean(peserta);

  return (
    <Dialog
      open={Boolean(hasil && tampilan)}
      onClose={onTutup}
      bare
      size="xl"
      title={tampilan?.judul ?? "Hasil pemindaian"}
    >
      {hasil && tampilan ? (
        // `aria-live` menempel di wadah yang TIDAK ikut dipasang ulang. Memasang
        // ulang wadah live region membuat sebagian pembaca layar melewatkan
        // pengumumannya; yang boleh dipasang ulang hanya isinya.
        <div aria-live="assertive" aria-atomic="true">
          {/* Dipasang ulang pada setiap jawaban baru lewat `key`. Dua tamu
              berturut-turut yang sama-sama tercatat hadir menghasilkan isi yang
              nyaris identik, dan tanpa kedipan itu petugas tidak punya cara tahu
              apakah pemindaian keduanya benar-benar terbaca. */}
          <motion.section
            key={kedip}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...standard.spatial.default, opacity: standard.effects.default }}
            className="w-full overflow-hidden rounded-2xl"
          >
            {/* Blok status. Seluruhnya berwarna, karena inilah yang harus
                terbaca dari sudut mata sebelum satu huruf pun sempat dibaca. */}
            <div className={`p-4 sm:p-5 ${tampilan.blok}`}>
              <div className="flex items-start gap-4">
                <span className={`flex size-14 shrink-0 items-center justify-center rounded-full ${tampilan.ikon}`}>
                  <tampilan.Icon size={30} weight="fill" aria-hidden />
                </span>

                <div className="min-w-0 flex-1">
                  {/* `opacity`, bukan peran warna kedua: di atas permukaan
                      berwarna tidak ada peran "on-container-variant", dan
                      memaksakan on-surface-variant ke sini menghasilkan teks
                      yang kontrasnya tidak lagi dijamin siapa pun. */}
                  <p className="text-label-large opacity-80">{tampilan.judul}</p>
                  <p className="truncate text-headline-small font-semibold">
                    {peserta?.name ?? `Kode ${hasil.qr ?? "?"}`}
                  </p>
                  {peserta ? (
                    <p className="truncate text-body-medium opacity-80">
                      {[peserta.company, peserta.title].filter(Boolean).join(" · ") || "Tanpa instansi"}
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={onTutup}
                  aria-label="Tutup hasil"
                  className="m3-state -mr-1 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-current opacity-80"
                >
                  <X size={20} />
                </button>
              </div>

              {adaOrang ? (
                <p
                  className="mt-3 inline-flex rounded-lg bg-black/15 px-3 py-1.5 text-title-medium"
                  style={{ fontFamily: "var(--font-mono), ui-monospace, monospace", letterSpacing: "0.04em" }}
                >
                  {peserta?.qr_code}
                </p>
              ) : null}

              {hasil.status === "duplicate" ? (
                <p className="mt-3 text-body-medium opacity-90">
                  Pertama dipindai {jam(hasil.first_scan_at)}, ini pemindaian ke-{hasil.scan_count}. Tetap boleh masuk.
                  Jumlah hadir tidak bertambah.
                </p>
              ) : null}

              {hasil.status === "not_found" ? (
                <p className="mt-2 text-body-medium opacity-90">
                  Kode ini bukan peserta acara ini, atau pendaftarannya sudah dibatalkan.{" "}
                  {bolehWalkIn
                    ? "Cari namanya dulu. Kalau memang tidak ada, daftarkan sebagai tamu walk-in."
                    : "Cari namanya di tab Cari nama sebelum mengarahkan tamu ke meja panitia."}
                </p>
              ) : null}
            </div>

            {/* Bilah aksi di permukaan NETRAL, bukan di atas blok berwarna.
                Tombol M3 membawa warnanya sendiri (primary untuk aksi utama), dan
                warna itu tidak punya jaminan kontras apa pun terhadap latar hijau
                atau oranye. Memisahkannya juga membuat batas antara "apa yang
                terjadi" dan "apa yang bisa saya lakukan" terlihat tanpa dijelaskan. */}
            <div className="bg-surface-container-high p-4 text-on-surface sm:p-5">
              {/* Kegagalan printer muncul DI SINI, bukan di panel sebelah. Label
                  yang tidak keluar adalah kabar tentang tamu yang sedang berdiri
                  di depan petugas, dan panduan vendor badge printing menyebut
                  sebab yang sama berulang: printer tertidur, label habis,
                  sambungan putus. Semuanya butuh tindakan sekarang. */}
              {cetak.fase !== "diam" ? (
                <p
                  role="status"
                  className={`mb-3 flex items-center gap-2 text-body-medium ${
                    cetak.fase === "galat" ? "text-error" : "text-on-surface-variant"
                  }`}
                >
                  <Printer size={18} weight={cetak.fase === "selesai" ? "fill" : "regular"} aria-hidden />
                  {cetak.teks}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {hasil.status === "not_found" && bolehWalkIn ? (
                  <Button variant="filled" size="lg" onClick={onWalkIn} icon={<UserPlus size={20} weight="bold" aria-hidden />}>
                    Daftarkan tamu walk-in
                  </Button>
                ) : null}

                {adaOrang && bisaCetak ? (
                  <Button
                    variant="filled"
                    size="lg"
                    // Fokus mendarat di sini saat modal terbuka, bukan di tombol
                    // tutup. Aksi yang paling mungkin diambil setelah seorang
                    // tamu tercatat adalah mencetak badge-nya, dan dengan fokus
                    // di sini satu ketukan Enter sudah cukup.
                    autoFocus
                    loading={cetak.fase === "jalan"}
                    onClick={onCetak}
                    icon={<Printer size={20} weight="bold" aria-hidden />}
                  >
                    {/* "Cetak ulang" setelah label pertama keluar. Badge hilang
                        dan badge sobek adalah kejadian rutin di acara besar, dan
                        petugas harus tahu tombol ini boleh ditekan lagi. */}
                    {cetak.fase === "selesai"
                      ? "Cetak ulang"
                      : labelUntukPerangkatIni
                        ? "Cetak label"
                        : "Simpan label"}
                  </Button>
                ) : null}

                <Button variant="text" size="lg" onClick={onTutup}>
                  Tutup
                </Button>
              </div>
            </div>
          </motion.section>
        </div>
      ) : null}
    </Dialog>
  );
}
