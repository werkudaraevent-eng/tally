# Rilis dan tag

Tally tidak punya CHANGELOG tulisan tangan: salinan kedua selalu melenceng dari kenyataan. Riwayat ada di `git log` dan deskripsi PR. Untuk menandai versi yang benar-benar dipakai acara, pakai **tag git**.

## Kapan memberi tag

- Sebelum acara besar dimulai (misalnya H-1), pada commit `main` yang sedang live. Bila ada masalah saat acara, versi ini titik kembalinya.
- Setelah sekumpulan merge penting (misalnya satu fase perbaikan) selesai dan stabil.

## Format

`vYYYY.MM.DD`, misalnya `v2026.11.13`. Bila ada dua tag di hari yang sama: `v2026.11.13.2`.

## Cara

GitHub > Releases > **Draft a new release** > Choose a tag > ketik tag baru > target `main` > **Generate release notes** (GitHub menyusun daftar PR sejak tag sebelumnya) > Publish.

Atau dari terminal:

```bash
git fetch origin main
git tag -a v2026.11.13 origin/main -m "Fase 1-2 audit platform"
git push origin v2026.11.13
```

## Kembali ke versi bertag

Vercel > Deployments > cari deploy dengan commit yang sama dengan tag > **Promote to Production**. Lihat juga `insiden.md`.
