"use client";

import { FORM_KOSONG, type BarisCari, type FormWalkIn, type Hasil, type Kandidat } from "../types";
import { identifyPrinter, readPrintHeadWidth } from "@/lib/label/printer";
import { periksaWalkIn } from "@/lib/walkin-form";
import { eventApiPath } from "@/lib/event-url";
import { pesanGalat, pesanPrinter } from "./pindai-bantu";
import type { useScanClient0 } from "./pindai-0";
import type { useScanClient2 } from "./pindai-2";
import type { useScanClient3 } from "./pindai-3";
import type { useScanClient4 } from "./pindai-4";

/** Bagian 6 dari 7 badan ScanClient, dipindah apa adanya (audit platform, Fase 3). */
export function useScanClient5(c: Awaited<ReturnType<typeof useScanClient0>> & Awaited<ReturnType<typeof useScanClient2>> & Awaited<ReturnType<typeof useScanClient3>> & Awaited<ReturnType<typeof useScanClient4>>) {
  const { bodyCetak, formWalkIn, gantiMode, kirim, label, laneId, sessionId, setCari, setCetak, setDialogWalkIn, setFokusCari, setFormWalkIn, setGalatKolomWalkIn, setGalatWalkIn, setKandidat, setKueri, setLebarKepala, setMencatatId, setMenyimpanWalkIn, setPrinter, setStatusDaftar, setTerdaftar, setTolakSimpanWalkIn, terapkanHasil, walkinFields, walkinWajib } = c;
  const catatDariDaftar = async (baris: BarisCari) => {
    setMencatatId(baris.id);
    const data = await kirim("", { id: baris.id, nama: baris.name });
    setMencatatId(null);
    return data;
  };

  const lihatBelum = () => {
    setKueri("");
    setStatusDaftar("belum");
    gantiMode("cari");
    setFokusCari(false);
  };

  const catatDariCari = async (baris: BarisCari) => {
    setMencatatId(baris.id);
    const data = await kirim("", { id: baris.id, nama: baris.name });
    setMencatatId(null);
    if (!data) return;
    // Baris diperbarui di tempat, bukan lewat pencarian ulang. Daftar yang
    // dimuat ulang akan melompat kembali ke atas, dan petugas yang sedang
    // mencatat rombongan tujuh orang kehilangan posisinya setiap kali.
    setCari((current) =>
      current === null
        ? current
        : {
            ...current,
            hasil: current.hasil.map((row) =>
              row.id === baris.id
                ? {
                    ...row,
                    scan_count: data.scan_count ?? row.scan_count + 1,
                    first_scan_at: data.first_scan_at ?? row.first_scan_at ?? new Date().toISOString(),
                  }
                : row,
            ),
          },
    );
  };

  async function sambungPrinter() {
    if (!label?.enabled) return;
    setCetak({ fase: "jalan", teks: "Looking for printer…" });
    try {
      const info = await identifyPrinter(label);
      setPrinter(info);
      // Lebar kepala cetak ditanyakan ke printernya sendiri, sekali, saat
      // tersambung. Ini satu-satunya cara mengetahui angka itu tanpa
      // menghabiskan label untuk mencobanya, dan angka itulah yang diisikan
      // admin di Setelan printer ketika tepi kanan label hilang.
      setLebarKepala(await readPrintHeadWidth().catch(() => null));
      setCetak({ fase: "selesai", teks: `Connected to ${info.label}.` });
    } catch (error) {
      setPrinter(null);
      setCetak({ fase: "galat", teks: pesanPrinter(error) });
    }
  }

  /**
   * Membuka dialog walk-in dengan nama yang BARU SAJA dicari sudah terisi.
   *
   * Mengetik nama dua kali berarti salah ketik satu kali, dan nama yang salah
   * ketik di sini tidak ketahuan sampai badge-nya sudah dipegang tamu.
   */
  function bukaWalkIn(namaAwal: string) {
    setFormWalkIn({ ...FORM_KOSONG, name: namaAwal.trim() });
    setKandidat(null);
    setGalatWalkIn("");
    setGalatKolomWalkIn({});
    setDialogWalkIn(true);
  }

  // Kolom yang disunting kehilangan tanda galatnya. Tanda yang tertinggal di
  // kolom yang sudah diisi membuat petugas mengira isiannya masih salah.
  function gantiFormWalkIn(baru: FormWalkIn) {
    const lama = formWalkIn;
    setFormWalkIn(baru);
    setGalatKolomWalkIn((galat) => {
      if (Object.keys(galat).length === 0) return galat;
      const sisa = { ...galat };
      for (const kunci of ["name", "company", "title", "phone", "email"] as const) {
        if (baru[kunci] !== lama[kunci]) delete sisa[kunci];
      }
      for (const kunci of Object.keys(baru.extra)) {
        if (baru.extra[kunci] !== lama.extra[kunci]) delete sisa[`extra.${kunci}`];
      }
      return Object.keys(sisa).length === Object.keys(galat).length ? galat : sisa;
    });
  }

  async function simpanWalkIn(paksa: boolean) {
    if (!sessionId) { setGalatWalkIn("Choose a check-in point first."); return; }
    const nama = formWalkIn.name.trim();
    // Aturan yang sama dengan server (lib/walkin-form.ts): yang kurang ditandai
    // di kolomnya sebelum apa pun dikirim.
    const galatKolom = periksaWalkIn(formWalkIn, walkinWajib, walkinFields);
    setGalatKolomWalkIn(galatKolom);
    if (Object.keys(galatKolom).length > 0) {
      setGalatWalkIn("");
      setTolakSimpanWalkIn((n) => n + 1);
      return;
    }

    setMenyimpanWalkIn(true);
    setGalatWalkIn("");
    const response = await fetch(eventApiPath("/api/attendance/walkin"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        lane_id: laneId,
        name: nama,
        company: formWalkIn.company.trim() || null,
        title: formWalkIn.title.trim() || null,
        phone: formWalkIn.phone.trim() || null,
        email: formWalkIn.email.trim() || null,
        extra: formWalkIn.extra,
        force: paksa,
        cetak: bodyCetak(),
      }),
    }).catch(() => null);
    setMenyimpanWalkIn(false);

    // Menyebut dengan tegas bahwa TIDAK ada yang tersimpan. Petugas yang ragu
    // akan menutup dialognya dan mencari nama itu di tab pencarian, menemukan
    // kosong, lalu mengulang dari awal dengan yakin.
    if (!response) { setGalatWalkIn("Connection lost. This participant is NOT saved yet. Try again."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Galat per kolom dari server: ditaruh di bawah kolomnya, bukan di kotak
      // galat umum yang tidak menunjuk ke mana pun.
      const rinci = (body?.error?.details ?? {}) as Record<string, unknown>;
      const perKolom = Object.fromEntries(
        Object.entries(rinci).filter(([kunci, nilai]) => kunci !== "message" && typeof nilai === "string"),
      ) as Record<string, string>;
      if (Object.keys(perKolom).length > 0) {
        setGalatKolomWalkIn(perKolom);
        setTolakSimpanWalkIn((n) => n + 1);
        return;
      }
      setGalatWalkIn(pesanGalat(body, "Could not save. Try again."));
      return;
    }

    if (body.status === "possible_duplicate") {
      setKandidat((body.candidates ?? []) as Kandidat[]);
      return;
    }

    terapkanHasil(body as Hasil, sessionId);
    if (body.status === "created") setTerdaftar((n) => (n === null ? n : n + 1));
    setDialogWalkIn(false);
    setFormWalkIn(FORM_KOSONG);
    setKandidat(null);
    // Kolom pencarian dikosongkan. Tamu ini selesai, dan kueri yang tertinggal
    // membuat tamu berikutnya dilayani di atas daftar milik orang sebelumnya.
    setKueri("");
  }

  /** Memakai peserta yang sudah ada, bukan membuat orang kedua bernama sama. */
  async function pakaiKandidat(baris: Kandidat) {
    setDialogWalkIn(false);
    setKandidat(null);
    setFormWalkIn(FORM_KOSONG);
    await kirim("", { id: baris.id, nama: baris.name });
    setKueri("");
  }
  return { catatDariDaftar, lihatBelum, catatDariCari, sambungPrinter, bukaWalkIn, gantiFormWalkIn, simpanWalkIn, pakaiKandidat };
}
