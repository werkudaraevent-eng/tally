"use client";

import { ArrowCounterClockwise, Plus, Trash, Warning } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Banner, Button, EmptyState, IconButton, MetaSeparator, PageLoading, Pane, PaneBody, PaneFooter, PaneHeader,
  SegmentedButton, SelectField, SupportingPane, Switch, TextField, WorkspaceHeader, WorkspacePage,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import { eventApiPath } from "@/lib/event-url";
import { cx } from "@/lib/m3/cx";
import {
  DEFAULT_LABEL_SETTINGS,
  LABEL_PREVIEW_DATA,
  UKURAN_LABEL,
  lebarCetak,
  mmKePx,
  type LabelElement,
  type LabelField,
  type LabelSettings,
} from "@/lib/label/layout";
import { renderLabelToCanvas } from "@/lib/label/render";
import { Kelompok } from "@/components/admin/compact-form";

/**
 * Penyunting label peserta.
 *
 * ---- Kenapa versi pertama gagal -------------------------------------------
 *
 * Versi sebelumnya meminta lebar dan tinggi dalam PIKSEL, lalu posisi setiap
 * elemen sebagai empat kolom angka: X, Y, lebar kotak, ukuran huruf. Yang
 * dipegang panitia adalah gulungan bertuliskan "50 x 30 mm", dan yang ingin
 * mereka kerjakan adalah menggeser nama sedikit ke atas. Dua hal itu tidak
 * pernah bertemu. Laporannya satu kalimat: tidak paham sama sekali.
 *
 * ---- Yang menggantikannya --------------------------------------------------
 *
 * Kanvas pratinjaunya menjadi tempat kerjanya. Elemen digeser dengan jari atau
 * tetikus di atas gambar labelnya sendiri, bukan diketik sebagai koordinat.
 * Angka tetap ada dan tetap tepat, tetapi ia HASIL dari menggeser, bukan cara
 * menggeser.
 *
 * Ukuran label ditanyakan dalam milimeter, karena itu satuan yang tertulis di
 * kotak gulungan. Pikselnya dihitung dari dpi printer.
 *
 * Yang benar-benar milik protokol (urutan perintah, kerapatan panas, lebar
 * kepala cetak) tidak dihapus, hanya dipindah ke bagian "Printer" di panel
 * kanan. Ia dibutuhkan tepat sekali, saat label pertama keluar salah.
 *
 * ---- Tata letak -----------------------------------------------------------
 *
 * Supporting pane: labelnya di panel utama, setelannya di panel kanan yang
 * dipilah menjadi Isi terpilih, Gulungan, dan Printer. Simpan menempel di kaki
 * panel kanan karena satu tombol itu menyimpan ketiganya sekaligus.
 *
 * Koneksi dan pencetakan ke printer (Web Bluetooth dan jalur lainnya) TIDAK ada
 * di halaman ini; itu milik layar pemindai. Halaman ini hanya menyimpan setelan.
 *
 * ---- Papan ketik ----------------------------------------------------------
 *
 * Setiap elemen di kanvas adalah tombol sungguhan: bisa dijangkau Tab, dipilih
 * dengan Enter, digeser dengan tombol panah, dan digeser sepuluh piksel dengan
 * Shift. Penyunting seret-lepas yang hanya bisa dipakai dengan tetikus adalah
 * penyunting yang setengah jadi.
 */

/** Perkiraan tinggi satu baris teks, dipakai untuk batas dan kotak sentuh. */
const tinggiTeks = (size: number) => Math.round(size * 1.25);

const jepit = (nilai: number, min: number, maks: number) => Math.min(maks, Math.max(min, nilai));

/** Nama yang muncul di tombol tambah, dan di label aksesibilitas tiap elemen. */
const NAMA_ISI: Record<LabelField, string> = {
  name: "Nama peserta",
  company: "Instansi",
  title: "Jabatan",
  qr_code: "Kode peserta",
  static: "Teks bebas",
};

type ElemenBaru = { kind: "text"; field: LabelField } | { kind: "qr" };

const TOMBOL_TAMBAH: Array<{ label: string; buat: ElemenBaru }> = [
  { label: "Nama", buat: { kind: "text", field: "name" } },
  { label: "Instansi", buat: { kind: "text", field: "company" } },
  { label: "Jabatan", buat: { kind: "text", field: "title" } },
  { label: "Kode peserta", buat: { kind: "text", field: "qr_code" } },
  { label: "Kode QR", buat: { kind: "qr" } },
  { label: "Teks bebas", buat: { kind: "text", field: "static" } },
];

type Bagian = "isi" | "gulungan" | "printer";

export default function LabelAdminPage() {
  const [settings, setSettings] = useState<LabelSettings | null>(null);
  const [prefixText, setPrefixText] = useState("");
  const [terpilih, setTerpilih] = useState<number | null>(null);
  const [bagian, setBagian] = useState<Bagian>("isi");
  const [busy, setBusy] = useState(false);
  const [kotor, setKotor] = useState(false);
  const [error, setError] = useState("");

  const kanvas = useRef<HTMLCanvasElement | null>(null);
  const panggung = useRef<HTMLDivElement | null>(null);
  const [lebarTampil, setLebarTampil] = useState(0);
  const siap = settings !== null;
  const toast = useToast();

  const load = useCallback(async () => {
    const response = await fetch(eventApiPath("/api/admin/label"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setError("Setelan label gagal dimuat. Muat ulang halaman."); return; }
    const body = await response.json();
    const data = body.settings as LabelSettings;
    setSettings(data);
    setPrefixText(data.name_prefixes.join(", "));
    setKotor(false);
    setError("");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  /**
   * Lebar panggung diukur, tidak dipatok.
   *
   * Skala antara piksel label dan piksel layar diturunkan dari angka ini, dan
   * seluruh perhitungan seret memakainya. Dipatok, penyunting ini akan meleset
   * di ponsel: jari mendarat di satu tempat, elemennya pindah ke tempat lain.
   */
  useEffect(() => {
    const elemen = panggung.current;
    if (!elemen) return;
    const pengamat = new ResizeObserver(([masuk]) => setLebarTampil(masuk.contentRect.width));
    pengamat.observe(elemen);
    return () => pengamat.disconnect();
    // `siap`, bukan `settings`: panggungnya baru ada di DOM setelah pemuatan
    // pertama selesai, dan memasang ulang pengamat pada setiap geseran elemen
    // berarti membongkar dan memasang ResizeObserver puluhan kali per detik.
  }, [siap]);

  useEffect(() => {
    if (!settings || !kanvas.current) return;
    let batal = false;
    void renderLabelToCanvas(kanvas.current, settings, LABEL_PREVIEW_DATA).catch(() => {
      if (!batal) setError("Pratinjau gagal digambar. Periksa ukuran label di bagian Printer.");
    });
    return () => { batal = true; };
  }, [settings]);

  /** Memilih satu isi label sekaligus membuka setelannya di panel kanan. */
  function pilih(index: number) {
    setTerpilih(index);
    setBagian("isi");
  }

  function ubah<K extends keyof LabelSettings>(kunci: K, nilai: LabelSettings[K]) {
    setSettings((current) => (current ? { ...current, [kunci]: nilai } : current));
    setKotor(true);
  }

  /**
   * Mengubah ukuran fisik label, lalu menghitung ulang pikselnya.
   *
   * Panitia memilih milimeter; piksel adalah akibatnya, bukan pertanyaan kedua.
   * Lebar dijepit ke lebar kepala cetak karena kolom di luar kepala dibuang
   * printer tanpa satu pun pesan galat.
   */
  function ubahUkuran(widthMm: number, heightMm: number) {
    setSettings((current) => {
      if (!current) return current;
      return {
        ...current,
        width_mm: widthMm,
        height_mm: heightMm,
        width_px: lebarCetak(widthMm, current.dpi, current.head_px),
        height_px: mmKePx(heightMm, current.dpi),
      };
    });
    setKotor(true);
  }

  /** Dipanggil setelah dpi atau lebar kepala cetak berubah: pikselnya ikut. */
  function hitungUlang(patch: Partial<LabelSettings>) {
    setSettings((current) => {
      if (!current) return current;
      const berikut = { ...current, ...patch };
      return {
        ...berikut,
        width_px: lebarCetak(berikut.width_mm, berikut.dpi, berikut.head_px),
        height_px: mmKePx(berikut.height_mm, berikut.dpi),
      };
    });
    setKotor(true);
  }

  function ubahElemen(index: number, patch: Partial<LabelElement>) {
    setSettings((current) => {
      if (!current) return current;
      const elements = current.layout.elements.map((element, i) =>
        i === index ? ({ ...element, ...patch } as LabelElement) : element,
      );
      return { ...current, layout: { ...current.layout, elements } };
    });
    setKotor(true);
  }

  function hapusElemen(index: number) {
    setSettings((current) => {
      if (!current) return current;
      return {
        ...current,
        layout: { ...current.layout, elements: current.layout.elements.filter((_, i) => i !== index) },
      };
    });
    setTerpilih(null);
    setKotor(true);
  }

  function tambahElemen(baru: ElemenBaru) {
    setSettings((current) => {
      if (!current || current.layout.elements.length >= 12) return current;
      // Ditaruh di bawah isi yang sudah ada, bukan menumpuk di sudut kiri atas.
      // Elemen baru yang lahir tepat di atas elemen lama terlihat seperti tombol
      // tambah yang tidak bekerja.
      const bawah = current.layout.elements.reduce((batas, element) => {
        const tinggi = element.type === "qr" ? element.size : tinggiTeks(element.size);
        return Math.max(batas, element.y + tinggi);
      }, 0);
      const y = jepit(bawah + 8, 0, Math.max(0, current.height_px - 40));
      const element: LabelElement =
        baru.kind === "qr"
          ? { type: "qr", field: "qr_code", x: Math.round((current.width_px - 96) / 2), y, size: 96 }
          : {
              type: "text",
              field: baru.field,
              text: baru.field === "static" ? "Tamu" : undefined,
              x: 8,
              y,
              w: Math.max(32, current.width_px - 16),
              size: 22,
              weight: "normal",
              align: "center",
            };
      return { ...current, layout: { ...current.layout, elements: [...current.layout.elements, element] } };
    });
    setTerpilih(settings ? settings.layout.elements.length : null);
    setBagian("isi");
    setKotor(true);
  }

  const skala = settings && lebarTampil > 0 ? lebarTampil / settings.width_px : 0;

  /** Ukuran kotak sebuah elemen dalam piksel label. Dipakai untuk batas dan overlay. */
  function kotak(element: LabelElement) {
    return element.type === "qr"
      ? { w: element.size, h: element.size }
      : { w: element.w, h: tinggiTeks(element.size) };
  }

  function pindah(index: number, x: number, y: number, tempel = true) {
    if (!settings) return;
    const element = settings.layout.elements[index];
    const { w, h } = kotak(element);
    let nx = Math.round(x);
    // Menempel ke sumbu tengah bila sudah dekat. Menengahkan sesuatu dengan
    // menyeret nyaris mustahil dilakukan tepat, dan tengah adalah posisi yang
    // paling sering dituju di label selebar lima sentimeter.
    //
    // Hanya saat menyeret: untuk tombol panah, tempelan ini menarik setiap
    // langkah 1px di dekat tengah kembali ke tengah, sehingga elemen tidak bisa
    // digeser mendatar sama sekali dari papan ketik.
    const tengah = Math.round((settings.width_px - w) / 2);
    if (tempel && Math.abs(nx - tengah) <= 6) nx = tengah;
    const berikut = {
      x: jepit(nx, 0, Math.max(0, settings.width_px - w)),
      y: jepit(Math.round(y), 0, Math.max(0, settings.height_px - h)),
    };
    // Mentok di tepi bukan perubahan; jangan menandai "belum disimpan".
    if (berikut.x === element.x && berikut.y === element.y) return;
    ubahElemen(index, berikut);
  }

  function mulaiGeser(event: React.PointerEvent<HTMLElement>, index: number) {
    if (!settings || skala === 0) return;
    pilih(index);
    const element = settings.layout.elements[index];
    const awal = { x: event.clientX, y: event.clientY, ex: element.x, ey: element.y };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    const geser = (e: PointerEvent) => {
      pindah(index, awal.ex + (e.clientX - awal.x) / skala, awal.ey + (e.clientY - awal.y) / skala);
    };
    const selesai = () => {
      window.removeEventListener("pointermove", geser);
      window.removeEventListener("pointerup", selesai);
    };
    window.addEventListener("pointermove", geser);
    window.addEventListener("pointerup", selesai);
  }

  function mulaiUbahUkuran(event: React.PointerEvent<HTMLElement>, index: number) {
    if (!settings || skala === 0) return;
    event.stopPropagation();
    const element = settings.layout.elements[index];
    const asal = element.type === "qr" ? element.size : element.w;
    const awal = { x: event.clientX, nilai: asal };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    const geser = (e: PointerEvent) => {
      const berikut = Math.round(awal.nilai + (e.clientX - awal.x) / skala);
      if (element.type === "qr") {
        const maks = Math.min(settings.width_px - element.x, settings.height_px - element.y);
        ubahElemen(index, { size: jepit(berikut, 24, Math.max(24, maks)) });
      } else {
        ubahElemen(index, { w: jepit(berikut, 24, Math.max(24, settings.width_px - element.x)) });
      }
    };
    const selesai = () => {
      window.removeEventListener("pointermove", geser);
      window.removeEventListener("pointerup", selesai);
    };
    window.addEventListener("pointermove", geser);
    window.addEventListener("pointerup", selesai);
  }

  function panah(event: React.KeyboardEvent, index: number) {
    if (!settings) return;
    const langkah = event.shiftKey ? 10 : 1;
    const element = settings.layout.elements[index];
    const arah: Record<string, [number, number]> = {
      ArrowLeft: [-langkah, 0], ArrowRight: [langkah, 0], ArrowUp: [0, -langkah], ArrowDown: [0, langkah],
    };
    const gerak = arah[event.key];
    if (!gerak) return;
    event.preventDefault();
    pindah(index, element.x + gerak[0], element.y + gerak[1], false);
  }

  async function simpan() {
    if (!settings) return;
    setBusy(true);
    const response = await fetch(eventApiPath("/api/admin/label"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...settings,
        name_prefixes: prefixText.split(",").map((bagian) => bagian.trim()).filter(Boolean),
      }),
    }).catch(() => null);
    setBusy(false);

    if (!response) { toast.error("Koneksi gagal", "Setelan belum tersimpan."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error("Gagal disimpan", "Ada angka di luar batas yang diizinkan. Periksa bagian Printer.");
      return;
    }
    const tersimpan = body.settings as LabelSettings;
    setSettings(tersimpan);
    setPrefixText(tersimpan.name_prefixes.join(", "));
    setKotor(false);
    toast.success("Tersimpan", "Layar pemindai memakainya setelah dimuat ulang.");
  }

  if (!settings) {
    return (
      <WorkspacePage fill>
        <WorkspaceHeader />
        {error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : <PageLoading />}
      </WorkspacePage>
    );
  }

  const elements = settings.layout.elements;
  const aktif = terpilih != null ? elements[terpilih] : undefined;
  const ukuranCocok = UKURAN_LABEL.find((u) => u.w === settings.width_mm && u.h === settings.height_mm);
  const penuh = elements.length >= 12;
  const tanpaQr = !elements.some((element) => element.type === "qr");

  // ---- Panel utama: labelnya sendiri ------------------------------------------
  const utama = (
    <Pane aria-label="Pratinjau label">
      <PaneHeader className="flex-wrap gap-2 px-4 py-3">
        <span className="text-body-medium text-on-surface-variant">Tambahkan:</span>
        {TOMBOL_TAMBAH.map((tombol) => (
          <Button
            key={tombol.label}
            variant="outlined"
            size="sm"
            disabled={penuh}
            onClick={() => tambahElemen(tombol.buat)}
            icon={<Plus size={16} />}
          >
            {tombol.label}
          </Button>
        ))}
      </PaneHeader>

      {/* Alas netral, bukan warna merek: yang harus menonjol adalah kertas
          putihnya, dan warna apa pun di belakangnya akan bersaing dengan isi
          label yang seluruhnya hitam putih. */}
      <PaneBody className="flex flex-col bg-surface-container-highest">
        <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
          <div
            ref={panggung}
            className="relative w-full shadow-level2"
            style={{ maxWidth: settings.width_px, aspectRatio: `${settings.width_px} / ${settings.height_px}` }}
          >
            <canvas ref={kanvas} aria-hidden className="block h-full w-full rounded-sm bg-white" />

            {/* Lapisan sentuh di atas kanvas. Kanvas tidak bisa menerima
                fokus papan ketik maupun menyebut namanya sendiri ke pembaca
                layar, jadi setiap elemen punya tombol sungguhan di sini. */}
            {skala > 0
              ? elements.map((element, index) => {
                  const { w, h } = kotak(element);
                  const dipilih = terpilih === index;
                  const nama = element.type === "qr" ? "Kode QR" : NAMA_ISI[element.field];
                  return (
                    <div
                      key={index}
                      className="absolute"
                      style={{ left: element.x * skala, top: element.y * skala, width: w * skala, height: h * skala }}
                    >
                      <button
                        type="button"
                        aria-pressed={dipilih}
                        aria-label={`${nama}, posisi ${element.x} ${element.y}. Panah untuk menggeser.`}
                        onPointerDown={(event) => mulaiGeser(event, index)}
                        onKeyDown={(event) => panah(event, index)}
                        onFocus={() => pilih(index)}
                        className={cx(
                          "h-full w-full cursor-grab touch-none rounded-xs active:cursor-grabbing",
                          dipilih
                            ? "outline outline-2 outline-offset-2 outline-primary"
                            : "outline outline-1 outline-offset-2 outline-transparent hover:outline-outline focus-visible:outline-primary",
                        )}
                      />
                      {dipilih ? (
                        <span
                          role="slider"
                          tabIndex={0}
                          aria-label={`Lebar ${nama}`}
                          aria-valuenow={element.type === "qr" ? element.size : element.w}
                          aria-valuemin={24}
                          aria-valuemax={settings.width_px}
                          onPointerDown={(event) => mulaiUbahUkuran(event, index)}
                          onKeyDown={(event) => {
                            const arah = event.key === "ArrowRight" ? 4 : event.key === "ArrowLeft" ? -4 : 0;
                            if (!arah) return;
                            event.preventDefault();
                            const asal = element.type === "qr" ? element.size : element.w;
                            const maks = settings.width_px - element.x;
                            const nilai = jepit(asal + arah, 24, Math.max(24, maks));
                            ubahElemen(index, element.type === "qr" ? { size: nilai } : { w: nilai });
                          }}
                          className="absolute -bottom-2 -right-2 size-4 cursor-ew-resize touch-none rounded-full border-2 border-surface bg-primary"
                        />
                      ) : null}
                    </div>
                  );
                })
              : null}
          </div>
        </div>
        <p className="shrink-0 px-6 pb-5 text-center text-body-medium text-on-surface-variant">
          Klik isi label lalu geser. Titik biru di sudut mengatur lebarnya. Dengan papan ketik: Tab untuk berpindah,
          panah untuk menggeser, Shift dan panah untuk lompat sepuluh.
        </p>
      </PaneBody>

      {penuh || tanpaQr ? (
        <div className="flex shrink-0 flex-col gap-2 border-t border-outline-variant px-4 py-3 text-body-medium">
          {penuh ? <p className="text-on-surface-variant">Sudah dua belas isi. Hapus salah satu sebelum menambah lagi.</p> : null}
          {/* Label tanpa QR tetap tercetak rapi dan tetap tidak berguna: tamu
              membawanya ke booth, dipindai, dan tidak terbaca. Lebih baik
              diketahui sekarang daripada dari antrean yang macet. */}
          {tanpaQr ? (
            <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-on-surface">
              <Warning size={16} className="mt-0.5 shrink-0 text-warning" />
              Belum ada kode QR di label ini. Tanpa QR, badge-nya tidak bisa dipindai di booth maupun undian.
            </p>
          ) : null}
        </div>
      ) : null}
    </Pane>
  );

  // ---- Panel pendukung ----------------------------------------------------------
  const isiTerpilih = (
    <div className="flex flex-col gap-5">
      {aktif && terpilih != null ? (
        <Kelompok first>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-body-medium font-semibold text-on-surface">{aktif.type === "qr" ? "Kode QR" : NAMA_ISI[aktif.field]}</h3>
              <p className="text-body-medium tabular-nums text-on-surface-variant">Posisi {aktif.x}, {aktif.y}</p>
            </div>
            <IconButton size="sm" label="Hapus dari label" onClick={() => hapusElemen(terpilih)}>
              <Trash size={16} className="text-error" />
            </IconButton>
          </div>

          {aktif.type === "text" ? (
            <>
              {aktif.field === "static" ? (
                <TextField
                  label="Tulisannya"
                  maxLength={120}
                  value={aktif.text ?? ""}
                  onChange={(event) => ubahElemen(terpilih, { text: event.target.value })}
                />
              ) : null}
              <TextField
                label="Ukuran huruf"
                type="number"
                min={6}
                max={200}
                hint="Teks yang kepanjangan mengecil sendiri agar muat, tidak dipotong."
                value={aktif.size}
                onChange={(event) => ubahElemen(terpilih, { size: jepit(Number(event.target.value) || 6, 6, 200) })}
              />
              <div>
                <p className="text-body-medium font-medium text-on-surface">Rata</p>
                <SegmentedButton
                  className="mt-2 w-full"
                  label="Perataan teks"
                  value={aktif.align}
                  onChange={(nilai) => ubahElemen(terpilih, { align: nilai })}
                  options={[
                    { value: "left" as const, label: "Kiri" },
                    { value: "center" as const, label: "Tengah" },
                    { value: "right" as const, label: "Kanan" },
                  ]}
                />
              </div>
              <Switch
                checked={aktif.weight === "bold"}
                onChange={(nilai) => ubahElemen(terpilih, { weight: nilai ? "bold" : "normal" })}
                label="Tebal"
              />
              <Switch
                checked={Boolean(aktif.uppercase)}
                onChange={(nilai) => ubahElemen(terpilih, { uppercase: nilai })}
                label="Huruf besar semua"
              />
            </>
          ) : (
            <TextField
              label="Ukuran kotak QR"
              type="number"
              min={24}
              hint="Terlalu kecil membuatnya gagal dipindai di booth. Di bawah 70 sebaiknya diuji dulu."
              value={aktif.size}
              onChange={(event) => ubahElemen(terpilih, { size: jepit(Number(event.target.value) || 24, 24, 1000) })}
            />
          )}
        </Kelompok>
      ) : (
        <EmptyState
          plain
          className="px-4 py-10"
          title="Belum ada isi yang dipilih"
          description="Klik salah satu isi di label untuk mengatur ukuran huruf, rata, dan tebalnya."
        />
      )}

      <Kelompok title="Susunan">
        <p className="text-body-medium text-on-surface-variant">Mengganti seluruh isi label dengan susunan bawaan. Baru berlaku setelah disimpan.</p>
        <div>
          <Button
            variant="outlined"
            size="sm"
            icon={<ArrowCounterClockwise size={16} />}
            onClick={() => {
              setSettings((current) => (current ? { ...current, layout: DEFAULT_LABEL_SETTINGS.layout } : current));
              setTerpilih(null);
              setKotor(true);
            }}
          >
            Kembalikan susunan bawaan
          </Button>
        </div>
      </Kelompok>
    </div>
  );

  const isiGulungan = (
    <div className="flex flex-col gap-5">
      <Kelompok title="Ukuran gulungan" first>
        <p className="text-body-medium text-on-surface-variant">Pilih yang tertulis di kotak gulungan labelmu.</p>
        <div className="overflow-hidden rounded-md border border-outline-variant">
          {UKURAN_LABEL.map((ukuran) => {
            const dipakai = ukuran.w === settings.width_mm && ukuran.h === settings.height_mm;
            return (
              <button
                key={ukuran.label}
                type="button"
                aria-pressed={dipakai}
                onClick={() => ubahUkuran(ukuran.w, ukuran.h)}
                className={cx(
                  "flex w-full items-center justify-between gap-3 border-b border-outline-variant px-3 py-2.5 text-left text-body-medium last:border-b-0",
                  dipakai ? "bg-secondary-container" : "hover:bg-primary-soft",
                )}
              >
                <span className={cx("tabular-nums text-on-surface", dipakai && "font-medium")}>{ukuran.label}</span>
                {ukuran.catatan ? <span className="text-on-surface-variant">{ukuran.catatan}</span> : null}
              </button>
            );
          })}
        </div>
      </Kelompok>
      <Kelompok title="Ukuran khusus">
        {!ukuranCocok ? (
          <p className="text-body-medium text-on-surface-variant">Sekarang memakai ukuran khusus {settings.width_mm} x {settings.height_mm} mm.</p>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Lebar (mm)"
            type="number"
            value={settings.width_mm}
            onChange={(event) => ubahUkuran(jepit(Number(event.target.value) || 1, 1, 300), settings.height_mm)}
          />
          <TextField
            label="Tinggi (mm)"
            type="number"
            value={settings.height_mm}
            onChange={(event) => ubahUkuran(settings.width_mm, jepit(Number(event.target.value) || 1, 1, 300))}
          />
        </div>
      </Kelompok>
    </div>
  );

  const isiPrinter = (
    <div className="flex flex-col gap-5">
      <Kelompok first>
        <p className="text-body-medium text-on-surface-variant">
          Ubah hanya kalau label pertama keluar kosong, terpotong, atau pucat. Protokol NIIMBOT tidak diterbitkan
          vendornya, dan B21 belum pernah diuji oleh penulis pustaka yang dipakai di sini, jadi angkanya bisa
          dibetulkan sendiri.
        </p>
        <TextField
          label="Kerapatan panas (1 sampai 5)"
          type="number"
          min={1}
          max={5}
          hint="Naikkan kalau cetakan pucat. Makin tinggi makin lambat."
          value={settings.density}
          onChange={(event) => ubah("density", jepit(Number(event.target.value) || 3, 1, 5))}
        />
        <TextField
          label="Lebar kepala cetak (px)"
          type="number"
          hint="Turunkan kalau tepi kanan hilang. Printer melaporkan angkanya di layar pemindai setelah tersambung. B1 terukur 384."
          value={settings.head_px}
          onChange={(event) => hitungUlang({ head_px: jepit(Number(event.target.value) || 384, 32, 1200) })}
        />
        <TextField
          label="Geser vertikal (px)"
          type="number"
          hint="Positif menurunkan cetakan pada kertasnya."
          value={settings.offset_y_px}
          onChange={(event) => ubah("offset_y_px", jepit(Number(event.target.value) || 0, -200, 200))}
        />
      </Kelompok>
      <Kelompok title="Model printer">
        <SelectField
          label="Urutan perintah"
          hint="b1 untuk B21, B1, D11, D110. v4 untuk B21 Pro dan B1 Pro."
          value={settings.task}
          onChange={(event) => ubah("task", event.target.value === "v4" ? "v4" : "b1")}
        >
          <option value="b1">b1 (B21, B1, D11, D110)</option>
          <option value="v4">v4 (B21 Pro, B1 Pro)</option>
        </SelectField>
        <TextField
          label="DPI"
          type="number"
          hint="203 untuk B21. Harus cocok dengan urutan perintah."
          value={settings.dpi}
          onChange={(event) => hitungUlang({ dpi: jepit(Number(event.target.value) || 203, 100, 600) })}
        />
        <TextField
          label="Awalan nama Bluetooth"
          hint="Dipisah koma, untuk menyaring daftar perangkat. Kosongkan bila nama printernya belum diketahui."
          value={prefixText}
          onChange={(event) => { setPrefixText(event.target.value); setKotor(true); }}
          placeholder="B21, B1"
        />
      </Kelompok>
      <Kelompok title="Kertas">
        <TextField
          label="Jenis gulungan"
          type="number"
          min={1}
          max={5}
          hint="1 untuk label terpisah bercelah. Ubah hanya untuk kertas menerus atau bertanda hitam."
          value={settings.label_type}
          onChange={(event) => ubah("label_type", jepit(Number(event.target.value) || 1, 1, 5))}
        />
        <TextField
          label="Kecepatan"
          type="number"
          min={1}
          max={5}
          value={settings.speed}
          onChange={(event) => ubah("speed", jepit(Number(event.target.value) || 1, 1, 5))}
        />
        <p className="text-body-medium text-on-surface-variant">
          Yang dikirim ke printer: <span className="tabular-nums">{settings.width_px} x {settings.height_px} px</span> pada {settings.dpi} dpi.
          {mmKePx(settings.width_mm, settings.dpi) > settings.head_px
            ? ` Label ${settings.width_mm} mm sebenarnya ${mmKePx(settings.width_mm, settings.dpi)} px, tetapi kepala cetak berhenti di ${settings.head_px}.`
            : ""}
        </p>
      </Kelompok>
    </div>
  );

  const panel = (
    <Pane as="aside" aria-label="Setelan label">
      <div className="shrink-0 border-b border-outline-variant px-4 py-3">
        <SegmentedButton<Bagian>
          label="Bagian setelan"
          value={bagian}
          onChange={setBagian}
          className="w-full"
          options={[{ value: "isi", label: "Isi terpilih" }, { value: "gulungan", label: "Gulungan" }, { value: "printer", label: "Printer" }]}
        />
      </div>
      <PaneBody className="px-4 py-4">{bagian === "isi" ? isiTerpilih : bagian === "gulungan" ? isiGulungan : isiPrinter}</PaneBody>
      <PaneFooter note={kotor ? "Ada perubahan belum disimpan" : "Semua perubahan tersimpan"}>
        <Button size="sm" loading={busy} disabled={!kotor} onClick={() => void simpan()}>Simpan</Button>
      </PaneFooter>
    </Pane>
  );

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        meta={
          <>
            <span>Badge tamu walk-in</span>
            <MetaSeparator />
            <span className="tabular-nums">{settings.width_mm} x {settings.height_mm} mm</span>
            {!settings.enabled ? (
              <>
                <MetaSeparator />
                <span>Printer label mati, jadi bagian printer tidak tampil di layar pemindai</span>
              </>
            ) : null}
          </>
        }
        actions={
          <Switch
            checked={settings.enabled}
            onChange={(value) => ubah("enabled", value)}
            label="Pakai printer label"
          />
        }
      />

      {error ? <Banner tone="error" icon={<Warning size={18} />}>{error}</Banner> : null}

      <SupportingPane main={utama} pane={panel} />
    </WorkspacePage>
  );
}
