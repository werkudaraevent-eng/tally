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
import { plural } from "@/lib/plural";
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
  /** Yang benar-benar dikirimi "Kirim ke mereka…": di luar produksi hanya alamat di daftar uji. */
  belum_terima_dikirim: number;
  daftar_uji: "off" | "list" | "blocked";
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

/** Kolom salinan per versi email. Bagian lain sama untuk semua versi. */
const VERSI: Record<RenderState, { label: string; panjang: string; subjek: "subjek" | "subjek_menunggu" | "subjek_ditolak"; judul: "judul" | "judul_menunggu" | "judul_ditolak"; isi: "isi" | "isi_menunggu" | "isi_ditolak" }> = {
  approved: { label: "Approved", panjang: "Approved", subjek: "subjek", judul: "judul", isi: "isi" },
  pending: { label: "Pending", panjang: "Pending approval", subjek: "subjek_menunggu", judul: "judul_menunggu", isi: "isi_menunggu" },
  rejected: { label: "Rejected", panjang: "Rejected", subjek: "subjek_ditolak", judul: "judul_ditolak", isi: "isi_ditolak" },
};
const PILIHAN_VERSI = (Object.keys(VERSI) as RenderState[]).map((value) => ({ value, label: VERSI[value].label }));

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
        // Contoh tautan: kotak Akun Area peserta hanya ikut untuk pendaftar yang membuat akun saat mendaftar.
        akunUrl: data.member_on ? data.dasar.halamanUrl : null,
      });
    } catch {
      return null;
    }
  }, [data, templat, state, contoh, qrContoh, gambarLokal]);

  if (galatMuat) {
    return (
      <div lang="en" className="contents">
        <WorkspacePage>
          <WorkspaceHeader />
          <PesanTabs />
          <Banner tone="error" icon={<Warning size={18} />}>
            Couldn&apos;t load automated emails. Reload the page.
          </Banner>
        </WorkspacePage>
      </div>
    );
  }
  if (!data || !templat) return <PageLoading />;

  const t = templat;
  const versi = VERSI[state];
  const asing = unknownFieldsIn(t);
  const sah = templatSchema.safeParse(t);
  const pesanTidakSah = sah.success ? null : sah.error.issues[0]?.message ?? "Check the fields.";

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
    if (k.blockId === "subjek") return t[versi.subjek];
    const block = t.blocks.find((item) => item.id === k.blockId) as Record<string, unknown> | undefined;
    return typeof block?.[k.kunci] === "string" ? (block[k.kunci] as string) : "";
  }

  function tulisKolom(k: KolomTeks, nilai: string) {
    if (k.blockId === "subjek") ubah({ [versi.subjek]: nilai });
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
      toast.warning("Header image not created", "The email uses the Colour band header until the image is created.");
    }
    const response = await fetch("/api/admin/email-konfirmasi", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templat: siap, kirim_menunggu: kirimMenunggu }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setMenyimpan(false);
    if (!response?.ok) {
      const pesan = body?.error?.message ?? "Check your connection and try again.";
      setGalatSimpan(pesan);
      toast.error("Confirmation email not saved", pesan);
      return false;
    }
    setTemplat(siap);
    setBerubah(false);
    toast.success("Confirmation email saved", "New registrants receive this email.");
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
      toast.error("Test email not sent", body?.error?.message ?? "Try again.");
      return;
    }
    try {
      window.localStorage.setItem(KUNCI_EMAIL_TES, email);
    } catch {
      // Tidak diingat, tidak apa-apa.
    }
    setDialog(null);
    toast.success("Test email sent", `To ${email}, ${versi.panjang} version. The subject starts with [TEST].`);
  }

  async function kirimTertunda() {
    setSibuk(true);
    setKemajuan({ terkirim: 0, gagal: 0 });
    let expected: number | undefined = data!.belum_terima_dikirim;
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
          setData((lama) => (lama ? { ...lama, belum_terima_dikirim: body.error.details?.count ?? lama.belum_terima_dikirim } : lama));
          toast.warning("The number changed", "Check the new number, then send again.");
          return;
        }
        toast.error("Sending stopped", body?.error?.message ?? "Try again.");
        void muat();
        return;
      }
      terkirim += body.terkirim;
      gagal += body.gagal.length;
      setKemajuan({ terkirim, gagal });
      expected = undefined;
      // Yang gagal tercatat email_error dan diklaim 10 menit, jadi tidak diambil lagi;
      // berhenti bila tidak ada sisa atau putaran ini tidak mendapat satu baris pun.
      if (body.sisa === 0 || body.diproses === 0) break;
    }
    setSibuk(false);
    setDialog(null);
    setKemajuan(null);
    if (gagal) toast.warning(`${terkirim} sent, ${gagal} failed`, "The reason is recorded on each registration row.");
    else toast.success(`${plural(terkirim, "email")} sent`);
    void muat();
  }

  // Desktop lebih lebar dari 620px supaya media query ponsel di email tidak ikut aktif.
  const lebarPratinjau = layar === "ponsel" ? 390 : 680;
  const pembuka = t.blocks.find((block): block is Extract<Block, { type: "pembuka" }> => block.type === "pembuka");

  return (
    <div lang="en" className="contents">
    <WorkspacePage className="pb-0">
      <WorkspaceHeader
        meta={
          <>
            <span>Automated emails</span>
            <MetaSeparator />
            <span aria-live="polite" className={galatSimpan ? "text-error" : undefined}>
              {menyimpan ? "Saving…" : berubah ? "Unsaved changes" : data.tersimpan ? "Saved" : "Using the default template from Theme"}
            </span>
          </>
        }
      />
      <PesanTabs />

      {!data.email_aktif ? (
        <Banner tone="warning" icon={<Warning size={18} />}>
          Email sending isn&apos;t set up on the server (RESEND_API_KEY and EMAIL_FROM). You can still build the template.
        </Banner>
      ) : null}

      <SupportingPane
        paneWidth={440}
        main={
          <div className="@container w-full min-w-0 self-start rounded-lg border border-outline-variant bg-surface-container-lowest">
            <div className="border-b border-outline-variant px-5 py-5">
              <h2 className="text-title-large font-semibold text-on-surface">Registration confirmation</h2>
              <p className="mt-1 max-w-[40rem] text-body-medium text-on-surface-variant">
                Sent to every registrant. The Approved version (sent straight away, or when staff approve) carries the check-in QR code. Events with moderation also send the Pending approval version on registration.
              </p>
            </div>

            <Baris judul="Preset" id="preset">
              <div role="radiogroup" aria-labelledby="preset" className="grid gap-3 @md:grid-cols-3">
                {PRESETS.map((preset) => (
                  <KartuPreset key={preset} preset={preset} dipilih={t.preset === preset} dasar={data.dasar} kvUrl={data.kv_url} onPilih={() => ubah({ preset })} />
                ))}
              </div>
              <p className="text-body-small text-on-surface-variant">
                Colours, KV and logo come from the event Theme. Changing the preset doesn&apos;t change the text.
                {t.preset === "banner" && !data.kv_url ? " This event has no KV yet, so the header uses Colour band." : ""}
              </p>
            </Baris>

            <Baris judul="Font" id="huruf">
              <SegmentedButton<Font>
                label="Font"
                labelledBy="huruf"
                value={t.font}
                onChange={(font) => ubah({ font })}
                options={FONTS.map((font) => ({ value: font, label: FONT_LABELS[font], disabled: font === "tema" && !data.dasar.headingFont }))}
                className="self-start"
              />
              <p className="text-body-small text-on-surface-variant">{FONT_NOTES[t.font]}. One font for the whole email.</p>
            </Baris>

            <Baris judul="Pending approval" id="menunggu">
              <Switch
                label="Send an email on registration when the event uses moderation"
                description="No QR code; it follows in the Approved email. The Approved email is always sent and can't be turned off."
                checked={kirimMenunggu}
                onChange={(nilai) => {
                  setKirimMenunggu(nilai);
                  setBerubah(true);
                }}
              />
            </Baris>

            <Baris judul="Rejection email" id="ditolak">
              <Switch
                label="Send an email when staff reject a registration"
                description="Header and opening only, without the rejection reason (the reason stays a staff note). Off by default."
                checked={t.kirim_ditolak}
                onChange={(nilai) => ubah({ kirim_ditolak: nilai })}
              />
            </Baris>

            <Baris judul="Editing" id="mengedit">
              <SegmentedButton<RenderState>
                label="Version being edited"
                labelledBy="mengedit"
                value={state}
                onChange={setState}
                options={PILIHAN_VERSI}
                className="self-start"
              />
              <p className="text-body-small text-on-surface-variant">
                {state === "rejected"
                  ? "The Rejected version has only the Header and Opening."
                  : "Subject, title and greeting differ per version. Other sections are shared by Approved and Pending."}
              </p>
              <TextField
                label={`Subject (${versi.label})`}
                value={t[versi.subjek]}
                maxLength={150}
                onFocus={(e) => (kolomTerakhir.current = { blockId: "subjek", kunci: "subjek", el: e.currentTarget })}
                onChange={(e) => ubah({ [versi.subjek]: e.target.value })}
              />
            </Baris>

            <section aria-labelledby="bagian" className="px-5 pt-5">
              <h2 id="bagian" className="text-title-small font-semibold text-on-surface">
                Email sections
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
                  ringkas={ringkasan(block, data, state)}
                  onBuka={() => setTerbuka((lama) => (lama === block.id ? null : block.id))}
                  onNyala={(on) => ubahBlock(block.id, { on } as Partial<Block>)}
                  onGeser={(arah) => geser(block.id, arah)}
                  onHapus={() => hapus(block.id)}
                >
                  <EditorBagian
                    block={block}
                    state={state}
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
                        <span className="text-body-small text-on-surface-variant">Insert:</span>
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
                Unknown fields: {asing.map((key) => `{${key}}`).join(", ")}. Use the Insert buttons so the spelling is exact.
              </p>
            ) : null}
          </div>
        }
        pane={
          <div className="flex w-full min-w-0 flex-col self-start overflow-hidden rounded-lg lg:sticky lg:top-[calc(var(--workspace-top,58px)+16px)] lg:max-h-[calc(100dvh-var(--workspace-top,58px)-104px)] border border-outline-variant bg-surface-container-lowest">
            <div className="flex flex-col gap-3 border-b border-outline-variant px-5 py-4">
              <div className="flex flex-wrap gap-3">
                <SegmentedButton<RenderState>
                  label="Preview version"
                  value={state}
                  onChange={setState}
                  options={PILIHAN_VERSI}
                />
                <SegmentedButton<"desktop" | "ponsel">
                  label="Preview width"
                  value={layar}
                  onChange={setLayar}
                  options={[
                    { value: "desktop", label: "Desktop" },
                    { value: "ponsel", label: "Mobile" },
                  ]}
                />
              </div>
              {data.contoh.length > 0 ? (
                <SelectField label="Preview as" value={sebagai} onChange={(e) => setSebagai(e.target.value)}>
                  {data.contoh.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </SelectField>
              ) : null}
              <p className="text-body-medium">
                <span className="text-on-surface-variant">Subject </span>
                <span className="font-semibold text-on-surface">{pratinjau?.subject ?? "-"}</span>
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-surface-container">
              <PratinjauEmail html={pratinjau?.html ?? ""} lebar={lebarPratinjau} />
            </div>
            <p className="border-t border-outline-variant px-5 py-3 text-body-small text-on-surface-variant">
              The preview uses a real registrant&apos;s data; the QR code and links are samples.{data.member_on ? " The Participant area account box only appears for registrants who create an account when they register." : ""}
            </p>
          </div>
        }
      />

      <div className="sticky bottom-0 z-10 -mx-4 mt-auto flex flex-wrap items-center gap-3 border-t border-outline-variant bg-surface px-4 py-3 sm:-mx-6 sm:px-6">
        <p className="min-w-0 basis-full text-body-medium text-on-surface-variant sm:flex-1 sm:basis-0">
          {data.belum_terima > 0 ? (
            <>
              <span className="font-semibold text-on-surface tabular-nums">{plural(data.belum_terima, "approved registrant")}</span> without the QR email yet.{" "}
              <Button variant="text" size="sm" onClick={() => setDialog("kirim")} disabled={berubah || !data.email_aktif}>
                Send to them…
              </Button>
              {berubah ? <span className="block text-body-small">Save first so they get the latest version.</span> : null}
            </>
          ) : (
            <>All approved registrants have received the QR email.</>
          )}
          {pesanTidakSah && !asing.length ? <span className="block text-body-small text-error">{pesanTidakSah}</span> : null}
        </p>
        <Button variant="outlined" className="ml-auto" onClick={bukaTes} disabled={!sah.success}>
          Send test…
        </Button>
        <Button onClick={() => void simpan()} loading={menyimpan} disabled={!berubah || !sah.success || asing.length > 0}>
          Save
        </Button>
      </div>

      <Dialog
        open={dialog === "tes"}
        onClose={() => setDialog(null)}
        dismissible={!sibuk}
        title="Send test email"
        description={`The ${versi.panjang} version with the content on screen (saved or not) and the data of the registrant in the preview. The subject starts with [TEST]; the QR code and links are samples.`}
        actions={
          <>
            <Button variant="text" onClick={() => setDialog(null)} disabled={sibuk}>
              Cancel
            </Button>
            <Button onClick={() => void kirimTes()} loading={sibuk} disabled={!emailTes.trim()}>
              Send test
            </Button>
          </>
        }
      >
        <TextField label="Send to" type="email" autoComplete="email" value={emailTes} onChange={(e) => setEmailTes(e.target.value)} hint="This address is remembered for the next test." />
      </Dialog>

      <Dialog
        open={dialog === "kirim"}
        onClose={() => setDialog(null)}
        dismissible={!sibuk}
        size="md"
        icon={<PaperPlaneTilt size={20} />}
        title={`Send to ${plural(data.belum_terima_dikirim, "registrant")}?`}
        description="The Approved email with each person's own QR code, using the saved template. Sent emails can't be recalled."
        actions={
          <>
            <Button variant="text" onClick={() => setDialog(null)} disabled={sibuk}>
              Cancel
            </Button>
            <Button onClick={() => void kirimTertunda()} loading={sibuk} disabled={data.belum_terima_dikirim === 0}>
              Send to {plural(data.belum_terima_dikirim, "registrant")}
            </Button>
          </>
        }
      >
        <dl className="divide-y divide-outline-variant border-y border-outline-variant text-body-medium">
          <div className="flex justify-between gap-4 py-3">
            <dt className="font-semibold">Approved, no email yet</dt>
            <dd className="tabular-nums">{data.belum_terima}</dd>
          </div>
          {data.daftar_uji !== "off" ? (
            <div className="flex justify-between gap-4 py-3">
              <dt className="font-semibold">On the preview site test list</dt>
              <dd className="tabular-nums">{data.belum_terima_dikirim}</dd>
            </div>
          ) : null}
        </dl>
        {data.daftar_uji !== "off" ? (
          <Banner tone="warning" icon={<Warning size={18} />} className="mt-3">
            {data.daftar_uji === "blocked"
              ? "A preview site without a test list (MESSAGING_ALLOWLIST) doesn't send to real registrants."
              : "Preview site: only addresses on the test list (MESSAGING_ALLOWLIST) receive the email."}
          </Banner>
        ) : null}
        <p className="mt-3 text-body-small text-on-surface-variant">
          Sent one by one with a short pause. Registrants whose email has bounced before are skipped.
          {kemajuan ? ` ${kemajuan.terkirim} sent${kemajuan.gagal ? `, ${kemajuan.gagal} failed` : ""}…` : ""}
        </p>
      </Dialog>
    </WorkspacePage>
    </div>
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

function ringkasan(block: Block, data: Data, state: RenderState): string {
  if (state === "rejected" && block.type !== "kepala" && block.type !== "pembuka") return "Not in the Rejected version";
  switch (block.type) {
    case "kepala":
      return "From the preset and the event Theme";
    case "pembuka":
      return block[VERSI[state].judul] || "Title and greeting";
    case "tiket":
      return state === "pending" ? "Pending approval box" : "Participant code, QR and button";
    case "detail":
      return [data.dasar.detail.tanggal, data.dasar.detail.tempat].filter(Boolean).join(" · ") || "Date and venue aren't set in the event details";
    case "teks":
      return block.isi.split("\n")[0]?.slice(0, 80) || "Empty text";
    case "gambar":
      return block.url ? block.alt || "Alt text missing" : "No image yet";
    case "tombol":
      return block.label;
    case "info":
      return block.judul || "Info box";
    case "mitra":
      return data.dasar.mitra.length ? `${plural(Math.min(8, data.dasar.mitra.length), "logo")} from the Event page` : "No partner logos on the Event page yet";
    case "garis":
      return "Thin divider line";
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
            <IconButton size="sm" label={`Move ${BLOCK_LABELS[block.type]} up`} disabled={pertama} onClick={() => onGeser(-1)}>
              <ArrowUp size={18} />
            </IconButton>
            <IconButton size="sm" label={`Move ${BLOCK_LABELS[block.type]} down`} disabled={terakhir} onClick={() => onGeser(1)}>
              <ArrowDown size={18} />
            </IconButton>
          </>
        ) : null}
        {wajib ? (
          <Switch label={BLOCK_LABELS[block.type]} labelHidden kunci checked onChange={() => undefined} className="w-11 shrink-0" />
        ) : (
          <>
            <IconButton size="sm" label={`Delete ${BLOCK_LABELS[block.type]}`} onClick={onHapus}>
              <Trash size={18} />
            </IconButton>
            <Switch label={`Show ${BLOCK_LABELS[block.type]}`} labelHidden checked={block.on} onChange={onNyala} className="w-11 shrink-0" />
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
    <div role="toolbar" aria-label="Text format" className="flex flex-wrap items-center gap-1">
      <IconButton size="sm" label="Bold (**text**)" onMouseDown={tahan} onClick={onTebal}>
        <TextB size={18} weight="bold" />
      </IconButton>
      <IconButton size="sm" label="Italic (_text_)" onMouseDown={tahan} onClick={onMiring}>
        <TextItalic size={18} />
      </IconButton>
      <IconButton size="sm" label="Link ([text](https://...))" onMouseDown={tahan} onClick={onTautan}>
        <LinkSimple size={18} />
      </IconButton>
      <IconButton size="sm" label="Bulleted list (- at the start of a line)" onMouseDown={tahan} onClick={onDaftar}>
        <ListBullets size={18} />
      </IconButton>
      <span className="ms-2 text-body-small text-on-surface-variant">**bold** · _italic_ · [text](https://…) · - list</span>
    </div>
  );
}

function EditorBagian({
  block,
  state,
  data,
  onUbah,
  onFokus,
  toolbar,
  sisipkan,
}: {
  block: Block;
  state: RenderState;
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
      const kJudul = VERSI[state].judul;
      const kIsi = VERSI[state].isi;
      return (
        <>
          <p className="text-body-small text-on-surface-variant">Editing the {VERSI[state].panjang} version. Switch versions in the Editing row or in the preview.</p>
          <TextField label="Title" value={block[kJudul]} maxLength={120} onFocus={(e) => onFokus(kJudul, e.currentTarget)} onChange={(e) => onUbah({ [kJudul]: e.target.value } as Partial<Block>)} />
          {toolbar(kIsi)}
          <TeksTumbuh label="Greeting" value={block[kIsi]} maxLength={2000} onFocus={(e) => onFokus(kIsi, e.currentTarget)} onChange={(e) => onUbah({ [kIsi]: e.target.value } as Partial<Block>)} />
          {sisipkan}
        </>
      );
    }
    case "teks":
      return (
        <>
          {toolbar("isi")}
          <TeksTumbuh label="Text" value={block.isi} maxLength={2000} onFocus={(e) => onFokus("isi", e.currentTarget)} onChange={(e) => onUbah({ isi: e.target.value })} />
          {sisipkan}
        </>
      );
    case "info":
      return (
        <>
          <TextField label="Box title" value={block.judul} maxLength={120} onFocus={(e) => onFokus("judul", e.currentTarget)} onChange={(e) => onUbah({ judul: e.target.value })} />
          {toolbar("isi")}
          <TeksTumbuh label="Body" value={block.isi} maxLength={2000} onFocus={(e) => onFokus("isi", e.currentTarget)} onChange={(e) => onUbah({ isi: e.target.value })} />
          {sisipkan}
        </>
      );
    case "gambar":
      return (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- gambar email dari storage, bukan aset halaman */}
          {block.url ? <img src={block.url} alt="" className="max-h-40 w-auto self-start rounded-sm border border-outline-variant" /> : null}
          <label className="self-start">
            <span className="sr-only">Choose image</span>
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
                  toast.error("Couldn't upload image", "Use a PNG, JPG or WebP under 5 MB.");
                } finally {
                  setMengunggah(false);
                }
              }}
            />
            <span className="m3-state inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-outline px-4 text-label-large font-semibold text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-primary">
              <UploadSimple size={16} aria-hidden />
              {mengunggah ? "Uploading…" : block.url ? "Replace image" : "Upload image"}
            </span>
          </label>
          <p className="text-body-small text-on-surface-variant">Scaled down automatically to 1200 px wide. Don&apos;t put important information only in the image: many work email systems block images.</p>
          <TextField
            label="Alt text"
            value={block.alt}
            maxLength={200}
            onChange={(e) => onUbah({ alt: e.target.value })}
            hint="Shown when the image is blocked, and read aloud by screen readers. Example: Batik dress code guide."
            error={block.url && !block.alt.trim() ? "Required." : undefined}
          />
          <TextField label="Link when the image is clicked" optional value={block.href ?? ""} placeholder="https://" maxLength={600} onChange={(e) => onUbah({ href: e.target.value.trim() || undefined })} />
        </>
      );
    case "tombol": {
      const tujuan = [
        ...(data.member_on ? [{ value: "dashboard" as const, label: "My dashboard" }] : []),
        { value: "halaman" as const, label: "Event page" },
        { value: "url" as const, label: "Other link" },
      ];
      return (
        <>
          <TextField label="Button text" value={block.label} maxLength={40} onChange={(e) => onUbah({ label: e.target.value })} />
          <SegmentedButton
            label="Button destination"
            value={block.tujuan === "dashboard" && !data.member_on ? "halaman" : block.tujuan}
            onChange={(nilai) => onUbah({ tujuan: nilai })}
            options={tujuan}
            className="self-start"
          />
          {block.tujuan === "dashboard" && !data.member_on ? (
            <p className="text-body-small text-on-surface-variant">Participant area is off, so this button goes to the Event page.</p>
          ) : null}
          {block.tujuan === "url" ? (
            <TextField label="Link" value={block.url ?? ""} placeholder="https://" maxLength={600} onChange={(e) => onUbah({ url: e.target.value.trim() || undefined })} />
          ) : null}
        </>
      );
    }
    case "mitra":
      return (
        <>
          <TextField label="Title above the logos" value={block.judul} maxLength={120} onChange={(e) => onUbah({ judul: e.target.value })} />
          <p className="text-body-small text-on-surface-variant">
            {data.dasar.mitra.length
              ? `${plural(Math.min(8, data.dasar.mitra.length), "logo")} taken from the Event page (8 at most). Change the logos on the Event page.`
              : "No partner logos on the Event page yet, so this section is hidden."}{" "}
            <Link href="/admin/landing" className="font-semibold text-primary underline-offset-4 hover:underline">
              Open Event page
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
        Add section
      </Button>
      <Popover anchor={anchor} label="Add section" width={300} align="start">
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
        title="Email preview"
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
