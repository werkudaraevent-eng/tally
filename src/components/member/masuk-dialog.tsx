"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
import { X } from "@phosphor-icons/react";
import { REG_CONTROL } from "@/components/registration-field-input";
import { kirimMasuk, type MasukMode } from "@/app/masuk/masuk-client";

/**
 * Masuk area peserta sebagai dialog di atas halaman acara (tata letak Modern).
 *
 * Login peserta hanya dua kolom, jadi ia tidak perlu halaman sendiri: tamu
 * tetap melihat acaranya di belakang dialog. Di layar < 600px dialognya layar
 * penuh (M3 full-screen dialog), karena dialog kecil di ponsel menyisakan
 * ruang sempit begitu papan ketik terbuka.
 *
 * Alamatnya tetap `/e/<slug>/masuk`: tautan di email, "buat kata sandi"
 * (`?mode=aktifkan`), dan pengalihan saat sesi habis mendarat di halaman acara
 * dengan dialog ini sudah terbuka (src/app/masuk/page.tsx, `awal`).
 *
 * Riwayat peramban: membuka dialog menambah satu entri `/masuk`, jadi tombol
 * Kembali menutup dialog, bukan meninggalkan situs. Dibuka langsung dari
 * tautan, entri sekarang diganti alamat halaman acara lalu `/masuk` ditumpuk
 * di atasnya, dengan hasil yang sama.
 *
 * Pemicunya tautan biasa ke `masukUrl` di mana pun di halaman (bilah atas,
 * kaki). Tanpa JavaScript tautan itu tetap membuka `/masuk` sebagai halaman.
 *
 * `<dialog>` bawaan dengan showModal(): fokus terkurung di dalam, isi di
 * belakangnya inert, Esc menutup. Logika masuk sama dengan halaman /masuk
 * (kirimMasuk).
 */

const LABEL = "block text-label-large font-semibold";
// Kolom sama dengan formulir pendaftaran (REG_CONTROL: 50px, sudut 12px).
// Penanda fokusnya cincin 2px warna primer acara, seperti halaman /masuk.
// Cincin fokus global (:focus-visible di globals.css, tanpa layer) mengalahkan
// utilitas Tailwind, jadi penimpanya memakai `!`.
const KOLOM = `${REG_CONTROL} font-normal focus-visible:outline-none! focus-visible:shadow-[0_0_0_2px_var(--reg-primary)]! aria-invalid:border-[var(--reg-error)] aria-invalid:focus-visible:shadow-[0_0_0_2px_var(--reg-error)]!`;
const TAUTAN = "inline-flex min-h-11 items-center font-semibold text-[var(--reg-primary)] underline-offset-4 hover:underline";

export function MasukDialog({
  slug,
  masukUrl,
  halamanUrl,
  keterangan,
  minPassword,
  awal = null,
}: {
  slug: string;
  /** `/e/<slug>/masuk`: alamat dialog, juga href tautan pemicunya. */
  masukUrl: string;
  /** Alamat halaman acara, tujuan saat dialog yang dibuka langsung ditutup. */
  halamanUrl: string;
  /** Nama acara dan tanggal, di bawah judul. */
  keterangan: string;
  minPassword: number;
  /** Terbuka sejak dimuat (halaman /masuk), dengan mode ini. */
  awal?: MasukMode | null;
}) {
  const judulId = useId();
  const galatId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const kodeRef = useRef<HTMLInputElement>(null);
  const pemicuRef = useRef<HTMLElement | null>(null);
  const galatRef = useRef<HTMLParagraphElement>(null);

  const [terbuka, setTerbuka] = useState(awal !== null);
  const [mode, setMode] = useState<MasukMode>(awal ?? "masuk");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [galat, setGalat] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const buka = useCallback((dengan: MasukMode) => {
    setMode(dengan);
    setGalat("");
    setTerbuka(true);
  }, []);

  // Dialog terbuka = alamatnya /masuk, dan di bawahnya selalu ada entri
  // halaman acara (lihat efek berikut dan `klik`). Menutup = mundur satu
  // entri; popstate di bawah yang menutup dialognya.
  const tertutup = useCallback(() => {
    setTerbuka(false);
    setPassword("");
    setGalat("");
    setSibuk(false);
  }, []);
  const tutup = useCallback(() => {
    if (window.location.pathname === masukUrl) window.history.back();
    else tertutup();
  }, [masukUrl, tertutup]);

  // Dibuka langsung dari tautan: halaman acara di bawah, /masuk di atasnya.
  // Ref, bukan state: Strict Mode menjalankan efek dua kali saat dev.
  const riwayatDisiapkan = useRef(false);
  useEffect(() => {
    if (awal === null || riwayatDisiapkan.current) return;
    riwayatDisiapkan.current = true;
    const alamat = window.location.pathname + window.location.search;
    window.history.replaceState(null, "", halamanUrl);
    window.history.pushState(null, "", alamat);
  }, [awal, halamanUrl]);

  // Tautan ke /masuk di halaman ini membuka dialog. Fase capture di document,
  // sebelum <Link> Next.js menangkap klik dan bernavigasi.
  useEffect(() => {
    function klik(event: globalThis.MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const tautan = (event.target as Element | null)?.closest?.("a[href]");
      if (!tautan || tautan.getAttribute("href") !== masukUrl) return;
      event.preventDefault();
      event.stopPropagation();
      pemicuRef.current = tautan as HTMLElement;
      window.history.pushState(null, "", masukUrl);
      buka("masuk");
    }
    function riwayat() {
      if (window.location.pathname === masukUrl) setTerbuka(true);
      else tertutup();
    }
    document.addEventListener("click", klik, true);
    window.addEventListener("popstate", riwayat);
    return () => {
      document.removeEventListener("click", klik, true);
      window.removeEventListener("popstate", riwayat);
    };
  }, [buka, masukUrl, tertutup]);

  // Buka/tutup <dialog>, kunci gulir di belakangnya, kembalikan fokus.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const akar = document.documentElement;
    if (terbuka) {
      if (!dialog.open) dialog.showModal();
      // Kunci gulir. <html> sudah memakai scrollbar-gutter: stable (globals.css),
      // jadi halaman di belakang tidak bergeser saat batang gulirnya hilang.
      const sebelum = akar.style.overflow;
      akar.style.overflow = "hidden";
      emailRef.current?.focus();
      return () => {
        akar.style.overflow = sebelum;
      };
    }
    if (dialog.open) dialog.close();
    const pemicu = pemicuRef.current ?? document.querySelector<HTMLElement>(`a[href="${masukUrl}"]`);
    pemicu?.focus();
    pemicuRef.current = null;
    return undefined;
  }, [terbuka, masukUrl]);

  // Pesan galat di atas formulir; di layar pendek isi bisa sudah tergulir ke
  // tombol, jadi pesannya digulir ke tampilan.
  useEffect(() => {
    if (galat) galatRef.current?.scrollIntoView({ block: "nearest" });
  }, [galat]);

  function ganti(next: MasukMode) {
    setMode(next);
    setGalat("");
    setPassword("");
    // Mode ikut di alamat, supaya muat ulang dan salin tautan mendarat di mode
    // yang sama. Diganti, bukan ditumpuk: Kembali tetap menutup dialog.
    if (window.location.pathname === masukUrl) {
      window.history.replaceState(window.history.state, "", next === "aktifkan" ? `${masukUrl}?mode=aktifkan` : masukUrl);
    }
    // Tombol yang diklik hilang bersama modenya; fokus pindah ke kolom yang
    // perlu diisi berikutnya.
    requestAnimationFrame(() => (next === "aktifkan" ? kodeRef.current : emailRef.current)?.focus());
  }

  async function kirim(event: FormEvent) {
    event.preventDefault();
    setGalat("");
    setSibuk(true);
    const hasil = await kirimMasuk(slug, mode, { email, password, code });
    if (hasil.ok) {
      window.location.assign(`/e/${slug}/peserta`);
      return;
    }
    setSibuk(false);
    setGalat(hasil.pesan);
  }

  // Klik di luar kotak (pada ::backdrop, yang target kliknya <dialog>) menutup
  // mode Masuk, tapi tidak bila sudah ada yang diketik atau sedang membuat
  // kata sandi: salah klik tidak boleh membuang isian.
  function klikLatar(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    if (mode === "masuk" && !email && !password) tutup();
  }

  // showModal() membuat isi di belakang inert, tetapi Tab dari elemen terakhir
  // tetap keluar ke bilah peramban. Fokus diputar di dalam dialog.
  function kurungTab(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const daftar = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href]"),
    );
    const pertama = daftar[0];
    const terakhir = daftar[daftar.length - 1];
    if (event.shiftKey && document.activeElement === pertama) {
      event.preventDefault();
      terakhir?.focus();
    } else if (!event.shiftKey && document.activeElement === terakhir) {
      event.preventDefault();
      pertama?.focus();
    }
  }

  const invalid = galat ? true : undefined;
  const describedGalat = galat ? galatId : undefined;
  const judul = mode === "masuk" ? "Masuk area peserta" : "Buat kata sandi";

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={judulId}
      onCancel={(event) => {
        event.preventDefault();
        tutup();
      }}
      onClick={klikLatar}
      onKeyDown={kurungTab}
      // Ponsel (< 600px): layar penuh, bilah atas 64px tetap di tempat dan hanya
      // isinya yang bergulir, supaya tombol bisa digulir ke atas papan ketik.
      // Lebih lebar: kotak 440px bersudut kartu situs (rounded-lg, 16px), kepala
      // tetap, isi bergulir bila layar pendek.
      className="m-0 h-dvh max-h-none w-full max-w-none flex-col overflow-hidden bg-[var(--reg-surface)] p-0 text-[var(--reg-on-surface)] backdrop:bg-black/50 open:flex min-[600px]:m-auto min-[600px]:h-fit min-[600px]:max-h-[calc(100dvh-32px)] min-[600px]:w-[440px] min-[600px]:rounded-lg min-[600px]:shadow-[0_8px_24px_rgb(0_0_0/0.2)]"
    >
      <div className="flex h-16 shrink-0 items-center gap-1 px-2 min-[600px]:h-auto min-[600px]:items-start min-[600px]:justify-between min-[600px]:gap-2 min-[600px]:pl-8 min-[600px]:pr-4 min-[600px]:pt-5">
        <h2
          id={judulId}
          className="order-last min-w-0 text-[22px] font-semibold leading-7 [font-family:var(--landing-heading)] min-[600px]:order-first min-[600px]:pt-2 min-[600px]:text-[28px] min-[600px]:leading-9 min-[600px]:tracking-[-0.02em]"
        >
          {judul}
        </h2>
        {/* ✕ di kiri pada layar penuh (M3), di kanan atas pada kotak dialog. */}
        <button
          type="button"
          onClick={tutup}
          aria-label="Tutup"
          className="m3-state inline-flex size-12 shrink-0 items-center justify-center rounded-full text-[var(--reg-on-surface-variant)]"
        >
          <X size={24} aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 scroll-pb-8 overflow-y-auto overscroll-contain px-5 pb-8 min-[600px]:px-8 min-[600px]:pb-7">
        <p className="text-body-medium text-[var(--reg-on-surface-variant)]">{keterangan}</p>
        {mode === "aktifkan" ? (
          <p className="mt-2 text-body-medium text-[var(--reg-on-surface-variant)]">
            Pakai kode peserta dari email undangan. Juga untuk lupa kata sandi.
          </p>
        ) : null}

        <form onSubmit={kirim} className="mt-3 flex flex-col">
          {galat ? (
            <p ref={galatRef} id={galatId} role="alert" className="mt-2 rounded-md bg-[var(--reg-error-soft)] px-4 py-3 text-body-medium text-[var(--reg-on-error-soft)]">
              {galat}
            </p>
          ) : null}

          <label className={`${LABEL} mt-4`}>
            Email pendaftaran
            <input
              ref={emailRef}
              type="email"
              name="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="nama@perusahaan.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={invalid}
              aria-describedby={describedGalat}
              className={KOLOM}
            />
          </label>

          {mode === "aktifkan" ? (
            <label className={`${LABEL} mt-4`}>
              Kode peserta
              <input
                ref={kodeRef}
                name="code"
                required
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="mis. REG123456"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                aria-invalid={invalid}
                aria-describedby={describedGalat}
                className={`${KOLOM} uppercase tracking-[0.06em] placeholder:normal-case placeholder:tracking-normal`}
              />
            </label>
          ) : null}

          {/* "Lupa kata sandi?" di LUAR label: tombol di dalam <label> ikut
              menjadi nama kolom bagi pembaca layar. Baris label setinggi
              tombolnya (44px), jadi jaraknya dari kolom di atas lebih kecil. */}
          <div className="mt-1">
            <div className="flex min-h-11 items-end justify-between gap-4">
              <label htmlFor={`${judulId}-sandi`} className={LABEL}>
                {mode === "masuk" ? "Kata sandi" : "Kata sandi baru"}
              </label>
              {mode === "masuk" ? (
                <button type="button" onClick={() => ganti("aktifkan")} className={`-mb-3 text-label-large ${TAUTAN}`}>
                  Lupa kata sandi?
                </button>
              ) : null}
            </div>
            <input
              id={`${judulId}-sandi`}
              type="password"
              name="password"
              required
              minLength={mode === "aktifkan" ? minPassword : undefined}
              autoComplete={mode === "masuk" ? "current-password" : "new-password"}
              enterKeyHint="go"
              aria-invalid={invalid}
              aria-describedby={[mode === "aktifkan" ? `${judulId}-catatan` : null, describedGalat].filter(Boolean).join(" ") || undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={KOLOM}
            />
            {mode === "aktifkan" ? (
              <span id={`${judulId}-catatan`} className="mt-2 block text-body-small text-[var(--reg-on-surface-variant)]">
                Minimal {minPassword} karakter.
              </span>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={sibuk}
            className="m3-state mt-6 min-h-[52px] rounded-md bg-[var(--reg-primary)] px-5 text-title-medium font-semibold text-[var(--reg-on-primary)] disabled:opacity-60"
            style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}
          >
            {sibuk ? "Memproses..." : mode === "masuk" ? "Masuk" : "Simpan kata sandi dan masuk"}
          </button>
        </form>

        <p className="mt-5 flex flex-wrap items-center gap-x-1 border-t border-[var(--reg-outline-variant)] pt-3 text-body-medium text-[var(--reg-on-surface-variant)]">
          <span>{mode === "masuk" ? "Pertama kali masuk?" : "Sudah punya kata sandi?"}</span>
          <button type="button" onClick={() => ganti(mode === "masuk" ? "aktifkan" : "masuk")} className={`text-left ${TAUTAN}`}>
            {mode === "masuk" ? "Buat kata sandi dengan kode peserta" : "Masuk"}
          </button>
        </p>
      </div>
    </dialog>
  );
}
