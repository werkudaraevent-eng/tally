"use client";

import { pesanGalatApi } from "@/lib/api-message";
import { ArrowSquareOut, Plus, QrCode, Television, X, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Button, ButtonLink, DetailSection, Dialog, EmptyState, IconButton, KeyValue, ListDetail, MetaSeparator, Pane, PaneBody,
  PaneFooter, StatusChip, StatusDot, Switch, Tabs, TextField, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";
import { useAdminPage, useTerkunci } from "@/components/admin/page-context";
import { useToast } from "@/components/toast";
import { formatEventDateTime } from "@/lib/datetime";
import { eventApiPath } from "@/lib/event-url";
import { cx } from "@/lib/m3/cx";
import { useEventTimeZone } from "@/lib/use-event-timezone";
import type { PilihanInfo } from "@/lib/info-scan";
import { CheckpointsTab } from "./checkpoints";
import { InfoScanSesi } from "./info-scan-sesi";

/**
 * CMS sesi kehadiran.
 *
 * Satu sesi = satu checkpoint tempat peserta dipindai: registrasi, workshop,
 * makan siang. Petugas membukanya lewat /scan dengan akun "Petugas scan", dan
 * angka di sini bergerak saat mereka memindai.
 *
 * "Hadir" menghitung ORANG UNIK, "scan" menghitung ketukan. Keduanya ditampilkan
 * bersebelahan dengan sengaja: selisih besar di antaranya adalah tanda sesi yang
 * pesertanya keluar-masuk, informasi yang hilang kalau hanya satu angka yang
 * dilaporkan.
 */

type Sesi = {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  hadir: number;
  total_scan: number;
  terakhir: string | null;
  /** Check-in > Sessions > Record luggage. Tidak ada sebelum migrasi 202610230003. */
  records_luggage?: boolean;
  /** Total bagasi sesi ini, hanya bila sesinya mencatat bagasi. */
  bagasi?: { bags: number; people: number; photos: number };
  /** Luggage: Pick-up. Tidak ada sebelum migrasi 202610240001. */
  luggage_pickup?: boolean;
  /** Kemajuan meja ambil se-acara, hanya bila sesinya meja ambil. */
  ambil_bagasi?: { handedPeople: number; handedBags: number; waitingPeople: number; waitingBags: number };
  /** Shown after scan. Tidak ada sebelum migrasi 202610300001; null = Company · Job title. */
  scan_fields?: unknown;
  /** Pindai ulang. Tidak ada sebelum migrasi 202611010001. */
  repeat_scan?: "allow" | "stop";
  /** Check-in tanpa sinyal. Tidak ada sebelum migrasi 202611010001. */
  offline_ok?: boolean;
};

const ULANG: Array<{ value: "allow" | "stop"; label: string; detail: string }> = [
  { value: "allow", label: "Let them in", detail: "Orange \"Already scanned\": they can still go in. Right for most sessions, where people step out and come back." },
  { value: "stop", label: "Stop and check", detail: "Red \"Already used\": staff check that the badge belongs to this person before letting them in. For doors where a badge must not be passed on." },
];

type ModeBagasi = "off" | "dropoff" | "pickup";

const MODE_BAGASI: Array<{ value: ModeBagasi; label: string; detail: string }> = [
  { value: "off", label: "Off", detail: "Scanning here does not touch luggage." },
  { value: "dropoff", label: "Drop-off", detail: "Staff enter how many bags the participant hands in and take one photo of them." },
  { value: "pickup", label: "Pick-up", detail: "Staff see the bags and photo from every drop-off desk, then record the handover." },
];

const orang = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
const koper = (n: number) => `${n} ${n === 1 ? "bag" : "bags"}`;

/**
 * Jalur registrasi: satu MEJA, bukan satu tahap acara.
 *
 * Lima meja berdampingan di pintu masuk adalah lima jalur yang semuanya
 * melayani sesi "Registrasi" yang sama. Dibuat sebagai lima sesi, jumlah hadir
 * pecah menjadi lima angka yang harus dijumlahkan sendiri, dan tamu yang
 * pindah antrean terhitung dua kali tanpa ada yang bisa melihatnya.
 *
 * Gunanya dua: setiap TV layar sapa menyapa tamu mejanya sendiri, dan laporan
 * bisa menjawab meja mana yang kebanjiran pada jam berapa.
 */
type Jalur = {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  total_scan: number;
};

type Bagian = "sesi" | "meja" | "checkpoint";

/** Barang yang dibagikan (dibuat di Logistik) dan pasangannya dengan sesi. */
type Barang = { id: number; name: string; size_field_key: string | null };
type Pasangan = { session_id: number; item_id: number };

const slugify = (teks: string) =>
  teks.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const PENJELASAN_JALUR =
  "One desk is one queue at the entrance. Add desks only when several queues run at once, so each welcome screen TV greets its own desk's guests and reports show which desk was busiest.";

export default function AttendanceAdminPage() {
  const [sessions, setSessions] = useState<Sesi[]>([]);
  const [lanes, setLanes] = useState<Jalur[]>([]);
  const [barang, setBarang] = useState<Barang[]>([]);
  const [pasangan, setPasangan] = useState<Pasangan[]>([]);
  const [allowWalkIn, setAllowWalkIn] = useState(false);
  const [walkInCount, setWalkInCount] = useState(0);
  const [infoPilihan, setInfoPilihan] = useState<PilihanInfo[]>([]);
  const [nama, setNama] = useState("");
  const [slug, setSlug] = useState("");
  const [namaJalur, setNamaJalur] = useState("");
  const [busy, setBusy] = useState(false);
  // Pilihan bagasi menyimpan langsung, seperti sakelar `simpan`: nonaktif di acara terkunci.
  const terkunci = useTerkunci(true);
  const [error, setError] = useState("");
  const [errorJalur, setErrorJalur] = useState("");
  // Pemuatan pertama sudah selesai (berhasil atau gagal). Sebelum itu daftar
  // kosong berarti "belum tahu", bukan "belum ada sesi".
  const [dimuat, setDimuat] = useState(false);
  const [bagian, setBagian] = useState<Bagian>("sesi");
  const [pilihSesi, setPilihSesi] = useState<number | null>(null);
  const [pilihJalur, setPilihJalur] = useState<number | null>(null);
  const [sesiBaru, setSesiBaru] = useState(false);
  const [bukaPengaturan, setBukaPengaturan] = useState(false);
  // Menutup sesi atau meja berdampak ke setiap ponsel petugas sekaligus, jadi
  // selalu lewat konfirmasi; dulu cukup satu ketukan sakelar di baris daftar.
  const [tutup, setTutup] = useState<{ jenis: "sesi" | "meja"; id: number; name: string; tanpaSinyal?: boolean } | null>(null);
  // Peserta aktif acara ini, untuk "N not here yet". Null: belum dimuat atau server lama.
  const [totalPeserta, setTotalPeserta] = useState<number | null>(null);
  const [jalurBaru, setJalurBaru] = useState(false);
  const [hapusSesi, setHapusSesi] = useState<Sesi | null>(null);
  const [hapusMeja, setHapusMeja] = useState<Jalur | null>(null);
  // Ganti nama sesi atau meja: slug sengaja tidak ikut berubah, supaya tautan
  // /scan?sesi= dan /sapa?jalur= yang sudah dibagikan ke petugas tetap membuka
  // sesi atau meja yang sama.
  const [ubahNama, setUbahNama] = useState<{ jenis: "sesi" | "meja"; id: number; name: string; slug: string } | null>(null);
  const [namaUbah, setNamaUbah] = useState("");
  const toast = useToast();
  // Peran kustom: Check-in hanya View, jadi tombol yang membuka penyunting disembunyikan.
  const hanyaLihat = Boolean(useAdminPage()?.hanyaLihat);
  const { zone, abbr } = useEventTimeZone();
  // `?tab=checkpoint`: tautan "Edit in Check-in" dari Participant home.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("tab") === "checkpoint") setBagian("checkpoint");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const load = useCallback(async () => {
    const [sesi, jalur, item] = await Promise.all([
      fetch(eventApiPath("/api/admin/attendance"), { cache: "no-store" }).catch(() => null),
      fetch(eventApiPath("/api/admin/attendance/lanes"), { cache: "no-store" }).catch(() => null),
      fetch(eventApiPath("/api/admin/attendance/items"), { cache: "no-store" }).catch(() => null),
    ]);
    if (!sesi?.ok) { setError("Sessions could not be loaded."); setDimuat(true); return; }
    const body = await sesi.json();
    setSessions(body.sessions ?? []);
    setAllowWalkIn(Boolean(body.allow_walk_in));
    setWalkInCount(body.walk_in_count ?? 0);
    setTotalPeserta(typeof body.participant_total === "number" ? body.participant_total : null);
    setInfoPilihan(body.info_pilihan ?? []);
    if (jalur?.ok) { setLanes((await jalur.json()).lanes ?? []); setErrorJalur(""); }
    else setErrorJalur("Desks could not be loaded.");
    if (item?.ok) {
      const isi = await item.json();
      setBarang(isi.items ?? []);
      setPasangan(isi.links ?? []);
    }
    setError("");
    setDimuat(true);
  }, []);

  async function ubahWalkIn(izinkan: boolean) {
    // Optimistis: sakelar yang baru bergerak setelah jaringan menjawab terasa
    // rusak, dan admin menekannya dua kali. Dikembalikan bila server menolak.
    setAllowWalkIn(izinkan);
    setBusy(true);
    const response = await fetch(eventApiPath("/api/admin/attendance/settings"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendance_allow_walk_in: izinkan }),
    }).catch(() => null);
    setBusy(false);

    if (!response?.ok) {
      setAllowWalkIn(!izinkan);
      toast.error("Not saved", "The walk-in setting did not change. Try again.");
      return;
    }
    toast.success(
      izinkan ? "Walk-in on" : "Walk-in off",
      izinkan
        ? "Scanner staff can now register guests who are not on the list."
        : "The button is gone from the scanner. Participants already added stay.",
    );
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    // 30 detik: angka hadir bergerak saat petugas memindai di pintu masuk, dan
    // panitia yang membuka layar ini sedang memantau antrean berjalan.
    const poll = window.setInterval(() => void load(), 30_000);
    return () => { window.clearTimeout(timer); window.clearInterval(poll); };
  }, [load]);

  async function kirim(method: "POST" | "PATCH", payload: Record<string, unknown>) {
    setBusy(true);
    const response = await fetch(eventApiPath("/api/admin/attendance"), {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    setBusy(false);
    if (!response) { toast.error("Connection lost", "Reload to see the current state."); return false; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Not saved", pesanGalatApi(body) ?? "Try again.");
      return false;
    }
    await load();
    return true;
  }

  async function kirimJalur(method: "POST" | "PATCH", payload: Record<string, unknown>) {
    setBusy(true);
    const response = await fetch(eventApiPath("/api/admin/attendance/lanes"), {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    setBusy(false);
    if (!response) { toast.error("Connection lost", "Reload to see the current state."); return false; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Not saved", pesanGalatApi(body) ?? "Try again.");
      return false;
    }
    await load();
    return true;
  }

  async function ubahBarangSesi(sesiId: number, itemId: number, periksa: boolean) {
    const sekarang = pasangan.filter((p) => p.session_id === sesiId).map((p) => p.item_id);
    const berikut = periksa ? [...sekarang, itemId] : sekarang.filter((id) => id !== itemId);
    // Optimistis, sama dengan sakelar walk-in: dikembalikan bila server menolak.
    const lama = pasangan;
    setPasangan([...pasangan.filter((p) => p.session_id !== sesiId), ...berikut.map((id) => ({ session_id: sesiId, item_id: id }))]);
    setBusy(true);
    const response = await fetch(eventApiPath("/api/admin/attendance/items"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sesiId, item_ids: berikut }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setPasangan(lama);
      toast.error("Not saved", pesanGalatApi(await response?.json().catch(() => ({}))) ?? "The items did not change. Try again.");
    }
  }

  async function hapusJalur(jalur: Jalur) {
    setBusy(true);
    const response = await fetch(eventApiPath(`/api/admin/attendance/lanes?id=${jalur.id}`), { method: "DELETE" }).catch(() => null);
    setBusy(false);
    setHapusMeja(null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      toast.error("Could not delete", pesanGalatApi(body) ?? "Try again.");
      return;
    }
    setPilihJalur(null);
    toast.success("Desk deleted", `${jalur.name} was deleted.`);
    void load();
  }

  async function hapus(sesi: Sesi) {
    setBusy(true);
    const response = await fetch(eventApiPath(`/api/admin/attendance?id=${sesi.id}`), { method: "DELETE" }).catch(() => null);
    setBusy(false);
    setHapusSesi(null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      toast.error("Could not delete", pesanGalatApi(body) ?? "Try again.");
      return;
    }
    setPilihSesi(null);
    toast.success("Session deleted", `${sesi.name} was deleted.`);
    void load();
  }

  function bukaUbahNama(jenis: "sesi" | "meja", baris: Sesi | Jalur) {
    setUbahNama({ jenis, id: baris.id, name: baris.name, slug: baris.slug });
    setNamaUbah(baris.name);
  }
  function tutupUbahNama() { setUbahNama(null); setNamaUbah(""); }

  async function simpanNama() {
    if (!ubahNama) return;
    const payload = { id: ubahNama.id, name: namaUbah.trim() };
    const ok = ubahNama.jenis === "sesi" ? await kirim("PATCH", payload) : await kirimJalur("PATCH", payload);
    if (ok) {
      tutupUbahNama();
      toast.success(ubahNama.jenis === "sesi" ? "Session renamed" : "Desk renamed", "Scanner phones show the new name after they reload.");
    }
  }

  function tutupSesiBaru() { setSesiBaru(false); setNama(""); setSlug(""); }
  function tutupJalurBaru() { setJalurBaru(false); setNamaJalur(""); }

  async function buatSesi() {
    const ok = await kirim("POST", { name: nama.trim(), slug, sort_order: sessions.length });
    if (ok) { tutupSesiBaru(); toast.success("Session added", "Staff can pick it on the scanner now."); }
  }

  async function buatJalur() {
    const ok = await kirimJalur("POST", { name: namaJalur.trim(), slug: slugify(namaJalur), sort_order: lanes.length });
    if (ok) { tutupJalurBaru(); toast.success("Desk added", "Staff can pick it on the scanner now."); }
  }

  // ---- Sesi --------------------------------------------------------------
  const sesiTerpilih = sessions.find((sesi) => sesi.id === pilihSesi) ?? null;

  const daftarSesi = (
    <Pane aria-label="Check-in sessions">
      <KepalaKolom kolom={[["Session", "min-w-0 flex-1"], ["Checked in", "w-24"], ["Status", "w-[72px] text-right"]]} />
      <PaneBody>
        {error ? <Galat pesan={error} />
          : !dimuat ? <Kerangka />
          : sessions.length === 0 ? (
            <EmptyState
              plain
              icon={<QrCode size={40} />}
              title="No sessions yet"
              description="A session is one place where participants are scanned. Most events start with Registration."
            />
          ) : sessions.map((sesi) => (
            <BarisPilih
              key={sesi.id}
              selected={sesi.id === pilihSesi}
              onSelect={() => setPilihSesi(sesi.id)}
              nama={sesi.name}
              aktif={sesi.is_active}
              alamat={totalPeserta === null ? `/scan?sesi=${sesi.slug}` : `${Math.max(totalPeserta - sesi.hadir, 0)} not here yet`}
              angka={<>
                <span className="block font-semibold tabular-nums text-on-surface">{sesi.hadir}</span>
                <span className="block tabular-nums text-on-surface-variant">{sesi.total_scan} {sesi.total_scan === 1 ? "scan" : "scans"}</span>
              </>}
            />
          ))}
      </PaneBody>
    </Pane>
  );

  const detailSesi = sesiTerpilih ? (
    <Pane as="aside" aria-label={`Session ${sesiTerpilih.name}`}>
      <KepalaDetail
        nama={sesiTerpilih.name}
        aktif={sesiTerpilih.is_active}
        onClose={() => setPilihSesi(null)}
        angka={sesiTerpilih.hadir}
        keterangan={`checked in · ${sesiTerpilih.total_scan} ${sesiTerpilih.total_scan === 1 ? "scan" : "scans"}`}
        aksi={<>
          {totalPeserta !== null ? (
            <ButtonLink href={`/admin/participants?hadir=${sesiTerpilih.id}:no`} variant="outlined" size="sm">
              Show who is not here yet ({Math.max(totalPeserta - sesiTerpilih.hadir, 0)})
            </ButtonLink>
          ) : null}
          {hanyaLihat ? null : sesiTerpilih.is_active ? (
            <Button simpan variant="outlined" size="sm" disabled={busy} onClick={() => setTutup({ jenis: "sesi", id: sesiTerpilih.id, name: sesiTerpilih.name, tanpaSinyal: sesiTerpilih.offline_ok === true })}>Close check-in…</Button>
          ) : (
            <Button simpan variant="outlined" size="sm" disabled={busy} onClick={() => void kirim("PATCH", { id: sesiTerpilih.id, is_active: true })}>Open check-in</Button>
          )}
        </>}
      />
      <PaneBody>
        <DetailSection title="Today">
          <dl className="flex flex-col gap-2">
            <KeyValue label="Last scan">{sesiTerpilih.terakhir ? `${formatEventDateTime(sesiTerpilih.terakhir, zone)} ${abbr}` : "None yet"}</KeyValue>
          </dl>
          <p className="text-body-medium text-on-surface-variant">Checked in counts people; scans count every scan. Someone scanned twice is checked in once.</p>
        </DetailSection>
        {/* Aturan pemindai per sesi (migrasi 202611010001). Sebelum migrasinya
            kolomnya tidak ada: pilihannya ditampilkan nonaktif. */}
        <DetailSection title="Scanner rules">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-body-medium font-medium">Repeat scan</legend>
            {ULANG.map((pilihan) => {
              const belumAda = sesiTerpilih.repeat_scan === undefined;
              const on = (sesiTerpilih.repeat_scan ?? "allow") === pilihan.value;
              return (
                <label
                  key={pilihan.value}
                  className={cx(
                    "flex gap-3 rounded-lg p-3 text-body-medium",
                    on ? "border-2 border-primary" : "border border-outline",
                    busy || terkunci || belumAda || hanyaLihat ? "cursor-default opacity-60" : "cursor-pointer",
                  )}
                >
                  <input
                    type="radio"
                    name={`repeat-scan-${sesiTerpilih.id}`}
                    value={pilihan.value}
                    checked={on}
                    disabled={busy || terkunci || belumAda || hanyaLihat}
                    onChange={() => void kirim("PATCH", { id: sesiTerpilih.id, repeat_scan: pilihan.value })}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]"
                  />
                  <span>
                    <span className="block font-medium">{pilihan.label}</span>
                    <span className="block text-on-surface-variant">{pilihan.detail}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <Switch simpan
            checked={sesiTerpilih.offline_ok === true}
            disabled={busy || sesiTerpilih.offline_ok === undefined || hanyaLihat}
            onChange={(value) => void kirim("PATCH", { id: sesiTerpilih.id, offline_ok: value })}
            label="Allow check-in without signal"
            description="When a scanner phone loses signal, it keeps the scan and sends it by itself when the signal is back, so the queue keeps moving. Until then staff see the code, not the name, and repeat or unknown badges show up later in History. Off: the phone shows Not saved and staff scan again."
          />
          {sesiTerpilih.repeat_scan === undefined ? (
            <p className="text-body-medium text-on-surface-variant">Available after the database update for scanner rules is run.</p>
          ) : null}
        </DetailSection>
        {/* Barang dibuat di Logistik; di sini hanya dipilih mana yang diperiksa
            petugas setelah memindai di sesi ini. */}
        <DetailSection
          title="Items handed out"
          action={<ButtonLink href="/admin/logistik" variant="text" size="sm">Manage items</ButtonLink>}
        >
          {barang.length === 0 ? (
            <p className="text-body-medium text-on-surface-variant">
              No items yet. Add them in Logistics, Items tab, if this session also hands out T-shirts or goodie bags.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                {barang.map((item) => (
                  <Switch simpan
                    key={item.id}
                    checked={pasangan.some((p) => p.session_id === sesiTerpilih.id && p.item_id === item.id)}
                    disabled={busy}
                    onChange={(value) => void ubahBarangSesi(sesiTerpilih.id, item.id, value)}
                    label={item.name}
                    description={item.size_field_key ? "Staff see the participant's size." : undefined}
                  />
                ))}
              </div>
              <p className="text-body-medium text-on-surface-variant">After the scan, staff tick the items they hand over. Each item can be collected once per participant, at any session.</p>
            </>
          )}
        </DetailSection>
        {/* Meja bagasi: Drop-off mencatat jumlah dan satu foto setelah memindai
            (totalnya untuk memuat truk per batch); Pick-up menyerahkannya
            kembali, dari meja titip mana pun. Satu sesi hanya salah satunya. */}
        <DetailSection title="Luggage">
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Luggage at this session</legend>
            {MODE_BAGASI.map((mode) => {
              const sekarang: ModeBagasi = sesiTerpilih.luggage_pickup ? "pickup" : sesiTerpilih.records_luggage ? "dropoff" : "off";
              const on = sekarang === mode.value;
              // Sebelum migrasinya, kolomnya tidak ada: pilihan itu tidak bisa disimpan.
              const belumAda = sesiTerpilih.records_luggage === undefined || (mode.value === "pickup" && sesiTerpilih.luggage_pickup === undefined);
              return (
                <label
                  key={mode.value}
                  className={cx(
                    "flex gap-3 rounded-lg p-3 text-body-medium",
                    on ? "border-2 border-primary" : "border border-outline",
                    busy || terkunci || belumAda ? "cursor-default opacity-60" : "cursor-pointer",
                  )}
                >
                  <input
                    type="radio"
                    name={`luggage-mode-${sesiTerpilih.id}`}
                    value={mode.value}
                    checked={on}
                    disabled={busy || terkunci || belumAda}
                    onChange={() =>
                      void kirim("PATCH", {
                        id: sesiTerpilih.id,
                        records_luggage: mode.value === "dropoff",
                        ...(sesiTerpilih.luggage_pickup === undefined ? {} : { luggage_pickup: mode.value === "pickup" }),
                      })
                    }
                    className="mt-0.5 size-4 shrink-0 accent-[var(--md-sys-color-primary)]"
                  />
                  <span>
                    <span className="block font-medium">{mode.label}</span>
                    <span className="block text-on-surface-variant">{mode.detail}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          {sesiTerpilih.bagasi ? (
            <dl className="flex flex-col gap-2">
              <KeyValue label="Bags">
                <span className="tabular-nums">{sesiTerpilih.bagasi.bags} from {orang(sesiTerpilih.bagasi.people)}</span>
              </KeyValue>
              <KeyValue label="Photos">
                <span className="tabular-nums">{sesiTerpilih.bagasi.photos}</span>
              </KeyValue>
            </dl>
          ) : null}
          {sesiTerpilih.ambil_bagasi ? (
            <dl className="flex flex-col gap-2">
              <KeyValue label="Handed over">
                <span className="tabular-nums">{orang(sesiTerpilih.ambil_bagasi.handedPeople)} · {koper(sesiTerpilih.ambil_bagasi.handedBags)}</span>
              </KeyValue>
              <KeyValue label="Still waiting">
                <span className="tabular-nums">{orang(sesiTerpilih.ambil_bagasi.waitingPeople)} · {koper(sesiTerpilih.ambil_bagasi.waitingBags)}</span>
              </KeyValue>
            </dl>
          ) : null}
          {sesiTerpilih.records_luggage ? (
            <p className="text-body-medium text-on-surface-variant">Photos are private: only admins and scanners of this event can open them, and each participant sees their own. They are deleted 30 days after the event ends; the counts stay.</p>
          ) : sesiTerpilih.luggage_pickup ? (
            <p className="text-body-medium text-on-surface-variant">Counts cover every drop-off desk in this event. Each drop-off can be handed over once; staff can undo their own handover.</p>
          ) : null}
        </DetailSection>
        <InfoScanSesi
          key={sesiTerpilih.id}
          scanFields={"scan_fields" in sesiTerpilih ? sesiTerpilih.scan_fields ?? null : undefined}
          pilihan={infoPilihan}
          busy={busy}
          terkunci={terkunci}
          onSimpan={(daftar) => kirim("PATCH", { id: sesiTerpilih.id, scan_fields: daftar })}
        />
        <DetailSection title="Scanner">
          <dl className="flex flex-col gap-2">
            <KeyValue label="Address"><span className="select-all">/scan?sesi={sesiTerpilih.slug}</span></KeyValue>
          </dl>
          <p className="text-body-medium text-on-surface-variant">
            Staff open it with a Scanner account. Create accounts in Users &amp; roles.
          </p>
        </DetailSection>
      </PaneBody>
      {/* Hapus hanya untuk sesi yang belum punya catatan. Server menolak
          sisanya: catatan hadir ikut terhapus bersama sesinya, dan itu
          satu-satunya bukti seseorang datang. */}
      {sesiTerpilih.total_scan > 0 ? (
        <PaneFooter note="This session has check-ins, so it can be closed but not deleted.">
          {hanyaLihat ? null : <Button variant="outlined" size="sm" onClick={() => bukaUbahNama("sesi", sesiTerpilih)}>Edit</Button>}
        </PaneFooter>
      ) : (
        <PaneFooter note="No check-ins yet">
          <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapusSesi(sesiTerpilih)}>Delete session</Button>
          {hanyaLihat ? null : <Button variant="outlined" size="sm" onClick={() => bukaUbahNama("sesi", sesiTerpilih)}>Edit</Button>}
        </PaneFooter>
      )}
    </Pane>
  ) : null;

  // ---- Meja registrasi ---------------------------------------------------
  const jalurTerpilih = lanes.find((jalur) => jalur.id === pilihJalur) ?? null;

  const daftarJalur = (
    <Pane aria-label="Desks">
      <KepalaKolom kolom={[["Desk", "min-w-0 flex-1"], ["Scans", "w-24"], ["Status", "w-[72px] text-right"]]} />
      <PaneBody>
        {errorJalur ? <Galat pesan={errorJalur} />
          : !dimuat ? <Kerangka />
          : lanes.length === 0 ? (
            <EmptyState
              plain
              icon={<Television size={40} />}
              title="No desks yet"
              description={`${PENJELASAN_JALUR} Without desks, every scan goes to one pool and the welcome screen greets everyone.`}
            />
          ) : lanes.map((jalur) => (
            <BarisPilih
              key={jalur.id}
              selected={jalur.id === pilihJalur}
              onSelect={() => setPilihJalur(jalur.id)}
              nama={jalur.name}
              aktif={jalur.is_active}
              alamat={`/sapa?jalur=${jalur.slug}`}
              angka={<span className="block font-semibold tabular-nums text-on-surface">{jalur.total_scan}</span>}
            />
          ))}
      </PaneBody>
    </Pane>
  );

  const detailJalur = jalurTerpilih ? (
    <Pane as="aside" aria-label={`Desk ${jalurTerpilih.name}`}>
      <KepalaDetail
        nama={jalurTerpilih.name}
        aktif={jalurTerpilih.is_active}
        onClose={() => setPilihJalur(null)}
        angka={jalurTerpilih.total_scan}
        keterangan="scans at this desk"
        aksi={hanyaLihat ? null : jalurTerpilih.is_active ? (
          <Button simpan variant="outlined" size="sm" disabled={busy} onClick={() => setTutup({ jenis: "meja", id: jalurTerpilih.id, name: jalurTerpilih.name })}>Close desk…</Button>
        ) : (
          <Button simpan variant="outlined" size="sm" disabled={busy} onClick={() => void kirimJalur("PATCH", { id: jalurTerpilih.id, is_active: true })}>Open desk</Button>
        )}
      />
      <PaneBody>
        <DetailSection title="Welcome screen">
          <dl className="flex flex-col gap-2">
            <KeyValue label="Address"><span className="select-all">/sapa?jalur={jalurTerpilih.slug}</span></KeyValue>
          </dl>
          <p className="text-body-medium text-on-surface-variant">
            Staff pick their desk on the scanner, then pair the desk TV with the six-digit code it shows.
          </p>
        </DetailSection>
      </PaneBody>
      {/* Jalur yang sudah dipakai tidak dihapus. Catatan hadirnya tetap ada,
          tetapi kolom mejanya dikosongkan, dan laporan "meja mana yang antre
          paling panjang jam sembilan" kehilangan datanya tanpa satu pun jejak. */}
      {jalurTerpilih.total_scan > 0 ? (
        <PaneFooter note="This desk has scans, so it can be closed but not deleted.">
          {hanyaLihat ? null : <Button variant="outlined" size="sm" onClick={() => bukaUbahNama("meja", jalurTerpilih)}>Edit</Button>}
        </PaneFooter>
      ) : (
        <PaneFooter note="No scans yet">
          <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapusMeja(jalurTerpilih)}>Delete desk</Button>
          {hanyaLihat ? null : <Button variant="outlined" size="sm" onClick={() => bukaUbahNama("meja", jalurTerpilih)}>Edit</Button>}
        </PaneFooter>
      )}
    </Pane>
  ) : null;

  // ---- Scanner settings ----------------------------------------------------
  // Walk-in dulu tab sendiri; isinya satu sakelar, jadi pindah ke dialog di
  // kepala halaman. Tetap satu tempat yang jelas: sakelar ini memberi WEWENANG
  // (akun petugas scan, akun paling sempit, boleh MEMBUAT peserta), bukan
  // mengatur tampilan.
  const pengaturanScanner = (
    <Dialog
      open={bukaPengaturan}
      onClose={() => setBukaPengaturan(false)}
      title="Scanner settings"
      description="Applies to every session and desk in this event."
      actions={<Button variant="outlined" onClick={() => setBukaPengaturan(false)}>Done</Button>}
    >
      <div className="flex flex-col gap-4">
        <Switch simpan
          checked={allowWalkIn}
          disabled={busy || !dimuat || hanyaLihat}
          onChange={(value) => void ubahWalkIn(value)}
          label="Allow walk-ins"
          description="Scanner staff get a button to register a guest who is not on the participant list, without the admin pages. The guest gets a code and is checked in at the same time."
        />
        <p className="text-body-medium text-on-surface-variant">
          The button shows only after Find name finds nobody, and similar names are held for staff to confirm. Turn it off if this event turns away guests without an invitation.
        </p>
        <dl className="flex flex-col gap-2">
          <KeyValue label="Walk-ins so far"><span className="tabular-nums">{dimuat ? walkInCount : "Loading"}</span></KeyValue>
        </dl>
      </div>
    </Dialog>
  );

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        meta={dimuat && !error ? (
          <>
            <span>Updates every 30 seconds</span>
            <MetaSeparator />
            <span className="inline-flex items-center gap-1.5">
              <StatusDot tone={allowWalkIn ? "success" : "neutral"} />
              {allowWalkIn ? "Walk-in on" : "Walk-in off"}
            </span>
            {walkInCount > 0 ? (
              <>
                <MetaSeparator />
                <span className="tabular-nums">{walkInCount} {walkInCount === 1 ? "walk-in" : "walk-ins"}</span>
              </>
            ) : null}
          </>
        ) : null}
        actions={
          <>
            {/* Tautan ber-prefiks event (ButtonLink memakai event-link): alamat
                pemindai yang kehilangan `/e/<slug>` jatuh ke "event aktif
                tunggal" di server, dan di sistem dengan dua acara berjalan itu
                berarti petugas mencatat kehadiran ke acara yang salah. */}
            <Button variant="outlined" onClick={() => setBukaPengaturan(true)}>Scanner settings</Button>
            <ButtonLink href="/scan" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>
              Open scanner
            </ButtonLink>
            {bagian === "sesi" && !hanyaLihat ? <Button icon={<Plus size={16} weight="bold" />} onClick={() => setSesiBaru(true)}>New session</Button> : null}
            {bagian === "meja" && !hanyaLihat ? <Button icon={<Plus size={16} weight="bold" />} onClick={() => setJalurBaru(true)}>New desk</Button> : null}
          </>
        }
      />

      <Tabs<Bagian>
        label="Check-in sections"
        idPrefix="kehadiran"
        value={bagian}
        onChange={setBagian}
        options={[
          { value: "sesi", label: "Sessions", badge: dimuat && !error ? sessions.length : undefined },
          { value: "checkpoint", label: "Checkpoints" },
          { value: "meja", label: "Desks", badge: dimuat && !errorJalur && lanes.length > 0 ? lanes.length : undefined },
        ]}
      />

      <div role="tabpanel" id={`kehadiran-panel-${bagian}`} aria-labelledby={`kehadiran-tab-${bagian}`} className="flex min-h-0 flex-1 flex-col">
        {bagian === "sesi" ? <ListDetail list={daftarSesi} detail={detailSesi} />
          : bagian === "meja" ? <ListDetail list={daftarJalur} detail={detailJalur} />
          : bagian === "checkpoint" ? <CheckpointsTab
            keSesi={() => {
              setBagian("sesi");
              // Tombolnya ikut hilang bersama tab Checkpoints: fokus pindah ke
              // tab Sessions, dan tab itu digeser masuk ke layar di ponsel.
              requestAnimationFrame(() => {
                const tab = document.getElementById("kehadiran-tab-sesi");
                tab?.focus();
                tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
              });
            }}
          />
          : null}
      </div>

      <Dialog
        open={sesiBaru}
        onClose={tutupSesiBaru}
        dismissible={!busy}
        title="New session"
        description="A session is one place where participants are scanned, e.g. Registration or Workshop A."
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={tutupSesiBaru}>Cancel</Button>
            <Button simpan type="submit" form="form-sesi" loading={busy} disabled={!nama.trim() || !slug}>Add session</Button>
          </>
        }
      >
        <form id="form-sesi" className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (nama.trim() && slug) void buatSesi(); }}>
          <TextField
            label="Session name"
            placeholder="e.g. Registration, Workshop A"
            value={nama}
            autoFocus
            onChange={(event) => {
              setNama(event.target.value);
              // Slug mengikuti nama selama admin belum menyentuhnya sendiri.
              setSlug((current) => (current === slugify(nama) || current === "" ? slugify(event.target.value) : current));
            }}
          />
          <TextField
            label="Slug"
            hint="Used in the scanner address. Lower-case letters, digits and hyphens."
            value={slug}
            onChange={(event) => setSlug(slugify(event.target.value))}
          />
        </form>
      </Dialog>

      <Dialog
        open={ubahNama !== null}
        onClose={tutupUbahNama}
        dismissible={!busy}
        title={ubahNama?.jenis === "meja" ? "Edit desk" : "Edit session"}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={tutupUbahNama}>Cancel</Button>
            <Button simpan type="submit" form="form-ubah-nama" loading={busy} disabled={!namaUbah.trim() || namaUbah.trim() === ubahNama?.name}>Save</Button>
          </>
        }
      >
        <form id="form-ubah-nama" className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (namaUbah.trim() && namaUbah.trim() !== ubahNama?.name) void simpanNama(); }}>
          <TextField
            label={ubahNama?.jenis === "meja" ? "Desk name" : "Session name"}
            hint={ubahNama?.jenis === "meja"
              ? "Staff see this name when they pick their desk on the scanner, and the desk TV shows it."
              : "Staff see this name on the scanner. Existing check-ins move to the new name."}
            value={namaUbah}
            // Batas yang sama dengan server: sesi 80, meja 60.
            maxLength={ubahNama?.jenis === "meja" ? 60 : 80}
            autoFocus
            onChange={(event) => setNamaUbah(event.target.value)}
          />
          <dl className="flex flex-col gap-2">
            <KeyValue label={ubahNama?.jenis === "meja" ? "Desk TV address" : "Scanner address"}>
              <span className="select-all">{ubahNama?.jenis === "meja" ? `/sapa?jalur=${ubahNama.slug}` : `/scan?sesi=${ubahNama?.slug ?? ""}`}</span>
            </KeyValue>
          </dl>
          <p className="text-body-medium text-on-surface-variant">The address does not change, so links and QR codes already given to staff keep working.</p>
        </form>
      </Dialog>

      <Dialog
        open={jalurBaru}
        onClose={tutupJalurBaru}
        dismissible={!busy}
        title="New desk"
        description={PENJELASAN_JALUR}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={tutupJalurBaru}>Cancel</Button>
            <Button simpan type="submit" form="form-jalur" loading={busy} disabled={!namaJalur.trim() || !slugify(namaJalur)}>Add desk</Button>
          </>
        }
      >
        <form id="form-jalur" onSubmit={(event) => { event.preventDefault(); if (namaJalur.trim() && slugify(namaJalur)) void buatJalur(); }}>
          <TextField
            label="Desk name"
            placeholder="e.g. Desk 1, VIP, Media"
            value={namaJalur}
            autoFocus
            hint="The address is made from the name."
            onChange={(event) => setNamaJalur(event.target.value)}
          />
        </form>
      </Dialog>

      <Dialog
        open={hapusSesi !== null}
        onClose={() => setHapusSesi(null)}
        dismissible={!busy}
        tone="danger"
        title={`Delete session ${hapusSesi?.name ?? ""}?`}
        description="This session has no check-ins, so no attendance is lost. This cannot be undone."
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setHapusSesi(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={busy} onClick={() => { if (hapusSesi) void hapus(hapusSesi); }}>Delete session</Button>
          </>
        }
      />

      <Dialog
        open={hapusMeja !== null}
        onClose={() => setHapusMeja(null)}
        dismissible={!busy}
        tone="danger"
        title={`Delete desk ${hapusMeja?.name ?? ""}?`}
        description="This desk has no scans, so no desk records are lost. This cannot be undone."
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setHapusMeja(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={busy} onClick={() => { if (hapusMeja) void hapusJalur(hapusMeja); }}>Delete desk</Button>
          </>
        }
      />
      {pengaturanScanner}

      <Dialog
        open={tutup !== null}
        onClose={() => setTutup(null)}
        dismissible={!busy}
        title={tutup?.jenis === "meja" ? `Close desk ${tutup?.name ?? ""}?` : `Close check-in at ${tutup?.name ?? ""}?`}
        description={tutup?.jenis === "meja"
          ? "Staff can no longer pick this desk on the scanner. Scans already recorded stay. You can open it again at any time."
          : `Every scanner phone on this session stops checking people in straight away and shows "This check-in point is closed". Check-ins already recorded stay. You can open it again at any time.${tutup?.tanpaSinyal
            // Antrean ponsel dikirim belakangan dan dinilai terhadap status sesi
            // saat itu: setelah ditutup, check-in yang masih menunggu ditolak.
            ? " This session allows check-in without signal: check-ins still waiting to send on a phone are refused once it is closed. Make sure no scanner shows \"to send\" first."
            : ""}`}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setTutup(null)}>Cancel</Button>
            <Button simpan loading={busy} onClick={async () => {
              if (!tutup) return;
              const ok = tutup.jenis === "meja"
                ? await kirimJalur("PATCH", { id: tutup.id, is_active: false })
                : await kirim("PATCH", { id: tutup.id, is_active: false });
              if (ok) setTutup(null);
            }}>{tutup?.jenis === "meja" ? "Close desk" : "Close check-in"}</Button>
          </>
        }
      />
    </WorkspacePage>
  );
}

/* ------------------------------------------------------ Potongan lokal */

function KepalaKolom({ kolom }: { kolom: Array<[string, string]> }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container-high px-4 py-2.5 text-body-medium font-medium text-on-surface-variant">
      {kolom.map(([label, lebar]) => <span key={label} className={cx("shrink-0", lebar)}>{label}</span>)}
    </div>
  );
}

/**
 * Baris daftar sesi atau meja.
 *
 * Dulu membawa sakelar Dibuka di ujungnya. Satu ketukan saat menggulir menutup
 * sesi untuk semua ponsel petugas, tanpa konfirmasi; sekarang baris hanya
 * menampilkan statusnya, dan buka/tutup ada di panel detail.
 */
function BarisPilih({ selected, onSelect, nama, aktif, alamat, angka }: {
  selected: boolean;
  onSelect: () => void;
  nama: string;
  aktif: boolean;
  alamat: string;
  angka: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cx(
        "flex w-full items-center gap-3 border-b border-outline-variant py-2.5 pl-4 pr-4 text-left text-body-medium",
        selected ? "bg-secondary-container" : "hover:bg-primary-soft",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-on-surface">{nama}</span>
        <span className="block truncate text-on-surface-variant">{alamat}</span>
      </span>
      <span className="w-24 shrink-0">{angka}</span>
      <span className="flex w-[72px] shrink-0 justify-end">
        <StatusChip dot tone={aktif ? "success" : "neutral"}>{aktif ? "Open" : "Closed"}</StatusChip>
      </span>
    </button>
  );
}

function KepalaDetail({ nama, aktif, onClose, angka, keterangan, aksi }: {
  nama: string;
  aktif: boolean;
  onClose: () => void;
  angka: number;
  keterangan: string;
  /** Tombol di bawah angka: siapa yang belum datang, buka/tutup. */
  aksi?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-3 border-b border-outline-variant px-5 py-4">
      <div className="flex items-start gap-3">
        <h2 className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-title-medium font-semibold leading-6">
          <span className="min-w-0 break-words">{nama}</span>
          <StatusChip dot tone={aktif ? "success" : "neutral"}>{aktif ? "Open" : "Closed"}</StatusChip>
        </h2>
        <IconButton size="sm" label="Close details" onClick={onClose}><X size={16} /></IconButton>
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[2rem] font-semibold leading-10 tabular-nums text-on-surface">{angka}</span>
        <span className="text-body-medium text-on-surface-variant">{keterangan}</span>
      </p>
      {aksi ? <div className="flex flex-wrap gap-2">{aksi}</div> : null}
    </div>
  );
}

function Galat({ pesan }: { pesan: string }) {
  return (
    <p role="alert" className="m-4 flex items-start gap-2 rounded-md bg-error-soft p-3 text-body-medium text-error">
      <XCircle size={18} className="mt-0.5 shrink-0" aria-hidden />{pesan} The page tries again every 30 seconds.
    </p>
  );
}

function Kerangka() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 border-b border-outline-variant px-4 py-3.5">
          <div className="h-3 w-44 animate-pulse rounded bg-surface-container-high" />
          <div className="h-3 w-32 animate-pulse rounded bg-surface-container-high" />
        </div>
      ))}
    </div>
  );
}
