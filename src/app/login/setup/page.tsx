"use client";

import { Check, Copy, DownloadSimple, Eye, EyeSlash, Storefront, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, IconButton, TextField } from "@/components/m3";
import { useToast } from "@/components/toast";

/**
 * Setup wajib admin/super admin: kata sandi + aplikasi authenticator, lalu
 * kode cadangan. Datang dari /login setelah PIN lama benar (atau setelah super
 * admin mereset PIN-nya). Tanpa cookie pending yang masih hidup, halaman ini
 * mengarahkan kembali ke /login.
 *
 * Satu halaman, dua bagian bernomor (memang berurutan), satu tombol. Kode
 * cadangan muncul SETELAH tersimpan, sekali saja, seperti GitHub dan Google.
 */
type Data = { username: string; secret: string; qr_svg: string };

export default function SetupPage() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [gagalMuat, setGagalMuat] = useState("");
  const [sandi, setSandi] = useState("");
  const [ulang, setUlang] = useState("");
  const [lihat, setLihat] = useState(false);
  const [kode, setKode] = useState("");
  const [galat, setGalat] = useState<{ sandi?: string; ulang?: string; kode?: string; umum?: string }>({});
  const [pending, setPending] = useState(false);
  const [cadangan, setCadangan] = useState<string[] | null>(null);
  const [tersimpan, setTersimpan] = useState(false);

  useEffect(() => {
    let batal = false;
    fetch("/api/auth/setup", { cache: "no-store" })
      .then(async (res) => {
        if (batal) return;
        if (res.status === 401) { router.replace("/login"); return; }
        if (!res.ok) { setGagalMuat("Couldn't start the set-up. Reload the page to try again."); return; }
        setData(await res.json());
      })
      .catch(() => { if (!batal) setGagalMuat("Connection failed. Check your network and reload."); });
    return () => { batal = true; };
  }, [router]);

  async function simpan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const baru: typeof galat = {};
    if (sandi.length < 12) baru.sandi = "Use at least 12 characters.";
    if (ulang !== sandi) baru.ulang = "The passwords don't match.";
    if (!/^\d{6}$/.test(kode)) baru.kode = "Enter the 6-digit code your app shows for Tally.";
    setGalat(baru);
    if (Object.keys(baru).length) return;
    setPending(true);
    let res: Response;
    try {
      res = await fetch("/api/auth/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: sandi, code: kode }) });
    } catch {
      setPending(false);
      setGalat({ umum: "Connection failed. Check your network and try again." });
      return;
    }
    const body = await res.json().catch(() => null) as { recovery_codes?: string[]; error?: { code?: string; message?: string; details?: { password?: string; code?: string } } } | null;
    setPending(false);
    if (res.status === 401) { router.replace("/login"); return; }
    if (!res.ok || !body?.recovery_codes) {
      const d = body?.error?.details;
      if (d?.code) setKode("");
      setGalat(d ? { sandi: d.password, kode: d.code } : { umum: body?.error?.message ?? "Couldn't save. Try again." });
      return;
    }
    setCadangan(body.recovery_codes);
  }

  function teksCadangan() {
    return `Tally recovery codes for ${data?.username ?? ""}\nEach code works once.\n\n${(cadangan ?? []).join("\n")}\n`;
  }

  async function salin() {
    try {
      await navigator.clipboard.writeText(teksCadangan());
      toast.success("Copied", "Recovery codes copied.");
    } catch {
      toast.error("Couldn't copy", "Select the codes and copy them by hand.");
    }
  }

  function unduh() {
    const url = URL.createObjectURL(new Blob([teksCadangan()], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "tally-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main lang="en" className="press min-h-dvh bg-surface-container-lowest px-4 pb-16 pt-6 text-on-surface sm:px-10">
      <div className="flex items-center gap-2">
        <Storefront size={20} className="text-on-surface-variant" />
        <span className="text-[0.9375rem] font-medium">Tally</span>
      </div>

      <div className="mx-auto mt-10 w-full max-w-[440px]">
        {cadangan ? (
          <>
            <h1 className="text-[1.75rem] font-semibold leading-9 tracking-[-0.01em]">Save your recovery codes</h1>
            <p className="mt-2 text-body-medium text-on-surface-variant">
              If you lose your phone, each code signs you in once. Keep them somewhere safe, away from this device. This is the only time Tally shows them.
            </p>
            <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-outline-variant bg-surface-container-low p-4 font-mono text-body-large" aria-label="Recovery codes">
              {cadangan.map((k) => <li key={k}>{k}</li>)}
            </ul>
            <div className="mt-4 flex gap-2">
              <Button variant="outlined" size="sm" icon={<Copy size={16} />} onClick={salin}>Copy</Button>
              <Button variant="outlined" size="sm" icon={<DownloadSimple size={16} />} onClick={unduh}>Download .txt</Button>
            </div>
            <label className="mt-6 flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={tersimpan} onChange={(e) => setTersimpan(e.target.checked)} className="size-4 shrink-0 rounded-xs accent-[var(--md-sys-color-primary)]" />
              <span className="text-body-medium">I&apos;ve saved these codes</span>
            </label>
            <Button className="mt-5 h-11" block disabled={!tersimpan} onClick={() => router.push("/events")}>Continue to Tally</Button>
          </>
        ) : (
          <>
            <h1 className="text-[1.75rem] font-semibold leading-9 tracking-[-0.01em]">Secure your admin account</h1>
            <p className="mt-2 text-body-medium text-on-surface-variant">
              Admin accounts now sign in with a password and a code from an authenticator app. Your PIN stops working once this is done.
            </p>

            {gagalMuat ? (
              <p role="alert" className="mt-6 flex items-start gap-2 rounded-lg border border-error-soft-outline bg-error-soft px-3 py-2.5 text-body-small text-error">
                <WarningCircle size={16} className="mt-px shrink-0" />{gagalMuat}
              </p>
            ) : null}

            <form className="mt-8" onSubmit={simpan} noValidate>
              <h2 className="text-title-medium">1. Create a password</h2>
              {data ? <input type="text" name="username" autoComplete="username" value={data.username} readOnly hidden /> : null}
              <TextField
                className="mt-3"
                label="New password"
                name="new-password"
                type={lihat ? "text" : "password"}
                autoComplete="new-password"
                maxLength={128}
                inputClassName="m3-field-auth"
                value={sandi}
                onChange={(e) => { setSandi(e.target.value); setGalat((g) => ({ ...g, sandi: undefined })); }}
                error={galat.sandi}
                hint={galat.sandi ? undefined : "At least 12 characters. A short sentence works well."}
                trailing={<IconButton size="sm" label={lihat ? "Hide" : "Show"} onClick={() => setLihat((v) => !v)}>{lihat ? <EyeSlash size={18} /> : <Eye size={18} />}</IconButton>}
              />
              <TextField
                className="mt-4"
                label="Repeat password"
                name="repeat-password"
                type={lihat ? "text" : "password"}
                autoComplete="new-password"
                maxLength={128}
                inputClassName="m3-field-auth"
                value={ulang}
                onChange={(e) => { setUlang(e.target.value); setGalat((g) => ({ ...g, ulang: undefined })); }}
                error={galat.ulang}
              />

              <h2 className="mt-8 text-title-medium">2. Connect an authenticator app</h2>
              <p className="mt-1 text-body-medium text-on-surface-variant">
                Scan this with Google Authenticator, Microsoft Authenticator, 1Password or a similar app.
              </p>
              <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <div className="size-[192px] shrink-0 rounded-lg border border-outline-variant bg-white p-2">
                  {data ? (
                    <div aria-label={`QR code for the Tally account ${data.username}`} role="img" className="[&>svg]:size-full" dangerouslySetInnerHTML={{ __html: data.qr_svg }} />
                  ) : (
                    <div className="size-full animate-pulse rounded bg-surface-container" aria-label="Loading QR code" />
                  )}
                </div>
                <div className="min-w-0 text-body-small text-on-surface-variant">
                  <p>Can&apos;t scan? Enter this key in the app:</p>
                  <p className="mt-1 font-mono text-body-medium text-on-surface" data-kunci={data?.secret ?? ""}>
                    {data ? data.secret.split(" ").map((grup, i) => <span key={i} className="mr-[1ch] inline-block whitespace-nowrap">{grup}</span>) : "…"}
                  </p>
                </div>
              </div>
              <TextField
                className="mt-4"
                label="6-digit code from the app"
                name="one-time-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                inputClassName="m3-field-auth tracking-[0.35em]"
                value={kode}
                onChange={(e) => { setKode(e.target.value.replace(/\D/g, "")); setGalat((g) => ({ ...g, kode: undefined })); }}
                error={galat.kode}
              />

              {galat.umum ? (
                <p role="alert" className="mt-5 flex items-start gap-2 rounded-lg border border-error-soft-outline bg-error-soft px-3 py-2.5 text-body-small text-error">
                  <WarningCircle size={16} className="mt-px shrink-0" />{galat.umum}
                </p>
              ) : null}

              <Button type="submit" className="mt-6 h-11" block loading={pending} disabled={!data} icon={pending ? undefined : <Check size={16} />}>
                {pending ? "Saving…" : "Turn on two-step sign-in"}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
