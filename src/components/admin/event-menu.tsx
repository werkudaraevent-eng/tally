"use client";

import { CaretUpDown, Check, ListDashes, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MENU_MOTION } from "@/lib/m3/menu-motion";
import { cariHalaman } from "@/components/admin/nav-config";

/**
 * Pengalih acara di puncak sidebar.
 *
 * Ia menjawab "saya sedang mengerjakan acara yang mana", dan pertanyaan itu
 * milik navigasi, bukan bilah atas. Sebelumnya ia remah roti di bilah; bilah itu
 * sekarang tidak lagi berbicara tentang halaman sama sekali.
 *
 * ---- Kenapa ada kolom cari di dalamnya ------------------------------------
 *
 * Daftar acara tumbuh satu baris per acara dan tidak pernah menyusut: acara yang
 * selesai tetap dibuka berbulan kemudian untuk laporan. Menu tanpa pencarian
 * baik-baik saja pada tiga acara dan gagal pada tiga puluh, dan yang membukanya
 * saat itu sedang berdiri di venue.
 *
 * ---- Kenapa baris acara `<button>`, bukan `<Link>` ------------------------
 *
 * Papan ketik harus bisa memilih dengan Enter dari kolom cari, sementara fokus
 * tidak pernah pindah ke barisnya. Enter di kolom teks tidak mengaktifkan tautan
 * yang kebetulan tersorot, jadi perpindahannya dikerjakan router. Yang hilang
 * adalah klik-kanan "buka di tab baru", dan di pengalih workspace itu bukan
 * gerakan yang dipakai orang. Dua aksi di kakinya tetap `<Link>`: keduanya
 * tujuan biasa yang memang pantas dibuka di tab baru.
 */

export type EventPilihan = { slug: string; name: string; status: string };

/** Status acara dalam bahasa yang dipakai panitia, bukan nilai kolom database. */
const LABEL_STATUS: Record<string, string> = {
  draft: "Draft",
  completed: "Selesai",
  archived: "Arsip",
};

export function EventMenu({
  events,
  activeSlug,
  isOwner = false,
  onOpenChange,
}: {
  events: EventPilihan[];
  activeSlug: string | null;
  /** Hanya pemilik sistem yang boleh membuat acara, jadi hanya ia yang melihat aksinya. */
  isOwner?: boolean;
  /**
   * Diberitahukan ke rangka saat panel dibuka atau ditutup.
   *
   * Rel yang tidak disematkan menutup dirinya sendiri begitu kursor keluar, dan
   * panel ini membuat kursor MEMANG keluar dari rel — ia lebih lebar daripada
   * relnya. Tanpa kabar ini, membuka pemilih acara dari rel sempit berarti
   * menutup relnya sendiri tepat pada kedipan berikutnya.
   */
  onOpenChange?: (terbuka: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kueri, setKueri] = useState("");
  const [sorot, setSorot] = useState(0);
  const wadah = useRef<HTMLDivElement | null>(null);
  const tombol = useRef<HTMLButtonElement | null>(null);
  const kolom = useRef<HTMLInputElement | null>(null);
  const menuId = useId();
  const pathname = usePathname();
  const router = useRouter();

  const aktif = events.find((event) => event.slug === activeSlug);
  const label = aktif?.name ?? "Semua event";

  const hasil = useMemo(() => {
    const cari = kueri.trim().toLowerCase();
    return cari ? events.filter((event) => event.name.toLowerCase().includes(cari)) : events;
  }, [events, kueri]);

  /**
   * Kueri dan sorot direset di sini, di penanganan peristiwanya, bukan di dalam
   * efek yang mengamati `open`. Efek yang memanggil `setState` di badannya
   * memicu satu render tambahan pada setiap pembukaan, dan React 19 menandainya
   * sebagai kesalahan. Yang tahu menu baru saja dibuka adalah yang membukanya.
   */
  function ubahTerbuka(nilai: boolean) {
    setOpen(nilai);
    onOpenChange?.(nilai);
    if (nilai) {
      setKueri("");
      setSorot(0);
    }
  }

  function ubahKueri(nilai: string) {
    setKueri(nilai);
    // Sorot kembali ke atas setiap kali daftarnya berubah. Tanpa itu, mengetik
    // huruf keempat bisa meninggalkan sorot di indeks yang sudah tidak ada dan
    // Enter tidak memilih apa pun.
    setSorot(0);
  }

  useEffect(() => {
    if (!open) return;
    // Fokus ditunda satu frame: panelnya baru saja dipasang oleh AnimatePresence
    // dan elemennya belum ada di dokumen saat efek ini jalan.
    const fokus = requestAnimationFrame(() => kolom.current?.focus());
    const onPointer = (event: PointerEvent) => {
      if (wadah.current?.contains(event.target as Node)) return;
      // `setOpen` + kabar, bukan `ubahTerbuka`: fungsi itu lahir baru pada setiap
      // render, dan memasukkannya ke daftar dependensi memasang ulang pendengar
      // dokumen setiap kali satu huruf diketik di kolom cari.
      setOpen(false);
      onOpenChange?.(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => {
      cancelAnimationFrame(fokus);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, onOpenChange]);

  /**
   * Alamat acara lain untuk halaman yang SEDANG dibuka.
   *
   * Admin yang membandingkan rundown dua acara ingin mendarat di rundown, bukan
   * mengulang navigasi dari awal. Yang tidak dikenali tabel menu dikembalikan ke
   * Dashboard: alamat lepas seperti `/admin/audit` sudah menjadi pengalihan, dan
   * membawanya ke acara lain hanya memantulkan orang ke tempat ketiga.
   */
  function tujuan(slug: string) {
    const tanpaPrefiks = pathname.replace(/^\/e\/[^/]+/, "") || "/admin";
    const dikenali = cariHalaman(tanpaPrefiks);
    return `/e/${slug}${dikenali ? tanpaPrefiks : "/admin"}`;
  }

  function pilih(event: EventPilihan) {
    ubahTerbuka(false);
    router.push(tujuan(event.slug));
  }

  function onKeyDown(peristiwa: React.KeyboardEvent) {
    if (peristiwa.key === "Escape") {
      peristiwa.stopPropagation();
      ubahTerbuka(false);
      tombol.current?.focus();
      return;
    }
    if (peristiwa.key === "ArrowDown" || peristiwa.key === "ArrowUp") {
      peristiwa.preventDefault();
      if (hasil.length === 0) return;
      const arah = peristiwa.key === "ArrowDown" ? 1 : -1;
      setSorot((indeks) => (indeks + arah + hasil.length) % hasil.length);
      return;
    }
    if (peristiwa.key === "Enter" && hasil[sorot]) {
      peristiwa.preventDefault();
      pilih(hasil[sorot]);
    }
  }

  return (
    /**
     * `min-w-0` DAN `flex-1`, keduanya, dan keduanya wajib.
     *
     * `min-w-0` mematikan ukuran minimum otomatis anak flex, yang bawaannya
     * selebar konten dan membuat `truncate` tidak pernah berlaku. `flex-1`
     * menetapkan basis 0, sehingga lebarnya DIHITUNG dari ruang yang tersisa,
     * bukan dinegosiasikan turun dari lebar teks. Tanpa yang kedua, nama acara
     * sepanjang "ILO ASEAN Regional Meeting" menyusut persis sampai kehabisan
     * ruang lalu berhenti — dan chevron-nya berakhir menempel di garis tepi rel.
     */
    <div ref={wadah} className="relative min-w-0 flex-1">
      <button
        ref={tombol}
        type="button"
        onClick={() => ubahTerbuka(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        // Nama lengkapnya di `title`, karena nama yang terpotong adalah nama yang
        // tidak bisa dibaca, dan dua acara bisa berbagi dua puluh huruf pertama.
        title={label}
        // Latar transparan saat diam. Pemicu ini duduk di kepala sidebar, dan
        // bidang abu permanen di sana membuatnya terbaca sebagai kolom isian yang
        // menunggu diketik. Abunya muncul hanya saat disentuh atau terbuka.
        className={`flex w-full min-w-0 items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-body-medium font-medium text-on-surface transition-colors duration-150 hover:bg-[var(--press-hover)] ${
          open ? "bg-[var(--press-hover)]" : ""
        }`}
      >
        <span className="m3-nav-label min-w-0 flex-1 truncate text-left">{label}</span>
        <CaretUpDown size={14} className="ml-auto shrink-0 text-on-surface-variant" />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={menuId}
            role="dialog"
            aria-label="Pilih acara"
            onKeyDown={onKeyDown}
            className="absolute left-0 top-[calc(100%+6px)] z-50 w-[300px] origin-top-left overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-level2"
            {...MENU_MOTION}
          >
            {/* Kolom cari tanpa garis sendiri. Kotak di dalam kotak, keduanya
                bergaris, menghasilkan dua bingkai berjarak 8px yang saling
                mengulang. Pemisahnya satu garis bawah, seperti kepala tabel. */}
            <div className="flex items-center gap-2 border-b border-outline-variant px-3">
              <MagnifyingGlass size={16} className="shrink-0 text-on-surface-variant" />
              <input
                ref={kolom}
                value={kueri}
                onChange={(peristiwa) => ubahKueri(peristiwa.target.value)}
                placeholder="Cari event..."
                aria-label="Cari event"
                className="m3-search-field ed-plain min-w-0 flex-1 border-0 bg-transparent py-2.5 text-body-medium shadow-none outline-none placeholder:text-on-surface-variant"
              />
            </div>

            <div className="max-h-[320px] overflow-y-auto p-1.5">
              {hasil.length === 0 ? (
                <p className="px-2.5 py-3 text-body-medium text-on-surface-variant">
                  {events.length === 0 ? "Tidak ada acara yang bisa dibuka." : "Event tidak ditemukan"}
                </p>
              ) : (
                hasil.map((event, indeks) => {
                  const terpilih = event.slug === activeSlug;
                  const status = LABEL_STATUS[event.status];
                  return (
                    <button
                      key={event.slug}
                      type="button"
                      onClick={() => pilih(event)}
                      onPointerMove={() => setSorot(indeks)}
                      aria-current={terpilih ? "true" : undefined}
                      className={`flex w-full min-h-8 items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-body-medium ${
                        terpilih ? "bg-[var(--press-hover)] font-medium" : ""
                      } ${indeks === sorot && !terpilih ? "bg-[var(--press-hover)]" : ""}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{event.name}</span>
                      {/* Status jadi pil bergaris, bukan kata lepas abu. Kata lepas
                          di ujung baris terbaca sebagai bagian nama acara yang
                          terpotong, dan "Marugame Banquet completed" bukan nama
                          acara siapa pun. */}
                      {status ? (
                        <span className="shrink-0 rounded-full border border-outline-variant px-1.5 py-px text-label-small font-normal text-on-surface-variant">
                          {status}
                        </span>
                      ) : null}
                      {terpilih ? <Check size={14} weight="bold" className="shrink-0" /> : null}
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t border-outline-variant p-1.5">
              {isOwner ? (
                <Link
                  href="/events?buat=1"
                  className="flex min-h-8 items-center gap-2 rounded-sm px-2.5 py-1.5 text-body-medium hover:bg-[var(--press-hover)]"
                >
                  <Plus size={16} className="shrink-0 text-on-surface-variant" />
                  Buat event baru
                </Link>
              ) : null}
              <Link
                href="/events"
                className="flex min-h-8 items-center gap-2 rounded-sm px-2.5 py-1.5 text-body-medium hover:bg-[var(--press-hover)]"
              >
                <ListDashes size={16} className="shrink-0 text-on-surface-variant" />
                Semua event
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
