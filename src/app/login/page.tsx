"use client";

import { ArrowRight, Eye, EyeSlash, LockKey, QrCode, ShieldCheck, WifiSlash } from "@phosphor-icons/react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";

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
    <main className="flex min-h-dvh flex-col bg-[var(--background)] px-5 text-[var(--ink)] sm:px-8 lg:h-dvh lg:overflow-hidden lg:px-12">
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--line)] py-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--brand)] text-white"><QrCode size={24} weight="bold" /></div>
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--ink-muted)]">Tally</p><p className="text-sm font-semibold">Event Transaction Hub</p></div>
        </header>
        {/* py-4 di mobile: pada iPhone SE (375x667) padding 32px membuat kartu
            melebihi viewport 22px dan memunculkan scroll. */}
        <div className="grid flex-1 items-center gap-8 py-4 sm:py-8 lg:grid-cols-[1fr_minmax(380px,460px)] lg:gap-16 lg:py-6">
          {/* Disembunyikan di mobile: di layar sempit heading raksasa mendorong
              form ke bawah fold, padahal header sudah membawa identitas produk. */}
          <section className="hidden max-w-xl lg:block">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Operator access</p>
            {/* clamp menggantikan text-5xl/sm:text-7xl agar heading menyusut di
                laptop 768px-tinggi, bukan memaksa halaman scroll. */}
            <h1 className="mt-4 text-[clamp(2.5rem,4.4vw,4rem)] font-semibold leading-[0.95] tracking-[-0.055em]">Keep the room moving.</h1>
            <p className="mt-5 max-w-md text-base leading-7 text-[var(--ink-muted)]">Login dengan username dan PIN panitia. Sistem otomatis mengarahkan Anda sesuai peran akun.</p>
            <ul className="mt-8 space-y-3 border-t border-[var(--line)] pt-6 text-sm text-[var(--ink-muted)]">
              <li className="flex items-center gap-3"><ShieldCheck size={20} className="shrink-0 text-[var(--brand)]" /> Role dicek di server pada setiap aksi.</li>
              <li className="flex items-center gap-3"><WifiSlash size={20} className="shrink-0 text-[var(--brand)]" /> Status koneksi selalu terlihat saat bertransaksi.</li>
            </ul>
          </section>
          <div className="w-full border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">Sign in</p><h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">Masuk workspace</h2></div><LockKey size={26} weight="duotone" className="mt-1 shrink-0 text-[var(--brand)]" /></div>
            <form className="mt-6" onSubmit={handleSubmit} noValidate><label htmlFor="username" className="block text-sm font-semibold">Username</label><input id="username" name="username" autoComplete="username" autoFocus value={username} onChange={(event) => { setUsername(event.target.value); setError(""); }} className="mt-2 h-14 w-full border border-[var(--line)] bg-[var(--background)] px-4 text-base outline-none transition-colors focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20" placeholder="username panitia" /><div className="mt-4 flex items-baseline justify-between"><label htmlFor="pin" className="block text-sm font-semibold">PIN 6 digit</label><button type="button" onClick={() => setShowPin((value) => !value)} className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-muted)] transition-colors hover:text-[var(--brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">{showPin ? <EyeSlash size={16} /> : <Eye size={16} />}{showPin ? "Sembunyikan" : "Tampilkan"}</button></div><input id="pin" name="pin" type={showPin ? "text" : "password"} inputMode="numeric" autoComplete="current-password" maxLength={6} value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "")); setError(""); }} placeholder="••••••" className="mt-2 h-16 w-full border border-[var(--line)] bg-[var(--background)] px-5 text-center text-2xl tracking-[0.45em] outline-none transition-colors focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20" aria-describedby={error ? "pin-error" : "pin-help"} aria-invalid={error ? true : undefined} />{error ? <p id="pin-error" className="mt-2 text-sm font-medium text-[var(--danger)]" role="alert">{error}</p> : <p id="pin-help" className="mt-2 text-xs text-[var(--ink-muted)]">Masukkan username dan PIN panitia 6 digit.</p>}<label className="mt-4 flex cursor-pointer items-start gap-3 text-sm"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" /><span><span className="block font-semibold">Ingat saya di device ini</span><span className="mt-0.5 block text-xs text-[var(--ink-muted)]">Sesi bertahan 30 hari. Tanpa dicentang, sesi berlaku 12 jam.</span></span></label><button disabled={pending} type="submit" className="mt-6 flex min-h-16 w-full items-center justify-center gap-3 bg-[var(--brand)] px-5 text-base font-semibold text-white transition-colors hover:bg-[var(--brand-strong)] active:scale-[0.99] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand)]">{pending ? "Memeriksa..." : "Masuk"} {!pending && <ArrowRight size={19} weight="bold" />}</button></form>
          </div>
        </div>
        <footer className="shrink-0 border-t border-[var(--line)] py-4 text-xs text-[var(--ink-muted)]">Akses operator terlindungi.</footer>
      </div>
    </main>
  );
}
