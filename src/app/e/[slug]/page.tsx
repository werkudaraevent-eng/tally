import { ArrowLeft, GearSix, MonitorPlay, Storefront } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";
import { requireEventScope } from "@/lib/auth/event-scope";

export default async function EventWorkspace({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { slug } = await params;
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

  return <main className="min-h-dvh bg-[var(--background)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:py-10"><div className="mx-auto max-w-[1100px]">
    <Link href="/events" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand)]"><ArrowLeft size={18} /> Semua event</Link>
    <header className="mt-5 border-b border-[var(--line)] pb-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><span className="border border-[var(--line)] px-2 py-1 text-xs font-semibold uppercase">{event.status}</span><h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em]">{event.name}</h1><p className="mt-3 text-sm text-[var(--ink-muted)]">Workspace terisolasi · {event.slug}</p></div>{role === "super_admin" || role === "admin" ? <Link href={`/e/${slug}/admin/settings`} className="flex min-h-11 items-center gap-2 border border-[var(--line)] px-4 text-sm font-semibold"><GearSix size={18} /> Konfigurasi event</Link> : null}</div></header>
    {banner && <div className="mt-6 border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-4 text-sm"><strong>{banner.judul}</strong> {banner.teks}</div>}
    <section className="mt-8 grid gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-3">
      {(role === "admin" || role === "super_admin") && <Link href={`/e/${slug}/admin`} aria-disabled={isDraft} className={`bg-[var(--surface)] p-6 ${isDraft ? "pointer-events-none opacity-45" : "hover:bg-[var(--surface-muted)]"}`}><GearSix size={26} className="text-[var(--brand)]" /><h2 className="mt-8 text-lg font-semibold">Admin</h2><p className="mt-2 text-sm text-[var(--ink-muted)]">{isFrozen ? "Baca laporan, peserta, dan transaksi. Ekspor tetap tersedia." : "Peserta, booth, transaksi, laporan, dan CMS."}</p></Link>}
      {/* Booth diredupkan pada event selesai, TIDAK seperti Admin: layar booth
          hanya berguna untuk mencatat transaksi baru, dan itu memang ditolak
          server. Membiarkannya terbuka hanya mengantar operator ke penolakan. */}
      {(role === "booth" || role === "admin" || role === "super_admin") && <Link href={`/e/${slug}/booth`} aria-disabled={isDraft || isFrozen} className={`bg-[var(--surface)] p-6 ${isDraft || isFrozen ? "pointer-events-none opacity-45" : "hover:bg-[var(--surface-muted)]"}`}><Storefront size={26} className="text-[var(--brand)]" /><h2 className="mt-8 text-lg font-semibold">Booth</h2><p className="mt-2 text-sm text-[var(--ink-muted)]">{role === "booth" ? "Scan peserta dan catat transaksi." : "Bantu booth di lapangan. Pilih booth dulu di layarnya."}</p></Link>}
      <Link href={`/e/${slug}/display`} className="bg-[var(--surface)] p-6 hover:bg-[var(--surface-muted)]"><MonitorPlay size={26} className="text-[var(--brand)]" /><h2 className="mt-8 text-lg font-semibold">Display publik</h2><p className="mt-2 text-sm text-[var(--ink-muted)]">Leaderboard untuk layar acara.</p></Link>
    </section>
  </div></main>;
}