import { notFound, redirect } from "next/navigation";
import { DeckBerurutan } from "@/components/laporan/deck-klien";
import { getCurrentUser } from "@/lib/auth/login";
import { requireEventScope } from "@/lib/auth/event-scope";
import { hitungLaporan, muatLaporan, snapshotKlien } from "@/lib/laporan/server";
import { TombolCetak } from "./tombol-cetak";

/**
 * Cetak atau simpan PDF Event report: `/e/<slug>/cetak-laporan`.
 *
 * Di luar AdminShell dengan sengaja, seperti cetak badge: dialog cetak
 * mencetak seluruh dokumen. Satu slide = satu halaman 16:9 (@page 1280×720).
 * Admin mencetak deck dari data terbaru; Viewer (atau admin dengan
 * `?salinan=1`) mencetak salinan yang dibagikan, tidak pernah data terbaru.
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Event report — Tally" };

const CETAK = `
@page { size: 1280px 720px; margin: 0; }
@media print {
  html, body { background: #fff !important; }
  .lp-alat { display: none !important; }
  .lp-deck { max-width: none !important; gap: 0 !important; }
  .lp-bingkai { width: 1280px !important; height: 720px !important; aspect-ratio: auto !important; border-radius: 0 !important; box-shadow: none !important; break-after: page; }
  .lp-bingkai > div { transform: none !important; visibility: visible !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

export default async function CetakLaporan({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const q = await searchParams;
  const slug = Array.isArray(q.eventSlug) ? q.eventSlug[0] : q.eventSlug;
  if (!slug) redirect("/events");
  const scope = await requireEventScope(slug, ["viewer", "admin"]);
  if (scope.response) notFound();
  const event = scope.scope.event;
  const admin = scope.scope.role !== "viewer";

  let deck = null;
  if (admin && q.salinan !== "1") {
    const laporan = await muatLaporan(event.id).catch(() => null);
    if (laporan?.siap) deck = (await hitungLaporan(event, laporan.config).catch(() => null))?.deck ?? null;
  } else {
    deck = (await snapshotKlien(event.id))?.deck ?? null;
  }
  if (!deck) notFound();
  const en = deck.bahasa === "en";

  return (
    <main className="min-h-dvh bg-surface-container px-4 py-6 print:p-0">
      <style dangerouslySetInnerHTML={{ __html: CETAK }} />
      <DeckBerurutan
        deck={deck}
        catatan={en ? "One slide per page. In the print dialog, choose Save as PDF." : "Satu slide per halaman. Di dialog cetak, pilih Simpan sebagai PDF."}
        aksi={<TombolCetak label={en ? "Print or save as PDF" : "Cetak atau simpan PDF"} />}
      />
    </main>
  );
}
