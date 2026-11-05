"use client";

import { Airplane, Boat, Ticket, Train, Warning } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import {
  Banner, Button, ChipMenu, DetailSection, Dialog, EmptyState, KeyValue, ListDetail, Pane, PaneBody, PaneFooter, SelectField, TextField, EMPTY_VALUE,
} from "@/components/m3";
import { LABEL_ARAH } from "@/lib/logistik/impor";
import { LABEL_MODA, MODA_TIKET, type ArahKereta, type ModaTiket, type TiketKereta } from "@/lib/logistik/types";
import { plural } from "@/lib/plural";
import { KepalaDetail, PilihPeserta, type TabProps } from "./bersama";
import { TabelLogistik, type KolomTabel } from "./tabel-logistik";

/**
 * Tab Tickets: tiket perjalanan tiap peserta (kereta, pesawat, kapal), satu
 * baris per tiket. Satu orang punya satu tiket per arah (Outbound, Return)
 * per segmen; transit = segmen 2 dan seterusnya.
 *
 * Tiket biasanya datang dari daftar agen, KAI atau maskapai lewat Import from
 * Excel; Add ticket menambah satu tiket (pilih peserta dan arah, lalu isi
 * tiketnya) untuk peserta susulan, transit, atau pembetulan cepat. Peserta
 * melihat tiketnya di Dashboard saya bila "Kamar dan bus" dinyalakan di Area peserta.
 */

export const IKON_MODA: Record<ModaTiket, typeof Train> = { train: Train, flight: Airplane, ship: Boat };
/** Contoh isian per moda, di form dan placeholder. */
const CONTOH: Record<ModaTiket, { nama: string; dari: string; ke: string }> = {
  train: { nama: "e.g. Argo Lawu 8", dari: "e.g. Gambir", ke: "e.g. Yogyakarta" },
  flight: { nama: "e.g. Garuda GA 208", dari: "e.g. Jakarta CGK", ke: "e.g. Yogyakarta YIA" },
  ship: { nama: "e.g. KMP Legundi", dari: "e.g. Ketapang", ke: "e.g. Gilimanuk" },
};
const SEGMEN_MAKS = 6;

/** "Fri 6 Nov 2026" dari YYYY-MM-DD, tanpa zona: tanggal yang tertulis di tiket. */
export function tanggalTiket(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

const jamTiket = (tiket: TiketKereta) => [tiket.depart_time, tiket.arrive_time].filter(Boolean).join("–") || null;

/** Tiket yang sedang ditambah: peserta, arah, dan segmen sudah dipilih, isi tiket belum. */
type TiketBaru = { participant_id: string; direction: ArahKereta; segment: number };

export function TabKereta({ data, kirim, busy, baru, tutupBaru }: TabProps) {
  const [pilih, setPilih] = useState<number | null>(null);
  const [arahBaru, setArahBaru] = useState<ArahKereta>("outbound");
  const [tiketBaru, setTiketBaru] = useState<TiketBaru | null>(null);
  const [saringArah, setSaringArah] = useState<ArahKereta[]>([]);
  const [saringModa, setSaringModa] = useState<ModaTiket[]>([]);
  const [ubah, setUbah] = useState<TiketKereta | null>(null);
  const [hapus, setHapus] = useState<TiketKereta | null>(null);

  const orangById = useMemo(() => new Map(data.participants.map((orang) => [orang.id, orang])), [data.participants]);
  // Tiket milik peserta yang dihapus di sumber tetap tersimpan, tetapi tidak
  // ditampilkan: halaman lain di Logistik juga hanya menghitung peserta aktif.
  const tiket = useMemo(() => data.trains
    .filter((t) => orangById.has(t.participant_id))
    .sort((a, b) => orangById.get(a.participant_id)!.name.localeCompare(orangById.get(b.participant_id)!.name, "en-GB")
      || a.participant_id.localeCompare(b.participant_id)
      || (a.direction === b.direction ? 0 : a.direction === "outbound" ? -1 : 1)
      || a.segment - b.segment), [data.trains, orangById]);
  const tampil = tiket.filter((t) => (saringArah.length === 0 || saringArah.includes(t.direction)) && (saringModa.length === 0 || saringModa.includes(t.mode)));
  const punyaTiket = new Set(tiket.map((t) => t.participant_id)).size;
  /** Segmen terakhir per peserta untuk arah yang dipilih: tiket baru menjadi segmen berikutnya (transit). */
  const segmenAkhir = useMemo(() => {
    const peta = new Map<string, number>();
    for (const t of tiket) if (t.direction === arahBaru) peta.set(t.participant_id, Math.max(peta.get(t.participant_id) ?? 0, t.segment));
    return peta;
  }, [tiket, arahBaru]);
  const modaDipakai = MODA_TIKET.filter((moda) => tiket.some((t) => t.mode === moda));
  const adaTransit = tiket.some((t) => t.segment > 1);
  const kataArah = arahBaru === "outbound" ? "an outbound" : "a return";

  if (!data.trains_ready) {
    return (
      <Pane aria-label="Tickets">
        <PaneBody>
          <div className="p-4">
            <Banner tone="warning" icon={<Warning size={18} />}>
              Tickets need a database update first. Ask your Tally administrator to run the tickets migration (mode and segment), then reload this page.
            </Banner>
          </div>
        </PaneBody>
      </Pane>
    );
  }

  const teks = (v: string | null | undefined) => (v && v.trim() ? [v] : []);
  const kolomTiket: KolomTabel<TiketKereta>[] = [
    {
      key: "participant", label: "Participant", lebar: 200, kunci: true, saring: "teks",
      nilai: (t) => [orangById.get(t.participant_id)!.name],
      sel: (t) => <span title={orangById.get(t.participant_id)!.name} className="block h-7 truncate font-medium leading-7 text-on-surface">{orangById.get(t.participant_id)!.name}</span>,
    },
    { key: "direction", label: "Direction", lebar: 104, nilai: (t) => [LABEL_ARAH[t.direction]] },
    { key: "segment", label: "Segment", lebar: 96, rata: "kanan", urut: "angka", tersembunyi: !adaTransit, nilai: (t) => [String(t.segment)] },
    {
      key: "mode", label: "Mode", lebar: 104, tersembunyi: modaDipakai.length <= 1, nilai: (t) => [LABEL_MODA[t.mode]],
      sel: (t) => { const Ikon = IKON_MODA[t.mode]; return <span className="flex h-7 items-center gap-2 text-on-surface"><Ikon size={16} aria-hidden className="shrink-0 text-on-surface-variant" />{LABEL_MODA[t.mode]}</span>; },
    },
    { key: "train", label: "Service", lebar: 160, nilai: (t) => teks(t.train_name) },
    { key: "date", label: "Date", lebar: 112, urut: "waktu", nilai: (t) => teks(tanggalTiket(t.depart_date)?.replace(/ \d{4}$/, "")), csv: (t) => teks(t.depart_date), kunciUrut: (t) => (t.depart_date ? `${t.depart_date} ${t.depart_time ?? ""}` : "") },
    { key: "departs", label: "Departs", lebar: 88, rata: "kanan", urut: "waktu", nilai: (t) => teks(t.depart_time?.slice(0, 5)), kunciUrut: (t) => (t.depart_time ? `${t.depart_date ?? ""} ${t.depart_time}` : "") },
    { key: "seat", label: "Seat", lebar: 72, saring: "teks", nilai: (t) => teks(t.seat) },
    { key: "carriage", label: "Carriage", lebar: 96, nilai: (t) => teks(t.carriage) },
    { key: "booking", label: "Booking code", lebar: 128, saring: "teks", nilai: (t) => teks(t.booking_code) },
    { key: "organisation", label: "Organisation", lebar: 160, nilai: (t) => teks(orangById.get(t.participant_id)!.company) },
    { key: "qr", label: "QR code", lebar: 120, tersembunyi: true, saring: "teks", nilai: (t) => [orangById.get(t.participant_id)!.qr_code] },
    { key: "class", label: "Class", tersembunyi: true, lebar: 104, nilai: (t) => teks(t.travel_class) },
    { key: "from", label: "From", tersembunyi: true, lebar: 140, nilai: (t) => teks(t.origin) },
    { key: "to", label: "To", tersembunyi: true, lebar: 140, nilai: (t) => teks(t.destination) },
    { key: "arrives", label: "Arrives", lebar: 88, rata: "kanan", urut: "waktu", nilai: (t) => teks(t.arrive_time?.slice(0, 5)) },
  ];

  const daftar = (
    <TabelLogistik<TiketKereta>
      label="Tickets"
      tabel="trains"
      baris={tampil}
      semuaBaris={tiket}
      kunciBaris={(t) => String(t.id)}
      kolom={kolomTiket}
      cariLabel="Search tickets"
      cariPlaceholder="Search name, train or flight, seat or booking code…"
      menyaringLuar={saringArah.length > 0 || saringModa.length > 0}
      hapusSaringanLuar={() => { setSaringArah([]); setSaringModa([]); }}
      chip={tiket.length > 0 ? (
        <>
          <ChipMenu
            label="Direction"
            multiple
            options={(["outbound", "return"] as const).map((arah) => ({ value: arah, label: LABEL_ARAH[arah], count: tiket.filter((t) => t.direction === arah).length }))}
            selected={saringArah}
            onChange={(next) => setSaringArah(next as ArahKereta[])}
          />
          {/* Mode hanya muncul bila acaranya memakai lebih dari satu moda: acara kereta saja tidak berubah. */}
          {modaDipakai.length > 1 ? (
            <ChipMenu
              label="Mode"
              multiple
              options={modaDipakai.map((moda) => ({ value: moda, label: LABEL_MODA[moda], count: tiket.filter((t) => t.mode === moda).length }))}
              selected={saringModa}
              onChange={(next) => setSaringModa(next as ModaTiket[])}
            />
          ) : null}
        </>
      ) : null}
      dipilih={pilih !== null ? String(pilih) : null}
      onPilih={(t) => setPilih(t.id)}
      labelBaris={(t) => `${orangById.get(t.participant_id)!.name}, ${LABEL_ARAH[t.direction].toLowerCase()} ${LABEL_MODA[t.mode].toLowerCase()}${t.segment > 1 ? ` segment ${t.segment}` : ""}`}
      namaFile="tickets"
      kaki={(hasil) => tiket.length === 0 ? null : hasil.length === tiket.length
        ? `${plural(tiket.length, "ticket")} for ${punyaTiket.toLocaleString("en-GB")} of ${plural(data.participants.length, "participant")}.`
        : `${hasil.length.toLocaleString("en-GB")} of ${plural(tiket.length, "ticket")}.`}
      kosong={(
        <EmptyState
          plain
          icon={<Ticket size={40} />}
          title="No tickets yet"
          description="Train, flight or ship tickets. Use Import from Excel at the top right for the whole list (one row per person per direction; a transit gets Segment 2), or Add ticket for one person. Participants see their tickets once Room and vehicle is on in the Participant area."
        />
      )}
    />
  );

  const dipilih = pilih !== null ? tiket.find((t) => t.id === pilih) ?? null : null;
  const pemilik = dipilih ? orangById.get(dipilih.participant_id) ?? null : null;
  const detail = dipilih && pemilik ? (
    <Pane as="aside" aria-label={`${pemilik.name} ${LABEL_ARAH[dipilih.direction].toLowerCase()} ticket`}>
      <KepalaDetail
        nama={pemilik.name}
        sub={[LABEL_ARAH[dipilih.direction], LABEL_MODA[dipilih.mode], dipilih.segment > 1 || adaTransit ? `Segment ${dipilih.segment}` : null, pemilik.company].filter(Boolean).join(" · ")}
        onClose={() => setPilih(null)}
      />
      <PaneBody>
        <DetailSection title="What the participant sees">
          <dl className="flex flex-col gap-2">
            <KeyValue label={LABEL_MODA[dipilih.mode]}>{dipilih.train_name}</KeyValue>
            <KeyValue label="Class">{dipilih.travel_class ?? EMPTY_VALUE}</KeyValue>
            <KeyValue label="Route">{[dipilih.origin, dipilih.destination].filter(Boolean).join(" → ") || EMPTY_VALUE}</KeyValue>
            <KeyValue label="Date">{tanggalTiket(dipilih.depart_date) ?? EMPTY_VALUE}</KeyValue>
            <KeyValue label="Time">{jamTiket(dipilih) ?? EMPTY_VALUE}</KeyValue>
            {dipilih.mode === "train" || dipilih.carriage ? <KeyValue label="Carriage">{dipilih.carriage ?? EMPTY_VALUE}</KeyValue> : null}
            <KeyValue label="Seat">{dipilih.seat ?? EMPTY_VALUE}</KeyValue>
            <KeyValue label="Booking code">{dipilih.booking_code ?? EMPTY_VALUE}</KeyValue>
          </dl>
        </DetailSection>
      </PaneBody>
      <PaneFooter>
        <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapus(dipilih)}>Delete</Button>
        <Button variant="outlined" size="sm" onClick={() => setUbah(dipilih)}>Edit</Button>
      </PaneFooter>
    </Pane>
  ) : null;

  return (
    <>
      <ListDetail list={daftar} detail={detail} />

      {/* key: ganti arah memulai pilihan dari awal; pilihan arah lain tidak boleh terbawa. */}
      <PilihPeserta
        key={arahBaru}
        open={baru}
        onClose={() => { tutupBaru(); setArahBaru("outbound"); }}
        title="Add ticket"
        description="Choose the direction and one participant, then fill in the ticket."
        peserta={data.participants}
        utama={(orang) => !segmenAkhir.has(orang.id)}
        labelUtama={`Participants without ${kataArah} ticket.`}
        // Yang sudah punya tiket arah ini tetap bisa dipilih: tiket baru menjadi segmen berikutnya (transit).
        labelSemua="Also show participants who already have one (adds a transit segment)"
        labelHabis={`Every participant already has ${kataArah} ticket. Tick the box above to add a transit segment, or edit a ticket in the list.`}
        alasanTolak={(orang) => ((segmenAkhir.get(orang.id) ?? 0) >= SEGMEN_MAKS ? `Already has ${SEGMEN_MAKS} ${arahBaru} segments` : null)}
        batas={1}
        tombol="Next"
        busy={busy}
        onSubmit={async ([id]) => {
          const segmen = (segmenAkhir.get(id ?? "") ?? 0) + 1;
          if (!id || segmen > SEGMEN_MAKS) return false;
          setTiketBaru({ participant_id: id, direction: arahBaru, segment: segmen });
          return true;
        }}
      >
        <SelectField label="Direction" value={arahBaru} onChange={(event) => setArahBaru(event.target.value as ArahKereta)}>
          <option value="outbound">{LABEL_ARAH.outbound}</option>
          <option value="return">{LABEL_ARAH.return}</option>
        </SelectField>
      </PilihPeserta>

      <FormKereta
        tiket={ubah}
        baru={tiketBaru}
        nama={(() => { const id = ubah?.participant_id ?? tiketBaru?.participant_id; return id ? orangById.get(id)?.name ?? "" : ""; })()}
        busy={busy}
        onClose={() => { setUbah(null); setTiketBaru(null); }}
        simpan={async (nilai) => {
          if (ubah) return Boolean(await kirim("/api/admin/logistik/data/kereta", "PATCH", { id: ubah.id, ...nilai }));
          if (!tiketBaru) return false;
          const hasil = await kirim("/api/admin/logistik/data/kereta", "POST", { ...tiketBaru, ...nilai }) as { id?: number } | null;
          // Tiket baru langsung terbuka di panel detail supaya terlihat apa yang dilihat peserta.
          if (hasil && typeof hasil.id === "number") setPilih(hasil.id);
          return Boolean(hasil);
        }}
      />

      <Dialog
        open={hapus !== null}
        onClose={() => setHapus(null)}
        dismissible={!busy}
        tone="danger"
        title={`Delete ${hapus ? `${LABEL_ARAH[hapus.direction].toLowerCase()} ${LABEL_MODA[hapus.mode].toLowerCase()}` : ""} ticket?`}
        description={`${hapus ? orangById.get(hapus.participant_id)?.name ?? "This participant" : ""} will no longer see this ticket in the participant area. Importing the ticket list again brings it back.`}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setHapus(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={busy} onClick={async () => {
              const target = hapus;
              setHapus(null);
              if (target && await kirim(`/api/admin/logistik/data/kereta?id=${target.id}`, "DELETE")) setPilih(null);
            }}>Delete ticket</Button>
          </>
        }
      />
    </>
  );
}

type NilaiKereta = Pick<TiketKereta, "mode" | "segment" | "train_name" | "travel_class" | "origin" | "destination" | "depart_date" | "depart_time" | "arrive_time" | "carriage" | "seat" | "booking_code">;

function FormKereta({ tiket, baru, nama, busy, onClose, simpan }: {
  /** Tiket yang diubah. Dialog tertutup bila ini dan `baru` sama-sama null. */
  tiket: TiketKereta | null;
  /** Tiket baru: peserta dan arah yang dipilih di langkah sebelumnya. */
  baru: TiketBaru | null;
  nama: string;
  busy: boolean;
  onClose: () => void;
  simpan: (nilai: NilaiKereta) => Promise<boolean>;
}) {
  const arah = tiket?.direction ?? baru?.direction ?? null;
  const awal = {
    mode: tiket?.mode ?? "train" as ModaTiket, segment: String(tiket?.segment ?? baru?.segment ?? 1),
    train_name: tiket?.train_name ?? "", travel_class: tiket?.travel_class ?? "", origin: tiket?.origin ?? "", destination: tiket?.destination ?? "",
    depart_date: tiket?.depart_date ?? "", depart_time: tiket?.depart_time ?? "", arrive_time: tiket?.arrive_time ?? "",
    carriage: tiket?.carriage ?? "", seat: tiket?.seat ?? "", booking_code: tiket?.booking_code ?? "",
  };
  const [draf, setDraf] = useState<typeof awal | null>(null);
  const nilai = draf ?? awal;
  function tutup() { setDraf(null); onClose(); }
  const segmen = Number(nilai.segment);
  const sah = Boolean(nilai.train_name.trim()) && Number.isInteger(segmen) && segmen >= 1 && segmen <= SEGMEN_MAKS;
  const isi = (kunci: Exclude<keyof typeof awal, "mode">) => ({ value: nilai[kunci], onChange: (event: { target: { value: string } }) => setDraf({ ...nilai, [kunci]: event.target.value }) });
  const moda = nilai.mode;
  const IkonModa = IKON_MODA[moda];

  async function kirimForm() {
    if (!arah || !sah) return;
    const rapi = (teks: string) => teks.trim() || null;
    const ok = await simpan({
      mode: moda, segment: segmen,
      // Gerbong hanya untuk kereta: pindah moda tidak meninggalkan gerbong lama.
      train_name: nilai.train_name.trim(), travel_class: rapi(nilai.travel_class), origin: rapi(nilai.origin), destination: rapi(nilai.destination),
      depart_date: nilai.depart_date || null, depart_time: nilai.depart_time.slice(0, 5) || null, arrive_time: nilai.arrive_time.slice(0, 5) || null,
      carriage: moda === "train" ? rapi(nilai.carriage) : null, seat: rapi(nilai.seat), booking_code: rapi(nilai.booking_code),
    });
    if (ok) tutup();
  }

  return (
    <Dialog
      open={arah !== null}
      onClose={tutup}
      dismissible={!busy}
      title={arah ? `${tiket ? "Edit" : "Add"} ${LABEL_ARAH[arah].toLowerCase()} ticket` : ""}
      description={nama || undefined}
      icon={<IkonModa size={20} />}
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Cancel</Button>
          <Button simpan type="submit" form="form-kereta" loading={busy} disabled={!sah}>Save ticket</Button>
        </>
      }
    >
      <form id="form-kereta" className="grid grid-cols-2 gap-4" onSubmit={(event) => { event.preventDefault(); void kirimForm(); }}>
        <SelectField label="Mode" value={moda} onChange={(event) => setDraf({ ...nilai, mode: event.target.value as ModaTiket })}>
          {MODA_TIKET.map((m) => <option key={m} value={m}>{LABEL_MODA[m]}</option>)}
        </SelectField>
        <TextField label="Segment" type="number" min={1} max={SEGMEN_MAKS} inputMode="numeric" {...isi("segment")} hint="2 or more for a transit" />
        <TextField label={LABEL_MODA[moda]} placeholder={CONTOH[moda].nama} autoFocus maxLength={80} {...isi("train_name")} className="max-sm:col-span-2" />
        <TextField label="Class" optional placeholder={moda === "flight" ? "e.g. Economy" : "e.g. Executive"} maxLength={40} {...isi("travel_class")} className="max-sm:col-span-2" />
        <TextField label="From" optional placeholder={CONTOH[moda].dari} maxLength={80} {...isi("origin")} className="max-sm:col-span-2" />
        <TextField label="To" optional placeholder={CONTOH[moda].ke} maxLength={80} {...isi("destination")} className="max-sm:col-span-2" />
        <TextField label="Date" optional type="date" {...isi("depart_date")} className="col-span-2" />
        <TextField label="Departs" optional type="time" {...isi("depart_time")} />
        <TextField label="Arrives" optional type="time" {...isi("arrive_time")} />
        {moda === "train" ? <TextField label="Carriage" optional placeholder="e.g. EKS 3" maxLength={20} {...isi("carriage")} /> : null}
        <TextField label="Seat" optional placeholder="e.g. 12A" maxLength={20} {...isi("seat")} className={moda === "train" ? undefined : "col-span-2"} />
        <TextField label="Booking code" optional maxLength={40} {...isi("booking_code")} className="col-span-2" />
      </form>
    </Dialog>
  );
}
