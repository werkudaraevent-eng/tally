"use client";

import { WarningCircle } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, TextField } from "@/components/m3";

/**
 * Langkah kedua masuk admin: kode 6 digit dari aplikasi authenticator, atau
 * satu kode cadangan bila HP tidak ada. Pola GitHub/Google: satu kolom, satu
 * tautan untuk beralih ke kode cadangan, satu tautan untuk mulai lagi.
 */
export function LangkahKode({ onBatal }: { onBatal: () => void }) {
  const [cadangan, setCadangan] = useState(false);
  const [kode, setKode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function kirim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cadangan && !/^\d{6}$/.test(kode)) { setError("Enter the 6-digit code from your authenticator app."); return; }
    if (cadangan && kode.trim().length < 8) { setError("Enter one of your recovery codes, for example 7f3k-q9mx."); return; }
    setPending(true);
    setError("");
    let response: Response;
    try {
      response = await fetch("/api/auth/login/kode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cadangan ? { recovery_code: kode } : { code: kode }),
      });
    } catch {
      setPending(false);
      setError("Connection failed. Check your network and try again.");
      return;
    }
    if (response.ok) { router.push("/events"); return; }
    const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    setPending(false);
    setKode("");
    if (body?.error?.code === "SIGN_IN_EXPIRED") { onBatal(); return; }
    setError(body?.error?.message ?? "That code didn't work. Try again.");
  }

  return (
    <>
      <h1 className="text-center text-[1.75rem] font-semibold leading-9 tracking-[-0.01em]">
        {cadangan ? "Use a recovery code" : "Enter your code"}
      </h1>
      <p className="mt-2 text-center text-body-medium text-on-surface-variant">
        {cadangan
          ? "Each recovery code works once. You saved them when you set up your authenticator."
          : "Open your authenticator app and enter the 6-digit code for Tally."}
      </p>

      <form className="mt-7" onSubmit={kirim} noValidate>
        <TextField
          key={cadangan ? "cadangan" : "kode"}
          label={cadangan ? "Recovery code" : "Code"}
          name={cadangan ? "recovery-code" : "one-time-code"}
          autoComplete={cadangan ? "off" : "one-time-code"}
          inputMode={cadangan ? "text" : "numeric"}
          autoFocus
          maxLength={cadangan ? 20 : 6}
          inputClassName={cadangan ? "m3-field-auth" : "m3-field-auth tracking-[0.35em]"}
          value={kode}
          onChange={(event) => { setKode(cadangan ? event.target.value : event.target.value.replace(/\D/g, "")); setError(""); }}
          aria-invalid={error ? true : undefined}
        />

        {error ? (
          <p role="alert" className="mt-5 flex items-start gap-2 rounded-lg border border-error-soft-outline bg-error-soft px-3 py-2.5 text-body-small text-error">
            <WarningCircle size={16} className="mt-px shrink-0" />
            {error}
          </p>
        ) : null}

        <Button type="submit" className="mt-5 h-11" block loading={pending}>
          {pending ? "Checking…" : "Verify"}
        </Button>
      </form>

      <div className="mt-4 flex flex-col items-center gap-1">
        <Button variant="text" size="sm" onClick={() => { setCadangan((nilai) => !nilai); setKode(""); setError(""); }}>
          {cadangan ? "Use the authenticator app instead" : "Use a recovery code"}
        </Button>
        <Button variant="text" size="sm" onClick={onBatal}>Start again</Button>
      </div>
    </>
  );
}
