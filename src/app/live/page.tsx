import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";
import { requireEventScope } from "@/lib/auth/event-scope";
import { roleHome } from "@/lib/role-home";
import { LiveClient } from "./live-client";

/**
 * Layar klien: siapa saja yang sudah mendaftar, terbarui sendiri.
 *
 * Satu-satunya layar akun Viewer. Penjagaan di server: peran dibaca dari
 * user_event_access acara ini, sama seperti route datanya, jadi akun klien
 * acara A yang mengganti slug di URL ke acara B berhenti di sini.
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Registrations — Tally" };

export default async function LivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const raw = (await searchParams).eventSlug;
  const slug = Array.isArray(raw) ? raw[0] : raw;
  if (!slug) redirect("/events");
  const resolved = await requireEventScope(slug, ["viewer", "admin"]);
  if (resolved.response) {
    if (resolved.response.status === 404) notFound();
    if (resolved.response.status === 403) {
      // Punya akses ke acara ini dengan peran lain: ke rumah peran itu.
      const lain = await requireEventScope(slug);
      redirect(lain.response ? "/events" : roleHome(lain.scope.role, slug));
    }
    throw new Error("Could not load the event.");
  }
  return (
    <LiveClient
      slug={resolved.scope.event.slug}
      eventName={resolved.scope.event.name}
      username={user.username}
      role={resolved.scope.role}
      preview={resolved.scope.role !== "viewer"}
    />
  );
}
