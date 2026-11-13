"use client";

import { CaretDown, FileCsv, FileXls, Bed, Bus as IkonBus, Package, SuitcaseRolling } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Button, KeyValue, Popover, usePopoverAnchor } from "@/components/m3";
import { type RingkasBagasi } from "@/lib/bagasi/ringkas";
import { cx } from "@/lib/m3/cx";
import type { RegistrationField } from "@/lib/domain";
import { LABEL_ASAL } from "@/lib/saringan-kolom";
import { type JenisUrutKolom } from "@/components/admin/kepala-kolom";
import { kolomLogistik, type BentukLogistik, type LogistikRingkas } from "@/lib/logistik/ringkas";

type ParticipantSeat = { subEventId: string; subEventName: string; label: string };
type AsalPeserta = "walkin" | "scanner" | "registration" | "manual";
export type Participant = {
  id: string;
  qr_code: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  participant_type: string | null;
  rsvp_status: string | null;
  extra: Record<string, string> | null;
  source_participant_id: string | null;
  source_checked_in: boolean;
  source_total_scans: number;
  source_synced_at: string | null;
  source_removed_at: string | null;
  walk_in_at: string | null;
  /**
   * Kapan data orang ini pertama masuk ke Tally: saat form pendaftaran dikirim
   * (bukan saat disetujui), atau saat diimpor/ditambahkan. Null hanya bila
   * fungsi list_event_participants di database belum versi 202610060001.
   */
  registered_at?: string | null;
  /** Waktu mana yang menang: form dikirim lebih dulu, atau diimpor/ditambahkan lebih dulu. */
  registered_via?: "form" | "added";
  source: AsalPeserta;
  attendance: Record<string, { count: number; first: string }>;
  seats: ParticipantSeat[] | null;
  /** Hotel, kamar, bus bawaan, tiket kereta dan kit dari Logistik. Null bila belum ada sama sekali. */
  logistik: LogistikRingkas | null;
  /** Bagasi dari meja titip, dijumlahkan. Null bila belum pernah ke meja bagasi. */
  bagasi?: RingkasBagasi | null;
  /**
   * Area peserta: kapan masuk dan terakhir membuka portal. Null = belum pernah
   * masuk; tidak ada = acara tanpa area peserta, atau gagal dibaca.
   */
  portal?: { masuk: string; buka: string } | null;
};
export type SesiKehadiran = { id: number; name: string; is_active: boolean };
/** Jawaban /api/admin/participants/seat-options. Kosong bila tidak ada sesi denah "Set in Tally". */
export type OpsiKursi = {
  sessions: Array<{ id: number; name: string; source: string }>;
  labels: string[];
  taken: Record<string, Record<string, { participantId: string; name: string; label: string }>>;
};
export type FacetPerusahaan = { company: string; count: number };

// Label sama dengan saringan Source di server (LABEL_ASAL), supaya nilai yang dicentang cocok dengan sel.
export const ASAL: Record<AsalPeserta, { label: string; judul: string }> = {
  walkin: { label: LABEL_ASAL.walkin, judul: "Added by staff at the check-in desk on event day" },
  registration: { label: LABEL_ASAL.registration, judul: "Filled in the public registration form" },
  manual: { label: LABEL_ASAL.manual, judul: "Typed in or imported by staff" },
  scanner: { label: LABEL_ASAL.scanner, judul: "Pulled from Scanner API; some fields are managed there" },
};

/**
 * Arti waktu "Registered", untuk tooltip sel dan panel detail. Mengikuti waktu
 * yang menang, bukan asal peserta: orang yang diimpor lalu belakangan mengisi
 * form berasal "Self-registered", tapi jamnya adalah jam impor.
 */
/**
 * Isi panel Logistics: satu baris per stay (hotel, kamar, tanggal), bus bawaan,
 * tiket kereta per arah, dan kit yang sudah diambil. Nilainya dari kolom yang
 * sama dengan tabel, jadi panel dan tabel tidak bisa berbeda.
 */
export function RincianLogistik({ logistik, bentuk, offset }: { logistik: LogistikRingkas | null; bentuk: BentukLogistik; offset: string }) {
  const kosong = (teks: string) => <span className="text-on-surface-variant">{teks}</span>;
  const kolom = new Map(kolomLogistik({ ...bentuk, stays: Math.max(1, logistik?.stays.length ?? 1), kereta: true }).map((k) => [k.key, k]));
  const nilai = (key: string) => kolom.get(key)?.nilai(logistik, offset, "layar") ?? "";
  const stays = logistik?.stays ?? [];
  const tiket = (arah: "outbound" | "return") => {
    if (!logistik?.kereta?.[arah]?.length) return null;
    const isi = (k: string) => nilai(`kereta:${arah}:${k}`);
    const bagian = [
      [isi("train_name"), isi("travel_class")].filter(Boolean).join(", "),
      [isi("origin"), isi("destination")].filter(Boolean).join(" to "),
      [isi("depart_date"), isi("depart_time")].filter(Boolean).join(" "),
      [isi("carriage") && `Carriage ${isi("carriage")}`, isi("seat") && `seat ${isi("seat")}`].filter(Boolean).join(", "),
      isi("booking_code") && `Booking ${isi("booking_code")}`,
    ].filter(Boolean);
    return bagian.join(" · ");
  };
  const keluar = tiket("outbound");
  const pulang = tiket("return");
  const kit = bentuk.kit.map((b) => ({ nama: b.name, isi: nilai(`kit:${b.id}`) })).filter((b) => b.isi);
  return (
    <>
      {stays.length ? stays.map((_, i) => {
        const n = i + 1;
        const label = stays.length > 1 ? `Hotel ${n}` : "Hotel";
        const dari = nilai(`stay:in:${n}`);
        const sampai = nilai(`stay:out:${n}`);
        return (
          <KeyValue key={i} label={label}>
            <span className="block">{nilai(i === 0 ? "kamar" : `stay:hotel:${n}`)}</span>
            <span className="block text-on-surface-variant">
              {`Room ${nilai(`stay:room:${n}`).replace("To follow", "to follow")}`}
              {dari || sampai ? ` · ${dari || "?"} to ${sampai || "?"}` : ""}
            </span>
          </KeyValue>
        );
      }) : <KeyValue label="Hotel">{kosong("No hotel yet")}</KeyValue>}
      <KeyValue label="Default vehicle">{logistik?.bus ?? kosong("No vehicle yet")}</KeyValue>
      {keluar ? <KeyValue label="Outbound train">{keluar}</KeyValue> : null}
      {pulang ? <KeyValue label="Return train">{pulang}</KeyValue> : null}
      {bentuk.kit.length ? (
        <KeyValue label="Kit collected">{kit.length ? kit.map((b) => b.isi === "Collected" ? b.nama : `${b.nama} (${b.isi})`).join(", ") : kosong("Nothing yet")}</KeyValue>
      ) : null}
    </>
  );
}

export function artiMasuk(p: Participant): string {
  if (p.registered_via === "form") return "Registration form submitted";
  if (p.source === "walkin") return "Added at the check-in desk";
  if (p.source === "scanner") return "First synced from Scanner API";
  return "Imported or added by staff";
}

export const RSVP_TONE: Record<string, "success" | "warning" | "error"> = { confirmed: "success", invited: "warning", declined: "error" };

/** Lebar kolom logistik dari kuncinya (lihat `kolomLogistik`). */
export function lebarLogistik(key: string): number {
  if (key === "kamar" || key.startsWith("stay:hotel:")) return 200;
  if (key.startsWith("stay:room:") || key === "bus") return 96;
  if (key.startsWith("stay:")) return 168;
  return 136;
}

export const PAGE_SIZE = 25;
/**
 * Pilihan baris per halaman. 1000 = "All", sama dengan batas `limit` di server:
 * di atas itu tabel DOM tanpa virtualisasi mulai berat, jadi acara yang lebih
 * besar tetap berhalaman per 1000 dan pilihannya ditulis "1,000", bukan "All".
 */
export const UKURAN_HALAMAN = [25, 100, 500, 1000];
export const SEMUA_BARIS = 1000;
/** Umur maksimum hitungan acara, sesi dan organisasi sebelum dimuat ulang saat mencari. */
export const UMUR_META_MS = 45_000;
export const LEBAR_NAMA = 240;
/** Kolom kotak centang. Lengket di kiri bersama kolom Nama. */
export const LEBAR_PILIH = 48;
/** Batas satu kali Hapus massal, sama dengan /api/admin/participants/bulk-delete. */
export const BATAS_HAPUS = 500;

export const kotakCentang = "size-4 cursor-pointer accent-[var(--color-primary)]";

/** Kotak centang kepala tabel: tiga keadaan, karena halaman bisa tercentang sebagian. */
export function CentangHalaman({ checked, indeterminate, onChange }: { checked: boolean; indeterminate: boolean; onChange: (next: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Select all on this page"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className={kotakCentang}
    />
  );
}

export type JenisUrut = JenisUrutKolom;

/** Ekspor yang dicentang: format yang sama dengan Export di kepala halaman, ukuran bilah. */
export function EksporTerpilih({ busy, onPick }: { busy: boolean; onPick: (format: "xlsx" | "csv") => void }) {
  const [pemicu, setPemicu] = useState<HTMLSpanElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  return (
    <>
      <span ref={setPemicu} className="inline-flex">
        <Button
          variant="outlined"
          size="sm"
          className="target-48"
          loading={busy}
          icon={<Package size={16} />}
          trailingIcon={<CaretDown size={14} className={cx("transition-transform max-sm:hidden", menu.open && "rotate-180")} />}
          aria-label="Export"
          aria-haspopup="menu"
          aria-expanded={menu.open}
          onClick={menu.toggle}
        >
          <span className="max-sm:hidden">Export</span>
        </Button>
      </span>
      {menu.open ? (
        <Popover anchor={menu} label="Choose export format" width={220} className="p-0">
          {([["xlsx", "Excel (.xlsx)", FileXls], ["csv", "CSV (.csv)", FileCsv]] as const).map(([format, label, Icon]) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              onClick={() => { menu.tutup(); onPick(format); }}
              className="flex w-full items-center gap-3 border-b border-outline-variant p-3 text-left text-body-medium font-medium last:border-b-0 hover:bg-primary-soft"
            >
              <Icon size={18} className="shrink-0 text-on-surface-variant" />{label}
            </button>
          ))}
        </Popover>
      ) : null}
    </>
  );
}

/**
 * Menu Logistics di bilah pilihan: dialog yang sama dengan tab Assignments di
 * Logistics, untuk peserta yang dicentang di sini. Kamar dipilih di dialog
 * Assign to hotel (hotel saja atau kamarnya langsung), jadi tidak ada butir
 * "kamar" terpisah.
 */
export function MenuLogistik({ onPick }: { onPick: (jenis: "kamar" | "bus" | "lepas-kamar" | "lepas-bus") => void }) {
  const [pemicu, setPemicu] = useState<HTMLSpanElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const PILIHAN = [
    ["kamar", "Assign to hotel or room", Bed],
    ["bus", "Assign to vehicle", IkonBus],
    ["lepas-kamar", "Remove from hotel", null],
    ["lepas-bus", "Remove from vehicle", null],
  ] as const;
  return (
    <>
      <span ref={setPemicu} className="inline-flex">
        <Button
          simpan
          variant="outlined"
          size="sm"
          className="target-48"
          icon={<SuitcaseRolling size={16} />}
          trailingIcon={<CaretDown size={14} className={cx("transition-transform max-sm:hidden", menu.open && "rotate-180")} />}
          aria-label="Logistics"
          aria-haspopup="menu"
          aria-expanded={menu.open}
          onClick={menu.toggle}
        >
          <span className="max-sm:hidden">Logistics</span>
        </Button>
      </span>
      {menu.open ? (
        <Popover anchor={menu} label="Logistics for the selected participants" width={240} className="p-0">
          {PILIHAN.map(([jenis, label, Icon]) => (
            <button
              key={jenis}
              type="button"
              role="menuitem"
              onClick={() => { menu.tutup(); onPick(jenis); }}
              className="flex w-full items-center gap-3 border-b border-outline-variant p-3 text-left text-body-medium font-medium last:border-b-0 hover:bg-primary-soft"
            >
              {Icon ? <Icon size={18} className="shrink-0 text-on-surface-variant" /> : <span className="size-[18px] shrink-0" aria-hidden />}{label}
            </button>
          ))}
        </Popover>
      ) : null}
    </>
  );
}

// Diperiksa server (`pengurut` di participants-saring): kolom RPC, kolom yang
// diurutkan di server, `checkin:<sesi>`, atau `field:<kunci>`.
export type SortKey = string;

export type Draft = {
  qr_code: string; name: string; company: string; title: string; email: string; phone: string;
  participant_type: string; rsvp_status: string; extra: Record<string, string>;
};
export const EMPTY_DRAFT: Draft = { qr_code: "", name: "", company: "", title: "", email: "", phone: "", participant_type: "", rsvp_status: "", extra: {} };

export function toDraft(participant: Participant): Draft {
  return {
    qr_code: participant.qr_code,
    name: participant.name,
    company: participant.company ?? "",
    title: participant.title ?? "",
    email: participant.email ?? "",
    phone: participant.phone ?? "",
    participant_type: participant.participant_type ?? "",
    rsvp_status: participant.rsvp_status ?? "",
    extra: { ...(participant.extra ?? {}) },
  };
}

export const inputClass = "mt-1.5 h-9 w-full rounded-md border border-outline bg-surface-container-lowest px-3 text-body-medium outline-none focus:border-primary";
export const lockedClass = "mt-1.5 flex min-h-9 items-center rounded-md border border-dashed border-outline-variant bg-surface-container-high px-3 text-body-medium text-on-surface-variant";

export function teksJawaban(field: RegistrationField, value: string | undefined): string {
  if (!value) return "";
  if (field.type === "checkbox") return value === "true" ? "Yes" : "";
  return value;
}

export function inisial(nama: string) {
  return nama.split(/\s+/).filter(Boolean).slice(0, 2).map((kata) => kata[0]?.toUpperCase() ?? "").join("");
}
