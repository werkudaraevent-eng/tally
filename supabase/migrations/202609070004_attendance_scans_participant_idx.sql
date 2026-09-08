-- ---------------------------------------------------------------------------
-- Indeks untuk pertanyaan "peserta INI hadir di sesi mana saja".
--
-- Indeks yang sudah ada menjawab arah sebaliknya. `attendance_scans_session_
-- participant_idx` diawali `session_id`, jadi ia melayani layar pemindai yang
-- bertanya "siapa saja yang sudah masuk sesi ini", dan `attendance_scans_event_
-- time_idx` melayani laporan yang berjalan menurut waktu.
--
-- Daftar peserta di CMS menanyakan yang ketiga: dua puluh lima peserta yang
-- sedang tampil di halaman ini, kehadirannya di seluruh sesi. Tanpa indeks yang
-- diawali `participant_id`, setiap pembukaan halaman itu memindai seluruh tabel
-- pemindaian, yaitu tabel yang tumbuh paling cepat di hari-H, dan admin yang
-- membuka daftar peserta sambil antrean berjalan membayarnya berkali-kali.
-- ---------------------------------------------------------------------------

create index if not exists attendance_scans_participant_idx
  on public.attendance_scans (participant_id, session_id, scanned_at);
