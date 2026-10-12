"use client";

import { ArrowSquareOut, DotsSixVertical, Eye, EyeSlash } from "@phosphor-icons/react";
import { useState, type DragEvent, type KeyboardEvent } from "react";
import Link from "@/components/event-link";
import { LANDING_BLOCK_LABELS, MEMBER_HOME_BUILTINS, memberHomeOrder, type LandingBlockShowOn, type LandingBlockType, type LandingMemberConfig } from "@/lib/domain";
import { cx } from "@/lib/m3/cx";

/**
 * Participant home: urutan Beranda halaman peserta, pola yang sama dengan
 * Page sections di Event page (pegangan seret, nomor, mata).
 *
 * Isinya isi bawaan dashboard (MEMBER_HOME_BUILTINS) dan blok halaman acara
 * yang Show on-nya Participant page atau Both. Urutan dan yang disembunyikan
 * disimpan di `member.home`; urutannya dihitung memberHomeOrder, fungsi yang
 * sama dengan dashboard, jadi daftar ini selalu sama dengan halamannya.
 *
 * Mata di sini hanya menyembunyikan dari Beranda. Data di baliknya (Agenda,
 * Logistik) tetap diatur saklarnya di "Also available to participants": baris
 * yang saklarnya mati menyebutnya, bukan diam-diam kosong.
 */
export type BlokPeserta = {
  id: string;
  type: LandingBlockType;
  heading: string | null;
  show_on?: LandingBlockShowOn;
  /** Disembunyikan di Page sections: tidak tampil di halaman mana pun. */
  hidden_on_page: boolean;
  /** Belum ada isinya: tidak tampil sampai diisi. */
  empty: boolean;
};

type Baris = { id: string; judul: string; sub: string; blok: boolean; tampil: boolean; mati: string | null };

export function SusunanBeranda({
  layout,
  member,
  blocks,
  set,
  dipilih,
  onPilih,
}: {
  layout: "gathering" | "modern";
  member: LandingMemberConfig;
  blocks: BlokPeserta[];
  set: (patch: Partial<LandingMemberConfig>) => void;
  /** Baris yang sedang disorot di pratinjau. */
  dipilih: string | null;
  onPilih: (id: string) => void;
}) {
  const gathering = layout === "gathering";
  const [seret, setSeret] = useState<number | null>(null);
  const [sasaran, setSasaran] = useState<number | null>(null);
  const { order, hidden } = memberHomeOrder(member.home, blocks.map((block) => block.id), gathering);
  const logistikMati = member.show_logistics !== true;
  const alasanMati = (id: string): string | null => {
    if (id === "agenda" && member.show_schedule === false) return "Agenda is off below";
    if ((id === "logistics" || id === "roommates" || (id === "next" && !gathering)) && logistikMati) return "Room and bus is off below";
    if (id === "roommates" && member.show_roommates === false) return "Roommates are off in Logistics";
    return null;
  };
  const baris: Baris[] = order.map((id) => {
    const bawaan = MEMBER_HOME_BUILTINS[layout].find((item) => item.id === id);
    if (bawaan) return { id, judul: bawaan.label, sub: bawaan.sub, blok: false, tampil: !hidden.has(id), mati: alasanMati(id) };
    const block = blocks.find((item) => item.id === id)!;
    const jenis = `${LANDING_BLOCK_LABELS[block.type]} block`;
    return {
      id,
      judul: block.heading || LANDING_BLOCK_LABELS[block.type],
      sub: block.show_on === "both" ? `${jenis} · also on the Event page` : `${jenis} · participant page only`,
      blok: true,
      tampil: !hidden.has(id),
      mati: block.hidden_on_page ? "Hidden in Page sections" : block.empty ? "Empty, add content on the Event page" : null,
    };
  });

  const simpanUrutan = (next: string[]) => set({ home: { ...member.home, order: next } });
  const pindah = (dari: number, ke: number) => {
    if (ke < 0 || ke >= order.length || dari === ke) return;
    const next = [...order];
    const [id] = next.splice(dari, 1);
    next.splice(ke, 0, id);
    simpanUrutan(next);
  };
  const lepas = (target: number) => {
    if (seret !== null) pindah(seret, target);
    setSeret(null);
    setSasaran(null);
  };
  const ganti = (b: Baris) => {
    const next = new Set(hidden);
    if (b.tampil) next.add(b.id);
    else next.delete(b.id);
    // Urutan ikut disimpan: tanpa itu, blok yang ditambahkan nanti bisa
    // menggeser isi yang posisinya sudah dilihat admin di pratinjau.
    set({ home: { ...member.home, order, hidden: [...next] } });
  };
  const tombolPegangan = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const ke = index + (event.key === "ArrowUp" ? -1 : 1);
    pindah(index, ke);
    // Fokus ikut barisnya, supaya panah berikutnya memindahkan baris yang sama.
    window.requestAnimationFrame(() => document.getElementById(`pegangan-${order[index]}`)?.focus());
  };

  return (
    <div className="flex flex-col gap-2">
      <ol className="overflow-hidden rounded-lg border border-outline-variant">
        {baris.map((b, index) => (
          <li
            key={b.id}
            className={cx(
              "flex min-h-14 items-center gap-2 border-b border-outline-variant pr-1 last:border-b-0",
              dipilih === b.id && "bg-primary-soft shadow-[inset_3px_0_0_var(--color-primary)]",
              seret === index && "opacity-50",
              seret !== null && sasaran === index && seret !== index && (seret < index ? "border-b-2 border-b-primary" : "border-t-2 border-t-primary"),
            )}
            onDragEnter={(event: DragEvent<HTMLLIElement>) => { if (seret !== null) event.preventDefault(); }}
            onDragOver={(event: DragEvent<HTMLLIElement>) => { if (seret === null) return; event.preventDefault(); setSasaran(index); }}
            onDrop={(event: DragEvent<HTMLLIElement>) => { event.preventDefault(); lepas(index); }}
          >
            <button
              type="button"
              id={`pegangan-${b.id}`}
              draggable
              onDragStart={(event) => { setSeret(index); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", b.judul); }}
              onDragEnd={() => { setSeret(null); setSasaran(null); }}
              onKeyDown={(event) => tombolPegangan(event, index)}
              aria-label={`Move ${b.judul}, position ${index + 1} of ${baris.length}. Use the up and down arrow keys.`}
              title="Drag to move"
              className="flex h-14 w-7 shrink-0 cursor-grab items-center justify-center self-stretch rounded-sm text-on-surface-variant opacity-80 hover:opacity-100"
            >
              <DotsSixVertical size={16} aria-hidden />
            </button>
            <span
              aria-hidden
              className={cx(
                "grid size-7 shrink-0 place-items-center rounded-sm text-body-small font-medium tabular-nums",
                !b.tampil || b.mati ? "border border-dashed border-outline-variant text-on-surface-variant" : "bg-surface-container-high text-on-surface-variant",
              )}
            >
              {index + 1}
            </span>
            <button type="button" onClick={() => onPilih(b.id)} className="m3-state min-w-0 flex-1 self-stretch rounded-sm px-1 py-2 text-left" aria-label={`${b.judul}: show in preview`}>
              <span className={cx("block truncate text-body-medium font-medium", b.tampil && !b.mati ? "text-on-surface" : "text-on-surface-variant")}>{b.judul}</span>
              <span className="block truncate text-body-small text-on-surface-variant">
                {!b.tampil ? `Hidden · ${b.sub}` : b.mati ? `${b.mati} · ${b.sub}` : b.sub}
              </span>
            </button>
            {b.blok ? (
              <Link href={`/admin/landing?blok=${encodeURIComponent(b.id)}`} className="m3-state inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-label-large font-medium text-primary" aria-label={`Edit ${b.judul} on the Event page`}>
                Edit <ArrowSquareOut size={14} aria-hidden />
              </Link>
            ) : null}
            <button
              type="button"
              aria-label={b.tampil ? `Hide ${b.judul}` : `Show ${b.judul}`}
              aria-pressed={!b.tampil}
              onClick={() => ganti(b)}
              className="m3-state flex size-9 shrink-0 items-center justify-center rounded-md text-on-surface-variant"
            >
              {b.tampil ? <Eye size={18} aria-hidden /> : <EyeSlash size={18} aria-hidden />}
            </button>
          </li>
        ))}
      </ol>
      <p className="text-body-small text-on-surface-variant">
        {gathering
          ? "Drag to reorder. Phones show this order from top to bottom; on wide screens Quick links, Bus and room and Roommates stay in the side column, in this order. "
          : "Drag to reorder. The ticket, Room, bus and items and Quick links stay in the side column, in this order, which phones show first. "}
        To add your own content, add a block on the{" "}
        <Link href="/admin/landing" className="rounded-sm font-medium text-primary hover:underline">Event page</Link> and set Show on to Participant page.
      </p>
    </div>
  );
}
