"use client";

import { LockSimple, LockSimpleOpen, ShareNetwork } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTerkunci } from "@/components/admin/page-context";
import { CarouselHarian } from "@/components/laporan/harian/carousel";
import { Banner, Button, PageLoading, StatusChip, WorkspaceHeader, WorkspacePage } from "@/components/m3";
import { useToast } from "@/components/toast";
import type { SetelanHari } from "@/lib/laporan/harian/config";
import { RINGKASAN } from "@/lib/laporan/harian/jenis";
import type { DataHarian, StatusHari } from "@/lib/laporan/harian/server";
import { cx } from "@/lib/m3/cx";
import { LaporanTabs } from "../laporan-tabs";
import { EditorHari, type UbahHari } from "./editor-hari";
import { KartuTautan, type Tautan } from "./kartu-tautan";
import { bagikanGambar } from "./bagikan";

/**
 * Admin > Event report > Daily highlights: carousel 9:16 untuk klien, satu
 * per hari acara. Angka hidup sampai panitia menekan Lock figures; gambar
 * dibagikan dari salinan yang dikunci, jadi yang dikirim ke klien tidak
 * berubah oleh scan yang masuk belakangan.
 */

type Data = DataHarian & { siap: true; updated_at: string | null; tautan: Tautan; slug: string };

const waktu = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const hariLabel = (t: string) => (t === RINGKASAN ? "Whole event" : new Date(`${t}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }));
const CHIP: Record<StatusHari, { tone: "success" | "warning" | "primary" | "neutral"; teks: string }> = {
  terkunci: { tone: "success", teks: "Locked" },
  siap: { tone: "warning", teks: "Ready to review" },
  hari_ini: { tone: "primary", teks: "Today" },
  nanti: { tone: "neutral", teks: "Upcoming" },
};

export default function HalamanHarian() {
  const toast = useToast();
  const terkunci = useTerkunci(true);
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState<"muat" | "siap" | "belum" | "gagal">("muat");
  const [sibuk, setSibuk] = useState<"kunci" | "bagikan" | "tautan" | null>(null);
  const versi = useRef<string | null>(null);
  const antre = useRef<Promise<unknown>>(Promise.resolve());

  const muat = useCallback(async (tanggal?: string | null) => {
    const q = tanggal ? `?tanggal=${encodeURIComponent(tanggal)}` : "";
    const res = await fetch(`/api/admin/laporan/harian${q}`, { cache: "no-store" }).catch(() => null);
    const json = res?.ok ? ((await res.json()) as Data | { siap: false }) : null;
    if (!json) return setStatus("gagal");
    if (!json.siap) return setStatus("belum");
    versi.current = json.updated_at;
    setData(json);
    setStatus("siap");
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void muat();
  }, [muat]);

  const kirim = useCallback(async (method: "PUT" | "POST", isi: Record<string, unknown>) => {
    const res = await fetch("/api/admin/laporan/harian", { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ ...isi, tanggal: data?.tanggal, updated_at: versi.current }) }).catch(() => null);
    if (res?.status === 409) {
      toast.warning("This report was changed in another tab", "The latest version is loaded. Make your change again.");
      await muat(data?.tanggal);
      return null;
    }
    const json = res?.ok ? ((await res.json()) as { updated_at?: string; siap?: false }) : null;
    if (!json?.updated_at) { toast.error("Couldn't save", "Check the connection and try again."); return null; }
    versi.current = json.updated_at;
    return json;
  }, [data?.tanggal, muat, toast]);

  // Setelan disimpan berurutan, lalu pratinjau dihitung ulang dari server.
  const ubah = (s: UbahHari) => {
    setData((d) => (d ? { ...d, setelan: { ...d.setelan, ...s } } : d));
    antre.current = antre.current.then(async () => { if (await kirim("PUT", { setelan: s })) await muat(data?.tanggal); });
  };

  const kunci = async (aksi: "kunci" | "buka") => {
    setSibuk("kunci");
    await antre.current;
    const ok = await kirim("POST", { aksi });
    setSibuk(null);
    if (ok) { toast.success(aksi === "kunci" ? "Figures locked" : "Unlocked. Figures update again."); await muat(data?.tanggal); }
  };

  const ubahTautan = async (aksi: "buat" | "matikan") => {
    setSibuk("tautan");
    await antre.current;
    const res = await fetch("/api/admin/laporan/tautan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ aksi, updated_at: versi.current }) }).catch(() => null);
    setSibuk(null);
    if (res?.status === 409) { toast.warning("This report was changed in another tab", "The latest version is loaded. Try again."); return muat(data?.tanggal); }
    const json = res?.ok ? ((await res.json()) as { updated_at?: string; tautan?: Tautan }) : null;
    if (!json?.updated_at) return toast.error("Couldn't update the link", "Check the connection and try again.");
    versi.current = json.updated_at;
    setData((d) => (d ? { ...d, updated_at: json.updated_at!, tautan: json.tautan ?? null } : d));
    toast.success(aksi === "buat" ? "Highlight link created" : "Highlight link turned off. The old link no longer opens.");
  };

  const bagikan = async () => {
    if (!data?.tanggal || !data.highlight) return;
    setSibuk("bagikan");
    const hasil = await bagikanGambar(data.tanggal, data.highlight.halaman.length).catch(() => "gagal" as const);
    setSibuk(null);
    if (hasil === "gagal") toast.error("Couldn't make the images", "Check the connection and try again.");
    else if (hasil === "unduh") toast.success("Images downloaded");
  };

  if (status === "belum") {
    return (
      <WorkspacePage width="form">
        <WorkspaceHeader title="Event report" />
        <Banner tone="info">Event report isn&apos;t active yet: database migration 202611080060 has not been run.</Banner>
      </WorkspacePage>
    );
  }
  if (status === "gagal") {
    return (
      <WorkspacePage width="form">
        <WorkspaceHeader title="Event report" />
        <Banner tone="error" actions={<Button variant="text" onClick={() => void muat()}>Try again</Button>}>The daily highlights couldn&apos;t be loaded.</Banner>
      </WorkspacePage>
    );
  }
  if (!data) return <PageLoading />;

  const pilih = data.hari.find((h) => h.tanggal === data.tanggal);
  const dikunci = data.setelan.kunci;
  return (
    <WorkspacePage>
      <WorkspaceHeader
        title="Event report"
        meta={<span>A 9:16 image set for the client after each event day, and a Whole event recap when the event runs more than one day. Lock the figures, then share. Locked days also play on the client view, in the Report tab.</span>}
        actions={
          dikunci ? (
            <>
              <Button variant="text" icon={<LockSimpleOpen size={18} aria-hidden />} disabled={terkunci || !!sibuk} loading={sibuk === "kunci"} onClick={() => void kunci("buka")}>Unlock</Button>
              <Button icon={<ShareNetwork size={18} aria-hidden />} loading={sibuk === "bagikan"} onClick={() => void bagikan()}>Share images</Button>
            </>
          ) : pilih ? (
            <Button icon={<LockSimple size={18} aria-hidden />} disabled={terkunci || !!sibuk} loading={sibuk === "kunci"} onClick={() => void kunci("kunci")}>Lock figures</Button>
          ) : null
        }
      />
      <LaporanTabs />
      {data.hari.length === 0 ? (
        <Banner tone="info">Daily highlights need agenda items linked to a check-in point. Link them in Check-in, then come back.</Banner>
      ) : (
        <div className="flex flex-col gap-4">
          <nav aria-label="Event days" className="flex gap-2 overflow-x-auto">
            {data.hari.map((h) => (
              <button
                key={h.tanggal}
                type="button"
                aria-current={h.tanggal === data.tanggal ? "true" : undefined}
                onClick={() => void muat(h.tanggal)}
                className={cx("flex min-h-12 shrink-0 items-center gap-3 rounded-md border px-3 py-2 text-left", h.tanggal === data.tanggal ? "border-transparent bg-secondary-container" : "border-outline-variant hover:bg-primary-soft")}
              >
                <span className="text-body-medium font-medium">{hariLabel(h.tanggal)}</span>
                <StatusChip tone={CHIP[h.status].tone}>{h.kunci_at ? `Locked ${waktu(h.kunci_at)}` : CHIP[h.status].teks}</StatusChip>
              </button>
            ))}
          </nav>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section aria-label="Preview" className="flex min-w-0 flex-col gap-3 rounded-lg bg-surface-container p-4">
            <p className="text-body-small text-on-surface-variant">
              {dikunci ? `Locked ${waktu(dikunci.at)}. This is exactly what the client receives.` : `Figures as of ${data.highlight ? waktu(data.highlight.dibuat) : ""}. They update until you lock them.`}
            </p>
            {data.highlight ? <CarouselHarian hari={data.highlight} /> : null}
          </section>
          <div className="flex min-w-0 flex-col gap-4">
            <KartuTautan tautan={data.tautan} slug={data.slug} jumlahKunci={data.hari.filter((h) => h.tanggal !== RINGKASAN && h.status === "terkunci").length} semuaKunci={data.hari.some((h) => h.tanggal === RINGKASAN && h.status === "terkunci")} terkunci={terkunci} sibuk={sibuk === "tautan"} onAksi={(a) => void ubahTautan(a)} />
            <EditorHari
              key={`${data.tanggal}:${dikunci?.at ?? ""}`}
              setelan={data.setelan as SetelanHari}
              absen={data.absen}
              ada={data.ada}
              titik={data.titik ?? []}
              kunci={!!dikunci}
              terkunci={terkunci}
              semua={data.tanggal === RINGKASAN}
              onUbah={ubah}
            />
          </div>
          </div>
        </div>
      )}
    </WorkspacePage>
  );
}
