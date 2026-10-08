import { ArrowSquareOut, Plus } from "@phosphor-icons/react/dist/ssr";

/**
 * Kotak bertitik di pratinjau CMS (TIDAK PERNAH di halaman publik): bagian yang
 * dinyalakan tetapi datanya belum ada akan kosong di halaman, dan admin tidak
 * tahu kenapa (masukan 8 Okt, PR D). Kotak ini menyebut alasannya dan satu
 * jalan untuk mengisinya.
 *
 * Gayanya netral seperti panel admin, bukan tema acara, supaya terbaca sebagai
 * catatan editor dan bukan isi halaman. Teks Inggris: bagian dari panel admin.
 *
 * Aksi:
 * - `href`: halaman admin lain (Agenda, Participant area, Logistik), dibuka di
 *   tab baru. Pratinjau menahan tautan lain; `data-pratinjau-admin` yang membuat
 *   pratinjau-langsung.tsx membukanya.
 * - tanpa `href`: label saja. Klik di kotak membuka baris bagiannya di panel
 *   (`data-bagian` / `data-sunting` pada pembungkus), seperti klik di halaman.
 */
export function KotakKosong({
  judul,
  chip,
  teks,
  aksi,
  slug,
  gelap = false,
}: {
  judul: string;
  chip?: string | null;
  teks: string;
  aksi: { label: string; href?: string };
  slug: string;
  /** Di atas hero gelap (tempat kartu Portal preview). */
  gelap?: boolean;
}) {
  const tombol = aksi.href ? (
    <a
      href={`/e/${slug}${aksi.href}`}
      data-pratinjau-admin=""
      className={`inline-flex h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border-2 px-5 text-[18px] font-semibold lg:h-[60px] lg:text-[26px] ${
        gelap ? "border-white/70 text-white" : "border-[#747775] bg-white text-[#0b57d0]"
      }`}
    >
      {aksi.label}
      <ArrowSquareOut className="size-5 lg:size-[22px]" aria-hidden />
    </a>
  ) : (
    <span className="inline-flex h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border-2 border-[#747775] bg-white px-5 text-[18px] font-semibold text-[#0b57d0] lg:h-[60px] lg:text-[26px]">
      <Plus className="size-5 lg:size-[22px]" aria-hidden />
      {aksi.label}
    </span>
  );
  return (
    <div
      data-kotak-kosong=""
      className={`flex rounded-3xl border-[3px] border-dashed ${
        gelap
          ? "h-full flex-col justify-center gap-0 rounded-[40px] border-white/55 bg-white/[0.06] p-9 text-white"
          : "flex-col gap-5 border-[#9aa0a6] bg-[repeating-linear-gradient(135deg,#f4f5f6_0_14px,#eef0f2_14px_28px)] p-6 text-[#1f1f1f] sm:flex-row sm:items-center sm:gap-8 lg:px-12 lg:py-10"
      }`}
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
    >
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-3 text-[20px] font-semibold leading-tight lg:text-[30px]">
          {judul}
          {chip ? <span className="rounded-lg bg-[#fdecd8] px-3 py-1 text-[15px] font-semibold text-[#8a4b00] lg:text-[22px]">{chip}</span> : null}
        </p>
        <p className={`mt-2 max-w-[760px] text-[17px] leading-normal lg:text-[26px] ${gelap ? "mb-7 text-white/80" : "text-[#444746]"}`}>{teks}</p>
      </div>
      {tombol}
    </div>
  );
}
