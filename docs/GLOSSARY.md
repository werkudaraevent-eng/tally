# Glossary

The code mixes Indonesian and English. Older modules and many folder, file and route names are Indonesian; admin screens are English (en-GB). This table maps the Indonesian words you will meet in paths and identifiers.

## Rules

- New code, new files and new identifiers are English.
- Participant-facing URLs stay as they are (`/peserta`, `/daftar`, `/pindai`, ...): they are printed on badges, QR codes and emails, and most participants read Indonesian.
- Internal files may be renamed to English when a PR already touches them, never as a bulk rename, and never on a URL.
- Database table and RPC names are not renamed; that needs a production migration.

## Words

| Indonesian | English | Where you see it |
| --- | --- | --- |
| acara | event | copy, `event_*` |
| akses | access | `users-akses.ts` |
| area peserta, dashboard saya | participant area | `src/app/admin/area-peserta`, `src/app/peserta` |
| bagian | section | `sasaran-bagian.ts` |
| baris | row | `landing-logo-baris.ts` |
| cetak, cetak badge | print, badge printing | `src/app/cetak-badge`, `api/stasiun-cetak` |
| daftar | register, registration | `src/app/daftar` (public registration form) |
| denah | seating plan (public view) | `src/app/denah` |
| domain klien | client (custom) domain | `src/lib/domain-klien` |
| formulir | form | `gathering-formulir.ts` |
| hitung mundur | countdown | `landing-hitung-mundur.ts` |
| ikon | icon | `ikon-phosphor.ts` |
| impor | import | `logistik/impor.ts` |
| jawaban | answer | `undian-jawaban` |
| kalender | calendar | `kalender.ics` |
| kirim, kiriman | send, a sent blast | `api/admin/pesan/[id]/kirim` |
| kode | code | `src/app/kode` |
| kolom | column, field | `participants-kolom.ts`, `kolom-staf.ts` |
| kontak darurat | emergency contact | `member/kontak-darurat.ts` |
| kontak panitia | organiser contact | `kontak-panitia.ts` |
| kru | crew | `logistik/kontak-kru.ts` |
| latar | background | `landing-latar-sendiri.ts` |
| lengkapi (data) | complete (profile data) | `src/app/lengkapi` |
| logistik | logistics (hotel, transport, trips) | `src/lib/logistik`, `admin/logistik` |
| luring | offline | `halaman-qr-luring` |
| masuk | sign in | `src/app/masuk`, `member/kolom-masuk.ts` |
| panduan | guide, help | `src/app/panduan` |
| panitia | organisers, committee | copy |
| pembicara | speaker | `landing-agenda-pembicara.ts` |
| pengumuman | announcements, messages | `admin/pengumuman` |
| peran | role | `landing-peran-sesi.ts` |
| pesan | message (email/WhatsApp blasts) | `src/lib/pesan`, `api/pesan` |
| peserta | participant | `src/app/peserta`, `api/peserta` |
| pindai | scan | `src/app/pindai` (participant self-scan) |
| pratinjau | preview | `src/app/pratinjau` |
| rute | route, directions | `domain-klien/rute.ts`, route blocks |
| saring, saringan | filter | `participants-saring.ts`, `saringan-kolom.ts` |
| sama | same, shared | `landing-speakers-sama.ts` |
| sapa | greet (greeting screen) | `src/app/sapa` |
| sasaran | audience ("Who it's for", "Who sees it") | `sasaran-bagian.ts`, `sasaran-blok.ts` |
| sesi | session | undian sessions, `landing-peran-sesi.ts` |
| slug lama | old slug (redirect) | `slug-lama.ts` |
| stasiun | station (badge print station) | `src/app/stasiun` |
| teks kaya | rich text | `landing-teks-kaya.ts` |
| terbilang | number in words | `terbilang.ts` |
| tujuan | destination | `checkpoint/tujuan.ts` |
| undangan | invitation | `src/lib/undangan`, `api/undangan` |
| undian | lucky draw | `src/app/undian`, `admin/undian`, `undian-*.ts` |
| urutan | order, sort order | `rundown-urutan.ts` |
