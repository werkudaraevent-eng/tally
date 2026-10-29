"use client";

import { ArrowSquareOut, Flag, Plus, QrCode, Target, WarningCircle, X, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import Link from "@/components/event-link";
import { Button, ButtonLink, DetailSection, EmptyState, IconButton, ListDetail, ListRow, Pane, PaneBody, PaneFooter, SelectField, Switch, TextArea, TextField, Dialog } from "@/components/m3";
import { useToast } from "@/components/toast";
import { AksesPanitia } from "@/app/admin/attendance/akses-panitia";
import { PilihBarisAgenda, useAgendaTrip } from "@/components/admin/logistik/pilih-baris-agenda";
import { pesanGalatApi } from "@/lib/api-message";
import { angkaTujuan, kalimatTujuan, rapiTujuan, TUJUAN_POIN_MAX, TUJUAN_TEKS_MAX, type TujuanPoin } from "@/lib/checkpoint/tujuan";
import { eventApiPath } from "@/lib/event-url";
import { hariPendek, jamPendek } from "@/lib/logistik/trip-agenda";
import { TAUTAN_AGENDA_MAX } from "@/lib/sasaran-blok";
import { cx } from "@/lib/m3/cx";

/**
 * Check-in > Checkpoints: langkah berurutan yang dilihat peserta di Dashboard
 * saya (ambil ID card, ambil kaos, titip bagasi).
 *
 * Tiap checkpoint menunjuk satu bukti yang sudah ada: pemindaian di satu sesi
 * (tab Sessions) atau satu barang yang diserahkan (Logistics > Kit items).
 * Tidak ada pemindai baru; petugas tetap memakai /scan seperti biasa.
 *
 * Scan mandiri (migrasi 202610180001): checkpoint sesi bisa diselesaikan
 * peserta sendiri dengan memindai QR yang ditampilkan panitia (Show QR di /scan
 * atau layar /checkpoint-qr), seperti QRIS dinamis. Checkpoint barang tetap
 * dipindai panitia.
 *
 * Setelan di sini satu-satunya: "Show in participant area" menyalakan kartu di
 * Dashboard saya dan catatan di layar scan; urutannya di Beranda diatur di
 * Participant area > Participant home seperti kartu lain. Tujuan poin (E-08)
 * berlaku untuk seluruh daftar, jadi tombolnya di bilah atas, di samping
 * sakelar Points, dan editornya memakai panel detail yang sama.
 *
 * When (migrasi 202610220001): baris Agenda yang memberi checkpoint tanggal dan
 * jam, dengan pemilih yang sama dengan Trip bus dan blok Rute. Beberapa baris
 * untuk tanggal yang beda per batch; peserta melihat baris yang boleh ia lihat
 * (Agenda > Who sees it).
 */

type Checkpoint = {
  id: number;
  title: string;
  title_en: string | null;
  place: string | null;
  place_en: string | null;
  session_id: number | null;
  item_id: number | null;
  points: number | null;
  /** Siapa yang memindai (staff, self, both). */
  completion: Penyelesaian;
  /** Baris Agenda When; kosong = tanpa tanggal. */
  agenda_item_ids: number[];
  /** Message after scan (migrasi 202610290002); null = tanpa pesan. */
  scan_message: string | null;
  scan_message_en: string | null;
  done: number;
};

type Penyelesaian = "staff" | "self" | "both";

type Muat = {
  settings: { enabled: boolean; points_enabled: boolean; goal: TujuanPoin | null };
  /** Tipe peserta dengan akses panitia di portal (akses-panitia.tsx). */
  committee_types?: string[];
  /** Kolom tujuan poin sudah ada (migrasi 202610170001). */
  goal_ready: boolean;
  /** Kolom scan mandiri sudah ada (migrasi 202610180001). */
  self_scan_ready?: boolean;
  /** Kolom When sudah ada (migrasi 202610220001). */
  when_ready?: boolean;
  /** Kolom Message after scan sudah ada (migrasi 202610290002). */
  message_ready?: boolean;
  /** Halaman peserta English menyala: isian English tujuan ikut tampil. */
  en_available: boolean;
  checkpoints: Checkpoint[];
  sessions: { id: number; name: string; is_active: boolean }[];
  items: { id: number; name: string }[];
  finished_all: number | null;
  participants: number | null;
};

type Form = { title: string; title_en: string; place: string; place_en: string; bukti: string; points: string; completion: Penyelesaian; agenda: number[]; pesan: string; pesan_en: string };

const FORM_KOSONG: Form = { title: "", title_en: "", place: "", place_en: "", bukti: "", points: "", completion: "staff", agenda: [], pesan: "", pesan_en: "" };

const PILIHAN_SELESAI: { value: Penyelesaian; title: string; description: string }[] = [
  { value: "staff", title: "Staff scan the participant's QR", description: "Same as before." },
  {
    value: "self",
    title: "Participants scan the checkpoint QR",
    description: "Staff show a QR from the scanner app or a screen at the spot. It changes every 30 seconds, so a forwarded photo stops working.",
  },
  { value: "both", title: "Both", description: "Participants scan it themselves. Staff can still scan anyone who has trouble with their phone." },
];

type FormTujuan = { points: string; reward: string; reward_en: string };

const angka = (nilai: number) => nilai.toLocaleString("en-GB");
const poinEn = (nilai: number) => `${angka(nilai)} ${nilai === 1 ? "point" : "points"}`;

/** "s:12" = sesi 12, "i:4" = barang 4. Satu pilihan untuk satu bukti. */
function keForm(cp: Checkpoint): Form {
  return {
    title: cp.title,
    title_en: cp.title_en ?? "",
    place: cp.place ?? "",
    place_en: cp.place_en ?? "",
    bukti: cp.session_id ? `s:${cp.session_id}` : cp.item_id ? `i:${cp.item_id}` : "",
    points: cp.points == null ? "" : String(cp.points),
    completion: cp.completion ?? "staff",
    agenda: cp.agenda_item_ids ?? [],
    pesan: cp.scan_message ?? "",
    pesan_en: cp.scan_message_en ?? "",
  };
}

function keIsi(form: Form, poin: boolean, waktu: boolean, pesan: boolean) {
  const [jenis, nomor] = form.bukti.split(":");
  return {
    title: form.title.trim(),
    title_en: form.title_en.trim() || null,
    place: form.place.trim() || null,
    place_en: form.place_en.trim() || null,
    session_id: jenis === "s" ? Number(nomor) : null,
    item_id: jenis === "i" ? Number(nomor) : null,
    // Barang selalu dipindai panitia: barangnya harus diserahkan orang.
    completion: jenis === "s" ? form.completion : ("staff" as const),
    // Poin yang mati tidak dihapus: menyalakannya lagi mengembalikan angkanya.
    ...(poin ? { points: form.points.trim() === "" ? null : Math.max(0, Math.min(10000, Math.round(Number(form.points)))) } : {}),
    // Sebelum migrasi 202610220001 kolomnya tidak dikirim, jadi simpan tetap jalan.
    ...(waktu ? { agenda_item_ids: form.agenda } : {}),
    // Sama: sebelum migrasi 202610290002 pesannya tidak dikirim.
    ...(pesan ? { scan_message: form.pesan.trim() || null, scan_message_en: form.pesan_en.trim() || null } : {}),
  };
}

/** "Mon 2 Nov, 09:00" baris pertama yang masih ada, untuk daftar checkpoint; "+1" bila ada baris lain. */
function ringkasWaktu(ids: number[], agenda: ReturnType<typeof useAgendaTrip>["agenda"]): string | null {
  const ada = ids.map((id) => agenda?.peta.baris.get(id)).filter((isi): isi is NonNullable<typeof isi> => Boolean(isi));
  if (ada.length === 0) return null;
  const awal = [...ada].sort((a, b) => `${a.bagian.event_date} ${jamPendek(a.baris.start_time)}`.localeCompare(`${b.bagian.event_date} ${jamPendek(b.baris.start_time)}`))[0];
  return `${hariPendek(awal.bagian.event_date)}, ${jamPendek(awal.baris.start_time)}${ada.length > 1 ? ` +${ada.length - 1}` : ""}`;
}

/** Tujuan baru langsung terisi total poin yang ditawarkan, seperti di mockup yang disetujui. */
function keFormTujuan(goal: TujuanPoin | null, ditawarkan: number): FormTujuan {
  return {
    points: goal ? String(goal.points) : ditawarkan > 0 ? String(ditawarkan) : "",
    reward: goal?.reward ?? "",
    reward_en: goal?.reward_en ?? "",
  };
}

export function CheckpointsTab({ keSesi }: { keSesi: () => void }) {
  const [data, setData] = useState<Muat | null>(null);
  const [galat, setGalat] = useState("");
  const [pilih, setPilih] = useState<number | "baru" | "tujuan" | null>(null);
  // Galat isian baru tampil sesudah admin menekan Add/Save, bukan saat mengetik.
  const [dicoba, setDicoba] = useState(false);
  const [form, setForm] = useState<Form>(FORM_KOSONG);
  const [formTujuan, setFormTujuan] = useState<FormTujuan>({ points: "", reward: "", reward_en: "" });
  const [busy, setBusy] = useState(false);
  const [hapus, setHapus] = useState<Checkpoint | null>(null);
  const toast = useToast();
  const siapWaktu = data?.when_ready === true;
  const siapPesan = data?.message_ready === true;
  const agendaTrip = useAgendaTrip(siapWaktu);

  const load = useCallback(async () => {
    const response = await fetch(eventApiPath("/api/admin/checkpoints"), { cache: "no-store" }).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      setGalat(pesanGalatApi(body) ?? "Checkpoints could not be loaded.");
      return;
    }
    setGalat("");
    setData(body as Muat);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    // Sama dengan tab Sessions: angka selesai bergerak saat petugas memindai.
    const poll = window.setInterval(() => void load(), 30_000);
    return () => { window.clearTimeout(timer); window.clearInterval(poll); };
  }, [load]);

  async function kirim(method: "POST" | "PATCH" | "DELETE", payload: Record<string, unknown> | null, query = "") {
    setBusy(true);
    const response = await fetch(eventApiPath(`/api/admin/checkpoints${query}`), {
      method,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    }).catch(() => null);
    setBusy(false);
    if (!response) { toast.error("Connection failed", "Reload to see the current state."); return null; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast.error("Not saved", pesanGalatApi(body) ?? "Try again."); return null; }
    await load();
    return body as Record<string, unknown>;
  }

  async function ubahSetelan(patch: Partial<Pick<Muat["settings"], "enabled" | "points_enabled">>) {
    if (!data) return;
    const lama = data.settings;
    // Tujuan hanya berlaku saat poin menyala: panelnya ditutup bersama sakelarnya.
    if (patch.points_enabled === false && pilih === "tujuan") setPilih(null);
    // Optimistis, sama dengan sakelar Walk-in: dikembalikan bila server menolak.
    setData({ ...data, settings: { ...lama, ...patch } });
    const hasil = await kirim("PATCH", { settings: patch });
    if (!hasil) setData((kini) => (kini ? { ...kini, settings: lama } : kini));
  }

  function buka(id: number | "baru") {
    setPilih(id);
    setDicoba(false);
    const cp = id === "baru" ? null : data?.checkpoints.find((item) => item.id === id) ?? null;
    setForm(cp ? keForm(cp) : FORM_KOSONG);
  }

  function bukaTujuan() {
    if (!data) return;
    setPilih("tujuan");
    setDicoba(false);
    setFormTujuan(keFormTujuan(data.settings.goal, data.checkpoints.reduce((jumlah, cp) => jumlah + (cp.points ?? 0), 0)));
  }

  async function simpan() {
    if (!data) return;
    const isi = keIsi(form, data.settings.points_enabled, siapWaktu, siapPesan);
    if (pilih === "baru") {
      const hasil = await kirim("POST", isi);
      if (hasil) { toast.success("Checkpoint added", `${isi.title} is now step ${data.checkpoints.length + 1}.`); setPilih(Number(hasil.id)); setDicoba(false); }
    } else if (typeof pilih === "number") {
      const hasil = await kirim("PATCH", { id: pilih, ...isi });
      if (hasil) toast.success("Checkpoint saved", isi.title);
    }
  }

  async function simpanTujuan(points: number, reward: string) {
    if (!data) return;
    const goal: Record<string, unknown> = { points, reward };
    // Isian English hanya ada saat halaman English menyala. Tanpa isian itu, teks
    // English tersimpan dipertahankan selama teks Indonesianya sama (rewardEnBaru).
    if (data.en_available) goal.reward_en = rapiTujuan(formTujuan.reward_en) || null;
    const hasil = await kirim("PATCH", { settings: { goal } });
    if (!hasil) return;
    const tersimpan = (hasil.settings as { goal?: TujuanPoin | null } | undefined)?.goal ?? null;
    if (tersimpan) setFormTujuan({ points: String(tersimpan.points), reward: tersimpan.reward, reward_en: tersimpan.reward_en ?? "" });
    setDicoba(false);
    toast.success("Points goal saved", `Goal: ${angka(points)} pts`);
  }

  async function hapusTujuan() {
    const hasil = await kirim("PATCH", { settings: { goal: null } });
    if (hasil) { setPilih(null); toast.success("Points goal removed", "Participants no longer see the goal line."); }
  }

  async function hapusCheckpoint(cp: Checkpoint) {
    const hasil = await kirim("DELETE", null, `?id=${cp.id}`);
    setHapus(null);
    if (hasil) { setPilih(null); toast.success("Checkpoint deleted", "Scans and handed-out items are kept."); }
  }

  if (galat && !data) {
    return (
      <Pane className="w-full max-w-[760px]">
        <p role="alert" className="m-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error">
          <XCircle size={18} className="mt-0.5 shrink-0" aria-hidden />{galat} The page tries again every 30 seconds.
        </p>
      </Pane>
    );
  }

  const poin = data?.settings.points_enabled === true;
  const daftar = data?.checkpoints ?? [];
  // Sama dengan total_points di kartu peserta: tujuan di atasnya tidak ditampilkan ke peserta.
  const ditawarkan = daftar.reduce((jumlah, cp) => jumlah + (cp.points ?? 0), 0);
  const tujuan = data?.settings.goal ?? null;
  const tujuanTerbuka = pilih === "tujuan";
  const tujuanKetinggian = tujuan !== null && tujuan.points > ditawarkan;
  const namaBukti = (cp: Checkpoint) =>
    cp.session_id
      ? {
          jenis: cp.completion === "self" ? "Participants scan" : cp.completion === "both" ? "Participants or staff scan" : "Scanned at session",
          nama: data?.sessions.find((s) => s.id === cp.session_id)?.name ?? "Session",
        }
      : { jenis: "Item handed out", nama: data?.items.find((i) => i.id === cp.item_id)?.name ?? "Kit item" };
  const terpilih = typeof pilih === "number" ? daftar.find((cp) => cp.id === pilih) ?? null : null;
  const posisi = terpilih ? daftar.indexOf(terpilih) : -1;
  const galatJudul = dicoba && form.title.trim().length === 0 ? "Add a title participants will see." : undefined;
  const galatBukti = dicoba && form.bukti === "" ? "Choose what records this checkpoint." : undefined;

  // Pola tombol bilah tabel Airtable/Notion: labelnya menyebut setelan yang berlaku
  // dan membuka editornya di samping daftar.
  const tombolTujuan = data && poin ? (
    <Button
      variant="text"
      aria-expanded={tujuanTerbuka}
      aria-controls={tujuanTerbuka ? "panel-tujuan-poin" : undefined}
      icon={!tujuan ? <Plus size={16} weight="bold" /> : tujuanKetinggian ? <WarningCircle size={16} weight="fill" /> : <Target size={16} />}
      className={cx(tujuanTerbuka && "bg-secondary-container", tujuanKetinggian && "text-warning")}
      onClick={() => (tujuanTerbuka ? setPilih(null) : bukaTujuan())}
    >
      {!tujuan ? "Add points goal" : tujuanKetinggian ? `Goal: ${angka(tujuan.points)} pts · above ${angka(ditawarkan)} on offer` : `Goal: ${angka(tujuan.points)} pts`}
    </Button>
  ) : null;

  const list = (
    <Pane aria-label="Checkpoints">
      {/* Bilah menyusun diri menurut lebarnya sendiri (container query): satu baris
          bila muat; dua baris saat panel terbuka di 1280 (Show dan hitungan di atas,
          Points dan tombol tujuan di bawah); tiga baris di ponsel. Setiap baris 36 px,
          jadi tombol tujuan 36 px tidak butuh margin negatif. */}
      <div className="@container flex shrink-0 flex-wrap items-center gap-x-6 gap-y-1 border-b border-outline-variant px-4 py-1">
        <div className="flex min-h-9 items-center @max-md:basis-full">
          <Switch simpan
            checked={data?.settings.enabled === true}
            disabled={!data || busy}
            onChange={(value) => void ubahSetelan({ enabled: value })}
            label="Show in participant area"
          />
        </div>
        <div className="flex min-h-9 items-center gap-3 @max-md:contents @md:@max-lg:order-2 @md:@max-lg:basis-full">
          <Switch simpan
            checked={poin}
            disabled={!data || busy}
            onChange={(value) => void ubahSetelan({ points_enabled: value })}
            label="Points"
          />
          {tombolTujuan ? <div className="flex @max-md:order-3 @max-md:basis-full">{tombolTujuan}</div> : null}
        </div>
        {/* Kehadiran untuk panitia di portal peserta (akses-panitia.tsx). */}
        <div className="flex min-h-9 items-center @max-md:basis-full @md:@max-lg:order-2">
          <AksesPanitia tipeAwal={data?.committee_types ?? null} />
        </div>
        <span className="ml-auto inline-flex min-h-9 items-center text-body-medium tabular-nums text-on-surface-variant @md:@max-lg:order-1">
          {data && daftar.length > 0 && data.finished_all != null && data.participants != null
            ? `${angka(data.finished_all)} of ${angka(data.participants)} finished all`
            : null}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container-high px-4 py-2.5 text-body-medium font-medium text-on-surface-variant">
        <span className="w-7 shrink-0" />
        <span className="min-w-0 flex-1">Checkpoint</span>
        <span className="w-40 shrink-0 max-sm:hidden">Done when</span>
        <span className="w-16 shrink-0 text-right">Done</span>
        {poin ? <span className="w-10 shrink-0 text-right">Pts</span> : null}
      </div>
      <PaneBody>
        {!data ? (
          <div role="status" aria-label="Loading" className="flex flex-col">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2 border-b border-outline-variant px-4 py-3.5">
                <div className="h-3 w-44 animate-pulse rounded bg-surface-container-high" />
                <div className="h-3 w-32 animate-pulse rounded bg-surface-container-high" />
              </div>
            ))}
          </div>
        ) : daftar.length === 0 ? (
          <EmptyState
            plain
            icon={<Flag size={40} />}
            title="No checkpoints yet"
            description="A checkpoint is a step participants tick off, such as collecting the ID card or dropping luggage. It is done when they are scanned at a session or an item is handed to them."
            action={<Button icon={<Plus size={16} weight="bold" />} onClick={() => buka("baru")}>New checkpoint</Button>}
          />
        ) : (
          daftar.map((cp, index) => {
            const bukti = namaBukti(cp);
            return (
              <ListRow key={cp.id} selected={cp.id === pilih} onSelect={() => buka(cp.id)}>
                <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-container-high text-body-small font-semibold tabular-nums text-on-surface-variant">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-on-surface">{cp.title}</span>
                  <span className="block truncate text-on-surface-variant">
                    {[ringkasWaktu(cp.agenda_item_ids ?? [], agendaTrip.agenda), cp.place].filter(Boolean).join(" · ") || <span className="sm:hidden">{bukti.nama}</span>}
                  </span>
                </span>
                <span className="w-40 shrink-0 max-sm:hidden">
                  <span className="block text-body-small text-on-surface-variant">{bukti.jenis}</span>
                  <span className="block truncate text-on-surface">{bukti.nama}</span>
                </span>
                <span className="w-16 shrink-0 text-right tabular-nums text-on-surface">{angka(cp.done)}</span>
                {poin ? <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-on-surface">{cp.points ?? 0}</span> : null}
              </ListRow>
            );
          })
        )}
      </PaneBody>
      <PaneFooter note="Participants see this order. The scan desk never turns anyone away for skipping a step; it only shows what is still open.">
        {daftar.length > 0 ? <Button icon={<Plus size={16} weight="bold" />} disabled={!data} onClick={() => buka("baru")}>New checkpoint</Button> : null}
      </PaneFooter>
    </Pane>
  );

  const tanpaPilihan = data && data.sessions.length === 0 && data.items.length === 0;
  // Sesi tersimpan dengan scan mandiri: tempat QR-nya ditampilkan.
  const sesiTersimpan = terpilih?.session_id && terpilih.completion !== "staff" && form.bukti === `s:${terpilih.session_id}` && form.completion !== "staff" ? terpilih.session_id : null;
  const namaSesiTersimpan = sesiTersimpan ? data?.sessions.find((s) => s.id === sesiTersimpan)?.name ?? "this session" : "";
  // Pola Choice di Lucky draw > Tiket tambahan: kartu radio dengan keterangan.
  // Hanya checkpoint yang dipindai peserta sendiri punya layar hasil di ponselnya.
  const pesanScan = form.bukti.startsWith("s:") && form.completion !== "staff" && data?.self_scan_ready !== false;
  const caraSelesai = (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-label-large font-semibold text-on-surface">How it gets done</legend>
      {data && data.self_scan_ready === false ? (
        <p className="rounded-md bg-surface-container-high px-4 py-2.5 text-body-medium text-on-surface-variant">Staff scan the participant&apos;s QR. Letting participants scan needs a database update first (migration 202610180001).</p>
      ) : (
        PILIHAN_SELESAI.map((pilihan) => {
          const aktif = form.completion === pilihan.value;
          return (
            <label
              key={pilihan.value}
              className={cx(
                "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-body-medium",
                aktif ? "border-2 border-primary bg-primary-soft p-[11px]" : "border-outline-variant",
              )}
            >
              <input
                type="radio"
                name="checkpoint-cara"
                value={pilihan.value}
                checked={aktif}
                onChange={() => setForm({ ...form, completion: pilihan.value })}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0">
                <span className="block font-semibold text-on-surface">{pilihan.title}</span>
                <span className="block text-on-surface-variant">{pilihan.description}</span>
              </span>
            </label>
          );
        })
      )}
      {sesiTersimpan ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-surface-container px-3 py-2.5">
          <QrCode size={20} aria-hidden className="shrink-0 text-primary" />
          <span className="min-w-48 flex-1 text-body-medium text-on-surface-variant">
            On the scanner app, choose <span className="font-semibold text-on-surface">{namaSesiTersimpan}</span> and tap <span className="font-semibold text-on-surface">Show QR</span>.
          </span>
          <Link
            href={`/checkpoint-qr?s=${sesiTersimpan}`}
            target="_blank"
            className="inline-flex min-h-9 items-center gap-1 rounded-sm text-body-medium font-semibold text-primary hover:underline"
          >
            Open on a screen
            <ArrowSquareOut size={16} aria-hidden />
          </Link>
        </div>
      ) : null}
    </fieldset>
  );
  const panelCheckpoint = typeof pilih === "number" || pilih === "baru" ? (
    <Pane as="aside" aria-label={pilih === "baru" ? "New checkpoint" : `Checkpoint ${terpilih?.title ?? ""}`}>
      <div className="flex shrink-0 items-start gap-3 border-b border-outline-variant px-5 py-4">
        <h2 className="min-w-0 flex-1 break-words text-title-medium font-semibold leading-6">{pilih === "baru" ? "New checkpoint" : terpilih?.title}</h2>
        <IconButton size="sm" label="Close" onClick={() => setPilih(null)}><X size={16} /></IconButton>
      </div>
      <PaneBody>
        <form
          id="form-checkpoint"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            // Tombol tidak pernah mati diam-diam: isian yang kurang ditandai di
            // tempatnya, dan fokus pindah ke sana.
            if (form.title.trim().length === 0 || form.bukti === "") {
              setDicoba(true);
              const sasaran = form.title.trim().length === 0 ? "checkpoint-judul-isian" : "checkpoint-bukti";
              requestAnimationFrame(() => document.querySelector<HTMLElement>(`#${sasaran} input, #${sasaran} select, #${sasaran} [tabindex]`)?.focus());
              return;
            }
            void simpan();
          }}
        >
          <DetailSection>
            <div id="checkpoint-judul-isian">
            <TextField
              label="Title participants see"
              error={galatJudul}
              value={form.title}
              maxLength={80}
              autoFocus={pilih === "baru"}
              placeholder="e.g. Collect your ID card"
              hint="In the event's main language."
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
            </div>
            <TextField
              label="Where"
              optional
              value={form.place}
              maxLength={120}
              placeholder="e.g. Registration desk, main lobby"
              onChange={(event) => setForm({ ...form, place: event.target.value })}
            />
            {data && !siapWaktu ? (
              <div>
                <p className="m3-field-label flex items-baseline gap-2 text-label-large font-semibold text-on-surface">When <span className="text-body-small font-normal text-on-surface-variant">optional</span></p>
                <p className="mt-2 rounded-md bg-surface-container-high px-4 py-2.5 text-body-medium text-on-surface-variant">Picking an agenda row for the date and time needs a database update first (migration 202610220001).</p>
              </div>
            ) : (
              [...form.agenda, ...(form.agenda.length < TAUTAN_AGENDA_MAX ? [null] : [])].map((id, urutan) => (
                <PilihBarisAgenda
                  key={id ?? "baru"}
                  value={id}
                  agendaTrip={agendaTrip}
                  dipakai={new Map()}
                  teks={{
                    label: urutan === 0 ? "When" : "Another agenda row",
                    kosong: urutan === 0
                      ? "Pick the agenda row for this step. Participants see its date and time here, and it follows when the row moves in Agenda."
                      : "For a date that differs per batch, add that batch's row. Each participant gets the row they can see in Agenda.",
                    terpilih: urutan === 0 && form.agenda.length <= 1
                      ? "Participants see this row's date and time on the step. Change it in Agenda and the step follows."
                      : "Participants who can see this row in Agenda get its date and time.",
                  }}
                  onChange={(isi) => setForm({ ...form, agenda: [...new Set(isi === null ? form.agenda.filter((x) => x !== id) : id === null ? [...form.agenda, isi] : form.agenda.map((x) => (x === id ? isi : x)))] })}
                />
              ))
            )}
          </DetailSection>
          <DetailSection title="Done when">
            {tanpaPilihan ? (
              <div id="checkpoint-bukti">
                <p tabIndex={-1} className={`flex gap-2 text-body-medium outline-none ${dicoba ? "text-error" : "text-on-surface"}`}>
                  <WarningCircle size={20} weight="fill" aria-hidden className="mt-px shrink-0 text-error" />
                  <span><span className="font-semibold">Can&apos;t add yet:</span> a checkpoint is done when a scan session or a kit item records it, and this event has neither. Create one first.</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outlined" size="sm" onClick={keSesi}>Open Sessions</Button>
                  <ButtonLink href="/admin/logistik?tab=barang" variant="outlined" size="sm">Open Logistics &gt; Kit items</ButtonLink>
                </div>
              </div>
            ) : (
              <div id="checkpoint-bukti"><SelectField label="Recorded by" error={galatBukti} value={form.bukti} onChange={(event) => setForm({ ...form, bukti: event.target.value })} hint="The scan session or kit item that marks this step done.">
                <option value="" disabled>Choose a session or kit item</option>
                {data && data.sessions.length > 0 ? (
                  <optgroup label="Scanned at session">
                    {data.sessions.map((s) => <option key={`s${s.id}`} value={`s:${s.id}`}>{s.name}{s.is_active ? "" : " (closed)"}</option>)}
                  </optgroup>
                ) : null}
                {data && data.items.length > 0 ? (
                  <optgroup label="Item handed out">
                    {data.items.map((i) => <option key={`i${i.id}`} value={`i:${i.id}`}>{i.name}</option>)}
                  </optgroup>
                ) : null}
              </SelectField></div>
            )}
            {form.bukti.startsWith("s:") ? caraSelesai : form.bukti.startsWith("i:") ? (
              <p className="text-body-medium text-on-surface-variant">Kit items are handed over by staff, so staff scan them on the scan screen.</p>
            ) : null}
            {poin ? (
              <TextField
                label="Points"
                type="number"
                inputMode="numeric"
                min={0}
                max={10000}
                value={form.points}
                placeholder="0"
                className="max-w-40"
                onChange={(event) => setForm({ ...form, points: event.target.value })}
              />
            ) : null}
            {pesanScan ? (
              data && !siapPesan ? (
                <div>
                  <p className="m3-field-label flex items-baseline gap-2 text-label-large font-semibold text-on-surface">Message after scan <span className="text-body-small font-normal text-on-surface-variant">optional</span></p>
                  <p className="mt-2 rounded-md bg-surface-container-high px-4 py-2.5 text-body-medium text-on-surface-variant">A message on the participant&apos;s result screen needs a database update first (migration 202610290002).</p>
                </div>
              ) : (
                <TextArea
                  label="Message after scan"
                  optional
                  rows={2}
                  counter
                  value={form.pesan}
                  maxLength={200}
                  placeholder="e.g. You can join the Gala Dinner. Show this screen at the door."
                  hint="Shown on the participant's result screen when they scan this checkpoint, also if they scanned it before. In the event's main language."
                  onChange={(event) => setForm({ ...form, pesan: event.target.value })}
                />
              )
            ) : null}
          </DetailSection>
          <DetailSection title="English participant page">
            <TextField label="Title in English" optional value={form.title_en} maxLength={80} onChange={(event) => setForm({ ...form, title_en: event.target.value })} hint="Leave empty to use the title above." />
            <TextField label="Where in English" optional value={form.place_en} maxLength={120} onChange={(event) => setForm({ ...form, place_en: event.target.value })} />
            {pesanScan && siapPesan ? (
              <TextArea label="Message after scan in English" optional rows={2} counter value={form.pesan_en} maxLength={200} onChange={(event) => setForm({ ...form, pesan_en: event.target.value })} hint="Leave empty to use the message above." />
            ) : null}
          </DetailSection>
          {terpilih ? (
            <DetailSection title="Progress">
              <p className="text-body-medium text-on-surface-variant">
                <span className="font-semibold tabular-nums text-on-surface">{angka(terpilih.done)}</span> participants have done this.
                {" "}Deleting the checkpoint keeps their scans and handed-out items.
              </p>
            </DetailSection>
          ) : null}
        </form>
      </PaneBody>
      {/* 36 px (md), sama dengan kaki panel tujuan: kaki tidak berubah tinggi saat berpindah panel. */}
      <PaneFooter>
        {terpilih ? (
          <>
            <Button simpan variant="outlined" className="text-error" disabled={busy} onClick={() => setHapus(terpilih)}>Delete</Button>
            <Button simpan variant="outlined" disabled={busy || posisi <= 0} onClick={() => void kirim("PATCH", { id: terpilih.id, move: "up" })}>Move up</Button>
            <Button simpan variant="outlined" disabled={busy || posisi < 0 || posisi >= daftar.length - 1} onClick={() => void kirim("PATCH", { id: terpilih.id, move: "down" })}>Move down</Button>
          </>
        ) : null}
        <Button simpan type="submit" form="form-checkpoint" loading={busy}>{pilih === "baru" ? "Add checkpoint" : "Save"}</Button>
      </PaneFooter>
    </Pane>
  ) : null;

  // ---- Panel tujuan poin (E-08) ------------------------------------------------
  // Pola bilah "gratis ongkir" toko Shopify: ambang dan hadiahnya diisi, lalu
  // kalimat yang dilihat pembeli dipratinjau dengan angka nyata sebelum disimpan.
  const nTujuan = angkaTujuan(formTujuan.points);
  const rewardRapi = rapiTujuan(formTujuan.reward);
  const rewardEnRapi = rapiTujuan(formTujuan.reward_en);
  const galatAngka = dicoba && nTujuan === null ? `Enter a whole number from 1 to ${angka(TUJUAN_POIN_MAX)}.` : undefined;
  const galatReward = dicoba && rewardRapi === "" ? "Add what the points are for." : undefined;
  const isianKetinggian = nTujuan !== null && nTujuan > ditawarkan;
  const hintAngka = isianKetinggian ? (
    // Peringatan, bukan galat: checkpoint berpoin bisa ditambah belakangan.
    <span className="flex items-start gap-1.5 font-medium text-warning">
      <WarningCircle size={16} weight="fill" className="mt-px shrink-0" aria-hidden />
      {ditawarkan > 0 ? `Above the ${poinEn(ditawarkan)} on offer, so nobody can reach it.` : "No checkpoint gives points yet, so nobody can reach it."}
    </span>
  ) : (
    `Out of ${poinEn(ditawarkan)} on offer`
  );
  const angkaContoh = nTujuan === null ? "…" : String(nTujuan);

  function pratinjauTujuan() {
    if (nTujuan === null || rewardRapi === "") {
      return <p className="text-body-medium text-on-surface-variant">The sentence shows here once Goal and What it&apos;s for are filled in.</p>;
    }
    // Peserta di tengah jalan, lalu yang sudah mencapai tujuan. Kalimatnya dari
    // kalimatTujuan, fungsi yang sama dengan kartu checkpoint peserta.
    const contoh = Math.floor(nTujuan / 2);
    const baris = [
      { label: `With ${angka(contoh)} of ${poinEn(nTujuan)}`, sisa: nTujuan - contoh },
      { label: `With ${poinEn(nTujuan)} or more`, sisa: 0 },
    ];
    const pakaiEn = data?.en_available === true && rewardEnRapi !== "";
    return (
      <>
        {isianKetinggian ? (
          <p className="text-body-small font-medium text-warning">Participants don&apos;t see this line while the goal is above the points on offer.</p>
        ) : null}
        <ul className="overflow-hidden rounded-lg border border-outline-variant">
          {baris.map((b, index) => {
            const id = kalimatTujuan({ sisa: b.sisa, reward: rewardRapi, lang: "id" });
            const en = pakaiEn ? kalimatTujuan({ sisa: b.sisa, reward: rewardEnRapi, lang: "en" }) : null;
            return (
              <li key={b.label} className={cx("flex flex-col gap-1 px-4 py-3", index > 0 && "border-t border-outline-variant")}>
                <span className="text-body-small text-on-surface-variant">{b.label}</span>
                <span lang="id" className="text-body-medium text-on-surface [overflow-wrap:anywhere]"><span className="font-semibold">{id.tebal}</span> {id.sisa}</span>
                {en ? <span lang="en" className="text-body-medium text-on-surface-variant [overflow-wrap:anywhere]"><span className="font-semibold">{en.tebal}</span> {en.sisa}</span> : null}
              </li>
            );
          })}
        </ul>
        {data?.en_available && !pakaiEn ? (
          <p className="text-body-small text-on-surface-variant">The English participant page shows the Indonesian sentence until the English text is filled in.</p>
        ) : null}
      </>
    );
  }

  const panelTujuan = tujuanTerbuka && data ? (
    <Pane as="aside" aria-label="Points goal" id="panel-tujuan-poin">
      <div className="flex shrink-0 items-start gap-3 border-b border-outline-variant px-5 py-4">
        <h2 className="min-w-0 flex-1 break-words text-title-medium font-semibold leading-6">Points goal</h2>
        <IconButton size="sm" label="Close" onClick={() => setPilih(null)}><X size={16} /></IconButton>
      </div>
      <PaneBody>
        {!data.goal_ready ? (
          // Tanpa tombol: tidak ada yang bisa ditekan lalu gagal.
          <DetailSection>
            <p className="rounded-md bg-surface-container-high px-4 py-2.5 text-body-medium text-on-surface-variant">The points goal needs a database update first (migration 202610170001).</p>
          </DetailSection>
        ) : (
          <form
            id="form-tujuan"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (busy) return;
              if (nTujuan === null || rewardRapi === "") {
                setDicoba(true);
                const sasaran = nTujuan === null ? "tujuan-angka" : "tujuan-untuk";
                requestAnimationFrame(() => document.querySelector<HTMLElement>(`#${sasaran} input`)?.focus());
                return;
              }
              void simpanTujuan(nTujuan, rewardRapi);
            }}
          >
            <DetailSection>
              <div id="tujuan-angka">
                <TextField
                  label="Goal"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={TUJUAN_POIN_MAX}
                  step={1}
                  value={formTujuan.points}
                  autoFocus={!tujuan}
                  className="max-w-56"
                  trailing={<span aria-hidden className="text-body-large text-on-surface-variant">pts</span>}
                  error={galatAngka}
                  hint={hintAngka}
                  onChange={(event) => setFormTujuan({ ...formTujuan, points: event.target.value })}
                />
              </div>
              <div id="tujuan-untuk">
                <TextField
                  label="What it's for"
                  value={formTujuan.reward}
                  maxLength={TUJUAN_TEKS_MAX}
                  counter
                  placeholder="masuk undian malam puncak"
                  error={galatReward}
                  hint={`Completes “${angkaContoh} poin lagi untuk …”`}
                  onChange={(event) => setFormTujuan({ ...formTujuan, reward: event.target.value })}
                />
              </div>
            </DetailSection>
            {data.en_available ? (
              <DetailSection title="English participant page">
                <TextField
                  label="What it's for in English"
                  optional
                  value={formTujuan.reward_en}
                  maxLength={TUJUAN_TEKS_MAX}
                  counter
                  placeholder="enter the gala-night draw"
                  hint={`Completes “${angkaContoh} more points to …”`}
                  onChange={(event) => setFormTujuan({ ...formTujuan, reward_en: event.target.value })}
                />
              </DetailSection>
            ) : null}
            <DetailSection title="What participants see">{pratinjauTujuan()}</DetailSection>
          </form>
        )}
      </PaneBody>
      {data.goal_ready ? (
        <PaneFooter>
          {tujuan ? <Button simpan variant="outlined" className="text-error" disabled={busy} onClick={() => void hapusTujuan()}>Remove goal</Button> : null}
          <Button simpan type="submit" form="form-tujuan" loading={busy}>Save goal</Button>
        </PaneFooter>
      ) : null}
    </Pane>
  ) : null;

  return (
    <>
      {data && !data.settings.enabled && daftar.length > 0 ? (
        <p className="mb-3 rounded-md bg-surface-container-high px-4 py-2.5 text-body-medium text-on-surface-variant">
          Participants do not see these yet. Switch on Show in participant area when the list is ready. Its place on the participant home is set in{" "}
          <Link href="/admin/area-peserta" className="rounded-sm font-medium text-primary hover:underline">Participant area</Link>.
        </p>
      ) : null}
      <ListDetail list={list} detail={!data ? null : panelTujuan ?? panelCheckpoint} />
      <Dialog
        open={hapus !== null}
        onClose={() => setHapus(null)}
        dismissible={!busy}
        tone="danger"
        title={`Delete ${hapus?.title ?? "checkpoint"}?`}
        description="Participants stop seeing this step. Scans and handed-out items stay recorded."
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setHapus(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={busy} onClick={() => { if (hapus) void hapusCheckpoint(hapus); }}>Delete checkpoint</Button>
          </>
        }
      />
    </>
  );
}
