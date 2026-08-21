"use client";

import { Storefront, Tag } from "@phosphor-icons/react";
import { useState } from "react";
import { SegmentedButton } from "@/components/m3";
import { BoothsPanel } from "@/components/admin/booths-panel";
import { OffersPanel } from "@/components/admin/offers-panel";

/**
 * Booth dan katalog barangnya, satu layar dua tab.
 *
 * Sebelumnya "Item spesial" adalah menu tersendiri di sidebar. Keduanya
 * mengelola barang yang dijual booth yang sama — yang membedakan hanya harga dan
 * syaratnya — dan pemisahan itu terukur merepotkan: halaman Booth punya TIGA
 * tautan yang mengantar admin ke halaman Item spesial untuk menyelesaikan
 * pekerjaan yang baru saja ia mulai.
 *
 * Tab, bukan satu halaman panjang: keduanya punya daftar dan formulirnya sendiri,
 * dan menumpuk keduanya berarti admin menggulir melewati satu modul penuh untuk
 * sampai ke yang lain.
 */

type Tab = "booth" | "offers";

export default function BoothsPage() {
  const [tab, setTab] = useState<Tab>("booth");

  return (
    <main className="bg-surface px-5 pb-8 pt-6 text-on-surface sm:px-8 lg:pb-10">
      <div className="mx-auto max-w-[1440px]">
        <SegmentedButton<Tab>
          className="mb-6"
          label="Bagian halaman booth"
          value={tab}
          onChange={setTab}
          options={[
            { value: "booth", label: "Booth", icon: <Storefront size={18} /> },
            { value: "offers", label: "Item spesial", icon: <Tag size={18} /> },
          ]}
        />

        {/* Panel yang tidak aktif DILEPAS, bukan disembunyikan dengan CSS.
            Keduanya memuat datanya sendiri saat dipasang; membiarkan yang
            tersembunyi tetap hidup berarti setiap penyimpanan di satu tab memicu
            pemuatan ulang di tab yang tidak dilihat siapa pun. */}
        {tab === "booth" ? <BoothsPanel onBukaItemSpesial={() => setTab("offers")} /> : <OffersPanel />}
      </div>
    </main>
  );
}
