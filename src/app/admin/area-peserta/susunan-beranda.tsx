"use client";

import { ArrowSquareOut, DotsSixVertical, Eye, EyeSlash } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { LANDING_BLOCK_LABELS, MEMBER_HOME_BUILTINS, type LandingBlockType, type LandingMemberConfig } from "@/lib/domain";
import { cx } from "@/lib/m3/cx";

// PROTO PR 2 (mockup): susunan Beranda halaman peserta, pola yang sama dengan Page sections.
export type BlokPeserta = { id: string; type: LandingBlockType; heading: string | null; show_on: "member" | "both" };

type Baris = { id: string; judul: string; sub: string; blok: boolean; tampil: boolean };

export function urutanBeranda(member: LandingMemberConfig, blocks: BlokPeserta[]): string[] {
  const semua = [...MEMBER_HOME_BUILTINS.map((item) => item.id as string), ...blocks.map((block) => block.id)];
  const simpan = (member.home?.order ?? []).filter((id) => semua.includes(id));
  // Yang belum ada di urutan tersimpan: bawaan di posisi bawaannya, blok baru di atas Today's agenda.
  const hasil = [...simpan];
  semua.forEach((id) => {
    if (hasil.includes(id)) return;
    const posisi = id.startsWith("blk_") ? hasil.indexOf("agenda") : -1;
    if (posisi >= 0) hasil.splice(posisi, 0, id);
    else hasil.push(id);
  });
  return hasil;
}

export function SusunanBeranda({ member, blocks, set }: { member: LandingMemberConfig; blocks: BlokPeserta[]; set: (patch: Partial<LandingMemberConfig>) => void }) {
  const hidden = new Set(member.home?.hidden ?? []);
  const tampilBawaan = (id: string) =>
    id === "logistics" ? member.show_logistics === true : id === "agenda" ? member.show_schedule !== false : id === "roommates" ? member.show_roommates !== false : !hidden.has(id);
  const baris: Baris[] = urutanBeranda(member, blocks).map((id) => {
    const bawaan = MEMBER_HOME_BUILTINS.find((item) => item.id === id);
    if (bawaan) return { id, judul: bawaan.label, sub: bawaan.sub, blok: false, tampil: tampilBawaan(id) };
    const block = blocks.find((item) => item.id === id)!;
    return {
      id,
      judul: block.heading?.trim() || LANDING_BLOCK_LABELS[block.type],
      sub: `${LANDING_BLOCK_LABELS[block.type]} block${block.show_on === "both" ? " · also on the Event page" : " · participant page only"}`,
      blok: true,
      tampil: !hidden.has(id),
    };
  });
  const ganti = (b: Baris) => {
    if (b.id === "logistics") return set({ show_logistics: !b.tampil });
    if (b.id === "agenda") return set({ show_schedule: !b.tampil });
    if (b.id === "roommates") return set({ show_roommates: !b.tampil });
    const next = new Set(hidden);
    if (b.tampil) next.add(b.id);
    else next.delete(b.id);
    set({ home: { ...member.home, hidden: [...next] } });
  };
  return (
    <div className="flex flex-col gap-2">
      <ol className="overflow-hidden rounded-lg border border-outline-variant">
        {baris.map((b, index) => (
          <li key={b.id} className="flex min-h-14 items-center gap-3 border-b border-outline-variant px-2 last:border-b-0">
            <DotsSixVertical size={18} aria-hidden className="shrink-0 cursor-grab text-on-surface-variant" />
            <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-md text-label-large font-semibold tabular-nums", b.tampil ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant")}>{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className={cx("block truncate text-body-medium font-medium", b.tampil ? "text-on-surface" : "text-on-surface-variant")}>{b.judul}</span>
              <span className="block truncate text-body-small text-on-surface-variant">
                {b.sub}
                {b.tampil ? "" : " · hidden"}
                {b.id === "logistics" && !b.tampil ? " until allocations are final" : ""}
              </span>
            </span>
            {b.blok ? (
              <Link href={`/admin/landing#${b.id}`} className="m3-state inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-label-large font-medium text-primary">
                Edit <ArrowSquareOut size={14} aria-hidden />
              </Link>
            ) : null}
            <button
              type="button"
              aria-label={b.tampil ? `Hide ${b.judul}` : `Show ${b.judul}`}
              onClick={() => ganti(b)}
              className="m3-state flex size-9 items-center justify-center rounded-md text-on-surface-variant"
            >
              {b.tampil ? <Eye size={18} /> : <EyeSlash size={18} />}
            </button>
          </li>
        ))}
      </ol>
      <p className="text-body-small text-on-surface-variant">
        Drag to reorder. Phones show this order from top to bottom; on wide screens Bus and room, Roommates and Quick links sit in the right column. To add your own content, add a block on the{" "}
        <Link href="/admin/landing" className="rounded-sm font-medium text-primary hover:underline">Event page</Link> and set Show on to Participant page.
      </p>
    </div>
  );
}
