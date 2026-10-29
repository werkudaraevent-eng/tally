"use client";

import { ArrowSquareOut } from "@phosphor-icons/react";
import { useEffect, useState, type ReactNode } from "react";
import { SegmentedButton } from "@/components/m3";
import type { LandingBlock } from "@/lib/domain";
import { eventApiPath } from "@/lib/event-url";
import { rundownHref } from "./pilih-sesi";

type Tab = { id: number; name: string | null; title: string | null; is_published: boolean };
type Hari = { id: number; nama: string; jumlah: number; terbit: boolean };

const PILIHAN: { value: "all" | "pick"; label: string }[] = [
  { value: "all", label: "All days" },
  { value: "pick", label: "Choose days" },
];

/**
 * Editor blok Dress code. Isinya tidak disunting di sini: blok membaca Agenda >
 * Dress code (satu sumber dengan halaman Outfit peserta). Admin hanya memilih
 * hari yang tampil; kosong = semua tab yang punya dress code, termasuk tab yang
 * nanti ditambahkan.
 */
export function EditorDressCode({ block, ubah, alis, judul, pengantar }: {
  block: LandingBlock;
  ubah: (patch: Partial<LandingBlock>) => void;
  alis: ReactNode;
  judul: ReactNode;
  pengantar: ReactNode;
}) {
  // null = belum dimuat; "gagal" = salah satu permintaan gagal.
  const [hari, setHari] = useState<Hari[] | "gagal" | null>(null);
  useEffect(() => {
    const baca = (path: string) => fetch(eventApiPath(path), { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    void Promise.all([baca("/api/admin/rundown/sections"), baca("/api/admin/rundown/sections/outfit")])
      .then(([daftar, outfit]: [{ sections?: Tab[] }, { sections?: Array<{ id: number; outfit: unknown[] }> }]) => {
        const jumlah = new Map((outfit.sections ?? []).map((isi) => [isi.id, isi.outfit.length]));
        setHari(
          (daftar.sections ?? [])
            .filter((tab) => (jumlah.get(tab.id) ?? 0) > 0)
            .map((tab) => ({ id: tab.id, nama: tab.name?.trim() || tab.title?.trim() || `Tab ${tab.id}`, jumlah: jumlah.get(tab.id) ?? 0, terbit: tab.is_published })),
        );
      })
      .catch(() => setHari("gagal"));
  }, []);

  const pilih = block.section_ids ?? [];
  const daftar = Array.isArray(hari) ? hari : [];
  // Tab yang dipilih lalu dihapus atau dikosongkan di Agenda tidak dihitung.
  const terpilih = pilih.filter((id) => daftar.some((isi) => isi.id === id));
  const mode = pilih.length > 0 ? "pick" : "all";

  return (
    <div className="flex flex-col gap-4">
      {alis}
      {judul}
      {pengantar}
      <div className="flex flex-col gap-2 rounded-lg border border-outline-variant p-3">
        <p className="text-body-medium text-on-surface">
          What to wear comes from <span className="font-semibold">Agenda &gt; Dress code</span>, so this block always matches the participants&rsquo; Outfit page.
        </p>
        <a href={rundownHref()} target="_blank" rel="noreferrer" className="m3-state inline-flex min-h-9 items-center gap-1.5 self-start rounded-md px-2 text-label-large font-semibold text-primary">
          Open Agenda <ArrowSquareOut size={16} aria-hidden />
        </a>
      </div>
      <div className="flex flex-col gap-2">
        <p id={`${block.id}-hari`} className="text-body-medium font-semibold text-on-surface">Days shown</p>
        {hari === null ? <p className="text-body-medium text-on-surface-variant">Loading Agenda tabs…</p> : null}
        {hari === "gagal" ? <p className="text-body-medium text-error">Agenda tabs could not be loaded. Reload the page to try again.</p> : null}
        {Array.isArray(hari) && daftar.length === 0 ? (
          <p className="text-body-medium text-on-surface-variant">No Agenda tab has a dress code yet. Add one in Agenda &gt; Dress code; the block stays hidden until then.</p>
        ) : null}
        {daftar.length > 0 ? (
          <>
            <SegmentedButton<"all" | "pick">
              label="Days shown"
              labelledBy={`${block.id}-hari`}
              value={mode}
              onChange={(nilai) => ubah({ section_ids: nilai === "all" ? undefined : daftar.map((isi) => isi.id) })}
              options={PILIHAN}
            />
            {mode === "all" ? (
              <p className="text-body-small text-on-surface-variant">Every published Agenda tab with a dress code, including tabs you add later.</p>
            ) : (
              <ul className="flex flex-col">
                {daftar.map((isi) => {
                  const dicentang = terpilih.includes(isi.id);
                  // Satu hari selalu tersisa: daftar kosong berarti semua hari.
                  const terakhir = dicentang && terpilih.length === 1;
                  return (
                    <li key={isi.id}>
                      <label className="flex min-h-10 cursor-pointer items-center gap-3 py-1 text-body-medium text-on-surface">
                        <input
                          type="checkbox"
                          checked={dicentang}
                          disabled={terakhir}
                          onChange={(event) => ubah({ section_ids: event.target.checked ? daftar.map((x) => x.id).filter((id) => id === isi.id || terpilih.includes(id)) : terpilih.filter((id) => id !== isi.id) })}
                          className="size-4 shrink-0 accent-[var(--md-sys-color-primary)]"
                        />
                        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{isi.nama}</span>
                        <span className="shrink-0 text-body-small text-on-surface-variant">{isi.terbit ? (isi.jumlah === 1 ? "1 dress code" : `${isi.jumlah} dress codes`) : "Draft tab, hidden"}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
