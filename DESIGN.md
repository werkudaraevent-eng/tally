# Tally design system

## Dasar desain

Satu aturan per jenis layar. Bila dua sumber bertentangan, kolom terakhir yang menang.

| Layar | Dasar | Menang bila bertentangan |
| --- | --- | --- |
| Ruang kerja admin (`/admin/*`, `/events`, `/users`, `/login`) | Tata letak dan aturan pakai M3 (canonical layout, margin 24px, satu aksi utama, kapan tabs / segmented / chip / dialog) dengan tampilan dasbor Cloudflare (panel putih bergaris tipis di kanvas abu muda, teks 14px, sentence case, tanpa border + bayangan sekaligus). Inter, kontrol 36px. Rinciannya: "Tata letak M3, tampilan Cloudflare". | Cloudflare untuk tampilan, M3 untuk struktur |
| Halaman acara publik dan area peserta | Peran warna dan skala tipe M3, memakai tema acara yang dipilih panitia di CMS. Target sentuh 48px. | Tema acara |
| Booth, kasir, pemindai | M3 lapisan tenang, target 48px, dipakai sambil berdiri. | M3 |
| Layar panggung (undian, voting, papan peringkat, sapa) | M3 lapisan ekspresif. | M3 |

WCAG 2.2 AA mengalahkan semua yang di atas. Penyimpangan dari M3 ditulis di bab
tempat ia berlaku (mis. bobot judul 600, kontrol admin 36px).

Acuan resmi M3: <https://m3.material.io>. Kalau ada nilai di dokumen ini yang
terlihat sewenang-wenang, kemungkinan besar ia berasal dari spesifikasi; cari
nama tokennya di situs itu sebelum menggantinya.

## Karakter produk

Platform untuk menjalankan acara langsung, dari undangan sampai laporan. UI harus membantu
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

### Palet netral berkroma nol

`Variant.VIBRANT` memberi kroma pada palet netralnya supaya permukaan "terasa
sekeluarga" dengan warna sumber. Diukur di keluaran generator, harganya nyata:
`surface` #F9F5FF (hue 264), `outline-variant` #ABA9D7 (hue 243, saturasi 37%),
dan **38 dari 73 token terang** duduk di hue 220-300. Yang terlihat bukan
"sekeluarga", melainkan lavender.

Generator sekarang memaksa `neutralPalette` dan `neutralVariantPalette` ke
kroma 0. Seluruh peran permukaan, garis, dan teks jadi abu murni; `primary`,
`secondary`, `tertiary`, dan `error` tidak disentuh karena mereka memang warna.

Masalah ini tersembunyi selama semua yang dirender berada di dalam
`<div class="press">`, yang menimpanya. Ia muncul kembali begitu menu pindah ke
portal `document.body` dan keluar dari jangkauan penimpaan itu. Itu yang
membuat pelajarannya penting: **penimpaan bukan perbaikan.**

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
| `Dialog` | Lapisan gelap + panel, fokus terkunci, Escape dan klik luar menutup, fokus kembali ke pembukanya. `dismissible={false}` selama aksi berjalan. Tombol kirim formulir di slot `actions` memakai atribut `form` |
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

- Huruf antarmuka: Inter, di-self-host lewat `next/font/local` (`src/app/fonts.ts`),
  terpasang sebagai `--md-ref-typeface-brand` dan `--md-ref-typeface-plain`.
  Geist Mono hanya untuk `--font-mono`. Halaman acara memakai huruf pilihan panitia.
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

### Yang sudah terpasang, dan di mana

`MotionProvider` di layout akar memasang `reducedMotion="user"` (Framer Motion
ikut mematikan gerak transform/layout saat sistem memintanya) dan `LazyMotion`
dengan `domMax` yang dimuat malas — komponen `m.*` di halaman publik tidak
membawa mesin animasi di muatan awal. Layar panggung tetap memakai `motion.*`.

Utilitas CSS di `globals.css`, untuk komponen server dan layar kerja:

| Kelas | Untuk |
| --- | --- |
| `rise-in` + `--rise-delay` | Koreografi masuk sekali saat muat (hero halaman acara). Emphasized-decelerate, 500ms |
| `rise-in-fast` | Versi tenang 300ms untuk layar kerja: kartu login, hasil pencarian, galat sebaris |
| `settle-in` | Gambar hero (KV) mengendap dari skala 1,045 |
| `scan-flash` | Satu kedipan pada hasil yang bisa identik dengan sebelumnya (pindai, order, lunas) |
| `seat-pulse` | Tiga denyut cincin pada kursi hasil pencarian denah |
| `details.faq` | Isi `<details>` membuka dengan tinggi teranimasi, hanya di balik `@supports (interpolate-size)` |

Pola Framer Motion yang dipakai berulang:

- `layoutId` untuk indikator yang berpindah: tab (`Tabs`), pil navigasi admin,
  garis penanda nav halaman acara, batang "sedang berlangsung" di rundown.
- `AnimatePresence` untuk yang muncul dan hilang: dialog, menu, toast, spanduk
  luring, nama di layar sapa, chip "baru saja masuk".
- Motion value + `animate()` untuk gerak yang berganti sumber di elemen yang
  sama: roda undian (putaran linear → luncuran melambat ke segmen pemenang),
  nominal papan peringkat (bergulir ke nilai baru).
- `MENU_MOTION` (`src/lib/m3/menu-motion.ts`) untuk menu: tumbuh dari sudut
  tombolnya, 120ms, tanpa pegas.

Di balik `prefers-reduced-motion`, pemintal dan batang tak-tentu **tetap
berputar**. Mereka status, bukan hiasan, dan pemintal yang beku terbaca
sebagai ikon rusak.

## Lapisan status

M3 tidak menggelapkan tombol saat hover. Ia menumpuk lapisan tipis warna `on-*`
di atasnya: hover 8%, fokus 10%, ditekan 10%, diseret 16%.

Pasang kelas `.m3-state` pada elemen interaktif. Satu aturan itu berlaku untuk
semua warna tombol, termasuk yang belum ada.

Cincin fokus global: garis luar 2px dengan celah 2px dan halo 4px (18%), hanya
pada `:focus-visible` — muncul saat berpindah dengan papan ketik, tidak saat
disentuh. Warnanya `--cincin-fokus`, bawaannya `primary`. Wadah yang latarnya
membuat `primary` di bawah 3:1 menimpa variabel itu, bukan aturan cincinnya:
Horizon memakai tinta navy di bidang terang, emas Tema (atau putih bila emas di
bawah 3:1) di bidang navy (`CINCIN_NAVY`), dan kembali ke tinta di bidang putih
di dalam bidang navy (`CINCIN_PUTIH`).

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

**Satu grid untuk semua layar admin: `mx-auto max-w-[1400px]`** (`page-shell.tsx`, `workspace.tsx`), sama persis
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
| Tabel, daftar, grid kartu | Isi penuh grid 1400 |
| Prosa dan formulir | Kolom baca sempit di DALAM grid, rata kiri |

Kolom baca dipasang lewat `[&>*]:max-w-3xl` pada containernya — menyempitkan
anak-anak langsungnya tanpa memindahkan containernya, jadi tepi kirinya tetap
di grid yang sama. Settings memakai `3xl`, panel kontrol Papan peringkat `900px`.

Angkanya bukan selera: paragraf `body-medium` di 768px sudah ~100 karakter per
baris. Dipaksa ke 1400px ia menjadi ~190 karakter, dan mata kehilangan awal
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

### Halaman acara (publik)

`/e/<slug>`, dibuka tamu dari undangan dan QR. Nuansa **tenang dan editorial**:
tipografi yang membawa halaman, bukan kartu, bayangan, atau gerak.

- **Huruf judul dipilih admin** (`heading_font`, bawaan Playfair Display) dari
  enam huruf yang sudah dimuat aplikasi: Playfair Display, Inter, Montserrat,
  Oswald, Space Grotesk, Source Sans 3. Dipakai untuk nama acara, judul bagian, nama pembicara,
  dan angka penting lewat `--landing-heading`. Isi dan kontrol tetap Inter.
  Tidak ada huruf bebas atau unggahan huruf: tiap huruf tambahan diunduh setiap
  tamu dan bisa gagal dimuat di jaringan venue.
- **Ukuran judul** tiga patokan (`heading_scale`): Sedang 64px, Besar 80px,
  Sangat besar 104px di layar lebar; 40/44/48px di ponsel.
- **Gambar hero (KV).** "Warna asli" memasang KV selebar layar dengan bayangan
  hitam dari bawah (82% ke 30%) dan teks putih, isi hero rata bawah. "Menyatu
  tema" melebur KV ke warna halaman dan teks tetap warna tema. Tanpa KV, hero
  adalah bidang warna halaman.
- **Hero:** baris tanggal, nama acara, tagline, tombol (daftar, lihat susunan
  acara, tambah ke kalender), dan kolom fakta di kanan: jam tiap bagian rundown
  lalu tempat, dipisah garis rambut. Tanggal tidak diulang di kolom fakta.
- **Bagian:** judul di rel kiri yang menempel, isi di kanan, garis rambut
  sebagai pemisah. Susunan acara dan Pembicara memakai judul di atas isi selebar
  grid. Susunan acara bertab per bagian rundown (vertikal di layar lebar,
  mendatar di ponsel). Pembicara: yang ditonjolkan jadi kartu besar, sisanya
  kisi dengan inisial bila tanpa foto.
- Tombol bersudut `rounded-md`, tinggi 52px di hero. Nav selalu menempel di atas;
  jangkar bagian hanya di `xl` ke atas.
- Warna tetap dari tema acara (`--reg-*`). Tidak ada animasi saat digulir; gerak
  satu-satunya adalah `rise-in` hero saat muat dan `settle-in` pada KV.
- **Tata letak Modern** (`landing_config.layout = "modern"`, pilihan di CMS tab
  Tampilan; Editorial tetap bawaan). Dari Figma "Desktop — PRIMA 2026 (v2)":
  nav gelap netral menumpang di atas KV selebar layar, chip fakta (tanggal, jam,
  tempat), kartu Program dari bagian rundown (jam + jumlah sesi), kartu
  pembicara 3:4 dengan bayangan hitam, susunan acara bertab pil, FAQ berkartu,
  banner ajakan, kaki gelap (primary dicampur hitam). Tombol dan chip
  `rounded-full`, kartu `rounded-lg`/`rounded-md`. Urutan bagian tetap; saklar
  bagian tetap berlaku. Tanpa KV, bidang hero dan banner memakai `primary` dengan
  teks `on-primary`; teks putih hanya di atas gambar yang dibayangi hitam. Huruf
  judul bawaannya Source Sans 3 (pilihan keenam `heading_font`).

### Area peserta

`/e/<slug>/masuk` dan `/e/<slug>/peserta`, dinyalakan di CMS Halaman acara, tab
Peserta. Memakai tema dan huruf judul halaman acara, jadi bagi tamu ia bagian
dari halaman yang sama.

- Masuk dengan email pendaftaran + kata sandi. Kata sandi dibuat sendiri dengan
  email + kode peserta (jalur yang sama untuk lupa kata sandi). Belum ada email
  aktivasi.
- Isi diambil dari data yang sudah ada: kode QR (`participants.qr_code`), kursi
  (`participants.seats`), rundown, dan halaman voting dengan kode terisi.
  Disebut "Susunan acara", bukan "Jadwal Anda": tidak ada data jadwal pribadi.
- Akun peserta terpisah dari akun panitia (`participant_accounts`,
  `participant_sessions`); tidak ada jalur dari sesi peserta ke layar admin.

#### Kartu di portal Horizon: skala dan irama

Diputuskan Oktober 2026 dari halaman Perjalanan (pola Trip.com "All bookings"):
yang membuat kartu terasa berantakan bukan warna, tetapi terlalu banyak ukuran
huruf dan jarak yang acak. Aturan ini berlaku untuk setiap kartu putih di
portal Horizon: Beranda, Outfit, Perjalanan, Pengumuman, dan Menu. Baris
Susunan acara sudah 16/14 dan memakai bentuknya sendiri. Blok panitia hanya
ikut sudut dan padding-nya (lewat variabel `--kartu-sudut` dan `--kartu-pad`,
jadi dasbor lain tidak berubah); ukuran hurufnya tetap milik blok, karena blok
yang sama dipakai preset lain.

- **Kepala kartu.** Ikon 22 px + jenis kartu (16/24, 600) di kiri, satu
  keterangan di kanan (14/20, 500: tanggal, jumlah, atau keadaan), garis tipis di
  bawahnya. Jarak 16 px di atas dan di bawah garis. Jenis kartu dibedakan oleh
  ikon dan namanya, tidak oleh warna.
- **Lima ukuran saja di isi kartu:**

  | Peran | Ukuran / tinggi baris | Bobot | Contoh |
  | --- | --- | --- | --- |
  | Judul isi | 18/24 | 700 | Nama hotel, nama bus, rute kereta, jam bus |
  | Kepala, nilai kunci | 16/24 | 600 | "Bus", "Kamar 1208 · Lantai 12", nama agenda |
  | Keterangan | 14/20 | 400 | Alamat, check-in, titik kumpul |
  | Tautan | 14/20 | 600 | "Buka peta", "Simpan ke kalender" |
  | Alis | 12/16 | 600 | "Berangkat · Kam, 5 Nov", tanggal di daftar bus |

  18/24 sengaja di antara `title-medium` dan `title-large`: 22 px terlalu keras
  di layar 390 bila ada tiga kartu berderet. Dua pengecualian yang disengaja:
  judul kartu sorotan "Berikutnya" di Beranda 22/28 (satu per halaman, yang
  pertama dibaca), dan kartu tiket navy (pass perjalanan, kartu identitas di
  Menu) yang memakai angka besar seperti boarding pass. Keduanya tetap bersudut
  16 px.
- **Tiga jarak saja:** 4 px antar-baris satu kelompok, 12 px antar-kelompok,
  16 px antar-bagian kartu (dan padding kartu: 16 ponsel, 24 tablet ke atas;
  sudut 16 px).
- **Kepala kartu di semua kartu putih**, termasuk Checkpoint, Dresscode,
  Perjalananmu, Pengumuman ("Pengumuman" di kiri, waktunya di kanan), Butuh
  bantuan, Data diri, dan Darurat (satu-satunya kepala merah). Tanpa ubin ikon.
- **Kalimat, bukan kisi label/nilai.** "Check-in Kam, 5 Nov · 14.00", bukan
  label "Check-in" di atas nilai. Satu fakta kunci per kartu boleh masuk strip
  abu (`LATAR_STRIP`, 12 px sudut) supaya mudah ditemukan saat di lobi.
- **Tautan tidak menambah jarak.** Area ketuk tetap 48 px, tetapi kelebihannya
  ditarik balik (`-my-3.5`), jadi barisnya berjarak seperti teks biasa.
- **Halaman Profil seperti halaman akun** (Trip.com Account, Grab, Google
  Account; versi C, disetujui Mas 25 Okt). Tanpa judul halaman: avatar 56,
  nama 22/28, dan "Lihat data diri ›" langsung di pita navy, lalu ubin ringkas
  148 px (176 di desktop; ikon emas, nilai 16/24, keterangan 12/16) untuk
  checkpoint, kamar, dan bus. Setiap ubin hanya muncul bila datanya ada, dan
  status pendaftaran bukan ubin. Kartu QR satu baris menumpang 32 px di tepi
  pita (QR 48, kode 18/24 tidak pernah patah, "Tampilkan ›" di kanan). Di
  bawahnya daftar datar tanpa kartu di latar halaman: lingkaran ikon 40
  (`#EEF1F6`, hijau untuk WhatsApp, merah untuk Keluar), judul 16/24,
  keterangan 14/20, panah, baris 56. Kelompok dipisah garis dan berjudul 16/24
  ("Bantuan"). Kartu darurat tetap terbuka di kelompok Bantuan, tidak di balik
  ketukan. Data diri punya halaman sendiri (`?tab=profil&lihat=data`) dengan
  baris label dan nilai. Avatar di kepala portal membuka halaman ini.
- Kelasnya ada di `portal-horizon.tsx` (`KELAS_JUDUL_ISI`, `KELAS_KET`,
  `KELAS_ALIS`, `KELAS_TAUTAN`, `KELAS_STRIP`). Kartu baru memakainya, bukan
  ukuran sendiri.

### Papan peringkat

Lanskap 1920×1080. Kanvas gelap tetap, teks terang, angka besar, hierarki
kiri/kanan kuat. Animasi terbatas pada perubahan peringkat dan gerak ticker.
Hormati `leaderboard_enabled` dan parameter kueri layar penuh.

## Press — ruang kerja panitia

Profil permukaan ruang kerja panitia. Dipakai di `/admin/*` (lewat `AdminShell`),
`/events`, `/login`, dan dua halaman panduan yang tanpa login tetapi pembacanya
staf, bukan tamu: `/panduan` dan `/panduan/sistem`.

**Halaman tamu tidak memakainya.** `/e/<slug>`, `/daftar`, `/kode/<token>`,
`/rundown`, `/denah`, dan `/join` tetap memakai peran M3 dan tema per-acara yang
dipilih panitia di CMS. Halaman-halaman itu dirancang per event, dan satu gaya
tetap untuk semuanya justru melawan tujuannya.

Membawa kertas dan tinta, **dalam dua mode**. Layar
ini dipakai berjam-jam, sering di ruang panitia yang lampunya diredupkan; mode
gelapnya bukan hiasan, dan mengunci ruang kerja ke kanvas terang berarti
mencabut satu-satunya penyesuaian yang benar-benar dipakai orang di sini. Jadi
di gelap kertas menjadi tinta dan sebaliknya — bukan kertas yang diredupkan.

### Isi profilnya

`.press` di `src/app/globals.css` menimpa variabel `--press-*` per mode (terang,
gelap, kontras tinggi) dan memetakannya ke peran M3 sekali saja. Nilai yang
berlaku selalu yang ada di file itu; dokumen ini tidak menyalin hex-nya.

| Token | Jadi |
| --- | --- |
| `--md-sys-shape-corner-*` | Dipadatkan: 4px sampai 16px (`full` tetap bulat) |
| `--md-sys-elevation-level1`, `level2` | `none`; level 3 ke atas (dialog, menu, sheet) tetap berbayang |
| Permukaan, `on-surface*`, `outline*` | Kanvas abu sangat muda, panel putih, tinta netral |
| `primary` | Biru `#1a56c4` di mode terang, `#6699ff` di mode gelap; satu-satunya aksen |
| `error`, `success`, `warning` | Tidak disentuh: status bukan hiasan |

Setiap kali nilai `--press-*` diganti, ukur ulang kontras tinta dan garis
terhadap kanvas dan panel (WCAG: teks 4.5:1, garis dan kontrol 3:1).

### Rel navigasi

Sumbernya satu: `src/components/admin/nav-config.ts`. Empat yang membacanya —
daftar menu, rel terlipat, palet perintah, dan pencarian judul halaman yang
mengisi `PageHeader`. Menambah menu berarti menyunting satu array.

**Penanda aktif: bidang abu, tanpa rusuk berwarna.** Rusuk 4px di tepi kiri
pernah ada di sini, dan alasannya masuk akal saat itu: `secondary-container`
biru-muda nyaris tidak terbaca di atas kanvas terang, jadi keterbacaannya
ditanggung rusuk. Yang menyelesaikannya ternyata bukan rusuk, melainkan membuang
birunya: `#EDEDED` di atas `#FAFAFA` terbaca sendiri, dan satu garis vertikal
berwarna di rel yang juga punya garis tepi dan garis sub-menu adalah garis
ketiga yang bersaing dengan dua yang punya tugas.

**Tajuk kelompok tanpa garis pemisah.** Lima garis di satu rel setinggi layar
membuat sidebar terbaca sebagai formulir. Yang membedakan tajuk dari tujuan
sekarang: abu tersier, bobot 500, dan jarak 16px di atasnya.

### Sematan dan intip

Tombol di kaki rel adalah tombol **sematan**, bukan tombol lipat. Perbedaannya
bukan penamaan: ia memisahkan dua keadaan yang sebelumnya satu.

| | `pinned` | `peeking` |
| --- | --- | --- |
| Asalnya | ditekan orang | kursor atau fokus papan ketik |
| Umurnya | cookie, setahun | selama kursor di rel |
| Lebar rel | 260px | 260px |
| Lebar kolom konten | mengikuti | **tidak berubah** |

Baris terakhir itu seluruh fiturnya. Rel yang tidak disematkan melebar **di
atas** konten, dengan bayangan di tepi kanannya; halaman di bawahnya tidak
bergeser dan tidak mengalir ulang. Kalau keduanya digabung jadi satu
"collapsed", setiap kali kursor menyerempet tepi kiri layar seluruh halaman
melompat 196px, dan sidebar yang "membantu" menjadi sidebar yang dihindari.

Jedanya 150ms membuka, 280ms menutup. Yang pertama menyaring kursor yang sekadar
lewat ke tepi layar; yang kedua memberi waktu kembali setelah keluar sedikit.
Peek ditahan selama panel pemilih acara terbuka atau fokus papan ketik ada di
dalam rel, dan dilepas oleh navigasi, palet perintah, atau Esc.

Rel lebar dan rel ikon merender **DOM yang sama**. Yang berubah hanya lebarnya;
label, chevron, dan sub-menu disembunyikan CSS lewat `[data-rail="1"]`. Dua
pohon React yang berbeda akan memasang ulang daftar menu setiap kali rel
melebar, dan posisi gulir beserta akordeon yang terbuka ikut hilang bersamanya.

| | Lebar | Rel ikon |
| --- | --- | --- |
| Lebar | 260px | 64px |
| Item | 36px, ikon 18px + label 14px | tombol 40x40, ikon saja |
| Tajuk kelompok | teks abu tersier | garis pendek 32px |
| Sub-menu | akordeon, garis tegak di kiri | tersembunyi; intip yang menggantikannya |

Lebar kolom konten diturunkan sebagai `--rail-w` di elemen `.admin-shell`, dan
**hanya membaca `pinned`**. Sebelumnya angkanya ditulis dua kali, di TSX dan di
CSS.

Keadaan yang bertahan melewati reload: **sematan di cookie**, kelompok yang
terbuka dan "terakhir dibuka" di `localStorage`. Cookie, bukan `localStorage`,
untuk yang pertama: ia menentukan lebar tata letak, dan nilai yang baru terbaca
setelah hidrasi berarti setiap pemuatan halaman dimulai dengan lebar yang salah
lalu melompat. Dua yang terakhir dibaca lewat `useSyncExternalStore`
(`src/lib/local-store.ts`), bukan disalin ke state.

### Cincin fokus di kolom cari

Ada tepat satu pengecualian terhadap cincin fokus global, dan kelasnya ditulis
eksplisit: `.m3-search-field`, dipakai kolom cari di pemilih acara dan di palet
perintah. Keduanya menerima fokus **otomatis saat permukaannya dibuka**, bukan
karena ada yang menekan Tab, jadi cincin 3px di sana hanya melingkari
satu-satunya elemen yang sudah pasti aktif. Penanda fokusnya tetap ada dan lebih
tepat: kursor teks yang berkedip.

Kolom isian biasa di dalam dialog tetap bercincin. Di sana fokus berpindah antar
kolom, dan orang perlu tahu ia sedang di mana.

### Ramp tipe padat

Skala M3 di `@theme inline` adalah ramp **Compact** — ukuran yang ditetapkan
spesifikasi untuk jendela ponsel. Ruang kerja adalah jendela Expanded/Large yang
dipakai duduk dengan tetikus, dan panduan adaptif M3 sendiri menyuruh
menyesuaikan ukuran teks serta kepadatan per window size class. Ramp di bawah
adalah penyesuaian itu, bukan penyimpangan darinya.

| Peran | Bawaan | `.press` | Peran | Bawaan | `.press` |
| --- | --- | --- | --- | --- | --- |
| display-large | 57 | 40 | body-large | 16 | **14** |
| display-medium | 45 | 32 | body-medium | 14 | 14 |
| display-small | 36 | 28 | body-small | 12 | 12 |
| headline-large | 32 | 24 | label-large | 14 | 13 |
| headline-medium | 28 | 20 | label-medium | 12 | 12 |
| headline-small | 24 | 18 | label-small | 11 | 11 |
| title-large | 22 | **16** | | | |
| title-medium | 16 | 14 | | | |
| title-small | 14 | 13 | | | |

Ramp hasilnya: **11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40**.

`body-medium` sengaja **tidak** diubah: ia 49% dari seluruh teks ruang kerja dan
14px memang ukuran yang benar untuk isi tabel. Yang membuat layar terasa besar
adalah `body-large` di kolom isian dan `title`/`headline` di kepala.

Jarak huruf positif milik M3 (0.015–0.031rem) dinolkan di bawah 16px. Sebelum
ini ada **dua belas** nilai `tracking-[...]` tangan yang tidak seorang pun
memilihnya secara sadar; jarak huruf sekarang milik peran, bukan milik tempat
pemakaian. Pengecualiannya satu, `.press .ed-tracked`, untuk kolom yang jaraknya
memang punya alasan (saat ini label "Tally" di halaman login). Kalau daftar itu tumbuh, yang salah rampnya.

**Kenapa menimpa kelas, bukan token.** Terukur di CSS hasil build: `@theme
inline` MENYALIN nilai literal untuk tipografi —

```
.text-body-medium { font-size: .875rem; … }        <- literal
.bg-surface       { background-color: var(--…) }   <- var
```

jadi menimpa `--text-*` di dalam `.press` tidak berpengaruh sama sekali, berbeda
dengan warna dan bentuk. Yang bekerja adalah menimpa kelas utilitasnya langsung;
aturannya tidak berlapis sedangkan utilitas Tailwind ada di `@layer utilities`.
`@property --tw-tracking` juga `inherits: false`, jadi menyetelnya di induk tidak
menular. Di seluruh ruang kerja hanya ada satu varian responsif tipe
(`sm:text-headline-large`), dan ia dibungkus media query yang sama dengan aslinya.

### Utilitas label

Didefinisikan di `src/app/globals.css`, tidak berlapis sehingga mengalahkan
utilitas Tailwind.

| Utilitas | Isi |
| --- | --- |
| `ed-label` | 12/16, bobot 600, jarak normal: nama kolom, judul kelompok, keterangan. Ukurannya terkunci |
| `ed-num` | Lebar-tetap, angka rata: jam, nominal, kode |
| `ed-plain` | Huruf antarmuka untuk label yang datang dari DATA (nama sesi, kolom buatan admin, nama hadiah) |
| `ed-tracked` | Jalan keluar jarak huruf (`.press .ed-tracked`); saat ini satu pemakaian, label "Tally" di halaman login |

`ed-label` berhenti di kontrolnya: `.ed-label :where(input, select, textarea)`
mengembalikan huruf antarmuka untuk teks yang diketik. Kolom yang memang harus
lebar-tetap ditandai `ed-num` atau `ed-plain`, yang ditulis sesudahnya dan menang.

### Kepadatan kontrol

| Kontrol | Bawaan | `.press` |
| --- | --- | --- |
| Button sm / md / lg / xl | 40 / 48 / 56 / 64 | 32 / 36 / 40 / 48 |
| IconButton sm / md / lg | 40 / 48 / 56 | 32 / 36 / 40 |
| TextField, SelectField | 56 / 64 | 36 / 40 |
| Tabs | 48 | 40 |
| SegmentedButton | 44 | 36 |
| FilterChip / StatusChip | 40 / 32 | 32 / 24 |
| Item navigasi | 48 | 36 |
| Bilah atas, kepala drawer | 64 | 56 |
| Baris tabel | ~52 | 40 |

**PENYIMPANGAN TERCATAT** dari aturan "Semua target interaktif: minimal 48px" di
bab Aturan komponen. Aturan itu ditulis untuk layar operasional — booth dan
kasir, dipakai sambil berdiri dengan ibu jari — dan **tetap berlaku di sana**.
Ruang kerja dipakai duduk dengan tetikus, dan pada layar sepadat itu tinggi
sentuh berarti separuh layar habis sebelum ada satu baris data. WCAG 2.5.8
menuntut 24×24px, jadi 36px masih jauh di atas ambang.

Mekanismenya sama dengan `.m3-card`: kait kelas di primitif, nilainya di
globals.css. Atribut `data-size` dipakai karena satu primitif punya beberapa
ukuran — menimpa kelas `min-h-12` langsung akan ikut mengenai puluhan elemen
lain yang memakainya untuk hal lain.

### Tata letak M3, tampilan Cloudflare (rombak September 2026)

Bab ini berlaku untuk layar `/admin/*`. Bila bab lain di dokumen ini
bertentangan dengannya, bab ini yang menang.

Dua sumber, masing-masing untuk hal yang berbeda:

| Dari | Diambil | Tidak diambil |
| --- | --- | --- |
| Material Design 3 | Canonical layout, margin 24px, satu aksi utama per tampilan, aturan kapan memakai tabs / segmented / chip / dialog | Komponen dan tampilan M3 |
| Dasbor Cloudflare (Kumo) | Tampilan: panel putih bergaris tipis di kanvas abu sangat muda, teks isi 14px, tanpa bold dan tanpa tracking, sentence case, tanpa border + bayangan sekaligus, tanpa transisi warna saat hover | Tata letak dan navigasinya |

**Huruf: Inter untuk semua**, termasuk angka, kode QR, dan jam. Tanpa huruf
lebar-tetap; kolom angka memakai `tabular-nums`.

**Setiap layar memilih satu canonical layout**, lewat primitif di
`src/components/m3/workspace.tsx`:

| Layout | Primitif | Dipakai di |
| --- | --- | --- |
| Feed | `WorkspacePage width="wide"` + grid 12 kolom | Dashboard, Laporan |
| List-detail | `ListDetail` | Daftar peserta, Pendaftaran publik, Kehadiran, Transaksi, Booth & item, User & role, Undian, Voting |
| Supporting pane | `SupportingPane` | Denah kursi, Halaman acara, Rundown, Layar sapa, Papan peringkat, Label & printer |
| Satu panel | `Pane` tunggal + `Tabs` | Pengaturan, Panel operator undian |

Aturan yang mengikat semuanya:

- `WorkspaceHeader` membawa `<h1>` halaman (30px/600, judul dari
  `nav-config.ts`), satu baris meta, dan aksi halaman di kanan. Aksi utama
  (filled) paling banyak satu.
- Baris meta memuat **fakta**, bukan aksi, dan harus muat satu baris. Tautan
  aksi (sync, kelola) pindah ke tombol di area aksi; keterangan yang hanya
  relevan saat menelusuri (mis. peserta dihapus di sumber) ditaruh di tempat
  kebingungannya muncul, seperti kaki tabel atau baris itu sendiri.
- Halaman list-detail dan supporting pane memakai `WorkspacePage fill`: setinggi
  layar di `lg`, panelnya bergulir sendiri, dan `PaneFooter` menempel di bawah
  dengan aksi simpan panel itu. Di layar pendek (`short:`, tinggi ≤ 720px)
  halaman bergulir biasa: panel daftar setinggi layar dengan kepala tabel
  menempel, panel kanan menempel di bawah bilah atas, dan roda menggulir
  halaman dulu sampai judul pindah ke bilah atas.
- Panel detail **hanya muncul saat baris dipilih**. Tanpa pilihan, daftar
  memakai seluruh lebar. Di bawah `lg` detail menggantikan daftar dan membawa
  tombol tutup.
- Tabs memisahkan kumpulan konten setara; SegmentedButton memilih bagian di
  dalam satu panel; chip untuk saringan (`ChipMenu`, pilih banyak dengan cari
  dan hitungan); Dialog untuk tugas pendek dan konfirmasi berbahaya.
- Kolom tabel bisa disembunyikan lewat `ColumnMenu`. Pilihannya disimpan per
  akun per acara di `localStorage` perangkat itu (`useColumnPrefs`), jadi tidak
  ikut pindah ke perangkat lain.
- Warna: kanvas `surface`, panel `surface-container-lowest` (putih), kepala
  tabel dan kaki panel `surface-container-high`, baris hover `primary-soft`
  (abu), baris terpilih `secondary-container`, penanda aktif/terpilih
  `accent-soft` + `primary`. `primary` biru (`#1a56c4` terang, `#6699ff` gelap) adalah
  satu-satunya warna aksen.
- Status: `StatusChip` setinggi 20px, radius 4px, bertitik.
- Tanpa em dash di teks antarmuka. Sel kosong memakai en dash (`EMPTY_VALUE`).
- Acara berstatus selesai atau arsip memasang penanda di bawah `WorkspaceHeader`
  setiap halaman (`kunci` di konteks halaman admin): `Banner` info untuk admin
  ("hanya bisa dilihat dan diekspor"), `Banner` warning untuk super_admin, yang
  tetap bisa menyimpan (`isWriteBlocked`). Satu penanda per halaman, bukan per
  tombol: yang terkunci acaranya, bukan satu formulir. Tombol yang menyimpan ke
  server diberi prop `simpan` (`Button`, `IconButton`, `Switch`; kontrol mentah
  memakai `useTerkunci`); di acara terkunci kontrol itu nonaktif sendiri untuk
  admin biasa, tanpa halaman membaca status acara. Yang ditandai hanya kontrol
  yang langsung menulis, bukan yang mengubah draf lokal. Kontrol panggung
  (panel operator undian, sesi undian, reveal, moderasi dan hitung ulang voting)
  sengaja tidak ditandai.

Desain per halaman ada di Figma berkas `OTb4jMVVF0rVEHRoSrhCEG`, halaman
"Rombak · M3 × Cloudflare", lengkap dengan frame "Catatan" yang menjelaskan
alasan tata letaknya.

### Yang belum di Press

**Migrasi ke primitif `@/components/m3`, sedang berjalan.** Profil `.press`
mengubah warna, bentuk, dan kepala halaman lewat token tanpa migrasi — tetapi
perubahan gaya BERIKUTNYA akan kembali menyentuh puluhan berkas selama markup-nya
masih ditulis tangan.

| Markup mentah | Awal | Sekarang |
| --- | --- | --- |
| `<button>` | 242 | 220 |
| `<input>` | 183 | 170 |
| `<select>` | 39 | 37 |
| `<table>` | 6 | 4 |
| Berkas memakai primitif | 15 | 25 |

`Table` sudah ada (`components/m3/table.tsx`), dibuat dari pola keenam tabel
tangan itu. Kepadatannya (`default`/`compact`/`flush`) hidup di elemen `<table>`
lewat varian keturunan `[&_td]:px-5`, bukan disalurkan ke tiap sel lewat context
atau prop — selnya tidak perlu tahu apa pun tentang tabel yang memuatnya, dan
karena itu ia boleh dirender di komponen server.

`TextField` mendapat `inputClassName`. Tanpanya, kolom yang butuh satu kelas pada
teks yang diketik — jarak huruf PIN, huruf lebar tetap untuk nomor order — akan
tetap ditulis tangan hanya karena satu kelas, dan itu persis cara markup tangan
bertahan.

Sudah dipindahkan: `users-panel` (tabel, 2 kolom isian, 2 pilihan, sakelar,
tombol) dan tabel pemenang di `undian-session-history`. Berikutnya, urut dari
yang paling padat: `undian` (25 tombol, 19 isian), `seat-map` (14/26), `vote`
(28/15), `rundown` (14/21), `participant-list` (tabel bersortir).


## Titik uji responsif

Validasi di `375px`, `768px`, `1024px`, `1440px`, dan `1920×1080`. Uji potret dan
lanskap, area aman, zoom/teks terbesar, fokus papan ketik, **kedua tema**, dan
kontras proyektor gelap.

## Keadaan yang wajib ada

Setiap alur penting perlu kerangka pemuatan, keadaan kosong, galat sebaris,
keadaan luring, keadaan izin ditolak, keadaan nonaktif, keadaan sukses, dan
perilaku coba-lagi di mana ada panggilan jaringan.
