import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarBlank, ChartBar, House, UserCircle } from "@phosphor-icons/react/dist/ssr";
import { initials } from "@/lib/member/schedule";

/**
 * Kerangka area peserta: bilah atas dengan tab di layar lebar, bilah tab di
 * bawah di ponsel (desain Figma "Area peserta", 22:113).
 *
 * "Jadwal" dan "Voting" membuka halaman yang sudah ada (/rundown, /vote), bukan
 * salinan di dalam area peserta: satu jadwal, satu tempat menyuntingnya.
 */

export type MemberTab = "beranda" | "profil";

export function MemberShell({
  slug,
  eventName,
  personName,
  active,
  showVote,
  children,
}: {
  slug: string;
  eventName: string;
  personName: string;
  active: MemberTab;
  showVote: boolean;
  children: ReactNode;
}) {
  const tabs = [
    { key: "beranda", label: "Beranda", href: `/e/${slug}/peserta`, Icon: House },
    { key: "jadwal", label: "Jadwal", href: `/e/${slug}/rundown`, Icon: CalendarBlank },
    ...(showVote ? [{ key: "voting", label: "Voting", href: `/e/${slug}/vote`, Icon: ChartBar }] : []),
    { key: "profil", label: "Profil", href: `/e/${slug}/peserta/profil`, Icon: UserCircle },
  ];

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-[var(--reg-outline-variant)] bg-[var(--reg-surface)]">
        <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center gap-4 px-5 sm:px-8 lg:min-h-20 lg:px-20">
          <Link href={`/e/${slug}`} className="flex min-h-11 min-w-0 flex-1 items-center md:flex-none md:basis-1/4">
            <span className="truncate text-title-medium font-semibold [font-family:var(--landing-heading)] lg:text-title-large">
              {eventName}
            </span>
          </Link>

          <nav aria-label="Area peserta" className="hidden flex-1 justify-center gap-2 md:flex">
            {tabs.map((tab) => {
              const aktif = tab.key === active;
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  aria-current={aktif ? "page" : undefined}
                  className={`m3-state inline-flex min-h-10 items-center rounded-md px-4 text-title-small ${
                    aktif ? "bg-[var(--reg-panel)] font-semibold" : "font-medium text-[var(--reg-on-surface-variant)]"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex justify-end md:basis-1/4">
            <Link
              href={`/e/${slug}/peserta/profil`}
              aria-label={`Profil ${personName}`}
              className="m3-state flex min-h-11 items-center gap-2.5 rounded-full md:border md:border-[var(--reg-outline-variant)] md:py-1 md:pl-1 md:pr-4"
            >
              <Avatar name={personName} size="sm" />
              <span className="hidden max-w-[12rem] truncate text-body-medium font-medium md:block">{personName}</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="pb-28 md:pb-0">{children}</div>

      <nav
        aria-label="Area peserta"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--reg-outline-variant)] bg-[var(--reg-surface)] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map(({ key, label, href, Icon }) => {
            const aktif = key === active;
            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={aktif ? "page" : undefined}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 text-label-medium ${
                    aktif ? "font-semibold text-[var(--reg-primary)]" : "text-[var(--reg-on-surface-variant)]"
                  }`}
                >
                  <Icon size={24} weight={aktif ? "fill" : "regular"} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

const AVATAR = {
  sm: "size-8 text-label-medium",
  md: "size-10 text-label-large",
  lg: "size-20 text-headline-medium lg:size-28 lg:text-headline-large",
};

export function Avatar({ name, size = "md" }: { name: string; size?: keyof typeof AVATAR }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-[var(--reg-primary-container)] font-semibold text-[var(--reg-on-primary-container)] ${AVATAR[size]}`}
    >
      {initials(name)}
    </span>
  );
}
