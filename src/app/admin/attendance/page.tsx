"use client";

import { ArrowSquareOut, Plus, QrCode, Trash } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useCallback, useEffect, useState } from "react";
import { Button, StatusChip, Switch, TextField } from "@/components/m3";
import { useToast } from "@/components/toast";
import { eventApiPath } from "@/lib/event-url";

/**
 * CMS sesi kehadiran.
 *
 * Satu sesi = satu checkpoint tempat peserta dipindai: registrasi, workshop,
 * makan siang. Petugas membukanya lewat /scan dengan akun "Petugas scan", dan
 * angka di sini bergerak saat mereka memindai.
 *
 * "Hadir" menghitung ORANG UNIK, "scan" menghitung ketukan. Keduanya ditampilkan
 * bersebelahan dengan sengaja: selisih besar di antaranya adalah tanda sesi yang
 * pesertanya keluar-masuk — informasi yang hilang kalau hanya satu angka yang
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
 * Jalur registrasi — satu MEJA, bukan satu tahap acara.
 *
 * Lima meja berdampingan di pintu masuk adalah lima jalur yang semuanya
 * melayani sesi "Registrasi" yang sama. Dibuat sebagai lima sesi, jumlah hadir
 * pecah menjadi lima angka yang harus dijumlahkan sendiri — dan tamu yang
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

const slugify = (teks: string) =>
  teks.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export default function AttendanceAdminPage() {
  const [sessions, setSessions] = useState<Sesi[]>([]);
  const [lanes, setLanes] = useState<Jalur[]>([]);
  const [nama, setNama] = useState("");
  const [slug, setSlug] = useState("");
  const [namaJalur, setNamaJalur] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  const load = useCallback(async () => {
    const [sesi, jalur] = await Promise.all([
      fetch(eventApiPath("/api/admin/attendance"), { cache: "no-store" }).catch(() => null),
      fetch(eventApiPath("/api/admin/attendance/lanes"), { cache: "no-store" }).catch(() => null),
    ]);
    if (!sesi?.ok) { setError("Daftar sesi gagal dimuat."); return; }
    setSessions((await sesi.json()).sessions ?? []);
    if (jalur?.ok) setLanes((await jalur.json()).lanes ?? []);
    setError("");
  }, []);

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
      const rincian = body.error?.details as Record<string, string> | undefined;
      toast.error("Gagal disimpan", rincian ? String(Object.values(rincian)[0]) : "Coba lagi.");
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
      const rincian = body.error?.details as Record<string, string> | undefined;
      toast.error("Gagal disimpan", rincian ? String(Object.values(rincian)[0]) : "Coba lagi.");
      return false;
    }
    await load();
    return true;
  }

  async function hapusJalur(jalur: Jalur) {
    setBusy(true);
    const response = await fetch(eventApiPath(`/api/admin/attendance/lanes?id=${jalur.id}`), { method: "DELETE" }).catch(() => null);
    setBusy(false);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      toast.error("Tidak bisa dihapus", body?.error?.details?.message ?? "Coba lagi.");
      return;
    }
    toast.success("Jalur dihapus", `${jalur.name} dibuang.`);
    void load();
  }

  async function hapus(sesi: Sesi) {
    setBusy(true);
    const response = await fetch(eventApiPath(`/api/admin/attendance?id=${sesi.id}`), { method: "DELETE" }).catch(() => null);
    setBusy(false);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      toast.error("Tidak bisa dihapus", body?.error?.details?.message ?? "Coba lagi.");
      return;
    }
    toast.success("Sesi dihapus", `${sesi.name} dibuang.`);
    void load();
  }

  return (
    <main className="bg-surface px-5 pb-8 pt-6 text-on-surface sm:px-8 lg:pb-10">
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <p className="max-w-2xl text-body-medium leading-6 text-on-surface-variant">
            Titik-titik pemindaian sepanjang acara. Petugas membukanya di <code>/scan</code> dengan akun
            <strong> Petugas scan</strong>; buat akunnya di Pengaturan → User &amp; role.
          </p>
          {/* Link ber-prefiks event: alamat pemindai yang kehilangan `/e/<slug>`
              akan jatuh ke "event aktif tunggal" di server, dan di sistem dengan
              dua acara berjalan itu berarti petugas mencatat kehadiran ke acara
              yang salah tanpa satu pun tanda di layarnya. */}
          <Link
            href="/scan"
            target="_blank"
            rel="noreferrer"
            className="m3-state inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full border border-outline px-5 text-label-large"
          >
            <QrCode size={18} />
            Buka layar pemindai
            <ArrowSquareOut size={14} className="opacity-70" />
          </Link>
        </div>

        {error ? <p role="alert" className="rounded-lg mt-5 bg-error-soft p-4 text-body-medium text-error">{error}</p> : null}

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_0.6fr] lg:items-start">
          <section className="rounded-[28px] bg-surface-container p-5 sm:p-6">
            <h2 className="text-title-medium">Sesi kehadiran</h2>

            {sessions.length === 0 ? (
              <p className="mt-4 text-body-medium text-on-surface-variant">
                Belum ada sesi. Buat satu di sebelah — biasanya dimulai dari &ldquo;Registrasi&rdquo;.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-outline-variant">
                {sessions.map((sesi) => (
                  <li key={sesi.id} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-title-small">
                          {sesi.name}
                          {!sesi.is_active ? <StatusChip tone="neutral">Ditutup</StatusChip> : null}
                        </p>
                        <p className="mt-1 font-mono text-body-small text-on-surface-variant">/scan?sesi={sesi.slug}</p>
                      </div>

                      <div className="flex items-center gap-4">
                        <p className="text-right">
                          <span className="block text-headline-small tabular-nums">{sesi.hadir}</span>
                          <span className="block text-body-small text-on-surface-variant">hadir · {sesi.total_scan} scan</span>
                        </p>
                        <Switch
                          checked={sesi.is_active}
                          onChange={(value) => void kirim("PATCH", { id: sesi.id, is_active: value })}
                          label="Dibuka"
                        />
                        {/* Hapus hanya untuk sesi yang belum punya catatan. Server
                            menolak sisanya — catatan hadir ikut terhapus bersama
                            sesinya, dan itu satu-satunya bukti seseorang datang. */}
                        <button
                          type="button"
                          disabled={busy || sesi.total_scan > 0}
                          onClick={() => void hapus(sesi)}
                          aria-label={`Hapus sesi ${sesi.name}`}
                          title={sesi.total_scan > 0 ? "Sudah ada catatan kehadiran — tutup saja sesinya" : "Hapus sesi"}
                          className="m3-state min-h-11 rounded-full px-3 text-error disabled:opacity-40"
                        >
                          <Trash size={18} />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-[28px] bg-surface-container p-5 sm:p-6">
            <h2 className="text-title-medium">Sesi baru</h2>
            <TextField
              className="mt-4"
              label="Nama sesi"
              placeholder="mis. Registrasi, Workshop A"
              value={nama}
              onChange={(event) => {
                setNama(event.target.value);
                // Slug mengikuti nama selama admin belum menyentuhnya sendiri.
                setSlug((current) => (current === slugify(nama) || current === "" ? slugify(event.target.value) : current));
              }}
            />
            <TextField
              className="mt-4"
              label="Slug"
              hint="Dipakai di alamat layar pemindai. Huruf kecil, angka, tanda hubung."
              value={slug}
              onChange={(event) => setSlug(slugify(event.target.value))}
            />
            <Button
              className="mt-5 w-full"
              loading={busy}
              disabled={!nama.trim() || !slug}
              icon={<Plus size={18} weight="bold" />}
              onClick={async () => {
                const ok = await kirim("POST", { name: nama.trim(), slug, sort_order: sessions.length });
                if (ok) { setNama(""); setSlug(""); toast.success("Sesi dibuat", "Sudah bisa dipilih di layar pemindai."); }
              }}
            >
              Tambah sesi
            </Button>
          </section>
        </div>

        {/* ---------------------------------------------------------------
            Jalur registrasi
            --------------------------------------------------------------- */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_0.6fr] lg:items-start">
          <section className="rounded-[28px] bg-surface-container p-5 sm:p-6">
            <h2 className="text-title-medium">Jalur registrasi</h2>
            <p className="mt-2 max-w-2xl text-body-medium text-on-surface-variant">
              Satu jalur = satu meja. Buat ini hanya kalau pintu masuk dibuka beberapa antrean sekaligus — supaya
              setiap TV layar sapa menyapa tamu mejanya sendiri, dan laporan bisa menjawab meja mana yang kebanjiran.
              Satu meja saja? Lewati bagian ini.
            </p>

            {lanes.length === 0 ? (
              <p className="mt-4 text-body-medium text-on-surface-variant">
                Belum ada jalur. Tanpa jalur, semua pemindaian masuk ke satu kolam dan layar sapa menyapa semua tamu.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-outline-variant">
                {lanes.map((jalur) => (
                  <li key={jalur.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-title-small">
                        {jalur.name}
                        {!jalur.is_active ? <StatusChip tone="neutral">Ditutup</StatusChip> : null}
                      </p>
                      <p className="mt-1 font-mono text-body-small text-on-surface-variant">/sapa?jalur={jalur.slug}</p>
                    </div>

                    <div className="flex items-center gap-4">
                      <p className="text-right">
                        <span className="block text-title-medium tabular-nums">{jalur.total_scan}</span>
                        <span className="block text-body-small text-on-surface-variant">scan</span>
                      </p>
                      <Switch
                        checked={jalur.is_active}
                        onChange={(value) => void kirimJalur("PATCH", { id: jalur.id, is_active: value })}
                        label="Dibuka"
                      />
                      {/* Jalur yang sudah dipakai tidak dihapus. Catatan hadirnya
                          tetap ada, tetapi kolom mejanya dikosongkan — dan
                          laporan "meja mana yang antre paling panjang jam
                          sembilan" kehilangan datanya tanpa satu pun jejak. */}
                      <button
                        type="button"
                        disabled={busy || jalur.total_scan > 0}
                        onClick={() => void hapusJalur(jalur)}
                        aria-label={`Hapus jalur ${jalur.name}`}
                        title={jalur.total_scan > 0 ? "Sudah dipakai memindai — tutup saja jalurnya" : "Hapus jalur"}
                        className="m3-state min-h-11 rounded-full px-3 text-error disabled:opacity-40"
                      >
                        <Trash size={18} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-[28px] bg-surface-container p-5 sm:p-6">
            <h2 className="text-title-medium">Jalur baru</h2>
            <TextField
              className="mt-4"
              label="Nama meja"
              placeholder="mis. Meja 1, VIP, Media"
              value={namaJalur}
              onChange={(event) => setNamaJalur(event.target.value)}
            />
            <p className="mt-3 text-body-small text-on-surface-variant">
              Slug dibuat otomatis dari namanya. Petugas memilih mejanya di layar pemindai, lalu memasang TV meja itu
              dengan kode enam angka yang muncul di layarnya.
            </p>
            <Button
              className="mt-4 w-full"
              loading={busy}
              disabled={!namaJalur.trim() || !slugify(namaJalur)}
              icon={<Plus size={18} weight="bold" />}
              onClick={async () => {
                const ok = await kirimJalur("POST", {
                  name: namaJalur.trim(),
                  slug: slugify(namaJalur),
                  sort_order: lanes.length,
                });
                if (ok) { setNamaJalur(""); toast.success("Jalur dibuat", "Sudah bisa dipilih di layar pemindai."); }
              }}
            >
              Tambah jalur
            </Button>
          </section>
        </div>
      </div>
    </main>
  );
}
