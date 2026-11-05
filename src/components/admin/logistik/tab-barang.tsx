"use client";

import { Package, Warning } from "@phosphor-icons/react";
import { useState } from "react";
import {
  Banner, Button, ButtonLink, DetailSection, Dialog, EmptyState, ListDetail, Pane, PaneBody, PaneFooter, SelectField, StatusChip, TextField, EMPTY_VALUE,
} from "@/components/m3";
import type { Barang } from "@/lib/logistik/types";
import { cx } from "@/lib/m3/cx";
import { KepalaDetail, type TabProps } from "./bersama";
import { TabelLogistik, type KolomTabel } from "./tabel-logistik";

/**
 * Tab Barang: apa yang dibagikan ke peserta (kaos, goodie bag, ID card),
 * berapa per ukuran, dan berapa yang sudah diambil.
 *
 * Penyerahan dicatat petugas di layar pemindai, bukan di sini. Admin memilih
 * sesi mana yang memeriksa barang apa di halaman Kehadiran; tab ini hanya
 * menunjukkan pasangannya supaya barang yang lupa dipasang ke sesi mana pun
 * terlihat sebelum hari-H.
 *
 * Rekap ukuran dibaca dari data peserta SAAT INI, karena dipakai sebelum ada
 * yang mengambil: untuk pesanan ke vendor dan hitungan stok di meja.
 */
export function TabBarang({ data, kirim, busy, baru, tutupBaru }: TabProps) {
  const [pilih, setPilih] = useState<number | null>(null);
  const [ubah, setUbah] = useState<Barang | null>(null);
  const [hapus, setHapus] = useState<Barang | null>(null);

  const barangBaru: Barang = { id: 0, name: "", size_field_key: null, pickup_note: null, sort_order: 0 };
  const labelField = (kunci: string | null) => (kunci ? data.fields.find((field) => field.key === kunci)?.label ?? kunci : null);
  const rekap = (barang: Barang) => data.recap.filter((baris) => baris.item_id === barang.id);
  const jumlah = (barang: Barang) => rekap(barang).reduce(
    (total, baris) => ({ peserta: total.peserta + baris.participants, diambil: total.diambil + baris.picked_up }),
    { peserta: 0, diambil: 0 },
  );
  const sesi = (barang: Barang) => data.item_sessions.filter((baris) => baris.item_id === barang.id);

  const kolomBarang: KolomTabel<Barang>[] = [
    {
      key: "item", label: "Kit item", lebar: 200, kunci: true, saring: "teks",
      nilai: (barang) => [barang.name],
      sel: (barang) => <span className="block h-7 truncate font-medium leading-7 text-on-surface" title={barang.name}>{barang.name}</span>,
    },
    { key: "size", label: "Size from", lebar: 160, nilai: (barang) => [labelField(barang.size_field_key) ?? "No size"] },
    {
      key: "checked", label: "Checked at", lebar: 220,
      // Tanpa titik check-in tetap bernilai, supaya kolomnya (dan peringatannya) tidak ikut tersembunyi.
      nilai: (barang) => (sesi(barang).length ? sesi(barang).map((baris) => baris.session_name) : ["No check-in point"]),
      sel: (barang) => sesi(barang).length === 0
        ? <span className="flex h-7 items-center"><StatusChip dot tone="warning">No check-in point</StatusChip></span>
        : sesi(barang).map((baris) => <span key={baris.session_id} className="block h-7 truncate leading-7 text-on-surface">{baris.session_name}</span>),
    },
    { key: "participants", label: "Participants", lebar: 120, rata: "kanan", urut: "angka", nilai: (barang) => [String(jumlah(barang).peserta)], kunciUrut: (barang) => String(jumlah(barang).peserta).padStart(5, "0") },
    { key: "collected", label: "Collected", lebar: 112, rata: "kanan", urut: "angka", nilai: (barang) => [String(jumlah(barang).diambil)], kunciUrut: (barang) => String(jumlah(barang).diambil).padStart(5, "0") },
    { key: "left", label: "Not yet", lebar: 104, rata: "kanan", urut: "angka", nilai: (barang) => [String(jumlah(barang).peserta - jumlah(barang).diambil)], kunciUrut: (barang) => String(jumlah(barang).peserta - jumlah(barang).diambil).padStart(5, "0") },
    { key: "note", label: "Note for participants", lebar: 240, tersembunyi: true, saring: "teks", nilai: (barang) => (barang.pickup_note ? [barang.pickup_note] : []) },
  ];

  const daftar = (
    <TabelLogistik<Barang>
      label="Kit items"
      tabel="kit"
      baris={data.items}
      kunciBaris={(barang) => String(barang.id)}
      kolom={kolomBarang}
      urutAwal={null}
      cariLabel="Search kit items"
      cariPlaceholder="Search kit item or check-in point…"
      dipilih={pilih !== null ? String(pilih) : null}
      onPilih={(barang) => setPilih(barang.id)}
      labelBaris={(barang) => barang.name}
      namaFile="kit-items"
      kaki={() => (data.items.length > 0 ? "Who still has to collect an item: Participant list, one column per kit item." : null)}
      kosong={(
        <EmptyState
          plain
          icon={<Package size={40} />}
          title="No kit items yet"
          description="Add the kit items you hand out with Add kit item at the top right, such as T-shirts or goodie bags. Then choose the check-in point that checks them on the Check-in page."
        />
      )}
    />
  );

  const barang = pilih !== null ? data.items.find((item) => item.id === pilih) ?? null : null;
  const detail = barang ? (() => {
    const { peserta, diambil } = jumlah(barang);
    const diSesi = sesi(barang);
    const baris = rekap(barang);
    return (
      <Pane as="aside" aria-label={`${barang.name} details`}>
        <KepalaDetail
          nama={barang.name}
          sub={barang.size_field_key ? `Size from field ${labelField(barang.size_field_key)}` : "No size"}
          angka={`${diambil}/${peserta}`}
          keterangan="collected"
          onClose={() => setPilih(null)}
        />
        <PaneBody>
          {barang.size_field_key ? (
            <DetailSection title="By size">
              <table className="w-full text-body-medium">
                <thead>
                  <tr className="text-left text-on-surface-variant">
                    <th scope="col" className="py-1 font-normal">Size</th>
                    <th scope="col" className="py-1 text-right font-normal">Participants</th>
                    <th scope="col" className="py-1 text-right font-normal">Collected</th>
                  </tr>
                </thead>
                <tbody>
                  {baris.map((b) => (
                    <tr key={b.size ?? "kosong"} className="border-t border-outline-variant">
                      <td className={cx("py-1.5", b.size ? "text-on-surface" : "text-on-surface-variant")}>{b.size ?? "No answer"}</td>
                      <td className="py-1.5 text-right tabular-nums">{b.participants}</td>
                      <td className="py-1.5 text-right tabular-nums">{b.picked_up}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-body-small text-on-surface-variant">From participants&rsquo; current answers. The size recorded at collection is stored separately and does not change.</p>
            </DetailSection>
          ) : null}
          <DetailSection
            title="Checked at check-in points"
            action={<ButtonLink href="/admin/attendance" variant="text" size="sm">Set up in Check-in</ButtonLink>}
          >
            {diSesi.length === 0 ? (
              <Banner tone="warning" icon={<Warning size={18} />}>Not at any check-in point yet, so scanner staff cannot mark it as handed out. Choose a check-in point on the Check-in page.</Banner>
            ) : (
              <ul className="flex flex-col gap-1 text-body-medium text-on-surface">
                {diSesi.map((b) => <li key={b.session_id}>{b.session_name}</li>)}
              </ul>
            )}
          </DetailSection>
          <DetailSection title="Note for participants">
            <p className="text-body-medium text-on-surface">{barang.pickup_note ?? EMPTY_VALUE}</p>
          </DetailSection>
        </PaneBody>
        <PaneFooter note={diambil > 0 ? "Someone has already collected this kit item, so it cannot be deleted." : undefined}>
          {diambil === 0 ? (
            <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapus(barang)}>Delete</Button>
          ) : null}
          <Button variant="outlined" size="sm" onClick={() => setUbah(barang)}>Edit</Button>
        </PaneFooter>
      </Pane>
    );
  })() : null;

  return (
    <>
      <ListDetail list={daftar} detail={detail} />

      <FormBarang
        barang={baru ? barangBaru : ubah}
        fields={data.fields}
        busy={busy}
        onClose={() => { setUbah(null); tutupBaru(); }}
        simpan={async (nilai, id) => {
          const hasil = await kirim("/api/admin/logistik/data/barang", id ? "PATCH" : "POST", id ? { id, ...nilai } : { ...nilai, sort_order: data.items.length });
          if (hasil && !id) setPilih((hasil as Barang).id);
          return Boolean(hasil);
        }}
      />

      <Dialog
        open={hapus !== null}
        onClose={() => setHapus(null)}
        dismissible={!busy}
        tone="danger"
        title={`Delete ${hapus?.name ?? ""}?`}
        description="Nobody has collected this kit item yet. It is also removed from every check-in point. This cannot be undone."
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setHapus(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={busy} onClick={async () => {
              const target = hapus;
              setHapus(null);
              if (target && await kirim(`/api/admin/logistik/data/barang?id=${target.id}`, "DELETE")) setPilih(null);
            }}>Delete kit item</Button>
          </>
        }
      />
    </>
  );
}

type NilaiBarang = { name: string; size_field_key: string | null; pickup_note: string | null };

function FormBarang({ barang, fields, busy, onClose, simpan }: {
  /** `id` 0 = barang baru. Null = dialog tertutup. */
  barang: Barang | null;
  fields: TabProps["data"]["fields"];
  busy: boolean;
  onClose: () => void;
  simpan: (nilai: NilaiBarang, id?: number) => Promise<boolean>;
}) {
  const awal = { name: barang?.name ?? "", size_field_key: barang?.size_field_key ?? "", pickup_note: barang?.pickup_note ?? "" };
  const [draf, setDraf] = useState<typeof awal | null>(null);
  const nilai = draf ?? awal;
  function tutup() { setDraf(null); onClose(); }
  const lama = barang && barang.id > 0 ? barang : null;
  const sah = Boolean(nilai.name.trim());

  async function kirimForm() {
    if (!sah) return;
    const ok = await simpan({ name: nilai.name.trim(), size_field_key: nilai.size_field_key || null, pickup_note: nilai.pickup_note.trim() || null }, lama?.id);
    if (ok) tutup();
  }

  return (
    <Dialog
      open={barang !== null}
      onClose={tutup}
      dismissible={!busy}
      title={lama ? `Edit ${lama.name}` : "New kit item"}
      icon={<Package size={20} />}
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Cancel</Button>
          <Button simpan type="submit" form="form-barang" loading={busy} disabled={!sah}>{lama ? "Save kit item" : "Add kit item"}</Button>
        </>
      }
    >
      <form id="form-barang" className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void kirimForm(); }}>
        <TextField label="Kit item name" placeholder="e.g. T-shirt, Goodie bag" autoFocus value={nilai.name} onChange={(event) => setDraf({ ...nilai, name: event.target.value })} />
        <SelectField
          label="Size taken from"
          value={nilai.size_field_key}
          onChange={(event) => setDraf({ ...nilai, size_field_key: event.target.value })}
          hint="The form field or import column that holds each participant's size. Scanner staff see the size when they hand the item out."
        >
          <option value="">No size</option>
          {fields.map((f) => <option key={f.key} value={f.key}>{f.label}{f.source === "data" ? " (from import)" : ""}</option>)}
        </SelectField>
        <TextField label="Note for participants" optional placeholder="e.g. Collect at the check-in desk, main lobby" value={nilai.pickup_note} onChange={(event) => setDraf({ ...nilai, pickup_note: event.target.value })} />
      </form>
    </Dialog>
  );
}
