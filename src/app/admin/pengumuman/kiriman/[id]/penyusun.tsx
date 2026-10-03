"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Info, PaperPlaneTilt, Trash, Warning } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/event-link";
import {
  Banner,
  Button,
  ChipMenu,
  Dialog,
  MetaSeparator,
  SegmentedButton,
  SelectField,
  SupportingPane,
  TextArea,
  TextField,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import { withEventPrefix } from "@/lib/event-path";
import { DEFAULT_CONTENT, FIELDS, type BlastKind } from "@/lib/pesan/bawaan";

/**
 * Penyusun kiriman (gambar 2-tulis): saluran, jenis, penerima, isi, dan waktu
 * di kiri; pratinjau email dengan data peserta sungguhan di kanan.
 *
 * Setiap perubahan disimpan sendiri setelah jeda singkat, dan jawabannya
 * membawa hitungan penerima serta pratinjau yang baru. Hitungan itu yang
 * disebut di dialog konfirmasi, dan server menolak kiriman bila jumlahnya
 * sudah berubah sejak dialog dibuka.
 */

type Jenis = "semua" | "belum_masuk" | "manual";
type Audience = { jenis: Jenis; perusahaan: string[]; ids: string[]; label?: string };
type SkipCode = "tanpa_email" | "berhenti_email" | "email_memantul" | "area_mati" | "belum_boleh_masuk" | "di_luar_daftar_uji";

const ALASAN_LEWAT: Record<SkipCode, string> = {
  tanpa_email: "tidak punya email",
  berhenti_email: "berhenti menerima email",
  email_memantul: "email pernah memantul",
  area_mati: "Area peserta belum dinyalakan",
  belum_boleh_masuk: "belum boleh masuk Area peserta",
  di_luar_daftar_uji: "di luar daftar uji",
};

type Ringkas = {
  counts: { total: number; email: number; skipped: Partial<Record<SkipCode, number>> };
  sample: { id: string; name: string; email: string | null } | null;
  sample_options: { id: string; name: string }[];
  preview: { subject: string; html: string; text: string };
  unknown_fields: string[];
};

export type DetailDraf = {
  blast: {
    id: string;
    title: string;
    kind: BlastKind;
    channel: "email" | "whatsapp" | "keduanya";
    audience: Partial<Audience> | null;
    email_subject: string;
    email_body: string;
    status: "draf";
  };
  draft: Ringkas;
  companies: { name: string; count: number }[];
  email_configured: boolean;
  member_enabled: boolean;
  test_mode: "off" | "list" | "blocked";
  time_zone?: string;
};

type Isi = { title: string; kind: BlastKind; audience: Audience; email_subject: string; email_body: string };

const KUNCI_EMAIL_TES = "tally:pesan:email-tes";

function bacaAudience(a: Partial<Audience> | null): Audience {
  return { jenis: a?.jenis ?? "semua", perusahaan: a?.perusahaan ?? [], ids: a?.ids ?? [], label: a?.label };
}

function jumlahLewat(skipped: Ringkas["counts"]["skipped"]) {
  return Object.values(skipped).reduce((a, b) => a + (b ?? 0), 0);
}

function kalimatLewat(skipped: Ringkas["counts"]["skipped"]) {
  return (Object.entries(skipped) as [SkipCode, number][])
    .filter(([, n]) => n > 0)
    .map(([kode, n]) => `${n} ${ALASAN_LEWAT[kode]}`)
    .join(" · ");
}

function Baris({ judul, children, id }: { judul: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="grid gap-3 border-b border-outline-variant px-5 py-5 last:border-b-0 md:grid-cols-[132px_minmax(0,1fr)]">
      <h2 id={id} className="pt-2 text-title-small font-semibold text-on-surface">
        {judul}
      </h2>
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}

export function Penyusun({ detail, onSent }: { detail: DetailDraf; onSent: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const id = detail.blast.id;
  const [isi, setIsi] = useState<Isi>(() => ({
    title: detail.blast.title,
    kind: detail.blast.kind,
    audience: bacaAudience(detail.blast.audience),
    email_subject: detail.blast.email_subject,
    email_body: detail.blast.email_body,
  }));
  const [ringkas, setRingkas] = useState<Ringkas>(detail.draft);
  const [sebagai, setSebagai] = useState<string | null>(detail.draft.sample?.id ?? null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galatSimpan, setGalatSimpan] = useState(false);
  const [waktuKirim, setWaktuKirim] = useState<"sekarang" | "jadwal">("sekarang");
  const [jadwal, setJadwal] = useState("");
  // Dihitung saat jadwal diubah, bukan saat render: Date.now() di render tidak murni.
  const [jadwalLewat, setJadwalLewat] = useState(false);
  const [dialog, setDialog] = useState<null | "tes" | "kirim" | "hapus">(null);
  const [emailTes, setEmailTes] = useState("");
  const [sibuk, setSibuk] = useState(false);

  // Perubahan yang belum terkirim ke server. Disimpan di ref supaya "Kirim tes"
  // dan "Tinjau dan kirim" bisa menyimpannya dulu tanpa menunggu jeda.
  const tertunda = useRef<Partial<Isi> | null>(null);
  const pewaktu = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Kolom terakhir yang difokus, tempat tombol Sisipkan menaruh kolom isian.
  const kolomTerakhir = useRef<{ jenis: "subjek" | "isi"; el: HTMLInputElement | HTMLTextAreaElement | null }>({ jenis: "isi", el: null });
  const sebagaiRef = useRef(sebagai);
  useEffect(() => {
    sebagaiRef.current = sebagai;
  }, [sebagai]);

  function bukaTes() {
    try {
      setEmailTes((lama) => lama || (window.localStorage.getItem(KUNCI_EMAIL_TES) ?? ""));
    } catch {
      // Penyimpanan peramban bisa ditolak; kolomnya cukup kosong.
    }
    setDialog("tes");
  }

  const simpan = useCallback(async () => {
    if (pewaktu.current) clearTimeout(pewaktu.current);
    pewaktu.current = null;
    const ubah = tertunda.current;
    if (!ubah) return true;
    tertunda.current = null;
    setMenyimpan(true);
    const q = sebagaiRef.current ? `?sebagai=${encodeURIComponent(sebagaiRef.current)}` : "";
    const response = await fetch(`/api/admin/pesan/${id}${q}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ubah),
    }).catch(() => null);
    setMenyimpan(false);
    if (!response?.ok) {
      // Kembalikan ke antrean supaya simpanan berikutnya ikut membawanya.
      tertunda.current = { ...ubah, ...(tertunda.current ?? {}) };
      setGalatSimpan(true);
      return false;
    }
    setGalatSimpan(false);
    const body = (await response.json()) as { draft: Ringkas };
    // Jawaban lama tidak boleh menimpa pratinjau bila ada ketikan baru sesudahnya.
    if (!tertunda.current) setRingkas(body.draft);
    return true;
  }, [id]);

  useEffect(() => () => {
    if (pewaktu.current) clearTimeout(pewaktu.current);
  }, []);

  function ubah(next: Partial<Isi>) {
    setIsi((lama) => ({ ...lama, ...next }));
    tertunda.current = { ...(tertunda.current ?? {}), ...next };
    if (pewaktu.current) clearTimeout(pewaktu.current);
    pewaktu.current = setTimeout(() => void simpan(), 600);
  }

  function gantiJenis(kind: BlastKind) {
    if (kind === isi.kind) return;
    const lama = DEFAULT_CONTENT[isi.kind];
    const baru = DEFAULT_CONTENT[kind];
    // Teks bawaan ikut berganti hanya bila panitia belum menyuntingnya.
    ubah({
      kind,
      title: isi.title === lama.title ? baru.title : isi.title,
      email_subject: isi.email_subject === lama.subject ? baru.subject : isi.email_subject,
      email_body: isi.email_body === lama.body ? baru.body : isi.email_body,
    });
  }

  function gantiAudience(next: Partial<Audience>) {
    ubah({ audience: { ...isi.audience, ...next } });
  }

  function sisipkan(kunci: string) {
    const token = `{${kunci}}`;
    const subjek = kolomTerakhir.current.jenis === "subjek";
    const el = kolomTerakhir.current.el;
    const nilai = subjek ? isi.email_subject : isi.email_body;
    const awal = el?.selectionStart ?? nilai.length;
    const akhir = el?.selectionEnd ?? nilai.length;
    const hasil = nilai.slice(0, awal) + token + nilai.slice(akhir);
    ubah(subjek ? { email_subject: hasil } : { email_body: hasil });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(awal + token.length, awal + token.length);
    });
  }

  async function gantiSebagai(pid: string) {
    setSebagai(pid);
    await simpan();
    const response = await fetch(`/api/admin/pesan/${id}?sebagai=${encodeURIComponent(pid)}`, { cache: "no-store" }).catch(() => null);
    if (response?.ok) setRingkas(((await response.json()) as { draft: Ringkas }).draft);
  }

  async function kirimTes() {
    const email = emailTes.trim();
    if (!email) return;
    setSibuk(true);
    const tersimpan = await simpan();
    const response = tersimpan
      ? await fetch("/api/admin/pesan/tes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blast_id: id, email, sebagai }),
        }).catch(() => null)
      : null;
    const body = await response?.json().catch(() => null);
    setSibuk(false);
    if (!response?.ok) {
      toast.error("Email tes tidak terkirim", body?.error?.message ?? "Simpan draf gagal. Coba lagi.");
      return;
    }
    try {
      window.localStorage.setItem(KUNCI_EMAIL_TES, email);
    } catch {
      // Tidak diingat, tidak apa-apa.
    }
    setDialog(null);
    toast.success("Email tes terkirim", `Ke ${email}. Subjeknya diawali [TES] dan tautannya tidak bisa dipakai masuk.`);
  }

  async function bukaKonfirmasi() {
    setSibuk(true);
    const ok = await simpan();
    setSibuk(false);
    if (!ok) {
      toast.error("Draf belum tersimpan", "Periksa koneksi lalu coba lagi.");
      return;
    }
    setDialog("kirim");
  }

  const jadwalIso = waktuKirim === "jadwal" && jadwal ? new Date(jadwal).toISOString() : null;

  async function kirim() {
    setSibuk(true);
    const response = await fetch(`/api/admin/pesan/${id}/kirim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expected: ringkas.counts.email, scheduled_at: jadwalIso }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setSibuk(false);
    if (!response?.ok) {
      if (body?.error?.code === "MESSAGE_COUNT_CHANGED" && body.error.details?.counts) {
        setRingkas((lama) => ({ ...lama, counts: body.error.details.counts }));
        toast.warning("Jumlah penerima berubah", "Data peserta berubah sejak dialog dibuka. Periksa angka barunya, lalu kirim lagi.");
        return;
      }
      toast.error("Kiriman tidak berangkat", body?.error?.message ?? "Coba lagi.");
      return;
    }
    setDialog(null);
    toast.success(jadwalIso ? "Kiriman dijadwalkan" : "Kiriman berangkat", jadwalIso ? undefined : "Status per peserta muncul di laporan.");
    onSent();
  }

  async function hapus() {
    setSibuk(true);
    if (pewaktu.current) clearTimeout(pewaktu.current);
    tertunda.current = null;
    const response = await fetch(`/api/admin/pesan/${id}`, { method: "DELETE" }).catch(() => null);
    setSibuk(false);
    if (!response?.ok) {
      toast.error("Draf tidak terhapus", "Coba lagi.");
      return;
    }
    router.push(withEventPrefix("/admin/pengumuman", window.location.pathname));
  }

  const { counts } = ringkas;
  const lewat = jumlahLewat(counts.skipped);
  const pilihPerusahaan = detail.companies.map((c) => ({ value: c.name, label: c.name, count: c.count }));
  const jadwalSalah = waktuKirim === "jadwal" && (!jadwal || jadwalLewat);
  const bolehKirim =
    detail.email_configured && counts.email > 0 && ringkas.unknown_fields.length === 0 && isi.email_subject.trim() !== "" && isi.email_body.trim() !== "" && !jadwalSalah;
  const alasanTidakBoleh = !detail.email_configured
    ? "Pengiriman email belum diaktifkan di server."
    : counts.email === 0
      ? "Belum ada penerima yang bisa dikirimi email."
      : ringkas.unknown_fields.length > 0
        ? "Ada kolom isian yang tidak dikenal di teks."
        : isi.email_subject.trim() === "" || isi.email_body.trim() === ""
          ? "Subjek dan isi email belum lengkap."
          : jadwalSalah
            ? "Pilih waktu kirim yang belum lewat."
            : null;

  return (
    <WorkspacePage className="pb-0">
      <WorkspaceHeader
        title={isi.title || "Kiriman tanpa judul"}
        back={
          <Link href="/admin/pengumuman" className="inline-flex items-center gap-1.5 rounded-sm text-body-medium font-medium text-primary hover:underline">
            <ArrowLeft size={14} aria-hidden />
            Pesan peserta
          </Link>
        }
        meta={
          <>
            <span>Draf</span>
            <MetaSeparator />
            <span aria-live="polite" className={galatSimpan ? "text-error" : undefined}>
              {menyimpan ? "Menyimpan…" : galatSimpan ? "Belum tersimpan, dicoba lagi saat Anda mengubah isi" : "Tersimpan otomatis"}
            </span>
          </>
        }
        actions={
          <Button variant="text" onClick={() => setDialog("hapus")} icon={<Trash size={16} />}>
            Hapus draf
          </Button>
        }
      />

      {!detail.email_configured ? (
        <Banner tone="warning" icon={<Warning size={18} />}>
          Pengiriman email belum diaktifkan di server (RESEND_API_KEY dan EMAIL_FROM). Draf tetap bisa disusun.
        </Banner>
      ) : detail.test_mode !== "off" ? (
        <Banner tone="info" icon={<Info size={18} />}>
          Mode uji: hanya alamat di daftar uji (MESSAGING_ALLOWLIST) yang menerima email. Peserta lain dihitung Dilewati.
        </Banner>
      ) : null}

      <SupportingPane
        paneWidth={440}
        main={
          <div className="self-start rounded-lg border border-outline-variant bg-surface-container-lowest">
            <Baris judul="Saluran" id="saluran">
              <SegmentedButton
                label="Saluran"
                labelledBy="saluran"
                value="email"
                onChange={() => undefined}
                options={[
                  { value: "email", label: "Email" },
                  { value: "whatsapp", label: "WhatsApp", disabled: true },
                ]}
                className="self-start"
              />
              <p className="text-body-small text-on-surface-variant">WhatsApp menyusul setelah akun WhatsApp Business terhubung.</p>
            </Baris>

            <Baris judul="Jenis" id="jenis">
              <SegmentedButton
                label="Jenis kiriman"
                labelledBy="jenis"
                value={isi.kind}
                onChange={gantiJenis}
                options={[
                  { value: "undangan", label: "Undangan masuk" },
                  { value: "info", label: "Kabar" },
                ]}
                className="self-start"
              />
              <p className="text-body-small text-on-surface-variant">
                {isi.kind === "undangan"
                  ? "Setiap email membawa tombol masuk pribadi, berlaku 7 hari dan sekali pakai."
                  : "Email biasa dengan tombol ke halaman acara. Tidak membawa tautan masuk."}
              </p>
              {isi.kind === "undangan" && !detail.member_enabled ? (
                <Banner tone="warning" icon={<Warning size={18} />}>
                  Area peserta belum dinyalakan, jadi undangan tidak bisa dipakai masuk. Nyalakan dulu di Area peserta.
                </Banner>
              ) : null}
            </Baris>

            <Baris judul="Penerima" id="penerima">
              {/* Satu keluarga kontrol dengan baris Saluran, Jenis, dan Waktu kirim:
                  pilihan tunggal = tombol bersegmen. Perusahaan penyaring
                  tambahan di barisnya sendiri, chip menu yang sama dengan
                  Daftar peserta. */}
              <SegmentedButton
                label="Penerima"
                labelledBy="penerima"
                value={isi.audience.jenis}
                onChange={(jenis) => {
                  if (jenis !== "manual") gantiAudience({ jenis, ids: [], label: undefined });
                }}
                options={[
                  ...(isi.audience.jenis === "manual"
                    ? [{ value: "manual" as const, label: isi.audience.label || `${isi.audience.ids.length} peserta dipilih` }]
                    : []),
                  { value: "semua" as const, label: "Semua peserta" },
                  { value: "belum_masuk" as const, label: "Belum pernah masuk" },
                ]}
                className="self-start"
              />
              {pilihPerusahaan.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body-small text-on-surface-variant">Hanya dari</span>
                  <ChipMenu
                    label="Perusahaan"
                    options={pilihPerusahaan}
                    selected={isi.audience.perusahaan}
                    onChange={(perusahaan) => gantiAudience({ perusahaan })}
                    multiple
                    searchable
                  />
                </div>
              ) : null}
              <p className="text-body-medium text-on-surface-variant" aria-live="polite">
                <span className="font-semibold text-on-surface tabular-nums">{counts.email} peserta</span> menerima email
                {lewat > 0 ? (
                  <>
                    {" "}
                    · <span className="tabular-nums">{lewat}</span> dilewati: {kalimatLewat(counts.skipped)}
                  </>
                ) : null}
              </p>
            </Baris>

            <Baris judul="Isi email" id="isi-email">
              <TextField
                label="Subjek"
                value={isi.email_subject}
                maxLength={200}
                onFocus={(e) => (kolomTerakhir.current = { jenis: "subjek", el: e.currentTarget })}
                onChange={(e) => ubah({ email_subject: e.target.value })}
              />
              <TextArea
                label="Isi"
                rows={9}
                value={isi.email_body}
                maxLength={5000}
                onFocus={(e) => (kolomTerakhir.current = { jenis: "isi", el: e.currentTarget })}
                onChange={(e) => ubah({ email_body: e.target.value })}
                hint={isi.kind === "undangan" ? "Tombol “Masuk ke acara” ditambahkan otomatis di bawah teks." : "Tombol “Buka halaman acara” ditambahkan otomatis di bawah teks."}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body-small text-on-surface-variant">Sisipkan:</span>
                {FIELDS.map((f) => (
                  <Button key={f.key} size="sm" variant="outlined" onMouseDown={(e) => e.preventDefault()} onClick={() => sisipkan(f.key)}>
                    {f.label}
                  </Button>
                ))}
              </div>
              {ringkas.unknown_fields.length > 0 ? (
                <p role="alert" className="text-body-small text-error">
                  Kolom isian tidak dikenal: {ringkas.unknown_fields.map((k) => `{${k}}`).join(", ")}. Pakai tombol Sisipkan supaya ejaannya tepat.
                </p>
              ) : null}
            </Baris>

            <Baris judul="Waktu kirim" id="waktu-kirim">
              <SegmentedButton
                label="Waktu kirim"
                labelledBy="waktu-kirim"
                value={waktuKirim}
                onChange={setWaktuKirim}
                options={[
                  { value: "sekarang", label: "Sekarang" },
                  { value: "jadwal", label: "Jadwalkan", disabled: detail.test_mode !== "off" },
                ]}
                className="self-start"
              />
              {detail.test_mode !== "off" ? <p className="text-body-small text-on-surface-variant">Jadwal kirim hanya di situs utama.</p> : null}
              {waktuKirim === "jadwal" ? (
                <TextField
                  label="Tanggal dan jam"
                  type="datetime-local"
                  value={jadwal}
                  onChange={(e) => {
                    setJadwal(e.target.value);
                    setJadwalLewat(Boolean(e.target.value) && new Date(e.target.value).getTime() < Date.now());
                  }}
                  hint="Mengikuti jam di perangkat Anda. Pengiriman mulai paling lambat satu menit setelahnya."
                  error={jadwalLewat ? "Waktu ini sudah lewat." : undefined}
                  className="max-w-xs"
                />
              ) : null}
            </Baris>
          </div>
        }
        pane={
          <div className="flex flex-col self-start overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest">
            <div className="flex flex-col gap-3 border-b border-outline-variant px-5 py-4">
              {ringkas.sample_options.length > 0 ? (
                <SelectField label="Pratinjau sebagai" value={sebagai ?? ""} onChange={(e) => void gantiSebagai(e.target.value)}>
                  {ringkas.sample_options.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectField>
              ) : null}
              <p className="text-body-medium">
                <span className="text-on-surface-variant">Subjek </span>
                <span className="font-semibold text-on-surface">{ringkas.preview.subject}</span>
              </p>
            </div>
            <iframe
              title="Pratinjau email"
              srcDoc={ringkas.preview.html}
              sandbox=""
              className="h-[520px] w-full border-0 bg-white"
            />
            <p className="border-t border-outline-variant px-5 py-3 text-body-small text-on-surface-variant">
              Pratinjau memakai data peserta sungguhan; tautannya contoh dan tidak bisa dipakai masuk.
            </p>
          </div>
        }
      />

      <div className="sticky bottom-0 z-10 -mx-4 mt-auto flex flex-wrap items-center gap-3 border-t border-outline-variant bg-surface px-4 py-3 sm:-mx-6 sm:px-6">
        <p className="min-w-0 flex-1 text-body-medium text-on-surface-variant">
          <span className="font-semibold text-on-surface tabular-nums">{counts.email} peserta</span> · email
          {alasanTidakBoleh ? <span className="block text-body-small">{alasanTidakBoleh}</span> : null}
        </p>
        <Button variant="outlined" onClick={bukaTes}>
          Kirim tes…
        </Button>
        <Button onClick={() => void bukaKonfirmasi()} disabled={!bolehKirim} loading={sibuk && dialog === null}>
          Tinjau dan kirim…
        </Button>
      </div>

      <Dialog
        open={dialog === "tes"}
        onClose={() => setDialog(null)}
        dismissible={!sibuk}
        title="Kirim email tes"
        description="Email tes memakai isi draf ini dengan data peserta yang sedang dipratinjau. Subjeknya diawali [TES] dan tautannya tidak bisa dipakai masuk."
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
        <TextField
          label="Kirim ke"
          type="email"
          autoComplete="email"
          value={emailTes}
          onChange={(e) => setEmailTes(e.target.value)}
          hint={detail.test_mode === "list" ? "Hanya alamat di daftar uji yang diterima." : "Alamat ini diingat untuk tes berikutnya."}
        />
      </Dialog>

      <Dialog
        open={dialog === "kirim"}
        onClose={() => setDialog(null)}
        dismissible={!sibuk}
        size="md"
        icon={<PaperPlaneTilt size={20} />}
        title={jadwalIso ? `Jadwalkan untuk ${counts.email} peserta?` : `Kirim ke ${counts.email} peserta?`}
        description={
          <>
            Email yang sudah terkirim tidak bisa ditarik.
            {isi.kind === "undangan" ? " Tautan masuk berlaku 7 hari dan sekali pakai; undangan lama yang belum dipakai ikut dicabut." : ""}
            {jadwalIso ? ` Berangkat ${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(jadwalIso))}.` : ""}
          </>
        }
        actions={
          <>
            <Button variant="text" onClick={() => setDialog(null)} disabled={sibuk}>
              Batal
            </Button>
            <Button onClick={() => void kirim()} loading={sibuk} disabled={counts.email === 0}>
              {jadwalIso ? "Jadwalkan" : `Kirim ke ${counts.email} peserta`}
            </Button>
          </>
        }
      >
        <dl className="divide-y divide-outline-variant border-y border-outline-variant text-body-medium">
          <div className="flex justify-between gap-4 py-3">
            <dt className="font-semibold">Email</dt>
            <dd className="tabular-nums">{counts.email} penerima</dd>
          </div>
          {lewat > 0 ? (
            <div className="flex justify-between gap-4 py-3 text-on-surface-variant">
              <dt>Dilewati</dt>
              <dd className="text-end">
                <span className="tabular-nums">{lewat}</span>: {kalimatLewat(counts.skipped)}
              </dd>
            </div>
          ) : null}
        </dl>
        {counts.email > 100 ? (
          <p className="mt-3 text-body-small text-on-surface-variant">
            Paket gratis Resend hanya mengirim 100 email per hari. Pastikan paketnya sudah Pro; bila belum, sisanya gagal dan bisa dikirim ulang besok.
          </p>
        ) : null}
        {detail.test_mode === "list" ? (
          <p className="mt-3 text-body-small text-on-surface-variant">Mode uji: hanya alamat di daftar uji yang benar-benar menerima.</p>
        ) : null}
      </Dialog>

      <Dialog
        open={dialog === "hapus"}
        onClose={() => setDialog(null)}
        dismissible={!sibuk}
        tone="danger"
        title="Hapus draf ini?"
        description="Isi dan pilihan penerimanya hilang. Belum ada yang terkirim."
        actions={
          <>
            <Button variant="text" onClick={() => setDialog(null)} disabled={sibuk}>
              Batal
            </Button>
            <Button variant="danger" onClick={() => void hapus()} loading={sibuk}>
              Hapus draf
            </Button>
          </>
        }
      />
    </WorkspacePage>
  );
}
