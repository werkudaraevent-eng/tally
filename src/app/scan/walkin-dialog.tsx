"use client";

import { Clock, UserCheck, UserPlus } from "@phosphor-icons/react";
import { Button, Dialog, SelectField, Switch, TextArea, TextField } from "@/components/m3";
import type { RegistrationField } from "@/lib/domain";
import type { FormWalkIn, Kandidat } from "./types";

/**
 * Pendaftaran tamu walk-in.
 *
 * Ini SATU-SATUNYA permukaan di layar pemindai yang benar-benar modal, dan
 * alasannya berbeda dari lembar hasil: di sini petugas sedang mengetik, dan
 * pemindaian yang masuk di tengah ketikan akan menimpa apa yang sedang
 * dikerjakannya. Menahan layar sebentar justru yang melindungi pekerjaannya.
 *
 * Dua isi bergantian di dialog yang sama, bukan dua dialog bertumpuk: daftar
 * nama kembar adalah LANJUTAN dari tombol simpan yang barusan ditekan. Ditumpuk,
 * petugas harus menutup dua lapis untuk kembali membetulkan satu huruf.
 */

type Props = {
  open: boolean;
  onClose: () => void;
  form: FormWalkIn;
  onForm: (form: FormWalkIn) => void;
  fields: RegistrationField[];
  kandidat: Kandidat[] | null;
  onLupakanKandidat: () => void;
  sesiNama: string;
  menyimpan: boolean;
  galat: string;
  onSimpan: (paksa: boolean) => void;
  onPakaiKandidat: (baris: Kandidat) => void;
  bisaSimpan: boolean;
};

export function WalkinDialog({
  open,
  onClose,
  form,
  onForm,
  fields,
  kandidat,
  onLupakanKandidat,
  sesiNama,
  menyimpan,
  galat,
  onSimpan,
  onPakaiKandidat,
  bisaSimpan,
}: Props) {
  const setExtra = (key: string, value: string) => onForm({ ...form, extra: { ...form.extra, [key]: value } });

  /**
   * Satu pertanyaan tambahan dari formulir pendaftaran, versi meja registrasi.
   *
   * Fungsi biasa yang mengembalikan JSX, BUKAN komponen. Komponen yang
   * didefinisikan di dalam komponen lain punya identitas tipe baru pada setiap
   * render, jadi React melepas dan memasangnya kembali, dan kolom teks yang
   * dipasang ulang kehilangan fokus setiap satu huruf diketik.
   *
   * `radio` sengaja digambar sebagai daftar pilihan, bukan tombol radio
   * berjajar. Dialog ini dibuka di ponsel yang dipegang satu tangan di depan
   * antrean, dan lima tombol radio bertumpuk mendorong tombol simpan keluar
   * layar. Nilai yang tersimpan tetap sama persis.
   */
  function kolomTambahan(field: RegistrationField) {
    const nilai = form.extra[field.key] ?? "";

    if (field.type === "checkbox") {
      return (
        <Switch
          key={field.key}
          checked={nilai === "true"}
          onChange={(centang) => setExtra(field.key, centang ? "true" : "")}
          label={field.label}
          description={field.help_text}
        />
      );
    }

    if (field.type === "select" || field.type === "radio") {
      return (
        <SelectField
          key={field.key}
          label={field.label}
          optional
          hint={field.help_text}
          value={nilai}
          onChange={(event) => setExtra(field.key, event.target.value)}
        >
          <option value="">Pilih...</option>
          {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
        </SelectField>
      );
    }

    if (field.type === "textarea") {
      return (
        <TextArea
          key={field.key}
          label={field.label}
          optional
          hint={field.help_text}
          rows={2}
          maxLength={2000}
          placeholder={field.placeholder}
          value={nilai}
          onChange={(event) => setExtra(field.key, event.target.value)}
        />
      );
    }

    return (
      <TextField
        key={field.key}
        label={field.label}
        optional
        hint={field.help_text}
        type={field.type}
        inputMode={field.type === "number" ? "numeric" : field.type === "tel" ? "tel" : undefined}
        min={field.type === "number" ? field.min : undefined}
        max={field.type === "number" ? field.max : undefined}
        maxLength={field.type === "number" || field.type === "date" ? undefined : 2000}
        placeholder={field.placeholder}
        value={nilai}
        onChange={(event) => setExtra(field.key, event.target.value)}
      />
    );
  }

  return (
    <Dialog
      open={open}
      onClose={() => { if (!menyimpan) onClose(); }}
      dismissible={!menyimpan}
      size="md"
      icon={<UserPlus size={24} weight="fill" />}
      title={kandidat ? "Nama ini sudah ada di daftar" : "Tamu walk-in"}
      description={
        kandidat
          ? "Periksa dulu apakah salah satunya orang yang sama. Menambahkan orang kedua bernama sama membuat keduanya tidak bisa dibedakan lagi setelah acara selesai."
          : `Peserta baru dibuat dan langsung tercatat hadir di sesi ${sesiNama}. Kode pesertanya terbit sendiri.`
      }
    >
      {kandidat ? (
        <>
          <ul className="mt-5 divide-y divide-outline-variant overflow-hidden rounded-lg bg-surface-container">
            {kandidat.map((baris) => (
              <li key={baris.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-large font-semibold">{baris.name}</p>
                  <p className="truncate text-body-small text-on-surface-variant">
                    {[baris.company, baris.title].filter(Boolean).join(" · ") || baris.qr_code}
                  </p>
                  {baris.scan_count > 0 ? (
                    <p className="mt-1 flex items-center gap-1 text-label-medium text-warning">
                      <Clock size={14} weight="fill" aria-hidden />
                      Sudah tercatat hadir di sesi ini, {baris.scan_count} kali
                    </p>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="tonal"
                  className="shrink-0"
                  onClick={() => onPakaiKandidat(baris)}
                  icon={<UserCheck size={18} weight="bold" aria-hidden />}
                >
                  Ini orangnya
                </Button>
              </li>
            ))}
          </ul>

          {galat ? (
            <p role="alert" className="mt-4 rounded-lg bg-error-soft p-3 text-body-medium text-on-error-soft">{galat}</p>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="text" onClick={onLupakanKandidat} disabled={menyimpan}>
              Betulkan datanya
            </Button>
            {/* Kata "tetap" ada di labelnya dengan sengaja: yang ditekan di sini
                adalah keputusan bahwa dua orang memang bernama sama, dan label
                netral seperti "Lanjutkan" membuatnya terbaca sebagai langkah
                berikutnya yang wajar. */}
            <Button variant="filled" loading={menyimpan} onClick={() => onSimpan(true)}>
              Tetap tambahkan sebagai orang lain
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); onSimpan(false); }}>
          <div className="mt-5 space-y-4">
            <TextField
              label="Nama lengkap"
              size="lg"
              autoFocus
              autoComplete="off"
              maxLength={200}
              value={form.name}
              onChange={(event) => onForm({ ...form, name: event.target.value })}
            />
            <TextField
              label="Instansi"
              optional
              autoComplete="off"
              maxLength={300}
              value={form.company}
              onChange={(event) => onForm({ ...form, company: event.target.value })}
            />
            <TextField
              label="Jabatan"
              optional
              autoComplete="off"
              maxLength={300}
              value={form.title}
              onChange={(event) => onForm({ ...form, title: event.target.value })}
            />
            <TextField
              label="No. HP"
              optional
              type="tel"
              inputMode="tel"
              autoComplete="off"
              maxLength={50}
              value={form.phone}
              onChange={(event) => onForm({ ...form, phone: event.target.value })}
            />
            <TextField
              label="Email"
              optional
              type="email"
              inputMode="email"
              autoComplete="off"
              maxLength={320}
              hint="Hanya perlu bila tamu ingin kode pesertanya dikirim ulang lewat email."
              value={form.email}
              onChange={(event) => onForm({ ...form, email: event.target.value })}
            />

            {/* Hanya pertanyaan bertanda WAJIB di formulir acara yang ikut ke
                sini, dan di layar ini pun tidak ada yang ditegakkan. Antrean yang
                bergerak mengalahkan kelengkapan data: yang belum terisi masih
                bisa dilengkapi di halaman peserta, sedangkan tamu yang ditahan di
                pintu tidak bisa dikembalikan. */}
            {fields.length > 0 ? (
              <div className="rounded-lg bg-surface-container p-4">
                <p className="text-body-small text-on-surface-variant">
                  Pertanyaan dari formulir pendaftaran. Boleh dikosongkan sekarang dan dilengkapi nanti di Admin,
                  Daftar peserta.
                </p>
                <div className="mt-3 space-y-4">{fields.map((field) => kolomTambahan(field))}</div>
              </div>
            ) : null}
          </div>

          {galat ? (
            <p role="alert" className="mt-4 rounded-lg bg-error-soft p-3 text-body-medium text-on-error-soft">{galat}</p>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="text" onClick={onClose} disabled={menyimpan}>
              Batal
            </Button>
            <Button
              type="submit"
              variant="filled"
              loading={menyimpan}
              disabled={!bisaSimpan}
              icon={<UserPlus size={20} weight="bold" aria-hidden />}
            >
              Simpan dan catat hadir
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
