"use client";

import { CaretDown, CaretRight, Check } from "@phosphor-icons/react";
import { useId, useState, type ReactNode } from "react";
import { SegmentedButton, Switch } from "@/components/m3";
import { Popover, usePopoverAnchor } from "@/components/m3/popover";
import { cx } from "@/lib/m3/cx";
import {
  LANDING_BODY_FONTS,
  LANDING_FONT_CATEGORIES,
  LANDING_HEADING_FONTS,
  LANDING_LAYOUT_LABELS,
  type EventLandingConfig,
  type LandingCorners,
  type LandingHeadingFont,
  type LandingLayout,
} from "@/lib/domain";
import { FORUM_DEFAULTS, GATHERING_ACCENT_DEFAULT, landingTokens } from "@/lib/landing-tokens";
import { LANDING_THEME_PRESETS } from "@/lib/landing-theme-presets";
import { PresetTema } from "./theme-presets";

/**
 * Tab Theme halaman acara. Tiga lapis, dari atas ke bawah:
 *
 *   1. Preset: titik awal bernama (layout + warna + huruf + fitur), dipratinjau dulu.
 *   2. Gaya (token): Colour, Fonts, Corners. Berlaku di layout apa pun.
 *   3. Layout: struktur halaman. Warna dan huruf tidak berubah saat pindah.
 *
 * Grupnya dilipat, satu terbuka sekali waktu (pola theme settings Shopify),
 * supaya panel tertutup muat di layar 1280x588 tanpa empat kali gulir. Tiap
 * baris grup yang tertutup membawa ringkasan nilainya.
 *
 * Nilai yang ditampilkan selalu token yang berlaku (landingTokens), bukan isi
 * mentah config: config kosong tetap menunjukkan Playfair untuk Editorial,
 * Source Sans 3 untuk Modern, dan seterusnya.
 */

type Grup = "warna" | "huruf" | "sudut" | "layout" | "halaman";

const LAYOUTS = ["editorial", "modern", "forum"] as const;

const SUDUT_LABEL: Record<LandingCorners, string> = { square: "Square", soft: "Soft", round: "Round" };

const LAYOUT_NOTE: Record<LandingLayout, string> = {
  editorial: "One page, section headings in a left rail",
  modern: "One page, full-width photo hero",
  forum: "Three pages with a menu",
};

type PilihWarnaProps = { label: string; value: string; onChange: (value: string) => void };

export function TabTema({
  landing,
  setLanding,
  nama,
  contohIsi,
  pratinjau,
  onPratinjau,
  formInherit,
  setFormInherit,
  formSeed,
  setFormSeed,
  PilihWarna,
  halaman,
  ringkasHalaman,
}: {
  landing: EventLandingConfig;
  setLanding: (next: EventLandingConfig) => void;
  /** Nama acara, untuk contoh di pemilih huruf. */
  nama: string;
  /** Contoh huruf isi: tagline acara, atau kalimat contoh. */
  contohIsi: string;
  pratinjau: string | null;
  onPratinjau: (key: string | null) => void;
  formInherit: boolean;
  setFormInherit: (value: boolean) => void;
  formSeed: string;
  setFormSeed: (value: string) => void;
  PilihWarna: (props: PilihWarnaProps) => ReactNode;
  /** Isi grup Page: yang tayang di /e/<slug> dan bahasa. */
  halaman: ReactNode;
  ringkasHalaman: string;
}) {
  const [buka, setBuka] = useState<Grup | null>(null);
  const tokens = landingTokens(landing);
  const forum = tokens.layout === "forum";
  const gathering = tokens.layout === "modern" && landing.gathering === true;
  const presetDilihat = LANDING_THEME_PRESETS.find((preset) => preset.key === pratinjau) ?? null;
  const lipat = (grup: Grup) => ({ buka: buka === grup, onToggle: () => setBuka(buka === grup ? null : grup) });

  function pilihLayout(value: LandingLayout) {
    // Huruf judul yang belum pernah dipilih ikut disimpan saat pindah layout,
    // supaya area peserta (yang membaca `heading_font`) memakai huruf yang sama
    // dengan halaman acara.
    setLanding({
      ...landing,
      layout: value,
      heading_font: landing.heading_font ?? (value === "modern" ? "source" : value === "forum" ? "ubuntu" : undefined),
    });
  }

  // Pola radiogroup WAI-ARIA: panah memilih opsi berikutnya yang aktif dan memindah fokus ke sana.
  function panahLayout(event: React.KeyboardEvent<HTMLDivElement>) {
    const arah = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!arah) return;
    event.preventDefault();
    const aktif = LAYOUTS.filter((value) => !(gathering && value !== "modern"));
    const berikut = aktif[(aktif.indexOf(tokens.layout) + arah + aktif.length) % aktif.length];
    if (berikut !== tokens.layout) pilihLayout(berikut);
    // Fokus pindah setelah render: tabIndex 0 baru ada di opsi yang baru dipilih.
    const grup = event.currentTarget;
    requestAnimationFrame(() => grup.querySelector<HTMLElement>(`[data-layout="${berikut}"]`)?.focus());
  }

  return (
    <div className="flex flex-col gap-5">
      <PresetTema landing={landing} setLanding={setLanding} pratinjau={pratinjau} onPratinjau={onPratinjau} />

      {/* Selama pratinjau preset, kontrol di bawah dikunci: nilai yang tampil
          di sini bukan nilai yang sedang dipratinjau, dan mengubahnya diam-diam
          membatalkan pratinjau. */}
      <div className={cx("flex flex-col", presetDilihat && "pointer-events-none opacity-50")} inert={presetDilihat ? true : undefined}>
        <Lipat
          judul="Colour"
          {...lipat("warna")}
          ringkas={
            <>
              <Bulat warna={tokens.brand} />
              {tokens.accent ? <Bulat warna={tokens.accent} /> : null}
              {gathering && landing.button_color ? <Bulat warna={landing.button_color} /> : null}
              {tokens.secondary ? <Bulat warna={tokens.secondary} /> : null}
            </>
          }
        >
          <PilihWarna label="Brand colour" value={tokens.brand} onChange={(value) => setLanding({ ...landing, theme: { seed: value } })} />
          {forum ? (
            <>
              <PilihWarna label="Accent colour" value={tokens.accent ?? FORUM_DEFAULTS.accent} onChange={(value) => setLanding({ ...landing, forum: { ...landing.forum, accent: value } })} />
              <p className="-mt-2 text-body-small text-on-surface-variant">The registration button in the hero, the badge line and the read-more button.</p>
              <PilihWarna label="Secondary colour" value={tokens.secondary ?? FORUM_DEFAULTS.secondary} onChange={(value) => setLanding({ ...landing, forum: { ...landing.forum, secondary: value } })} />
              <p className="-mt-2 text-body-small text-on-surface-variant">Forum only. The sign-in button while registration is closed, and the agenda panel (lightened).</p>
            </>
          ) : gathering ? (
            <>
              <PilihWarna label="Accent colour" value={tokens.accent ?? GATHERING_ACCENT_DEFAULT} onChange={(value) => setLanding({ ...landing, accent: value })} />
              <p className="-mt-2 text-body-small text-on-surface-variant">The highlighted word in the title, the event date and day numbers.</p>
              <PilihWarna label="Button colour" value={landing.button_color ?? tokens.accent ?? GATHERING_ACCENT_DEFAULT} onChange={(value) => setLanding({ ...landing, button_color: value })} />
              <p className="-mt-2 text-body-small text-on-surface-variant">Main buttons, section labels, active tabs and icons in the participant area. Darkened automatically where it sits on white.</p>
            </>
          ) : null}
          <p className="text-body-small text-on-surface-variant">Other shades are derived from these, and text on them is picked so it stays readable.</p>
          {/* Saklar warna formulir tinggal DI SINI, bukan di CMS Registrasi.
              Warna acara punya satu sumber; kontrol yang tersebar di dua layar
              akan berbeda isinya dan tidak ada yang tahu mana yang menang. */}
          <Switch
            checked={!formInherit}
            onChange={(value) => setFormInherit(!value)}
            label="Different colour for the registration form"
            description={formInherit
              ? "The registration page uses the brand colour above, so visitors stay in one visual identity."
              : "The registration page uses its own colour. Two colours in two taps in a row feel like moving to another site."}
          />
          {!formInherit ? <PilihWarna label="Form colour" value={formSeed} onChange={setFormSeed} /> : null}
        </Lipat>

        <Lipat
          judul="Fonts"
          {...lipat("huruf")}
          ringkas={
            <span className="truncate">
              <span style={{ fontFamily: LANDING_HEADING_FONTS[tokens.headingFont].cssVar }}>{LANDING_HEADING_FONTS[tokens.headingFont].label}</span>
              {" · "}
              {LANDING_HEADING_FONTS[tokens.bodyFont].label}
            </span>
          }
        >
          <PilihHuruf
            label="Heading font"
            hint="The event name and section headings."
            value={tokens.headingFont}
            pilihan={Object.keys(LANDING_HEADING_FONTS) as LandingHeadingFont[]}
            contoh={nama}
            onChange={(heading_font) => setLanding({ ...landing, heading_font })}
          />
          <PilihHuruf
            label="Body font"
            hint="Paragraphs, buttons and labels. Only fonts that stay readable at 14–16 px."
            value={tokens.bodyFont}
            pilihan={[...LANDING_BODY_FONTS]}
            contoh={contohIsi}
            onChange={(body_font) => setLanding({ ...landing, body_font: body_font as (typeof LANDING_BODY_FONTS)[number] })}
          />
        </Lipat>

        {/* Forum memakai sudut rancangan IFC sendiri, jadi grupnya tidak ada. */}
        {!forum ? (
          <Lipat judul="Corners" {...lipat("sudut")} ringkas={SUDUT_LABEL[tokens.corners]}>
            <SegmentedButton<LandingCorners>
              className="w-full"
              label="Corners"
              value={tokens.corners}
              onChange={(corners) => setLanding({ ...landing, corners: corners === "soft" ? undefined : corners })}
              options={(["square", "soft", "round"] as const).map((value) => ({ value, label: SUDUT_LABEL[value] }))}
            />
            <p className="-mt-2 text-body-small text-on-surface-variant">Buttons, cards, photos and fields on the event page and the form. Pill buttons stay round.</p>
          </Lipat>
        ) : null}

        <Lipat judul="Layout" {...lipat("layout")} ringkas={LANDING_LAYOUT_LABELS[tokens.layout]}>
          <p className="text-body-small text-on-surface-variant">How the page is built. Colours and fonts stay when you switch.</p>
          <div role="radiogroup" aria-label="Layout" className="flex flex-col gap-2" onKeyDown={panahLayout}>
            {LAYOUTS.map((value) => {
              const pilih = tokens.layout === value;
              // Gaya gathering (hari perjalanan, Tempat menginap) hanya ada di Modern.
              const mati = gathering && value !== "modern";
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={pilih}
                  aria-disabled={mati || undefined}
                  // Satu perhentian Tab untuk seluruh grup; panah memindah pilihan.
                  tabIndex={pilih ? 0 : -1}
                  data-layout={value}
                  onClick={() => (mati || pilih ? undefined : pilihLayout(value))}
                  className={cx(
                    "m3-state flex min-h-12 items-center gap-3 rounded-md border px-3 py-2 text-left",
                    pilih ? "border-primary ring-1 ring-primary" : "border-outline-variant",
                    mati && "cursor-not-allowed",
                  )}
                >
                  <span className={cx("flex min-w-0 flex-1 flex-col", mati && "opacity-60")}>
                    <span className="text-body-medium font-medium text-on-surface">{LANDING_LAYOUT_LABELS[value]}</span>
                    <span className="text-body-small text-on-surface-variant">{LAYOUT_NOTE[value]}</span>
                  </span>
                  {pilih ? <Check size={16} weight="bold" className="shrink-0 text-primary" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
          {gathering ? (
            <p className="text-body-small text-on-surface-variant">Gathering sections (trip days, hotel) need Modern. Pick another preset to use Editorial or Forum.</p>
          ) : null}
        </Lipat>

        <Lipat judul="Page" {...lipat("halaman")} ringkas={ringkasHalaman}>
          {halaman}
        </Lipat>
        <div className="border-t border-outline-variant" />
      </div>
    </div>
  );
}

function Bulat({ warna }: { warna: string }) {
  return <span aria-hidden className="size-4 shrink-0 rounded-full border border-outline-variant" style={{ background: warna }} />;
}

/** Satu grup yang bisa dilipat. Baris kepalanya 48 px, ringkasan nilai di kanan saat tertutup. */
function Lipat({ judul, ringkas, buka, onToggle, children }: { judul: string; ringkas: ReactNode; buka: boolean; onToggle: () => void; children: ReactNode }) {
  const id = useId();
  return (
    <section className="border-t border-outline-variant">
      <h3>
        <button
          type="button"
          aria-expanded={buka}
          aria-controls={id}
          onClick={onToggle}
          className="m3-state -mx-2 flex min-h-12 w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 text-left"
        >
          <span className="flex-1 text-body-medium font-semibold text-on-surface">{judul}</span>
          {!buka ? <span className="flex min-w-0 items-center gap-2 text-body-medium text-on-surface-variant">{ringkas}</span> : null}
          {buka ? <CaretDown size={16} className="shrink-0 text-on-surface-variant" aria-hidden /> : <CaretRight size={16} className="shrink-0 text-on-surface-variant" aria-hidden />}
        </button>
      </h3>
      {buka ? <div id={id} className="flex flex-col gap-4 pb-5 pt-1">{children}</div> : null}
    </section>
  );
}

/**
 * Pemilih huruf: kolom 36 px seperti SelectMenu, daftarnya dikelompokkan per
 * kategori dengan contoh teks dalam huruf itu. Contoh hanya di daftar, bukan di
 * kolomnya (QA mockup butir 2), dan tanpa chip penyaring: tujuh huruf muat di
 * satu daftar, dan chip yang terlipat dua baris hanya menambah tinggi.
 */
function PilihHuruf({
  label,
  hint,
  value,
  pilihan,
  contoh,
  onChange,
}: {
  label: string;
  hint: string;
  value: LandingHeadingFont;
  pilihan: LandingHeadingFont[];
  contoh: string;
  onChange: (value: LandingHeadingFont) => void;
}) {
  const [pemicu, setPemicu] = useState<HTMLElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const id = useId();
  // Urutan daftar = urutan kategori, lalu urutan registri di dalamnya.
  const urut = LANDING_FONT_CATEGORIES.flatMap((kategori) => pilihan.filter((key) => LANDING_HEADING_FONTS[key].category === kategori));
  const [sorot, setSorot] = useState(0);
  const terpilih = LANDING_HEADING_FONTS[value];

  function buka() {
    setSorot(Math.max(0, urut.indexOf(value)));
    menu.buka();
  }
  function pilih(key: LandingHeadingFont) {
    onChange(key);
    menu.tutup();
    menu.fokus();
  }
  function onKeyDown(peristiwa: React.KeyboardEvent) {
    if (!menu.open) {
      if (["ArrowDown", "Enter", " "].includes(peristiwa.key)) { peristiwa.preventDefault(); buka(); }
      return;
    }
    if (peristiwa.key === "Escape") { peristiwa.stopPropagation(); menu.tutup(); menu.fokus(); return; }
    if (peristiwa.key === "ArrowDown" || peristiwa.key === "ArrowUp") {
      peristiwa.preventDefault();
      const arah = peristiwa.key === "ArrowDown" ? 1 : -1;
      setSorot((indeks) => (indeks + arah + urut.length) % urut.length);
      return;
    }
    if (peristiwa.key === "Home") { peristiwa.preventDefault(); setSorot(0); return; }
    if (peristiwa.key === "End") { peristiwa.preventDefault(); setSorot(urut.length - 1); return; }
    if (peristiwa.key === "Enter" || peristiwa.key === " ") { peristiwa.preventDefault(); if (urut[sorot]) pilih(urut[sorot]); }
  }

  return (
    <div className="flex flex-col">
      <span id={`${id}-label`} className="text-body-medium font-medium text-on-surface">{label}</span>
      <button
        ref={setPemicu}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={menu.open}
        aria-controls={menu.open ? id : undefined}
        aria-labelledby={`${id}-label`}
        aria-activedescendant={menu.open && urut[sorot] ? `${id}-${urut[sorot]}` : undefined}
        onClick={() => (menu.open ? menu.tutup() : buka())}
        onKeyDown={onKeyDown}
        className={cx(
          "m3-field mt-2 flex h-9 w-full items-center gap-2 rounded-lg border bg-surface-container-lowest px-3 text-left text-body-medium text-on-surface",
          menu.open ? "border-primary" : "border-outline",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{terpilih.label}</span>
        <span className="shrink-0 text-body-small text-on-surface-variant">{terpilih.category}</span>
        <CaretDown size={14} className="shrink-0 text-on-surface-variant" aria-hidden />
      </button>
      <p className="mt-1.5 text-body-small text-on-surface-variant">{hint}</p>
      {menu.open ? (
        <Popover anchor={menu} id={id} label={label} role="listbox" align="start" className="p-1">
          {LANDING_FONT_CATEGORIES.map((kategori) => {
            const isi = urut.filter((key) => LANDING_HEADING_FONTS[key].category === kategori);
            if (isi.length === 0) return null;
            return (
              <div key={kategori} role="group" aria-label={kategori}>
                <p aria-hidden className="px-2 pb-1 pt-2 text-label-medium font-medium text-on-surface-variant">{kategori}</p>
                {isi.map((key) => {
                  const huruf = LANDING_HEADING_FONTS[key];
                  const indeks = urut.indexOf(key);
                  const aktif = key === value;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      id={`${id}-${key}`}
                      aria-selected={aktif}
                      onClick={() => pilih(key)}
                      onPointerMove={() => setSorot(indeks)}
                      className={cx("flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left", indeks === sorot && "bg-primary-soft")}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[20px] leading-7 text-on-surface" style={{ fontFamily: huruf.cssVar, fontWeight: huruf.weight }}>
                          {contoh}
                        </span>
                        <span className="block text-body-small text-on-surface-variant">
                          {huruf.label} · {huruf.note}
                        </span>
                      </span>
                      {aktif ? <Check size={16} weight="bold" className="shrink-0 text-primary" aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </Popover>
      ) : null}
    </div>
  );
}
