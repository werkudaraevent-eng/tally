/**
 * Klik di pratinjau untuk menyunting (pola editor tema Shopify/Squarespace).
 *
 * Berjalan di DALAM iframe pratinjau. Saat kursor di atas bagian halaman,
 * bagian itu diberi garis dan nama barisnya di CMS; klik melapor ke CMS
 * bagian mana (dan kolom mana, bila elemennya bertanda `data-sunting`) yang
 * dipilih, lalu CMS membuka baris itu. Klik tidak dicegah: tab dan akordeon
 * di halaman tetap bekerja. Tautan ditahan oleh pratinjau-langsung.tsx (fase
 * capture), dan pilihan bahasa ID | EN tidak ikut memilih bagian.
 *
 * Sasaran, dari yang paling sempit:
 * - `data-sunting="bagian:kolom"`: satu kolom di baris itu (judul, tagline).
 * - `data-bagian="id"` atau elemen ber-id `blk_...`: satu baris Susunan halaman.
 *
 * Garisnya elemen sendiri di <body>, bukan gaya pada elemen halaman, supaya
 * tidak bentrok dengan garis "baris terbuka" yang dipasang CMS.
 */

export type LabelPilih = {
  /** Nama baris di CMS per id bagian, dan nama kolom per `bagian:kolom`. */
  label: Record<string, string>;
  /** Skala iframe di CMS: label digambar 12px di layar admin, bukan 12px halaman. */
  skala: number;
};

type Sasaran = { el: HTMLElement; bagian: string; kolom: string | null; nama: string };

const BIRU = "#2563eb";

export function pasangPilih(lapor: (pesan: object) => void) {
  let info: LabelPilih | null = null;
  let sekarang: HTMLElement | null = null;

  const garis = document.createElement("div");
  garis.setAttribute("aria-hidden", "true");
  garis.dataset.pilihGaris = "";
  Object.assign(garis.style, {
    position: "fixed",
    zIndex: "2147483646",
    pointerEvents: "none",
    border: `2px solid ${BIRU}`,
    borderRadius: "4px",
    display: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  // Label elemen sendiri, bukan anak garis: posisinya dijepit ke layar
  // pratinjau, bukan ke kotak yang bisa lebih tinggi atau lebar dari layar.
  const nama = document.createElement("span");
  nama.setAttribute("aria-hidden", "true");
  Object.assign(nama.style, {
    position: "fixed",
    zIndex: "2147483647",
    pointerEvents: "none",
    display: "none",
    background: BIRU,
    color: "#fff",
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: "600",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    borderRadius: "4px",
    boxSizing: "border-box",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.append(garis, nama);
  // Ukuran kotak berubah tanpa gerakan kursor (akordeon dibuka, draf
  // dirender ulang): ukur lagi (QA #108 L2).
  const amati = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => gambar());

  function cari(target: EventTarget | null): Sasaran | null {
    if (!info || !(target instanceof Element)) return null;
    // ID | EN berpindah bahasa, bukan memilih Top bar (QA #108 L4).
    if (target.closest("a[hreflang]")) return null;
    const kolomEl = target.closest<HTMLElement>("[data-sunting]");
    if (kolomEl) {
      const kunci = kolomEl.dataset.sunting ?? "";
      const [bagian, kolom] = kunci.split(":");
      if (bagian && info.label[bagian]) return { el: kolomEl, bagian, kolom: kolom || null, nama: info.label[kunci] ?? info.label[bagian] };
    }
    // Naik terus sampai bagian yang punya baris di CMS: blok ber-id ada di dalam
    // pembungkus tanpa data-bagian, dan sebaliknya.
    let el: HTMLElement | null = target.closest<HTMLElement>("[data-bagian], [id^='blk_']");
    while (el) {
      const id = el.dataset.bagian ?? el.id;
      if (info.label[id]) return { el, bagian: id, kolom: null, nama: info.label[id] };
      el = el.parentElement?.closest<HTMLElement>("[data-bagian], [id^='blk_']") ?? null;
    }
    return null;
  }

  function gambar() {
    if (!sekarang || !info || !sekarang.isConnected) {
      garis.style.display = "none";
      nama.style.display = "none";
      return;
    }
    const kotak = sekarang.getBoundingClientRect();
    // Satuan 4 px di layar admin, dibagi skala iframe (QA #108 L5).
    const u = 4 / info.skala;
    Object.assign(garis.style, {
      display: "block",
      left: `${kotak.left}px`,
      top: `${kotak.top}px`,
      width: `${kotak.width}px`,
      height: `${kotak.height}px`,
      borderWidth: `${Math.max(2, 2 / info.skala)}px`,
    });
    const lebarLayar = document.documentElement.clientWidth;
    const tinggiLabel = 5 * u;
    Object.assign(nama.style, {
      display: "block",
      fontSize: `${3 * u}px`,
      lineHeight: `${tinggiLabel}px`,
      height: `${tinggiLabel}px`,
      padding: `0 ${2 * u}px`,
      maxWidth: `${Math.max(0, lebarLayar - 2 * u)}px`,
    });
    // Di luar kotak, di atasnya, bila ada ruang; selain itu di tepi atas
    // bagian kotak yang terlihat, supaya label tidak pernah di luar layar (M1).
    const atasTerlihat = Math.max(kotak.top, 0);
    const top = kotak.top - tinggiLabel - u >= 0 ? kotak.top - tinggiLabel - u : Math.min(atasTerlihat + u, Math.max(0, window.innerHeight - tinggiLabel));
    // Dijepit ke lebar layar: di pratinjau ponsel label tidak terpotong (M2).
    const lebarLabel = nama.offsetWidth;
    const left = Math.min(Math.max(kotak.left, u), Math.max(u, lebarLayar - lebarLabel - u));
    nama.style.top = `${top}px`;
    nama.style.left = `${left}px`;
  }

  let kursor: { x: number; y: number } | null = null;

  function gerak(event: MouseEvent) {
    kursor = { x: event.clientX, y: event.clientY };
    arahkan(event.target);
  }

  function arahkan(target: EventTarget | null) {
    const sasaran = cari(target);
    if (sasaran?.el === sekarang) return;
    if (sekarang) amati?.unobserve(sekarang);
    sekarang = sasaran?.el ?? null;
    if (sekarang) amati?.observe(sekarang);
    nama.textContent = sasaran ? `${sasaran.nama} · Click to edit` : "";
    document.documentElement.style.cursor = sasaran ? "pointer" : "";
    gambar();
  }

  function keluar() {
    kursor = null;
    if (sekarang) amati?.unobserve(sekarang);
    sekarang = null;
    document.documentElement.style.cursor = "";
    gambar();
  }

  function klik(event: MouseEvent) {
    const sasaran = cari(event.target);
    if (sasaran) lapor({ jenis: "tally-pratinjau-pilih", bagian: sasaran.bagian, kolom: sasaran.kolom });
  }

  document.addEventListener("mousemove", gerak, { passive: true });
  document.documentElement.addEventListener("mouseleave", keluar);
  window.addEventListener("scroll", gambar, { passive: true });
  window.addEventListener("resize", gambar);
  document.addEventListener("click", klik, true);

  return {
    setInfo(baru: LabelPilih | null) {
      info = baru;
      if (!info) keluar();
    },
    /** Halaman dirender ulang: elemen lama bisa sudah diganti. */
    segarkan() {
      // Elemen di bawah kursor bisa sudah diganti: cari lagi dari posisi kursor.
      if (sekarang && !sekarang.isConnected) {
        const titik = kursor;
        amati?.unobserve(sekarang);
        sekarang = null;
        if (titik) arahkan(document.elementFromPoint(titik.x, titik.y));
        else keluar();
      } else gambar();
    },
    lepas() {
      document.removeEventListener("mousemove", gerak);
      document.documentElement.removeEventListener("mouseleave", keluar);
      window.removeEventListener("scroll", gambar);
      window.removeEventListener("resize", gambar);
      document.removeEventListener("click", klik, true);
      document.documentElement.style.cursor = "";
      amati?.disconnect();
      garis.remove();
      nama.remove();
    },
  };
}
