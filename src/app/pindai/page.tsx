import { notFound } from "next/navigation";
import { getPublicPageEvent } from "@/lib/auth/request-event";
import { getMemberSession, memberConfig } from "@/lib/member/account";
import { landingDefaultLang } from "@/lib/landing-i18n";
import { alamatQrCheckpoint } from "@/lib/checkpoint/qr-alamat";
import { HalamanPindai } from "./pindai-client";

/**
 * `/e/<slug>/pindai?s=&k=`: isi QR checkpoint (scan mandiri) bila dibuka
 * dengan kamera bawaan ponsel, bukan dengan tombol Pindai QR checkpoint.
 *
 * Halaman ini tidak mencatat apa pun saat dirender: pencatatannya POST dari
 * peramban sesudah halaman tampil, jadi pratinjau tautan di aplikasi chat (yang
 * tidak menjalankan JavaScript) tidak pernah menyelesaikan checkpoint.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Checkpoint", robots: { index: false } };

export default async function PindaiPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const event = await getPublicPageEvent(searchParams);
  if (!event || event.status === "archived" || !memberConfig(event)) notFound();
  const params = await searchParams;
  const satu = (nilai: string | string[] | undefined) => (Array.isArray(nilai) ? nilai[0] : nilai) ?? "";
  const sesi = Number(satu(params.s));
  const kode = satu(params.k);
  const sesiMasuk = await getMemberSession(event);
  const sesiSah = Number.isSafeInteger(sesi) && sesi > 0 ? sesi : null;
  const kodeSah = /^[A-Za-z0-9_-]{8,40}$/.test(kode) ? kode : null;
  // Belum masuk: tombol Masuk membawa alamat checkpoint ini, jadi sesudah masuk
  // peserta kembali ke sini dan checkpoint langsung tercatat (masuk/page.tsx).
  const masukUrl = `/e/${encodeURIComponent(event.slug)}/masuk${
    sesiSah !== null && kodeSah !== null ? `?lanjut=${encodeURIComponent(alamatQrCheckpoint("", event.slug, sesiSah, kodeSah))}` : ""
  }`;
  return (
    <HalamanPindai
      slug={event.slug}
      namaAcara={event.name}
      lang={landingDefaultLang(event.landing_config)}
      sesi={sesiSah}
      kode={kodeSah}
      masuk={Boolean(sesiMasuk)}
      masukUrl={masukUrl}
    />
  );
}
