"use client";

import { pesanGalatApi } from "@/lib/api-message";
import { ArrowSquareOut, Plus, QrCode, Television, X, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Button, ButtonLink, DetailSection, Dialog, EmptyState, IconButton, KeyValue, ListDetail, MetaSeparator, Pane, PaneBody,
  PaneFooter, StatusChip, StatusDot, Switch, Tabs, TextField, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import { formatEventDateTime } from "@/lib/datetime";
import { eventApiPath } from "@/lib/event-url";
import { cx } from "@/lib/m3/cx";
import { useEventTimeZone } from "@/lib/use-event-timezone";
import { CheckpointsTab } from "./checkpoints";

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
};

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

type Bagian = "sesi" | "meja" | "walkin" | "checkpoint";

/** Barang yang dibagikan (dibuat di Logistik) dan pasangannya dengan sesi. */
type Barang = { id: number; name: string; size_field_key: string | null };
type Pasangan = { session_id: number; item_id: number };

const slugify = (teks: string) =>
  teks.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const PENJELASAN_JALUR =
  "Each desk lane is one registration desk. Only create these when several queues are open at the entrance, so each welcome screen greets guests at its own desk and reports show which desks are busiest.";

export default function AttendanceAdminPage() {
  const [sessions, setSessions] = useState<Sesi[]>([]);
  const [lanes, setLanes] = useState<Jalur[]>([]);
  const [barang, setBarang] = useState<Barang[]>([]);
  const [pasangan, setPasangan] = useState<Pasangan[]>([]);
  const [allowWalkIn, setAllowWalkIn] = useState(false);
  const [walkInCount, setWalkInCount] = useState(0);
  const [nama, setNama] = useState("");
  const [slug, setSlug] = useState("");
  const [namaJalur, setNamaJalur] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorJalur, setErrorJalur] = useState("");
  // Pemuatan pertama sudah selesai (berhasil atau gagal). Sebelum itu daftar
  // kosong berarti "belum tahu", bukan "belum ada sesi".
  const [dimuat, setDimuat] = useState(false);
  const [bagian, setBagian] = useState<Bagian>("sesi");
  const [pilihSesi, setPilihSesi] = useState<number | null>(null);
  const [pilihJalur, setPilihJalur] = useState<number | null>(null);
  const [sesiBaru, setSesiBaru] = useState(false);
  const [jalurBaru, setJalurBaru] = useState(false);
  const [hapusSesi, setHapusSesi] = useState<Sesi | null>(null);
  const [hapusMeja, setHapusMeja] = useState<Jalur | null>(null);
  const toast = useToast();
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
    if (!sesi?.ok) { setError("Could not load sessions."); setDimuat(true); return; }
    const body = await sesi.json();
    setSessions(body.sessions ?? []);
    setAllowWalkIn(Boolean(body.allow_walk_in));
    setWalkInCount(body.walk_in_count ?? 0);
    if (jalur?.ok) { setLanes((await jalur.json()).lanes ?? []); setErrorJalur(""); }
    else setErrorJalur("Could not load desk lanes.");
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
      toast.error("Could not save", "Walk-in settings have not changed. Try again.");
      return;
    }
    toast.success(
      izinkan ? "Walk-ins on" : "Walk-ins off",
      izinkan
        ? "Scanner staff can now register guests who are not on the participant list."
        : "The button is hidden from the scanner. Walk-ins already registered are kept.",
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
    if (!response) { toast.error("Connection failed", "Reload to see the current state."); return false; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Could not save", pesanGalatApi(body) ?? "Try again.");
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
    if (!response) { toast.error("Connection failed", "Reload to see the current state."); return false; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Could not save", pesanGalatApi(body) ?? "Try again.");
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
      toast.error("Could not save", pesanGalatApi(await response?.json().catch(() => ({}))) ?? "Items to check were not changed. Try again.");
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
    toast.success("Desk lane deleted", `${jalur.name} removed.`);
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
    toast.success("Session deleted", `${sesi.name} removed.`);
    void load();
  }

  function tutupSesiBaru() { setSesiBaru(false); setNama(""); setSlug(""); }
  function tutupJalurBaru() { setJalurBaru(false); setNamaJalur(""); }

  async function buatSesi() {
    const ok = await kirim("POST", { name: nama.trim(), slug, sort_order: sessions.length });
    if (ok) { tutupSesiBaru(); toast.success("Session created", "It can now be selected in the scanner."); }
  }

  async function buatJalur() {
    const ok = await kirimJalur("POST", { name: namaJalur.trim(), slug: slugify(namaJalur), sort_order: lanes.length });
    if (ok) { tutupJalurBaru(); toast.success("Desk lane created", "It can now be selected in the scanner."); }
  }

  // ---- Sesi --------------------------------------------------------------
  const sesiTerpilih = sessions.find((sesi) => sesi.id === pilihSesi) ?? null;

  const daftarSesi = (
    <Pane aria-label="Check-in sessions">
      <KepalaKolom kolom={[["Session", "min-w-0 flex-1"], ["Present", "w-24"], ["Open", "w-[60px] text-right"]]} />
      <PaneBody>
        {error ? <Galat pesan={error} />
          : !dimuat ? <Kerangka />
          : sessions.length === 0 ? (
            <EmptyState
              plain
              icon={<QrCode size={40} />}
              title="No sessions yet"
              description="A session is a check-in point. Start with Registration."
            />
          ) : sessions.map((sesi) => (
            <BarisPilih
              key={sesi.id}
              selected={sesi.id === pilihSesi}
              onSelect={() => setPilihSesi(sesi.id)}
              nama={sesi.name}
              aktif={sesi.is_active}
              alamat={`/scan?sesi=${sesi.slug}`}
              angka={<>
                <span className="block font-semibold tabular-nums text-on-surface">{sesi.hadir}</span>
                <span className="block tabular-nums text-on-surface-variant">{sesi.total_scan} {sesi.total_scan === 1 ? "check-in" : "check-ins"}</span>
              </>}
              sakelar={
                <Switch simpan
                  checked={sesi.is_active}
                  onChange={(value) => void kirim("PATCH", { id: sesi.id, is_active: value })}
                  label={<span className="sr-only">Session {sesi.name} open</span>}
                />
              }
            />
          ))}
      </PaneBody>
    </Pane>
  );

  const detailSesi = sesiTerpilih ? (
    <Pane as="aside" aria-label={`Session details for ${sesiTerpilih.name}`}>
      <KepalaDetail
        nama={sesiTerpilih.name}
        aktif={sesiTerpilih.is_active}
        onClose={() => setPilihSesi(null)}
        angka={sesiTerpilih.hadir}
        keterangan={`${sesiTerpilih.hadir === 1 ? "person" : "people"} present · ${sesiTerpilih.total_scan} ${sesiTerpilih.total_scan === 1 ? "check-in" : "check-ins"}`}
      />
      <PaneBody>
        <DetailSection title="Scanning">
          <dl className="flex flex-col gap-2">
            <KeyValue label="Last check-in">{sesiTerpilih.terakhir ? `${formatEventDateTime(sesiTerpilih.terakhir, zone)} ${abbr}` : "None yet"}</KeyValue>
          </dl>
          <p className="text-body-medium text-on-surface-variant">Present counts unique people; check-ins count every scan. A person scanned twice is counted as present once.</p>
        </DetailSection>
        {/* Barang dibuat di Logistik; di sini hanya dipilih mana yang diperiksa
            petugas setelah memindai di sesi ini. */}
        <DetailSection
          title="Items to check"
          action={<ButtonLink href="/admin/logistik" variant="text" size="sm">Manage items</ButtonLink>}
        >
          {barang.length === 0 ? (
            <p className="text-body-medium text-on-surface-variant">
              No items yet. Create them in Logistics, under Kit items, if this session also hands out T-shirts or goodie bags.
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
                    description={item.size_field_key ? "Staff can see the participant's size." : undefined}
                  />
                ))}
              </div>
              <p className="text-body-medium text-on-surface-variant">After scanning, staff tick off the items handed out. Each participant can collect each item only once, across all sessions.</p>
            </>
          )}
        </DetailSection>
        <DetailSection title="Scanner">
          <dl className="flex flex-col gap-2">
            <KeyValue label="Address"><span className="select-all">/scan?sesi={sesiTerpilih.slug}</span></KeyValue>
          </dl>
          <p className="text-body-medium text-on-surface-variant">
            Staff open it with a Scanner staff account. Create the account in Users &amp; roles.
          </p>
        </DetailSection>
      </PaneBody>
      {/* Hapus hanya untuk sesi yang belum punya catatan. Server menolak
          sisanya: catatan hadir ikut terhapus bersama sesinya, dan itu
          satu-satunya bukti seseorang datang. */}
      {sesiTerpilih.total_scan > 0 ? (
        <PaneFooter note="This session has attendance records, so it can only be closed, not deleted." />
      ) : (
        <PaneFooter note="No attendance records yet">
          <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapusSesi(sesiTerpilih)}>Delete session</Button>
        </PaneFooter>
      )}
    </Pane>
  ) : null;

  // ---- Meja registrasi ---------------------------------------------------
  const jalurTerpilih = lanes.find((jalur) => jalur.id === pilihJalur) ?? null;

  const daftarJalur = (
    <Pane aria-label="Desk lanes">
      <KepalaKolom kolom={[["Desk lane", "min-w-0 flex-1"], ["Check-ins", "w-24"], ["Open", "w-[60px] text-right"]]} />
      <PaneBody>
        {errorJalur ? <Galat pesan={errorJalur} />
          : !dimuat ? <Kerangka />
          : lanes.length === 0 ? (
            <EmptyState
              plain
              icon={<Television size={40} />}
              title="No desk lanes yet"
              description={`${PENJELASAN_JALUR} Without desk lanes, all check-ins are grouped together and the welcome screen greets all guests.`}
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
              sakelar={
                <Switch simpan
                  checked={jalur.is_active}
                  onChange={(value) => void kirimJalur("PATCH", { id: jalur.id, is_active: value })}
                  label={<span className="sr-only">Desk lane {jalur.name} open</span>}
                />
              }
            />
          ))}
      </PaneBody>
    </Pane>
  );

  const detailJalur = jalurTerpilih ? (
    <Pane as="aside" aria-label={`Desk lane details for ${jalurTerpilih.name}`}>
      <KepalaDetail
        nama={jalurTerpilih.name}
        aktif={jalurTerpilih.is_active}
        onClose={() => setPilihJalur(null)}
        angka={jalurTerpilih.total_scan}
        keterangan={`${jalurTerpilih.total_scan === 1 ? "check-in" : "check-ins"} at this desk`}
      />
      <PaneBody>
        <DetailSection title="Welcome screen">
          <dl className="flex flex-col gap-2">
            <KeyValue label="Address"><span className="select-all">/sapa?jalur={jalurTerpilih.slug}</span></KeyValue>
          </dl>
          <p className="text-body-medium text-on-surface-variant">
            Staff select their desk in the scanner, then pair its TV using the six-digit code shown on the TV.
          </p>
        </DetailSection>
      </PaneBody>
      {/* Jalur yang sudah dipakai tidak dihapus. Catatan hadirnya tetap ada,
          tetapi kolom mejanya dikosongkan, dan laporan "meja mana yang antre
          paling panjang jam sembilan" kehilangan datanya tanpa satu pun jejak. */}
      {jalurTerpilih.total_scan > 0 ? (
        <PaneFooter note="This desk lane has been used for scanning, so it can only be closed, not deleted." />
      ) : (
        <PaneFooter note="Not used for scanning yet">
          <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapusMeja(jalurTerpilih)}>Delete desk lane</Button>
        </PaneFooter>
      )}
    </Pane>
  ) : null;

  // ---- Walk-in -------------------------------------------------------------
  // Tab sendiri, bukan diselipkan ke daftar sesi: ini satu-satunya setelan di
  // halaman ini yang memberi WEWENANG, bukan mengatur tampilan. Akun petugas
  // scan adalah akun paling sempit di sistem, dibuat justru supaya satu ponsel
  // yang berpindah tangan di pintu masuk tidak bisa membuka data peserta, dan
  // sakelar ini membolehkannya MEMBUAT peserta.
  const walkIn = (
    <Pane aria-label="Walk-in guests" className="w-full max-w-[760px]">
      {error ? <Galat pesan={error} /> : (
        <>
          <DetailSection>
            <Switch simpan
              checked={allowWalkIn}
              disabled={busy || !dimuat}
              onChange={(value) => void ubahWalkIn(value)}
              label="Allow walk-ins"
              description="Scanner staff get a button to register guests who are not on the participant list, without opening the admin page. A participant code is generated and attendance is recorded at the same time."
            />
          </DetailSection>
          <DetailSection title="When the button appears">
            <p className="text-body-medium text-on-surface-variant">
              Only when a name search finds no matches. Duplicate names need staff confirmation. Turn this off if the event does not accept guests without invitations.
            </p>
          </DetailSection>
          <DetailSection title="Walk-ins so far">
            <dl className="flex flex-col gap-2">
              <KeyValue label="Walk-ins registered"><span className="tabular-nums">{dimuat ? walkInCount : "Loading"}</span></KeyValue>
            </dl>
          </DetailSection>
        </>
      )}
    </Pane>
  );

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        meta={dimuat && !error ? (
          <>
            <span>Updated every 30 seconds</span>
            <MetaSeparator />
            <span className="inline-flex items-center gap-1.5">
              <StatusDot tone={allowWalkIn ? "success" : "neutral"} />
              {allowWalkIn ? "Walk-ins on" : "Walk-ins off"}
            </span>
            {walkInCount > 0 ? (
              <>
                <MetaSeparator />
                <span className="tabular-nums">{walkInCount} {walkInCount === 1 ? "walk-in" : "walk-ins"} registered</span>
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
            <ButtonLink href="/scan" target="_blank" rel="noreferrer" variant="outlined" icon={<ArrowSquareOut size={16} />}>
              Open scanner
            </ButtonLink>
            {bagian === "sesi" ? <Button icon={<Plus size={16} weight="bold" />} onClick={() => setSesiBaru(true)}>New session</Button> : null}
            {bagian === "meja" ? <Button icon={<Plus size={16} weight="bold" />} onClick={() => setJalurBaru(true)}>New desk lane</Button> : null}
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
          { value: "meja", label: "Desk lanes", badge: dimuat && !errorJalur && lanes.length > 0 ? lanes.length : undefined },
          { value: "walkin", label: "Walk-in" },
          { value: "checkpoint", label: "Checkpoints" },
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
          : walkIn}
      </div>

      <Dialog
        open={sesiBaru}
        onClose={tutupSesiBaru}
        dismissible={!busy}
        title="New session"
        description="A session is a check-in point, e.g. Registration or Workshop A."
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
            hint="Used in the scanner address. Lowercase letters, numbers and hyphens."
            value={slug}
            onChange={(event) => setSlug(slugify(event.target.value))}
          />
        </form>
      </Dialog>

      <Dialog
        open={jalurBaru}
        onClose={tutupJalurBaru}
        dismissible={!busy}
        title="New desk lane"
        description={PENJELASAN_JALUR}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={tutupJalurBaru}>Cancel</Button>
            <Button simpan type="submit" form="form-jalur" loading={busy} disabled={!namaJalur.trim() || !slugify(namaJalur)}>Add desk lane</Button>
          </>
        }
      >
        <form id="form-jalur" onSubmit={(event) => { event.preventDefault(); if (namaJalur.trim() && slugify(namaJalur)) void buatJalur(); }}>
          <TextField
            label="Desk lane name"
            placeholder="e.g. Desk 1, VIP, Media"
            value={namaJalur}
            autoFocus
            hint="The slug is generated from the name."
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
        description="This session has no attendance records, so no attendance data will be lost. Deletion cannot be undone."
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
        title={`Delete desk lane ${hapusMeja?.name ?? ""}?`}
        description="This desk lane has not been used for scanning, so no desk records will be lost. Deletion cannot be undone."
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setHapusMeja(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={busy} onClick={() => { if (hapusMeja) void hapusJalur(hapusMeja); }}>Delete desk lane</Button>
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
 * Baris daftar dengan sakelar di ujungnya.
 *
 * Bukan `ListRow`: ListRow adalah satu `<button>` utuh, dan sakelar di
 * dalamnya berarti tombol di dalam tombol. Di sini hanya bagian nama dan angka
 * yang menjadi tombol pilih; sakelarnya berdiri di sebelahnya.
 */
function BarisPilih({ selected, onSelect, nama, aktif, alamat, angka, sakelar }: {
  selected: boolean;
  onSelect: () => void;
  nama: string;
  aktif: boolean;
  alamat: string;
  angka: ReactNode;
  sakelar: ReactNode;
}) {
  return (
    <div className={cx("flex items-center gap-3 border-b border-outline-variant pr-4", selected ? "bg-secondary-container" : "hover:bg-primary-soft")}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left text-body-medium"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium text-on-surface">{nama}</span>
            {!aktif ? <StatusChip tone="neutral">Closed</StatusChip> : null}
          </span>
          <span className="block truncate text-on-surface-variant">{alamat}</span>
        </span>
        <span className="w-24 shrink-0">{angka}</span>
      </button>
      <div className="flex w-[60px] shrink-0 justify-end">{sakelar}</div>
    </div>
  );
}

function KepalaDetail({ nama, aktif, onClose, angka, keterangan }: {
  nama: string;
  aktif: boolean;
  onClose: () => void;
  angka: number;
  keterangan: string;
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
