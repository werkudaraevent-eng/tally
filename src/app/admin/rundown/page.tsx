"use client";

import { ArrowSquareOut, CalendarDots, Coffee, Eye, EyeSlash, FloppyDisk, Plus, Trash, UploadSimple, Warning, XCircle } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useEffect, useMemo, useState } from "react";
import { BrandingEditor } from "@/components/admin/branding-editor";
import { useToast } from "@/components/toast";
import { normalizeBranding } from "@/lib/branding";
import { DEFAULT_HEADER, formatClock, formatEventDate, type RundownHeader, type RundownItem, type RundownSection } from "@/lib/rundown";
import { useEventTimeZone } from "@/lib/use-event-timezone";

// CMS rundown acara.
//
// Bentuknya daftar, bukan kanvas: rundown adalah urutan waktu, dan satu-satunya
// tata letak yang benar adalah dari jam paling awal ke paling akhir. Karena itu
// tidak ada drag-and-drop di sini — urutan dihitung dari jam mulai, sehingga
// admin yang mengetik jam yang benar tidak perlu lagi menyusun ulang barisnya.
// Kolom `sort_order` tetap ada untuk memisahkan dua butir berjam sama.

type Payload = { sections: RundownSection[]; items: RundownItem[] };

/** Baris baru yang sedang diisi, per bagian. */
type Draft = { start_time: string; end_time: string; title: string; subtitle: string; is_break: boolean };

const EMPTY_DRAFT: Draft = { start_time: "", end_time: "", title: "", subtitle: "", is_break: false };

// Nilai yang ditampilkan <input type="color"> ketika kolomnya masih null.
//
// Bukan nilai yang disimpan: kolomnya tetap null sampai admin benar-benar memilih
// warna. `<input type="color">` tidak bisa berkeadaan kosong, jadi ia harus diberi
// sesuatu, dan yang paling tidak mengejutkan adalah warna yang memang sedang
// tampil di halaman publik.
const BRANDING_FALLBACK = {
  background_color: "#ffffff",
  text_color: "#1a1a1a",
  accent_color: "#2649d0",
} as const;

export default function RundownAdminPage() {
  const [sections, setSections] = useState<RundownSection[]>([]);
  const [items, setItems] = useState<RundownItem[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [newSectionName, setNewSectionName] = useState("");
  const [creatingSection, setCreatingSection] = useState(false);
  const [savingSection, setSavingSection] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  // Header berdiri sendiri dari bagian: satu setelan untuk seluruh acara, dengan
  // tombol Simpan sendiri. Digabung ke tombol Simpan bagian, admin yang hanya ingin
  // mengubah warna header terpaksa ikut menyimpan setelan tab yang tidak dia sentuh.
  const [header, setHeader] = useState<RundownHeader>(DEFAULT_HEADER);
  const [savingHeader, setSavingHeader] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  // Penanda simpan dan hapus dilacak PER baris, bukan satu penanda global: satu
  // penanda akan menonaktifkan seluruh tombol di halaman padahal hanya satu baris
  // yang sedang bekerja.
  const [savingItem, setSavingItem] = useState<number | null>(null);
  const [deletingItem, setDeletingItem] = useState<number | null>(null);
  // Konfirmasi hapus ditahan di dalam barisnya sendiri, bukan lewat dialog
  // browser: satu klik tak sengaja tidak boleh langsung membuang data.
  const [confirmItem, setConfirmItem] = useState<number | null>(null);
  const [confirmSection, setConfirmSection] = useState<number | null>(null);
  const [error, setError] = useState("");
  // Zona acara dipakai supaya tanggal yang diecho di bawah kolom tanggal dihitung
  // dengan zona yang sama dengan halaman publik. Kalau tidak, admin bisa membaca
  // "Kamis" di CMS sementara tamu membaca "Rabu".
  const { zone, abbr } = useEventTimeZone();
  const toast = useToast();

  async function load() {
    // Bagian dan header dimuat bersamaan: keduanya dibutuhkan sebelum halaman ini
    // berguna, dan memuatnya berurutan hanya menambah satu perjalanan jaringan.
    const [sectionResponse, headerResponse] = await Promise.all([
      fetch("/api/admin/rundown/sections", { cache: "no-store" }),
      fetch("/api/admin/rundown/header", { cache: "no-store" }),
    ]);
    if (!sectionResponse.ok) { setError("Data rundown gagal dimuat."); return; }
    const data = (await sectionResponse.json()) as Payload;
    setSections(data.sections);
    setItems(data.items);
    setActiveId((current) => (current && data.sections.some((row) => row.id === current) ? current : data.sections[0]?.id ?? null));
    // Header yang gagal dimuat tidak menggagalkan seluruh halaman: jadwalnya tetap
    // bisa disusun, dan nilai bawaan tetap aman disimpan.
    if (headerResponse.ok) setHeader((await headerResponse.json()) as RundownHeader);
  }

  // setState langsung di badan effect ditolak React Compiler, jadi pemuatan awal
  // ditunda satu tick. Pola yang sama dipakai di seluruh halaman admin.
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const active = sections.find((row) => row.id === activeId) ?? null;
  const draft = (activeId !== null ? drafts[activeId] : null) ?? EMPTY_DRAFT;

  // Urut jam, lalu sort_order untuk butir berjam sama. Urutan yang sama dipakai
  // halaman publik, supaya yang dilihat admin sama dengan yang dilihat tamu.
  const activeItems = useMemo(() => {
    if (activeId === null) return [];
    return items
      .filter((item) => item.section_id === activeId)
      .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.sort_order - b.sort_order);
  }, [items, activeId]);

  // Branding dinormalisasi sebelum diserahkan ke <BrandingEditor>.
  //
  // Kolom skala bertipe `numeric` dan datang dari driver sebagai string; editor
  // memakainya sebagai angka pada penggeser. Tanpa langkah ini penggesernya lompat
  // ke nilai bawaan pada render pertama, dan admin yang menyimpan tanpa menyentuh
  // apa pun justru menimpa skala yang sudah dia setel sebelumnya.
  const headerBranding = useMemo(
    () => normalizeBranding(header as unknown as Record<string, unknown>),
    [header],
  );

  function updateSection(id: number, changes: Partial<RundownSection>) {
    setSections((current) => current.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  }

  function updateHeader(changes: Partial<RundownHeader>) {
    setHeader((current) => ({ ...current, ...changes }));
  }

  /**
   * Unggah gambar latar header.
   *
   * Memakai endpoint yang sama dengan Papan peringkat dan denah
   * (`/api/display/background`). Endpoint itu sudah generik: menerima berkas,
   * memvalidasi jenis dan ukuran, lalu mengembalikan URL publik. Membuat endpoint
   * ketiga hanya menyalin aturan yang sama, dan salinan selalu berakhir berbeda.
   *
   * Hasilnya hanya masuk state; admin tetap harus menekan Simpan, sama seperti
   * perubahan warna dan judul di kartu ini.
   */
  async function uploadHeaderBackground(file: File) {
    setUploadingBackground(true); setError("");
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/display/background", { method: "POST", body: form });
    const data = await response.json().catch(() => null);
    setUploadingBackground(false);
    if (!response.ok) {
      const failure = data?.error?.details?.file ?? data?.error?.message ?? "Upload gambar gagal.";
      setError(failure);
      toast.error("Upload gambar gagal", failure);
      return;
    }
    updateHeader({ background_image_url: data.url });
    toast.info("Gambar terunggah", "Klik Simpan header untuk menerapkannya ke halaman publik.");
  }

  async function saveHeader() {
    setSavingHeader(true); setError("");
    const response = await fetch("/api/admin/rundown/header", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(header),
    });
    const data = await response.json().catch(() => ({}));
    setSavingHeader(false);
    if (!response.ok) {
      const failure = failureMessage(data, "Header gagal disimpan.");
      setError(failure); toast.error("Header gagal disimpan", failure);
      return;
    }
    setHeader(data as RundownHeader);
    toast.success("Header tersimpan", "Berlaku untuk semua tab di halaman publik.");
  }

  function updateItem(id: number, changes: Partial<RundownItem>) {
    setItems((current) => current.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  }

  function updateDraft(changes: Partial<Draft>) {
    if (activeId === null) return;
    setDrafts((current) => ({ ...current, [activeId]: { ...(current[activeId] ?? EMPTY_DRAFT), ...changes } }));
  }

  /** Pesan gagal dari API. `details.message` lebih spesifik dari pesan generiknya. */
  function failureMessage(data: { error?: { message?: string; details?: { message?: string } } }, fallback: string) {
    return data.error?.details?.message ?? data.error?.message ?? fallback;
  }

  async function createSection() {
    const name = newSectionName.trim();
    if (!name) return;
    setCreatingSection(true); setError("");
    const response = await fetch("/api/admin/rundown/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await response.json();
    setCreatingSection(false);
    if (!response.ok) {
      const failure = failureMessage(data, "Bagian gagal ditambahkan.");
      setError(failure); toast.error("Bagian gagal ditambahkan", failure);
      return;
    }
    setNewSectionName("");
    setActiveId((data as RundownSection).id);
    toast.success("Bagian ditambahkan", "Masih draf. Isi tanggal dan jadwalnya lalu publikasikan.");
    await load();
  }

  async function saveSection(section: RundownSection) {
    setSavingSection(true); setError("");
    const response = await fetch("/api/admin/rundown/sections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: section.id,
        name: section.name,
        title: section.title,
        subtitle: section.subtitle,
        event_date: section.event_date,
        highlight_current: section.highlight_current,
        is_published: section.is_published,
        sort_order: section.sort_order,
        // Branding TIDAK dikirim dari sini. Ia setelan global dengan tombol Simpan
        // sendiri di kartu Header, karena header adalah identitas acara.
      }),
    });
    const data = await response.json();
    setSavingSection(false);
    if (!response.ok) {
      const failure = failureMessage(data, "Bagian gagal disimpan.");
      setError(failure); toast.error("Bagian gagal disimpan", failure);
      return;
    }
    toast.success("Bagian tersimpan", section.is_published ? "Bagian ini tampil di halaman publik." : "Bagian ini belum tampil di publik.");
    await load();
  }

  async function deleteSection(section: RundownSection) {
    setError("");
    const response = await fetch(`/api/admin/rundown/sections?id=${section.id}`, { method: "DELETE" });
    setConfirmSection(null);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const failure = failureMessage(data, "Bagian gagal dihapus.");
      setError(failure); toast.error("Bagian gagal dihapus", failure);
      return;
    }
    setActiveId(null);
    toast.success("Bagian dihapus", "Seluruh baris jadwalnya ikut terhapus.");
    await load();
  }

  async function addItem() {
    if (activeId === null) return;
    const title = draft.title.trim();
    if (!title || !draft.start_time) {
      setError("Jam mulai dan nama acara wajib diisi.");
      return;
    }
    setAddingItem(true); setError("");
    const response = await fetch("/api/admin/rundown/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section_id: activeId,
        start_time: draft.start_time,
        // String kosong berarti butir tanpa durasi, bukan jam kosong yang akan
        // ditolak validasi.
        end_time: draft.end_time || null,
        title,
        subtitle: draft.subtitle.trim() || null,
        is_break: draft.is_break,
      }),
    });
    const data = await response.json();
    setAddingItem(false);
    if (!response.ok) {
      const failure = failureMessage(data, "Baris gagal ditambahkan.");
      setError(failure); toast.error("Baris gagal ditambahkan", failure);
      return;
    }
    // Jam mulai baris berikutnya diisi jam selesai baris ini. Rundown disusun
    // berurutan dan bersambung, jadi ini menghilangkan pengetikan yang berulang
    // sekaligus mengurangi celah waktu yang tidak disengaja.
    setDrafts((current) => ({ ...current, [activeId]: { ...EMPTY_DRAFT, start_time: draft.end_time || "" } }));
    toast.success("Baris ditambahkan");
    await load();
  }

  async function saveItem(item: RundownItem) {
    setSavingItem(item.id); setError("");
    const response = await fetch("/api/admin/rundown/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        start_time: formatClock(item.start_time),
        end_time: item.end_time ? formatClock(item.end_time) : null,
        title: item.title,
        subtitle: item.subtitle,
        is_break: item.is_break,
        is_published: item.is_published,
      }),
    });
    const data = await response.json();
    setSavingItem(null);
    if (!response.ok) {
      const failure = failureMessage(data, "Baris gagal disimpan.");
      setError(failure); toast.error("Baris gagal disimpan", failure);
      return;
    }
    toast.success("Baris tersimpan");
    await load();
  }

  async function deleteItem(item: RundownItem) {
    setDeletingItem(item.id); setError("");
    const response = await fetch(`/api/admin/rundown/items?id=${item.id}`, { method: "DELETE" });
    setDeletingItem(null);
    setConfirmItem(null);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const failure = failureMessage(data, "Baris gagal dihapus.");
      setError(failure); toast.error("Baris gagal dihapus", failure);
      return;
    }
    toast.success("Baris dihapus");
    await load();
  }

  const publishedCount = sections.filter((row) => row.is_published).length;

  // Elemen akar harus <main>: aturan offset sidebar di globals.css memakai
  // selektor `.admin-shell > main`, jadi <div> di posisi ini membuat halaman
  // tertindih sidebar di layar lg ke atas.
  return <main className="bg-surface px-5 pb-8 pt-6 text-on-surface sm:px-8 lg:pb-10">
    <div className="mx-auto max-w-[1440px] space-y-8">
    <header className="space-y-3">
      <p className="max-w-2xl text-body-medium leading-6 text-on-surface-variant">
        Yang disusun di sini tampil di halaman <code className="font-mono text-body-small">/rundown</code> yang dibuka tamu tanpa login.
        Halaman itu menandai acara yang sedang berlangsung memakai tanggal bagian dan jam tiap baris, jadi tanggal yang salah membuat penanda ikut salah.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/rundown"
          target="_blank"
          rel="noreferrer"
          className="rounded-lg inline-flex min-h-11 items-center gap-2 border border-outline-variant bg-panel px-4 text-body-medium font-semibold text-on-surface hover:bg-panel-high"
        >
          <ArrowSquareOut size={18} />Buka halaman publik
        </Link>
        <p className="text-body-small text-on-surface-variant">
          {publishedCount === 0
            ? "Belum ada bagian yang dipublikasikan, jadi halaman publik masih menampilkan pesan tunggu."
            : `${publishedCount} dari ${sections.length} bagian tampil di publik.`}
        </p>
      </div>
    </header>

    {error ? <p role="alert" className="rounded-lg flex items-start gap-2 border border-error bg-panel px-4 py-3 text-body-medium text-error">
      <Warning size={18} className="mt-0.5 shrink-0" />{error}
    </p> : null}

    {/* ------------------------------------------------------------------ */}
    {/* Header halaman publik — SATU untuk seluruh acara                    */}
    {/* ------------------------------------------------------------------ */}
    {/* Ditaruh DI ATAS tab bagian, dan itu disengaja: posisinya di form harus
        mencerminkan cakupannya. Selama kartu ini berada di dalam kartu bagian,
        admin wajar menyimpulkan isinya berlaku untuk tab yang sedang dipilih —
        dan dugaan itu memang benar sebelum perubahan ini, yang justru jadi
        masalahnya. */}
    <section className="rounded-lg space-y-4 border border-outline-variant bg-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Header halaman publik</h2>
          <p className="mt-1 max-w-2xl text-body-small leading-5 text-on-surface-variant">
            Berlaku untuk <strong className="font-semibold text-on-surface">semua tab</strong>. Judul dan tampilan header tidak
            lagi berubah saat tamu berpindah agenda. Isian tampilan bersifat opsional; dibiarkan kosong, header memakai tema bawaan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void saveHeader()}
          disabled={savingHeader}
          className="rounded-md inline-flex min-h-11 items-center gap-2 bg-primary px-4 text-body-medium font-semibold text-on-primary disabled:opacity-50"
        >
          <FloppyDisk size={18} />{savingHeader ? "Menyimpan…" : "Simpan header"}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-body-small font-semibold text-on-surface-variant">Judul acara</span>
          <input
            value={header.event_title}
            onChange={(event) => updateHeader({ event_title: event.target.value })}
            placeholder="Mis. PRIMA EXECUTIVE GATHERING"
            className="rounded-lg min-h-11 border border-outline-variant bg-panel px-3 text-body-medium font-semibold"
          />
          <span className="text-body-small text-on-surface-variant">Tampil sama di semua tab.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-body-small font-semibold text-on-surface-variant">Sub judul acara</span>
          <input
            value={header.event_subtitle ?? ""}
            onChange={(event) => updateHeader({ event_subtitle: event.target.value })}
            placeholder="Mis. Beyond Tomorrow: Securing Progress"
            className="rounded-lg min-h-11 border border-outline-variant bg-panel px-3 text-body-medium"
          />
          <span className="text-body-small text-on-surface-variant">Boleh dikosongkan. Maksimal dua baris di halaman publik.</span>
        </label>
      </div>

      {/* Warna boleh dikosongkan, dan itu tidak bisa dilakukan <input type="color">
          yang selalu punya nilai. Jadi tiap warna dipasangkan tombol reset ke null.
          Tanpa itu, admin yang sekali mencoba warna tidak punya cara kembali ke tema
          bawaan selain menebak kode hex aslinya. */}
      <div className="grid gap-3 border-t border-outline-variant pt-4 sm:grid-cols-3">
        {([
          ["background_color", "Latar header"],
          ["text_color", "Warna tulisan"],
          ["accent_color", "Aksen (garis tab)"],
        ] as const).map(([key, label]) => <div key={key}>
          <label className="block text-body-small font-semibold" htmlFor={`header-${key}`}>{label}</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id={`header-${key}`}
              type="color"
              value={header[key] ?? BRANDING_FALLBACK[key]}
              onChange={(event) => updateHeader({ [key]: event.target.value })}
              className="rounded-md h-11 w-full border border-outline-variant"
            />
            {header[key] ? <button
              type="button"
              onClick={() => updateHeader({ [key]: null })}
              aria-label={`Kembalikan ${label} ke bawaan`}
              className="rounded-md inline-flex size-11 shrink-0 items-center justify-center border border-outline-variant text-on-surface-variant hover:border-error hover:text-error"
            >
              <XCircle size={17} weight="bold" />
            </button> : null}
          </div>
          <p className="mt-1 text-[11px] text-on-surface-variant">
            {header[key] ? header[key] : "Ikut tema bawaan"}
          </p>
        </div>)}
      </div>

      {/* Gambar latar berdiri DI ATAS warna, bukan menggantikannya. Warna tetap
          dipakai di belakangnya supaya teks tidak hilang bila gambar gagal dimuat di
          jaringan lokasi. Keterangan ini ditulis di layar karena admin tidak dapat
          menebaknya dari form. */}
      <div className="border-t border-outline-variant pt-4">
        <p className="text-body-medium font-semibold">Gambar latar header <span className="font-normal text-on-surface-variant">(opsional)</span></p>
        <p className="mt-1 text-body-small leading-5 text-on-surface-variant">
          Gambar diberi lapisan gelap otomatis dan tulisan dipaksa putih agar tetap terbaca. PNG, JPG, atau WebP, maksimal 5 MB.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className={`rounded-md inline-flex min-h-11 cursor-pointer items-center gap-2 border border-outline-variant bg-surface px-3 text-body-medium font-semibold hover:border-primary ${uploadingBackground ? "pointer-events-none opacity-60" : ""}`}>
            <UploadSimple size={17} weight="bold" />
            {uploadingBackground ? "Mengunggah…" : "Upload gambar"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={uploadingBackground}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadHeaderBackground(file);
                // Direset supaya memilih berkas yang sama dua kali tetap memicu onChange.
                event.target.value = "";
              }}
            />
          </label>
          {header.background_image_url ? <button
            type="button"
            onClick={() => updateHeader({ background_image_url: null })}
            className="rounded-lg inline-flex min-h-11 items-center gap-2 border border-outline-variant bg-panel px-3 text-body-medium font-semibold text-error hover:border-error"
          >
            <XCircle size={17} weight="bold" /> Hapus gambar
          </button> : null}
        </div>
        {header.background_image_url ? <div className="mt-2 flex items-center gap-2">
          <span className="rounded-md h-12 w-20 shrink-0 border border-outline-variant bg-cover bg-center" style={{ backgroundImage: `url(${header.background_image_url})` }} />
          <span className="break-all text-[11px] leading-4 text-on-surface-variant">{header.background_image_url}</span>
        </div> : null}
      </div>

      {/* Editor logo, jenis huruf, ukuran, dan warna per elemen. Komponen yang sama
          dipakai /admin/seat-map dan /admin/display, jadi ketiga CMS menawarkan
          setelan yang identik tanpa satu pun disalin. */}
      <div className="border-t border-outline-variant pt-4">
        <BrandingEditor
          value={headerBranding}
          onChange={(changes) => updateHeader(changes)}
          idPrefix="rundown-header"
          baseTextColor={header.text_color ?? "#1a1a1a"}
          baseBackgroundColor={header.background_color ?? "#ffffff"}
          baseAccentColor={header.accent_color ?? "#2649d0"}
        />
      </div>
    </section>

    {/* Tab bagian. Bentuknya sama dengan tab di halaman publik supaya admin
        mengenali apa yang sedang ia sunting tanpa membuka halaman itu. */}
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Bagian rundown">
        {sections.map((section) => {
          const isActive = section.id === activeId;
          return <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setActiveId(section.id)}
            className={`rounded-lg inline-flex min-h-11 items-center gap-2 border px-4 text-body-medium font-semibold transition-colors ${isActive
              ? "border-primary bg-primary text-on-primary"
              : "border-outline-variant bg-panel text-on-surface-variant hover:bg-panel-high hover:text-on-surface"}`}
          >
            {section.name}
            {/* Status publish dipasangkan ikon dan teks, tidak hanya warna:
                DESIGN.md melarang menandai keadaan dengan warna saja. */}
            {section.is_published
              ? <Eye size={16} aria-label="Tampil di publik" />
              : <EyeSlash size={16} aria-label="Masih draf" />}
          </button>;
        })}
      </div>

      <div className="rounded-lg flex flex-wrap items-end gap-3 border border-outline-variant bg-panel p-4">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <span className="text-body-small font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Bagian baru</span>
          <input
            value={newSectionName}
            onChange={(event) => setNewSectionName(event.target.value)}
            placeholder="Mis. Prima Awards"
            className="rounded-lg min-h-11 border border-outline-variant bg-panel px-3 text-body-medium"
          />
        </label>
        <button
          type="button"
          onClick={() => void createSection()}
          disabled={creatingSection || !newSectionName.trim()}
          className="rounded-md inline-flex min-h-11 items-center gap-2 bg-primary px-4 text-body-medium font-semibold text-on-primary disabled:opacity-50"
        >
          <Plus size={18} />{creatingSection ? "Menambahkan…" : "Tambah bagian"}
        </button>
      </div>
    </div>

    {active ? <div className="space-y-2">
      {/* Setelan bagian */}
      <section className="rounded-lg space-y-4 bg-panel p-5 sm:p-6">
        <h2 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Setelan bagian</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-body-small font-semibold text-on-surface-variant">Label tab</span>
            <input
              value={active.name}
              onChange={(event) => updateSection(active.id, { name: event.target.value })}
              className="rounded-lg min-h-11 border border-outline-variant bg-panel px-3 text-body-medium"
            />
            <span className="text-body-small text-on-surface-variant">Pendek, agar beberapa tab muat di layar ponsel.</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-body-small font-semibold text-on-surface-variant">Tanggal acara</span>
            <input
              type="date"
              value={active.event_date}
              onChange={(event) => updateSection(active.id, { event_date: event.target.value })}
              className="rounded-lg min-h-11 border border-outline-variant bg-panel px-3 text-body-medium"
            />
            <span className="text-body-small text-on-surface-variant">
              Dipakai penanda &ldquo;sedang berlangsung&rdquo;. {formatEventDate(active.event_date, zone)} ({abbr})
            </span>
          </label>
        </div>

        {/* Kolom "Judul di halaman publik" dan "Sub judul" per bagian sengaja
            DIHILANGKAN dari form ini. Keduanya tidak lagi dirender di mana pun:
            judul header kini satu untuk seluruh acara (lihat kartu Header di atas).
            Membiarkannya tampil berarti admin mengisi kolom yang tidak mengubah
            apa pun, dan itu jenis kebingungan yang paling lama tidak terdeteksi.
            Kolomnya tetap ada di database supaya migrasi ini tidak merusak data. */}

        {/* Sakelar penanda. Ditaruh bersama tanggal karena keduanya satu urusan:
            penanda hanya benar bila tanggalnya benar, jadi admin yang mematikan
            penanda tidak perlu lagi memikirkan tanggal, dan sebaliknya. */}
        <label className="flex items-start gap-3 border-t border-outline-variant pt-4">
          <input
            type="checkbox"
            checked={active.highlight_current}
            onChange={(event) => updateSection(active.id, { highlight_current: event.target.checked })}
            className="mt-0.5 size-4"
          />
          <span className="space-y-1">
            <span className="block text-body-medium font-semibold">Tandai acara yang sedang berlangsung</span>
            <span className="block text-body-small leading-5 text-on-surface-variant">
              {active.highlight_current
                ? "Halaman publik menyorot acara berjalan, menandai acara berikutnya, meredupkan yang sudah selesai, dan menggulir otomatis ke baris tersebut. Butuh tanggal di atas benar."
                : "Jadwal tampil sebagai daftar biasa tanpa sorotan dan tanpa gulir otomatis. Pakai ini bila tanggal acara belum tiba, agar tamu tidak melihat penanda pada acara yang belum jalan."}
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3 border-t border-outline-variant pt-4">
          <label className="inline-flex min-h-11 items-center gap-2 text-body-medium font-semibold">
            <input
              type="checkbox"
              checked={active.is_published}
              onChange={(event) => updateSection(active.id, { is_published: event.target.checked })}
              className="size-4"
            />
            Tampilkan di halaman publik
          </label>
          <span className="text-body-small text-on-surface-variant">
            Slug URL: <code className="font-mono">/rundown?sesi={active.slug}</code>
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void saveSection(active)}
              disabled={savingSection}
              className="rounded-md inline-flex min-h-11 items-center gap-2 bg-primary px-4 text-body-medium font-semibold text-on-primary disabled:opacity-50"
            >
              <FloppyDisk size={18} />{savingSection ? "Menyimpan…" : "Simpan bagian"}
            </button>
            {confirmSection === active.id ? <>
              <button
                type="button"
                onClick={() => void deleteSection(active)}
                className="rounded-md inline-flex min-h-11 items-center gap-2 bg-error px-4 text-body-medium font-semibold text-on-error"
              >
                <Trash size={18} />Ya, hapus bagian
              </button>
              <button
                type="button"
                onClick={() => setConfirmSection(null)}
                className="inline-flex min-h-11 items-center px-4 text-body-medium font-semibold text-on-surface-variant"
              >
                Batal
              </button>
            </> : <button
              type="button"
              onClick={() => setConfirmSection(active.id)}
              className="rounded-md inline-flex min-h-11 items-center gap-2 border border-error px-4 text-body-medium font-semibold text-error"
            >
              <Trash size={18} />Hapus bagian
            </button>}
          </div>
        </div>
        {confirmSection === active.id ? <p role="alert" className="text-body-small text-error">
          Seluruh {activeItems.length} baris jadwal di bagian ini ikut terhapus. Salinannya tersimpan di audit trail.
        </p> : null}
      </section>

      {/* Baris jadwal */}
      <section className="rounded-lg space-y-4 bg-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-body-medium font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
            Baris jadwal ({activeItems.length})
          </h2>
          <p className="text-body-small text-on-surface-variant">Urutan mengikuti jam mulai. Tidak perlu disusun ulang.</p>
        </div>

        {activeItems.length === 0 ? <p className="rounded-lg border border-dashed border-outline-variant px-4 py-6 text-center text-body-medium text-on-surface-variant">
          Belum ada baris jadwal. Tambahkan lewat formulir di bawah.
        </p> : <div className="space-y-2">
          {activeItems.map((item) => <div key={item.id} className="rounded-lg space-y-3 bg-panel p-4">
            <div className="grid gap-3 sm:grid-cols-[104px_104px_minmax(0,1fr)]">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Mulai</span>
                <input
                  type="time"
                  value={formatClock(item.start_time)}
                  onChange={(event) => updateItem(item.id, { start_time: event.target.value })}
                  className="rounded-lg min-h-11 border border-outline-variant bg-panel px-2 font-mono text-body-medium"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Selesai</span>
                <input
                  type="time"
                  value={item.end_time ? formatClock(item.end_time) : ""}
                  onChange={(event) => updateItem(item.id, { end_time: event.target.value || null })}
                  className="rounded-lg min-h-11 border border-outline-variant bg-panel px-2 font-mono text-body-medium"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Nama acara</span>
                <input
                  value={item.title}
                  onChange={(event) => updateItem(item.id, { title: event.target.value })}
                  className="rounded-lg min-h-11 border border-outline-variant bg-panel px-3 text-body-medium font-semibold"
                />
              </label>
            </div>
            {/* textarea, bukan input satu baris: satu butir acara bisa memuat
                beberapa pembicara, dan tiap baris tampil sebagai butir terpisah
                di halaman publik. Tinggi awal 3 baris agar terlihat bahwa kotak
                ini menerima lebih dari satu baris. */}
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Keterangan</span>
              <textarea
                value={item.subtitle ?? ""}
                onChange={(event) => updateItem(item.id, { subtitle: event.target.value })}
                rows={4}
                placeholder={"Panelists:\nSantoso, Chairman - ASPI\nModerator:\nAbraham J. Adriaansz, President Director - PT Rintis Sejahtera"}
                className="rounded-lg min-h-11 resize-y border border-outline-variant bg-panel px-3 py-2 text-body-medium leading-6"
              />
              <span className="text-[11px] leading-5 text-on-surface-variant">
                Satu baris per pembicara. Baris yang diakhiri <strong className="font-semibold text-on-surface">titik dua</strong> jadi judul kelompok (mis. <code className="font-mono">Moderator:</code>) dan tidak diberi bulet.
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex min-h-11 items-center gap-2 text-body-small font-semibold">
                <input
                  type="checkbox"
                  checked={item.is_break}
                  onChange={(event) => updateItem(item.id, { is_break: event.target.checked })}
                  className="size-4"
                />
                <Coffee size={16} />Jeda (tampil lebih redup)
              </label>
              <label className="inline-flex min-h-11 items-center gap-2 text-body-small font-semibold">
                <input
                  type="checkbox"
                  checked={item.is_published}
                  onChange={(event) => updateItem(item.id, { is_published: event.target.checked })}
                  className="size-4"
                />
                {item.is_published ? <Eye size={16} /> : <EyeSlash size={16} />}Tampil
              </label>
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveItem(item)}
                  disabled={savingItem === item.id}
                  className="rounded-lg inline-flex min-h-11 items-center gap-2 border border-outline-variant px-3 text-body-small font-semibold hover:bg-panel-high disabled:opacity-50"
                >
                  <FloppyDisk size={16} />{savingItem === item.id ? "Menyimpan…" : "Simpan"}
                </button>
                {confirmItem === item.id ? <>
                  <button
                    type="button"
                    onClick={() => void deleteItem(item)}
                    disabled={deletingItem === item.id}
                    className="rounded-md inline-flex min-h-11 items-center gap-2 bg-error px-3 text-body-small font-semibold text-on-error disabled:opacity-50"
                  >
                    <Trash size={16} />{deletingItem === item.id ? "Menghapus…" : "Ya, hapus"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmItem(null)}
                    className="inline-flex min-h-11 items-center px-3 text-body-small font-semibold text-on-surface-variant"
                  >
                    Batal
                  </button>
                </> : <button
                  type="button"
                  onClick={() => setConfirmItem(item.id)}
                  className="rounded-md inline-flex min-h-11 items-center gap-2 border border-error px-3 text-body-small font-semibold text-error"
                >
                  <Trash size={16} />Hapus
                </button>}
              </div>
            </div>
          </div>)}
        </div>}

        {/* Formulir baris baru */}
        <div className="rounded-lg space-y-3 border border-outline-variant bg-panel-high p-4">
          <h3 className="flex items-center gap-2 text-body-small font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
            <CalendarDots size={16} />Tambah baris
          </h3>
          <div className="grid gap-3 sm:grid-cols-[104px_104px_minmax(0,1fr)]">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Mulai</span>
              <input
                type="time"
                value={draft.start_time}
                onChange={(event) => updateDraft({ start_time: event.target.value })}
                className="rounded-lg min-h-11 border border-outline-variant bg-panel px-2 font-mono text-body-medium"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Selesai</span>
              <input
                type="time"
                value={draft.end_time}
                onChange={(event) => updateDraft({ end_time: event.target.value })}
                className="rounded-lg min-h-11 border border-outline-variant bg-panel px-2 font-mono text-body-medium"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Nama acara</span>
              <input
                value={draft.title}
                onChange={(event) => updateDraft({ title: event.target.value })}
                placeholder="Mis. Opening Keynote Speech"
                className="rounded-lg min-h-11 border border-outline-variant bg-panel px-3 text-body-medium"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Keterangan</span>
            <textarea
              value={draft.subtitle}
              onChange={(event) => updateDraft({ subtitle: event.target.value })}
              rows={4}
              placeholder={"Panelists:\nSantoso, Chairman - ASPI\nModerator:\nAbraham J. Adriaansz, President Director - PT Rintis Sejahtera"}
              className="rounded-lg min-h-11 resize-y border border-outline-variant bg-panel px-3 py-2 text-body-medium leading-6"
            />
            <span className="text-[11px] leading-5 text-on-surface-variant">
              Satu baris per pembicara. Baris berakhiran <strong className="font-semibold text-on-surface">titik dua</strong> jadi judul kelompok. Boleh dikosongkan.
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-11 items-center gap-2 text-body-small font-semibold">
              <input
                type="checkbox"
                checked={draft.is_break}
                onChange={(event) => updateDraft({ is_break: event.target.checked })}
                className="size-4"
              />
              <Coffee size={16} />Jeda
            </label>
            <p className="text-body-small text-on-surface-variant">Jam selesai boleh dikosongkan untuk penanda momen.</p>
            <button
              type="button"
              onClick={() => void addItem()}
              disabled={addingItem || !draft.title.trim() || !draft.start_time}
              className="rounded-md ml-auto inline-flex min-h-11 items-center gap-2 bg-primary px-4 text-body-medium font-semibold text-on-primary disabled:opacity-50"
            >
              <Plus size={18} />{addingItem ? "Menambahkan…" : "Tambah baris"}
            </button>
          </div>
        </div>
      </section>
    </div> : <p className="rounded-lg border border-dashed border-outline-variant px-4 py-10 text-center text-body-medium text-on-surface-variant">
      Belum ada bagian rundown. Tambahkan satu untuk mulai menyusun jadwal.
    </p>}
    </div>
  </main>;
}
