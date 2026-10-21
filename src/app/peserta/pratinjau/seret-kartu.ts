/**
 * Seret kartu langsung di pratinjau Beranda (Participant area, keputusan Mas
 * 20 Okt, arah 1). Berjalan di dalam iframe pratinjau; urutan barunya
 * dihitung di layar admin (lib/member/susunan-horizon.ts), sama dengan seret
 * di daftar Participant home, lalu pratinjau dirender ulang dari draf.
 *
 * - Arahkan ke kartu: garis biru dan label "Drag to move · Click to find its
 *   row" (kartu bertempat tetap: "Fixed place").
 * - Klik kartu: barisnya disorot di daftar.
 * - Seret (tetikus atau pena, mulai setelah 6 px): kartu meredup, label
 *   kartunya ikut penunjuk, dan garis biru menandai tempat jatuhnya. Lepas
 *   mengirim `tally-beranda-pindah`; Escape membatalkan.
 *
 * Layar sentuh tidak menyeret di sini (mengganggu gulir); daftar di samping
 * dan tombol panah di pegangannya tetap bisa dipakai. Lapisannya tidak
 * mengubah kartu (pointer-events: none), dan ukurannya dibagi skala
 * pratinjau supaya terbaca sama besar di layar admin. Garis dan label jatuh
 * dihitung dengan aturan yang sama dengan daftar (aturan-horizon.ts), jadi
 * selalu menunjuk tempat kartu itu benar-benar mendarat.
 */

import { letakkanHorizon } from "@/lib/member/aturan-horizon";

export type SetelanSeret = {
  /** Seret menyala (pratinjau ponsel, Gathering Horizon). Mati: hanya klik untuk mencari baris. */
  aktif: boolean;
  /** Kartu yang bisa diseret. */
  gerak: string[];
  /** Semua kartu Participant home, dalam urutan tampil. */
  kartu: string[];
  /** Urutan Participant home lengkap (dengan Roommates dan Help card), untuk menghitung tempat jatuh. */
  urutan: string[];
  /** Judul baris tiap kartu di daftar Participant home. */
  label: Record<string, string>;
  /** Skala bingkai pratinjau di layar admin. */
  skala: number;
};

const BIRU = "#2563eb";
const AMBANG = 6;

/** Elemen pertama yang benar-benar tampil di dalam penanda `data-beranda` (display: contents). */
export function kotakTampil(penanda: Element): HTMLElement | null {
  for (const anak of penanda.querySelectorAll<HTMLElement>("*")) {
    const kotak = anak.getBoundingClientRect();
    if (kotak.width > 0 && kotak.height > 0) return anak;
  }
  return null;
}

function lapisan(gaya: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, { position: "absolute", pointerEvents: "none", zIndex: "2147483000", display: "none", boxSizing: "border-box" }, gaya);
  document.body.appendChild(el);
  return el;
}

/** Pasang seret dan klik di pratinjau. `setelan()` dibaca tiap kali, jadi setelan baru langsung berlaku. Mengembalikan pembersih. */
export function pasangSeret(setelan: () => SetelanSeret | null, lapor: (pesan: object) => void): () => void {
  const garisKartu = lapisan({ borderRadius: "22px" });
  const tag = lapisan({ background: BIRU, color: "#ffffff", fontFamily: "Inter, system-ui, sans-serif", fontWeight: "600", whiteSpace: "nowrap" });
  const garisJatuh = lapisan({ background: BIRU, borderRadius: "999px" });
  const labelJatuh = lapisan({ background: BIRU, color: "#ffffff", fontFamily: "Inter, system-ui, sans-serif", fontWeight: "600", whiteSpace: "nowrap" });
  const hantu = lapisan({ background: "#ffffff", color: "#111111", fontFamily: "Inter, system-ui, sans-serif", fontWeight: "600", whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,0.18)" });

  let mulai: { id: string; x: number; y: number; kotak: HTMLElement } | null = null;
  let seret: { id: string; kotak: HTMLElement; sebelum: string | null } | null = null;
  let telanKlik = false;

  const ukur = (px: number) => `${px / Math.max(0.2, setelan()?.skala ?? 1)}px`;

  /** Kartu di bawah penunjuk: penanda terdalam yang id-nya kartu Participant home. */
  function kartuDi(target: EventTarget | null): { id: string; kotak: HTMLElement } | null {
    const s = setelan();
    if (!s || !(target instanceof Element)) return null;
    let penanda = target.closest<HTMLElement>("[data-beranda]");
    while (penanda) {
      const id = penanda.dataset.beranda ?? "";
      if (s.kartu.includes(id)) {
        const kotak = kotakTampil(penanda);
        return kotak ? { id, kotak } : null;
      }
      penanda = penanda.parentElement?.closest<HTMLElement>("[data-beranda]") ?? null;
    }
    return null;
  }

  function letakkan(el: HTMLElement, kotak: DOMRect) {
    Object.assign(el.style, { display: "block", left: `${kotak.left + window.scrollX}px`, top: `${kotak.top + window.scrollY}px`, width: `${kotak.width}px`, height: `${kotak.height}px` });
  }

  function tulisTag(el: HTMLElement, teks: string, kiri: number, atas: number) {
    Object.assign(el.style, { display: "block", left: `${kiri}px`, top: `${atas}px`, fontSize: ukur(12), lineHeight: ukur(16), padding: `${ukur(3)} ${ukur(8)}`, borderRadius: ukur(4) });
    el.textContent = teks;
  }

  function sembunyikan(...el: HTMLElement[]) {
    for (const item of el) item.style.display = "none";
  }

  function sorotArah(target: EventTarget | null) {
    const s = setelan();
    const kartu = kartuDi(target);
    if (!s || !kartu) {
      sembunyikan(garisKartu, tag);
      document.documentElement.style.cursor = "";
      return;
    }
    const kotak = kartu.kotak.getBoundingClientRect();
    letakkan(garisKartu, kotak);
    garisKartu.style.border = `${ukur(2)} solid ${BIRU}`;
    const bisaSeret = s.aktif && s.gerak.includes(kartu.id);
    const judul = s.label[kartu.id] ?? kartu.id;
    tulisTag(tag, `${judul} · ${bisaSeret ? "Drag to move · Click to find its row" : s.gerak.includes(kartu.id) ? "Click to find its row" : "Fixed place · Click to find its row"}`, kotak.left + window.scrollX, kotak.top + window.scrollY - parseFloat(ukur(24)));
    document.documentElement.style.cursor = bisaSeret ? "grab" : "";
  }

  /**
   * Tempat jatuh: sebelum kartu pertama yang tengahnya di bawah penunjuk (null
   * = paling bawah), dirapikan dengan aturan tempat tetap. Garis dan label
   * mengikuti tetangga kartu itu di urutan hasilnya, bukan celah di bawah
   * penunjuk, jadi celah di atas Next up atau di bawah Help card tidak menipu.
   */
  function hitungJatuh(y: number) {
    const s = setelan();
    if (!s || !seret) return;
    const tampil = new Map(
      s.kartu
        .filter((id) => id !== seret!.id)
        .flatMap((id) => {
          const penanda = document.querySelector(`[data-beranda="${CSS.escape(id)}"]`);
          const kotak = penanda ? kotakTampil(penanda) : null;
          return kotak ? [[id, kotak.getBoundingClientRect()] as const] : [];
        }),
    );
    const kartu = [...tampil.entries()].sort((a, b) => a[1].top - b[1].top);
    if (kartu.length === 0) return;
    const indeks = kartu.findIndex(([, kotak]) => kotak.top + kotak.height / 2 > y);
    seret.sebelum = indeks < 0 ? null : kartu[indeks][0];
    const hasil = letakkanHorizon(s.urutan, seret.id, seret.sebelum);
    const posisi = hasil.indexOf(seret.id);
    const sebelumnya = hasil.slice(0, posisi).reverse().find((id) => tampil.has(id)) ?? null;
    const sesudahnya = hasil.slice(posisi + 1).find((id) => tampil.has(id)) ?? null;
    const atas = sebelumnya ? tampil.get(sebelumnya)! : null;
    const bawah = sesudahnya ? tampil.get(sesudahnya)! : null;
    const acuan = (bawah ?? atas)!;
    const yGaris = atas && bawah ? (atas.bottom + bawah.top) / 2 : bawah ? bawah.top - 12 : acuan.bottom + 12;
    const tebal = parseFloat(ukur(2));
    Object.assign(garisJatuh.style, { display: "block", left: `${acuan.left + window.scrollX}px`, top: `${yGaris + window.scrollY - tebal / 2}px`, width: `${acuan.width}px`, height: `${tebal}px` });
    tulisTag(labelJatuh, sebelumnya ? `Drop here: after ${s.label[sebelumnya] ?? sebelumnya}` : "Drop here: at the top", acuan.left + window.scrollX, yGaris + window.scrollY + tebal);
  }

  function selesai(kirim: boolean) {
    if (seret) {
      seret.kotak.style.removeProperty("opacity");
      if (kirim) lapor({ jenis: "tally-beranda-pindah", id: seret.id, sebelum: seret.sebelum });
      telanKlik = true;
      window.setTimeout(() => { telanKlik = false; }, 0);
    }
    seret = null;
    mulai = null;
    document.documentElement.style.removeProperty("user-select");
    document.documentElement.style.cursor = "";
    sembunyikan(garisJatuh, labelJatuh, hantu);
  }

  function tekan(event: PointerEvent) {
    const s = setelan();
    if (!s?.aktif || event.button !== 0 || event.pointerType === "touch") return;
    const kartu = kartuDi(event.target);
    if (!kartu || !s.gerak.includes(kartu.id)) return;
    mulai = { id: kartu.id, x: event.clientX, y: event.clientY, kotak: kartu.kotak };
  }

  function gerakPenunjuk(event: PointerEvent) {
    if (!mulai) { if (event.pointerType !== "touch") sorotArah(event.target); return; }
    if (!seret) {
      if (Math.hypot(event.clientX - mulai.x, event.clientY - mulai.y) < AMBANG) return;
      seret = { id: mulai.id, kotak: mulai.kotak, sebelum: null };
      seret.kotak.style.opacity = "0.5";
      document.documentElement.style.userSelect = "none";
      document.documentElement.style.cursor = "grabbing";
      sembunyikan(garisKartu, tag);
    }
    event.preventDefault();
    tulisTag(hantu, setelan()?.label[seret.id] ?? seret.id, event.clientX + window.scrollX + 12, event.clientY + window.scrollY + 12);
    hantu.style.padding = `${ukur(10)} ${ukur(14)}`;
    hantu.style.borderRadius = ukur(12);
    hantu.style.border = `${ukur(2)} solid ${BIRU}`;
    hitungJatuh(event.clientY);
    // Gulir sendiri saat penunjuk di tepi atas atau bawah bingkai.
    const tepi = 48;
    if (event.clientY < tepi) window.scrollBy(0, -16);
    else if (event.clientY > window.innerHeight - tepi) window.scrollBy(0, 16);
  }

  function lepas() {
    if (seret) selesai(true);
    else mulai = null;
  }

  function klik(event: MouseEvent) {
    if (telanKlik) { event.preventDefault(); event.stopPropagation(); telanKlik = false; return; }
    const kartu = kartuDi(event.target);
    if (kartu) lapor({ jenis: "tally-beranda-pilih", id: kartu.id });
  }

  function tombol(event: KeyboardEvent) {
    if (event.key === "Escape" && seret) selesai(false);
  }

  function keluar() {
    if (seret) return;
    sembunyikan(garisKartu, tag);
    document.documentElement.style.cursor = "";
  }

  // Tautan dan gambar di kartu bisa diseret peramban sendiri (mulai sekitar 4 px,
  // lalu pointercancel), jadi seret bawaan ditahan selama kartu sedang dipegang.
  function tahanSeretAsli(event: DragEvent) {
    if (mulai || seret) event.preventDefault();
  }

  const batal = () => selesai(false);
  const gulir = () => { if (!seret) sembunyikan(garisKartu, tag); };
  window.addEventListener("pointerdown", tekan, true);
  window.addEventListener("pointermove", gerakPenunjuk, true);
  window.addEventListener("pointerup", lepas, true);
  window.addEventListener("pointercancel", batal, true);
  window.addEventListener("click", klik, true);
  window.addEventListener("keydown", tombol, true);
  window.addEventListener("scroll", gulir, { passive: true });
  window.addEventListener("dragstart", tahanSeretAsli, true);
  document.documentElement.addEventListener("pointerleave", keluar);
  return () => {
    selesai(false);
    window.removeEventListener("pointerdown", tekan, true);
    window.removeEventListener("pointermove", gerakPenunjuk, true);
    window.removeEventListener("pointerup", lepas, true);
    window.removeEventListener("pointercancel", batal, true);
    window.removeEventListener("click", klik, true);
    window.removeEventListener("keydown", tombol, true);
    window.removeEventListener("scroll", gulir);
    window.removeEventListener("dragstart", tahanSeretAsli, true);
    document.documentElement.removeEventListener("pointerleave", keluar);
    for (const el of [garisKartu, tag, garisJatuh, labelJatuh, hantu]) el.remove();
  };
}
