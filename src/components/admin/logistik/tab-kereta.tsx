"use client";

import { Train, Warning } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import {
  Banner, Button, DetailSection, Dialog, EmptyState, KeyValue, ListDetail, Pane, PaneBody, PaneFooter, PaneHeader, SelectField, TextField, EMPTY_VALUE,
} from "@/components/m3";
import { LABEL_ARAH } from "@/lib/logistik/impor";
import type { ArahKereta, TiketKereta } from "@/lib/logistik/types";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import { KepalaDetail, KepalaKolom, KolomCari, PilihPeserta, type TabProps } from "./bersama";

/**
 * Tab Trains: tiket kereta tiap peserta, satu baris per orang per arah
 * (Outbound, Return).
 *
 * Tiket biasanya datang dari daftar agen atau KAI lewat Import from Excel;
 * Add ticket menambah satu tiket (pilih peserta dan arah, lalu isi tiketnya)
 * untuk peserta susulan atau pembetulan cepat. Peserta melihat
 * tiketnya di Dashboard saya bila "Kamar dan bus" dinyalakan di Area peserta.
 */

/** "Fri 6 Nov 2026" dari YYYY-MM-DD, tanpa zona: tanggal yang tertulis di tiket. */
export function tanggalTiket(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

const kursiTiket = (tiket: TiketKereta) => [tiket.carriage, tiket.seat].filter(Boolean).join(" / ") || null;
const jamTiket = (tiket: TiketKereta) => [tiket.depart_time, tiket.arrive_time].filter(Boolean).join("–") || null;

/** Tiket yang sedang ditambah: peserta dan arah sudah dipilih, isi tiket belum. */
type TiketBaru = { participant_id: string; direction: ArahKereta };

export function TabKereta({ data, kirim, busy, baru, tutupBaru }: TabProps) {
  const [pilih, setPilih] = useState<number | null>(null);
  const [arahBaru, setArahBaru] = useState<ArahKereta>("outbound");
  const [tiketBaru, setTiketBaru] = useState<TiketBaru | null>(null);
  const [cari, setCari] = useState("");
  const [ubah, setUbah] = useState<TiketKereta | null>(null);
  const [hapus, setHapus] = useState<TiketKereta | null>(null);

  const orangById = useMemo(() => new Map(data.participants.map((orang) => [orang.id, orang])), [data.participants]);
  // Tiket milik peserta yang dihapus di sumber tetap tersimpan, tetapi tidak
  // ditampilkan: halaman lain di Logistik juga hanya menghitung peserta aktif.
  const tiket = useMemo(() => data.trains
    .filter((t) => orangById.has(t.participant_id))
    .sort((a, b) => orangById.get(a.participant_id)!.name.localeCompare(orangById.get(b.participant_id)!.name, "en-GB")
      || a.participant_id.localeCompare(b.participant_id)
      || (a.direction === b.direction ? 0 : a.direction === "outbound" ? -1 : 1)), [data.trains, orangById]);
  const kata = cari.trim().toLowerCase();
  const tampil = kata
    ? tiket.filter((t) => {
        const orang = orangById.get(t.participant_id)!;
        return [orang.name, orang.company, t.train_name, t.booking_code, kursiTiket(t)].some((isi) => (isi ?? "").toLowerCase().includes(kata)) || orang.qr_code.toLowerCase() === kata;
      })
    : tiket;
  const punyaTiket = new Set(tiket.map((t) => t.participant_id)).size;
  const sudahPunya = useMemo(() => new Set(tiket.filter((t) => t.direction === arahBaru).map((t) => t.participant_id)), [tiket, arahBaru]);

  if (!data.trains_ready) {
    return (
      <Pane aria-label="Train tickets">
        <PaneBody>
          <div className="p-4">
            <Banner tone="warning" icon={<Warning size={18} />}>
              Train tickets need a database update first. Ask your Tally administrator to run the train tickets migration, then reload this page.
            </Banner>
          </div>
        </PaneBody>
      </Pane>
    );
  }

  const daftar = (
    <Pane aria-label="Train tickets">
      {tiket.length > 12 ? (
        <PaneHeader className="px-3 py-2.5">
          <KolomCari label="Search tickets" placeholder="Search name, train, seat or booking code" value={cari} onChange={setCari} />
        </PaneHeader>
      ) : null}
      <PaneBody>
        {tiket.length === 0 ? (
          <EmptyState
            plain
            icon={<Train size={40} />}
            title="No train tickets yet"
            description="Use Import from Excel at the top right for the whole list (one row per person per direction), or Add ticket for one person. Participants see their tickets once Room and vehicle is on in the Participant area."
          />
        ) : tampil.length === 0 ? (
          <p className="px-4 py-6 text-center text-body-medium text-on-surface-variant">No tickets match that search.</p>
        ) : (
          <>
            <KepalaKolom kolom={[["Participant", "min-w-0 flex-1"], ["Direction", "w-20"], ["Carriage / seat", "w-28 text-right"]]} />
            {tampil.map((t) => {
              const orang = orangById.get(t.participant_id)!;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={pilih === t.id}
                  onClick={() => setPilih(t.id)}
                  className={cx("flex w-full items-center gap-3 border-b border-outline-variant px-4 py-2.5 text-left text-body-medium",
                    pilih === t.id ? "bg-accent-soft" : "hover:bg-primary-soft")}
                >
                  {/* Kereta dan tanggal di baris kedua: panel detail yang terbuka menyisakan daftar selebar ±500px. */}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-on-surface">{orang.name}</span>
                    <span className="block truncate text-on-surface-variant">{[t.train_name, tanggalTiket(t.depart_date)].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="w-20 shrink-0 text-on-surface-variant">{LABEL_ARAH[t.direction]}</span>
                  <span className="w-28 shrink-0 text-right tabular-nums text-on-surface [overflow-wrap:anywhere]">{kursiTiket(t) ?? EMPTY_VALUE}</span>
                </button>
              );
            })}
          </>
        )}
      </PaneBody>
      {tiket.length > 0 ? (
        <PaneFooter note={`${plural(tiket.length, "ticket")} for ${punyaTiket.toLocaleString("en-GB")} of ${plural(data.participants.length, "participant")}.`} />
      ) : null}
    </Pane>
  );

  const dipilih = pilih !== null ? tiket.find((t) => t.id === pilih) ?? null : null;
  const pemilik = dipilih ? orangById.get(dipilih.participant_id) ?? null : null;
  const detail = dipilih && pemilik ? (
    <Pane as="aside" aria-label={`${pemilik.name} ${LABEL_ARAH[dipilih.direction].toLowerCase()} ticket`}>
      <KepalaDetail nama={pemilik.name} sub={[LABEL_ARAH[dipilih.direction], pemilik.company].filter(Boolean).join(" · ")} onClose={() => setPilih(null)} />
      <PaneBody>
        <DetailSection title="What the participant sees">
          <dl className="flex flex-col gap-2">
            <KeyValue label="Train">{dipilih.train_name}</KeyValue>
            <KeyValue label="Class">{dipilih.travel_class ?? EMPTY_VALUE}</KeyValue>
            <KeyValue label="Route">{[dipilih.origin, dipilih.destination].filter(Boolean).join(" → ") || EMPTY_VALUE}</KeyValue>
            <KeyValue label="Date">{tanggalTiket(dipilih.depart_date) ?? EMPTY_VALUE}</KeyValue>
            <KeyValue label="Time">{jamTiket(dipilih) ?? EMPTY_VALUE}</KeyValue>
            <KeyValue label="Carriage">{dipilih.carriage ?? EMPTY_VALUE}</KeyValue>
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
        title="Add train ticket"
        description="Choose the direction and one participant, then fill in the ticket."
        peserta={data.participants}
        utama={(orang) => !sudahPunya.has(orang.id)}
        labelUtama={`Participants without ${arahBaru === "outbound" ? "an outbound" : "a return"} ticket.`}
        labelSemua="Also show participants who already have this ticket"
        labelHabis={`Every participant already has ${arahBaru === "outbound" ? "an outbound" : "a return"} ticket. Edit a ticket in the list instead.`}
        alasanTolak={(orang) => (sudahPunya.has(orang.id) ? `Already has ${arahBaru === "outbound" ? "an outbound" : "a return"} ticket` : null)}
        batas={1}
        tombol="Next"
        busy={busy}
        onSubmit={async ([id]) => {
          if (!id || sudahPunya.has(id)) return false;
          setTiketBaru({ participant_id: id, direction: arahBaru });
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
        title={`Delete ${hapus ? LABEL_ARAH[hapus.direction].toLowerCase() : ""} ticket?`}
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

type NilaiKereta = Pick<TiketKereta, "train_name" | "travel_class" | "origin" | "destination" | "depart_date" | "depart_time" | "arrive_time" | "carriage" | "seat" | "booking_code">;

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
    train_name: tiket?.train_name ?? "", travel_class: tiket?.travel_class ?? "", origin: tiket?.origin ?? "", destination: tiket?.destination ?? "",
    depart_date: tiket?.depart_date ?? "", depart_time: tiket?.depart_time ?? "", arrive_time: tiket?.arrive_time ?? "",
    carriage: tiket?.carriage ?? "", seat: tiket?.seat ?? "", booking_code: tiket?.booking_code ?? "",
  };
  const [draf, setDraf] = useState<typeof awal | null>(null);
  const nilai = draf ?? awal;
  function tutup() { setDraf(null); onClose(); }
  const sah = Boolean(nilai.train_name.trim());
  const isi = (kunci: keyof typeof awal) => ({ value: nilai[kunci], onChange: (event: { target: { value: string } }) => setDraf({ ...nilai, [kunci]: event.target.value }) });

  async function kirimForm() {
    if (!arah || !sah) return;
    const rapi = (teks: string) => teks.trim() || null;
    const ok = await simpan({
      train_name: nilai.train_name.trim(), travel_class: rapi(nilai.travel_class), origin: rapi(nilai.origin), destination: rapi(nilai.destination),
      depart_date: nilai.depart_date || null, depart_time: nilai.depart_time.slice(0, 5) || null, arrive_time: nilai.arrive_time.slice(0, 5) || null,
      carriage: rapi(nilai.carriage), seat: rapi(nilai.seat), booking_code: rapi(nilai.booking_code),
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
      icon={<Train size={20} />}
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Cancel</Button>
          <Button simpan type="submit" form="form-kereta" loading={busy} disabled={!sah}>Save ticket</Button>
        </>
      }
    >
      <form id="form-kereta" className="grid grid-cols-2 gap-4" onSubmit={(event) => { event.preventDefault(); void kirimForm(); }}>
        <TextField label="Train" placeholder="e.g. Argo Lawu 8" autoFocus maxLength={80} {...isi("train_name")} className="max-sm:col-span-2" />
        <TextField label="Class" optional placeholder="e.g. Executive" maxLength={40} {...isi("travel_class")} className="max-sm:col-span-2" />
        <TextField label="From" optional placeholder="e.g. Gambir" maxLength={80} {...isi("origin")} className="max-sm:col-span-2" />
        <TextField label="To" optional placeholder="e.g. Yogyakarta" maxLength={80} {...isi("destination")} className="max-sm:col-span-2" />
        <TextField label="Date" optional type="date" {...isi("depart_date")} className="col-span-2" />
        <TextField label="Departs" optional type="time" {...isi("depart_time")} />
        <TextField label="Arrives" optional type="time" {...isi("arrive_time")} />
        <TextField label="Carriage" optional placeholder="e.g. EKS 3" maxLength={20} {...isi("carriage")} />
        <TextField label="Seat" optional placeholder="e.g. 12A" maxLength={20} {...isi("seat")} />
        <TextField label="Booking code" optional maxLength={40} {...isi("booking_code")} className="col-span-2" />
      </form>
    </Dialog>
  );
}
