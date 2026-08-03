"use client";

import { UploadSimple, XCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { BRANDING_FONTS, SCALE_MAX, SCALE_MIN, type Branding, type BrandingFont } from "@/lib/branding";

// Editor header dan footer branding, dipakai bersama dua CMS: /admin/seat-map
// (per agenda) dan /admin/display (satu untuk seluruh acara).
//
// Satu komponen untuk keduanya, bukan dua salinan. Kedua tabel sengaja memakai
// nama kolom yang identik untuk bagian branding, jadi form-nya pun bisa satu.
// Kalau ditulis dua kali, penambahan field kelak harus dikerjakan berulang, dan
// begitu satu terlewat admin akan menemukan setelan yang ada di satu halaman
// tapi hilang di halaman lain.
//
// Komponen ini TIDAK menyimpan apa pun sendiri. Ia hanya melaporkan perubahan
// lewat `onChange`, dan halaman pemakainya yang mengirim ke server saat admin
// menekan Simpan. Pola ini mengikuti kartu agenda di /admin/seat-map yang sudah
// ada, sehingga perilaku "ubah dulu, simpan kemudian" tetap seragam.

export type BrandingEditorProps = {
  value: Branding;
  onChange: (changes: Partial<Branding>) => void;
  /**
   * Pembeda id elemen form bila ada lebih dari satu editor di satu halaman.
   *
   * Wajib di /admin/seat-map: setiap agenda punya kartunya sendiri, dan tanpa
   * pembeda seluruh label `htmlFor` akan menunjuk ke input pertama sehingga
   * mengeklik label pada kartu kedua memindahkan fokus ke kartu pertama.
   */
  idPrefix: string;
  /** Warna dasar layar, dipakai untuk contoh warna dan pemeriksaan kontras. */
  baseTextColor: string;
  baseBackgroundColor: string;
  baseAccentColor: string;
};

/**
 * Luminans relatif menurut WCAG.
 *
 * Dipakai untuk memperingatkan kombinasi warna yang tidak terbaca, bukan untuk
 * memblokirnya. Panitia kadang sengaja memilih kontras rendah untuk teks
 * dekoratif, dan menolak pilihannya berarti memaksa mereka mencari cara lain di
 * luar CMS — yang justru menghilangkan kendali yang kita bangun di sini.
 */
function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => {
    const part = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const HEX = /^#[0-9a-fA-F]{6}$/;

const inputClass =
  "h-11 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]";

export function BrandingEditor({
  value,
  onChange,
  idPrefix,
  baseTextColor,
  baseBackgroundColor,
  baseAccentColor,
}: BrandingEditorProps) {
  const [uploading, setUploading] = useState<"logo" | "footer" | null>(null);
  const toast = useToast();

  /**
   * Unggah gambar logo atau footer.
   *
   * Memakai endpoint yang sama dengan gambar latar (`/api/display/background`),
   * dibedakan hanya oleh `kind` yang menentukan foldernya. Endpoint itu sudah
   * memvalidasi format dan ukuran; membuat endpoint kedua berarti menyalin aturan
   * itu, dan salinan selalu berakhir berbeda dari aslinya.
   */
  async function upload(kind: "logo" | "footer", file: File) {
    setUploading(kind);
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind === "logo" ? "logos" : "footers");
    const response = await fetch("/api/display/background", { method: "POST", body: form });
    const data = await response.json().catch(() => null);
    setUploading(null);
    if (!response.ok) {
      toast.error("Upload gambar gagal", data?.error?.details?.file ?? data?.error?.message ?? "Coba lagi.");
      return;
    }
    onChange(kind === "logo" ? { logo_url: data.url } : { footer_image_url: data.url });
    toast.info("Gambar terunggah", "Klik Simpan untuk menerapkannya ke layar publik.");
  }

  return (
    <div className="space-y-6">
      {/* Penjelasan di depan, sebelum field apa pun.
          Seluruh bagian ini opsional, dan itu tidak terlihat dari form-nya sendiri:
          admin yang menemukan belasan field baru cenderung merasa harus mengisinya. */}
      <p className="border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-xs leading-5 text-[var(--ink-muted)]">
        Semua isian di bagian ini <strong>opsional</strong>. Dibiarkan kosong, layar tampil
        seperti sebelumnya tanpa logo dan tanpa blok sponsor.
      </p>

      {/* ------------------------------------------------------------------ */}
      {/* Logo header                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <p className="text-sm font-semibold">Logo header</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">
          Tampil di atas judul. PNG berlatar transparan paling baik. Maksimal 5 MB.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label
            className={`inline-flex min-h-11 cursor-pointer items-center gap-2 border border-[var(--line)] bg-[var(--background)] px-3 text-sm font-semibold hover:border-[var(--brand)] ${uploading === "logo" ? "pointer-events-none opacity-60" : ""}`}
          >
            <UploadSimple size={17} weight="bold" />
            {uploading === "logo" ? "Mengunggah…" : "Upload logo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={uploading !== null}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload("logo", file);
                // Direset agar memilih berkas yang sama dua kali tetap memicu
                // `change`. Tanpa ini, unggah ulang setelah gagal tidak berjalan.
                event.target.value = "";
              }}
            />
          </label>
          {value.logo_url ? (
            <button
              type="button"
              onClick={() => onChange({ logo_url: null })}
              className="inline-flex min-h-11 items-center gap-2 border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--danger)] hover:border-[var(--danger)]"
            >
              <XCircle size={17} weight="bold" /> Hapus logo
            </button>
          ) : null}
        </div>
        {value.logo_url ? (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-3">
              {/* Pratinjau berlatar kotak-kotak, bukan putih atau abu polos.
                  Logo PNG transparan di atas latar putih terlihat seperti logo
                  berlatar putih, jadi admin tidak bisa tahu apakah berkasnya sudah
                  benar sampai ia melihatnya di layar acara. */}
              <span
                className="flex h-14 w-24 shrink-0 items-center justify-center border border-[var(--line)]"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, #e6e6e6 25%, transparent 25%, transparent 75%, #e6e6e6 75%), linear-gradient(45deg, #e6e6e6 25%, transparent 25%, transparent 75%, #e6e6e6 75%)",
                  backgroundSize: "12px 12px",
                  backgroundPosition: "0 0, 6px 6px",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={value.logo_url} alt="Pratinjau logo" className="max-h-12 max-w-20 object-contain" />
              </span>
              <span className="break-all text-[11px] leading-4 text-[var(--ink-muted)]">{value.logo_url}</span>
            </div>
            <ScaleField
              id={`${idPrefix}-logo-scale`}
              label="Ukuran logo"
              value={value.logo_scale}
              onChange={(next) => onChange({ logo_scale: next })}
            />
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Footer sponsor                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="border-t border-[var(--line)] pt-5">
        <p className="text-sm font-semibold">Blok sponsor / media partner</p>
        <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">
          Satu gambar gabungan yang sudah ditata desainer, bukan logo satu per satu.
          Jarak antar logo dan ukuran optisnya tidak bisa disusun otomatis dengan
          hasil yang rapi, jadi tata letaknya tetap dipegang desainer.
          Disarankan PNG transparan, lebar 1600–2400px.
        </p>

        <label className="mt-4 block text-sm font-semibold" htmlFor={`${idPrefix}-footer-text`}>
          Teks di atas gambar <span className="font-normal text-[var(--ink-muted)]">(opsional)</span>
        </label>
        <input
          id={`${idPrefix}-footer-text`}
          value={value.footer_text ?? ""}
          maxLength={200}
          placeholder="Official Media Partners :"
          onChange={(event) => onChange({ footer_text: event.target.value })}
          className={`mt-1 ${inputClass}`}
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label
            className={`inline-flex min-h-11 cursor-pointer items-center gap-2 border border-[var(--line)] bg-[var(--background)] px-3 text-sm font-semibold hover:border-[var(--brand)] ${uploading === "footer" ? "pointer-events-none opacity-60" : ""}`}
          >
            <UploadSimple size={17} weight="bold" />
            {uploading === "footer" ? "Mengunggah…" : "Upload gambar sponsor"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={uploading !== null}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload("footer", file);
                event.target.value = "";
              }}
            />
          </label>
          {value.footer_image_url ? (
            <button
              type="button"
              onClick={() => onChange({ footer_image_url: null })}
              className="inline-flex min-h-11 items-center gap-2 border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--danger)] hover:border-[var(--danger)]"
            >
              <XCircle size={17} weight="bold" /> Hapus gambar
            </button>
          ) : null}
        </div>

        {value.footer_image_url ? (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-3">
              <span
                className="flex h-14 w-32 shrink-0 items-center justify-center border border-[var(--line)]"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, #e6e6e6 25%, transparent 25%, transparent 75%, #e6e6e6 75%), linear-gradient(45deg, #e6e6e6 25%, transparent 25%, transparent 75%, #e6e6e6 75%)",
                  backgroundSize: "12px 12px",
                  backgroundPosition: "0 0, 6px 6px",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={value.footer_image_url} alt="Pratinjau blok sponsor" className="max-h-12 max-w-28 object-contain" />
              </span>
              <span className="break-all text-[11px] leading-4 text-[var(--ink-muted)]">{value.footer_image_url}</span>
            </div>
            <ScaleField
              id={`${idPrefix}-footer-image-scale`}
              label="Ukuran gambar sponsor"
              value={value.footer_image_scale}
              onChange={(next) => onChange({ footer_image_scale: next })}
            />
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tipografi                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="border-t border-[var(--line)] pt-5">
        <p className="text-sm font-semibold">Jenis huruf judul</p>
        <select
          id={`${idPrefix}-font`}
          aria-label="Jenis huruf judul"
          value={value.heading_font}
          onChange={(event) => onChange({ heading_font: event.target.value as BrandingFont })}
          className={`mt-2 ${inputClass}`}
        >
          {BRANDING_FONTS.map((font) => (
            <option key={font.value} value={font.value}>{font.label}</option>
          ))}
        </select>
        <p className="mt-2 text-xs text-[var(--ink-muted)]">
          {BRANDING_FONTS.find((font) => font.value === value.heading_font)?.hint}
        </p>

        {/* Kenapa pengali, bukan ukuran piksel. Penjelasan singkat ditaruh di form
            karena inilah pertanyaan pertama admin saat mencari field "ukuran font". */}
        <p className="mt-4 border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-xs leading-5 text-[var(--ink-muted)]">
          Ukuran diatur sebagai <strong>pengali</strong>, bukan angka piksel. Layar acara
          punya banyak resolusi dan ukurannya menyesuaikan diri sendiri; angka piksel
          tetap akan mepet di panel sempit dan mungil di LED besar. 1,0× berarti ukuran
          bawaan.
        </p>

        <div className="mt-4 space-y-4">
          <ScaleField id={`${idPrefix}-title-scale`} label="Ukuran judul" value={value.title_scale} onChange={(next) => onChange({ title_scale: next })} />
          <ScaleField id={`${idPrefix}-subtitle-scale`} label="Ukuran sub judul" value={value.subtitle_scale} onChange={(next) => onChange({ subtitle_scale: next })} />
          <ScaleField id={`${idPrefix}-footer-scale`} label="Ukuran teks footer" value={value.footer_scale} onChange={(next) => onChange({ footer_scale: next })} />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Warna per elemen                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="border-t border-[var(--line)] pt-5">
        <p className="text-sm font-semibold">Warna per elemen</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">
          Dibiarkan kosong, elemen mengikuti warna dasar layar. Mengubah warna dasar
          nanti tetap berlaku untuk elemen yang belum disetel khusus di sini.
        </p>
        <div className="mt-3 space-y-3">
          <ColorField
            id={`${idPrefix}-title-color`}
            label="Judul"
            value={value.title_color}
            fallback={baseTextColor}
            background={baseBackgroundColor}
            onChange={(next) => onChange({ title_color: next })}
          />
          <ColorField
            id={`${idPrefix}-subtitle-color`}
            label="Sub judul"
            value={value.subtitle_color}
            fallback={baseTextColor}
            background={baseBackgroundColor}
            onChange={(next) => onChange({ subtitle_color: next })}
          />
          <ColorField
            id={`${idPrefix}-footer-text-color`}
            label="Teks footer"
            value={value.footer_text_color}
            fallback={baseTextColor}
            background={baseBackgroundColor}
            onChange={(next) => onChange({ footer_text_color: next })}
          />
        </div>
        <p className="mt-3 text-xs text-[var(--ink-muted)]">
          Warna aksen layar ({baseAccentColor.toUpperCase()}) tetap dipakai untuk garis
          bawah judul dan nomor langkah pada layar QR.
        </p>
      </div>
    </div>
  );
}

/**
 * Slider pengali dengan nilai yang terbaca.
 *
 * Slider, bukan input angka: yang dilakukan admin di sini adalah membandingkan
 * ("apakah ini terlalu besar dibanding judulnya"), bukan memasukkan nilai yang
 * sudah ia ketahui. Angkanya tetap ditampilkan supaya setelan yang cocok bisa
 * dicatat dan disalin ke agenda lain.
 */
function ScaleField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs font-semibold" htmlFor={id}>{label}</label>
        <span className="font-mono text-xs text-[var(--ink-muted)]">{value.toFixed(2)}×</span>
      </div>
      <div className="mt-1 flex items-center gap-3">
        <input
          id={id}
          type="range"
          min={SCALE_MIN}
          max={SCALE_MAX}
          step={0.05}
          value={value}
          onChange={(event) => onChange(Number.parseFloat(event.target.value))}
          className="h-11 w-full accent-[var(--brand)]"
        />
        {/* Tombol reset hanya muncul saat nilainya bukan bawaan. Selalu
            menampilkannya membuat admin ragu apakah 1,0× sudah "disetel" atau belum. */}
        {value !== 1 ? (
          <button
            type="button"
            onClick={() => onChange(1)}
            className="min-h-11 shrink-0 px-2 text-xs font-semibold text-[var(--brand)]"
          >
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Warna opsional: kotak warna, kode hex, dan tombol untuk kembali ke warna dasar.
 *
 * Rasio kontras ditampilkan sebagai peringatan, bukan penghalang. Nilai di bawah
 * 4,5:1 adalah batas WCAG AA untuk teks biasa; di layar LED yang dilihat dari
 * jauh, kontras rendah lebih berat akibatnya daripada di monitor dekat.
 */
function ColorField({
  id,
  label,
  value,
  fallback,
  background,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  fallback: string;
  background: string;
  onChange: (value: string | null) => void;
}) {
  const effective = value ?? fallback;
  const ratio = HEX.test(effective) && HEX.test(background) ? contrastRatio(effective, background) : null;
  const low = ratio !== null && ratio < 4.5;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs font-semibold" htmlFor={id}>{label}</label>
        {value === null ? (
          <span className="text-[11px] text-[var(--ink-muted)]">Ikut warna dasar</span>
        ) : (
          <button type="button" onClick={() => onChange(null)} className="min-h-8 text-[11px] font-semibold text-[var(--brand)]">
            Kembalikan ke warna dasar
          </button>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={effective}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer border border-[var(--line)] bg-[var(--background)]"
        />
        <input
          value={value ?? ""}
          placeholder={fallback.toUpperCase()}
          aria-label={`Kode warna ${label}`}
          onChange={(event) => {
            const next = event.target.value.trim();
            // Kolom dikosongkan berarti "ikut warna dasar". Nilai yang belum lengkap
            // sengaja diabaikan, bukan ditolak dengan pesan: admin mengetik hex
            // karakter demi karakter, dan memvalidasi setiap ketikan akan
            // memunculkan error pada input yang belum selesai diisi.
            if (next === "") onChange(null);
            else if (HEX.test(next)) onChange(next);
          }}
          className="h-10 w-full border border-[var(--line)] bg-[var(--background)] px-2 font-mono text-xs uppercase outline-none focus:border-[var(--brand)]"
        />
      </div>
      {low ? (
        <p className="mt-1 text-[11px] text-[var(--danger)]">
          Kontras {ratio?.toFixed(1)}:1 terhadap latar. Di bawah 4,5:1 teks sulit dibaca
          dari jauh. Tetap bisa disimpan.
        </p>
      ) : null}
    </div>
  );
}
