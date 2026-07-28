import {
  ArrowRight,
  CreditCard,
  MonitorPlay,
  QrCode,
  ShieldCheck,
  SignIn,
  Storefront,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

const workspaces = [
  { label: "Admin Booth", detail: "Scan badge peserta, buat order, dan serahkan barang.", icon: Storefront, accent: "bg-[var(--brand)] text-white", device: "Optimal di HP", href: "/booth" },
  { label: "Kasir", detail: "Terima pembayaran EDC atau tunai dan kelola antrean.", icon: CreditCard, accent: "bg-[var(--ink)] text-white", device: "HP atau tablet", href: "/cashier" },
  { label: "Panitia / Admin", detail: "Pantau transaksi, kelola booth, user, dan tampilan display.", icon: ShieldCheck, accent: "bg-[var(--brand-strong)] text-white", device: "Optimal di laptop", href: "/admin" },
  { label: "Live Display", detail: "Leaderboard top spender untuk ditayangkan di proyektor.", icon: MonitorPlay, accent: "bg-[var(--warning)] text-white", device: "Layar 1920 × 1080", href: "/display" },
];

export default function Home() {
  return (
    <main className="min-h-dvh bg-[var(--background)] text-[var(--ink)]">
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-5 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] text-white"><QrCode size={24} weight="bold" aria-hidden="true" /></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--ink-muted)]">Tally</p><p className="text-sm font-semibold tracking-tight">Event Transaction Hub</p></div>
          </div>
          <Link href="/login" className="flex min-h-12 items-center gap-2 bg-[var(--brand)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">
            <SignIn size={19} weight="bold" aria-hidden="true" /> Masuk
          </Link>
        </header>

        <section className="py-12 sm:py-16">
          <h1 className="max-w-2xl text-4xl font-semibold leading-[1.05] tracking-[-0.05em] sm:text-5xl">Pilih workspace Anda.</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[var(--ink-muted)]">Login sekali dengan username dan PIN panitia. Sistem otomatis mengarahkan Anda ke halaman sesuai peran akun.</p>
        </section>

        <section className="pb-12">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Workspace</h2>
          <div className="mt-4 grid gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2">
            {workspaces.map(({ label, detail, icon: Icon, accent, device, href }) => <Link key={label} href={href} className="group flex flex-col bg-[var(--surface)] p-6 transition-colors hover:bg-[var(--surface-muted)] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--brand)]">
              <div className="flex items-start justify-between gap-3">
                <div className={`flex size-11 shrink-0 items-center justify-center ${accent}`}><Icon size={23} weight="duotone" aria-hidden="true" /></div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">{device}</span>
              </div>
              <p className="mt-6 text-lg font-semibold tracking-[-0.02em]">{label}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">{detail}</p>
              <span className="mt-5 flex items-center gap-2 text-sm font-semibold text-[var(--brand)]">Buka <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
            </Link>)}
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[var(--ink-muted)]">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[var(--brand)]" aria-hidden="true" />
            Setiap halaman memeriksa peran Anda di server. Jika belum login, Anda akan diarahkan ke halaman masuk.
          </p>
        </section>

        <footer className="mt-auto border-t border-[var(--line)] py-6 text-xs text-[var(--ink-muted)]">Tally — sistem pencatatan transaksi booth dan leaderboard acara.</footer>
      </div>
    </main>
  );
}
