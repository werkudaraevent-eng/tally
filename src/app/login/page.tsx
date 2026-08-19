"use client";

import { ArrowRight, Eye, EyeSlash, LockKey, QrCode, ShieldCheck, WifiSlash } from "@phosphor-icons/react";
import { FormEvent, useState } from "react";
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
    // Sebelumnya `main` memakai min-h-dvh DAN anaknya memakai
    // min-h-[calc(100dvh-2.5rem)] di atas padding py-5 + py-12, jadi tinggi
    // total selalu melebihi viewport dan memaksa scroll. Sekarang tinggi
    // dikunci ke layar dan hanya viewport pendek yang boleh scroll.
    <main className="flex min-h-dvh flex-col bg-surface px-5 text-on-surface sm:px-8 lg:h-dvh lg:overflow-hidden lg:px-12">
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-outline-variant py-4">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary text-on-primary"><QrCode size={24} weight="bold" /></div>
          <div className="flex-1">
            <p className="text-label-medium font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Tally</p>
            <p className="text-title-small font-semibold">Event Transaction Hub</p>
          </div>
          {/* Pemilih tema ada di layar login, bukan hanya di admin: staf booth dan
              kasir tidak pernah membuka admin, dan merekalah yang paling sering
              berpindah antara ruang terang dan ruang panggung yang gelap. */}
          <ThemeToggle />
        </header>

        {/* py-4 di mobile: pada iPhone SE (375x667) padding 32px membuat kartu
            melebihi viewport 22px dan memunculkan scroll. */}
        <div className="grid flex-1 items-center gap-8 py-4 sm:py-8 lg:grid-cols-[1fr_minmax(380px,460px)] lg:gap-16 lg:py-6">
          {/* Disembunyikan di mobile: di layar sempit heading raksasa mendorong
              form ke bawah fold, padahal header sudah membawa identitas produk. */}
          <section className="hidden max-w-xl lg:block">
            <p className="text-label-large font-semibold uppercase tracking-[0.18em] text-primary">Operator access</p>
            {/* clamp menggantikan skala tetap agar heading menyusut di laptop
                768px-tinggi, bukan memaksa halaman scroll. Batas atasnya setara
                display-medium M3. */}
            <h1 className="mt-4 text-[clamp(2.5rem,4.4vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.03em]">Keep the room moving.</h1>
            <p className="mt-5 max-w-md text-body-large text-on-surface-variant">Login dengan username dan PIN panitia. Sistem otomatis mengarahkan Anda sesuai peran akun.</p>
            <ul className="mt-8 space-y-3 border-t border-outline-variant pt-6 text-body-medium text-on-surface-variant">
              <li className="flex items-center gap-3"><ShieldCheck size={20} className="shrink-0 text-primary" /> Role dicek di server pada setiap aksi.</li>
              <li className="flex items-center gap-3"><WifiSlash size={20} className="shrink-0 text-primary" /> Status koneksi selalu terlihat saat bertransaksi.</li>
            </ul>
          </section>

          <div className="w-full rounded-2xl bg-surface-container p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-label-medium font-semibold uppercase tracking-[0.16em] text-on-surface-variant">Sign in</p>
                <h2 className="mt-1.5 text-headline-small font-semibold tracking-tight">Masuk workspace</h2>
              </div>
              <LockKey size={26} weight="duotone" className="mt-1 shrink-0 text-primary" />
            </div>

            <form className="mt-6" onSubmit={handleSubmit} noValidate>
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
                  <span className="mt-0.5 block text-body-small text-on-surface-variant">Sesi bertahan 30 hari. Tanpa dicentang, sesi berlaku 12 jam.</span>
                </span>
              </label>

              <Button
                type="submit"
                className="mt-6"
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

        <footer className="shrink-0 border-t border-outline-variant py-4 text-body-small text-on-surface-variant">Akses operator terlindungi.</footer>
      </div>
    </main>
  );
}
