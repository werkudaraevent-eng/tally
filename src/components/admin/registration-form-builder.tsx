"use client";

import { ArrowDown, ArrowUp, LockSimple, Plus, Trash } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Button, IconButton, SelectField, StatusChip, Switch, TextArea, TextField } from "@/components/m3";
import {
  CHOICE_FIELD_TYPES,
  REGISTRATION_FIELD_TYPE_LABELS,
  type RegistrationField,
  type RegistrationFieldType,
  type RegistrationFormConfig,
} from "@/lib/domain";
import { FIELD_KEY_PATTERN, MAX_CUSTOM_FIELDS, validateFieldDefinitions } from "@/lib/registration-fields";

/**
 * Penyunting susunan form registrasi publik.
 *
 * Lima kolom bawaan (nama, email, telepon, perusahaan, jabatan) tidak bisa
 * dihapus maupun diurutkan ulang — hanya wajib atau tidaknya yang dapat diubah,
 * kecuali nama yang selalu wajib. Kelimanya punya kolom sendiri di tabel
 * pendaftaran dan ikut disalin ke data peserta; menjadikannya field tambahan
 * berarti memindahkannya ke JSON dan kehilangan seluruh pemeriksaan skema.
 *
 * Kelimanya tetap DITAMPILKAN, bukan disembunyikan: admin yang tidak melihatnya
 * akan mengira harus menambahkannya sendiri, lalu membuat field "Email" kedua
 * yang tidak terhubung ke apa pun.
 */

const TYPE_OPTIONS = Object.entries(REGISTRATION_FIELD_TYPE_LABELS) as [RegistrationFieldType, string][];

/** Kunci JSON dari label. Admin tidak perlu memikirkannya, tapi tetap bisa mengubahnya. */
function keyFromLabel(label: string, taken: Set<string>): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 32) || "field";
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}

type Props = {
  config: RegistrationFormConfig;
  onChange: (next: RegistrationFormConfig) => void;
  disabled?: boolean;
};

export function RegistrationFormBuilder({ config, onChange, disabled }: Props) {
  const fields = config.fields ?? [];
  const [openKey, setOpenKey] = useState<string | null>(null);
  const groupId = useId();

  const issues = validateFieldDefinitions(fields);
  const issueByKey = new Map(issues.map((issue) => [issue.key, issue.message]));

  function patchField(index: number, patch: Partial<RegistrationField>) {
    const next = fields.map((field, position) => (position === index ? { ...field, ...patch } : field));
    onChange({ ...config, fields: next });
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...config, fields: next });
  }

  function remove(index: number) {
    onChange({ ...config, fields: fields.filter((_, position) => position !== index) });
  }

  function add() {
    const taken = new Set(fields.map((field) => field.key));
    const key = keyFromLabel("Pertanyaan baru", taken);
    onChange({
      ...config,
      fields: [...fields, { key, label: "Pertanyaan baru", type: "text", required: false }],
    });
    setOpenKey(key);
  }

  return (
    <div className="space-y-4">
      {/* Kolom bawaan lebih dulu, dalam urutan yang sama dengan form publik.
          Admin harus melihat form apa adanya, bukan hanya bagian yang bisa ia ubah. */}
      <div className="rounded-lg bg-panel-high p-4">
        <p className="text-label-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Kolom bawaan</p>
        <ul className="mt-3 space-y-2">
          <li className="flex items-center gap-2 text-body-medium">
            <LockSimple size={16} weight="fill" className="shrink-0 text-on-surface-variant" />
            <span className="font-semibold">Nama lengkap</span>
            <StatusChip tone="neutral" className="ml-auto min-h-7 text-label-medium">Selalu wajib</StatusChip>
          </li>
          {(["Email", "Nomor telepon", "Perusahaan", "Jabatan"] as const).map((label) => (
            <li key={label} className="flex items-center gap-2 text-body-medium text-on-surface-variant">
              <LockSimple size={16} className="shrink-0" />
              <span>{label}</span>
              <span className="ml-auto text-body-small">wajib/opsional diatur di bawah</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-body-small leading-5 text-on-surface-variant">
          Kelimanya tidak bisa dihapus atau diurutkan ulang — masing-masing punya kolom sendiri di
          data peserta. Nama selalu wajib: pendaftaran tanpa nama tidak bisa dicocokkan dengan
          siapa pun di meja registrasi.
        </p>
      </div>

      <div className="space-y-3">
        <Switch
          checked={config.require_email !== false}
          onChange={(value) => onChange({ ...config, require_email: value })}
          disabled={disabled}
          label="Email wajib diisi"
          description="Kode peserta dikirim ke email ini."
        />
        {/* Peringatan hanya muncul saat dimatikan, dan menyebut akibatnya, bukan
            nama setelannya. Admin yang mematikannya tanpa membaca baru sadar saat
            ada pendaftar berdiri di meja registrasi tanpa kode. */}
        {config.require_email === false ? (
          <p className="rounded-md bg-warning-soft p-3 text-body-small leading-5 text-on-warning-soft">
            <strong>Kode peserta tidak akan terkirim ke mana pun.</strong> Pendaftar hanya melihatnya
            sekali di layar; yang menutup halaman kehilangannya dan harus dicari panitia di daftar ini.
            Satu orang juga bisa mendaftar berkali-kali — pencegahan ganda memakai email.
          </p>
        ) : null}
        <Switch
          checked={config.require_phone !== false}
          onChange={(value) => onChange({ ...config, require_phone: value })}
          disabled={disabled}
          label="Nomor telepon wajib diisi"
          description="Satu-satunya jalan menghubungi pendaftar bila emailnya salah ketik."
        />
        <Switch
          checked={config.require_company === true}
          onChange={(value) => onChange({ ...config, require_company: value })}
          disabled={disabled}
          label="Perusahaan wajib diisi"
          description="Kolomnya selalu ada. Ini hanya menentukan boleh dikosongkan atau tidak."
        />
        <Switch
          checked={config.require_job_title === true}
          onChange={(value) => onChange({ ...config, require_job_title: value })}
          disabled={disabled}
          label="Jabatan wajib diisi"
          description="Kolomnya selalu ada. Ini hanya menentukan boleh dikosongkan atau tidak."
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-title-medium font-semibold">Pertanyaan tambahan</p>
          <p className="mt-0.5 text-body-small text-on-surface-variant">
            {fields.length} dari {MAX_CUSTOM_FIELDS}. Jawabannya ikut tersimpan ke data peserta.
          </p>
        </div>
        <Button
          variant="tonal"
          onClick={add}
          disabled={disabled || fields.length >= MAX_CUSTOM_FIELDS}
          icon={<Plus size={18} weight="bold" />}
        >
          Tambah
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed border-outline-variant p-6 text-center text-body-medium text-on-surface-variant">
          Belum ada pertanyaan tambahan. Form tetap bisa dipakai — pendaftar mengisi nama, email, telepon,
          perusahaan, dan jabatan.
        </p>
      ) : (
        <ol className="space-y-2">
          {fields.map((field, index) => {
            const open = openKey === field.key;
            const problem = issueByKey.get(field.key);
            return (
              <li key={field.key} className="rounded-lg bg-panel-high">
                <div className="flex items-center gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => setOpenKey(open ? null : field.key)}
                    aria-expanded={open}
                    aria-controls={`${groupId}-${field.key}`}
                    className="m3-state min-w-0 flex-1 rounded-sm px-2 py-2 text-left"
                  >
                    <span className="block truncate text-body-large font-semibold">{field.label || "(tanpa label)"}</span>
                    <span className="mt-0.5 block truncate text-body-small text-on-surface-variant">
                      {REGISTRATION_FIELD_TYPE_LABELS[field.type]} · {field.required ? "wajib" : "opsional"} · {field.key}
                    </span>
                  </button>
                  {problem ? <StatusChip tone="error" className="shrink-0">Perlu diperbaiki</StatusChip> : null}
                  <IconButton size="sm" label="Naikkan" onClick={() => move(index, -1)} disabled={disabled || index === 0}>
                    <ArrowUp size={16} weight="bold" />
                  </IconButton>
                  <IconButton size="sm" label="Turunkan" onClick={() => move(index, 1)} disabled={disabled || index === fields.length - 1}>
                    <ArrowDown size={16} weight="bold" />
                  </IconButton>
                  <IconButton size="sm" label={`Hapus ${field.label}`} onClick={() => remove(index)} disabled={disabled} className="text-error">
                    <Trash size={16} weight="bold" />
                  </IconButton>
                </div>

                {open ? (
                  <div id={`${groupId}-${field.key}`} className="space-y-4 border-t border-outline-variant p-4">
                    {problem ? (
                      <p role="alert" className="rounded-md bg-error-soft p-3 text-body-small text-on-error-soft">{problem}</p>
                    ) : null}

                    <TextField
                      label="Pertanyaan"
                      value={field.label}
                      disabled={disabled}
                      onChange={(event) => patchField(index, { label: event.target.value })}
                    />

                    <SelectField
                      label="Jenis jawaban"
                      value={field.type}
                      disabled={disabled}
                      onChange={(event) => {
                        const type = event.target.value as RegistrationFieldType;
                        // Pilihan dibuang saat pindah ke jenis yang tidak memakainya,
                        // dan diisi contoh saat pindah ke jenis yang memerlukannya.
                        // Dropdown tanpa pilihan adalah kolom yang mustahil diisi.
                        patchField(index, {
                          type,
                          options: CHOICE_FIELD_TYPES.includes(type)
                            ? (field.options?.length ? field.options : ["Pilihan 1", "Pilihan 2"])
                            : undefined,
                          min: type === "number" ? field.min : undefined,
                          max: type === "number" ? field.max : undefined,
                        });
                      }}
                    >
                      {TYPE_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </SelectField>

                    {CHOICE_FIELD_TYPES.includes(field.type) ? (
                      <TextArea
                        label="Pilihan"
                        hint="Satu pilihan per baris. Minimal dua."
                        rows={4}
                        disabled={disabled}
                        value={(field.options ?? []).join("\n")}
                        onChange={(event) => patchField(index, { options: event.target.value.split("\n") })}
                      />
                    ) : null}

                    {field.type === "number" ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <TextField
                          label="Minimum"
                          optional
                          type="number"
                          disabled={disabled}
                          value={field.min ?? ""}
                          onChange={(event) => patchField(index, { min: event.target.value === "" ? undefined : Number(event.target.value) })}
                        />
                        <TextField
                          label="Maksimum"
                          optional
                          type="number"
                          disabled={disabled}
                          value={field.max ?? ""}
                          onChange={(event) => patchField(index, { max: event.target.value === "" ? undefined : Number(event.target.value) })}
                        />
                      </div>
                    ) : null}

                    {field.type === "file" ? (
                      <p className="rounded-md bg-panel p-3 text-body-small leading-5 text-on-surface-variant">
                        Pendaftar dapat mengunggah PNG, JPG, WebP, atau PDF maksimal 5 MB. Berkasnya disimpan
                        <strong> tidak publik</strong> — hanya panitia yang bisa membukanya, lewat tautan yang
                        kedaluwarsa dalam lima menit.
                      </p>
                    ) : null}

                    {field.type !== "checkbox" && field.type !== "file" ? (
                      <TextField
                        label="Contoh isian"
                        optional
                        hint="Teks abu-abu di dalam kolom sebelum diisi."
                        disabled={disabled}
                        value={field.placeholder ?? ""}
                        onChange={(event) => patchField(index, { placeholder: event.target.value || undefined })}
                      />
                    ) : null}

                    <TextField
                      label="Keterangan"
                      optional
                      hint="Muncul di bawah kolom. Untuk menjelaskan kenapa data ini diminta."
                      disabled={disabled}
                      value={field.help_text ?? ""}
                      onChange={(event) => patchField(index, { help_text: event.target.value || undefined })}
                    />

                    <TextField
                      label="Kunci data"
                      hint="Nama kolom saat diekspor. Huruf kecil, angka, garis bawah."
                      disabled={disabled}
                      error={FIELD_KEY_PATTERN.test(field.key) ? undefined : "Format kunci tidak sah."}
                      value={field.key}
                      onChange={(event) => patchField(index, { key: event.target.value })}
                    />

                    <Switch
                      checked={field.required}
                      onChange={(value) => patchField(index, { required: value })}
                      disabled={disabled}
                      label="Wajib diisi"
                      description={field.type === "checkbox"
                        ? "Pendaftar harus mencentangnya sebelum bisa mengirim."
                        : "Pendaftar tidak bisa mengirim sebelum kolom ini terisi."}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
