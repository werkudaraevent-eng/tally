"use client";

import {
  ArrowRight, ArrowSquareOut, CalendarBlank, CaretDown, CaretRight, CheckCircle, Circle, CreditCard, Gift, Info,
  ListChecks, MapPin, MonitorPlay, QrCode, Storefront, UsersThree, Warning, XCircle,
} from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { ExportMenu } from "@/components/admin/export-menu";
import { Banner, ButtonLink, LinearProgress, StatusChip, WorkspaceHeader, WorkspacePage } from "@/components/m3";
import { cx } from "@/lib/m3/cx";
import { EVENT_STATUS_LABEL, type EventStatus } from "@/lib/domain";
import { formatEventSchedule, daysUntil } from "@/lib/event-datetime";
import { eventApiPath } from "@/lib/event-url";

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
type Ikon = ComponentType<{ size?: number; className?: string }>;

const formatRupiah = (amount: number) => `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
const NADA_STATUS: Record<EventStatus, "success" | "neutral"> = { active: "success", draft: "neutral", completed: "neutral", archived: "neutral" };

/** Status completed mengalahkan tanggal; tanpa tanggal, acara dianggap masih disiapkan. */
function faseAcara(event: Overview["event"], now: Date): Fase {
  if (event.status === "completed" || event.status === "archived") return "selesai";
  const mulai = daysUntil(event.event_date, now);
  if (mulai === null || mulai > 0) return "persiapan";
  const akhir = daysUntil(event.end_date ?? event.event_date, now);
  return akhir !== null && akhir < 0 ? "selesai" : "hari-h";
}

function judulFase(fase: Fase, event: Overview["event"], now: Date) {
  const mulai = daysUntil(event.event_date, now);
  if (fase === "selesai") {
    const akhir = daysUntil(event.end_date ?? event.event_date, now);
    if (akhir === null || akhir >= 0) return { utama: "Selesai", detail: "Ditandai selesai oleh panitia" };
    return { utama: "Selesai", detail: `${Math.abs(akhir)} hari lalu` };
  }
  if (fase === "hari-h") {
    const hariKe = mulai === null ? 1 : Math.abs(mulai) + 1;
    const multiHari = event.end_date && event.end_date !== event.event_date;
    return { utama: multiHari ? `Hari ke-${hariKe}` : "Hari ini", detail: "Acara berlangsung" };
  }
  if (mulai === null) return { utama: "Tanggal belum diisi", detail: "Isi tanggal acara di Halaman acara" };
  if (mulai === 1) return { utama: "Besok", detail: "Menuju hari acara" };
  return { utama: `${mulai} hari lagi`, detail: "Menuju hari acara" };
}

/** Nama modul untuk tombol "Buka ...", dari tautan butir kesiapan. */
// Status email dibaca dari variabel lingkungan server, bukan dari setelan acara.
const CATATAN_EMAIL = "Diatur di server, bukan dari aplikasi: isi RESEND_API_KEY dan EMAIL_FROM di Vercel.";

const NAMA_MODUL: Record<string, string> = {
  "/admin/landing": "Halaman acara",
  "/admin/rundown": "Rundown",
  "/admin/seat-map": "Denah kursi",
  "/admin/booths": "Booth & item",
  "/admin/registrasi": "Pendaftaran publik",
  "/admin/settings": "Pengaturan",
  "/admin/undian": "Undian",
  "/admin/vote": "Voting",
};

function Kartu({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <section aria-label={label} className={cx("flex flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest", className)}>{children}</section>;
}

function KepalaKartu({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-outline-variant px-5 py-3.5">
      <h2 className="min-w-0 flex-1 text-body-medium font-semibold">{title}</h2>
      {trailing}
    </div>
  );
}

function Rangka({ className }: { className?: string }) {
  return <span aria-hidden className={cx("block rounded bg-surface-container-high shimmer", className)} />;
}

export default function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [sekarang, setSekarang] = useState<Date | null>(null);
  const [tampilkanSelesai, setTampilkanSelesai] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch(eventApiPath("/api/admin/overview"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setError("Ringkasan acara gagal dimuat. Halaman mencoba lagi setiap menit."); return; }
    setData(await response.json());
    setSekarang(new Date());
    setError("");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
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
  const pakaiPendaftaran = data ? data.event.registration_enabled || data.event.participant_source === "public_form" || data.event.participant_source === "hybrid" : false;

  // Undian dan voting tidak wajib: banyak acara tidak memakainya.
  // `href: null` = tidak bisa diatur dari aplikasi; `catatan` menjelaskan di mana.
  const kesiapan: Array<{ siap: boolean; label: string; href: string | null; wajib: boolean; catatan?: string }> = data ? [
    { siap: data.kesiapan.jadwal, label: "Tanggal & jam acara", href: "/admin/landing", wajib: true },
    { siap: data.kesiapan.venue, label: "Lokasi acara", href: "/admin/landing", wajib: true },
    { siap: data.kesiapan.deskripsi, label: "Deskripsi di halaman acara", href: "/admin/landing", wajib: true },
    { siap: data.kesiapan.agenda > 0, label: "Rundown acara", href: "/admin/rundown", wajib: true },
    { siap: data.kesiapan.email_aktif, label: "Pengiriman email kode peserta", href: null, wajib: true, catatan: CATATAN_EMAIL },
    { siap: data.kesiapan.banner, label: "Banner halaman acara", href: "/admin/landing", wajib: false },
    { siap: data.kesiapan.denah > 0, label: "Denah kursi", href: "/admin/seat-map", wajib: false },
    { siap: data.kesiapan.booth_aktif > 0, label: "Booth aktif", href: "/admin/booths", wajib: false },
    { siap: data.event.registration_enabled, label: "Pendaftaran publik dibuka", href: "/admin/registrasi", wajib: false },
    { siap: data.kesiapan.hadiah_undian > 0, label: "Hadiah undian", href: "/admin/undian", wajib: false },
    { siap: data.kesiapan.pertanyaan_vote > 0, label: "Pertanyaan voting", href: "/admin/vote", wajib: false },
  ] : [];
  const wajib = kesiapan.filter((baris) => baris.wajib);
  const wajibSiap = wajib.filter((baris) => baris.siap).length;
  const persen = wajib.length ? Math.round((wajibSiap / wajib.length) * 100) : 0;
  const belumSiap = fase === "hari-h" ? wajib.filter((baris) => !baris.siap) : kesiapan.filter((baris) => !baris.siap);
  const sudahSiap = kesiapan.filter((baris) => baris.siap);
  const langkahWajib = wajib.filter((baris) => !baris.siap);
  const berikutnya = langkahWajib[0];
  const sesudahnya = langkahWajib[1];

  const tindakan: Array<{ icon: Ikon; nada: string; teks: string; aksi: string; href: string | null; catatan?: string }> = data ? [
    ...(data.peserta.menunggu > 0 ? [{ icon: Warning, nada: "text-warning", teks: `${data.peserta.menunggu} pendaftar menunggu moderasi`, aksi: "Periksa", href: "/admin/registrasi" }] : []),
    ...(pakaiPendaftaran && !data.kesiapan.email_aktif ? [{ icon: Info, nada: "text-primary", teks: "Email kode peserta belum aktif", aksi: "", href: null, catatan: CATATAN_EMAIL }] : []),
    ...(adaBooth && data.transaksi.menunggu > 0 ? [{ icon: Info, nada: "text-primary", teks: `${data.transaksi.menunggu} order belum dibayar di kasir`, aksi: "Lihat", href: "/admin/orders" }] : []),
  ] : [];

  const metrik = data ? [
    ...(fase !== "persiapan" ? [{
      href: "/admin/attendance",
      label: "Hadir",
      nilai: String(data.kehadiran.hadir),
      catatan: data.peserta.total > 0 ? `${Math.round((data.kehadiran.hadir / data.peserta.total) * 100)}% dari ${data.peserta.total} terdaftar` : "Belum ada peserta",
    }] : []),
    { href: "/admin/participants", label: "Peserta", nilai: String(data.peserta.total), catatan: data.peserta.total === 0 ? "Belum ada peserta" : "Terdaftar di acara ini" },
    ...(pakaiPendaftaran ? [{
      href: "/admin/registrasi",
      label: "Pendaftaran publik",
      nilai: String(data.peserta.disetujui),
      catatan: `disetujui, ${data.peserta.ditolak} ditolak`,
      chip: data.event.registration_enabled ? { tone: "success" as const, teks: "Dibuka" } : { tone: "neutral" as const, teks: "Ditutup" },
    }] : []),
    ...(adaBooth ? [{ href: "/admin/orders", label: "Transaksi", nilai: formatRupiah(data.transaksi.omzet), catatan: `${data.transaksi.lunas} lunas, ${data.transaksi.menunggu} menunggu` }] : []),
  ] : [];

  const layarPanggung = [
    { href: "/display", label: "Papan peringkat", icon: MonitorPlay, tampil: adaBooth },
    { href: "/sapa", label: "Layar sapa", icon: UsersThree, tampil: true },
    { href: "/undian", label: "Layar undian", icon: Gift, tampil: true },
    { href: "/vote/layar", label: "Layar voting", icon: ListChecks, tampil: true },
    { href: "/scan", label: "Pemindai kehadiran", icon: QrCode, tampil: true },
    { href: "/booth", label: "Booth", icon: Storefront, tampil: adaBooth },
    { href: "/cashier", label: "Kasir", icon: CreditCard, tampil: adaBooth },
  ].filter((layar) => layar.tampil);

  return (
    <WorkspacePage width="wide">
      <WorkspaceHeader
        title={data?.event.name ?? "Dashboard"}
        meta={data ? (
          <>
            <StatusChip dot tone={NADA_STATUS[data.event.status]}>{EVENT_STATUS_LABEL[data.event.status]}</StatusChip>
            {jadwal ? <span className="inline-flex items-center gap-1.5"><CalendarBlank size={16} aria-hidden />{jadwal}</span> : null}
            {data.event.venue_name ? <span className="inline-flex items-center gap-1.5"><MapPin size={16} aria-hidden />{data.event.venue_name}</span> : null}
          </>
        ) : <Rangka className="h-4 w-72" />}
        actions={
          <>
            {data ? <ButtonLink native variant="outlined" href={`/e/${data.event.slug}`} target="_blank" rel="noreferrer" icon={<ArrowSquareOut size={16} />}>Halaman acara</ButtonLink> : null}
            <ExportMenu />
          </>
        }
      />

      {error ? <Banner tone="error" icon={<XCircle size={18} />}>{error}</Banner> : null}

      <div className="grid grid-cols-12 gap-4 xl:gap-6">
        {/* Status dan satu aksi utama */}
        <Kartu label="Status acara" className="col-span-12 lg:col-span-8">
          <div className="flex flex-1 flex-col gap-6 px-6 py-6 sm:flex-row sm:items-center">
            <div className="shrink-0 sm:min-w-[200px]">
              <p className="text-body-medium font-medium text-on-surface-variant">{judul?.detail ?? "Memuat ringkasan acara"}</p>
              {judul ? <p className="text-[1.875rem] font-semibold leading-10 tabular-nums">{judul.utama}</p> : <Rangka className="mt-2 h-8 w-40" />}
            </div>
            {!data ? null : fase === "persiapan" ? (
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-body-medium font-medium text-on-surface-variant">Kesiapan</p>
                  <p className="text-body-medium text-on-surface-variant">{wajibSiap} dari {wajib.length} wajib</p>
                </div>
                <p className="text-[1.875rem] font-semibold leading-10 tabular-nums">{persen}%</p>
                <LinearProgress className="mt-2" value={persen} label="Kesiapan acara" />
              </div>
            ) : fase === "hari-h" ? (
              <div className="min-w-0 flex-1">
                <p className="text-body-medium font-medium text-on-surface-variant">Sudah masuk</p>
                <p className="flex items-baseline gap-2 tabular-nums">
                  <span className="text-[1.875rem] font-semibold leading-10">{data.kehadiran.hadir}</span>
                  <span className="text-body-medium text-on-surface-variant">dari {data.peserta.total} terdaftar</span>
                </p>
                <LinearProgress className="mt-2" value={data.peserta.total > 0 ? (data.kehadiran.hadir / data.peserta.total) * 100 : 0} label="Kehadiran" />
              </div>
            ) : (
              <dl className="flex min-w-0 flex-1 flex-wrap gap-x-8 gap-y-4">
                <div><dt className="text-body-medium text-on-surface-variant">Hadir</dt><dd className="whitespace-nowrap text-title-large font-semibold tabular-nums">{data.kehadiran.hadir} / {data.peserta.total}</dd></div>
                <div><dt className="text-body-medium text-on-surface-variant">Peserta</dt><dd className="whitespace-nowrap text-title-large font-semibold tabular-nums">{data.peserta.total}</dd></div>
                {adaBooth ? <div><dt className="text-body-medium text-on-surface-variant">Transaksi</dt><dd className="whitespace-nowrap text-title-large font-semibold tabular-nums">{formatRupiah(data.transaksi.omzet)}</dd></div> : null}
              </dl>
            )}
          </div>
          {fase === "persiapan" && berikutnya ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-outline-variant bg-surface-container-high px-6 py-3.5">
              <div className="min-w-0 flex-1 text-body-medium">
                <p className="font-medium">Langkah berikutnya: {berikutnya.label.toLowerCase()}</p>
                {sesudahnya ? <p className="text-on-surface-variant">Setelah itu: {sesudahnya.label.toLowerCase()}</p> : null}
              </div>
              {berikutnya.href ? (
                <ButtonLink href={berikutnya.href} icon={<ArrowRight size={16} />}>Buka {NAMA_MODUL[berikutnya.href] ?? berikutnya.label}</ButtonLink>
              ) : berikutnya.catatan ? (
                <p className="basis-full text-body-medium text-on-surface-variant">{berikutnya.catatan}</p>
              ) : null}
            </div>
          ) : null}
        </Kartu>

        {/* Yang menuntut keputusan */}
        <Kartu label="Perlu tindakan" className="col-span-12 lg:col-span-4">
          <KepalaKartu title="Perlu tindakan" trailing={tindakan.length ? <StatusChip tone="warning">{tindakan.length}</StatusChip> : null} />
          {!data ? (
            <div className="flex flex-col gap-3 px-5 py-4"><Rangka className="h-4 w-full" /><Rangka className="h-4 w-4/5" /></div>
          ) : tindakan.length === 0 ? (
            <p className="flex flex-1 items-center gap-2 px-5 py-6 text-body-medium text-on-surface-variant"><CheckCircle size={18} className="shrink-0 text-success" />Tidak ada yang menunggu panitia.</p>
          ) : (
            <ul>
              {tindakan.map(({ icon: Icon, nada, teks, aksi, href, catatan }) => (
                <li key={teks} className="border-b border-outline-variant last:border-b-0">
                  {href ? (
                    <Link href={href} className="flex items-center gap-2.5 px-5 py-3 text-body-medium hover:bg-primary-soft">
                      <Icon size={16} className={cx("shrink-0", nada)} />
                      <span className="min-w-0 flex-1">{teks}</span>
                      <span className="font-medium text-primary">{aksi}</span>
                    </Link>
                  ) : (
                    <div className="flex items-start gap-2.5 px-5 py-3 text-body-medium">
                      <Icon size={16} className={cx("mt-0.5 shrink-0", nada)} />
                      <span className="min-w-0 flex-1">{teks}<span className="block text-on-surface-variant">{catatan}</span></span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Kartu>

        {/* Metrik */}
        {data ? metrik.map((m) => (
          <Link key={m.label} href={m.href} className="col-span-12 flex flex-col gap-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-5 py-4 hover:bg-primary-soft sm:col-span-6 xl:col-span-3">
            <span className="flex items-center gap-2 text-body-medium font-medium text-on-surface-variant">
              <span className="min-w-0 flex-1">{m.label}</span>
              {"chip" in m && m.chip ? <StatusChip dot tone={m.chip.tone}>{m.chip.teks}</StatusChip> : null}
            </span>
            <span className="text-headline-small font-semibold tabular-nums">{m.nilai}</span>
            <span className="text-body-medium text-on-surface-variant">{m.catatan}</span>
          </Link>
        )) : [0, 1, 2, 3].map((index) => (
          <div key={index} aria-hidden className="col-span-12 flex flex-col gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-5 py-4 sm:col-span-6 xl:col-span-3">
            <Rangka className="h-3.5 w-24" /><Rangka className="h-7 w-20" /><Rangka className="h-3.5 w-32" />
          </div>
        ))}

        {/* Kesiapan: yang belum di atas, yang sudah dilipat */}
        {fase !== "selesai" ? (
          <Kartu label="Kesiapan" className="col-span-12 lg:col-span-6">
            <KepalaKartu title={fase === "hari-h" ? "Wajib yang belum siap" : "Belum siap"} trailing={data ? <span className="text-body-medium text-on-surface-variant">{belumSiap.length} butir</span> : null} />
            {!data ? (
              <div className="flex flex-col gap-3 px-5 py-4"><Rangka className="h-4 w-full" /><Rangka className="h-4 w-3/4" /><Rangka className="h-4 w-4/5" /></div>
            ) : (
              <ul>
                {belumSiap.length === 0 ? (
                  <li className="flex items-center gap-2 px-5 py-4 text-body-medium text-on-surface-variant"><CheckCircle size={18} className="text-success" />Semua butir {fase === "hari-h" ? "wajib " : ""}sudah siap.</li>
                ) : belumSiap.map((baris) => (
                  <li key={baris.label} className="border-b border-outline-variant">
                    {baris.href ? (
                      <Link href={baris.href} className="flex items-center gap-2.5 px-5 py-2.5 text-body-medium hover:bg-primary-soft">
                        <Circle size={16} className="shrink-0 text-on-surface-variant" />
                        <span className={cx("min-w-0 flex-1", baris.wajib && "font-medium")}>{baris.label}</span>
                        {!baris.wajib ? <span className="text-on-surface-variant">opsional</span> : null}
                        <CaretRight size={14} className="shrink-0 text-on-surface-variant" />
                      </Link>
                    ) : (
                      <div className="flex items-start gap-2.5 px-5 py-2.5 text-body-medium">
                        <Circle size={16} className="mt-0.5 shrink-0 text-on-surface-variant" />
                        <span className="min-w-0 flex-1">
                          <span className={cx(baris.wajib && "font-medium")}>{baris.label}</span>
                          {baris.catatan ? <span className="block text-on-surface-variant">{baris.catatan}</span> : null}
                        </span>
                      </div>
                    )}
                  </li>
                ))}
                {fase === "persiapan" && sudahSiap.length > 0 ? (
                  <li>
                    <button type="button" aria-expanded={tampilkanSelesai} onClick={() => setTampilkanSelesai((buka) => !buka)} className="flex w-full items-center gap-2.5 px-5 py-2.5 text-left text-body-medium text-on-surface-variant hover:bg-primary-soft">
                      <CheckCircle size={16} weight="fill" className="shrink-0 text-success" />
                      <span className="flex-1">{sudahSiap.length} sudah siap</span>
                      <CaretDown size={14} className={cx("shrink-0 transition-transform", tampilkanSelesai && "rotate-180")} />
                    </button>
                    {tampilkanSelesai ? (
                      <ul className="border-t border-outline-variant">
                        {sudahSiap.map((baris) => (
                          <li key={baris.label}>
                            {baris.href ? (
                              <Link href={baris.href} className="flex items-center gap-2.5 py-2 pl-11 pr-5 text-body-medium text-on-surface-variant hover:bg-primary-soft">
                                <span className="flex-1">{baris.label}</span>
                                <CaretRight size={14} className="shrink-0" />
                              </Link>
                            ) : (
                              <p className="py-2 pl-11 pr-5 text-body-medium text-on-surface-variant">{baris.label}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ) : null}
              </ul>
            )}
          </Kartu>
        ) : null}

        {/* Peluncur layar */}
        <Kartu label="Layar hari-H" className={cx("col-span-12", fase === "selesai" ? "" : "lg:col-span-6")}>
          <KepalaKartu title="Layar hari-H" trailing={<span className="text-body-medium text-on-surface-variant">dibuka di tab baru</span>} />
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
            {layarPanggung.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} target="_blank" rel="noreferrer" className="flex flex-col gap-3 rounded-md border border-outline-variant p-3 hover:bg-primary-soft">
                <span className="flex items-center justify-between">
                  <Icon size={20} className="text-on-surface" />
                  <ArrowSquareOut size={14} className="text-on-surface-variant" aria-label="Tab baru" />
                </span>
                <span className="text-body-medium font-medium">{label}</span>
              </Link>
            ))}
          </div>
        </Kartu>
      </div>
    </WorkspacePage>
  );
}
