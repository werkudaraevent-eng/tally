"use client";

import { ArrowRight, CalendarDots, Eye, EyeSlash, LockKey, QrCode, ShieldCheck, WifiSlash } from "@phosphor-icons/react";
import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { Button, IconButton, TextField, ThemeToggle } from "@/components/m3";

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
    // tombol terjebak di state "Memeriksa..." tanpa pesan apa pun.
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
      setPin("");
      setError("Username atau PIN salah.");
      toast.error("Login gagal", "Username atau PIN salah. Periksa kembali.");
      return;
    }
    const result = await response.json().catch(() => null);
    // Status 200 berarti cookie sesi SUDAH disetel, jadi body yang gagal terbaca
    // tidak boleh menghentikan pengalihan. Tanpa cabang ini staf terhenti di layar
    // login padahal sudah masuk, dan menekan Masuk lagi hanya mengulang bcrypt.
    if (!result?.user) {
      router.push("/events");
      return;
    }
    const roleLabel: Record<string, string> = { booth: "Admin Booth", cashier: "Kasir", admin: "Panitia / Admin" };
    toast.success(`Selamat datang, ${result.user.username}`, `Masuk sebagai ${roleLabel[result.user.role] ?? result.user.role}.`);
    router.push("/events");
  }

  return (
    // TIDAK PERNAH `overflow-hidden` pada halaman ini.
    //
    // Versi sebelumnya mengunci `lg:h-dvh lg:overflow-hidden` supaya layar lebar
    // tidak menggulir. Di laptop 768p dengan skala Windows 150%, viewport-nya
    // ~600px tinggi: kartu login terpotong di tombol Masuk dan tidak ada cara
    // menggulirnya. Halaman yang tidak bisa digulir hanya benar bila isinya
    // DIJAMIN muat, dan tinggi viewport tidak pernah bisa dijamin.
    //
    // Sekarang: tinggi minimal satu layar, isi dipusatkan, dan pada viewport
    // pendek (`short:`) jarak serta padding dipangkas supaya kartu tetap muat
    // tanpa gulir di sebagian besar laptop. Kalau toh masih kurang, halaman
    // menggulir — itu keadaan yang bisa dipulihkan pengguna, terpotong tidak.
    //
    // Sapuan tonal di latar: warna merek dicampur ke kanvas dari sudut kanan
    // atas, sama dengan hero halaman acara dan formulir pendaftaran. Statis —
    // ini layar kerja, dan DESIGN.md menempatkannya di lapisan tenang.
    // Sapuan tonal radial dihapus bersama sapuan kembarannya di halaman acara,
    // formulir pendaftaran, dan kartu kode. Halaman ini pintu masuk ruang kerja,
    // dan ruang kerja di baliknya tidak punya satu pun bidang berwarna yang
    // bukan penanda status — pintu yang bercahaya di depan ruangan yang rata
    // membuat keduanya terbaca sebagai dua aplikasi.
    <main className="press flex min-h-dvh flex-col bg-surface px-5 text-on-surface sm:px-8 lg:px-12">
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-outline-variant py-4 short:py-3">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary text-on-primary"><QrCode size={24} weight="bold" /></div>
          <div className="flex-1">
            <p className="text-label-medium font-semibold ed-label text-on-surface-variant">Tally</p>
            <p className="text-title-small font-semibold">Pusat operasional acara</p>
          </div>
          {/* Pemilih tema ada di layar login, bukan hanya di admin: staf booth dan
              kasir tidak pernah membuka admin, dan merekalah yang paling sering
              berpindah antara ruang terang dan ruang panggung yang gelap. */}
          <ThemeToggle className="bg-surface-container" />
        </header>

        {/* py-4 di mobile: pada iPhone SE (375x667) padding 32px membuat kartu
            melebihi viewport 22px dan memunculkan scroll. */}
        <div className="grid flex-1 items-center gap-8 py-4 sm:py-8 lg:grid-cols-[1fr_minmax(380px,460px)] lg:gap-16 lg:py-6 short:py-3">
          {/* Disembunyikan di mobile: di layar sempit heading raksasa mendorong
              form ke bawah fold, padahal header sudah membawa identitas produk. */}
          {/* `rise-in-fast`: satu gerak masuk pendek dan tenang (skema standard),
              sekali saat muat. Layar login dibuka puluhan kali semalam; gerak
              yang lebih dari 300ms di sini adalah gerak yang ditunggu. */}
          <section className="rise-in-fast hidden max-w-xl lg:block">
            {/* Satu bahasa. Sebelumnya "Operator access" dan "Keep the room
                moving." berdiri di antara kalimat Indonesia — dua baris Inggris
                yang tidak dibaca siapa pun kecuali sebagai hiasan. Isinya pun
                warisan masa platform ini hanya sistem kasir. */}
            <p className="text-label-large font-semibold ed-label text-primary">Akses panitia</p>
            {/* clamp menggantikan skala tetap agar heading menyusut di laptop
                768px-tinggi, bukan memaksa halaman scroll. Batas atasnya setara
                display-medium M3. */}
            <h1 className="mt-4 text-[clamp(2.5rem,4.4vw,3.5rem)] font-semibold leading-[1.02] short:text-[clamp(2rem,3.4vw,2.75rem)]">Dari pendaftaran sampai panggung.</h1>
            <p className="mt-5 max-w-md text-body-large text-on-surface-variant">Login dengan username dan PIN panitia. Sistem otomatis mengarahkan Anda sesuai peran akun.</p>
            {/* Butir keterangan dilepas di viewport pendek: kolom kiri tidak
                boleh lebih tinggi daripada kartu, karena kartulah yang
                menentukan apakah halaman perlu digulir. */}
            <ul className="mt-8 space-y-3 border-t border-outline-variant pt-6 text-body-medium text-on-surface-variant short:hidden">
              <li className="flex items-center gap-3"><CalendarDots size={20} className="shrink-0 text-primary" /> Satu akun untuk semua acara yang diberi akses.</li>
              <li className="flex items-center gap-3"><ShieldCheck size={20} className="shrink-0 text-primary" /> Peran dicek di server pada setiap aksi.</li>
              <li className="flex items-center gap-3"><WifiSlash size={20} className="shrink-0 text-primary" /> Status koneksi selalu terlihat di layar kerja.</li>
            </ul>
          </section>

          <div className="rise-in-fast w-full rounded-2xl bg-surface-container p-6 sm:p-8 short:p-5" style={{ "--rise-delay": "60ms" } as CSSProperties}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-label-medium font-semibold ed-label text-on-surface-variant">Panitia</p>
                <h2 className="mt-1.5 text-headline-small font-semibold">Masuk workspace</h2>
              </div>
              <LockKey size={26} weight="duotone" className="mt-1 shrink-0 text-primary" />
            </div>

            <form className="mt-6 short:mt-4" onSubmit={handleSubmit} noValidate>
              <TextField
                label="Username"
                name="username"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(event) => { setUsername(event.target.value); setError(""); }}
                placeholder="username panitia"
              />

              <TextField
                className="mt-4"
                label="PIN 6 digit"
                name="pin"
                size="lg"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={6}
                value={pin}
                onChange={(event) => { setPin(event.target.value.replace(/\D/g, "")); setError(""); }}
                placeholder="••••••"
                error={error || undefined}
                hint="Masukkan username dan PIN panitia 6 digit."
                trailing={
                  <IconButton
                    size="sm"
                    label={showPin ? "Sembunyikan PIN" : "Tampilkan PIN"}
                    onClick={() => setShowPin((value) => !value)}
                  >
                    {showPin ? <EyeSlash size={20} /> : <Eye size={20} />}
                  </IconButton>
                }
              />

              <label className="mt-4 flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--md-sys-color-primary)]" />
                <span>
                  <span className="block text-body-large font-semibold">Ingat saya di device ini</span>
                  <span className="mt-0.5 block text-body-small text-on-surface-variant short:hidden">Sesi bertahan 30 hari. Tanpa dicentang, sesi berlaku 12 jam.</span>
                </span>
              </label>

              {/* `short:min-h-14`: target sentuh 64px milik layar operasional
                  yang dipakai berdiri; login dibuka sambil duduk di laptop, dan
                  di viewport pendek 8px itu selisih antara muat dan menggulir. */}
              <Button
                type="submit"
                className="mt-6 short:mt-4 short:min-h-14"
                size="xl"
                block
                loading={pending}
                trailingIcon={pending ? undefined : <ArrowRight size={20} weight="bold" />}
              >
                {pending ? "Memeriksa..." : "Masuk"}
              </Button>
            </form>
          </div>
        </div>

        <footer className="shrink-0 border-t border-outline-variant py-4 text-body-small text-on-surface-variant short:py-3">Akses panitia terlindungi.</footer>
      </div>
    </main>
  );
}
