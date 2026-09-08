"use client";

import { ArrowCounterClockwise, CaretDown, FloppyDisk, Plus, Trash } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, SegmentedButton, SelectField, Switch, TextField } from "@/components/m3";
import { useToast } from "@/components/toast";
import { eventApiPath } from "@/lib/event-url";
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
 * kepala cetak) tidak dihapus, hanya dilipat ke bagian "Setelan printer". Ia
 * dibutuhkan tepat sekali, saat label pertama keluar salah, dan tidak pernah
 * lagi sesudahnya.
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
  { label: "Nama peserta", buat: { kind: "text", field: "name" } },
  { label: "Instansi", buat: { kind: "text", field: "company" } },
  { label: "Jabatan", buat: { kind: "text", field: "title" } },
  { label: "Kode peserta", buat: { kind: "text", field: "qr_code" } },
  { label: "Kode QR", buat: { kind: "qr" } },
  { label: "Teks bebas", buat: { kind: "text", field: "static" } },
];

export default function LabelAdminPage() {
  const [settings, setSettings] = useState<LabelSettings | null>(null);
  const [prefixText, setPrefixText] = useState("");
  const [terpilih, setTerpilih] = useState<number | null>(null);
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
      if (!batal) setError("Pratinjau gagal digambar. Periksa ukuran label di Setelan printer.");
    });
    return () => { batal = true; };
  }, [settings]);

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
    setKotor(true);
  }

  const skala = settings && lebarTampil > 0 ? lebarTampil / settings.width_px : 0;

  /** Ukuran kotak sebuah elemen dalam piksel label. Dipakai untuk batas dan overlay. */
  function kotak(element: LabelElement) {
    return element.type === "qr"
      ? { w: element.size, h: element.size }
      : { w: element.w, h: tinggiTeks(element.size) };
  }

  function pindah(index: number, x: number, y: number) {
    if (!settings) return;
    const element = settings.layout.elements[index];
    const { w, h } = kotak(element);
    let nx = Math.round(x);
    // Menempel ke sumbu tengah bila sudah dekat. Menengahkan sesuatu dengan
    // menyeret nyaris mustahil dilakukan tepat, dan tengah adalah posisi yang
    // paling sering dituju di label selebar lima sentimeter.
    const tengah = Math.round((settings.width_px - w) / 2);
    if (Math.abs(nx - tengah) <= 6) nx = tengah;
    ubahElemen(index, {
      x: jepit(nx, 0, Math.max(0, settings.width_px - w)),
      y: jepit(Math.round(y), 0, Math.max(0, settings.height_px - h)),
    });
  }

  function mulaiGeser(event: React.PointerEvent<HTMLElement>, index: number) {
    if (!settings || skala === 0) return;
    setTerpilih(index);
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
    pindah(index, element.x + gerak[0], element.y + gerak[1]);
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
      toast.error("Gagal disimpan", "Ada angka di luar batas yang diizinkan. Periksa Setelan printer.");
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
      <main className="bg-surface px-5 pb-8 pt-6 text-on-surface sm:px-8">
        <p className="text-body-medium text-on-surface-variant">{error || "Memuat setelan label..."}</p>
      </main>
    );
  }

  const elements = settings.layout.elements;
  const aktif = terpilih != null ? elements[terpilih] : undefined;
  const ukuranCocok = UKURAN_LABEL.find((u) => u.w === settings.width_mm && u.h === settings.height_mm);

  return (
    <main className="bg-surface px-5 pb-8 pt-6 text-on-surface sm:px-8 lg:pb-10">
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <p className="max-w-xl text-body-medium leading-6 text-on-surface-variant">
            Rupa badge yang dicetak untuk tamu walk-in. Geser isinya langsung di atas gambar labelnya.
          </p>
          <Button
            className="shrink-0"
            loading={busy}
            disabled={!kotor}
            onClick={() => void simpan()}
            icon={<FloppyDisk size={18} weight="bold" />}
          >
            {kotor ? "Simpan perubahan" : "Tersimpan"}
          </Button>
        </div>

        {error ? <p role="alert" className="mt-5 rounded-lg bg-error-soft p-4 text-body-medium text-error">{error}</p> : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          {/* -----------------------------------------------------------------
              Panggung. Titik fokus halaman ini, dan satu-satunya tempat yang
              perlu dipahami untuk memakai layar ini sama sekali.
              ----------------------------------------------------------------- */}
          <section className="rounded-[28px] bg-surface-container p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-title-medium">Label</h2>
              <p className="text-body-small text-on-surface-variant">
                {settings.width_mm} x {settings.height_mm} mm
              </p>
            </div>

            {/* Alas gelap netral, bukan warna merek: yang harus menonjol adalah
                kertas putihnya, dan warna apa pun di belakangnya akan bersaing
                dengan isi label yang seluruhnya hitam putih. */}
            <div className="mt-4 flex justify-center rounded-2xl bg-surface-container-highest p-4 sm:p-6">
              <div
                ref={panggung}
                className="relative w-full shadow-level2"
                style={{ maxWidth: settings.width_px, aspectRatio: `${settings.width_px} / ${settings.height_px}` }}
              >
                <canvas
                  ref={kanvas}
                  aria-hidden
                  className="block h-full w-full rounded-sm bg-white"
                />

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
                            onFocus={() => setTerpilih(index)}
                            className={`h-full w-full cursor-grab touch-none rounded-xs transition-colors active:cursor-grabbing ${
                              dipilih
                                ? "outline outline-2 outline-offset-2 outline-primary"
                                : "outline outline-1 outline-offset-2 outline-transparent hover:outline-outline focus-visible:outline-primary"
                            }`}
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

            <p className="mt-3 text-body-small text-on-surface-variant">
              Klik isinya lalu geser. Titik biru di sudut mengatur lebarnya. Dengan papan ketik: Tab untuk berpindah,
              panah untuk menggeser, Shift dan panah untuk lompat sepuluh.
            </p>

            <div className="mt-5">
              <p className="text-label-large text-on-surface-variant">Tambahkan ke label</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {TOMBOL_TAMBAH.map((tombol) => (
                  <Button
                    key={tombol.label}
                    variant="outlined"
                    size="sm"
                    disabled={elements.length >= 12}
                    onClick={() => tambahElemen(tombol.buat)}
                    icon={<Plus size={16} weight="bold" />}
                  >
                    {tombol.label}
                  </Button>
                ))}
              </div>
              {elements.length >= 12 ? (
                <p className="mt-2 text-body-small text-on-surface-variant">
                  Sudah dua belas isi. Hapus salah satu sebelum menambah lagi.
                </p>
              ) : null}

              {/* Label tanpa QR tetap tercetak rapi dan tetap tidak berguna:
                  tamu membawanya ke booth, dipindai, dan tidak terbaca. Lebih
                  baik diketahui sekarang daripada dari antrean yang macet. */}
              {!elements.some((element) => element.type === "qr") ? (
                <p className="mt-3 rounded-lg bg-warning-soft p-3 text-body-small text-on-warning-soft">
                  Belum ada kode QR di label ini. Tanpa QR, badge-nya tidak bisa dipindai di booth maupun undian.
                </p>
              ) : null}
            </div>
          </section>

          {/* -----------------------------------------------------------------
              Panel kanan. Berganti isi menurut apa yang sedang dipilih, bukan
              menampilkan semuanya sekaligus: yang tidak sedang dikerjakan tidak
              perlu meminta perhatian.
              ----------------------------------------------------------------- */}
          <aside className="space-y-4 lg:sticky lg:top-6">
            {aktif && terpilih != null ? (
              <section className="rounded-[28px] bg-surface-container p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-title-medium">
                      {aktif.type === "qr" ? "Kode QR" : NAMA_ISI[aktif.field]}
                    </h2>
                    <p className="mt-1 text-body-small text-on-surface-variant">
                      Posisi {aktif.x}, {aktif.y}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => hapusElemen(terpilih)}
                    aria-label="Hapus dari label"
                    className="m3-state min-h-11 rounded-full px-3 text-error"
                  >
                    <Trash size={18} />
                  </button>
                </div>

                {aktif.type === "text" ? (
                  <div className="mt-4 space-y-4">
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
                      <p className="text-label-large text-on-surface-variant">Rata</p>
                      <SegmentedButton
                        className="mt-2"
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
                  </div>
                ) : (
                  <div className="mt-4">
                    <TextField
                      label="Ukuran kotak QR"
                      type="number"
                      min={24}
                      hint="Terlalu kecil membuatnya gagal dipindai di booth. Di bawah 70 sebaiknya diuji dulu."
                      value={aktif.size}
                      onChange={(event) => ubahElemen(terpilih, { size: jepit(Number(event.target.value) || 24, 24, 1000) })}
                    />
                  </div>
                )}
              </section>
            ) : (
              <section className="rounded-[28px] bg-surface-container p-5 sm:p-6">
                <h2 className="text-title-medium">Ukuran gulungan</h2>
                <p className="mt-2 text-body-medium text-on-surface-variant">
                  Pilih yang tertulis di kotak gulungan labelmu.
                </p>

                <div className="mt-4 space-y-2">
                  {UKURAN_LABEL.map((ukuran) => {
                    const dipakai = ukuran.w === settings.width_mm && ukuran.h === settings.height_mm;
                    return (
                      <button
                        key={ukuran.label}
                        type="button"
                        aria-pressed={dipakai}
                        onClick={() => ubahUkuran(ukuran.w, ukuran.h)}
                        className={`m3-state flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left ${
                          dipakai ? "bg-primary-container text-on-primary-container" : "bg-surface"
                        }`}
                      >
                        <span className="text-body-large">{ukuran.label}</span>
                        {ukuran.catatan ? <span className="text-body-small opacity-80">{ukuran.catatan}</span> : null}
                      </button>
                    );
                  })}
                </div>

                {!ukuranCocok ? (
                  <p className="mt-3 text-body-small text-on-surface-variant">
                    Sekarang memakai ukuran khusus {settings.width_mm} x {settings.height_mm} mm, diatur di Setelan
                    printer.
                  </p>
                ) : null}

                <p className="mt-4 text-body-small text-on-surface-variant">
                  Klik salah satu isi label di sebelah kiri untuk mengaturnya.
                </p>
              </section>
            )}

            <section className="rounded-[28px] bg-surface-container p-5 sm:p-6">
              <Switch
                checked={settings.enabled}
                onChange={(value) => ubah("enabled", value)}
                label="Pakai printer label"
                description="Dimatikan, seluruh bagian printer hilang dari layar pemindai."
              />
              <Button
                className="mt-4"
                variant="text"
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
            </section>
          </aside>
        </div>

        {/* -------------------------------------------------------------------
            Setelan printer, terlipat.

            Dibutuhkan tepat sekali, saat label pertama keluar salah, dan tidak
            pernah lagi sesudahnya. Terbuka permanen, ia menjadi enam kolom angka
            protokol yang menyambut setiap orang yang membuka halaman ini dan
            membuat bagian yang benar-benar perlu diatur terlihat seperti detail.

            <details> bawaan, bukan buka-tutup sendiri: ia sudah bisa dijangkau
            papan ketik, sudah diumumkan pembaca layar, dan sudah bisa dicari
            dengan Ctrl+F saat tertutup di sebagian peramban.
            ------------------------------------------------------------------- */}
        <details className="mt-4 rounded-[28px] bg-surface-container p-5 sm:p-6">
          <summary className="m3-state flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg">
            <span>
              <span className="text-title-medium">Setelan printer</span>
              <span className="mt-1 block text-body-small text-on-surface-variant">
                Buka hanya kalau label pertama keluar kosong, terpotong, atau pucat.
              </span>
            </span>
            <CaretDown size={20} aria-hidden className="shrink-0" />
          </summary>

          <p className="mt-5 max-w-3xl text-body-medium leading-6 text-on-surface-variant">
            Protokol NIIMBOT tidak diterbitkan vendornya, dan B21 belum pernah diuji oleh penulis pustaka yang dipakai
            di sini. Karena itu angkanya bisa dibetulkan sendiri, bukan lewat rilis baru.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
            <div className="grid grid-cols-2 gap-4">
              <TextField
                label="Lebar label (mm)"
                type="number"
                value={settings.width_mm}
                onChange={(event) => ubahUkuran(jepit(Number(event.target.value) || 1, 1, 300), settings.height_mm)}
              />
              <TextField
                label="Tinggi label (mm)"
                type="number"
                value={settings.height_mm}
                onChange={(event) => ubahUkuran(settings.width_mm, jepit(Number(event.target.value) || 1, 1, 300))}
              />
            </div>
          </div>

          <p className="mt-5 text-body-small text-on-surface-variant">
            Yang dikirim ke printer: {settings.width_px} x {settings.height_px} px pada {settings.dpi} dpi.
            {mmKePx(settings.width_mm, settings.dpi) > settings.head_px
              ? ` Label ${settings.width_mm} mm sebenarnya ${mmKePx(settings.width_mm, settings.dpi)} px, tetapi kepala cetak berhenti di ${settings.head_px}.`
              : ""}
          </p>
        </details>
      </div>
    </main>
  );
}
