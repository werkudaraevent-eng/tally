"use client";

import {
  ArrowSquareOut,
  ArrowUpRight,
  CalendarBlank,
  CheckCircle,
  Circle,
  CreditCard,
  Gift,
  ListChecks,
  MapPin,
  MonitorPlay,
  QrCode,
  Receipt,
  Storefront,
  UserPlus,
  UsersThree,
  XCircle,
} from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { ExportMenu } from "@/components/admin/export-menu";
import { LinearProgress, PageHeader, StatusChip } from "@/components/m3";
import { EVENT_STATUS_LABEL, type EventStatus } from "@/lib/domain";
import { formatEventSchedule, daysUntil } from "@/lib/event-datetime";
import { eventApiPath } from "@/lib/event-url";

/**
 * Dashboard acara — SADAR FASE.
 *
 * Pertanyaan panitia berubah mengikuti kalender, dan dashboard yang selalu
 * menampilkan "kesiapan 60%" untuk acara yang sudah lewat sembilan belas hari
 * menjawab pertanyaan yang tidak lagi ditanyakan siapa pun.
 *
 *   * Persiapan — sebelum hari-H: apa yang belum disiapkan, berapa yang sudah
 *     mendaftar, adakah yang menunggu dimoderasi.
 *   * Hari-H — dari tanggal mulai sampai tanggal akhir: berapa yang sudah
 *     masuk, dan pintasan ke layar yang sedang dipakai di ruangan.
 *   * Selesai — sesudahnya, atau status completed/archived: rekap dan ekspor.
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
    status: EventStatus;
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
  kehadiran: { hadir: number };
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

type Fase = "persiapan" | "hari-h" | "selesai";

type Metrik = {
  href: string;
  label: string;
  nilai: string;
  catatan: string;
  icon: ComponentType<{ size?: number; weight?: "duotone"; className?: string }>;
  /** Satu-satunya kartu yang boleh berwarna: pekerjaan yang menunggu orang. */
  tonal?: boolean;
};

const formatRupiah = (amount: number) => `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;

/** Nada chip status. Hanya Aktif yang berwarna; sisanya netral. */
const NADA_STATUS: Record<EventStatus, "success" | "neutral"> = {
  active: "success",
  draft: "neutral",
  completed: "neutral",
  archived: "neutral",
};

/**
 * Fase ditentukan dari tanggal DAN status. Status completed mengalahkan
 * tanggal (panitia bisa menutup acara lebih awal); tanpa tanggal, acara
 * dianggap masih disiapkan.
 */
function faseAcara(event: Overview["event"], now: Date): Fase {
  if (event.status === "completed" || event.status === "archived") return "selesai";
  const mulai = daysUntil(event.event_date, now);
  if (mulai === null || mulai > 0) return "persiapan";
  const akhir = daysUntil(event.end_date ?? event.event_date, now);
  return akhir !== null && akhir < 0 ? "selesai" : "hari-h";
}

/**
 * Judul besar kartu acara per fase.
 *
 * Ditulis sebagai kalimat, bukan angka telanjang. "H-12" tidak berarti apa-apa
 * bagi panitia yang baru bergabung; "12 hari lagi" langsung terbaca.
 */
function judulFase(fase: Fase, event: Overview["event"], now: Date) {
  const mulai = daysUntil(event.event_date, now);
  if (fase === "selesai") {
    const akhir = daysUntil(event.end_date ?? event.event_date, now);
    if (akhir === null || akhir >= 0) return { utama: "Selesai", detail: "ditandai selesai oleh panitia" };
    return { utama: "Selesai", detail: `${Math.abs(akhir)} hari lalu` };
  }
  if (fase === "hari-h") {
    const hariKe = mulai === null ? 1 : Math.abs(mulai) + 1;
    const multiHari = event.end_date && event.end_date !== event.event_date;
    return { utama: multiHari ? `Hari ke-${hariKe}` : "Hari ini", detail: "acara berlangsung" };
  }
  if (mulai === null) return { utama: "Tanggal belum diisi", detail: "Isi tanggal acara di Halaman acara" };
  if (mulai === 1) return { utama: "Besok", detail: "acara berlangsung" };
  return { utama: `${mulai} hari lagi`, detail: "menuju hari acara" };
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
    // 60 detik: isinya bukan angka yang berubah per detik saat acara berjalan
    // — itu tugas Papan peringkat. Tombol Refresh manual dihapus; halaman ini
    // menyegarkan diri, dan tombol yang menjanjikan sesuatu yang sudah terjadi
    // sendiri hanya menambah keraguan apakah angkanya sudah terbaru.
    const poll = window.setInterval(() => { void refresh(); }, 60_000);
    return () => { window.clearTimeout(timer); window.clearInterval(poll); };
  }, [refresh]);

  const fase: Fase = data && sekarang ? faseAcara(data.event, sekarang) : "persiapan";
  const judul = data && sekarang ? judulFase(fase, data.event, sekarang) : null;

  const jadwal = data ? formatEventSchedule({
    event_date: data.event.event_date,
    end_date: data.event.end_date,
    start_time: data.event.start_time,
    end_time: data.event.end_time,
    time_zone: data.event.time_zone as never,
  }) : null;

  const adaBooth = (data?.kesiapan.booth ?? 0) > 0;
  // Pendaftaran publik hanya relevan bila sumber pesertanya memang formulir.
  const pakaiPendaftaran = data ? data.event.registration_enabled || data.event.participant_source === "public_form" || data.event.participant_source === "hybrid" : false;

  /**
   * Metrik per fase. Yang bukan metrik tidak masuk: "Agenda 0" adalah butir
   * kesiapan, bukan angka yang dipantau, dan sudah ada di daftar kesiapan.
   * "Transaksi Rp 0" hanya berarti bila acaranya punya booth.
   */
  const metrik: Metrik[] = data ? [
    ...(fase !== "persiapan" ? [{
      href: "/admin/attendance",
      label: "Hadir",
      nilai: String(data.kehadiran.hadir),
      catatan: data.peserta.total > 0 ? `${Math.round((data.kehadiran.hadir / data.peserta.total) * 100)}% dari ${data.peserta.total} terdaftar` : "Belum ada peserta",
      icon: QrCode,
    }] : []),
    {
      href: "/admin/participants",
      label: "Peserta",
      nilai: String(data.peserta.total),
      catatan: data.peserta.total === 0 ? "Belum ada peserta" : "Terdaftar di acara ini",
      icon: UsersThree,
    },
    ...(data.peserta.menunggu > 0 ? [{
      href: "/admin/registrasi",
      label: "Menunggu moderasi",
      nilai: String(data.peserta.menunggu),
      catatan: "Perlu diperiksa panitia",
      icon: UserPlus,
      tonal: true,
    }] : []),
    ...(fase === "persiapan" && pakaiPendaftaran ? [{
      href: "/admin/registrasi",
      label: "Pendaftaran publik",
      nilai: data.event.registration_enabled ? "Dibuka" : "Ditutup",
      catatan: `${data.peserta.disetujui} disetujui · ${data.peserta.ditolak} ditolak`,
      icon: UserPlus,
    }] : []),
    ...(adaBooth ? [{
      href: "/admin/orders",
      label: "Transaksi",
      nilai: formatRupiah(data.transaksi.omzet),
      catatan: `${data.transaksi.lunas} lunas · ${data.transaksi.menunggu} menunggu`,
      icon: Receipt,
    }] : []),
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
  // Yang belum siap di atas: itulah yang dicari orang yang membuka daftar ini.
  // Di hari-H hanya butir wajib yang belum siap yang tampil; di fase selesai
  // daftarnya tidak lagi berarti.
  const daftarKesiapan = fase === "persiapan"
    ? [...kesiapan].sort((a, b) => Number(a.siap) - Number(b.siap))
    : fase === "hari-h" ? wajib.filter((baris) => !baris.siap) : [];

  const layarPanggung = [
    { href: "/display", label: "Papan peringkat", desc: "Peringkat transaksi untuk proyektor", icon: MonitorPlay, tampil: adaBooth },
    { href: "/sapa", label: "Layar sapa", desc: "Menyambut tamu yang baru dipindai", icon: UsersThree, tampil: true },
    { href: "/undian", label: "Layar undian", desc: "Tampilan pengundian hadiah", icon: Gift, tampil: true },
    { href: "/vote/layar", label: "Layar voting", desc: "Hasil voting yang bergerak live", icon: ListChecks, tampil: true },
  ].filter((layar) => layar.tampil);

  /**
   * Layar lapangan: layar yang dipegang petugas, bukan yang ditonton ruangan.
   * Dulu ini alasan halaman `/workspace` dipertahankan ("bantu booth di
   * lapangan"); sekarang pintasannya di sini, di tempat admin sudah berada.
   */
  const layarLapangan = [
    { href: "/scan", label: "Pemindai kehadiran", desc: "Catat tamu yang datang", icon: QrCode, tampil: true },
    { href: "/booth", label: "Booth", desc: "Bantu booth mencatat order", icon: Storefront, tampil: adaBooth },
    { href: "/cashier", label: "Kasir", desc: "Terima pembayaran order", icon: CreditCard, tampil: adaBooth },
  ].filter((layar) => layar.tampil);

  const pintasan = (
    <section className="rounded-xl border border-outline-variant bg-surface-container p-5">
      <h2 className="text-title-medium">Layar hari-H</h2>
      <p className="mt-1 text-body-small text-on-surface-variant">Layar panggung dibuka di tab baru untuk dilempar ke proyektor.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {layarPanggung.map(({ href, label, desc, icon: Icon }) => (
          <Link key={href} href={href} target="_blank" rel="noreferrer" className="m3-state flex items-start gap-3 rounded-2xl border border-outline-variant bg-surface-container-high p-3">
            <Icon size={22} weight="duotone" className="mt-0.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-label-large">{label}<ArrowSquareOut size={13} className="opacity-70" /></span>
              <span className="mt-0.5 block text-body-small text-on-surface-variant">{desc}</span>
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-4 text-label-medium font-semibold ed-label text-on-surface-variant">Layar lapangan</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {layarLapangan.map(({ href, label, desc, icon: Icon }) => (
          <Link key={href} href={href} className="m3-state flex items-start gap-3 rounded-2xl border border-outline-variant bg-surface-container-high p-3">
            <Icon size={22} weight="duotone" className="mt-0.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block text-label-large">{label}</span>
              <span className="mt-0.5 block text-body-small text-on-surface-variant">{desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );

  return (
    <main className="bg-surface text-on-surface">
      <div className="mx-auto max-w-[1440px] px-5 pb-8 pt-5 sm:px-8 lg:pb-12">
        <PageHeader />
        {/* Baris pembuka: fakta acara di kiri, ekspor di kanan. Kalimat
            penjelasan halaman dihapus — ia menjelaskan dashboard kepada orang
            yang membukanya setiap hari. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-body-medium text-on-surface-variant">
            <StatusChip tone={data ? NADA_STATUS[data.event.status] : "neutral"}>
              {data ? EVENT_STATUS_LABEL[data.event.status] : "…"}
            </StatusChip>
            {jadwal ? <span className="flex items-center gap-1.5"><CalendarBlank size={16} className="shrink-0" />{jadwal}</span> : null}
            {data?.event.venue_name ? <span className="flex items-center gap-1.5"><MapPin size={16} className="shrink-0" />{data.event.venue_name}</span> : null}
            {data && pakaiPendaftaran ? <span>{data.event.registration_enabled ? "Pendaftaran dibuka" : "Pendaftaran ditutup"}</span> : null}
          </div>
          <ExportMenu />
        </div>

        {error ? (
          <div role="alert" className="rounded-lg mt-4 flex items-center gap-3 border border-error-soft-outline bg-error-soft p-4 text-body-medium text-error">
            <XCircle size={20} />{error}
          </div>
        ) : null}

        {/* ---- Kartu acara: dua kolom, tinggi satu blok --------------------- */}
        <section className="mt-4 grid gap-4 rounded-xl border border-outline-variant bg-surface-container-high p-5 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="text-display-small tabular-nums">{judul?.utama ?? "…"}</p>
            <p className="mt-1 text-body-large text-on-surface-variant">{judul?.detail ?? "Memuat ringkasan acara"}</p>
          </div>

          {fase === "persiapan" ? (
            // Kesiapan hanya berarti SEBELUM acara.
            <div className="rounded-2xl bg-surface-container p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="ed-label text-on-surface-variant">Kesiapan acara</p>
                  <p className="mt-1 text-headline-small tabular-nums">{data ? `${persen}%` : "…"}</p>
                </div>
                <p className="text-body-small text-on-surface-variant">{wajibSiap} dari {wajib.length} wajib</p>
              </div>
              <LinearProgress className="mt-3" value={persen} label="Kesiapan acara" />
            </div>
          ) : fase === "hari-h" ? (
            // Hari-H: satu angka yang ditanyakan seisi ruang panitia.
            <Link href="/admin/attendance" className="m3-state block rounded-2xl bg-surface-container p-4">
              <p className="ed-label text-on-surface-variant">Sudah masuk</p>
              <p className="mt-1 flex items-baseline gap-2 tabular-nums">
                <span className="text-headline-large">{data?.kehadiran.hadir ?? 0}</span>
                <span className="text-body-medium text-on-surface-variant">dari {data?.peserta.total ?? 0} terdaftar</span>
              </p>
              <LinearProgress className="mt-3" value={data && data.peserta.total > 0 ? (data.kehadiran.hadir / data.peserta.total) * 100 : 0} label="Kehadiran" />
            </Link>
          ) : (
            // Selesai: rekap dalam satu tatapan.
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-surface-container p-4">
                <dt className="ed-label text-on-surface-variant">Hadir</dt>
                <dd className="mt-1 text-headline-small tabular-nums">{data?.kehadiran.hadir ?? 0}<span className="text-body-medium text-on-surface-variant"> / {data?.peserta.total ?? 0}</span></dd>
              </div>
              <div className="rounded-2xl bg-surface-container p-4">
                <dt className="ed-label text-on-surface-variant">Peserta</dt>
                <dd className="mt-1 text-headline-small tabular-nums">{data?.peserta.total ?? 0}</dd>
              </div>
              {adaBooth ? (
                <div className="rounded-2xl bg-surface-container p-4">
                  <dt className="ed-label text-on-surface-variant">Transaksi</dt>
                  <dd className="mt-1 text-headline-small tabular-nums">{formatRupiah(data?.transaksi.omzet ?? 0)}</dd>
                </div>
              ) : null}
            </dl>
          )}
        </section>

        {/* ---- Metrik ------------------------------------------------------ */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          {metrik.length ? metrik.map(({ href, label, nilai, catatan, icon: Icon, tonal }) => (
            <Link
              key={label}
              href={href}
              className={`m3-state group rounded-2xl p-4 transition-colors ${
                tonal ? "bg-tertiary-container text-on-tertiary-container" : "bg-surface-container"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="ed-label opacity-80">{label}</p>
                <Icon size={20} weight="duotone" className="opacity-80" />
              </div>
              <p className="mt-3 text-headline-medium tabular-nums">{nilai}</p>
              <p className="mt-1 flex items-center gap-1 text-body-small opacity-80">
                {catatan}
                <ArrowUpRight size={14} className="opacity-0 transition-opacity group-hover:opacity-100" />
              </p>
            </Link>
          )) : [0, 1, 2].map((index) => (
            // Kerangka seukuran kartu sungguhan, bukan teks "Memuat…": tinggi
            // kartu tidak melompat saat angkanya tiba, dan kilau satu arah
            // terbaca sebagai "sedang datang", bukan sebagai kartu kosong.
            <div key={index} aria-hidden className="rounded-2xl bg-surface-container p-4">
              <span className="block h-3 w-24 rounded-xs bg-surface-container-highest shimmer" />
              <span className="mt-4 block h-8 w-20 rounded-xs bg-surface-container-highest shimmer" />
              <span className="mt-3 block h-3 w-32 rounded-xs bg-surface-container-highest shimmer" />
            </div>
          ))}
        </div>

        {/* Di hari-H pintasan layar naik ke kolom kiri — itulah yang ditekan
            sepanjang hari itu. Di fase lain daftar kesiapan yang di kiri. */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_0.7fr] lg:items-start">
          {daftarKesiapan.length > 0 ? (
            <section className={`rounded-xl border border-outline-variant bg-surface-container p-5 ${fase === "hari-h" ? "lg:order-last" : ""}`}>
              <h2 className="text-title-medium">{fase === "hari-h" ? "Belum siap" : "Yang perlu disiapkan"}</h2>
              <p className="mt-1 text-body-small text-on-surface-variant">Setiap baris menuju modul yang mengurusnya.</p>
              <ul className="mt-3 divide-y divide-outline-variant">
                {daftarKesiapan.map((baris) => (
                  <li key={baris.label}>
                    <Link href={baris.href} className="m3-state group -mx-2 flex min-h-12 items-center gap-3 rounded-2xl px-2 text-body-medium">
                      {baris.siap
                        ? <CheckCircle size={22} weight="fill" className="shrink-0 text-primary" />
                        : <Circle size={22} className="shrink-0 text-on-surface-variant" />}
                      <span className={`min-w-0 flex-1 ${baris.siap ? "text-on-surface-variant" : "font-semibold"}`}>{baris.label}</span>
                      {!baris.wajib ? <span className="shrink-0 text-body-small text-on-surface-variant">opsional</span> : null}
                      <ArrowUpRight size={16} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : data ? (
            <div className={fase === "hari-h" ? "lg:order-last" : ""}>
              {data ? (
                <Link href={`/e/${data.event.slug}`} target="_blank" rel="noreferrer" className="m3-state flex items-center gap-3 rounded-xl bg-primary-container p-5 text-on-primary-container">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-title-medium">Halaman acara publik<ArrowSquareOut size={14} className="opacity-80" /></span>
                    <span className="mt-1 block break-all text-body-small opacity-80">/e/{data.event.slug}</span>
                  </span>
                </Link>
              ) : null}
            </div>
          ) : (
            <div aria-hidden className="rounded-xl border border-outline-variant bg-surface-container p-5">
              <span className="block h-4 w-40 rounded-xs bg-surface-container-highest shimmer" />
              <span className="mt-4 block h-3 w-full rounded-xs bg-surface-container-highest shimmer" />
              <span className="mt-2 block h-3 w-4/5 rounded-xs bg-surface-container-highest shimmer" />
            </div>
          )}

          <section className="space-y-4">
            {pintasan}
            {data && daftarKesiapan.length > 0 ? (
              <Link href={`/e/${data.event.slug}`} target="_blank" rel="noreferrer" className="m3-state flex items-center gap-3 rounded-xl bg-primary-container p-5 text-on-primary-container">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-title-medium">Halaman acara publik<ArrowSquareOut size={14} className="opacity-80" /></span>
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
