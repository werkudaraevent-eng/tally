import {
  ArrowRight,
  CheckCircle,
  CircleNotch,
  CreditCard,
  MonitorPlay,
  QrCode,
  ShieldCheck,
  Storefront,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

const applications = [
  { label: "01 / Booth", title: "Capture every claim", detail: "Scan badge, confirm discount, print the moment into one clean order flow.", icon: Storefront, accent: "bg-[var(--brand)] text-white", meta: "Mobile portrait", href: "/booth" },
  { label: "02 / Cashier", title: "Settle without doubt", detail: "One participant view for partial selection, EDC approval, and payment control.", icon: CreditCard, accent: "bg-[var(--ink)] text-white", meta: "Tablet ready", href: "/cashier" },
  { label: "03 / Live Display", title: "Make momentum visible", detail: "A high-contrast leaderboard built for a room, not a browser tab.", icon: MonitorPlay, accent: "bg-[var(--warning)] text-white", meta: "1920 × 1080", href: "/display?fullscreen=1" },
];

const rules = [
  ["01", "QR is identity", "Every badge maps to one participant record."],
  ["02", "Discount stays fair", "Database constraint blocks duplicate claims per booth."],
  ["03", "Numbers stay clean", "Leaderboard counts regular spend, not the Rp1 token."],
];

export default function Home() {
  return (
    <main className="min-h-dvh overflow-hidden bg-[var(--background)] text-[var(--ink)]">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col px-5 py-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-[var(--line)] pb-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--brand)] text-white shadow-[0_8px_18px_rgba(38,73,208,0.18)]"><QrCode size={24} weight="bold" aria-hidden="true" /></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--ink-muted)]">Tally</p><p className="text-sm font-semibold tracking-tight">Event Transaction Hub</p></div>
          </div>
          <div className="hidden items-center gap-3 text-right sm:flex"><span className="size-2 rounded-full bg-[var(--success)]" aria-hidden="true" /><div><p className="text-xs font-semibold">System blueprint</p><p className="text-[11px] text-[var(--ink-muted)]">Event operations suite</p></div></div>
        </header>

        <section className="grid flex-1 items-center gap-14 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20 lg:py-24">
          <div className="max-w-3xl">
            <div className="mb-7 inline-flex items-center gap-2 border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-strong)]"><span className="size-2 rounded-full bg-[var(--success)]" aria-hidden="true" />05 August 2026 · Jakarta</div>
            <h1 className="max-w-3xl text-[clamp(3.25rem,8vw,7.8rem)] font-semibold leading-[0.9] tracking-[-0.075em]">Every handoff,<br /><span className="text-[var(--brand)]">accounted for.</span></h1>
            <p className="mt-8 max-w-xl text-lg leading-8 text-[var(--ink-muted)] sm:text-xl">A single operational layer for six booths, one central cashier, and a room-wide leaderboard. Built to keep live event decisions calm, visible, and exact.</p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row"><a href="#applications" className="group inline-flex min-h-14 items-center justify-center gap-3 bg-[var(--brand)] px-6 text-sm font-semibold text-white transition-transform duration-200 hover:bg-[var(--brand-strong)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand)]">Explore system <ArrowRight size={18} weight="bold" className="transition-transform group-hover:translate-x-1" aria-hidden="true" /></a><div className="inline-flex min-h-14 items-center gap-3 border border-[var(--line)] bg-white px-5 text-sm text-[var(--ink-muted)]"><ShieldCheck size={20} weight="duotone" className="text-[var(--brand)]" aria-hidden="true" />Server-enforced rules</div></div>
          </div>

          <div className="relative lg:justify-self-end"><div className="absolute -right-16 -top-16 hidden size-56 rounded-full border border-[var(--line)] lg:block" aria-hidden="true" /><div className="relative border border-[var(--ink)] bg-[var(--ink)] p-6 text-[var(--display-ink)] sm:p-8">
            <div className="flex items-start justify-between border-b border-white/15 pb-6"><div><p className="text-[11px] uppercase tracking-[0.2em] text-white/55">Live operating picture</p><p className="mt-2 text-2xl font-semibold tracking-tight">The room is moving.</p></div><CircleNotch size={22} className="animate-spin text-[var(--warning)]" aria-label="Live refresh" /></div>
            <div className="grid grid-cols-2 border-b border-white/15 py-7"><div className="border-r border-white/15 pr-5"><p className="text-5xl font-semibold tabular-nums tracking-[-0.06em] sm:text-6xl">06</p><p className="mt-2 text-xs uppercase tracking-[0.16em] text-white/55">Active booths</p></div><div className="pl-5"><p className="text-5xl font-semibold tabular-nums tracking-[-0.06em] sm:text-6xl">01</p><p className="mt-2 text-xs uppercase tracking-[0.16em] text-white/55">Central cashier</p></div></div>
            <div className="space-y-4 pt-6"><div className="flex items-center justify-between text-sm"><span className="text-white/60">Order visibility</span><span className="flex items-center gap-2 font-semibold"><CheckCircle size={17} weight="fill" className="text-[var(--success)]" />Live</span></div><div className="flex items-center justify-between text-sm"><span className="text-white/60">Discount protection</span><span className="font-semibold text-[var(--warning)]">Database lock</span></div><div className="h-1 overflow-hidden bg-white/10"><div className="h-full w-[72%] bg-[var(--warning)]" /></div></div>
            <div className="mt-8 flex items-center justify-between border-t border-white/15 pt-5 text-xs text-white/55"><span>TALLY EVENT SYSTEM</span><span>WIB / 14:47</span></div>
          </div></div>
        </section>

        <section id="applications" className="border-t border-[var(--line)] py-12 lg:py-16"><div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">One codebase / four surfaces</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">Designed around the handoff.</h2></div><p className="max-w-xs text-sm leading-6 text-[var(--ink-muted)]">Each surface has one job. Together, they create one reliable event ledger.</p></div><div className="grid gap-px border border-[var(--line)] bg-[var(--line)] md:grid-cols-3">{applications.map(({ label, title, detail, icon: Icon, accent, meta, href }) => <Link href={href} key={label} className="group bg-[var(--surface)] p-6 transition-colors hover:bg-[#FAFBF8] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--brand)] sm:p-7"><div className="flex items-start justify-between"><div className={`flex size-12 items-center justify-center ${accent}`}><Icon size={24} weight="duotone" aria-hidden="true" /></div><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">{meta}</span></div><p className="mt-12 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">{label}</p><h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{title}</h3><p className="mt-3 min-h-20 text-sm leading-6 text-[var(--ink-muted)]">{detail}</p><div className="mt-7 flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">Open surface <ArrowRight size={16} weight="bold" aria-hidden="true" /></div></Link>)}</div></section>

        <section className="grid gap-10 border-t border-[var(--line)] py-12 lg:grid-cols-[0.75fr_1.25fr] lg:py-16"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Operating principles</p><h2 className="mt-3 max-w-sm text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">Calm systems make fast teams.</h2></div><div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">{rules.map(([number, title, detail]) => <div key={number} className="grid gap-4 py-5 sm:grid-cols-[72px_1fr_1fr] sm:items-center"><span className="text-xs font-semibold tracking-[0.16em] text-[var(--brand)]">{number}</span><h3 className="font-semibold">{title}</h3><p className="text-sm leading-6 text-[var(--ink-muted)]">{detail}</p></div>)}</div></section>

        <footer className="flex flex-col justify-between gap-3 border-t border-[var(--line)] py-6 text-xs text-[var(--ink-muted)] sm:flex-row"><span>TALLY / BOOTH TRANSACTION & LEADERBOARD SYSTEM</span><span>Event Transaction Hub</span></footer>
      </div>
    </main>
  );
}
