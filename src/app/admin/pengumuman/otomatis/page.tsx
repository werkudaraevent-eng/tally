"use client";

import { ArrowsOut, PaperPlaneTilt, Warning, X } from "@phosphor-icons/react";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banner, Button, Dialog, IconButton, MetaSeparator, PageLoading, SegmentedButton, SelectField, SupportingPane, Switch, TextField, WorkspaceHeader, WorkspacePage } from "@/components/m3";
import { useToast } from "@/components/toast";
import { belumDiterjemahkan, untukBahasa, type BahasaKirim, type EmailLang } from "@/lib/email/konfirmasi/bahasa";
import { renderKonfirmasi, type RenderState } from "@/lib/email/konfirmasi/render";
import { FONT_LABELS, FONT_NOTES, FONTS, newBlock, PRESETS, templatSchema, unknownFieldsIn, type Block, type BlockType, type Font, type Templat } from "@/lib/email/konfirmasi/templat";
import { cx } from "@/lib/m3/cx";
import { FIELDS } from "@/lib/pesan/bawaan";
import { plural } from "@/lib/plural";
import { PesanTabs } from "../pesan-tabs";
import { buatKepala, buatLogoPutih, unggah } from "./gambar";
import { KODE_CONTOH, KUNCI_EMAIL_TES, NAMA_BAHASA, PILIHAN_BAHASA_EDIT, PILIHAN_VERSI, VERSI, type Data, type KolomTeks, type Pengirim } from "./bersama";
import { Baris, DialogPengirim, PilihanRadio, RingkasanPengirim, SakelarJejak } from "./pengirim";
import { BarisBagian, EditorBagian, KartuPreset, PratinjauEmail, TambahBagian, Toolbar, logoKepala, ringkasan } from "./editor";

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

export default function EmailOtomatisPage() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [galatMuat, setGalatMuat] = useState(false);
  const [templat, setTemplat] = useState<Templat | null>(null);
  const [kirimMenunggu, setKirimMenunggu] = useState(true);
  const [berubah, setBerubah] = useState(false);
  const [state, setState] = useState<RenderState>("approved");
  const [bahasaEdit, setBahasaEdit] = useState<EmailLang>("id");
  const [pengirim, setPengirim] = useState<Pengirim | null>(null);
  const [besar, setBesar] = useState(false);
  const [layar, setLayar] = useState<"desktop" | "ponsel">("desktop");
  const [sebagai, setSebagai] = useState<string>("");
  const [terbuka, setTerbuka] = useState<string | null>("pembuka");
  const [qrContoh, setQrContoh] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [dialog, setDialog] = useState<null | "tes" | "kirim" | "pengirim">(null);
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

  // Pengirim dibaca terpisah: gagal memuatnya tidak boleh menghalangi editor templat.
  const muatPengirim = useCallback(async () => {
    const response = await fetch("/api/settings", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const body = (await response.json()) as Pengirim;
    setPengirim({ email_sender_name: body.email_sender_name ?? null, email_reply_to: body.email_reply_to ?? null, email_default: body.email_default ?? null });
  }, []);

  useEffect(() => {
    // Muat sekali saat halaman dibuka.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void muat();
    void muatPengirim();
    void QRCode.toDataURL(KODE_CONTOH, { errorCorrectionLevel: "H", margin: 4, width: 320 }).then(setQrContoh);
  }, [muat, muatPengirim]);

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
    // Pratinjau mengikuti bahasa yang sedang diedit; renderKonfirmasi memilih teks English sendiri dari ctx.lang.
    const dasar = bahasaEdit === "en" ? data.dasar_en : data.dasar;
    const nama = contoh?.name ?? (bahasaEdit === "en" ? "Alex Tan" : "Budi Santoso");
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
        ...dasar,
        state,
        values: { nama, perusahaan: contoh?.company ?? "", acara: dasar.eventName, tanggal: dasar.detail.tanggal ?? "" },
        qr: state === "approved" ? { code: KODE_CONTOH, src: qrContoh } : null,
        codeUrl: state === "approved" ? dasar.halamanUrl : null,
        // Contoh tautan: kotak Akun Dashboard saya hanya ikut untuk pendaftar yang membuat akun saat mendaftar.
        akunUrl: data.member_on ? dasar.halamanUrl : null,
      });
    } catch {
      return null;
    }
  }, [data, templat, state, bahasaEdit, contoh, qrContoh, gambarLokal]);

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
  const en = bahasaEdit === "en";
  // Yang benar-benar diterima pendaftar English: dipakai untuk placeholder dan ringkasan baris.
  const templatEn = untukBahasa(t, "en");
  const belum = belumDiterjemahkan(t);
  const namaVersi = `${NAMA_BAHASA[bahasaEdit]} · ${versi.panjang}`;

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

  /** Kolom dalam bahasa yang sedang diedit: English disimpan di `en` milik templat atau bagian. */
  function nilaiKolom(k: KolomTeks): string {
    if (k.blockId === "subjek") return en ? t.en?.[versi.subjek] ?? "" : t[versi.subjek];
    const block = t.blocks.find((item) => item.id === k.blockId) as (Record<string, unknown> & { en?: Record<string, unknown> }) | undefined;
    const sumber = en ? block?.en : block;
    return typeof sumber?.[k.kunci] === "string" ? (sumber[k.kunci] as string) : "";
  }

  function tulisKolom(k: KolomTeks, nilai: string) {
    if (k.blockId === "subjek") ubah(en ? { en: { ...t.en, [versi.subjek]: nilai } } : { [versi.subjek]: nilai });
    else if (en) {
      const block = t.blocks.find((item) => item.id === k.blockId) as { en?: Record<string, unknown> } | undefined;
      ubahBlock(k.blockId, { en: { ...block?.en, [k.kunci]: nilai } } as Partial<Block>);
    } else ubahBlock(k.blockId, { [k.kunci]: nilai } as Partial<Block>);
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
      body: JSON.stringify({ email, state, lang: bahasaEdit, templat: siap, sebagai: sebagai || null }),
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
    toast.success("Test email sent", `To ${email}, ${namaVersi} version. The subject starts with [TEST].`);
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

      {/* Panel pratinjau menempel setinggi layar dan bergulir sendiri, supaya
          pratinjau tetap terlihat saat panitia mengetik di bagian bawah editor.
          Kepala panelnya ringkas dan catatan ikut bergulir, agar ruang email
          terbesar di layar pendek. Perbesar membuka email penuh 1:1. */}
      <SupportingPane
        paneWidth={440}
        terkunci
        main={
          <div className="flex w-full min-w-0 flex-col gap-4 self-start">
          <div className="@container w-full min-w-0 rounded-lg border border-outline-variant bg-surface-container-lowest">
            <div className="border-b border-outline-variant px-5 py-5">
              <h2 className="text-title-large font-semibold text-on-surface">Registration confirmation</h2>
              <p className="mt-1 max-w-[40rem] text-body-medium text-on-surface-variant">
                Sent to every registrant. The Approved version (sent straight away, or when staff approve) carries the check-in QR code. Events with moderation also send the Pending approval version on registration.
              </p>
            </div>

            <Baris judul="Sender" id="pengirim">
              <RingkasanPengirim pengirim={pengirim} />
              <Button variant="outlined" size="sm" className="self-start" onClick={() => setDialog("pengirim")} disabled={!pengirim}>
                Change…
              </Button>
            </Baris>

            <Baris judul="Email language" id="bahasa-kirim">
              <div role="radiogroup" aria-labelledby="bahasa-kirim" className="flex flex-col gap-2">
                {(
                  [
                    ["ikuti", "Match the registration form", `Recommended. The English registration form sends English; everything else sends ${NAMA_BAHASA[data.bahasa_utama]}.`],
                    ["id", "Always Indonesian", null],
                    ["en", "Always English", null],
                  ] as const satisfies readonly (readonly [BahasaKirim, string, string | null])[]
                ).map(([value, label, keterangan]) => (
                  <PilihanRadio key={value} name="bahasa-kirim" checked={t.bahasa === value} onSelect={() => ubah({ bahasa: value })} label={label} description={keterangan} />
                ))}
              </div>
              {t.bahasa === "ikuti" && !data.en_tersedia ? (
                <p className="text-body-small text-on-surface-variant">This event has no English page, so everyone gets {NAMA_BAHASA[data.bahasa_utama]}.</p>
              ) : null}
              {t.bahasa === "en" && !data.en_tersedia ? (
                <Banner tone="warning" icon={<Warning size={18} />}>
                  This event has no English page. The event name, date and venue stay as typed in the event details, and links open the Indonesian pages.
                </Banner>
              ) : null}
              <p className="text-body-small text-on-surface-variant">Applies to emails sent after you save. Emails already sent don&apos;t change.</p>
            </Baris>

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
              <div className="flex flex-col gap-2">
                <p id="versi-edit" className="text-body-medium font-medium text-on-surface">
                  Version being edited
                </p>
                <SegmentedButton<RenderState> label="Version being edited" labelledBy="versi-edit" value={state} onChange={setState} options={PILIHAN_VERSI} className="self-start" />
                <p className="text-body-small text-on-surface-variant">
                  {state === "rejected"
                    ? "The Rejected version has only the Header and Opening."
                    : "Subject, title and greeting differ per version. Other sections are shared by Approved and Pending."}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <p id="bahasa-edit" className="text-body-medium font-medium text-on-surface">
                  Language being edited
                </p>
                <SegmentedButton<EmailLang> label="Language being edited" labelledBy="bahasa-edit" value={bahasaEdit} onChange={setBahasaEdit} options={PILIHAN_BAHASA_EDIT} className="w-24 self-start" />
                <p role="status" className={cx("flex items-center gap-2 text-body-small", belum.length ? "font-medium text-on-warning-soft" : "text-on-surface-variant")}>
                  {belum.length ? <span aria-hidden className="size-2 shrink-0 rounded-full bg-warning" /> : null}
                  {belum.length
                    ? `${plural(belum.length, "text")} not translated yet`
                    : en
                      ? "All text translated"
                      : "English fields left empty use the English default."}
                </p>
              </div>
              {en ? (
                <TextField
                  label={`Subject (${versi.label})`}
                  value={t.en?.[versi.subjek] ?? ""}
                  placeholder={templatEn[versi.subjek]}
                  maxLength={150}
                  hint={`Empty: uses the English default. Indonesian: “${t[versi.subjek]}”`}
                  onFocus={(e) => (kolomTerakhir.current = { blockId: "subjek", kunci: "subjek", el: e.currentTarget })}
                  onChange={(e) => ubah({ en: { ...t.en, [versi.subjek]: e.target.value } })}
                />
              ) : (
                <TextField
                  label={`Subject (${versi.label})`}
                  value={t[versi.subjek]}
                  maxLength={150}
                  onFocus={(e) => (kolomTerakhir.current = { blockId: "subjek", kunci: "subjek", el: e.currentTarget })}
                  onChange={(e) => ubah({ [versi.subjek]: e.target.value })}
                />
              )}
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
                  ringkas={ringkasan(en ? templatEn.blocks[index] ?? block : block, data, state)}
                  belumDiterjemahkan={en && belum.some((kolom) => kolom.blockId === block.id)}
                  onBuka={() => setTerbuka((lama) => (lama === block.id ? null : block.id))}
                  onNyala={(on) => ubahBlock(block.id, { on } as Partial<Block>)}
                  onGeser={(arah) => geser(block.id, arah)}
                  onHapus={() => hapus(block.id)}
                >
                  <EditorBagian
                    block={block}
                    blockEn={en ? templatEn.blocks[index] ?? block : null}
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

          {/* Pelacakan untuk email pengumuman dan blast: kartu sendiri, bukan
              bagian email konfirmasi (temuan QA L6). */}
          <section id="jejak" aria-labelledby="judul-jejak" className="scroll-mt-4 rounded-lg border border-outline-variant bg-surface-container-lowest px-5 py-5">
            <h2 id="judul-jejak" className="text-title-large font-semibold text-on-surface">Announcement and blast emails</h2>
            <p className="mt-1 max-w-[40rem] text-body-medium text-on-surface-variant">Tracking for the emails sent from Announcements and Blasts. Registration confirmations and sign-in links are never tracked.</p>
            <div className="mt-4 flex flex-col gap-3">
              <SakelarJejak />
            </div>
          </section>
          </div>
        }
        pane={
          <div className="flex w-full min-w-0 flex-none! flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest lg:sticky lg:top-[calc(var(--workspace-top,58px)+16px)] lg:max-h-[calc(100dvh-var(--workspace-top,58px)-104px)]">
            <div className="flex flex-col gap-3 border-b border-outline-variant px-5 py-3">
              <div className="flex items-center gap-3">
                <h2 className="min-w-0 flex-1 truncate text-title-small font-semibold text-on-surface">Preview: {namaVersi}</h2>
                <Button variant="outlined" size="sm" icon={<ArrowsOut size={16} />} onClick={() => setBesar(true)}>
                  Enlarge
                </Button>
              </div>
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
              <p className="border-t border-outline-variant bg-surface-container-lowest px-5 py-3 text-body-small text-on-surface-variant">
                The preview uses a real registrant&apos;s data; the QR code and links are samples.{data.member_on ? " The Participant area account box only appears for registrants who create an account when they register." : ""}
              </p>
            </div>
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
        description={`The ${namaVersi} version with the content on screen (saved or not) and the data of the registrant in the preview. The subject starts with [TEST]; the QR code and links are samples.`}
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

      <DialogPengirim
        open={dialog === "pengirim"}
        pengirim={pengirim}
        onClose={() => setDialog(null)}
        onTersimpan={(baru) => {
          setPengirim(baru);
          setDialog(null);
        }}
      />

      <Dialog open={besar} onClose={() => setBesar(false)} title={`Email preview: ${namaVersi}`} bare className="flex h-[90dvh] max-w-[760px]! flex-col overflow-hidden!">
        <div className="flex flex-wrap items-center gap-3 border-b border-outline-variant px-5 py-3">
          <h2 className="min-w-0 flex-1 truncate text-title-medium font-semibold text-on-surface">{namaVersi}</h2>
          <SegmentedButton<"desktop" | "ponsel">
            label="Preview width"
            value={layar}
            onChange={setLayar}
            options={[
              { value: "desktop", label: "Desktop" },
              { value: "ponsel", label: "Mobile" },
            ]}
            className="max-sm:order-last max-sm:basis-full"
          />
          <IconButton label="Close preview" onClick={() => setBesar(false)}>
            <X size={20} />
          </IconButton>
        </div>
        <p className="border-b border-outline-variant px-5 py-2 text-body-medium">
          <span className="text-on-surface-variant">Subject </span>
          <span className="font-semibold text-on-surface">{pratinjau?.subject ?? "-"}</span>
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto bg-surface-container py-4">
          <PratinjauEmail html={pratinjau?.html ?? ""} lebar={lebarPratinjau} />
        </div>
      </Dialog>
    </WorkspacePage>
    </div>
  );
}
