"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Gerbang masuk peserta: ketik kode acara, mendarat di halaman voting.
 *
 * Ada berdampingan dengan QR, bukan menggantikannya. QR tetap jalur tercepat;
 * kode ini untuk keadaan yang selalu terjadi di ruangan nyata — duduk terlalu
 * jauh untuk memindai, kamera tidak fokus, atau HP yang menolak membuka
 * pemindai.
 */
export default function JoinClient() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const digits = code.replace(/[^0-9]/g, "");

  async function submit() {
    if (digits.length !== 7) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/join?code=${digits}`, { cache: "no-store" }).catch(() => null);
    if (!response) { setBusy(false); setError("Koneksi terputus. Coba lagi."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setBusy(false);
      setError(body.error?.details?.message ?? body.error?.message ?? "Kode tidak dikenali.");
      return;
    }
    // `busy` sengaja TIDAK dimatikan sebelum pindah halaman: mematikannya
    // membuat tombol hidup kembali selama navigasi berjalan, dan peserta yang
    // mengira belum terjadi apa-apa akan menekannya lagi.
    router.push(`/e/${body.slug}/vote`);
  }

  return <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
    <div className="text-center">
      <p className="text-body-small font-semibold uppercase tracking-[0.2em] text-primary">Gabung acara</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Masukkan kode</h1>
      <p className="mt-2 text-body-medium text-on-surface-variant">Tujuh angka yang tertera di layar panggung.</p>
    </div>

    <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-4">
      <input
        value={code}
        onChange={(event) => { setCode(event.target.value); setError(""); }}
        // `inputMode numeric` memunculkan papan angka di HP tanpa menolak tempelan
        // yang memuat spasi — peserta menyalin "937 1226" apa adanya dari layar.
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        maxLength={12}
        placeholder="1234567"
        aria-label="Kode acara"
        className="rounded-md h-16 w-full border border-outline-variant bg-surface text-center font-mono text-3xl tracking-[0.3em] outline-none focus:border-primary"
      />

      {error && <p role="alert" className="rounded-lg border border-error-soft-outline bg-error-soft p-3 text-body-medium text-error">{error}</p>}

      <button
        type="submit"
        disabled={digits.length !== 7 || busy}
        className="rounded-md min-h-14 w-full bg-primary px-4 text-body-large font-semibold text-on-primary disabled:opacity-40"
      >
        {busy ? "Mencari acara…" : "Gabung"}
      </button>
    </form>

    <p className="text-center text-body-small text-on-surface-variant">
      Bisa juga langsung memindai QR di layar panggung.
    </p>
  </main>;
}
