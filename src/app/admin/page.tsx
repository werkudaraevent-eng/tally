"use client";

import { plural } from "@/lib/plural";
import {
  ArrowSquareOut, CalendarBlank, CaretDown, Clock, CreditCard, Gift,
  ListChecks, MapPin, MonitorPlay, QrCode, Storefront, UsersThree, XCircle,
} from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useCallback, useEffect, useState } from "react";
import { ArrivalsChart, DashboardCheckpoints, GroupPanel, Panel, angka, labelHari, persenTeks, useDataCheckin, useFormatJam, type DataCheckin } from "@/components/admin/dashboard-checkins";
import { DashboardEventActions } from "@/components/admin/dashboard-event-actions";
import { ExportMenu } from "@/components/admin/export-menu";
import { useBolehHalaman, useIzinKustom } from "@/components/admin/page-context";
import { Banner, ButtonLink, LinearProgress, StatusChip, WorkspaceHeader, WorkspacePage, type ChipTone } from "@/components/m3";
import { cx } from "@/lib/m3/cx";
import { EVENT_STATUS_LABEL, type EventStatus } from "@/lib/domain";
import { LABEL_PORTAL } from "@/lib/saringan-kolom";
import { formatEventSchedule, daysUntil } from "@/lib/event-datetime";
import { eventApiPath } from "@/lib/event-url";
import { Skeleton } from "@/components/m3/skeleton";

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
  /** Null bila acara tidak memakai area peserta. */
  portal?: { masuk: number } | null;
  transaksi: { total: number; lunas: number; omzet: number; menunggu: number };
  kesiapan: {
    deskripsi: boolean;
    banner: boolean;
    banner_gathering?: boolean;
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
    seksi_luar_tanggal?: number;
    area_peserta?: boolean;
    kontak_panitia?: boolean;
  };
};

type Fase = "persiapan" | "hari-h" | "selesai";

/** Daftar peserta yang belum pernah masuk portal, dengan kolom Portal tercentang. */
const BELUM_MASUK_PORTAL = `/admin/participants?kolom=portal&f=${encodeURIComponent(JSON.stringify([{ k: "portal", in: [LABEL_PORTAL.belum] }]))}`;

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

/** Satu fakta waktu untuk baris meta: "Starts in 7 days", "Day 2 of 3", "Ended 3 days ago". */
function waktuFase(fase: Fase, event: Overview["event"], now: Date): string | null {
  const mulai = daysUntil(event.event_date, now);
  if (fase === "selesai") {
    const akhir = daysUntil(event.end_date ?? event.event_date, now);
    if (akhir === null || akhir >= 0) return "Marked completed";
    return akhir === -1 ? "Ended yesterday" : `Ended ${Math.abs(akhir)} days ago`;
  }
  if (fase === "hari-h") {
    const total = event.end_date && event.event_date ? (daysUntil(event.end_date, now) ?? 0) - (mulai ?? 0) + 1 : 1;
    return total > 1 ? `Day ${Math.abs(mulai ?? 0) + 1} of ${total}` : "Today";
  }
  if (mulai === null) return "No date yet";
  return mulai === 1 ? "Starts tomorrow" : `Starts in ${mulai} days`;
}

// Status email dibaca dari variabel lingkungan server, bukan dari setelan acara.
const CATATAN_EMAIL = "Set on the server, not in the app: RESEND_API_KEY and EMAIL_FROM in Vercel.";

/**
 * Satu angka kunci. Ukuran 28 px untuk angka, 14 px untuk label dan
 * keterangan; "/ 471" bertinta gelap karena itu data, bukan label.
 */
type Kpi = { label: string; nilai: string; dari?: string; meter?: number; keterangan: string; href?: string; aksi?: { teks: string; href: string }; chip?: { tone: ChipTone; teks: string } };

function UbinKpi({ kpi, boleh }: { kpi: Kpi; boleh: (href: string) => boolean }) {
  const isi = (
    <>
      <span className="flex items-center gap-2 text-body-medium text-on-surface-variant">
        <span className="min-w-0 flex-1">{kpi.label}</span>
        {kpi.chip ? <StatusChip dot tone={kpi.chip.tone}>{kpi.chip.teks}</StatusChip> : null}
      </span>
      <span className="mt-1 flex items-baseline gap-1 tabular-nums">
        <span className="text-display-small [overflow-wrap:anywhere]">{kpi.nilai}</span>
        {kpi.dari ? <span className="text-body-medium">{kpi.dari}</span> : null}
      </span>
      {typeof kpi.meter === "number" ? <LinearProgress className="mt-3" value={kpi.meter} label={kpi.label} /> : null}
      <span className="mt-3 text-body-medium text-on-surface-variant">{kpi.keterangan}</span>
    </>
  );
  const kelas = "flex min-w-0 flex-col bg-surface-container-lowest px-4 py-4 sm:px-5";
  // Ubin dengan aksi sendiri tidak dijadikan tautan utuh: dua tautan bersarang.
  if (kpi.aksi) {
    return (
      <div className={kelas}>
        {isi}
        {boleh(kpi.aksi.href) ? <Link href={kpi.aksi.href} className="mt-1 w-fit rounded-sm text-body-medium font-medium text-primary hover:underline">{kpi.aksi.teks}</Link> : null}
      </div>
    );
  }
  return kpi.href && boleh(kpi.href)
    ? <Link href={kpi.href} className={cx(kelas, "hover:bg-primary-soft")}>{isi}</Link>
    : <div className={kelas}>{isi}</div>;
}

const KOLOM_LG: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" };

/** Waktu titik berikutnya: jam saja bila hari ini, "Wed 09:00" bila hari lain. */
function ubinBerikutnya(data: DataCheckin, jam: Intl.DateTimeFormat): Kpi | null {
  const baris = data.rows.find((isi) => isi.key === data.ringkas.berikutnya);
  if (!baris?.tanggal) return null;
  const pukul = baris.jam ? baris.jam.slice(0, 5) : "";
  const hariIni = baris.tanggal === data.ringkas.hari_ini;
  const selisihHari = Math.round((Date.parse(`${baris.tanggal}T00:00:00Z`) - Date.parse(`${data.ringkas.hari_ini}T00:00:00Z`)) / 86_400_000);
  let kapan: string;
  if (hariIni) {
    const kini = jam.format(new Date(data.updated_at));
    const menit = (Number(pukul.slice(0, 2)) * 60 + Number(pukul.slice(3))) - (Number(kini.slice(0, 2)) * 60 + Number(kini.slice(3)));
    kapan = menit < 60 ? `in ${Math.max(1, menit)} min` : `in ${Math.floor(menit / 60)} h ${menit % 60} min`;
  } else {
    kapan = selisihHari === 1 ? "tomorrow" : `in ${selisihHari} days`;
  }
  return {
    label: "Next checkpoint",
    nilai: hariIni ? pukul : `${labelHari(baris.tanggal, { weekday: "short" })} ${pukul}`.trim(),
    keterangan: `${baris.nama} · ${kapan}`,
  };
}

export default function AdminPage() {
  // Peran kustom (akun klien) melihat angka dan check-in saja. Setup, tugas
  // panitia, dan peluncur layar adalah kerja panitia, dan tautannya ke halaman terlarang.
  const kustom = Boolean(useIzinKustom());
  const bolehHalaman = useBolehHalaman();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [sekarang, setSekarang] = useState<Date | null>(null);
  const [tampilkanSetup, setTampilkanSetup] = useState(false);
  const checkin = useDataCheckin();
  const jam = useFormatJam(checkin.data?.time_zone);

  const refresh = useCallback(async () => {
    const response = await fetch(eventApiPath("/api/admin/overview"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      const body = await response?.json().catch(() => null);
      setError(`${body?.error?.message ?? "The event summary couldn't load."} Retrying every minute.`);
      return;
    }
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
  const waktu = data && sekarang ? waktuFase(fase, data.event, sekarang) : null;
  const jadwal = data ? formatEventSchedule({
    event_date: data.event.event_date,
    end_date: data.event.end_date,
    start_time: data.event.start_time,
    end_time: data.event.end_time,
    time_zone: data.event.time_zone as never,
  }) : null;

  const adaBooth = (data?.kesiapan.booth ?? 0) > 0;
  const pakaiPendaftaran = data ? data.event.registration_enabled || data.event.participant_source === "public_form" || data.event.participant_source === "hybrid" : false;
  const ringkas = checkin.data?.ringkas ?? null;
  const kelompok = ringkas?.kelompok ?? null;
  const tanpaJawaban = kelompok?.baris.find((isi) => isi.nilai === null)?.total ?? 0;

  // Undian dan voting tidak wajib: banyak acara tidak memakainya.
  // `href: null` = tidak bisa diatur dari aplikasi; `catatan` menjelaskan di mana.
  const kesiapan: Array<{ siap: boolean; label: string; href: string | null; wajib: boolean; catatan?: string }> = data ? [
    { siap: data.kesiapan.jadwal, label: "Event date and time", href: "/admin/landing", wajib: true },
    { siap: data.kesiapan.venue, label: "Venue", href: "/admin/landing", wajib: true },
    { siap: data.kesiapan.deskripsi, label: "Event page description", href: "/admin/landing", wajib: true },
    { siap: data.kesiapan.agenda > 0, label: "Agenda", href: "/admin/rundown", wajib: true },
    ...((data.kesiapan.seksi_luar_tanggal ?? 0) > 0
      ? [{ siap: false, label: `${plural(data.kesiapan.seksi_luar_tanggal ?? 0, "Agenda section")} dated outside the event`, href: "/admin/rundown", wajib: false }]
      : []),
    ...(data.kesiapan.area_peserta ? [{ siap: data.kesiapan.kontak_panitia === true, label: "Organiser phone for the Participant area", href: "/admin/settings", wajib: false }] : []),
    { siap: data.kesiapan.email_aktif, label: "Email delivery of participant codes", href: null, wajib: true, catatan: CATATAN_EMAIL },
    { siap: data.kesiapan.banner, label: data.kesiapan.banner_gathering ? "Link preview image (Theme › Page)" : "Event page banner", href: "/admin/landing", wajib: false },
    { siap: data.kesiapan.denah > 0, label: "Seating plan", href: "/admin/seat-map", wajib: false },
    { siap: data.kesiapan.booth_aktif > 0, label: "Active booth", href: "/admin/booths", wajib: false },
    { siap: data.event.registration_enabled, label: "Registration open", href: "/admin/registrasi", wajib: false },
    { siap: data.kesiapan.hadiah_undian > 0, label: "Lucky draw prizes", href: "/admin/undian", wajib: false },
    { siap: data.kesiapan.pertanyaan_vote > 0, label: "Voting questions", href: "/admin/vote", wajib: false },
  ] : [];
  const wajib = kesiapan.filter((baris) => baris.wajib);
  const opsional = kesiapan.filter((baris) => !baris.wajib);
  const wajibBelum = wajib.filter((baris) => !baris.siap);

  // Yang menunggu panitia: dari data, bukan daftar per acara.
  const tugas: Array<{ teks: string; aksi: string; href: string | null; catatan?: string }> = data ? [
    ...wajibBelum.map((baris) => ({ teks: `${baris.label} is not set up`, aksi: "Open", href: baris.href, catatan: baris.catatan })),
    ...(data.peserta.menunggu > 0 ? [{ teks: `${plural(data.peserta.menunggu, "registration")} waiting for review`, aksi: "Review", href: "/admin/registrasi" }] : []),
    ...(kelompok && tanpaJawaban > 0 ? [{ teks: `${plural(tanpaJawaban, "participant")} without a ${kelompok.kolom} answer, so Who sees it can't place them`, aksi: "Participants", href: "/admin/participants" }] : []),
    ...(adaBooth && data.transaksi.menunggu > 0 ? [{ teks: `${plural(data.transaksi.menunggu, "order")} not yet paid at the cashier`, aksi: "View", href: "/admin/orders" }] : []),
  ] : [];

  // Angka kunci per fase. Sebelum acara: siapa yang sudah siap datang;
  // hari-H: siapa yang sudah datang; sesudah: berapa yang hadir.
  const total = data?.peserta.total ?? 0;
  const kpi: Kpi[] = [];
  if (data) {
    const portal = data.portal && total > 0 ? data.portal : null;
    const ubinPortal: Kpi | null = portal ? {
      label: "Signed in",
      nilai: angka(portal.masuk),
      dari: `/ ${angka(total)}`,
      meter: persenTeks(portal.masuk, total).nilai,
      keterangan: `Participant area · ${angka(Math.max(0, total - portal.masuk))} not yet`,
      aksi: !kustom && portal.masuk < total ? { teks: "See who hasn't", href: BELUM_MASUK_PORTAL } : undefined,
    } : null;
    const ubinPeserta: Kpi = {
      label: "Participants",
      nilai: angka(total),
      keterangan: total === 0 ? "No participants yet" : kelompok && tanpaJawaban > 0 ? `Active · ${angka(tanpaJawaban)} without a ${kelompok.kolom} answer` : "Active participants",
      href: "/admin/participants",
    };
    const berikutnya = checkin.data && fase !== "selesai" ? ubinBerikutnya(checkin.data, jam) : null;

    if (fase === "hari-h" && ringkas) {
      const dari = ringkas.diharapkan_hari_ini ?? total;
      const sibuk = ringkas.kedatangan.reduce<{ mulai: string; jumlah: number } | null>((a, b) => (!a || b.jumlah > a.jumlah ? b : a), null);
      kpi.push({
        label: "Arrived today",
        nilai: angka(ringkas.datang_hari_ini),
        dari: `/ ${angka(dari)}${ringkas.diharapkan_hari_ini !== null ? " expected" : ""}`,
        meter: persenTeks(ringkas.datang_hari_ini, dari).nilai,
        keterangan: `${persenTeks(ringkas.datang_hari_ini, dari).teks} · first check-in of the day`,
        href: "/admin/attendance",
      });
      kpi.push({
        label: "Last 15 minutes",
        nilai: `+${angka(ringkas.datang_15)}`,
        keterangan: sibuk && sibuk.jumlah > 0 ? `Busiest ${sibuk.mulai} (${angka(sibuk.jumlah)})` : "No arrivals yet today",
      });
      kpi.push(ubinPortal ?? ubinPeserta);
    } else if (fase === "selesai") {
      kpi.push({
        label: "Attended",
        nilai: angka(data.kehadiran.hadir),
        dari: `/ ${angka(total)}`,
        meter: persenTeks(data.kehadiran.hadir, total).nilai,
        keterangan: `${persenTeks(data.kehadiran.hadir, total).teks} checked in at least once`,
        href: "/admin/attendance",
      });
      kpi.push(ubinPeserta);
    } else {
      kpi.push(ubinPeserta);
      if (ubinPortal) kpi.push(ubinPortal);
      kpi.push({
        label: "Checked in",
        nilai: angka(data.kehadiran.hadir),
        dari: `/ ${angka(total)}`,
        keterangan: data.kehadiran.hadir > 0 ? "At any checkpoint" : "No check-ins yet",
        href: "/admin/attendance",
      });
    }
    if (berikutnya) kpi.push(berikutnya);
    if (pakaiPendaftaran) {
      kpi.push({
        label: "Registration",
        nilai: angka(data.peserta.disetujui),
        keterangan: `approved, ${angka(data.peserta.ditolak)} declined`,
        href: "/admin/registrasi",
        chip: data.event.registration_enabled ? { tone: "success", teks: "Open" } : { tone: "neutral", teks: "Closed" },
      });
    }
    if (adaBooth) kpi.push({ label: "Transactions", nilai: formatRupiah(data.transaksi.omzet), keterangan: `${angka(data.transaksi.lunas)} paid, ${angka(data.transaksi.menunggu)} pending`, href: "/admin/orders" });
  }

  const layarPanggung = [
    { href: "/display", label: "Leaderboard", icon: MonitorPlay, tampil: adaBooth },
    { href: "/sapa", label: "Welcome screen", icon: UsersThree, tampil: true },
    { href: "/undian", label: "Lucky draw screen", icon: Gift, tampil: true },
    { href: "/vote/layar", label: "Voting screen", icon: ListChecks, tampil: true },
    { href: "/scan", label: "Attendance scanner", icon: QrCode, tampil: true },
    { href: "/booth", label: "Booth", icon: Storefront, tampil: adaBooth },
    { href: "/cashier", label: "Cashier", icon: CreditCard, tampil: adaBooth },
  ].filter((layar) => layar.tampil);

  // Panel kelompok: sebelum acara siapa yang sudah masuk portal, hari-H siapa
  // yang sudah datang. Tanpa kolom Who sees it, atau tanpa portal sebelum acara: tidak ada.
  const panelKelompok = kelompok && fase !== "selesai"
    ? fase === "hari-h"
      ? { title: "Arrived today", baris: kelompok.baris.map((isi) => ({ nilai: isi.nilai, sudah: isi.datang, total: isi.total })) }
      : kelompok.baris.every((isi) => isi.masuk !== null)
        ? { title: "Signed in to the Participant area", baris: kelompok.baris.map((isi) => ({ nilai: isi.nilai, sudah: isi.masuk ?? 0, total: isi.total })) }
        : null
    : null;
  const panelSetup = !kustom && data && fase !== "selesai" && (fase === "persiapan" || tugas.length > 0);
  const panelGrafik = fase === "hari-h" && checkin.data && checkin.data.rows.length > 0;

  return (
    <WorkspacePage width="wide">
      <WorkspaceHeader
        title={data?.event.name ?? "Dashboard"}
        meta={data ? (
          <>
            <StatusChip dot tone={NADA_STATUS[data.event.status]}>{EVENT_STATUS_LABEL[data.event.status]}</StatusChip>
            {jadwal ? <span className="inline-flex items-center gap-1.5"><CalendarBlank size={16} aria-hidden />{jadwal}</span> : null}
            {/* Nama tempat bisa 200 karakter tanpa spasi; tanpa pemecah kata,
                baris ini melebarkan tata letak ponsel. */}
            {data.event.venue_name ? <span className="inline-flex min-w-0 items-start gap-1.5"><MapPin size={16} aria-hidden className="mt-0.5 shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">{data.event.venue_name}</span></span> : null}
            {waktu ? <span className="inline-flex items-center gap-1.5"><Clock size={16} aria-hidden />{waktu}</span> : null}
          </>
        ) : error ? null : <Skeleton className="h-4 w-72" />}
        actions={
          <>
            {data ? <ButtonLink native variant="outlined" href={`/e/${data.event.slug}`} target="_blank" rel="noreferrer" icon={<ArrowSquareOut size={16} />}>Event page</ButtonLink> : null}
            {kustom ? null : <ExportMenu />}
            {data && !kustom ? <DashboardEventActions slug={data.event.slug} onChanged={() => void refresh()} /> : null}
          </>
        }
      />

      {error ? <Banner tone="error" icon={<XCircle size={18} />}>{error}</Banner> : null}

      {/* Gagal sejak pemuatan pertama: tanpa kerangka "memuat" yang tidak akan pernah terisi. */}
      {error && !data ? null : <div className="grid grid-cols-12 gap-4 xl:gap-6">
        {/* Angka kunci: satu panel, garis tipis di antara ubin (Cloudflare). */}
        <section aria-label="Key numbers" className="col-span-12 overflow-hidden rounded-lg border border-outline-variant bg-outline-variant">
          {data ? (
            <div className={cx("grid grid-cols-2 gap-px", KOLOM_LG[Math.min(6, kpi.length)])}>
              {kpi.map((isi, i) => (
                <div key={isi.label} className={cx("flex", i === kpi.length - 1 && kpi.length % 2 === 1 && "col-span-2 lg:col-span-1")}>
                  <div className="flex flex-1 flex-col [&>*]:flex-1"><UbinKpi kpi={isi} boleh={bolehHalaman} /></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-px lg:grid-cols-4">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} aria-hidden className="flex flex-col gap-2 bg-surface-container-lowest px-5 py-4">
                  <Skeleton className="h-3.5 w-24" /><Skeleton className="h-7 w-20" /><Skeleton className="h-3.5 w-32" />
                </div>
              ))}
            </div>
          )}
        </section>

        {panelGrafik && checkin.data ? <ArrivalsChart data={checkin.data} className={cx("col-span-12", panelKelompok && "lg:col-span-8")} /> : null}

        {fase === "hari-h" && panelKelompok && kelompok ? (
          <GroupPanel
            title={panelKelompok.title}
            kolom={kelompok.kolom}
            baris={panelKelompok.baris}
            lebar={!panelGrafik}
            className={cx("col-span-12", panelGrafik && "lg:col-span-4")}
          />
        ) : null}

        {panelSetup ? (
          <Panel title="Setup" sub={wajibBelum.length === 0 ? "Everything required is set up" : `${wajibBelum.length} of ${wajib.length} required not set up yet`} className={cx("col-span-12", panelKelompok && fase !== "hari-h" && "lg:col-span-8")}>
            <ul className="pb-2">
              {wajibBelum.length === 0 ? (
                <li className="flex flex-wrap items-center gap-3 px-5 py-3 text-body-medium">
                  <StatusChip dot tone="success">Done</StatusChip>
                  <span className="min-w-0 flex-1">{wajib.length} of {wajib.length} required, {opsional.filter((baris) => baris.siap).length} of {opsional.length} optional</span>
                  <button type="button" aria-expanded={tampilkanSetup} onClick={() => setTampilkanSetup((buka) => !buka)} className="inline-flex items-center gap-1 rounded-sm font-medium text-primary hover:underline">
                    {tampilkanSetup ? "Hide" : "View"}<CaretDown size={14} aria-hidden className={cx("transition-transform", tampilkanSetup && "rotate-180")} />
                  </button>
                </li>
              ) : null}
              {tugas.map((isi) => (
                <li key={isi.teks} className="flex flex-wrap items-start gap-3 border-t border-outline-variant px-5 py-3 text-body-medium first:border-t-0">
                  <StatusChip dot tone="warning">To do</StatusChip>
                  <span className="min-w-0 flex-1">
                    {isi.teks}
                    {isi.catatan ? <span className="mt-0.5 block text-on-surface-variant">{isi.catatan}</span> : null}
                  </span>
                  {isi.href && bolehHalaman(isi.href) ? <Link href={isi.href} className="rounded-sm font-medium text-primary hover:underline">{isi.aksi}</Link> : null}
                </li>
              ))}
              {tampilkanSetup ? kesiapan.map((baris) => (
                <li key={baris.label} className="flex items-center gap-3 border-t border-outline-variant px-5 py-2.5 text-body-medium">
                  <StatusChip dot tone={baris.siap ? "success" : "neutral"}>{baris.siap ? "Done" : baris.wajib ? "Required" : "Optional"}</StatusChip>
                  <span className="min-w-0 flex-1">{baris.label}</span>
                  {baris.href && bolehHalaman(baris.href) ? <Link href={baris.href} className="rounded-sm font-medium text-primary hover:underline">Open</Link> : null}
                </li>
              )) : null}
            </ul>
          </Panel>
        ) : null}

        {fase !== "hari-h" && panelKelompok && kelompok ? (
          <GroupPanel
            title={panelKelompok.title}
            kolom={kelompok.kolom}
            baris={panelKelompok.baris}
            lebar={!panelSetup}
            className={cx("col-span-12", panelSetup && "lg:col-span-4")}
          />
        ) : null}

        {checkin.data && data ? (
          <DashboardCheckpoints data={checkin.data} gagal={checkin.gagal} eventDate={data.event.event_date} endDate={data.event.end_date} client={kustom} className="col-span-12" />
        ) : null}

        {/* Peluncur layar */}
        {kustom ? null : (
          <Panel title="Event-day screens" trailing={<span className="text-body-medium text-on-surface-variant">Open in a new tab</span>} className="col-span-12">
            <div className="grid grid-cols-2 gap-3 px-5 pb-5 pt-2 sm:grid-cols-3 lg:grid-cols-5">
              {layarPanggung.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-md border border-outline-variant px-3 py-3 hover:bg-primary-soft">
                  <Icon size={20} aria-hidden className="shrink-0 text-on-surface" />
                  <span className="min-w-0 flex-1 text-body-medium font-medium">{label}</span>
                  <ArrowSquareOut size={14} className="shrink-0 text-on-surface-variant" aria-label="New tab" />
                </Link>
              ))}
            </div>
            {/* Satu-satunya pintu yang selalu terlihat ke Booth & item di acara
                tanpa booth: menunya di sidebar sengaja disembunyikan sampai booth
                pertama dibuat. */}
            {data && !adaBooth ? (
              <p className="border-t border-outline-variant px-5 py-3 text-body-medium text-on-surface-variant">
                Selling at booths? Booth, cashier, and leaderboard screens appear after you create the first booth in{" "}
                <Link href="/admin/booths" className="rounded-sm font-medium text-primary hover:underline">Booths &amp; items</Link>.
              </p>
            ) : null}
          </Panel>
        )}
      </div>}
    </WorkspacePage>
  );
}
