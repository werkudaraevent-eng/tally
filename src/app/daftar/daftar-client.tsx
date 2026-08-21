"use client";

import { ArrowLeft, ArrowRight, CalendarBlank, CheckCircle, Hourglass, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useState, useSyncExternalStore, type CSSProperties, type FormEvent } from "react";
import type { RegistrationField } from "@/lib/domain";
import { REG_CONTROL, REG_LABEL, RegistrationFieldInput } from "@/components/registration-field-input";
import { RegistrationCodeCard } from "@/components/registration-code-card";
import { eventApiPath } from "@/lib/event-url";

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
};

type Hasil = {
  status: string;
  qr_code: string | null;
  email_sent?: boolean;
  /** Alamat permanen ke kode ini. Null bila migrasi tokennya belum dijalankan. */
  code_url?: string | null;
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

export default function DaftarClient(props: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [hasil, setHasil] = useState<Hasil | null>(null);
  // Nama yang benar-benar dikirim, disimpan saat pengiriman berhasil. Gambar
  // kode yang dibagikan mencantumkannya supaya jelas kode itu milik siapa, dan
  // formulirnya sudah tidak ada di layar untuk dibaca ulang.
  const [nama, setNama] = useState("");
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
        name: form.get("name"), email: form.get("email"), phone: form.get("phone"),
        company: form.get("company") || null, job_title: form.get("job_title") || null,
        extra,
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
      setError("Koneksi terputus. Pendaftaran Anda mungkin sudah tersimpan. Jangan mengisi ulang — hubungi panitia untuk memastikan.");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error?.details?.message ?? body.error?.message ?? "Pendaftaran gagal. Coba lagi.");
      return;
    }
    setNama(String(form.get("name") ?? "").trim());
    setHasil(body);
    if (typeof body.code_url === "string") {
      // Gagal menulis TIDAK dijadikan galat: mode penyamaran dan pengaturan
      // privasi ketat melempar di sini, dan pendaftarannya sendiri sudah
      // berhasil. Tautannya tetap tampil di layar ini.
      try { window.localStorage.setItem(kunciKode(props.eventSlug), body.code_url); } catch { /* diabaikan */ }
    }
  }

  if (hasil) {
    const disetujui = hasil.status === "approved" && hasil.qr_code;
    // Dibaca dari JAWABAN server, bukan dari asumsi bahwa email sudah aktif.
    // Server hanya mengirim true bila penyedia benar-benar menerima kiriman;
    // kunci API yang belum diisi, alamat yang ditolak, dan penyedia yang sedang
    // mati semuanya sampai ke sini sebagai false.
    const lewatEmail = disetujui && hasil.email_sent === true;
    return (
      <Bingkai {...props}>
        <div className="text-center">
          {disetujui
            ? <CheckCircle size={56} weight="fill" className="mx-auto text-[var(--reg-primary)]" />
            : <Hourglass size={56} className={`mx-auto ${MUTED}`} />}
          <h2 className="mt-5 text-headline-small font-semibold tracking-[-0.02em]">
            {disetujui ? "Pendaftaran berhasil" : "Pendaftaran diterima"}
          </h2>
          {/* Email disebut HANYA bila benar-benar terkirim. Menjanjikannya lebih
              dulu membuat pendaftar menutup halaman ini tanpa menyimpan kodenya,
              lalu menunggu email yang tidak akan pernah datang -- dan baru sadar
              di meja registrasi, saat antrean sudah panjang. */}
          <p className={`mx-auto mt-3 max-w-[52ch] text-body-large leading-7 ${MUTED}`}>
            {props.successText ?? (disetujui
              ? "Simpan kode di bawah ini. Tunjukkan kode itu di meja registrasi saat hari acara."
              : "Panitia akan memeriksa pendaftaran Anda, lalu menghubungi Anda lewat kontak yang diisi di atas.")}
          </p>
          {/* Kode tetap ditampilkan BESAR walau emailnya terkirim. Email bisa
              masuk spam, tertunda, atau salah ketik; kode di layar adalah satu-
              satunya salinan yang pasti sampai pada detik ini. */}
          {disetujui && hasil.qr_code ? (
            <RegistrationCodeCard
              code={hasil.qr_code}
              eventName={props.eventName}
              personName={nama}
              schedule={props.schedule}
            />
          ) : null}

          {disetujui ? (
            <p className={`mt-5 text-body-medium leading-6 ${lewatEmail ? MUTED : "font-semibold text-[var(--reg-error)]"}`}>
              {lewatEmail
                ? "Kode ini juga sudah dikirim ke email Anda, lengkap dengan QR-nya. Email bisa masuk folder spam — simpan juga gambarnya."
                : "Kode tidak dikirim lewat email. Simpan gambarnya sekarang, atau simpan tautan di bawah."}
            </p>
          ) : null}

          {/* Tautan permanen. Ini yang menghapus kalimat "halaman ini tidak bisa
              dibuka lagi": pendaftar yang menutup halaman terlalu cepat punya
              jalan kembali, dan pendaftar di event bermoderasi punya alamat untuk
              memeriksa apakah kodenya sudah terbit. */}
          {hasil.code_url ? (
            <div className="mt-6 rounded-[20px] border border-dashed border-[var(--reg-outline)] p-5 text-left">
              <p className={`text-label-medium uppercase tracking-[0.16em] ${MUTED}`}>Tautan pendaftaran Anda</p>
              <a
                href={hasil.code_url}
                className="mt-2 block break-all text-body-medium font-semibold text-[var(--reg-primary)] underline"
              >
                {typeof window === "undefined" ? hasil.code_url : `${window.location.origin}${hasil.code_url}`}
              </a>
              <p className={`mt-2 text-body-medium leading-6 ${MUTED}`}>
                Simpan atau kirim ke diri sendiri lewat WhatsApp. Alamat ini bisa dibuka kapan saja
                {disetujui ? "" : " — kode peserta muncul di sana begitu pendaftaran Anda disetujui"}.
              </p>
            </div>
          ) : null}
        </div>
      </Bingkai>
    );
  }

  return (
    <Bingkai {...props}>
      {/* Pendaftar yang membuka formulir ini lagi dari perangkat yang sama
          diingatkan lebih dulu. Tanpa ini ia mengisi ulang seluruh formulir, lalu
          ditolak sebagai email duplikat — dan mengira pendaftarannya gagal. */}
      {kodeTersimpan ? (
        <p className="mb-6 rounded-[20px] bg-[var(--reg-primary-container)] p-4 text-body-medium leading-6 text-[var(--reg-on-primary-container)]">
          Perangkat ini pernah dipakai mendaftar di acara ini.{" "}
          <a href={kodeTersimpan} className="font-semibold underline">Buka kode pendaftarannya</a>.
        </p>
      ) : null}

      <form onSubmit={submit} noValidate={false}>
        {/* `mt-6` pertama dari REG_LABEL dibatalkan: kolom pertama menempel di
            tepi atas kartu, bukan menggantung dengan jarak dua kali lipat. */}
        <label className={`${REG_LABEL} !mt-0`}>Nama lengkap
          <input required minLength={2} maxLength={120} name="name" autoComplete="name" className={`${REG_CONTROL} font-normal`} />
        </label>

        <label className={REG_LABEL}>Email {!props.requireEmail && <span className={OPSIONAL}>(opsional)</span>}
          <input required={props.requireEmail} type="email" maxLength={160} name="email" autoComplete="email" inputMode="email" className={`${REG_CONTROL} font-normal`} />
          <span className={`mt-2 block text-body-medium font-normal leading-6 ${MUTED}`}>
            {props.requireEmail
              ? "Dipakai panitia untuk menghubungi Anda. Satu email hanya bisa mendaftar sekali."
              : "Dikosongkan berarti kode peserta TIDAK dikirim ke mana pun — potret layar setelah mendaftar."}
          </span>
        </label>

        <label className={REG_LABEL}>Nomor telepon {!props.requirePhone && <span className={OPSIONAL}>(opsional)</span>}
          <input required={props.requirePhone} type="tel" minLength={6} maxLength={30} name="phone" autoComplete="tel" inputMode="tel" className={`${REG_CONTROL} font-normal`} />
        </label>

        <label className={REG_LABEL}>Perusahaan {!props.requireCompany && <span className={OPSIONAL}>(opsional)</span>}
          <input required={props.requireCompany} maxLength={160} name="company" autoComplete="organization" className={`${REG_CONTROL} font-normal`} />
        </label>

        <label className={REG_LABEL}>Jabatan {!props.requireJobTitle && <span className={OPSIONAL}>(opsional)</span>}
          <input required={props.requireJobTitle} maxLength={160} name="job_title" autoComplete="organization-title" className={`${REG_CONTROL} font-normal`} />
        </label>

        {props.fields.map((field) => <RegistrationFieldInput key={field.key} field={field} />)}

        {error ? (
          <p role="alert" className="mt-7 flex items-start gap-2 rounded-[20px] bg-[var(--reg-error-soft)] p-4 text-body-medium font-medium leading-6 text-[var(--reg-on-error-soft)]">
            <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0" />
            {error}
          </p>
        ) : null}

        {/* Kapsul, bukan persegi membulat: bentuknya sama dengan tombol "Daftar
            sekarang" yang baru saja ditekan tamu di halaman acara. */}
        <button
          disabled={pending}
          className="m3-state mt-8 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[var(--reg-primary)] px-8 text-title-medium font-semibold text-[var(--reg-on-primary)] shadow-[var(--md-sys-elevation-level1)] disabled:opacity-50"
          style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}
        >
          {pending ? "Mengirim…" : "Daftar sekarang"}
          {pending ? null : <ArrowRight size={20} weight="bold" />}
        </button>
      </form>
    </Bingkai>
  );
}

function Bingkai({
  eventName,
  eventSlug,
  schedule,
  welcomeText,
  theme,
  children,
}: Props & { children: React.ReactNode }) {
  return (
    <main
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
      <div className="mx-auto w-full max-w-[1440px] px-5 py-12 sm:px-8 sm:py-16 lg:px-10 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Kolom identitas. Menempel saat digulir di layar lebar: formulir ini
              bisa panjang, dan nama acara yang tergulir hilang membuat pendaftar
              kehilangan satu-satunya konfirmasi bahwa ia mengisi formulir yang
              benar. */}
          <div className="lg:col-span-5 xl:col-span-4">
            <div className="lg:sticky lg:top-12">
              <Link
                href={`/e/${eventSlug}`}
                className={`m3-state -ml-3 inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-label-large font-semibold ${MUTED}`}
              >
                <ArrowLeft size={18} weight="bold" />
                Halaman acara
              </Link>

              <p className="mt-6 text-label-large font-semibold uppercase tracking-[0.18em] text-[var(--reg-primary)]">
                Pendaftaran peserta
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
