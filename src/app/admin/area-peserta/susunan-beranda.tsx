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

type Baris = { id: string; judul: string; sub: string; blok: boolean; tampil: boolean; mati: string | null; tetap: boolean };

/**
 * Gathering Horizon menaruh isi bawaan di tempat tetap (pass, tiket, panduan
 * checkpoint, Next up, teman sekamar). Yang dipakai dari urutan hanya posisi
 * Announcements terhadap Bus and room dan Next up, dan urutan blok di bawah.
 * Quick links dan Today's agenda tidak dirender, jadi tidak ditawarkan.
 */
const HORIZON_TETAP = ["checkpoints", "logistics", "next", "roommates"] as const;
const HORIZON_TANPA = ["quick", "agenda"];

function geser(order: string[], dari: number, ke: number) {
  const next = [...order];
  const [id] = next.splice(dari, 1);
  next.splice(ke, 0, id);
  return next;
}

/**
 * Tempat Announcements di Horizon, dihitung persis seperti dashboard: ponsel
 * melihat posisinya terhadap Bus and room, layar lebar terhadap Next up.
 * 0 = paling atas (layar lebar sebelum Next up), 1 = setelah Bus and room,
 * 2 = setelah Next up, 3 = paling atas di ponsel tetapi setelah Next up di
 * layar lebar (urutan lama dari Gathering klasik; dipertahankan sampai admin
 * memindahkannya sendiri).
 */
type SlotPengumuman = 0 | 1 | 2 | 3;

function slotPengumuman(order: string[]): SlotPengumuman | null {
  const posisi = (id: string) => order.indexOf(id);
  if (!order.includes("announcements")) return null;
  const sebelumBus = posisi("announcements") < posisi("logistics");
  const sebelumNext = posisi("announcements") < posisi("next");
  return sebelumBus ? (sebelumNext ? 0 : 3) : sebelumNext ? 1 : 2;
}

/** Urutan yang tampil di editor: urutan ponsel, lalu blok. */
function tampilanHorizon(slot: SlotPengumuman | null, blok: string[]): string[] {
  const isi: string[] = [...HORIZON_TETAP];
  if (slot !== null) isi.splice(slot === 0 || slot === 3 ? 0 : slot === 1 ? isi.indexOf("next") : isi.indexOf("roommates"), 0, "announcements");
  return [...isi, ...blok];
}

/** Urutan yang disimpan: sama dengan tampilan, kecuali slot 3 yang butuh Next up di depan. */
function simpananHorizon(slot: SlotPengumuman | null, blok: string[]): string[] {
  return slot === 3 ? ["next", "announcements", "checkpoints", "logistics", "roommates", ...blok] : tampilanHorizon(slot, blok);
}

export function SusunanBeranda({
  layout,
  member,
  blocks,
  checkpointsOn,
  horizon = false,
  set,
  dipilih,
  onPilih,
}: {
  layout: "gathering" | "modern";
  member: LandingMemberConfig;
  blocks: BlokPeserta[];
  /** Check-in > Checkpoints dinyalakan; mati = barisnya menyebut di mana menyalakannya. */
  checkpointsOn: boolean;
  /** Gathering Horizon tidak menampilkan "Today's agenda": barisnya tidak ditawarkan, datanya tetap. */
  horizon?: boolean;
  set: (patch: Partial<LandingMemberConfig>) => void;
  /** Baris yang sedang disorot di pratinjau. */
  dipilih: string | null;
  onPilih: (id: string) => void;
}) {
  const gathering = layout === "gathering";
  const [seret, setSeret] = useState<number | null>(null);
  const [sasaran, setSasaran] = useState<number | null>(null);
  const { order: urutanPenuh, hidden } = memberHomeOrder(member.home, blocks.map((block) => block.id), gathering);
  const diHorizon = gathering && horizon;
  const tetap = new Set<string>(diHorizon ? HORIZON_TETAP : []);
  const tanpa = new Set(diHorizon ? HORIZON_TANPA : []);
  const blokDari = (ids: string[]) => ids.filter((id) => !tetap.has(id) && !tanpa.has(id) && id !== "announcements");
  const slot = diHorizon ? slotPengumuman(urutanPenuh) : null;
  const order = diHorizon ? tampilanHorizon(slot, blokDari(urutanPenuh)) : urutanPenuh;
  /**
   * Urutan tampilan setelah satu baris dipindah menjadi urutan simpanan. Di
   * Horizon hanya Announcements yang mengganti tempat; baris lain yang dipindah
   * tidak menyentuh tempatnya, jadi slot 3 tidak hilang karena blok digeser.
   */
  const keSimpanan = (next: string[], yangDipindah: string | null) => {
    if (!diHorizon) return next;
    const slotBaru: SlotPengumuman | null =
      yangDipindah === "announcements" ? slotPengumuman(next) : slot;
    return simpananHorizon(slotBaru, blokDari(next));
  };
  // Baris yang tidak ditawarkan kembali tepat sebelum isi yang dulu mengikutinya.
  const lengkapi = (next: string[]) => {
    const hasil = [...next];
    urutanPenuh.forEach((id, index) => {
      if (!tanpa.has(id)) return;
      const pengikut = urutanPenuh.slice(index + 1).find((lain) => hasil.includes(lain));
      hasil.splice(pengikut ? hasil.indexOf(pengikut) : hasil.length, 0, id);
    });
    return hasil;
  };
  const logistikMati = member.show_logistics !== true;
  const alasanMati = (id: string): string | null => {
    if (id === "agenda" && member.show_schedule === false) return "Agenda is off below";
    if ((id === "logistics" || id === "roommates" || (id === "next" && !gathering)) && logistikMati) return "Room and bus is off below";
    if (id === "roommates" && member.show_roommates === false) return "Roommates are off in Logistics";
    if (id === "checkpoints" && !checkpointsOn) return "Off in Check-in";
    return null;
  };
  const baris: Baris[] = order.map((id) => {
    const bawaan = MEMBER_HOME_BUILTINS[layout].find((item) => item.id === id);
    // Urutan lama: di ponsel paling atas, di layar lebar setelah Next up. Disebut, bukan diam-diam dipindah.
    const sub = id === "announcements" && slot === 3 ? `Top on phones, after Next up on wide screens · ${bawaan?.sub}` : bawaan?.sub ?? "";
    if (bawaan) return { id, judul: bawaan.label, sub, blok: false, tampil: !hidden.has(id), mati: alasanMati(id), tetap: tetap.has(id) };
    const block = blocks.find((item) => item.id === id)!;
    const jenis = `${LANDING_BLOCK_LABELS[block.type]} block`;
    return {
      id,
      judul: block.heading || LANDING_BLOCK_LABELS[block.type],
      sub: block.show_on === "both" ? `${jenis} · also on the Event page` : `${jenis} · participant page only`,
      blok: true,
      tampil: !hidden.has(id),
      mati: block.hidden_on_page ? "Hidden in Page sections" : block.empty ? "Empty, add content on the Event page" : null,
      tetap: false,
    };
  });

  const hasilPindah = (dari: number, ke: number) => keSimpanan(geser(order, dari, ke), order[dari]);
  const pindah = (dari: number, ke: number) => {
    if (ke < 0 || ke >= order.length || dari === ke) return;
    set({ home: { ...member.home, order: lengkapi(hasilPindah(dari, ke)) } });
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
    set({ home: { ...member.home, order: diHorizon ? lengkapi(keSimpanan(order, null)) : urutanPenuh, hidden: [...next] } });
  };
  const tombolPegangan = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const arah = event.key === "ArrowUp" ? -1 : 1;
    // Horizon merapikan ke tempat tampil yang tetap: lompati langkah yang
    // tidak mengubah apa pun, supaya satu panah selalu terlihat hasilnya.
    let ke = index + arah;
    const sekarang = keSimpanan(order, null).join();
    while (ke >= 0 && ke < order.length && hasilPindah(index, ke).join() === sekarang) ke += arah;
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
            {b.tetap ? (
              <span aria-hidden className="w-7 shrink-0" />
            ) : (
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
            )}
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
                {[!b.tampil ? "Hidden" : b.mati, b.tetap ? "Fixed place" : null, b.sub].filter(Boolean).join(" · ")}
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
        {diHorizon
          ? "Horizon keeps Checkpoints, Bus and room, Next up and Roommates in fixed places. Drag Announcements to choose where it shows; your blocks follow at the bottom in this order. "
          : gathering
          ? "Drag to reorder. Phones show this order from top to bottom; on wide screens Bus and room, Roommates and Quick links stay in the side column, in that order. "
          : "Drag to reorder. The ticket, Room, bus and items and Quick links stay in the side column, in this order, which phones show first. "}
        To add your own content, add a block on the{" "}
        <Link href="/admin/landing" className="rounded-sm font-medium text-primary hover:underline">Event page</Link> and set Show on to Participant page.
      </p>
    </div>
  );
}
