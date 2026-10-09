"use client";

import { ArrowLeft, ArrowRight, CalendarBlank, CheckCircle, Hourglass, WarningCircle } from "@phosphor-icons/react";
import { LandingNavModern } from "@/components/landing/modern/landing-nav-modern";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from "react";
import { PUBLIK } from "@/lib/pesan/label";
import type { LandingNavWidth, RegistrationField } from "@/lib/domain";
import { REG_CONTROL, REG_LABEL, RegistrationFieldInput } from "@/components/registration-field-input";
import { DAFTAR_UI } from "@/lib/daftar-i18n";
import { HtmlLang } from "@/components/html-lang";
import { LANDING_LANG_LABELS, type LandingLang } from "@/lib/landing-i18n";
import { RegistrationCodeCard } from "@/components/registration-code-card";
import { Spinner } from "@/components/search-loading";
import { eventApiPath } from "@/lib/event-url";
import { easing, expressive } from "@/lib/m3/motion";
import type { FormGathering } from "@/lib/gathering-formulir";
import { KakiGathering, LatarKv } from "@/components/landing/modern/gathering-app";
import { SHELL } from "@/components/landing/modern/styles";

/**
 * Pergantian formulir → layar sukses di dalam kartu yang sama.
 *
 * Formulir turun-pudar singkat, layar sukses naik-pudar menggantikannya.
 * Sebelumnya isinya bertukar seketika, dan pendaftar yang barusan menekan
 * tombol tidak punya isyarat bahwa yang di layar adalah HASIL dari
 * tekanannya, bukan halaman lain yang kebetulan termuat.
 */
const TUKAR = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15, ease: easing.standardAccelerate } },
  transition: { duration: 0.32, ease: easing.emphasizedDecelerate },
} as const;

/**
 * Form pendaftaran publik.
 *
 * ---- Kenapa tampilannya seperti halaman acara -----------------------------
 *
 * Halaman ini dan `/e/<slug>` dilihat oleh orang yang sama, berurutan, dalam
 * hitungan detik: tamu menekan "Daftar sekarang" di halaman acara dan mendarat
 * di sini. Sebelumnya keduanya memakai bahasa visual yang berbeda — grid,
 * bentuk, dan skala huruf yang lain — sehingga perpindahannya terbaca seperti
 * pindah ke situs pihak ketiga. Pada halaman yang meminta nama, email, dan nomor
 * telepon, kesan itu mahal.
 *
 * Yang disamakan: grid 1440 dengan pinggir yang sama, hero dua kolom (identitas
 * acara di kiri, kartu isi di kanan), pil tanggal yang sama, sudut kartu 28px,
 * dan tombol utama berbentuk kapsul.
 *
 * ---- Kenapa hanya variabel --reg-* ----------------------------------------
 *
 * Sebelumnya bingkai halaman ini mencampur DUA sistem warna: variabel `--reg-*`
 * milik acara untuk kolom isian, tetapi kelas tema aplikasi (`bg-panel`,
 * `text-on-surface-variant`, `bg-primary`) untuk kartunya. Tema aplikasi ikut
 * mode gelap perangkat, tema acara tidak — jadi pendaftar yang ponselnya dalam
 * mode gelap melihat kartu biru tua dengan label yang nyaris tak terbaca di
 * atasnya, sementara kolom isiannya tetap terang. Di berkas ini tidak boleh ada
 * satu pun kelas tema aplikasi.
 */

type Props = {
  /** Bahasa formulir, mengikuti alamatnya (lihat src/lib/daftar-i18n.ts). */
  lang: LandingLang;
  /** Halaman acara dalam bahasa yang sama. */
  /** Null: acara tanpa halaman acara (Tema > Hanya formulir); tautan kembali ke sana disembunyikan. */
  halamanUrl: string | null;
  eventName: string;
  eventSlug: string;
  /** "Senin, 17 Agustus 2026 · 09.00–17.00 WITA". Sumbernya sama dengan halaman acara. */
  schedule: string | null;
  fields: RegistrationField[];
  welcomeText: string | null;
  successText: string | null;
  requireEmail: boolean;
  requirePhone: boolean;
  requireCompany: boolean;
  requireJobTitle: boolean;
  /** Variabel warna --reg-*, diturunkan di server dari warna merek acara. */
  theme: CSSProperties;
  /** Diisi bila halaman acaranya bertata letak Modern: formulir v2. */
  modern: FormModern | null;
  /**
   * Area peserta menyala: formulir meminta kata sandi dan pendaftaran
   * sekaligus membuat akun (lihat /api/registrasi). Null = formulir biasa.
   */
  akun: { minPassword: number } | null;
  /** Dibuka dari tautan pribadi tamu undangan. Null = formulir biasa. */
  undangan?: TamuProp | null;
};

/**
 * Tamu undangan: nama, instansi, dan jabatan diisi lebih dulu. Email hanya
 * tampil tersamar; alamat aslinya dipakai server bila tamu tidak menekan Ganti.
 * Nomor HP tidak pernah diisi lebih dulu.
 */
export type TamuProp = {
  token: string;
  name: string;
  company: string | null;
  title: string | null;
  emailMasked: string | null;
};

export type FormModern = {
  /** Gambar KV acara. Tanpa KV, kepala memakai bidang warna primer. */
  kv: string | null;
  /** Tanggal, jam, tempat: chip yang sama dengan hero halaman acara. */
  fakta: string[];
  /** Variabel CSS huruf judul pilihan admin. */
  headingFont: string;
  /** Alamat masuk area peserta, atau null bila area peserta tidak dibuka. */
  masukUrl: string | null;
  /** Alamat area peserta bila tamu ini sudah masuk; bilah atas lalu menunjuk ke sana, bukan ke Masuk. */
  areaUrl: string | null;
  /** Bilah atas halaman acara: logo, lebar, warna (variabel --nav-*), pilihan bahasa. */
  nav: {
    logoUrl: string | null;
    width: LandingNavWidth;
    logoOnDark: boolean;
    style: CSSProperties;
    langSwitch: { href: string; lang: LandingLang } | null;
  };
  /** Preset Gathering: kepala, kolom, tombol, dan kaki gaya halaman acara gathering. Null = Modern biasa. */
  gathering: FormGathering | null;
};

type Hasil = {
  status: string;
  qr_code: string | null;
  email_sent?: boolean;
  /** Alamat permanen ke kode ini. Null bila migrasi tokennya belum dijalankan. */
  code_url?: string | null;
  /** Akun area peserta: "ok" = sudah masuk. Null bila area peserta mati. */
  akun?: "ok" | "conflict" | "failed" | null;
  peserta_url?: string | null;
  /** True hanya bila email konfirmasi akun benar-benar diterima penyedia. */
  konfirmasi_terkirim?: boolean;
};

/**
 * Kunci penyimpanan lokal, per acara.
 *
 * Dipakai supaya pendaftar yang membuka formulir lagi dari ponsel yang sama
 * tidak mendapat halaman kosong seolah ia belum pernah mendaftar — ia langsung
 * ditawari kodenya. Yang disimpan hanya alamat halaman kode, bukan data diri:
 * penyimpanan lokal tidak pernah kedaluwarsa dan tidak dibersihkan siapa pun.
 */
const kunciKode = (slug: string) => `prima-hub:kode:${slug}`;

/** Penyimpanan lokal tidak berubah selama halaman terbuka; tidak ada yang perlu dilangganani. */
const langgananKosong = () => () => {};

function bacaKodeTersimpan(slug: string) {
  // Melempar di mode penyamaran dan pada pengaturan privasi ketat. Tidak adanya
  // tautan tersimpan bukan galat — halaman ini tetap berfungsi penuh tanpanya.
  try { return window.localStorage.getItem(kunciKode(slug)); } catch { return null; }
}

const MUTED = "text-[var(--reg-on-surface-variant)]";
const KARTU = "rounded-[28px] border border-[var(--reg-outline-variant)] bg-[var(--reg-panel)] p-6 sm:p-8";
const OPSIONAL = `font-normal ${MUTED}`;
const HEAD = "[font-family:var(--landing-heading)]";
/**
 * Gathering: tombol, tautan, dan fokus di badan halaman memakai warna tombol
 * Tema (hijau di rancangan), sama dengan dialog masuk gathering. Berlaku untuk
 * formulir, layar sukses, dan halaman masuk mode Hanya formulir; kartu kode
 * menyetel ulang warna merek.
 */
const AKSI_GATHERING = { "--reg-primary": "var(--alis)", "--reg-on-primary": "var(--on-aksi-putih)" } as CSSProperties;
/** Judul bagian formulir gathering: 24/800 (rancangan Masuk ke Portal 30/800 di layar sendiri). */
const JUDUL_GATHERING = "text-[24px] font-extrabold leading-[1.2] text-[var(--reg-on-surface)]";

/** Kolom tambahan yang selalu selebar kartu di formulir v2 dua lajur. */
const LEBAR_PENUH = new Set<RegistrationField["type"]>(["textarea", "checkbox", "radio", "file"]);

/**
 * Tautan pribadi: `?undangan=` dihapus dari bilah alamat setelah halaman dimuat
 * (tidak ikut tersalin atau tersimpan di riwayat), lalu penanda "Membuka
 * formulir" dikirim SEKALI setelah interaksi nyata: fokus ke kolom, sentuh,
 * ketik, atau gulir. Pemindai tautan email kantor bisa merender halaman dan
 * menunggu beberapa detik, jadi lama terlihat saja tidak dihitung.
 */
function useTandaUndangan(token: string | null) {
  useEffect(() => {
    if (!token) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("undangan")) {
        url.searchParams.delete("undangan");
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      }
    } catch { /* diabaikan */ }

    let terkirim = false;
    const kirim = (e: Event) => {
      if (terkirim || !e.isTrusted) return;
      terkirim = true;
      lepas();
      void fetch(eventApiPath("/api/undangan/buka"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ undangan: token }),
        keepalive: true,
      }).catch(() => undefined);
    };
    const lepas = () => {
      document.removeEventListener("focusin", kirim);
      document.removeEventListener("pointerdown", kirim);
      document.removeEventListener("keydown", kirim);
      window.removeEventListener("scroll", kirim);
    };
    document.addEventListener("focusin", kirim);
    document.addEventListener("pointerdown", kirim);
    document.addEventListener("keydown", kirim);
    window.addEventListener("scroll", kirim, { passive: true });
    return lepas;
  }, [token]);
}

export default function DaftarClient(props: Props) {
  const t = DAFTAR_UI[props.lang];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // Email sudah terdaftar di acara yang punya area peserta: pesannya membawa
  // tautan Masuk, bukan menyuruh menghubungi panitia.
  const [duplikat, setDuplikat] = useState<false | "masuk" | "tautan">(false);
  const [lihatSandi, setLihatSandi] = useState(false);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const tamu = props.undangan ?? null;
  // Email tamu tersamar sampai ia menekan Ganti. Email lain = Menunggu.
  const [gantiEmail, setGantiEmail] = useState(false);
  const pakaiEmailUndangan = Boolean(tamu?.emailMasked) && !gantiEmail;
  useTandaUndangan(tamu?.token ?? null);
  // Nama yang benar-benar dikirim, disimpan saat pengiriman berhasil. Gambar
  // kode yang dibagikan mencantumkannya supaya jelas kode itu milik siapa, dan
  // formulirnya sudah tidak ada di layar untuk dibaca ulang.
  const [nama, setNama] = useState("");
  const [emailDaftar, setEmailDaftar] = useState("");
  // Judul sukses menerima fokus sekali, saat muncul (setelah animasi tukar).
  const judulDifokus = useRef(false);
  // Tautan kode dari pendaftaran sebelumnya di peramban yang sama.
  //
  // useSyncExternalStore, bukan efek yang memanggil setState: `localStorage`
  // tidak ada di server, dan snapshot server `null` membuat render pertama di
  // klien cocok dengan markup server sebelum nilainya masuk.
  const kodeTersimpan = useSyncExternalStore(
    langgananKosong,
    () => bacaKodeTersimpan(props.eventSlug),
    () => null,
  );

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    setDuplikat(false);

    const extra: Record<string, string> = {};
    for (const field of props.fields) {
      const value = form.get(`extra.${field.key}`);
      if (typeof value === "string" && value.trim()) extra[field.key] = value.trim();
    }

    // Slug WAJIB ikut di path. `src/proxy.ts` memang menambahkan `?eventSlug=`
    // dari Referer, tetapi parameter yang DITAMBAHKAN saat rewrite tidak pernah
    // sampai ke route handler -- itu jebakan yang sudah tercatat, dan di sini
    // akibatnya terukur: pendaftaran dari /e/<slug>/daftar jatuh ke "event aktif
    // tunggal", yaitu event PRODUKSI, bukan event yang alamatnya sedang dibuka.
    const response = await fetch(eventApiPath("/api/registrasi"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        // Email undangan tidak ada di formulir; server memakai alamat yang diundang.
        email: pakaiEmailUndangan ? "" : form.get("email"),
        phone: form.get("phone"),
        company: form.get("company") || null, job_title: form.get("job_title") || null,
        extra,
        // Bahasa email konfirmasi mengikuti formulir ini (server tetap memeriksanya).
        lang: props.lang,
        ...(props.akun ? { password: form.get("password") } : {}),
        ...(tamu ? { undangan: tamu.token, pakai_email_undangan: pakaiEmailUndangan } : {}),
      }),
    }).catch(() => null);
    setPending(false);

    // POST yang tidak berbalas mungkin SUDAH tersimpan. Menyuruh "coba lagi"
    // berarti menyuruh mendaftar dua kali; yang kedua akan ditolak sebagai email
    // duplikat dan pendaftar mengira pendaftarannya gagal seluruhnya.
    if (!response) {
      // TIDAK menyuruh "periksa email": pengiriman email bisa saja belum
      // diaktifkan di server, dan menyuruh menunggu sesuatu yang tidak akan
      // datang membuat pendaftar berdiri di meja registrasi tanpa kode.
      setError(t.connectionLost);
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Pesan server berbahasa Indonesia. Halaman English memakai kodenya.
      const kode = response.status === 429 ? "RATE_LIMITED" : body.error?.code;
      if (props.akun && kode === "REGISTRATION_DUPLICATE_EMAIL") {
        setDuplikat(body.error?.details?.masuk === "tautan" ? "tautan" : "masuk");
        setError(t.account.duplicate);
        return;
      }
      setError(props.lang === "id" ? (body.error?.details?.message ?? body.error?.message ?? t.failed) : (t.errors[kode as keyof typeof t.errors] ?? t.failed));
      return;
    }
    setNama(String(form.get("name") ?? "").trim());
    setEmailDaftar(pakaiEmailUndangan ? tamu?.emailMasked ?? "" : String(form.get("email") ?? "").trim());
    judulDifokus.current = false;
    setHasil(body);
    if (typeof body.code_url === "string") {
      // Gagal menulis TIDAK dijadikan galat: mode penyamaran dan pengaturan
      // privasi ketat melempar di sini, dan pendaftarannya sendiri sudah
      // berhasil. Tautannya tetap tampil di layar ini.
      try { window.localStorage.setItem(kunciKode(props.eventSlug), body.code_url); } catch { /* diabaikan */ }
    }
  }

  const m = props.modern;
  const g = m?.gathering ?? null;

  // Kolom bawaan dan kolom tambahan. Di formulir v2 kolomnya dua lajur supaya
  // kartu selebar grid tidak menghasilkan kotak isian sepanjang 1200px; kolom
  // yang isinya panjang (paragraf, centang, berkas, pilihan ganda) tetap selebar
  // kartu.
  const kolom = (
    <>
      {/* `mt-6` pertama dari REG_LABEL dibatalkan di formulir lama: kolom
          pertama menempel di tepi atas kartu. Di v2 ada kepala kartu di atasnya. */}
      <label className={`${REG_LABEL} ${m ? "" : "!mt-0"}`}>{t.fullName}
        <input required minLength={2} maxLength={120} name="name" autoComplete="name" defaultValue={tamu?.name} className={`${REG_CONTROL} font-normal`} />
      </label>

      {pakaiEmailUndangan ? (
        <div className={REG_LABEL}>
          {t.email}
          <div className={`${REG_CONTROL} flex items-center justify-between gap-3 font-normal`}>
            {/* w-0 flex-1: teks tersamar tidak ikut menentukan lebar kolom grid formulir Modern di HP. */}
            <span className="w-0 flex-1 truncate">
              <span className={MUTED}>{PUBLIK[props.lang].invitedAs} </span>
              {tamu!.emailMasked}
            </span>
            <button
              type="button"
              onClick={() => setGantiEmail(true)}
              className="m3-state -my-2 inline-flex min-h-10 shrink-0 items-center rounded-md px-3 text-label-large font-semibold text-[var(--reg-primary)]"
            >
              {PUBLIK[props.lang].change}
            </button>
          </div>
          <span className={`mt-2 block text-body-medium font-normal leading-6 ${MUTED}`}>
            {props.akun ? t.account.emailHelp : t.emailHelpRequired}
          </span>
        </div>
      ) : (
        <label className={REG_LABEL}>{`${t.email} `}{!props.requireEmail && <span className={OPSIONAL}>{t.optional}</span>}
          {/* Ganti ditekan: kolom kosong yang langsung difokus. */}
          <input required={props.requireEmail} type="email" maxLength={160} name="email" autoComplete="email" inputMode="email" autoFocus={gantiEmail} className={`${REG_CONTROL} font-normal`} />
          <span className={`mt-2 block text-body-medium font-normal leading-6 ${MUTED}`}>
            {gantiEmail
              ? PUBLIK[props.lang].changeHint
              : props.akun
                ? t.account.emailHelp
                : props.requireEmail
                  ? t.emailHelpRequired
                  : t.emailHelpOptional}
          </span>
        </label>
      )}

      <label className={REG_LABEL}>{`${t.phone} `}{!props.requirePhone && <span className={OPSIONAL}>{t.optional}</span>}
        <input required={props.requirePhone} type="tel" minLength={6} maxLength={30} name="phone" autoComplete="tel" inputMode="tel" className={`${REG_CONTROL} font-normal`} />
      </label>

      <label className={REG_LABEL}>{`${t.company} `}{!props.requireCompany && <span className={OPSIONAL}>{t.optional}</span>}
        <input required={props.requireCompany} maxLength={160} name="company" autoComplete="organization" defaultValue={tamu?.company ?? undefined} className={`${REG_CONTROL} font-normal`} />
      </label>

      <label className={REG_LABEL}>{`${t.jobTitle} `}{!props.requireJobTitle && <span className={OPSIONAL}>{t.optional}</span>}
        <input required={props.requireJobTitle} maxLength={160} name="job_title" autoComplete="organization-title" defaultValue={tamu?.title ?? undefined} className={`${REG_CONTROL} font-normal`} />
      </label>

      {props.fields.map((field) => m ? (
        <div key={field.key} className={LEBAR_PENUH.has(field.type) ? "sm:col-span-2" : undefined}>
          <RegistrationFieldInput field={field} lang={props.lang} />
        </div>
      ) : <RegistrationFieldInput key={field.key} field={field} lang={props.lang} />)}
    </>
  );

  // Bagian akun, di akhir formulir: data diri tetap di urutan yang sama dengan
  // formulir tanpa akun, dan membuat akun adalah langkah terakhir. Satu kolom
  // dengan tombol Tampilkan, tanpa kolom "ulangi kata sandi" (NN/g, GOV.UK
  // Design System): mengetik dua kali tidak mencegah salah ketik sebaik
  // melihatnya, dan lupa kata sandi bisa dipulihkan lewat email.
  const bagianAkun = props.akun ? (
    <div className={m ? "mt-10 border-t border-[var(--reg-outline-variant)] pt-8" : "mt-8"}>
      <h2 className={g ? JUDUL_GATHERING : m ? "text-title-large font-medium" : "text-title-medium font-semibold"}>{t.account.heading}</h2>
      <p className={`mt-1 text-body-medium ${MUTED}`}>{t.account.intro}</p>
      <div className={m ? "grid gap-x-6 sm:grid-cols-2" : undefined}>
        <div className="mt-6">
          <label htmlFor="daftar-sandi" className="block text-label-large font-semibold">{t.account.password}</label>
          <div className="relative mt-2">
            <input
              id="daftar-sandi"
              name="password"
              type={lihatSandi ? "text" : "password"}
              required
              minLength={props.akun.minPassword}
              maxLength={72}
              autoComplete="new-password"
              aria-describedby="daftar-sandi-catatan"
              className={`${REG_CONTROL.replace("mt-2 ", "")} pr-32 font-normal`}
            />
            <button
              type="button"
              onClick={() => setLihatSandi((lihat) => !lihat)}
              aria-label={lihatSandi ? t.account.hideAria : t.account.showAria}
              aria-pressed={lihatSandi}
              className="m3-state absolute! right-1.5 top-1/2 inline-flex min-h-10 -translate-y-1/2 items-center rounded-md px-3 text-label-large font-semibold text-[var(--reg-primary)]"
            >
              {lihatSandi ? t.account.hide : t.account.show}
            </button>
          </div>
          <span id="daftar-sandi-catatan" className={`mt-2 block text-body-medium leading-6 ${MUTED}`}>
            {t.account.passwordHelp(props.akun.minPassword)}
          </span>
        </div>
      </div>
    </div>
  ) : null;

  const galat = error ? (
    // Galat naik-pudar masuk, bukan muncul seketika: kotak merah yang
    // tiba-tiba ada di bawah formulir terbaca sebagai bagian halaman yang
    // baru termuat, bukan sebagai jawaban atas tombol yang barusan ditekan.
    <p key={error} role="alert" className="rise-in-fast mt-7 flex items-start gap-2 rounded-[20px] bg-[var(--reg-error-soft)] p-4 text-body-medium font-medium leading-6 text-[var(--reg-on-error-soft)]">
      <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0" />
      <span>
        {error}
        {duplikat && m?.masukUrl ? (
          <>
            {" "}
            <Link href={duplikat === "tautan" ? `${m.masukUrl}?mode=tautan` : m.masukUrl} className="font-semibold underline underline-offset-4">{t.account.duplicateLink}</Link>
          </>
        ) : null}
      </span>
    </p>
  ) : null;

  // Pendaftar yang membuka formulir ini lagi dari perangkat yang sama
  // diingatkan lebih dulu. Tanpa ini ia mengisi ulang seluruh formulir, lalu
  // ditolak sebagai email duplikat — dan mengira pendaftarannya gagal.
  const pengingat = kodeTersimpan ? (
    <p className={`mb-6 bg-[var(--reg-primary-container)] p-4 text-body-medium leading-6 text-[var(--reg-on-primary-container)] ${m ? "rounded-lg" : "rounded-[20px]"}`}>
      {t.deviceUsed}{" "}
      <a href={kodeTersimpan} className="font-semibold underline">{t.openCode}</a>.
    </p>
  ) : null;

  /* Labelnya TIDAK berganti menjadi "Mengirim…": hanya ikonnya yang ditukar
     dengan pemintal, pola yang sama dengan primitif Button. Label yang berubah
     membuat lebar tombol melompat tepat saat ditekan. */
  const tombolKirim = (bentuk: string) => (
    <button
      disabled={pending}
      aria-busy={pending || undefined}
      className={`m3-state inline-flex items-center justify-center gap-2 bg-[var(--reg-primary)] px-8 font-semibold text-[var(--reg-on-primary)] transition-[scale] duration-150 ease-standard active:scale-[0.98] disabled:opacity-50 ${bentuk}`}
      style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}
    >
      {props.akun ? t.account.registerButton : t.registerNow}
      {pending ? <Spinner size={20} label={t.sending} /> : m ? null : <ArrowRight size={20} weight="bold" />}
    </button>
  );

  const disetujui = hasil !== null && hasil.status === "approved" && Boolean(hasil.qr_code);
  // Dibaca dari JAWABAN server, bukan dari asumsi bahwa email sudah aktif.
  // Server hanya mengirim true bila penyedia benar-benar menerima kiriman;
  // kunci API yang belum diisi, alamat yang ditolak, dan penyedia yang sedang
  // mati semuanya sampai ke sini sebagai false.
  const lewatEmail = disetujui && hasil?.email_sent === true;

  const berakun = hasil?.akun === "ok";
  const judulSukses = berakun
    ? (disetujui ? t.account.successApproved : t.account.successPending)
    : disetujui ? t.successApproved : t.successPending;
  // Email disebut HANYA bila benar-benar terkirim. Menjanjikannya lebih dulu
  // membuat pendaftar menutup halaman ini tanpa menyimpan kodenya, lalu
  // menunggu email yang tidak akan pernah datang -- dan baru sadar di meja
  // registrasi, saat antrean sudah panjang.
  const pesanSukses = props.successText ?? (berakun
    ? (disetujui
      ? (lewatEmail ? t.account.messageApprovedEmailed : t.account.messageApproved)
      : (hasil?.konfirmasi_terkirim ? t.account.messagePendingEmailed : t.account.messagePending))
    : disetujui ? t.messageApproved : t.messagePending);
  // Konfirmasi email (akun baru), atau akun yang gagal dibuat. Alamatnya
  // ditulis lengkap: email adalah nama pengguna dan formulir tidak punya kolom
  // ulangi, jadi di sinilah salah ketik masih bisa terlihat.
  const c = t.account.confirmNote;
  const catatanAkun = hasil?.akun && (!berakun || hasil.konfirmasi_terkirim) ? (
    <p className={`mt-5 max-w-[35rem] text-body-medium leading-6 ${berakun ? MUTED : "font-semibold text-[var(--reg-error)]"}`}>
      {berakun ? (
        <>
          {c.before}<strong className="font-semibold text-[var(--reg-on-surface)] [overflow-wrap:anywhere]">{emailDaftar}</strong>{c.middle}
          <strong className="font-semibold text-[var(--reg-on-surface)]">{c.button}</strong>{c.after}
        </>
      ) : t.account.accountFailed}
    </p>
  ) : null;
  // Sudah berakun: kode tersimpan di area peserta, jadi catatan kode-lewat-email
  // dilebur ke kalimat pembuka (satu catatan email saja, seperti mockup).
  const catatanEmail = disetujui && !berakun ? (
    <p className={`mt-5 text-body-medium leading-6 ${lewatEmail ? MUTED : "font-semibold text-[var(--reg-error)]"}`}>
      {lewatEmail
        ? t.emailSent
        : t.emailNotSent}
    </p>
  ) : null;
  // Tautan permanen. Ini yang menghapus kalimat "halaman ini tidak bisa
  // dibuka lagi": pendaftar yang menutup halaman terlalu cepat punya jalan
  // kembali, dan pendaftar di event bermoderasi punya alamat untuk memeriksa
  // apakah kodenya sudah terbit.
  const tautanKode = hasil?.code_url ? (
    <div className={`mt-6 border border-dashed border-[var(--reg-outline)] p-5 text-left ${m ? "rounded-lg bg-[var(--reg-field)]" : "rounded-[20px]"}`}>
      <p className={m ? "text-label-large font-semibold" : `text-label-medium uppercase tracking-[0.16em] ${MUTED}`}>{t.yourLink}</p>
      <a
        href={hasil.code_url}
        className="mt-2 block break-all text-body-medium font-semibold text-[var(--reg-primary)] underline"
      >
        {typeof window === "undefined" ? hasil.code_url : `${window.location.origin}${hasil.code_url}`}
      </a>
      <p className={`mt-2 text-body-medium leading-6 ${MUTED}`}>
        {t.linkHelp}
        {disetujui ? "" : t.linkHelpPending}
      </p>
    </div>
  ) : null;

  const fokusJudul = (judul: HTMLHeadingElement | null) => {
    if (!judul || judulDifokus.current) return;
    judulDifokus.current = true;
    // Bilah atas sticky (88px) akan menutupi judul bila halaman dibiarkan di
    // posisi tombol kirim. scroll-margin-top menjaga jaraknya dari bilah.
    const tenang = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    judul.focus({ preventScroll: true });
    judul.scrollIntoView({ block: "start", behavior: tenang ? "auto" : "smooth" });
  };
  // Jarak gulir = bilah + ikon di atas judul (56px + 20px) + 24px, supaya ikon
  // juga terlihat. Judul bukan kontrol: cincin fokus global dimatikan di sini.
  const JUDUL_FOKUS = "scroll-mt-[calc(var(--nav-h,0px)+100px)] focus-visible:outline-none! focus-visible:shadow-none!";

  /* Ikon hasil membesar masuk dengan pegas ekspresif, sesaat setelah kartunya
     mendarat. Ini satu-satunya momen di alur pendaftaran yang boleh terasa
     seperti perayaan. */
  const ikonSukses = (kelas: string) => (
    <motion.div
      className={kelas}
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ ...expressive.spatial.default, delay: 0.12 }}
    >
      {disetujui
        ? <CheckCircle size={56} weight="fill" className="text-[var(--reg-primary)]" />
        : <Hourglass size={56} className={MUTED} />}
    </motion.div>
  );

  if (m) {
    return (
      <BingkaiModern {...props} modern={m} areaUrl={(berakun && hasil?.peserta_url) || m.areaUrl}>
        <AnimatePresence mode="wait" initial={false}>
          {hasil ? (
            <motion.div
              key="sukses"
              className={`grid gap-x-16 gap-y-8 ${disetujui ? "lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start" : ""}`}
              {...TUKAR}
            >
              {/* Tiga blok, bukan dua kolom: di ponsel kartu kode langsung di
                  bawah judul (yang paling penting disimpan), di layar lebar ia
                  berdiri di kolom kanan setinggi dua blok kiri. */}
              <div className="min-w-0">
                {ikonSukses("w-fit")}
                <h2 ref={fokusJudul} tabIndex={-1} className={`mt-5 text-[32px] font-semibold leading-tight tracking-[-0.02em] sm:text-[36px] ${HEAD} ${JUDUL_FOKUS}`}>{judulSukses}</h2>
                <p className={`mt-3 max-w-[60ch] text-body-large leading-7 ${MUTED}`}>{pesanSukses}</p>
              </div>

              {/* Kode tetap ditampilkan BESAR walau emailnya terkirim. Email
                  bisa masuk spam, tertunda, atau salah ketik; kode di layar
                  adalah satu-satunya salinan yang pasti sampai pada detik ini. */}
              {disetujui && hasil.qr_code ? (
                <div
                  className="rounded-lg bg-[var(--reg-primary)] p-6 text-[var(--reg-on-primary)] sm:p-8 lg:col-start-2 lg:row-span-2 lg:row-start-1"
                  style={
                    {
                      // Gathering: badan halaman memakai warna tombol; kartu kode tetap warna merek dari Tema.
                      ...(g ? { "--reg-primary": props.theme["--reg-primary" as keyof CSSProperties], "--reg-on-primary": props.theme["--reg-on-primary" as keyof CSSProperties] } : null),
                      "--m3-state-color": "var(--reg-on-primary)",
                    } as CSSProperties
                  }
                >
                  <RegistrationCodeCard
                    inverse
                    code={hasil.qr_code}
                    eventName={props.eventName}
                    personName={nama}
                    schedule={props.schedule}
                    lang={props.lang}
                  />
                  <p className="mt-4 text-center text-body-medium opacity-85">
                    {[nama, props.eventName].filter(Boolean).join(" · ")}
                  </p>
                </div>
              ) : null}

              <div className="min-w-0 [&>*:first-child]:mt-0">
                {catatanEmail}
                {catatanAkun}
                {/* Sudah masuk: area peserta menggantikan tautan kode permanen. */}
                {berakun ? null : tautanKode}
                <div className="mt-6 flex flex-wrap gap-3">
                  {m.masukUrl ? (
                    <Link
                      href={berakun && hasil.peserta_url ? hasil.peserta_url : m.masukUrl}
                      className="m3-state inline-flex min-h-12 items-center rounded-md bg-[var(--reg-primary)] px-5 text-label-large font-semibold text-[var(--reg-on-primary)]"
                      style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}
                    >
                      {berakun ? t.account.openArea : t.signInMemberArea}
                    </Link>
                  ) : null}
                  {props.halamanUrl ? (
                    <Link
                      href={props.halamanUrl}
                      className="m3-state inline-flex min-h-12 items-center rounded-md border border-[var(--reg-on-surface)] px-5 text-label-large font-semibold"
                    >
                      {t.backToEvent}
                    </Link>
                  ) : null}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="formulir" {...TUKAR}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className={g ? JUDUL_GATHERING : "text-title-large font-medium"}>{t.personalData}</h2>
                  <p className={`mt-1 text-body-medium ${MUTED}`}>{t.optionalNote}</p>
                </div>
                {m.masukUrl ? (
                  <p className={`text-body-large ${MUTED}`}>
                    {t.alreadyRegistered}{" "}
                    <Link href={m.masukUrl} className="whitespace-nowrap font-semibold text-[var(--reg-primary)] underline-offset-4 hover:underline">
                      {t.signInMemberArea}
                    </Link>
                  </p>
                ) : null}
              </div>

              <form onSubmit={submit} noValidate={false} className="mt-2">
                {pengingat ? <div className="mt-6">{pengingat}</div> : null}
                <div className="grid gap-x-6 sm:grid-cols-2">{kolom}</div>
                {bagianAkun}
                {galat}
                <div className="mt-8 flex flex-col gap-4 border-t border-[var(--reg-outline-variant)] pt-7 sm:flex-row sm:items-center sm:gap-6">
                  {tombolKirim(
                    g
                      ? "min-h-12 w-full rounded-[12px] text-[15px] leading-[1.2] sm:w-auto sm:min-w-64"
                      : "min-h-[52px] w-full rounded-md text-title-small sm:w-auto sm:min-w-64",
                  )}
                  <p className={`text-body-medium ${MUTED}`}>
                    {t.consent}
                  </p>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </BingkaiModern>
    );
  }

  return (
    <Bingkai {...props}>
      <AnimatePresence mode="wait" initial={false}>
      {hasil ? (
        <motion.div key="sukses" className="text-center" {...TUKAR}>
          {ikonSukses("mx-auto w-fit")}
          <h2 ref={fokusJudul} tabIndex={-1} className={`mt-5 text-headline-small font-semibold tracking-[-0.02em] ${JUDUL_FOKUS}`}>{judulSukses}</h2>
          <p className={`mx-auto mt-3 max-w-[52ch] text-body-large leading-7 ${MUTED}`}>{pesanSukses}</p>
          {disetujui && hasil.qr_code ? (
            <RegistrationCodeCard
              code={hasil.qr_code}
              eventName={props.eventName}
              personName={nama}
              schedule={props.schedule}
              lang={props.lang}
            />
          ) : null}
          {catatanEmail}
          {catatanAkun}
          {berakun ? null : tautanKode}
          {berakun && hasil.peserta_url ? (
            <a
              href={hasil.peserta_url}
              className="m3-state mt-6 inline-flex min-h-12 items-center rounded-full bg-[var(--reg-primary)] px-6 text-label-large font-semibold text-[var(--reg-on-primary)]"
              style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}
            >
              {t.account.openArea}
            </a>
          ) : null}
        </motion.div>
      ) : (
        <motion.div key="formulir" {...TUKAR}>
          {pengingat}
          <form onSubmit={submit} noValidate={false}>
            {kolom}
            {bagianAkun}
            {galat}
            {/* Kapsul, bukan persegi membulat: bentuknya sama dengan tombol
                "Daftar sekarang" yang baru saja ditekan tamu di halaman acara. */}
            {tombolKirim("mt-8 min-h-14 w-full rounded-full text-title-medium shadow-[var(--md-sys-elevation-level1)]")}
          </form>
        </motion.div>
      )}
      </AnimatePresence>
    </Bingkai>
  );
}

function Bingkai({
  lang,
  halamanUrl,
  eventName,
  schedule,
  welcomeText,
  theme,
  children,
}: Props & { children: React.ReactNode }) {
  const t = DAFTAR_UI[lang];
  return (
    <main
      lang={LANDING_LANG_LABELS[lang].htmlLang}
      className="min-h-dvh bg-cover bg-center bg-no-repeat"
      style={{
        ...theme,
        // Sapuan tonal yang sama persis dengan hero halaman acara, supaya
        // perpindahan dari sana ke sini tidak terasa berganti situs.
        //
        // Gambar latar khusus formulir DIHAPUS bersama pilihan warnanya:
        // kolomnya ada di data tetapi tidak pernah punya tempat mengunggahnya,
        // jadi selamanya null — kode yang menunggu fitur yang tidak datang.
        // Kalau kelak formulir perlu gambar, sumbernya banner acara.
        backgroundImage:
          "radial-gradient(120% 100% at 82% -10%, color-mix(in srgb, var(--reg-primary) 22%, transparent), transparent 60%), radial-gradient(90% 80% at 0% 0%, color-mix(in srgb, var(--reg-primary) 10%, transparent), transparent 55%)",
      }}
    >
      <HtmlLang lang={LANDING_LANG_LABELS[lang].htmlLang} />
      <div className="mx-auto w-full max-w-[1440px] px-5 py-12 sm:px-8 sm:py-16 lg:px-10 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Kolom identitas. Menempel saat digulir di layar lebar: formulir ini
              bisa panjang, dan nama acara yang tergulir hilang membuat pendaftar
              kehilangan satu-satunya konfirmasi bahwa ia mengisi formulir yang
              benar. */}
          <div className="lg:col-span-5 xl:col-span-4">
            <div className="lg:sticky lg:top-12">
              {halamanUrl ? (
                <Link
                  href={halamanUrl}
                  className={`m3-state -ml-3 mb-6 inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-label-large font-semibold ${MUTED}`}
                >
                  <ArrowLeft size={18} weight="bold" />
                  {t.eventPage}
                </Link>
              ) : null}

              <p className="text-label-large font-semibold uppercase tracking-[0.18em] text-[var(--reg-primary)]">
                {t.registration}
              </p>
              <h1 className="mt-3 text-balance text-display-small font-semibold tracking-[-0.03em]">{eventName}</h1>

              {schedule ? (
                <p className="mt-5 inline-flex items-start gap-2 rounded-3xl bg-[var(--reg-primary-container)] px-4 py-2 text-label-large font-semibold text-[var(--reg-on-primary-container)]">
                  <CalendarBlank size={18} weight="fill" className="mt-0.5 shrink-0" />
                  {schedule}
                </p>
              ) : null}

              {welcomeText ? (
                <p className={`mt-6 max-w-[46ch] whitespace-pre-line text-body-large leading-7 ${MUTED}`}>{welcomeText}</p>
              ) : null}
            </div>
          </div>

          <div className="lg:col-span-7 xl:col-span-7 xl:col-start-6">
            <div className={KARTU}>{children}</div>
          </div>
        </div>
      </div>
    </main>
  );
}


/**
 * Bingkai formulir v2 (Figma "Daftar — PRIMA 2026 (v2)", 37:2).
 *
 * Kepala memakai bahasa hero halaman acara Modern: KV dengan bayangan, atau
 * bidang primer bila acara tidak punya KV, lalu nama acara dan chip fakta yang
 * sama. Kartu formulir di bawahnya selebar grid 1280, sejajar dengan judul di
 * kepala; Hanung menolak versi sempit di tengah karena sisi kiri-kanannya
 * kosong di layar lebar.
 */
export function BingkaiModern({
  lang,
  halamanUrl,
  eventName,
  welcomeText,
  theme,
  modern,
  areaUrl,
  eyebrow,
  children,
}: Pick<Props, "lang" | "halamanUrl" | "eventName" | "welcomeText" | "theme"> & {
  modern: FormModern;
  areaUrl: string | null;
  /** Label kecil di atas nama acara. Bawaan "Pendaftaran peserta"; halaman masuk memakai "Area peserta". */
  eyebrow?: string;
  children: React.ReactNode;
}) {
  if (modern.gathering) {
    return (
      <BingkaiGathering lang={lang} halamanUrl={halamanUrl} eventName={eventName} welcomeText={welcomeText} theme={theme} modern={modern} gathering={modern.gathering} areaUrl={areaUrl} eyebrow={eyebrow}>
        {children}
      </BingkaiGathering>
    );
  }
  const tinta = modern.kv ? "#fff" : "var(--reg-on-brand)";
  const t = DAFTAR_UI[lang];
  return (
    <main
      lang={LANDING_LANG_LABELS[lang].htmlLang}
      className="flex min-h-dvh flex-col bg-[var(--reg-surface)] text-[var(--reg-on-surface)]"
      style={{ ...theme, ...modern.nav.style, "--landing-heading": modern.headingFont } as CSSProperties}
    >
      {/* Bilah atas yang sama dengan halaman acara (warna, logo, ID | EN,
          Masuk). Daftar tidak diulang di sini: tamunya sudah di formulir. */}
      <LandingNavModern
        eventName={eventName}
        daftarUrl=""
        registrationOpen={false}
        memberLink={areaUrl ? { href: areaUrl, label: t.account.memberArea } : modern.masukUrl ? { href: modern.masukUrl, label: t.signIn } : null}
        sections={[]}
        width={modern.nav.width}
        logoUrl={modern.nav.logoUrl}
        logoOnDark={modern.nav.logoOnDark}
        lang={lang}
        langSwitch={modern.nav.langSwitch}
        homeHref={halamanUrl ?? undefined}
        backLink={halamanUrl ? { href: halamanUrl, label: t.backToEvent } : null}
      />
      {/* Ditarik ke bawah bilah seperti hero halaman acara, supaya bilah
          bening berdiri di atas KV; `data-landing-hero` membuat bilah berganti
          warna pekat setelah kepala ini lewat. */}
      <header
        data-landing-hero
        className={`relative isolate -mt-[var(--nav-h)] overflow-hidden pt-[var(--nav-h)] ${modern.kv ? "bg-black" : "bg-[var(--reg-brand)]"}`}
        style={{ color: tinta, "--m3-state-color": tinta } as CSSProperties}
      >
        {modern.kv ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={modern.kv} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
            <div
              aria-hidden
              className="absolute inset-0 -z-10"
              style={{ background: "linear-gradient(to bottom, rgb(0 0 0 / 0.45), rgb(0 0 0 / 0.35) 40%, rgb(0 0 0 / 0.7))" }}
            />
          </>
        ) : null}


        <div className="mx-auto w-full max-w-[1440px] px-5 pb-10 pt-8 sm:px-8 sm:pb-14 sm:pt-14 lg:px-20 lg:pb-20 lg:pt-20">
          {halamanUrl ? (
            <Link href={halamanUrl} className="mb-4 inline-flex min-h-11 items-center gap-2 text-label-large font-medium opacity-85 sm:hidden">
              <ArrowLeft size={16} weight="bold" />
              {t.eventPage}
            </Link>
          ) : null}
          <p className="text-label-large font-semibold uppercase tracking-[0.12em] opacity-85">{eyebrow ?? t.registration}</p>
          <h1 className={`mt-4 max-w-[900px] text-balance text-[34px] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-[44px] lg:text-[56px] ${HEAD}`}>
            {eventName}
          </h1>
          {modern.fakta.length > 0 ? (
            <ul className="mt-6 flex flex-wrap gap-2">
              {modern.fakta.map((item) => (
                <li
                  key={item}
                  className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,currentColor_30%,transparent)] bg-[color-mix(in_srgb,currentColor_14%,transparent)] px-3.5 py-1.5 text-label-large tabular-nums"
                >
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
          {welcomeText ? (
            <p className="mt-6 max-w-[640px] whitespace-pre-line text-body-large opacity-90">{welcomeText}</p>
          ) : null}
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-8 sm:py-12 lg:px-20 lg:py-16">
        <div className="rounded-xl bg-[var(--reg-panel)] p-5 sm:p-8 lg:p-12">{children}</div>
      </div>

      <footer className="bg-[color-mix(in_srgb,var(--reg-primary)_22%,black)] text-white">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-1 px-5 py-6 text-body-medium opacity-75 sm:flex-row sm:justify-between sm:px-8 lg:px-20">
          <span>{eventName}</span>
          <span>{t.managedBy}</span>
        </div>
      </footer>
    </main>
  );
}

/**
 * Kerangka formulir preset Gathering: bilah atas putih dengan tombol pil
 * "Masuk Portal", kepala navy bergradasi dengan lencana, nama acara 800, dan
 * baris fakta seperti hero halaman acara gathering, formulir di atas putih
 * dengan kolom abu-abu muda bersudut 12 (rancangan Login, Figma Hanung), lalu
 * kaki tipis putih yang sama dengan halaman acara.
 */
function BingkaiGathering({
  lang,
  halamanUrl,
  eventName,
  welcomeText,
  theme,
  modern,
  gathering,
  areaUrl,
  eyebrow,
  children,
}: Pick<Props, "lang" | "halamanUrl" | "eventName" | "welcomeText" | "theme"> & {
  modern: FormModern;
  gathering: FormGathering;
  areaUrl: string | null;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  const t = DAFTAR_UI[lang];
  const redup = "text-[var(--hero-redup,color-mix(in_srgb,#fff_80%,transparent))]";
  return (
    <main
      lang={LANDING_LANG_LABELS[lang].htmlLang}
      className="flex min-h-dvh flex-col bg-[var(--reg-surface)] text-[var(--reg-on-surface)]"
      style={
        {
          ...theme,
          ...modern.nav.style,
          ...gathering.gaya,
          "--landing-heading": modern.headingFont,
          "--pinggir-lg": "56px",
          "--pinggir-xl": "56px",
        } as CSSProperties
      }
    >
      <LandingNavModern
        eventName={eventName}
        daftarUrl=""
        registrationOpen={false}
        memberLink={areaUrl ? { href: areaUrl, label: t.account.memberArea, area: true } : modern.masukUrl ? { href: modern.masukUrl, label: t.signIn } : null}
        sections={[]}
        width={modern.nav.width}
        logoUrl={modern.nav.logoUrl}
        logoOnDark={modern.nav.logoOnDark}
        lang={lang}
        langSwitch={modern.nav.langSwitch}
        homeHref={halamanUrl ?? undefined}
        backLink={halamanUrl ? { href: halamanUrl, label: t.backToEvent } : null}
        gathering={{ tanda: "", sub: null }}
      />
      <header
        data-landing-hero
        className="relative isolate -mt-[var(--nav-h)] overflow-hidden text-white"
        style={
          {
            ...gathering.kv?.warnaHero,
            background:
              gathering.kv?.latar ??
              "var(--latar-gathering, linear-gradient(160deg, color-mix(in srgb, var(--reg-brand) 62%, black) 0%, color-mix(in srgb, var(--reg-brand) 85%, black) 60%, var(--reg-brand) 100%))",
            "--m3-state-color": "#fff",
          } as CSSProperties
        }
      >
        {gathering.kv ? <LatarKv src={gathering.kv.src} kuat={gathering.kv.kuat} bayang={gathering.kv.bayang.hero} utuhDiPonsel /> : null}
        <div className={`${SHELL} flex flex-col items-start gap-6 pb-12 pt-[calc(var(--nav-h)+40px)] lg:pb-[72px] lg:pt-[calc(var(--nav-h)+72px)]`}>
          {halamanUrl ? (
            <Link href={halamanUrl} className={`-mb-2 inline-flex min-h-12 items-center gap-2 text-[14px] font-semibold sm:hidden ${redup}`}>
              <ArrowLeft size={16} weight="bold" />
              {t.eventPage}
            </Link>
          ) : null}
          <p className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,#fff_10%,transparent)] px-[18px] py-2 text-[12px] font-semibold uppercase leading-[1.2] tracking-[2px] text-[var(--hero-lencana,#F6E3A8)]">
            {eyebrow ?? t.registration}
          </p>
          <h1 className={`${HEAD} max-w-[900px] text-balance [overflow-wrap:anywhere] text-[36px] font-extrabold leading-[1.08] sm:text-[44px] lg:text-[52px]`}>
            {eventName}
          </h1>
          {welcomeText ? <p className={`max-w-[760px] whitespace-pre-line text-[16px] leading-[1.6] ${redup}`}>{welcomeText}</p> : null}
          {gathering.fakta.length > 0 ? (
            // Pemisah di kiri setiap butir, seperti hero halaman acara gathering.
            <div className="overflow-hidden">
              <ul className="-ml-[41px] flex flex-wrap items-center gap-y-2 text-[14px] leading-[1.2] tabular-nums">
                {gathering.fakta.map((teks, index) => (
                  <li
                    key={teks}
                    className={`flex items-center whitespace-nowrap before:mx-5 before:h-4 before:w-px before:bg-[color-mix(in_srgb,#fff_20%,transparent)] before:content-[''] ${
                      index === 0 ? "font-extrabold text-[var(--hero-angka)]" : redup
                    }`}
                  >
                    {teks}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </header>

      {/* Kolom isian rancangan Login: #F4F6F8, garis #E6EAEF, sudut 12. Placeholder
          memakai teks redup gathering (4.5:1 di #F4F6F8), bukan 50% tinta bawaan. */}
      <div
        className={`${SHELL} flex-1 py-10 sm:py-14 lg:py-[72px] [&_input::placeholder]:text-[var(--reg-on-surface-variant)] [&_textarea::placeholder]:text-[var(--reg-on-surface-variant)]`}
        style={{ ...AKSI_GATHERING, "--reg-field": "#F4F6F8", "--reg-outline": "#E6EAEF", "--reg-outline-variant": "#E6EAEF", "--radius-md": "12px" } as CSSProperties}
      >
        {children}
      </div>

      {/* Garis tipis: kaki putih berdiri di bawah formulir putih, bukan di bawah pita navy seperti di halaman acara. */}
      <div className="border-t border-[#E6EAEF]">
        <KakiGathering hakCipta={gathering.hakCipta} tagline={gathering.tagline} />
      </div>
    </main>
  );
}
