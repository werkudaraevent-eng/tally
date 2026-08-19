"use client";

import { CheckCircle, Hourglass } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import type { RegistrationField } from "@/lib/domain";
import { eventApiPath } from "@/lib/event-url";
import type { EventTimeZone } from "@/lib/timezone";

type Props = {
  eventName: string;
  eventDate: string | null;
  timeZone: EventTimeZone;
  fields: RegistrationField[];
  welcomeText: string | null;
  successText: string | null;
  requireCompany: boolean;
  requireJobTitle: boolean;
};

type Hasil = { status: string; qr_code: string | null; email_sent?: boolean };

const input = "mt-2 h-12 w-full border border-outline-variant bg-surface px-4 text-body-large";
const label = "mt-5 block text-body-medium font-semibold";

export default function DaftarClient(props: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [hasil, setHasil] = useState<Hasil | null>(null);

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
    setHasil(body);
  }

  if (hasil) {
    const disetujui = hasil.status === "approved" && hasil.qr_code;
    // Dibaca dari JAWABAN server, bukan dari asumsi bahwa email sudah aktif.
    // Server hanya mengirim true bila penyedia benar-benar menerima kiriman;
    // kunci API yang belum diisi, alamat yang ditolak, dan penyedia yang sedang
    // mati semuanya sampai ke sini sebagai false.
    const lewatEmail = disetujui && hasil.email_sent === true;
    return <Bingkai nama={props.eventName} tanggal={props.eventDate} zona={props.timeZone}>
      <div className="text-center">
        {disetujui
          ? <CheckCircle size={56} weight="fill" className="mx-auto text-primary" />
          : <Hourglass size={56} className="mx-auto text-on-surface-variant" />}
        <h2 className="mt-5 text-headline-small font-semibold tracking-[-0.03em]">
          {disetujui ? "Pendaftaran berhasil" : "Pendaftaran diterima"}
        </h2>
        {/* Email disebut HANYA bila benar-benar terkirim. Menjanjikannya lebih
            dulu membuat pendaftar menutup halaman ini tanpa menyimpan kodenya,
            lalu menunggu email yang tidak akan pernah datang -- dan baru sadar
            di meja registrasi, saat antrean sudah panjang. */}
        <p className="mt-3 text-body-medium leading-6 text-on-surface-variant">
          {props.successText ?? (disetujui
            ? "Simpan kode di bawah ini. Tunjukkan kode itu di meja registrasi saat hari acara."
            : "Panitia akan memeriksa pendaftaran Anda, lalu menghubungi Anda lewat kontak yang diisi di atas.")}
        </p>
        {disetujui && <div className="rounded-lg mt-6 border border-outline-variant bg-panel-high p-5">
          <p className="text-body-small font-semibold uppercase tracking-[0.16em] text-on-surface-variant">Kode peserta</p>
          {/* Kode tetap ditampilkan BESAR walau emailnya terkirim. Email bisa
              masuk spam, tertunda, atau salah ketik; kode di layar adalah satu-
              satunya salinan yang pasti sampai pada detik ini. */}
          <p className="mt-2 select-all font-mono text-3xl font-semibold tracking-[0.1em]">{hasil.qr_code}</p>
          {lewatEmail
            ? <p className="mt-3 text-body-medium">Kode ini juga sudah dikirim ke email Anda, lengkap dengan QR-nya. <span className="font-semibold">Tetap potret layar ini</span> — email bisa masuk folder spam.</p>
            : <p className="mt-3 text-body-medium font-semibold text-error">Potret layar ini sekarang. Kode tidak dikirim lewat email dan halaman ini tidak bisa dibuka lagi.</p>}
        </div>}
      </div>
    </Bingkai>;
  }

  return <Bingkai nama={props.eventName} tanggal={props.eventDate} zona={props.timeZone}>
    {props.welcomeText && <p className="rounded-lg border border-outline-variant bg-panel-high p-4 text-body-medium leading-6">{props.welcomeText}</p>}
    <form onSubmit={submit} noValidate={false}>
      <label className={label}>Nama lengkap
        <input required minLength={2} maxLength={120} name="name" autoComplete="name" className={input} />
      </label>
      <label className={label}>Email
        <input required type="email" maxLength={160} name="email" autoComplete="email" inputMode="email" className={input} />
        <span className="mt-2 block text-body-medium font-normal text-on-surface-variant">Dipakai panitia untuk menghubungi Anda. Satu email hanya bisa mendaftar sekali.</span>
      </label>
      <label className={label}>Nomor telepon
        <input required type="tel" minLength={6} maxLength={30} name="phone" autoComplete="tel" inputMode="tel" className={input} />
      </label>
      <label className={label}>Perusahaan {!props.requireCompany && <span className="font-normal text-on-surface-variant">(opsional)</span>}
        <input required={props.requireCompany} maxLength={160} name="company" autoComplete="organization" className={input} />
      </label>
      <label className={label}>Jabatan {!props.requireJobTitle && <span className="font-normal text-on-surface-variant">(opsional)</span>}
        <input required={props.requireJobTitle} maxLength={160} name="job_title" autoComplete="organization-title" className={input} />
      </label>

      {props.fields.map((field) => <label key={field.key} className={label}>
        {field.label} {!field.required && <span className="font-normal text-on-surface-variant">(opsional)</span>}
        {field.type === "textarea"
          ? <textarea required={field.required} maxLength={2000} rows={3} name={`extra.${field.key}`} placeholder={field.placeholder} className="rounded-lg mt-2 w-full border border-outline-variant bg-surface p-4 text-body-large" />
          : field.type === "select"
            ? <select required={field.required} name={`extra.${field.key}`} defaultValue="" className={input}>
                <option value="" disabled>Pilih…</option>
                {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            : <input required={field.required} type={field.type} maxLength={2000} name={`extra.${field.key}`} placeholder={field.placeholder} className={input} />}
        {field.help_text && <span className="mt-2 block text-body-medium font-normal text-on-surface-variant">{field.help_text}</span>}
      </label>)}

      {error && <p role="alert" className="rounded-lg mt-6 border border-error/30 bg-error/5 p-4 text-body-medium font-medium text-error">{error}</p>}

      <button disabled={pending} className="rounded-md mt-7 min-h-12 w-full bg-primary px-5 font-semibold text-on-primary disabled:opacity-50">
        {pending ? "Mengirim…" : "Daftar sekarang"}
      </button>
    </form>
  </Bingkai>;
}

function Bingkai({ nama, tanggal, zona, children }: { nama: string; tanggal: string | null; zona: EventTimeZone; children: React.ReactNode }) {
  return <main className="min-h-dvh bg-surface px-5 py-10 text-on-surface">
    <div className="mx-auto w-full max-w-lg">
      <header className="border-b border-outline-variant pb-6">
        <p className="text-body-small font-semibold uppercase tracking-[0.18em] text-primary">Pendaftaran peserta</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{nama}</h1>
        {tanggal && <p className="mt-2 text-body-medium text-on-surface-variant">
          {new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: zona }).format(new Date(`${tanggal}T12:00:00Z`))}
        </p>}
      </header>
      <div className="rounded-lg mt-7 border border-outline-variant bg-panel p-6 sm:p-8">{children}</div>
    </div>
  </main>;
}
