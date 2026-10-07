"use client";

import { ArrowClockwise, CaretDown, CaretUp, Columns, Eye, MagnifyingGlass, UsersThree } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExportMenu } from "@/components/admin/export-menu";
import { UserMenu } from "@/components/admin/user-menu";
import { Banner, Button, CONTAINER_PADDING, EmptyState, IconButton, Pagination, Pane, PaneHeader, Skeleton, StatusChip, TopAppBar } from "@/components/m3";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import type { BarisKlien } from "@/lib/live/data";
import { DEFAULT_TIME_ZONE, normalizeTimeZone, timeZoneAbbr } from "@/lib/timezone";
import { KolomKlienDialog, type PertanyaanKlien } from "./kolom-klien";


type Data = {
  event: { name: string; slug: string; status: string; time_zone: string };
  counts: { registered: number; today: number; pending: number; checked_in: number };
  /** Pertanyaan form yang dibagikan admin, dalam urutan form. */
  answer_columns: { key: string; label: string }[];
  rows: BarisKlien[];
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
/**
 * Lebar kolom dalam rem, bukan px: dengan ukuran huruf peramban yang dibesarkan
 * (mis. 20 px), kolom ikut melebar bersama teksnya alih-alih memotongnya
 * (QA #101 L2). 72,5 rem = 1.160 px pada huruf 16 px.
 */
const LEBAR_KOLOM = [10.5, 9.125, 7.875, 12.5, 11.5, 5.25, 7.75, 8];
const LEBAR_INTI = LEBAR_KOLOM.reduce((a, b) => a + b, 0);
const LEBAR_JAWABAN = 11.5;

export function LiveClient({ slug, eventName, username, role, preview, pengaturanKolom }: {
  slug: string;
  eventName: string;
  username: string;
  role: string;
  /** Admin yang membuka layar klien untuk melihat apa yang klien lihat. */
  preview: boolean;
  /** Hanya untuk admin: pertanyaan yang bisa dibagikan dan yang sudah dipilih. */
  pengaturanKolom?: { pertanyaan: PertanyaanKlien[]; dipilih: string[] };
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
  const kepalaRef = useRef<HTMLTableSectionElement>(null);
  const gulirRef = useRef<HTMLDivElement>(null);
  const salinanRef = useRef<HTMLDivElement>(null);
  // Salinan kepala tampil hanya saat kepala asli sudah lewat ke bawah bilah atas.
  const [menempel, setMenempel] = useState(false);
  // Kolom pertama ikut menempel di kiri saat tabel digeser; garis pemisahnya
  // hanya tampil kalau memang ada yang tergeser di bawahnya.
  const [digeser, setDigeser] = useState(false);
  const [aturKolom, setAturKolom] = useState(false);
  const [dipilih, setDipilih] = useState(pengaturanKolom?.dipilih ?? []);
  // Pertanyaan yang sudah dihapus dari form tidak dihitung.
  const dibagikan = pengaturanKolom ? pengaturanKolom.pertanyaan.filter((p) => dipilih.includes(p.key)).length : 0;

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
    // Daftar menyusut saat klien di halaman terakhir: pindah ke halaman terakhir
    // yang masih ada, bukan menampilkan tabel kosong (QA R2-L1).
    const halamanTerakhir = Math.max(1, Math.ceil(isi.total / UKURAN));
    if (page > halamanTerakhir) setPage(halamanTerakhir);
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

  const adaBaris = Boolean(data && data.rows.length > 0);
  useEffect(() => {
    const kepala = kepalaRef.current;
    if (!adaBaris || !kepala) return;
    // Tepi bawah bilah atas yang terukur, bukan --topbar-height: token itu
    // calc() sehingga parseFloat selalu jatuh ke angka cadangan.
    const bilah = kepala.closest(".press")?.querySelector("header");
    const periksa = () => setMenempel(kepala.getBoundingClientRect().top < (bilah?.getBoundingClientRect().bottom ?? 57));
    periksa();
    window.addEventListener("scroll", periksa, { passive: true });
    window.addEventListener("resize", periksa);
    return () => { window.removeEventListener("scroll", periksa); window.removeEventListener("resize", periksa); };
  }, [adaBaris]);

  const samakanGeser = () => {
    if (salinanRef.current && gulirRef.current) salinanRef.current.scrollLeft = gulirRef.current.scrollLeft;
    setDigeser((gulirRef.current?.scrollLeft ?? 0) > 0);
  };
  // Baris baru tiap 30 detik bisa mengubah lebar gulir; jaga salinan tetap sejajar.
  useEffect(samakanGeser, [data, menempel]);

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

  const kepala = (label: string, kunci?: Urut, salinan = false) => {
    if (!kunci) return label;
    const aktif = sort === kunci;
    return (
      <button type="button" tabIndex={salinan ? -1 : undefined} onClick={() => urutkan(kunci)} className="inline-flex items-center gap-1 rounded-sm hover:text-on-surface">
        {label}
        {aktif ? (dir === "asc" ? <CaretUp size={12} weight="bold" aria-hidden /> : <CaretDown size={12} weight="bold" aria-hidden />) : null}
      </button>
    );
  };
  const ariaSort = (kunci: Urut) => (sort === kunci ? (dir === "asc" ? "ascending" : "descending") : undefined);
  const jawaban = data?.answer_columns ?? [];
  // Dengan kolom jawaban, tabel tidak muat di jendela mana pun: selalu pakai
  // wadah geser dan salinan kepala, bukan <thead> sticky bawaan.
  const lebar = jawaban.length > 0;
  const lebarTabel = `${LEBAR_INTI + jawaban.length * LEBAR_JAWABAN}rem`;
  const selPertama = cx("sticky left-0 z-[1] border-b border-outline-variant px-4 py-0", digeser && "border-r");
  const barisKepala = (salinan: boolean) => (
      <tr className="h-10">
        <th scope="col" aria-sort={salinan ? undefined : ariaSort("name")} className={cx(selPertama, "bg-surface-container-high font-medium")}>{kepala("Name", "name", salinan)}</th>
        <th scope="col" aria-sort={salinan ? undefined : ariaSort("company")} className="border-b border-outline-variant px-3 py-0 font-medium">{kepala("Organisation", "company", salinan)}</th>
        <th scope="col" className="border-b border-outline-variant px-3 py-0 font-medium">Job title</th>
        <th scope="col" className="border-b border-outline-variant px-3 py-0 font-medium">Email</th>
        <th scope="col" className="border-b border-outline-variant px-3 py-0 font-medium">Phone</th>
        <th scope="col" className="border-b border-outline-variant px-3 py-0 font-medium">Type</th>
        <th scope="col" aria-sort={salinan ? undefined : ariaSort("registered_at")} className="border-b border-outline-variant px-3 py-0 font-medium">{kepala("Registered", "registered_at", salinan)}</th>
        <th scope="col" className="border-b border-outline-variant px-3 py-0 font-medium">Check-in</th>
        {jawaban.map((k) => (
          <th key={k.key} scope="col" title={k.label} className="truncate border-b border-outline-variant px-3 py-0 font-medium">{k.label}</th>
        ))}
      </tr>
  );
  const kolom = (
    <colgroup>
      {/* 1.160 px: muat di panel pada jendela 1280 yang memakai scrollbar (isi
          1.265 px). Phone 184: nomor dengan spasi/strip seperti
          "+62 812-3456-78901" tampil utuh (laporan 7 Okt, QA #101 M1). Check-in
          128: chip "Checked in" muat, kepala salinan tidak bergeser (L2). */}
      {LEBAR_KOLOM.map((lebar, i) => <col key={i} style={{ width: `${lebar}rem` }} />)}
      {jawaban.map((k) => <col key={k.key} style={{ width: `${LEBAR_JAWABAN}rem` }} />)}
    </colgroup>
  );
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
            {/* Tetap tampil di ponsel: tanpa ini klien tidak tahu angkanya basi. */}
            <span className={cx("flex items-center gap-2 whitespace-nowrap text-body-medium", gagal ? "text-error" : "text-on-surface-variant")} aria-live="polite">
              <span aria-hidden className={cx("size-2 rounded-full", gagal ? "bg-error" : "bg-success")} />
              {/* Satu span: anak langsung flex dipisah gap-2, jadi "Updated", jam dan zona
                harus satu node teks supaya spasinya tunggal (QA R2-L3). */}
              <span>{gagal ? "Couldn't refresh" : data ? <><span className="max-sm:hidden">Updated </span>{jam(data.fetched_at)}<span className="max-sm:hidden"> {timeZoneAbbr(zona)}</span></> : "Loading…"}</span>
            </span>
            <IconButton label="Refresh now" onClick={() => void muat()} disabled={memuat}>
              <ArrowClockwise size={20} className={cx(memuat && "animate-spin")} />
            </IconButton>
            <UserMenu username={username} role={role} onLogout={logout} loggingOut={keluar} />
          </div>
        }
      />

      {/* Padding dan lebar maksimum persis seperti TopAppBar (padding di luar,
          1280 di dalam), supaya judul, kartu, dan tabel mulai di garis yang sama. */}
      <main className={cx(CONTAINER_PADDING, "pb-10 pt-4")}>
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
        {preview ? (
          <Banner tone="info" icon={<Eye size={18} />}>
            <span className="font-medium">This is what a Viewer account sees.</span> Give the client a Viewer account in Users &amp; roles to share this page.{" "}
            <a href={`/e/${encodeURIComponent(slug)}/admin`} className="font-medium text-primary underline">Back to admin</a>
          </Banner>
        ) : null}
        {pengaturanKolom ? (
          <KolomKlienDialog
            key={String(aturKolom)}
            open={aturKolom}
            onClose={() => setAturKolom(false)}
            slug={slug}
            pertanyaan={pengaturanKolom.pertanyaan}
            dipilih={dipilih}
            onSaved={(keys) => { setDipilih(keys); setAturKolom(false); void muat(); }}
          />
        ) : null}

        <section aria-label="Summary" className="grid grid-cols-3 gap-2 sm:gap-3">
          {tile.map((t) => (
            <div key={t.label} className="flex h-[88px] flex-col justify-center gap-0.5 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 sm:px-5">
              <span className="truncate text-body-medium font-medium text-on-surface-variant">{"pendek" in t ? <><span className="sm:hidden">{t.pendek}</span><span className="max-sm:hidden">{t.label}</span></> : t.label}</span>
              {t.nilai === undefined ? <Skeleton className="my-1 h-7 w-20" /> : <span className="text-headline-small font-semibold tabular-nums">{t.nilai.toLocaleString("en-GB")}</span>}
              <span className="hidden text-body-small text-on-surface-variant sm:block">{t.catatan}</span>
            </div>
          ))}
        </section>

        {/* overflow clip, bukan hidden: hidden menjadikan panel wadah gulir dan
            kepala tabel yang sticky berhenti menempel ke jendela. */}
        <Pane aria-label="Registered participants" className="!overflow-clip">
          <PaneHeader className="flex-wrap gap-2 px-3 py-3">
            <label className="relative min-w-[200px] flex-1">
              <span className="sr-only">Search participants</span>
              <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, organisation or email…"
                className="h-9 w-full rounded-md border border-outline bg-surface-container-lowest pl-9 pr-3 text-body-medium outline-none placeholder:text-on-surface-variant focus:border-primary"
              />
            </label>
            <span className="px-1 text-body-medium text-on-surface-variant tabular-nums">
              {data ? plural(data.total, "participant", "participants") : ""}
            </span>
            {pengaturanKolom ? (
              // Hanya admin. Jumlah di label: admin tahu sekilas apakah ada jawaban
              // form yang sedang terbuka untuk klien.
              <Button variant="outlined" icon={<Columns size={18} />} onClick={() => setAturKolom(true)}>
                Form answers{dibagikan > 0 ? ` · ${dibagikan}` : ""}
              </Button>
            ) : null}
            <ExportMenu endpoint={`/e/${encodeURIComponent(slug)}/api/live/export`} label="Download" />
          </PaneHeader>

          {/* Kepala tabel tetap terlihat saat halaman digulir (laporan 7 Okt).
              - Jendela >= 79,5 rem (1.272 px pada huruf 16 px): tabel muat, tidak ada wadah overflow, jadi
                <thead> asli cukup sticky di bawah bilah atas.
              - Lebih sempit: tabel perlu geser ke samping, dan sticky tidak bisa
                keluar dari wadah overflow-x. Salinan kepala di luar wadah itu
                menempel di bawah bilah atas, muncul hanya setelah kepala asli
                lewat, dan ikut geser ke samping bersama tabel. Salinannya
                aria-hidden; pembaca layar dan keyboard memakai kepala asli. */}
          {data && data.rows.length > 0 ? (
            <div aria-hidden className={cx("sticky top-[var(--topbar-height)] z-10 -mb-10 h-10", !lebar && "min-[79.5rem]:hidden", !menempel && "invisible")}>
              <div ref={salinanRef} className="overflow-hidden">
                <table style={{ minWidth: lebarTabel }} className="w-full table-fixed border-separate border-spacing-0 text-left text-body-medium">
                  {kolom}
                  <thead className="bg-surface-container-high text-body-medium font-medium text-on-surface-variant">{barisKepala(true)}</thead>
                </table>
              </div>
            </div>
          ) : null}
          <div ref={gulirRef} onScroll={samakanGeser} className={cx("overflow-x-auto", !lebar && "min-[79.5rem]:overflow-visible")}>
            {gagal && !data ? (
              <EmptyState plain icon={<UsersThree size={40} />} title="Couldn't load registrations" description="Check your connection. This page tries again every 30 seconds." />
            ) : !data ? (
              <div className="flex flex-col gap-3 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
            ) : data.rows.length === 0 ? (
              <EmptyState plain icon={<UsersThree size={40} />} title={cari ? "No matching participants" : "No registrations yet"} description={cari ? "Try another name, organisation or email." : "New registrations appear here on their own."} />
            ) : (
              <table style={{ minWidth: lebarTabel }} className={cx("w-full table-fixed border-separate border-spacing-0 text-left text-body-medium", memuat && "opacity-80")}>
                {kolom}
                <thead ref={kepalaRef} className={cx("bg-surface-container-high text-body-medium font-medium text-on-surface-variant", !lebar && "min-[79.5rem]:sticky min-[79.5rem]:top-[var(--topbar-height)] min-[79.5rem]:z-10")}>
                  {barisKepala(false)}
                </thead>
                <tbody>
                  {data.rows.map((baris) => {
                    // Dibandingkan sebagai waktu, bukan teks ISO: Postgres menulis "+00:00",
                    // JavaScript menulis "Z" (QA PR #100, L7).
                    const baru = batasBaru !== null && Date.parse(baris.registered_at) > Date.parse(batasBaru);
                    return (
                      <tr key={baris.id} className={cx("h-10", baru ? "bg-primary-soft" : "bg-surface-container-lowest")}>
                        <td className={cx(selPertama, "truncate font-medium", baru ? "bg-primary-soft" : "bg-surface-container-lowest")} title={baris.name}>{baris.name}</td>
                        <td className="truncate border-b border-outline-variant px-3 py-0" title={baris.company ?? undefined}>{baris.company || <Kosong />}</td>
                        <td className="truncate border-b border-outline-variant px-3 py-0 text-on-surface-variant" title={baris.title ?? undefined}>{baris.title || <Kosong />}</td>
                        <td className="truncate border-b border-outline-variant px-3 py-0" title={baris.email ?? undefined}>{baris.email || <Kosong />}</td>
                        <td className="truncate border-b border-outline-variant px-3 py-0 tabular-nums text-on-surface-variant" title={baris.phone ?? undefined}>{baris.phone || <Kosong />}</td>
                        <td className="truncate border-b border-outline-variant px-3 py-0" title={baris.participant_type ?? undefined}>{baris.participant_type || <Kosong />}</td>
                        <td className="truncate border-b border-outline-variant px-3 py-0 tabular-nums">
                          {tanggalJam(baris.registered_at)}
                          {baru ? <StatusChip tone="primary" className="ml-2 align-middle">New</StatusChip> : null}
                        </td>
                        <td className="border-b border-outline-variant px-3 py-0">
                          {baris.checked_in ? <StatusChip dot tone="success" className="align-middle">Checked in</StatusChip> : <span className="text-on-surface-variant">Not yet</span>}
                        </td>
                        {jawaban.map((k) => (
                          <td key={k.key} className="truncate border-b border-outline-variant px-3 py-0" title={baris.answers[k.key] || undefined}>{baris.answers[k.key] || <Kosong />}</td>
                        ))}
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
        </div>
      </main>
    </div>
  );
}

function Kosong() {
  return <span className="text-on-surface-variant">—</span>;
}
