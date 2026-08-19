// Penanda tunggu untuk pencarian peserta di App Booth dan App Kasir.
//
// Kenapa satu modul dipakai bersama: kedua layar memiliki pencarian nama yang
// bentuknya sama (kotak teks + tombol + daftar hasil) dan dipegang panitia yang
// sama sepanjang acara. Kalau masing-masing menggambar penanda tunggunya sendiri,
// dua layar di ruangan yang sama akan berperilaku berbeda pada aksi yang identik.

/**
 * Spinner kecil untuk di dalam tombol.
 *
 * Memakai `currentColor`, jadi otomatis kontras pada tombol gelap (booth) maupun
 * tombol berlatar terang (kasir) tanpa perlu prop warna.
 *
 * Animasinya SVG `<animateTransform>`, bukan kelas `animate-spin`.
 * `prefers-reduced-motion` di globals.css memangkas seluruh
 * `animation-duration` menjadi 0.01ms, yang akan membuat spinner CSS membeku pada
 * satu sudut dan terlihat seperti ikon rusak. SMIL tidak terpengaruh aturan itu,
 * sehingga penanda tunggu tetap berputar bagi panitia yang mengaktifkan
 * pengurangan animasi — dan mereka justru paling butuh kepastian bahwa sistem
 * masih bekerja.
 */
export function Spinner({ size = 18, label }: { size?: number; label?: string }) {
  return <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className="shrink-0"
    role={label ? "img" : "presentation"}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.7s" repeatCount="indefinite" />
    </path>
  </svg>;
}

/**
 * Kerangka baris hasil pencarian.
 *
 * Bentuknya sengaja meniru baris hasil sebenarnya (avatar bulat, satu baris nama
 * lebar, satu baris instansi lebih pendek) supaya daftar tidak melompat tingginya
 * ketika hasil tiba. Sebelumnya area hasil kosong sama sekali selama menunggu,
 * lalu tumbuh mendadak — pada layar booth itu menggeser tombol di bawahnya tepat
 * saat panitia hendak menekannya.
 *
 * `rows` bawaan 3, bukan sebanyak hasil terakhir: menjanjikan lebih banyak baris
 * daripada yang mungkin ditemukan membuat daftar menyusut setelah selesai, yang
 * justru pergeseran yang ingin dihindari.
 */
export function SearchResultsSkeleton({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return <div
    className={`divide-y divide-outline-variant rounded-lg border border-outline-variant ${className}`}
    // Status disampaikan sekali lewat teks di luar (aria-live), jadi kerangka ini
    // disembunyikan dari pembaca layar. Tanpa ini pembaca layar akan mengumumkan
    // sejumlah baris kosong tak bermakna.
    aria-hidden="true"
  >
    {Array.from({ length: rows }).map((_, index) => <div key={index} className="flex min-h-16 items-center gap-3 p-3">
      <span className="size-[34px] shrink-0 rounded-full bg-surface-container-highest shimmer" />
      <span className="min-w-0 flex-1 space-y-2">
        {/* Lebar dibuat berbeda-beda per baris. Beberapa balok selebar penuh dan
            sama persis terbaca sebagai tabel yang gagal dimuat, bukan sebagai
            daftar nama yang sedang datang. */}
        <span className="block h-3.5 rounded-xs bg-surface-container-highest shimmer" style={{ width: `${[72, 58, 65, 50, 62][index % 5]}%` }} />
        <span className="block h-2.5 rounded-xs bg-surface-container-highest shimmer" style={{ width: `${[48, 62, 40, 55, 44][index % 5]}%` }} />
      </span>
      <span className="h-3 w-9 shrink-0 rounded-xs bg-surface-container-highest shimmer" />
    </div>)}
  </div>;
}
