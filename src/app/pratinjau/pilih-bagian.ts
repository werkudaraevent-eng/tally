/**
 * Klik di pratinjau untuk menyunting (pola editor tema Shopify/Squarespace).
 *
 * Berjalan di DALAM iframe pratinjau. Saat kursor di atas bagian halaman,
 * bagian itu diberi garis dan nama barisnya di CMS; klik melapor ke CMS
 * bagian mana (dan kolom mana, bila elemennya bertanda `data-sunting`) yang
 * dipilih, lalu CMS membuka baris itu. Klik tidak dicegah: tab dan akordeon
 * di halaman tetap bekerja, dan tautan sudah ditahan oleh pratinjau.
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
  const nama = document.createElement("span");
  Object.assign(nama.style, {
    position: "absolute",
    left: "-2px",
    background: BIRU,
    color: "#fff",
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: "600",
    whiteSpace: "nowrap",
    borderRadius: "4px",
  } satisfies Partial<CSSStyleDeclaration>);
  garis.appendChild(nama);
  document.body.appendChild(garis);

  function cari(target: EventTarget | null): Sasaran | null {
    if (!info || !(target instanceof Element)) return null;
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
      return;
    }
    const kotak = sekarang.getBoundingClientRect();
    const huruf = 12 / info.skala;
    Object.assign(garis.style, {
      display: "block",
      left: `${kotak.left}px`,
      top: `${kotak.top}px`,
      width: `${kotak.width}px`,
      height: `${kotak.height}px`,
      borderWidth: `${Math.max(2, 2 / info.skala)}px`,
    });
    Object.assign(nama.style, {
      fontSize: `${huruf}px`,
      lineHeight: `${huruf * 1.6}px`,
      padding: `0 ${huruf * 0.6}px`,
      // Di dalam kotak bila kotaknya menempel di tepi atas layar.
      top: kotak.top < huruf * 1.8 ? "0px" : `-${huruf * 1.6 + 2}px`,
    });
  }

  function gerak(event: MouseEvent) {
    const sasaran = cari(event.target);
    if (sasaran?.el === sekarang) return;
    sekarang = sasaran?.el ?? null;
    nama.textContent = sasaran ? `${sasaran.nama} · Click to edit` : "";
    document.documentElement.style.cursor = sasaran ? "pointer" : "";
    gambar();
  }

  function keluar() {
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
      if (sekarang && !sekarang.isConnected) keluar();
      else gambar();
    },
    lepas() {
      document.removeEventListener("mousemove", gerak);
      document.documentElement.removeEventListener("mouseleave", keluar);
      window.removeEventListener("scroll", gambar);
      window.removeEventListener("resize", gambar);
      document.removeEventListener("click", klik, true);
      document.documentElement.style.cursor = "";
      garis.remove();
    },
  };
}
