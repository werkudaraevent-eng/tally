import { ArrowLeft, GearSix, Storefront } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";
import { requireEventScope } from "@/lib/auth/event-scope";

/**
 * Pemilih layar panitia untuk satu acara.
 *
 * Pindah ke sini dari `/e/<slug>` karena alamat itu sekarang menjadi landing
 * page publik. Alasannya bukan estetika: `/e/<slug>` adalah alamat yang dicetak
 * di undangan dan QR, dan tamu yang memotong bagian belakang alamat mana pun
 * harus mendarat di halaman publik — bukan di layar login panitia.
 *
 * Slug datang dari query, bukan dari params: `/e/<slug>/workspace` di-rewrite
 * proxy menjadi `/workspace?eventSlug=<slug>`, pola yang sama dengan seluruh
 * layar ber-scope event lainnya.
 */
export default async function EventWorkspace({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const raw = params.eventSlug;
  const slug = Array.isArray(raw) ? raw[0] : raw;
  if (!slug) notFound();
  const resolved = await requireEventScope(slug);
  if (resolved.response) {
    if (resolved.response.status === 404) notFound();
    if (resolved.response.status === 403) redirect("/events");
    throw new Error("Event gagal dimuat.");
  }
  const { event, role } = resolved.scope;

  // Dua hal BERBEDA yang dulu digabung jadi satu `canOperate`:
  //
  // - draft belum boleh dipakai sama sekali (booth & pengaturan belum siap), jadi
  //   kartunya diredupkan;
  // - completed/archived tetap boleh DIBUKA untuk membaca laporan dan mengekspor
  //   -- justru itu gunanya menutup event. Meredupkannya membuat panitia mengira
  //   datanya hilang, lalu mengaktifkan ulang event hanya untuk melihat laporan.
  //
  // Yang mencegah perubahan data pada event selesai bukan peredupan ini (itu cuma
  // CSS, URL-nya tetap bisa diketik) melainkan isWriteBlocked() di server.
  const isDraft = event.status === "draft";
  const isFrozen = event.status === "completed" || event.status === "archived";
  const banner = isDraft
    ? { judul: "Event masih draft.", teks: "Siapkan konfigurasi dan user sebelum diaktifkan. Transaksi belum dibuka." }
    : isFrozen
      ? { judul: `Event sudah ${event.status === "archived" ? "diarsipkan" : "selesai"}.`, teks: "Laporan dan data lama tetap bisa dibuka serta diekspor. Transaksi baru ditolak." }
      : null;

  return <main className="min-h-dvh bg-surface px-5 py-6 text-on-surface sm:px-8 lg:py-10"><div className="mx-auto max-w-[1100px]">
    <Link href="/events" className="inline-flex min-h-11 items-center gap-2 text-body-medium font-semibold text-primary"><ArrowLeft size={18} /> Semua event</Link>
    <header className="mt-5 border-b border-outline-variant pb-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><span className="rounded-sm border border-outline-variant px-2 py-1 text-body-small font-semibold uppercase">{event.status}</span><h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em]">{event.name}</h1><p className="mt-3 text-body-medium text-on-surface-variant">Workspace terisolasi · {event.slug}</p></div>{role === "super_admin" || role === "admin" ? <Link href={`/e/${slug}/admin/settings`} className="rounded-md flex min-h-11 items-center gap-2 border border-outline-variant px-4 text-body-medium font-semibold"><GearSix size={18} /> Konfigurasi event</Link> : null}</div></header>
    {banner && <div className="rounded-lg mt-6 border border-warning/30 bg-warning/5 p-4 text-body-medium"><strong>{banner.judul}</strong> {banner.teks}</div>}
    <section className="mt-8 grid gap-4 sm:grid-cols-2">
      {(role === "admin" || role === "super_admin") && <Link href={`/e/${slug}/admin`} aria-disabled={isDraft} className={`rounded-lg bg-panel p-6 ${isDraft ? "pointer-events-none opacity-45" : "hover:bg-panel-high"}`}><GearSix size={26} className="text-primary" /><h2 className="mt-8 text-lg font-semibold">Admin</h2><p className="mt-2 text-body-medium text-on-surface-variant">{isFrozen ? "Baca laporan, peserta, dan transaksi. Ekspor tetap tersedia." : "Peserta, booth, transaksi, laporan, dan CMS."}</p></Link>}
      {/* Booth diredupkan pada event selesai, TIDAK seperti Admin: layar booth
          hanya berguna untuk mencatat transaksi baru, dan itu memang ditolak
          server. Membiarkannya terbuka hanya mengantar operator ke penolakan. */}
      {(role === "booth" || role === "admin" || role === "super_admin") && <Link href={`/e/${slug}/booth`} aria-disabled={isDraft || isFrozen} className={`rounded-lg bg-panel p-6 ${isDraft || isFrozen ? "pointer-events-none opacity-45" : "hover:bg-panel-high"}`}><Storefront size={26} className="text-primary" /><h2 className="mt-8 text-lg font-semibold">Booth</h2><p className="mt-2 text-body-medium text-on-surface-variant">{role === "booth" ? "Scan peserta dan catat transaksi." : "Bantu booth di lapangan. Pilih booth dulu di layarnya."}</p></Link>}
      {/* TIDAK ada kartu "Display publik" di sini, dan itu disengaja.
          Aplikasi ini kini punya banyak layar publik — leaderboard, denah,
          rundown, undian, voting — sementara kartu itu hanya menunjuk salah
          satunya. Satu pintasan yang mewakili sebagian kecil pilihan lebih
          menyesatkan daripada tidak ada pintasan sama sekali; seluruh layar
          dibuka dari halamannya masing-masing di dalam Admin, tempat panitia
          juga mengatur isinya. */}
    </section>
  </div></main>;
}