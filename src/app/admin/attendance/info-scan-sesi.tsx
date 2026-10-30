"use client";

import { ArrowDown, ArrowUp, Plus, X } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Button, DetailSection, IconButton, Popover, POPOVER_ITEM, usePopoverAnchor } from "@/components/m3";
import { BATAS_INFO_SCAN, bacaInfoScan, infoBerlaku, type PilihanInfo } from "@/lib/info-scan";

/**
 * Check-in > Sessions > Shown after scan: info yang tampil di bawah nama pada
 * lembar hasil petugas di sesi ini (lib/info-scan.ts).
 *
 * Setiap ubahan langsung tersimpan, seperti pilihan Luggage di panel yang sama.
 * Urutan diubah dengan panah naik/turun, bukan seret: bisa dengan papan ketik
 * dan tidak meleset di layar sentuh.
 */
export function InfoScanSesi({
  scanFields,
  pilihan,
  busy,
  terkunci,
  onSimpan,
}: {
  /** Nilai tersimpan; undefined = kolomnya belum ada (migrasi belum dijalankan). */
  scanFields: unknown;
  pilihan: PilihanInfo[];
  busy: boolean;
  terkunci: boolean;
  onSimpan: (daftar: string[] | null) => Promise<boolean>;
}) {
  const tersimpan = bacaInfoScan(scanFields);
  const berlaku = tersimpan ? infoBerlaku(tersimpan, pilihan) : [];
  const belumAda = scanFields === undefined;
  const nonaktif = busy || terkunci || belumAda;
  const penuh = berlaku.length >= BATAS_INFO_SCAN;
  const [pemicu, setPemicu] = useState<HTMLElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const menuId = useId();

  const kunci = berlaku.map((p) => p.kunci);
  const simpan = (daftar: string[]) => void onSimpan(daftar.length > 0 ? daftar : null);
  const pindah = (dari: number, ke: number) => {
    const baru = [...kunci];
    const [isi] = baru.splice(dari, 1);
    baru.splice(ke, 0, isi);
    simpan(baru);
  };

  const grup = ["Participant", "Logistics", "Registration questions"] as const;

  return (
    <DetailSection
      title="Shown after scan"
      action={tersimpan ? <span className="text-body-small tabular-nums text-on-surface-variant">{berlaku.length} of {BATAS_INFO_SCAN}</span> : undefined}
    >
      <p className="text-body-medium text-on-surface-variant">
        What staff see under the name on this session&apos;s scan result, in this order.
      </p>

      {berlaku.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {berlaku.map((p, index) => (
            <li key={p.kunci} className="flex min-h-12 items-center gap-1 rounded-lg border border-outline-variant py-1 pl-3 pr-1">
              <span className="min-w-0 flex-1">
                <span className="block text-body-medium font-medium [overflow-wrap:anywhere]">{p.label}</span>
                <span className="block text-body-small text-on-surface-variant">{p.asal}</span>
              </span>
              <IconButton size="sm" label={`Move ${p.label} up`} disabled={nonaktif || index === 0} onClick={() => pindah(index, index - 1)}>
                <ArrowUp size={18} />
              </IconButton>
              <IconButton size="sm" label={`Move ${p.label} down`} disabled={nonaktif || index === berlaku.length - 1} onClick={() => pindah(index, index + 1)}>
                <ArrowDown size={18} />
              </IconButton>
              <IconButton size="sm" label={`Remove ${p.label}`} disabled={nonaktif} onClick={() => simpan(kunci.filter((k) => k !== p.kunci))}>
                <X size={18} />
              </IconButton>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span ref={setPemicu} className="inline-flex">
          <Button
            variant="outlined"
            size="sm"
            icon={<Plus size={16} aria-hidden />}
            disabled={nonaktif || penuh}
            aria-haspopup="menu"
            aria-expanded={menu.open}
            aria-controls={menu.open ? menuId : undefined}
            onClick={menu.toggle}
          >
            Add info
          </Button>
        </span>
        {tersimpan ? (
          <Button variant="text" size="sm" disabled={nonaktif} onClick={() => void onSimpan(null)}>
            Use Company · Job title
          </Button>
        ) : null}
      </div>
      {menu.open ? (
        <Popover anchor={menu} id={menuId} label="Add info" width={300} align="start" className="max-h-[60vh]">
          {grup.map((nama) => {
            const isi = pilihan.filter((p) => p.grup === nama);
            if (isi.length === 0) return null;
            return (
              <div key={nama} role="group" aria-label={nama}>
                <p className="px-3 pb-1 pt-2 text-label-small font-semibold uppercase tracking-wide text-on-surface-variant">{nama}</p>
                {isi.map((p) => {
                  const dipakai = kunci.includes(p.kunci);
                  return (
                    <button
                      key={p.kunci}
                      type="button"
                      role="menuitem"
                      disabled={dipakai}
                      className={`${POPOVER_ITEM} justify-between disabled:cursor-default disabled:text-on-surface-variant`}
                      onClick={() => { menu.tutup(); simpan([...kunci, p.kunci]); }}
                    >
                      <span className="min-w-0 truncate">{p.label}</span>
                      <span className="shrink-0 text-body-small text-on-surface-variant">
                        {dipakai ? "Added" : p.khususPanitia ? "staff only" : p.grup === "Logistics" ? "scan date" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </Popover>
      ) : null}

      <p className="text-body-medium text-on-surface-variant">
        {belumAda
          ? "Available after the database update for this setting is run."
          : tersimpan
            ? "Empty answers show as “Not set”. Seats and checkpoints always show when this session has them."
            : "Not set yet: staff see Company · Job title. Seats and checkpoints always show when this session has them."}
      </p>
    </DetailSection>
  );
}
