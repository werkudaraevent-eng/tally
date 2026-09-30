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

type Bagian = "sesi" | "meja" | "walkin";

const slugify = (teks: string) =>
  teks.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const PENJELASAN_JALUR =
  "Satu jalur = satu meja. Buat ini hanya kalau pintu masuk dibuka beberapa antrean sekaligus, supaya setiap TV layar sapa menyapa tamu mejanya sendiri dan laporan bisa menjawab meja mana yang kebanjiran.";

export default function AttendanceAdminPage() {
  const [sessions, setSessions] = useState<Sesi[]>([]);
  const [lanes, setLanes] = useState<Jalur[]>([]);
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

  const load = useCallback(async () => {
    const [sesi, jalur] = await Promise.all([
      fetch(eventApiPath("/api/admin/attendance"), { cache: "no-store" }).catch(() => null),
      fetch(eventApiPath("/api/admin/attendance/lanes"), { cache: "no-store" }).catch(() => null),
    ]);
    if (!sesi?.ok) { setError("Daftar sesi gagal dimuat."); setDimuat(true); return; }
    const body = await sesi.json();
    setSessions(body.sessions ?? []);
    setAllowWalkIn(Boolean(body.allow_walk_in));
    setWalkInCount(body.walk_in_count ?? 0);
    if (jalur?.ok) { setLanes((await jalur.json()).lanes ?? []); setErrorJalur(""); }
    else setErrorJalur("Daftar meja gagal dimuat.");
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
      toast.error("Gagal disimpan", "Setelan walk-in tidak berubah. Coba lagi.");
      return;
    }
    toast.success(
      izinkan ? "Walk-in dinyalakan" : "Walk-in dimatikan",
      izinkan
        ? "Petugas scan sudah bisa mendaftarkan tamu yang belum terdaftar."
        : "Tombolnya hilang dari layar pemindai. Peserta yang sudah terlanjur dibuat tetap ada.",
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
    if (!response) { toast.error("Koneksi gagal", "Muat ulang untuk melihat keadaan sebenarnya."); return false; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Gagal disimpan", pesanGalatApi(body) ?? "Coba lagi.");
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
    if (!response) { toast.error("Koneksi gagal", "Muat ulang untuk melihat keadaan sebenarnya."); return false; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Gagal disimpan", pesanGalatApi(body) ?? "Coba lagi.");
      return false;
    }
    await load();
    return true;
  }

  async function hapusJalur(jalur: Jalur) {
    setBusy(true);
    const response = await fetch(eventApiPath(`/api/admin/attendance/lanes?id=${jalur.id}`), { method: "DELETE" }).catch(() => null);
    setBusy(false);
    setHapusMeja(null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      toast.error("Tidak bisa dihapus", pesanGalatApi(body) ?? "Coba lagi.");
      return;
    }
    setPilihJalur(null);
    toast.success("Jalur dihapus", `${jalur.name} dibuang.`);
    void load();
  }

  async function hapus(sesi: Sesi) {
    setBusy(true);
    const response = await fetch(eventApiPath(`/api/admin/attendance?id=${sesi.id}`), { method: "DELETE" }).catch(() => null);
    setBusy(false);
    setHapusSesi(null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      toast.error("Tidak bisa dihapus", pesanGalatApi(body) ?? "Coba lagi.");
      return;
    }
    setPilihSesi(null);
    toast.success("Sesi dihapus", `${sesi.name} dibuang.`);
    void load();
  }

  function tutupSesiBaru() { setSesiBaru(false); setNama(""); setSlug(""); }
  function tutupJalurBaru() { setJalurBaru(false); setNamaJalur(""); }

  async function buatSesi() {
    const ok = await kirim("POST", { name: nama.trim(), slug, sort_order: sessions.length });
    if (ok) { tutupSesiBaru(); toast.success("Sesi dibuat", "Sudah bisa dipilih di layar pemindai."); }
  }

  async function buatJalur() {
    const ok = await kirimJalur("POST", { name: namaJalur.trim(), slug: slugify(namaJalur), sort_order: lanes.length });
    if (ok) { tutupJalurBaru(); toast.success("Jalur dibuat", "Sudah bisa dipilih di layar pemindai."); }
  }

  // ---- Sesi --------------------------------------------------------------
  const sesiTerpilih = sessions.find((sesi) => sesi.id === pilihSesi) ?? null;

  const daftarSesi = (
    <Pane aria-label="Daftar sesi kehadiran">
      <KepalaKolom kolom={[["Sesi", "min-w-0 flex-1"], ["Hadir", "w-24"], ["Dibuka", "w-[60px] text-right"]]} />
      <PaneBody>
        {error ? <Galat pesan={error} />
          : !dimuat ? <Kerangka />
          : sessions.length === 0 ? (
            <EmptyState
              plain
              icon={<QrCode size={40} />}
              title="Belum ada sesi"
              description="Satu sesi adalah satu titik pemindaian. Biasanya dimulai dari Registrasi."
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
                <span className="block tabular-nums text-on-surface-variant">{sesi.total_scan} scan</span>
              </>}
              sakelar={
                <Switch
                  checked={sesi.is_active}
                  onChange={(value) => void kirim("PATCH", { id: sesi.id, is_active: value })}
                  label={<span className="sr-only">Sesi {sesi.name} dibuka</span>}
                />
              }
            />
          ))}
      </PaneBody>
    </Pane>
  );

  const detailSesi = sesiTerpilih ? (
    <Pane as="aside" aria-label={`Detail sesi ${sesiTerpilih.name}`}>
      <KepalaDetail
        nama={sesiTerpilih.name}
        aktif={sesiTerpilih.is_active}
        onClose={() => setPilihSesi(null)}
        angka={sesiTerpilih.hadir}
        keterangan={`orang hadir · ${sesiTerpilih.total_scan} scan`}
      />
      <PaneBody>
        <DetailSection title="Pemindaian">
          <dl className="flex flex-col gap-2">
            <KeyValue label="Scan terakhir">{sesiTerpilih.terakhir ? `${formatEventDateTime(sesiTerpilih.terakhir, zone)} ${abbr}` : "Belum ada"}</KeyValue>
          </dl>
          <p className="text-body-medium text-on-surface-variant">Hadir menghitung orang unik, scan menghitung setiap pemindaian. Orang yang dipindai dua kali terhitung satu kali hadir.</p>
        </DetailSection>
        <DetailSection title="Layar pemindai">
          <dl className="flex flex-col gap-2">
            <KeyValue label="Alamat"><span className="select-all">/scan?sesi={sesiTerpilih.slug}</span></KeyValue>
          </dl>
          <p className="text-body-medium text-on-surface-variant">
            Petugas membukanya dengan akun Petugas scan. Buat akunnya di Pengaturan, bagian User &amp; role.
          </p>
        </DetailSection>
      </PaneBody>
      {/* Hapus hanya untuk sesi yang belum punya catatan. Server menolak
          sisanya: catatan hadir ikut terhapus bersama sesinya, dan itu
          satu-satunya bukti seseorang datang. */}
      {sesiTerpilih.total_scan > 0 ? (
        <PaneFooter note="Sudah ada catatan kehadiran, jadi sesi ini hanya bisa ditutup, tidak dihapus." />
      ) : (
        <PaneFooter note="Belum ada catatan kehadiran">
          <Button variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapusSesi(sesiTerpilih)}>Hapus sesi</Button>
        </PaneFooter>
      )}
    </Pane>
  ) : null;

  // ---- Meja registrasi ---------------------------------------------------
  const jalurTerpilih = lanes.find((jalur) => jalur.id === pilihJalur) ?? null;

  const daftarJalur = (
    <Pane aria-label="Daftar meja registrasi">
      <KepalaKolom kolom={[["Meja", "min-w-0 flex-1"], ["Scan", "w-24"], ["Dibuka", "w-[60px] text-right"]]} />
      <PaneBody>
        {errorJalur ? <Galat pesan={errorJalur} />
          : !dimuat ? <Kerangka />
          : lanes.length === 0 ? (
            <EmptyState
              plain
              icon={<Television size={40} />}
              title="Belum ada meja"
              description={`${PENJELASAN_JALUR} Tanpa jalur, semua pemindaian masuk ke satu kolam dan layar sapa menyapa semua tamu.`}
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
                <Switch
                  checked={jalur.is_active}
                  onChange={(value) => void kirimJalur("PATCH", { id: jalur.id, is_active: value })}
                  label={<span className="sr-only">Meja {jalur.name} dibuka</span>}
                />
              }
            />
          ))}
      </PaneBody>
    </Pane>
  );

  const detailJalur = jalurTerpilih ? (
    <Pane as="aside" aria-label={`Detail meja ${jalurTerpilih.name}`}>
      <KepalaDetail
        nama={jalurTerpilih.name}
        aktif={jalurTerpilih.is_active}
        onClose={() => setPilihJalur(null)}
        angka={jalurTerpilih.total_scan}
        keterangan="scan di meja ini"
      />
      <PaneBody>
        <DetailSection title="Layar sapa">
          <dl className="flex flex-col gap-2">
            <KeyValue label="Alamat"><span className="select-all">/sapa?jalur={jalurTerpilih.slug}</span></KeyValue>
          </dl>
          <p className="text-body-medium text-on-surface-variant">
            Petugas memilih mejanya di layar pemindai, lalu memasang TV meja itu dengan kode enam angka yang muncul di layarnya.
          </p>
        </DetailSection>
      </PaneBody>
      {/* Jalur yang sudah dipakai tidak dihapus. Catatan hadirnya tetap ada,
          tetapi kolom mejanya dikosongkan, dan laporan "meja mana yang antre
          paling panjang jam sembilan" kehilangan datanya tanpa satu pun jejak. */}
      {jalurTerpilih.total_scan > 0 ? (
        <PaneFooter note="Sudah dipakai memindai, jadi meja ini hanya bisa ditutup, tidak dihapus." />
      ) : (
        <PaneFooter note="Belum dipakai memindai">
          <Button variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapusMeja(jalurTerpilih)}>Hapus meja</Button>
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
    <Pane aria-label="Tamu walk-in" className="w-full max-w-[760px]">
      {error ? <Galat pesan={error} /> : (
        <>
          <DetailSection>
            <Switch
              checked={allowWalkIn}
              disabled={busy || !dimuat}
              onChange={(value) => void ubahWalkIn(value)}
              label="Izinkan walk-in"
              description="Petugas di layar pemindai mendapat tombol untuk mendaftarkan tamu yang tidak ada di daftar peserta, tanpa membuka halaman admin. Kode pesertanya terbit sendiri dan kehadirannya tercatat pada saat yang sama."
            />
          </DetailSection>
          <DetailSection title="Kapan tombolnya muncul">
            <p className="text-body-medium text-on-surface-variant">
              Hanya setelah pencarian nama tidak menemukan siapa pun, dan nama yang kembar ditahan untuk dikonfirmasi petugas. Matikan bila acara ini memang menolak tamu tanpa undangan.
            </p>
          </DetailSection>
          <DetailSection title="Tercatat">
            <dl className="flex flex-col gap-2">
              <KeyValue label="Didaftarkan di meja"><span className="tabular-nums">{dimuat ? walkInCount : "Memuat"}</span></KeyValue>
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
            <span>Diperbarui tiap 30 detik</span>
            <MetaSeparator />
            <span className="inline-flex items-center gap-1.5">
              <StatusDot tone={allowWalkIn ? "success" : "neutral"} />
              {allowWalkIn ? "Walk-in diizinkan" : "Walk-in dimatikan"}
            </span>
            {walkInCount > 0 ? (
              <>
                <MetaSeparator />
                <span className="tabular-nums">{walkInCount} didaftarkan di meja</span>
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
              Buka layar pemindai
            </ButtonLink>
            {bagian === "sesi" ? <Button icon={<Plus size={16} weight="bold" />} onClick={() => setSesiBaru(true)}>Sesi baru</Button> : null}
            {bagian === "meja" ? <Button icon={<Plus size={16} weight="bold" />} onClick={() => setJalurBaru(true)}>Meja baru</Button> : null}
          </>
        }
      />

      <Tabs<Bagian>
        label="Bagian kehadiran"
        idPrefix="kehadiran"
        value={bagian}
        onChange={setBagian}
        options={[
          { value: "sesi", label: "Sesi", badge: dimuat && !error ? sessions.length : undefined },
          { value: "meja", label: "Meja registrasi", badge: dimuat && !errorJalur && lanes.length > 0 ? lanes.length : undefined },
          { value: "walkin", label: "Walk-in" },
        ]}
      />

      <div role="tabpanel" id={`kehadiran-panel-${bagian}`} aria-labelledby={`kehadiran-tab-${bagian}`} className="flex min-h-0 flex-1 flex-col">
        {bagian === "sesi" ? <ListDetail list={daftarSesi} detail={detailSesi} />
          : bagian === "meja" ? <ListDetail list={daftarJalur} detail={detailJalur} />
          : walkIn}
      </div>

      <Dialog
        open={sesiBaru}
        onClose={tutupSesiBaru}
        dismissible={!busy}
        title="Sesi baru"
        description="Satu sesi adalah satu titik pemindaian, mis. Registrasi atau Workshop A."
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={tutupSesiBaru}>Batal</Button>
            <Button simpan type="submit" form="form-sesi" loading={busy} disabled={!nama.trim() || !slug}>Tambah sesi</Button>
          </>
        }
      >
        <form id="form-sesi" className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (nama.trim() && slug) void buatSesi(); }}>
          <TextField
            label="Nama sesi"
            placeholder="mis. Registrasi, Workshop A"
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
            hint="Dipakai di alamat layar pemindai. Huruf kecil, angka, tanda hubung."
            value={slug}
            onChange={(event) => setSlug(slugify(event.target.value))}
          />
        </form>
      </Dialog>

      <Dialog
        open={jalurBaru}
        onClose={tutupJalurBaru}
        dismissible={!busy}
        title="Meja baru"
        description={PENJELASAN_JALUR}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={tutupJalurBaru}>Batal</Button>
            <Button type="submit" form="form-jalur" loading={busy} disabled={!namaJalur.trim() || !slugify(namaJalur)}>Tambah meja</Button>
          </>
        }
      >
        <form id="form-jalur" onSubmit={(event) => { event.preventDefault(); if (namaJalur.trim() && slugify(namaJalur)) void buatJalur(); }}>
          <TextField
            label="Nama meja"
            placeholder="mis. Meja 1, VIP, Media"
            value={namaJalur}
            autoFocus
            hint="Slug dibuat otomatis dari namanya."
            onChange={(event) => setNamaJalur(event.target.value)}
          />
        </form>
      </Dialog>

      <Dialog
        open={hapusSesi !== null}
        onClose={() => setHapusSesi(null)}
        dismissible={!busy}
        tone="danger"
        title={`Hapus sesi ${hapusSesi?.name ?? ""}?`}
        description="Sesi ini belum punya catatan kehadiran, jadi tidak ada data hadir yang ikut terhapus. Penghapusan tidak bisa dibatalkan."
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setHapusSesi(null)}>Batal</Button>
            <Button variant="danger" loading={busy} onClick={() => { if (hapusSesi) void hapus(hapusSesi); }}>Hapus sesi</Button>
          </>
        }
      />

      <Dialog
        open={hapusMeja !== null}
        onClose={() => setHapusMeja(null)}
        dismissible={!busy}
        tone="danger"
        title={`Hapus meja ${hapusMeja?.name ?? ""}?`}
        description="Meja ini belum dipakai memindai, jadi tidak ada catatan meja yang hilang. Penghapusan tidak bisa dibatalkan."
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setHapusMeja(null)}>Batal</Button>
            <Button variant="danger" loading={busy} onClick={() => { if (hapusMeja) void hapusJalur(hapusMeja); }}>Hapus meja</Button>
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
            {!aktif ? <StatusChip tone="neutral">Ditutup</StatusChip> : null}
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
          <StatusChip dot tone={aktif ? "success" : "neutral"}>{aktif ? "Dibuka" : "Ditutup"}</StatusChip>
        </h2>
        <IconButton size="sm" label="Tutup detail" onClick={onClose}><X size={16} /></IconButton>
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
      <XCircle size={18} className="mt-0.5 shrink-0" aria-hidden />{pesan} Halaman mencoba lagi tiap 30 detik.
    </p>
  );
}

function Kerangka() {
  return (
    <div role="status" aria-label="Memuat" className="flex flex-col">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 border-b border-outline-variant px-4 py-3.5">
          <div className="h-3 w-44 animate-pulse rounded bg-surface-container-high" />
          <div className="h-3 w-32 animate-pulse rounded bg-surface-container-high" />
        </div>
      ))}
    </div>
  );
}
