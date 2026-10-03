"use client";

import { ArrowDown, ArrowUp, CaretDown, CaretRight, LinkSimple, ListBullets, PaperPlaneTilt, Plus, TextB, TextItalic, Trash, UploadSimple, Warning } from "@phosphor-icons/react";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "@/components/event-link";
import {
  Banner,
  Button,
  Dialog,
  IconButton,
  MetaSeparator,
  PageLoading,
  Popover,
  POPOVER_ITEM,
  SegmentedButton,
  SelectField,
  SupportingPane,
  Switch,
  TextArea,
  TextField,
  usePopoverAnchor,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import type { KonteksDasar } from "@/lib/email/konfirmasi/konteks";
import { renderKonfirmasi, type RenderState } from "@/lib/email/konfirmasi/render";
import {
  ADDABLE,
  BLOCK_LABELS,
  FONT_LABELS,
  FONT_NOTES,
  FONTS,
  newBlock,
  PRESET_LABELS,
  PRESETS,
  templatSchema,
  unknownFieldsIn,
  type Block,
  type BlockType,
  type Font,
  type Preset,
  type Templat,
} from "@/lib/email/konfirmasi/templat";
import { cx } from "@/lib/m3/cx";
import { FIELDS } from "@/lib/pesan/bawaan";
import { PesanTabs } from "../pesan-tabs";
import { buatKepala, buatLogoPutih, siapkanGambar, unggah } from "./gambar";

/**
 * Pesan peserta > Email otomatis: email Konfirmasi pendaftaran.
 *
 * Satu templat per acara. Tata letaknya tetap (Kepala dan Tiket terkunci, sama
 * seperti Eventbrite dan Luma); panitia mengatur teks, gambar, tombol, urutan,
 * dan menyalakan/mematikan bagian. Teks ditulis di TextArea biasa seperti
 * Kiriman: Sisipkan memasukkan {kolom}, toolbar memasukkan **tebal**,
 * _miring_, [tautan](https://...), dan "- " daftar.
 *
 * Pratinjau disusun di peramban dengan penyusun yang sama dengan pengirim,
 * jadi yang terlihat adalah yang terkirim.
 */

type Contoh = { id: string; name: string; company: string | null; status: string };

type Data = {
  templat: Templat;
  bawaan: Templat;
  tersimpan: boolean;
  kirim_menunggu: boolean;
  dasar: KonteksDasar;
  kv_url: string | null;
  member_on: boolean;
  contoh: Contoh[];
  belum_terima: number;
  email_aktif: boolean;
};

const KUNCI_EMAIL_TES = "tally:pesan:email-tes";
const KODE_CONTOH = "CONTOH-0000";

type KolomTeks = { blockId: string | "subjek"; kunci: string; el: HTMLInputElement | HTMLTextAreaElement | null };

/** TextArea yang tingginya mengikuti isi: tidak ada kalimat yang tersembunyi di balik gulir. */
function TeksTumbuh(props: React.ComponentProps<typeof TextArea>) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current?.querySelector("textarea");
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return (
    <div ref={ref}>
      <TextArea {...props} rows={props.rows ?? 3} className={cx("[&_textarea]:resize-none [&_textarea]:overflow-hidden", props.className)} />
    </div>
  );
}

export default function EmailOtomatisPage() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [galatMuat, setGalatMuat] = useState(false);
  const [templat, setTemplat] = useState<Templat | null>(null);
  const [kirimMenunggu, setKirimMenunggu] = useState(true);
  const [berubah, setBerubah] = useState(false);
  const [state, setState] = useState<RenderState>("approved");
  const [layar, setLayar] = useState<"desktop" | "ponsel">("desktop");
  const [sebagai, setSebagai] = useState<string>("");
  const [terbuka, setTerbuka] = useState<string | null>("pembuka");
  const [qrContoh, setQrContoh] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [dialog, setDialog] = useState<null | "tes" | "kirim">(null);
  const [emailTes, setEmailTes] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [kemajuan, setKemajuan] = useState<{ terkirim: number; gagal: number } | null>(null);
  const [galatSimpan, setGalatSimpan] = useState<string | null>(null);
  const kolomTerakhir = useRef<KolomTeks>({ blockId: "pembuka", kunci: "isi", el: null });

  const muat = useCallback(async () => {
    const response = await fetch("/api/admin/email-konfirmasi", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setGalatMuat(true);
      return;
    }
    const body = (await response.json()) as Data;
    setData(body);
    setTemplat(body.templat);
    setKirimMenunggu(body.kirim_menunggu);
    setSebagai((lama) => lama || body.contoh[0]?.id || "");
    setBerubah(false);
  }, []);

  useEffect(() => {
    // Muat sekali saat halaman dibuka.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void muat();
    void QRCode.toDataURL(KODE_CONTOH, { errorCorrectionLevel: "H", margin: 4, width: 320 }).then(setQrContoh);
  }, [muat]);

  // Gambar kepala dan logo putih untuk PRATINJAU sebelum Simpan pertama:
  // dibuat di peramban sebagai URL lokal, tidak diunggah. Tanpa ini, memilih
  // Banner KV menampilkan Pita warna sampai panitia menyimpan.
  const [gambarLokal, setGambarLokal] = useState<{ kepala: string | null; putih: string | null }>({ kepala: null, putih: null });
  useEffect(() => {
    if (!data) return;
    const dibuat: string[] = [];
    let batal = false;
    const logo = logoKepala(data.dasar);
    void (async () => {
      const kepala = data.kv_url ? await buatKepala(data.kv_url, logo).then((b) => URL.createObjectURL(b)).catch(() => null) : null;
      const putih = !data.dasar.logoPutihUrl && data.dasar.logoUrl ? await buatLogoPutih(data.dasar.logoUrl).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null) : null;
      for (const url of [kepala, putih]) if (url) dibuat.push(url);
      if (!batal) setGambarLokal({ kepala, putih });
    })();
    return () => {
      batal = true;
      dibuat.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [data]);

  const contoh = data?.contoh.find((item) => item.id === sebagai) ?? null;

  const pratinjau = useMemo(() => {
    if (!data || !templat) return null;
    const nama = contoh?.name ?? "Budi Santoso";
    const logo = logoKepala(data.dasar);
    const kepalaBasi = !templat.kepala_url || templat.kepala_sumber !== `${data.kv_url}|${logo?.url ?? ""}`;
    const putihBasi = !data.dasar.logoPutihUrl && templat.logo_putih_sumber !== data.dasar.logoUrl;
    const tampil: Templat = {
      ...templat,
      kepala_url: kepalaBasi && gambarLokal.kepala ? gambarLokal.kepala : templat.kepala_url,
      logo_putih_url: putihBasi ? gambarLokal.putih : templat.logo_putih_url,
    };
    try {
      return renderKonfirmasi(tampil, {
        ...data.dasar,
        state,
        values: { nama, perusahaan: contoh?.company ?? "", acara: data.dasar.eventName, tanggal: data.dasar.detail.tanggal ?? "" },
        qr: state === "approved" ? { code: KODE_CONTOH, src: qrContoh } : null,
        codeUrl: state === "approved" ? data.dasar.halamanUrl : null,
      });
    } catch {
      return null;
    }
  }, [data, templat, state, contoh, qrContoh, gambarLokal]);

  if (galatMuat) {
    return (
      <WorkspacePage>
        <WorkspaceHeader />
        <PesanTabs />
        <Banner tone="error" icon={<Warning size={18} />}>
          Email otomatis gagal dimuat. Muat ulang halaman.
        </Banner>
      </WorkspacePage>
    );
  }
  if (!data || !templat) return <PageLoading />;

  const t = templat;
  const menunggu = state === "pending";
  const asing = unknownFieldsIn(t);
  const sah = templatSchema.safeParse(t);
  const pesanTidakSah = sah.success ? null : sah.error.issues[0]?.message ?? "Periksa isian.";

  function ubah(next: Partial<Templat>) {
    setTemplat((lama) => (lama ? { ...lama, ...next } : lama));
    setBerubah(true);
  }

  function ubahBlock(id: string, next: Partial<Block>) {
    setTemplat((lama) => (lama ? { ...lama, blocks: lama.blocks.map((block) => (block.id === id ? ({ ...block, ...next } as Block) : block)) } : lama));
    setBerubah(true);
  }

  function geser(id: string, arah: -1 | 1) {
    const index = t.blocks.findIndex((block) => block.id === id);
    const tujuan = index + arah;
    // Kepala tetap paling atas.
    if (tujuan < 1 || tujuan >= t.blocks.length) return;
    const blocks = [...t.blocks];
    [blocks[index], blocks[tujuan]] = [blocks[tujuan], blocks[index]];
    ubah({ blocks });
  }

  function hapus(id: string) {
    ubah({ blocks: t.blocks.filter((block) => block.id !== id) });
  }

  function tambah(type: BlockType) {
    const block = newBlock(type, { memberOn: data!.member_on });
    ubah({ blocks: [...t.blocks, block] });
    setTerbuka(block.id);
  }

  function nilaiKolom(k: KolomTeks): string {
    if (k.blockId === "subjek") return menunggu ? t.subjek_menunggu : t.subjek;
    const block = t.blocks.find((item) => item.id === k.blockId) as Record<string, unknown> | undefined;
    return typeof block?.[k.kunci] === "string" ? (block[k.kunci] as string) : "";
  }

  function tulisKolom(k: KolomTeks, nilai: string) {
    if (k.blockId === "subjek") ubah(menunggu ? { subjek_menunggu: nilai } : { subjek: nilai });
    else ubahBlock(k.blockId, { [k.kunci]: nilai } as Partial<Block>);
  }

  /** Sisipkan teks di kursor kolom terakhir; `bungkus` membungkus pilihan (tebal, miring, tautan). */
  function sisip(k: KolomTeks, sebelum: string, sesudah = "", isiBawaan = "") {
    const el = k.el;
    const nilai = nilaiKolom(k);
    const awal = el?.selectionStart ?? nilai.length;
    const akhir = el?.selectionEnd ?? nilai.length;
    const dipilih = nilai.slice(awal, akhir) || isiBawaan;
    const hasil = nilai.slice(0, awal) + sebelum + dipilih + sesudah + nilai.slice(akhir);
    tulisKolom(k, hasil);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(awal + sebelum.length, awal + sebelum.length + dipilih.length);
    });
  }

  function daftarBaris(k: KolomTeks) {
    const el = k.el;
    const nilai = nilaiKolom(k);
    const awal = el?.selectionStart ?? nilai.length;
    const mulaiBaris = nilai.lastIndexOf("\n", awal - 1) + 1;
    tulisKolom(k, `${nilai.slice(0, mulaiBaris)}- ${nilai.slice(mulaiBaris)}`);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(awal + 2, awal + 2);
    });
  }

  async function siapkanGambarKepala(sekarang: Templat): Promise<Templat> {
    const d = data!;
    let hasil = sekarang;
    const logoTerang = d.dasar.logoPutihUrl;
    const logo = logoKepala(d.dasar);
    if (hasil.preset === "banner" && d.kv_url) {
      const sumber = `${d.kv_url}|${logo?.url ?? ""}`;
      if (!hasil.kepala_url || hasil.kepala_sumber !== sumber) {
        const url = await unggah(await buatKepala(d.kv_url, logo), "kepala-email.jpg");
        hasil = { ...hasil, kepala_url: url, kepala_sumber: sumber };
      }
    }
    if (hasil.preset === "pita" && !logoTerang && d.dasar.logoUrl) {
      const sumber = d.dasar.logoUrl;
      if (hasil.logo_putih_sumber !== sumber) {
        const putih = await buatLogoPutih(d.dasar.logoUrl);
        hasil = { ...hasil, logo_putih_url: putih ? await unggah(putih, "logo-putih.png") : null, logo_putih_sumber: sumber };
      }
    }
    return hasil;
  }

  async function simpan(): Promise<boolean> {
    setMenyimpan(true);
    setGalatSimpan(null);
    let siap = t;
    try {
      siap = await siapkanGambarKepala(t);
    } catch {
      // Gambar kepala gagal dibuat (mis. KV tidak bisa dimuat): email tetap
      // sah, kepala jatuh ke Pita warna sampai Simpan berikutnya.
      toast.warning("Gambar kepala belum dibuat", "Email memakai kepala Pita warna sampai gambar berhasil dibuat.");
    }
    const response = await fetch("/api/admin/email-konfirmasi", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templat: siap, kirim_menunggu: kirimMenunggu }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setMenyimpan(false);
    if (!response?.ok) {
      const pesan = body?.error?.message ?? "Periksa koneksi lalu coba lagi.";
      setGalatSimpan(pesan);
      toast.error("Email konfirmasi belum tersimpan", pesan);
      return false;
    }
    setTemplat(siap);
    setBerubah(false);
    toast.success("Email konfirmasi tersimpan", "Pendaftar berikutnya menerima email ini.");
    return true;
  }

  function bukaTes() {
    try {
      setEmailTes((lama) => lama || (window.localStorage.getItem(KUNCI_EMAIL_TES) ?? ""));
    } catch {
      // Penyimpanan peramban bisa ditolak; kolomnya cukup kosong.
    }
    setDialog("tes");
  }

  async function kirimTes() {
    const email = emailTes.trim();
    if (!email) return;
    setSibuk(true);
    let siap = t;
    try {
      siap = await siapkanGambarKepala(t);
      if (siap !== t) setTemplat(siap);
    } catch {
      // Tes tetap berangkat dengan kepala cadangan.
    }
    const response = await fetch("/api/admin/email-konfirmasi/tes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, state, templat: siap, sebagai: sebagai || null }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setSibuk(false);
    if (!response?.ok) {
      toast.error("Email tes tidak terkirim", body?.error?.message ?? "Coba lagi.");
      return;
    }
    try {
      window.localStorage.setItem(KUNCI_EMAIL_TES, email);
    } catch {
      // Tidak diingat, tidak apa-apa.
    }
    setDialog(null);
    toast.success("Email tes terkirim", `Ke ${email}, versi ${menunggu ? "Menunggu persetujuan" : "Disetujui"}. Subjeknya diawali [TES].`);
  }

  async function kirimTertunda() {
    setSibuk(true);
    setKemajuan({ terkirim: 0, gagal: 0 });
    let expected: number | undefined = data!.belum_terima;
    let terkirim = 0;
    let gagal = 0;
    for (let putaran = 0; putaran < 40; putaran += 1) {
      const response = await fetch("/api/admin/email-konfirmasi/kirim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(expected === undefined ? {} : { expected }),
      }).catch(() => null);
      const body = await response?.json().catch(() => null);
      if (!response?.ok) {
        setSibuk(false);
        setKemajuan(null);
        if (body?.error?.code === "MESSAGE_COUNT_CHANGED") {
          setData((lama) => (lama ? { ...lama, belum_terima: body.error.details?.count ?? lama.belum_terima } : lama));
          toast.warning("Jumlahnya berubah", "Periksa angka barunya, lalu kirim lagi.");
          return;
        }
        toast.error("Pengiriman berhenti", body?.error?.message ?? "Coba lagi.");
        void muat();
        return;
      }
      terkirim += body.terkirim;
      gagal += body.gagal.length;
      setKemajuan({ terkirim, gagal });
      expected = undefined;
      // Yang gagal tercatat email_error dan tetap "belum terima"; berhenti bila putaran ini tidak mengirim apa pun.
      if (body.sisa === 0 || body.terkirim === 0) break;
    }
    setSibuk(false);
    setDialog(null);
    setKemajuan(null);
    if (gagal) toast.warning(`${terkirim} terkirim, ${gagal} gagal`, "Sebab kegagalan tercatat di baris pendaftaran.");
    else toast.success(`${terkirim} email terkirim`);
    void muat();
  }

  // Desktop lebih lebar dari 620px supaya media query ponsel di email tidak ikut aktif.
  const lebarPratinjau = layar === "ponsel" ? 390 : 680;
  const pembuka = t.blocks.find((block): block is Extract<Block, { type: "pembuka" }> => block.type === "pembuka");

  return (
    <WorkspacePage className="pb-0">
      <WorkspaceHeader
        meta={
          <>
            <span>Email otomatis</span>
            <MetaSeparator />
            <span aria-live="polite" className={galatSimpan ? "text-error" : undefined}>
              {menyimpan ? "Menyimpan…" : berubah ? "Ada perubahan yang belum disimpan" : data.tersimpan ? "Tersimpan" : "Memakai templat bawaan dari Tema"}
            </span>
          </>
        }
      />
      <PesanTabs />

      {!data.email_aktif ? (
        <Banner tone="warning" icon={<Warning size={18} />}>
          Pengiriman email belum diaktifkan di server (RESEND_API_KEY dan EMAIL_FROM). Templat tetap bisa disusun.
        </Banner>
      ) : null}

      <SupportingPane
        paneWidth={440}
        main={
          <div className="@container w-full min-w-0 self-start rounded-lg border border-outline-variant bg-surface-container-lowest">
            <div className="border-b border-outline-variant px-5 py-5">
              <h2 className="text-title-large font-semibold text-on-surface">Konfirmasi pendaftaran</h2>
              <p className="mt-1 max-w-[40rem] text-body-medium text-on-surface-variant">
                Terkirim ke setiap pendaftar. Disetujui (langsung atau saat panitia menyetujui) membawa QR masuk. Acara bermoderasi juga mengirim versi Menunggu persetujuan saat mendaftar.
              </p>
            </div>

            <Baris judul="Preset" id="preset">
              <div role="radiogroup" aria-labelledby="preset" className="grid gap-3 @md:grid-cols-3">
                {PRESETS.map((preset) => (
                  <KartuPreset key={preset} preset={preset} dipilih={t.preset === preset} dasar={data.dasar} kvUrl={data.kv_url} onPilih={() => ubah({ preset })} />
                ))}
              </div>
              <p className="text-body-small text-on-surface-variant">
                Warna, KV, dan logo diambil dari Tema acara. Mengganti preset tidak mengubah teks.
                {t.preset === "banner" && !data.kv_url ? " Acara ini belum punya KV, jadi kepala memakai Pita warna." : ""}
              </p>
            </Baris>

            <Baris judul="Huruf" id="huruf">
              <SegmentedButton<Font>
                label="Huruf"
                labelledBy="huruf"
                value={t.font}
                onChange={(font) => ubah({ font })}
                options={FONTS.map((font) => ({ value: font, label: FONT_LABELS[font], disabled: font === "tema" && !data.dasar.headingFont }))}
                className="self-start"
              />
              <p className="text-body-small text-on-surface-variant">{FONT_NOTES[t.font]}. Satu huruf untuk seluruh email.</p>
            </Baris>

            <Baris judul="Menunggu persetujuan" id="menunggu">
              <Switch
                label="Kirim email saat mendaftar di acara bermoderasi"
                description="Tanpa QR; QR menyusul di email Disetujui. Email Disetujui selalu terkirim dan tidak bisa dimatikan."
                checked={kirimMenunggu}
                onChange={(nilai) => {
                  setKirimMenunggu(nilai);
                  setBerubah(true);
                }}
              />
            </Baris>

            <Baris judul="Mengedit" id="mengedit">
              <SegmentedButton<RenderState>
                label="Versi yang diedit"
                labelledBy="mengedit"
                value={state}
                onChange={setState}
                options={[
                  { value: "approved", label: "Disetujui" },
                  { value: "pending", label: "Menunggu" },
                ]}
                className="self-start"
              />
              <p className="text-body-small text-on-surface-variant">Subjek, judul, dan sapaan berbeda per versi. Bagian lain sama untuk keduanya.</p>
              <TextField
                label={menunggu ? "Subjek (Menunggu)" : "Subjek (Disetujui)"}
                value={menunggu ? t.subjek_menunggu : t.subjek}
                maxLength={150}
                onFocus={(e) => (kolomTerakhir.current = { blockId: "subjek", kunci: "subjek", el: e.currentTarget })}
                onChange={(e) => ubah(menunggu ? { subjek_menunggu: e.target.value } : { subjek: e.target.value })}
              />
            </Baris>

            <section aria-labelledby="bagian" className="px-5 pt-5">
              <h2 id="bagian" className="text-title-small font-semibold text-on-surface">
                Bagian email
              </h2>
            </section>
            <ol className="mt-3 border-t border-outline-variant">
              {t.blocks.map((block, index) => (
                <BarisBagian
                  key={block.id}
                  block={block}
                  pertama={index <= 1}
                  terakhir={index === t.blocks.length - 1}
                  terbuka={terbuka === block.id}
                  ringkas={ringkasan(block, data, menunggu)}
                  onBuka={() => setTerbuka((lama) => (lama === block.id ? null : block.id))}
                  onNyala={(on) => ubahBlock(block.id, { on } as Partial<Block>)}
                  onGeser={(arah) => geser(block.id, arah)}
                  onHapus={() => hapus(block.id)}
                >
                  <EditorBagian
                    block={block}
                    menunggu={menunggu}
                    data={data}
                    pembuka={pembuka ?? null}
                    onUbah={(next) => ubahBlock(block.id, next)}
                    onFokus={(kunci, el) => (kolomTerakhir.current = { blockId: block.id, kunci, el })}
                    toolbar={(kunci) => (
                      <Toolbar
                        onTebal={() => sisip({ ...kolomTerakhir.current, blockId: block.id, kunci, el: kolomTerakhir.current.blockId === block.id ? kolomTerakhir.current.el : null }, "**", "**", "teks tebal")}
                        onMiring={() => sisip({ ...kolomTerakhir.current, blockId: block.id, kunci, el: kolomTerakhir.current.blockId === block.id ? kolomTerakhir.current.el : null }, "_", "_", "teks miring")}
                        onTautan={() => sisip({ ...kolomTerakhir.current, blockId: block.id, kunci, el: kolomTerakhir.current.blockId === block.id ? kolomTerakhir.current.el : null }, "[", "](https://)", "teks tautan")}
                        onDaftar={() => daftarBaris({ ...kolomTerakhir.current, blockId: block.id, kunci, el: kolomTerakhir.current.blockId === block.id ? kolomTerakhir.current.el : null })}
                      />
                    )}
                    sisipkan={
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-body-small text-on-surface-variant">Sisipkan:</span>
                        {FIELDS.map((field) => (
                          <Button key={field.key} size="sm" variant="outlined" onMouseDown={(e) => e.preventDefault()} onClick={() => sisip(kolomTerakhir.current, `{${field.key}}`)}>
                            {field.label}
                          </Button>
                        ))}
                      </div>
                    }
                  />
                </BarisBagian>
              ))}
            </ol>
            <div className="border-t border-outline-variant px-5 py-4">
              <TambahBagian onTambah={tambah} />
            </div>
            {asing.length > 0 ? (
              <p role="alert" className="border-t border-outline-variant px-5 py-3 text-body-small text-error">
                Kolom isian tidak dikenal: {asing.map((key) => `{${key}}`).join(", ")}. Pakai tombol Sisipkan supaya ejaannya tepat.
              </p>
            ) : null}
          </div>
        }
        pane={
          <div className="flex w-full min-w-0 flex-col self-start overflow-hidden rounded-lg lg:sticky lg:top-[calc(var(--workspace-top,58px)+16px)] lg:max-h-[calc(100dvh-var(--workspace-top,58px)-104px)] border border-outline-variant bg-surface-container-lowest">
            <div className="flex flex-col gap-3 border-b border-outline-variant px-5 py-4">
              <div className="flex flex-wrap gap-3">
                <SegmentedButton<RenderState>
                  label="Versi pratinjau"
                  value={state}
                  onChange={setState}
                  options={[
                    { value: "approved", label: "Disetujui" },
                    { value: "pending", label: "Menunggu" },
                  ]}
                />
                <SegmentedButton<"desktop" | "ponsel">
                  label="Lebar pratinjau"
                  value={layar}
                  onChange={setLayar}
                  options={[
                    { value: "desktop", label: "Desktop" },
                    { value: "ponsel", label: "Ponsel" },
                  ]}
                />
              </div>
              {data.contoh.length > 0 ? (
                <SelectField label="Pratinjau sebagai" value={sebagai} onChange={(e) => setSebagai(e.target.value)}>
                  {data.contoh.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </SelectField>
              ) : null}
              <p className="text-body-medium">
                <span className="text-on-surface-variant">Subjek </span>
                <span className="font-semibold text-on-surface">{pratinjau?.subject ?? "-"}</span>
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-surface-container">
              <PratinjauEmail html={pratinjau?.html ?? ""} lebar={lebarPratinjau} />
            </div>
            <p className="border-t border-outline-variant px-5 py-3 text-body-small text-on-surface-variant">
              Pratinjau memakai data pendaftar sungguhan; QR dan tautannya contoh.
            </p>
          </div>
        }
      />

      <div className="sticky bottom-0 z-10 -mx-4 mt-auto flex flex-wrap items-center gap-3 border-t border-outline-variant bg-surface px-4 py-3 sm:-mx-6 sm:px-6">
        <p className="min-w-0 basis-full text-body-medium text-on-surface-variant sm:flex-1 sm:basis-0">
          {data.belum_terima > 0 ? (
            <>
              <span className="font-semibold text-on-surface tabular-nums">{data.belum_terima} pendaftar disetujui</span> belum pernah menerima email ber-QR.{" "}
              <Button variant="text" size="sm" onClick={() => setDialog("kirim")} disabled={berubah || !data.email_aktif}>
                Kirim ke mereka…
              </Button>
              {berubah ? <span className="block text-body-small">Simpan dulu, supaya mereka menerima versi terbaru.</span> : null}
            </>
          ) : (
            <>Semua pendaftar disetujui sudah menerima email ber-QR.</>
          )}
          {pesanTidakSah && !asing.length ? <span className="block text-body-small text-error">{pesanTidakSah}</span> : null}
        </p>
        <Button variant="outlined" className="ml-auto" onClick={bukaTes} disabled={!sah.success}>
          Kirim tes…
        </Button>
        <Button onClick={() => void simpan()} loading={menyimpan} disabled={!berubah || !sah.success || asing.length > 0}>
          Simpan
        </Button>
      </div>

      <Dialog
        open={dialog === "tes"}
        onClose={() => setDialog(null)}
        dismissible={!sibuk}
        title="Kirim email tes"
        description={`Versi ${menunggu ? "Menunggu persetujuan" : "Disetujui"} dengan isi di layar (boleh belum disimpan) dan data pendaftar yang sedang dipratinjau. Subjeknya diawali [TES]; QR dan tautannya contoh.`}
        actions={
          <>
            <Button variant="text" onClick={() => setDialog(null)} disabled={sibuk}>
              Batal
            </Button>
            <Button onClick={() => void kirimTes()} loading={sibuk} disabled={!emailTes.trim()}>
              Kirim tes
            </Button>
          </>
        }
      >
        <TextField label="Kirim ke" type="email" autoComplete="email" value={emailTes} onChange={(e) => setEmailTes(e.target.value)} hint="Alamat ini diingat untuk tes berikutnya." />
      </Dialog>

      <Dialog
        open={dialog === "kirim"}
        onClose={() => setDialog(null)}
        dismissible={!sibuk}
        size="md"
        icon={<PaperPlaneTilt size={20} />}
        title={`Kirim ke ${data.belum_terima} pendaftar?`}
        description="Email Disetujui dengan QR masing-masing, memakai templat yang tersimpan. Email yang sudah terkirim tidak bisa ditarik."
        actions={
          <>
            <Button variant="text" onClick={() => setDialog(null)} disabled={sibuk}>
              Batal
            </Button>
            <Button onClick={() => void kirimTertunda()} loading={sibuk} disabled={data.belum_terima === 0}>
              Kirim ke {data.belum_terima} pendaftar
            </Button>
          </>
        }
      >
        <dl className="divide-y divide-outline-variant border-y border-outline-variant text-body-medium">
          <div className="flex justify-between gap-4 py-3">
            <dt className="font-semibold">Disetujui, belum menerima email</dt>
            <dd className="tabular-nums">{data.belum_terima}</dd>
          </div>
        </dl>
        <p className="mt-3 text-body-small text-on-surface-variant">
          Dikirim satu per satu dengan jeda singkat. Pendaftar yang emailnya pernah memantul dilewati.
          {kemajuan ? ` Terkirim ${kemajuan.terkirim}${kemajuan.gagal ? `, gagal ${kemajuan.gagal}` : ""}…` : ""}
        </p>
      </Dialog>
    </WorkspacePage>
  );
}

function Baris({ judul, children, id }: { judul: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="grid gap-3 border-b border-outline-variant px-5 py-5 @xl:grid-cols-[132px_minmax(0,1fr)]">
      <h2 id={id} className="pt-2 text-title-small font-semibold text-on-surface">
        {judul}
      </h2>
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}

function KartuPreset({ preset, dipilih, dasar, kvUrl, onPilih }: { preset: Preset; dipilih: boolean; dasar: KonteksDasar; kvUrl: string | null; onPilih: () => void }) {
  const info = PRESET_LABELS[preset];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={dipilih}
      onClick={onPilih}
      className={cx(
        "m3-state flex flex-col gap-2 rounded-md border bg-surface-container-lowest p-2 text-start",
        dipilih ? "border-primary ring-1 ring-primary" : "border-outline-variant",
      )}
    >
      <span aria-hidden className="block h-16 overflow-hidden rounded-sm border border-outline-variant bg-white">
        {preset === "banner" ? (
          <span className="flex h-10 items-center px-2" style={{ background: kvUrl ? `${dasar.brand} url("${kvUrl}") center/cover` : dasar.brand }}>
            <span className="h-3 w-10 rounded-[2px] bg-white/90" />
          </span>
        ) : preset === "pita" ? (
          <span className="flex h-10 flex-col justify-center gap-1 px-2" style={{ background: dasar.brand }}>
            <span className="h-1.5 w-6 rounded-[2px] bg-white/80" />
            <span className="h-2 w-16 rounded-[2px] bg-white" />
          </span>
        ) : (
          <span className="flex h-10 flex-col justify-center gap-1.5 px-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- miniatur logo dari Tema */}
            {dasar.logoUrl ? <img src={dasar.logoUrl} alt="" className="h-4 w-auto self-start" /> : <span className="h-2 w-12 rounded-[2px] bg-on-surface/60" />}
            <span className="h-0.5 w-5" style={{ background: dasar.brand }} />
          </span>
        )}
        <span className="mx-2 mt-1.5 block h-1.5 w-20 rounded-[2px] bg-on-surface/25" />
      </span>
      <span className="text-label-large font-semibold text-on-surface">{info.label}</span>
      <span className="-mt-1.5 text-body-small text-on-surface-variant">{info.note}</span>
    </button>
  );
}

function ringkasan(block: Block, data: Data, menunggu: boolean): string {
  switch (block.type) {
    case "kepala":
      return "Dari preset dan Tema acara";
    case "pembuka":
      return (menunggu ? block.judul_menunggu : block.judul) || "Judul dan sapaan";
    case "tiket":
      return menunggu ? "Kotak Menunggu persetujuan (versi Menunggu)" : "Kode peserta, QR, dan tombol Buka kode & QR";
    case "detail":
      return [data.dasar.detail.tanggal, data.dasar.detail.tempat].filter(Boolean).join(" · ") || "Tanggal dan tempat belum diisi di data acara";
    case "teks":
      return block.isi.split("\n")[0]?.slice(0, 80) || "Teks kosong";
    case "gambar":
      return block.url ? block.alt || "Teks alternatif belum diisi" : "Belum ada gambar";
    case "tombol":
      return block.label;
    case "info":
      return block.judul || "Kotak info";
    case "mitra":
      return data.dasar.mitra.length ? `${Math.min(8, data.dasar.mitra.length)} logo dari Halaman acara` : "Belum ada logo mitra di Halaman acara";
    case "garis":
      return "Garis tipis pemisah";
  }
}

function BarisBagian({
  block,
  pertama,
  terakhir,
  terbuka,
  ringkas,
  onBuka,
  onNyala,
  onGeser,
  onHapus,
  children,
}: {
  block: Block;
  pertama: boolean;
  terakhir: boolean;
  terbuka: boolean;
  ringkas: string;
  onBuka: () => void;
  onNyala: (on: boolean) => void;
  onGeser: (arah: -1 | 1) => void;
  onHapus: () => void;
  children: React.ReactNode;
}) {
  const wajib = block.type === "kepala" || block.type === "tiket" || block.type === "pembuka";
  const bisaDibuka = block.type !== "kepala" && block.type !== "tiket" && block.type !== "detail" && block.type !== "garis";
  const panelId = `bagian-${block.id}`;
  return (
    <li className={cx("border-b border-outline-variant last:border-b-0", terbuka && bisaDibuka && "bg-primary-soft/40")}>
      <div className="flex items-center gap-2 py-2 pe-3 ps-2">
        <button
          type="button"
          onClick={bisaDibuka ? onBuka : undefined}
          aria-expanded={bisaDibuka ? terbuka : undefined}
          aria-controls={bisaDibuka ? panelId : undefined}
          disabled={!bisaDibuka}
          className="m3-state flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-sm px-2 text-start disabled:cursor-default"
        >
          <span aria-hidden className="w-4 shrink-0 text-on-surface-variant">
            {bisaDibuka ? terbuka ? <CaretDown size={16} /> : <CaretRight size={16} /> : null}
          </span>
          <span className="min-w-0">
            <span className="block text-body-large font-semibold text-on-surface">{BLOCK_LABELS[block.type]}</span>
            <span className="block truncate text-body-small text-on-surface-variant">{ringkas}</span>
          </span>
        </button>
        {block.type !== "kepala" ? (
          <>
            <IconButton size="sm" label={`Naikkan ${BLOCK_LABELS[block.type]}`} disabled={pertama} onClick={() => onGeser(-1)}>
              <ArrowUp size={18} />
            </IconButton>
            <IconButton size="sm" label={`Turunkan ${BLOCK_LABELS[block.type]}`} disabled={terakhir} onClick={() => onGeser(1)}>
              <ArrowDown size={18} />
            </IconButton>
          </>
        ) : null}
        {wajib ? (
          <Switch label={BLOCK_LABELS[block.type]} labelHidden kunci checked onChange={() => undefined} className="w-11 shrink-0" />
        ) : (
          <>
            <IconButton size="sm" label={`Hapus ${BLOCK_LABELS[block.type]}`} onClick={onHapus}>
              <Trash size={18} />
            </IconButton>
            <Switch label={`Tampilkan ${BLOCK_LABELS[block.type]}`} labelHidden checked={block.on} onChange={onNyala} className="w-11 shrink-0" />
          </>
        )}
      </div>
      {terbuka && bisaDibuka ? (
        <div id={panelId} className="flex flex-col gap-3 px-5 pb-5 ps-12">
          {children}
        </div>
      ) : null}
    </li>
  );
}

function Toolbar({ onTebal, onMiring, onTautan, onDaftar }: { onTebal: () => void; onMiring: () => void; onTautan: () => void; onDaftar: () => void }) {
  const tahan = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div role="toolbar" aria-label="Format teks" className="flex flex-wrap items-center gap-1">
      <IconButton size="sm" label="Tebal (**teks**)" onMouseDown={tahan} onClick={onTebal}>
        <TextB size={18} weight="bold" />
      </IconButton>
      <IconButton size="sm" label="Miring (_teks_)" onMouseDown={tahan} onClick={onMiring}>
        <TextItalic size={18} />
      </IconButton>
      <IconButton size="sm" label="Tautan ([teks](https://...))" onMouseDown={tahan} onClick={onTautan}>
        <LinkSimple size={18} />
      </IconButton>
      <IconButton size="sm" label="Daftar berpoin (- di awal baris)" onMouseDown={tahan} onClick={onDaftar}>
        <ListBullets size={18} />
      </IconButton>
      <span className="ms-2 text-body-small text-on-surface-variant">**tebal** · _miring_ · [teks](https://…) · - daftar</span>
    </div>
  );
}

function EditorBagian({
  block,
  menunggu,
  data,
  onUbah,
  onFokus,
  toolbar,
  sisipkan,
}: {
  block: Block;
  menunggu: boolean;
  data: Data;
  pembuka: Extract<Block, { type: "pembuka" }> | null;
  onUbah: (next: Partial<Block>) => void;
  onFokus: (kunci: string, el: HTMLInputElement | HTMLTextAreaElement) => void;
  toolbar: (kunci: string) => React.ReactNode;
  sisipkan: React.ReactNode;
}) {
  const toast = useToast();
  const [mengunggah, setMengunggah] = useState(false);
  switch (block.type) {
    case "pembuka": {
      const kJudul = menunggu ? "judul_menunggu" : "judul";
      const kIsi = menunggu ? "isi_menunggu" : "isi";
      return (
        <>
          <p className="text-body-small text-on-surface-variant">Mengedit versi {menunggu ? "Menunggu persetujuan" : "Disetujui"}. Ganti versi di baris Mengedit atau di pratinjau.</p>
          <TextField label="Judul" value={block[kJudul]} maxLength={120} onFocus={(e) => onFokus(kJudul, e.currentTarget)} onChange={(e) => onUbah({ [kJudul]: e.target.value } as Partial<Block>)} />
          {toolbar(kIsi)}
          <TeksTumbuh label="Sapaan" value={block[kIsi]} maxLength={2000} onFocus={(e) => onFokus(kIsi, e.currentTarget)} onChange={(e) => onUbah({ [kIsi]: e.target.value } as Partial<Block>)} />
          {sisipkan}
        </>
      );
    }
    case "teks":
      return (
        <>
          {toolbar("isi")}
          <TeksTumbuh label="Teks" value={block.isi} maxLength={2000} onFocus={(e) => onFokus("isi", e.currentTarget)} onChange={(e) => onUbah({ isi: e.target.value })} />
          {sisipkan}
        </>
      );
    case "info":
      return (
        <>
          <TextField label="Judul kotak" value={block.judul} maxLength={120} onFocus={(e) => onFokus("judul", e.currentTarget)} onChange={(e) => onUbah({ judul: e.target.value })} />
          {toolbar("isi")}
          <TeksTumbuh label="Isi" value={block.isi} maxLength={2000} onFocus={(e) => onFokus("isi", e.currentTarget)} onChange={(e) => onUbah({ isi: e.target.value })} />
          {sisipkan}
        </>
      );
    case "gambar":
      return (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- gambar email dari storage, bukan aset halaman */}
          {block.url ? <img src={block.url} alt="" className="max-h-40 w-auto self-start rounded-sm border border-outline-variant" /> : null}
          <label className="self-start">
            <span className="sr-only">Pilih gambar</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="peer sr-only"
              disabled={mengunggah}
              onChange={async (e) => {
                const berkas = e.target.files?.[0];
                e.target.value = "";
                if (!berkas) return;
                setMengunggah(true);
                try {
                  const siap = await siapkanGambar(berkas);
                  const url = await unggah(siap.blob, "gambar-email.jpg");
                  onUbah({ url, lebar: siap.lebar, tinggi: siap.tinggi });
                } catch {
                  toast.error("Gambar gagal diunggah", "Pakai PNG, JPG, atau WebP di bawah 5 MB.");
                } finally {
                  setMengunggah(false);
                }
              }}
            />
            <span className="m3-state inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-outline px-4 text-label-large font-semibold text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-primary">
              <UploadSimple size={16} aria-hidden />
              {mengunggah ? "Mengunggah…" : block.url ? "Ganti gambar" : "Unggah gambar"}
            </span>
          </label>
          <p className="text-body-small text-on-surface-variant">Dikecilkan otomatis ke lebar 1200 px. Jangan menaruh info penting hanya di dalam gambar: banyak email kantor memblokir gambar.</p>
          <TextField
            label="Teks alternatif"
            value={block.alt}
            maxLength={200}
            onChange={(e) => onUbah({ alt: e.target.value })}
            hint="Tampil bila gambar diblokir, dan dibacakan pembaca layar. Contoh: Panduan dress code batik."
            error={block.url && !block.alt.trim() ? "Wajib diisi." : undefined}
          />
          <TextField label="Tautan saat gambar diklik" optional value={block.href ?? ""} placeholder="https://" maxLength={600} onChange={(e) => onUbah({ href: e.target.value.trim() || undefined })} />
        </>
      );
    case "tombol": {
      const tujuan = [
        ...(data.member_on ? [{ value: "dashboard" as const, label: "Dashboard saya" }] : []),
        { value: "halaman" as const, label: "Halaman acara" },
        { value: "url" as const, label: "Tautan lain" },
      ];
      return (
        <>
          <TextField label="Tulisan tombol" value={block.label} maxLength={40} onChange={(e) => onUbah({ label: e.target.value })} />
          <SegmentedButton
            label="Tujuan tombol"
            value={block.tujuan === "dashboard" && !data.member_on ? "halaman" : block.tujuan}
            onChange={(nilai) => onUbah({ tujuan: nilai })}
            options={tujuan}
            className="self-start"
          />
          {block.tujuan === "dashboard" && !data.member_on ? (
            <p className="text-body-small text-on-surface-variant">Area peserta mati, jadi tombol ini menuju Halaman acara.</p>
          ) : null}
          {block.tujuan === "url" ? (
            <TextField label="Tautan" value={block.url ?? ""} placeholder="https://" maxLength={600} onChange={(e) => onUbah({ url: e.target.value.trim() || undefined })} />
          ) : null}
        </>
      );
    }
    case "mitra":
      return (
        <>
          <TextField label="Judul di atas logo" value={block.judul} maxLength={120} onChange={(e) => onUbah({ judul: e.target.value })} />
          <p className="text-body-small text-on-surface-variant">
            {data.dasar.mitra.length
              ? `${Math.min(8, data.dasar.mitra.length)} logo diambil dari Halaman acara (paling banyak 8). Ubah logonya di Halaman acara.`
              : "Belum ada logo mitra di Halaman acara, jadi bagian ini tidak tampil."}{" "}
            <Link href="/admin/landing" className="font-semibold text-primary underline-offset-4 hover:underline">
              Buka Halaman acara
            </Link>
          </p>
        </>
      );
    default:
      return null;
  }
}

function TambahBagian({ onTambah }: { onTambah: (type: BlockType) => void }) {
  const [pemicu, setPemicu] = useState<HTMLSpanElement | null>(null);
  const anchor = usePopoverAnchor(pemicu);
  return (
    <span ref={setPemicu} className="inline-block">
      <Button variant="outlined" icon={<Plus size={16} weight="bold" />} aria-haspopup="menu" aria-expanded={anchor.open} onClick={anchor.toggle}>
        Tambah bagian
      </Button>
      <Popover anchor={anchor} label="Tambah bagian" width={300} align="start">
        {ADDABLE.map((item) => (
          <button
            key={item.type}
            type="button"
            role="menuitem"
            className={cx(POPOVER_ITEM, "h-auto! flex-col items-start justify-center gap-0.5 py-2")}
            onClick={() => {
              anchor.tutup();
              onTambah(item.type);
            }}
          >
            <span className="font-semibold">{BLOCK_LABELS[item.type]}</span>
            <span className="text-body-small text-on-surface-variant">{item.note}</span>
          </button>
        ))}
      </Popover>
    </span>
  );
}

/** Logo di gambar kepala: logo terang Forum apa adanya, selain itu logo acara yang diputihkan. */
function logoKepala(dasar: Data["dasar"]): { url: string; terang: boolean } | null {
  if (dasar.logoPutihUrl) return { url: dasar.logoPutihUrl, terang: true };
  return dasar.logoUrl ? { url: dasar.logoUrl, terang: false } : null;
}

/**
 * Pratinjau di iframe tanpa skrip. Email 600 px diperkecil agar muat di panel
 * 440 px (seperti kotak masuk yang memperkecil email lebar); tingginya
 * mengikuti isi email.
 */
function PratinjauEmail({ html, lebar }: { html: string; lebar: number }) {
  const [tinggi, setTinggi] = useState(640);
  const [ruang, setRuang] = useState(lebar);
  const [wadah, setWadah] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!wadah) return;
    const amati = new ResizeObserver(([entri]) => setRuang(entri.contentRect.width));
    amati.observe(wadah);
    return () => amati.disconnect();
  }, [wadah]);
  const skala = Math.min(1, ruang / lebar);
  return (
    <div ref={setWadah} className="w-full" style={{ height: tinggi * skala }}>
      <iframe
        title="Pratinjau email"
        srcDoc={html}
        sandbox="allow-same-origin"
        onLoad={(e) => {
          const doc = e.currentTarget.contentDocument;
          if (doc) setTinggi(Math.max(400, doc.documentElement.scrollHeight));
        }}
        style={{ width: lebar, height: tinggi, transform: `scale(${skala})`, transformOrigin: "top left", marginLeft: skala < 1 ? 0 : (ruang - lebar) / 2 }}
        className="block max-w-none border-0 bg-white"
      />
    </div>
  );
}
