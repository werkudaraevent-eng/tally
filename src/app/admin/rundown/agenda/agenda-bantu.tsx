"use client";

import { type RundownItem, type RundownSection } from "@/lib/rundown";
import { hrefTrip, jamBerangkatBaru, kapanBerangkat, selisihMenit, type TripTertaut } from "@/lib/logistik/trip-agenda";
import { type DrafBaru, type FormAgenda } from "@/lib/agenda-simpan-aman";
import { type OutfitSetiapHari } from "@/lib/outfit-setiap-hari";
import { type KolomSasaran, type SasaranBagian } from "@/lib/sasaran-bagian";
import type { EventTimeZone } from "@/lib/timezone";
import { keInputWaktu } from "@/components/admin/logistik/bersama";
import { ArrowSquareOut, Bus as IkonBus } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import { Fragment } from "react";
import { Kelompok } from "@/components/admin/compact-form";
import { FilterChip, SegmentedButton, SelectMenu } from "@/components/m3";

// CMS rundown acara. Supporting pane: jadwal bagian aktif di panel utama,
// penyunting di panel kanan (baris terpilih, setelan bagian, header publik).
//
// Bentuknya daftar, bukan kanvas: rundown adalah urutan waktu, dan satu-satunya
// tata letak yang benar adalah dari jam paling awal ke paling akhir. Karena itu
// tidak ada drag-and-drop bebas di sini: urutan dihitung dari jam mulai, sehingga
// admin yang mengetik jam yang benar tidak perlu lagi menyusun ulang barisnya.
// Pengecualiannya baris berjam mulai sama (sesi paralel): urutan di dalam slot
// itu disimpan di `sort_order` dan diatur admin lewat pegangan geser atau tombol
// Move up/Move down. Baris berjam unik tidak punya pegangan, karena menggesernya
// ke luar slot jamnya akan membuat jadwal berbohong.

/**
 * Baris di CMS. `bus_trips`: trip bus yang ditautkan ke baris ini di Logistics
 * (tidak ada = tanpa tautan). Tautannya disunting di sana; di sini hanya chip
 * Bus, catatan di Edit item, dan kalimat di dialog hapus.
 */
export type ItemAgenda = RundownItem & { bus_trips?: TripTertaut[] };

export type Payload = { sections: RundownSection[]; items: ItemAgenda[]; event_dates?: { start: string | null; end: string | null } };

export const EMPTY_DRAFT: DrafBaru = { start_time: "", end_time: "", title: "", subtitle: "", is_break: false };

/** Kolom yang disunting di Edit item dan Section. Lapisan suntingan hanya memuat yang diubah. */
export type IsiBaris = Pick<RundownItem, "start_time" | "end_time" | "title" | "subtitle" | "is_break" | "is_published" | "title_en">;
export type IsiBagian = Pick<RundownSection, "name" | "event_date" | "highlight_current" | "is_published">;

/** Permintaan yang tidak mendapat jawaban sama sekali. */
export const PUTUS = "Connection lost. Try again.";

/** Salinan tanpa satu kunci; objek yang sama bila kuncinya memang tidak ada. */
export function tanpa<T>(isi: Record<number, T>, kunci: number): Record<number, T> {
  if (!(kunci in isi)) return isi;
  const sisa = { ...isi };
  delete sisa[kunci];
  return sisa;
}

/** Aksi yang meninggalkan formulir terbuka. `ke` dan `fokus`: lihat lindungi(). */
export type Tunda = { aksi: () => void; ke?: FormAgenda; fokus: HTMLElement | null };

export function fokusSekarang(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

/**
 * Dress code dari /api/admin/rundown/sections/outfit. `available` false: kolomnya
 * belum ada (migrasi 202610160001 belum dijalankan). `horizon`: Dress code hanya
 * tampil untuk preset Gathering Horizon, satu-satunya portal yang punya
 * halamannya. `label`: nama halaman, dan `every_day`: dress code Every day
 * seluruh acara; keduanya disunting di Participant area, di sini hanya dibaca.
 */
export type OutfitInfo = { available: boolean; horizon: boolean; label: string | null; every_day: OutfitSetiapHari | null };

/** Dress code: permintaan yang tidak mendapat jawaban sama sekali. */
export const CEK_KONEKSI = "Check your connection and try again.";

/**
 * Untuk siapa tiap bagian, dari /api/admin/rundown/sections/sasaran.
 * `available` false: migrasi 202610180002 belum dijalankan. Hanya untuk
 * Gathering Horizon, satu-satunya portal yang membuka bagian milik peserta.
 */
export type SasaranInfo = { available: boolean; horizon: boolean; fields: KolomSasaran[] };

// Petunjuk satu kalimat per aturan: baris per pembicara, label, format.
export const HINT_KETERANGAN = "Shown under the title. A line ending in a colon becomes a label (e.g. Moderator:). Bold, italic, theme colour and lists show on the event page. Pick speakers above to show their photos.";
// Contoh generik: repo ini publik, jadi tanpa nama orang atau organisasi sungguhan.
export const CONTOH_KETERANGAN = "Panelists:\nName, Title - Organisation\nName, Title - Organisation\nModerator:\nName, Title - Organisation";

// Nilai yang ditampilkan <input type="color"> ketika kolomnya masih null.
//
// Bukan nilai yang disimpan: kolomnya tetap null sampai admin benar-benar memilih
// warna. `<input type="color">` tidak bisa berkeadaan kosong, jadi ia harus diberi
// sesuatu, dan yang paling tidak mengejutkan adalah warna yang memang sedang
// tampil di halaman publik.
export const BRANDING_FALLBACK = {
  background_color: "#ffffff",
  text_color: "#1a1a1a",
  accent_color: "#2649d0",
} as const;

/** Tanggal bagian di luar rentang tanggal acara. Tanpa tanggal acara: tidak diperiksa. */
export function diLuarAcara(tanggal: string | null | undefined, acara: { start: string | null; end: string | null } | null): boolean {
  if (!tanggal || !acara?.start) return false;
  const akhir = acara.end && acara.end >= acara.start ? acara.end : acara.start;
  return tanggal < acara.start || tanggal > akhir;
}

/** "5 Nov 2026" atau "5 Nov 2026 to 8 Nov 2026". */
export function rentangAcara(acara: { start: string | null; end: string | null }): string {
  const pendek = (tanggal: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(tanggal) ? new Date(`${tanggal}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : tanggal;
  const awal = pendek(acara.start ?? "");
  return acara.end && acara.end > (acara.start ?? "") ? `${awal} to ${pendek(acara.end)}` : awal;
}

/** "Monday, 24 August 2026" untuk keterangan staf. formatEventDate di lib/rundown dipakai halaman publik, jadi tetap id-ID. */
export function formatStaffDate(eventDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return eventDate;
  const date = new Date(`${eventDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return eventDate;
  return date.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** Nama hari bawaan dari tanggal, dalam bahasa acara: "Kamis, 5 November 2026". */
export function namaDariTanggal(tanggal: string, bahasa: "id" | "en"): string {
  const date = new Date(`${tanggal}T00:00:00Z`);
  if (!tanggal || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(bahasa === "en" ? "en-GB" : "id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** "2026-11-06" sehari sesudah `tanggal`. */
export function besoknya(tanggal: string): string {
  const date = new Date(`${tanggal}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return tanggal;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function fokusJudulBaru() {
  window.setTimeout(() => document.querySelector<HTMLInputElement>("[data-draft-title]")?.focus(), 0);
}

/**
 * Catatan di bawah Start dan End untuk baris yang ditautkan trip bus di
 * Logistics. Tautannya disunting di sana ("Edit in Logistics"); di sini hanya
 * diberi tahu bahwa jam busnya ikut bergeser bersama baris ini.
 *
 * Selisihnya dihitung dari jam dan tanggal yang tersimpan, yang dijaga pemicu
 * database, lalu jam busnya dari jam mulai di kolom: jam yang belum disimpan
 * langsung menunjukkan ke mana busnya akan bergeser.
 */
export function CatatanBus({ item, trips, jamTersimpan, tanggalTersimpan, zone }: {
  item: RundownItem;
  trips: TripTertaut[];
  jamTersimpan: string;
  tanggalTersimpan: string;
  zone: EventTimeZone;
}) {
  const waktu = (trip: TripTertaut) => {
    if (!trip.depart_at) return null;
    const berangkat = keInputWaktu(trip.depart_at, zone);
    const selisih = selisihMenit(berangkat, tanggalTersimpan, jamTersimpan);
    if (selisih === null) return null;
    return { selisih, jam: jamBerangkatBaru(item.start_time, selisih) ?? berangkat.slice(11, 16) };
  };
  const TAUTAN = "inline-flex items-center gap-1 rounded-sm font-medium text-primary hover:underline";
  const tabBaru = (
    <>
      <ArrowSquareOut size={14} aria-hidden />
      <span className="sr-only">(new tab)</span>
    </>
  );
  const [satu] = trips;
  const waktuSatu = trips.length === 1 ? waktu(satu) : null;
  return (
    <div className="col-span-2 flex items-start gap-2 rounded-md bg-surface-container-high p-3 text-body-medium text-on-surface-variant">
      <IkonBus size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        {trips.length === 1 ? (
          <>
            <p>
              Bus trip <span className="font-medium text-on-surface">{satu.name}</span>{" "}
              {waktuSatu ? kapanBerangkat(waktuSatu.jam, waktuSatu.selisih) : "is linked to this item but has no departure time yet."}
            </p>
            <Link href={hrefTrip(satu.id)} target="_blank" rel="noreferrer" className={cx("mt-1", TAUTAN)}>Edit in Logistics{tabBaru}</Link>
          </>
        ) : (
          // Dua trip atau lebih (berangkat dan pulang): tiap nama membuka tripnya.
          <p>
            {plural(trips.length, "vehicle trip")} move with this item:{" "}
            {trips.map((trip, urutan) => {
              const isi = waktu(trip);
              return (
                <Fragment key={trip.id}>
                  {urutan > 0 ? ", " : ""}
                  <Link href={hrefTrip(trip.id)} target="_blank" rel="noreferrer" className={TAUTAN}>{trip.name}{tabBaru}</Link>
                  {` (${isi ? isi.jam : "no time yet"})`}
                </Fragment>
              );
            })}
            .
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Agenda > This section > Show first for (dulu "Who it's for"; hanya mengurutkan,
 * yang menyembunyikan adalah Who sees it per baris). Everyone (bawaan) atau satu kelompok:
 * satu pertanyaan pilihan dan satu atau beberapa jawabannya. Peserta kelompok
 * itu melihat bagian ini lebih dulu di Home dan Schedule; yang lain tetap bisa
 * membukanya. Disimpan lewat Save section.
 */
export function KelompokSasaran({ info, value, onChange }: { info: SasaranInfo; value: SasaranBagian | null; onChange: (next: SasaranBagian | null) => void }) {
  const kolom = value ? info.fields.find((isi) => isi.key === value.field) ?? null : null;
  const pilih = (field: string) => onChange({ field, values: [] });
  const TAUTAN = "inline-flex items-center gap-1 self-start rounded-sm text-body-medium font-medium text-primary hover:underline";
  return (
    <Kelompok
      title="Show first for"
      note={info.available && info.fields.length > 0 ? "Participants in this group see this section first on Home and Schedule. Everyone else can still open it. To hide a row from others, use Who sees it on that item. Saved with Save day." : undefined}
    >
      {!info.available ? (
        <p className="text-body-medium text-on-surface-variant">Show first for needs a database update first (migration 202610180002).</p>
      ) : info.fields.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-body-medium text-on-surface-variant">Add a dropdown or single-choice participant field first, such as Batch. It can be staff only.</p>
          <Link href="/admin/registrasi" target="_blank" rel="noreferrer" className={TAUTAN}>
            Edit in Registration <ArrowSquareOut size={14} aria-hidden /><span className="sr-only">(new tab)</span>
          </Link>
        </div>
      ) : (
        <>
          <SegmentedButton
            label="Show first for"
            options={[{ value: "semua", label: "Everyone" }, { value: "kelompok", label: "One group" }]}
            value={value ? "kelompok" : "semua"}
            onChange={(next) => onChange(next === "semua" ? null : { field: value?.field ?? "", values: value?.values ?? [] })}
          />
          {value ? (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-body-medium font-medium text-on-surface">Participant field</p>
                <SelectMenu<string>
                  label="Participant field"
                  width="100%"
                  value={kolom ? value.field : ""}
                  onChange={(field) => { if (field && field !== value.field) pilih(field); }}
                  options={[
                    ...(kolom ? [] : [{ value: "", label: "Choose a field" }]),
                    ...info.fields.map((isi) => ({ value: isi.key, label: isi.staff ? `${isi.label} (staff only)` : isi.label })),
                  ]}
                />
                <p className="text-body-small text-on-surface-variant">Only dropdown and single-choice columns are listed: a group needs a fixed list of answers.</p>
                <Link href="/admin/registrasi" target="_blank" rel="noreferrer" className={TAUTAN}>
                  Add or edit columns in Registration <ArrowSquareOut size={14} aria-hidden /><span className="sr-only">(new tab)</span>
                </Link>
              </div>
              {kolom ? (
                <div className="flex flex-col gap-2">
                  <p id="sasaran-nilai" className="text-body-medium font-medium text-on-surface">Answers in this group</p>
                  <div role="group" aria-labelledby="sasaran-nilai" className="flex flex-wrap gap-2">
                    {kolom.options.map((nilai) => {
                      const aktif = value.values.includes(nilai);
                      return (
                        <FilterChip
                          key={nilai}
                          selected={aktif}
                          onClick={() => onChange({ field: value.field, values: aktif ? value.values.filter((isi) => isi !== nilai) : [...value.values, nilai] })}
                        >
                          {nilai}
                        </FilterChip>
                      );
                    })}
                  </div>
                  {value.values.length === 0 ? <p className="text-body-small text-on-surface-variant">Choose at least one answer.</p> : null}
                </div>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </Kelompok>
  );
}
