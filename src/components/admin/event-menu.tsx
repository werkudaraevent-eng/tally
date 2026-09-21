"use client";

import { CaretUpDown, Check, ListDashes, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Popover, POPOVER_ITEM, usePopoverAnchor } from "@/components/m3";
import { cariHalaman } from "@/components/admin/nav-config";
import { EventStatusBadge, URUTAN_STATUS } from "@/components/admin/event-status";
import type { EventStatus } from "@/lib/domain";

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

/**
 * Urutan yang SAMA dengan daftar acara: aktif dulu, lalu draft, selesai, arsip.
 *
 * Sebelumnya menu ini memakai urutan apa adanya dari API dan lencana buatannya
 * sendiri, sementara halaman Acara memakai urutan status dan teks berwarna. Dua
 * daftar acara yang sama dengan dua urutan berbeda, dibuka oleh orang yang sama
 * dalam satu menit.
 */
function peringkat(status: string) {
  const posisi = URUTAN_STATUS.indexOf(status as EventStatus);
  return posisi === -1 ? URUTAN_STATUS.length : posisi;
}

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
  const [pemicu, setPemicu] = useState<HTMLElement | null>(null);
  const menu = usePopoverAnchor(pemicu, onOpenChange);
  const open = menu.open;
  const [kueri, setKueri] = useState("");
  const [sorot, setSorot] = useState(0);
  const kolom = useRef<HTMLInputElement | null>(null);
  const menuId = useId();
  const pathname = usePathname();
  const router = useRouter();

  const aktif = events.find((event) => event.slug === activeSlug);
  const label = aktif?.name ?? "Semua event";

  const hasil = useMemo(() => {
    const cari = kueri.trim().toLowerCase();
    const cocok = cari ? events.filter((event) => event.name.toLowerCase().includes(cari)) : events;
    return [...cocok].sort((a, b) => peringkat(a.status) - peringkat(b.status) || a.name.localeCompare(b.name, "id"));
  }, [events, kueri]);

  /**
   * Kueri dan sorot direset di sini, di penanganan peristiwanya, bukan di dalam
   * efek yang mengamati `open`. Efek yang memanggil `setState` di badannya
   * memicu satu render tambahan pada setiap pembukaan, dan React 19 menandainya
   * sebagai kesalahan. Yang tahu menu baru saja dibuka adalah yang membukanya.
   */
  function ubahTerbuka(nilai: boolean) {
    if (nilai) {
      setKueri("");
      setSorot(0);
      menu.buka();
      return;
    }
    menu.tutup();
  }

  function ubahKueri(nilai: string) {
    setKueri(nilai);
    // Sorot kembali ke atas setiap kali daftarnya berubah. Tanpa itu, mengetik
    // huruf keempat bisa meninggalkan sorot di indeks yang sudah tidak ada dan
    // Enter tidak memilih apa pun.
    setSorot(0);
  }

  // Klik di luar dan Esc ditangani `Popover`. Yang tersisa di sini hanya fokus:
  // panelnya baru terpasang satu frame sebelumnya, jadi kolom carinya belum ada
  // di dokumen saat efek ini pertama jalan.
  useEffect(() => {
    if (!open) return;
    const fokus = requestAnimationFrame(() => kolom.current?.focus());
    return () => cancelAnimationFrame(fokus);
  }, [open]);

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
      menu.tutup();
      menu.fokus();
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
    <div className="relative min-w-0 flex-1">
      <button
        ref={setPemicu}
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

      {/* Portal. Panel ini 300px sementara relnya 260px, jadi selama ia `absolute`
          di dalam rel, satu-satunya yang mencegahnya terpotong adalah janji bahwa
          tidak ada leluhurnya yang memakai `overflow: hidden` — janji yang sudah
          sekali dilanggar dan harus dicatat di dua tempat. */}
      {open ? (
          <Popover
            anchor={menu}
            id={menuId}
            role="dialog"
            label="Pilih acara"
            align="start"
            width={300}
            className="p-0"
            onKeyDown={onKeyDown}
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
                      {/* Lencana yang SAMA dengan daftar acara. Kata lepas abu di
                          ujung baris terbaca sebagai bagian nama acara yang
                          terpotong, dan "Marugame Banquet completed" bukan nama
                          acara siapa pun. */}
                      {event.status !== "active" ? <EventStatusBadge status={event.status as EventStatus} className="shrink-0" /> : null}
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
                  className={POPOVER_ITEM}
                >
                  <Plus size={16} className="shrink-0 text-on-surface-variant" />
                  Buat event baru
                </Link>
              ) : null}
              <Link
                href="/events"
                className={POPOVER_ITEM}
              >
                <ListDashes size={16} className="shrink-0 text-on-surface-variant" />
                Semua event
              </Link>
            </div>
          </Popover>
      ) : null}
    </div>
  );
}
