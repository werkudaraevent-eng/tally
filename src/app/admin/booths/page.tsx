"use client";

import { CheckCircle, FloppyDisk, Plus, Storefront, Tag, XCircle } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";

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

export default function BoothManagementPage() {
  const [booths, setBooths] = useState<Booth[]>([]);
  const [selected, setSelected] = useState<Booth>(blank);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function load() {
    const response = await fetch("/api/admin/booths", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setBooths(data.booths ?? []);
    else setError(data.error?.message ?? "Booth gagal dimuat.");
  }

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);

  async function save() {
    setSaving(true); setError(""); setMessage("");
    const response = await fetch("/api/admin/booths", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...selected, id: selected.id || null }) });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      const failure = data.error?.message ?? "Booth gagal disimpan.";
      setError(failure);
      toast.error("Booth gagal disimpan", failure);
      return;
    }
    setMessage(`${data.booth.code} berhasil disimpan.`);
    toast.success(`${data.booth.code} tersimpan`, `${data.booth.name} diperbarui.`);
    setSelected(data.booth);
    void load();
  }

  return <main className="bg-surface px-5 pb-8 pt-6 text-on-surface sm:px-8 lg:pb-10">
    <div className="mx-auto max-w-[1440px]">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-body-medium leading-6 text-on-surface-variant">Edit nama, kode, item diskon, stok, dan status. Histori order tetap aman.</p>
        </div>
        <button onClick={() => setSelected({ ...blank, id: 0 })} className="rounded-md flex min-h-12 items-center justify-center gap-2 bg-on-surface px-4 text-body-medium font-semibold text-surface"><Plus size={19} /> Booth baru</button>
      </div>

      {error && <div role="alert" className="rounded-lg mt-6 flex items-center gap-2 border border-error-soft-outline bg-error-soft p-4 text-body-medium text-error"><XCircle size={20} />{error}</div>}
      {message && <div role="status" className="rounded-lg mt-6 flex items-center gap-2 border border-success-soft-outline bg-success-soft p-4 text-body-medium text-primary-dim"><CheckCircle size={20} />{message}</div>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <section className="rounded-lg border border-outline-variant bg-panel">
          <div className="border-b border-outline-variant p-5"><h2 className="font-semibold">Booth terdaftar</h2></div>
          <div className="divide-y divide-outline-variant">
            {booths.map((booth) => <button key={booth.id} onClick={() => setSelected(booth)} className={`flex w-full items-center gap-3 p-5 text-left hover:bg-panel-high ${selected.id === booth.id ? "bg-primary-soft" : ""}`}>
              <Storefront size={23} className={booth.is_active ? "text-primary" : "text-on-surface-variant"} />
              <span className="flex-1">
                <span className="block font-semibold">{booth.code} - {booth.name}</span>
                <span className="mt-1 block text-body-small text-on-surface-variant">{booth.transactions_enabled
                  ? (booth.discount_enabled && booth.discount_limit_per_participant > 0 ? `Diskon: ${booth.discount_limit_per_participant}x/peserta - stok ${booth.discount_item_stock ?? "tak terbatas"}` : "Tanpa item diskon")
                  : "Tanpa transaksi - hanya serah terima barang"}</span>
              </span>
              <span className={`text-body-small font-semibold ${booth.is_active ? "text-success" : "text-on-surface-variant"}`}>{booth.is_active ? "Aktif" : "Nonaktif"}</span>
            </button>)}
            {booths.length === 0 && <p className="p-6 text-body-medium text-on-surface-variant">Memuat booth...</p>}
          </div>
        </section>

        <section className="rounded-lg border border-outline-variant bg-panel p-6 sm:p-8">
          <h2 className="text-xl font-semibold">{selected.id ? `Kustomisasi ${selected.code}` : "Booth baru"}</h2>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            {/* Aturan format ditulis di sini, bukan hanya dijadikan pesan error
                setelah gagal simpan: admin baru tidak bisa menebak batasannya, dan
                sebelumnya kode seperti PH ditolak tanpa penjelasan apa pun. */}
            <label className="text-body-medium font-semibold">Kode booth
              <input value={selected.code} onChange={(event) => setSelected({ ...selected, code: event.target.value.toUpperCase() })}
                maxLength={8} placeholder="Misalnya B1 atau PH" aria-describedby="booth-code-help" aria-invalid={selected.code.length > 0 && !BOOTH_CODE_PATTERN.test(selected.code)}
                className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-3 outline-none focus:border-primary" />
              <span id="booth-code-help" className="mt-1.5 block text-body-small font-normal leading-5 text-on-surface-variant">
                1-8 karakter, dimulai huruf, hanya huruf dan angka. Tanpa spasi atau tanda hubung, karena nomor order dibentuk sebagai <code>{selected.code || "KODE"}-001</code>.
              </span>
              {selected.code.length > 0 && !BOOTH_CODE_PATTERN.test(selected.code)
                ? <span className="mt-1 block text-body-small font-semibold text-error">Format kode belum sesuai.</span>
                : null}
            </label>
            <label className="text-body-medium font-semibold">Nama booth
              <input value={selected.name} onChange={(event) => setSelected({ ...selected, name: event.target.value })} className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-3 outline-none focus:border-primary" />
            </label>
            <label className="flex items-end gap-3 pb-3 text-body-medium font-semibold sm:col-span-2"><input type="checkbox" checked={selected.is_active} onChange={(event) => setSelected({ ...selected, is_active: event.target.checked })} className="size-5 accent-primary" /> Booth aktif</label>
          </div>

          {/* Sifat booth, bukan sekadar preferensi tampilan. Ditampilkan sebagai dua
              pilihan bernama, bukan satu checkbox negatif ("tanpa transaksi"), karena
              checkbox yang tidak dicentang tidak menjelaskan apa yang berlaku.
              Radio dipakai supaya kedua kemungkinan terbaca sekaligus beserta akibatnya. */}
          <fieldset className="rounded-lg mt-6 border border-outline-variant p-5">
            <legend className="px-2 text-body-medium font-semibold">Sifat booth</legend>
            <div className="grid gap-3">
              {([
                { value: true, title: "Dengan transaksi", detail: "Booth berjualan. Operator mengisi nominal item reguler dan order masuk hitungan top spender." },
                { value: false, title: "Tanpa transaksi", detail: "Hanya serah terima barang, misalnya tas belanja. Kolom nominal disembunyikan dan ditolak server, jadi tidak bisa terisi karena lupa." },
              ] as const).map((option) => <label key={String(option.value)} className={`rounded-lg flex cursor-pointer gap-3 border p-4 ${selected.transactions_enabled === option.value ? "border-primary bg-primary-soft" : "border-outline-variant"}`}>
                <input type="radio" name="booth-transactions" checked={selected.transactions_enabled === option.value}
                  onChange={() => setSelected({ ...selected, transactions_enabled: option.value })}
                  className="mt-0.5 size-5 shrink-0 accent-primary" />
                <span>
                  <span className="block text-body-medium font-semibold">{option.title}</span>
                  <span className="mt-1 block text-body-small leading-5 text-on-surface-variant">{option.detail}</span>
                </span>
              </label>)}
            </div>
            {/* Batas kemampuannya disebut terus terang: item spesial tetap jalan di booth
                tanpa transaksi, dan itulah cara membatasi tas menjadi 1x per peserta. */}
            {!selected.transactions_enabled
              ? <p className="mt-3 text-body-small leading-5 text-on-surface-variant">Batas 1x per peserta diatur lewat item spesial booth ini di <Link href="/admin/offers" className="font-semibold text-primary">Item spesial</Link>: harga Rp 0, kuota 1x per peserta, dan matikan hitungan top spender.</p>
              : null}
          </fieldset>

          {/* Editor item diskon dipindah ke /admin/offers. Sebelumnya harga, kuota,
              dan stok dapat diubah dari dua halaman berbeda untuk data yang sama,
              dan halaman ini tidak punya kontrol untuk syarat akumulasi maupun flag
              top spender. Satu editor menghilangkan pertanyaan "mana yang dipakai". */}
          <div className="rounded-lg mt-6 border border-outline-variant bg-panel-high p-5">
            <h3 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Item spesial booth ini</h3>
            {selected.id ? <>
              <p className="mt-3 text-body-medium">{selected.discount_enabled && selected.discount_limit_per_participant > 0
                ? <><span className="font-semibold">{selected.discount_item_name}</span> · maks {selected.discount_limit_per_participant}x/peserta · stok {selected.discount_item_stock ?? "tak terbatas"}</>
                : "Booth ini tidak menawarkan item diskon."}</p>
              <p className="mt-2 text-body-small leading-5 text-on-surface-variant">Harga, kuota, stok, syarat minimum total transaksi, dan pengaturan top spender kini diatur di satu tempat.</p>
              <Link href="/admin/offers" className="rounded-md mt-4 inline-flex min-h-12 items-center gap-2 border border-primary px-4 text-body-medium font-semibold text-primary hover:bg-primary-soft"><Tag size={17} /> Atur di Item spesial</Link>
            </> : <>
              <label className="mt-3 block text-body-medium font-semibold">Nama item diskon
                <input value={selected.discount_item_name} onChange={(event) => setSelected({ ...selected, discount_item_name: event.target.value })} className="rounded-md mt-2 h-12 w-full border border-outline-variant bg-surface px-3 outline-none focus:border-primary" />
              </label>
              <p className="mt-3 text-body-small leading-5 text-on-surface-variant">Booth baru otomatis mendapat item diskon Rp 1, maks 1x per peserta, stok tak terbatas. Setelah disimpan, atur detailnya di <Link href="/admin/offers" className="font-semibold text-primary">Item spesial</Link>.</p>
            </>}
          </div>
          <button onClick={save} disabled={saving || !BOOTH_CODE_PATTERN.test(selected.code) || !selected.name.trim()} className="rounded-md mt-8 flex min-h-14 w-full items-center justify-center gap-2 bg-primary text-body-medium font-semibold text-on-primary hover:bg-primary-dim disabled:opacity-50"><FloppyDisk size={19} />{saving ? "Menyimpan..." : "Simpan booth"}</button>
        </section>
      </div>
    </div>
  </main>;
}
