"use client";

import { Plus } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { Button, MetaSeparator, Tabs, WorkspaceHeader, WorkspacePage } from "@/components/m3";
import { BoothsPanel, type BoothsPanelHandle, type BoothStats } from "@/components/admin/booths-panel";
import { OffersPanel, type OffersPanelHandle, type OfferStats } from "@/components/admin/offers-panel";

/**
 * Booth dan katalog barangnya, satu layar dua tab.
 *
 * Keduanya mengelola barang yang dijual booth yang sama; yang membedakan hanya
 * harga dan syaratnya. Tab, bukan satu halaman panjang: keduanya punya daftar
 * dan editornya sendiri (list-detail), dan menumpuknya berarti admin menggulir
 * melewati satu modul penuh untuk sampai ke yang lain.
 */

type Tab = "booth" | "offers";

export default function BoothsPage() {
  const [tab, setTab] = useState<Tab>("booth");
  // Hitungan terakhir yang diketahui per tab. Panel yang tidak aktif dilepas,
  // jadi angkanya baru ada setelah tab itu pernah dibuka.
  const [statBooth, setStatBooth] = useState<BoothStats | null>(null);
  const [statItem, setStatItem] = useState<OfferStats | null>(null);
  const booth = useRef<BoothsPanelHandle>(null);
  const item = useRef<OffersPanelHandle>(null);

  const meta = [
    statBooth ? `${statBooth.total} booth` : null,
    statBooth ? `${statBooth.aktif} aktif` : null,
    statItem ? `${statItem.total} item spesial` : null,
  ].filter((teks): teks is string => teks !== null);

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        meta={meta.length ? meta.map((teks, index) => (
          <span key={teks} className="inline-flex items-center gap-2 tabular-nums">{index > 0 ? <MetaSeparator /> : null}{teks}</span>
        )) : <span>Memuat booth</span>}
        actions={tab === "booth"
          ? <Button variant="outlined" icon={<Plus size={16} />} onClick={() => booth.current?.tambah()}>Booth baru</Button>
          : <Button variant="outlined" icon={<Plus size={16} />} onClick={() => item.current?.tambah()}>Item baru</Button>}
      />

      <Tabs<Tab>
        label="Bagian halaman booth"
        idPrefix="booth-item"
        value={tab}
        onChange={setTab}
        options={[
          { value: "booth", label: "Booth", badge: statBooth?.total },
          { value: "offers", label: "Item spesial", badge: statItem?.total },
        ]}
      />

      {/* Panel yang tidak aktif DILEPAS, bukan disembunyikan dengan CSS: keduanya
          memuat datanya sendiri saat dipasang. */}
      <div role="tabpanel" id={`booth-item-panel-${tab}`} aria-labelledby={`booth-item-tab-${tab}`} className="flex min-h-0 flex-1 flex-col">
        {tab === "booth"
          ? <BoothsPanel ref={booth} onStats={setStatBooth} onBukaItemSpesial={() => setTab("offers")} />
          : <OffersPanel ref={item} onStats={setStatItem} />}
      </div>
    </WorkspacePage>
  );
}
