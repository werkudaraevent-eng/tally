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
import { plural } from "@/lib/plural";
import { DEFAULT_CONTENT, FIELDS, type BlastKind } from "@/lib/pesan/bawaan";
import { AUDIENCE_LABEL, KIND_LABEL, TAMU } from "@/lib/pesan/label";

/**
 * Penyusun kiriman (gambar 2-tulis): saluran, jenis, penerima, isi, dan waktu
 * di kiri; pratinjau email dengan data peserta sungguhan di kanan.
 *
 * Setiap perubahan disimpan sendiri setelah jeda singkat, dan jawabannya
 * membawa hitungan penerima serta pratinjau yang baru. Hitungan itu yang
 * disebut di dialog konfirmasi, dan server menolak kiriman bila jumlahnya
 * sudah berubah sejak dialog dibuka.
 */

type Jenis = "semua" | "belum_masuk" | "manual" | "belum_dikirim" | "belum_daftar";
type Audience = { jenis: Jenis; perusahaan: string[]; ids: string[]; label?: string };
type SkipCode =
  | "tanpa_email" | "berhenti_email" | "email_memantul" | "area_mati" | "belum_boleh_masuk" | "di_luar_daftar_uji"
  | "sudah_daftar" | "sudah_peserta" | "terjadwal";

const ALASAN_LEWAT: Record<SkipCode, string> = {
  tanpa_email: "with no email",
  berhenti_email: "unsubscribed",
  email_memantul: "bounced before",
  area_mati: "blocked because the participant area is turned off",
  belum_boleh_masuk: "not allowed to sign in to the participant area yet",
  di_luar_daftar_uji: "not on the test list",
  sudah_daftar: "already registered",
  sudah_peserta: "already used by a participant",
  terjadwal: "already in another blast that hasn't finished",
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
  /** Invitation terkunci sampai pengirim undangan terpisah disiapkan. */
  invitation_sending?: { ok: true } | { ok: false; missing: string[] };
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

/** Sama dengan firstWaveSize di mesin pengirim: 10%, paling sedikit 25. */
function gelombangPertama(n: number) {
  return Math.min(n, Math.max(25, Math.ceil(n * 0.1)));
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

  /** Peserta atau Tamu undangan. Tamu hanya menerima Invitation. */
  function gantiKelompok(kelompok: "peserta" | "tamu") {
    const tamu = isi.kind === "invitation";
    if ((kelompok === "tamu") === tamu) return;
    const kind: BlastKind = kelompok === "tamu" ? "invitation" : "undangan";
    const lama = DEFAULT_CONTENT[isi.kind];
    const baru = DEFAULT_CONTENT[kind];
    ubah({
      kind,
      audience: { jenis: kelompok === "tamu" ? "belum_dikirim" : "belum_masuk", perusahaan: [], ids: [], label: undefined },
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
      toast.error("Test email not sent", body?.error?.message ?? "Couldn't save the draft. Try again.");
      return;
    }
    try {
      window.localStorage.setItem(KUNCI_EMAIL_TES, email);
    } catch {
      // Tidak diingat, tidak apa-apa.
    }
    setDialog(null);
    toast.success("Test email sent", `To ${email}. The subject starts with [TEST] and its links can't be used to sign in.`);
  }

  async function bukaKonfirmasi() {
    setSibuk(true);
    const ok = await simpan();
    setSibuk(false);
    if (!ok) {
      toast.error("Draft not saved yet", "Check your connection, then try again.");
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
        toast.warning("Number of recipients changed", "Participant data changed after the dialog opened. Check the new number, then send again.");
        return;
      }
      toast.error("Blast not sent", body?.error?.message ?? "Try again.");
      return;
    }
    setDialog(null);
    toast.success(jadwalIso ? "Blast scheduled" : "Blast sent", jadwalIso ? undefined : "Each recipient's status shows in the report.");
    onSent();
  }

  async function hapus() {
    setSibuk(true);
    if (pewaktu.current) clearTimeout(pewaktu.current);
    tertunda.current = null;
    const response = await fetch(`/api/admin/pesan/${id}`, { method: "DELETE" }).catch(() => null);
    setSibuk(false);
    if (!response?.ok) {
      toast.error("Draft not deleted", "Try again.");
      return;
    }
    router.push(withEventPrefix("/admin/pengumuman", window.location.pathname));
  }

  const { counts } = ringkas;
  const lewat = jumlahLewat(counts.skipped);
  const pilihPerusahaan = detail.companies.map((c) => ({ value: c.name, label: c.name, count: c.count }));
  const jadwalSalah = waktuKirim === "jadwal" && (!jadwal || jadwalLewat);
  const tamu = isi.kind === "invitation";
  const orang = (n: number) => plural(n, tamu ? "invited guest" : "participant");
  const undanganTerkunci = tamu && detail.invitation_sending?.ok === false;
  const bolehKirim =
    !undanganTerkunci && detail.email_configured && counts.email > 0 && ringkas.unknown_fields.length === 0 && isi.email_subject.trim() !== "" && isi.email_body.trim() !== "" && !jadwalSalah;
  const alasanTidakBoleh = undanganTerkunci
    ? "Invitation is locked until a separate invitation sender is set up."
    : !detail.email_configured
    ? "Email sending isn't set up on the server yet."
    : counts.email === 0
      ? "No recipients can be emailed yet."
      : ringkas.unknown_fields.length > 0
        ? "The text has a merge field that isn't recognised."
        : isi.email_subject.trim() === "" || isi.email_body.trim() === ""
          ? "Subject and body aren't complete yet."
          : jadwalSalah
            ? "Choose a send time that hasn't passed."
            : null;

  return (
    <div lang="en" className="contents">
    <WorkspacePage className="pb-0">
      <WorkspaceHeader
        title={isi.title || "Untitled blast"}
        back={
          <Link href="/admin/pengumuman" className="inline-flex items-center gap-1.5 rounded-sm text-body-medium font-medium text-primary hover:underline">
            <ArrowLeft size={14} aria-hidden />
            Messages
          </Link>
        }
        meta={
          <>
            <span>Draft</span>
            <MetaSeparator />
            <span aria-live="polite" className={galatSimpan ? "text-error" : undefined}>
              {menyimpan ? "Saving…" : galatSimpan ? "Not saved yet. Retries when you make your next change" : "Saved automatically"}
            </span>
          </>
        }
        actions={
          <Button variant="text" onClick={() => setDialog("hapus")} icon={<Trash size={16} />}>
            Delete draft
          </Button>
        }
      />

      {!detail.email_configured ? (
        <Banner tone="warning" icon={<Warning size={18} />}>
          Email sending isn&apos;t set up on the server yet (RESEND_API_KEY and EMAIL_FROM). You can still write drafts.
        </Banner>
      ) : detail.test_mode !== "off" ? (
        <Banner tone="info" icon={<Info size={18} />}>
          Test mode: only addresses on the test list (MESSAGING_ALLOWLIST) receive email. Other participants count as Skipped.
        </Banner>
      ) : null}

      <SupportingPane
        paneWidth={440}
        main={
          <div className="self-start rounded-lg border border-outline-variant bg-surface-container-lowest">
            <Baris judul="Channel" id="saluran">
              <SegmentedButton
                label="Channel"
                labelledBy="saluran"
                value="email"
                onChange={() => undefined}
                options={[
                  { value: "email", label: "Email" },
                  { value: "whatsapp", label: "WhatsApp", disabled: true },
                ]}
                className="self-start"
              />
              <p className="text-body-small text-on-surface-variant">WhatsApp becomes available once a WhatsApp Business account is connected.</p>
            </Baris>

            <Baris judul="Send to" id="kelompok">
              <SegmentedButton
                label="Send to"
                labelledBy="kelompok"
                value={tamu ? "tamu" : "peserta"}
                onChange={gantiKelompok}
                options={[
                  { value: "peserta", label: AUDIENCE_LABEL.peserta },
                  { value: "tamu", label: AUDIENCE_LABEL.tamu },
                ]}
                className="self-start"
              />
              {undanganTerkunci ? (
                <Banner tone="warning" icon={<Warning size={18} />}>
                  Invitation is locked until the system owner sets up a separate invitation sender
                  ({detail.invitation_sending?.ok === false ? detail.invitation_sending.missing.join(", ") : ""}). You can still write drafts.
                </Banner>
              ) : null}
            </Baris>

            <Baris judul="Type" id="jenis">
              <SegmentedButton
                label="Blast type"
                labelledBy="jenis"
                value={isi.kind}
                onChange={gantiJenis}
                options={tamu
                  ? [{ value: "invitation" as const, label: KIND_LABEL.invitation }]
                  : [
                      { value: "undangan" as const, label: KIND_LABEL.undangan },
                      { value: "info" as const, label: KIND_LABEL.info },
                    ]}
                className="self-start"
              />
              <p className="text-body-small text-on-surface-variant">
                {isi.kind === "undangan"
                  ? "Each email has a personal sign-in button. It works once and expires after 7 days."
                  : tamu
                    ? "An invitation to register. Each email has a personal link to the form, with the invited guest's name already filled in. Sent gradually: about 10% first, the rest after 15 minutes if few bounce."
                    : "A regular email with a button to the event page. It has no sign-in link."}
              </p>
              {isi.kind === "undangan" && !detail.member_enabled ? (
                <Banner tone="warning" icon={<Warning size={18} />}>
                  The participant area is turned off, so sign-in links won&apos;t work. Turn it on in Participant area first.
                </Banner>
              ) : null}
            </Baris>

            <Baris judul="Recipients" id="penerima">
              {/* Satu keluarga kontrol dengan baris Saluran, Jenis, dan Waktu kirim:
                  pilihan tunggal = tombol bersegmen. Perusahaan penyaring
                  tambahan di barisnya sendiri, chip menu yang sama dengan
                  Daftar peserta. */}
              <SegmentedButton
                label="Recipients"
                labelledBy="penerima"
                value={isi.audience.jenis}
                onChange={(jenis) => {
                  if (jenis !== "manual") gantiAudience({ jenis, ids: [], label: undefined });
                }}
                options={[
                  ...(isi.audience.jenis === "manual"
                    ? [{ value: "manual" as const, label: isi.audience.label || `${orang(isi.audience.ids.length)} selected` }]
                    : []),
                  ...(tamu
                    ? [
                        { value: "belum_dikirim" as const, label: "Not sent yet" },
                        { value: "belum_daftar" as const, label: "Not registered yet" },
                      ]
                    : [
                        { value: "semua" as const, label: "All participants" },
                        { value: "belum_masuk" as const, label: "Never signed in" },
                      ]),
                ]}
                className="self-start"
              />
              {tamu && counts.total === 0 ? (
                <Link href="/admin/registrasi" className="self-start rounded-sm text-body-medium font-medium text-primary hover:underline">{TAMU.emptyComposer}</Link>
              ) : null}
              {!tamu && pilihPerusahaan.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body-small text-on-surface-variant">Filter:</span>
                  <ChipMenu
                    label="Organisation"
                    options={pilihPerusahaan}
                    selected={isi.audience.perusahaan}
                    onChange={(perusahaan) => gantiAudience({ perusahaan })}
                    multiple
                    searchable
                  />
                </div>
              ) : null}
              <p className="text-body-medium text-on-surface-variant" aria-live="polite">
                <span className="font-semibold text-on-surface tabular-nums">{orang(counts.email)}</span> will get the email
                {lewat > 0 ? (
                  <>
                    {" "}
                    · <span className="tabular-nums">{lewat}</span> skipped: {kalimatLewat(counts.skipped)}
                  </>
                ) : null}
              </p>
            </Baris>

            <Baris judul="Email" id="isi-email">
              <TextField
                label="Subject"
                value={isi.email_subject}
                maxLength={200}
                onFocus={(e) => (kolomTerakhir.current = { jenis: "subjek", el: e.currentTarget })}
                onChange={(e) => ubah({ email_subject: e.target.value })}
              />
              <TextArea
                label="Body"
                rows={9}
                value={isi.email_body}
                maxLength={5000}
                onFocus={(e) => (kolomTerakhir.current = { jenis: "isi", el: e.currentTarget })}
                onChange={(e) => ubah({ email_body: e.target.value })}
                hint={isi.kind === "undangan" ? "A “Masuk ke acara” button is added below the text automatically." : tamu ? "A “Daftar sekarang” button with the invited guest's personal link is added below the text automatically." : "A “Buka halaman acara” button is added below the text automatically."}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body-small text-on-surface-variant">Insert:</span>
                {FIELDS.map((f) => (
                  <Button key={f.key} size="sm" variant="outlined" onMouseDown={(e) => e.preventDefault()} onClick={() => sisipkan(f.key)}>
                    {f.label}
                  </Button>
                ))}
              </div>
              {ringkas.unknown_fields.length > 0 ? (
                <p role="alert" className="text-body-small text-error">
                  Unrecognised merge fields: {ringkas.unknown_fields.map((k) => `{${k}}`).join(", ")}. Use the Insert buttons so the spelling is exact.
                </p>
              ) : null}
            </Baris>

            <Baris judul="Send" id="waktu-kirim">
              <SegmentedButton
                label="Send"
                labelledBy="waktu-kirim"
                value={waktuKirim}
                onChange={setWaktuKirim}
                options={[
                  { value: "sekarang", label: "Now" },
                  { value: "jadwal", label: "Schedule", disabled: detail.test_mode !== "off" },
                ]}
                className="self-start"
              />
              {detail.test_mode !== "off" ? <p className="text-body-small text-on-surface-variant">Scheduling is only available on the main site.</p> : null}
              {waktuKirim === "jadwal" ? (
                <TextField
                  label="Date and time"
                  type="datetime-local"
                  value={jadwal}
                  onChange={(e) => {
                    setJadwal(e.target.value);
                    setJadwalLewat(Boolean(e.target.value) && new Date(e.target.value).getTime() < Date.now());
                  }}
                  hint="Uses your device's clock. Sending starts within a minute of this time."
                  error={jadwalLewat ? "This time has already passed." : undefined}
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
                <SelectField label="Preview as" value={sebagai ?? ""} onChange={(e) => void gantiSebagai(e.target.value)}>
                  {ringkas.sample_options.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectField>
              ) : null}
              <p className="text-body-medium">
                <span className="text-on-surface-variant">Subject </span>
                <span className="font-semibold text-on-surface">{ringkas.preview.subject}</span>
              </p>
            </div>
            <iframe
              title="Email preview"
              srcDoc={ringkas.preview.html}
              sandbox=""
              className="h-[520px] w-full border-0 bg-white"
            />
            <p className="border-t border-outline-variant px-5 py-3 text-body-small text-on-surface-variant">
              The preview uses real participant data. Its links are samples and can&apos;t be used to sign in.
            </p>
          </div>
        }
      />

      <div className="sticky bottom-0 z-10 -mx-4 mt-auto flex flex-wrap items-center gap-3 border-t border-outline-variant bg-surface px-4 py-3 sm:-mx-6 sm:px-6">
        <p className="min-w-0 flex-1 text-body-medium text-on-surface-variant">
          <span className="font-semibold text-on-surface tabular-nums">{orang(counts.email)}</span> · email
          {alasanTidakBoleh ? <span className="block text-body-small">{alasanTidakBoleh}</span> : null}
        </p>
        <Button variant="outlined" onClick={bukaTes}>
          Send test…
        </Button>
        <Button onClick={() => void bukaKonfirmasi()} disabled={!bolehKirim} loading={sibuk && dialog === null}>
          Review and send…
        </Button>
      </div>

      <Dialog
        open={dialog === "tes"}
        onClose={() => setDialog(null)}
        dismissible={!sibuk}
        title="Send test email"
        description="The test email uses this draft with the data of the participant being previewed. The subject starts with [TEST] and its links can't be used to sign in."
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
        <TextField
          label="Send to"
          type="email"
          autoComplete="email"
          value={emailTes}
          onChange={(e) => setEmailTes(e.target.value)}
          hint={detail.test_mode === "list" ? "Only addresses on the test list are accepted." : "This address is remembered for the next test."}
        />
      </Dialog>

      <Dialog
        open={dialog === "kirim"}
        onClose={() => setDialog(null)}
        dismissible={!sibuk}
        size="md"
        icon={<PaperPlaneTilt size={20} />}
        title={jadwalIso ? `Schedule for ${orang(counts.email)}?` : `Send to ${orang(counts.email)}?`}
        description={
          <>
            Sent emails can&apos;t be recalled.
            {isi.kind === "undangan" ? " Sign-in links work once and expire after 7 days. Older unused sign-in links stop working." : ""}
            {tamu && counts.email > gelombangPertama(counts.email)
              ? ` Sent in stages: ${plural(gelombangPertama(counts.email), "invitation")} first, the rest about 15 minutes later if few bounce and nobody reports spam.`
              : ""}
            {jadwalIso ? ` Sends ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(jadwalIso))}.` : ""}
          </>
        }
        actions={
          <>
            <Button variant="text" onClick={() => setDialog(null)} disabled={sibuk}>
              Cancel
            </Button>
            <Button onClick={() => void kirim()} loading={sibuk} disabled={counts.email === 0}>
              {jadwalIso ? "Schedule" : "Send now"}
            </Button>
          </>
        }
      >
        <dl className="divide-y divide-outline-variant border-y border-outline-variant text-body-medium">
          <div className="flex justify-between gap-4 py-3">
            <dt className="font-semibold">Email</dt>
            <dd className="tabular-nums">{plural(counts.email, "recipient")}</dd>
          </div>
          {lewat > 0 ? (
            <div className="flex justify-between gap-4 py-3 text-on-surface-variant">
              <dt>Skipped</dt>
              <dd className="text-end">
                <span className="tabular-nums">{lewat}</span>: {kalimatLewat(counts.skipped)}
              </dd>
            </div>
          ) : null}
        </dl>
        {counts.email > 100 ? (
          <p className="mt-3 text-body-small text-on-surface-variant">
            The free Resend plan only sends 100 emails a day. Make sure the plan is Pro. If not, the rest fail and can be retried tomorrow.
          </p>
        ) : null}
        {detail.test_mode === "list" ? (
          <p className="mt-3 text-body-small text-on-surface-variant">Test mode: only addresses on the test list actually receive it.</p>
        ) : null}
      </Dialog>

      <Dialog
        open={dialog === "hapus"}
        onClose={() => setDialog(null)}
        dismissible={!sibuk}
        tone="danger"
        title="Delete this draft?"
        description="Its content and recipient choices are lost. Nothing has been sent yet."
        actions={
          <>
            <Button variant="text" onClick={() => setDialog(null)} disabled={sibuk}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void hapus()} loading={sibuk}>
              Delete draft
            </Button>
          </>
        }
      />
    </WorkspacePage>
    </div>
  );
}
