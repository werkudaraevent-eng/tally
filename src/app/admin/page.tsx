"use client";

import {
  ArrowsClockwise,
  ArrowSquareOut,
  ArrowUpRight,
  CalendarBlank,
  CheckCircle,
  Circle,
  Gift,
  ListChecks,
  MapPin,
  MonitorPlay,
  Receipt,
  UserPlus,
  UsersThree,
  XCircle,
} from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useCallback, useEffect, useState } from "react";
import { ExportMenu } from "@/components/admin/export-menu";
import { Button, LinearProgress, StatusChip } from "@/components/m3";
import { formatEventSchedule, daysUntil } from "@/lib/event-datetime";
import { eventApiPath } from "@/lib/event-url";

/**
 * Dashboard acara.
 *
 * Dulu isinya omzet booth, jumlah order, dan tabel order per booth — dashboard
 * TRANSAKSI. Itu menjawab pertanyaan kasir, bukan pertanyaan panitia yang baru
 * membuka aplikasi: berapa yang sudah mendaftar, apa yang belum disiapkan, dan
 * adakah yang menunggu dikerjakan. Angka penjualan tetap ada, tetapi sebagai
 * SATU kartu yang menautkan ke modulnya, bukan sebagai isi seluruh halaman —
 * pada acara tanpa booth, tabel itu adalah layar kosong yang menyambut panitia
 * setiap hari.
 *
 * Semua kartu di sini adalah tautan. Dashboard yang hanya menampilkan angka
 * memaksa orang membaca angkanya, lalu mencari sendiri menu mana yang
 * mengurusnya; yang dicari setelah melihat "12 menunggu moderasi" selalu layar
 * moderasinya.
 */

type Overview = {
  event: {
    name: string;
    slug: string;
    status: string;
    event_date: string | null;
    end_date: string | null;
    start_time: string | null;
    end_time: string | null;
    time_zone: string;
    venue_name: string | null;
    registration_enabled: boolean;
    participant_source: string;
  };
  peserta: { total: number; menunggu: number; disetujui: number; ditolak: number };
  transaksi: { total: number; lunas: number; omzet: number; menunggu: number };
  kesiapan: {
    deskripsi: boolean;
    banner: boolean;
    venue: boolean;
    jadwal: boolean;
    agenda: number;
    denah: number;
    booth: number;
    booth_aktif: number;
    penawaran: number;
    hadiah_undian: number;
    pertanyaan_vote: number;
    email_aktif: boolean;
  };
};

const formatRupiah = (amount: number) => `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;

/**
 * Hitung mundur menuju hari-H.
 *
 * Ditulis sebagai kalimat, bukan angka telanjang. "H-12" tidak berarti apa-apa
 * bagi panitia yang baru bergabung; "12 hari lagi" langsung terbaca.
 */
function hitungMundur(eventDate: string | null, now: Date) {
  const selisih = daysUntil(eventDate, now);
  if (selisih === null) return { utama: "Tanggal belum diisi", detail: "Isi tanggal acara di Pengaturan" };
  if (selisih > 1) return { utama: `${selisih} hari lagi`, detail: "menuju hari acara" };
  if (selisih === 1) return { utama: "Besok", detail: "acara berlangsung" };
  if (selisih === 0) return { utama: "Hari ini", detail: "acara berlangsung" };
  return { utama: `${Math.abs(selisih)} hari lalu`, detail: "acara sudah berlangsung" };
}

export default function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  // Tanggal dibaca sekali per pemuatan, bukan pada setiap render: `new Date()`
  // di badan komponen membuat markup server dan klien berbeda saat tengah malam
  // terlewati di antara keduanya.
  const [sekarang, setSekarang] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(eventApiPath("/api/admin/overview"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setError("Ringkasan acara gagal dimuat."); return; }
    setData(await response.json());
    setSekarang(new Date());
    setError("");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    // 60 detik, bukan 30 seperti dashboard lama. Isinya bukan angka yang berubah
    // per detik saat acara berjalan — itu tugas Papan peringkat.
    const poll = window.setInterval(() => { void refresh(); }, 60_000);
    return () => { window.clearTimeout(timer); window.clearInterval(poll); };
  }, [refresh]);

  const jadwal = data ? formatEventSchedule({
    event_date: data.event.event_date,
    end_date: data.event.end_date,
    start_time: data.event.start_time,
    end_time: data.event.end_time,
    time_zone: data.event.time_zone as never,
  }) : null;

  const mundur = data && sekarang ? hitungMundur(data.event.event_date, sekarang) : null;

  const metrik = data ? [
    {
      href: "/admin/participants",
      label: "Peserta",
      nilai: String(data.peserta.total),
      catatan: data.peserta.total === 0 ? "Belum ada peserta" : "Terdaftar di acara ini",
      icon: UsersThree,
    },
    {
      href: "/admin/registrasi",
      label: "Menunggu moderasi",
      nilai: String(data.peserta.menunggu),
      catatan: data.peserta.menunggu > 0 ? "Perlu diperiksa panitia" : "Tidak ada antrean",
      icon: UserPlus,
      // Satu-satunya kartu yang boleh berubah warna: ia menandai pekerjaan yang
      // menunggu orang, bukan angka yang sekadar dilaporkan.
      tonal: data.peserta.menunggu > 0,
    },
    {
      href: "/admin/rundown",
      label: "Agenda",
      nilai: String(data.kesiapan.agenda),
      catatan: data.kesiapan.agenda === 0 ? "Rundown masih kosong" : "Sesi di rundown",
      icon: CalendarBlank,
    },
    {
      href: "/admin/orders",
      label: "Transaksi",
      nilai: formatRupiah(data.transaksi.omzet),
      catatan: `${data.transaksi.lunas} lunas · ${data.transaksi.menunggu} menunggu`,
      icon: Receipt,
    },
  ] : [];

  /**
   * Kesiapan acara.
   *
   * `wajib` menentukan apa yang dihitung ke dalam persentase. Undian dan voting
   * TIDAK wajib: banyak acara memang tidak memakainya, dan menghitungnya sebagai
   * kekurangan membuat angka kesiapan mustahil mencapai 100% — begitu itu
   * terjadi, seluruh daftar berhenti dibaca.
   */
  const kesiapan = data ? [
    { siap: data.kesiapan.jadwal, label: "Tanggal & jam acara", href: "/admin/landing", wajib: true },
    { siap: data.kesiapan.venue, label: "Lokasi acara", href: "/admin/landing", wajib: true },
    { siap: data.kesiapan.deskripsi, label: "Deskripsi di halaman acara", href: "/admin/landing", wajib: true },
    { siap: data.kesiapan.banner, label: "Banner halaman acara", href: "/admin/landing", wajib: false },
    { siap: data.kesiapan.agenda > 0, label: "Rundown acara", href: "/admin/rundown", wajib: true },
    { siap: data.kesiapan.denah > 0, label: "Denah kursi", href: "/admin/seat-map", wajib: false },
    { siap: data.kesiapan.booth_aktif > 0, label: "Booth aktif", href: "/admin/booths", wajib: false },
    { siap: data.event.registration_enabled, label: "Pendaftaran publik dibuka", href: "/admin/registrasi", wajib: false },
    { siap: data.kesiapan.email_aktif, label: "Pengiriman email kode peserta", href: "/admin/settings", wajib: true },
    { siap: data.kesiapan.hadiah_undian > 0, label: "Hadiah undian", href: "/admin/undian", wajib: false },
    { siap: data.kesiapan.pertanyaan_vote > 0, label: "Pertanyaan voting", href: "/admin/vote", wajib: false },
  ] : [];

  const wajib = kesiapan.filter((baris) => baris.wajib);
  const wajibSiap = wajib.filter((baris) => baris.siap).length;
  const persen = wajib.length ? Math.round((wajibSiap / wajib.length) * 100) : 0;

  const layarPanggung = [
    { href: "/display", label: "Papan peringkat", desc: "Layar peringkat transaksi untuk proyektor", icon: MonitorPlay },
    { href: "/undian", label: "Layar undian", desc: "Tampilan pengundian hadiah", icon: Gift },
    { href: "/vote/layar", label: "Layar voting", desc: "Hasil voting yang bergerak live", icon: ListChecks },
  ];

  return (
    <main className="bg-surface text-on-surface">
      <div className="mx-auto max-w-[1440px] px-5 pb-8 pt-6 sm:px-8 lg:pb-12">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <p className="text-body-medium leading-6 text-on-surface-variant">
            Kesiapan acara, pendaftar, dan pintasan ke layar yang dipakai saat acara berjalan.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outlined" onClick={refresh} icon={<ArrowsClockwise size={18} weight="bold" />}>Refresh</Button>
            <ExportMenu />
          </div>
        </div>

        {error ? (
          <div role="alert" className="rounded-lg mt-5 flex items-center gap-3 border border-error-soft-outline bg-error-soft p-4 text-body-medium text-error">
            <XCircle size={20} />{error}
          </div>
        ) : null}

        {/* ---- Kartu acara ------------------------------------------------- */}
        <section className="mt-8 overflow-hidden rounded-[28px] bg-surface-container-high">
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone={data?.event.status === "active" ? "success" : "neutral"}>
                  {data?.event.status ?? "…"}
                </StatusChip>
                <StatusChip tone={data?.event.registration_enabled ? "success" : "neutral"}>
                  {data?.event.registration_enabled ? "Pendaftaran dibuka" : "Pendaftaran ditutup"}
                </StatusChip>
              </div>

              <p className="mt-5 text-display-small tabular-nums tracking-[-0.03em]">
                {mundur?.utama ?? "…"}
              </p>
              <p className="mt-1 text-body-large text-on-surface-variant">{mundur?.detail ?? "Memuat ringkasan acara"}</p>

              <div className="mt-5 space-y-1.5 text-body-medium text-on-surface-variant">
                {jadwal ? (
                  <p className="flex items-start gap-2"><CalendarBlank size={18} className="mt-0.5 shrink-0" />{jadwal}</p>
                ) : null}
                {data?.event.venue_name ? (
                  <p className="flex items-start gap-2"><MapPin size={18} className="mt-0.5 shrink-0" />{data.event.venue_name}</p>
                ) : null}
              </div>
            </div>

            {/* Kesiapan diletakkan DI DALAM kartu acara, bukan sebagai bagian
                terpisah di bawah: keduanya menjawab satu pertanyaan yang sama —
                "apakah acara ini siap dibuka ke tamu". */}
            <div className="rounded-[20px] bg-surface-container p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-label-medium uppercase tracking-[0.16em] text-on-surface-variant">Kesiapan acara</p>
                  <p className="mt-1 text-headline-small tabular-nums">{persen}%</p>
                </div>
                <p className="text-body-small text-on-surface-variant">{wajibSiap} dari {wajib.length} wajib</p>
              </div>
              <LinearProgress className="mt-3" value={persen} label="Kesiapan acara" />
              <p className="mt-3 text-body-small leading-5 text-on-surface-variant">
                Undian dan voting tidak dihitung — banyak acara memang tidak memakainya.
              </p>
            </div>
          </div>
        </section>

        {/* ---- Metrik ------------------------------------------------------ */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrik.length ? metrik.map(({ href, label, nilai, catatan, icon: Icon, tonal }) => (
            <Link
              key={label}
              href={href}
              className={`m3-state group rounded-[20px] p-5 transition-colors ${
                tonal ? "bg-tertiary-container text-on-tertiary-container" : "bg-surface-container"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-label-medium uppercase tracking-[0.14em] opacity-80">{label}</p>
                <Icon size={20} weight="duotone" className="opacity-80" />
              </div>
              <p className="mt-4 text-headline-medium tabular-nums tracking-[-0.02em]">{nilai}</p>
              <p className="mt-1 flex items-center gap-1 text-body-small opacity-80">
                {catatan}
                <ArrowUpRight size={14} className="opacity-0 transition-opacity group-hover:opacity-100" />
              </p>
            </Link>
          )) : [0, 1, 2, 3].map((index) => (
            <div key={index} className="rounded-[20px] bg-surface-container p-5">
              <p className="text-body-medium text-on-surface-variant">Memuat…</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_0.7fr] lg:items-start">
          {/* ---- Daftar kesiapan ------------------------------------------- */}
          <section className="rounded-[28px] bg-surface-container p-5 sm:p-6">
            <h2 className="text-title-medium">Yang perlu disiapkan</h2>
            <p className="mt-1 text-body-small text-on-surface-variant">
              Setiap baris menuju modul yang mengurusnya.
            </p>

            <ul className="mt-4 divide-y divide-outline-variant">
              {kesiapan.length ? kesiapan.map((baris) => (
                <li key={baris.label}>
                  <Link
                    href={baris.href}
                    className="m3-state group -mx-2 flex min-h-14 items-center gap-3 rounded-2xl px-2 text-body-medium"
                  >
                    {baris.siap
                      ? <CheckCircle size={22} weight="fill" className="shrink-0 text-primary" />
                      : <Circle size={22} className="shrink-0 text-on-surface-variant" />}
                    <span className={`min-w-0 flex-1 ${baris.siap ? "text-on-surface-variant" : "font-semibold"}`}>
                      {baris.label}
                    </span>
                    {!baris.wajib ? (
                      <span className="shrink-0 text-body-small text-on-surface-variant">opsional</span>
                    ) : null}
                    <ArrowUpRight size={16} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              )) : (
                <li className="py-6 text-body-medium text-on-surface-variant">Memuat kesiapan acara…</li>
              )}
            </ul>
          </section>

          {/* ---- Layar panggung -------------------------------------------- */}
          <section className="space-y-4">
            <div className="rounded-[28px] bg-surface-container p-5 sm:p-6">
              <h2 className="text-title-medium">Layar panggung</h2>
              <p className="mt-1 text-body-small text-on-surface-variant">
                Dibuka di tab baru, lalu dilempar ke proyektor.
              </p>
              <div className="mt-4 grid gap-2">
                {layarPanggung.map(({ href, label, desc, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="m3-state flex items-start gap-3 rounded-2xl bg-surface-container-high p-4"
                  >
                    <Icon size={22} weight="duotone" className="mt-0.5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-label-large">
                        {label}
                        <ArrowSquareOut size={13} className="opacity-70" />
                      </span>
                      <span className="mt-0.5 block text-body-small text-on-surface-variant">{desc}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {data ? (
              <Link
                href={`/e/${data.event.slug}`}
                target="_blank"
                rel="noreferrer"
                className="m3-state flex items-center gap-3 rounded-[28px] bg-primary-container p-5 text-on-primary-container sm:p-6"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-title-medium">
                    Halaman acara publik
                    <ArrowSquareOut size={14} className="opacity-80" />
                  </span>
                  <span className="mt-1 block break-all text-body-small opacity-80">/e/{data.event.slug}</span>
                </span>
              </Link>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
