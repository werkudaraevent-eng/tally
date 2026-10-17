"use client";

import { CaretRight, Plus } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "@/components/event-link";
import { Button, SelectField } from "@/components/m3";
import { useToast } from "@/components/toast";
import { withEventPrefix } from "@/lib/event-path";
import { jenisBlokDarurat } from "@/lib/member/blok-darurat";
import type { BlokPeserta } from "./susunan-beranda";

/**
 * Participant area > Emergency and help (E-03): satu blok Columns khusus peserta
 * menjadi kartu Darurat dan bantuan di Menu. Isinya disunting di Event page,
 * jadi baris ini menautkan ke sana ("Edit in Event page") atau membuat blok
 * Columns baru di sana, seperti Add block di Participant home.
 */
export function PilihBlokDarurat({
  blocks,
  value,
  onChange,
  adaPerubahan,
}: {
  blocks: BlokPeserta[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Ada perubahan Participant area yang belum disimpan: pindah layar ditahan dulu. */
  adaPerubahan: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tolakTambah, setTolakTambah] = useState(false);
  const pilihan = blocks.filter((block) => block.show_on === "member" && jenisBlokDarurat(block.type));
  const terpilih = value ? (pilihan.find((block) => block.id === value) ?? null) : null;
  // Blok tersimpan yang sudah dihapus, diubah ke Both, atau bukan Columns: Menu tidak menampilkan kartu.
  const hilang = Boolean(value) && !terpilih;

  return (
    <div className="flex flex-col items-start gap-2">
      <SelectField
        label="Block"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        hint={
          hilang
            ? "The chosen block is no longer a participant-only Columns block, so Menu shows no emergency card. Choose another block."
            : pilihan.length > 0
              ? "Each column is one row: title, text and an optional https link (Google Maps or wa.me). A mobile number in the text (08… or +62 8…) becomes a call button; office numbers show as text. Images and link text are not shown."
              : "Add a participant-only Columns block first: one column per contact."
        }
      >
        <option value="">None</option>
        {hilang ? <option value={value ?? ""}>Not available</option> : null}
        {pilihan.map((block) => (
          <option key={block.id} value={block.id}>
            {`${block.heading || "Untitled block"}${block.empty ? " (empty)" : ""}`}
          </option>
        ))}
      </SelectField>
      {terpilih ? (
        <Link
          href={`/admin/landing?blok=${encodeURIComponent(terpilih.id)}`}
          onClick={(event) => {
            if (!adaPerubahan) return;
            event.preventDefault();
            toast.error("Save or cancel your changes first", "Leaving Participant area now would lose them.");
          }}
          className="m3-state inline-flex min-h-9 items-center gap-0.5 whitespace-nowrap rounded-md px-1 text-label-large font-medium text-primary"
        >
          Edit in Event page
          <CaretRight size={14} aria-hidden />
        </Link>
      ) : pilihan.length === 0 ? (
        <>
          <Button
            variant="outlined"
            size="sm"
            icon={<Plus size={16} aria-hidden />}
            onClick={() => {
              if (adaPerubahan) { setTolakTambah(true); return; }
              router.push(withEventPrefix("/admin/landing?tambah=multicolumn&untuk=peserta", window.location.pathname));
            }}
          >
            Add Columns block
          </Button>
          {tolakTambah && adaPerubahan ? (
            <p role="status" className="text-body-small text-on-surface-variant">Save or cancel your changes first. Adding a block opens it on the Event page.</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
