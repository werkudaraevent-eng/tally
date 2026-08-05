-- ---------------------------------------------------------------------------
-- Dua jalan keluar dari "kuota penuh": mode latihan dan undi ulang.
--
-- MASALAH YANG DIPECAHKAN
-- Setelah satu hadiah diundi sampai kuotanya penuh, panel operator hanya
-- menampilkan kalimat "Kuota hadiah ini sudah penuh." tanpa satu pun jalan
-- keluar. Jalan keluarnya SEBENARNYA sudah ada tiga (tolak pemenang satu per
-- satu, tutup sesi lalu buka sesi baru, atau hapus hasil), tetapi tidak satu pun
-- terlihat dari layar itu. Operator menyimpulkan bahwa hasilnya harus DIHAPUS
-- dulu — tindakan paling merusak dari ketiganya, dan satu-satunya yang membuang
-- bukti serah terima hadiah.
--
-- 1. MODE LATIHAN (`undian_state.rehearsal`)
--
-- Gladi bersih dijalankan dengan mekanisme yang sama persis dengan acara
-- sungguhan, hanya saja pemenangnya TIDAK ditulis ke `undian_winners`. Tanpa ini
-- setiap latihan meninggalkan pemenang palsu yang memenuhi kuota, dan panitia
-- terpaksa membersihkannya secara manual sebelum acara — tepat pada jam ketika
-- kesalahan paling mahal dan paling mungkin terjadi.
--
-- Disimpan sebagai kolom pada state, BUKAN sebagai nilai ketiga pada `mode`.
-- `mode` menjawab "apakah layar panggung menyala", dan pertanyaan itu sepenuhnya
-- berbeda dari "apakah hasilnya dicatat". Menggabungkan keduanya membuat latihan
-- mustahil dilakukan dengan layar menyala, padahal justru itu inti gladi bersih:
-- memastikan animasi, warna, dan nama tampil benar di layar yang sebenarnya.
--
-- Nilai bawaan false, sehingga tidak ada perilaku yang berubah sampai seseorang
-- menyalakannya.
--
-- 2. UNDI ULANG (memakai kolom `status` yang sudah ada)
--
-- Tidak butuh kolom baru. Kuota dihitung dengan `status <> 'rejected'`, jadi
-- menolak pemenang yang masih `pending` sudah cukup untuk mengosongkan kuota.
-- Yang selama ini tidak ada hanyalah cara melakukannya untuk sepuluh nama
-- sekaligus, dan penjelasan bahwa cara itu ada.
--
-- Sengaja TIDAK menghapus baris. Pemenang yang ditolak tetap tersimpan lengkap
-- dengan alasan dan waktunya, sehingga pertanyaan "kenapa hadiah ini diundi dua
-- kali" masih bisa dijawab berminggu-minggu kemudian.
--
-- `undian_winners.rehearsal` ditambahkan sebagai jaring pengaman. Pemenang
-- latihan seharusnya tidak pernah sampai ke tabel ini, tetapi bila suatu saat
-- ada jalur yang lolos, kolom ini membuatnya dapat dikenali dan dikeluarkan dari
-- hitungan alih-alih menjadi pemenang palsu yang tak dapat dibedakan.
-- ---------------------------------------------------------------------------

alter table public.undian_state
  add column if not exists rehearsal boolean not null default false;

comment on column public.undian_state.rehearsal is
  'true = mode latihan: undian berjalan normal di layar tetapi pemenang TIDAK ditulis ke undian_winners. Terpisah dari `mode` karena mode menjawab "layar menyala?", bukan "hasil dicatat?".';

alter table public.undian_winners
  add column if not exists rehearsal boolean not null default false;

comment on column public.undian_winners.rehearsal is
  'Jaring pengaman. Baris latihan seharusnya tidak pernah ada di sini; bila ada, kolom ini membuatnya dapat dikeluarkan dari hitungan kuota dan laporan.';

-- Indeks parsial untuk penolakan massal: query "pemenang pending hadiah X di
-- sesi aktif" dijalankan pada saat operator berdiri di depan penonton.
create index if not exists idx_undian_winners_pending_prize
  on public.undian_winners (prize_id, session_id)
  where status = 'pending';
