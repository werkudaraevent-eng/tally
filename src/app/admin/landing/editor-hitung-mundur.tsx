"use client";

import { WarningCircle } from "@phosphor-icons/react";
import { useId } from "react";
import { SegmentedButton, Switch, TextField } from "@/components/m3";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import {
  LANDING_BLOCK_LAYOUTS,
  countdownSeconds,
  landingBlockLayout,
  landingBlockLimits,
  type LandingBlock,
  type LandingCountdownStyle,
  type LandingHighlight,
  type LandingTextLimit,
} from "@/lib/domain";
import { warnaHitungMundur } from "@/lib/landing-hitung-mundur";
import { cx } from "@/lib/m3/cx";
import { PilihIkonKartu } from "./pilih-ikon";

/**
 * Editor blok Hitung mundur. Admin memilih gaya lebih dulu; kontrol di bawahnya
 * hanya yang dipakai gaya itu. Warna dibatasi pada warna tema atau warna
 * sendiri, dan warna sorot yang kurang kontras diganti di halaman dengan
 * peringatan di sini (aturan yang sama: warnaHitungMundur).
 */

/** Kendaraan ditawarkan paling depan di pemilih ikon; ikon lain tetap bisa dicari. */
const IKON_RUTE = ["Airplane", "AirplaneTilt", "Train", "Bus", "Van", "Car", "Boat", "MapPin", "CalendarCheck", "Flag"] as const;

const NAMA_GAYA: Record<LandingCountdownStyle, string> = {
  numbers: "Numbers",
  board: "Flip board",
  ticket: "Ticket",
  strip: "Slim strip",
  photo: "Photo",
};

type Latar = "light" | "panel" | "dark" | "custom";
type Sorot = "auto" | "brand" | "accent" | "ink" | "custom";

const hitung = (limit?: LandingTextLimit) => ({ maxLength: limit?.max, counter: limit ? { ideal: limit.ideal } : false });

/** Gambaran kecil tiap gaya di pemilih gaya. */
function Sketsa({ gaya }: { gaya: LandingCountdownStyle }) {
  const garis = (lebar: string) => <span className={cx("block h-1 rounded-full bg-white/70", lebar)} />;
  return (
    <span aria-hidden className="relative flex h-14 w-full items-center gap-1.5 overflow-hidden rounded-[5px] bg-[#111A42] p-2">
      {gaya === "numbers" ? (
        <>
          <span className="flex w-6 flex-col gap-1">{garis("w-full")}{garis("w-2/3")}</span>
          {["24", "08", "15"].map((n) => <span key={n} className="flex-1 border-l border-white/25 pl-1 text-[13px] font-semibold leading-none text-white tabular-nums">{n}</span>)}
        </>
      ) : null}
      {gaya === "board" ? (
        <span className="mx-auto flex gap-[3px] rounded-[3px] bg-black/40 p-1">
          {"2408".split("").map((n, i) => <span key={i} className="flex h-6 w-4 items-center justify-center rounded-[2px] bg-[#1A1F29] text-[11px] font-semibold text-white">{n}</span>)}
        </span>
      ) : null}
      {gaya === "ticket" ? (
        <span className="flex h-9 w-full rounded-[4px] bg-white">
          <span className="flex flex-1 items-center px-1.5"><span className="h-px flex-1 border-t border-dashed border-[#111A42]/40" /><span className="size-2 rounded-full bg-[#111A42]" /><span className="h-px flex-1 border-t border-dashed border-[#111A42]/40" /></span>
          <span className="flex w-7 items-center justify-center border-l border-dashed border-[#111A42]/30 text-[12px] font-bold text-[#111A42]">24</span>
        </span>
      ) : null}
      {gaya === "strip" ? (
        <span className="flex w-full items-center gap-1.5">
          <span className="text-[10px] font-semibold text-[#F5C451]">24h</span>
          <span className="relative h-[3px] flex-1 rounded-full bg-white/20"><span className="absolute inset-y-0 left-0 w-2/3 rounded-full bg-[#F5C451]" /></span>
        </span>
      ) : null}
      {gaya === "photo" ? (
        <>
          <span className="absolute inset-0 bg-[linear-gradient(135deg,#6b7a99,#2b3550)]" />
          <span className="relative mx-auto text-[15px] font-semibold tracking-tight text-white tabular-nums">24 : 08</span>
        </>
      ) : null}
    </span>
  );
}

export function EditorHitungMundur({
  block,
  ubah,
  warnaTema,
}: {
  block: LandingBlock;
  ubah: (patch: Partial<LandingBlock>) => void;
  /** Warna merek dan aksen acara; aksen hanya ada di gaya gathering. */
  warnaTema: { brand: string; accent: string | null };
}) {
  const id = useId();
  const batas = landingBlockLimits(block);
  const gaya = (landingBlockLayout(block) ?? "numbers") as LandingCountdownStyle;
  const pilihanGaya = LANDING_BLOCK_LAYOUTS.countdown ?? [];
  const pakai = (...daftar: LandingCountdownStyle[]) => daftar.includes(gaya);

  const latar: Latar = block.bg_color ? "custom" : (block.tone ?? "dark");
  const sorot: Sorot = !block.highlight ? "auto" : block.highlight.startsWith("#") ? "custom" : (block.highlight as Sorot);
  const warna = warnaHitungMundur(block, warnaTema, gaya === "photo" && Boolean(block.image_url));
  // Kartu tiket selalu putih, jadi sorotnya diukur dua kali: di latar blok dan di kartu.
  const tiketDiganti = gaya === "ticket" && warna.putihDiganti;
  const peringatan = warna.sorotDiganti && tiketDiganti
    ? `This colour is too faint here, so the page uses ${warna.teks === "#FFFFFF" ? "white" : "dark text"} on the background and dark text on the white ticket. Pick another colour.`
    : warna.sorotDiganti
      ? gaya === "photo"
        ? "This colour is too dark to read on the photo, so the page uses white instead. Pick a lighter colour."
        : `This colour is too faint on this background, so the page uses ${warna.teks === "#FFFFFF" ? "white" : "dark text"} instead. Pick a darker or lighter colour.`
      : tiketDiganti
        ? "This colour is too faint on the white ticket, so the route and day count there use dark text. Pick a darker colour."
        : null;

  const teks = (key: "eyebrow" | "heading" | "countdown_from" | "countdown_to", label: string, opsi: { hint?: string; placeholder?: string } = {}) => (
    <TextField
      label={label}
      optional
      hint={opsi.hint}
      placeholder={opsi.placeholder}
      {...hitung(batas[key])}
      value={block[key] ?? ""}
      onChange={(event) => ubah({ [key]: event.target.value })}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Gaya */}
      <div className="flex flex-col gap-1.5">
        <p id={`${id}-gaya`} className="text-body-medium font-medium text-on-surface">Style</p>
        <div role="radiogroup" aria-labelledby={`${id}-gaya`} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {pilihanGaya.map((item) => {
            const nilai = item.value as LandingCountdownStyle;
            const aktif = nilai === gaya;
            return (
              <button
                key={nilai}
                type="button"
                role="radio"
                aria-checked={aktif}
                onClick={() => ubah({ layout: nilai })}
                className={cx(
                  "m3-state flex min-h-12 flex-col gap-1.5 rounded-md border p-1.5 text-left",
                  aktif ? "border-primary bg-primary-soft ring-1 ring-primary" : "border-outline-variant",
                )}
              >
                <Sketsa gaya={nilai} />
                <span className="px-0.5 text-body-medium font-semibold text-on-surface">{NAMA_GAYA[nilai]}</span>
              </button>
            );
          })}
        </div>
        <p className="text-body-small text-on-surface-variant">
          {pilihanGaya.find((item) => item.value === gaya)?.hint}{" "}Counts to the start date and time in Dashboard › Edit details. While the event runs it shows &ldquo;Sedang berlangsung&rdquo;; afterwards the block hides itself.
        </p>
      </div>

      {/* 2. Isi, hanya yang dipakai gaya terpilih */}
      {pakai("numbers", "board", "ticket", "photo") ? (
        <>
          {teks("eyebrow", "Small label", { hint: "One to three words above the heading." })}
          {teks("heading", "Heading", { placeholder: "Menuju hari H", hint: "Empty: \"Menuju hari H\" (English page: \"Counting down to the day\")." })}
        </>
      ) : null}
      {pakai("board", "ticket", "strip")
        ? teks("countdown_to", gaya === "board" ? "Board title" : "Destination", {
            placeholder: "Venue name",
            hint: gaya === "strip" ? "Shown as \"24 hari lagi ke …\". Empty: the venue name. e.g. Yogyakarta." : "Empty: the venue name. A city reads best, e.g. Yogyakarta.",
          })
        : null}
      {pakai("ticket", "strip")
        ? teks("countdown_from", gaya === "ticket" ? "Start label" : "Label under the start of the route", { placeholder: "Hari ini", hint: "Empty: \"Hari ini\"." })
        : null}
      {pakai("ticket", "strip") ? (
        <div className="flex flex-col gap-1">
          <PilihIkonKartu
            nomor={1}
            label="Route icon"
            namaPopover="Route icon"
            tanpaWarna
            saranDepan={IKON_RUTE}
            teksKembali="No icon"
            ikon={block.icon ?? ""}
            nada="brand"
            bawaan={!block.icon && !block.icon_url}
            warna={{ brand: { latar: "var(--color-primary)", teks: "var(--color-on-primary)" }, button: { latar: "", teks: "" }, accent: { latar: "", teks: "" } }}
            gambar={block.icon_url?.trim() || null}
            onChange={(perubahan) => ubah(perubahan === null ? { icon: undefined, icon_url: null } : { icon: perubahan.icon ?? block.icon, icon_url: perubahan.icon_url === undefined ? block.icon_url : perubahan.icon_url })}
          />
          <p className="text-body-small text-on-surface-variant">Moves along the route towards the event day. Pick the guests&rsquo; transport, e.g. Train or Bus, or leave it empty for a dot.</p>
        </div>
      ) : null}
      {gaya === "photo" ? (
        <ImageUploadField
          label="Background photo"
          hint="Ratio 16:9, at least 1920×1080. A dark layer is added automatically so the numbers stay readable. Without a photo, the background colour below is used."
          kind="landing"
          value={block.image_url ?? null}
          onChange={(url) => ubah({ image_url: url })}
        />
      ) : null}

      {/* 3. Warna */}
      <div className="flex flex-col gap-4 border-t border-outline-variant pt-4">
        {gaya === "photo" && block.image_url ? null : (
          <div className="flex flex-col gap-1.5">
            <p id={`${id}-latar`} className="text-body-medium font-medium text-on-surface">Background</p>
            <SegmentedButton<Latar>
              label="Block background"
              labelledBy={`${id}-latar`}
              value={latar}
              onChange={(nilai) => ubah(nilai === "custom" ? { bg_color: block.bg_color ?? "#7A1F2B" } : { tone: nilai, bg_color: undefined })}
              options={[
                { value: "light", label: "Light" },
                { value: "panel", label: "Grey" },
                { value: "dark", label: "Dark brand" },
                { value: "custom", label: "Custom" },
              ]}
            />
            {latar === "custom" ? (
              <WarnaSendiri label="Background colour" value={block.bg_color ?? "#7A1F2B"} onChange={(bg_color) => ubah({ bg_color })} catatan={`Text turns ${warna.teks === "#FFFFFF" ? "white" : "dark"} automatically so it stays readable.`} />
            ) : null}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <p id={`${id}-sorot`} className="text-body-medium font-medium text-on-surface">Highlight colour</p>
          <SegmentedButton<Sorot>
            label="Highlight colour"
            labelledBy={`${id}-sorot`}
            value={sorot}
            onChange={(nilai) => ubah({ highlight: nilai === "auto" ? undefined : nilai === "custom" ? (block.highlight?.startsWith("#") ? block.highlight : "#F5C451") : (nilai as LandingHighlight) })}
            options={[
              { value: "auto", label: "Auto" },
              { value: "brand", label: "Brand" },
              ...(warnaTema.accent ? [{ value: "accent" as const, label: "Accent" }] : []),
              { value: "ink", label: "Text" },
              { value: "custom", label: "Custom" },
            ]}
          />
          {sorot === "custom" ? (
            <WarnaSendiri label="Highlight" value={block.highlight ?? "#F5C451"} onChange={(value) => ubah({ highlight: value as LandingHighlight })} />
          ) : null}
          {peringatan ? (
            <p className="flex items-start gap-2 rounded-md bg-warning-soft p-2.5 text-body-small text-on-warning-soft">
              <WarningCircle size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0" />
              {peringatan}
            </p>
          ) : (
            <p className="text-body-small text-on-surface-variant">Colours the numbers{pakai("ticket", "strip") ? ", the route and its icon" : ""}. Auto picks the accent or brand colour that reads best.</p>
          )}
        </div>
        <Switch
          checked={countdownSeconds(block)}
          onChange={(seconds) => ubah({ seconds })}
          label="Show seconds"
          description="Livelier, but busier. Best with Flip board."
        />
      </div>
    </div>
  );
}

function WarnaSendiri({ label, value, onChange, catatan }: { label: string; value: string; onChange: (value: string) => void; catatan?: string }) {
  return (
    <label className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-outline-variant bg-transparent"
        aria-label={label}
      />
      <span className="min-w-0">
        <span className="block text-body-medium font-medium text-on-surface">{label} <span className="font-normal text-on-surface-variant">{value.toUpperCase()}</span></span>
        {catatan ? <span className="block text-body-small text-on-surface-variant">{catatan}</span> : null}
      </span>
    </label>
  );
}
