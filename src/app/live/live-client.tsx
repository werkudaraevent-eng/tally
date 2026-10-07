"use client";

import { ArrowClockwise, CaretDown, CaretUp, Eye, MagnifyingGlass, UsersThree } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExportMenu } from "@/components/admin/export-menu";
import { UserMenu } from "@/components/admin/user-menu";
import { Banner, EmptyState, IconButton, Pagination, Pane, PaneHeader, Skeleton, StatusChip, TopAppBar } from "@/components/m3";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import { DEFAULT_TIME_ZONE, normalizeTimeZone, timeZoneAbbr } from "@/lib/timezone";

type Baris = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  participant_type: string | null;
  registered_at: string | null;
  registered_via: "form" | "added";
  removed: boolean;
  checked_in: boolean;
};

type Data = {
  event: { name: string; slug: string; status: string; time_zone: string };
  counts: { registered: number; today: number; pending: number; checked_in: number };
  rows: Baris[];
  total: number;
  fetched_at: string;
};

type Urut = "registered_at" | "name" | "company";

/**
 * Selang muat ulang. 30 detik: cukup cepat untuk "baru saja ada yang daftar"
 * saat klien membuka layar ini di rapat, cukup lambat untuk tidak membebani
 * database ketika tab dibiarkan terbuka seharian. Tab yang tersembunyi tidak
 * memuat sama sekali, dan langsung memuat begitu dibuka lagi.
 */
const SELANG_MS = 30_000;
const UKURAN = 50;

export function LiveClient({ slug, eventName, username, role, preview }: {
  slug: string;
  eventName: string;
  username: string;
  role: string;
  /** Admin yang membuka layar klien untuk melihat apa yang klien lihat. */
  preview: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [gagal, setGagal] = useState(false);
  const [memuat, setMemuat] = useState(false);
  const [query, setQuery] = useState("");
  const [cari, setCari] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Urut>("registered_at");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [keluar, setKeluar] = useState(false);
  // Batas "baru": baris yang masuk setelah muatan pertama diberi penanda,
  // supaya klien yang membiarkan layar terbuka melihat siapa yang baru datang.
  const [batasBaru, setBatasBaru] = useState<string | null>(null);
  const urutan = useRef(0);

  useEffect(() => {
    const pewaktu = window.setTimeout(() => { setCari(query.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(pewaktu);
  }, [query]);

  const muat = useCallback(async () => {
    const nomor = ++urutan.current;
    setMemuat(true);
    const params = new URLSearchParams({ q: cari, sort, dir, limit: String(UKURAN), offset: String((page - 1) * UKURAN) });
    const response = await fetch(`/e/${encodeURIComponent(slug)}/api/live?${params.toString()}`, { cache: "no-store" }).catch(() => null);
    if (nomor !== urutan.current) return;
    setMemuat(false);
    if (!response?.ok) { setGagal(true); return; }
    const isi = (await response.json()) as Data;
    setBatasBaru((lama) => lama ?? isi.fetched_at);
    setGagal(false);
    setData(isi);
  }, [slug, cari, sort, dir, page]);

  useEffect(() => {
    const awal = window.setTimeout(() => { void muat(); }, 0);
    const selang = window.setInterval(() => { if (document.visibilityState === "visible") void muat(); }, SELANG_MS);
    const terlihat = () => { if (document.visibilityState === "visible") void muat(); };
    document.addEventListener("visibilitychange", terlihat);
    return () => { window.clearTimeout(awal); window.clearInterval(selang); document.removeEventListener("visibilitychange", terlihat); };
  }, [muat]);

  const zona = data ? normalizeTimeZone(data.event.time_zone) : DEFAULT_TIME_ZONE;
  const jam = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zona });
  const tanggalJam = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zona });

  function urutkan(kunci: Urut) {
    if (sort === kunci) setDir(dir === "asc" ? "desc" : "asc");
    else { setSort(kunci); setDir(kunci === "registered_at" ? "desc" : "asc"); }
    setPage(1);
  }

  async function logout() {
    setKeluar(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const angka = data?.counts;
  const tile = [
    { label: "Registered", nilai: angka?.registered, catatan: angka ? (angka.today > 0 ? `+${angka.today.toLocaleString("en-GB")} today` : "None yet today") : "" },
    { label: "Awaiting approval", pendek: "Pending", nilai: angka?.pending, catatan: "Reviewed by the organiser" },
    { label: "Checked in", nilai: angka?.checked_in, catatan: angka ? `of ${angka.registered.toLocaleString("en-GB")} registered` : "" },
  ];

  const kepala = (label: string, kunci?: Urut) => {
    if (!kunci) return label;
    const aktif = sort === kunci;
    return (
      <button type="button" onClick={() => urutkan(kunci)} className="inline-flex items-center gap-1 rounded-sm hover:text-on-surface">
        {label}
        {aktif ? (dir === "asc" ? <CaretUp size={12} weight="bold" aria-hidden /> : <CaretDown size={12} weight="bold" aria-hidden />) : null}
      </button>
    );
  };
  const ariaSort = (kunci: Urut) => (sort === kunci ? (dir === "asc" ? "ascending" : "descending") : undefined);
  const pageCount = data ? Math.max(1, Math.ceil(data.total / UKURAN)) : 1;

  return (
    <div className="press min-h-dvh bg-surface text-on-surface">
      <TopAppBar
        title={eventName}
        subtitle="Registrations · view only"
        subtitleClassName="!font-normal"
        maxWidth="1280px"
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 text-body-medium text-on-surface-variant sm:flex" aria-live="polite">
              <span aria-hidden className={cx("size-2 rounded-full", gagal ? "bg-error" : "bg-success")} />
              {gagal ? "Couldn't refresh" : data ? `Updated ${jam(data.fetched_at)} ${timeZoneAbbr(zona)}` : "Loading…"}
            </span>
            <IconButton label="Refresh now" onClick={() => void muat()} disabled={memuat}>
              <ArrowClockwise size={20} className={cx(memuat && "animate-spin")} />
            </IconButton>
            <UserMenu username={username} role={role} onLogout={logout} loggingOut={keluar} />
          </div>
        }
      />

      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 pb-10 pt-4 sm:px-6 lg:px-8">
        {preview ? (
          <Banner tone="info" icon={<Eye size={18} />}>
            <span className="font-medium">This is what a Viewer account sees.</span> Give the client a Viewer account in Users &amp; roles to share this page.{" "}
            <a href={`/e/${encodeURIComponent(slug)}/admin`} className="font-medium text-primary underline">Back to admin</a>
          </Banner>
        ) : null}

        <section aria-label="Summary" className="grid grid-cols-3 gap-2 sm:gap-3">
          {tile.map((t) => (
            <div key={t.label} className="flex flex-col gap-0.5 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-3 sm:px-5">
              <span className="truncate text-body-medium font-medium text-on-surface-variant">{"pendek" in t ? <><span className="sm:hidden">{t.pendek}</span><span className="max-sm:hidden">{t.label}</span></> : t.label}</span>
              {t.nilai === undefined ? <Skeleton className="my-1 h-7 w-20" /> : <span className="text-headline-small font-semibold tabular-nums">{t.nilai.toLocaleString("en-GB")}</span>}
              <span className="hidden text-body-small text-on-surface-variant sm:block">{t.catatan}</span>
            </div>
          ))}
        </section>

        <Pane aria-label="Registered participants">
          <PaneHeader className="flex-wrap gap-2 px-3 py-3">
            <label className="relative min-w-[200px] flex-1">
              <span className="sr-only">Search participants</span>
              <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or organisation…"
                className="h-9 w-full rounded-md border border-outline bg-surface-container-lowest pl-9 pr-3 text-body-medium outline-none placeholder:text-on-surface-variant focus:border-primary"
              />
            </label>
            <span className="px-1 text-body-medium text-on-surface-variant tabular-nums">
              {data ? plural(data.total, "participant", "participants") : ""}
            </span>
            <ExportMenu endpoint={`/e/${encodeURIComponent(slug)}/api/live/export`} label="Download" />
          </PaneHeader>

          <div className="overflow-x-auto">
            {gagal && !data ? (
              <EmptyState plain icon={<UsersThree size={40} />} title="Couldn't load registrations" description="Check your connection. This page tries again every 30 seconds." />
            ) : !data ? (
              <div className="flex flex-col gap-3 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
            ) : data.rows.length === 0 ? (
              <EmptyState plain icon={<UsersThree size={40} />} title={cari ? "No matching participants" : "No registrations yet"} description={cari ? "Try another name or organisation." : "New registrations appear here on their own."} />
            ) : (
              <table className={cx("w-full min-w-[1060px] table-fixed border-separate border-spacing-0 text-left text-body-medium", memuat && "opacity-80")}>
                <colgroup>
                  <col style={{ width: 220 }} /><col style={{ width: 200 }} /><col style={{ width: 160 }} /><col style={{ width: 220 }} /><col style={{ width: 140 }} /><col style={{ width: 180 }} /><col style={{ width: 110 }} />
                </colgroup>
                <thead className="bg-surface-container-high text-body-medium font-medium text-on-surface-variant">
                  <tr>
                    <th scope="col" aria-sort={ariaSort("name")} className="border-b border-outline-variant px-4 py-2.5 font-medium">{kepala("Name", "name")}</th>
                    <th scope="col" aria-sort={ariaSort("company")} className="border-b border-outline-variant px-3 py-2.5 font-medium">{kepala("Organisation", "company")}</th>
                    <th scope="col" className="border-b border-outline-variant px-3 py-2.5 font-medium">Job title</th>
                    <th scope="col" className="border-b border-outline-variant px-3 py-2.5 font-medium">Email</th>
                    <th scope="col" className="border-b border-outline-variant px-3 py-2.5 font-medium">Phone</th>
                    <th scope="col" aria-sort={ariaSort("registered_at")} className="border-b border-outline-variant px-3 py-2.5 font-medium">{kepala("Registered", "registered_at")}</th>
                    <th scope="col" className="border-b border-outline-variant px-3 py-2.5 font-medium">Check-in</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((baris) => {
                    const baru = Boolean(batasBaru && baris.registered_at && baris.registered_at > batasBaru);
                    return (
                      <tr key={baris.id} className={cx(baru ? "bg-primary-soft" : "bg-surface-container-lowest", baris.removed && "text-on-surface-variant")}>
                        <td className="truncate border-b border-outline-variant px-4 py-2.5 font-medium" title={baris.name}>{baris.name}</td>
                        <td className="truncate border-b border-outline-variant px-3 py-2.5" title={baris.company ?? undefined}>{baris.company || <Kosong />}</td>
                        <td className="truncate border-b border-outline-variant px-3 py-2.5 text-on-surface-variant" title={baris.title ?? undefined}>{baris.title || <Kosong />}</td>
                        <td className="truncate border-b border-outline-variant px-3 py-2.5" title={baris.email ?? undefined}>{baris.email || <Kosong />}</td>
                        <td className="truncate border-b border-outline-variant px-3 py-2.5 tabular-nums text-on-surface-variant">{baris.phone || <Kosong />}</td>
                        <td className="truncate border-b border-outline-variant px-3 py-2.5 tabular-nums">
                          {baris.registered_at ? tanggalJam(baris.registered_at) : <Kosong />}
                          {baru ? <StatusChip tone="primary" className="ml-2">New</StatusChip> : null}
                        </td>
                        <td className="border-b border-outline-variant px-3 py-2.5">
                          {baris.checked_in ? <StatusChip dot tone="success">Checked in</StatusChip> : <span className="text-on-surface-variant">Not yet</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Pane>

        {data && data.total > UKURAN ? (
          <Pagination className="mt-0" page={page} pageCount={pageCount} total={data.total} pageSize={UKURAN} onChange={setPage} />
        ) : null}
        <p className="text-body-small text-on-surface-variant">
          Times are in {timeZoneAbbr(zona)}. This page refreshes every 30 seconds while it is open.
        </p>
      </main>
    </div>
  );
}

function Kosong() {
  return <span className="text-on-surface-variant">—</span>;
}
