"use client";

import { CaretRight, DotsSixVertical, Eye, EyeSlash, LockSimple, Plus } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, type DragEvent, type KeyboardEvent } from "react";
import Link from "@/components/event-link";
import { Button } from "@/components/m3";
import { useToast } from "@/components/toast";
import { LANDING_BLOCK_LABELS, MEMBER_HOME_BUILTINS, memberHomeOrder, type LandingBlockShowOn, type MemberHomeSource, type LandingBlockType, type LandingMemberConfig } from "@/lib/domain";
import { TETAP_HORIZON, pindahHorizon, urutanHorizon } from "@/lib/member/susunan-horizon";
import { withEventPrefix } from "@/lib/event-path";
import { cx } from "@/lib/m3/cx";
import { TambahBlokDialog } from "../landing/blocks";

/**
 * Participant home: urutan Beranda halaman peserta, pola yang sama dengan
 * Page sections di Event page (pegangan seret, nomor, mata).
 *
 * Isinya isi bawaan dashboard (MEMBER_HOME_BUILTINS) dan blok halaman acara
 * yang Show on-nya Participant page atau Both. Urutan dan yang disembunyikan
 * disimpan di `member.home`; urutannya dihitung memberHomeOrder (Gathering
 * Horizon: urutanHorizon), fungsi yang sama dengan dashboard, jadi daftar ini
 * selalu sama dengan halamannya.
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
  /** Blok Columns khusus peserta saja: isinya untuk "Copy into contacts" di Emergency and help. */
  body?: string | null;
  en?: { heading?: string | null; body?: string | null };
  items?: Array<{ title?: string | null; body?: string | null; href?: string | null; en?: { title?: string | null; body?: string | null } }>;
};

type Baris = {
  id: string;
  judul: string;
  sub: string;
  blok: boolean;
  tampil: boolean;
  mati: string | null;
  tetap: boolean;
  /** Tempat isinya disunting: layar sumber untuk baris otomatis, Event page untuk blok. */
  sumber: MemberHomeSource;
};

/** Batas jumlah blok per acara, sama dengan Event page dan skema server. */
const MAKS_BLOK = 30;

function geser(order: string[], dari: number, ke: number) {
  const next = [...order];
  const [id] = next.splice(dari, 1);
  next.splice(ke, 0, id);
  return next;
}

/** Keterangan tempat tetap Horizon (lib/member/susunan-horizon.ts). */
const TEMPAT_TETAP: Record<string, string> = { next: "Fixed at the top", roommates: "Stays with Vehicle and room", help: "Fixed at the bottom" };

export function SusunanBeranda({
  layout,
  member,
  blocks,
  checkpointsOn,
  horizon = false,
  jumlahBlok,
  adaPerubahan,
  set,
  dipilih,
  onPilih,
  outfitAda,
  outfitDari,
  kontakAda,
}: {
  layout: "gathering" | "modern";
  member: LandingMemberConfig;
  blocks: BlokPeserta[];
  /** Check-in > Checkpoints dinyalakan; mati = barisnya menyebut di mana menyalakannya. */
  checkpointsOn: boolean;
  /** Gathering Horizon tidak menampilkan "Today's agenda": barisnya tidak ditawarkan, datanya tetap. */
  horizon?: boolean;
  /** Semua blok acara, untuk batas Add block. */
  jumlahBlok: number;
  /** Ada setelan yang belum disimpan: Add block membuka Event page, jadi disimpan dulu. */
  adaPerubahan: boolean;
  set: (patch: Partial<LandingMemberConfig>) => void;
  /** Baris yang sedang disorot di pratinjau. */
  dipilih: string | null;
  onPilih: (id: string) => void;
  /** Horizon: ada dress code di Agenda atau Every day; false = baris Today's dress code menyebut di mana mengisinya. */
  outfitAda?: boolean;
  /**
   * Horizon: asal isi Today's dress code. "setiap" = hanya Every day (mis. acara
   * tanpa tab Agenda), jadi barisnya menunjuk ke kolom Every day di halaman ini,
   * bukan ke Agenda yang tidak berisi apa-apa.
   */
  outfitDari?: "agenda" | "setiap" | "keduanya";
  /** Horizon: ada telepon atau email panitia di Event settings; false = baris Help card menyebutnya. */
  kontakAda?: boolean;
}) {
  const gathering = layout === "gathering";
  const router = useRouter();
  const [tambahTerbuka, setTambahTerbuka] = useState(false);
  const [tolakTambah, setTolakTambah] = useState<"penuh" | "berubah" | null>(null);
  const toast = useToast();
  const [seret, setSeret] = useState<number | null>(null);
  const [sasaran, setSasaran] = useState<number | null>(null);
  const diHorizon = gathering && horizon;
  const idBlok = blocks.map((block) => block.id);
  const { order: urutanPenuh, hidden: tersembunyiLama } = memberHomeOrder(member.home, idBlok, gathering);
  // Horizon: urutan tampil dengan tempat tetap (Next up di atas, Help card di bawah),
  // dan mata dibaca apa adanya, karena Today's dress code dan Help card tidak dikenal
  // Gathering klasik. Simpanan lama dibaca sebagai tempat Announcements saja.
  const order = diHorizon ? urutanHorizon(member.home, idBlok) : urutanPenuh;
  const hidden = diHorizon ? new Set(member.home?.hidden ?? []) : tersembunyiLama;
  const tetap: ReadonlySet<string> = diHorizon ? TETAP_HORIZON : new Set<string>();
  const logistikMati = member.show_logistics !== true;
  const alasanMati = (id: string): string | null => {
    if (id === "agenda" && member.show_schedule === false) return "Agenda is off below";
    if ((id === "logistics" || id === "roommates" || (id === "next" && !gathering)) && logistikMati) return "Room and vehicle is off below";
    if (id === "roommates" && member.show_roommates === false) return "Roommates are off in Logistics";
    if (id === "checkpoints" && !checkpointsOn) return "Off in Check-in";
    if (id === "outfit" && outfitAda === false) return "No dress code yet in Agenda or Every day";
    if (id === "help" && kontakAda === false) return "No organiser phone or email in Event settings";
    return null;
  };
  const baris: Baris[] = order.map((id) => {
    const bawaan = MEMBER_HOME_BUILTINS[diHorizon ? "horizon" : layout].find((item) => item.id === id);
    const subBawaan =
      id === "outfit" && outfitDari === "setiap"
        ? "From Every day under Dress code page"
        : id === "outfit" && outfitDari === "keduanya"
          ? "From Agenda > Dress code and Every day"
          : bawaan?.sub;
    // Horizon mulai 1024 px: Announcements dan Today's dress code di kolom samping; urutan ini berlaku di bawah 1024 px.
    // Teman sekamar: satu baris di kartu perjalanan selama acara. Disebut, bukan diam-diam.
    const sub =
      diHorizon && (id === "announcements" || id === "outfit")
        ? `Side column on wide screens · ${subBawaan}`
        : diHorizon && id === "roommates"
          ? `In the travel card during the event · ${bawaan?.sub}`
          : bawaan?.sub ?? "";
    if (bawaan) return { id, judul: bawaan.label, sub, blok: false, tampil: !hidden.has(id), mati: alasanMati(id), tetap: tetap.has(id), sumber: bawaan.source };
    const block = blocks.find((item) => item.id === id)!;
    const jenis = LANDING_BLOCK_LABELS[block.type];
    return {
      id,
      judul: block.heading || LANDING_BLOCK_LABELS[block.type],
      sub: block.show_on === "both" ? `${jenis} · also on the Event page` : jenis,
      blok: true,
      tampil: !hidden.has(id),
      mati: block.hidden_on_page
        ? "Hidden in Page sections"
        : block.empty
          ? "Empty, add content on the Event page"
          : diHorizon && member.help_block === id
            ? "Shown in Menu as Emergency and help"
            : null,
      tetap: false,
      sumber: { label: "Event page", href: `/admin/landing?blok=${encodeURIComponent(id)}` },
    };
  });

  // Horizon menyimpan urutan tampil apa adanya (format baru, memuat "help"); tempat tetap dirapikan.
  const hasilPindah = (dari: number, ke: number) => (diHorizon ? pindahHorizon(order, order[dari], ke) : geser(order, dari, ke));
  const pindah = (dari: number, ke: number) => {
    if (ke < 0 || ke >= order.length || dari === ke) return;
    // Pindah yang dirapikan kembali ke tempat semula tidak mengubah draf.
    const baru = hasilPindah(dari, ke);
    if (baru.join() === order.join()) return;
    set({ home: { ...member.home, order: baru } });
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
    const arah = event.key === "ArrowUp" ? -1 : 1;
    // Horizon merapikan ke tempat tetap: lompati langkah yang tidak mengubah
    // apa pun, supaya satu panah selalu terlihat hasilnya.
    let ke = index + arah;
    const sekarang = order.join();
    while (ke >= 0 && ke < order.length && hasilPindah(index, ke).join() === sekarang) ke += arah;
    pindah(index, ke);
    // Fokus ikut barisnya, supaya panah berikutnya memindahkan baris yang sama.
    window.requestAnimationFrame(() => document.getElementById(`pegangan-${order[index]}`)?.focus());
  };

  // Tempat isi baris disunting. Pindah layar membuang urutan dan mata yang
  // belum disimpan, jadi ditahan dulu selama ada perubahan.
  const tautanSumber = (b: Baris, letak: string) =>
    b.id === "outfit" && outfitDari === "setiap" ? (
      // Hanya Every day: kolomnya ada di halaman ini, jadi dibawa ke layar dan
      // difokus (seperti ?fokus=setiap-hari dari Agenda), tanpa pindah layar.
      <button
        type="button"
        onClick={() => {
          const kolom = document.querySelector<HTMLElement>("[data-setiap-apa]");
          kolom?.scrollIntoView({ block: "center", behavior: "smooth" });
          kolom?.focus({ preventScroll: true });
        }}
        className={cx("m3-state min-h-9 items-center gap-0.5 whitespace-nowrap rounded-md px-1 text-label-large font-medium text-primary sm:pl-2", letak)}
        aria-label={`Edit ${b.judul} in Every day`}
      >
        Edit Every day
        <CaretRight size={14} aria-hidden />
      </button>
    ) : (
      <Link
        href={b.sumber.href}
        onClick={(event) => {
          if (!adaPerubahan) return;
          event.preventDefault();
          toast.error("Save or cancel your changes first", "Leaving Participant area now would lose them.");
        }}
        className={cx("m3-state min-h-9 items-center gap-0.5 whitespace-nowrap rounded-md px-1 text-label-large font-medium text-primary sm:pl-2", letak)}
        aria-label={b.blok ? `Edit ${b.judul}` : `Edit ${b.judul} in ${b.sumber.label}`}
      >
        {b.blok ? "Edit" : `Edit in ${b.sumber.label}`}
        <CaretRight size={14} aria-hidden />
      </Link>
    );

  return (
    <div className="flex flex-col gap-2">
      <ol className="overflow-hidden rounded-lg border border-outline-variant">
        {baris.map((b, index) => (
          <li
            key={b.id}
            id={`baris-beranda-${b.id}`}
            className={cx(
              "flex min-h-14 items-center gap-2 border-b border-outline-variant pr-1 last:border-b-0",
              dipilih === b.id && "bg-primary-soft shadow-[inset_3px_0_0_var(--color-primary)]",
              seret === index && "opacity-50",
              // Garis jatuh hanya di tempat yang benar-benar mengubah urutan (bukan pada baris bertempat tetap).
              seret !== null && sasaran === index && seret !== index && !tetap.has(b.id) && hasilPindah(seret, index).join() !== order.join() && (seret < index ? "border-b-2 border-b-primary" : "border-t-2 border-t-primary"),
            )}
            onDragEnter={(event: DragEvent<HTMLLIElement>) => { if (seret !== null) event.preventDefault(); }}
            onDragOver={(event: DragEvent<HTMLLIElement>) => { if (seret === null) return; event.preventDefault(); setSasaran(index); }}
            onDrop={(event: DragEvent<HTMLLIElement>) => { event.preventDefault(); lepas(index); }}
          >
            {b.tetap ? (
              <span title={TEMPAT_TETAP[b.id] ?? "Fixed place"} className="flex h-14 w-7 shrink-0 items-center justify-center self-stretch text-on-surface-variant">
                <LockSimple size={14} aria-hidden />
              </span>
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
            {/* Ponsel: tautan sumber di baris sendiri di bawah judul, supaya judul
                dan tempat menyuntingnya sama-sama terbaca utuh. */}
            <div className="flex min-w-0 flex-1 flex-col self-stretch py-1 sm:py-0">
              <button type="button" onClick={() => onPilih(b.id)} className="m3-state min-w-0 flex-1 rounded-sm px-1 py-1 text-left sm:py-2" aria-label={`${b.judul}: show in preview`}>
                <span className={cx("block truncate text-body-medium font-medium", b.tampil && !b.mati ? "text-on-surface" : "text-on-surface-variant")}>{b.judul}</span>
                {/* Jenis baris selalu terbaca; keterangannya yang terpotong bila sempit. */}
                {(() => {
                  // Dua baris paling banyak; teks lengkap di title, supaya tempat tetap dan alasannya terbaca.
                  const keterangan = [!b.tampil ? "Hidden" : b.mati, b.tetap ? (TEMPAT_TETAP[b.id] ?? "Fixed place") : null, b.sub].filter(Boolean).join(" · ");
                  return (
                    <span className="flex min-w-0 gap-1 text-body-small text-on-surface-variant" title={`${b.blok ? "Your block" : "Automatic"} · ${keterangan}`}>
                      <span className="shrink-0 font-medium">{b.blok ? "Your block" : "Automatic"}</span>
                      <span className="line-clamp-2">{`· ${keterangan}`}</span>
                    </span>
                  );
                })()}
              </button>
              {tautanSumber(b, "inline-flex self-start sm:hidden")}
            </div>
            {tautanSumber(b, "hidden shrink-0 sm:inline-flex")}
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
          ? "Drag a row here, or a card in the Phone preview. Next up stays at the top, where only Announcements can go above it, and the Help card stays at the bottom. Phones show this order; from 1024 px wide, Announcements and Today's dress code move to the side column. "
          : gathering
          ? "Drag to reorder. Phones show this order from top to bottom; on wide screens Vehicle and room, Roommates and Quick links stay in the side column, in that order. "
          : "Drag to reorder. The ticket, Room, vehicle and items and Quick links stay in the side column, in this order, which phones show first. "}
        Automatic rows fill themselves from your event data: edit them where their link points.
      </p>
      <div className="flex flex-col items-start gap-1.5">
        <Button
          variant="outlined"
          size="sm"
          icon={<Plus size={16} aria-hidden />}
          onClick={() => {
            if (jumlahBlok >= MAKS_BLOK) { setTolakTambah("penuh"); return; }
            if (adaPerubahan) { setTolakTambah("berubah"); return; }
            setTolakTambah(null);
            setTambahTerbuka(true);
          }}
        >
          Add block
        </Button>
        {/* Alasannya hilang sendiri begitu tidak berlaku lagi (setelah Save atau Cancel). */}
        {tolakTambah === "penuh" && jumlahBlok >= MAKS_BLOK ? (
          <p role="status" className="text-body-small text-on-surface-variant">This event already has {MAKS_BLOK} blocks, the most allowed. Delete one on the Event page first.</p>
        ) : tolakTambah === "berubah" && adaPerubahan ? (
          <p role="status" className="text-body-small text-on-surface-variant">Save or cancel your changes first. Adding a block opens it on the Event page.</p>
        ) : null}
      </div>
      <TambahBlokDialog
        open={tambahTerbuka}
        onClose={() => setTambahTerbuka(false)}
        description="Only signed-in participants see it. You fill it in on the Event page and save there; it then joins your blocks in this list."
        onPick={(type) => {
          setTambahTerbuka(false);
          router.push(withEventPrefix(`/admin/landing?tambah=${type}&untuk=peserta`, window.location.pathname));
        }}
      />
    </div>
  );
}
