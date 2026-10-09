"use client";

import { ArrowSquareOut, MagnifyingGlass, Plus, Trash, Warning } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useToast } from "@/components/toast";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import {
  Banner, Button, ButtonLink, Dialog, EmptyState, MetaSeparator, PageLoading, Pane, PaneBody, PaneFooter, PaneHeader,
  SegmentedButton, SupportingPane, Switch, Tabs, TextField, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";
import type { LandingSpeaker, LandingSpeakerFrame } from "@/lib/domain";
import { eventApiPath } from "@/lib/event-url";
import { SOROTAN_MAKS, sesiDariRundown, speakerTabs } from "@/lib/landing-speaker-tabs";
import { samaJson } from "@/lib/landing-speakers-sama";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import { barisSesiDariAdmin, KolomPeran, PilihSesi, type BarisSesi } from "../landing/pilih-sesi";
import { agendaDariBaris, BINGKAI_KECIL, inisial, UrutanPembicara } from "../landing/urutan-pembicara";

// Halaman Speakers: daftar pembicara satu acara, dipindah dari panel sempit
// Halaman acara (24 pembicara x 7 kolom bertumpuk di satu panel). Pola Agenda:
// tab di atas, daftar di panel utama, penyunting satu orang di panel kanan.
//
// Tab sama dengan tab bagian Pembicara di halaman acara. "All" berisi semua
// orang dengan pencarian; tab lain berisi urutan tampil tab itu, yang diatur
// dengan pegangan geser seperti sebelumnya (UrutanPembicara).
//
// Penyimpanan: satu pembicara per Simpan, dan setiap geseran urutan langsung
// tersimpan. Server menulis hanya `landing_config.speakers` dan menolak (409)
// bila daftar tersimpan sudah berbeda dari yang terakhir dibaca layar ini.

type Payload = { speakers: LandingSpeaker[]; speaker_frame: LandingSpeakerFrame; layout: string; en_enabled: boolean };
type Pilihan = number | "baru" | null;
type Bahasa = "id" | "en";

const SEMUA = "semua";
/** Sama dengan batas skema (SPEAKERS_MAX). */
const MAKS = 60;

function Wajah({ speaker, bingkai, besar = false }: { speaker: LandingSpeaker; bingkai: LandingSpeakerFrame; besar?: boolean }) {
  return (
    <span aria-hidden className={cx("relative shrink-0 overflow-hidden bg-surface-container-high", besar ? "w-10" : "w-8", BINGKAI_KECIL[bingkai] ?? BINGKAI_KECIL.portrait)}>
      {speaker.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={speaker.photo_url} alt="" className={cx("absolute inset-0 size-full object-cover", bingkai === "circle" ? "object-top" : "object-[50%_20%]")} />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-label-small font-semibold text-primary">{inisial(speaker.name)}</span>
      )}
    </span>
  );
}

/** Label sesi seorang pembicara untuk baris daftar: "Sesi 1 · Breakout 2". */
function labelSesiPembicara(speaker: LandingSpeaker): string {
  if (sesiDariRundown(speaker)) return (speaker.session_refs ?? []).map((ref) => ref.label).filter(Boolean).join(" · ");
  return speaker.session?.trim() ?? "";
}

export default function SpeakersAdminPage() {
  const [tersimpan, setTersimpan] = useState<LandingSpeaker[] | null>(null);
  const [bingkai, setBingkai] = useState<LandingSpeakerFrame>("portrait");
  const [enAktif, setEnAktif] = useState(false);
  const [baris, setBaris] = useState<BarisSesi[] | null>(null);
  const [sesiMemuat, setSesiMemuat] = useState(true);
  const [tabKey, setTabKey] = useState<string>(SEMUA);
  const [pilihan, setPilihan] = useState<Pilihan>(null);
  const [draf, setDraf] = useState<LandingSpeaker | null>(null);
  const [bahasa, setBahasa] = useState<Bahasa>("id");
  const [cari, setCari] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  // Urutan baru yang sedang disimpan: langsung tampil, supaya fokus papan ketik
  // ikut orang yang dipindah. Kembali ke tersimpan bila gagal.
  const [urutanSementara, setUrutanSementara] = useState<LandingSpeaker[] | null>(null);
  const [konfirmasiHapus, setKonfirmasiHapus] = useState(false);
  const [tertunda, setTertunda] = useState<(() => void) | null>(null);
  const [error, setError] = useState("");
  const [halamanAcara, setHalamanAcara] = useState<string | null>(null);
  const toast = useToast();
  const idPeran = useId();

  const muatBaris = useCallback(async () => {
    const respon = await fetch(eventApiPath("/api/admin/rundown/sections"), { cache: "no-store" }).catch(() => null);
    const isi = respon?.ok ? await respon.json().catch(() => null) : null;
    // Gagal memuat ulang tidak menghapus daftar yang sudah ada.
    if (isi) setBaris(barisSesiDariAdmin(isi));
    setSesiMemuat(false);
  }, []);

  const muat = useCallback(async () => {
    const respon = await fetch(eventApiPath("/api/admin/speakers"), { cache: "no-store" }).catch(() => null);
    if (!respon) { setError("Connection lost. The speakers could not be loaded."); return; }
    if (!respon.ok) { setError("The speakers could not be loaded."); return; }
    const isi = (await respon.json()) as Payload;
    setTersimpan(isi.speakers);
    // Bingkai Forum dan Editorial tetap bulat atau potret; hanya Modern yang memakai pilihan ini.
    setBingkai(isi.layout === "modern" || !isi.layout ? isi.speaker_frame : "portrait");
    setEnAktif(isi.en_enabled);
    setError("");
  }, []);

  // setState langsung di badan effect ditolak React Compiler, jadi pemuatan awal
  // ditunda satu tick. Pola yang sama dipakai di seluruh halaman admin.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHalamanAcara(eventApiPath("/"));
      void muat();
      void muatBaris();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [muat, muatBaris]);

  // Baris rundown dimuat ulang saat tab ini kembali difokus: sesi yang baru
  // ditambahkan di Agenda (tab lain) harus bisa dipilih.
  useEffect(() => {
    let timer: number | undefined;
    const onFocus = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void muatBaris(), 300);
    };
    window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("focus", onFocus); window.clearTimeout(timer); };
  }, [muatBaris]);

  const asli = typeof pilihan === "number" ? tersimpan?.[pilihan] ?? null : null;
  const berubah = draf !== null && (pilihan === "baru" ? Boolean(draf.name.trim() || draf.photo_url || draf.title || draf.company) : !samaJson(draf, asli));

  // Peringatan bawaan peramban saat meninggalkan halaman dengan suntingan.
  useEffect(() => {
    if (!berubah) return;
    const tahan = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", tahan);
    return () => window.removeEventListener("beforeunload", tahan);
  }, [berubah]);

  // Daftar yang dilihat: tersimpan, dengan suntingan yang sedang dibuka di
  // tempatnya, supaya tab dan sesi di daftar ikut berubah selagi mengetik.
  const daftar = useMemo(() => {
    const dasar = urutanSementara ?? tersimpan ?? [];
    // Hanya bila berbeda: draf yang sama dengan tersimpan bisa basi selama
    // urutan baru sedang disimpan (posisi sesi orang itu ikut berubah).
    if (berubah && draf && typeof pilihan === "number" && pilihan < dasar.length) return dasar.map((speaker, i) => (i === pilihan ? draf : speaker));
    return dasar;
  }, [tersimpan, urutanSementara, draf, pilihan, berubah]);

  const tabs = useMemo(() => {
    const bertanda = daftar.map((speaker, i) => ({ ...speaker, _i: i }));
    return speakerTabs(bertanda, agendaDariBaris(baris), { highlights: "Highlights", others: "Other speakers" });
  }, [daftar, baris]);
  const tabAktif = tabs.find((tab) => tab.key === tabKey) ?? null;
  const kunciTab = tabAktif ? tabAktif.key : SEMUA;

  /** Jalankan `aksi`, atau tanya dulu bila suntingan yang terbuka belum disimpan. */
  function lindungi(aksi: () => void) {
    if (berubah) setTertunda(() => aksi);
    else aksi();
  }

  function buka(indeks: number) {
    if (pilihan === indeks) return;
    lindungi(() => {
      setPilihan(indeks);
      setDraf(tersimpan?.[indeks] ?? null);
      // Di layar sempit panel sunting ada di bawah daftar: dibawa ke layar.
      if (window.matchMedia("(max-width: 1023px)").matches) {
        window.setTimeout(() => document.querySelector('[aria-label="Speaker editor"]')?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
      }
    });
  }

  function mulaiBaru() {
    lindungi(() => {
      setPilihan("baru");
      setDraf({ name: "" });
      setBahasa("id");
      window.setTimeout(() => document.querySelector<HTMLInputElement>("[data-nama-pembicara]")?.focus(), 0);
    });
  }

  function tutup() {
    lindungi(() => { setPilihan(null); setDraf(null); });
  }

  function ubah(patch: Partial<LandingSpeaker>) {
    setDraf((kini) => (kini ? { ...kini, ...patch } : kini));
  }

  function ubahEn(patch: NonNullable<LandingSpeaker["en"]>) {
    setDraf((kini) => (kini ? { ...kini, en: { ...kini.en, ...patch } } : kini));
  }

  /**
   * Kirim daftar baru. `base` = daftar tersimpan yang dilihat layar ini. Hasil:
   * daftar dari server, atau null bila gagal (pesannya sudah tampil).
   */
  async function kirim(next: LandingSpeaker[]): Promise<LandingSpeaker[] | null> {
    if (!tersimpan) return null;
    setMenyimpan(true);
    try {
      const respon = await fetch(eventApiPath("/api/admin/speakers"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ base: tersimpan, speakers: next }),
      }).catch(() => null);
      if (!respon) { toast.error("Not saved", "Connection lost. Try again."); return null; }
      const isi = await respon.json().catch(() => null);
      if (respon.ok) {
        const hasil = (isi?.speakers ?? next) as LandingSpeaker[];
        setTersimpan(hasil);
        return hasil;
      }
      if (isi?.error?.code === "SPEAKERS_CHANGED" && Array.isArray(isi.error.details?.speakers)) {
        const terbaru = isi.error.details.speakers as LandingSpeaker[];
        // Suntingan yang terbuka tetap di layar, menempel ke orang yang sama
        // (dicari dari namanya) di daftar terbaru, supaya bisa disimpan lagi.
        const nama = asli?.name;
        setTersimpan(terbaru);
        if (typeof pilihan === "number") {
          const posisi = nama ? terbaru.findIndex((speaker) => speaker.name === nama) : -1;
          if (posisi >= 0) setPilihan(posisi);
          else { setPilihan(null); setDraf(null); }
        }
        toast.error("Not saved", isi.error.message);
        return null;
      }
      const rincian = isi?.error?.details?.fieldErrors ? " Check the fields and try again." : "";
      toast.error("Not saved", `${isi?.error?.message ?? "The speakers could not be saved."}${rincian}`);
      return null;
    } finally {
      setMenyimpan(false);
    }
  }

  async function simpanPembicara() {
    if (!draf || !tersimpan || menyimpan) return;
    if (!draf.name.trim()) {
      toast.error("Name required", "Fill in the speaker's name.");
      document.querySelector<HTMLInputElement>("[data-nama-pembicara]")?.focus();
      return;
    }
    const baru = pilihan === "baru";
    const indeks = baru ? tersimpan.length : (pilihan as number);
    const next = baru ? [...tersimpan, draf] : tersimpan.map((speaker, i) => (i === indeks ? draf : speaker));
    const hasil = await kirim(next);
    if (!hasil) return;
    setPilihan(indeks);
    setDraf(hasil[indeks] ?? null);
    toast.success(baru ? "Speaker added" : "Speaker saved");
  }

  async function hapus() {
    if (typeof pilihan !== "number" || !tersimpan) return;
    const nama = tersimpan[pilihan]?.name;
    const hasil = await kirim(tersimpan.filter((_, i) => i !== pilihan));
    setKonfirmasiHapus(false);
    if (!hasil) return;
    setPilihan(null);
    setDraf(null);
    toast.success("Speaker deleted", nama ? `${nama} is no longer on the event page.` : undefined);
  }

  async function aturUrutan(next: LandingSpeaker[]) {
    if (menyimpan || berubah) return;
    setUrutanSementara(next);
    const hasil = await kirim(next);
    setUrutanSementara(null);
    // Panel sunting mengikuti orang yang sama: geseran di tab Highlights
    // menukar posisi di daftar.
    if (hasil && typeof pilihan === "number" && draf) {
      const posisi = hasil.findIndex((speaker) => speaker.name === draf.name);
      setPilihan(posisi >= 0 ? posisi : null);
      setDraf(posisi >= 0 ? hasil[posisi]! : null);
    }
  }

  const terisi = daftar.filter((speaker) => speaker.name?.trim());
  const tanpaFoto = terisi.filter((speaker) => !speaker.photo_url).length;
  const disorot = daftar.filter((speaker, i) => speaker.featured && i !== pilihan).length;

  // ---- Panel utama ----------------------------------------------------------
  const kataCari = cari.trim().toLowerCase();
  const hasilCari = daftar
    .map((speaker, i) => ({ speaker, i }))
    .filter(({ speaker }) => !kataCari || [speaker.name, speaker.title, speaker.company].some((teks) => teks?.toLowerCase().includes(kataCari)));
  const tombolTambah = (
    <Button variant="outlined" size="sm" className="ml-auto" icon={<Plus size={16} />} onClick={mulaiBaru} disabled={daftar.length >= MAKS}>Add speaker</Button>
  );

  const utama = !tabAktif ? (
    <Pane aria-label="All speakers">
      <PaneHeader>
        <h2 className="text-body-medium font-semibold text-on-surface">All speakers</h2>
        <span className="tabular-nums text-body-medium text-on-surface-variant">{terisi.length}</span>
        {daftar.length > 6 ? (
          <label className="flex h-9 min-w-0 max-w-56 flex-1 items-center gap-2 rounded-lg border border-outline-variant px-2.5 text-on-surface-variant focus-within:border-primary">
            <MagnifyingGlass size={16} aria-hidden />
            <input
              type="search"
              value={cari}
              onChange={(event) => setCari(event.target.value)}
              placeholder="Search"
              aria-label="Search name, job title or organisation"
              className="min-w-0 flex-1 bg-transparent text-body-medium text-on-surface outline-none placeholder:text-on-surface-variant"
            />
          </label>
        ) : null}
        {tombolTambah}
      </PaneHeader>
      <PaneBody>
        {daftar.length === 0 ? (
          <EmptyState
            plain
            title="No speakers yet"
            description="Speakers appear in the Speakers section of the event page and next to their sessions in the agenda."
            action={<Button size="sm" icon={<Plus size={16} />} onClick={mulaiBaru}>Add speaker</Button>}
          />
        ) : hasilCari.length === 0 ? (
          <p className="px-4 py-6 text-body-medium text-on-surface-variant">No speaker matches &ldquo;{cari.trim()}&rdquo;.</p>
        ) : (
          <ul aria-label="Speakers">
            {hasilCari.map(({ speaker, i }) => {
              const sesi = labelSesiPembicara(speaker);
              const keterangan = [speaker.title?.trim(), speaker.company?.trim()].filter(Boolean).join(" · ");
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => buka(i)}
                    aria-current={pilihan === i ? "true" : undefined}
                    className={cx(
                      "flex min-h-13 w-full items-center gap-3 border-b border-outline-variant px-4 py-2 text-left text-body-medium",
                      pilihan === i ? "bg-secondary-container" : "hover:bg-primary-soft",
                    )}
                  >
                    <Wajah speaker={speaker} bingkai={bingkai} />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cx("min-w-0 truncate font-medium", speaker.name.trim() ? "text-on-surface" : "text-on-surface-variant")}>{speaker.name.trim() || "Unnamed"}</span>
                        {speaker.featured ? <span className="shrink-0 text-body-small text-on-surface-variant">Highlights</span> : null}
                      </span>
                      {keterangan ? <span className="block truncate text-body-small text-on-surface-variant">{keterangan}</span> : null}
                    </span>
                    {!speaker.photo_url ? <span className="shrink-0 text-body-small font-medium text-on-surface-variant max-sm:hidden">No photo</span> : null}
                    <span className={cx("w-32 shrink-0 truncate text-right text-body-small max-sm:hidden", sesi ? "text-on-surface-variant" : "text-error")}>{sesi || "No session"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PaneBody>
    </Pane>
  ) : (
    <Pane aria-label={`Order in ${tabAktif.label}`}>
      <PaneHeader>
        <h2 className="min-w-0 truncate text-body-medium font-semibold text-on-surface">Order in {tabAktif.label}</h2>
        <span className="shrink-0 tabular-nums text-body-medium text-on-surface-variant">{plural(tabAktif.speakers.length, "speaker")}</span>
        {tombolTambah}
      </PaneHeader>
      <PaneBody className="px-2 py-2">
        <UrutanPembicara
          speakers={daftar}
          baris={baris}
          bingkai={bingkai}
          tab={tabAktif.key}
          terpilih={typeof pilihan === "number" ? pilihan : null}
          onPilih={buka}
          terkunci={berubah ? "Save or discard the open speaker first to change the order." : menyimpan ? "Saving…" : null}
          onChange={(next) => void aturUrutan(next)}
        />
      </PaneBody>
    </Pane>
  );

  // ---- Panel samping --------------------------------------------------------
  let isiSamping: ReactNode;
  if (!draf) {
    isiSamping = (
      <EmptyState
        plain
        title="Choose a speaker"
        description="Pick someone in the list to edit their photo, details and sessions, or add a new speaker."
      />
    );
  } else if (bahasa === "id") {
    isiSamping = (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 text-body-medium font-semibold text-on-surface">{pilihan === "baru" ? "New speaker" : "Edit speaker"}</h3>
          <Button variant="text" size="sm" onClick={tutup}>Close</Button>
        </div>
        <ImageUploadField
          label="Photo"
          kind="landing"
          fit="cover"
          previewClassName="size-16 rounded-full"
          hint="Square, at least 400×400. Without a photo, initials are used."
          value={draf.photo_url ?? null}
          disabled={menyimpan}
          onChange={(url) => ubah({ photo_url: url })}
        />
        <TextField label="Name" data-nama-pembicara="" value={draf.name} maxLength={120} onChange={(event) => ubah({ name: event.target.value })} />
        <TextField label="Job title" optional placeholder="e.g. Direktur Utama" maxLength={200} value={draf.title ?? ""} onChange={(event) => ubah({ title: event.target.value })} />
        <TextField
          label="Organisation"
          optional
          placeholder="e.g. Bank Indonesia"
          hint="Shown below the job title, in the primary colour."
          maxLength={120}
          value={draf.company ?? ""}
          onChange={(event) => ubah({ company: event.target.value })}
        />
        <div>
          <p id={idPeran} className="m3-field-label flex items-baseline gap-2 text-label-large font-semibold text-on-surface">
            Main role<span className="text-body-small font-normal text-on-surface-variant">optional</span>
          </p>
          <div className="mt-2 -mr-2">
            <KolomPeran
              label="Main role"
              labelledBy={idPeran}
              value={draf.role ?? ""}
              utama={undefined}
              placeholder="e.g. Speaker"
              speakers={daftar}
              onChange={(role, en) => ubah({ role, ...(en && !draf.en?.role ? { en: { ...draf.en, role: en } } : {}) })}
            />
          </div>
          <p className="mt-2 text-body-small text-on-surface-variant">Used in Highlights and in sessions without their own role. Type anything, or pick a role already used in this event.</p>
        </div>
        <PilihSesi
          speaker={draf}
          speakers={daftar}
          baris={baris}
          memuat={sesiMemuat}
          onMuatUlang={() => void muatBaris()}
          onChange={(next) => setDraf(next)}
        />
        <Switch
          checked={Boolean(draf.featured)}
          onChange={(value) => ubah({ featured: value })}
          disabled={!draf.featured && disorot >= SOROTAN_MAKS}
          label="Feature this speaker"
          description={!draf.featured && disorot >= SOROTAN_MAKS
            ? `Highlights already has ${SOROTAN_MAKS} speakers. Turn one off first.`
            : `Goes in the Highlights tab (up to ${SOROTAN_MAKS}), for officials giving remarks or keynote speakers.`}
        />
      </div>
    );
  } else {
    const peranSesi = (draf.session_refs ?? []).filter((ref) => ref.role?.trim());
    const kolomEn = (label: string, sumber: string | undefined, value: string | undefined, max: number, onChange: (value: string) => void) =>
      sumber?.trim() ? (
        <TextField
          key={label}
          label={label}
          optional
          maxLength={max}
          placeholder={sumber.trim()}
          hint={`Indonesian: ${sumber.trim()}. Leave empty to show the Indonesian text.`}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null;
    const isian = [
      kolomEn("Job title", draf.title, draf.en?.title, 200, (title) => ubahEn({ title })),
      kolomEn("Organisation", draf.company, draf.en?.company, 120, (company) => ubahEn({ company })),
      kolomEn("Main role", draf.role, draf.en?.role, 60, (role) => ubahEn({ role })),
      !sesiDariRundown(draf) ? kolomEn("Session", draf.session, draf.en?.session, 40, (session) => ubahEn({ session })) : null,
      ...peranSesi.map((ref) =>
        kolomEn(`Role in ${ref.label || "a session"}`, ref.role, ref.en?.role, 60, (role) =>
          setDraf((kini) => (kini ? { ...kini, session_refs: (kini.session_refs ?? []).map((item) => (item.id === ref.id ? { ...item, en: { ...item.en, role } } : item)) } : kini)),
        ),
      ),
    ].filter(Boolean);
    isiSamping = (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-body-medium font-semibold text-on-surface">{draf.name.trim() || "New speaker"} in English</h3>
          <Button variant="text" size="sm" onClick={tutup}>Close</Button>
        </div>
        {!enAktif ? (
          <p className="text-body-small text-on-surface-variant">The English event page is off. Translations are kept and show once it is turned on.</p>
        ) : null}
        {isian.length ? isian : <p className="text-body-medium text-on-surface-variant">Nothing to translate yet. Fill in the job title, organisation or role in Indonesian first. Names are not translated.</p>}
        <p className="text-body-small text-on-surface-variant">Session titles come from the English agenda titles, set in Event page › English.</p>
      </div>
    );
  }

  const samping = (
    <Pane as="aside" aria-label="Speaker editor">
      {draf ? (
        <div className="shrink-0 border-b border-outline-variant px-4 py-3">
          <SegmentedButton<Bahasa>
            label="Language"
            value={bahasa}
            onChange={setBahasa}
            className="w-full"
            options={[{ value: "id", label: "Indonesian" }, { value: "en", label: "English" }]}
          />
        </div>
      ) : null}
      <PaneBody className="px-4 py-4">{isiSamping}</PaneBody>
      {draf ? (
        <PaneFooter note={berubah ? "Unsaved changes" : null}>
          {typeof pilihan === "number" ? (
            <Button simpan variant="outlined" size="sm" className="text-error" icon={<Trash size={16} />} disabled={menyimpan} onClick={() => setKonfirmasiHapus(true)}>Delete</Button>
          ) : null}
          <Button simpan size="sm" loading={menyimpan} disabled={!berubah} onClick={() => void simpanPembicara()}>
            {pilihan === "baru" ? "Add speaker" : "Save speaker"}
          </Button>
        </PaneFooter>
      ) : null}
    </Pane>
  );

  const namaTerbuka = (typeof pilihan === "number" ? tersimpan?.[pilihan]?.name : draf?.name)?.trim() || "this speaker";

  return (
    <WorkspacePage fill>
      <div lang="en" className="contents">
        <WorkspaceHeader
          meta={tersimpan ? (
            <>
              <span>{plural(terisi.length, "speaker")}</span>
              {tanpaFoto ? (<><MetaSeparator /><span>{tanpaFoto} without a photo</span></>) : null}
              <MetaSeparator />
              <span>Shown in the Speakers section and next to their agenda items</span>
            </>
          ) : null}
          actions={halamanAcara ? <ButtonLink href={halamanAcara} target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Open event page</ButtonLink> : null}
        />

        {error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : null}

        {!tersimpan ? (error ? null : <PageLoading />) : (
          <>
            <div className="min-w-0 shrink-0 border-b border-outline-variant">
              <Tabs
                label="Speaker tabs"
                idPrefix="tab-pembicara"
                value={kunciTab}
                onChange={(value) => setTabKey(value)}
                className="border-b-0"
                options={[
                  { value: SEMUA, label: "All", badge: terisi.length },
                  ...tabs.map((tab) => ({ value: tab.key, label: tab.label, badge: tab.speakers.length })),
                ]}
              />
            </div>
            <div role="tabpanel" id={`tab-pembicara-panel-${kunciTab}`} aria-labelledby={`tab-pembicara-tab-${kunciTab}`} className="flex min-h-0 flex-1 flex-col">
              <SupportingPane main={utama} pane={samping} paneWidth={420} />
            </div>
          </>
        )}

        <Dialog
          open={konfirmasiHapus}
          onClose={() => setKonfirmasiHapus(false)}
          dismissible={!menyimpan}
          tone="danger"
          title={`Delete ${namaTerbuka}?`}
          description="They are removed from the event page and from their agenda items. A copy is kept in the audit log."
          actions={
            <>
              <Button variant="outlined" disabled={menyimpan} onClick={() => setKonfirmasiHapus(false)}>Cancel</Button>
              <Button simpan variant="danger" loading={menyimpan} onClick={() => void hapus()}>Delete speaker</Button>
            </>
          }
        />

        <Dialog
          open={tertunda !== null}
          onClose={() => setTertunda(null)}
          title={`Discard changes to ${namaTerbuka}?`}
          description="Your changes to this speaker are not saved yet."
          actions={
            <>
              <Button variant="outlined" onClick={() => setTertunda(null)}>Keep editing</Button>
              <Button
                variant="danger"
                onClick={() => {
                  const aksi = tertunda;
                  setTertunda(null);
                  setDraf(null);
                  setPilihan(null);
                  aksi?.();
                }}
              >
                Discard
              </Button>
            </>
          }
        />
      </div>
    </WorkspacePage>
  );
}
