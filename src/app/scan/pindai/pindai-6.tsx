"use client";

import { useEffect } from "react";
import { barisCetakMeja } from "../cetak-meja";
import { TUTUP_OTOMATIS_MS } from "../result-sheet";
import { Button, useScrolledPastTop } from "@/components/m3";
import { Mode, RIWAYAT, jam, labelRiwayat } from "./pindai-bantu";
import type { useScanClient0 } from "./pindai-0";
import type { useScanClient1 } from "./pindai-1";
import type { useScanClient2 } from "./pindai-2";
import type { useScanClient3 } from "./pindai-3";
import type { useScanClient4 } from "./pindai-4";
import type { useScanClient5 } from "./pindai-5";

/** Bagian 7 dari 7 badan ScanClient, dipindah apa adanya (audit platform, Fase 3). */
export function useScanClient6(c: Awaited<ReturnType<typeof useScanClient0>> & Awaited<ReturnType<typeof useScanClient1>> & Awaited<ReturnType<typeof useScanClient2>> & Awaited<ReturnType<typeof useScanClient3>> & Awaited<ReturnType<typeof useScanClient4>> & Awaited<ReturnType<typeof useScanClient5>>) {
  const { antrean, badgeMeja, bisaBluetooth, cari, cetak, ditolakAntrean, gantiJalur, gantiMode, hadirTerbaru, hasil, hasilRef, hitungBatal, kedip, kirimAntrean, kueri, label, laneId, lanes, lembarMeja, lihatBelum, lupakanBarusan, meja, membaca, mengantre, mode, modeCetak, nomorBagasi, riwayat, router, sasaran, sesiAmbilRef, sesiHilang, sessionId, sessionRef, sessions, setDitolakAntrean, setGantiJob, setHasil, setKeluarJalan, setLembarMeja, setMengantre, setPindaiDitolak, setSesiHilang, setSessionId, setUlangLembar, tampilQr, terakhirHadir, terdaftar, tertahan, tutupLembar, tutupOtomatis, ulangLembar } = c;
  const sesiAktif = sessions.find((sesi) => sesi.id === sessionId);
  useEffect(() => { sesiAmbilRef.current = sesiAktif?.ambil_bagasi === true; }, [sesiAktif, sesiAmbilRef]);
  const hadirSemua = sessionId === null ? null : hadirTerbaru[sessionId] ?? sesiAktif?.hadir ?? null;
  const perluJalur = lanes.length > 0 && laneId === null;
  const jalurAktif = lanes.find((jalur) => jalur.id === laneId);
  // Bilah meja terbuka sampai sesi (dan jalur, bila ada) benar-benar dipilih.
  // Terlipat sebelum itu berarti petugas tidak pernah melihat pertanyaannya.
  // Meja belum siap: lembar sesi/meja terbuka sendiri dan tidak bisa ditutup.
  const perluSetup = sessions.length > 0 && (sessionId === null || perluJalur || sesiHilang);
  const lembarMejaBuka = lembarMeja || perluSetup;

  function simpanMeja(sesi: number, jalur: number | null) {
    if (sesi !== sessionId) {
      sessionRef.current = sesi;
      lupakanBarusan();
      setSessionId(sesi);
      tutupLembar();
    }
    setSesiHilang(false);
    setPindaiDitolak(false);
    if (jalur !== laneId) gantiJalur(jalur);
    setLembarMeja(false);
  }

  async function keluar() {
    setKeluarJalan(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    // Ponsel scanner sering dipakai bergantian: History petugas sebelumnya
    // (nama peserta) tidak ikut terbaca oleh petugas berikutnya.
    try {
      for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
        const kunci = window.localStorage.key(i);
        if (kunci?.startsWith("scan-riwayat:")) window.localStorage.removeItem(kunci);
      }
    } catch {
      // Penyimpanan diblokir: tidak ada yang perlu dihapus.
    }
    router.replace("/login");
    router.refresh();
  }

  /**
   * Apakah lembar yang sedang terbuka menutup sendiri.
   *
   * Hanya hijau "Tercatat hadir" (bukan walk-in, yang datanya masih perlu
   * diperiksa), hanya di sesi tanpa barang, tidak selama label dicetak atau
   * setelah printer gagal (kabarnya hanya ada di lembar ini), tidak bila ada
   * tamu yang tertahan, dan tidak setelah petugas menyentuh lembarnya. Dengan
   * cetak otomatis, hitungannya baru mulai setelah labelnya keluar.
   */
  const menungguCetakOtomatis = Boolean(label?.enabled) && bisaBluetooth && modeCetak === "semua";

  // Badge lembar ini di stasiun cetak: Print again dari lembar ini, atau yang
  // datang bersama jawaban scan. Status terbarunya dari pertanyaan ulang HP.
  const jobAwal = hasil?.badge_cetak?.pekerjaan ?? null;
  const jobLembarId = ulangLembar?.kedip === kedip ? ulangLembar.id : jobAwal?.id ?? null;
  const pekerjaanLembar = jobLembarId === null ? null : meja.pekerjaan[jobLembarId] ?? (jobAwal?.id === jobLembarId ? jobAwal : null);
  const barisMeja = badgeMeja?.siap && hasil?.participant
    ? barisCetakMeja({
        meja,
        pekerjaan: pekerjaanLembar,
        galat: ulangLembar?.kedip === kedip ? null : hasil.badge_cetak?.galat ?? null,
        ulangi: hasil.status === "duplicate",
        mengantre,
        onGanti: () => setGantiJob(pekerjaanLembar?.id ?? null),
        onCetak: () => {
          const orang = hasil.participant;
          if (!orang) return;
          const untuk = kedip;
          setMengantre(true);
          void meja.cetakUlang(orang.id, orang.name).then((id) => {
            setMengantre(false);
            if (id !== null) setUlangLembar({ kedip: untuk, id });
          });
        },
      })
    : null;
  const hijau = hasil?.status === "recorded" || hasil?.status === "antri" || Boolean(hasil?.tersimpanSebelumnya);
  const lembarMenutup =
    tutupOtomatis &&
    hijau &&
    (sesiAktif?.jumlah_barang ?? 0) === 0 &&
    // Meja bagasi menunggu petugas menghitung dan memotret, atau mencocokkan dan menyerahkan.
    !sesiAktif?.bagasi &&
    !sesiAktif?.ambil_bagasi &&
    hitungBatal !== kedip &&
    tertahan === null &&
    cetak.fase !== "jalan" &&
    cetak.fase !== "galat" &&
    (!menungguCetakOtomatis || cetak.fase === "selesai") &&
    !barisMeja?.menahan;

  // Keadaan pencarian, seluruhnya diturunkan dari kueri yang sedang diketik dan
  // kunci yang menempel pada hasil terakhir. Tidak ada penanda "sedang memuat"
  // yang dijaga terpisah, jadi tidak ada keadaan yang bisa tertinggal menyala.
  const kueriBersih = kueri.trim();
  const cukupHuruf = kueriBersih.length >= 2 || (nomorBagasi && /^[0-9]$/.test(kueriBersih));
  const kunciSekarang = `${sessionId ?? 0}|${kueriBersih}`;
  const cariSekarang = cari?.kunci === kunciSekarang ? cari : null;
  const mencari = cukupHuruf && cariSekarang === null;

  // Pewaktu sungguhan, milik satu hasil. Bukan akhir animasi bilahnya: dengan
  // gerak dikurangi animasinya tidak berjalan, dan lembarnya akan menutup
  // seketika. Penjaga `=== target` memastikan pewaktu yang basi tidak pernah
  // menutup lembar tamu berikutnya.
  useEffect(() => {
    if (!lembarMenutup || !hasil) return;
    const target = hasil;
    const pewaktu = window.setTimeout(() => {
      if (hasilRef.current !== target) return;
      hasilRef.current = null;
      setHasil(null);
    }, TUTUP_OTOMATIS_MS);
    return () => window.clearTimeout(pewaktu);
    // `kedip` ikut: lembar yang dibuka lagi untuk tamu yang sama membawa objek
    // hasil yang sama, dan pewaktunya harus mulai lagi bersama bilahnya.
  }, [hasil, kedip, lembarMenutup, hasilRef, setHasil]);

  const pil = membaca
    ? { teks: "Read, saving…", nada: "bg-primary text-on-primary" }
    : { teks: "Ready to scan", nada: "bg-black/60 text-white" };

  // "Belum" dihitung dari dua angka server yang dibaca terpisah; tidak pernah
  // negatif meski pindaian masuk di antara keduanya.
  // Sesi dengan yang diharapkan (Who sees it Agenda): angka dari situ, dan
  // pindaian sejak pembaruan terakhir ditambahkan sampai angka server berikutnya.
  const sasaranAktif = sessionId === null ? null : sasaran[sessionId] ?? null;
  const tambahan = sasaranAktif && hadirSemua !== null && sasaranAktif.dasar !== null ? Math.max(0, hadirSemua - sasaranAktif.dasar) : 0;
  const hadir = sasaranAktif ? Math.min(sasaranAktif.diharapkan, sasaranAktif.sudah + tambahan) : hadirSemua;
  const pembagi = sasaranAktif ? sasaranAktif.diharapkan : terdaftar;
  const lainnya = sasaranAktif?.lainnya ?? 0;
  const belum = pembagi === null || hadir === null ? null : Math.max(0, pembagi - hadir);
  const persen = pembagi ? Math.min(100, Math.round(((hadir ?? 0) / pembagi) * 100)) : 0;
  const angka = (n: number) => n.toLocaleString("en-GB");
  const bilahKemajuan = (
    <div
      role="progressbar"
      aria-label={sasaranAktif ? "Checked in of expected" : "Checked in of registered"}
      aria-valuemin={0}
      aria-valuemax={pembagi ?? 0}
      aria-valuenow={hadir ?? 0}
      className="h-1.5 overflow-hidden rounded-full bg-surface-container-highest"
    >
      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${persen}%` }} />
    </div>
  );

  /**
   * Layar pindai di ponsel: jendela bidik selebar dan setinggi layar, bilah atas
   * dan navigasi bawah gelap, seperti kamera Google Lens dan pemindai boarding
   * maskapai. Sebelumnya kamera adalah kartu membulat di bawah kartu angka, di
   * kanvas abu terang: terbaca seperti gambar di dalam formulir, dan yang
   * dipakai setiap lima detik justru terdorong ke bawah. Angka hadir pindah ke
   * satu baris di atas gambar kamera, tamu terakhir ke satu baris di bawahnya.
   * Layar lebar (lg) tetap kolom kamera + panel angka.
   */
  const imersif = mode === "qr" && !tampilQr;
  // Ponsel: satu tema gelap untuk Scan, Find name dan History. Dulu Find name
  // dan History berganti ke kanvas putih, menyilaukan di ruang gelap dan terasa
  // seperti aplikasi lain. Kecuali saat menampilkan QR untuk dipindai peserta:
  // layar itu tetap terang supaya kamera peserta mudah membacanya.
  const gelap = !tampilQr;
  const { sentinel: penandaAtas, scrolled: tergulir } = useScrolledPastTop();

  const judulMeja = `${sesiAktif?.name ?? "Choose a check-in point"}${jalurAktif ? ` · ${jalurAktif.name}` : ""}`;

  /**
   * Angka hadir di atas bingkai kamera (ponsel). Tampil juga saat kamera mati,
   * karena di ponsel strip angka hanya ada di Find name.
   */
  const pilHadir = (
    <div className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-full bg-black/70 px-4 text-white backdrop-blur-md lg:hidden">
      <p className="shrink-0 text-label-large tabular-nums">
        {angka(hadir ?? 0)}
        <span className="font-normal text-white/75">{pembagi !== null ? ` of ${angka(pembagi)}` : ""} checked in</span>
      </p>
      {pembagi ? (
        <div aria-hidden className="h-1 min-w-6 flex-1 overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${persen}%` }} />
        </div>
      ) : null}
    </div>
  );

  /**
   * Strip hadir di ponsel: angka seluruh meja dan tamu terakhir, selalu di atas
   * panggung. "dari … · … belum" ada di baris kedua, bukan di kalimat panjang:
   * yang dilirik petugas di tengah antrean adalah angka besarnya.
   */
  const stripHadir = (
    <div className="rounded-2xl bg-surface-container px-4 pb-3 pt-3 lg:hidden">
      {/* Kelompok di baris sendiri selebar kotak: label panjang ("Batch 1 /
          Batch 2 / Batch 3 / Batch 4") tidak boleh menyempitkan kolom tamu terakhir. */}
      {sasaranAktif?.untuk ? (
        <p className="mb-2 text-label-medium font-semibold text-on-surface">Counting {sasaranAktif.untuk} only</p>
      ) : null}
      <div className="flex items-center gap-4">
        <div className="shrink-0">
          <p className="text-label-small text-on-surface-variant">All desks</p>
          <p className="flex items-baseline gap-2">
            <span className="text-headline-medium font-semibold tabular-nums">{angka(hadir ?? 0)}</span>
            <span className="text-body-medium text-on-surface-variant">checked in</span>
          </p>
          {pembagi !== null ? (
            <p className="text-label-medium tabular-nums text-on-surface-variant">
              of {angka(pembagi)}{belum !== null ? ` · ${angka(belum)} not yet` : ""}
            </p>
          ) : null}
        </div>
        <span aria-hidden className="h-10 w-px shrink-0 bg-outline-variant" />
        <div className="min-w-0 flex-1" role="status">
          {terakhirHadir ? (
            <>
              <p className="text-label-medium text-on-surface-variant">Last · {jam(terakhirHadir.waktu)}</p>
              <p className="truncate text-body-medium font-semibold">{terakhirHadir.nama}</p>
            </>
          ) : (
            <p className="text-body-medium text-on-surface-variant">No scans yet.</p>
          )}
        </div>
      </div>
      {pembagi ? <div className="mt-3">{bilahKemajuan}</div> : null}
      {/* Orang dari kelompok lain yang dipindai di sini: tidak menaikkan angka,
          tetapi tidak hilang diam-diam (pola halaman Kehadiran panitia). */}
      {sasaranAktif && lainnya > 0 ? (
        <p className="mt-2 text-label-medium tabular-nums text-on-surface-variant">
          +{angka(lainnya)} from other groups also checked in here
        </p>
      ) : null}
      {/* Siapa yang belum: membuka daftar di Find name. Di tab Find name
          sendiri tombolnya tidak perlu, daftarnya sudah di bawah. */}
      {belum !== null && belum > 0 && mode !== "cari" ? (
        <button
          type="button"
          onClick={lihatBelum}
          className="mt-3 flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-surface px-4 text-left text-body-large font-semibold"
        >
          <span className="min-w-0">{angka(belum)} not checked in yet</span>
          <span className="shrink-0 text-label-large text-primary">See who ›</span>
        </button>
      ) : null}
    </div>
  );

  const pitaDitolak = ditolakAntrean.length > 0 ? (
    <div role="alert" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-[#ffdad6] px-3 py-2.5 text-body-medium text-[#410002]">
      <span className="min-w-0 flex-1">
        <b className="font-semibold">
          {ditolakAntrean.length === 1 ? "1 saved scan was not accepted" : `${ditolakAntrean.length} saved scans were not accepted`}:
        </b>{" "}
        {ditolakAntrean.join(", ")}. They went in while the signal was down. Find them or tell the organisers.
      </span>
      <button
        type="button"
        onClick={() => setDitolakAntrean([])}
        className="min-h-12 shrink-0 rounded-full px-3 text-label-large font-semibold text-[#93000a] hover:bg-[#93000a]/10"
      >
        Got it
      </button>
    </div>
  ) : null;

  const pitaAntrean = antrean.length > 0 ? (
    <div role="status" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-warning-soft px-3 py-2.5 text-body-medium text-on-warning-soft">
      <span className="min-w-0 flex-1">
        <b className="font-semibold">{antrean.length} waiting to send.</b> Keep this page open; they send by themselves when the signal is back.
      </span>
      <Button variant="text" size="sm" onClick={() => void kirimAntrean()}>Send now</Button>
    </div>
  ) : null;

  const daftarRiwayat = (batas: number) =>
    riwayat.length === 0 ? (
      <p className="mt-2 text-body-small text-on-surface-variant">No scans on this phone today.</p>
    ) : (
      <ul className="mt-1 divide-y divide-outline-variant">
        {riwayat.slice(0, batas).map((baris, index) => (
          <li key={`${baris.waktu}-${index}`} className="flex min-h-12 items-center justify-between gap-3 py-2 text-body-medium">
            <span className="min-w-0 flex-1 truncate">{baris.nama}</span>
            <span className={RIWAYAT[baris.status].kelas}>{labelRiwayat(baris)}</span>
            <span className="tabular-nums text-on-surface-variant">{jam(baris.waktu)}</span>
          </li>
        ))}
      </ul>
    );

  const navBawah = (nilai: Mode, label: string, ikon: React.ReactNode) => {
    const aktif = mode === nilai;
    return (
      <button
        key={nilai}
        type="button"
        aria-current={aktif ? "page" : undefined}
        onClick={() => gantiMode(nilai)}
        className="flex min-w-0 flex-1 flex-col items-center gap-1 pb-4 pt-3"
      >
        <span className={`flex h-8 w-16 items-center justify-center rounded-full transition-colors ${aktif ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant"}`}>
          {ikon}
        </span>
        <span className={`text-label-medium ${aktif ? "font-semibold text-on-surface" : "text-on-surface-variant"}`}>{label}</span>
      </button>
    );
  };
  return { sesiAktif, hadirSemua, perluJalur, jalurAktif, perluSetup, lembarMejaBuka, simpanMeja, keluar, menungguCetakOtomatis, jobAwal, jobLembarId, pekerjaanLembar, barisMeja, hijau, lembarMenutup, kueriBersih, cukupHuruf, kunciSekarang, cariSekarang, mencari, pil, sasaranAktif, tambahan, hadir, pembagi, lainnya, belum, persen, angka, bilahKemajuan, imersif, gelap, penandaAtas, tergulir, judulMeja, pilHadir, stripHadir, pitaDitolak, pitaAntrean, daftarRiwayat, navBawah };
}
