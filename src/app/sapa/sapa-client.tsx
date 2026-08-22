"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrandFooter, BrandHeader } from "@/components/brand-header-footer";
import { fontStack, scaleClamp } from "@/lib/branding";
import { eventApiPath } from "@/lib/event-url";
import type { Greeting, GreetingConfig, Lane, Pairing } from "@/lib/greeting-config";

/**
 * Layar sapa.
 *
 * ---- Satu nama besar, bukan daftar yang bergulir ----------------------------
 *
 * Layar ini dilihat sekilas oleh orang yang sedang berjalan masuk sambil
 * membawa tas. Yang dicarinya satu hal: namanya sendiri. Daftar yang bergulir
 * memaksa memindai beberapa baris untuk mengetahui apakah namanya ada di sana,
 * dan pada saat ia menemukannya ia sudah melewati layarnya.
 *
 * ---- Kenapa muat pertama TIDAK menyapa siapa pun ---------------------------
 *
 * Layar ini kadang dibuka ulang di tengah acara — kabel HDMI tersenggol, TV
 * mati sendiri, panitia menyegarkan halaman. Kalau muat pertama menyapa
 * pemindaian terakhir yang ada di database, layar akan menyambut orang yang
 * masuk empat puluh menit lalu, di depan orang itu sendiri yang sudah duduk.
 *
 * ---- Lima meja, lima layar -------------------------------------------------
 *
 * Acara besar membuka beberapa jalur registrasi berdampingan. Setiap TV harus
 * menyapa HANYA tamu yang dipindai di mejanya; menampilkan seluruh acara
 * berarti lima layar memajang nama yang sama, termasuk nama orang yang sedang
 * berdiri enam meter jauhnya.
 *
 * Cara layar mengetahui mejanya mengikuti pola perangkat lunak digital signage:
 * layar yang belum punya meja menampilkan kode enam angka, dan petugas di meja
 * itu mengklaimnya dari /scan. Kepemilikan kode — dibuktikan dengan berdiri di
 * depan layarnya — itulah izinnya. Tidak ada alamat panjang yang harus diketik
 * dengan remote TV, dan menukar susunan meja cukup dengan mengklaim ulang.
 *
 * Token perangkat disimpan di localStorage, jadi TV yang dimuat ulang tetap
 * terpasang di mejanya.
 */

/**
 * 2 detik, sama dengan reveal papan peringkat.
 *
 * Ini jeda antara petugas menekan pindai dan nama muncul di layar. Lebih lambat
 * dari itu, tamu sudah berjalan melewati layarnya; lebih cepat, dan permintaan
 * ke server bertambah tanpa ada yang bisa melihat bedanya.
 */
const POLL_MS = 2000;

/**
 * Batas antrean sapaan.
 *
 * Layar yang sempat terputus jaringan lalu tersambung lagi menerima seluruh
 * pemindaian yang terlewat sekaligus. Tanpa batas, ia akan menghabiskan dua
 * menit berikutnya menyapa orang yang sudah lama duduk — dan tamu yang BARU
 * masuk mengantre di belakang mereka. Yang terbaru selalu menang.
 */
const ANTREAN_MAKS = 8;

const KUNCI_PERANGKAT = "sapa-device-token";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const jam = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

export default function SapaClient({
  config: configAwal,
  orientationLocked,
  jalur,
}: {
  config: GreetingConfig;
  /** Orientasi datang dari `?orientasi=` dan tidak boleh ditimpa polling. */
  orientationLocked: boolean;
  /** Slug jalur dari `?jalur=`, atau "semua". Null berarti pakai pemasangan kode. */
  jalur: string | null;
}) {
  const [config, setConfig] = useState(configAwal);
  const [recent, setRecent] = useState<Greeting[]>([]);
  const [current, setCurrent] = useState<Greeting | null>(null);
  const [lane, setLane] = useState<Lane | null>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [laneUnknown, setLaneUnknown] = useState(false);

  const antreanRef = useRef<Greeting[]>([]);
  const currentRef = useRef<Greeting | null>(null);
  /** Id pemindaian tertinggi yang sudah diketahui. Null = belum pernah memuat. */
  const terakhirRef = useRef<number | null>(null);
  const perangkatRef = useRef<string | null>(null);

  /**
   * Token perangkat, dibuat sekali lalu disimpan di localStorage.
   *
   * Dibaca malas dari dalam fetch, BUKAN sebagai nilai awal state: komponen ini
   * dirender lebih dulu di server, dan nilai awal yang membaca localStorage akan
   * berbeda antara server dan browser sehingga React membuang hasil render
   * pertamanya.
   *
   * localStorage bisa melempar (mode penyamaran, penyimpanan penuh). Kalau itu
   * terjadi, token tetap dibuat tetapi hanya bertahan selama halaman terbuka —
   * layar masih bisa dipasang, hanya perlu dipasang ulang setelah dimuat ulang.
   * Itu jauh lebih baik daripada layar yang menolak menyala sama sekali.
   */
  const perangkat = useCallback(() => {
    if (perangkatRef.current) return perangkatRef.current;
    let token: string | null = null;
    try {
      const tersimpan = window.localStorage.getItem(KUNCI_PERANGKAT);
      if (tersimpan && UUID.test(tersimpan)) token = tersimpan;
    } catch { /* penyimpanan tidak tersedia */ }
    if (!token) {
      token = crypto.randomUUID();
      try { window.localStorage.setItem(KUNCI_PERANGKAT, token); } catch { /* biarkan sesi ini saja */ }
    }
    perangkatRef.current = token;
    return token;
  }, []);

  /**
   * Ambil satu dari antrean, atau kosongkan bidang tengah.
   *
   * `currentRef` diperbarui di sini juga, bukan lewat efek terpisah: fungsi ini
   * dipanggil dari dalam callback fetch, dan di sana state React masih bernilai
   * lama. Tanpa ref, sapaan kedua yang datang di detik yang sama akan mengira
   * bidang tengah masih kosong lalu menimpa yang baru saja tampil.
   */
  const maju = useCallback(() => {
    const berikutnya = antreanRef.current.shift() ?? null;
    currentRef.current = berikutnya;
    setCurrent(berikutnya);
  }, []);

  const muat = useCallback(async () => {
    const params = new URLSearchParams();
    if (jalur) params.set("jalur", jalur);
    else params.set("device", perangkat());

    const response = await fetch(eventApiPath(`/api/sapa?${params}`), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const body = await response.json().catch(() => null);
    if (!body?.config) return;

    const berikutnya = body.config as GreetingConfig;
    // Konfigurasi ikut disegarkan supaya perubahan di CMS mendarat tanpa ada
    // yang perlu memuat ulang layar yang sudah tergantung di dinding.
    setConfig((sekarang) =>
      orientationLocked ? { ...berikutnya, orientation: sekarang.orientation } : berikutnya,
    );
    setLane((body.lane ?? null) as Lane | null);
    setPairing((body.pairing ?? null) as Pairing | null);
    setLaneUnknown(Boolean(body.laneUnknown));

    const daftar = (body.greetings ?? []) as Greeting[];
    setRecent(daftar);

    const tertinggi = daftar.reduce((maks, sapaan) => Math.max(maks, sapaan.id), 0);
    if (terakhirRef.current === null) {
      terakhirRef.current = tertinggi;
      return;
    }

    const baru = daftar
      .filter((sapaan) => sapaan.id > terakhirRef.current!)
      // Menaik: orang yang lebih dulu dipindai lebih dulu disapa. Payload datang
      // menurun karena deretan "baru saja masuk" membacanya begitu.
      .sort((a, b) => a.id - b.id);
    if (baru.length === 0) return;

    terakhirRef.current = tertinggi;
    antreanRef.current = [...antreanRef.current, ...baru].slice(-ANTREAN_MAKS);
    if (currentRef.current === null) maju();
  }, [jalur, maju, orientationLocked, perangkat]);

  useEffect(() => {
    const awal = window.setTimeout(() => void muat(), 0);
    const timer = window.setInterval(() => void muat(), POLL_MS);
    return () => { window.clearTimeout(awal); window.clearInterval(timer); };
  }, [muat]);

  // Bidang tengah bertahan `hold_seconds`, lalu maju. `maju()` dipanggil dari
  // dalam callback timer, bukan dari badan efek — badan efek yang memanggil
  // setState memicu render berantai.
  useEffect(() => {
    if (current === null) return;
    const timer = window.setTimeout(() => maju(), Math.max(3, config.hold_seconds) * 1000);
    return () => window.clearTimeout(timer);
  }, [current, config.hold_seconds, maju]);

  const potret = config.orientation === "portrait";
  const huruf = fontStack(config.heading_font);
  const namaUkuran = scaleClamp(
    potret ? "clamp(36px, 9.5vmin, 190px)" : "clamp(40px, 11vmin, 200px)",
    config.title_scale,
  );

  return (
    <main
      className="relative flex h-dvh w-full flex-col overflow-hidden"
      style={{ background: config.background_color, color: config.text_color, fontFamily: huruf }}
    >
      {/* Gambar latar sebagai lapisan tersendiri, bukan `background-image` pada
          <main>: dengan begitu opasitasnya bisa diturunkan tanpa ikut memudarkan
          teks di atasnya. */}
      {config.background_image_url ? (
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${config.background_image_url})`, opacity: 0.35 }}
        />
      ) : null}

      {/* Nama meja di pojok, kecil dan redup.
          Bukan hiasan: saat lima TV berdiri berjajar di lobi, ini satu-satunya
          cara panitia memastikan layar ketiga memang melayani meja ketiga —
          tanpa harus memindai satu tamu untuk mencari tahu. */}
      {lane ? (
        <p
          className="absolute right-[3vmin] top-[3vmin] z-10 rounded-full px-[2vmin] py-[0.8vmin] font-semibold opacity-45"
          style={{ fontSize: "clamp(11px, 1.6vmin, 24px)", background: `color-mix(in srgb, ${config.text_color} 10%, transparent)` }}
        >
          {lane.name}
        </p>
      ) : null}

      <div className="relative flex h-full w-full flex-col">
        <BrandHeader
          branding={config}
          title={config.headline}
          subtitle={null}
          textColor={config.text_color}
          accentColor={config.accent_color}
          variant="led"
          className="px-[4vmin] pt-[4vmin]"
        />

        {/* Bidang tengah. `min-h-0` supaya ia yang menyusut ketika deretan di
            bawahnya tumbuh, bukan sebaliknya — tanpa itu flexbox membiarkan isi
            terdorong keluar layar dan di TV tidak ada batang gulir untuk
            mengambilnya kembali. */}
        <section
          className="flex min-h-0 flex-1 flex-col items-center justify-center px-[6vmin] text-center"
          aria-live="polite"
          aria-atomic="true"
        >
          {pairing ? (
            <div className="w-full">
              <p className="font-semibold opacity-60" style={{ fontSize: "clamp(14px, 2.6vmin, 44px)" }}>
                Kode pemasangan layar
              </p>
              {/* Angkanya diberi jarak huruf lebar dan `tabular-nums`: kode ini
                  dibaca dari seberang meja lalu diketik di ponsel, dan digit yang
                  rapat lebih sering salah salin daripada salah baca. */}
              <p
                className="mt-[2vmin] font-bold tabular-nums"
                style={{
                  fontSize: scaleClamp("clamp(48px, 16vmin, 260px)", config.title_scale),
                  letterSpacing: "0.14em",
                  color: config.accent_color,
                  lineHeight: 1.05,
                }}
              >
                {pairing.code}
              </p>
              <p
                className="mx-auto mt-[3vmin] max-w-[46ch] text-balance opacity-70"
                style={{ fontSize: "clamp(13px, 2.3vmin, 38px)" }}
              >
                Di ponsel petugas meja ini: buka layar pemindai, pilih jalurnya, lalu tekan{" "}
                <b>Hubungkan layar</b> dan masukkan angka di atas.
              </p>
              <p className="mt-[1.6vmin] opacity-40" style={{ fontSize: "clamp(11px, 1.7vmin, 26px)" }}>
                Kode berganti sendiri setiap 15 menit.
              </p>
            </div>
          ) : current ? (
            <div key={current.id} className="greet-in w-full">
              <p
                className="font-bold leading-[1.05] text-balance"
                style={{ fontSize: namaUkuran, color: config.title_color ?? config.text_color }}
              >
                {current.name}
              </p>

              {/* Garis aksen sebagai penanda kedua di samping ukuran huruf. Ia
                  yang membedakan "ada yang baru saja masuk" dari "layar sedang
                  menampilkan pesan diam" ketika dilihat dari jauh, sebelum satu
                  pun huruf terbaca. */}
              <span
                aria-hidden
                className="mx-auto mt-[2.4vmin] block h-[0.7vmin] w-[18vmin] rounded-full"
                style={{ background: config.accent_color }}
              />

              {current.company ? (
                <p
                  className="mt-[2.4vmin] font-semibold opacity-80"
                  style={{
                    fontSize: scaleClamp("clamp(16px, 3.4vmin, 64px)", config.subtitle_scale),
                    color: config.subtitle_color ?? config.text_color,
                  }}
                >
                  {current.company}
                </p>
              ) : null}
            </div>
          ) : (
            <p
              className="text-balance font-semibold opacity-55"
              style={{ fontSize: scaleClamp("clamp(18px, 4vmin, 72px)", config.subtitle_scale) }}
            >
              {config.idle_message}
            </p>
          )}
        </section>

        {config.show_recent && !pairing && recent.length > 0 ? (
          <section className="shrink-0 px-[4vmin] pb-[2vmin]" aria-label="Baru saja masuk">
            <p
              className="mb-[1.4vmin] font-semibold opacity-50"
              style={{ fontSize: "clamp(11px, 1.7vmin, 28px)", letterSpacing: "0.08em" }}
            >
              Baru saja masuk
            </p>
            <ul
              className={
                potret
                  ? "flex flex-col gap-[1vmin]"
                  : "flex flex-wrap items-center justify-center gap-[1.4vmin]"
              }
            >
              {recent.map((sapaan) => (
                <li
                  key={sapaan.id}
                  className={
                    potret
                      ? "flex items-baseline justify-between gap-[2vmin] rounded-full px-[2.4vmin] py-[1.1vmin]"
                      : "rounded-full px-[2.4vmin] py-[1.1vmin]"
                  }
                  // Latar dari warna teks pada opasitas rendah, bukan warna
                  // tetap: ia harus tetap terbaca baik di layar berlatar gelap
                  // maupun terang, dan kedua-duanya dipilih dari CMS.
                  style={{ background: `color-mix(in srgb, ${config.text_color} 12%, transparent)` }}
                >
                  <span className="font-semibold" style={{ fontSize: "clamp(12px, 2.1vmin, 34px)" }}>
                    {sapaan.name}
                  </span>
                  {potret ? (
                    <span className="tabular-nums opacity-60" style={{ fontSize: "clamp(11px, 1.7vmin, 26px)" }}>
                      {jam(sapaan.scanned_at)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Alamat yang salah ketik diberi tahu, bukan didiamkan. Layar yang
            jatuh ke "semua jalur" karena satu huruf tetap tampil benar, dan
            tidak ada satu pun tanda bahwa ia menyapa meja yang salah. */}
        {laneUnknown ? (
          <p
            className="shrink-0 px-[4vmin] pb-[1vmin] text-center font-semibold opacity-60"
            style={{ fontSize: "clamp(11px, 1.6vmin, 24px)", color: config.accent_color }}
          >
            Jalur di alamat layar ini tidak dikenal — sementara menampilkan semua meja.
          </p>
        ) : null}

        <BrandFooter branding={config} textColor={config.text_color} variant="led" className="px-[4vmin] pb-[3vmin]" />
      </div>
    </main>
  );
}
