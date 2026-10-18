import { notFound } from "next/navigation";
import AreaPesertaPage, { generateMetadata as metadataPeserta, generateViewport as viewportPeserta } from "../../../page";

/**
 * Area peserta per acara dan bahasa: src/proxy.ts menulis ulang
 * `/e/<slug>/peserta` ke sini (`/e/<slug>/en/peserta` ke `.../<slug>/en`), lihat
 * pesertaKePath. Isinya halaman `/peserta` yang sama; slug dan bahasa dari path
 * diberikan sebagai `eventSlug` dan `bahasa`, persis seperti query lamanya.
 */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string; bahasa?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function kueriHalaman({ params, searchParams }: Props): Promise<Record<string, string | string[] | undefined>> {
  const [{ slug, bahasa }, kueri] = await Promise.all([params, searchParams]);
  if (bahasa && (bahasa.length !== 1 || (bahasa[0] !== "en" && bahasa[0] !== "id"))) notFound();
  return { ...kueri, eventSlug: slug, ...(bahasa ? { bahasa: bahasa[0] } : {}) };
}

export async function generateViewport(props: Props) {
  return viewportPeserta({ searchParams: kueriHalaman(props) });
}

export async function generateMetadata(props: Props) {
  return metadataPeserta({ searchParams: kueriHalaman(props) });
}

export default async function AreaPesertaAcara(props: Props) {
  return <AreaPesertaPage searchParams={kueriHalaman(props)} />;
}
