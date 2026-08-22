# PRIMA Executive Gathering 2026 — UI Design System

Sistem ini mengikuti **Material Design 3 (M3 Expressive)**. Acuan resmi:
<https://m3.material.io>. Kalau ada nilai di dokumen ini yang terlihat sewenang-wenang,
kemungkinan besar ia berasal dari spesifikasi — cari nama tokennya di situs itu
sebelum menggantinya.

## Karakter produk

Alat operasional untuk acara eksekutif yang berjalan langsung. UI harus membantu
staf booth dan kasir bertindak cepat sambil berdiri, sementara layar proyeksi
harus tetap terbaca dari jauh.

Kata kunci desain: presisi, tenang, kontras tinggi, keramahan hangat, kejelasan
operasional.

M3 Expressive dipakai **berlapis**, bukan rata:

| Lapisan | Layar | Gerak | Bentuk |
| --- | --- | --- | --- |
| Ekspresif | Undian, Papan peringkat, Voting, layar panggung, onboarding | skema `expressive` (pegas memantul) | radius besar, shape morph |
| Tenang | Booth, Kasir, Admin | skema `standard` (teredam kritis) | radius sedang, tanpa morph |

Spesifikasi M3 memang menyediakan dua skema gerak dan membolehkan produk
menukarnya untuk menegaskan momen tertentu. Yang dihindari adalah kebalikannya:
gerak memantul di layar tempat orang sedang menghitung uang sambil antre.

Hindari: pola halaman pemasaran, gradien berlebih, cahaya neon, ikon emoji,
tumpukan kartu padat, status tersembunyi, dan gerak yang bersaing dengan
pembacaan transaksi.

## Warna

### Dari mana warnanya datang

Seluruh warna **dibangkitkan**, tidak ditulis tangan:

```bash
npm run theme
```

Sumbernya satu warna — `#2649D0`, biru royal identitas event — di
`scripts/m3/gen-theme.mjs`. Keluarannya `src/app/m3-theme.css` (jangan diedit
manual). Mengubah identitas warna berarti mengubah satu konstanta lalu menjalankan
ulang perintah di atas.

Pilihan yang dibuat generator, beserta alasannya:

- **Varian `vibrant`, bukan `tonalSpot`.** TonalSpot pada spesifikasi 2025
  memangkas kroma sampai primary menjadi `#535c8c` — biru abu yang tidak dikenali
  sebagai warna PRIMA.
- **Palet primary dikunci ke HCT warna sumber.** Tanpa itu, vibrant masih
  menggeser hue sedikit. Dengan itu, peran `primary` mendarat di `#2b4dd4`.
- **Spesifikasi warna `2025`** — versi era Expressive, yang membawa tier
  `surface-container-*`, `primary-dim`, dan sejenisnya.
- **`Variant.EXPRESSIVE` TIDAK dipakai.** Itu gaya palet Material You yang
  sengaja memutar hue menjauh dari warna sumber; namanya mirip, tujuannya
  berlawanan dengan mempertahankan warna brand.

### Peran, bukan daftar hex

M3 tidak mengenal "warna biru". Yang ada adalah *peran*: `primary`, `on-primary`,
`primary-container`, `on-primary-container`, dan seterusnya untuk `secondary`,
`tertiary`, `error`. Aturannya satu dan tidak ada pengecualian:

> Setiap warna latar punya pasangan `on-*`. Teks dan ikon di atas latar `x`
> selalu memakai `on-x`.

Kontras pasangan itu dijamin oleh konstruksi, bukan oleh pemeriksaan manual.
Terukur di dua tema: semua pasangan `on-*` berada di 6:1 atau lebih.

Tier permukaan, dari yang paling jauh ke paling dekat dengan pengguna:
`surface-dim` → `surface` → `surface-container-lowest` → `-low` → `-` → `-high` →
`-highest` → `surface-bright`. Naikkan tier untuk mengangkat sesuatu; jangan
menambah bayangan.

Dua peran di luar M3 baku ditambahkan karena layar booth dan kasir harus
membedakan lunas, menunggu, dan gagal sekaligus: `success` dan `warning`.
Keduanya diselaraskan (harmonize) ke warna sumber lebih dulu supaya terasa
sekeluarga dengan tema.

### Kelas Tailwind

| Kelas | Peran |
| --- | --- |
| `bg-primary` `text-on-primary` | Aksi utama |
| `bg-primary-container` `text-on-primary-container` | Aksi utama versi tenang, chip terpilih |
| `bg-surface` `text-on-surface` | Kanvas halaman |
| `bg-surface-container` `text-on-surface-variant` | Panel, kartu, teks pendukung |
| `bg-error-container` `text-on-error-container` | Blok galat |
| `bg-success` / `bg-warning` (+ `-container`) | Status transaksi |
| `border-outline` | Tepi yang membawa arti (kolom isian, kontrol) |
| `border-outline-variant` | Pemisah dekoratif |

`border-outline` versus `border-outline-variant` bukan selera. `outline-variant`
hanya mencapai ~2:1 terhadap permukaan; WCAG menuntut 3:1 untuk garis yang
membawa arti. Kolom isian memakai `outline`.

### `*-soft` versus `*-container`

Spesifikasi warna 2025 membuat peran `*-container` jauh lebih pekat daripada M3
generasi sebelumnya — `error-container` di tema terang adalah `#f74b6d`, bukan
merah muda samar. Karena itu ada dua tingkat:

| Peran | Untuk |
| --- | --- |
| `bg-error-container` `text-on-error-container` | Penanda kecil: chip, lencana, baris status |
| `bg-error-soft` `text-on-error-soft` `border-error-soft-outline` | Bidang lebar: panel peringatan, kartu penuh |

Tersedia untuk `primary`, `success`, `warning`, `error`. Peran soft inilah yang
menggantikan ~185 hex tint mati (`#FFF2F0`, `#E8ECFB`, `#EEF8F0`, …) yang dulu
tersebar di 26 berkas dan hanya benar di tema terang.

### `panel` dan `panel-high`

Dua nama di luar M3 baku, untuk permukaan yang tier-nya **berbeda per tema**. Di
terang, panel yang benar adalah `surface-container-lowest` (putih bersih di atas
kanvas bernada). Di gelap tier itu hitam pekat, yang membuat panel lebih gelap
daripada kanvasnya dan membalik hierarki — jadi di gelap panel naik ke
`surface-container`. Karena pilihannya bergantung tema, ia tidak bisa dinyatakan
sebagai satu peran M3.

Pakai `bg-panel` untuk kartu dan `bg-panel-high` untuk lapisan di dalamnya.

### Jangan pernah warna saja

Jangan menyampaikan status dengan warna saja: pasangkan warna dengan teks dan
ikon. Dan jangan menulis `text-white` di atas latar bertema — di mode gelap
`primary` menjadi lavender muda dan tulisan putih di atasnya hilang. Pakai
`text-on-primary`.

## Primitif

Ada di `src/components/m3/`, satu titik impor: `@/components/m3`.

Aturannya sederhana: **kalau primitifnya ada, jangan menulis kelas sendiri.**
Sebelum ini setiap berkas menyusun ulang kelas tombolnya masing-masing, dan
akibatnya token bisa berubah tanpa perubahan itu sampai ke layar.

| Primitif | Catatan |
| --- | --- |
| `Button`, `ButtonLink` | 6 varian × 4 ukuran. `xl` = 64px untuk aksi utama layar operasional. Punya `loading`. Tautan terpisah dari tombol dengan sengaja — pindah halaman dan menjalankan aksi berbeda bagi pembaca layar |
| `IconButton` | `label` wajib. Terkecil 40px, bukan 32px seperti spesifikasi ponsel |
| `Card`, `CardHeader` | `filled` (elevasi tonal) bawaan; `elevated` hanya untuk yang benar-benar melayang |
| `TextField`, `TextArea`, `SelectField` | Label di atas kolom, bukan mengambang — lihat catatan di berkasnya |
| `StatusChip`, `FilterChip` | Chip penyaring menandai terpilih tiga kali: warna, centang, bentuk |
| `SegmentedButton` | `radiogroup`, jadi panah kiri/kanan bekerja. Untuk MEMILIH di dalam tampilan yang sedang dilihat |
| `Tabs` | `tablist` + indikator 3px, roving tabindex. Untuk MENGGANTI tampilan. Kalau isinya berubah, ia tab — bukan segmented button |
| `Switch` | Ikon di dalam kenop; kenop membesar saat menyala |
| `LinearProgress`, `CircularProgress`, `LoadingIndicator` | Yang terakhir hanya untuk layar panggung |
| `Divider`, `PageHeader`, `EmptyState` | Keadaan kosong selalu menyebutkan langkah berikutnya |
| `ThemeToggle` | Tiga pilihan sekaligus, bukan satu tombol berputar. `compact` untuk ruang sempit |
| `TopAppBar`, `useScrolledPastTop` | Selalu sewarna panel; garis rambut muncul saat tergulir |

## Tema dan kontras

- Tiga pilihan tema: terang, gelap, ikut sistem. Komponennya
  `src/components/m3/theme-toggle.tsx`.
- Sumber kebenaran adalah atribut `data-theme` di `<html>`, bukan state React.
  Skrip sinkron di `<head>` (`THEME_INIT_SCRIPT`) menuliskannya sebelum halaman
  digambar, sehingga tidak ada kedipan terang-lalu-gelap.
- Pilihan "ikut sistem" berarti **tidak ada** atribut, sehingga aturan
  `prefers-color-scheme` yang berlaku dan tema ikut berubah saat setelan
  perangkat berubah tanpa muat ulang.
- Mode kontras tinggi tersedia lewat `data-contrast="high"` dan mengikuti
  `prefers-contrast: more`. Ini jalan keluar untuk venue yang terlalu terang,
  tanpa memaksa pengguna berpindah tema.
- Layar proyektor **tidak** ikut tema. `--display-bg` dan `--display-ink` diikat
  ke nada palet mentah yang sama di kedua skema.

## Tipografi

Skala tipe M3: lima peran × tiga ukuran.

| Peran | Kelas | Ukuran / tinggi baris | Untuk |
| --- | --- | --- | --- |
| Display | `text-display-large/medium/small` | 57/45/36 px | Angka besar Papan peringkat, hasil undian |
| Headline | `text-headline-large/medium/small` | 32/28/24 px | Judul halaman |
| Title | `text-title-large/medium/small` | 22/16/14 px | Judul kartu, label tombol besar |
| Body | `text-body-large/medium/small` | 16/14/12 px | Isi. Booth dan kasir minimal `body-large` |
| Label | `text-label-large/medium/small` | 14/12/11 px | Label tombol, chip, tab |

- Huruf: Geist, di-self-host lewat `next/font/google`, terpasang sebagai
  `--md-ref-typeface-brand` dan `--md-ref-typeface-plain`.
- **Ukuran mentah Tailwind (`text-lg`, `text-3xl`, …) tidak dipakai.** Ia bukan
  bagian dari skala, dan tinggi barisnya berbeda dari M3 — jadi yang meleset
  bukan hanya ukurannya, tetapi juga irama vertikal halaman. Semua sudah
  dipindahkan ke peran; yang tersisa hanya di dalam komentar yang membahasnya.
- **Bobot menyimpang dari spesifikasi, dan itu disengaja.** M3 menetapkan
  Display/Headline/Body pada Regular 400 dan Title M/S serta Label pada Medium
  500. Di sini semua peran selain Body memakai 600. Alasannya kondisi pakai:
  layar ini dibaca sambil berdiri di ruangan temaram, sering dari jarak satu
  meter, dan 400 pada Title Small 14px hilang di sana. Bobotnya dikunci di
  `@layer base` per kelas peran, sehingga seragam tanpa perlu ditulis ulang di
  tiap komponen — dan utilitas `font-normal`/`font-bold` tetap bisa menimpanya.
- Yang BELUM ada: varian *emphasized* milik M3 Expressive. Penekanan sekarang
  dikerjakan dengan menaikkan bobot, bukan dengan pasangan gaya tersendiri.
- Ukuran ditulis dalam `rem` supaya ikut membesar saat pengguna menaikkan ukuran
  huruf peramban.
- Angka memakai `font-variant-numeric: tabular-nums` (sudah global di `body`).
- Ukuran bawaan Tailwind (`text-sm`, `text-base`, …) masih hidup untuk layar yang
  belum dipindahkan. Layar baru memakai skala M3.
- Hindari huruf berkait dan huruf dekoratif di layar operasional.

## Bentuk

Skala bentuk M3 **menggantikan** skala radius bawaan Tailwind — tidak
mendampinginya. Kalau keduanya hidup berdampingan, `rounded-lg` berarti dua hal
berbeda di dua berkas dan tidak ada cara melihat mana yang dimaksud.

| Kelas | Nilai | Untuk |
| --- | --- | --- |
| `rounded-xs` | 4px | Elemen kecil di dalam wadah |
| `rounded-sm` | 8px | Chip, kolom isian rapat |
| `rounded-md` | 12px | Kolom isian, tombol standar |
| `rounded-lg` | 16px | Kartu |
| `rounded-xl` | 20px | Kartu menonjol |
| `rounded-2xl` | 28px | Sheet, dialog, panel besar |
| `rounded-3xl` | 32px | Panel ekspresif |
| `rounded-4xl` | 48px | Blok pahlawan di layar panggung |
| `rounded-full` | — | Tombol pil, avatar, indikator |

Wadah memakai radius lebih besar daripada isinya. **Shape morph** — sudut yang
berubah saat status berubah — dipakai sebagai penanda kedua di samping warna,
supaya status tetap terbaca ketika warna gagal membedakan.

## Elevasi

Enam level (0, 1, 3, 6, 8, 12 dp) tersedia sebagai `shadow-level1` … `shadow-level5`.

M3 mendahulukan **elevasi tonal**: naikkan tier `surface-container` sebelum
menambah bayangan. Bayangan hanya untuk yang benar-benar melayang di atas konten —
dialog, menu, bottom sheet. Untuk sisanya, pakai border dan spasi.

## Gerak

Dua sistem, dipakai untuk hal berbeda:

**Pegas (M3 Expressive)** — `src/lib/m3/motion.ts`, dijalankan Framer Motion.

```ts
import { expressive, standard } from "@/lib/m3/motion";

<motion.div transition={expressive.spatial.default} />   // layar panggung
<motion.div transition={standard.spatial.fast} />        // layar kerja
```

- `spatial` untuk yang bergerak atau berubah ukuran. Boleh sedikit memantul.
- `effects` untuk opasitas dan warna. Selalu teredam kritis — warna yang memantul
  terbaca sebagai kedipan.
- Tiga kecepatan masing-masing: `fast`, `default`, `slow`.

**Easing dan durasi klasik** — token CSS untuk transisi biasa:
`ease-standard`, `ease-emphasized`, `ease-emphasized-decelerate`, dan
`--md-sys-motion-duration-*`.

Aturan yang tidak berubah:

- Jangan animasikan `top`, `left`, `width`, atau `height`.
- Pakai animasi `layout` hanya untuk penataan ulang leaderboard.
- Hormati `prefers-reduced-motion: reduce`.
- Tidak ada gerak dekoratif abadi di Booth, Kasir, atau Admin.

## Lapisan status

M3 tidak menggelapkan tombol saat hover. Ia menumpuk lapisan tipis warna `on-*`
di atasnya: hover 8%, fokus 10%, ditekan 10%, diseret 16%.

Pasang kelas `.m3-state` pada elemen interaktif. Satu aturan itu berlaku untuk
semua warna tombol, termasuk yang belum ada.

Cincin fokus global: garis luar 3px `primary` dengan celah 2px, hanya pada
`:focus-visible` — muncul saat berpindah dengan papan ketik, tidak saat disentuh.

## Top app bar

Satu komponen untuk semua layar: `TopAppBar`. Untuk layar yang bilahnya berisi
khusus (booth membawa pemilih booth dan chip mode pengambilan), pakai hook
`useScrolledPastTop()` dengan markup sendiri — perilaku warnanya tetap sama.

Dua aturan yang paling sering dilanggar, keduanya ada di spesifikasi:

1. **Diam = tidak terlihat.** Saat halaman di posisi teratas, bilah berwarna
   sama persis dengan kanvas dan **tidak** punya garis bawah. Blok putih dengan
   garis di bawahnya adalah pola Material 2. Yang membuat bilah terbaca sebagai
   lapisan terpisah bukan warnanya, melainkan konten yang bergulir masuk ke
   bawahnya.
2. **Isyarat gulir berupa garis rambut, bukan bayangan dan bukan perubahan
   tone.** Begitu ada yang tergulir, tepi bawah bilah berubah dari transparan
   menjadi `outline-variant`. Bayangan di bawah bilah selebar layar hanya
   menghasilkan pita kabur yang mengaburkan baris teratas konten — M3 memang
   menggantinya dengan perubahan tone, tetapi di layout panel perubahan tone
   memecah bentuk panelnya. Alasan lengkapnya di bagian "Bingkai dan panel".

Bilahnya **selalu menempel** (`sticky`). Isi layar admin dan booth jauh lebih
panjang daripada layarnya, dan identitas halaman harus terjangkau tanpa
menggulir balik ke atas.

### Satu judul, bukan dua

Bilah membawa **`<h1>` satu-satunya** halaman. Halaman di bawahnya langsung mulai
dari isinya — tanpa eyebrow, tanpa judul besar, tanpa tautan "Kembali ke
Dashboard" yang mengulang menu di sebelahnya.

Sebelumnya tiap halaman admin menumpuk empat baris sebelum data pertama: tautan
kembali, eyebrow huruf kapital, judul `display`-size, lalu deskripsi. Ditambah
bilah, judulnya muncul dua kali dengan dua nama berbeda — "Control room." di
konten sementara bilah dan menu menyebut "Dashboard".

Judul diambil dari tabel `navigation` yang sama dengan penyorot menu aktif.
Daftar judul kedua akan menyimpang pada perubahan pertama, dan judul yang tidak
cocok dengan menu yang tersorot membuat orang mengira ia salah halaman.

Subhalaman (`/admin/undian/kontrol`, `/admin/display/reveal`) menyimpan judulnya
sendiri di konten karena lebih spesifik daripada label induknya — tetapi sebagai
`<h2>`, supaya tetap satu `<h1>` per halaman.

**Aksi khusus satu halaman tidak masuk ke bilah.** Bilah milik shell dan sama di
semua halaman; menaruh "Refresh" di sana membuatnya berbeda lagi per halaman.
Aksi halaman duduk sebaris dengan deskripsi, di blok pembuka konten.

### Bilah dan navigasi samping harus terbaca sebagai satu bidang

Tiga aturan, semuanya lahir dari keluhan nyata bahwa kiri dan atas "terlihat
seperti dua rancangan berbeda":

1. **Satu tone.** Rel navigasi memakai `surface-container`, tone yang sama
   dengan latar shell, sehingga keduanya menjadi satu bingkai. Dulu rel memakai
   `surface-container-low` sementara bilah naik ke `surface-container` saat
   digulir, dan keduanya bertemu di satu sudut — terbentuk huruf L dari dua
   warna yang tidak pernah menyatu.
2. **Satu tinggi.** Kepala drawer dikunci 64px, sama dengan bilah, supaya nama
   produk dan judul halaman duduk di garis dasar yang sama.
3. **Satu header.** Drawer tidak lagi menulis "ADMIN WORKSPACE", dan nama event
   di subjudul bilah disembunyikan pada `lg` ke atas — di sana drawer sudah
   menampilkan nama yang sama sebagai kartu besar tepat di sebelahnya.

Penyimpangan yang disengaja: lebar drawer 272px, bukan 360dp seperti spesifikasi.
Lima belas entri navigasi dengan label panjang di layar padat data lebih butuh
ruang konten daripada ruang menu.

### Bingkai dan panel

Layar admin bukan "rel di kiri, sisa ruang di kanan". Ia **bingkai** (rel
navigasi, `surface-container`) yang memuat sebuah **panel** (`surface`) dengan
sudut kiri-atas membulat `28px` — pola pane pada layout adaptif M3.

Tanpa itu, satu-satunya sudut siku 90° yang tersisa di seluruh layar admin
justru sudut paling besar dan paling sering dilihat, sementara setiap wadah di
dalamnya sudah membulat.

Tiga hal yang saling mengunci di sini, dan mengubah salah satunya akan merusak
dua lainnya:

- Latar shell **harus** setone dengan rel. Ia yang mengintip di takik sudut;
  kalau setone dengan panel, lengkungannya tidak terlihat sama sekali.
- Bilah atas ikut dibulatkan di sudut yang sama. Ia elemen teratas di dalam
  panel, jadi sudut sikunya akan menonjol menutupi lengkungan panel. Dua
  `rounded-tl` lebih murah daripada `overflow: hidden` pada panel — yang akan
  mematahkan `position: sticky` milik bilah.
- Bilah **tidak pernah berubah warna**, termasuk saat digulir. Ini penyimpangan
  sadar dari spesifikasi, dan alasannya bentuk: bilah adalah bagian ATAS panel,
  jadi begitu warnanya berbeda dari panel ia terbaca sebagai kepingan terpisah —
  takik membulat di atas, tepi lurus tepat di bawahnya, garis putus di antaranya.
  Isyarat gulirnya dipindah ke garis rambut `outline-variant` di tepi bawah.

Pilihan yang DITOLAK, supaya tidak dicoba lagi:

- *Membulatkan tepi bawah bilah.* Itu menjadikan bilah pita mengambang yang
  terpisah dari panel — kebalikan dari menyambungkan keduanya.
- *Menjadikan panel wadah gulirnya sendiri* (`h-dvh` + `overflow-y-auto`).
  Ini yang paling setia pada layout panel M3 dan membuat sudut membulat tetap
  terlihat saat digulir, tetapi dokumen berhenti menjadi elemen yang bergulir —
  dan pemulihan posisi gulir milik App Router bekerja pada dokumen, jadi
  berpindah menu akan mendarat di tengah halaman, bukan di atas.

## Grid halaman

**Satu grid untuk semua layar admin: `mx-auto max-w-[1440px]`**, sama persis
dengan grid isi top app bar. Judul di bilah dan konten di bawahnya selalu
berbagi satu tepi kiri, di lebar layar mana pun.

Dulu ada enam angka lebar yang berbeda — `3xl`, `5xl`, `6xl`, `900px`, `1200px`,
`1440px` — semuanya `mx-auto`. Karena tiap halaman punya lebar sendiri dan
semuanya dipusatkan, tiap halaman juga punya tepi kiri sendiri, dan tak satu pun
segaris dengan judul bilah. Berpindah menu terasa seperti berpindah aplikasi.

**Lebar TIDAK diseragamkan, titik mulainya yang diseragamkan.** Lebar harus ikut
jenis konten:

| Konten | Perlakuan |
| --- | --- |
| Tabel, daftar, grid kartu | Isi penuh grid 1440 |
| Prosa dan formulir | Kolom baca sempit di DALAM grid, rata kiri |

Kolom baca dipasang lewat `[&>*]:max-w-3xl` pada containernya — menyempitkan
anak-anak langsungnya tanpa memindahkan containernya, jadi tepi kirinya tetap
di grid yang sama. Settings memakai `3xl`, panel kontrol Papan peringkat `900px`.

Angkanya bukan selera: paragraf `body-medium` di 768px sudah ~100 karakter per
baris. Dipaksa ke 1440px ia menjadi ~190 karakter, dan mata kehilangan awal
baris berikutnya. Ruang kosong di kanan lebih murah daripada teks yang tidak
terbaca.

## Batang gulir

M3 tidak menetapkan komponen batang gulir, tetapi batang bawaan sistem adalah
satu-satunya bagian antarmuka yang tidak ikut tema — abu-abu tebal bersudut siku
di atas kanvas bernada biru, dan di mode gelap Chrome menggambar jalur abu
terang yang lebih mencolok daripada isinya.

- Tipis, jalur transparan, batang `outline` dengan sudut penuh.
- Memakai properti standar `scrollbar-width`/`scrollbar-color`. Sejak Chrome 121
  keduanya **tidak bisa** dipakai bersama `::-webkit-scrollbar`: begitu properti
  standar ada, seluruh aturan webkit diabaikan. Versi webkit-nya duduk di balik
  `@supports not (scrollbar-color: auto)` sebagai cadangan Safari lama saja.
- Warnanya `outline`, bukan `outline-variant`. Batang gulir adalah kontrol, dan
  WCAG 1.4.11 menuntut 3:1; `outline-variant` hanya ~2:1. Terukur 4.5:1 di
  terang, 3.8:1 di gelap.
- **Tidak ada keadaan hover.** `scrollbar-color` diwariskan dan `:hover` juga
  cocok ke semua leluhur, jadi kursor di mana pun akan menyalakan batang gulir
  dokumen — yang tersisa hanya satu warna yang selalu "aktif".

## Aturan komponen

- **Pakai primitif.** Kelas tombol yang ditulis tangan adalah bug yang menunggu.
- Target sentuh utama: tinggi minimal `64px` (`<Button size="xl">`).
- Semua target interaktif: minimal `48px`.
- Label di atas kolom isian. Teks galat di bawahnya.
- Satu aksi utama yang jelas per layar operasional — satu `variant="filled"`.
- Ikon memakai `@phosphor-icons/react`, bobot goresan konsisten. Tanpa emoji.
- Tampilan uang memakai `tabular-nums`.

## Status migrasi

Ditulis ulang penuh dengan primitif: **Login**, **Booth**, **Kasir**, **shell
Admin**, **toast**, **tombol logout**, **kerangka pencarian**.

Sisanya dipindahkan lewat penulisan ulang mekanis yang terverifikasi build:

| Sapuan | Jumlah |
| --- | --- |
| `text-white` → peran `on-*` | 115 |
| Hex tint mati → peran `*-soft` | 185 |
| Alias lama → kelas peran M3 | 2.329 |
| Ukuran teks Tailwind → skala tipe M3 | 1.038 |
| Wadah siku → skala bentuk M3 | 707 |
| `bg-black/xx` → `bg-scrim` | 14 |

Sisa yang **sengaja** dibiarkan siku: pembungkus se-viewport (`min-h-dvh`),
header dan bilah yang menempel di tepi layar, pemisah setinggi 1px, dan isian
batang progres yang sudah dipotong oleh jalurnya.

Pola "grid garis rambut" — `grid gap-px` di atas latar `outline-variant`, supaya
celah 1px terbaca sebagai garis — dihapus di 20 tempat. Trik itu tidak bisa
hidup bersama sudut membulat: tiap pojok anak menyisakan segitiga warna garis.
Diganti kartu terpisah dengan jarak sungguhan, yang juga cara M3 menyatakannya.

Yang belum: layar admin yang dalam (undian, rundown, seat-map, vote) masih
memakai tata letak lamanya — warnanya, tipografinya, dan bentuknya sudah M3,
tetapi belum memakai `Card`/`PageHeader`/`EmptyState`. Pindahkan saat menyentuh
berkasnya, bukan sebagai proyek tersendiri.

## Semantik status

| Status | Perlakuan visual | Teks/ikon wajib |
| --- | --- | --- |
| Tersedia | `bg-success-container` `text-on-success-container` | Ikon centang + `ITEM DISKON TERSEDIA` |
| Sudah diambil | `bg-inverse-surface` `text-inverse-on-surface` | Ikon X + `SUDAH DIAMBIL` |
| Menunggu | `bg-warning-container` `text-on-warning-container` | Ikon jam + `BELUM LUNAS` |
| Lunas | `bg-success-container` `text-on-success-container` | Ikon centang + `LUNAS` |
| Luring | `bg-error` `text-on-error`, spanduk menetap | Ikon peringatan + `OFFLINE — JANGAN BUAT ORDER` |
| Void | `bg-error-container` `text-on-error-container` | Ikon X + `VOID` |

## Profil layar

### Booth

Ponsel potret. Jaga identitas peserta, status diskon, formulir order, progres, dan
aksi utama dalam satu jalur baca. Blok status tinggi minimal `100px`. Kepala
selalu menampilkan booth, staf, dan chip mode pengambilan. Layar sukses memakai
bidang penuh `success-container` dan kode stiker besar.

### Kasir

Tablet potret/lanskap. Buat order terpilih dan grand total mendominasi. Total
harus tetap terlihat saat kode persetujuan diketik. Status centang, metode
pembayaran, dan keadaan tombol nonaktif harus tidak ambigu.

### Admin

Tata letak responsif berbasis tabel. Desktop memakai rel navigasi menetap dan
penyaring padat. Mobile melipat penyaring ke dalam laci. Sediakan keadaan kosong,
memuat, dan galat; jaga keterbacaan tabel tanpa menaruh setiap baris di dalam
kartunya sendiri.

### Layar sapa

TV atau proyektor di dekat pintu masuk, **melintang atau berdiri** — orientasinya
disetel di CMS, bukan ditebak dari lebar viewport (panel yang dipasang berdiri
sering tetap melaporkan 1920×1080 dan memutar gambarnya di perangkat keras).

Satu nama menempati bidang tengah selama beberapa detik, sebesar yang muat.
Bukan daftar bergulir: yang menatapnya sedang berjalan masuk sambil membawa tas
dan hanya mencari satu hal — namanya sendiri. Deretan "baru saja masuk" di
bawahnya menjaga layar tetap hidup di antara dua kedatangan.

Semua ukuran memakai `vmin` lewat `scaleClamp()`, sama seperti denah LED, supaya
satu setelan melayani panel 1080×1920 sampai proyektor 1920×1080 tanpa disetel
ulang saat pemasangan. Muat pertama **tidak pernah** menyapa siapa pun — layar
yang dibuka ulang di tengah acara akan menyambut orang yang sudah lama duduk.

**Beberapa meja, beberapa layar.** Jalur registrasi (`attendance_lanes`) adalah
MEJA, sedangkan sesi kehadiran adalah TAHAP — keduanya tegak lurus, dan
menjadikan lima meja sebagai lima sesi akan memecah jumlah hadir menjadi lima
angka yang harus dijumlahkan sendiri.

Layar yang belum punya meja menampilkan kode enam angka, dan petugas di meja itu
mengklaimnya dari `/scan`; token perangkat disimpan di localStorage sehingga TV
yang dimuat ulang tetap terpasang. Pola dan alasannya sama dengan perangkat lunak
digital signage: tidak ada alamat panjang yang harus diketik dengan remote TV,
dan yang berhak memasang adalah orang yang bisa MELIHAT kodenya. Acara satu meja
tidak pernah melihat lapisan ini — tanpa jalur, layar menyapa semua orang.

### Papan peringkat

Lanskap 1920×1080. Kanvas gelap tetap, teks terang, angka besar, hierarki
kiri/kanan kuat. Animasi terbatas pada perubahan peringkat dan gerak ticker.
Hormati `leaderboard_enabled` dan parameter kueri layar penuh.

## Titik uji responsif

Validasi di `375px`, `768px`, `1024px`, `1440px`, dan `1920×1080`. Uji potret dan
lanskap, area aman, zoom/teks terbesar, fokus papan ketik, **kedua tema**, dan
kontras proyektor gelap.

## Keadaan yang wajib ada

Setiap alur penting perlu kerangka pemuatan, keadaan kosong, galat sebaris,
keadaan luring, keadaan izin ditolak, keadaan nonaktif, keadaan sukses, dan
perilaku coba-lagi di mana ada panggilan jaringan.
