"use client";

import { fontStack, footerImageHeight, logoHeight, scaleClamp, type Branding } from "@/lib/branding";

// Header dan footer branding untuk layar publik: /denah (mode pencarian dan LED)
// dan /display.
//
// Satu komponen untuk ketiganya, bukan tiga salinan. Kedua layar sering dipasang
// di ruangan yang sama, jadi kalau aturan tata letaknya ditulis terpisah, salah
// satu akan tertinggal saat yang lain diperbaiki dan tamu melihat dua layar yang
// terlihat berasal dari sistem berbeda.
//
// Aturan yang dipegang seluruh komponen di berkas ini: bila field-nya kosong,
// TIDAK ada elemen yang dirender — bukan elemen kosong yang menyisakan jarak.
// Ini yang menjamin layar tampil persis seperti sebelum branding CMS ada selama
// admin belum mengisi apa pun.

/**
 * `led` untuk layar besar tanpa sentuh (mode QR di /denah): ukuran mengikuti
 * viewport supaya terbaca dari jauh. `compact` untuk HP tamu dan Live Display
 * yang isinya jauh lebih padat.
 */
type Variant = "led" | "compact";

export type BrandHeaderProps = {
  branding: Branding;
  title: string;
  subtitle: string | null;
  /** Warna dasar layar. Dipakai bila warna per elemen belum disetel admin. */
  textColor: string;
  accentColor: string;
  variant: Variant;
  /** Kelas tambahan untuk jarak, ditentukan halaman pemakai. */
  className?: string;
};

// Ukuran bawaan. Skala admin mengalikan angka-angka ini; skala 1 mengembalikan
// string aslinya tanpa disentuh.
//
// Nilai `compact` untuk judul menyalin kelas Tailwind yang dipakai /denah
// sebelumnya, bukan angka yang kelihatan sepadan: `text-2xl sm:text-3xl` berarti
// 24px di bawah 640px dan 30px di atasnya, dan rumus `4.7vw` mencapai tepat 30px
// pada 640px sehingga peralihannya jatuh di titik yang sama dengan breakpoint
// `sm:` yang digantikannya.
const TITLE_SIZE: Record<Variant, string> = {
  led: "clamp(20px, 3.9vmin, 76px)",
  compact: "clamp(24px, 4.7vw, 30px)",
};

// Sub judul kini seukuran teks biasa, bukan kelir mungil.
//
// Sebelumnya 11px/12px karena ia dirender sebagai kelir huruf besar berjarak
// lebar di ATAS judul. Setelah ia menjadi baris keterangan di BAWAH judul (lihat
// alasannya di BrandHeader), ukuran sekecil itu membuatnya nyaris tak terbaca di
// LED dari jarak jauh. Angkanya diambil sekitar 45% dari ukuran judul, proporsi
// judul-terhadap-keterangan yang lazim, dan admin tetap bisa menggesernya lewat
// `subtitle_scale` di CMS.
const SUBTITLE_SIZE: Record<Variant, string> = {
  led: "clamp(12px, 1.8vmin, 34px)",
  compact: "clamp(13px, 2.2vw, 15px)",
};

/**
 * Logo saja, tanpa judul.
 *
 * Dipisah dari `BrandHeader` karena Live Display punya header mendatar (ikon,
 * teks, tombol operator) yang tata letaknya berbeda dari header bertumpuk di
 * /denah. Memaksakan `BrandHeader` ke sana berarti menyusun ulang header yang
 * sudah rapi hanya untuk menyisipkan satu gambar.
 *
 * `centered` false membuat logo mengikuti aliran flex induknya, bukan dipaksa ke
 * tengah — itulah yang dibutuhkan header mendatar.
 */
export function BrandLogo({
  branding,
  variant,
  centered = true,
}: {
  branding: Branding;
  variant: Variant;
  centered?: boolean;
}) {
  if (!branding.logo_url) return null;
  return (
    // `img` biasa, bukan next/image. URL-nya datang dari Supabase Storage dan bisa
    // berubah kapan saja lewat CMS, sedangkan optimasi next/image butuh host yang
    // didaftarkan lebih dulu di konfigurasi. Logo juga sudah kecil, jadi hasil
    // optimasi tidak sebanding dengan risiko gambar gagal tampil di layar acara
    // karena host-nya belum terdaftar.
    //
    // Tinggi yang dipatok, bukan lebar: rasio logo sangat beragam (PRIMA lonjong
    // lebar, logo lain nyaris persegi), dan tinggi seragam paling mendekati cara
    // mata menilai "ukurannya sama".
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={branding.logo_url}
      alt=""
      // Murni dekoratif: nama acara sudah tertulis sebagai teks di sebelahnya,
      // jadi alt kosong menghindari pembaca layar menyebut hal yang sama dua kali.
      aria-hidden="true"
      style={{
        height: logoHeight(branding.logo_scale, variant),
        width: "auto",
        display: "block",
        ...(centered
          ? {
              margin: "0 auto",
              marginBottom: variant === "led" ? "clamp(8px, 1.8vmin, 28px)" : "clamp(6px, 1.2vw, 14px)",
            }
          : { flexShrink: 0 }),
        // Tanpa batas lebar, logo berbentuk sangat lebar bisa memenuhi layar saat
        // tingginya kecil.
        maxWidth: centered ? "min(70%, 640px)" : "min(28vw, 220px)",
        objectFit: "contain",
      }}
    />
  );
}

export function BrandHeader({ branding, title, subtitle, textColor, accentColor, variant, className }: BrandHeaderProps) {
  const headingFont = fontStack(branding.heading_font);

  return (
    <header className={`w-full shrink-0 text-center ${className ?? ""}`}>
      <BrandLogo branding={branding} variant={variant} />

      <h1
        className="text-balance font-bold uppercase"
        style={{
          fontFamily: headingFont,
          fontSize: scaleClamp(TITLE_SIZE[variant], branding.title_scale),
          lineHeight: variant === "led" ? 1.1 : 1.15,
          letterSpacing: "0.02em",
          color: branding.title_color ?? textColor,
        }}
      >
        {title}
      </h1>

      {/* Sub judul DI BAWAH judul, bukan di atasnya.
          Urutan sebelumnya menempatkannya sebagai kelir huruf besar berjarak lebar
          di atas judul. Bentuk itu hanya benar ketika isinya memang label pendek
          ("EVENT SCHEDULE"); begitu panitia mengisinya dengan tagline acara yang
          panjang, teks terpanjang di header justru dirender paling kecil dan paling
          renggang — dan itu yang dibaca tamu lebih dulu.
          Sub judul adalah keterangan judul, jadi ia mengikuti judul. */}
      {subtitle ? (
        <p
          className="text-balance"
          style={{
            fontFamily: headingFont,
            fontSize: scaleClamp(SUBTITLE_SIZE[variant], branding.subtitle_scale),
            // Jarak huruf dan huruf besar paksa dilepas: keduanya milik gaya kelir,
            // dan pada kalimat panjang jarak 0.28em membuat kata sulit dikenali
            // sebagai satu kesatuan. Formatnya kini sama dengan judul, hanya lebih
            // kecil dan tidak setebal, sesuai permintaan agar ukurannya saja yang
            // diatur dari CMS.
            lineHeight: 1.4,
            marginTop: variant === "led" ? "clamp(4px, 1vmin, 16px)" : "0.375rem",
            // Null berarti "ikut warna dasar", bukan "tanpa warna". Sub judul
            // jatuh ke warna teks dengan opasitas seperti sebelumnya; begitu admin
            // memilih warna khusus, opasitas dilepas supaya warna pilihannya tampil
            // apa adanya dan bukan versi pudarnya.
            color: branding.subtitle_color ?? textColor,
            opacity: branding.subtitle_color ? 1 : variant === "led" ? 0.8 : 0.75,
          }}
        >
          {subtitle}
        </p>
      ) : null}

      {/* Aksen dipakai agar prop `accentColor` tetap bermakna: garis tipis di
          bawah judul hanya muncul kalau admin menyetel warna judul khusus,
          sebagai penanda visual bahwa header sudah ditata. Tanpa itu, header
          tampil sama seperti sebelumnya. */}
      {branding.title_color ? (
        <span
          aria-hidden="true"
          style={{
            display: "block",
            margin: variant === "led" ? "clamp(6px, 1.2vmin, 18px) auto 0" : "0.5rem auto 0",
            width: variant === "led" ? "clamp(40px, 8vmin, 140px)" : "56px",
            height: variant === "led" ? "clamp(2px, 0.4vmin, 5px)" : "2px",
            background: accentColor,
          }}
        />
      ) : null}
    </header>
  );
}

export type BrandFooterProps = {
  branding: Branding;
  textColor: string;
  variant: Variant;
  /**
   * Isi bawaan footer yang sudah ada di halaman pemakai (mis. "32 Meja · 199
   * Kursi" dan waktu pembaruan). Diteruskan sebagai children supaya komponen ini
   * menambahkan blok sponsor TANPA mengambil alih apa yang sudah tampil.
   */
  children?: React.ReactNode;
  className?: string;
};

const FOOTER_TEXT_SIZE: Record<Variant, string> = {
  led: "clamp(9px, 1.2vmin, 20px)",
  compact: "clamp(9px, 1.1vw, 12px)",
};

export function BrandFooter({ branding, textColor, variant, children, className }: BrandFooterProps) {
  const hasBrand = branding.footer_image_url !== null || branding.footer_text !== null;

  // Tanpa gambar dan tanpa teks sponsor, komponen ini tidak menambahkan apa pun:
  // isi bawaan dikembalikan seperti aslinya. Membungkusnya dalam elemen kosong
  // akan menambah jarak yang tidak diminta siapa pun.
  if (!hasBrand) return <>{children}</>;

  return (
    <div
      className={`flex w-full flex-col items-center ${className ?? ""}`}
      style={{ gap: variant === "led" ? "clamp(4px, 1vmin, 14px)" : "0.5rem" }}
    >
      {branding.footer_text ? (
        <p
          className="text-center font-semibold"
          style={{
            fontFamily: fontStack(branding.heading_font),
            fontSize: scaleClamp(FOOTER_TEXT_SIZE[variant], branding.footer_scale),
            letterSpacing: "0.14em",
            color: branding.footer_text_color ?? textColor,
            opacity: branding.footer_text_color ? 1 : 0.7,
          }}
        >
          {branding.footer_text}
        </p>
      ) : null}

      {branding.footer_image_url ? (
        // Satu gambar gabungan, sudah ditata desainer. Lihat catatan pada
        // `Branding.footer_image_url` untuk alasan mengapa bukan daftar logo yang
        // disusun sistem.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.footer_image_url}
          alt=""
          aria-hidden="true"
          style={{
            height: footerImageHeight(branding.footer_image_scale, variant),
            width: "auto",
            // Blok sponsor bisa sangat lebar. Batas lebar diberikan supaya ia
            // tidak pernah melimpah keluar layar pada panel sempit; `objectFit`
            // menjaga rasionya saat batas itu yang berlaku, bukan tingginya.
            maxWidth: "min(92%, 1400px)",
            objectFit: "contain",
            display: "block",
          }}
        />
      ) : null}

      {children}
    </div>
  );
}
