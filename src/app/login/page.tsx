"use client";

import { ArrowSquareOut, Check, Eye, EyeSlash, Storefront, WarningCircle } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { Button, IconButton, TextField } from "@/components/m3";
import { SEPARATOR } from "@/lib/typography";

/**
 * Layar masuk. Dua kolom: formulir di KIRI, panel merek di KANAN.
 *
 * ---- Kenapa formulir di kiri -----------------------------------------------
 *
 * Bukan selera. Mata membaca dari kiri-atas, dan yang dicari orang di layar ini
 * adalah kolom isian — bukan kalimat promosi. Susunan sebelumnya menaruh
 * headline di kiri dan formulir di kanan, sehingga setiap kali layar ini dibuka
 * (puluhan kali semalam, oleh orang yang sama) mata harus melewati satu blok
 * teks yang sudah dihafal sebelum sampai ke kotak yang mau diketik.
 *
 * ---- Kenapa tanpa kartu ----------------------------------------------------
 *
 * Kartu memisahkan sesuatu dari sekitarnya. Di sini tidak ada "sekitar": kolom
 * kirinya kosong kecuali formulir itu sendiri, jadi bingkainya hanya menggambar
 * kotak di dalam kotak.
 *
 * ---- Apa yang dibuang ------------------------------------------------------
 *
 * Eyebrow "Panitia", ikon gembok, dan judul "Akses panitia" mengatakan hal yang
 * sama tiga kali sebelum satu kolom pun terlihat. Yang tersisa satu judul.
 * Pemilih tema juga dilepas: tiga tombol berlabel di sudut layar masuk adalah
 * kontrol yang ditekan sekali seumur pemasangan, dan labelnya terpotong jadi
 * "Tera..." dan "Sist...". Temanya kini mengikuti preferensi sistem, dan bisa
 * diubah dari menu akun setelah masuk.
 */
export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim()) {
      setError("Masukkan username panitia.");
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      setError("PIN harus terdiri dari 6 angka.");
      return;
    }
    setPending(true);
    setError("");

    // Jaringan venue sering putus. Tanpa try/catch, fetch yang gagal membuat
    // tombol terjebak di state "Memproses..." tanpa pesan apa pun.
    let response: Response;
    try {
      response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, pin, remember_me: rememberMe }) });
    } catch {
      setPending(false);
      setError("Koneksi gagal. Periksa jaringan lalu coba lagi.");
      toast.error("Tidak ada koneksi", "Perangkat tidak dapat menghubungi server.");
      return;
    }
    if (!response.ok) {
      setPending(false);
      // Kuncian rate limit dibedakan dari PIN salah.
      //
      // Kalau keduanya menampilkan "Username atau PIN salah", operator yang sedang
      // terkunci akan mencoba PIN lain — padahal PIN-nya mungkin sudah benar — dan
      // menghabiskan seluruh masa tunggu dengan menebak-nebak. Sebutkan lama
      // tunggunya, dan JANGAN kosongkan kolom PIN: isinya tidak bersalah di sini,
      // dan mengosongkannya memaksa pengetikan ulang tanpa alasan.
      if (response.status === 429) {
        const body = await response.json().catch(() => null);
        const message = body?.error?.message ?? "Terlalu banyak percobaan login. Tunggu sebentar, lalu coba lagi.";
        setError(message);
        toast.error("Login dijeda sementara", message);
        return;
      }
      // Hanya PIN yang dikosongkan. Username tetap: ia hampir selalu benar, dan
      // mengetiknya ulang di ponsel adalah hukuman untuk kesalahan yang bukan
      // miliknya.
      setPin("");
      setError("Username atau PIN salah.");
      toast.error("Login gagal", "Username atau PIN salah. Periksa kembali.");
      return;
    }
    // Tidak ada toast sukses di sini, dan itu keputusan yang disengaja.
    //
    // Halaman Acara yang terbuka SUDAH membuktikan login berhasil; notifikasi
    // yang mengulanginya hanya menutupi tombol "Buat event" di pojok kanan atas
    // selama empat detik pertama. Nama akun dan perannya tetap bisa dilihat
    // kapan saja di menu avatar, tempat yang tidak menutupi apa pun.
    //
    // Aturan yang sama berlaku di seluruh aplikasi: toast untuk hasil yang TIDAK
    // terlihat (salin tautan, kirim email, ekspor, sync), untuk simpan otomatis,
    // dan untuk semua kegagalan. Bukan untuk aksi yang hasilnya sudah terpampang.
    //
    // `pending` sengaja TIDAK dikembalikan ke false: navigasi sedang berjalan,
    // dan tombol yang hidup lagi selama perpindahan mengundang klik kedua yang
    // menjalankan bcrypt untuk kedua kalinya.
    router.push("/events");
  }

  const versi = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";

  return (
    <main className="press flex min-h-dvh bg-surface-container-lowest text-on-surface">
      {/* ---- Kolom kiri: formulir -------------------------------------------
          `relative`, karena merek di atas dan versi di bawah duduk pada tepi
          kolomnya sendiri, bukan pada tepi layar. Di bawah lg kolom ini menjadi
          satu-satunya isi halaman. */}
      <div className="relative flex w-full flex-col justify-center px-6 py-16 sm:px-10 lg:w-1/2 lg:py-8">
        <div className="absolute left-6 top-6 flex items-center gap-2 sm:left-10">
          <Storefront size={20} className="text-on-surface-variant" />
          <span className="text-[0.9375rem] font-medium">Tally</span>
        </div>

        {/* Konten formulir dibatasi 380px dan ditengahkan di dalam kolomnya.
            Di ponsel `justify-center` tidak berlaku karena `py-16` sudah menahan
            isinya di atas — layar sempit tidak boleh menaruh kolom isian di
            tengah, karena papan ketik yang muncul akan mendorongnya keluar. */}
        <div className="mx-auto w-full max-w-[380px] max-lg:mt-8">
          <h1 className="text-center text-[1.75rem] font-semibold leading-9 tracking-[-0.01em]">Masuk ke Tally</h1>

          <form className="mt-7" onSubmit={handleSubmit} noValidate>
            <TextField
              label="Username"
              name="username"
              autoComplete="username"
              autoFocus
              inputClassName="m3-field-auth"
              value={username}
              onChange={(event) => { setUsername(event.target.value); setError(""); }}
              aria-invalid={error ? true : undefined}
            />

            <TextField
              className="mt-4"
              label="PIN"
              name="pin"
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              pattern="\d{6}"
              autoComplete="current-password"
              maxLength={6}
              inputClassName="m3-field-auth tracking-[0.35em]"
              value={pin}
              onChange={(event) => { setPin(event.target.value.replace(/\D/g, "")); setError(""); }}
              aria-invalid={error ? true : undefined}
              hint="Masukkan username dan PIN panitia 6 digit."
              trailing={
                <IconButton
                  size="sm"
                  label={showPin ? "Sembunyikan PIN" : "Tampilkan PIN"}
                  onClick={() => setShowPin((value) => !value)}
                >
                  {showPin ? <EyeSlash size={18} /> : <Eye size={18} />}
                </IconButton>
              }
            />

            <label className="mt-4 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="size-4 shrink-0 rounded-xs accent-[var(--md-sys-color-primary)]"
              />
              {/* Bobot biasa, bukan tebal. Ini pilihan, bukan judul — dan label
                  setebal judul membuatnya terbaca sebagai bagian yang wajib
                  dibaca sebelum menekan Masuk. Keterangan masa berlaku sesi
                  turun ke baris kecil supaya barisnya tetap satu tingkat. */}
              <span className="text-body-medium">Ingat saya di perangkat ini</span>
            </label>
            <p className="mt-1 pl-6 text-body-small text-on-surface-variant">
              Sesi bertahan 30 hari. Tanpa dicentang, 12 jam.
            </p>

            {/* Galat sebagai pita tipis DI ATAS tombol, bukan di bawah kolom PIN.
                Di bawah kolom ia bersaing dengan teks bantuan yang sudah ada di
                sana; di atas tombol ia berada tepat di jalur mata yang sedang
                menuju aksi berikutnya. */}
            {error ? (
              <p
                role="alert"
                className="mt-5 flex items-start gap-2 rounded-lg border border-error-soft-outline bg-error-soft px-3 py-2.5 text-body-small text-error"
              >
                <WarningCircle size={16} className="mt-px shrink-0" />
                {error}
              </p>
            ) : null}

            <Button type="submit" className="mt-5 h-11" block loading={pending}>
              {pending ? "Memproses..." : "Masuk"}
            </Button>
          </form>

          <p className="mt-4 text-center text-body-small text-on-surface-variant">
            Lupa PIN? Hubungi admin acara.
          </p>
        </div>

        <p className="absolute inset-x-0 bottom-6 text-center text-body-small text-on-surface-variant">
          Tally v{versi} {SEPARATOR} Akses panitia terlindungi
        </p>
      </div>

      {/* ---- Kolom kanan: panel merek ---------------------------------------
          Satu bidang biru pekat, bukan gradasi. Gradasi di belakang teks putih
          berarti kontrasnya berbeda di setiap titik, dan yang paling terang
          selalu jatuh di bawah ambang. Bidang rata terukur sekali: putih di atas
          #1A56C4 adalah 6,34:1.

          Garis diagonalnya putih 6% — cukup untuk memberi tekstur, terlalu tipis
          untuk mengubah kontras teks di atasnya. */}
      <aside
        className="relative hidden w-1/2 shrink-0 overflow-hidden bg-[var(--auth-brand)] lg:flex lg:items-center"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, rgb(255 255 255 / 0.06) 0 2px, transparent 2px 14px)",
        }}
      >
        <div className="max-w-[480px] p-16 text-white">
          <p className="ed-tracked text-label-medium uppercase text-white/80">Tally</p>
          <p className="mt-6 text-[clamp(2rem,2.6vw,2.5rem)] font-semibold leading-[1.15]">
            Dari pendaftaran sampai panggung.
          </p>
          <p className="mt-4 text-[0.9375rem] leading-6 text-white/80">
            Kelola peserta, registrasi ulang, cetak label, dan layar panggung dalam satu tempat.
          </p>

          <ul className="mt-8 space-y-2.5 text-body-medium text-white/80">
            {[
              "Satu akun untuk semua acara yang diberi akses.",
              "Peran diperiksa di server pada setiap aksi.",
              "Status koneksi selalu terlihat di layar kerja.",
            ].map((butir) => (
              <li key={butir} className="flex items-start gap-2.5">
                <Check size={14} weight="bold" className="mt-1 shrink-0" />
                {butir}
              </li>
            ))}
          </ul>

          {/* Tautannya nyata: /panduan adalah halaman publik yang tidak menuntut
              sesi. Tombol di layar masuk yang mengarah ke halaman berpagar hanya
              memantulkan orang kembali ke sini. */}
          <a
            href="/panduan"
            className="mt-9 inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-body-medium font-medium text-[var(--auth-brand)] transition-opacity duration-150 hover:opacity-90"
          >
            Lihat panduan
            <ArrowSquareOut size={14} />
          </a>
        </div>
      </aside>
    </main>
  );
}
