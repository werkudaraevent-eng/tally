"use client";

import { ArrowCounterClockwise, Bus as IkonBus, CalendarDots, SignOut, Warning } from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Banner, Button, DetailSection, Dialog, EmptyState, IconButton, KeyValue, ListDetail, Pane, PaneBody, PaneFooter,
  PaneHeader, SelectField, StatusChip, Switch, TextField, EMPTY_VALUE,
} from "@/components/m3";
import { formatEventDateTime } from "@/lib/datetime";
import type { Agenda, Bus, LogistikPeserta } from "@/lib/logistik/types";
import { cx } from "@/lib/m3/cx";
import { useEventTimeZone } from "@/lib/use-event-timezone";
import {
  angkaAtauNull, BarisOrang, dariInputWaktu, keInputWaktu, KepalaDetail, KepalaKolom, KolomCari, PilihPeserta, type TabProps,
} from "./bersama";

/**
 * Tab Bus, dengan dua bagian: Daftar bus dan Agenda.
 *
 * Model yang dipegang panitia (keputusan 30 Sep 2026): tiap peserta punya
 * SATU bus bawaan, dan agenda (berangkat ke venue, gala dinner, pulang)
 * memakainya kecuali diganti untuk orang tertentu. Agenda yang tidak mengikuti
 * bus bawaan disusun ulang seluruhnya: hanya pengganti yang berlaku.
 *
 * Daftar bus menjawab "siapa naik bus ini biasanya", bagian Agenda menjawab
 * "siapa naik bus apa di perjalanan ini". Angka isi per agenda datang dari
 * `transport_overview`, bukan dihitung ulang di sini, supaya layar dan
 * pemeriksa kapasitas di database tidak pernah berbeda pendapat.
 */

function usePetaBus(data: TabProps["data"]) {
  return useMemo(() => {
    const orangById = new Map(data.participants.map((orang) => [orang.id, orang]));
    const busById = new Map(data.vehicles.map((bus) => [bus.id, bus]));
    const bawaan = new Map<string, number>();
    const pengganti = new Map<number, Map<string, number | null>>();
    for (const baris of data.transport) {
      if (!orangById.has(baris.participant_id)) continue;
      if (baris.trip_id === null) {
        if (baris.vehicle_id !== null) bawaan.set(baris.participant_id, baris.vehicle_id);
      } else {
        if (!pengganti.has(baris.trip_id)) pengganti.set(baris.trip_id, new Map());
        pengganti.get(baris.trip_id)!.set(baris.participant_id, baris.vehicle_id);
      }
    }
    /** Bus yang dinaiki seseorang di satu agenda. Aturannya sama dengan `transport_effective`. */
    const busDi = (agenda: Agenda, id: string): number | null => {
      const ganti = pengganti.get(agenda.id);
      if (ganti?.has(id)) return ganti.get(id) ?? null;
      return agenda.follows_default ? bawaan.get(id) ?? null : null;
    };
    return { orangById, busById, bawaan, pengganti, busDi };
  }, [data.participants, data.vehicles, data.transport]);
}

const isiTeks = (isi: number, kapasitas: number | null) => (kapasitas === null ? String(isi) : `${isi}/${kapasitas}`);

/* ================================================================ Bus */

export function TabBus({ data, kirim, busy, baru, tutupBaru, atas }: TabProps & { atas?: ReactNode }) {
  const { orangById, busById, bawaan } = usePetaBus(data);
  const [pilih, setPilih] = useState<number | null>(null);
  const [ubah, setUbah] = useState<Bus | null>(null);
  const [tambah, setTambah] = useState(false);
  const [hapus, setHapus] = useState<Bus | null>(null);
  const [cari, setCari] = useState("");

  const penumpang = useMemo(() => {
    const peta = new Map<number, LogistikPeserta[]>();
    for (const [id, busId] of bawaan) {
      const orang = orangById.get(id);
      if (orang) peta.set(busId, [...(peta.get(busId) ?? []), orang]);
    }
    return peta;
  }, [bawaan, orangById]);
  const tanpaBus = data.participants.length - bawaan.size;

  const lebihDi = (bus: Bus) => data.overview.filter((baris) => baris.vehicle_id === bus.id && baris.over_capacity).length;

  const daftar = (
    <Pane aria-label="Daftar bus">
      {atas ? <PaneHeader className="px-3 py-2.5">{atas}</PaneHeader> : null}
      <PaneBody>
        {data.vehicles.length === 0 ? (
          <EmptyState
            plain
            icon={<IkonBus size={40} />}
            title="Belum ada bus"
            description="Mulai dari Bus baru di kanan atas. Beri tiap bus nama yang dibaca peserta, mis. Bus 1, lalu tempatkan penumpang bawaannya."
          />
        ) : (
          <>
            <KepalaKolom kolom={[["Bus", "min-w-0 flex-1"], ["Pelat", "w-28 max-sm:hidden"], ["Penumpang bawaan", "w-36 text-right"]]} />
            {data.vehicles.map((bus) => {
              const isi = penumpang.get(bus.id)?.length ?? 0;
              const lebih = (bus.capacity !== null && isi > bus.capacity) || lebihDi(bus) > 0;
              return (
                <button
                  key={bus.id}
                  type="button"
                  aria-pressed={pilih === bus.id}
                  onClick={() => setPilih(bus.id)}
                  className={cx("flex w-full items-center gap-3 border-b border-outline-variant px-4 py-2.5 text-left text-body-medium",
                    pilih === bus.id ? "bg-accent-soft" : "hover:bg-primary-soft")}
                >
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <span className="text-on-surface">{bus.code}</span>
                    {lebih ? <StatusChip dot tone="error">Melebihi kapasitas</StatusChip> : null}
                  </span>
                  <span className="w-28 shrink-0 truncate text-on-surface-variant max-sm:hidden">{bus.plate_number ?? EMPTY_VALUE}</span>
                  <span className={cx("w-36 shrink-0 text-right tabular-nums", lebih ? "text-error" : "text-on-surface")}>{isiTeks(isi, bus.capacity)}</span>
                </button>
              );
            })}
          </>
        )}
      </PaneBody>
      {data.vehicles.length > 0 ? (
        <PaneFooter note={tanpaBus === 0 ? "Semua peserta sudah punya bus bawaan." : `${tanpaBus} dari ${data.participants.length} peserta belum punya bus bawaan.`} />
      ) : null}
    </Pane>
  );

  const bus = pilih !== null ? busById.get(pilih) ?? null : null;
  const isiBus = bus ? penumpang.get(bus.id) ?? [] : [];
  const kata = cari.trim().toLowerCase();
  const isiTampil = kata ? isiBus.filter((orang) => orang.name.toLowerCase().includes(kata) || (orang.company ?? "").toLowerCase().includes(kata)) : isiBus;
  const sisa = bus?.capacity != null ? bus.capacity - isiBus.length : undefined;

  const detail = bus ? (
    <Pane as="aside" aria-label={`Detail ${bus.code}`}>
      <KepalaDetail
        nama={bus.code}
        chip={lebihDi(bus) > 0 ? { tone: "error", teks: `Melebihi kapasitas di ${lebihDi(bus)} agenda` } : null}
        sub={[bus.plate_number, bus.capacity === null ? "Kapasitas tidak dibatasi" : `${bus.capacity} kursi`].filter(Boolean).join(" · ")}
        angka={isiTeks(isiBus.length, bus.capacity)}
        keterangan="penumpang bawaan"
        onClose={() => setPilih(null)}
      />
      <PaneBody>
        <DetailSection title="Di tiap agenda">
          {data.trips.length === 0 ? (
            <p className="text-body-medium text-on-surface-variant">Belum ada agenda. Buat di bagian Agenda supaya peserta melihat jadwal busnya.</p>
          ) : (
            <ul className="flex flex-col">
              {data.trips.map((agenda) => {
                const baris = data.overview.find((o) => o.trip_id === agenda.id && o.vehicle_id === bus.id);
                const isi = baris?.load ?? 0;
                return (
                  <li key={agenda.id} className="flex items-center gap-3 py-1.5 text-body-medium">
                    <span className="min-w-0 flex-1 truncate text-on-surface">{agenda.name}</span>
                    {baris?.over_capacity ? <StatusChip dot tone="error">Melebihi</StatusChip> : null}
                    <span className={cx("shrink-0 tabular-nums", baris?.over_capacity ? "text-error" : "text-on-surface-variant")}>{isiTeks(isi, bus.capacity)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </DetailSection>
        {bus.crew_contact ? (
          <DetailSection title="Kru">
            <p className="whitespace-pre-line text-body-medium text-on-surface">{bus.crew_contact}</p>
            <p className="text-body-small text-on-surface-variant">Tidak pernah tampil ke peserta.</p>
          </DetailSection>
        ) : null}
        <DetailSection title="Penumpang bawaan">
          {isiBus.length > 12 ? <KolomCari label="Cari penumpang" placeholder="Cari nama atau perusahaan" value={cari} onChange={setCari} /> : null}
          {isiBus.length === 0 ? (
            <p className="text-body-medium text-on-surface-variant">Belum ada penumpang. Tambahkan lewat tombol di bawah.</p>
          ) : (
            <ul className="flex flex-col">
              {isiTampil.slice(0, 300).map((orang) => (
                <BarisOrang
                  key={orang.id}
                  orang={orang}
                  aksi={
                    <IconButton simpan size="sm" label={`Lepas ${orang.name} dari ${bus.code}`} disabled={busy}
                      onClick={() => void kirim("/api/admin/logistik/penumpang", "POST", { trip_id: null, vehicle_id: null, participant_ids: [orang.id] })}>
                      <SignOut size={16} />
                    </IconButton>
                  }
                />
              ))}
            </ul>
          )}
        </DetailSection>
      </PaneBody>
      <PaneFooter note={sisa === undefined ? undefined : sisa > 0 ? `${sisa} kursi tersisa` : "Bus penuh"}>
        {isiBus.length === 0 ? (
          <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapus(bus)}>Hapus</Button>
        ) : null}
        <Button variant="outlined" size="sm" onClick={() => setUbah(bus)}>Ubah</Button>
        <Button simpan size="sm" disabled={busy || (sisa !== undefined && sisa <= 0)} onClick={() => setTambah(true)}>Tambah penumpang</Button>
      </PaneFooter>
    </Pane>
  ) : null;

  return (
    <>
      <ListDetail list={daftar} detail={detail} />

      {bus ? (
        <PilihPeserta
          open={tambah}
          onClose={() => setTambah(false)}
          title={`Tambah penumpang ${bus.code}`}
          description="Bus bawaan dipakai di setiap agenda yang mengikutinya. Pengganti per agenda diatur di bagian Agenda."
          peserta={data.participants}
          utama={(orang) => !bawaan.has(orang.id)}
          labelUtama="Peserta yang belum punya bus bawaan."
          keterangan={(orang) => {
            const lama = bawaan.get(orang.id);
            return lama !== undefined ? `Sekarang ${busById.get(lama)?.code ?? "bus lain"}` : null;
          }}
          alasanTolak={(orang) => (bawaan.get(orang.id) === bus.id ? `Sudah di ${bus.code}` : null)}
          batas={sisa !== undefined ? Math.max(sisa, 0) : undefined}
          tombol={`Tempatkan di ${bus.code}`}
          busy={busy}
          onSubmit={async (ids) => Boolean(await kirim("/api/admin/logistik/penumpang", "POST", { trip_id: null, vehicle_id: bus.id, participant_ids: ids }))}
        />
      ) : null}

      <FormBus
        bus={baru ? { id: 0, code: "", capacity: null, plate_number: null, crew_contact: null, sort_order: 0 } : ubah}
        busy={busy}
        onClose={() => { setUbah(null); tutupBaru(); }}
        simpan={async (nilai, id) => {
          const hasil = await kirim("/api/admin/logistik/data/bus", id ? "PATCH" : "POST", id ? { id, ...nilai } : { ...nilai, sort_order: data.vehicles.length });
          if (hasil && !id) setPilih((hasil as Bus).id);
          return Boolean(hasil);
        }}
      />

      <Dialog
        open={hapus !== null}
        onClose={() => setHapus(null)}
        dismissible={!busy}
        tone="danger"
        title={`Hapus ${hapus?.code ?? ""}?`}
        description="Bus ini tidak punya penumpang bawaan. Bila masih dipakai sebagai pengganti di suatu agenda, penghapusan akan ditolak. Tidak bisa dibatalkan."
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setHapus(null)}>Batal</Button>
            <Button simpan variant="danger" loading={busy} onClick={async () => {
              const target = hapus;
              setHapus(null);
              if (target && await kirim(`/api/admin/logistik/data/bus?id=${target.id}`, "DELETE")) setPilih(null);
            }}>Hapus bus</Button>
          </>
        }
      />
    </>
  );
}

type NilaiBus = { code: string; capacity: number | null; plate_number: string | null; crew_contact: string | null };

function FormBus({ bus, busy, onClose, simpan }: {
  /** `id` 0 = bus baru. Null = dialog tertutup. */
  bus: Bus | null;
  busy: boolean;
  onClose: () => void;
  simpan: (nilai: NilaiBus, id?: number) => Promise<boolean>;
}) {
  const awal = { code: bus?.code ?? "", capacity: bus?.capacity != null ? String(bus.capacity) : "", plate_number: bus?.plate_number ?? "", crew_contact: bus?.crew_contact ?? "" };
  const [draf, setDraf] = useState<typeof awal | null>(null);
  const nilai = draf ?? awal;
  const ubah = (kolom: keyof typeof awal, isi: string) => setDraf({ ...nilai, [kolom]: isi });
  function tutup() { setDraf(null); onClose(); }

  const kapasitas = angkaAtauNull(nilai.capacity);
  const galatKapasitas = nilai.capacity.trim() && (kapasitas === null || kapasitas < 1 || kapasitas > 200) ? "Isi 1 sampai 200, atau kosongkan." : undefined;
  const sah = Boolean(nilai.code.trim()) && !galatKapasitas;
  const lama = bus && bus.id > 0 ? bus : null;

  async function kirimForm() {
    if (!sah) return;
    const ok = await simpan({
      code: nilai.code.trim(), capacity: kapasitas, plate_number: nilai.plate_number.trim() || null, crew_contact: nilai.crew_contact.trim() || null,
    }, lama?.id);
    if (ok) tutup();
  }

  return (
    <Dialog
      open={bus !== null}
      onClose={tutup}
      dismissible={!busy}
      title={lama ? `Ubah ${lama.code}` : "Bus baru"}
      icon={<IkonBus size={20} />}
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Batal</Button>
          <Button simpan type="submit" form="form-bus" loading={busy} disabled={!sah}>{lama ? "Simpan bus" : "Tambah bus"}</Button>
        </>
      }
    >
      <form id="form-bus" className="grid grid-cols-2 gap-4" onSubmit={(event) => { event.preventDefault(); void kirimForm(); }}>
        <TextField label="Nama bus" placeholder="mis. Bus 1" hint="Nama ini yang dibaca peserta." autoFocus value={nilai.code} onChange={(event) => ubah("code", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Kapasitas" optional type="number" inputMode="numeric" min={1} max={200} value={nilai.capacity} error={galatKapasitas} hint="Kosong berarti tidak dibatasi." onChange={(event) => ubah("capacity", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Pelat nomor" optional value={nilai.plate_number} onChange={(event) => ubah("plate_number", event.target.value)} className="col-span-2" />
        <TextField label="Kontak kru" optional placeholder="Nama dan nomor telepon" hint="Hanya untuk panitia." value={nilai.crew_contact} onChange={(event) => ubah("crew_contact", event.target.value)} className="col-span-2" />
      </form>
    </Dialog>
  );
}

/* ========================================================= Agenda bus */

export function TabAgenda({ data, kirim, busy, baru, tutupBaru, atas }: TabProps & { atas?: ReactNode }) {
  const { zone, abbr } = useEventTimeZone();
  const { orangById, busById, bawaan, pengganti, busDi } = usePetaBus(data);
  const [pilih, setPilih] = useState<number | null>(null);
  const [ubah, setUbah] = useState<Agenda | null>(null);
  const [ganti, setGanti] = useState(false);
  const [tujuan, setTujuan] = useState<string>("");
  const [hapus, setHapus] = useState<Agenda | null>(null);

  const agendaBaru: Agenda = { id: 0, name: "", depart_at: null, origin: null, destination: null, meeting_point: null, follows_default: true, sort_order: 0 };
  const muatan = (agenda: Agenda) => data.overview.filter((baris) => baris.trip_id === agenda.id);

  const daftar = (
    <Pane aria-label="Daftar agenda bus">
      {atas ? <PaneHeader className="px-3 py-2.5">{atas}</PaneHeader> : null}
      {data.trips.length > 0 && data.vehicles.length === 0 ? (
        <PaneHeader className="text-body-medium text-on-surface-variant">Belum ada bus. Tambahkan di bagian Daftar bus sebelum menempatkan peserta.</PaneHeader>
      ) : null}
      <PaneBody>
        {data.trips.length === 0 ? (
          <EmptyState
            plain
            icon={<CalendarDots size={40} />}
            title="Belum ada agenda bus"
            description="Satu agenda adalah satu perjalanan, mis. Hotel ke venue atau Gala dinner. Buat lewat Agenda baru di kanan atas; peserta melihat busnya di tiap agenda."
          />
        ) : (
          <>
            <KepalaKolom kolom={[["Agenda", "min-w-0 flex-1"], ["Berangkat", "w-36 max-sm:hidden"], ["Penumpang", "w-24 text-right"]]} />
            {data.trips.map((agenda) => {
              const isi = muatan(agenda);
              const total = isi.reduce((jumlah, baris) => jumlah + baris.load, 0);
              const lebih = isi.some((baris) => baris.over_capacity);
              return (
                <button
                  key={agenda.id}
                  type="button"
                  aria-pressed={pilih === agenda.id}
                  onClick={() => setPilih(agenda.id)}
                  className={cx("flex w-full items-center gap-3 border-b border-outline-variant px-4 py-2.5 text-left text-body-medium",
                    pilih === agenda.id ? "bg-accent-soft" : "hover:bg-primary-soft")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-on-surface">{agenda.name}</span>
                      {!agenda.follows_default ? <StatusChip tone="neutral">Disusun ulang</StatusChip> : null}
                      {lebih ? <StatusChip dot tone="error">Bus melebihi kapasitas</StatusChip> : null}
                    </span>
                    {agenda.origin || agenda.destination ? (
                      <span className="block truncate text-on-surface-variant">{[agenda.origin, agenda.destination].filter(Boolean).join(" ke ")}</span>
                    ) : null}
                  </span>
                  <span className="w-36 shrink-0 text-on-surface-variant max-sm:hidden">{agenda.depart_at ? formatEventDateTime(agenda.depart_at, zone) : EMPTY_VALUE}</span>
                  <span className="w-24 shrink-0 text-right tabular-nums text-on-surface">{total}</span>
                </button>
              );
            })}
          </>
        )}
      </PaneBody>
    </Pane>
  );

  const agenda = pilih !== null ? data.trips.find((t) => t.id === pilih) ?? null : null;
  const daftarGanti = agenda ? [...(pengganti.get(agenda.id) ?? new Map()).entries()]
    .map(([id, busId]) => ({ orang: orangById.get(id)!, busId }))
    .filter((baris) => baris.orang)
    .sort((a, b) => a.orang.name.localeCompare(b.orang.name, "id")) : [];

  const detail = agenda ? (() => {
    const isi = muatan(agenda);
    const total = isi.reduce((jumlah, baris) => jumlah + baris.load, 0);
    const lebih = isi.filter((baris) => baris.over_capacity);
    return (
      <Pane as="aside" aria-label={`Detail agenda ${agenda.name}`}>
        <KepalaDetail
          nama={agenda.name}
          sub={agenda.depart_at ? `Berangkat ${formatEventDateTime(agenda.depart_at, zone)} ${abbr}` : "Jam berangkat belum diisi"}
          angka={total}
          keterangan={`penumpang di ${isi.filter((baris) => baris.load > 0).length} bus`}
          onClose={() => setPilih(null)}
        />
        <PaneBody>
          {lebih.length > 0 ? (
            <div className="px-5 pt-4">
              <Banner tone="error" icon={<Warning size={18} />}>
                {lebih.map((baris) => busById.get(baris.vehicle_id)?.code).join(", ")} melebihi kapasitas di agenda ini. Pindahkan sebagian penumpang ke bus lain.
              </Banner>
            </div>
          ) : null}
          <DetailSection>
            <Switch simpan
              checked={agenda.follows_default}
              disabled={busy}
              onChange={(nilai) => void kirim("/api/admin/logistik/data/agenda", "PATCH", { id: agenda.id, follows_default: nilai })}
              label="Ikuti bus bawaan"
              description={agenda.follows_default
                ? "Peserta naik bus bawaannya, kecuali yang diganti di bawah."
                : "Disusun ulang: hanya peserta yang ditempatkan di bawah yang naik bus di agenda ini."}
            />
          </DetailSection>
          <DetailSection title="Isi bus">
            {data.vehicles.length === 0 ? (
              <p className="text-body-medium text-on-surface-variant">Belum ada bus. Tambahkan di bagian Daftar bus.</p>
            ) : (
              <ul className="flex flex-col">
                {isi.map((baris) => {
                  const bus = busById.get(baris.vehicle_id);
                  if (!bus) return null;
                  return (
                    <li key={baris.vehicle_id} className="flex items-center gap-3 py-1.5 text-body-medium">
                      <span className="min-w-0 flex-1 truncate text-on-surface">{bus.code}</span>
                      {baris.over_capacity ? <StatusChip dot tone="error">Melebihi</StatusChip> : null}
                      <span className={cx("shrink-0 tabular-nums", baris.over_capacity ? "text-error" : "text-on-surface-variant")}>{isiTeks(baris.load, bus.capacity)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </DetailSection>
          <DetailSection title={agenda.follows_default ? "Diganti di agenda ini" : "Penumpang agenda ini"}>
            {daftarGanti.length === 0 ? (
              <p className="text-body-medium text-on-surface-variant">
                {agenda.follows_default ? "Tidak ada. Semua peserta naik bus bawaannya." : "Belum ada. Tempatkan peserta lewat tombol di bawah."}
              </p>
            ) : (
              <ul className="flex flex-col">
                {daftarGanti.slice(0, 300).map(({ orang, busId }) => {
                  const asal = bawaan.get(orang.id);
                  const ket = busId === null ? "Tidak naik bus" : busById.get(busId)?.code ?? "Bus lain";
                  return (
                    <BarisOrang
                      key={orang.id}
                      orang={orang}
                      keterangan={agenda.follows_default && asal !== undefined ? `${ket}, biasanya ${busById.get(asal)?.code ?? "bus lain"}` : ket}
                      aksi={
                        <IconButton simpan size="sm" disabled={busy}
                          label={agenda.follows_default ? `Kembalikan ${orang.name} ke bus bawaan` : `Keluarkan ${orang.name} dari agenda ini`}
                          onClick={() => void kirim("/api/admin/logistik/penumpang", "DELETE", { trip_id: agenda.id, participant_ids: [orang.id] })}>
                          {agenda.follows_default ? <ArrowCounterClockwise size={16} /> : <SignOut size={16} />}
                        </IconButton>
                      }
                    />
                  );
                })}
              </ul>
            )}
          </DetailSection>
          <DetailSection title="Yang dilihat peserta">
            <dl className="flex flex-col gap-2">
              <KeyValue label="Dari">{agenda.origin ?? EMPTY_VALUE}</KeyValue>
              <KeyValue label="Ke">{agenda.destination ?? EMPTY_VALUE}</KeyValue>
              <KeyValue label="Titik kumpul">{agenda.meeting_point ?? EMPTY_VALUE}</KeyValue>
            </dl>
          </DetailSection>
        </PaneBody>
        <PaneFooter>
          <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapus(agenda)}>Hapus</Button>
          <Button variant="outlined" size="sm" onClick={() => setUbah(agenda)}>Ubah</Button>
          <Button simpan size="sm" disabled={busy || data.vehicles.length === 0} onClick={() => { setTujuan(String(data.vehicles[0]?.id ?? "")); setGanti(true); }}>
            {agenda.follows_default ? "Ganti bus peserta" : "Tempatkan peserta"}
          </Button>
        </PaneFooter>
      </Pane>
    );
  })() : null;

  const busTujuan = tujuan === "none" ? null : Number(tujuan) || null;

  return (
    <>
      <ListDetail list={daftar} detail={detail} />

      {agenda ? (
        <PilihPeserta
          open={ganti}
          onClose={() => setGanti(false)}
          title={agenda.follows_default ? `Ganti bus di ${agenda.name}` : `Tempatkan peserta di ${agenda.name}`}
          description="Hanya berlaku untuk agenda ini. Bus bawaan peserta tidak berubah."
          peserta={data.participants}
          utama={(orang) => !(pengganti.get(agenda.id)?.has(orang.id))}
          labelUtama={agenda.follows_default ? "Peserta yang belum diganti di agenda ini." : "Peserta yang belum ditempatkan di agenda ini."}
          keterangan={(orang) => {
            const sekarang = busDi(agenda, orang.id);
            return sekarang === null ? "Sekarang tidak naik bus" : `Sekarang ${busById.get(sekarang)?.code ?? "bus lain"}`;
          }}
          alasanTolak={(orang) => (pengganti.get(agenda.id)?.has(orang.id) && busDi(agenda, orang.id) === busTujuan ? "Sudah di sini" : null)}
          tombol="Simpan penempatan"
          busy={busy}
          onSubmit={async (ids) => Boolean(await kirim("/api/admin/logistik/penumpang", "POST", { trip_id: agenda.id, vehicle_id: busTujuan, participant_ids: ids }))}
        >
          <SelectField label="Naik bus" value={tujuan} onChange={(event) => setTujuan(event.target.value)}>
            {data.vehicles.map((bus) => <option key={bus.id} value={bus.id}>{bus.code}</option>)}
            <option value="none">Tidak naik bus di agenda ini</option>
          </SelectField>
        </PilihPeserta>
      ) : null}

      <FormAgenda
        agenda={baru ? agendaBaru : ubah}
        busy={busy}
        zone={zone}
        onClose={() => { setUbah(null); tutupBaru(); }}
        simpan={async (nilai, id) => {
          const hasil = await kirim("/api/admin/logistik/data/agenda", id ? "PATCH" : "POST", id ? { id, ...nilai } : { ...nilai, sort_order: data.trips.length });
          if (hasil && !id) setPilih((hasil as Agenda).id);
          return Boolean(hasil);
        }}
      />

      <Dialog
        open={hapus !== null}
        onClose={() => setHapus(null)}
        dismissible={!busy}
        tone="danger"
        title={`Hapus agenda ${hapus?.name ?? ""}?`}
        description={`${hapus ? pengganti.get(hapus.id)?.size ?? 0 : 0} penempatan khusus agenda ini ikut terhapus. Bus bawaan peserta tidak berubah. Tidak bisa dibatalkan.`}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setHapus(null)}>Batal</Button>
            <Button simpan variant="danger" loading={busy} onClick={async () => {
              const target = hapus;
              setHapus(null);
              if (target && await kirim(`/api/admin/logistik/data/agenda?id=${target.id}`, "DELETE")) setPilih(null);
            }}>Hapus agenda</Button>
          </>
        }
      />
    </>
  );
}

type NilaiAgenda = Omit<Agenda, "id" | "sort_order">;

function FormAgenda({ agenda, busy, zone, onClose, simpan }: {
  /** `id` 0 = agenda baru. Null = dialog tertutup. */
  agenda: Agenda | null;
  busy: boolean;
  zone: ReturnType<typeof useEventTimeZone>["zone"];
  onClose: () => void;
  simpan: (nilai: NilaiAgenda, id?: number) => Promise<boolean>;
}) {
  const awal = {
    name: agenda?.name ?? "", depart_at: keInputWaktu(agenda?.depart_at ?? null, zone), origin: agenda?.origin ?? "",
    destination: agenda?.destination ?? "", meeting_point: agenda?.meeting_point ?? "", follows_default: agenda?.follows_default ?? true,
  };
  const [draf, setDraf] = useState<typeof awal | null>(null);
  const nilai = draf ?? awal;
  function tutup() { setDraf(null); onClose(); }
  const lama = agenda && agenda.id > 0 ? agenda : null;
  const sah = Boolean(nilai.name.trim());

  async function kirimForm() {
    if (!sah) return;
    const ok = await simpan({
      name: nilai.name.trim(), depart_at: dariInputWaktu(nilai.depart_at, zone), origin: nilai.origin.trim() || null,
      destination: nilai.destination.trim() || null, meeting_point: nilai.meeting_point.trim() || null, follows_default: nilai.follows_default,
    }, lama?.id);
    if (ok) tutup();
  }

  return (
    <Dialog
      open={agenda !== null}
      onClose={tutup}
      dismissible={!busy}
      title={lama ? `Ubah ${lama.name}` : "Agenda baru"}
      icon={<CalendarDots size={20} />}
      description="Nama, jam, dan titik kumpul tampil di area peserta bersama nomor busnya."
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Batal</Button>
          <Button simpan type="submit" form="form-agenda" loading={busy} disabled={!sah}>{lama ? "Simpan agenda" : "Tambah agenda"}</Button>
        </>
      }
    >
      <form id="form-agenda" className="grid grid-cols-2 gap-4" onSubmit={(event) => { event.preventDefault(); void kirimForm(); }}>
        <TextField label="Nama agenda" placeholder="mis. Hotel ke venue" autoFocus value={nilai.name} onChange={(event) => setDraf({ ...nilai, name: event.target.value })} className="col-span-2" />
        <TextField label="Berangkat" optional type="datetime-local" value={nilai.depart_at} onChange={(event) => setDraf({ ...nilai, depart_at: event.target.value })} className="col-span-2" />
        <TextField label="Dari" optional value={nilai.origin} onChange={(event) => setDraf({ ...nilai, origin: event.target.value })} className="max-sm:col-span-2" />
        <TextField label="Ke" optional value={nilai.destination} onChange={(event) => setDraf({ ...nilai, destination: event.target.value })} className="max-sm:col-span-2" />
        <TextField label="Titik kumpul" optional placeholder="mis. Lobi utama" value={nilai.meeting_point} onChange={(event) => setDraf({ ...nilai, meeting_point: event.target.value })} className="col-span-2" />
        {!lama ? (
          <Switch
            className="col-span-2"
            checked={nilai.follows_default}
            onChange={(follows) => setDraf({ ...nilai, follows_default: follows })}
            label="Ikuti bus bawaan"
            description="Matikan untuk perjalanan yang disusun ulang, mis. pulang ke dua tujuan berbeda."
          />
        ) : null}
      </form>
    </Dialog>
  );
}
