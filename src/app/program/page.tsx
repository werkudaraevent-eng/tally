import { forumMetadata, forumPage } from "@/components/landing/forum/forum-page";

// Halaman program tata letak Forum: /e/<slug>/program. Lihat event-landing-forum.tsx.
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export function generateMetadata({ searchParams }: Props) {
  return forumMetadata("program", searchParams);
}

export default function Page({ searchParams }: Props) {
  return forumPage("program", searchParams);
}
