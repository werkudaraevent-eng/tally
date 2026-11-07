"use client";

import {
  AirplaneTilt, ArrowDown, ArrowLeft, ArrowSquareOut, ArrowUp, Bed, CalendarCheck, Cards, ChatsCircle, Confetti, Copy, DotsSixVertical, FlagCheckered, Gauge,
  Gift, HandWaving, ListChecks, Plus, Smiley, TextAa, Trash, X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Kelompok } from "@/components/admin/compact-form";
import {
  Banner, Button, ButtonLink, FilterChip, IconButton, Popover, POPOVER_ITEM, SegmentedButton, SelectField, StatusChip, Switch, TextArea, TextField, usePopoverAnchor,
} from "@/components/m3";
import type { BalasanPratinjau, PesanDraf } from "@/app/kilas-balik/kilas-client";
import { alamatKilasBalik } from "@/lib/kilas-balik/alamat";
import { SYARAT_MAX, kunciRecall, type Syarat } from "@/lib/kilas-balik/logika";
import {
  KARTU, PERTANYAAN_MAX, PILIHAN_MAX, kunciBaru, masalahLogika, urutAlur, type JenisPertanyaan, type KunciKartu, type Pertanyaan, type SetelanKilas, type Tampilan,
} from "@/lib/kilas-balik/setelan";
import { cx } from "@/lib/m3/cx";
import { PilihPeserta, type PesertaPratinjau } from "../area-peserta/pratinjau-peserta";

/**
 * Admin > Feedback > Build. Satu layar untuk menyusun kuesioner, pola builder
 * Typeform (juga Maze dan Sprig): daftar alur di kiri, layar peserta di tengah,
 * isian baris terpilih di kanan.
 *
 * - Kiri: urutan yang dialami peserta. Pembuka, empat kartu kenangan dengan
 *   pertanyaan di bawahnya, pertanyaan sesudah kartu, penutup. Seret pertanyaan
 *   ke bawah kartu lain untuk memindahkannya (sama dengan "Show after").
 * - Tengah: halaman peserta sungguhan (iframe ?pratinjau) yang menerima draf
 *   lewat postMessage, jadi perubahan terlihat sebelum Save, dan melompat ke
 *   layar yang sedang disunting.
 * - Kanan: Content untuk baris terpilih, atau Design (tampilan dan warna).
 *
 * Di bawah xl pratinjau dibuka di tab baru; di bawah lg daftar dan isian
 * bergantian (drill-in, sama dengan editor Event page).
 */

export type DataBuilder = {
  lang: "id" | "en";
  bahasa_lain: boolean;
  slug: string;
  agenda: string[];
  tema_acara: { brand: string; accent: string };
  contoh: PesertaPratinjau | null;
  logika: { sesi: { id: number; name: string }[]; kolom: { key: string; label: string; options: string[] }[]; hadiah: boolean };
};

type Pilih = { jenis: "buka" } | { jenis: "kartu"; kartu: KunciKartu } | { jenis: "tanya"; key: string } | { jenis: "tutup" };

const KARTU_INFO: Record<KunciKartu, { judul: string; isi: string; Ikon: typeof Bed }> = {
  trip: { judul: "Travel card", isi: "First outbound ticket from Logistics > Tickets, or the first vehicle trip. Only when Tickets or Vehicles are shown in the Participant area.", Ikon: AirplaneTilt },
  stay: { judul: "Stay card", isi: "Hotel, room number and roommates from Logistics > Rooms. Only when Rooms are shown in the Participant area.", Ikon: Bed },
  agenda: { judul: "Agenda card", isi: "How many check-in sessions they were scanned at, and the Agenda items they could see.", Ikon: CalendarCheck },
  prize: { judul: "Lucky draw card", isi: "Prizes they won, when the prize card is on in the Participant area.", Ikon: Gift },
};

export const JENIS_INFO: Record<JenisPertanyaan, { label: string; detail: string; Ikon: typeof Smiley; warna: string }> = {
  faces: { label: "Faces, 1 to 5", detail: "One tap. The quickest to answer.", Ikon: Smiley, warna: "bg-warning-soft text-on-warning-soft" },
  nps: { label: "Scale, 0 to 10", detail: "Would they recommend it. Gives an NPS score.", Ikon: Gauge, warna: "bg-success-soft text-on-success-soft" },
  choice: { label: "Choice", detail: "Pick one, or up to three.", Ikon: ListChecks, warna: "bg-primary-soft text-on-primary-soft" },
  text: { label: "Short text", detail: "In their own words.", Ikon: TextAa, warna: "bg-tertiary-container text-on-tertiary-container" },
};

const WAJAH_EN = ["Very bad", "Bad", "Okay", "Good", "Great"];

const TAMPILAN_PILIHAN: { value: Tampilan; label: string; detail: string; Ikon: typeof Cards }[] = [
  { value: "kilas", label: "Look back", detail: "One card per screen, like Stories. Their trip, stay and agenda come back as cards, with a question in between.", Ikon: Cards },
  { value: "percakapan", label: "Chat", detail: "A conversation with the organisers. Memories arrive as messages and answers go out as replies.", Ikon: ChatsCircle },
  { value: "ringkas", label: "One page", detail: "All questions on one page with one Send button. Memories show as a few numbers at the top.", Ikon: ListChecks },
];

const sama = (a: Pilih, b: Pilih) => a.jenis === b.jenis && (a.jenis !== "kartu" || (b.jenis === "kartu" && a.kartu === b.kartu)) && (a.jenis !== "tanya" || (b.jenis === "tanya" && a.key === b.key));

/** Pilihan sebuah pertanyaan pilihan, mengikuti carry forward ke sumbernya. */
function opsiDari(questions: readonly Pertanyaan[], q: Pertanyaan, jejak = 0): string[] {
  if (q.options_from && jejak < 8) {
    const sumber = questions.find((x) => x.key === q.options_from);
    return sumber ? opsiDari(questions, sumber, jejak + 1) : [];
  }
  return (q.options ?? []).filter((o) => o.trim());
}

/** Gabung pilihan tanpa nama kembar (huruf besar kecil diabaikan), paling banyak 12. */
export function gabungTanpaKembar(lama: readonly string[], baru: readonly string[]): string[] {
  const hasil: string[] = [];
  const ada = new Set<string>();
  for (const o of [...lama, ...baru]) {
    const t = o.trim();
    const k = t.toLocaleLowerCase("id");
    if (!t || ada.has(k)) continue;
    ada.add(k);
    hasil.push(t);
  }
  return hasil.slice(0, PILIHAN_MAX);
}

/* ================================================================ Builder */

export function Builder({ draf, setDraf, data }: { draf: SetelanKilas; setDraf: (s: SetelanKilas) => void; data: DataBuilder }) {
  const urut = useMemo(() => urutAlur(draf.questions), [draf.questions]);
  const [pilih, setPilihState] = useState<Pilih>(() => (urut[0] ? { jenis: "tanya", key: urut[0].key } : { jenis: "buka" }));
  const [panel, setPanel] = useState<"isi" | "desain">("isi");
  const [hpBuka, setHpBuka] = useState(false);
  const masalah = useMemo(
    () => masalahLogika(draf.questions, { sesi: data.logika.sesi.map((x) => x.id), kolom: data.logika.kolom }),
    [draf.questions, data.logika],
  );

  const setPertanyaan = useCallback((qs: Pertanyaan[]) => setDraf({ ...draf, questions: urutAlur(qs) }), [draf, setDraf]);
  const pilihBaris = (p: Pilih) => {
    setPilihState(p);
    setPanel("isi");
    setHpBuka(true);
  };

  // Baris terpilih yang sudah dihapus: kembali ke pembuka.
  const pilihSah: Pilih = pilih.jenis === "tanya" && !draf.questions.some((q) => q.key === pilih.key) ? { jenis: "buka" } : pilih;

  const tambah = (type: JenisPertanyaan) => {
    if (draf.questions.length >= PERTANYAAN_MAX) return;
    const key = kunciBaru(`q_${type}`, draf.questions.map((q) => q.key));
    let after: KunciKartu | null = null;
    let sesudah: string | null = null;
    if (pilihSah.jenis === "tanya") {
      const q = draf.questions.find((x) => x.key === pilihSah.key);
      after = q?.after ?? null;
      sesudah = pilihSah.key;
    } else if (pilihSah.jenis === "kartu") after = pilihSah.kartu;
    else if (pilihSah.jenis === "buka") after = KARTU[0];
    const baru: Pertanyaan = { key, type, title: "", title_alt: null, required: false, after, ...(type === "choice" ? { options: ["", ""], max: 1 } : {}) };
    const daftar = [...urut];
    const i = sesudah ? daftar.findIndex((q) => q.key === sesudah) + 1 : pilihSah.jenis === "kartu" || pilihSah.jenis === "buka" ? daftar.findIndex((q) => q.after === after) : -1;
    if (i < 0) daftar.push(baru);
    else daftar.splice(i, 0, baru);
    setPertanyaan(daftar);
    pilihBaris({ jenis: "tanya", key });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[272px_minmax(0,1fr)] xl:grid-cols-[272px_minmax(0,1fr)_360px]">
      <DaftarAlur
        draf={draf}
        urut={urut}
        pilih={pilihSah}
        onPilih={pilihBaris}
        onTambah={tambah}
        onPindah={setPertanyaan}
        masalah={new Set(masalah.map((m) => m.key))}
        className={cx(hpBuka && "max-lg:hidden")}
      />
      <Pratinjau draf={draf} setDraf={setDraf} data={data} pilih={pilihSah} className="hidden xl:flex" />
      <section className={cx("flex min-w-0 flex-col rounded-lg border border-outline-variant bg-surface-container-lowest", !hpBuka && "max-lg:hidden")} aria-label="Edit">
        <div className="flex items-center gap-1 border-b border-outline-variant px-2">
          <IconButton label="Back to the list" className="lg:hidden" onClick={() => setHpBuka(false)}><ArrowLeft size={20} /></IconButton>
          <div role="tablist" aria-label="Edit" className="flex">
            {(["isi", "desain"] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={panel === p}
                onClick={() => setPanel(p)}
                className={cx("relative h-12 px-3 text-body-medium font-medium", panel === p ? "text-on-surface after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-primary" : "text-on-surface-variant")}
              >
                {p === "isi" ? "Content" : "Design"}
              </button>
            ))}
          </div>
          <ButtonLink
            native
            variant="text"
            size="sm"
            className="ml-auto xl:hidden"
            href={alamatPratinjau(data, draf, data.contoh, false)}
            target="_blank"
            rel="noopener"
            icon={<ArrowSquareOut size={16} />}
          >
            Preview
          </ButtonLink>
        </div>
        <div className="flex flex-col gap-5 p-4">
          {panel === "desain" ? (
            <PanelDesain draf={draf} setDraf={setDraf} data={data} />
          ) : pilihSah.jenis === "buka" ? (
            <PanelBuka draf={draf} setDraf={setDraf} />
          ) : pilihSah.jenis === "tutup" ? (
            <PanelTutup draf={draf} setDraf={setDraf} />
          ) : pilihSah.jenis === "kartu" ? (
            <PanelKartu draf={draf} setDraf={setDraf} kartu={pilihSah.kartu} urut={urut} onPilih={pilihBaris} onTambah={tambah} />
          ) : (
            <PanelTanya
              key={pilihSah.key}
              urut={urut}
              kunci={pilihSah.key}
              data={data}
              masalah={masalah.filter((m) => m.key === pilihSah.key).map((m) => m.pesan)}
              setPertanyaan={setPertanyaan}
              onPilih={pilihBaris}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function alamatPratinjau(data: DataBuilder, draf: SetelanKilas, peserta: PesertaPratinjau | null, lain: boolean): string {
  const lang = lain ? (data.lang === "id" ? "en" : "id") : null;
  return `${alamatKilasBalik(data.slug, lang)}?${new URLSearchParams({ pratinjau: peserta?.id ?? "1", tampilan: draf.display, tema: JSON.stringify(draf.theme) }).toString()}`;
}

/* ============================================================ Daftar alur */

function DaftarAlur({
  draf, urut, pilih, onPilih, onTambah, onPindah, masalah, className,
}: {
  draf: SetelanKilas;
  urut: Pertanyaan[];
  pilih: Pilih;
  onPilih: (p: Pilih) => void;
  onTambah: (t: JenisPertanyaan) => void;
  onPindah: (qs: Pertanyaan[]) => void;
  masalah: Set<string>;
  className?: string;
}) {
  const [seret, setSeret] = useState<string | null>(null);
  const [atas, setAtas] = useState<string | null>(null);
  const nomor = new Map(urut.map((q, n) => [q.key, n + 1]));
  const penuh = draf.questions.length >= PERTANYAAN_MAX;

  /** Pindahkan `key` ke kelompok `after`, sebelum `sebelum` (null = awal kelompok bila `awal`, selain itu akhir). */
  const pindah = (key: string, after: KunciKartu | null, sebelum: string | null, awal: boolean) => {
    const q = urut.find((x) => x.key === key);
    if (!q || key === sebelum) return;
    const sisa = urut.filter((x) => x.key !== key);
    const baru = { ...q, after };
    let i = sebelum ? sisa.findIndex((x) => x.key === sebelum) : awal ? sisa.findIndex((x) => (x.after ?? null) === after) : -1;
    if (i < 0) {
      // Akhir kelompok: sesudah anggota terakhirnya (urutAlur menaruhnya di tempat yang benar).
      sisa.push(baru);
      i = -1;
    } else sisa.splice(i, 0, baru);
    onPindah(sisa);
  };

  const target = (id: string, jatuh: () => void) => ({
    onDragOver: (e: DragEvent) => {
      if (!seret) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setAtas(id);
    },
    onDragLeave: () => setAtas((a) => (a === id ? null : a)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setAtas(null);
      if (seret) jatuh();
      setSeret(null);
    },
  });

  const barisTanya = (q: Pertanyaan) => {
    const info = JENIS_INFO[q.type];
    const dipilih = pilih.jenis === "tanya" && pilih.key === q.key;
    const logika = (q.show_if?.length ?? 0) > 0 || Boolean(q.options_from) || kunciRecall(q.title).length > 0;
    return (
      <li key={q.key} {...target(`q:${q.key}`, () => seret && pindah(seret, q.after ?? null, q.key, false))} className={cx(atas === `q:${q.key}` && "shadow-[inset_0_2px_0_var(--md-sys-color-primary)]")}>
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            setSeret(q.key);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", q.key);
          }}
          onDragEnd={() => {
            setSeret(null);
            setAtas(null);
          }}
          onClick={() => onPilih({ jenis: "tanya", key: q.key })}
          aria-current={dipilih ? "true" : undefined}
          className={cx(
            "group flex min-h-12 w-full items-center gap-2 rounded-md py-1.5 pl-1 pr-2 text-left text-body-medium",
            dipilih ? "bg-primary-soft text-on-surface outline outline-2 -outline-offset-2 outline-primary" : "hover:bg-surface-container",
            seret === q.key && "opacity-50",
          )}
        >
          <DotsSixVertical size={16} aria-hidden className="shrink-0 cursor-grab text-on-surface-variant opacity-60 group-hover:opacity-100" />
          <span className={cx("grid size-7 shrink-0 place-items-center rounded-md text-label-medium font-semibold", info.warna)} aria-hidden>{nomor.get(q.key)}</span>
          <span className="min-w-0 flex-1 truncate">{judulDaftar(q.title, urut).trim() || <span className="text-on-surface-variant">Untitled {info.label.split(",")[0].toLowerCase()}</span>}</span>
          {masalah.has(q.key) ? <StatusChip tone="warning">Fix</StatusChip> : logika ? <StatusChip tone="neutral">Logic</StatusChip> : null}
          <span className="sr-only">{`, ${info.label}${q.required ? ", needs an answer" : ""}`}</span>
        </button>
      </li>
    );
  };

  const barisTetap = (p: Pilih, label: ReactNode, Ikon: typeof Bed, ekor?: ReactNode, mati?: boolean) => {
    const dipilih = sama(p, pilih);
    return (
      <button
        type="button"
        onClick={() => onPilih(p)}
        aria-current={dipilih ? "true" : undefined}
        className={cx(
          "flex min-h-12 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-body-medium",
          dipilih ? "bg-primary-soft outline outline-2 -outline-offset-2 outline-primary" : "hover:bg-surface-container",
        )}
      >
        <span className={cx("grid size-7 shrink-0 place-items-center rounded-md border border-outline-variant bg-surface-container text-on-surface-variant", mati && "opacity-50")} aria-hidden>
          <Ikon size={16} />
        </span>
        <span className={cx("min-w-0 flex-1 truncate font-medium", mati && "text-on-surface-variant")}>{label}</span>
        {ekor}
      </button>
    );
  };

  const kelompok = (after: KunciKartu | null) => urut.filter((q) => (q.after ?? null) === after);

  return (
    <aside className={cx("flex min-w-0 flex-col rounded-lg border border-outline-variant bg-surface-container-lowest", className)} aria-label="What participants see">
      <div className="flex items-center justify-between gap-2 border-b border-outline-variant px-3 py-2">
        <h3 className="text-body-medium font-semibold">What participants see</h3>
        <TambahPertanyaan onTambah={onTambah} disabled={penuh} />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {barisTetap({ jenis: "buka" }, "Opening", HandWaving)}
        <p className="px-2 pb-1 pt-3 text-label-small font-semibold uppercase tracking-wide text-on-surface-variant">Memory cards and questions, in order</p>
        <ul className="flex flex-col gap-0.5">
          {KARTU.map((k) => {
            const info = KARTU_INFO[k];
            const qs = kelompok(k);
            return (
              <li key={k}>
                <div {...target(`k:${k}`, () => seret && pindah(seret, k, null, true))} className={cx("rounded-md", atas === `k:${k}` && "shadow-[inset_0_-2px_0_var(--md-sys-color-primary)]")}>
                  {barisTetap({ jenis: "kartu", kartu: k }, info.judul, info.Ikon, <span className="text-label-medium text-on-surface-variant">{draf.cards[k] ? "On" : "Off"}</span>, !draf.cards[k])}
                </div>
                {qs.length ? <ul className="ml-4 flex flex-col gap-0.5 border-l border-outline-variant pl-1">{qs.map(barisTanya)}</ul> : null}
              </li>
            );
          })}
          <li>
            <div {...target("k:akhir", () => seret && pindah(seret, null, null, true))} className={cx("rounded-md", atas === "k:akhir" && "shadow-[inset_0_-2px_0_var(--md-sys-color-primary)]")}>
              <p className="flex min-h-10 items-center gap-2 px-2 text-body-medium text-on-surface-variant">
                <FlagCheckered size={16} aria-hidden className="ml-1.5 mr-1.5" /> After the cards
              </p>
            </div>
            <ul className="ml-4 flex flex-col gap-0.5 border-l border-outline-variant pl-1">
              {kelompok(null).map(barisTanya)}
              {kelompok(null).length === 0 ? <li className="px-2 py-2 text-body-small text-on-surface-variant">Drag a question here to ask it after all the cards.</li> : null}
            </ul>
          </li>
        </ul>
        <div className="mt-2">{barisTetap({ jenis: "tutup" }, "Closing and recap", Confetti)}</div>
      </div>
      <div className="flex flex-col gap-2 border-t border-outline-variant px-3 py-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-high" aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${(draf.questions.length / PERTANYAAN_MAX) * 100}%` }} />
        </div>
        <p className="text-body-small text-on-surface-variant">
          {draf.questions.length} of {PERTANYAAN_MAX} questions, about {Math.max(1, Math.round(draf.questions.length * 0.3 + 0.4))} min. Drag a question under a card to ask it after that card.
        </p>
      </div>
    </aside>
  );
}

function TambahPertanyaan({ onTambah, disabled, label = "Question" }: { onTambah: (t: JenisPertanyaan) => void; disabled?: boolean; label?: string }) {
  const [pemicu, setPemicu] = useState<HTMLSpanElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const id = useId();
  return (
    <>
      <span ref={setPemicu} className="inline-flex">
        <Button size="sm" icon={<Plus size={16} />} disabled={disabled} aria-haspopup="menu" aria-expanded={menu.open} aria-controls={menu.open ? id : undefined} onClick={menu.toggle}>
          {label}
        </Button>
      </span>
      {menu.open ? (
        <Popover anchor={menu} id={id} label="Add a question" width={300} align="start">
          {(Object.keys(JENIS_INFO) as JenisPertanyaan[]).map((j) => {
            const info = JENIS_INFO[j];
            return (
              <button key={j} type="button" role="menuitem" className={cx(POPOVER_ITEM, "min-h-14 gap-3")} onClick={() => { menu.tutup(); onTambah(j); }}>
                <span className={cx("grid size-8 shrink-0 place-items-center rounded-md", info.warna)} aria-hidden><info.Ikon size={18} /></span>
                <span className="flex flex-col text-left">
                  <span className="font-medium">{info.label}</span>
                  <span className="text-body-small text-on-surface-variant">{info.detail}</span>
                </span>
              </button>
            );
          })}
        </Popover>
      ) : null}
    </>
  );
}

/* ============================================================== Pratinjau */

function Pratinjau({ draf, setDraf, data, pilih, className }: { draf: SetelanKilas; setDraf: (s: SetelanKilas) => void; data: DataBuilder; pilih: Pilih; className?: string }) {
  const [peserta, setPeserta] = useState<PesertaPratinjau | null>(data.contoh);
  const [lain, setLain] = useState(false);
  const [tersembunyi, setTersembunyi] = useState(false);
  const iframe = useRef<HTMLIFrameElement>(null);
  const alamat = alamatPratinjau(data, draf, peserta, lain);
  const pilihTerakhir = useRef<Pilih | null>(null);

  const kirim = useCallback((paksaFokus: boolean) => {
    const w = iframe.current?.contentWindow;
    if (!w) return;
    const fokusBaru = paksaFokus || !pilihTerakhir.current || !sama(pilihTerakhir.current, pilih);
    pilihTerakhir.current = pilih;
    const pesan: PesanDraf = {
      type: "tally:kilas-draf",
      setelan: { ...draf, questions: draf.questions.map((q) => ({ ...q, title: q.title.trim() || "…", options: q.options?.filter((o) => o.trim()) })) },
      fokus: fokusBaru ? pilih : null,
    };
    w.postMessage(pesan, window.location.origin);
  }, [draf, pilih]);

  useEffect(() => {
    const terima = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== iframe.current?.contentWindow) return;
      const b = e.data as BalasanPratinjau | null;
      if (b?.type === "tally:kilas-siap") kirim(true);
      if (b?.type === "tally:kilas-fokus") setTersembunyi(!b.ketemu);
    };
    window.addEventListener("message", terima);
    return () => window.removeEventListener("message", terima);
  }, [kirim]);

  useEffect(() => {
    const t = window.setTimeout(() => kirim(false), 250);
    return () => window.clearTimeout(t);
  }, [kirim]);

  return (
    <div className={cx("min-w-0 flex-col items-center gap-3 rounded-lg bg-surface-container p-3 xl:sticky xl:top-[calc(var(--workspace-top,58px)+16px)] xl:self-start", className)}>
      <div className="flex w-full flex-wrap items-center justify-center gap-2">
        <SegmentedButton
          label="Display"
          size="md"
          value={draf.display}
          onChange={(v) => setDraf({ ...draf, display: v })}
          options={TAMPILAN_PILIHAN.map((t) => ({ value: t.value, label: t.label }))}
        />
        {data.bahasa_lain ? (
          <SegmentedButton
            label="Language"
              value={lain ? "lain" : "utama"}
            onChange={(v) => setLain(v === "lain")}
            options={[{ value: "utama", label: data.lang.toUpperCase() }, { value: "lain", label: data.lang === "id" ? "EN" : "ID" }]}
          />
        ) : null}
      </div>
      <div className="flex w-full items-center justify-center gap-1">
        <PilihPeserta peserta={peserta} onPilih={setPeserta} />
        <ButtonLink native variant="text" size="sm" href={alamat} target="_blank" rel="noopener" icon={<ArrowSquareOut size={16} />}>Open</ButtonLink>
      </div>
      <iframe ref={iframe} key={alamat} src={alamat} title="Participant preview" className="h-[640px] w-[340px] max-w-full shrink-0 rounded-[28px] border-[6px] border-on-surface bg-surface" />
      <p className="max-w-[340px] text-center text-body-small text-on-surface-variant" aria-live="polite">
        {tersembunyi
          ? pakaiJawaban(draf, pilih)
            ? "This question depends on an earlier answer. Answer that question in the preview to see it."
            : "This screen is hidden for this participant (Show if, or no options or data for them). Pick another participant to see it."
          : "Shows your changes before Save. Nothing is sent or saved here."}
      </p>
    </div>
  );
}

/** Judul di daftar alur: `{kunci}` ditampilkan sebagai [Qn], sama seperti di editor. */
function judulDaftar(teks: string, urut: readonly Pertanyaan[]): string {
  return teks.replace(/\{([a-z0-9_]{1,40})\}/g, (_, k: string) => {
    const n = urut.findIndex((x) => x.key === k);
    return n >= 0 ? `[Q${n + 1}]` : "[deleted]";
  });
}

/** Layar terpilih bergantung pada jawaban sebelumnya (Show if jawaban atau carry forward). */
function pakaiJawaban(draf: SetelanKilas, pilih: Pilih): boolean {
  if (pilih.jenis !== "tanya") return false;
  const q = draf.questions.find((x) => x.key === pilih.key);
  return !!q && (!!q.options_from || (q.show_if ?? []).some((x) => x.source === "answer"));
}

/* ================================================================ Panels */

function JudulPanel({ children, aksi }: { children: ReactNode; aksi?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="whitespace-nowrap text-title-medium font-semibold">{children}</h3>
      {aksi ? <div className="-mr-2 flex items-center">{aksi}</div> : null}
    </div>
  );
}

function PanelBuka({ draf, setDraf }: { draf: SetelanKilas; setDraf: (s: SetelanKilas) => void }) {
  return (
    <>
      <JudulPanel>Opening</JudulPanel>
      <p className="text-body-medium text-on-surface-variant">The first screen. Written in the event&apos;s language; empty fields use a warm default greeting.</p>
      <TextField label="Opening title" optional maxLength={120} value={draf.title ?? ""} onChange={(e) => setDraf({ ...draf, title: e.target.value || null })} placeholder="Hi, Dewi (their first name)" />
      <TextArea label="Opening message" optional rows={4} maxLength={600} counter value={draf.intro ?? ""} onChange={(e) => setDraf({ ...draf, intro: e.target.value || null })} />
    </>
  );
}

function PanelTutup({ draf, setDraf }: { draf: SetelanKilas; setDraf: (s: SetelanKilas) => void }) {
  return (
    <>
      <JudulPanel>Closing and recap</JudulPanel>
      <p className="text-body-medium text-on-surface-variant">The last screen, with the participant&apos;s recap card. Empty fields use a default thank-you.</p>
      <TextArea label="Thank-you message" optional rows={4} maxLength={600} counter value={draf.closing ?? ""} onChange={(e) => setDraf({ ...draf, closing: e.target.value || null })} />
      <TextField label="Signed by" optional maxLength={120} value={draf.signed_by ?? ""} onChange={(e) => setDraf({ ...draf, signed_by: e.target.value || null })} placeholder="Rina Wulandari, Organising committee" />
    </>
  );
}

function PanelKartu({
  draf, setDraf, kartu, urut, onPilih, onTambah,
}: {
  draf: SetelanKilas;
  setDraf: (s: SetelanKilas) => void;
  kartu: KunciKartu;
  urut: Pertanyaan[];
  onPilih: (p: Pilih) => void;
  onTambah: (t: JenisPertanyaan) => void;
}) {
  const info = KARTU_INFO[kartu];
  const qs = urut.filter((q) => q.after === kartu);
  return (
    <>
      <JudulPanel>{info.judul}</JudulPanel>
      <Switch checked={draf.cards[kartu]} onChange={(v) => setDraf({ ...draf, cards: { ...draf.cards, [kartu]: v } })} label="Show this card" description={info.isi} />
      <p className="text-body-medium text-on-surface-variant">
        Built from each participant&apos;s own data, and only from what the Participant area already shows them. A participant without that data skips the card; questions under it are still asked.
      </p>
      <Kelompok title="Questions after this card">
        {qs.length ? (
          <ul className="flex flex-col gap-1">
            {qs.map((q) => (
              <li key={q.key}>
                <button type="button" className="min-h-10 w-full rounded-md px-2 text-left text-body-medium hover:bg-surface-container" onClick={() => onPilih({ jenis: "tanya", key: q.key })}>
                  {q.title.trim() || "Untitled question"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-medium text-on-surface-variant">None yet.</p>
        )}
        <div>
          <TambahPertanyaan onTambah={onTambah} disabled={draf.questions.length >= PERTANYAAN_MAX} label="Question after this card" />
        </div>
      </Kelompok>
    </>
  );
}

function PanelDesain({ draf, setDraf, data }: { draf: SetelanKilas; setDraf: (s: SetelanKilas) => void; data: DataBuilder }) {
  const tema = draf.theme;
  const sendiri = tema.mode === "custom";
  return (
    <>
      <Kelompok first title="Display" note="Questions, answers and results are the same in every display, so you can switch at any time. On Look back and Chat, participants can also switch to One page themselves.">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Display</legend>
          {TAMPILAN_PILIHAN.map(({ value, label, detail, Ikon }) => {
            const on = draf.display === value;
            return (
              <label key={value} className={cx("flex cursor-pointer gap-3 rounded-lg p-3 text-body-medium", on ? "border-2 border-primary bg-primary-soft" : "border border-outline")}>
                <input type="radio" name="feedback-display" value={value} checked={on} onChange={() => setDraf({ ...draf, display: value })} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
                <Ikon size={22} aria-hidden className="mt-px shrink-0 text-on-surface-variant" />
                <span>
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-on-surface-variant">{detail}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </Kelompok>
      <Kelompok title="Colours" note="Memory cards use the background colour, darkened when needed so white text stays easy to read. Question screens use the accent.">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Colours</legend>
          <label className={cx("flex cursor-pointer gap-3 rounded-lg p-3 text-body-medium", !sendiri ? "border-2 border-primary bg-primary-soft" : "border border-outline")}>
            <input type="radio" name="feedback-tema" checked={!sendiri} onChange={() => setDraf({ ...draf, theme: { ...tema, mode: "event" } })} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
            <span className="flex flex-col gap-1">
              <span className="font-semibold">Follow the event theme</span>
              <span className="text-on-surface-variant">From Event page &gt; Theme.</span>
              <span className="flex flex-wrap gap-4 pt-1">
                <Swatch warna={data.tema_acara.brand} label="Background" />
                <Swatch warna={data.tema_acara.accent} label="Accent" />
              </span>
            </span>
          </label>
          <label className={cx("flex cursor-pointer gap-3 rounded-lg p-3 text-body-medium", sendiri ? "border-2 border-primary bg-primary-soft" : "border border-outline")}>
            <input
              type="radio"
              name="feedback-tema"
              checked={sendiri}
              onChange={() => setDraf({ ...draf, theme: { mode: "custom", brand: tema.brand ?? data.tema_acara.brand, accent: tema.accent ?? data.tema_acara.accent } })}
              className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]"
            />
            <span className="flex flex-col gap-1">
              <span className="font-semibold">Own colours</span>
              <span className="text-on-surface-variant">For a closing mood that differs from the event page, such as a night or sunset palette.</span>
            </span>
          </label>
          {sendiri ? (
            <div className="grid gap-3 pl-10 sm:grid-cols-2">
              {(["brand", "accent"] as const).map((k) => (
                <label key={k} className="flex flex-col gap-1 text-body-small text-on-surface-variant">
                  {k === "brand" ? "Background" : "Accent"}
                  <span className="flex items-center gap-2">
                    <input
                      type="color"
                      value={tema[k] ?? data.tema_acara[k]}
                      onChange={(e) => setDraf({ ...draf, theme: { ...tema, [k]: e.target.value } })}
                      className="h-9 w-14 cursor-pointer rounded-md border border-outline bg-surface-container-lowest px-1"
                      aria-label={k === "brand" ? "Background colour" : "Accent colour"}
                    />
                    <span className="font-mono text-body-medium text-on-surface">{(tema[k] ?? data.tema_acara[k]).toUpperCase()}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : null}
        </fieldset>
      </Kelompok>
    </>
  );
}

function Swatch({ warna, label }: { warna: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-body-small text-on-surface-variant">
      <span className="size-5 rounded-full border border-outline-variant" style={{ background: warna }} aria-hidden />
      {label} <span className="font-mono">{warna.toUpperCase()}</span>
    </span>
  );
}

/* ============================================================ Pertanyaan */

function PanelTanya({
  urut, kunci, data, masalah, setPertanyaan, onPilih,
}: {
  urut: Pertanyaan[];
  kunci: string;
  data: DataBuilder;
  masalah: string[];
  setPertanyaan: (qs: Pertanyaan[]) => void;
  onPilih: (p: Pilih) => void;
}) {
  const indeks = urut.findIndex((q) => q.key === kunci);
  const q = urut[indeks];
  const [bahasa, setBahasa] = useState<"utama" | "lain">("utama");
  const judulRef = useRef<HTMLDivElement>(null);
  if (!q) return null;
  const sebelum = urut.slice(0, indeks);
  const info = JENIS_INFO[q.type];
  const ubah = (isi: Partial<Pertanyaan>) => setPertanyaan(urut.map((x) => (x.key === kunci ? { ...x, ...isi } : x)));
  const namaBahasa = (l: "id" | "en") => (l === "id" ? "Indonesia" : "English");
  const lainLang = data.lang === "id" ? "en" : "id";

  const geser = (arah: -1 | 1) => {
    const j = indeks + arah;
    if (j < 0 || j >= urut.length) return;
    const tetangga = urut[j];
    const sisa = urut.filter((x) => x.key !== kunci);
    const i = sisa.findIndex((x) => x.key === tetangga.key) + (arah === 1 ? 1 : 0);
    sisa.splice(i, 0, { ...q, after: tetangga.after ?? null });
    setPertanyaan(sisa);
  };
  const salin = () => {
    if (urut.length >= PERTANYAAN_MAX) return;
    const key = kunciBaru(`${q.key}_copy`, urut.map((x) => x.key));
    const daftar = [...urut];
    daftar.splice(indeks + 1, 0, { ...q, key });
    setPertanyaan(daftar);
    onPilih({ jenis: "tanya", key });
  };
  const hapus = () => {
    setPertanyaan(urut.filter((x) => x.key !== kunci));
    const ganti = urut[indeks + 1] ?? urut[indeks - 1];
    onPilih(ganti ? { jenis: "tanya", key: ganti.key } : { jenis: "buka" });
  };

  const sisipRecall = (k: string) => {
    const kolom = bahasa === "utama" ? "title" : "title_alt";
    const teks = (kolom === "title" ? q.title : q.title_alt) ?? "";
    const el = judulRef.current?.querySelector("textarea") ?? null;
    const pos = el ? el.selectionStart ?? teks.length : teks.length;
    const token = `{${k}}`;
    const baru = `${teks.slice(0, pos)}${teks.slice(0, pos) && !/\s$/.test(teks.slice(0, pos)) ? " " : ""}${token}${teks.slice(pos)}`.slice(0, 200);
    ubah(kolom === "title" ? { title: baru } : { title_alt: baru });
    window.requestAnimationFrame(() => el?.focus());
  };

  const nomor = (k: string) => urut.findIndex((x) => x.key === k) + 1;
  const tampilRecall = (teks: string) => teks.replace(/\{([a-z0-9_]{1,40})\}/g, (_, k: string) => (nomor(k) > 0 ? `[answer to Q${nomor(k)}]` : "[deleted question]"));
  const judulAktif = bahasa === "utama" ? q.title : q.title_alt ?? "";
  const sumberCarry = sebelum.filter((x) => x.type === "choice" && (x.max ?? 1) >= 2);

  return (
    <>
      <JudulPanel
        aksi={
          <>
            <IconButton label="Move up" onClick={() => geser(-1)} disabled={indeks === 0}><ArrowUp size={18} /></IconButton>
            <IconButton label="Move down" onClick={() => geser(1)} disabled={indeks === urut.length - 1}><ArrowDown size={18} /></IconButton>
            <IconButton label="Duplicate" onClick={salin} disabled={urut.length >= PERTANYAAN_MAX}><Copy size={18} /></IconButton>
            <IconButton label="Delete question" onClick={hapus}><Trash size={18} /></IconButton>
          </>
        }
      >
        <span className="inline-flex items-center gap-2">
          <span className={cx("grid size-7 place-items-center rounded-md text-label-medium", info.warna)} aria-hidden>{indeks + 1}</span>
          Question {indeks + 1}
        </span>
      </JudulPanel>

      {masalah.length ? (
        <Banner tone="warning">
          <ul className="flex flex-col gap-1">{masalah.map((m) => <li key={m}>{m}</li>)}</ul>
        </Banner>
      ) : null}

      <SelectField
        label="Answer type"
        value={q.type}
        onChange={(e) => {
          const type = e.target.value as JenisPertanyaan;
          ubah({ type, ...(type === "choice" && !(q.options?.length) ? { options: ["", ""], max: 1 } : {}), ...(type !== "choice" ? { options_from: null } : {}) });
        }}
      >
        {(Object.keys(JENIS_INFO) as JenisPertanyaan[]).map((j) => <option key={j} value={j}>{JENIS_INFO[j].label}</option>)}
      </SelectField>

      <div className="flex flex-col gap-2">
        <div className="flex min-h-10 flex-wrap items-center justify-between gap-2">
          <span className="text-body-medium font-semibold" aria-hidden>Question</span>
          {data.bahasa_lain ? (
            <SegmentedButton
              label="Language of the question text"
                  value={bahasa}
              onChange={setBahasa}
              options={[
                { value: "utama", label: namaBahasa(data.lang) },
                { value: "lain", label: `${namaBahasa(lainLang)}${q.title_alt?.trim() ? "" : " ·"}` },
              ]}
            />
          ) : null}
        </div>
        <div ref={judulRef} className="[&_textarea]:mt-0">
          <TextArea
            label={<span className="sr-only">{bahasa === "utama" ? "Question" : `Question in ${namaBahasa(lainLang)}`}</span>}
            rows={2}
            maxLength={200}
            value={judulAktif}
            onChange={(e) => ubah(bahasa === "utama" ? { title: e.target.value } : { title_alt: e.target.value || null })}
            placeholder={bahasa === "utama" ? "How were your travel and stay?" : q.title}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {bahasa === "lain" && !q.title_alt?.trim() ? (
            <p className="text-body-small text-on-surface-variant">Empty: {namaBahasa(lainLang)} readers see the {namaBahasa(data.lang)} text.</p>
          ) : kunciRecall(judulAktif).length ? (
            <p className="text-body-small text-on-surface-variant">Participants see: {tampilRecall(judulAktif)}</p>
          ) : <span />}
          <SisipJawaban sebelum={sebelum} nomor={nomor} onPilih={sisipRecall} />
        </div>
      </div>

      {q.type === "choice" ? <IsianPilihan q={q} ubah={ubah} data={data} sumberCarry={sumberCarry} nomor={nomor} /> : null}

      <Kelompok title="Show this question" note={(q.show_if?.length ?? 0) ? "Only when every condition matches." : "Always shown. Add a condition to ask it only to some participants."}>
        <EditorSyarat q={q} sebelum={sebelum} semua={urut} data={data} nomor={nomor} onUbah={(show_if) => ubah({ show_if: show_if.length ? show_if : null })} />
      </Kelompok>

      <Kelompok>
        <Switch checked={q.required} onChange={(v) => ubah({ required: v })} label="Needs an answer" description="Off: participants can skip it." />
        <SelectField label="Show after" value={q.after ?? ""} onChange={(e) => {
          const after = (e.target.value || null) as KunciKartu | null;
          setPertanyaan([...urut.filter((x) => x.key !== kunci), { ...q, after }]);
        }} hint="Or drag it in the list.">
          {KARTU.map((k) => <option key={k} value={k}>{KARTU_INFO[k].judul}</option>)}
          <option value="">After the cards</option>
        </SelectField>
      </Kelompok>
    </>
  );
}

function SisipJawaban({ sebelum, nomor, onPilih }: { sebelum: Pertanyaan[]; nomor: (k: string) => number; onPilih: (k: string) => void }) {
  const [pemicu, setPemicu] = useState<HTMLSpanElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const id = useId();
  return (
    <>
      <span ref={setPemicu} className="inline-flex">
        <Button
          variant="text"
          size="sm"
          icon={<Plus size={16} />}
          disabled={sebelum.length === 0}
          title={sebelum.length === 0 ? "Only answers to earlier questions can be used" : undefined}
          aria-haspopup="menu"
          aria-expanded={menu.open}
          aria-controls={menu.open ? id : undefined}
          onClick={menu.toggle}
        >
          Insert an answer
        </Button>
      </span>
      {menu.open ? (
        <Popover anchor={menu} id={id} label="Insert an answer to an earlier question" width={300}>
          <p className="px-3 pb-1 pt-2 text-body-small text-on-surface-variant">Shown in place of the text, for example &ldquo;You picked Gala dinner&rdquo;.</p>
          {sebelum.map((x) => (
            <button key={x.key} type="button" role="menuitem" className={POPOVER_ITEM} onClick={() => { menu.tutup(); onPilih(x.key); }}>
              <span className="truncate">Q{nomor(x.key)} · {x.title.trim() || "Untitled question"}</span>
            </button>
          ))}
        </Popover>
      ) : null}
    </>
  );
}

function IsianPilihan({
  q, ubah, data, sumberCarry, nomor,
}: {
  q: Pertanyaan;
  ubah: (isi: Partial<Pertanyaan>) => void;
  data: DataBuilder;
  sumberCarry: Pertanyaan[];
  nomor: (k: string) => number;
}) {
  const [catatan, setCatatan] = useState<string | null>(null);
  const opsi = q.options ?? [];
  const setOpsi = (o: string[]) => ubah({ options: o.map((x) => x.slice(0, 80)).slice(0, PILIHAN_MAX) });
  const dariAgenda = () => {
    const sebelum = gabungTanpaKembar(opsi, []).length;
    const hasil = gabungTanpaKembar(opsi.filter((o) => o.trim()), data.agenda);
    const kembar = opsi.filter((o) => o.trim()).length + data.agenda.length - hasil.length;
    ubah({ options: hasil.length >= 2 ? hasil : [...hasil, ""], from_agenda: true });
    setCatatan(`Added ${hasil.length - sebelum} from Agenda.${kembar > 0 ? " Items with the same name were added once." : ""}${hasil.length >= PILIHAN_MAX ? ` Choice questions hold up to ${PILIHAN_MAX} options.` : ""}`);
  };

  return (
    <Kelompok title="Options">
      {sumberCarry.length ? (
        <SelectField label="Options come from" value={q.options_from ?? ""} onChange={(e) => ubah({ options_from: e.target.value || null })}>
          <option value="">This list</option>
          {sumberCarry.map((s) => <option key={s.key} value={s.key}>What they picked in Q{nomor(s.key)}</option>)}
        </SelectField>
      ) : null}
      {q.options_from ? (
        <p className="text-body-medium text-on-surface-variant">
          Participants choose from the options they picked in Q{nomor(q.options_from)}. If they picked fewer than two, this question is skipped.
        </p>
      ) : (
        <>
          <ol className="flex flex-col gap-2">
            {opsi.map((o, n) => (
              <li key={n} className="flex items-center gap-1">
                <span className="grid size-6 shrink-0 place-items-center rounded border border-outline-variant text-label-small text-on-surface-variant" aria-hidden>{String.fromCharCode(65 + n)}</span>
                <TextField
                  label={<span className="sr-only">{`Option ${n + 1}`}</span>}
                  className="flex-1 [&_input]:mt-0"
                  value={o}
                  maxLength={80}
                  onChange={(e) => setOpsi(opsi.map((x, i) => (i === n ? e.target.value : x)))}
                  {...(o.trim() && opsi.some((x, i) => i < n && x.trim().toLocaleLowerCase("id") === o.trim().toLocaleLowerCase("id")) ? { hint: "Same as an option above.", warning: true } : {})}
                />
                <IconButton label={`Move option ${n + 1} up`} disabled={n === 0} onClick={() => { const b = [...opsi]; [b[n - 1], b[n]] = [b[n], b[n - 1]]; setOpsi(b); }}><ArrowUp size={16} /></IconButton>
                <IconButton label={`Remove option ${n + 1}`} onClick={() => setOpsi(opsi.filter((_, i) => i !== n))}><X size={16} /></IconButton>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button variant="text" size="sm" icon={<Plus size={16} />} disabled={opsi.length >= PILIHAN_MAX} onClick={() => setOpsi([...opsi, ""])}>Add option</Button>
            <Button variant="text" size="sm" disabled={data.agenda.length === 0 || opsi.filter((o) => o.trim()).length >= PILIHAN_MAX} onClick={dariAgenda}>Fill from Agenda</Button>
          </div>
          {catatan ? <p className="text-body-small text-on-surface-variant" role="status">{catatan}</p> : null}
          <Switch
            checked={q.from_agenda === true}
            onChange={(v) => ubah({ from_agenda: v })}
            label="Only Agenda items they could see"
            description="Options that match an Agenda item with Who sees it are hidden from participants outside that group."
          />
        </>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-body-medium font-semibold" id={`maks-${q.key}`}>Participants can pick</span>
        <SegmentedButton
          labelledBy={`maks-${q.key}`}
          label="Participants can pick"
          value={String(q.max ?? 1) as "1" | "2" | "3"}
          onChange={(v) => ubah({ max: Number(v) })}
          options={[{ value: "1", label: "One" }, { value: "2", label: "Up to 2" }, { value: "3", label: "Up to 3" }]}
        />
      </div>
    </Kelompok>
  );
}

/* ================================================================ Syarat */

type Sumber = { value: string; label: string; grup: string };

function EditorSyarat({
  q, sebelum, semua, data, nomor, onUbah,
}: {
  q: Pertanyaan;
  sebelum: Pertanyaan[];
  semua: Pertanyaan[];
  data: DataBuilder;
  nomor: (k: string) => number;
  onUbah: (s: Syarat[]) => void;
}) {
  const syarat = q.show_if ?? [];
  const sumber: Sumber[] = [
    ...sebelum.map((x) => ({ value: `answer:${x.key}`, label: `Answer to Q${nomor(x.key)}${x.title.trim() ? ` · ${x.title.trim().slice(0, 36)}` : ""}`, grup: "Earlier answers" })),
    ...(data.logika.sesi.length ? [{ value: "checkin", label: "Check-in at a session", grup: "Their event data" }] : []),
    ...(data.logika.hadiah ? [{ value: "prize", label: "Lucky draw prize", grup: "Their event data" }] : []),
    ...data.logika.kolom.map((k) => ({ value: `field:${k.key}`, label: k.label, grup: "Their registration answers" })),
  ];

  const awal = (v: string): Syarat | null => {
    if (v.startsWith("answer:")) {
      const k = v.slice(7);
      const s = semua.find((x) => x.key === k);
      if (!s) return null;
      if (s.type === "choice") return { source: "answer", q: k, op: "includes", value: opsiDari(semua, s)[0] ?? "" };
      if (s.type === "faces") return { source: "answer", q: k, op: "gte", value: 4 };
      if (s.type === "nps") return { source: "answer", q: k, op: "gte", value: 9 };
      return { source: "answer", q: k, op: "answered" };
    }
    if (v === "checkin") return data.logika.sesi[0] ? { source: "checkin", session: data.logika.sesi[0].id, op: "yes" } : null;
    if (v === "prize") return { source: "prize", op: "yes" };
    if (v.startsWith("field:")) {
      const k = data.logika.kolom.find((x) => x.key === v.slice(6));
      return k ? { source: "field", field: k.key, values: k.options.slice(0, 1) } : null;
    }
    return null;
  };
  const nilaiSumber = (s: Syarat) => (s.source === "answer" ? `answer:${s.q}` : s.source === "field" ? `field:${s.field}` : s.source);
  const ganti = (n: number, s: Syarat | null) => s && onUbah(syarat.map((x, i) => (i === n ? s : x)));

  return (
    <div className="flex flex-col gap-3">
      {syarat.map((s, n) => (
        <div key={n} className="flex flex-col gap-2 rounded-lg border border-outline-variant p-3">
          <div className="flex items-end gap-1">
            <SelectField label={n === 0 ? "Only if" : "And"} className="min-w-0 flex-1" value={nilaiSumber(s)} onChange={(e) => ganti(n, awal(e.target.value))}>
              {!sumber.some((x) => x.value === nilaiSumber(s)) ? <option value={nilaiSumber(s)}>A deleted question or field</option> : null}
              {[...new Set(sumber.map((x) => x.grup))].map((g) => (
                <optgroup key={g} label={g}>
                  {sumber.filter((x) => x.grup === g).map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                </optgroup>
              ))}
            </SelectField>
            <IconButton label={`Remove condition ${n + 1}`} onClick={() => onUbah(syarat.filter((_, i) => i !== n))}><X size={18} /></IconButton>
          </div>
          <IsianSyarat s={s} semua={semua} data={data} onUbah={(baru) => ganti(n, baru)} />
        </div>
      ))}
      {syarat.length < SYARAT_MAX ? (
        <Button
          variant="outlined"
          size="sm"
          className="self-start"
          icon={<Plus size={16} />}
          disabled={sumber.length === 0}
          onClick={() => {
            const s = awal(sumber[0]?.value ?? "");
            if (s) onUbah([...syarat, s]);
          }}
        >
          Add condition
        </Button>
      ) : null}
      {sumber.length === 0 ? <p className="text-body-small text-on-surface-variant">Conditions use answers to earlier questions, check-in sessions, prizes or registration answers. This event has none of them yet.</p> : null}
    </div>
  );
}

function IsianSyarat({ s, semua, data, onUbah }: { s: Syarat; semua: Pertanyaan[]; data: DataBuilder; onUbah: (s: Syarat) => void }) {
  if (s.source === "checkin") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <SelectField label="Was" value={s.op} onChange={(e) => onUbah({ ...s, op: e.target.value as "yes" | "no" })}>
          <option value="yes">Checked in at</option>
          <option value="no">Not checked in at</option>
        </SelectField>
        <SelectField label="Session" value={String(s.session)} onChange={(e) => onUbah({ ...s, session: Number(e.target.value) })}>
          {!data.logika.sesi.some((x) => x.id === s.session) ? <option value={String(s.session)}>A deleted session</option> : null}
          {data.logika.sesi.map((x) => <option key={x.id} value={String(x.id)}>{x.name}</option>)}
        </SelectField>
      </div>
    );
  }
  if (s.source === "prize") {
    return (
      <SelectField label="Participant" value={s.op} onChange={(e) => onUbah({ ...s, op: e.target.value as "yes" | "no" })}>
        <option value="yes">Won a prize</option>
        <option value="no">Didn&apos;t win a prize</option>
      </SelectField>
    );
  }
  if (s.source === "field") {
    const k = data.logika.kolom.find((x) => x.key === s.field);
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-body-small text-on-surface-variant">Their answer is one of</legend>
        <div className="flex flex-wrap gap-2">
          {(k?.options ?? s.values).map((o) => {
            const on = s.values.includes(o);
            return (
              <FilterChip key={o} selected={on} onClick={() => {
                const values = on ? s.values.filter((v) => v !== o) : [...s.values, o];
                if (values.length) onUbah({ ...s, values });
              }}>
                {o}
              </FilterChip>
            );
          })}
        </div>
      </fieldset>
    );
  }
  const sumber = semua.find((x) => x.key === s.q);
  if (!sumber) return <p className="text-body-small text-error">This question was deleted. Remove the condition or pick another one.</p>;
  const ops: { value: string; label: string }[] =
    sumber.type === "choice"
      ? [{ value: "includes", label: "includes" }, { value: "excludes", label: "doesn't include" }, { value: "answered", label: "is answered" }, { value: "skipped", label: "is skipped" }]
      : sumber.type === "text"
        ? [{ value: "answered", label: "is answered" }, { value: "skipped", label: "is skipped" }]
        : [{ value: "gte", label: "is at least" }, { value: "lte", label: "is at most" }, { value: "answered", label: "is answered" }, { value: "skipped", label: "is skipped" }];
  const ubahOp = (op: string) => {
    if (op === "answered" || op === "skipped") onUbah({ source: "answer", q: s.q, op });
    else if (op === "includes" || op === "excludes") onUbah({ source: "answer", q: s.q, op, value: "value" in s && typeof s.value === "string" ? s.value : opsiDari(semua, sumber)[0] ?? "" });
    else if (op === "gte" || op === "lte") onUbah({ source: "answer", q: s.q, op, value: "value" in s && typeof s.value === "number" ? s.value : sumber.type === "faces" ? 4 : 9 });
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <SelectField label="Answer" value={s.op} onChange={(e) => ubahOp(e.target.value)}>
        {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </SelectField>
      {(s.op === "includes" || s.op === "excludes") ? (
        <SelectField label="Option" value={s.value} onChange={(e) => onUbah({ ...s, value: e.target.value })}>
          {!opsiDari(semua, sumber).includes(s.value) ? <option value={s.value}>{s.value || "Pick an option"}</option> : null}
          {opsiDari(semua, sumber).map((o) => <option key={o} value={o}>{o}</option>)}
        </SelectField>
      ) : (s.op === "gte" || s.op === "lte") ? (
        <SelectField label={sumber.type === "faces" ? "Face" : "Score"} value={String(s.value)} onChange={(e) => onUbah({ ...s, value: Number(e.target.value) })}>
          {sumber.type === "faces"
            ? WAJAH_EN.map((w, i) => <option key={w} value={String(i + 1)}>{`${i + 1} · ${w}`}</option>)
            : Array.from({ length: 11 }, (_, i) => <option key={i} value={String(i)}>{i}</option>)}
        </SelectField>
      ) : null}
    </div>
  );
}
