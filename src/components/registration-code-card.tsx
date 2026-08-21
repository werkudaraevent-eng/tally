"use client";

import { DownloadSimple, ShareNetwork } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Kode peserta: QR, angkanya, dan satu tombol untuk menyimpannya.
 *
 * ---- Kenapa ada tombol, bukan "potret layar ini" --------------------------
 *
 * Tidak ada API yang membolehkan halaman memotret dirinya sendiri, dan yang
 * terdekat (`getDisplayMedia`) meminta izin, membuka pemilih layar, dan tidak
 * ada sama sekali di iOS Safari. Yang bisa dilakukan halaman adalah MENGGAMBAR
 * ULANG kodenya ke kanvas lalu menyerahkannya sebagai berkas — hasilnya lebih
 * baik daripada tangkapan layar: tidak ada bilah alamat, tidak terpotong, dan
 * QR-nya digambar pada resolusi yang pasti terbaca pemindai.
 *
 * Dua jalur, dipilih menurut yang tersedia di perangkat:
 *
 *   * `navigator.share` dengan berkas — iOS Safari 15+ dan Android Chrome.
 *     Pendaftar memilih sendiri "Simpan Gambar" atau mengirimnya ke WhatsApp.
 *     Ini jalur yang benar di ponsel, dan ponsel adalah mayoritas pendaftar.
 *   * `<a download>` — desktop, dan ponsel yang tidak mendukung berbagi berkas.
 *
 * ---- Kenapa QR digambar di peramban ---------------------------------------
 *
 * Paket `qrcode` sudah menjadi dependensi (dipakai lampiran email dan layar
 * vote), dan diimpor dinamis supaya ~20 KB itu hanya diunduh oleh pendaftar yang
 * benar-benar sampai ke layar sukses — bukan oleh setiap orang yang membuka
 * formulirnya.
 */

type Props = {
  code: string;
  eventName: string;
  /** Nama pendaftar. Ikut dilukis ke gambar supaya jelas kode ini milik siapa. */
  personName: string;
  schedule: string | null;
};

const MUTED = "text-[var(--reg-on-surface-variant)]";

/** Tidak ada yang perlu dilangganani: kemampuan peramban tidak berubah saat halaman terbuka. */
const langgananKosong = () => () => {};

/**
 * Apakah perangkat ini bisa membagikan BERKAS.
 *
 * Diperiksa lewat `canShare`, bukan lewat user agent: daftar peramban selalu
 * tertinggal dari kenyataan, dan tebakan yang meleset menampilkan tombol yang
 * gagal saat ditekan. Hasilnya di-cache karena `useSyncExternalStore` memanggil
 * pembacanya pada setiap render dan pembuatan `File` percuma tidak gratis.
 */
let cacheBagikan: boolean | null = null;
function bacaBisaBagikan() {
  if (cacheBagikan !== null) return cacheBagikan;
  const uji = new File([new Blob([""], { type: "image/png" })], "uji.png", { type: "image/png" });
  cacheBagikan = Boolean(navigator.canShare?.({ files: [uji] }));
  return cacheBagikan;
}

export function RegistrationCodeCard({ code, eventName, personName, schedule }: Props) {
  const [qr, setQr] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");
  const kartu = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let batal = false;
    void (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        // Koreksi galat H: QR ini akan dipindai dari layar ponsel yang mungkin
        // retak, berminyak, atau redup di tenda registrasi. H memulihkan sampai
        // 30% modul yang tidak terbaca, dengan biaya QR yang sedikit lebih padat.
        const url = await QRCode.toDataURL(code, { errorCorrectionLevel: "H", margin: 1, width: 512 });
        if (!batal) setQr(url);
      } catch {
        // Kode teksnya sudah tampil di bawah dan itu yang dicocokkan panitia.
        // QR adalah kenyamanan, bukan syarat masuk.
      }
    })();
    return () => { batal = true; };
  }, [code]);

  // Kemampuan berbagi berkas dibaca lewat useSyncExternalStore, bukan efek yang
  // memanggil setState: server tidak punya `navigator`, dan render pertama di
  // klien harus cocok dengan markup server. Snapshot server-nya `false`, jadi
  // tombolnya lahir sebagai "Unduh" lalu berganti menjadi "Bagikan" hanya di
  // perangkat yang memang mendukungnya.
  const bisaBagikan = useSyncExternalStore(langgananKosong, bacaBisaBagikan, () => false);

  async function simpan() {
    if (!qr) return;
    setSibuk(true);
    setGalat("");
    try {
      const blob = await gambarKartu({ qr, code, eventName, personName, schedule });
      const file = new File([blob], `kode-${code}.png`, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Kode peserta ${eventName}` });
        return;
      }

      const url = URL.createObjectURL(blob);
      const tautan = document.createElement("a");
      tautan.href = url;
      tautan.download = file.name;
      tautan.click();
      // Dilepas setelah satu putaran event loop: mencabutnya seketika membatalkan
      // unduhan di sebagian peramban sebelum berkasnya sempat ditulis.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      // Pembatalan oleh pengguna (menutup lembar berbagi) BUKAN galat, dan
      // menampilkannya sebagai galat membuat orang mengira kodenya hilang.
      if ((error as Error)?.name === "AbortError") return;
      setGalat("Gambar gagal dibuat. Potret layar ini sebagai gantinya.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div
      ref={kartu}
      className="mt-7 rounded-[20px] border border-[var(--reg-outline-variant)] bg-[var(--reg-field)] p-6"
    >
      <p className={`text-label-medium uppercase tracking-[0.16em] ${MUTED}`}>Kode peserta</p>

      {qr ? (
        // Latar putih di belakang QR, apa pun warna temanya. Pemindai membaca
        // kontras hitam-putih; QR di atas bidang berwarna gagal dipindai pada
        // sebagian pembaca murah yang dipakai di meja registrasi.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qr}
          alt={`Kode QR peserta ${code}`}
          className="mx-auto mt-4 size-48 rounded-2xl bg-white p-3"
          width={192}
          height={192}
        />
      ) : null}

      {/* Kode teks tetap tampil BESAR walaupun QR-nya ada. Pemindai bisa mati,
          dan panitia harus bisa mengetiknya manual dari layar pendaftar. */}
      <p className="mt-4 select-all text-center font-mono text-headline-medium font-semibold tracking-[0.08em]">
        {code}
      </p>

      <button
        type="button"
        onClick={() => void simpan()}
        disabled={!qr || sibuk}
        className="m3-state mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[var(--reg-outline)] px-6 text-label-large font-semibold disabled:opacity-50"
      >
        {bisaBagikan ? <ShareNetwork size={18} weight="fill" /> : <DownloadSimple size={18} weight="fill" />}
        {sibuk ? "Menyiapkan…" : bisaBagikan ? "Simpan atau bagikan kode" : "Unduh kode"}
      </button>

      {galat ? (
        <p role="alert" className="mt-3 text-body-medium font-medium text-[var(--reg-error)]">{galat}</p>
      ) : null}
    </div>
  );
}

/**
 * Melukis kartu kode ke kanvas dan mengembalikannya sebagai PNG.
 *
 * Ukurannya 1080×1350 — rasio yang sama dengan foto potret di galeri ponsel,
 * jadi hasilnya tidak terlihat seperti tangkapan layar yang salah potong ketika
 * dikirim lewat WhatsApp.
 *
 * Warnanya HITAM DI ATAS PUTIH, bukan warna tema acara. Berkas ini berakhir di
 * galeri dan dibuka lagi berbulan kemudian di bawah cahaya apa pun; kontras
 * maksimum lebih berharga daripada kesetiaan pada warna merek.
 */
async function gambarKartu({
  qr,
  code,
  eventName,
  personName,
  schedule,
}: {
  qr: string;
  code: string;
  eventName: string;
  personName: string;
  schedule: string | null;
}): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#111111";
  ctx.textAlign = "center";

  ctx.font = "600 40px system-ui, sans-serif";
  potong(ctx, eventName, W / 2, 150, W - 140);

  if (schedule) {
    ctx.fillStyle = "#555555";
    ctx.font = "400 32px system-ui, sans-serif";
    potong(ctx, schedule, W / 2, 210, W - 140);
  }

  const gambar = await muatGambar(qr);
  const sisi = 620;
  ctx.drawImage(gambar, (W - sisi) / 2, 280, sisi, sisi);

  ctx.fillStyle = "#111111";
  ctx.font = "600 84px ui-monospace, monospace";
  ctx.fillText(code, W / 2, 1030);

  ctx.font = "500 40px system-ui, sans-serif";
  potong(ctx, personName, W / 2, 1110, W - 140);

  ctx.fillStyle = "#777777";
  ctx.font = "400 30px system-ui, sans-serif";
  ctx.fillText("Tunjukkan kode ini di meja registrasi", W / 2, 1200);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("blob-failed"))), "image/png");
  });
}

/** Menulis teks, dipotong dengan elipsis bila melewati lebar yang diberikan. */
function potong(ctx: CanvasRenderingContext2D, teks: string, x: number, y: number, maks: number) {
  let isi = teks;
  while (ctx.measureText(isi).width > maks && isi.length > 1) {
    isi = isi.slice(0, -1);
  }
  ctx.fillText(isi === teks ? isi : `${isi.slice(0, -1)}…`, x, y);
}

function muatGambar(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const gambar = new Image();
    gambar.onload = () => resolve(gambar);
    gambar.onerror = () => reject(new Error("image-failed"));
    gambar.src = src;
  });
}
