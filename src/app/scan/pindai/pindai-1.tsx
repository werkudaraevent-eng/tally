"use client";

import { useCallback, useEffect, useRef } from "react";
import { eventApiPath } from "@/lib/event-url";
import { gabungSasaran, type Hasil, type Jalur, type ModeCetak, type Sesi } from "../types";
import type { RegistrationField } from "@/lib/domain";
import { type AturanWalkIn } from "@/lib/walkin-form";
import type { LabelData, LabelSettings } from "@/lib/label/layout";
import { bacaSuara } from "../umpan-balik";
import { loadPrinterDriver, printLabel } from "@/lib/label/printer";
import { renderLabelDataUrl } from "@/lib/label/render";
import { KUNCI_CETAK, KUNCI_JALUR, TAHAN_SUKSES_MS, bacaKameraDepan, bacaModeCetak, bacaTutupOtomatis, pesanGalat, pesanPrinter, pilihJalur } from "./pindai-bantu";
import type { useScanClient0 } from "./pindai-0";

/** Bagian 2 dari 7 badan ScanClient, dipindah apa adanya (audit platform, Fase 3). */
export function useScanClient1(c: Awaited<ReturnType<typeof useScanClient0>>) {
  const { bagasiRef, barusanRef, bisaBluetooth, centangRef, hasilRef, label, laneId, laneRef, modeCetak, sesiAmbilRef, sessionRef, sessions, setAlasanTahan, setAllowWalkIn, setBadgeMeja, setCetak, setEventName, setEventSlug, setHadirTerbaru, setHasil, setKameraDepan, setKedip, setKodeLayar, setLabel, setLaneId, setLanes, setMemasang, setModeCetak, setNomorBagasi, setPesan, setPesanLayar, setSasaran, setSesiHilang, setSessionId, setSessions, setSuara, setTerdaftar, setTertahan, setTutupOtomatis, setUsername, setWalkinFields, setWalkinWajib, suaraRef, terakhirRef, tertahanRef } = c;
  const muatSesi = useCallback(async () => {
    const response = await fetch(eventApiPath("/api/attendance/sessions"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setPesan("Could not load the check-in points. Check the connection, then reload."); return; }
    const body = await response.json();
    const daftar = (body.sessions ?? []) as Sesi[];
    const jalurDaftar = (body.lanes ?? []) as Jalur[];
    setSessions(daftar);
    setLanes(jalurDaftar);
    setEventName(body.event?.name ?? "");
    setUsername(body.user?.username ?? "");
    setAllowWalkIn(Boolean(body.allow_walk_in));
    setWalkinFields((body.walkin_fields ?? []) as RegistrationField[]);
    if (body.walkin_wajib) setWalkinWajib(body.walkin_wajib as AturanWalkIn);
    setTerdaftar(typeof body.terdaftar === "number" ? body.terdaftar : null);
    setSasaran(gabungSasaran(body.sasaran, (id) => daftar.find((sesi) => sesi.id === id)?.hadir ?? null));
    setNomorBagasi(body.nomor_bagasi === true);
    // Angka dari daftar sesi lebih baru daripada yang tersimpan dari pindaian
    // sebelumnya: muat ulang berarti "ambil yang terbaru".
    setHadirTerbaru({});
    setLabel((body.label ?? null) as LabelSettings | null);
    setBadgeMeja((body.badge_meja ?? null) as { siap: boolean; menit: number } | null);
    setEventSlug(body.event?.slug ?? "");
    // Sesi yang dipilih bisa ditutup admin di tengah hari. Diam-diam pindah ke
    // sesi pertama berarti pemindaian berikutnya tercatat di sesi yang salah;
    // yang benar adalah membuka bilah meja dan meminta petugas memilih lagi.
    const dipilih = sessionRef.current;
    const hilang = dipilih !== null && !daftar.some((sesi) => sesi.id === dipilih);
    const sesiBaru = hilang ? null : dipilih ?? daftar[0]?.id ?? null;
    if (sesiBaru !== dipilih) {
      barusanRef.current.clear();
      terakhirRef.current = { qr: "", waktu: 0, tahan: TAHAN_SUKSES_MS };
    }
    sessionRef.current = sesiBaru;
    setSessionId(sesiBaru);
    setSesiHilang(hilang);

    // Dihitung di luar `setLaneId`, bukan di dalam updaternya: updater harus
    // murni, dan yang ini membaca alamat halaman serta localStorage.
    const jalurTerpilih = pilihJalur(jalurDaftar, laneRef.current);
    laneRef.current = jalurTerpilih;
    setLaneId(jalurTerpilih);

    setPesan(daftar.length === 0 ? "No check-in point is open yet. Contact the organisers." : "");
  }, [barusanRef, laneRef, sessionRef, setAllowWalkIn, setBadgeMeja, setEventName, setEventSlug, setHadirTerbaru, setLabel, setLaneId, setLanes, setNomorBagasi, setPesan, setSasaran, setSesiHilang, setSessionId, setSessions, setTerdaftar, setUsername, setWalkinFields, setWalkinWajib, terakhirRef]);

  // Sesi atau meja berganti: pemindaian ulang tamu yang barusan adalah koreksi,
  // jadi ingatan 30 detik dan tahanan kode yang sama ikut dilupakan.
  function lupakanBarusan() {
    barusanRef.current.clear();
    terakhirRef.current = { qr: "", waktu: 0, tahan: TAHAN_SUKSES_MS };
  }

  function gantiJalur(id: number | null) {
    laneRef.current = id;
    lupakanBarusan();
    setLaneId(id);
    setPesanLayar(null);
    try {
      if (id === null) window.localStorage.removeItem(KUNCI_JALUR);
      else window.localStorage.setItem(KUNCI_JALUR, String(id));
    } catch { /* penyimpanan tidak tersedia; pilihan tetap berlaku sesi ini */ }
  }

  /**
   * Memasang TV di meja ini ke jalur yang sedang dipilih.
   *
   * Yang mengetik kodenya adalah orang yang berdiri di sebelah layarnya, dan itu
   * memang izinnya, sama seperti memasang perangkat digital signage. Admin di
   * ruang kontrol tahu ada lima TV; ia tidak tahu TV yang menampilkan 4821
   * menghadap meja yang mana.
   */
  async function pasangLayar(kode: string) {
    if (!laneId) { setPesanLayar({ nada: "galat", teks: "Choose a desk first." }); return; }
    setMemasang(true);
    const response = await fetch(eventApiPath("/api/sapa/pair"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: kode, lane_id: laneId }),
    }).catch(() => null);
    setMemasang(false);

    if (!response) { setPesanLayar({ nada: "galat", teks: "Connection lost. Try again." }); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setPesanLayar({ nada: "galat", teks: pesanGalat(body, "Code not accepted. Check the number on the screen again.") });
      return;
    }
    setKodeLayar("");
    setPesanLayar({ nada: "ok", teks: `Screen linked to ${body.lane?.name ?? "this desk"}.` });
  }

  useEffect(() => {
    // Ditunda satu putaran, pola yang sama dengan layar admin lain: pemuatan
    // pertama tidak boleh memanggil setState di dalam badan efek.
    const timer = window.setTimeout(() => void muatSesi(), 0);
    return () => window.clearTimeout(timer);
  }, [muatSesi]);

  // Angka seluruh meja dibaca ulang tiap 30 detik, dan segera saat layar
  // kembali dibuka. Tanpa ini angkanya hanya bertambah oleh pindaian HP ini
  // sendiri, padahal empat meja lain memindai di sebelahnya.
  useEffect(() => {
    if (sessions.length === 0) return;
    let batal = false;
    const segarkan = async () => {
      if (document.visibilityState !== "visible") return;
      const response = await fetch(eventApiPath("/api/attendance/progress"), { cache: "no-store" }).catch(() => null);
      if (batal || !response?.ok) return;
      const body = (await response.json().catch(() => null)) as { terdaftar?: number; hadir?: Record<string, number>; sasaran?: unknown } | null;
      if (batal || !body) return;
      if (typeof body.terdaftar === "number") setTerdaftar(body.terdaftar);
      if (body.sasaran !== undefined) setSasaran(gabungSasaran(body.sasaran, (id) => body.hadir?.[id] ?? null));
      const hadirBaru = body.hadir;
      if (hadirBaru) {
        setHadirTerbaru((current) => {
          const gabung = { ...current };
          for (const [id, angka] of Object.entries(hadirBaru)) gabung[Number(id)] = angka;
          return gabung;
        });
      }
    };
    const timer = window.setInterval(() => void segarkan(), 30_000);
    const saatTerlihat = () => void segarkan();
    document.addEventListener("visibilitychange", saatTerlihat);
    return () => {
      batal = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", saatTerlihat);
    };
  }, [sessions.length, setHadirTerbaru, setSasaran, setTerdaftar]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setModeCetak(bacaModeCetak());
      const nyala = bacaSuara();
      suaraRef.current = nyala;
      setSuara(nyala);
      setTutupOtomatis(bacaTutupOtomatis());
      setKameraDepan(bacaKameraDepan());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [setKameraDepan, setModeCetak, setSuara, setTutupOtomatis, suaraRef]);

  /**
   * Driver printer diunduh SEBELUM tombolnya ditekan.
   *
   * Web Bluetooth hanya membuka dialog pemilih perangkat selama aktivasi
   * pengguna masih berlaku, yaitu beberapa detik setelah klik. Mengunduh berkas
   * driver 160 KB di dalam penanganan klik menghabiskan jendela itu di jaringan
   * venue, dan dialognya tidak pernah muncul: tombol ditekan lalu tidak terjadi
   * apa-apa. Diunduh lebih awal, panggilannya tinggal menunggu promise yang
   * sudah selesai.
   */
  useEffect(() => {
    if (!label?.enabled || !bisaBluetooth) return;
    void loadPrinterDriver().catch(() => { /* dilaporkan saat tombol ditekan */ });
  }, [bisaBluetooth, label?.enabled]);

  /**
   * Menyimpan label sebagai PNG, untuk perangkat tanpa Web Bluetooth.
   *
   * iOS tidak punya Web Bluetooth di peramban mana pun, termasuk Chrome di
   * iPhone yang memakai mesin Safari, dan Firefox juga tidak. Di sana jalan
   * keluarnya adalah berkas gambar yang dicetak dari aplikasi NIIMBOT. Jalur dan
   * alasannya sama dengan kartu kode peserta di halaman pendaftaran.
   */
  async function simpanLabelPng(dataUrl: string, kode: string) {
    const blob = await (await fetch(dataUrl)).blob();
    const berkas = new File([blob], `label-${kode}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [berkas] })) {
      await navigator.share({ files: [berkas], title: `Label ${kode}` });
      return;
    }
    const tautan = document.createElement("a");
    tautan.href = dataUrl;
    tautan.download = `label-${kode}.png`;
    tautan.click();
  }

  // Kode peserta ikut di jawaban scan hanya bila label stiker aktif; tanpa
  // kode, labelnya dicetak dengan kolom kode kosong.
  const cetakLabel = useCallback(async (peserta: Omit<LabelData, "qr_code"> & { qr_code?: string }) => {
    if (!label?.enabled) return;
    const data: LabelData = { ...peserta, qr_code: peserta.qr_code ?? "" };
    setCetak({ fase: "jalan", teks: "Sending to printer…" });
    try {
      const dataUrl = await renderLabelDataUrl(label, data);
      if (!bisaBluetooth) {
        await simpanLabelPng(dataUrl, data.qr_code);
        setCetak({ fase: "selesai", teks: "Label saved as an image. Print it from the NIIMBOT app." });
        return;
      }
      await printLabel(dataUrl, label);
      setCetak({ fase: "selesai", teks: `Label ${data.qr_code} printed.` });
    } catch (error) {
      setCetak({ fase: "galat", teks: pesanPrinter(error) });
    }
  }, [bisaBluetooth, label, setCetak]);

  /**
   * Jalur untuk cetak otomatis.
   *
   * Refs, bukan dependensi: `terapkanHasil` dipanggil dari dalam callback kamera
   * yang dipasang sekali, dan mengikat fungsi cetak sebagai dependensi berarti
   * memasang ulang pemindai setiap kali status printer berubah, di tengah
   * antrean.
   */
  const cetakRef = useRef(cetakLabel);
  const modeRef = useRef<ModeCetak>("off");
  useEffect(() => { cetakRef.current = cetakLabel; });
  useEffect(() => { modeRef.current = modeCetak; });

  function gantiModeCetak(nilai: ModeCetak) {
    modeRef.current = nilai;
    setModeCetak(nilai);
    try {
      if (nilai === "off") window.localStorage.removeItem(KUNCI_CETAK);
      else window.localStorage.setItem(KUNCI_CETAK, nilai);
    } catch { /* penyimpanan tidak tersedia; pilihan tetap berlaku sesi ini */ }
  }

  /**
   * Memasang satu hasil sebagai lembar yang terlihat, atau menahannya.
   *
   * Ditahan bila lembar yang sedang terbuka masih punya barang yang dicentang
   * tetapi belum diserahkan. Kamera tetap memindai di balik lembar, dan tamu
   * berikutnya sering sudah menyodorkan badge selagi petugas mengulurkan kaos.
   * Mengganti lembar di saat itu menghapus centangnya, dan kaos yang sudah di
   * tangan tamu tidak pernah tercatat.
   */
  const pasangLembar = useCallback((data: Hasil) => {
    if ((centangRef.current > 0 || bagasiRef.current > 0) && hasilRef.current) {
      setAlasanTahan(bagasiRef.current > 0 ? (sesiAmbilRef.current ? "ambil" : "bagasi") : "barang");
      tertahanRef.current = data;
      setTertahan(data);
      return;
    }
    hasilRef.current = data;
    setHasil(data);
    setKedip((current) => current + 1);
    setCetak({ fase: "diam" });
  }, [bagasiRef, centangRef, hasilRef, sesiAmbilRef, setAlasanTahan, setCetak, setHasil, setKedip, setTertahan, tertahanRef]);
  return { muatSesi, lupakanBarusan, gantiJalur, pasangLayar, simpanLabelPng, cetakLabel, cetakRef, modeRef, gantiModeCetak, pasangLembar };
}
