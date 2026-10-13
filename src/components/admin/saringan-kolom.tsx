"use client";

import { CaretDown, Check, Funnel, MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { Popover, usePopoverAnchor } from "@/components/m3";
import { cx } from "@/lib/m3/cx";
import { BATAS_SARINGAN, bacaSaringan, type KolomSaringan, type Saringan } from "@/lib/saringan-kolom";

/**
 * "+ Filter": saring menurut kolom apa pun yang tampil, termasuk jawaban form.
 *
 * Pilih kolom dari daftar, lalu chip kolom itu langsung terbuka dengan
 * pemilihnya: centang nilai yang ada (pilihan), "memuat" (teks), atau rentang
 * hari (tanggal). Chip yang ditutup tanpa nilai dibuang. Bentuk chip-nya sama
 * dengan chip Organisation/RSVP di sebelahnya, jadi baris saringan terbaca
 * sebagai satu kelompok.
 */

export type NilaiKolom = { value: string; count: number };

type Props = {
  kolom: KolomSaringan[];
  nilai: Saringan[];
  onChange: (next: Saringan[]) => void;
  /** Nilai yang ada di satu kolom pilihan, beserta jumlahnya. */
  muatNilai: (kunci: string) => Promise<NilaiKolom[]>;
  /**
   * Kelas pembungkus chip yang aktif. Bawaannya `contents` (sebaris dengan
   * tombol lain); daftar admin memakai baris sendiri di bawah, supaya tombol
   * yang sudah dikenal (Organisation, RSVP, Columns) tidak bergeser.
   */
  kelasChip?: string;
  /**
   * Permintaan membuka chip satu kolom dari luar ("Filter this column…" di judul
   * kolom). `n` naik tiap permintaan, supaya kolom yang sama bisa dibuka lagi.
   */
  buka?: { key: string; n: number } | null;
};

const kosong = (s: Saringan) => ("in" in s ? s.in.length === 0 : "has" in s ? !s.has : "kosong" in s ? false : !s.from && !s.to);

const awalSaringan = (item: KolomSaringan): Saringan => (item.jenis === "pilihan" ? { k: item.key, in: [] } : item.jenis === "teks" ? { k: item.key, has: "" } : { k: item.key });

export function SaringanKolom({ kolom, nilai, onChange, muatNilai, kelasChip = "contents", buka = null }: Props) {
  const [baru, setBaru] = useState<string | null>(null);
  const [draf, setDraf] = useState<Saringan | null>(null);
  const perKunci = new Map(kolom.map((item) => [item.key, item]));
  // Chip hanya untuk saringan yang benar-benar dipakai server: kunci yang tidak
  // dikenal, bentuk yang salah jenis, atau kembar dibuang di sini juga (QA #130 L1).
  const berlaku = bacaSaringan(JSON.stringify(nilai), kolom) ?? [];
  const tampil = [...berlaku, ...(draf && !berlaku.some((s) => s.k === draf.k) ? [draf] : [])];

  // Permintaan dari judul kolom, diolah saat render (bukan di efek): chip yang
  // sudah ada dibuka lagi, yang belum ada dibuat sebagai draf lalu dibuka.
  const [bukaLama, setBukaLama] = useState(buka);
  if (buka !== bukaLama) {
    setBukaLama(buka);
    const info = buka ? perKunci.get(buka.key) : undefined;
    const ada = info ? tampil.some((s) => s.k === info.key) : false;
    if (info && (ada || tampil.length < BATAS_SARINGAN)) {
      if (!ada) setDraf(awalSaringan(info));
      setBaru(info.key);
    }
  }

  // Chip yang dikosongkan selagi terbuka tetap di tempatnya sebagai draf, dan
  // baru hilang saat ditutup; yang berisi masuk ke saringan yang berlaku.
  const ubah = (s: Saringan) => {
    const urutan = (item: Saringan) => { const i = tampil.findIndex((t) => t.k === item.k); return i < 0 ? tampil.length : i; };
    const lain = berlaku.filter((item) => item.k !== s.k);
    if (kosong(s)) { setDraf(s); onChange(lain); return; }
    if (draf?.k === s.k) setDraf(null);
    onChange([...lain, s].sort((a, b) => urutan(a) - urutan(b)));
  };
  const hapus = (kunci: string) => {
    if (draf?.k === kunci) setDraf(null);
    onChange(berlaku.filter((item) => item.k !== kunci));
  };

  return (
    <>
      {tampil.length ? <div className={kelasChip}>{tampil.map((s) => {
        const info = perKunci.get(s.k);
        return info ? (
          <ChipSaringan
            key={s.k}
            kolom={info}
            saringan={s}
            bukaSaatMuncul={baru === s.k}
            onDibuka={() => setBaru(null)}
            onUbah={ubah}
            onHapus={() => hapus(s.k)}
            onTutupKosong={() => setDraf((lama) => (lama?.k === s.k ? null : lama))}
            muatNilai={muatNilai}
          />
        ) : null;
      })}</div> : null}
      <PilihKolom
        kolom={kolom.filter((item) => !tampil.some((s) => s.k === item.key))}
        penuh={tampil.length >= BATAS_SARINGAN}
        onPilih={(item) => {
          setDraf(awalSaringan(item));
          setBaru(item.key);
        }}
      />
    </>
  );
}

function PilihKolom({ kolom, penuh, onPilih }: { kolom: KolomSaringan[]; penuh: boolean; onPilih: (item: KolomSaringan) => void }) {
  const [pemicu, setPemicu] = useState<HTMLButtonElement | null>(null);
  const anchor = usePopoverAnchor(pemicu);
  const [cari, setCari] = useState("");
  const id = useId();
  const cocok = cari ? kolom.filter((item) => item.label.toLowerCase().includes(cari.toLowerCase())) : kolom;
  const grup = [
    { judul: "Columns", isi: cocok.filter((item) => item.grup === "kolom") },
    { judul: "Form answers", isi: cocok.filter((item) => item.grup === "jawaban") },
  ].filter((g) => g.isi.length);
  if (!kolom.length) return null;
  return (
    <>
      <button
        ref={setPemicu}
        type="button"
        disabled={penuh}
        title={penuh ? `Up to ${BATAS_SARINGAN} filters` : undefined}
        aria-haspopup="dialog"
        aria-expanded={anchor.open}
        aria-controls={anchor.open ? id : undefined}
        onClick={() => { setCari(""); anchor.toggle(); }}
        className={cx(
          "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-outline px-3 text-body-medium font-medium text-on-surface disabled:opacity-50",
          anchor.open ? "bg-secondary-container" : "bg-surface-container-lowest hover:bg-primary-soft",
        )}
      >
        <Plus size={14} aria-hidden />
        Filter
      </button>
      <Popover anchor={anchor} label="Filter by column" role="dialog" id={id} align="start" width={320}>
        <div className="sticky -top-1 z-10 -mt-1 flex items-center gap-2 border-b border-outline-variant bg-surface-container-lowest px-2 pb-1.5 pt-1.5">
          <MagnifyingGlass size={16} aria-hidden className="text-on-surface-variant" />
          <input
            value={cari}
            onChange={(event) => setCari(event.target.value)}
            placeholder="Filter by…"
            aria-label="Search columns"
            autoFocus
            className="h-8 min-w-0 flex-1 bg-transparent text-body-medium outline-none placeholder:text-on-surface-variant"
          />
        </div>
        {grup.length === 0 ? <p className="px-3 py-2 text-body-medium text-on-surface-variant">No matching column.</p> : null}
        {grup.map((g) => (
          <div key={g.judul} className="py-1">
            <p className="px-3 pb-0.5 pt-1 text-body-small font-medium text-on-surface-variant">{g.judul}</p>
            {g.isi.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => { anchor.tutup(); onPilih(item); }}
                title={item.label}
                className="flex min-h-[34px] w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-body-medium text-on-surface hover:bg-primary-soft"
              >
                <Funnel size={16} aria-hidden className="shrink-0 text-on-surface-variant" />
                <span className="line-clamp-2 min-w-0 flex-1 break-words">{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </Popover>
    </>
  );
}

const fmtHari = (hari: string) => new Date(`${hari}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Isi chip: judul kolom (dipendekkan duluan) dan nilai yang dipilih (diutamakan). */
function ringkasan(s: Saringan): string {
  if ("in" in s) {
    if (!s.in.length) return "";
    const pertama = s.in[0] === "" ? "Empty" : s.in[0];
    return s.in.length === 1 ? pertama : `${pertama} +${s.in.length - 1}`;
  }
  if ("has" in s) return s.has ? `contains “${s.has}”` : "";
  if ("kosong" in s) return s.kosong ? "is empty" : "is not empty";
  if (s.from && s.to) return s.from === s.to ? fmtHari(s.from) : `${fmtHari(s.from)}–${fmtHari(s.to)}`;
  if (s.from) return `from ${fmtHari(s.from)}`;
  if (s.to) return `until ${fmtHari(s.to)}`;
  return "";
}

function ChipSaringan({ kolom, saringan, bukaSaatMuncul, onDibuka, onUbah, onHapus, onTutupKosong, muatNilai }: {
  kolom: KolomSaringan;
  saringan: Saringan;
  bukaSaatMuncul: boolean;
  onDibuka: () => void;
  onUbah: (s: Saringan) => void;
  onHapus: () => void;
  onTutupKosong: () => void;
  muatNilai: (kunci: string) => Promise<NilaiKolom[]>;
}) {
  const [pemicu, setPemicu] = useState<HTMLButtonElement | null>(null);
  const anchor = usePopoverAnchor(pemicu, (terbuka) => { if (!terbuka) onTutupKosong(); });
  const id = useId();
  const aktif = !kosong(saringan);
  const { buka } = anchor;

  useEffect(() => {
    if (!bukaSaatMuncul || !pemicu) return;
    const pewaktu = window.setTimeout(() => { buka(); onDibuka(); }, 0);
    return () => window.clearTimeout(pewaktu);
  }, [bukaSaatMuncul, pemicu, buka, onDibuka]);

  const isi = ringkasan(saringan);
  const teks = isi ? `${kolom.label}${"has" in saringan || "kosong" in saringan ? " " : ": "}${isi}` : kolom.label;
  return (
    <div
      className={cx(
        "inline-flex h-8 min-w-0 max-w-[320px] shrink items-center rounded-full border text-body-medium font-medium",
        aktif ? "border-primary bg-accent-soft text-primary" : "border-outline bg-surface-container-lowest text-on-surface",
      )}
    >
      <button
        ref={setPemicu}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={anchor.open}
        aria-controls={anchor.open ? id : undefined}
        onClick={anchor.toggle}
        title={teks}
        className="inline-flex h-full min-w-0 items-center gap-1.5 rounded-full pl-3 pr-1.5"
      >
        {/* Pertanyaan form bisa sepanjang kalimat: judulnya yang dipotong, nilainya tetap terbaca. */}
        <span className={cx("truncate", isi && "max-w-[150px] shrink-[2]")}>{kolom.label}{isi && !("has" in saringan || "kosong" in saringan) ? ":" : ""}</span>
        {isi ? <span className="-ml-0.5 min-w-0 truncate">{isi}</span> : null}
        {aktif ? null : <CaretDown size={14} aria-hidden className="shrink-0 text-on-surface-variant" />}
      </button>
      <button
        type="button"
        aria-label={`Remove filter ${kolom.label}`}
        onClick={onHapus}
        className="mr-1 grid size-6 shrink-0 place-items-center rounded-full hover:bg-surface-container-high"
      >
        <X size={14} aria-hidden />
      </button>
      <Popover anchor={anchor} label={`Filter ${kolom.label}`} role="dialog" id={id} align="start" width={320}>
        <p className="line-clamp-2 px-3 pb-1 pt-1.5 text-body-medium font-medium text-on-surface-variant" title={kolom.label}>{kolom.label}</p>
        {"in" in saringan ? (
          <EditorPilihan kunci={kolom.key} pilihan={saringan.in} onUbah={(next) => onUbah({ k: kolom.key, in: next })} muatNilai={muatNilai} />
        ) : "has" in saringan || "kosong" in saringan ? (
          <EditorTeks
            nilai={"has" in saringan ? saringan.has : ""}
            kosong={"kosong" in saringan ? saringan.kosong : null}
            onUbah={(has) => onUbah({ k: kolom.key, has })}
            onKosong={(next) => onUbah(next === null ? { k: kolom.key, has: "" } : { k: kolom.key, kosong: next })}
            onSelesai={anchor.tutup}
          />
        ) : (
          <EditorTanggal dari={saringan.from ?? ""} sampai={saringan.to ?? ""} onUbah={(from, to) => onUbah({ k: kolom.key, ...(from ? { from } : {}), ...(to ? { to } : {}) })} />
        )}
      </Popover>
    </div>
  );
}

function EditorPilihan({ kunci, pilihan, onUbah, muatNilai }: { kunci: string; pilihan: string[]; onUbah: (next: string[]) => void; muatNilai: (kunci: string) => Promise<NilaiKolom[]> }) {
  const [daftar, setDaftar] = useState<NilaiKolom[] | null>(null);
  const [gagal, setGagal] = useState(false);
  const [cari, setCari] = useState("");
  useEffect(() => {
    let batal = false;
    muatNilai(kunci).then((isi) => { if (!batal) setDaftar(isi); }, () => { if (!batal) setGagal(true); });
    return () => { batal = true; };
  }, [kunci, muatNilai]);
  // Nilai yang dipilih tapi sudah tidak ada di data (mis. dari tautan lama) tetap tampil, supaya bisa dilepas.
  const semua = daftar ? [...daftar, ...pilihan.filter((v) => !daftar.some((d) => d.value === v)).map((value) => ({ value, count: 0 }))] : [];
  const cocok = cari ? semua.filter((item) => (item.value || "Empty").toLowerCase().includes(cari.toLowerCase())) : semua;
  const toggle = (v: string) => onUbah(pilihan.includes(v) ? pilihan.filter((x) => x !== v) : [...pilihan, v]);
  if (gagal) return <p className="px-3 py-2 text-body-medium text-error">Couldn’t load the values. Close and try again.</p>;
  if (!daftar) return <p className="px-3 py-2 text-body-medium text-on-surface-variant">Loading values…</p>;
  return (
    <>
      {semua.length > 8 ? (
        <div className="mx-1 flex items-center gap-2 border-b border-outline-variant px-2 pb-1.5">
          <MagnifyingGlass size={16} aria-hidden className="text-on-surface-variant" />
          <input value={cari} onChange={(event) => setCari(event.target.value)} placeholder="Search values…" aria-label="Search values" className="h-8 min-w-0 flex-1 bg-transparent text-body-medium outline-none placeholder:text-on-surface-variant" />
        </div>
      ) : null}
      <div role="listbox" aria-multiselectable className="py-1">
        {cocok.length === 0 ? <p className="px-3 py-2 text-body-medium text-on-surface-variant">No matches.</p> : null}
        {cocok.map((item) => {
          const on = pilihan.includes(item.value);
          return (
            <button
              key={item.value || "__kosong"}
              type="button"
              role="option"
              aria-selected={on}
              onClick={() => toggle(item.value)}
              title={item.value || "Empty"}
              className="flex min-h-[34px] w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-body-medium text-on-surface hover:bg-primary-soft"
            >
              <span aria-hidden className={cx("grid size-4 shrink-0 place-items-center rounded-[4px] border", on ? "border-primary bg-primary text-on-primary" : "border-outline bg-surface-container-lowest")}>
                {on ? <Check size={12} weight="bold" /> : null}
              </span>
              <span className={cx("line-clamp-2 min-w-0 flex-1 break-words", !item.value && "italic text-on-surface-variant")}>{item.value || "Empty"}</span>
              <span className="shrink-0 tabular-nums text-on-surface-variant">{item.count}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function EditorTeks({ nilai, kosong, onUbah, onKosong, onSelesai }: {
  nilai: string;
  /** true = "Is empty", false = "Is not empty", null = memuat teks. */
  kosong: boolean | null;
  onUbah: (next: string) => void;
  onKosong: (next: boolean | null) => void;
  onSelesai: () => void;
}) {
  const [teks, setTeks] = useState(nilai);
  const terakhir = useRef(nilai);
  useEffect(() => {
    if (teks.trim() === terakhir.current) return;
    const pewaktu = window.setTimeout(() => { terakhir.current = teks.trim(); onUbah(teks.trim()); }, 300);
    return () => window.clearTimeout(pewaktu);
  }, [teks, onUbah]);
  return (
    <form className="px-2 pb-2 pt-1" onSubmit={(event) => { event.preventDefault(); terakhir.current = teks.trim(); onUbah(teks.trim()); onSelesai(); }}>
      <input
        value={teks}
        onChange={(event) => setTeks(event.target.value)}
        maxLength={100}
        autoFocus
        placeholder="Contains…"
        aria-label="Contains"
        className="h-9 w-full rounded-md border border-outline bg-surface-container-lowest px-3 text-body-medium outline-none placeholder:text-on-surface-variant focus:border-primary"
      />
      <div role="radiogroup" aria-label="Or match" className="mt-1">
        {([[true, "Is empty"], [false, "Is not empty"]] as const).map(([nilaiKosong, label]) => {
          const on = kosong === nilaiKosong;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => { setTeks(""); terakhir.current = ""; onKosong(on ? null : nilaiKosong); }}
              className="flex min-h-[34px] w-full items-center gap-2.5 rounded-md px-1 py-1.5 text-left text-body-medium text-on-surface hover:bg-primary-soft"
            >
              <span aria-hidden className={cx("grid size-4 shrink-0 place-items-center rounded-full border", on ? "border-primary" : "border-outline bg-surface-container-lowest")}>
                {on ? <span className="size-2 rounded-full bg-primary" /> : null}
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </form>
  );
}

function EditorTanggal({ dari, sampai, onUbah }: { dari: string; sampai: string; onUbah: (from: string, to: string) => void }) {
  const kelas = "mt-1 h-9 w-full rounded-md border border-outline bg-surface-container-lowest px-2 text-body-medium outline-none focus:border-primary";
  return (
    <div className="grid grid-cols-2 gap-2 px-3 pb-3 pt-1">
      <label className="text-body-small font-medium text-on-surface-variant">
        From
        <input type="date" value={dari} max={sampai || undefined} onChange={(event) => onUbah(event.target.value, sampai)} className={kelas} />
      </label>
      <label className="text-body-small font-medium text-on-surface-variant">
        To
        <input type="date" value={sampai} min={dari || undefined} onChange={(event) => onUbah(dari, event.target.value)} className={kelas} />
      </label>
    </div>
  );
}
