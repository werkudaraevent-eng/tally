"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageLoading } from "@/components/m3";
import { useToast } from "@/components/toast";
import { Laporan, type DetailTerkirim } from "./laporan";
import { Penyusun, type DetailDraf } from "./penyusun";

/**
 * Satu kiriman: penyusun selama masih draf, laporan setelah dikirim atau
 * dijadwalkan. Satu alamat untuk keduanya, supaya tautan yang dibagikan
 * panitia tetap berlaku sebelum dan sesudah kiriman berangkat.
 */
export default function KirimanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [detail, setDetail] = useState<DetailDraf | DetailTerkirim | null>(null);
  const [hilang, setHilang] = useState(false);

  const muat = useCallback(async () => {
    const response = await fetch(`/api/admin/pesan/${id}`, { cache: "no-store" }).catch(() => null);
    if (response?.status === 404) {
      setHilang(true);
      return;
    }
    if (!response?.ok) {
      toast.error("Couldn't load the blast", "Reload the page.");
      return;
    }
    setDetail((await response.json()) as DetailDraf | DetailTerkirim);
  }, [id, toast]);

  useEffect(() => {
    // Muat dari server saat halaman dibuka atau saringan berubah.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void muat();
  }, [muat]);

  if (hilang) {
    return (
      <main lang="en" className="p-6 text-body-large text-on-surface-variant">
        Blast not found. It may be a draft that was deleted.
      </main>
    );
  }
  if (!detail) return <PageLoading />;
  return detail.blast.status === "draf" ? (
    <Penyusun detail={detail as DetailDraf} onSent={() => void muat()} />
  ) : (
    <Laporan detail={detail as DetailTerkirim} onReload={() => void muat()} />
  );
}
