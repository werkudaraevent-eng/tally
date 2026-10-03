"use client";

import { CaretRight, Check, Storefront, X, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useImperativeHandle, useState } from "react";
import {
  Button, DetailSection, EmptyCell, EmptyState, IconButton, ListDetail, Pane, PaneBody, PaneFooter, StatusChip, Switch,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import { cx } from "@/lib/m3/cx";
import { INPUT, Field } from "@/components/admin/compact-form";

type Booth = { id: number; code: string; name: string; discount_item_name: string; discount_item_stock: number | null; is_active: boolean; discount_enabled: boolean; discount_limit_per_participant: number; transactions_enabled: boolean };

// Kode booth bebas huruf dan angka, jadi kode booth baru dibiarkan KOSONG dan
// diisi admin. Sebelumnya kolom ini terisi tebakan `B<angka berikutnya>`, yang
// membuat admin cenderung menerimanya apa adanya dan kode di aplikasi jadi
// berbeda dengan kode yang tertempel di booth.
//
// `transactions_enabled` default true: booth baru dianggap berjualan sampai admin
// menyatakan sebaliknya. Menebak sebaliknya lebih berbahaya, karena booth jualan
// yang salah disetel tanpa transaksi akan menolak order di depan peserta.
const blank: Booth = { id: 0, code: "", name: "Booth baru", discount_item_name: "Item diskon", discount_item_stock: null, is_active: true, discount_enabled: true, discount_limit_per_participant: 1, transactions_enabled: true };

const BOOTH_CODE_PATTERN = /^[A-Z][A-Z0-9]{0,7}$/;


export type BoothsPanelHandle = { tambah: () => void };
export type BoothStats = { total: number; aktif: number };

function ringkasItem(booth: Booth) {
  if (!(booth.discount_enabled && booth.discount_limit_per_participant > 0)) return null;
  return `${booth.discount_item_name} · ${booth.discount_limit_per_participant}x/peserta · stok ${booth.discount_item_stock ?? "tak terbatas"}`;
}

function sama(a: Booth, b: Booth) {
  return a.code === b.code && a.name === b.name && a.is_active === b.is_active && a.transactions_enabled === b.transactions_enabled && a.discount_item_name === b.discount_item_name;
}

export function BoothsPanel({ onBukaItemSpesial, onStats, ref }: {
  onBukaItemSpesial: () => void;
  onStats?: (stats: BoothStats) => void;
  ref?: React.Ref<BoothsPanelHandle>;
}) {
  const [booths, setBooths] = useState<Booth[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // null = panel detail tertutup; id 0 = booth baru.
  const [selected, setSelected] = useState<Booth | null>(null);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/booths", { cache: "no-store" }).catch(() => null);
    setLoading(false);
    if (!response) { setLoadError("Koneksi terputus. Daftar booth tidak bisa dimuat."); return; }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setLoadError(data.error?.message ?? "Booth gagal dimuat."); return; }
    const rows = (data.booths ?? []) as Booth[];
    setLoadError("");
    setBooths(rows);
    onStats?.({ total: rows.length, aktif: rows.filter((booth) => booth.is_active).length });
  }, [onStats]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  function tambah() { setSaveError(""); setSelected({ ...blank, id: 0 }); }
  useImperativeHandle(ref, () => ({ tambah }));

  function pilih(booth: Booth) {
    setSaveError("");
    setSelected(selected?.id === booth.id ? null : booth);
  }

  async function save() {
    if (!selected) return;
    setSaving(true); setSaveError("");
    const response = await fetch("/api/admin/booths", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...selected, id: selected.id || null }) }).catch(() => null);
    setSaving(false);
    if (!response) { setSaveError("Koneksi terputus. Booth belum tentu tersimpan; muat ulang halaman untuk memastikan."); return; }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = data.error?.message ?? "Booth gagal disimpan.";
      setSaveError(failure);
      toast.error("Booth gagal disimpan", failure);
      return;
    }
    toast.success(`${data.booth.code} tersimpan`, `${data.booth.name} diperbarui.`);
    setSelected(data.booth);
    void load();
  }

  // ---- Panel daftar --------------------------------------------------------
  const list = (
    <Pane aria-label="Daftar booth">
      <PaneBody>
        {loadError ? (
          <p role="alert" className="m-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={18} className="mt-0.5 shrink-0" />{loadError}</p>
        ) : loading ? (
          <div aria-label="Memuat booth" className="flex flex-col">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-6 border-b border-outline-variant px-4 py-4">
                <div className="h-3 w-40 animate-pulse rounded bg-surface-container-high" />
                <div className="h-3 w-48 animate-pulse rounded bg-surface-container-high" />
              </div>
            ))}
          </div>
        ) : booths.length === 0 ? (
          <EmptyState
            plain
            icon={<Storefront size={40} />}
            title="Belum ada booth"
            description="Booth menentukan kode nomor order dan akun operator yang berjualan."
            action={<Button variant="outlined" size="sm" onClick={tambah}>Tambah booth</Button>}
          />
        ) : (
          <table className="w-full min-w-[520px] border-separate border-spacing-0 text-left text-body-medium">
            <thead className="sticky top-0 z-10 bg-surface-container-lowest text-on-surface-variant">
              <tr>
                <th scope="col" className="border-b border-outline-variant px-4 py-2 font-normal">Booth</th>
                <th scope="col" className="border-b border-outline-variant px-3 py-2 font-normal">Item diskon</th>
                <th scope="col" className="border-b border-outline-variant px-4 py-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {booths.map((booth) => {
                const aktif = selected?.id === booth.id;
                const item = ringkasItem(booth);
                return (
                  <tr key={booth.id} onClick={() => pilih(booth)} className={cx("cursor-pointer", aktif ? "bg-secondary-container" : "bg-surface-container-lowest hover:bg-primary-soft")}>
                    <td className="border-b border-outline-variant px-4 py-2.5">
                      <button type="button" aria-pressed={aktif} onClick={(event) => { event.stopPropagation(); pilih(booth); }} className="block rounded-sm text-left">
                        <span className="block font-medium text-on-surface">{booth.code} · {booth.name}</span>
                        <span className="block text-on-surface-variant">{booth.transactions_enabled ? "Dengan transaksi" : "Tanpa transaksi, serah terima barang"}</span>
                      </button>
                    </td>
                    <td className="border-b border-outline-variant px-3 py-2.5">{item ?? <EmptyCell />}</td>
                    <td className="border-b border-outline-variant px-4 py-2.5">
                      <StatusChip dot tone={booth.is_active ? "success" : "neutral"}>{booth.is_active ? "Aktif" : "Nonaktif"}</StatusChip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </PaneBody>
    </Pane>
  );

  // ---- Panel editor --------------------------------------------------------
  const asli = selected?.id ? booths.find((booth) => booth.id === selected.id) ?? null : null;
  const kodeSalah = selected ? selected.code.length > 0 && !BOOTH_CODE_PATTERN.test(selected.code) : false;
  const berubah = selected ? (selected.id === 0 || !asli || !sama(selected, asli)) : false;

  const editor = selected ? (
    <Pane as="aside" aria-label={selected.id ? `Sunting booth ${selected.code}` : "Booth baru"}>
      <div className="flex shrink-0 items-start gap-3 border-b border-outline-variant px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-title-medium font-semibold">{selected.id ? `${asli?.code ?? selected.code} · ${asli?.name ?? selected.name}` : "Booth baru"}</h2>
            {asli ? <StatusChip dot tone={asli.is_active ? "success" : "neutral"}>{asli.is_active ? "Aktif" : "Nonaktif"}</StatusChip> : null}
          </div>
          <p className="text-body-medium text-on-surface-variant">Histori order tetap aman saat booth disunting.</p>
        </div>
        <IconButton size="sm" label="Tutup editor" onClick={() => setSelected(null)} disabled={saving}><X size={16} /></IconButton>
      </div>
      <PaneBody>
        <form id="form-booth" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          {saveError ? <p role="alert" className="mx-5 mt-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{saveError}</p> : null}
          <DetailSection>
            <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3">
              <Field className="min-w-0" label="Kode booth" htmlFor="booth-code">
                <input
                  id="booth-code"
                  value={selected.code}
                  onChange={(event) => setSelected({ ...selected, code: event.target.value.toUpperCase() })}
                  maxLength={8}
                  placeholder="B1 atau PH"
                  aria-describedby="booth-code-help"
                  aria-invalid={kodeSalah}
                  className={cx(INPUT, "tabular-nums", kodeSalah && "border-error focus:border-error")}
                />
              </Field>
              <Field className="min-w-0" label="Nama booth" htmlFor="booth-name">
                <input id="booth-name" value={selected.name} onChange={(event) => setSelected({ ...selected, name: event.target.value })} className={INPUT} />
              </Field>
            </div>
            {/* Aturan format ditulis di sini, bukan hanya dijadikan pesan galat
                setelah gagal simpan: admin baru tidak bisa menebak batasannya. */}
            <p id="booth-code-help" className="text-body-medium text-on-surface-variant">
              1–8 karakter, dimulai huruf, hanya huruf dan angka. Nomor order dibentuk sebagai {selected.code || "KODE"}-001, {selected.code || "KODE"}-002, dan seterusnya.
            </p>
            {kodeSalah ? <p className="text-body-medium font-medium text-error">Format kode belum sesuai.</p> : null}
          </DetailSection>

          {/* Dua pilihan bernama, bukan satu checkbox negatif ("tanpa transaksi"):
              checkbox yang tidak dicentang tidak menjelaskan apa yang berlaku. */}
          <DetailSection title="Sifat booth">
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">Sifat booth</legend>
              {([
                { value: true, title: "Dengan transaksi", detail: "Booth berjualan. Operator mengisi nominal item reguler dan order masuk hitungan top spender." },
                { value: false, title: "Tanpa transaksi", detail: "Hanya serah terima barang, misalnya tas belanja. Kolom nominal disembunyikan dan ditolak server." },
              ] as const).map((option) => {
                const on = selected.transactions_enabled === option.value;
                return (
                  <label key={String(option.value)} className={cx("flex cursor-pointer gap-3 rounded-lg border p-3 text-body-medium", on ? "border-2 border-primary" : "border-outline")}>
                    <input type="radio" name="booth-transactions" checked={on} onChange={() => setSelected({ ...selected, transactions_enabled: option.value })} className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
                    <span>
                      <span className="block font-medium">{option.title}</span>
                      <span className="block text-on-surface-variant">{option.detail}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            {/* Item spesial tetap jalan di booth tanpa transaksi, dan itulah cara
                membatasi tas menjadi 1x per peserta. */}
            {!selected.transactions_enabled ? (
              <p className="text-body-medium text-on-surface-variant">
                Batas 1x per peserta diatur lewat item spesial booth ini: harga Rp 0, kuota 1x per peserta, dan matikan hitungan top spender.{" "}
                <button type="button" onClick={onBukaItemSpesial} className="rounded-sm font-medium text-primary hover:underline">Buka Item spesial</button>
              </p>
            ) : null}
          </DetailSection>

          {/* Editor item diskon ada di tab Item spesial: harga, kuota, dan stok
              pernah bisa diubah dari dua tempat untuk data yang sama. */}
          <DetailSection title="Item spesial">
            {selected.id ? (
              <button type="button" onClick={onBukaItemSpesial} className="flex w-full items-center gap-3 rounded-md bg-surface-container-high px-3 py-2.5 text-left text-body-medium hover:bg-primary-soft">
                <span className="min-w-0 flex-1">
                  {asli && ringkasItem(asli)
                    ? <><span className="block font-medium">{asli.discount_item_name}</span><span className="block text-on-surface-variant">Maks {asli.discount_limit_per_participant}x/peserta · stok {asli.discount_item_stock ?? "tak terbatas"}</span></>
                    : <span className="block text-on-surface-variant">Booth ini tidak menawarkan item diskon.</span>}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 font-medium text-primary">Atur di Item spesial<CaretRight size={14} aria-hidden /></span>
              </button>
            ) : (
              <>
                <Field className="min-w-0" label="Nama item diskon" htmlFor="booth-discount-name">
                  <input id="booth-discount-name" value={selected.discount_item_name} onChange={(event) => setSelected({ ...selected, discount_item_name: event.target.value })} className={INPUT} />
                </Field>
                <p className="text-body-medium text-on-surface-variant">Booth baru otomatis mendapat item diskon Rp 1, maks 1x per peserta, stok tak terbatas. Setelah disimpan, atur detailnya di tab Item spesial.</p>
              </>
            )}
          </DetailSection>

          <DetailSection>
            <Switch
              checked={selected.is_active}
              onChange={(checked) => setSelected({ ...selected, is_active: checked })}
              label="Booth aktif"
              description="Booth nonaktif tidak muncul di daftar pilihan booth. Histori ordernya tetap."
            />
          </DetailSection>
        </form>
      </PaneBody>
      <PaneFooter note={berubah ? (selected.id ? "Perubahan belum disimpan" : "Booth baru belum disimpan") : "Semua perubahan tersimpan"}>
        <Button type="button" variant="outlined" size="sm" disabled={saving} onClick={() => setSelected(null)}>Tutup</Button>
        <Button simpan type="submit" form="form-booth" size="sm" loading={saving} disabled={!BOOTH_CODE_PATTERN.test(selected.code) || !selected.name.trim() || !berubah} icon={<Check size={16} weight="bold" />}>
          Simpan booth
        </Button>
      </PaneFooter>
    </Pane>
  ) : null;

  return <ListDetail list={list} detail={editor} detailWidth={440} />;
}
