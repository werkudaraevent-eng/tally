import { forumMetadata, forumPage } from "@/components/landing/forum/forum-page";

// Halaman info tata letak Forum: /e/<slug>/info. Lihat event-landing-forum.tsx.
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export function generateMetadata({ searchParams }: Props) {
  return forumMetadata("info", searchParams);
}

export default function Page({ searchParams }: Props) {
  return forumPage("info", searchParams);
}
