"use client";

import { CaretDown, CaretRight, ClockCounterClockwise, PushPin, PushPinSlash } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useId } from "react";
import { hrefAktif, navigation, type NavItem } from "@/components/admin/nav-config";
import type { Recent } from "@/components/admin/sidebar-store";

/**
 * Daftar menu ruang kerja. SATU pohon, dipakai pada dua lebar.
 *
 * Sebelumnya rel ikon dan rel lebar adalah dua pohon React yang berbeda, dipilih
 * dengan `if (collapsed)`. Itu cukup selama lipatannya permanen. Begitu rel bisa
 * melebar hanya karena kursor lewat, harganya muncul: setiap kali melebar,
 * seluruh daftar dipasang ulang — posisi gulirnya kembali ke atas dan akordeon
 * yang terbuka berkedip tutup lalu buka. Rel yang "melebar" seharusnya tidak
 * kehilangan apa pun.
 *
 * Jadi yang berubah hanya lebar wadahnya. Label, chevron, dan sub-menu
 * disembunyikan oleh CSS lewat `[data-rail="1"]` pada `<aside>`; aturannya ada
 * di globals.css, di bab "Rel: satu pohon, dua lebar".
 */

/* ---- Gaya bersama -------------------------------------------------------- */

/**
 * Warna hover/aktif diambil dari token `--press-*`, bukan dari lapisan status
 * `m3-state`.
 *
 * Lapisan status M3 menumpuk `currentColor` pada opasitas kecil, jadi warnanya
 * ikut berubah setiap kali warna teks item berubah, dan nilainya tidak pernah
 * persis abu yang diminta. Di rel navigasi yang tinggi dan padat, dua abu yang
 * hampir sama tetapi tidak sama terbaca sebagai daftar yang kotor.
 */
const HOVER = "hover:bg-[var(--press-hover)]";
const AKTIF = "bg-[var(--press-active)] font-medium";

const ITEM_DASAR = "m3-nav-item flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-body-medium text-on-surface transition-colors duration-150";

/* ---- Satu tujuan --------------------------------------------------------- */

function ItemMenu({
  item, href, active, onNavigate, sub = false,
}: {
  item: NavItem; href: string; active: boolean; onNavigate: () => void; sub?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      // `title` selalu diisi, bukan hanya saat terpotong. Mengukur apakah sebuah
      // teks benar-benar terpotong berarti membaca `scrollWidth` setiap kali rel
      // berubah lebar, dan jawabannya tidak pernah berbeda dari "nama lengkapnya
      // ini" — yang justru satu-satunya hal yang berguna di tooltip.
      title={item.label}
      className={`${ITEM_DASAR} ${sub ? "min-h-8" : ""} ${active ? AKTIF : HOVER}`}
    >
      {/* Sub-item tanpa ikon. Ikon yang sama diulang di induk dan tiga anaknya
          tidak membedakan apa pun; yang membedakan mereka adalah indentasi dan
          garis tegak di kiri. */}
      {sub ? null : <Icon size={18} className="shrink-0 text-on-surface-variant" />}
      <span className="m3-nav-label min-w-0 flex-1 truncate text-left">{item.label}</span>
    </Link>
  );
}

/* ---- Tujuan yang punya sub-halaman --------------------------------------- */

function ItemLipat({
  item, eventPrefix, path, terbuka, onToggle, onNavigate,
}: {
  item: NavItem; eventPrefix: string; path: string;
  terbuka: boolean; onToggle: () => void; onNavigate: () => void;
}) {
  const Icon = item.icon;
  const daftarId = useId();
  const aktif = hrefAktif(item.href, path);

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={terbuka}
        aria-controls={daftarId}
        title={item.label}
        className={`${ITEM_DASAR} ${aktif ? AKTIF : HOVER}`}
      >
        <Icon size={18} className="shrink-0 text-on-surface-variant" />
        <span className="m3-nav-label min-w-0 flex-1 truncate text-left">{item.label}</span>
        {/* Satu ikon yang berputar, bukan dua ikon yang bertukar. Yang berputar
            memperlihatkan bahwa keduanya kontrol yang sama dalam dua keadaan;
            yang bertukar terbaca sebagai dua tombol berbeda yang kebetulan
            menempati tempat yang sama. */}
        <CaretRight
          size={14}
          className={`m3-nav-chev shrink-0 text-on-surface-variant transition-transform duration-150 ease-standard ${terbuka ? "rotate-90" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {terbuka ? (
          <motion.div
            id={daftarId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
            className="m3-nav-sub overflow-hidden"
          >
            {/* Garis tegak di kiri daftar anak, bukan garis putus per baris: ia
                menggambar satu batang yang menyatakan "semua ini milik yang di
                atas", dan panjangnya sendiri menunjukkan sampai mana kelompoknya
                berakhir. */}
            <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-outline-variant pl-2">
              {(item.children ?? []).map((anak) => (
                <li key={anak.href}>
                  <ItemMenu
                    item={anak}
                    sub
                    href={`${eventPrefix}${anak.href}`}
                    // Padanan PERSIS untuk anak, bukan berprefiks. Anak pertama
                    // ber-href sama dengan induknya, jadi `startsWith` akan
                    // menyorot "Setelan tampilan" ketika yang dibuka justru
                    // "Pengecualian".
                    active={path === anak.href}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/* ---- Terakhir dibuka ----------------------------------------------------- */

function BarisRecent({
  item, eventPrefix, onNavigate, onTogglePin,
}: {
  item: Recent; eventPrefix: string; onNavigate: () => void; onTogglePin: (path: string) => void;
}) {
  return (
    <div className={`group relative flex items-center rounded-lg ${HOVER}`}>
      <Link
        href={`${eventPrefix}${item.path}`}
        onClick={onNavigate}
        title={item.label}
        className="min-w-0 flex-1 py-1 pl-2.5 pr-8"
      >
        <span className="block truncate text-body-medium text-on-surface">{item.label}</span>
        <span className="block truncate text-label-medium text-on-surface-variant">{item.konteks}</span>
      </Link>
      {/* Pin muncul saat disentuh, tetapi yang SUDAH dipin tampil terus: kalau ia
          ikut menghilang, tidak ada cara mengetahui kenapa satu baris itu tidak
          pernah bergeser dari puncak daftar. */}
      <button
        type="button"
        onClick={() => onTogglePin(item.path)}
        aria-label={item.pinned ? `Lepas pin ${item.label}` : `Pin ${item.label}`}
        aria-pressed={item.pinned ?? false}
        className={`absolute right-1 flex size-7 items-center justify-center rounded-sm text-on-surface-variant transition-opacity hover:bg-[var(--press-active)] ${
          item.pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        }`}
      >
        {item.pinned ? <PushPinSlash size={14} /> : <PushPin size={14} />}
      </button>
    </div>
  );
}

/* ---- Daftar lengkap ------------------------------------------------------ */

export function SidebarNav({
  eventPrefix, path, isOwner, onNavigate,
  grupTerbuka, onToggleGrup, recentsTerbuka, onToggleRecents, recents, onTogglePin,
}: {
  eventPrefix: string;
  /** Path tanpa prefiks `/e/<slug>`. */
  path: string;
  isOwner: boolean;
  onNavigate: () => void;
  grupTerbuka: ReadonlySet<string>;
  onToggleGrup: (href: string) => void;
  recentsTerbuka: boolean;
  onToggleRecents: () => void;
  recents: Recent[];
  onTogglePin: (path: string) => void;
}) {
  // Kelompok yang seluruh isinya tersembunyi ikut dibuang. Tanpa itu, tajuknya
  // menggantung di atas ruang kosong bagi admin yang bukan pemilik sistem.
  const terlihat = navigation
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.ownerOnly || isOwner) }))
    .filter((group) => group.items.length > 0);

  const recentsId = useId();

  return (
    <>
      {terlihat.map((group, indeks) => (
        <div key={group.section ?? "utama"} className={indeks === 0 ? "" : "mt-4 short:mt-2"}>
          {/* Tajuk kelompok TANPA garis pemisah.
              Garis pernah ada di sini, dan alasannya masuk akal saat itu: tajuk
              berwarna sama dengan label item yang tidak aktif, jadi mata
              membacanya sebagai "menu berhuruf kecil". Yang memperbaikinya
              ternyata bukan garis, melainkan menurunkan tajuk ke abu tersier dan
              memberi jarak di atasnya. Lima garis di satu rel setinggi layar
              membuat sidebar terbaca sebagai formulir, bukan daftar tujuan.
              Di rel sempit, tajuk ini BERUBAH menjadi garis pendek lewat CSS. */}
          {group.section ? (
            <h2 className="m3-nav-section truncate px-2.5 pb-1 pt-1 text-title-small text-[var(--press-ink-faint)]">
              {group.section}
            </h2>
          ) : null}
          <ul className="space-y-0.5" aria-label={group.section ?? undefined}>
            {group.items.map((item) => (
              <li key={item.href}>
                {item.children ? (
                  <ItemLipat
                    item={item}
                    eventPrefix={eventPrefix}
                    path={path}
                    terbuka={grupTerbuka.has(item.href)}
                    onToggle={() => onToggleGrup(item.href)}
                    onNavigate={onNavigate}
                  />
                ) : (
                  <ItemMenu
                    item={item}
                    href={`${eventPrefix}${item.href}`}
                    active={hrefAktif(item.href, path)}
                    onNavigate={onNavigate}
                  />
                )}
              </li>
            ))}
            {/* Recents duduk di kelompok pertama, tepat di bawah Dashboard:
                keduanya menjawab "ke mana saya sekarang", bukan "acara ini punya
                fitur apa". Tertutup secara bawaan, karena isinya berulang dengan
                menu di bawahnya dan yang membukanya tahu apa yang dicarinya. */}
            {indeks === 0 ? (
              <li>
                <button
                  type="button"
                  onClick={onToggleRecents}
                  aria-expanded={recentsTerbuka}
                  aria-controls={recentsId}
                  title="Terakhir dibuka"
                  className={`${ITEM_DASAR} ${HOVER}`}
                >
                  <ClockCounterClockwise size={18} className="shrink-0 text-on-surface-variant" />
                  <span className="m3-nav-label min-w-0 flex-1 truncate text-left">Terakhir dibuka</span>
                  <CaretDown
                    size={14}
                    className={`m3-nav-chev shrink-0 text-on-surface-variant transition-transform duration-150 ease-standard ${recentsTerbuka ? "" : "-rotate-90"}`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {recentsTerbuka ? (
                    <motion.div
                      id={recentsId}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
                      className="m3-nav-sub overflow-hidden"
                    >
                      <div className="ml-4 mt-0.5 space-y-0.5 border-l border-outline-variant pl-2">
                        {recents.length === 0 ? (
                          <p className="px-2.5 py-1.5 text-label-medium text-on-surface-variant">
                            Belum ada halaman yang dibuka
                          </p>
                        ) : (
                          recents.map((item) => (
                            <BarisRecent
                              key={item.path}
                              item={item}
                              eventPrefix={eventPrefix}
                              onNavigate={onNavigate}
                              onTogglePin={onTogglePin}
                            />
                          ))
                        )}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </li>
            ) : null}
          </ul>
        </div>
      ))}
    </>
  );
}
