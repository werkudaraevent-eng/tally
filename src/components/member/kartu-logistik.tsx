import { ArrowSquareOut, Bed, Bus, CheckCircle, Package, Phone, Train, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import type { EventTimeZone } from "@/lib/timezone";
import { nomorKru } from "@/lib/logistik/kontak-kru";
import type { LogistikAgenda, LogistikDetailBus, LogistikPeserta } from "@/lib/logistik/peserta";
import { jamLeg, ruteLeg, tanggalLeg } from "@/lib/logistik/kereta-tampil";
import { HEAD, LABEL_BAGIAN, MUTED } from "@/components/landing/modern/styles";

/**
 * Kartu logistik Dashboard saya (preset Gathering, rancangan 2026-10-03 di
 * /mnt/project-files/gathering/): Berikutnya, Kamar, Bus, Barang.
 *
 * Bentuknya meneruskan kartu Tiket di sebelahnya: panel abu 16px, label kapital
 * 13px, judul 22/24px. Kamar atau bus yang belum diatur ditulis "sedang
 * disiapkan", bukan disembunyikan: peserta gathering memang menunggu kamarnya,
 * dan kartu yang hilang terbaca sebagai "saya tidak dapat kamar".
 */

const KARTU = "rounded-lg bg-[var(--reg-panel)] p-6";
const JUDUL_KARTU = `${HEAD} mt-1.5 text-[22px] font-semibold leading-tight sm:text-[24px]`;
const LENCANA_BEDA =
  "inline-flex min-h-7 items-center rounded-[8px] bg-[#fff4dc] px-2.5 text-label-large font-semibold text-[#7a4f00]";

function waktu(iso: string | null, zona: EventTimeZone, opsi: Intl.DateTimeFormatOptions): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("id-ID", { timeZone: zona, ...opsi }).format(new Date(iso));
}

const jam = (iso: string | null, zona: EventTimeZone) => waktu(iso, zona, { hour: "2-digit", minute: "2-digit", hour12: false });
const hariJam = (iso: string | null, zona: EventTimeZone) =>
  waktu(iso, zona, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** "Hari ini", "Besok", atau tanggalnya, dalam zona waktu acara. */
function labelHari(iso: string, zona: EventTimeZone, now: Date): string {
  const kunci = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(d);
  const besok = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (kunci(new Date(iso)) === kunci(now)) return "Hari ini";
  if (kunci(new Date(iso)) === kunci(besok)) return "Besok";
  return waktu(iso, zona, { weekday: "long", day: "numeric", month: "long" }) ?? "";
}

function Disiapkan({ children }: { children: ReactNode }) {
  return <p className={`mt-2 text-body-large leading-7 ${MUTED}`}>{children}</p>;
}

/** Kartu lebar di atas Pengumuman: kegiatan terdekat, titik kumpul, dan bus. */
/** Agenda tanpa bus ("tidak naik bus") tidak dijadikan kartu Berikutnya. */
export function KartuBerikutnya({ agenda, zona, now, className = "" }: { agenda: LogistikAgenda; zona: EventTimeZone; now: Date; className?: string }) {
  const tujuan = agenda.destination?.trim() || agenda.name;
  return (
    <section aria-label="Berikutnya" className={`${className} rounded-lg border border-[color-mix(in_srgb,var(--reg-primary)_30%,transparent)] bg-[color-mix(in_srgb,var(--reg-primary)_8%,var(--reg-surface))] p-6`}>
      <p className={`${LABEL_BAGIAN} text-[var(--reg-primary)]`}>Berikutnya · {labelHari(agenda.depart_at!, zona, now)}</p>
      <h2 className={`${HEAD} mt-1.5 text-balance text-[22px] font-semibold leading-tight sm:text-[24px]`}>
        {jam(agenda.depart_at, zona)}
        {agenda.meeting_point?.trim() ? ` kumpul di ${agenda.meeting_point.trim()}` : ""}, naik {agenda.bus} ke {tujuan}
      </h2>
      {agenda.differs_from_default ? (
        <p className="mt-3">
          <span className={LENCANA_BEDA}>Bus berbeda dari biasanya</span>
        </p>
      ) : null}
    </section>
  );
}

export function KartuKamar({ logistik, zona }: { logistik: LogistikPeserta; zona: EventTimeZone }) {
  const kamar = logistik.lodging;
  return (
    <section aria-labelledby="kamar-judul" className={KARTU}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={`${LABEL_BAGIAN} ${MUTED} inline-flex items-center gap-1.5`}>
            <Bed size={16} aria-hidden />
            Kamar
          </p>
          <h2 id="kamar-judul" className={JUDUL_KARTU}>
            {kamar ? kamar.hotel.name : "Kamar sedang disiapkan"}
          </h2>
        </div>
        {kamar?.hotel.map_url ? (
          <a
            href={kamar.hotel.map_url}
            target="_blank"
            rel="noreferrer noopener"
            className="m3-state inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-[var(--reg-outline)] px-4 text-label-large font-semibold"
          >
            Peta
            <ArrowSquareOut size={16} aria-hidden />
          </a>
        ) : null}
      </div>
      {kamar ? (
        <>
          {kamar.hotel.address ? <p className={`mt-1 text-body-medium ${MUTED}`}>{kamar.hotel.address}</p> : null}
          <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-1">
            <div>
              <p className={`text-body-medium ${MUTED}`}>Nomor kamar</p>
              <p className="text-[40px] font-bold leading-[44px] tracking-[-0.01em] tabular-nums">{kamar.room_number}</p>
            </div>
            {[kamar.floor ? `Lantai ${kamar.floor}` : null, kamar.room_type].some(Boolean) ? (
              <p className={`pb-1 text-body-large ${MUTED}`}>{[kamar.floor ? `Lantai ${kamar.floor}` : null, kamar.room_type].filter(Boolean).join(" · ")}</p>
            ) : null}
          </div>
          {kamar.check_in_at || kamar.check_out_at ? (
            <dl className="mt-4 grid grid-cols-[110px_minmax(0,1fr)] gap-y-2 text-body-large">
              {kamar.check_in_at ? (
                <>
                  <dt className={MUTED}>Check-in</dt>
                  <dd className="font-medium">{hariJam(kamar.check_in_at, zona)}</dd>
                </>
              ) : null}
              {kamar.check_out_at ? (
                <>
                  <dt className={MUTED}>Check-out</dt>
                  <dd className="font-medium">{hariJam(kamar.check_out_at, zona)}</dd>
                </>
              ) : null}
            </dl>
          ) : null}
          {kamar.roommates && kamar.roommates.length > 0 ? (
            <div className="mt-5">
              <p className={`text-body-medium ${MUTED}`}>Teman sekamar</p>
              <ul className="mt-2 flex flex-col gap-2">
                {kamar.roommates.map((teman) => (
                  <li key={`${teman.name}-${teman.company ?? ""}`} className="flex items-center gap-3 rounded-md bg-[var(--reg-surface)] p-3">
                    <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--reg-primary)_14%,var(--reg-surface))] text-label-large font-bold text-[var(--reg-primary)]">
                      {inisial(teman.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{teman.name}</span>
                      {teman.company ? <span className={`block text-body-medium ${MUTED}`}>{teman.company}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <Disiapkan>Panitia sedang mengatur kamar. Nomor kamar dan teman sekamar Anda muncul di sini begitu siap.</Disiapkan>
      )}
    </section>
  );
}

export function KartuBus({ logistik, zona }: { logistik: LogistikPeserta; zona: EventTimeZone }) {
  const bus = logistik.transport;
  return (
    <section aria-labelledby="bus-judul" className={KARTU}>
      <p className={`${LABEL_BAGIAN} ${MUTED} inline-flex items-center gap-1.5`}>
        <Bus size={16} aria-hidden />
        Bus
      </p>
      <h2 id="bus-judul" className={JUDUL_KARTU}>
        {bus?.default_bus ?? (bus ? "Lihat per agenda" : "Bus sedang disiapkan")}
      </h2>
      {bus ? (
        <>
          {bus.default_bus ? <p className={`mt-1 text-body-medium ${MUTED}`}>Bus Anda selama acara, kecuali tertulis lain di bawah.</p> : null}
          {bus.trips.length > 0 ? (
            <ul className="mt-4 border-t border-[var(--reg-outline-variant)]">
              {bus.trips.map((trip) => (
                <li key={`${trip.name}-${trip.depart_at ?? ""}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-[var(--reg-outline-variant)] py-3">
                  <span className="min-w-0">
                    <span className="block font-semibold">{trip.name}</span>
                    <span className={`block text-body-medium ${MUTED}`}>
                      {[hariJam(trip.depart_at, zona), trip.meeting_point?.trim()].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span
                    className={`inline-flex min-h-7 items-center rounded-[8px] px-2.5 text-label-large font-semibold ${
                      trip.differs_from_default && trip.bus ? "bg-[#fff4dc] text-[#7a4f00]" : "bg-[var(--reg-surface)]"
                    }`}
                  >
                    {trip.bus ?? "Tanpa bus"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {logistik.buses.length > 0 ? <DetailBus buses={logistik.buses} /> : null}
        </>
      ) : (
        <Disiapkan>Nomor bus dan titik kumpul Anda muncul di sini begitu panitia selesai mengaturnya.</Disiapkan>
      )}
    </section>
  );
}

/**
 * Kontak kru bus (bila panitia menampilkannya di Logistics > Buses): teks
 * panitia apa adanya, lalu tombol Telepon dan WhatsApp setinggi 48 px untuk
 * nomor pertama di dalamnya. Dipakai kartu Bus preset Modern dan Gathering.
 */
export function KontakKru({ teks, awalan, aksi, ringkas = false }: {
  teks: string;
  /** Mis. "Kru: " di depan teks; kosong bila judulnya sudah di atas. */
  awalan?: string;
  aksi: { call: string; whatsapp: string; callAria: string; whatsappAria: string };
  /** Kartu sempit (petak setengah lebar di ponsel): tombol ikon bulat 48 px tanpa teks. */
  ringkas?: boolean;
}) {
  const nomor = nomorKru(teks);
  const tombol = ringkas
    ? "inline-flex size-12 items-center justify-center rounded-full border border-[var(--reg-outline-variant)] text-[var(--reg-primary)]"
    : "inline-flex min-h-12 items-center gap-2 rounded-full border border-[var(--reg-outline-variant)] px-4 text-label-large font-semibold text-[var(--reg-primary)]";
  return (
    <>
      <p className={`whitespace-pre-line text-body-medium ${MUTED}`}>{awalan}{teks}</p>
      {nomor ? (
        <div className="mt-1 flex flex-wrap gap-2">
          <a href={`tel:${nomor.tel}`} aria-label={aksi.callAria} className={tombol}>
            <Phone size={ringkas ? 20 : 18} aria-hidden />
            {ringkas ? null : aksi.call}
          </a>
          <a href={nomor.wa} target="_blank" rel="noreferrer noopener" aria-label={aksi.whatsappAria} className={tombol}>
            <WhatsappLogo size={ringkas ? 20 : 18} aria-hidden />
            {ringkas ? null : aksi.whatsapp}
          </a>
        </div>
      ) : null}
    </>
  );
}

/** Plat nomor dan kontak kru tiap bus yang dinaiki peserta (preset Modern, teks Indonesia seperti kartu ini). */
function DetailBus({ buses }: { buses: LogistikDetailBus[] }) {
  return (
    <ul className="mt-4 flex flex-col gap-4">
      {buses.map((bus) => (
        <li key={bus.code} className="flex flex-col gap-1">
          <p className="font-semibold">{[bus.code, bus.plate ? `Plat ${bus.plate}` : null].filter(Boolean).join(" · ")}</p>
          {bus.crew ? (
            <KontakKru
              teks={bus.crew}
              awalan="Kru: "
              aksi={{ call: "Telepon", whatsapp: "WhatsApp", callAria: `Telepon kru ${bus.code}`, whatsappAria: `WhatsApp kru ${bus.code}` }}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function KartuBarang({ logistik }: { logistik: LogistikPeserta }) {
  if (logistik.items.length === 0) return null;
  return (
    <section aria-labelledby="barang-judul" className={KARTU}>
      <p className={`${LABEL_BAGIAN} ${MUTED} inline-flex items-center gap-1.5`}>
        <Package size={16} aria-hidden />
        Barang untuk Anda
      </p>
      <h2 id="barang-judul" className="sr-only">
        Barang untuk Anda
      </h2>
      <ul className="mt-3 border-t border-[var(--reg-outline-variant)]">
        {logistik.items.map((item) => (
          <li key={item.name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--reg-outline-variant)] py-3">
            <span>
              {item.name}
              {item.size ? <span className="font-semibold"> · {item.size}</span> : null}
            </span>
            {item.picked_up_at ? (
              <span className="inline-flex min-h-7 items-center gap-1.5 rounded-[8px] bg-[#e5f4ea] px-2.5 text-label-large font-semibold text-[#17602d]">
                <CheckCircle size={16} weight="fill" aria-hidden />
                Sudah diambil
              </span>
            ) : (
              <span className={`text-body-medium ${MUTED}`}>{item.pickup_note?.trim() || "Belum diambil"}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const TEKS_KERETA = {
  id: { judul: "Tiket kereta", outbound: "Berangkat", return: "Pulang", gerbong: "Gerbong", kursi: "Kursi", kode: "Kode booking" },
  en: { judul: "Train tickets", outbound: "Outbound", return: "Return", gerbong: "Carriage", kursi: "Seat", kode: "Booking code" },
} as const;

/**
 * Tiket kereta peserta, satu blok per arah. Tidak tampil bila peserta tidak
 * punya tiket: berbeda dengan kamar dan bus, tidak semua acara memakai kereta,
 * jadi "sedang disiapkan" akan menjanjikan sesuatu yang mungkin tidak ada.
 * `kelas` dan `redup` mengikuti kartu di sebelahnya (Gathering atau Modern).
 */
export function KartuKereta({ logistik, lang, kelas = KARTU, redup = MUTED }: { logistik: LogistikPeserta; lang: "id" | "en"; kelas?: string; redup?: string }) {
  if (logistik.trains.length === 0) return null;
  const t = TEKS_KERETA[lang];
  return (
    <section aria-labelledby="kereta-judul" className={kelas}>
      <h2 id="kereta-judul" className={`${LABEL_BAGIAN} ${redup} inline-flex items-center gap-1.5`}>
        <Train size={16} aria-hidden />
        {t.judul}
      </h2>
      <ul className="mt-3 flex flex-col">
        {logistik.trains.map((tiket, index) => {
          const rute = ruteLeg(tiket);
          const baris = [rute ? tiket.train_name : null, tiket.travel_class].filter(Boolean).join(" · ");
          const jam = jamLeg(tiket, lang);
          return (
            <li key={tiket.direction} className={index > 0 ? "mt-4 border-t border-dashed border-[#C9D1DE] pt-4" : ""}>
              <p className={`text-label-large font-semibold ${redup}`}>
                {[t[tiket.direction], tanggalLeg(tiket.depart_date, lang)].filter(Boolean).join(" · ")}
              </p>
              <p className={`${HEAD} mt-1 text-[20px] font-semibold leading-tight [overflow-wrap:anywhere]`}>{rute ?? tiket.train_name}</p>
              {baris || jam ? (
                <p className={`mt-1 text-body-medium ${redup}`}>
                  {baris}
                  {baris && jam ? " · " : null}
                  {jam ? <span className="whitespace-nowrap">{jam}</span> : null}
                </p>
              ) : null}
              {tiket.carriage || tiket.seat ? (
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  {([[t.gerbong, tiket.carriage], [t.kursi, tiket.seat]] as const).map(([label, nilai]) => nilai ? (
                    <div key={label} className="min-w-0">
                      <dt className={`text-body-medium ${redup}`}>{label}</dt>
                      <dd className="text-[28px] font-bold leading-tight tabular-nums [overflow-wrap:anywhere]">{nilai}</dd>
                    </div>
                  ) : null)}
                </dl>
              ) : null}
              {tiket.booking_code ? (
                <p className="mt-3 text-body-medium">
                  <span className={redup}>{t.kode}</span> <span className="font-semibold tracking-[0.06em]">{tiket.booking_code}</span>
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function inisial(nama: string): string {
  const kata = nama.trim().split(/\s+/).filter(Boolean);
  return ((kata[0]?.[0] ?? "") + (kata.length > 1 ? kata[kata.length - 1][0] : "")).toUpperCase();
}
