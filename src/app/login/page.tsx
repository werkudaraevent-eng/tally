"use client";

import { ArrowRight, LockKey, QrCode, ShieldCheck } from "@phosphor-icons/react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { roleRedirects } from "@/lib/auth/roles";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
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
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, pin, remember_me: rememberMe }) });
    if (!response.ok) {
      setPending(false);
      setError("Username atau PIN salah.");
      toast.error("Login gagal", "Username atau PIN salah. Periksa kembali.");
      return;
    }
    const result = await response.json();
    const roleLabel: Record<string, string> = { booth: "Admin Booth", cashier: "Kasir", admin: "Panitia / Admin" };
    toast.success(`Selamat datang, ${result.user.username}`, `Masuk sebagai ${roleLabel[result.user.role] ?? result.user.role}.`);
    const destination = roleRedirects[result.user.role as keyof typeof roleRedirects] ?? "/booth";
    router.push(destination);
  }

  return (
    <main className="min-h-dvh bg-[var(--background)] px-5 py-5 text-[var(--ink)] sm:px-8 lg:px-12">
      <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] max-w-[1440px] flex-col">
        <header className="flex items-center gap-3 border-b border-[var(--line)] pb-5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--brand)] text-white"><QrCode size={24} weight="bold" /></div>
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--ink-muted)]">Tally</p><p className="text-sm font-semibold">Event Transaction Hub</p></div>
        </header>
        <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24">
          <div className="max-w-lg"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Operator access</p><h1 className="mt-5 text-5xl font-semibold leading-[0.95] tracking-[-0.07em] sm:text-7xl">Keep the room moving.</h1><p className="mt-6 text-base leading-7 text-[var(--ink-muted)]">Login dengan username dan PIN panitia. Sistem otomatis mengarahkan Anda sesuai peran akun.</p><div className="mt-10 flex items-center gap-3 border-t border-[var(--line)] pt-5 text-sm text-[var(--ink-muted)]"><ShieldCheck size={22} className="text-[var(--brand)]" /> Role dicek di server pada setiap aksi.</div></div>
          <div className="max-w-xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8 lg:p-10">
            <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">Sign in</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Masuk workspace</h2></div><LockKey size={28} weight="duotone" className="text-[var(--brand)]" /></div>
            <form className="mt-8" onSubmit={handleSubmit}><label htmlFor="username" className="text-sm font-semibold">Username</label><input id="username" name="username" autoComplete="username" value={username} onChange={(event) => { setUsername(event.target.value); setError(""); }} className="mt-2 h-14 w-full border border-[var(--line)] bg-[var(--background)] px-4 outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20" placeholder="username panitia" /><label htmlFor="pin" className="mt-5 block text-sm font-semibold">PIN 6 digit</label><input id="pin" name="pin" inputMode="numeric" autoComplete="current-password" maxLength={6} value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "")); setError(""); }} placeholder="••••••" className="mt-2 h-16 w-full border border-[var(--line)] bg-[var(--background)] px-5 text-center text-3xl tracking-[0.5em] outline-none transition-colors focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20" aria-describedby={error ? "pin-error" : "pin-help"} />{error ? <p id="pin-error" className="mt-2 text-sm text-[var(--danger)]" role="alert">{error}</p> : <p id="pin-help" className="mt-2 text-xs text-[var(--ink-muted)]">Masukkan username dan PIN panitia 6 digit.</p>}<label className="mt-5 flex cursor-pointer items-start gap-3 text-sm"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" /><span><span className="block font-semibold">Ingat saya di device ini</span><span className="mt-0.5 block text-xs text-[var(--ink-muted)]">Sesi bertahan 30 hari. Tanpa dicentang, sesi berlaku 12 jam.</span></span></label><button disabled={pending} type="submit" className="mt-7 flex min-h-16 w-full items-center justify-center gap-3 bg-[var(--brand)] px-5 text-base font-semibold text-white transition-colors hover:bg-[var(--brand-strong)] active:scale-[0.99] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand)]">{pending ? "Memeriksa..." : "Masuk"} {!pending && <ArrowRight size={19} weight="bold" />}</button></form>
          </div>
        </div>
        <footer className="border-t border-[var(--line)] py-5 text-xs text-[var(--ink-muted)]">Akses operator terlindungi.</footer>
      </div>
    </main>
  );
}
