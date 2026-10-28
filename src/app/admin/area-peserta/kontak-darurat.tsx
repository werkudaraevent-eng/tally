"use client";

import { ArrowDown, ArrowUp, Copy, Plus, Trash } from "@phosphor-icons/react";
import { Banner, Button, Card, IconButton, SelectField, TextArea, TextField } from "@/components/m3";
import type { LandingMemberConfig } from "@/lib/domain";
import { jenisBlokDarurat } from "@/lib/member/blok-darurat";
import { JENIS_DARURAT, KONTAK_DARURAT_BATAS, KONTAK_DARURAT_MAX, LABEL_JENIS_DARURAT, kontakDariBlok, nomorTelepon, tautanPeta, type KontakDarurat } from "@/lib/member/kontak-darurat";
import type { BlokPeserta } from "./susunan-beranda";

type Bantuan = NonNullable<LandingMemberConfig["help"]>;

/** Petunjuk di bawah nomor: tombol apa yang akan muncul untuk peserta. */
function petunjukNomor(nomor: string | null | undefined): { hint: string; warning?: boolean } {
  if (!nomor?.trim()) return { hint: "Mobile numbers get Call and WhatsApp buttons. Office numbers get Call." };
  const sambung = nomorTelepon(nomor);
  if (!sambung) return { hint: "Not read as one phone number, so it shows as text without a Call button.", warning: true };
  return { hint: sambung.wa ? "Participants see Call and WhatsApp." : "Participants see Call. WhatsApp is only for mobile numbers (08…)." };
}

/**
 * Participant area > Emergency and help (E-03): kontak darurat diisi di sini,
 * satu kelompok isian per kontak, dan langsung terlihat di pratinjau Menu.
 * Blok Columns lama (help_block) tetap tampil sampai kontaknya disalin ke sini;
 * setelah disalin pilihan blok tetap disimpan, jadi blok itu tetap tidak ikut
 * di Beranda dan kembali menjadi kartu bila semua kontak dihapus.
 */
export function KontakDaruratForm({
  help,
  onChange,
  blocks,
  helpBlock,
  onSalin,
  onFokus,
  tanpaNama,
  english,
}: {
  help: Bantuan | null | undefined;
  onChange: (help: Bantuan) => void;
  blocks: BlokPeserta[];
  helpBlock: string | null;
  /** Salin isi blok lama ke kontak. */
  onSalin: (help: Bantuan) => void;
  /** Mengisi bagian ini: pratinjau pindah ke kartu darurat. */
  onFokus: () => void;
  /** Kontak yang belum punya nama saat Save ditekan. */
  tanpaNama: number | null;
  /** Acara punya halaman English: tiap teks punya isian English (kosong = teks Indonesia). */
  english: boolean;
}) {
  const kontak = help?.contacts ?? [];
  const ubah = (contacts: KontakDarurat[]) => onChange({ ...help, contacts });
  const ubahSatu = (index: number, patch: Partial<KontakDarurat>) => ubah(kontak.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const ubahEn = (patch: { title?: string; note?: string }) => onChange({ ...help, contacts: kontak, en: { ...help?.en, ...patch } });
  const ubahEnSatu = (index: number, patch: { name?: string; note?: string }) => ubahSatu(index, { en: { ...kontak[index]?.en, ...patch } });
  const pindah = (index: number, arah: -1 | 1) => {
    const baru = [...kontak];
    [baru[index], baru[index + arah]] = [baru[index + arah], baru[index]];
    ubah(baru);
  };
  // Blok lama yang masih tampil di Menu: khusus peserta, Columns, dan berisi.
  const blokLama = helpBlock ? (blocks.find((block) => block.id === helpBlock && block.show_on === "member" && jenisBlokDarurat(block.type) && !block.empty) ?? null) : null;
  const penuh = kontak.length >= KONTAK_DARURAT_MAX;

  return (
    <div className="flex flex-col gap-4" onFocusCapture={onFokus}>
      {blokLama && kontak.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <Banner tone="info">
            {`Participants now see the Event page block "${blokLama.heading || "Untitled block"}". Copy it into contacts to edit everything here. Numbers that aren't clear, such as times, are left empty for you to fill in, and other links stay in the note. Participant home doesn't change.`}
          </Banner>
          <Button
            variant="outlined"
            size="sm"
            icon={<Copy size={16} aria-hidden />}
            onClick={() =>
              onSalin({
                title: blokLama.heading?.trim() || help?.title || null,
                note: blokLama.body?.trim() || help?.note || null,
                contacts: kontakDariBlok(blokLama.items ?? []),
                en: { title: blokLama.en?.heading?.trim() || help?.en?.title || null, note: blokLama.en?.body?.trim() || help?.en?.note || null },
              })
            }
          >
            Copy into contacts
          </Button>
        </div>
      ) : null}
      <TextField
        label="Card title"
        optional
        maxLength={KONTAK_DARURAT_BATAS.title}
        hint={'Leave empty for "Darurat dan bantuan" on Indonesian pages and "Emergency and help" on English ones.'}
        value={help?.title ?? ""}
        onChange={(event) => onChange({ ...help, contacts: kontak, title: event.target.value })}
      />
      {english ? (
        <TextField
          label="Card title in English"
          optional
          maxLength={KONTAK_DARURAT_BATAS.title}
          hint="Used on English pages when Card title is filled. Empty = Card title shows there too."
          value={help?.en?.title ?? ""}
          onChange={(event) => ubahEn({ title: event.target.value })}
        />
      ) : null}
      <TextArea
        label="Note above the contacts"
        optional
        rows={2}
        maxLength={KONTAK_DARURAT_BATAS.catatan}
        counter
        placeholder="In an emergency, call the numbers below. For questions about the event, contact the organisers."
        value={help?.note ?? ""}
        onChange={(event) => onChange({ ...help, contacts: kontak, note: event.target.value })}
      />
      {english ? (
        <TextArea
          label="Note above the contacts in English"
          optional
          rows={2}
          maxLength={KONTAK_DARURAT_BATAS.catatan}
          counter
          hint="Empty = the Indonesian note shows on English pages too."
          value={help?.en?.note ?? ""}
          onChange={(event) => ubahEn({ note: event.target.value })}
        />
      ) : null}
      {kontak.length > 0 ? (
        <ol className="flex flex-col gap-3" aria-label="Contacts">
          {kontak.map((item, index) => {
            const nomor = petunjukNomor(item.phone);
            const peta = item.map_url?.trim() && !tautanPeta(item.map_url) ? "Map links must start with http:// or https://" : undefined;
            const judul = item.name?.trim() || `Contact ${index + 1}`;
            return (
              <li key={index}>
                <Card variant="outlined" padded={false} className="flex flex-col gap-3 p-3">
                  <div className="flex items-center gap-1">
                    <p className="min-w-0 flex-1 truncate text-title-small text-on-surface">{judul}</p>
                    <IconButton size="sm" label={`Move ${judul} up`} disabled={index === 0} onClick={() => pindah(index, -1)}>
                      <ArrowUp size={16} />
                    </IconButton>
                    <IconButton size="sm" label={`Move ${judul} down`} disabled={index === kontak.length - 1} onClick={() => pindah(index, 1)}>
                      <ArrowDown size={16} />
                    </IconButton>
                    <IconButton size="sm" label={`Remove ${judul}`} onClick={() => ubah(kontak.filter((_, i) => i !== index))}>
                      <Trash size={16} />
                    </IconButton>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <SelectField
                      className="md:col-span-2"
                      label="Type"
                      optional
                      hint="Shows an icon before the name, so participants find the right number at a glance."
                      value={item.kind ?? ""}
                      onChange={(event) => ubahSatu(index, { kind: (event.target.value || null) as KontakDarurat["kind"] })}
                    >
                      <option value="">No icon</option>
                      {JENIS_DARURAT.map((jenis) => (
                        <option key={jenis} value={jenis}>
                          {LABEL_JENIS_DARURAT[jenis]}
                        </option>
                      ))}
                    </SelectField>
                    <TextField
                      label="Name or role"
                      data-kontak={index}
                      maxLength={KONTAK_DARURAT_BATAS.name}
                      placeholder="Nearest hospital"
                      value={item.name ?? ""}
                      error={tanpaNama === index && !item.name?.trim() ? "Add a name or role, or remove this contact." : undefined}
                      onChange={(event) => ubahSatu(index, { name: event.target.value })}
                    />
                    <TextField
                      label="Phone"
                      optional
                      type="tel"
                      inputMode="tel"
                      maxLength={KONTAK_DARURAT_BATAS.phone}
                      placeholder="0812 3456 7890"
                      value={item.phone ?? ""}
                      {...nomor}
                      onChange={(event) => ubahSatu(index, { phone: event.target.value })}
                    />
                    <TextArea
                      label="Note"
                      optional
                      rows={2}
                      maxLength={KONTAK_DARURAT_BATAS.note}
                      counter
                      placeholder="24-hour emergency room"
                      value={item.note ?? ""}
                      onChange={(event) => ubahSatu(index, { note: event.target.value })}
                    />
                    <TextField
                      label="Map link"
                      optional
                      type="url"
                      maxLength={KONTAK_DARURAT_BATAS.map_url}
                      placeholder="https://maps.app.goo.gl/…"
                      value={item.map_url ?? ""}
                      error={peta}
                      hint={peta ? undefined : "Adds a Map button. For a hospital, clinic or meeting point."}
                      onChange={(event) => ubahSatu(index, { map_url: event.target.value })}
                    />
                    {english ? (
                      <>
                        <TextField
                          label="Name or role in English"
                          hint="Empty = the name above shows on English pages."
                          optional
                          maxLength={KONTAK_DARURAT_BATAS.name}
                          value={item.en?.name ?? ""}
                          onChange={(event) => ubahEnSatu(index, { name: event.target.value })}
                        />
                        <TextArea
                          label="Note in English"
                          optional
                          rows={2}
                          maxLength={KONTAK_DARURAT_BATAS.note}
                          counter
                          value={item.en?.note ?? ""}
                          onChange={(event) => ubahEnSatu(index, { note: event.target.value })}
                        />
                      </>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      ) : !blokLama ? (
        <p className="text-body-medium text-on-surface-variant">No contacts yet. Menu shows no emergency card until you add one.</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outlined" size="sm" icon={<Plus size={16} aria-hidden />} disabled={penuh} onClick={() => ubah([...kontak, { name: "", phone: null, note: null, map_url: null }])}>
          Add contact
        </Button>
        <span className="text-body-small text-on-surface-variant">{penuh ? `${KONTAK_DARURAT_MAX} contacts is the limit.` : "For example the medical team, hotel reception and the nearest hospital."}</span>
      </div>
    </div>
  );
}
