"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  ArrowsClockwise,
  CheckCircle,
  Clock,
  MagnifyingGlass,
  QrCode,
  UserCheck,
  UsersThree,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, EmptyState, IconButton, SelectField, Tabs, TextField, TopAppBar } from "@/components/m3";
import { SearchResultsSkeleton } from "@/components/search-loading";
import { LogoutButton } from "@/components/logout-button";
import { eventApiPath } from "@/lib/event-url";

/**
 * Pemindai kehadiran.
 *
 * ---- Dua jalur, bukan satu ------------------------------------------------
 *
 * QR adalah jalur cepat; pencarian nama adalah jalur yang menyelamatkan antrean
 * ketika jalur cepat gagal. Keduanya duduk di tab terpisah dan bukan di satu
 * layar bertumpuk, karena keduanya menuntut hal yang berlawanan dari petugas:
 * memindai berarti mengarahkan ponsel dan tidak melihat layar, mencari berarti
 * menunduk dan mengetik. Menaruh papan ketik di bawah pratinjau kamera yang
 * menyala membuat keduanya lebih buruk sekaligus.
 *
 * Tab pertama tetap QR dan selalu terpilih saat halaman dibuka. Ini bukan dua
 * fitur setara: pemindaian adalah jalur yang dilewati hampir semua tamu, dan
 * pencarian adalah jalan keluar.
 *
 * ---- Kenapa hasilnya berupa BIDANG WARNA, bukan kalimat --------------------
 *
 * Petugas di pintu masuk tidak membaca layar; ia melirik. Antreannya bergerak,
 * ponselnya dipegang satu tangan, dan cahaya ballroom sering menyorot dari
 * belakang. Karena itu tiga kemungkinan jawaban dibedakan lebih dulu oleh warna
 * dan ikon selebar panel — hijau tercatat, kuning sudah pernah, merah tidak
 * dikenal — dan baru sesudah itu oleh teksnya.
 *
 * Getaran ikut dibedakan: satu ketukan untuk berhasil, tiga untuk ditolak. Di
 * ruangan yang bising, itu satu-satunya umpan balik yang pasti sampai.
 *
 * ---- Kenapa kamera hanya menyala setelah ditekan ---------------------------
 *
 * Izin kamera diminta pada tindakan yang disengaja, bukan saat halaman dibuka.
 * Pola yang sama dipakai layar booth, dan alasannya sama: permintaan izin yang
 * muncul tanpa diminta cenderung ditolak, dan izin yang sudah ditolak sekali
 * jauh lebih sulit dipulihkan daripada diminta.
 *
 * ---- Kenapa tata letaknya berubah bentuk, bukan sekadar melebar ------------
 *
 * Layar ini dipakai di tiga tempat sekaligus: ponsel petugas yang berdiri di
 * pintu, iPad di meja registrasi, dan laptop panitia yang mengawasi angkanya.
 * Satu kolom sempit yang dipusatkan menjawab yang pertama dan menyia-nyiakan dua
 * lainnya — di 1440px ia menjadi pita tipis di tengah dengan dua bidang kosong
 * selebar telapak tangan di kiri dan kanan.
 *
 * Maka dari `lg` ke atas isinya dipecah menjadi dua panel: panel kerja (tab,
 * hasil, kamera atau pencarian) dan panel pantau yang menempel (jumlah hadir dan
 * arus pemindaian terakhir). Panel kedua itulah yang mengisi ruang yang tadinya
 * kosong, dan isinya memang yang ditanyakan orang yang duduk di depan layar
 * lebar: berapa yang sudah masuk, dan siapa yang barusan lewat.
 */

type Sesi = { id: number; name: string; slug: string; hadir?: number };

/**
 * Jalur registrasi — satu MEJA, bukan satu tahap acara.
 *
 * Lima meja berdampingan melayani sesi "Registrasi" yang sama. Jalur ikut
 * dikirim bersama setiap pemindaian supaya TV di atas meja ini menyapa tamu meja
 * ini saja, bukan seluruh lobi.
 */
type Jalur = { id: number; name: string; slug: string };

/**
 * Jalur disimpan di perangkat, bukan di akun.
 *
 * Satu akun "petugas scan" lazim dipakai bergantian di beberapa ponsel, dan satu
 * meja bisa berganti tiga petugas dalam satu pagi. Yang menetap adalah PONSEL
 * yang tergeletak di meja itu — jadi di situlah pilihannya disimpan.
 */
const KUNCI_JALUR = "scan-lane-id";

/**
 * Jalur mana yang dipakai saat layar dibuka.
 *
 * Urutannya dari yang paling disengaja ke yang paling menebak: pilihan yang
 * sedang aktif, lalu alamat (`?jalur=meja-1`, untuk ponsel yang disiapkan
 * panitia), lalu yang tersimpan di perangkat ini, lalu — hanya bila memang cuma
 * ada satu jalur — jalur itu sendiri.
 *
 * Tidak pernah menebak ketika ada beberapa jalur. Menebak berarti sebagian
 * pemindaian pagi itu tercatat di meja yang salah, dan tidak ada satu pun tanda
 * di layar petugas bahwa itu terjadi.
 */
function pilihJalur(daftar: Jalur[], sekarang: number | null): number | null {
  if (sekarang && daftar.some((jalur) => jalur.id === sekarang)) return sekarang;

  const slug = new URLSearchParams(window.location.search).get("jalur");
  const dariAlamat = slug ? daftar.find((jalur) => jalur.slug === slug) : undefined;
  if (dariAlamat) return dariAlamat.id;

  try {
    const tersimpan = Number(window.localStorage.getItem(KUNCI_JALUR));
    if (daftar.some((jalur) => jalur.id === tersimpan)) return tersimpan;
  } catch { /* penyimpanan tidak tersedia */ }

  return daftar.length === 1 ? daftar[0].id : null;
}

type Hasil = {
  status: "recorded" | "duplicate" | "not_found";
  participant?: { id: string; name: string; company: string | null; title: string | null; qr_code: string };
  first_scan_at?: string | null;
  scan_count?: number;
  session_unique_total?: number;
  qr?: string;
};

type BarisCari = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  qr_code: string;
  scan_count: number;
  first_scan_at: string | null;
};

type Mode = "qr" | "cari";

const TAMPILAN: Record<Hasil["status"], { judul: string; kelas: string; Icon: typeof CheckCircle }> = {
  recorded: { judul: "Tercatat hadir", kelas: "bg-success-container text-on-success-container", Icon: CheckCircle },
  duplicate: { judul: "Sudah pernah dipindai", kelas: "bg-warning-container text-on-warning-container", Icon: Clock },
  not_found: { judul: "QR tidak dikenal", kelas: "bg-error-container text-on-error-container", Icon: XCircle },
};

const jam = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—";

/** Dua huruf awal dari dua kata pertama. Cukup untuk membedakan baris sekilas. */
const inisial = (nama: string) =>
  nama
    .split(/\s+/)
    .slice(0, 2)
    .map((kata) => kata.charAt(0).toUpperCase())
    .join("") || "?";

export default function ScanClient() {
  const [sessions, setSessions] = useState<Sesi[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [lanes, setLanes] = useState<Jalur[]>([]);
  const [laneId, setLaneId] = useState<number | null>(null);
  // Dibaca dari dalam callback pemuatan, tempat state React masih bernilai lama.
  const laneRef = useRef<number | null>(null);
  const [kodeLayar, setKodeLayar] = useState("");
  const [memasang, setMemasang] = useState(false);
  const [pesanLayar, setPesanLayar] = useState<{ nada: "ok" | "galat"; teks: string } | null>(null);
  const [eventName, setEventName] = useState("");
  const [username, setUsername] = useState("");
  const [mode, setMode] = useState<Mode>("qr");
  const [scanning, setScanning] = useState(false);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  // Naik satu setiap ada jawaban baru. Dipakai sebagai `key` supaya bidang hasil
  // benar-benar berkedip sekali — dua tamu berturut-turut yang sama-sama
  // "tercatat hadir" menghasilkan bidang hijau yang identik, dan tanpa kedipan
  // itu petugas tidak punya cara tahu apakah pemindaian keduanya terbaca.
  const [kedip, setKedip] = useState(0);
  // Angka hadir yang lebih baru daripada yang ikut terkirim bersama daftar sesi.
  // Disimpan per sesi, bukan sebagai satu angka: petugas yang berpindah dari
  // "Registrasi" ke "Makan siang" dan kembali lagi harus melihat angka masing-
  // masing sesi, bukan angka terakhir yang kebetulan tercatat.
  const [hadirTerbaru, setHadirTerbaru] = useState<Record<number, number>>({});
  const [riwayat, setRiwayat] = useState<Array<{ nama: string; status: Hasil["status"]; waktu: string }>>([]);
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const [kueri, setKueri] = useState("");
  /**
   * Hasil pencarian DAN kunci yang menghasilkannya, dalam satu state.
   *
   * Dipasangkan supaya "sedang mencari" bisa diturunkan — ia benar persis ketika
   * kunci yang tersimpan berbeda dari kunci sekarang — alih-alih dijaga sebagai
   * penanda tersendiri yang harus dinyalakan dan dimatikan di setiap cabang.
   * Penanda terpisah adalah yang membuat daftar lama sempat berkedip di bawah
   * kueri baru, karena keduanya tidak pernah berubah pada render yang sama.
   */
  const [cari, setCari] = useState<{ kunci: string; hasil: BarisCari[]; terpotong: boolean; gagal: boolean } | null>(null);
  const [mencatatId, setMencatatId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  // Menahan pemindaian beruntun dari QR yang sama. Kamera membaca puluhan frame
  // per detik, dan tanpa jeda satu badge yang tertinggal di depan lensa akan
  // menghasilkan belasan baris catatan dalam sekejap.
  const terakhirRef = useRef<{ qr: string; waktu: number }>({ qr: "", waktu: 0 });

  const muatSesi = useCallback(async () => {
    const response = await fetch(eventApiPath("/api/attendance/sessions"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setPesan("Daftar sesi gagal dimuat. Periksa koneksi lalu muat ulang."); return; }
    const body = await response.json();
    const daftar = (body.sessions ?? []) as Sesi[];
    const jalurDaftar = (body.lanes ?? []) as Jalur[];
    setSessions(daftar);
    setLanes(jalurDaftar);
    setEventName(body.event?.name ?? "");
    setUsername(body.user?.username ?? "");
    setSessionId((current) => current ?? daftar[0]?.id ?? null);

    // Dihitung di luar `setLaneId`, bukan di dalam updaternya: updater harus
    // murni, dan yang ini membaca alamat halaman serta localStorage.
    const jalurTerpilih = pilihJalur(jalurDaftar, laneRef.current);
    laneRef.current = jalurTerpilih;
    setLaneId(jalurTerpilih);

    setPesan(daftar.length === 0 ? "Belum ada sesi kehadiran yang dibuka. Hubungi panitia." : "");
  }, []);

  function gantiJalur(id: number | null) {
    laneRef.current = id;
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
   * memang izinnya — sama seperti memasang perangkat digital signage. Admin di
   * ruang kontrol tahu ada lima TV; ia tidak tahu TV yang menampilkan 4821
   * menghadap meja yang mana.
   */
  async function pasangLayar(kode: string) {
    if (!laneId) { setPesanLayar({ nada: "galat", teks: "Pilih jalur meja ini lebih dulu." }); return; }
    setMemasang(true);
    const response = await fetch(eventApiPath("/api/sapa/pair"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: kode, lane_id: laneId }),
    }).catch(() => null);
    setMemasang(false);

    if (!response) { setPesanLayar({ nada: "galat", teks: "Koneksi terputus. Coba lagi." }); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setPesanLayar({
        nada: "galat",
        teks: body.error?.details?.message ?? "Kode tidak diterima. Lihat lagi angka di layar.",
      });
      return;
    }
    setKodeLayar("");
    setPesanLayar({ nada: "ok", teks: `Layar terpasang ke ${body.lane?.name ?? "jalur ini"}.` });
  }

  useEffect(() => {
    // Ditunda satu putaran, pola yang sama dengan layar admin lain: pemuatan
    // pertama tidak boleh memanggil setState di dalam badan efek.
    const timer = window.setTimeout(() => void muatSesi(), 0);
    return () => window.clearTimeout(timer);
  }, [muatSesi]);

  const kirim = useCallback(async (qr: string): Promise<Hasil | null> => {
    if (!sessionId) { setPesan("Pilih sesi lebih dulu."); return null; }
    setSibuk(true);
    const response = await fetch(eventApiPath("/api/attendance/scan"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Jalur ikut di setiap pemindaian, bukan disimpulkan belakangan dari siapa
      // yang memindai: satu akun petugas dipakai bergantian di beberapa meja,
      // jadi `scanned_by` tidak pernah bisa menjawab "meja yang mana".
      body: JSON.stringify({ session_id: sessionId, qr, lane_id: laneId }),
    }).catch(() => null);
    setSibuk(false);

    if (!response) { setPesan("Koneksi terputus. Pemindaian TIDAK tercatat — ulangi."); return null; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setPesan(body.error?.details?.message ?? "Pemindaian gagal. Coba lagi.");
      return null;
    }

    const data = body as Hasil;
    setHasil(data);
    setKedip((current) => current + 1);
    setPesan("");
    if (typeof data.session_unique_total === "number") {
      const total = data.session_unique_total;
      setHadirTerbaru((current) => ({ ...current, [sessionId]: total }));
    }
    // Getaran dibedakan: satu ketukan berhasil, tiga ketukan pendek untuk yang
    // perlu diperiksa petugas.
    if (navigator.vibrate) navigator.vibrate(data.status === "recorded" ? 90 : [60, 60, 60]);
    setRiwayat((current) => [
      { nama: data.participant?.name ?? data.qr ?? "Tidak dikenal", status: data.status, waktu: new Date().toISOString() },
      ...current,
    ].slice(0, 20));
    return data;
  }, [laneId, sessionId]);

  useEffect(() => {
    if (!scanning || mode !== "qr" || !videoRef.current) return;
    const reader = new BrowserMultiFormatReader();
    let berhenti = false;
    let kontrol: { stop: () => void } | undefined;

    void reader
      .decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, videoRef.current, (result) => {
        if (berhenti || !result) return;
        const nilai = result.getText().trim();
        if (!nilai) return;
        // Kamera TIDAK dimatikan setelah membaca: antrean bergerak terus, dan
        // menyalakan ulang kamera untuk setiap orang menambah dua detik per
        // tamu. Yang ditahan hanya pengulangan QR yang sama dalam 2,5 detik.
        const sekarang = Date.now();
        if (terakhirRef.current.qr === nilai && sekarang - terakhirRef.current.waktu < 2500) return;
        terakhirRef.current = { qr: nilai, waktu: sekarang };
        void kirim(nilai);
      })
      .then((value) => { kontrol = value; if (berhenti) kontrol.stop(); })
      .catch(() => setPesan("Kamera tidak tersedia atau izinnya ditolak."));

    return () => { berhenti = true; kontrol?.stop(); };
  }, [kirim, mode, scanning]);

  // Kamera dimatikan begitu layar berpindah ke belakang. Ponsel petugas masuk
  // saku puluhan kali per acara, dan kamera yang tetap menyala di dalam saku
  // memakan baterai sepanjang sisa hari tanpa memindai satu pun tamu.
  useEffect(() => {
    if (!scanning) return;
    const tersembunyi = () => { if (document.hidden) setScanning(false); };
    document.addEventListener("visibilitychange", tersembunyi);
    return () => document.removeEventListener("visibilitychange", tersembunyi);
  }, [scanning]);

  // Pencarian ditunda 300 ms setelah ketukan terakhir. Nama Indonesia panjang,
  // dan satu permintaan per huruf berarti belasan kueri terbuang untuk satu nama
  // — di jaringan venue yang sudah padat, itu yang membuat hasilnya datang
  // terlambat.
  useEffect(() => {
    const q = kueri.trim();
    // Tidak ada pembersihan state di sini, dan itu disengaja: kueri yang terlalu
    // pendek cukup TIDAK menjalankan apa pun. Hasil lama tetap tersimpan tetapi
    // tidak pernah tergambar, karena kunci yang menempel padanya sudah tidak
    // cocok lagi dengan kueri sekarang.
    if (q.length < 2) return;
    const kunci = `${sessionId ?? 0}|${q}`;

    let basi = false;
    const timer = window.setTimeout(async () => {
      const alamat = eventApiPath(
        `/api/attendance/search?q=${encodeURIComponent(q)}${sessionId ? `&session_id=${sessionId}` : ""}`,
      );
      const response = await fetch(alamat, { cache: "no-store" }).catch(() => null);
      // Jawaban yang datang setelah kuerinya berganti dibuang. Tanpa penjaga ini
      // permintaan lambat untuk "bu" bisa mendarat setelah "budi" dan menimpa
      // hasil yang benar dengan hasil yang sudah tidak diminta.
      if (basi) return;
      if (!response?.ok) {
        setCari({ kunci, hasil: [], terpotong: false, gagal: true });
        return;
      }
      const body = await response.json().catch(() => ({}));
      setCari({
        kunci,
        hasil: (body.results ?? []) as BarisCari[],
        terpotong: Boolean(body.truncated),
        gagal: false,
      });
    }, 300);

    return () => { basi = true; window.clearTimeout(timer); };
  }, [kueri, sessionId]);

  const gantiMode = (berikutnya: Mode) => {
    setMode(berikutnya);
    // Kamera dimatikan saat berpindah ke tab pencarian. Membiarkannya hidup di
    // balik tab yang tidak terlihat berarti lampu kamera tetap menyala tanpa ada
    // pratinjau yang menjelaskan kenapa.
    if (berikutnya !== "qr") setScanning(false);
  };

  const catatDariCari = async (baris: BarisCari) => {
    setMencatatId(baris.id);
    const data = await kirim(baris.qr_code);
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

  const tampilan = hasil ? TAMPILAN[hasil.status] : null;
  const sesiAktif = sessions.find((sesi) => sesi.id === sessionId);
  const hadir = sessionId === null ? null : hadirTerbaru[sessionId] ?? sesiAktif?.hadir ?? null;

  // Keadaan pencarian, seluruhnya diturunkan dari kueri yang sedang diketik dan
  // kunci yang menempel pada hasil terakhir. Tidak ada penanda "sedang memuat"
  // yang dijaga terpisah, jadi tidak ada keadaan yang bisa tertinggal menyala.
  const kueriBersih = kueri.trim();
  const cukupHuruf = kueriBersih.length >= 2;
  const kunciSekarang = `${sessionId ?? 0}|${kueriBersih}`;
  const cariSekarang = cari?.kunci === kunciSekarang ? cari : null;
  const mencari = cukupHuruf && cariSekarang === null;

  return (
    <div className="min-h-dvh bg-surface text-on-surface">
      <TopAppBar
        title="Pemindai kehadiran"
        subtitle={`${eventName || "Memuat…"}${username ? ` · ${username}` : ""}`}
        actions={<LogoutButton />}
        maxWidth="1280px"
      />

      <main className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        {/* `items-start`, bukan regangan bawaan grid: tanpa itu panel pantau
            setinggi panel kerja dan `sticky` di dalamnya tidak pernah aktif. */}
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* Bilah sesi membentang penuh di kedua panel. Ia setelan, bukan isi:
              dipilih sekali di awal sesi lalu tidak disentuh lagi berjam-jam. */}
          <Card padded={false} className="p-4 lg:col-span-2">
            <div className="flex flex-wrap items-end gap-2">
              <SelectField
                label="Sesi kehadiran"
                value={sessionId ?? ""}
                onChange={(event) => { setSessionId(Number(event.target.value) || null); setHasil(null); }}
                className="min-w-0 flex-1 sm:max-w-xs"
              >
                {sessions.length === 0 ? <option value="">Belum ada sesi</option> : null}
                {sessions.map((sesi) => <option key={sesi.id} value={sesi.id}>{sesi.name}</option>)}
              </SelectField>

              {/* Pemilih jalur hanya muncul kalau acara ini memang punya jalur.
                  Acara satu meja tidak boleh dipaksa memahami konsep yang tidak
                  dipakainya — kolom berisi satu pilihan adalah pertanyaan yang
                  jawabannya sudah pasti. */}
              {lanes.length > 0 ? (
                <SelectField
                  label="Jalur / meja"
                  value={laneId ?? ""}
                  onChange={(event) => gantiJalur(Number(event.target.value) || null)}
                  error={laneId === null ? "Belum dipilih" : undefined}
                  className="min-w-0 flex-1 sm:max-w-xs"
                >
                  <option value="">Pilih meja…</option>
                  {lanes.map((jalur) => <option key={jalur.id} value={jalur.id}>{jalur.name}</option>)}
                </SelectField>
              ) : null}
              {/* `lg` = 56px, tinggi yang sama persis dengan kolom pilihan di
                  sebelahnya. Ukuran yang lebih kecil menggantung di atas garis
                  dasar kolom dan membuat barisnya terbaca miring. */}
              <IconButton label="Muat ulang daftar sesi" variant="outlined" size="lg" onClick={() => void muatSesi()}>
                <ArrowsClockwise size={22} />
              </IconButton>
            </div>
          </Card>

          {/* ---------------------------------------------------------------
              Panel kerja
              --------------------------------------------------------------- */}
          <div className="min-w-0 space-y-4">
            {/* Tab, bukan segmented button. Keduanya BERGANTI TAMPILAN, dan itu
                yang membedakan tab dari segmented button di spesifikasi M3 —
                segmented button menyaring isi yang sedang dilihat, tab
                menggantinya. Perbedaannya ikut terdengar: `tablist` mengumumkan
                panel yang dikendalikannya, `radiogroup` tidak. */}
            <Tabs<Mode>
              label="Cara mencatat kehadiran"
              idPrefix="mode"
              value={mode}
              onChange={gantiMode}
              options={[
                { value: "qr", label: "Pindai QR", icon: <QrCode size={20} aria-hidden /> },
                { value: "cari", label: "Cari nama", icon: <MagnifyingGlass size={20} aria-hidden /> },
              ]}
            />

            {pesan ? (
              <p role="alert" className="flex items-start gap-2 rounded-lg bg-error-soft p-3 text-body-medium text-on-error-soft">
                <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0" />
                {pesan}
              </p>
            ) : null}

            {/* Hasil berdiri PALING ATAS di panelnya dan selebar panel. Ia
                satu-satunya hal yang dibaca petugas, dan menaruhnya di bawah
                pratinjau kamera berarti ia tertutup jempol yang memegang ponsel.

                Wadah `aria-live` sengaja tidak ikut diganti oleh `key` di
                dalamnya: memasang ulang wadah live region membuat sebagian
                pembaca layar melewatkan pengumumannya. Yang dipasang ulang hanya
                isinya, dan itu yang memicu pengumuman sekaligus kedipan. */}
            <section aria-live="assertive" aria-atomic="true">
              {hasil && tampilan ? (
                <div key={kedip} className={`scan-flash rounded-2xl p-5 ${tampilan.kelas}`}>
                  <div className="flex items-center gap-3">
                    <tampilan.Icon size={40} weight="fill" className="shrink-0" />
                    <div className="min-w-0">
                      <p className="text-title-large">{tampilan.judul}</p>
                      <p className="truncate text-body-large">
                        {hasil.participant?.name ?? `Kode ${hasil.qr}`}
                      </p>
                    </div>
                  </div>

                  {hasil.participant?.company ? (
                    <p className="mt-2 truncate text-body-medium opacity-90">{hasil.participant.company}</p>
                  ) : null}

                  {hasil.status === "duplicate" ? (
                    <p className="mt-3 text-body-medium">
                      Pertama dipindai {jam(hasil.first_scan_at)} · pemindaian ke-{hasil.scan_count}. Tetap boleh masuk;
                      catatannya bertambah, jumlah hadir tidak.
                    </p>
                  ) : null}

                  {hasil.status === "not_found" ? (
                    <p className="mt-3 text-body-medium">
                      Kode ini bukan peserta acara ini, atau pendaftarannya sudah dibatalkan. Coba tab
                      “Cari nama / instansi” sebelum mengarahkan tamu ke meja panitia.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>

            {mode === "qr" ? (
              <div role="tabpanel" id="mode-panel-qr" aria-labelledby="mode-tab-qr" className="space-y-4">
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-scrim lg:aspect-video">
                  {scanning ? (
                    <>
                      <video
                        ref={videoRef}
                        className="h-full w-full object-cover"
                        autoPlay
                        muted
                        playsInline
                        aria-label="Pratinjau kamera pemindai"
                      />
                      {/* Bingkai bidik. QR yang dipegang di luar tengah bingkai
                          tetap terbaca, tetapi tamu mengarahkan badge-nya ke
                          tempat yang ditunjukkan layar — dan yang di tengah
                          adalah yang paling tajam di hampir semua lensa ponsel. */}
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 flex items-center justify-center"
                      >
                        <div className="h-[62%] max-h-64 min-h-32 aspect-square rounded-2xl border-2 border-on-primary/70" />
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-on-surface-variant">
                      <QrCode size={56} />
                      <p className="text-body-medium">Kamera mati</p>
                    </div>
                  )}
                </div>

                <Button
                  variant={scanning ? "outlined" : "filled"}
                  size="xl"
                  shape="pill"
                  block
                  onClick={() => setScanning((current) => !current)}
                  disabled={!sessionId}
                  icon={<QrCode size={24} weight="bold" aria-hidden />}
                >
                  {scanning ? "Matikan kamera" : "Nyalakan kamera"}
                </Button>

                {/* Jalur cadangan di dalam jalur cadangan. Kamera ponsel bisa
                    rusak, badge bisa terlipat, dan antrean tidak berhenti untuk
                    menunggu keduanya beres. */}
                <Card>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const kode = String(new FormData(form).get("qr") ?? "").trim();
                      if (kode) { void kirim(kode); form.reset(); }
                    }}
                  >
                    <div className="flex items-end gap-2">
                      <TextField
                        className="min-w-0 flex-1"
                        label="Atau ketik kode peserta"
                        name="qr"
                        autoComplete="off"
                        autoCapitalize="characters"
                        placeholder="mis. REG159425"
                        // Font mono lewat `style`, bukan kelas pada pembungkus:
                        // pembungkusnya juga memuat label, dan label berhuruf mono
                        // terbaca sebagai bagian dari kodenya.
                        style={{ fontFamily: "var(--font-mono), ui-monospace, monospace" }}
                      />
                      <Button type="submit" variant="tonal" size="lg" loading={sibuk} disabled={!sessionId}>
                        Catat
                      </Button>
                    </div>
                  </form>
                </Card>
              </div>
            ) : (
              <Card role="tabpanel" id="mode-panel-cari" aria-labelledby="mode-tab-cari" padded={false} className="p-4 sm:p-5">
                <TextField
                  label="Cari nama atau instansi"
                  type="search"
                  size="lg"
                  value={kueri}
                  onChange={(event) => setKueri(event.target.value)}
                  autoComplete="off"
                  placeholder="Hanung, Werkudara, REG159425…"
                  leading={<MagnifyingGlass size={20} />}
                  hint="Boleh sepenggal dan boleh dibolak-balik — “han sast” menemukan Hanung Sastriya, “han werk” menemukan Hanung yang dari Werkudara."
                />

                <div className="mt-4" aria-busy={mencari}>
                  {!cukupHuruf ? (
                    <p className="rounded-lg bg-surface-container px-4 py-8 text-center text-body-medium text-on-surface-variant">
                      Ketik minimal dua huruf untuk mulai mencari.
                    </p>
                  ) : mencari ? (
                    <SearchResultsSkeleton rows={3} />
                  ) : cariSekarang?.gagal ? (
                    <EmptyState
                      icon={<WarningCircle size={40} />}
                      title="Pencarian gagal"
                      description="Jaringan venue sedang tidak menjawab. Ubah satu huruf pada kata kuncinya untuk mengulang, atau pakai tab Pindai QR sementara."
                    />
                  ) : cariSekarang && cariSekarang.hasil.length === 0 ? (
                    <EmptyState
                      icon={<MagnifyingGlass size={40} />}
                      title="Tidak ada yang cocok"
                      description="Coba potongan nama yang lebih pendek, atau cari dengan nama instansinya. Kalau tetap kosong, tamu ini belum terdaftar — arahkan ke meja panitia."
                    />
                  ) : (
                    <>
                      {/* Wadah bernada, bukan kotak bergaris. M3 mendahulukan
                          elevasi tonal — naikkan tier `surface-container`
                          sebelum menambah garis atau bayangan. Garis disisakan
                          untuk tepi yang membawa arti, seperti kolom isian. */}
                      <ul className="divide-y divide-outline-variant overflow-hidden rounded-lg bg-surface-container">
                        {(cariSekarang?.hasil ?? []).map((baris) => {
                          const sudahHadir = baris.scan_count > 0;
                          return (
                            <li key={baris.id} className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                              <span
                                aria-hidden
                                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary-container text-label-large font-semibold text-on-secondary-container"
                              >
                                {inisial(baris.name)}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-body-large font-semibold">{baris.name}</p>
                                <p className="truncate text-body-small text-on-surface-variant">
                                  {[baris.company, baris.title].filter(Boolean).join(" · ") || baris.qr_code}
                                </p>
                                {/* Status dibawa ikon DAN teks, tidak hanya warna. */}
                                {sudahHadir ? (
                                  <p className="mt-1 flex items-center gap-1 text-label-medium text-warning">
                                    <Clock size={14} weight="fill" aria-hidden />
                                    Sudah hadir {jam(baris.first_scan_at)} · {baris.scan_count}×
                                  </p>
                                ) : null}
                              </div>
                              <Button
                                variant={sudahHadir ? "outlined" : "filled"}
                                size="sm"
                                onClick={() => void catatDariCari(baris)}
                                loading={mencatatId === baris.id}
                                disabled={!sessionId || (sibuk && mencatatId !== baris.id)}
                                icon={<UserCheck size={18} weight="bold" aria-hidden />}
                                className="shrink-0"
                              >
                                <span className="hidden sm:inline">{sudahHadir ? "Catat lagi" : "Catat hadir"}</span>
                                <span className="sr-only sm:hidden">
                                  {sudahHadir ? `Catat lagi ${baris.name}` : `Catat hadir ${baris.name}`}
                                </span>
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                      {/* Pemotongan diberitahukan, bukan didiamkan. Daftar yang
                          diam-diam dipotong terbaca sebagai "hanya ini yang ada",
                          dan petugas berhenti mencari orang yang sebenarnya
                          terdaftar. */}
                      {cariSekarang?.terpotong ? (
                        <p className="mt-3 text-body-small text-on-surface-variant">
                          Menampilkan 25 teratas. Persempit kata kuncinya — tambahkan nama depan atau nama instansi.
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* ---------------------------------------------------------------
              Panel pantau. `sticky` hanya dari lg ke atas — di ponsel ia berada
              di bawah panel kerja dan tidak ada yang perlu ditempelkan.
              --------------------------------------------------------------- */}
          <aside className="space-y-4 lg:sticky lg:top-[88px]">
            <Card>
              {/* HURUF BESAR SEMUA dan jarak huruf yang dilebarkan adalah gaya
                  "overline" milik Material 2. M3 menghapusnya: seluruh peran
                  label memakai sentence case, dan pembedanya ukuran serta warna,
                  bukan kapitalisasi. Huruf besar semua juga lebih lambat dibaca —
                  siluet katanya hilang — dan ini layar yang dilirik, bukan
                  dibaca. */}
              <p className="text-label-large text-on-surface-variant">
                {sesiAktif?.name ?? "Belum ada sesi"}
              </p>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="text-display-small tabular-nums">{hadir ?? "—"}</span>
                <span className="text-body-medium text-on-surface-variant">orang hadir</span>
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-body-small text-on-surface-variant">
                <UsersThree size={16} aria-hidden />
                Peserta unik. Pemindaian ulang menambah catatan, bukan angka ini.
              </p>
            </Card>

            {/* Pemasangan TV hanya muncul kalau jalurnya LEBIH DARI SATU.
                Kode enam angka menjawab "TV ini melayani meja yang mana", dan
                pertanyaan itu tidak ada ketika mejanya cuma satu — TV-nya
                langsung menyapa semua tamu yang masuk lewat meja itu. Meminta
                kode di sana berarti menyuruh panitia mengetik enam angka untuk
                memilih dari satu pilihan. */}
            {lanes.length > 1 ? (
              <Card>
                <h2 className="text-title-small text-on-surface">Layar sapa di meja ini</h2>
                <p className="mt-2 text-body-small text-on-surface-variant">
                  TV yang belum terpasang menampilkan enam angka. Ketik angkanya di sini, dan TV itu mulai menyapa
                  tamu {laneId ? "meja ini" : "meja yang dipilih di atas"} saja.
                </p>
                <form
                  className="mt-3 flex items-end gap-2"
                  onSubmit={(event) => { event.preventDefault(); void pasangLayar(kodeLayar); }}
                >
                  <TextField
                    className="min-w-0 flex-1"
                    label="Kode layar"
                    value={kodeLayar}
                    onChange={(event) => setKodeLayar(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    // `inputMode` numerik, bukan `type="number"`: kode ini bisa
                    // diawali nol, dan input angka membuang nol di depan pada
                    // sebagian peramban.
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000000"
                    style={{ fontFamily: "var(--font-mono), ui-monospace, monospace", letterSpacing: "0.2em" }}
                  />
                  <Button
                    type="submit"
                    variant="tonal"
                    size="lg"
                    loading={memasang}
                    disabled={kodeLayar.length !== 6 || !laneId}
                  >
                    Hubungkan
                  </Button>
                </form>
                {pesanLayar ? (
                  <p
                    role="status"
                    className={`mt-3 text-body-small ${pesanLayar.nada === "ok" ? "text-primary" : "text-error"}`}
                  >
                    {pesanLayar.teks}
                  </p>
                ) : null}
              </Card>
            ) : null}

            <Card>
              <h2 className="text-title-small text-on-surface">Pemindaian terakhir</h2>
              {riwayat.length === 0 ? (
                <p className="mt-3 text-body-medium text-on-surface-variant">
                  Belum ada yang dipindai di perangkat ini sejak layar dibuka.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-outline-variant">
                  {riwayat.map((baris, index) => (
                    <li key={`${baris.waktu}-${index}`} className="flex items-center justify-between gap-3 py-2 text-body-medium">
                      <span className="min-w-0 flex-1 truncate">{baris.nama}</span>
                      <span className={
                        baris.status === "recorded" ? "text-primary" : baris.status === "duplicate" ? "text-warning" : "text-error"
                      }>
                        {baris.status === "recorded" ? "hadir" : baris.status === "duplicate" ? "ulang" : "gagal"}
                      </span>
                      <span className="tabular-nums text-on-surface-variant">{jam(baris.waktu)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}
