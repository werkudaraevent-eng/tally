-- ---------------------------------------------------------------------------
-- Reveal bertahap leaderboard (permintaan klien: umumkan peringkat 1-3 lebih
-- dulu, baru 4-10).
--
-- Kenapa TABEL SENDIRI, bukan kolom tambahan di `display_settings`:
--
-- 1. `display_settings` adalah KONFIGURASI (warna, judul, layout) yang diubah
--    sesekali lewat form "Simpan tampilan". Tahap reveal adalah STATE RUNTIME
--    yang berubah beberapa kali dalam satu menit di atas panggung. Menyatukan
--    keduanya membuat setiap klik "tahap berikutnya" ikut menggeser
--    `display_settings.updated_at`, sehingga label "Terakhir diubah" di CMS
--    berbohong: ia akan menunjuk ke jam ceremony, bukan ke saat admin benar-benar
--    mengubah tampilan.
-- 2. Tombol tahap harus AKSI LANGSUNG (sekali klik langsung berlaku). Kalau
--    nilainya tinggal di `display_settings`, ia ikut terkirim pada payload
--    "Simpan tampilan", dan operator bisa tanpa sengaja menerbitkan perubahan
--    warna yang belum siap hanya karena ingin memindahkan tahap.
-- 3. Endpoint publiknya dipoll jauh lebih cepat (2 detik, bukan 30). Baris yang
--    sempit membuat poll itu murah.
--
-- Perilaku lama TIDAK berubah: `mode` bawaan 'off' berarti Live Display tampil
-- persis seperti sebelum migrasi ini — top N live tanpa tahap. Mode 'staged'
-- adalah satu-satunya jalan masuk ke perilaku baru, dan bisa dimatikan kembali
-- kapan saja, termasuk di tengah acara bila ceremony dibatalkan.
-- ---------------------------------------------------------------------------
create table if not exists public.leaderboard_reveal (
  id int primary key default 1 check (id = 1),

  -- 'off'    = perilaku lama, seluruh top N tampil live.
  -- 'staged' = tampil bertahap sesuai `stages` dan `stage`.
  mode text not null default 'off' check (mode in ('off', 'staged')),

  -- 0            = belum ada peringkat yang dibuka (layar menampilkan header dan
  --                tagline saja).
  -- 1..N         = tahap ke-n pada `stages`.
  -- N+1          = papan penuh, dipakai tombol "Tampilkan semua".
  --
  -- Satu integer, bukan integer + boolean `show_all` terpisah: dua kolom bisa
  -- saling bertentangan (stage 1 sekaligus show_all true) dan setiap pembaca
  -- harus memutuskan sendiri mana yang menang. Batas atasnya tidak bisa
  -- di-CHECK di sini karena bergantung pada panjang `stages`; endpoint yang
  -- menjepitnya (lihat src/app/api/display/reveal/route.ts).
  stage int not null default 0 check (stage >= 0),

  -- Daftar tahap sebagai RENTANG peringkat, bukan sekadar batas atas kumulatif.
  --
  -- Klien memilih pola "spotlight": tahap 1 menampilkan peringkat 1-3 besar,
  -- lalu tahap 2 MENGGANTIKANNYA dengan peringkat 4-10. Batas kumulatif tunggal
  -- (mis. {3,10}) tidak bisa menyatakan "mulai dari 4", jadi rentang wajib.
  --
  -- Efek sampingnya menguntungkan: satu bentuk data ini melayani semua pola
  -- tanpa perubahan kode sama sekali —
  --   spotlight  : [{1-3 spotlight}, {4-10 list}]
  --   kumulatif  : [{1-3 spotlight}, {1-10 list}]
  --   countdown  : [{3-3}, {2-2}, {1-1}, {4-10}]
  -- Kalau klien berubah pikiran di hari-H, yang berubah hanya isi kolom ini.
  --
  -- `layout` per tahap: 'spotlight' = beberapa baris besar untuk ceremony,
  -- 'list' = daftar biasa seperti papan normal.
  stages jsonb not null default
    '[{"from": 1, "to": 3, "label": "Peringkat 1-3", "layout": "spotlight"},
      {"from": 4, "to": 10, "label": "Peringkat 4-10", "layout": "list"}]'::jsonb,

  -- true  = angka dan urutan dibekukan saat reveal dimulai.
  -- false = layar mengikuti data live selama reveal.
  --
  -- Default true karena itu pilihan yang aman: leaderboard ini live, dan tanpa
  -- dibekukan peserta yang tadinya peringkat 4 bisa melompat ke peringkat 2
  -- SETELAH tiga besar diumumkan. Di depan penonton, angka yang berubah sendiri
  -- tanpa transaksi yang terlihat tidak bisa dijelaskan panitia di tempat.
  -- Panitia tetap boleh mematikannya bila semua booth sudah tutup.
  --
  -- Namanya BUKAN `freeze`: `freeze` adalah kata kunci Postgres (dipakai COPY dan
  -- VACUUM) dan ditolak sebagai nama kolom tanpa tanda kutip. Memberi tanda kutip
  -- akan memaksa setiap query menuliskannya persis, jadi lebih baik dihindari.
  freeze_on_start boolean not null default true,

  -- Snapshot hasil get_leaderboard saat reveal dimulai, dipakai bila
  -- `freeze_on_start`.
  --
  -- Disimpan sebagai jsonb, bukan tabel baris-per-peserta: isinya dibaca utuh
  -- sekali per permintaan dan tidak pernah difilter atau di-join. Tabel normal
  -- hanya menambah kerja tanpa ada query yang memanfaatkannya.
  snapshot jsonb,
  frozen_at timestamptz,

  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);

insert into public.leaderboard_reveal (id) values (1) on conflict (id) do nothing;

-- Pola akses sama dengan seluruh tabel lain di proyek ini: RLS menyala tanpa satu
-- pun policy, dan hak anon/authenticated dicabut. Satu-satunya jalur data adalah
-- service client di server. Halaman /display membaca lewat route handler publik,
-- BUKAN langsung ke Postgres, jadi pencabutan ini tidak mematikannya.
alter table public.leaderboard_reveal enable row level security;
revoke all on table public.leaderboard_reveal from anon, authenticated;
