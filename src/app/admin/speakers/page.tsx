"use client";

import { ArrowSquareOut, LinkSimple, MagnifyingGlass, Plus, Warning } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useToast } from "@/components/toast";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import {
  Banner, Button, ButtonLink, ChipMenu, Dialog, EmptyState, ListDetail, MetaSeparator, PageLoading, Pane, PaneBody, PaneFooter, PaneHeader,
  StatusChip, Switch, Tabs, TextField, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";
import type { EventLandingConfig, LandingSpeaker, LandingSpeakerFrame } from "@/lib/domain";
import { eventApiPath } from "@/lib/event-url";
import { labelSesi, SOROTAN_MAKS, sesiDariRundown, speakerTabs } from "@/lib/landing-speaker-tabs";
import { useJagaNavigasi } from "@/lib/jaga-navigasi";
import { samaJson } from "@/lib/landing-speakers-sama";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import { barisSesiDariAdmin, KolomPeran, petakanSesiLama, PilihSesi, sesiHilang, type BarisSesi } from "../landing/pilih-sesi";
import { agendaDariBaris, BINGKAI_KECIL, inisial, UrutanPembicara } from "../landing/urutan-pembicara";

// Halaman Speakers: daftar pembicara satu acara. List-detail (DESIGN.md, "Tata
// letak M3, tampilan Cloudflare"): tabel selebar halaman, panel sunting hanya
// saat seseorang dipilih.
//
// Tab bagian Pembicara di halaman acara (Highlights, satu per sesi, Other
// speakers) menjadi saringan Session dan Highlights, bukan tab halaman: jumlah
// sesi ikut data, jadi tab tumbuh tanpa batas (9 tab sudah terpotong di 1280).
// Saringan yang memilih tepat satu tab itu menampilkan urutan tampilnya, yang
// diatur dengan pegangan geser seperti sebelumnya (UrutanPembicara).
//
// Penyimpanan: satu pembicara per Simpan, dan setiap geseran urutan langsung
// tersimpan. Server menulis hanya `landing_config.speakers` dan menolak (409)
// bila daftar tersimpan sudah berbeda dari yang terakhir dibaca layar ini.

type Payload = { speakers: LandingSpeaker[]; speaker_frame: LandingSpeakerFrame; layout: string; en_enabled: boolean };
type Pilihan = number | "baru" | null;
type Bahasa = "id" | "en";
type Perhatian = "foto" | "sesi" | "hilang";

const SOROT = "sorotan";
const PERHATIAN: { value: Perhatian; label: string }[] = [
  { value: "foto", label: "No photo" },
  { value: "sesi", label: "No session" },
  { value: "hilang", label: "Session removed" },
];
/** Sama dengan batas skema (SPEAKERS_MAX). */
const MAKS = 60;

function Wajah({ speaker, bingkai, ukuran = "baris" }: { speaker: LandingSpeaker; bingkai: LandingSpeakerFrame; ukuran?: "baris" | "pratinjau" }) {
  return (
    <span aria-hidden className={cx("relative shrink-0 overflow-hidden bg-surface-container-high", ukuran === "pratinjau" ? "w-16" : "w-8", BINGKAI_KECIL[bingkai] ?? BINGKAI_KECIL.portrait)}>
      {speaker.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={speaker.photo_url} alt="" className={cx("absolute inset-0 size-full object-cover", bingkai === "circle" ? "object-top" : "object-[50%_20%]")} />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-label-small font-semibold text-primary">{inisial(speaker.name)}</span>
      )}
    </span>
  );
}

/** Satu sesi di kolom "Sessions and role": label pendek, lalu peran di sesi itu. */
function ChipSesi({ label, peran, hilang }: { label: string; peran: string; hilang: boolean }) {
  return (
    <span
      title={hilang ? `${label}: no longer shown in the agenda` : [label, peran].filter(Boolean).join(" · ")}
      className={cx(
        "inline-flex h-5 max-w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded border px-1.5 text-label-medium",
        hilang ? "border-error text-error" : "border-outline-variant text-on-surface",
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {peran ? <span className="min-w-0 truncate text-on-surface-variant">· {peran}</span> : null}
    </span>
  );
}

/** Label sesi seorang pembicara untuk baris daftar: "Sesi 1 · Breakout 2". */
function labelSesiPembicara(speaker: LandingSpeaker): string {
  if (sesiDariRundown(speaker)) return (speaker.session_refs ?? []).map((ref) => ref.label).filter(Boolean).join(" · ");
  return speaker.session?.trim() ?? "";
}

const NAMA_KOLOM: Record<string, string> = {
  name: "name",
  title: "job title",
  company: "organisation",
  role: "main role",
  photo_url: "photo",
  featured: "Highlights",
  session_refs: "sessions",
  session: "old session",
  "en.title": "English job title",
  "en.company": "English organisation",
  "en.role": "English main role",
  "en.session": "English session",
};

/**
 * Suntingan yang ditolak 409 dipasang ulang di atas versi terbaru orang itu:
 * hanya kolom yang diubah di layar ini (draf vs versi yang dibuka) yang
 * ditimpa, kolom lain ikut versi terbaru. `bentrok`: kolom yang juga diubah
 * orang lain, dengan nilai yang berbeda.
 */
function pasangUlang(draf: LandingSpeaker, asli: LandingSpeaker, terbaru: LandingSpeaker): { hasil: LandingSpeaker; bentrok: string[] } {
  const bentrok: string[] = [];
  const gabung = (d: Record<string, unknown>, a: Record<string, unknown>, t: Record<string, unknown>, awalan: string) => {
    const hasil: Record<string, unknown> = { ...t };
    for (const kunci of new Set([...Object.keys(d), ...Object.keys(a)])) {
      if (!awalan && kunci === "en") continue;
      const sama = (x: unknown, y: unknown) => (kunci === "session_refs" ? samaJson(tanpaPos(x), tanpaPos(y)) : samaJson(x, y));
      if (sama(d[kunci], a[kunci])) continue;
      if (!sama(t[kunci], a[kunci]) && !sama(t[kunci], d[kunci])) bentrok.push(`${awalan}${kunci}`);
      if (d[kunci] === undefined) delete hasil[kunci];
      else if (kunci === "session_refs" && Array.isArray(d[kunci])) {
        // Sesi dari layar ini, urutan tab (`pos`) dari versi terbaru.
        const posTerbaru = new Map((terbaru.session_refs ?? []).map((ref) => [ref.id, ref.pos]));
        hasil[kunci] = (d[kunci] as NonNullable<LandingSpeaker["session_refs"]>).map(({ pos: _pos, ...ref }) => {
          void _pos;
          const pos = posTerbaru.get(ref.id);
          return pos === undefined ? ref : { ...ref, pos };
        });
      } else hasil[kunci] = d[kunci];
    }
    return hasil;
  };
  const hasil = gabung(draf, asli, terbaru, "") as LandingSpeaker;
  const en = gabung(draf.en ?? {}, asli.en ?? {}, terbaru.en ?? {}, "en.");
  if (Object.keys(en).length) hasil.en = en as LandingSpeaker["en"];
  else delete hasil.en;
  return { hasil, bentrok };
}

/**
 * Sesi tanpa `pos`: satu geseran di tab sesi menulis ulang `pos` semua orang di
 * tab itu, dan itu bukan perubahan orangnya.
 */
function tanpaPos(nilai: unknown): unknown {
  return Array.isArray(nilai) ? nilai.map((ref) => (ref && typeof ref === "object" ? { ...ref, pos: undefined } : ref)) : nilai;
}

/** Kolom yang diubah di layar ini (draf vs versi yang dibuka); kolom English sebagai "en.title" dst. */
function kolomDiubah(draf: LandingSpeaker, asli: LandingSpeaker): Set<string> {
  const hasil = new Set<string>();
  const banding = (d: Record<string, unknown>, a: Record<string, unknown>, awalan: string) => {
    for (const kunci of new Set([...Object.keys(d), ...Object.keys(a)])) {
      if (!awalan && kunci === "en") continue;
      if (kunci === "session_refs" ? !samaJson(tanpaPos(d[kunci]), tanpaPos(a[kunci])) : !samaJson(d[kunci], a[kunci])) hasil.add(`${awalan}${kunci}`);
    }
  };
  banding(draf, asli, "");
  banding(draf.en ?? {}, asli.en ?? {}, "en.");
  return hasil;
}

/**
 * Orang yang sama di daftar terbaru setelah 409, atau -1 bila tidak pasti.
 * Tidak menebak: namanya harus unik di daftar lama dan di daftar terbaru, dan
 * setiap kolom yang TIDAK diubah di layar ini (foto, sesi, peran, instansi, dst.)
 * harus masih sama dengan versi yang dibuka. Selain itu suntingan bisa
 * mendarat di orang lain (nama kembar ditukar, orang dihapus lalu orang lain
 * diganti namanya), jadi lebih baik tidak dipasang ulang sama sekali.
 */
function cariLagi(lama: LandingSpeaker[], terbaru: LandingSpeaker[], asli: LandingSpeaker, draf: LandingSpeaker): number {
  const unik = (daftar: LandingSpeaker[]) => daftar.filter((speaker) => speaker.name === asli.name).length === 1;
  if (!unik(lama) || !unik(terbaru)) return -1;
  const posisi = terbaru.findIndex((speaker) => speaker.name === asli.name);
  const calon = terbaru[posisi]!;
  const diubah = kolomDiubah(draf, asli);
  const beda = kolomDiubah(calon, asli);
  return [...beda].every((kunci) => diubah.has(kunci)) ? posisi : -1;
}

export default function SpeakersAdminPage() {
  const [tersimpan, setTersimpan] = useState<LandingSpeaker[] | null>(null);
  const [bingkai, setBingkai] = useState<LandingSpeakerFrame>("portrait");
  const [enAktif, setEnAktif] = useState(false);
  const [baris, setBaris] = useState<BarisSesi[] | null>(null);
  const [sesiMemuat, setSesiMemuat] = useState(true);
  const [saringSesi, setSaringSesi] = useState<string[]>([]);
  const [saringSorot, setSaringSorot] = useState<string[]>([]);
  const [saringPerhatian, setSaringPerhatian] = useState<string[]>([]);
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
  // Pesan 409 di panel sunting (bukan toast: toast menutupi Save dan Delete).
  const [konflik, setKonflik] = useState("");
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

  // Menutup tab ditanyakan peramban; pindah halaman lewat rel, palet perintah
  // atau pemilih acara ditanyakan dialog Discard yang sama (pola Agenda, #245).
  useJagaNavigasi(berubah, (lanjut) => lindungi(lanjut));

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
  // Urutan tampil terbuka bila saringan memilih tepat satu tab halaman acara:
  // satu sesi (atau Other speakers) saja, atau Highlights saja, tanpa cari.
  const kunciUrutan = cari.trim() || saringPerhatian.length
    ? null
    : saringSesi.length === 1 && saringSorot.length === 0
      ? saringSesi[0]
      : saringSesi.length === 0 && saringSorot.length === 1
        ? SOROT
        : null;
  const tabAktif = (kunciUrutan && tabs.find((tab) => tab.key === kunciUrutan)) || null;

  /** Jalankan `aksi`, atau tanya dulu bila suntingan yang terbuka belum disimpan. */
  function lindungi(aksi: () => void) {
    if (berubah) setTertunda(() => aksi);
    else aksi();
  }

  function buka(indeks: number) {
    if (pilihan === indeks) return;
    lindungi(() => {
      setKonflik("");
      setPilihan(indeks);
      setDraf(tersimpan?.[indeks] ?? null);
    });
  }

  function mulaiBaru() {
    lindungi(() => {
      setKonflik("");
      setPilihan("baru");
      // Ditambah saat saringan menunjuk satu sesi agenda: orangnya langsung di
      // sesi itu, supaya muncul di daftar yang sedang dilihat setelah disimpan.
      const idSesi = tabAktif?.key.startsWith("sesi-") ? Number(tabAktif.key.slice(5)) : NaN;
      const barisSesi = Number.isInteger(idSesi) ? baris?.find((item) => item.id === idSesi) : undefined;
      setDraf(barisSesi ? { name: "", session_refs: [{ id: barisSesi.id, label: labelSesi(barisSesi.title) }] } : { name: "" });
      setBahasa("id");
      window.setTimeout(() => document.querySelector<HTMLInputElement>("[data-nama-pembicara]")?.focus(), 0);
    });
  }

  function tutup() {
    lindungi(() => { setPilihan(null); setDraf(null); setKonflik(""); });
  }

  // Escape menutup panel sunting (seperti Gmail/Linear), lewat penjaga yang
  // sama dengan Close. Tidak saat Escape milik menu, dialog atau kolom cari.
  const tutupTerkini = useRef(tutup);
  useEffect(() => { tutupTerkini.current = tutup; });
  const adaDialog = konfirmasiHapus || tertunda !== null;
  const panelTerbuka = draf !== null;
  useEffect(() => {
    if (!panelTerbuka || adaDialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="dialog"],[role="listbox"],[role="menu"],input[type="search"]')) return;
      if (document.querySelector('[role="listbox"],[role="menu"]')) return;
      tutupTerkini.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panelTerbuka, adaDialog]);

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
        setTersimpan(terbaru);
        let pesan = "Not saved. Someone else changed the speaker list. The latest list is shown now.";
        let panelTerbuka = draf !== null;
        if (typeof pilihan === "number" && asli && draf) {
          // Orang yang sama di daftar terbaru. Suntingannya dipasang ulang di
          // atas versi terbaru, bukan disimpan utuh: perubahan orang lain pada
          // kolom yang tidak disentuh di sini tetap ada.
          const posisi = tersimpan ? cariLagi(tersimpan, terbaru, asli, draf) : -1;
          if (posisi < 0) {
            setPilihan(null);
            setDraf(null);
            panelTerbuka = false;
            pesan = berubah
              ? `Not saved. ${asli.name} was changed by someone else. Your edits were not saved: open them again and re-apply.`
              : `Someone else changed ${asli.name}. The latest list is shown now.`;
          } else if (berubah) {
            const { hasil, bentrok } = pasangUlang(draf, asli, terbaru[posisi]!);
            setPilihan(posisi);
            setDraf(hasil);
            pesan = bentrok.length
              ? `Not saved. Someone else also changed ${bentrok.map((kunci) => NAMA_KOLOM[kunci] ?? kunci).join(", ")}. Your version is shown; check it, then save again.`
              : "Not saved. Someone else changed this speaker list. Your changes are kept on top of the latest version; check them, then save again.";
          } else {
            setPilihan(posisi);
            setDraf(terbaru[posisi]!);
          }
        }
        if (panelTerbuka) setKonflik(pesan);
        else toast.error("Not saved", pesan.replace(/^Not saved\. /, ""));
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
    setKonflik("");
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
    setKonflik("");
    setPilihan(null);
    setDraf(null);
    toast.success("Speaker deleted", nama ? `${nama} is no longer on the event page.` : undefined);
  }

  async function aturUrutan(next: LandingSpeaker[]) {
    if (menyimpan || berubah) return;
    setUrutanSementara(next);
    // Orang yang terbuka dicari dari objeknya, bukan namanya (nama bisa kembar).
    // Tab Highlights dan Other speakers menukar objek yang sama di daftar; tab
    // sesi hanya menulis `pos` dan urutan daftar tetap.
    const terbuka = typeof pilihan === "number" ? tersimpan?.[pilihan] : undefined;
    const posisiBaru = terbuka ? next.indexOf(terbuka) : -1;
    const hasil = await kirim(next);
    setUrutanSementara(null);
    if (hasil && typeof pilihan === "number" && draf) {
      const posisi = posisiBaru >= 0 ? posisiBaru : pilihan;
      setPilihan(posisi);
      setDraf(hasil[posisi] ?? null);
    }
  }

  // Sesi teks lama yang cocok dengan tepat satu baris Agenda: dihubungkan dengan
  // satu klik, tidak otomatis saat halaman dibuka (membuka halaman tidak menulis).
  const petakan = useMemo(
    () => (tersimpan && baris ? petakanSesiLama({ speakers: tersimpan } as EventLandingConfig, baris) : null),
    [tersimpan, baris],
  );
  const bisaDihubungkan = petakan?.hasil.terhubung ?? 0;

  async function hubungkanSesiLama() {
    if (!petakan?.landing.speakers || menyimpan || berubah) return;
    const hasil = await kirim(petakan.landing.speakers);
    if (!hasil) return;
    if (typeof pilihan === "number") setDraf(hasil[pilihan] ?? null);
    toast.success(`${plural(bisaDihubungkan, "speaker")} linked to the agenda`, "Their tabs can now be reordered here.");
  }

  const terisi = daftar.filter((speaker) => speaker.name?.trim());
  const tanpaFoto = terisi.filter((speaker) => !speaker.photo_url).length;
  const disorot = daftar.filter((speaker, i) => speaker.featured && i !== pilihan).length;
  const terbuka = draf !== null;

  /** Yang perlu dibereskan pada satu orang, urut seperti di saringan. */
  function perhatian(speaker: LandingSpeaker): Perhatian[] {
    const hasil: Perhatian[] = [];
    if (!speaker.photo_url) hasil.push("foto");
    if (!labelSesiPembicara(speaker)) hasil.push("sesi");
    if (sesiHilang(speaker, baris).length) hasil.push("hilang");
    return hasil;
  }

  // ---- Saringan --------------------------------------------------------------
  const opsiSesi = tabs.filter((tab) => tab.key !== SOROT).map((tab) => ({ value: tab.key, label: tab.label, count: tab.speakers.length }));
  const opsiPerhatian = PERHATIAN.map((item) => ({ ...item, count: terisi.filter((speaker) => perhatian(speaker).includes(item.value)).length })).filter((item) => item.count > 0);
  const jumlahPerhatian = terisi.filter((speaker) => perhatian(speaker).length > 0).length;
  const anggotaTab = (kunci: string) => new Set((tabs.find((tab) => tab.key === kunci)?.speakers ?? []).map((speaker) => (speaker as LandingSpeaker & { _i: number })._i));
  const kataCari = cari.trim().toLowerCase();
  const sesiTerpilih = saringSesi.length ? anggotaTab(saringSesi[0]!) : null;
  const sorotTerpilih = saringSorot.length ? anggotaTab(SOROT) : null;
  const hasilCari = daftar
    .map((speaker, i) => ({ speaker, i }))
    .filter(({ speaker }) => speaker.name.trim() || pilihan === "baru")
    .filter(({ i }) => !sesiTerpilih || sesiTerpilih.has(i))
    .filter(({ i }) => !sorotTerpilih || sorotTerpilih.has(i))
    .filter(({ speaker }) => !saringPerhatian.length || perhatian(speaker).some((item) => saringPerhatian.includes(item)))
    .filter(({ speaker }) => !kataCari || [speaker.name, speaker.title, speaker.company].some((teks) => teks?.toLowerCase().includes(kataCari)));
  const adaSaringan = Boolean(kataCari || saringSesi.length || saringSorot.length || saringPerhatian.length);
  const hapusSaringan = () => { setCari(""); setSaringSesi([]); setSaringSorot([]); setSaringPerhatian([]); };

  // ---- Panel daftar -----------------------------------------------------------
  const toolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-outline-variant px-3 py-3">
      <label className="relative min-w-[200px] flex-1 max-sm:basis-full">
        <span className="sr-only">Search name, job title or organisation</span>
        <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
        <input
          type="search"
          value={cari}
          onChange={(event) => setCari(event.target.value)}
          placeholder="Search name, job title, organisation…"
          className="h-8 w-full rounded-md border border-outline bg-surface-container-lowest pl-9 pr-3 text-body-medium outline-none placeholder:text-on-surface-variant focus:border-primary"
        />
      </label>
      {opsiSesi.length ? <ChipMenu label="Session" options={opsiSesi} selected={saringSesi} onChange={setSaringSesi} searchable={opsiSesi.length > 8} /> : null}
      {tabs.some((tab) => tab.key === SOROT) ? (
        <ChipMenu label="Highlights" options={[{ value: "ya", label: "In Highlights", count: anggotaTab(SOROT).size }]} selected={saringSorot} onChange={setSaringSorot} summary={() => "In Highlights"} />
      ) : null}
      {/* Panel sunting terbuka: daftar menyempit dan kolom Status disembunyikan, jadi saringannya juga, kecuali sedang dipakai. */}
      {opsiPerhatian.length && (!terbuka || saringPerhatian.length) ? (
        <ChipMenu
          label={`Needs attention ${jumlahPerhatian}`}
          options={opsiPerhatian}
          selected={saringPerhatian}
          onChange={setSaringPerhatian}
          multiple
          summary={(pilih) => (pilih.length === 1 ? pilih[0]!.label : `Needs attention: ${pilih.length}`)}
        />
      ) : null}
    </div>
  );

  const tabelPembicara = (
    <div className="relative min-h-0 flex-1 overflow-auto">
      <table className="w-full table-fixed border-separate border-spacing-0 text-left text-body-medium">
        <colgroup>
          <col />
          {terbuka ? null : <col className="w-[22%] max-md:hidden" />}
          <col className={terbuka ? "w-[45%] max-sm:hidden" : "w-[30%] max-sm:hidden"} />
          {terbuka ? null : <col className="w-44 max-md:hidden" />}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-surface-container-high text-body-medium font-medium text-on-surface-variant">
          <tr>
            <th scope="col" className="border-b border-outline-variant px-4 py-2.5 font-medium">Speaker</th>
            {terbuka ? null : <th scope="col" className="border-b border-outline-variant px-3 py-2.5 font-medium max-md:hidden">Organisation</th>}
            <th scope="col" className="border-b border-outline-variant px-3 py-2.5 font-medium max-sm:hidden">Sessions and role</th>
            {terbuka ? null : <th scope="col" className="border-b border-outline-variant px-3 py-2.5 font-medium max-md:hidden">Status</th>}
          </tr>
        </thead>
        <tbody>
          {hasilCari.map(({ speaker, i }) => {
            const hilang = new Set(sesiHilang(speaker, baris).map((ref) => ref.id));
            const sesi = sesiDariRundown(speaker)
              ? (speaker.session_refs ?? []).map((ref) => ({ kunci: String(ref.id), label: ref.label ? labelSesi(ref.label) : "Session", peran: ref.role?.trim() || speaker.role?.trim() || "", hilang: hilang.has(ref.id) }))
              : speaker.session?.trim() ? [{ kunci: "lama", label: speaker.session.trim(), peran: speaker.role?.trim() || "", hilang: false }] : [];
            const masalah = perhatian(speaker);
            const status = (
              <>
                {speaker.featured ? <StatusChip tone="primary" dot>Highlights</StatusChip> : null}
                {masalah.includes("foto") ? <StatusChip tone="warning" dot>No photo</StatusChip> : null}
                {masalah.includes("sesi") ? <StatusChip tone="error" dot>No session</StatusChip> : null}
                {masalah.includes("hilang") ? <StatusChip tone="error" dot>Session removed</StatusChip> : null}
              </>
            );
            const kosong = !speaker.featured && masalah.length === 0;
            return (
              <tr
                key={i}
                aria-selected={pilihan === i}
                onClick={() => buka(i)}
                className={cx("cursor-pointer", pilihan === i ? "bg-secondary-container" : "bg-surface-container-lowest hover:bg-primary-soft")}
              >
                <td className="border-b border-outline-variant px-4 py-2.5 align-middle">
                  <button
                    type="button"
                    aria-pressed={pilihan === i}
                    onClick={(event) => { event.stopPropagation(); buka(i); }}
                    className="flex w-full min-w-0 items-center gap-3 rounded-sm text-left"
                  >
                    <Wajah speaker={speaker} bingkai={bingkai} />
                    <span className="min-w-0 flex-1">
                      <span className={cx("block truncate font-medium", speaker.name.trim() ? "text-on-surface" : "text-on-surface-variant")} title={speaker.name}>{speaker.name.trim() || "Unnamed"}</span>
                      {speaker.title?.trim() ? <span className="block truncate text-on-surface-variant" title={speaker.title}>{speaker.title.trim()}</span> : null}
                    </span>
                  </button>
                  {/* Di ponsel sesi dan status pindah ke bawah nama: kolomnya disembunyikan. */}
                  <span className="mt-1.5 flex flex-wrap gap-1 pl-11 sm:hidden">
                    {sesi.map((item) => <ChipSesi key={item.kunci} {...item} />)}
                    {status}
                  </span>
                  {terbuka ? null : <span className="mt-1.5 hidden flex-wrap gap-1 pl-11 empty:hidden max-md:flex max-sm:hidden">{status}</span>}
                </td>
                {terbuka ? null : (
                  <td className="border-b border-outline-variant px-3 py-2.5 align-middle max-md:hidden">
                    {speaker.company?.trim() ? <span className="block truncate" title={speaker.company}>{speaker.company.trim()}</span> : <span className="text-on-surface-variant" aria-label="no value">–</span>}
                  </td>
                )}
                <td className="border-b border-outline-variant px-3 py-2.5 align-middle max-sm:hidden">
                  {sesi.length ? <span className="flex flex-wrap gap-1">{sesi.map((item) => <ChipSesi key={item.kunci} {...item} />)}</span> : <span className="text-on-surface-variant" aria-label="no session">–</span>}
                </td>
                {terbuka ? null : (
                  <td className="border-b border-outline-variant px-3 py-2.5 align-middle max-md:hidden">
                    {kosong ? <span className="text-on-surface-variant" aria-label="no value">–</span> : <span className="flex flex-wrap gap-1">{status}</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const daftarPanel = (
    <Pane aria-label="Speakers">
      {daftar.length ? toolbar : null}
      {tabAktif ? (
        <>
          {tabAktif.note ? (
            <p className="shrink-0 truncate border-b border-outline-variant bg-surface-container-high px-4 py-2 text-body-medium text-on-surface-variant">
              <span className="font-medium text-on-surface">{tabAktif.label}</span> · {tabAktif.note}
            </p>
          ) : null}
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
        </>
      ) : daftar.length === 0 ? (
        <PaneBody>
          <EmptyState
            plain
            title="No speakers yet"
            description="Speakers appear in the Speakers section of the event page and next to their sessions in the agenda."
            action={<Button size="sm" icon={<Plus size={16} />} onClick={mulaiBaru}>Add speaker</Button>}
          />
        </PaneBody>
      ) : hasilCari.length === 0 ? (
        <PaneBody>
          <div className="flex flex-col items-start gap-2 px-4 py-6 text-body-medium text-on-surface-variant">
            <p>{kataCari ? <>No speaker matches &ldquo;{cari.trim()}&rdquo;.</> : "No speaker matches these filters."}</p>
            <Button variant="text" size="sm" onClick={hapusSaringan}>Clear filters</Button>
          </div>
        </PaneBody>
      ) : tabelPembicara}
      {daftar.length ? (
        <div className="shrink-0 border-t border-outline-variant bg-surface-container-high px-4 py-2 text-body-small text-on-surface-variant">
          {adaSaringan ? `${hasilCari.length} of ${plural(terisi.length, "speaker")}` : plural(terisi.length, "speaker")}
          {" · "}{anggotaTab(SOROT).size} in Highlights (up to {SOROTAN_MAKS}) · {MAKS} at most
        </div>
      ) : null}
    </Pane>
  );

  // ---- Panel sunting ----------------------------------------------------------
  let isiSamping: ReactNode = null;
  if (draf && bahasa === "id") {
    const peranUtama = draf.role?.trim();
    isiSamping = (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-lg border border-outline-variant p-3">
          <Wajah speaker={draf} bingkai={bingkai} ukuran="pratinjau" />
          <div className="min-w-0 flex-1">
            <p className="text-body-small text-on-surface-variant">Card preview</p>
            <p className={cx("truncate font-semibold", draf.name.trim() ? "text-on-surface" : "text-on-surface-variant")}>{draf.name.trim() || "Name"}</p>
            {peranUtama || draf.title?.trim() ? <p className="line-clamp-2 text-body-small text-on-surface-variant">{[peranUtama, draf.title?.trim()].filter(Boolean).join(" · ")}</p> : null}
            {draf.company?.trim() ? <p className="truncate text-body-small font-medium text-primary">{draf.company.trim()}</p> : null}
          </div>
        </div>
        <ImageUploadField
          label="Photo"
          kind="landing"
          fit="cover"
          // Fotonya sudah tampil di pratinjau kartu di atas, dalam bingkai halaman acara.
          previewClassName="hidden"
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
            : `Goes in the Highlights tab (${disorot} of ${SOROTAN_MAKS} used), for officials giving remarks or keynote speakers.`}
        />
      </div>
    );
  } else if (draf) {
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
        {!enAktif ? (
          <p className="text-body-small text-on-surface-variant">The English event page is off. Translations are kept and show once it is turned on.</p>
        ) : null}
        {isian.length ? isian : <p className="text-body-medium text-on-surface-variant">Nothing to translate yet. Fill in the job title, organisation or role in Indonesian first. Names are not translated.</p>}
        <p className="text-body-small text-on-surface-variant">Session titles come from the English agenda titles, set in Event page › English.</p>
      </div>
    );
  }

  const samping = draf ? (
    <Pane as="aside" aria-label="Speaker editor">
      <PaneHeader>
        <h2 className="min-w-0 flex-1 truncate text-title-large text-on-surface">{pilihan === "baru" ? "New speaker" : draf.name.trim() || "Unnamed"}</h2>
        <Button variant="text" size="sm" onClick={tutup}>Close</Button>
      </PaneHeader>
      <Tabs<Bahasa>
        label="Language"
        idPrefix="bahasa-pembicara"
        value={bahasa}
        onChange={setBahasa}
        className="px-2"
        options={[{ value: "id", label: "Details" }, { value: "en", label: "English" }]}
      />
      {konflik ? (
        <p role="alert" className="flex shrink-0 items-start gap-2 border-b border-outline-variant bg-error-soft/40 px-4 py-2.5 text-body-small font-medium text-error">
          <Warning size={16} weight="fill" className="mt-px shrink-0" aria-hidden />
          {konflik}
        </p>
      ) : null}
      <PaneBody role="tabpanel" id={`bahasa-pembicara-panel-${bahasa}`} aria-labelledby={`bahasa-pembicara-tab-${bahasa}`} className="px-4 py-4">{isiSamping}</PaneBody>
      <PaneFooter note={berubah ? "Unsaved changes" : null}>
        {typeof pilihan === "number" ? (
          <Button simpan variant="text" size="sm" className="text-error" disabled={menyimpan} onClick={() => setKonfirmasiHapus(true)}>Delete</Button>
        ) : null}
        <Button simpan size="sm" loading={menyimpan} disabled={!berubah} onClick={() => void simpanPembicara()}>
          {pilihan === "baru" ? "Add speaker" : "Save speaker"}
        </Button>
      </PaneFooter>
    </Pane>
  ) : null;

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
          actions={
            <>
              {halamanAcara ? <ButtonLink href={halamanAcara} target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>Open event page</ButtonLink> : null}
              {tersimpan ? (
                <Button icon={<Plus size={16} />} onClick={mulaiBaru} disabled={daftar.length >= MAKS} title={daftar.length >= MAKS ? `An event can have up to ${MAKS} speakers.` : undefined}>Add speaker</Button>
              ) : null}
            </>
          }
        />

        {error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : null}
        {bisaDihubungkan > 0 ? (
          <Banner
            tone="info"
            icon={<LinkSimple size={18} />}
            className="shrink-0 !py-2"
            actions={
              <Button size="sm" variant="outlined" loading={menyimpan} disabled={berubah} onClick={() => void hubungkanSesiLama()}>
                Link {plural(bisaDihubungkan, "speaker")}
              </Button>
            }
          >
            {bisaDihubungkan === 1 ? "1 speaker has" : `${bisaDihubungkan} speakers have`} an old session name that matches one agenda item.
            Link them so the session order and session roles can be edited here.{berubah ? " Save or discard the open speaker first." : ""}
          </Banner>
        ) : null}

        {!tersimpan ? (error ? null : <PageLoading />) : (
          <ListDetail list={daftarPanel} detail={samping} detailWidth={420} />
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
