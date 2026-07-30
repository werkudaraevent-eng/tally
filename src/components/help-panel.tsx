"use client";

import { CaretDown, Printer, Question, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";

// Panduan operator, disajikan sebagai panel di ATAS layar kerja.
//
// Kenapa bukan halaman terpisah: staf booth adalah pelaku UMKM yang memakai ini
// sekali, di bawah tekanan antrean. Panduan yang harus dibuka di halaman lain
// hampir tidak pernah dibuka saat benar-benar dibutuhkan, dan menutupnya berarti
// kehilangan konteks order yang sedang diisi. Panel menutup tanpa memindahkan
// staf dari posisinya.
//
// Isinya ADAPTIF mengikuti event_settings. Panduan yang bertentangan dengan alur
// yang sedang aktif lebih membingungkan daripada tidak ada panduan: dengan
// cashier_confirmation_required = false, instruksi "arahkan peserta ke kasir"
// justru menyesatkan karena kasir tidak ada di alur.

type Settings = {
  pickup_mode: "after_payment" | "immediate";
  cashier_confirmation_required: boolean;
  pending_auto_void_minutes: number;
};

type Section = { title: string; steps: string[] };

export function HelpPanel({ role }: { role: "booth" | "cashier" }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [openSection, setOpenSection] = useState<string | null>("alur");

  useEffect(() => {
    if (!open || settings) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/settings", { cache: "no-store" }).then(async (response) => {
        if (response.ok) setSettings(await response.json());
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, settings]);

  // Esc menutup panel: staf yang tidak sengaja membukanya di tengah antrean harus
  // bisa keluar cepat tanpa mencari tombol.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const viaCashier = settings?.cashier_confirmation_required !== false;
  const handOverNow = settings?.pickup_mode === "immediate";
  const autoVoid = settings?.pending_auto_void_minutes ?? 45;

  const boothFlow: string[] = [
    "Tekan SCAN QR, arahkan kamera ke badge peserta. Kalau QR tidak terbaca, pakai Cari peserta manual.",
    "Periksa nama peserta yang muncul sudah benar.",
    "Centang item spesial bila peserta mengambilnya. Kalau tidak bisa dicentang, alasannya tertulis di bawah nama item.",
    "Isi nominal item reguler. Cek angka TOTAL sebelum lanjut.",
    "Isi nomor stiker sesuai stiker fisik yang ditempel. Nomor lanjut otomatis, ubah bila tidak sesuai.",
    "Tekan Buat order.",
    viaCashier
      ? (handOverNow
        ? "Serahkan barang sekarang, lalu arahkan peserta ke kasir untuk membayar."
        : "Tempel stiker pada barang, simpan di rak booth, arahkan peserta ke kasir. Barang diserahkan setelah lunas.")
      : (handOverNow
        ? "Order langsung tercatat lunas. Serahkan barang sekarang. Peserta TIDAK perlu ke kasir."
        : "Order langsung tercatat lunas. Tempel stiker, simpan di rak, serahkan saat peserta kembali."),
  ];

  const cashierFlow: string[] = viaCashier ? [
    "Pilih peserta dari antrean pembayaran, atau scan QR badge, atau cari nama.",
    "Centang order yang akan dibayar. Peserta boleh membayar sebagian dulu.",
    "Cek angka TOTAL bersama peserta sebelum menagih.",
    "Pilih metode pembayaran.",
    "Bila metode meminta nomor referensi, isi sesuai struk. Tombol Tandai lunas mati sampai nomor lengkap.",
    "Tekan Tandai lunas. Sebutkan nomor order yang muncul ke peserta.",
  ] : [
    "Konfirmasi kasir sedang DIMATIKAN admin. Order booth langsung tercatat lunas dan tidak masuk antrean kasir.",
    "Tidak ada tindakan yang perlu dilakukan di layar ini sampai admin mengaktifkan kembali konfirmasi kasir.",
  ];

  const boothStatus: string[] = [
    "Menunggu kasir — peserta belum membayar. Jangan serahkan barang.",
    "Lunas, siap diserahkan — sudah dibayar. Serahkan barang, lalu tekan Serahkan barang.",
    "Sudah diserahkan — selesai, tidak ada tindakan lagi.",
    "Void — dibatalkan. Nilainya tidak dihitung dan kuota item spesial peserta kembali.",
  ];

  const troubleshooting: Section[] = [
    {
      title: "QR tidak mau terbaca kamera",
      steps: [
        "Pastikan badge tidak terlipat dan tidak tertutup plastik yang memantulkan cahaya.",
        "Jauhkan sedikit, jangan terlalu dekat ke kamera.",
        "Hindari cahaya lampu langsung ke badge.",
        "Kalau tetap gagal, tekan Cari peserta manual dan cari pakai nama atau instansi.",
      ],
    },
    {
      title: "Peserta tidak ditemukan saat dicari",
      steps: [
        "Coba potongan nama saja, misal \"budi\" bukan nama lengkap.",
        "Coba nama instansi.",
        "Peserta yang baru mendaftar bisa belum tersinkron. Sistem menarik data terbaru setiap 15 menit.",
        "Kalau tetap tidak ada, laporkan ke admin. Jangan buat order dengan peserta lain.",
      ],
    },
    {
      title: "Item spesial tidak bisa dipilih",
      steps: [
        "Baca alasan yang tertulis di bawah nama item. Sistem selalu menyebutkan sebabnya.",
        "\"Sudah diambil\" — peserta sudah mengambil item ini, kuotanya habis.",
        "\"Stok habis\" — jatah item di booth sudah habis.",
        "\"Syarat belum terpenuhi\" — total belanja peserta belum mencapai minimum. Angka yang kurang tertulis di situ.",
        "Ini bukan kerusakan. Order tetap bisa dibuat tanpa item spesial.",
      ],
    },
    {
      title: "Salah input nominal atau salah peserta",
      steps: [
        viaCashier
          ? "Jangan buat order baru sebagai pengganti. Minta kasir mem-void order yang salah."
          : "Tekan tombol Void di baris order tersebut, pada daftar Order booth ini.",
        viaCashier
          ? "Sebutkan nomor order yang salah ke kasir."
          : "Isi alasan void, misal \"salah input nominal\". Alasan wajib dan tercatat.",
        "Setelah di-void, buat order baru dengan data yang benar.",
        "Nomor stiker yang sudah dipakai tidak bisa dipakai lagi. Gunakan stiker berikutnya.",
      ],
    },
    {
      title: "Nomor stiker sudah terpakai",
      steps: [
        "Setiap nomor stiker hanya boleh dipakai sekali, termasuk oleh order yang sudah di-void.",
        "Ambil stiker fisik berikutnya dan isi nomornya.",
        "Jangan menebak nomor. Isi sesuai stiker yang benar-benar ditempel di barang.",
      ],
    },
    {
      title: "Muncul banner merah OFFLINE",
      steps: [
        "JANGAN buat order saat banner merah muncul. Order tidak akan tersimpan.",
        "Tunggu sampai banner hilang sendiri.",
        "Kalau lama tidak hilang, pindah ke area sinyal lebih baik atau ganti ke jaringan lain.",
        "Order yang sudah tersimpan sebelumnya tetap aman.",
      ],
    },
  ];

  if (viaCashier) {
    troubleshooting.splice(4, 0, {
      title: `Order hilang sendiri setelah ${autoVoid} menit`,
      steps: [
        `Order yang belum dibayar lebih dari ${autoVoid} menit otomatis dibatalkan sistem.`,
        "Ini normal, bukan kerusakan. Kuota item spesial peserta kembali tersedia.",
        "Kalau peserta datang terlambat untuk membayar, buat order baru.",
      ],
    });
  }

  const sections: Array<{ id: string; title: string; body: React.ReactNode }> = [
    {
      id: "alur",
      title: role === "booth" ? "Cara membuat order" : "Cara menerima pembayaran",
      body: <ol className="space-y-2.5">{(role === "booth" ? boothFlow : cashierFlow).map((step, index) => <li key={index} className="flex gap-3 text-sm leading-6">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-bold text-white">{index + 1}</span>
        <span>{step}</span>
      </li>)}</ol>,
    },
    ...(role === "booth" ? [{
      id: "status",
      title: "Arti status order",
      body: <ul className="space-y-2 text-sm leading-6">{boothStatus.map((item) => <li key={item} className="border-l-2 border-[var(--line)] pl-3">{item}</li>)}</ul>,
    }] : []),
    {
      id: "masalah",
      title: "Kalau ada masalah",
      body: <div className="space-y-4">{troubleshooting.map((item) => <div key={item.title}>
        <p className="text-sm font-semibold">{item.title}</p>
        <ul className="mt-1.5 space-y-1 text-sm leading-6 text-[var(--ink-muted)]">{item.steps.map((step, index) => <li key={index} className="flex gap-2"><span aria-hidden="true">·</span><span>{step}</span></li>)}</ul>
      </div>)}</div>,
    },
  ];

  return <>
    <button type="button" onClick={() => setOpen(true)} className="flex min-h-11 items-center gap-1.5 border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]" aria-label="Buka panduan">
      <Question size={18} weight="bold" /><span className="hidden sm:inline">Panduan</span>
    </button>

    {open && <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="Panduan operator">
      {/* Klik area gelap ikut menutup: jalan keluar paling mudah ditemukan. */}
      <button type="button" className="flex-1 cursor-default" onClick={() => setOpen(false)} aria-label="Tutup panduan" />
      <div className="flex w-full max-w-lg flex-col overflow-y-auto bg-[var(--surface)] shadow-2xl">
        <header className="sticky top-0 flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Panduan</p>
            <p className="mt-0.5 font-semibold">{role === "booth" ? "Admin Booth" : "Kasir"}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-1.5 border border-[var(--line)] px-3 text-sm font-semibold hover:border-[var(--brand)]"><X size={17} /> Tutup</button>
        </header>

        <div className="flex-1 divide-y divide-[var(--line)]">
          {sections.map((section) => {
            const expanded = openSection === section.id;
            return <div key={section.id}>
              <button type="button" onClick={() => setOpenSection(expanded ? null : section.id)} className="flex min-h-14 w-full items-center justify-between gap-3 px-5 text-left text-sm font-semibold hover:bg-[var(--surface-muted)]" aria-expanded={expanded}>
                {section.title}
                <CaretDown size={16} weight="bold" className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
              {expanded && <div className="px-5 pb-5">{section.body}</div>}
            </div>;
          })}
        </div>

        <footer className="sticky bottom-0 border-t border-[var(--line)] bg-[var(--surface-muted)] px-5 py-4">
          <Link href="/panduan" target="_blank" className="flex min-h-12 items-center justify-center gap-2 border border-[var(--line)] bg-[var(--surface)] text-sm font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]">
            <Printer size={18} /> Buka versi cetak
          </Link>
          <p className="mt-2 text-center text-[11px] text-[var(--ink-muted)]">Cetak dan letakkan di meja booth untuk dibaca saat HP sedang dipakai.</p>
        </footer>
      </div>
    </div>}
  </>;
}
